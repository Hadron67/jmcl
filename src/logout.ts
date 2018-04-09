import { prepareDirs } from "./dirs";
import { UserManager } from "./user";
import { Context } from "./main";


export async function logout(ctx: Context, opts): Promise<void>{
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
    catch(msg){
        log.e(msg);
    }
}