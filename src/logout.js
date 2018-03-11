import { prepareDirs } from "./dirs";
import { UserManager } from "./user";


export function logout(ctx, opts){
    var log = ctx.log;

    var umgr = new UserManager(ctx);
    var user;

    return prepareDirs(ctx)
    .then(function(){
        return umgr.loadFromFile();
    })
    .then(function(){
        user = umgr.mojangUser(opts.uname);
        return umgr.logoutUser(user, function(){
            return ctx.readInput('password for ' + user.email + ':', true);
        });
    })
    .catch(function(msg){
        log.e(msg);
        // log.e(msg.stack);
    });
}