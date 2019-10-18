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
    async loadAllVersions(forceDownload: boolean){
        const ctx = this.ctx;
        const vdir = ctx.getVersionDir();
        if (forceDownload){
            await this._getManifest();
        }
        await Promise.all((await ls(vdir)).filter(f => f.isDir).map(async (f) => {
            let v = new Version(this, f.file);
            if (await v.versionFileExists()){
                ctx.log.i(`Loaded version ${v.vname}`);
                this.versions[v.vname] = v;
                await v.loadData(forceDownload);
                await v.validateAssetIndex();
            }
        }));
    }
    async validateAllVersions(){
        for (const vname in this.versions){
            const v = this.versions[vname];
            this.ctx.log.i(`Checking version ${v.vname}`);
            await v.validateAll();
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
    async listInstalled(){
        const ctx = this.ctx;
        const vd = ctx.getVersionDir();
        return (await ls(vd)).filter(f => f.isDir).map(f => f.file);
    }
    async cleanup(){
        const ctx = this.ctx;
        const assetIndexDir = pathd.join(ctx.getMCRoot(), 'assets', 'indexes');
        const assetDir = pathd.join(ctx.getMCRoot(), 'assets', 'objects');
        const libdir = pathd.join(ctx.getMCRoot(), 'libraries');
        const os = getOS().osName;
        
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
            assetIndexes[v.versionJson.assets + '.json'] = false;
            for (const lib of v.versionJson.libraries){
                if (checkLibrary(lib, ctx.config)){
                    let l = getLibraryPath(lib);
                    if (l){
                        libs[pathd.join(...l)] = false;
                    }
                    let nl = getNativeLibraryPath(lib, os);
                    if (nl){
                        libs[pathd.join(...nl)] = false;
                    }
                }
            }
            for (const name in v.assetsJson.objects){
                const {hash} = v.assetsJson.objects[name];
                assets[hash] = false;
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
        await Promise.all(tasks);
        await removeEmptyDirs(libdir);
        await removeEmptyDirs(assetDir);
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
    if (lib.downloads.artifact){
        return lib.downloads.artifact.path.split('/') || libraryName2Path(lib.name, null);
    }
    else {
        return null;
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

interface AssetDownloadTask extends DownloadTask {
    name: string;
};

class Version {
    public versionJson: VersionData = null;
    public assetsJson: AssetsData = null;
    constructor(public mgr: VersionManager, public vname: string){
    }
    async versionFileExists(){
        return await exists(pathd.join(this.mgr.ctx.getVersionDir(this.vname), this.vname + '.json'));
    }
    async loadData(forceDownload: boolean){
        const ctx = this.mgr.ctx;
        const vdir = ctx.getVersionDir(this.vname);
        if (this.versionJson === null){
            let jsonPath = pathd.join(vdir, this.vname + '.json');
            if (forceDownload){
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
    }
    async validateAll(){
        const ctx = this.mgr.ctx;
        ctx.log.i('Checking libraries');
        await this.validateLibs();
        ctx.log.i('Checking asset index');
        await this.validateAssetIndex();
        ctx.log.i('Checking assets');
        await this.validateAssets();
        ctx.log.i('Checking jar file');
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
                await downloadToFile(new URL(dinfo.url), jarPath, {
                    count: 50,
                    totalSize: dinfo.size,
                    onProgress: p => { ctx.log.i(`(${Math.round(1000 * p) / 10}%) Downloading jar for ${this.vname}`); }
                });
            }
        }
    }
    async validateLibs(){
        let ctx = this.mgr.ctx;
        let tasks: DownloadTask[] = [];
        let libPathSet: {[n: string]: boolean} = {};

        const os = getOS().osName;
        const libdir = pathd.join(ctx.getMCRoot(), 'libraries');
        await ensureDir(libdir);
        for (const lib of this.versionJson.libraries){
            const libpath = getLibraryPath(lib);
            const nativeLibPath = getNativeLibraryPath(lib, os);
            if (checkLibrary(lib, ctx.config)){
                if (libpath){
                    const libpathString = libpath.join('/');
                    if(!libPathSet.hasOwnProperty(libpathString) && await needDownloadLib(lib, pathd.join(libdir, ...libpath))) {
                        libPathSet[libpathString] = true;
                        tasks.push({
                            url: new URL(libDownloadURL + '/' + libpathString),
                            savePath: pathd.join(libdir, ...libpath)
                        });
                    }
                }
                if (nativeLibPath){
                    const nativeLibPathString = nativeLibPath.join('/');
                    if(!libPathSet.hasOwnProperty(nativeLibPathString) && await needDownloadNativeLib(lib, os, pathd.join(libdir, ...nativeLibPath))) {
                        libPathSet[nativeLibPathString] = true;
                        tasks.push({
                            url: new URL(libDownloadURL + '/' + nativeLibPathString),
                            savePath: pathd.join(libdir, ...nativeLibPath)
                        });
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
    async validateAssetIndex(){
        const ctx = this.mgr.ctx;
        const aindex = this.versionJson.assetIndex;
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
    async validateAssets(){
        let tasks: AssetDownloadTask[] = [];
        const ctx = this.mgr.ctx;
        const objdir = pathd.join(ctx.getMCRoot(), 'assets', 'objects');
        
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
    getClasspathJars(cfg: MCConfig): string[]{
        let libdir = pathd.join(this.mgr.ctx.getMCRoot(), 'libraries');
        var ret: string[] = [];
        let libs: {[n: string]: boolean} = {};
        for(var lib of this.versionJson.libraries){
            if (checkLibrary(lib, cfg)){
                const libpath = getLibraryPath(lib);
                if (libpath && !libs.hasOwnProperty(lib.name)){
                    libs[lib.name] = true;
                    ret.push(
                        pathd.join(libdir, ...libpath)
                    );
                }
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