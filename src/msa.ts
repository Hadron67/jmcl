import { PublicClientApplication } from "@azure/msal-node";
import { URL } from "url";
import { httpsGet, httpsPost } from "./ajax";
import { Log } from "./log";
import { UserProfile } from "./user";

const XSTS_RELYING_PARTY = 'rp://api.minecraftservices.com/';
const XBOXLIVE_AUTH_ENDPOINT = 'https://user.auth.xboxlive.com/user/authenticate';
const XSTS_AUTH_ENDPOINT = 'https://xsts.auth.xboxlive.com/xsts/authorize';
const ENDPOINT_LOGIN_WITH_XBOX = 'https://api.minecraftservices.com/authentication/login_with_xbox';
const ENDPOINT_GET_PROFILE = 'https://api.minecraftservices.com/minecraft/profile';
const HEADERS = { 'User-Agent': 'jmcl' };

function parseJson(ret: string) {
    return JSON.parse(ret);
}

function getNow(): number {
    return (new Date().valueOf() / 1000) | 0;
}

interface TimedObject {
    expiresOn: number;
}

export interface TimedToken extends TimedObject {
    data: string;
}

interface XBLToken extends TimedObject {
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
    const tokens = self.cache.msToken?.RefreshToken;
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
    const res = await httpsPost(new URL(XBOXLIVE_AUTH_ENDPOINT), {
        Properties: {
            AuthMethod: "RPS",
            SiteName: "user.auth.xboxlive.com",
            RpsTicket: "d=" + accessToken,
        },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT"
    }, { Accept: 'application/json' }).then(parseJson);
    return {
        expiresOn: (new Date(res.NotAfter).valueOf() / 1000) | 0,
        token: res.Token,
        userHash: res.DisplayClaims.xui[0].uhs,
    };
}

async function doXSTSAuth(xblToken: string, relyingParty: string, logger: Log): Promise<TimedToken> {
    const res = await httpsPost(new URL(XSTS_AUTH_ENDPOINT), {
        Properties: {
            SandboxId: "RETAIL",
            UserTokens: [
                xblToken
            ]
        },
        RelyingParty: relyingParty,
        TokenType: "JWT"
    }).then(parseJson).catch(res => {
        if (res.XErr) {
            switch (res.XErr) {
                case 2148916233: logger.e('No XBox profile associated with the user, signup at https://signup.live.com/signup'); break;
                case 2148916235: logger.e('XBox Live is not available in your region'); break;
                default: logger.e(`Failed to login with XBox: ${res.Message}`);
            }
        }
        throw new Error(res);
    });
    return {
        expiresOn: (new Date(res.NotAfter).valueOf() / 1000) | 0,
        data: res.Token,
    };
}

async function fetchAccessToken(xstsToken: string, userHash: string): Promise<TimedToken> {
    const res = await httpsPost(new URL(ENDPOINT_LOGIN_WITH_XBOX), {
        identityToken: `XBL3.0 x=${userHash};${xstsToken}`
    }).then(parseJson);
    return {
        expiresOn: getNow() + res.expires_in,
        data: res.access_token,
    };
}

export async function fetchProfile(accessToken: string): Promise<UserProfile> {
    const res = await httpsGet(new URL(ENDPOINT_GET_PROFILE), {
        Authorization: `Bearer ${accessToken}`
    }).then(parseJson);
    return {
        id: res.id,
        name: res.name,
    };
}

export interface AuthContext {
    saveUser: () => Promise<void>;
    logger: Log;
}

async function getMSAToken(self: MSACredential, ctx: AuthContext): Promise<TimedToken> {
    if (self.MSAToken && self.MSAToken.expiresOn - getNow() > 1) {
        return self.MSAToken;
    } else {
        await validateMSAToken(self, ctx.logger);
        await ctx.saveUser();
        return self.MSAToken;
    }
}

async function getXBLToken(self: MSACredential, ctx: AuthContext): Promise<XBLToken> {
    if (self.xblToken && self.xblToken.expiresOn - getNow() > 1) {
        return self.xblToken;
    } else {
        const msaToken = await getMSAToken(self, ctx);
        ctx.logger.i('Logging in to XBox Live');
        self.xblToken = await doXBLAuth(msaToken.data);
        await ctx.saveUser();
        return self.xblToken;
    }
}

async function getXSTSToken(self: MSACredential, ctx: AuthContext): Promise<TimedToken> {
    if (self.xstsToken && self.xstsToken.expiresOn - getNow() > 1) {
        return self.xstsToken;
    } else {
        const xblToken = await getXBLToken(self, ctx);
        ctx.logger.i('Logging in to XSTS');
        self.xstsToken = await doXSTSAuth(xblToken.token, XSTS_RELYING_PARTY, ctx.logger);
        await ctx.saveUser();
        return self.xstsToken;
    }
}

export async function getAccessToken(self: MSACredential, ctx: AuthContext): Promise<TimedToken> {
    if (self.accessToken && self.accessToken.expiresOn - getNow() > 1) {
        return self.accessToken;
    } else {
        const xstsToken = await getXSTSToken(self, ctx);
        const xblToken = await getXBLToken(self, ctx);
        ctx.logger.i('Obtaining access token');
        self.accessToken = await fetchAccessToken(xstsToken.data, xblToken.userHash);
        await ctx.saveUser();
        return self.accessToken;
    }
}
