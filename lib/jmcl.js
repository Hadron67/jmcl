'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fs = _interopDefault(require('fs'));
var cpc = _interopDefault(require('child_process'));
var https = _interopDefault(require('https'));
var readline = _interopDefault(require('readline'));
var stream = require('stream');

function pass(arg){
    return new Promise(function(acc, reject){
        acc(arg);
    });
}
function reject(reason){
    return new Promise(function(acc, reject){
        reject(reason);
    });
}
function fileExists(fn){
    return new Promise(function(acc, reject){
        fs.exists(fn, function(exi){
            acc(exi);
        });
    });
}
function mkdir(path, mask){
    return new Promise(function(acc, rej){
        fs.mkdir(path, mask, function(err){
            err ? rej(err) : acc();
        });
    });
}
function mkdirIfNotExists(path, mask){
    return fileExists(path)
        .then(function(exi){
            if(!exi){
                return mkdir(path, mask);
            }
        });
}
function readFile(fn){
    return new Promise(function(acc, reject){
        fs.readFile(fn, function(err, data){
            err ? reject(err) : acc(data.toString());
        });
    });
}
function writeFile(fn, s){
    return new Promise(function(acc, reject){
        fs.writeFile(fn, s, function(err){
            err ? reject(err) : acc();
        });
    });
}
function exec(cmd, stdout, stderr){
    return new Promise(function(acc, reject){
        var pr = cpc.exec(cmd, function(err, stdout, stderr){
            err ? reject(err) : acc();
        });
        pr.stdout.pipe(stdout);
        pr.stderr.pipe(stderr);
    });
}
function httpsRequest(host, path, data){
    var postBody = JSON.stringify(data);
    var opt = {
        host: host,
        port: 443,
        path: path,
        method: 'POST',
        headers : {
            'Content-Type': 'application/json',
            'Content-Length': postBody.length
        }
    };
    return new Promise(function(acc, rej){
        var data = '';
        var req = https.request(opt, function(res){
            res.setEncoding('utf-8');
            res.on('data', function(d){
                data += d;
            });
            res.on('end', function(){
                acc(data);
            });
        });
        req.on('error', function(e){
            rej(e);
        });
        req.write(postBody);
        req.end();
    });
}
function input(question, hidden){
    var mutableStdout = new stream.Writable({
        write: function(chunk, encoding, callback) {
            if (this.muted)
                process.stdout.write(chunk, encoding);
            callback();
        }
    });
    var rl = readline.createInterface({
        input: process.stdin,
        output: !!hidden ? mutableStdout : process.stdout,
        terminal: true
    });
    return new Promise(function(acc, rej){
        mutableStdout.muted = true;
        rl.question(question, function(answer){
            console.log('');
            rl.close();
            acc(answer);
        });
        mutableStdout.muted = false;
    });
}

function Log(c){
    this.c = c;
}
Log.prototype.i = function(s){
    this.c.log('[jmcl/INFO] ' + s);
};

Log.prototype.v = function(s){
    this.c.log('[jmcl/VERBOSE] ' + s);
};

Log.prototype.e = function(s){
    this.c.log('[jmcl/ERR] ' + s);
};

Log.prototype.w = function(s){
    this.c.log('[jmcl/WARN] ' + s);
};
// export default {
//     i: function(s){
//         console.log('[jmcl/INFO] ' + s);
//     },
    
//     v: function(s){
//         console.log('[jmcl/VERBOSE] ' + s);
//     },
    
//     e: function(s){
//         console.log('[jmcl/ERR] ' + s);
//     },
    
//     w: function(s){
//         console.log('[jmcl/WARN] ' + s);
//     }

// }

function Context(console){
    this.launcherRoot = '.jmcl';
    this.home = '/home/cfy';
    this.mcRoot = '.minecraft';

    this.console = console;
    this.log = new Log(console);
}
Context.prototype.getMCRoot = function(){
    return this.home + '/' + this.mcRoot;    
};
Context.prototype.getVersionDir = function(vname){
    return this.home + '/' + this.mcRoot + '/versions/' + vname;
};
Context.prototype.getLauncherDir = function(){
    return this.home + '/' + this.mcRoot + '/' + this.launcherRoot;
};
Context.prototype.readInput = function(q, hidden){
    return input(q, hidden);
};

