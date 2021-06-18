import { UserManager } from "./user";
import { Context } from "./main";


export async function logout(ctx: Context, uname: string): Promise<void>{
    var log = ctx.log;
    var umgr = new UserManager(ctx);
    try {
        await ctx.prepareDirs();
        await umgr.loadFromFile();
        var user = umgr.getUser(uname);
        await user.logout();
    }
    catch(msg){
        log.e(msg);
    }
}