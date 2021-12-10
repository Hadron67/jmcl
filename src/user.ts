import { Context } from './mcenv';
import { randHex } from './util';
// import * as p from './promise';
import { LegacyMCArg, MCArg } from './mcarg';
import * as pathd from 'path';
import { URL } from 'url';
import { httpsGet, httpsPost } from './ajax';
import { readFile, exists, writeFile, chmod } from './fsx';
import * as XboxLiveAuth from '@xboxreplay/xboxlive-auth';

const authServerInfo = {
    host: 'https://authserver.mojang.com',
    validate: '/validate',
    login: '/authenticate',
    refresh: '/refresh',
    invalidate: '/invalidate',
    logout: '/signout'
};

const XSTSRelyingParty = 'rp://api.minecraftservices.com/';
const xboxAuthServerInfo = {
    host: "https://api.minecraftservices.com/authentication",
    logWithXBox: '/login_with_xbox',
    entitlements: '/mcstore',
    profile: '/profile'
};

export class UserManager{
    users: {[s: string]: User} = {};
    saveFileName = 'users.json';
    constructor(public ctx: Context){}
    async loadFromFile(){
        let fn = pathd.join(this.ctx.getLauncherDir(), this.saveFileName);
        if(await exists(fn)){
            this.ctx.log.i('user file exists, reading');
            var us = JSON.parse(await readFile(fn)) as {[s: string]: UserStorageData};
            for(var name in us){
                var u = us[name];
                this.users[name] = User.fromUserStorage(u);
            }
            this.ctx.log.i('done loading users');
        }
        else {
            this.ctx.log.i('user file not exists, skipping');
        }
        return true;
    }
    serialize(): {[s: string]: UserStorageData} {
        let ret: {[s: string]: UserStorageData} = {};
        for (let name in this.users){
            ret[name] = this.users[name].serialize();
        }
        return ret;
    }
    async save(){
        let fn = pathd.join(this.ctx.getLauncherDir(), this.saveFileName);
        let log = this.ctx.log;
        await writeFile(fn, JSON.stringify(this.serialize()));
        await chmod(fn, 0o600);
        log.v('user file saved');
        return true;
    }
    newOfflineUser(uname: string){
        return new OfflineUser(uname);
    }
    getOrCreateUser(email: string, type: string): User {
        let ret = this.users[email];
        if (ret){
            return ret;
        } else {
            switch (type){
                case 'yggdrasil': return new MojangUser({type, email});
                case 'microsoft': return new XBoxUser({type, email});
                default: return null;
            }
        }
    }
    getUser(email: string): User {
        return this.users[email];
    }
    async addUser(id: string, u: User){
        this.users[id] = u;
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
            let res = await httpsPost(new URL(authServerInfo.host + authServerInfo.logout), {
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
    abstract serialize(): UserStorageData;

    abstract needsLogin(): boolean;
    abstract validate(): Promise<boolean>;
    abstract refresh(): Promise<void>;
    abstract login(pass: string, version: string): Promise<void>;
    abstract logout(): Promise<void>;

    async validAndRefresh(ctx: Context){
        var log = ctx.log;
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

    async makeValid(ctx: Context, version: string, getPass: () => Promise<string>): Promise<boolean>{
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

    initArg(arg: MCArg){
        arg
            .arg('user_type', this.getType())
            .arg('auth_player_name', this.getName())
            .arg('auth_uuid', this.getUUID())
            .arg('auth_access_token', this.getToken());
    }

    static fromUserStorage(data: UserStorageData): User {
        switch (data.type){
            case null:
            case void 0:
            case "yggdrasil": return new MojangUser(data);
            case "microsoft": throw 'TODO';
            default: return null;
        }
    }
}

class OfflineUser extends User{
    serialize(): UserStorageData {
        throw new Error('Unreachable.');
    }
    needsLogin(): boolean {
        return false;
    }
    async validate(): Promise<boolean> {
        return true;
    }
    async refresh(): Promise<void> {
    }
    async login(pass: string, version: string): Promise<void> {
    }
    async logout(): Promise<void> {
    }

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

type UserStorageData = MojangUserStorageData | XBoxUserStorageData;

interface MojangUserStorageData {
    type: "yggdrasil";
    email: string;
    accessToken?: string;
    clientToken?: string;
    profiles?: UserProfile[];
    selectedProfile?: UserProfile;
    user?: {id: string, properties: {[s: string]: string}};
}

interface XBoxUserStorageData {
    type: "microsoft";
    email: string;
}

class MojangUser extends User {
    email: string;
    accessToken: string;
    clientToken: string;
    profiles: UserProfile[];
    selectedProfile: UserProfile;
    user: {id: string, properties: {[s: string]: string}};
    
    constructor(u: MojangUserStorageData){
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
    serialize(): UserStorageData {
        return {
            type: 'yggdrasil',
            email: this.email,
            accessToken: this.accessToken,
            clientToken: this.clientToken,
            profiles: this.profiles,
            selectedProfile: this.selectedProfile,
            user: this.user
        }
    }
    getType(){ return 'mojang'; }
    getName(){ return this.selectedProfile.name; }
    getUUID(){ return this.selectedProfile.id; }
    getToken(){ return this.accessToken; }
    needsLogin(){ return this.accessToken === ''; }
    async login(pass: string, version: string = '1.0'){
        var cela = this;
        var resRaw = await httpsPost(new URL(authServerInfo.host + authServerInfo.login), {
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
    }
    async validate(){
        return '' === await httpsPost(new URL(authServerInfo.host + authServerInfo.validate), {
            clientToken: this.clientToken,
            accessToken: this.accessToken
        });
    }
    
    async refresh(){
        var cela = this;
        var resRaw = await httpsPost(new URL(authServerInfo.host + authServerInfo.refresh), {
            clientToken: this.clientToken,
            accessToken: this.accessToken,
            selectedProfile: null, //this.selectedProfile,
            requestUser: true
        });

        var res = JSON.parse(resRaw);
        if(res.error){
            throw new Error(`Failed to refresh: ${res.errorMessage}`);
        }
        else {
            cela.accessToken = res.accessToken;
            // cela.profiles = res.availableProfiles;
            cela.selectedProfile = res.selectedProfile;
            cela.user.id = res.user.id;
            cela.user.properties = res.user.properties;
        }
    }
    async logout(){
        var res = await httpsPost(new URL(authServerInfo.host + authServerInfo.invalidate), {
            accessToken: this.accessToken,
            clientToken: this.clientToken
        });
        if(res !== ''){
            throw new Error("Failed to logout: " + JSON.parse(res).errorMessage);
        }
    }
}

const HEADERS = { 'User-Agent': 'jmcl' };

function parseJson(ret: string){
    return JSON.parse(ret);
}

class XBoxUser extends User {
    email: string;
    userName: string;
    uuid: string;
    XSTSToken: string;
    accessToken: string;
    selectedProfile: UserProfile;
    availableProfile: UserProfile[];

    serialize(): UserStorageData {
        throw new Error('Method not implemented.');
    }
    needsLogin(): boolean {
        throw new Error('Method not implemented.');
    }
    validate(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    refresh(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    async login(pass: string, version: string): Promise<void> {
        const xauthResponse = await XboxLiveAuth.authenticate(this.email, pass, {XSTSRelyingParty});
        this.XSTSToken = xauthResponse.XSTSToken;
        const mineServiceResponse = await httpsPost(
            new URL(xboxAuthServerInfo.host + xboxAuthServerInfo.logWithXBox),
            { identityToken: `XBL3.0 x=${xauthResponse.userHash};${xauthResponse.XSTSToken}` },
            HEADERS
        ).then(parseJson);

        if (!mineServiceResponse.access_token){
            throw new Error("Invalid credential");
        }

        this.accessToken = mineServiceResponse.access_token;

        const mineEntitlements = await httpsGet(
            new URL(xboxAuthServerInfo.host + xboxAuthServerInfo.entitlements),
            {Authorization: `Bearer ${this.accessToken}`, ...HEADERS}
        ).then(parseJson);
        if (mineEntitlements.items.length === 0) throw Error('This user does not have any items on its accounts according to minecraft services.');
        
        const profile = await httpsGet(
            new URL(xboxAuthServerInfo.host + xboxAuthServerInfo.profile),
            {Authorization: `Bearer ${this.accessToken}`, ...HEADERS}
        ).then(parseJson);
        if (!profile.id) throw Error('This user does not own minecraft according to minecraft services.')
        this.uuid = profile.id;
        this.userName = profile.name;
    }
    logout(): Promise<void> {
        throw new Error('Method not implemented.');
    }
    getType() { return "microsoft"; }
    getName(): string {
        throw new Error('Method not implemented.');
    }
    getUUID(): string {
        throw new Error('Method not implemented.');
    }
    getToken(): string {
        throw new Error('Method not implemented.');
    }

    constructor(data: XBoxUserStorageData){
        super();
    }
}