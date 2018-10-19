import * as os from 'os';
import { getOS } from './osutil';

export interface EnvironmentVars {

}

export interface MCArg {
    arg(name: string, val: string): MCArg;
    jvmArg(): string;
    gameArg(): string;
}

export class LegacyMCArg implements MCArg {
    argv: {[s: string]: string} = {};
    constructor(public argTemp: string){}
    arg(name: string, v: string){
        this.argv[name] = v;
        return this;
    }
    gameArg(){
        var ret = this.argTemp;
        for(var name in this.argv){
            ret = ret.replace('${' + name + '}', this.argv[name]);
        }
        return ret;
    }
    jvmArg(){
        return [
            `-cp ${this.argv.classpath}`,
            `-Djava.library.path=${this.argv.natives_directory}`,
            `-Duser.home=${this.argv.user_home}`,
        ].join(' ');
    }
}

interface ArgumentItem {
    value: string[];
    compatibilityRules?: CompatibilityRule[];
}
interface CompatibilityRule {
    action: 'allow';
    features?: {
        has_custom_resolution?: boolean;
        is_demo_user?: boolean;
    };
    os?: {
        name?: string;
        version?: string;
        arch?: string;
    };
}
export interface ArgumentJson {
    game: ArgumentItem[];
    jvm: ArgumentItem[];
}

export class NewMCArg implements MCArg {
    argv: {[s: string]: string} = {};

    constructor(private _argJson: ArgumentJson){}

    private _checkRule(rule: CompatibilityRule){
        if(rule.os){
            var { osName, osV, osArch } = getOS();
            if(rule.os.name && rule.os.name !== osName){
                return false;
            }
            if(rule.os.version && !new RegExp(rule.os.version).test(osV)){
                return false;
            }
            if(rule.os.arch && rule.os.arch !== osArch){
                return false;
            }
        }
        if(rule.features){
            if(rule.features.has_custom_resolution && this.argv.resolution_width === undefined){
                return false;
            }
            if(rule.features.is_demo_user){
                return false;
            }
        }
        return true;
    }
    private _checkRules(rules: CompatibilityRule[]): boolean{
        for(var rule of rules){
            if(!this._checkRule(rule)){
                return false;
            }
        }
        return true;
    }
    private _replaceVals(ret: string){
        for(var name in this.argv){
            ret = ret.replace('${' + name + '}', this.argv[name]);
        }
        return ret;
    }

    private _genArg(argItem: ArgumentItem[]): string{
        var ret: string[] = [];
        for(var arg of argItem){
            if(arg.compatibilityRules === undefined || this._checkRules(arg.compatibilityRules)){
                for(var val of arg.value){
                    ret.push(this._replaceVals(val));
                }
            }
        }
        return ret.join(' ');
    }
    arg(name: string, v: string){
        this.argv[name] = v;
        return this;
    }
    gameArg(){
        return this._genArg(this._argJson.game);
    }
    jvmArg(){
        return this._genArg(this._argJson.jvm);
    }
}