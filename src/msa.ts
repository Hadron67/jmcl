import { PublicClientApplication } from "@azure/msal-node";
import { URL } from "url";
import { httpsGet, httpsPost } from "./ajax";
import { Log } from "./log";
import { UserProfile } from "./user";

const XSTSRelyingParty = 'rp://api.minecraftservices.com/';
const xboxAuthServerInfo = {
    host: "https://api.minecraftservices.com/authentication",
    logWithXBox: '/login_with_xbox',
    entitlements: '/mcstore',
    profile: '/profile'
};
const xboxLiveAuth = 'https://user.auth.xboxlive.com/user/authenticate';
const xstsAuth = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const loginWithXboxPath = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const HEADERS = { 'User-Agent': 'jmcl' };

function parseJson(ret: string) {
    return JSON.parse(ret);
}

function getNow(): number {
    return (new Date().valueOf() / 1000) | 0;
}

export interface TimedToken {
    expiresOn: number;
    data: string;
}

interface XBLToken {
    expiresOn: number;
    token: string;
    userHash: string;
}

export interface MSACredential {
    MSAToken: TimedToken;
    xblToken: XBLToken;
    xstsToken: TimedToken;
    accessToken: TimedToken;
    cache: { msToken: any, xblToken: any };
}

function getRefreshToken(self: MSACredential, clientId: string): string {
    const tokens = self.cache.msToken?.RefreshTokens;
    if (!tokens) return null;
    for (const key in tokens) {
        if (tokens[key].client_id === clientId) return tokens[key].secret;
    }
    return null;
}

export function createMSACredential(): MSACredential {
    return { MSAToken: null, accessToken: null, xblToken: null, xstsToken: null, cache: { msToken: {}, xblToken: null } };
}

async function validateMSAToken(self: MSACredential, logger: Log) {
    if (self.MSAToken === null) {
        // const clientId = "000000004C12AE6F";
        const clientId = '389b1b32-b5d5-43b2-bddc-84ce938d6737';
        const scopes = ['XboxLive.signin', 'offline_access'];

        const pca = new PublicClientApplication({
            auth: {
                clientId,
                authority: 'https://login.microsoftonline.com/consumers',
            },
            cache: {
                // cache plugin is required to retrieve refresh token
                cachePlugin: {
                    async beforeCacheAccess(ctx) {
                        ctx.tokenCache.deserialize(JSON.stringify(self.cache.msToken));
                    },
                    async afterCacheAccess(ctx) {
                        if (ctx.cacheHasChanged) {
                            self.cache.msToken = JSON.parse(ctx.tokenCache.serialize());
                        }
                    }
                }
            }
        });
        if (!self.cache.msToken) {
            self.cache.msToken = {};
        }
        const refreshToken = getRefreshToken(self, clientId);
        if (refreshToken !== null) {
            logger.i("trying to refresh MSA");
            const res = await pca.acquireTokenByRefreshToken({ scopes, refreshToken }).catch(e => {
                logger.w(`Failed to refresh: ${e}`);
                return null;
            });
            if (res !== null) {
                logger.i('Got MSA token');
                self.MSAToken = {
                    expiresOn: res.expiresOn.valueOf(),
                    data: res.accessToken,
                };
                return;
            }
        }
        const res = await pca.acquireTokenByDeviceCode({
            scopes,
            deviceCodeCallback(response) {
                logger.i('Authentication required');
                logger.i(response.message);
            }
        });
        self.MSAToken = {
            expiresOn: (res.expiresOn.valueOf() / 1000) | 0,
            data: res.accessToken,
        };
    }
}

async function doXBLAuth(accessToken: string): Promise<XBLToken> {
    const res = await httpsPost(new URL(xboxLiveAuth), {
        Properties: {
            AuthMethod: "RPS",
            SiteName: "user.auth.xboxlive.com",
            RpsTicket: "d=" + accessToken // your access token from step 2 here
        },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT"
    }, { Accept: 'application/json' }).then(parseJson);
    return {
        expiresOn: (new Date(res.NotAfter).valueOf() / 1000) | 0,
        token: res.Token,
        userHash: res.DisplayClaims.xui.uhs,
    };
}

async function doXSTSAuth(xblToken: XBLToken, relyingParty: string, logger: Log): Promise<TimedToken> {
    const res = await httpsPost(new URL(xstsAuth), {
        Properties: {
            SandboxId: "RETAIL",
            UserTokens: [
                xblToken.token
            ]
        },
        RelyingParty: relyingParty,
        TokenType: "JWT"
    }).then(parseJson);
    if (res.XErr) {
        switch (res.XErr) {
            case 2148916233: logger.e('No XBox profile associated with the user, signup at https://signup.live.com/signup'); break;
            case 2148916235: logger.e('XBox Live is not available in your region'); break;
            default: logger.e(`Failed to login with XBox: ${res.Message}`);
        }
        throw new Error(res);
    } else {
        return {
            expiresOn: (new Date(res.NotAfter).valueOf() / 1000) | 0,
            data: res.Token,
        };
    }
}

async function getAccessToken(xstsToken: string, userHash: string): Promise<TimedToken> {
    const res = await httpsPost(new URL(loginWithXboxPath), {
        identityToken: `XBL3.0 x=${userHash};${xstsToken}`
    }).then(parseJson);
    if (res.errorMessage) {
        throw new Error(res.errorMessage);
    } else {
        return {
            expiresOn: getNow() + res.expires_in,
            data: res.access_token,
        };
    }
}

export async function fetchProfile(accessToken: string): Promise<UserProfile> {
    const res = await httpsGet(new URL(xboxAuthServerInfo.host + xboxAuthServerInfo.profile), {
        Authorization: `Bearer ${accessToken}`
    }).then(parseJson);
    if (res.errorMessage) {
        throw new Error(res.errorMessage);
    } else {
        return {
            id: res.id,
            name: res.name,
        };
    }
}

export async function validateMSACredential(self: MSACredential, saveUser: () => Promise<void>, logger: Log) {
    const now = (new Date().valueOf() / 1000) | 0;

    if (self.MSAToken && self.MSAToken.expiresOn - now <= 1) self.MSAToken = null;
    if (self.xblToken && self.xblToken.expiresOn - now <= 1) self.xblToken = null;
    if (self.xstsToken && self.xstsToken.expiresOn - now <= 1) self.xstsToken = null;
    if (self.accessToken && self.accessToken.expiresOn - now <= 1) self.accessToken = null;
    await validateMSAToken(self, logger);
    await saveUser();
    if (self.xblToken === null) {
        logger.i('Logging in with XBL');
        self.xblToken = await doXBLAuth(self.MSAToken.data);
        await saveUser();
    }
    if (self.xstsToken === null) {
        logger.i('Logging in with XSTS');
        self.xstsToken = await doXSTSAuth(self.xblToken, XSTSRelyingParty, logger);
        await saveUser();
    }
    if (self.accessToken === null) {
        logger.i('Obtaining access token');
        self.accessToken = await getAccessToken(self.xstsToken.data, self.xblToken.userHash);
        await saveUser();
    }
}