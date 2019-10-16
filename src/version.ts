import { Context, MCConfig } from './mcenv.js';
import { LegacyMCArg, MCArg, ArgumentJson, NewMCArg } from './mcarg.js';
import * as p from './promise';
import { CompatibilityRule, checkRule } from './compatibility-rule.js';
import * as pathd from 'path';
import * as fs from 'fs';
import { open as openZip } from 'yauzl';
import { getOS } from './osutil.js';

const launcherMetaURL = 'launchermeta.mojang.com';

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
    path?: string;
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
    extract?: { exclude: string[] }
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
    jar?: string;
}
function excluded(excludes: string[], fname: string){
    for (let e of excludes){
        if (fname.startsWith(e)){
            return true;
        }
    }
    return false;
}
async function extractOneLib(ctx: Context, dir: string, libdir: string, lib: DownloadInfo, excludes: string[]){
    const log = ctx.log;
    return new Promise((resolve, reject) => {
        openZip(pathd.join(libdir, lib.path), {lazyEntries: true}, (err, zfile) => {
            if (err) {
                reject(err);
            }
            else {
                zfile.on('entry', entry => {
                    if (excluded(excludes, entry.fileName)){
                        zfile.readEntry();
                        return;
                    }
                    if (!entry.fileName.endsWith('/')){
                        log.v(`Extracting ${entry.fileName} from ${pathd.basename(lib.path)}.`);
                        zfile.openReadStream(entry, (err, s) => {
                            if (err){
                                reject(err);
                            }
                            else {
                                s.on('end', () => zfile.readEntry());
                                const dest = fs.createWriteStream(pathd.join(dir, entry.fileName));
                                s.pipe(dest);
                            }
                        });
                    }
                    else {
                        const dn = pathd.join(dir, entry.fileName);
                        fs.exists(dn, e => {
                            if (!e){
                                fs.mkdir(dn, err => {
                                    err ? reject(err) : zfile.readEntry();
                                });
                            }
                            else {
                                zfile.readEntry();
                            }
                        });
                    }
                });
                zfile.on('end', () => resolve());
                zfile.readEntry();
            }
        });
    });
}

function checkLibrary(lib: LibraryData, cfg: MCConfig){
    return !lib.rules || checkRule(cfg, lib.rules);
}
function libraryName2Path(name: string){
    let parts = name.split(':');
    let pkg = pathd.join(...parts[0].split(/\./g));
    let clazz = parts[1];
    let classv = parts[2];
    return pathd.join(pkg, clazz, classv, `${clazz}-${classv}.jar`);
}
function getLibraryPathFromDowloadInfo(name: string, d: DownloadInfo){
    return d.path ? d.path : libraryName2Path(name);
}
class Version {
    constructor(public mgr: VersionManager, public vname: string, public versionJson: VersionData){
        //todo: inherits from
    }
    getClasspathJars(cfg: MCConfig): string[]{
        let libdir = pathd.join(this.mgr.ctx.getMCRoot(), 'libraries');
        var ret: string[] = [];
        let libs: {[n: string]: boolean} = {};
        for(var lib of this.versionJson.libraries){

            if (!libs.hasOwnProperty(lib.name) && checkLibrary(lib, cfg)){
                libs[lib.name] = true;
                let path: string;
                if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path){
                    path = lib.downloads.artifact.path;
                }
                else {
                    path = libraryName2Path(lib.name);
                }
                ret.push(
                    // pathd.join(libdir, pkg, clazz, classv, `${clazz}-${classv}.jar`)
                    pathd.join(libdir, path)
                );
            }
        }
        return ret;
    }
    getNativeDir(){
        return pathd.join(this.mgr.ctx.getVersionDir(this.vname), this.vname + '-natives/');
    }
    async extractNatives(dir: string, cfg: MCConfig){
        let os = getOS().osName;
        let libdir = pathd.join(this.mgr.ctx.getMCRoot(), 'libraries');
        for (let lib of this.versionJson.libraries){
            if (lib.natives && lib.natives.hasOwnProperty(os) && checkLibrary(lib, cfg)){
                let libData = lib.downloads.classifiers[lib.natives[os]];
                await extractOneLib(this.mgr.ctx, dir, libdir, libData, lib.extract ? lib.extract.exclude : []);
            }
        }
    }
    getMainClass (){
        return this.versionJson.mainClass;
    }
    getJarName(){
        return pathd.join(this.mgr.ctx.getVersionDir(this.vname), this.versionJson.jar || this.vname + '.jar');
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
        // Uncommenting the following line would make the console log output of Minecraft in xml.
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
    return JSON.parse(await p.httpsGet(launcherMetaURL, '/mc/game/version_manifest.json'));
}

export { VersionManager }