function MCArg(temp){
    this.argTemp = temp;
    this.argv = {};
}
MCArg.prototype.arg = function(name, v){
    this.argv[name] = v;
    return this;
};
MCArg.prototype.toString = function(){
    var ret = this.argTemp;
    for(var name in this.argv){
        ret = ret.replace('${' + name + '}', this.argv[name]);
    }
    return ret;
};

function VersionManager(ctx){
    this.versions = {};
    this.ctx = ctx;
}
VersionManager.prototype.getVersion = function(vname){
    //this.ctx.log.v('getting version');
    var ret = this.versions[vname];
    var cela = this;
    if(!ret){
        var jsonPath = cela.ctx.getVersionDir(vname) + '/' + vname + '.json';
        return readFile(jsonPath)
            .then(function(data){
                //cela.ctx.log.v('got version json');
                return cela.versions[vname] = new Version(cela, vname, JSON.parse(data));
            });
    }
    else {
        return pass(ret);
    }

    // return ret;
};


function Version(mgr, vname, versionJson){
    this.mgr = mgr;
    this.vname = vname;
    this.versionJson = versionJson;
}
Version.prototype.getJars = function(){
    var libdir = this.mgr.ctx.getMCRoot() + '/libraries';
    var lib = this.versionJson.libraries;
    var ret = [];
    for(var i = 0; i < lib.length; i++){
        var name = lib[i].name;
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
};
Version.prototype.getNativeDir = function(){
    return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '-natives/';
};
Version.prototype.getMainClass = function(){
    return this.versionJson.mainClass;
};
Version.prototype.getJarName = function(){
    return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '.jar';
};
Version.prototype.getArgs = function(){
    var arg = new MCArg(this.versionJson.minecraftArguments);
    var env = this.mgr.ctx;
    return arg
            .arg('version_name', this.vname)
            .arg('game_directory', env.getMCRoot())
            .arg('assets_root', env.getMCRoot() + '/assets')
            .arg('assets_index_name', this.versionJson.assets)
            .arg('version_type', this.versionJson.type);
};

function randHex(len){
    var ret = '';
    while(len --> 0){
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

function UserManager(ctx){
    // this.root = mcroot;
    this.ctx = ctx;
    /** @type{Object.<string, MojangUser>} */
    this.users = {};
    this.saveFileName = 'users.json';
}
UserManager.prototype.loadFromFile = function(){
    var fn = this.ctx.getLauncherDir() + '/' + this.saveFileName;
    var cela = this;
    return fileExists(fn)
    .then(function(exi){
        if(exi){
            cela.ctx.log.i('user file exists, reading');
            return readFile(fn)
            .then(function(data){
                var us = JSON.parse(data);
                for(var name in us){
                    var u = us[name];
                    cela.users[name] = new MojangUser(u);
                }
                cela.ctx.log.i('done loading users');
            });
        }
        else {
            cela.ctx.log.i('user file not exists, skipping');
        }
    });
};
UserManager.prototype.save = function(){
    var fn = this.ctx.getLauncherDir() + '/' + this.saveFileName;
    var log = this.ctx.log;
    return writeFile(fn, JSON.stringify(this.users))
    .then(function(){
        log.v('user file saved');
    });
};
UserManager.prototype.legacyUser = function(uname){
    // legacy users neednt be saved.
    return new LegacyUser(uname);
};
UserManager.prototype.mojangUser = function(email){
    return this.users[email] || new MojangUser({email: email});
};
UserManager.prototype.getUser = function(email){
    return this.users[email];
};
UserManager.prototype.addMojangUser = function(u){
    this.users[u.email] = u;
    return this.save();
};
UserManager.prototype.logoutUser = function(u, getPass){
    function logout2(pass$$1){
        return httpsRequest(authServerInfo.host, authServerInfo.logout, {
            username: u.email,
            password: pass$$1
        })
        .then(function(res){
            if(res === ''){
                return;
            }
            else {
                throw JSON.parse(res).errorMessage;
            }
        })
    }
    var cela = this;
    var log = this.ctx.log;
    return u.validAndRefresh(this.ctx)
    .then(function(){
        log.i('user is valid, logging out');
        return u.logout()
        .then(function(){
            log.i('successfully logged out');
            delete cela.users[u.email];
            return cela.save();
        });
    }, function(){
        log.i('user is not valid, logging out using password');
        return getPass()
        .then(function(pass$$1){
            return logout2(pass$$1);
        })
        .then(function(){
            log.i('successfully logged out');
            delete cela.users[u.email];
            return cela.save();
        });
    });
};

function User(){}
User.prototype.initArg = function(arg){
    arg
        .arg('user_type', this.getType())
        .arg('auth_player_name', this.getName())
        .arg('auth_uuid', this.getUUID())
        .arg('auth_access_token', this.getToken());
};

function LegacyUser(name){
    User.call(this);
    this.name = name;
}
LegacyUser.prototype = Object.create(User.prototype);
LegacyUser.prototype.constructor = LegacyUser;

LegacyUser.prototype.getType = function(){ return 'legacy'; };
LegacyUser.prototype.getName = function(){ return this.name; };
LegacyUser.prototype.getUUID = function(){ return '{}'; };
LegacyUser.prototype.getToken = function(){ return '{}'; };

function MojangUser(u){
    User.call(this);

    this.email = u.email;
    this.accessToken = u.accessToken || '';
    this.clientToken = u.clientToken || randHex(32);

    /** @typedef {{id: string, name: string}} Profile */
    /** @type{Profile[]} */
    this.profiles = u.profiles || [];
    /** @type{Profile} */
    this.selectedProfile = u.selectedProfile || null;

    /** @type{{id: string, properties: Object.<string, string>}} */
    this.user = u.user || {
        id: '',
        properties: {}
    };
}
MojangUser.prototype = Object.create(User.prototype);
MojangUser.prototype.constructor = MojangUser;

MojangUser.prototype.getType = function(){ return 'mojang'; };
MojangUser.prototype.getName = function(){ return this.selectedProfile.name; };
MojangUser.prototype.getUUID = function(){ return this.selectedProfile.id; };
MojangUser.prototype.getToken = function(){ return this.accessToken; };
MojangUser.prototype.needsLogin = function(){
    return this.accessToken === '';
};
MojangUser.prototype.login = function(pass$$1, version){
    var cela = this;
    return httpsRequest(authServerInfo.host, authServerInfo.login, {
        username: this.email,
        password: pass$$1,
        clientToken: this.clientToken,
        agent: { name: 'Minecraft', version: version || '1.0' },
        requestUser: true
    })
    .then(function(res){
        res = JSON.parse(res);
        if(res.error){
            throw 'logging failed: ' + res.errorMessage;
        }
        else {
            if(res.clientToken !== cela.clientToken){
                throw 'client token changed, which shouldnt happen';
            }
            cela.accessToken = res.accessToken;
            cela.profiles = res.availableProfiles;
            cela.selectedProfile = res.selectedProfile || res.availableProfiles[0];
            cela.user.id = res.user.id;
            cela.user.properties = res.user.properties;
        }
    });
};
MojangUser.prototype.validate = function(){
    return httpsRequest(authServerInfo.host, authServerInfo.validate, {
        clientToken: this.clientToken,
        accessToken: this.accessToken
    })
    .then(function(res){
        return res === '';
    });
};
MojangUser.prototype.validAndRefresh = function(ctx){
    var log = ctx.log;
    var cela = this;
    if(this.needsLogin()){
        return reject('user has not logged in');
    }
    log.i('checking user validity');
    return this.validate()
    .then(function(valid){
        if(!valid) {
            log.i('user not valid, refreshing');
            return cela.refresh();
        }
    });
};
MojangUser.prototype.makeValid = function(ctx, version, getPass){
    var log = ctx.log;
    var cela = this;
    function login1(){
        return getPass()
        .then(function(pass$$1){
            log.i('logging in');
            return cela.login(pass$$1, version);
        })
        .then(function(){
            log.i('logging in successful');
        });
    }
    return this.validAndRefresh(ctx)
    .then(function(){
        log.i('user is valid');
    }, function(msg){
        log.w(msg);
        log.i('user is invalid, login required');
        return login1();
    });
};
MojangUser.prototype.refresh = function(){
    var cela = this;
    return httpsRequest(authServerInfo.host, authServerInfo.refresh, {
        clientToken: this.clientToken,
        accessToken: this.accessToken,
        selectedProfile: null, //this.selectedProfile,
        requestUser: true
    })
    .then(function(res){
        res = JSON.parse(res);
        if(res.error){
            throw res.errorMessage;
        }
        else {
            cela.accessToken = res.accessToken;
            // cela.profiles = res.availableProfiles;
            cela.selectedProfile = res.selectedProfile;
            cela.user.id = res.user.id;
            cela.user.properties = res.user.properties;
            // return true;
        }
    });
};
MojangUser.prototype.logout = function(){
    return httpsRequest(authServerInfo.host, authServerInfo.invalidate, {
        accessToken: this.accessToken,
        clientToken: this.clientToken
    })
    .then(function(res){
        if(res === ''){
            return null;
        }
        else {
            throw JSON.parse(res).errorMessage;
        }
    });
};

function prepareDirs(ctx){
    return mkdirIfNotExists(ctx.getMCRoot(), null)
        .then(function(){
            return mkdirIfNotExists(ctx.getLauncherDir(), null);
        });
}

function launch(ctx, opt){

    if(!opt.uname){
        throw new Error('user name not present');
    }
    if(!opt.version){
        throw new Error('version not given');
    }
    opt.legacy = !!opt.legacy;

    var log = ctx.log;

    var vmgr = new VersionManager(ctx);
    var umgr = new UserManager(ctx);

    var user;

    return prepareDirs(ctx)
    .then(function(){
        return umgr.loadFromFile();
    })
    .then(function(){
        if(opt.legacy){
            user = umgr.legacyUser(opt.uname);
        }
        else {
            user = umgr.mojangUser(opt.uname);
            return user.makeValid(ctx, opt.version, function(){
                return ctx.readInput('password for ' + user.email + ':', true);
            })
            .then(function(){
                return umgr.addMojangUser(user);
            });
        }
    })
    .then(function(){
        return vmgr.getVersion(opt.version);
    })
    .then(function(v){
        // var v = vmgr.getVersion(opt.version);
        // var user = umgr.legacyUser(opt.uname);
    
        var mcargs = v.getArgs();
        var jars = v.getJars();
        jars.push(v.getJarName());
        user.initArg(mcargs);
        
        log.i('generating arguments');
        var cmd = [
            'java',
            "-Xincgc",
            '-XX:-UseAdaptiveSizePolicy',
            '-XX:-OmitStackTraceInFastThrow',
            '-Xmn128m',
            '-Xmx2048M',
            '-Djava.library.path=' + v.getNativeDir(),
            '-Duser.home=' + ctx.home,
            '-cp ' + jars.join(':'),
            v.getMainClass(),
            mcargs.toString()
        ];
    
        log.i('launching game');
        //console.log(jvmArgs.join(' '));
        return exec(cmd.join(' '), process.stdout, process.stderr);
    })
    .then(function(){
        log.i('game quit');
    })
    .catch(function(e){
        log.e(e);
    });
}

function logout(ctx, opts){
    var log = ctx.log;

    var umgr = new UserManager(ctx);
    var user;

    return prepareDirs(ctx)
    .then(function(){
        return umgr.loadFromFile();
    })
    .then(function(){
        user = umgr.mojangUser(opts.uname);
        return umgr.logoutUser(user, function(){
            return ctx.readInput('password for ' + user.email + ':', true);
        });
    })
    .catch(function(msg){
        log.e(msg);
        // log.e(msg.stack);
    });
}

exports.launch = launch;
exports.logout = logout;
exports.Context = Context;
