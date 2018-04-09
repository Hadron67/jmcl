'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var fs = require('fs');
var cpc = require('child_process');
var https = require('https');
var readline = require('readline');
var stream = require('stream');

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
/* global Reflect, Promise */

var extendStatics = Object.setPrototypeOf ||
    ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
    function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };

function __extends(d, b) {
    extendStatics(d, b);
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
}











function __awaiter(thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

function __generator(thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
}

var MCArg = (function () {
    function MCArg(argTemp) {
        this.argTemp = argTemp;
        this.argv = {};
    }
    MCArg.prototype.arg = function (name, v) {
        this.argv[name] = v;
        return this;
    };
    MCArg.prototype.toString = function () {
        var ret = this.argTemp;
        for (var name in this.argv) {
            ret = ret.replace('${' + name + '}', this.argv[name]);
        }
        return ret;
    };
    return MCArg;
}());

function fileExists(fn) {
    return new Promise(function (acc, reject) {
        fs.exists(fn, function (exi) {
            acc(exi);
        });
    });
}
function mkdir$1(path, mask) {
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
            return mkdir$1(path, mask);
        }
    });
}
function readFile$1(fn) {
    return new Promise(function (acc, reject) {
        fs.readFile(fn, function (err, data) {
            err ? reject(err) : acc(data.toString());
        });
    });
}
function writeFile$1(fn, s) {
    return new Promise(function (acc, reject) {
        fs.writeFile(fn, s, function (err) {
            err ? reject(err) : acc();
        });
    });
}
function exec$1(cmd, stdout, stderr) {
    return new Promise(function (acc, reject) {
        var pr = cpc.exec(cmd, function (err, stdout, stderr) {
            err ? reject(err) : acc();
        });
        pr.stdout.pipe(stdout);
        pr.stderr.pipe(stderr);
    });
}
function ajax(opt) {
    return new Promise(function (acc, rej) {
        var data = '';
        var req = https.request(opt, function (res) {
            res.setEncoding('utf-8');
            res.on('data', function (d) {
                data += d;
            });
            res.on('end', function () {
                acc(data);
            });
        });
        req.on('error', function (e) {
            rej(e);
        });
        opt.body && req.write(opt.body);
        req.end();
    });
}

