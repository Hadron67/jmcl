import { Context, MCConfig } from './mcenv.js';
import { LegacyMCArg, MCArg, ArgumentJson, NewMCArg } from './mcarg.js';
import { CompatibilityRule, checkRule } from './compatibility-rule.js';
import * as pathd from 'path';
import * as fs from 'fs';
import { open as openZip } from 'yauzl';
import { getOS } from './osutil.js';
import { exists, readFile, writeFile, fileSHA1, find, ls, rmFile, removeEmptyDirs } from './fsx.js';
import { httpsGet } from './ajax.js';
import { URL } from 'url';
import { ensureDir, remove } from 'fs-extra';
import { sha1sum } from './util.js';
import { DownloadTask, downloadAll, downloadToFile } from './download.js';
import { findAssets } from './find.js';

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
    getVersion(vname: string){
        var ret = this.versions[vname];
        var cela = this;
        if(!ret){
            // let jsonPath = pathd.join(this.ctx.getVersionDir(vname), vname + '.json');
            // ret = cela.versions[vname] = new Version(cela, vname, JSON.parse(await p.readFile(jsonPath)));
            ret = this.versions[vname] = new Version(cela, vname);
        }
        return ret;
    }
    async getAvailableVersions(){
        await this._getManifest();
        return this.versionManifest.versions;
    }
    async getLatest(){
        await this._getManifest();
        return this.versionManifest.latest;
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
        return null;
    }
    async loadAllVersions(forceDownload: boolean){
        const ctx = this.ctx;
        const vdir = ctx.getVersionDir();
        if (forceDownload){
            await this._getManifest();
        }
        await Promise.all((await this.listInstalled()).map(async (f) => {
            let v = this.getVersion(f);
            if (await v.versionFileExists()){
                ctx.log.i(`Loaded version ${v.vname}`);
                this.versions[v.vname] = v;
                // Only vanilla can be downloaded
                // Third party clients are not present in the version manifest
                if (forceDownload && await v.isVanillaVersion()){
                    v.markRefresh();
                }
                await v.loadData();
            }
        }));
    }
    async validateAllVersions(redownloadLib: boolean){
        for (const vname in this.versions){
            const v = this.versions[vname];
            await v.validateAll(redownloadLib);
        }
    }
    async deleteVersion(vname: string){
        const ctx = this.ctx;
        const vd = ctx.getVersionDir(vname);
        if (await exists(vd)){
            await remove(vd);
            ctx.log.i(`Removed directory ${vd}`);
        }
        else {
            ctx.log.e(`Directory ${vd} not found`);
        }
    }
    async isInstalled(vname: string){
        const ctx = this.ctx;
        return await new Version(this, vname).versionFileExists();
    }
    async listInstalled(){
        const ctx = this.ctx;
        const vd = ctx.getVersionDir();
        return (await ls(vd)).filter(f => f.isDir).map(f => f.file);
    }
    getVersions(){
        let ret: Version[] = [];
        for (const vn in this.versions){
            ret.push(this.versions[vn]);
        }
        return ret;
    }
    async cleanup(){
        const ctx = this.ctx;
        const assetIndexDir = pathd.join(ctx.getMCRoot(), 'assets', 'indexes');
        const assetDir = pathd.join(ctx.getMCRoot(), 'assets', 'objects');
        const libdir = pathd.join(ctx.getMCRoot(), 'libraries');
        const os = getOS().osName;

        await Promise.all(this.getVersions().map(v => v.validateAssetIndex()));

        const assets: {[n: string]: boolean} = {};
        for (let a of await findAssets(assetDir)){
            assets[a] = true;
        }

        const libs: {[n: string]: boolean} = {};
        for (let lib of await find(libdir)){
            libs[lib] = true;
        }

        const assetIndexes: {[v: string]: boolean} = {};
        for (let {file, isDir} of await ls(assetIndexDir)){
            if (!isDir && file.endsWith('.json')){
                assetIndexes[file] = true;
            }
        }

        for (const vname in this.versions){
            const v = this.versions[vname];
            if (v.versionJson.assets){
                assetIndexes[v.versionJson.assets + '.json'] = false;
            }
            if (v.versionJson.libraries){
                for (const lib of v.versionJson.libraries){
                    if (checkLibrary(lib, ctx.config)){
                        let l = getLibraryPath(lib);
                        if (l){
                            libs[pathd.join(l)] = false;
                        }
                        let nl = getNativeLibraryPath(lib, os);
                        if (nl){
                            libs[nl] = false;
                        }
                    }
                }
            }
            if (v.assetsJson){
                for (const name in v.assetsJson.objects){
                    const {hash} = v.assetsJson.objects[name];
                    assets[hash] = false;
                }
            }
        }

        const tasks: Promise<void>[] = [];

        for (const lib in libs){
            if (libs[lib]){
                tasks.push((async () => {
                    ctx.log.i(`Removing library ${pathd.basename(lib)}`);
                    await rmFile(pathd.join(libdir, lib));
                })());
            }
        }
        for (const a in assets){
            if (assets[a]){
                tasks.push((async () => {
                    ctx.log.i(`Removing asset ${a}`);
                    await rmFile(pathd.join(assetDir, ...getAssetPath(a)));
                })());
            }
        }
        for (const ai in assetIndexes){
            if (assetIndexes[ai]){
                tasks.push((async () => {
                    ctx.log.i(`Removing asset index file ${ai}`);
                    await rmFile(pathd.join(assetIndexDir, ai));
                })());
            }
        }
        if (tasks.length){
            await Promise.all(tasks);
            await removeEmptyDirs(libdir);
            await removeEmptyDirs(assetDir);
            ctx.log.i('Done');
        }
        else {
            ctx.log.i('No files to delete');
        }
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
    url?: string;
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
    inheritsFrom: string;
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
    if (lib.downloads){
        // Latest format
        if (lib.downloads.artifact){
            const p = lib.downloads.artifact.path;
            return p ? pathd.normalize(p) : pathd.join(...libraryName2Path(lib.name, null));
        }
    }
    else {
        return pathd.join(...libraryName2Path(lib.name, null));
    }
    return null;
}
function getNativeLibraryPath(lib: LibraryData, os: string){
    if (lib.natives && lib.natives.hasOwnProperty(os)){
        const nativeString = lib.natives[os];
        if (lib.downloads && lib.downloads.classifiers){
            return pathd.normalize(lib.downloads.classifiers[nativeString].path) || pathd.join(...libraryName2Path(lib.name, nativeString));
        }
        else {
            return pathd.join(...libraryName2Path(lib.name, nativeString));
        }
    }
    else {
        return null;
    }
}
async function needDownloadLibraryURL(lib: LibraryData, libpath: string, redownload: boolean){
    if (lib.downloads){
        if (lib.downloads.artifact){
            if (lib.downloads.artifact.url === ''){
                // Forge
                return null;
            }
            const sha1 = lib.downloads.artifact.sha1;
            if (await exists(libpath) && sha1 === await fileSHA1(libpath)){
                return null;
            }
            return lib.downloads.artifact.url;
        }
    }
    else {
        // Fabric, Optifine, old launcher version
        if (await exists(libpath) && !redownload){
            return null;
        }
        return (lib.url || libDownloadURL)  + libraryName2Path(lib.name, null).join('/');
    }
    return null;
}
async function needDownloadNativeLibraryURL(lib: LibraryData, os: string, libpath: string, redownload: boolean){
    if (lib.natives && lib.natives.hasOwnProperty(os)){
        const ns = lib.natives[os];
        if (lib.downloads && lib.downloads.classifiers){
            // Latest
            const nld = lib.downloads.classifiers[ns];
            if (await exists(libpath) && nld.sha1 === await fileSHA1(libpath)){
                return null;
            }
            return nld.url;
        }
        else {
            // Old
            if (await exists(libpath) && !redownload){
                return null;
            }
            return (lib.url || libDownloadURL) + libraryName2Path(lib.name, ns).join('/');
        }
    }
    return null;
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

interface AssetDownloadTask extends DownloadTask {
    name: string;
};

class Version {
    public versionJson: VersionData = null;
    public assetsJson: AssetsData = null;
    private _parent: Version = null;
    private _needRefresh = false;

    private _libValide = false;
    private _assetIndexValide = false;
    private _assetsValide = false;
    private _jarValide = false;
    constructor(public mgr: VersionManager, public vname: string){
    }
    async versionFileExists(){
        return await exists(pathd.join(this.mgr.ctx.getVersionDir(this.vname), this.vname + '.json'));
    }
    async isVanillaVersion(){
        if (this.versionJson === null){
            return await this.mgr.getVersionInfo(this.vname) !== null;
        }
        else {
            return true;
        }
    }
    markRefresh(){ this._needRefresh = true; }
    async loadData(){
        const ctx = this.mgr.ctx;
        const vdir = ctx.getVersionDir(this.vname);
        if (this.versionJson === null){
            let jsonPath = pathd.join(vdir, this.vname + '.json');
            if (this._needRefresh){
                this._needRefresh = false;
                const info = await this.mgr.getVersionInfo(this.vname);
                if (info === null){
                    throw new Error(`Version ${this.vname} not found in version manifest.`);
                }
                ctx.log.i(`Downloading version json for ${this.vname}`);
                const rawJson = await httpsGet(new URL(info.url));
                await ensureDir(vdir);
                await writeFile(jsonPath, rawJson);
                this.versionJson = JSON.parse(rawJson);
                ctx.log.i(`saved version file of ${this.vname}`);
            }
            else if(!await exists(jsonPath)) {
                throw new Error(`Version ${this.vname} json file not found, try downloading this version first.`);
            }
            else {
                ctx.log.i(`reading version file of ${this.vname}`);
                this.versionJson = JSON.parse(await readFile(jsonPath));
            }
        }
        //todo: inherits from
        if (this.versionJson.inheritsFrom){
            this._parent = this.mgr.getVersion(this.versionJson.inheritsFrom);
            await this._parent.loadData();
        }
    }
    async validateAll(redownloadLib: boolean){
        let vp: Version = this;
        while (vp){
            await vp.validateLibs(redownloadLib);
            await vp.validateAssetIndex();
            await vp.validateAssets();
            await vp.validateJar();
            vp = vp._parent;
        }
    }
    async validateJar(){
        let vp: Version = this;
        const ctx = this.mgr.ctx;
        if (this._jarValide){
            return;
        }
        ctx.log.i(`Checking jar file of ${this.vname}`);

        const vdir = ctx.getVersionDir(this.vname);
        const jarPath = pathd.join(vdir, this.vname + '.jar');
        if (this.versionJson.downloads && this.versionJson.downloads.client){
            const dinfo = this.versionJson.downloads.client;
            if (await exists(jarPath) && dinfo.sha1 === await fileSHA1(jarPath)){
                return;
            }
            else {
                ctx.log.i(`Downloading jar for ${this.vname}`);
                await ensureDir(vdir);
                await downloadToFile(new URL(dinfo.url), jarPath, {
                    count: 50,
                    totalSize: dinfo.size,
                    onProgress: p => { ctx.log.i(`(${Math.round(1000 * p) / 10}%) Downloading jar for ${this.vname}`); }
                });
            }
        }

        this._jarValide = true;
    }
    async validateLibs(redownload: boolean){
        if (this._libValide){
            return;
        }
        if (this.versionJson.libraries){
            let ctx = this.mgr.ctx;
            let tasks: DownloadTask[] = [];
            let libPathSet: {[n: string]: boolean} = {};
            ctx.log.i(`Checking libraries of ${this.vname}`);
    
            const os = getOS().osName;
            const libdir = pathd.join(ctx.getMCRoot(), 'libraries');
            await ensureDir(libdir);
    
            for (const lib of this.versionJson.libraries){
                const libpath = getLibraryPath(lib);
                const nativeLibPath = getNativeLibraryPath(lib, os);
                if (checkLibrary(lib, ctx.config)){
                    if (libpath){
                        if(!libPathSet.hasOwnProperty(libpath)) {
                            libPathSet[libpath] = true;
                            const url = await needDownloadLibraryURL(lib, pathd.join(libdir, libpath), redownload);
                            if (url){
                                tasks.push({
                                    url: new URL(url),
                                    savePath: pathd.join(libdir, libpath)
                                });
                            }
                        }
                    }
                    if (nativeLibPath){
                        if(!libPathSet.hasOwnProperty(nativeLibPath)) {
                            libPathSet[nativeLibPath] = true;
                            const url = await needDownloadNativeLibraryURL(lib, os, pathd.join(libdir, nativeLibPath), redownload);
                            if (url){
                                tasks.push({
                                    url: new URL(url),
                                    savePath: pathd.join(libdir, nativeLibPath)
                                });
                            }
                        }
                    }
                }
            }
    
            if (tasks.length){
                ctx.log.i('Downloading libraries');
                await downloadAll(tasks, ctx.config.downloadConcurrentLimit, {
                    onDone(i, dc) { ctx.log.i(`(${dc}/${tasks.length}) Downloaded library ${pathd.basename(tasks[i].savePath)}`) },
                    onError(i, dc){ ctx.log.e(`(${dc}/${tasks.length}) Failed to downloaded library ${pathd.basename(tasks[i].savePath)}`); }
                });
            }
        }

        this._libValide = true;
    }
    async validateAssetIndex(){
        if (this._assetIndexValide){
            return;
        }
        if (this.versionJson.assetIndex){
            const ctx = this.mgr.ctx;
            const aindex = this.versionJson.assetIndex;
            ctx.log.i(`Checking asset index of ${this.vname}`);
            if (this.assetsJson === null){
                const jsonPath = pathd.join(ctx.getMCRoot(), 'assets', 'indexes', this.versionJson.assets + '.json');
                let rawJson: string;
                if (await exists(jsonPath) && sha1sum(rawJson = await readFile(jsonPath)) === aindex.sha1){
                    this.assetsJson = JSON.parse(rawJson);
                }
                else {
                    ctx.log.i(`Downloading asset index of version ${aindex.id}`);
                    rawJson = await httpsGet(new URL(aindex.url));
                    await writeFile(jsonPath, rawJson);
                    this.assetsJson = JSON.parse(rawJson);
                }
            }
        }
        this._assetIndexValide = true;
    }
    async validateAssets(){
        if (this._assetsValide){
            return;
        }
        if (this.assetsJson){
            let tasks: AssetDownloadTask[] = [];
            const ctx = this.mgr.ctx;
            const objdir = pathd.join(ctx.getMCRoot(), 'assets', 'objects');
            ctx.log.i(`Checking assets of ${this.vname}`);
            
            let checkTasks: Promise<void>[] = [];
            for (const name in this.assetsJson.objects){
                const {size, hash} = this.assetsJson.objects[name];
                checkTasks.push((async () => {
                    if (await needDownloadAsset(hash, objdir)){
                        const p = getAssetPath(hash);
                        const url = new URL(assetDownloadURL + '/' + p.join('/'));
                        const savePath = pathd.join(objdir, ...p);
                        tasks.push({name, url, savePath});
                    }
                })());
            }
    
            await Promise.all(checkTasks);
    
            if (tasks.length){
                ctx.log.i('Downloading assets');
                await downloadAll(tasks, ctx.config.downloadConcurrentLimit, {
                    onDone(i, dc) { ctx.log.i(`(${dc}/${tasks.length}) Downloaded asset ${tasks[i].name}`); },
                    onError(i, dc){ ctx.log.e(`(${dc}/${tasks.length}) Failed to downloaded asset ${tasks[i].name}`); }
                });
            }
        }

        this._assetsValide = true;
    }
    getClasspathJars(cfg: MCConfig): string[]{
        let libdir = pathd.join(this.mgr.ctx.getMCRoot(), 'libraries');
        var ret: string[] = [];
        let libs: {[n: string]: boolean} = {};
        let vp: Version = this;
        while (vp){
            for(var lib of vp.versionJson.libraries){
                if (checkLibrary(lib, cfg)){
                    const libpath = getLibraryPath(lib);
                    if (libpath && !libs.hasOwnProperty(lib.name)){
                        libs[lib.name] = true;
                        ret.push(
                            pathd.join(libdir, libpath)
                        );
                    }
                }
            }
            vp = vp._parent;
        }
        ret.push(this.getJarName());
        return ret;
    }
    async extractNatives(dir: string, cfg: MCConfig){
        let os = getOS().osName;
        let libdir = pathd.join(this.mgr.ctx.getMCRoot(), 'libraries');
        let vp: Version = this;
        while (vp){
            for (let lib of vp.versionJson.libraries){
                const libPath = getNativeLibraryPath(lib, os);
                if (libPath && checkLibrary(lib, cfg)){
                    await extractOneLib(this.mgr.ctx, dir, libdir, pathd.join(libPath), lib.extract ? lib.extract.exclude : []);
                }
            }
            vp = vp._parent;
        }
    }
    getMainClass (){
        return this.versionJson.mainClass;
    }
    getJarName(){
        let vp: Version = this;
        while (vp){
            if (vp.versionJson.downloads && vp.versionJson.downloads.client){
                return pathd.join(this.mgr.ctx.getVersionDir(vp.vname), vp.vname + '.jar');
            }
            vp = vp._parent;
        }
        return null;
    }
    getAssetId(){
        let vp: Version = this;
        while (vp){
            if (vp.versionJson.assets){
                return vp.versionJson.assets;
            }
            vp = vp._parent;
        }
        return null;
    }
    getArgs(cfg: MCConfig): MCArg{
        var arg: MCArg;
        if(this.versionJson.hasOwnProperty('minecraftArguments')){
            arg = new LegacyMCArg(this.versionJson.minecraftArguments);
        }
        else {
            const argJson: ArgumentJson = {game: [], jvm: []};
            let v: Version = this;
            while (v){
                if (v.versionJson.arguments.game){
                    for (const a of v.versionJson.arguments.game){
                        argJson.game.push(a);
                    }
                }
                if (v.versionJson.arguments.jvm){
                    for (const a of v.versionJson.arguments.jvm){
                        argJson.jvm.push(a);
                    }
                }
                v = v._parent;
            }
            arg = new NewMCArg(argJson, cfg);
        }

        var env = this.mgr.ctx;
        let assetsDir = pathd.join(env.getMCRoot(), 'assets');
        // Uncommenting the following line would make the console log output of Minecraft in xml.
        // let logging = this.versionJson.logging.client;
        // arg.appendRaw(logging.argument.replace(/\${path}/g, pathd.join(assetsDir, 'log_configs', logging.file.id)));
        
        return arg
                .arg('version_name', this.vname)
                .arg('game_directory', env.getMCRoot())
                .arg('assets_root', assetsDir)
                .arg('assets_index_name', this.getAssetId())
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