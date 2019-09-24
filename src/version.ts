import * as fs from 'fs';
import { Context, MCConfig } from './mcenv.js';
import { LegacyMCArg, MCArg, ArgumentJson, NewMCArg } from './mcarg.js';
import * as p from './promise';
import { CompatibilityRule, checkRule } from './compatibility-rule.js';
import * as pathd from 'path';

class VersionManager {
    versions: {[v: string]: Version} = {};
    constructor(public ctx: Context){}
    async getVersion(vname: string): Promise<Version>{
        var ret = this.versions[vname];
        var cela = this;
        if(!ret){
            let jsonPath = pathd.join(this.ctx.getVersionDir(vname), vname + '.json');
            ret = cela.versions[vname] = new Version(cela, vname, JSON.parse(await p.readFile(jsonPath)));
        }
        return ret;
    }
}
interface DownloadInfo {
    url: string;
    sha1: string;
    size: number;
};

interface LibraryData {
    name: string;
    natives?: {[os: string]: string};
    downloads: {
        artifact: DownloadInfo, 
        classifiers: {[name: string]: DownloadInfo}
    };
    rules?: CompatibilityRule[];
}
interface LoggingInfo {
    argument: string;
    file: {
        id: string;
        sha1: string;
        size: number;
        url: string;
    },
    type: string;
};
interface VersionData {
    libraries: LibraryData[];
    mainClass: string;
    minecraftArguments?: string;
    arguments?: ArgumentJson;
    assets: string;
    type: string;
    logging: {
        client: LoggingInfo
    };
}
class Version {
    constructor(public mgr: VersionManager, public vname: string, public versionJson: VersionData){}
    getJars(cfg: MCConfig): string[]{
        let libdir = pathd.join(this.mgr.ctx.getMCRoot(), 'libraries');
        var ret: string[] = [];
        let libs: {[n: string]: boolean} = {};
        for(var lib of this.versionJson.libraries){
            var name = lib.name;
            var parts = name.split(':');
            let pkg = pathd.join(...parts[0].split(/\./g));
            var clazz = parts[1];
            var classv = parts[2];
            
            if (!libs[name] && (!lib.rules || checkRule(cfg, lib.rules))){
                libs[name] = true;
                ret.push(
                    pathd.join(libdir, pkg, clazz, classv, `${clazz}-${classv}.jar`)
                );
            }
        }
        //todo: inherits from
        return ret;
    }
    getNativeDir(){
        return pathd.join(this.mgr.ctx.getVersionDir(this.vname), this.vname + '-natives/');
    }
    getMainClass (){
        return this.versionJson.mainClass;
    }
    getJarName(){
        return pathd.join(this.mgr.ctx.getVersionDir(this.vname), this.vname + '.jar');
    }
    getArgs(cfg: MCConfig): MCArg{
        var arg: MCArg;
        if('minecraftArguments' in this.versionJson){
            arg = new LegacyMCArg(this.versionJson.minecraftArguments);
        }
        else {
            arg = new NewMCArg(this.versionJson.arguments, cfg);
        }

        var env = this.mgr.ctx;
        let logging = this.versionJson.logging.client;
        let assetsDir = pathd.join(env.getMCRoot(), 'assets');
        // arg.appendRaw(logging.argument.replace(/\${path}/g, pathd.join(assetsDir, 'log_configs', logging.file.id)));
        
        return arg
                .arg('version_name', this.vname)
                .arg('game_directory', env.getMCRoot())
                .arg('assets_root', assetsDir)
                .arg('assets_index_name', this.versionJson.assets)
                .arg('version_type', this.versionJson.type);
    }
}

interface VersionManifest {
    __comment?: string,
    latest: { snapshot: string, release: string },
    versions: { id: string, type: string, time:string, releaseTime: string, url: string }[]
}
export async function getVersionManifest(config: MCConfig){
    return JSON.parse(await p.httpsGet(config.launcherMetaURL, '/mc/game/version_manifest.json'));
}

export { VersionManager }