function httpsPost(host, path, data) {
    var postBody = JSON.stringify(data);
    return ajax({
        host: host,
        path: path,
        port: 443,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(postBody.length)
        },
        body: postBody
    });
}
function input(question, hidden) {
    if (hidden === void 0) { hidden = false; }
    var mutableStdout = new stream.Writable({
        write: function (chunk, encoding, callback) {
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

var VersionManager = (function () {
    function VersionManager(ctx) {
        this.ctx = ctx;
        this.versions = {};
    }
    VersionManager.prototype.getVersion = function (vname) {
        return __awaiter(this, void 0, void 0, function () {
            var ret, cela, jsonPath, _a, _b, _c, _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        ret = this.versions[vname];
                        cela = this;
                        if (!!ret) return [3, 2];
                        jsonPath = cela.ctx.getVersionDir(vname) + '/' + vname + '.json';
                        _a = cela.versions;
                        _b = vname;
                        _c = Version.bind;
                        _d = [void 0, cela, vname];
                        _f = (_e = JSON).parse;
                        return [4, readFile$1(jsonPath)];
                    case 1:
                        ret = _a[_b] = new (_c.apply(Version, _d.concat([_f.apply(_e, [_g.sent()])])))();
                        _g.label = 2;
                    case 2: return [2, ret];
                }
            });
        });
    };
    return VersionManager;
}());
var Version = (function () {
    function Version(mgr, vname, versionJson) {
        this.mgr = mgr;
        this.vname = vname;
        this.versionJson = versionJson;
    }
    Version.prototype.getJars = function () {
        var libdir = this.mgr.ctx.getMCRoot() + '/libraries';
        var ret = [];
        for (var _i = 0, _a = this.versionJson.libraries; _i < _a.length; _i++) {
            var lib = _a[_i];
            var name = lib.name;
            var parts = name.split(':');
            var pkg = parts[0].replace(/\./g, "/");
            var clazz = parts[1];
            var classv = parts[2];
            ret.push([libdir, pkg, clazz, classv, clazz + '-' + classv + '.jar'].join('/'));
        }
        return ret;
    };
    Version.prototype.getNativeDir = function () {
        return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '-natives/';
    };
    Version.prototype.getMainClass = function () {
        return this.versionJson.mainClass;
    };
    Version.prototype.getJarName = function () {
        return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '.jar';
    };
    Version.prototype.getArgs = function () {
        var arg = new MCArg(this.versionJson.minecraftArguments);
        var env = this.mgr.ctx;
        return arg
            .arg('version_name', this.vname)
            .arg('game_directory', env.getMCRoot())
            .arg('assets_root', env.getMCRoot() + '/assets')
            .arg('assets_index_name', this.versionJson.assets)
            .arg('version_type', this.versionJson.type);
    };
    return Version;
}());

function randHex(len) {
    var ret = '';
    while (len-- > 0) {
        ret += (Math.round((Math.random() * 100)) % 16).toString(16);
    }
    return ret;
}

var authServerInfo = {
    host: 'authserver.mojang.com',
    validate: '/validate',
    login: '/authenticate',
    refresh: '/refresh',
    invalidate: '/invalidate',
    logout: '/signout'
};
var UserManager = (function () {
    function UserManager(ctx) {
        this.ctx = ctx;
        this.users = {};
        this.saveFileName = 'users.json';
    }
    UserManager.prototype.loadFromFile = function () {
        return __awaiter(this, void 0, void 0, function () {
            var fn, cela, us, _a, _b, name, u;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        fn = this.ctx.getLauncherDir() + '/' + this.saveFileName;
                        cela = this;
                        return [4, fileExists(fn)];
                    case 1:
                        if (!_c.sent()) return [3, 3];
                        cela.ctx.log.i('user file exists, reading');
                        _b = (_a = JSON).parse;
                        return [4, readFile$1(fn)];
                    case 2:
                        us = _b.apply(_a, [_c.sent()]);
                        for (name in us) {
                            u = us[name];
                            cela.users[name] = new MojangUser(u);
                        }
                        cela.ctx.log.i('done loading users');
                        return [3, 4];
                    case 3:
                        cela.ctx.log.i('user file not exists, skipping');
                        _c.label = 4;
                    case 4: return [2, true];
                }
            });
        });
    };
    UserManager.prototype.save = function () {
        return __awaiter(this, void 0, void 0, function () {
            var fn, log;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        fn = this.ctx.getLauncherDir() + '/' + this.saveFileName;
                        log = this.ctx.log;
                        return [4, writeFile$1(fn, JSON.stringify(this.users))];
                    case 1:
                        _a.sent();
                        log.v('user file saved');
                        return [2, true];
                }
            });
        });
    };
    UserManager.prototype.legacyUser = function (uname) {
        return new LegacyUser(uname);
    };
    UserManager.prototype.mojangUser = function (email) {
        return this.users[email] || new MojangUser({ email: email });
    };
    UserManager.prototype.getUser = function (email) {
        return this.users[email];
    };
    UserManager.prototype.addMojangUser = function (u) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.users[u.email] = u;
                return [2, this.save()];
            });
        });
    };
    UserManager.prototype.logoutUser = function (u, getPass) {
        return __awaiter(this, void 0, void 0, function () {
            function logout2(pass$$1) {
                return __awaiter(this, void 0, void 0, function () {
                    var res;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4, httpsPost(authServerInfo.host, authServerInfo.logout, {
                                    username: u.email,
                                    password: pass$$1
                                })];
                            case 1:
                                res = _a.sent();
                                if (res !== '') {
                                    throw JSON.parse(res).errorMessage;
                                }
                                return [2, true];
                        }
                    });
                });
            }
            var cela, log, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        cela = this;
                        log = this.ctx.log;
                        return [4, u.validAndRefresh(this.ctx)];
                    case 1:
                        if (!_b.sent()) return [3, 3];
                        log.i('user is valid, logging out');
                        return [4, u.logout()];
                    case 2:
                        _b.sent();
                        log.i('successfully logged out');
                        delete cela.users[u.email];
                        return [3, 6];
                    case 3:
                        log.i('user is not valid, logging out using password');
                        _a = logout2;
                        return [4, getPass()];
                    case 4: return [4, _a.apply(void 0, [_b.sent()])];
                    case 5:
                        _b.sent();
                        log.i('successfully logged out');
                        delete cela.users[u.email];
                        _b.label = 6;
                    case 6: return [2, cela.save()];
                }
            });
        });
    };
    return UserManager;
}());
var User = (function () {
    function User() {
    }
    User.prototype.initArg = function (arg) {
        arg
            .arg('user_type', this.getType())
            .arg('auth_player_name', this.getName())
            .arg('auth_uuid', this.getUUID())
            .arg('auth_access_token', this.getToken());
    };
    return User;
}());
var LegacyUser = (function (_super) {
    __extends(LegacyUser, _super);
    function LegacyUser(name) {
        var _this = _super.call(this) || this;
        _this.name = name;
        return _this;
    }
    LegacyUser.prototype.getType = function () { return 'legacy'; };
    LegacyUser.prototype.getName = function () { return this.name; };
    LegacyUser.prototype.getUUID = function () { return '{}'; };
    LegacyUser.prototype.getToken = function () { return '{}'; };
    return LegacyUser;
}(User));
var MojangUser = (function (_super) {
    __extends(MojangUser, _super);
    function MojangUser(u) {
        var _this = _super.call(this) || this;
        _this.email = u.email;
        _this.accessToken = u.accessToken || '';
        _this.clientToken = u.clientToken || randHex(32);
        _this.profiles = u.profiles || [];
        _this.selectedProfile = u.selectedProfile || null;
        _this.user = u.user || {
            id: '',
            properties: {}
        };
        return _this;
    }
    MojangUser.prototype.getType = function () { return 'mojang'; };
    MojangUser.prototype.getName = function () { return this.selectedProfile.name; };
    MojangUser.prototype.getUUID = function () { return this.selectedProfile.id; };
    MojangUser.prototype.getToken = function () { return this.accessToken; };
    MojangUser.prototype.needsLogin = function () { return this.accessToken === ''; };
    MojangUser.prototype.login = function (pass$$1, version) {
        if (version === void 0) { version = '1.0'; }
        return __awaiter(this, void 0, void 0, function () {
            var cela, resRaw, res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cela = this;
                        return [4, httpsPost(authServerInfo.host, authServerInfo.login, {
                                username: this.email,
                                password: pass$$1,
                                clientToken: this.clientToken,
                                agent: { name: 'Minecraft', version: version },
                                requestUser: true
                            })];
                    case 1:
                        resRaw = _a.sent();
                        res = JSON.parse(resRaw);
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
                        return [2, true];
                }
            });
        });
    };
    MojangUser.prototype.validate = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cela, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        
                        _a = '';
                        return [4, httpsPost(authServerInfo.host, authServerInfo.validate, {
                                clientToken: this.clientToken,
                                accessToken: this.accessToken
                            })];
                    case 1: return [2, _a === (_b.sent())];
                }
            });
        });
    };
    MojangUser.prototype.validAndRefresh = function (ctx) {
        return __awaiter(this, void 0, void 0, function () {
            var log;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        log = ctx.log;
                        
                        if (this.needsLogin()) {
                            log.i('user has not logged in');
                            return [2, false];
                        }
                        log.i('checking user validity');
                        return [4, this.validate()];
                    case 1:
                        if (!!(_a.sent())) return [3, 3];
                        log.i('user not valid, refreshing');
                        return [4, this.refresh()];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [2, true];
                }
            });
        });
    };
    MojangUser.prototype.makeValid = function (ctx, version, getPass) {
        return __awaiter(this, void 0, void 0, function () {
            function login1() {
                return __awaiter(this, void 0, void 0, function () {
                    var pass$$1;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0: return [4, getPass()];
                            case 1:
                                pass$$1 = _a.sent();
                                log.i('logging in');
                                return [4, cela.login(pass$$1, version)];
                            case 2:
                                _a.sent();
                                log.i('logging in successful');
                                return [2, true];
                        }
                    });
                });
            }
            var log, cela;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        log = ctx.log;
                        cela = this;
                        return [4, this.validAndRefresh(ctx)];
                    case 1:
                        if (_a.sent()) {
                            log.i('user is valid');
                        }
                        else {
                            log.i('user is invalid, login required');
                            return [2, login1()];
                        }
                        return [2, true];
                }
            });
        });
    };
    MojangUser.prototype.refresh = function () {
        return __awaiter(this, void 0, void 0, function () {
            var cela, resRaw, res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        cela = this;
                        return [4, httpsPost(authServerInfo.host, authServerInfo.refresh, {
                                clientToken: this.clientToken,
                                accessToken: this.accessToken,
                                selectedProfile: null,
                                requestUser: true
                            })];
                    case 1:
                        resRaw = _a.sent();
                        res = JSON.parse(resRaw);
                        if (res.error) {
                            throw res.errorMessage;
                        }
                        else {
                            cela.accessToken = res.accessToken;
                            cela.selectedProfile = res.selectedProfile;
                            cela.user.id = res.user.id;
                            cela.user.properties = res.user.properties;
                        }
                        return [2, true];
                }
            });
        });
    };
    MojangUser.prototype.logout = function () {
        return __awaiter(this, void 0, void 0, function () {
            var res;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4, httpsPost(authServerInfo.host, authServerInfo.invalidate, {
                            accessToken: this.accessToken,
                            clientToken: this.clientToken
                        })];
                    case 1:
                        res = _a.sent();
                        if (res === '') {
                            return [2, null];
                        }
                        else {
                            throw JSON.parse(res).errorMessage;
                        }
                        return [2];
                }
            });
        });
    };
    return MojangUser;
}(User));

