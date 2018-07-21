var jmcl = require('../index.js');
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
    ctx.launcherName = pkg.name;
    ctx.launcherVersion = pkg.version;
    switch(opts.cmd){
        case 'launch':
            jmcl.launch(ctx, opts);
            break;
        case 'logout':
            jmcl.logout(ctx, opts);
            break;
        default: console.assert(false);
    }
    return 0;
}