import cpc from 'child_process';
import { VersionManager } from './version';
import { UserManager } from './user';
import { prepareDirs } from './dirs';
import * as p from './promise';

export function launch(ctx, opt){

    if(!opt.uname){
        throw new Error('user name not present');
    }
    if(!opt.version){
        throw new Error('version not given');
    }
    opt.legacy = !!opt.legacy;

    var log = ctx.log;

    var vmgr = new VersionManager(ctx);
    var umgr = new UserManager(ctx);

    var user;

    return prepareDirs(ctx)
    .then(function(){
        return umgr.loadFromFile();
    })
    .then(function(){
        if(opt.legacy){
            user = umgr.legacyUser(opt.uname);
        }
        else {
            user = umgr.mojangUser(opt.uname);
            return user.makeValid(ctx, opt.version, function(){
                return ctx.readInput('password for ' + user.email + ':', true);
            })
            .then(function(){
                return umgr.addMojangUser(user);
            });
        }
    })
    .then(function(){
        return vmgr.getVersion(opt.version);
    })
    .then(function(v){
        // var v = vmgr.getVersion(opt.version);
        // var user = umgr.legacyUser(opt.uname);
    
        var mcargs = v.getArgs();
        var jars = v.getJars();
        jars.push(v.getJarName());
        user.initArg(mcargs);
        
        log.i('generating arguments');
        var cmd = [
            'java',
            "-Xincgc",
            '-XX:-UseAdaptiveSizePolicy',
            '-XX:-OmitStackTraceInFastThrow',
            '-Xmn128m',
            '-Xmx2048M',
            '-Djava.library.path=' + v.getNativeDir(),
            '-Duser.home=' + ctx.home,
            '-cp ' + jars.join(':'),
            v.getMainClass(),
            mcargs.toString()
        ];
    
        log.i('launching game');
        //console.log(jvmArgs.join(' '));
        return p.exec(cmd.join(' '), process.stdout, process.stderr);
    })
    .then(function(){
        log.i('game quit');
    })
    .catch(function(e){
        log.e(e);
    });
}