var jmcl = require('../');
var cli = require('./arg.js');
var pkg = require('../package.json');

function oneArg(name){
    return function(data, arg){
        data[name] = arg();
    }
}

function boolArg(name){
    return function(data){
        data[name] = true;
    }
}

function setVal(name, val){
    return function(data){
        data[name] = val;
    }
}

function parseArg(argv){
    let opt = {cmd: null, home: '~', logLevel: 'verbose', errrMsgs: []};
    function oneArg(name){
        if (argv.length){
            return argv.shift();
        }
        else {
            opt.errrMsgs.push(`option ${name} requires one argument`);
            return null;
        }
    }
    while (argv.length){
        
    }
}

async function launch(ctx, opt){
    let prc = await jmcl.launch(ctx, opt);
    prc.stdout.pipe(prc.stdout);
    
}

var argParser = cli()
    .cmd('launch', 'launching minecraft', setVal('cmd', 'launch'))
        .opt('-u|--user', 'username or email', oneArg('uname'), true)
        .opt('-v|--version', 'the version to be launched', oneArg('version'), true)
        .opt('--offline', 'set user type to offline', setVal('offline', true))
        
    .cmd('logout', 'logout a user', setVal('cmd', 'logout'))
        .opt('-u|--user', 'email of the user', oneArg('uname'), true)
        
    .commonOpt('-d|--dir', 'set game directory (default to .minecraft)', oneArg('mcRoot'))
    .commonOpt('-h|--home', 'set home directory (default to ~)', oneArg('home'))
    .commonOpt('-l|--logLevel', 'set log level', oneArg('logLevel'));

module.exports = function(argv){
    var nodeBin = argv.shift();
    var appName = argv.shift();
    try{
        var opts = argParser.parse(argv);
    }
    catch(e){
        e.forEach(function(msg){
            console.log(msg);
        });
        return -1;
    }
    var ctx = new jmcl.Context(console, opts.logLevel);
    if (opts.home !== undefined)
        ctx.config.home = opts.home;
    if (opts.mcRoot !== undefined)
        ctx.config.mcRoot = opts.mcRoot;
    switch(opts.cmd){
        case 'launch':
            let p = jmcl.launch(ctx, opts);
            break;
        case 'logout':
            jmcl.logout(ctx, opts);
            break;
        default: console.assert(false);
    }
    return 0;
}