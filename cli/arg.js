'use strict';

function Option(names, desc, cb, req){
    /** @type{string[]} */
    this.names = names;
    this.desc = desc;
    this.cb = cb || null;
    this.req = req;
}
Option.prototype.getName = function(){
    var ret = this.names[0];
    for(var i = 1; i < this.names.length; i++){
        ret += ' or ' + this.names[i];
    }
    return ret;
}
function CmdEntry(name, desc, cb){
    this.name = name;
    this.desc = desc || '';
    /** @type{Object.<string, Option>} */
    this.opts = {};

    /** @type{Option[]} */
    this.allOpt = [];
    
    this.any = null;
    this.cb = cb || null;
}
CmdEntry.prototype.getMissedOpts = function(opts){
    function hasOpt(opt){
        for(var i = 0; i < opts.length; i++){
            if(opts[i] === opt){
                return true;
            }
        }
        return false;
    }
    var ret = [];
    for(var i = 0; i < this.allOpt.length; i++){
        if(this.allOpt[i].req){
            !hasOpt(this.allOpt[i]) && ret.push(this.allOpt[i]);
        }
    }
    return ret;
}

module.exports = function(argv){
    /** @type{Object.<string, CmdEntry>} */
    var cmds = {};
    /** @type{CmdEntry} */
    var cmd = null;

    /** @type{Option[]} */
    var commonOpts = {};

    var err = null;

    function emitErr(msg){
        msg = typeof msg === 'string' ? [msg] : msg;
        if(err){
            err(msg);
        }
        else {
            throw msg;
        }
    }

    return {
        cmd: function(name, desc, cb){
            cmd = cmds[name] = new CmdEntry(name, desc, cb);
            return this;
        },
        opt: function(pattern, desc, cb, req){
            var parts = pattern.split('|');
            var nopt = new Option('', desc, cb, !!req);
            cmd.allOpt.push(nopt);
            for(var i = 0; i < parts.length; i++){
                parts[i] = parts[i].trim();
                cmd.opts[parts[i]] = nopt;
            }
            nopt.names = parts;
            return this;
        },
        commonOpt: function(pattern, desc, cb, req){
            var parts = pattern.split('|');
            var nopt = new Option('', desc, cb, !!req);
            for(var cmdname in cmds){
                var cmd = cmds[cmdname];
                cmd.allOpt.push(nopt);
                for(var i = 0; i < parts.length; i++){
                    parts[i] = parts[i].trim();
                    cmd.opts[parts[i]] = nopt;
                }
            }
            nopt.names = parts;
            return this;
        },
        any: function(desc, cb, req){
            cmd.any = cb;
            return this;
        },
        err: function(cb){
            err = cb;
            return this;
        },
        parse: function(argv){
            var data = {};
            function cbcb(){
                if(argv.length <= 0){
                    emitErr('option ' + opt.getName() + 'requires one more argument');
                }
                return argv.shift();
            }
            function arg(reason){
                if(argv.length <= 0){
                    emitErr(reason);
                }
                return argv.shift();
            }
            var cmdName = arg('command expected');
            var hasopts = [];
            var tcmd = cmds[cmdName];
            if(!tcmd){
                emitErr('unknown command "' + cmdName + '"');
                return null;
            }
            tcmd.cb && tcmd.cb(data, cbcb);
            while(argv.length > 0){
                var opt = tcmd.opts[argv[0]];
                if(opt){
                    argv.shift();
                    opt.cb && opt.cb(data, cbcb);
                    hasopts.push(opt);
                }
                else if(tcmd.any){
                    argv.shift();
                    tcmd.any(data, cbcb);
                }
                else {
                    emitErr('unknown option "' + argv[0] + '"');
                    return null;
                }
            }
            var missed = tcmd.getMissedOpts(hasopts);
            if(missed.length > 0){
                var msg = ['there are(is) missed option(s):'];
                for(var i = 0; i < missed.length; i++){
                    msg.push('    ' + missed[i].getName());
                }
                emitErr(msg);
                return null;
            }
            return data;
        }
    };
}