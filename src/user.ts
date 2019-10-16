import { Context } from './mcenv';
import { randHex } from './util';
import * as p from './promise';
import { LegacyMCArg, MCArg } from './mcarg';
import * as pathd from 'path';

const authServerInfo = {
    host: 'authserver.mojang.com',
    validate: '/validate',
    login: '/authenticate',
    refresh: '/refresh',
    invalidate: '/invalidate',
    logout: '/signout'
};
export class UserManager{
    users: {[s: string]: MojangUser} = {};
    saveFileName = 'users.json';
    constructor(public ctx: Context){}
    async loadFromFile(){
        // var fn = this.ctx.getLauncherDir() + '/' + this.saveFileName;
        let fn = pathd.join(this.ctx.getLauncherDir(), this.saveFileName);
        // var cela = this;
        if(await p.fileExists(fn)){
            this.ctx.log.i('user file exists, reading');
            var us = JSON.parse(await p.readFile(fn)) as {[s: string]: MojangUserData};
            for(var name in us){
                var u = us[name];
                this.users[name] = new MojangUser(u);
            }
            this.ctx.log.i('done loading users');
        }
        else {
            this.ctx.log.i('user file not exists, skipping');
        }
        return true;
    }
    async save(){
        let fn = pathd.join(this.ctx.getLauncherDir(), this.saveFileName);
        let log = this.ctx.log;
        await p.writeFile(fn, JSON.stringify(this.users));
        log.v('user file saved');
        return true;
    }
    getOfflineUser(uname: string){
        // offline users neednt be saved.
        return new OfflineUser(uname);
    }
    getMojangUser(email: string): MojangUser{
        return this.users[email] || new MojangUser({email: email});
    }
    getUser(email: string): MojangUser{
        return this.users[email];
    }
    async addMojangUser(u: MojangUser){
        this.users[u.email] = u;
        return this.save();
    }
    async logoutUser(u: MojangUser, getPass: () => Promise<string>){
        var cela = this;
        var log = this.ctx.log;
        if(await u.validAndRefresh(this.ctx)){
            log.i('user is valid, logging out');
            await u.logout();
        }
        else {
            log.i('user is not valid, logging out using password');
            let res = await p.httpsPost(authServerInfo.host, authServerInfo.logout, {
                username: u.email,
                password: await getPass()
            });
            if (res !== ''){
                throw JSON.parse(res).errorMessage;
            }
        }
        log.i('successfully logged out');
        delete cela.users[u.email];
        return cela.save();
    }
}

export abstract class User {
    abstract getType(): string;
    abstract getName(): string;
    abstract getUUID(): string;
    abstract getToken(): string;
    initArg(arg: MCArg){
        arg
            .arg('user_type', this.getType())
            .arg('auth_player_name', this.getName())
            .arg('auth_uuid', this.getUUID())
            .arg('auth_access_token', this.getToken());
    }
}

class OfflineUser extends User{
    constructor(public name: string){ super(); }
    getType(){ return 'legacy'; }
    getName(){ return this.name; }
    getUUID(){ return '{}'; }
    getToken(){ return '{}'; }
}
interface UserProfile {
    id: string;
    name: string;
}
interface MojangUserData {
    email: string;
    accessToken?: string;
    clientToken?: string;
    profiles?: UserProfile[];
    selectedProfile?: UserProfile;
    user?: {id: string, properties: {[s: string]: string}};
}
class MojangUser extends User{
    email: string;
    accessToken: string;
    clientToken: string;
    profiles: UserProfile[];
    selectedProfile: UserProfile;
    user: {id: string, properties: {[s: string]: string}};

    constructor(u: MojangUserData){
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
    getType(){ return 'mojang'; }
    getName(){ return this.selectedProfile.name; }
    getUUID(){ return this.selectedProfile.id; }
    getToken(){ return this.accessToken; }
    needsLogin(){ return this.accessToken === ''; }
    async login(pass: string, version: string = '1.0'){
        var cela = this;
        var resRaw = await p.httpsPost(authServerInfo.host, authServerInfo.login, {
            username: this.email,
            password: pass,
            clientToken: this.clientToken,
            agent: { name: 'Minecraft', version },
            requestUser: true
        });
        var res = JSON.parse(resRaw);
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
        return true;
    }
    async validate(){
        var cela = this;
        return '' === await p.httpsPost(authServerInfo.host, authServerInfo.validate, {
            clientToken: this.clientToken,
            accessToken: this.accessToken
        });
    }
    async validAndRefresh(ctx: Context){
        var log = ctx.log;
        var cela = this;
        if(this.needsLogin()){
            log.i('user has not logged in');
            return false;
        }
        log.i('checking user validity');
        if(!await this.validate()){
            log.i('user not valid, refreshing');
            await this.refresh();
        }
        return true;
    }
    async makeValid(ctx: Context, version: string, getPass: () => Promise<string>){
        var log = ctx.log;
        if(await this.validAndRefresh(ctx)){
            log.i('user is valid');
        }
        else {
            log.i('user is invalid, login required');
            let pass = await getPass();
            log.i('logging in');
            await this.login(pass, version);
            log.i('logging in successfull');
        }
        return true;
    }
    async refresh(){
        var cela = this;
        var resRaw = await p.httpsPost(authServerInfo.host, authServerInfo.refresh, {
            clientToken: this.clientToken,
            accessToken: this.accessToken,
            selectedProfile: null, //this.selectedProfile,
            requestUser: true
        });

        var res = JSON.parse(resRaw);
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
        return true;
    }
    async logout(){
        var res = await p.httpsPost(authServerInfo.host, authServerInfo.invalidate, {
            accessToken: this.accessToken,
            clientToken: this.clientToken
        });
        if(res === ''){
            return null;
        }
        else {
            throw JSON.parse(res).errorMessage;
        }
    }
    
}
