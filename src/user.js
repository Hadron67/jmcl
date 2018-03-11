import fs from 'fs';
import { Context } from './mcenv';
import { randHex } from './util';
import * as p from './promise';

const authServerInfo = {
    host: 'authserver.mojang.com',
    validate: '/validate',
    login: '/authenticate',
    refresh: '/refresh',
    invalidate: '/invalidate',
    logout: '/signout'
};

export function UserManager(ctx){
    // this.root = mcroot;
    this.ctx = ctx;
    /** @type{Object.<string, MojangUser>} */
    this.users = {};
    this.saveFileName = 'users.json';
}
UserManager.prototype.loadFromFile = function(){
    var fn = this.ctx.getLauncherDir() + '/' + this.saveFileName;
    var cela = this;
    return p.fileExists(fn)
    .then(function(exi){
        if(exi){
            cela.ctx.log.i('user file exists, reading');
            return p.readFile(fn)
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
}
UserManager.prototype.save = function(){
    var fn = this.ctx.getLauncherDir() + '/' + this.saveFileName;
    var log = this.ctx.log;
    return p.writeFile(fn, JSON.stringify(this.users))
    .then(function(){
        log.v('user file saved');
    });
}
UserManager.prototype.legacyUser = function(uname){
    // legacy users neednt be saved.
    return new LegacyUser(uname);
}
UserManager.prototype.mojangUser = function(email){
    return this.users[email] || new MojangUser({email: email});
}
UserManager.prototype.getUser = function(email){
    return this.users[email];
}
UserManager.prototype.addMojangUser = function(u){
    this.users[u.email] = u;
    return this.save();
}
UserManager.prototype.logoutUser = function(u, getPass){
    function logout2(pass){
        return p.httpsRequest(authServerInfo.host, authServerInfo.logout, {
            username: u.email,
            password: pass
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
        .then(function(pass){
            return logout2(pass);
        })
        .then(function(){
            log.i('successfully logged out');
            delete cela.users[u.email];
            return cela.save();
        });
    });
}

function User(){}
User.prototype.initArg = function(arg){
    arg
        .arg('user_type', this.getType())
        .arg('auth_player_name', this.getName())
        .arg('auth_uuid', this.getUUID())
        .arg('auth_access_token', this.getToken())
}

function LegacyUser(name){
    User.call(this);
    this.name = name;
}
LegacyUser.prototype = Object.create(User.prototype);
LegacyUser.prototype.constructor = LegacyUser;

LegacyUser.prototype.getType = function(){ return 'legacy'; }
LegacyUser.prototype.getName = function(){ return this.name; }
LegacyUser.prototype.getUUID = function(){ return '{}'; }
LegacyUser.prototype.getToken = function(){ return '{}'; }

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

MojangUser.prototype.getType = function(){ return 'mojang'; }
MojangUser.prototype.getName = function(){ return this.selectedProfile.name; }
MojangUser.prototype.getUUID = function(){ return this.selectedProfile.id; }
MojangUser.prototype.getToken = function(){ return this.accessToken; }
MojangUser.prototype.needsLogin = function(){
    return this.accessToken === '';
}
MojangUser.prototype.login = function(pass, version){
    var cela = this;
    return p.httpsRequest(authServerInfo.host, authServerInfo.login, {
        username: this.email,
        password: pass,
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
}
MojangUser.prototype.validate = function(){
    var cela = this;
    return p.httpsRequest(authServerInfo.host, authServerInfo.validate, {
        clientToken: this.clientToken,
        accessToken: this.accessToken
    })
    .then(function(res){
        return res === '';
    });
}
MojangUser.prototype.validAndRefresh = function(ctx){
    var log = ctx.log;
    var cela = this;
    if(this.needsLogin()){
        return p.reject('user has not logged in');
    }
    log.i('checking user validity');
    return this.validate()
    .then(function(valid){
        if(!valid) {
            log.i('user not valid, refreshing');
            return cela.refresh();
        }
    });
}
MojangUser.prototype.makeValid = function(ctx, version, getPass){
    var log = ctx.log;
    var cela = this;
    function login1(){
        return getPass()
        .then(function(pass){
            log.i('logging in');
            return cela.login(pass, version);
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
}
MojangUser.prototype.refresh = function(){
    var cela = this;
    return p.httpsRequest(authServerInfo.host, authServerInfo.refresh, {
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
}
MojangUser.prototype.logout = function(){
    return p.httpsRequest(authServerInfo.host, authServerInfo.invalidate, {
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
}
