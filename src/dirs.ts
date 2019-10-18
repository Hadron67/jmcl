import { Context } from './main';
import { ensureDir } from 'fs-extra';

// export async function prepareDirs(ctx: Context): Promise<void>{
//     await ensureDir(ctx.getMCRoot(), null);
//     await ensureDir(ctx.getLauncherDir(), null);
//     await ensureDir(ctx.getVersionDir(), null);
//     return;
// }