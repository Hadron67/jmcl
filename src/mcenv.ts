import * as os from 'os';
import { Log, LogLevel } from './log';
import { input } from './promise';
import * as pathd from 'path';

export interface MCConfig {
    launcherRoot: string;
    home: string;
    mcRoot: string;
    resolution: number[];
    isDemo: boolean;
    launcherMetaURL: string;
}
export class Context {
    config: MCConfig = {
        launcherRoot: '.jmcl',
        home: '/home/cfy',
        mcRoot: '.minecraft',
        resolution: null,
        isDemo: false,

        launcherMetaURL: 'launchermeta.mojang.com'
    };
    launcherName: string;
    launcherVersion: string;
    log: Log;

    constructor(public console: Console, logLevel: string){
        this.log = new Log(console, LogLevel[logLevel]);
        this.config.home = os.homedir();
    }
    getMCRoot(){
        // return `${this.config.home}/${this.config.mcRoot}`;   
        return pathd.join(this.config.home, this.config.mcRoot);
    }
    getVersionDir(vname: string){
        // return `${this.config.home}/${this.config.mcRoot}/versions/${vname}`;
        return pathd.join(this.config.home, this.config.mcRoot, 'versions', vname);
    }
    getLauncherDir(){
        // return `${this.config.home}/${this.config.mcRoot}/${this.config.launcherRoot}`;
        return pathd.join(this.config.home, this.config.mcRoot, this.config.launcherRoot);
    }
    async readInput(q: string, hidden: boolean){
        return input(q, hidden);
    }
}