'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var os = require('os');
var fs = require('fs');
var cpc = require('child_process');
var https = require('https');
var readline = require('readline');
var stream = require('stream');

function getOS() {
    var sn = os.type();
    var v = os.release();
    var a = os.arch();
    switch (sn) {
        case 'Darwin':
            sn = 'osx';
            break;
        case 'Windows_NT':
            sn = 'windows';
            break;
        case 'Linux':
            sn = 'linux';
            break;
        default:
            sn = 'unknown';
    }
    if (a === 'x64') {
        a = 'x86';
    }
    return {
        osName: sn,
        osV: v,
        osArch: a
    };
}

function checkRule(env, rules) {
    for (let rule of rules) {
        if (rule.os) {
            var { osName, osV, osArch } = getOS();
            if (rule.os.name && rule.os.name !== osName) {
                return false;
            }
            if (rule.os.version && !new RegExp(rule.os.version).test(osV)) {
                return false;
            }
            if (rule.os.arch && rule.os.arch !== osArch) {
                return false;
            }
        }
        if (rule.features) {
            if (rule.features.has_custom_resolution && !env.resolution) {
                return false;
            }
            if (rule.features.is_demo_user && !env.isDemo) {
                return false;
            }
        }
    }
    return true;
}

class LegacyMCArg {
    constructor(argTemp) {
        this.argTemp = argTemp;
        this.argv = {};
    }
    arg(name, v) {
        this.argv[name] = v;
        return this;
    }
    gameArg() {
        var ret = this.argTemp;
        for (var name in this.argv) {
            ret = ret.replace('${' + name + '}', this.argv[name]);
        }
        return ret;
    }
    jvmArg() {
        return [
            `-cp ${this.argv.classpath}`,
            `-Djava.library.path=${this.argv.natives_directory}`,
            `-Duser.home=${this.argv.user_home}`,
        ].join(' ');
    }
}
class NewMCArg {
    constructor(_argJson, cfg) {
        this._argJson = _argJson;
        this.cfg = cfg;
        this.argv = {};
    }
    _replaceVals(ret) {
        for (var name in this.argv) {
            ret = ret.replace('${' + name + '}', this.argv[name]);
        }
        return ret;
    }
    _allowed(arg) {
        if (arg.compatibilityRules) {
            return checkRule(this.cfg, arg.compatibilityRules);
        }
        else if (arg.rules) {
            return checkRule(this.cfg, arg.rules);
        }
        else
            return true;
    }
    _genArg(argItem) {
        var ret = [];
        for (var arg of argItem) {
            if (typeof arg === 'string')
                ret.push(this._replaceVals(arg));
            else if (this._allowed(arg)) {
                if (typeof arg.value === 'string')
                    ret.push(this._replaceVals(arg.value));
                else
                    for (var val of arg.value) {
                        ret.push(this._replaceVals(val));
                    }
            }
        }
        return ret.join(' ');
    }
    arg(name, v) {
        this.argv[name] = v;
        return this;
    }
    gameArg() {
        return this._genArg(this._argJson.game);
    }
    jvmArg() {
        return this._genArg(this._argJson.jvm);
    }
}

function fileExists(fn) {
    return new Promise(function (acc, reject) {
        fs.exists(fn, function (exi) {
            acc(exi);
        });
    });
}
function mkdir(path, mask) {
    return new Promise(function (acc, rej) {
        fs.mkdir(path, mask, function (err) {
            err ? rej(err) : acc();
        });
    });
}
function mkdirIfNotExists(path, mask) {
    return fileExists(path)
        .then(function (exi) {
        if (!exi) {
            return mkdir(path, mask);
        }
    });
}
function readFile(fn) {
    return new Promise(function (acc, reject) {
        fs.readFile(fn, function (err, data) {
            err ? reject(err) : acc(data.toString());
        });
    });
}
function writeFile(fn, s) {
    return new Promise(function (acc, reject) {
        fs.writeFile(fn, s, function (err) {
            err ? reject(err) : acc();
        });
    });
}
function exec(cmd, stdout, stderr) {
    return new Promise(function (acc, reject) {
        var pr = cpc.exec(cmd, function (err, stdout, stderr) {
            err ? reject(err) : acc();
        });
        pr.stdout.pipe(stdout);
        pr.stderr.pipe(stderr);
    });
}
function ajax(opt) {
    var reqOpt = {
        host: opt.host,
        port: opt.port,
        path: opt.path,
        method: opt.method,
        headers: opt.headers
    };
    return new Promise((acc, rej) => {
        var data = '';
        var req = https.request(opt, res => {
            res.setEncoding('utf-8');
            res.on('data', d => data += d);
            res.on('end', () => acc(data));
        });
        req.on('error', e => rej(e));
        opt.body && req.write(opt.body);
        req.end();
    });
}
function httpsPost(host, path, data) {
    var postBody = JSON.stringify(data);
    return ajax({
        host,
        path,
        port: 443,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(postBody.length)
        },
        body: postBody
    });
}
function input(question, hidden = false) {
    var mutableStdout = new stream.Writable({
        write(chunk, encoding, callback) {
            if (muted)
                process.stdout.write(chunk, encoding);
            callback();
        }
    });
    var muted = true;
    var rl = readline.createInterface({
        input: process.stdin,
        output: hidden ? mutableStdout : process.stdout,
        terminal: true
    });
    return new Promise(function (acc, rej) {
        muted = true;
        rl.question(question, function (answer) {
            console.log('');
            rl.close();
            acc(answer);
        });
        muted = false;
    });
}

