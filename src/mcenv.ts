import * as os from 'os';
import { Log, LogLevel } from './log';
import { input } from './input';
import * as pathd from 'path';
import * as pkg from '../package.json';

export interface MCConfig {
    launcherRoot: string;
    home: string;
    mcRoot: string;
    resolution: number[];
    isDemo: boolean;
    downloadConcurrentLimit: number;
}

export class Context {
    config: MCConfig = {
        launcherRoot: '.jmcl',
        home: '~',
        mcRoot: '.minecraft',
        resolution: null,
        isDemo: false,

        downloadConcurrentLimit: 50
    };
    launcherName: string;
    launcherVersion: string;
    log: Log;

    constructor(public console: Console, logLevel: string){
        this.log = new Log(console, LogLevel[logLevel]);
        this.config.home = os.homedir();
        this.launcherName = pkg.name;
        this.launcherVersion = pkg.version;
    }
    getMCRoot(){
        return pathd.join(this.config.home, this.config.mcRoot);
    }
    getVersionDir(vname?: string){
        const vd = pathd.join(this.config.home, this.config.mcRoot, 'versions');
        return vname ? pathd.join(vd, vname) : vd;
    }
    getLauncherDir(){
        return pathd.join(this.config.home, this.config.mcRoot, this.config.launcherRoot);
    }
    async readInput(q: string, hidden: boolean){
        return input(q, hidden);
    }
}