function prepareDirs(ctx) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4, mkdirIfNotExists(ctx.getMCRoot(), null)];
                case 1:
                    _a.sent();
                    return [4, mkdirIfNotExists(ctx.getLauncherDir(), null)];
                case 2:
                    _a.sent();
                    return [2];
            }
        });
    });
}

function launch(ctx, opt) {
    return __awaiter(this, void 0, void 0, function () {
        function launch1() {
            return __awaiter(this, void 0, void 0, function () {
                var vmgr, umgr, user, user2, v, mcargs, jars, cmd;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            vmgr = new VersionManager(ctx);
                            umgr = new UserManager(ctx);
                            return [4, prepareDirs(ctx)];
                        case 1:
                            _a.sent();
                            return [4, umgr.loadFromFile()];
                        case 2:
                            _a.sent();
                            if (!opt.legacy) return [3, 3];
                            user = umgr.legacyUser(opt.uname);
                            return [3, 6];
                        case 3:
                            user2 = umgr.mojangUser(opt.uname);
                            return [4, user2.makeValid(ctx, opt.version, function () {
                                    return ctx.readInput("password for " + user2.email + ":", true);
                                })];
                        case 4:
                            _a.sent();
                            return [4, umgr.addMojangUser(user2)];
                        case 5:
                            _a.sent();
                            user = user2;
                            _a.label = 6;
                        case 6: return [4, vmgr.getVersion(opt.version)];
                        case 7:
                            v = _a.sent();
                            mcargs = v.getArgs();
                            jars = v.getJars();
                            jars.push(v.getJarName());
                            user.initArg(mcargs);
                            log.i('generating arguments');
                            cmd = [
                                'java',
                                "-Xincgc",
                                '-XX:-UseAdaptiveSizePolicy',
                                '-XX:-OmitStackTraceInFastThrow',
                                '-Xmn128m',
                                '-Xmx2048M',
                                '-Djava.library.path=' + v.getNativeDir(),
                                '-Duser.home=' + ctx.config.home,
                                '-cp ' + jars.join(':'),
                                v.getMainClass(),
                                mcargs.toString()
                            ];
                            log.i('launching game');
                            return [4, exec$1(cmd.join(' '), process.stdout, process.stderr)];
                        case 8:
                            _a.sent();
                            log.i('game quit');
                            return [2];
                    }
                });
            });
        }
        var log, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!opt.uname) {
                        throw new Error('user name not present');
                    }
                    if (!opt.version) {
                        throw new Error('version not given');
                    }
                    opt.legacy = !!opt.legacy;
                    log = ctx.log;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4, launch1()];
                case 2:
                    _a.sent();
                    return [3, 4];
                case 3:
                    e_1 = _a.sent();
                    log.e(e_1);
                    return [3, 4];
                case 4: return [2];
            }
        });
    });
}