class VersionManager {
    constructor(ctx) {
        this.ctx = ctx;
        this.versions = {};
    }
    async getVersion(vname) {
        var ret = this.versions[vname];
        var cela = this;
        if (!ret) {
            var jsonPath = cela.ctx.getVersionDir(vname) + '/' + vname + '.json';
            ret = cela.versions[vname] = new Version(cela, vname, JSON.parse(await readFile(jsonPath)));
        }
        return ret;
    }
}
class Version {
    constructor(mgr, vname, versionJson) {
        this.mgr = mgr;
        this.vname = vname;
        this.versionJson = versionJson;
    }
    getJars() {
        var libdir = this.mgr.ctx.getMCRoot() + '/libraries';
        var ret = [];
        for (var lib of this.versionJson.libraries) {
            var name = lib.name;
            var parts = name.split(':');
            var pkg = parts[0].replace(/\./g, "/");
            var clazz = parts[1];
            var classv = parts[2];
            ret.push([libdir, pkg, clazz, classv, clazz + '-' + classv + '.jar'].join('/'));
        }
        return ret;
    }
    getNativeDir() {
        return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '-natives/';
    }
    getMainClass() {
        return this.versionJson.mainClass;
    }
    getJarName() {
        return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '.jar';
    }
    getArgs(cfg) {
        var arg;
        if ('minecraftArguments' in this.versionJson) {
            arg = new LegacyMCArg(this.versionJson.minecraftArguments);
        }
        else {
            arg = new NewMCArg(this.versionJson.arguments, cfg);
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

function randHex(len) {
    var ret = '';
    while (len-- > 0) {
        ret += (Math.round((Math.random() * 100)) % 16).toString(16);
    }
    return ret;
}

const authServerInfo = {
    host: 'authserver.mojang.com',
    validate: '/validate',
    login: '/authenticate',
    refresh: '/refresh',
    invalidate: '/invalidate',
    logout: '/signout'
};
class UserManager {
    constructor(ctx) {
        this.ctx = ctx;
        this.users = {};
        this.saveFileName = 'users.json';
    }
    async loadFromFile() {
        var fn = this.ctx.getLauncherDir() + '/' + this.saveFileName;
        var cela = this;
        if (await fileExists(fn)) {
            cela.ctx.log.i('user file exists, reading');
            var us = JSON.parse(await readFile(fn));
            for (var name in us) {
                var u = us[name];
                cela.users[name] = new MojangUser(u);
            }
            cela.ctx.log.i('done loading users');
        }
        else {
            cela.ctx.log.i('user file not exists, skipping');
        }
        return true;
    }
    async save() {
        var fn = this.ctx.getLauncherDir() + '/' + this.saveFileName;
        var log = this.ctx.log;
        await writeFile(fn, JSON.stringify(this.users));
        log.v('user file saved');
        return true;
    }
    offlineUser(uname) {
        return new OfflineUser(uname);
    }
    mojangUser(email) {
        return this.users[email] || new MojangUser({ email: email });
    }
    getUser(email) {
        return this.users[email];
    }
    async addMojangUser(u) {
        this.users[u.email] = u;
        return this.save();
    }
    async logoutUser(u, getPass) {
        async function logout2(pass$$1) {
            var res = await httpsPost(authServerInfo.host, authServerInfo.logout, {
                username: u.email,
                password: pass$$1
            });
            if (res !== '') {
                throw JSON.parse(res).errorMessage;
            }
            return true;
        }
        var cela = this;
        var log = this.ctx.log;
        if (await u.validAndRefresh(this.ctx)) {
            log.i('user is valid, logging out');
            await u.logout();
            log.i('successfully logged out');
            delete cela.users[u.email];
        }
        else {
            log.i('user is not valid, logging out using password');
            await logout2(await getPass());
            log.i('successfully logged out');
            delete cela.users[u.email];
        }
        return cela.save();
    }
}
class User {
    initArg(arg) {
        arg
            .arg('user_type', this.getType())
            .arg('auth_player_name', this.getName())
            .arg('auth_uuid', this.getUUID())
            .arg('auth_access_token', this.getToken());
    }
}
class OfflineUser extends User {
    constructor(name) {
        super();
        this.name = name;
    }
    getType() { return 'legacy'; }
    getName() { return this.name; }
    getUUID() { return '{}'; }
    getToken() { return '{}'; }
}
class MojangUser extends User {
    constructor(u) {
        super();
        this.email = u.email;
        this.accessToken = u.accessToken || '';
        this.clientToken = u.clientToken || randHex(32);
        this.profiles = u.profiles || [];
        this.selectedProfile = u.selectedProfile || null;
        this.user = u.user || {
            id: '',
            properties: {}
        };
    }
    getType() { return 'mojang'; }
    getName() { return this.selectedProfile.name; }
    getUUID() { return this.selectedProfile.id; }
    getToken() { return this.accessToken; }
    needsLogin() { return this.accessToken === ''; }
    async login(pass$$1, version = '1.0') {
        var cela = this;
        var resRaw = await httpsPost(authServerInfo.host, authServerInfo.login, {
            username: this.email,
            password: pass$$1,
            clientToken: this.clientToken,
            agent: { name: 'Minecraft', version },
            requestUser: true
        });
        var res = JSON.parse(resRaw);
        if (res.error) {
            throw 'logging failed: ' + res.errorMessage;
        }
        else {
            if (res.clientToken !== cela.clientToken) {
                throw 'client token changed, which shouldnt happen';
            }
            cela.accessToken = res.accessToken;
            cela.profiles = res.availableProfiles;
            cela.selectedProfile = res.selectedProfile || res.availableProfiles[0];
            cela.user.id = res.user.id;
            cela.user.properties = res.user.properties;
        }
        return true;
    }
    async validate() {
        return '' === await httpsPost(authServerInfo.host, authServerInfo.validate, {
            clientToken: this.clientToken,
            accessToken: this.accessToken
        });
    }
    async validAndRefresh(ctx) {
        var log = ctx.log;
        if (this.needsLogin()) {
            log.i('user has not logged in');
            return false;
        }
        log.i('checking user validity');
        if (!await this.validate()) {
            log.i('user not valid, refreshing');
            await this.refresh();
        }
        return true;
    }
    async makeValid(ctx, version, getPass) {
        var log = ctx.log;
        var cela = this;
        async function login1() {
            var pass$$1 = await getPass();
            log.i('logging in');
            await cela.login(pass$$1, version);
            log.i('logging in successful');
            return true;
        }
        if (await this.validAndRefresh(ctx)) {
            log.i('user is valid');
        }
        else {
            log.i('user is invalid, login required');
            return login1();
        }
        return true;
    }
    async refresh() {
        var cela = this;
        var resRaw = await httpsPost(authServerInfo.host, authServerInfo.refresh, {
            clientToken: this.clientToken,
            accessToken: this.accessToken,
            selectedProfile: null,
            requestUser: true
        });
        var res = JSON.parse(resRaw);
        if (res.error) {
            throw res.errorMessage;
        }
        else {
            cela.accessToken = res.accessToken;
            cela.selectedProfile = res.selectedProfile;
            cela.user.id = res.user.id;
            cela.user.properties = res.user.properties;
        }
        return true;
    }
    async logout() {
        var res = await httpsPost(authServerInfo.host, authServerInfo.invalidate, {
            accessToken: this.accessToken,
            clientToken: this.clientToken
        });
        if (res === '') {
            return null;
        }
        else {
            throw JSON.parse(res).errorMessage;
        }
    }
}

async function prepareDirs(ctx) {
    await mkdirIfNotExists(ctx.getMCRoot(), null);
    await mkdirIfNotExists(ctx.getLauncherDir(), null);
    return;
}

async function launch(ctx, opt) {
    if (!opt.uname) {
        throw new Error('user name not present');
    }
    if (!opt.version) {
        throw new Error('version not given');
    }
    opt.offline = !!opt.offline;
    var log = ctx.log;
    async function launch1() {
        var vmgr = new VersionManager(ctx);
        var umgr = new UserManager(ctx);
        var user;
        await prepareDirs(ctx);
        await umgr.loadFromFile();
        if (opt.offline) {
            user = umgr.offlineUser(opt.uname);
        }
        else {
            var user2 = umgr.mojangUser(opt.uname);
            await user2.makeValid(ctx, opt.version, () => {
                return ctx.readInput(`password for ${user2.email}:`, true);
            });
            await umgr.addMojangUser(user2);
            user = user2;
        }
        var v = await vmgr.getVersion(opt.version);
        var mcargs = v.getArgs(ctx.config);
        var jars = v.getJars();
        jars.push(v.getJarName());
        user.initArg(mcargs);
        mcargs.arg('classpath', jars.join(':'))
            .arg('natives_directory', v.getNativeDir())
            .arg('user_home', ctx.config.home)
            .arg('launcher_name', ctx.launcherName)
            .arg('launcher_version', ctx.launcherVersion);
        log.i('generating arguments');
        var cmd = [
            'java',
            "-Xincgc",
            '-XX:-UseAdaptiveSizePolicy',
            '-XX:-OmitStackTraceInFastThrow',
            '-Xmn128m',
            '-Xmx2048M',
            mcargs.jvmArg(),
            v.getMainClass(),
            mcargs.gameArg()
        ];
        log.v(`arguments: ${cmd.join(' ')}`);
        log.i('launching game');
        await exec(cmd.join(' '), process.stdout, process.stderr);
        log.i('game quit');
    }
    try {
        await launch1();
    }
    catch (e) {
        log.e(e);
    }
}

async function logout(ctx, opts) {
    var log = ctx.log;
    var umgr = new UserManager(ctx);
    try {
        await prepareDirs(ctx);
        await umgr.loadFromFile();
        var user = umgr.mojangUser(opts.uname);
        await umgr.logoutUser(user, () => {
            return ctx.readInput(`password for ${user.email}:`, true);
        });
    }
    catch (msg) {
        log.e(msg);
    }
}

var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["verbose"] = 0] = "verbose";
    LogLevel[LogLevel["info"] = 1] = "info";
    LogLevel[LogLevel["warn"] = 2] = "warn";
    LogLevel[LogLevel["err"] = 3] = "err";
})(LogLevel || (LogLevel = {}));
class Log {
    constructor(c, level = LogLevel.info) {
        this.c = c;
        this.level = level;
    }
    i(s) {
        this.level <= LogLevel.info && this.c.log('[jmcl/INFO] ' + s);
    }
    v(s) {
        this.level <= LogLevel.verbose && this.c.log('[jmcl/VERBOSE] ' + s);
    }
    e(s) {
        this.level <= LogLevel.err && this.c.log('[jmcl/ERR] ' + s);
    }
    w(s) {
        this.level <= LogLevel.warn && this.c.log('[jmcl/WARN] ' + s);
    }
}

class Context {
    constructor(console, logLevel) {
        this.console = console;
        this.config = {
            launcherRoot: '.jmcl',
            home: '/home/cfy',
            mcRoot: '.minecraft',
            resolution: null,
            isDemo: false,
            launcherMetaURL: 'launchermeta.mojang.com'
        };
        this.log = new Log(console, LogLevel[logLevel]);
        this.config.home = os.homedir();
    }
    getMCRoot() {
        return `${this.config.home}/${this.config.mcRoot}`;
    }
    getVersionDir(vname) {
        return `${this.config.home}/${this.config.mcRoot}/versions/${vname}`;
    }
    getLauncherDir() {
        return `${this.config.home}/${this.config.mcRoot}/${this.config.launcherRoot}`;
    }
    async readInput(q, hidden) {
        return input(q, hidden);
    }
}

exports.launch = launch;
exports.logout = logout;
exports.Context = Context;
//# sourceMappingURL=jmcl.js.map
