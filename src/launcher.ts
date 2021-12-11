import * as cpc from 'child_process';
import { VersionManager } from './version';
import { UserManager, User } from './user';
import { Context } from './mcenv';
import { join } from 'path';
import { randHex } from './util';
import { tmpdir } from 'os';
import { remove, ensureDir } from 'fs-extra';
import { exists } from './fsx';
import { createPipeServer } from './server';
import { downloadToFile } from './download';
import { URL } from 'url';

const LOG4J2_CONFIG_URL = 'https://launcher.mojang.com/v1/objects/02937d122c86ce73319ef9975b58896fc1b491d1/log4j2_112-116.xml';

export interface LaunchOption {
    javaPath: string;
    uname: string;
    version: string;
    offline: boolean;
    pipeServerPort: number;
    jvmArgs: string[];
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
    await ctx.prepareDirs();

    var v = vmgr.getVersion(opt.version);
    await v.loadData();

    await umgr.loadFromFile();
    if(opt.offline){
        user = umgr.newOfflineUser(opt.uname);
    } else {
        var user2 = umgr.getOrCreateUser(opt.uname, 'yggdrasil');
        await user2.makeValid(ctx, opt.version, () => ctx.readInput(`password for ${opt.uname}:`, true));
        await umgr.addUser(opt.uname, user2);
        user = user2;
    }

    var mcargs = v.getArgs(ctx.config);
    var jars = v.getClasspathJars(ctx.config);
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

    if (v.needLog4j2Fix) {
        log.i(`LOG4J2 fix is required for this version`);
        const logFileName = join(ctx.getMCRoot(), 'log4j2-fix-log-config.xml');
        if (!await exists(logFileName)) {
            log.i('downloading log4j2 config file');
            await downloadToFile(new URL(LOG4J2_CONFIG_URL), logFileName);
        }
        opt.jvmArgs.push(`-Dlog4j.configurationFile=${logFileName}`);
    } else {
        opt.jvmArgs.push('-Dlog4j2.formatMsgNoLookups=true');
    }

    log.i('generating arguments');
    var cmd: string[] = [
        '-XX:-UseAdaptiveSizePolicy',
        '-XX:-OmitStackTraceInFastThrow',
        '-Xmn128m',
        '-Xmx2048M',
        ...opt.jvmArgs,
        ...mcargs.jvmArg(),
        v.getMainClass(),
        ...mcargs.gameArg()
    ];

    log.v(`arguments: ${cmd.join(' ')}`);

    log.i('launching game');
    let prc = cpc.spawn(opt.javaPath || 'java', cmd, {
        cwd: ctx.getMCRoot()
    });
    prc.stdout.pipe(process.stdout);
    prc.stderr.pipe(process.stderr);
    prc.on('exit', async (code, signal) => {
        log.i('removing temporary files');
        await remove(nativesDir);
    });

    if (opt.pipeServerPort){
        const s = createPipeServer();
        prc.stdout.on('data', d => s.write(d.toString('utf-8')));
        s.listen(opt.pipeServerPort);
        ctx.log.i(`Pipe server started on port ${opt.pipeServerPort}`);
        prc.on('exit', (code, signal) => {
            log.i('Stopping pipe server');
            s.stop(e => {
                if (e){
                    ctx.log.e('Error while stopping pipe server:' + e);
                }
            });
        });
    }

    return prc;
}