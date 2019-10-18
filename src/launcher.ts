import * as cpc from 'child_process';
import { VersionManager } from './version';
import { UserManager, User } from './user';
import { prepareDirs } from './dirs';
// import * as p from './promise';
import { Context } from './mcenv';
import { join } from 'path';
import { randHex } from './util';
import { tmpdir } from 'os';
import { remove, ensureDir } from 'fs-extra';
import { exists } from './fsx';

export interface LaunchOption {
    uname: string;
    version: string;
    offline: boolean;
}

export async function launch(ctx: Context, opt: LaunchOption): Promise<cpc.ChildProcess>{
    if(!opt.uname){
        throw new Error('user name not present');
    }
    if(!opt.version){
        throw new Error('version not given');
    }
    opt.offline = !!opt.offline;
    var log = ctx.log;
    
    var vmgr = new VersionManager(ctx);
    var umgr = new UserManager(ctx);
    var user: User;
    await prepareDirs(ctx);

    var v = await vmgr.getVersion(opt.version);
    await v.loadData(false);

    await umgr.loadFromFile();
    if(opt.offline){
        user = umgr.getOfflineUser(opt.uname);
    }
    else {
        var user2 = umgr.getMojangUser(opt.uname);
        await user2.makeValid(ctx, opt.version, () => ctx.readInput(`password for ${user2.email}:`, true));
        await umgr.addMojangUser(user2);
        user = user2;
    }

    var mcargs = v.getArgs(ctx.config);
    var jars = v.getClasspathJars(ctx.config);
    jars.push(v.getJarName());
    user.initArg(mcargs);

    let tmpd = join(tmpdir(), 'minecraft-natives');
    await ensureDir(tmpd);
    let nativesDir = join(tmpd, randHex(32));
    while (await exists(nativesDir)){
        nativesDir = join(tmpd, randHex(32));
    }
    await ensureDir(nativesDir);
    log.i('extracting native libraries');
    await v.extractNatives(nativesDir, ctx.config);

    mcargs.arg('classpath', jars.join(':'))
        .arg('natives_directory', nativesDir)
        .arg('user_home', ctx.config.home)

        .arg('launcher_name', ctx.launcherName)
        .arg('launcher_version', ctx.launcherVersion);
    
    log.i('generating arguments');
    var cmd: string[] = [
        "-Xincgc",
        '-XX:-UseAdaptiveSizePolicy',
        '-XX:-OmitStackTraceInFastThrow',
        '-Xmn128m',
        '-Xmx2048M',
        ...mcargs.jvmArg(),
        v.getMainClass(),
        ...mcargs.gameArg()
    ];

    log.v(`arguments: ${cmd.join(' ')}`);

    log.i('launching game');
    // let prc = await p.exec('java', cmd, process.stdout, process.stderr);
    let prc = cpc.spawn('java', cmd);
    prc.stdout.pipe(process.stdout);
    prc.stderr.pipe(process.stderr);
    prc.on('exit', async (code, signal) => {
        log.i('removing temporary files');
        await remove(nativesDir);
    });
    return prc;
}