import * as os from 'os';
import { Log, LogLevel } from './log';
import { input } from './input';
import * as pathd from 'path';
import * as pkg from '../package.json';
import { ensureDir } from 'fs-extra';
import { getOS } from './osutil';

export interface MCConfig {
    launcherRoot: string;
    home: string;
    mcRoot: string;
    resolution: number[];
    isDemo: boolean;
    downloadConcurrentLimit: number;
}

function getDefaultMCRoot(home: string): string {
    switch (getOS().osName) {
        case 'osx': return pathd.join(home, 'Library', 'Application Support', 'minecraft');
        default: return pathd.join(home, '.minecraft');
    }
}

export class Context {
    config: MCConfig = {
        launcherRoot: '.jmcl',
        home: '~',
        mcRoot: '.minecraft',
        resolution: null,
        isDemo: false,

        downloadConcurrentLimit: 20
    };
    launcherName: string;
    launcherVersion: string;
    log: Log;

    constructor(public console: Console, logLevel: string){
        this.log = new Log(console, LogLevel[logLevel]);
        this.config.home = os.homedir();
        this.config.mcRoot = process.env['MINECRAFT_HOME'] || getDefaultMCRoot(this.config.home);
        this.launcherName = pkg.name;
        this.launcherVersion = pkg.version;
    }
    getMCRoot(){
        // return pathd.join(this.config.home, this.config.mcRoot);
        return this.config.mcRoot;
    }
    getVersionDir(vname?: string){
        const vd = pathd.join(this.getMCRoot(), 'versions');
        return vname ? pathd.join(vd, vname) : vd;
    }
    getLauncherDir(){
        return pathd.join(this.getMCRoot(), this.config.launcherRoot);
    }
    async prepareDirs(){
        const r = this.getMCRoot();
        await ensureDir(r, null);
        await ensureDir(this.getLauncherDir(), null);
        await ensureDir(this.getVersionDir(), null);
        await ensureDir(pathd.join(r, 'assets'));
        await ensureDir(pathd.join(r, 'assets', 'objects'));
        await ensureDir(pathd.join(r, 'assets', 'indexes'));
    }
    async readInput(q: string, hidden: boolean){
        return input(q, hidden);
    }
}