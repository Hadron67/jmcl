import * as p from './promise';
import { Context } from './main';

export async function prepareDirs(ctx: Context): Promise<void>{
    await p.mkdirIfNotExists(ctx.getMCRoot(), null);
    await p.mkdirIfNotExists(ctx.getLauncherDir(), null);
    return;
}