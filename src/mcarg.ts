import * as os from 'os';
import { CompatibilityRule, checkRule } from './compatibility-rule';
import { MCConfig } from './mcenv';

export interface EnvironmentVars {

}

export interface MCArg {
    arg(name: string, val: string): MCArg;
    jvmArg(): string[];
    gameArg(): string[];
    appendRaw(s: string): void;
}

type ArgMap = {[s: string]: string};

function replaceArgv(argv: ArgMap, temp: string): string{
    return temp.replace(/\${[a-zA-Z_-]+}/g, str => {
        str = str.substr(2, str.length - 3);
        return argv[str];
    });
}

export class LegacyMCArg implements MCArg {
    argv: ArgMap = {};
    extra: string[] = [];
    constructor(public argTemp: string){}
    arg(name: string, v: string){
        this.argv[name] = v;
        return this;
    }
    gameArg(){
        let ret = this.argTemp.split(/[ ]+/g);
        for (let i = 0; i < ret.length; i++){
            ret[i] = replaceArgv(this.argv, ret[i]);
        }
        return ret;
    }
    jvmArg(){
        return [
            '-cp', this.argv.classpath,
            `-Djava.library.path=${this.argv.natives_directory}`,
            `-Duser.home=${this.argv.user_home}`,
            ...this.extra
        ];
    }
    appendRaw(s: string){
        this.extra.push(s);
    }
}
type ArgumentItem = string | CompoundArgumentItem;
interface CompoundArgumentItem {
    value: string[] | string;
    compatibilityRules?: CompatibilityRule[];
    rules?: CompatibilityRule[];
}

export interface ArgumentJson {
    game: ArgumentItem[];
    jvm: ArgumentItem[];
}

export class NewMCArg implements MCArg {
    argv: ArgMap = {};
    extra: string[] = [];

    constructor(private _argJson: ArgumentJson, public cfg: MCConfig){}

    private _replaceVals(ret: string){
        return replaceArgv(this.argv, ret);
    }

    private _allowed(arg: CompoundArgumentItem): boolean{
        if (arg.compatibilityRules){
            return checkRule(this.cfg, arg.compatibilityRules);
        } else if (arg.rules) {
            return checkRule(this.cfg, arg.rules);
        } else return true;
    }

    private _genArg(argItem: ArgumentItem[]): string[]{
        var ret: string[] = [];
        for(var arg of argItem){
            if (typeof arg === 'string')
                ret.push(this._replaceVals(arg));
            else if(this._allowed(arg)){
                if (typeof arg.value === 'string')
                    ret.push(this._replaceVals(arg.value));
                else {
                    for(var val of arg.value){
                        ret.push(this._replaceVals(val));
                    }
                }
            }
        }
        return ret;
    }
    arg(name: string, v: string){
        this.argv[name] = v;
        return this;
    }
    gameArg(){
        return this._genArg(this._argJson.game);
    }
    jvmArg(){
        return [...this._genArg(this._argJson.jvm), ...this.extra];
    }
    appendRaw(s: string){
        this.extra.push(s);
    }
}