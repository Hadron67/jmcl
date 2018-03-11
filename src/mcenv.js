import { Log } from './log';
import { input } from './promise';

export function Context(console){
    this.launcherRoot = '.jmcl';
    this.home = '/home/cfy';
    this.mcRoot = '.minecraft';

    this.console = console;
    this.log = new Log(console);
}
Context.prototype.getMCRoot = function(){
    return this.home + '/' + this.mcRoot;    
}
Context.prototype.getVersionDir = function(vname){
    return this.home + '/' + this.mcRoot + '/versions/' + vname;
}
Context.prototype.getLauncherDir = function(){
    return this.home + '/' + this.mcRoot + '/' + this.launcherRoot;
}
Context.prototype.readInput = function(q, hidden){
    return input(q, hidden);
}