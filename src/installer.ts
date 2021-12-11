import { Context } from "./mcenv";
import { VersionManager } from "./version";

export async function install(ctx: Context, vname: string, redownloadLib: boolean){
    const log = ctx.log;
    await ctx.prepareDirs();
    const vmgr = new VersionManager(ctx);
    const v = vmgr.getVersion(vname);
    if (await v.isVanillaVersion()){
        v.markRefresh();
    } else {
        ctx.log.w(`${vname} is not Vanilla, I might run into trooble`);
    }
    await v.loadData();
    await v.validateAll(redownloadLib);
    log.i('Done');
}