function logout(ctx, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var log, umgr, user, msg_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    log = ctx.log;
                    umgr = new UserManager(ctx);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 5, , 6]);
                    return [4, prepareDirs(ctx)];
                case 2:
                    _a.sent();
                    return [4, umgr.loadFromFile()];
                case 3:
                    _a.sent();
                    user = umgr.mojangUser(opts.uname);
                    return [4, umgr.logoutUser(user, function () {
                            return ctx.readInput("password for " + user.email + ":", true);
                        })];
                case 4:
                    _a.sent();
                    return [3, 6];
                case 5:
                    msg_1 = _a.sent();
                    log.e(msg_1);
                    return [3, 6];
                case 6: return [2];
            }
        });
    });
}

var Log = (function () {
    function Log(c) {
        this.c = c;
    }
    Log.prototype.i = function (s) {
        this.c.log('[jmcl/INFO] ' + s);
    };
    Log.prototype.v = function (s) {
        this.c.log('[jmcl/VERBOSE] ' + s);
    };
    Log.prototype.e = function (s) {
        this.c.log('[jmcl/ERR] ' + s);
    };
    Log.prototype.w = function (s) {
        this.c.log('[jmcl/WARN] ' + s);
    };
    return Log;
}());

var Context = (function () {
    function Context(console) {
        this.console = console;
        this.config = {
            launcherRoot: '.jmcl',
            home: '/home/cfy',
            mcRoot: '.minecraft',
            launcherMetaURL: 'launchermeta.mojang.com'
        };
        this.log = new Log(console);
    }
    Context.prototype.getMCRoot = function () {
        return this.config.home + "/" + this.config.mcRoot;
    };
    Context.prototype.getVersionDir = function (vname) {
        return this.config.home + "/" + this.config.mcRoot + "/versions/" + vname;
    };
    Context.prototype.getLauncherDir = function () {
        return this.config.home + "/" + this.config.mcRoot + "/" + this.config.launcherRoot;
    };
    Context.prototype.readInput = function (q, hidden) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2, input(q, hidden)];
            });
        });
    };
    return Context;
}());

exports.launch = launch;
exports.logout = logout;
exports.Context = Context;
//# sourceMappingURL=jmcl.js.map
