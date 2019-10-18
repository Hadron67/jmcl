import { Context, MCConfig } from './mcenv.js';
import { LegacyMCArg, MCArg, ArgumentJson, NewMCArg } from './mcarg.js';
import { CompatibilityRule, checkRule } from './compatibility-rule.js';
import * as pathd from 'path';
import * as fs from 'fs';
import { open as openZip } from 'yauzl';
import { getOS } from './osutil.js';
import { exists, readFile, writeFile, fileSHA1 } from './fsx.js';
import { httpsGet, download } from './ajax.js';
import { URL } from 'url';
import { ensureDir } from 'fs-extra';
import { sha1sum } from './util.js';
import { createDownloader } from './download.js';

const launcherMetaURL = new URL('https://launchermeta.mojang.com/mc/game/version_manifest.json');
const libDownloadURL = 'https://libraries.minecraft.net';
const assetDownloadURL = 'https://resources.download.minecraft.net';

interface VersionInfo {
    id: string;
    type: "snapshot" | "release"| "old_beta" | "old_alpha";
    time: string;
    releaseTime: string;
    url: string;
};
interface VersionManifest {
    __comment?: string;
    latest: { snapshot: string, release: string };
    versions: VersionInfo[];
}

class VersionManager {
    versions: {[v: string]: Version} = {};
    versionManifest: VersionManifest = null;
    constructor(public ctx: Context){}
    async getVersion(vname: string): Promise<Version>{
        var ret = this.versions[vname];
        var cela = this;
        if(!ret){
            // let jsonPath = pathd.join(this.ctx.getVersionDir(vname), vname + '.json');
            // ret = cela.versions[vname] = new Version(cela, vname, JSON.parse(await p.readFile(jsonPath)));
            ret = this.versions[vname] = new Version(cela, vname);
        }
        return ret;
    }
    private async _getManifest(){
        if (this.versionManifest === null){
            this.ctx.log.i('fetching version manifest');
            this.versionManifest = JSON.parse(await httpsGet(launcherMetaURL));
        }
    }
    async getVersionInfo(vname: string): Promise<VersionInfo>{
        await this._getManifest();
        for (let v of this.versionManifest.versions){
            if (v.id === vname){
                return v;
            }
        }
        this.ctx.log.e(`version ${vname} not found in version manifest`);
        return null;
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
    assetIndex: {
        id: string;
        url: string;
        size: number;
        totalSize: number;
        sha1: string;
        known?: boolean; // XXX: Don't known what's this field for
    };
    downloads: {
        client: DownloadInfo;
        client_mappings: DownloadInfo;
        server: DownloadInfo;
        server_mappings: DownloadInfo;
    };
    type: string;
    logging: {
        client: LoggingInfo;
    };
    jar?: string;
}

interface AssetEntry {
    hash: string;// sha1
    size: number;
};

interface AssetsData {
    objects: {[name: string]: AssetEntry};
};

function excluded(excludes: string[], fname: string){
    for (let e of excludes){
        if (e.endsWith('/') && fname.startsWith(e) || fname === e){
            return true;
        }
    }
    return false;
}
async function extractOneLib(ctx: Context, dir: string, libdir: string, libPath: string, excludes: string[]){
    const log = ctx.log;
    return new Promise<void>((resolve, reject) => {
        openZip(pathd.join(libdir, libPath), {lazyEntries: true}, (err, zfile) => {
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
                        log.v(`Extracting ${entry.fileName} from ${pathd.basename(libPath)}.`);
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
function libraryName2Path(name: string, native: string){
    let parts = name.split(':');
    let pkg = pathd.join(...parts[0].split(/\./g));
    let clazz = parts[1];
    let classv = parts[2];
    return [pkg, clazz, classv, native ? `${clazz}-${classv}-${native}.jar` : `${clazz}-${classv}.jar`];
}
function getLibraryPath(lib: LibraryData){
    if (lib.downloads && lib.downloads.artifact && lib.downloads.artifact.path){
        return lib.downloads.artifact.path.split('/');
    }
    else {
        return libraryName2Path(lib.name, null);
    }
}
function getNativeLibraryPath(lib: LibraryData, os: string){
    if (lib.natives && lib.natives.hasOwnProperty(os)){
        const nativeString = lib.natives[os];
        if (lib.downloads && lib.downloads.classifiers){
            return lib.downloads.classifiers[nativeString].path.split('/') || libraryName2Path(lib.name, nativeString);
        }
        else {
            return libraryName2Path(lib.name, nativeString);
        }
    }
    else {
        return null;
    }
}
async function needDownloadLib(lib: LibraryData, libpath: string){
    if (lib.downloads && lib.downloads.artifact){
        const sha1 = lib.downloads.artifact.sha1;
        if (await exists(libpath) && sha1 === await fileSHA1(libpath)){
            return false;
        }
    }
    return true;
}
async function needDownloadNativeLib(lib: LibraryData, os: string, libpath: string){
    if (lib.natives && lib.natives.hasOwnProperty(os)){
        const ns = lib.natives[os];
        if (lib.downloads && lib.downloads.classifiers){
            const sha1 = lib.downloads.classifiers[ns].sha1;
            if (await exists(libpath) && sha1 === await fileSHA1(libpath)){
                return false;
            }
        }
    }
    return true;
}

function getAssetPath(hash: string){
    return [hash.substr(0, 2), hash];
}
async function needDownloadAsset(hash: string, objdir: string){
    const fn = pathd.join(objdir, ...getAssetPath(hash));
    if (await exists(fn) && await fileSHA1(fn) === hash){
        return false;
    }
    return true;
}

class Version {
    public versionJson: VersionData = null;
    public assetsJson: AssetsData = null;
    constructor(public mgr: VersionManager, public vname: string){
    }
    async loadData(download: boolean){
        const ctx = this.mgr.ctx;
        const vdir = ctx.getVersionDir(this.vname);
        if (this.versionJson === null){
            let jsonPath = pathd.join(vdir, this.vname + '.json');
            if (!await exists(jsonPath)){
                if (download){
                    const info = await this.mgr.getVersionInfo(this.vname);
                    if (info === null){
                        throw new Error(`Version ${this.vname} not found in version manifest.`);
                    }
                    ctx.log.i(`Downloading version json for ${this.vname}`);
                    const rawJson = await httpsGet(new URL(info.url));
                    await ensureDir(vdir);
                    await writeFile(jsonPath, rawJson);
                    this.versionJson = JSON.parse(rawJson);
                    ctx.log.i('saved version file');
                }
                else {
                    throw new Error(`Version ${this.vname} json file not found, try downloading this version first.`);
                }
            }
            else {
                ctx.log.i('reading version file');
                this.versionJson = JSON.parse(await readFile(jsonPath));
            }
        }
        //todo: inherits from
    }
    async validateAll(){
        await this.validateLibs();
        await this.validateAssets();
        await this.validateJar();
    }
    async validateJar(){
        const ctx = this.mgr.ctx;
        if (this.versionJson.jar && this.versionJson.jar !== this.vname){
            const nv = await this.mgr.getVersion(this.versionJson.jar);
            await nv.loadData(true);
            await nv.validateJar();
        }
        else {
            const vdir = ctx.getVersionDir(this.vname);
            const jarPath = pathd.join(vdir, this.vname + '.jar');
            const dinfo = this.versionJson.downloads.client;
            if (await exists(jarPath) && dinfo.sha1 === await fileSHA1(jarPath)){
                return;
            }
            else {
                ctx.log.i(`Downloading jar for ${this.vname}`);
                await ensureDir(vdir);
                const res = await download(new URL(dinfo.url));
                return new Promise<void>((resolve, reject) => {
                    res.pipe(fs.createWriteStream(jarPath));
                    res.on('end', () => resolve());
                    res.on('error', e => reject(e));
                });
            }
        }
    }
    async validateLibs(){
        let ctx = this.mgr.ctx;
        let tasks: string[][] = [];

        const os = getOS().osName;
        const libdir = pathd.join(ctx.getMCRoot(), 'libraries');
        await ensureDir(libdir);
        for (const lib of this.versionJson.libraries){
            const libpath = getLibraryPath(lib);
            const nativeLibPath = getNativeLibraryPath(lib, os);
            (await needDownloadLib(lib, pathd.join(libdir, ...libpath))) && tasks.push(libpath);
            nativeLibPath && (await needDownloadNativeLib(lib, os, pathd.join(libdir, ...nativeLibPath))) && tasks.push(nativeLibPath);
        }

        if (tasks.length){
            let downloader = createDownloader(ctx.config.downloadConcurrentLimit);
            let count = 0;
            ctx.log.i('Downloading libraries');
            for (let libpath of tasks){
                const url = new URL(libDownloadURL + '/' + libpath.join('/'));
                const savePath = pathd.join(libdir, ...libpath);
                await downloader.task(url, savePath, {
                    onDone() { ctx.log.i(`(${1 + count++}/${tasks.length}) Downloaded library ${libpath[libpath.length - 1]}`); },
                    onError(){ ctx.log.e(`(${1 + count++}/${tasks.length}) Failed to downloaded library ${libpath[libpath.length - 1]}`); }
                });
            }
            await downloader.wait();
        }
    }
    async validateAssets(){
        let tasks: {name: string, hash: string}[] = [];
        const ctx = this.mgr.ctx;
        const aindex = this.versionJson.assetIndex;
        const objdir = pathd.join(ctx.getMCRoot(), 'assets', 'objects');
        if (this.assetsJson === null){
            const jsonPath = pathd.join(ctx.getMCRoot(), 'assets', 'indexes', this.versionJson.assets + '.json');
            let rawJson: string;
            if (await exists(jsonPath) && sha1sum(rawJson = await readFile(jsonPath)) === aindex.sha1){
                this.assetsJson = JSON.parse(rawJson);
            }
            else {
                ctx.log.i(`Downloading asset index of version ${aindex.id}`);
                rawJson = await httpsGet(new URL(aindex.url));
                await ensureDir(pathd.dirname(jsonPath));
                await writeFile(jsonPath, rawJson);
                this.assetsJson = JSON.parse(rawJson);
            }
        }
        for (const name in this.assetsJson.objects){
            const {size, hash} = this.assetsJson.objects[name];
            if (await needDownloadAsset(hash, objdir)){
                tasks.push({name, hash});
            }
        }

        if (tasks.length){
            let count = 0;
            let downloader = createDownloader(ctx.config.downloadConcurrentLimit);
            ctx.log.i('Downloading assets');
            for (const {hash, name} of tasks){
                const p = getAssetPath(hash);
                const url = new URL(assetDownloadURL + '/' + p.join('/'));
                const savePath = pathd.join(objdir, ...p);
                await downloader.task(url, savePath, {
                    onDone() { ctx.log.i(`(${1 + count++}/${tasks.length}) Downloaded asset ${name}`); },
                    onError(){ ctx.log.e(`(${1 + count++}/${tasks.length}) Failed to downloaded asset ${name}`); }
                });
            }
            await downloader.wait();
        }
    }
    getClasspathJars(cfg: MCConfig): string[]{
        let libdir = pathd.join(this.mgr.ctx.getMCRoot(), 'libraries');
        var ret: string[] = [];
        let libs: {[n: string]: boolean} = {};
        for(var lib of this.versionJson.libraries){

            if (!libs.hasOwnProperty(lib.name) && checkLibrary(lib, cfg)){
                libs[lib.name] = true;
                ret.push(
                    pathd.join(libdir, ...getLibraryPath(lib))
                );
            }
        }
        return ret;
    }
    async extractNatives(dir: string, cfg: MCConfig){
        let os = getOS().osName;
        let libdir = pathd.join(this.mgr.ctx.getMCRoot(), 'libraries');
        for (let lib of this.versionJson.libraries){
            const libPath = getNativeLibraryPath(lib, os);
            if (libPath && checkLibrary(lib, cfg)){
                await extractOneLib(this.mgr.ctx, dir, libdir, pathd.join(...libPath), lib.extract ? lib.extract.exclude : []);
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
        if(this.versionJson.hasOwnProperty('minecraftArguments')){
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

// interface VersionManifest {
//     __comment?: string,
//     latest: { snapshot: string, release: string },
//     versions: { id: string, type: string, time:string, releaseTime: string, url: string }[]
// }
// export async function getVersionManifest(config: MCConfig){
//     return JSON.parse(await p.httpsGet(launcherMetaURL, '/mc/game/version_manifest.json'));
// }

export { VersionManager }