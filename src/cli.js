
function Option(desc, argname, req){
    this.desc = desc;
    this.argname = argname;
    this.required = req;
}
function CmdEntry(desc){
    this.desc = desc;
    this.options = {};
    this.cb = null;
}

export default function(){
    var cmds = {};
    var cmd = null;
    var err = null;
    
    return {
        cmd: function(name, desc){
            if(!cmds[name]){
                cmd = cmds[name] = new CmdEntry(desc || '');
            }
            else {
                throw new Error('command "' + name + '" is already defined');
            }
            return this;
        },
        opt: function(optname, desc, argname, req){
            var opts = optname.split('|');
            var opt = new Option(desc || '', argname || null, !!req);
            for(var i = 0; i < opts.length; i++){
                var op = opts[i].trim();
                if(!cmd.options[op]){
                    cmd.options[op] = opt;
                }
                else {
                    throw new Error('option "' + opts[i] + '" is already defined under this command');
                }
            }
            return this;
        },
        done: function(cb){
            cmd.cb = cb;
            return this;
        },
        err: function(e){
            err = e;
            return this;
        },
        parse: function(argv){
            argv.shift();
            argv.shift();
            // command
            if(argv.length <= 0){
                err && err(['command required']);
            }
            var cmdentry = cmds[argv[0]];
            if(!cmdentry){
                var msg = [
                    'unknown command "' + argv[0] + '"',
                    'list of commmands is:'
                ];
                for(cmdname in cmds){
                    msg.push('    ' + cmdname + ': ' + cmds[cmdname].desc);
                }
                err && err(msg);
            }
            argv.shift();

            var ret = {};
            while(argv.length > 0){
                var arg = argv[0];
                var op = cmdentry.options[arg];
                if(!op){
                    var msg = [
                        'unknown option "' + argv[0] + '"',
                        'list of options is:'
                    ];
                    for(opname in cmdentry.options){
                        msg.push('    ' + opname + ': ' + cmdentry.options[opname].desc);
                    }
                    err && err(msg);
                }

                
            }
        }
    };
}