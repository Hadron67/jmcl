import fs from 'fs';
import { Context } from './mcenv.js';
import { MCArg } from './mcarg.js';
import * as p from './promise';

function VersionManager(ctx){
    this.versions = {};
    this.ctx = ctx;
}
VersionManager.prototype.getVersion = function(vname){
    //this.ctx.log.v('getting version');
    var ret = this.versions[vname];
    var cela = this;
    if(!ret){
        var jsonPath = cela.ctx.getVersionDir(vname) + '/' + vname + '.json';
        return p.readFile(jsonPath)
            .then(function(data){
                //cela.ctx.log.v('got version json');
                return cela.versions[vname] = new Version(cela, vname, JSON.parse(data));
            });
    }
    else {
        return p.pass(ret);
    }

    // return ret;
}


function Version(mgr, vname, versionJson){
    this.mgr = mgr;
    this.vname = vname;
    this.versionJson = versionJson;
}
Version.prototype.getJars = function(){
    var libdir = this.mgr.ctx.getMCRoot() + '/libraries';
    var lib = this.versionJson.libraries;
    var ret = [];
    for(var i = 0; i < lib.length; i++){
        var name = lib[i].name;
        var parts = name.split(':');
        var pkg = parts[0].replace(/\./g, "/");
        var clazz = parts[1];
        var classv = parts[2];
        
        ret.push(
            [libdir, pkg, clazz, classv, clazz + '-' + classv + '.jar'].join('/')
        );
    }
    //todo: inherits from
    return ret;
}
Version.prototype.getNativeDir = function(){
    return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '-natives/';
}
Version.prototype.getMainClass = function(){
    return this.versionJson.mainClass;
}
Version.prototype.getJarName = function(){
    return this.mgr.ctx.getVersionDir(this.vname) + '/' + this.vname + '.jar';
}
Version.prototype.getArgs = function(){
    var arg = new MCArg(this.versionJson.minecraftArguments);
    var env = this.mgr.ctx;
    return arg
            .arg('version_name', this.vname)
            .arg('game_directory', env.getMCRoot())
            .arg('assets_root', env.getMCRoot() + '/assets')
            .arg('assets_index_name', this.versionJson.assets)
            .arg('version_type', this.versionJson.type);
}

export { VersionManager }