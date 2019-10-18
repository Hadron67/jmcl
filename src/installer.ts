import { Context } from "./mcenv";
import { VersionManager } from "./version";
import { prepareDirs } from "./dirs";

export async function install(ctx: Context, vname: string){
    const log = ctx.log;
    await prepareDirs(ctx);
    const vmgr = new VersionManager(ctx);
    const v = await vmgr.getVersion(vname);
    await v.loadData(true);
    await v.validateAll();
    log.i('Done');
}