import * as os from 'os';
import { Log, LogLevel } from './log';
import { input } from './promise';

export interface MCConfig {
    launcherRoot: string;
    home: string;
    mcRoot: string;    
    launcherMetaURL: string;
}
export class Context {
    // launcherRoot = '.jmcl';
    // home = '/home/cfy';
    // mcRoot = '.minecraft';
    config: MCConfig = {
        launcherRoot: '.jmcl',
        home: '/home/cfy',
        mcRoot: '.minecraft',

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
        return `${this.config.home}/${this.config.mcRoot}`;   
    }
    getVersionDir(vname: string){
        // return this.config.home + '/' + this.config.mcRoot + '/versions/' + vname;
        return `${this.config.home}/${this.config.mcRoot}/versions/${vname}`;
    }
    getLauncherDir(){
        // return this.config.home + '/' + this.config.mcRoot + '/' + this.config.launcherRoot;
        return `${this.config.home}/${this.config.mcRoot}/${this.config.launcherRoot}`;
    }
    async readInput(q: string, hidden: boolean){
        return input(q, hidden);
    }
}