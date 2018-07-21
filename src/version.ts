import * as fs from 'fs';
import { Context, MCConfig } from './mcenv.js';
import { LegacyMCArg, MCArg, ArgumentJson, NewMCArg } from './mcarg.js';
import * as p from './promise';

class VersionManager {
    versions: {[v: string]: Version} = {};
    constructor(public ctx: Context){}
    async getVersion(vname: string): Promise<Version>{
        var ret = this.versions[vname];
        var cela = this;
        if(!ret){
            var jsonPath = cela.ctx.getVersionDir(vname) + '/' + vname + '.json';
            ret = cela.versions[vname] = new Version(cela, vname, JSON.parse(await p.readFile(jsonPath)));
        }
        return ret;
    }
}
interface LibraryData {
    name: string;
    natives: {[os: string]: string};
    
}
interface VersionData {
    libraries: { name: string }[];
    mainClass: string;
    minecraftArguments?: string;
    arguments?: ArgumentJson;
    assets: string;
    type: string;
}
class Version {
    constructor(public mgr: VersionManager, public vname: string, public versionJson: VersionData){}
    getJars(): string[]{
        var libdir = this.mgr.ctx.getMCRoot() + '/libraries';
        var ret: string[] = [];
        for(var lib of this.versionJson.libraries){
            var name = lib.name;
            var parts = name.split(':');
            var pkg = parts[0].replace(/\./g, "/");
            var clazz = parts[1];
            var classv = parts[2];
            
            ret.push(
                [libdir, pkg, clazz, classv, clazz + '-' + classv + '.jar'].join('/')
            );
        }
        //todo: inherits from
        return ret;
    }
    getNativeDir(){
        return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '-natives/';
    }
    getMainClass (){
        return this.versionJson.mainClass;
    }
    getJarName(){
        return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '.jar';
    }
    getArgs(): MCArg{
        var arg: MCArg;
        if('minecraftArguments' in this.versionJson){
            arg = new LegacyMCArg(this.versionJson.minecraftArguments);
        }
        else {
            arg = new NewMCArg(this.versionJson.arguments);
        }
        var env = this.mgr.ctx;
        return arg
                .arg('version_name', this.vname)
                .arg('game_directory', env.getMCRoot())
                .arg('assets_root', env.getMCRoot() + '/assets')
                .arg('assets_index_name', this.versionJson.assets)
                .arg('version_type', this.versionJson.type);
    }
}

interface VersionManifest {
    latest: { snapshot: string, release: string },
    versions: { id: string, type: string, time:string, releaseTime: string, url: string }[]
}
export async function getVersionManifest(config: MCConfig){
    return JSON.parse(await p.httpsGet(config.launcherMetaURL, '/mc/game/version_manifest.json')) as VersionManifest;
}

export { VersionManager }