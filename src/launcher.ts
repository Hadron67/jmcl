import * as cpc from 'child_process';
import { VersionManager } from './version';
import { UserManager, User } from './user';
import { prepareDirs } from './dirs';
import * as p from './promise';
import { Context } from './mcenv';

export interface LaunchOption {
    uname: string;
    version: string;
    offline: boolean;
}
export async function launch(ctx: Context, opt: LaunchOption){
    if(!opt.uname){
        throw new Error('user name not present');
    }
    if(!opt.version){
        throw new Error('version not given');
    }
    opt.offline = !!opt.offline;
    var log = ctx.log;
    
    async function launch1(): Promise<void>{
        var vmgr = new VersionManager(ctx);
        var umgr = new UserManager(ctx);
        var user: User;
        await prepareDirs(ctx);
        await umgr.loadFromFile();
        if(opt.offline){
            user = umgr.offlineUser(opt.uname);
        }
        else {
            var user2 = umgr.mojangUser(opt.uname);
            await user2.makeValid(ctx, opt.version, () => {
                return ctx.readInput(`password for ${user2.email}:`, true);
            });
            await umgr.addMojangUser(user2);
            user = user2;
        }
        var v = await vmgr.getVersion(opt.version);
        var mcargs = v.getArgs();
        var jars = v.getJars();
        jars.push(v.getJarName());
        user.initArg(mcargs);

        mcargs.arg('classpath', jars.join(':'))
            .arg('natives_directory', v.getNativeDir())
            .arg('user_home', ctx.config.home)

            .arg('launcher_name', ctx.launcherName)
            .arg('launcher_version', ctx.launcherVersion);
        
        log.i('generating arguments');
        var cmd = [
            'java',
            "-Xincgc",
            '-XX:-UseAdaptiveSizePolicy',
            '-XX:-OmitStackTraceInFastThrow',
            '-Xmn128m',
            '-Xmx2048M',
            mcargs.jvmArg(),
            v.getMainClass(),
            mcargs.gameArg()
        ];

        log.v(`arguments: ${cmd.join(' ')}`);
    
        log.i('launching game');
        await p.exec(cmd.join(' '), process.stdout, process.stderr);
        log.i('game quit');
    }

    try {
        await launch1();
    }
    catch(e){
        log.e(e);
    }
}