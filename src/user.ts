import { Context } from './mcenv';
import { randHex } from './util';
// import * as p from './promise';
import { LegacyMCArg, MCArg } from './mcarg';
import * as pathd from 'path';
import { URL } from 'url';
import { httpsGet, httpsPost } from './ajax';
import { readFile, exists, writeFile, chmod } from './fsx';
import { createMSACredential, fetchProfile, MSACredential, getAccessToken as getMSAAccessToken } from './msa';
import { Log } from './log';

const authServerInfo = {
    host: 'https://authserver.mojang.com',
    validate: '/validate',
    login: '/authenticate',
    refresh: '/refresh',
    invalidate: '/invalidate',
    logout: '/signout'
};

export class UserManager {
    users: {[s: string]: User} = {};
    saveFileName = 'users.json';
    constructor(public ctx: Context){}
    async loadFromFile(){
        let fn = pathd.join(this.ctx.getLauncherDir(), this.saveFileName);
        if(await exists(fn)){
            this.ctx.log.v('user file exists, reading');
            var us = JSON.parse(await readFile(fn)) as {[s: string]: UserStorageData};
            for(var name in us){
                var u = us[name];
                this.users[name] = User.fromUserStorage(u);
            }
            this.ctx.log.v('done loading users');
        } else {
            this.ctx.log.v('user file not exists, skipping');
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
    static createUser(email: string, type: string): User {
        switch (type){
            case 'yggdrasil': return new MojangUser({type, email});
            case 'microsoft': return new XBoxUser({type, email});
            default: return null;
        }
    }
    forEach(consumer: (id: string, u: User) => any) {
        for (const id in this.users) {
            consumer(id, this.users[id]);
        }
    }
    getUser(id: string): User {
        const u = this.users[id];
        if (u === void 0) {
            return null;
        } else return u;
    }
    addUser(id: string, u: User){
        this.users[id] = u;
        return this.save();
    }
    removeUser(id: string): User {
        const u = this.users[id];
        delete this.users[id];
        return u;
    }
}

export abstract class User {
    abstract getType(): string;
    abstract getName(): string;
    abstract getAccountName(): string;
    abstract getUUID(): string;
    abstract getToken(): string;
    abstract serialize(): UserStorageData;

    abstract makeValid(getPass: () => Promise<string>, saveUser: () => Promise<void>, logger: Log): Promise<void>;
    abstract logout(): Promise<void>;

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
            case "microsoft": return new XBoxUser(data);
            default: return null;
        }
    }
}

class OfflineUser extends User{
    async makeValid(getPass: () => Promise<string>): Promise<void> {
    }
    getAccountName(): string {
        return this.name;
    }
    serialize(): UserStorageData {
        throw new Error('Unreachable.');
    }
    async logout(): Promise<void> {
    }

    constructor(public name: string){ super(); }
    getType(){ return 'legacy'; }
    getName(){ return this.name; }
    getUUID(){ return '{}'; }
    getToken(){ return '{}'; }
}
export interface UserProfile {
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
    profile?: UserProfile;
    credential?: MSACredential;
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
    getAccountName(): string {
        return this.email;
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
    async makeValid(getPass: () => Promise<string>, saveUser: () => Promise<void>, logger: Log): Promise<void> {
        logger.i('checking user validity');
        if (!await this.validate()) {
            logger.i('user not valid, refreshing');
            await this.refresh().catch(async (err) => {
                return this.login(await getPass());
            });
        } else {
            logger.i('user is valid');
        }
    }
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
        } else {
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
        } else {
            cela.accessToken = res.accessToken;
            // cela.profiles = res.availableProfiles;
            cela.selectedProfile = res.selectedProfile;
            cela.user.id = res.user.id;
            cela.user.properties = res.user.properties;
        }
    }
    async logout(){
        const res = await httpsPost(new URL(authServerInfo.host + authServerInfo.invalidate), {
            accessToken: this.accessToken,
            clientToken: this.clientToken
        });
        if(res !== ''){
            throw new Error("Failed to logout: " + JSON.parse(res).errorMessage);
        }
        this.accessToken = null;
        this.clientToken = null;
        this.selectedProfile = null;
        this.user = null;
        this.profiles = null;
    }
}

class XBoxUser extends User {
    email: string;
    credential: MSACredential;
    profile: UserProfile;

    getAccountName(): string {
        return this.email;
    }
    serialize(): UserStorageData {
        return {
            type: 'microsoft',
            email: this.email,
            profile: this.profile,
            credential: this.credential,
        };
    }
    async makeValid(getPass: () => Promise<string>, saveUser: () => Promise<void>, logger: Log): Promise<void> {
        if (!this.credential) {
            this.credential = createMSACredential();
        }
        const accessToken = await getMSAAccessToken(this.credential, { logger, saveUser });
        logger.i('fetching profile');
        this.profile = await fetchProfile(accessToken.data);
    }
    async logout(): Promise<void> {
        // TODO: how to invalidate all tokens?
        this.credential = null;
        this.profile = null;
    }
    getType() { return "microsoft"; }
    getName(): string {
        return this.profile?.name;
    }
    getUUID(): string {
        return this.profile.id;
    }
    getToken(): string {
        return this.credential.accessToken.data;
    }

    constructor(data: XBoxUserStorageData){
        super();
        this.credential = data.credential ?? null;
        this.email = data.email;
        this.profile = data.profile ?? null;
    }
}