import * as p from './promise';

export function prepareDirs(ctx){
    return p.mkdirIfNotExists(ctx.getMCRoot(), null)
        .then(function(){
            return p.mkdirIfNotExists(ctx.getLauncherDir(), null);
        });
}