var jmcl = require('../');
var cli = require('./arg.js');
var pkg = require('../package.json');
const os = require('os');

const help = 
`Usage: ${pkg.name} [options] <command> [command options]

options: 
    -d, --dir <dir>:      Set game directory, default to '.minecraft';
    -h, --home <dir>:     Set home directory, default to os.homedir();
    --logLevel <level>:   Set logging level, where <level> is 
                              one of verbose, info, warn, err, default
                              to info;
    --help                Print this help text and exit;
    -v, --version         Display version and exit.

Commands:
    ${pkg.name} launch -u(--user) <email address or user name> -v(--version) <version> [--offline]
        Launch Minecraft <version>;
    ${pkg.name} logout -u(--user) <email>
        Invalidate all access tokens of <email>.
`;

async function main(argv){
    let errMsgs = [];
    let cmd, home = os.homedir(), gameDir = '.minecraft', logLevel = 'info';
    function oneArg(){
        let name = argv.shift();
        if (argv.length){
            return argv.shift();
        }
        else {
            errMsgs.push(`option ${name} requires one argument`);
            return null;
        }
    }
    out:
    while (argv.length){
        switch(argv[0]){
            case '-d':
            case '--dir':
                gameDir = oneArg();
                break;
            case '--home':
            case '-h':
                home = oneArg();
                break;
            case '--help':
                argv.shift();
                console.log(help);
                return 0;
            case '-v':
            case '--version':
                argv.shift();
                console.log(pkg.version);
                return 0;
            case '--logLevel':
                logLevel = oneArg();
                break;
            default:
                cmd = argv.shift();
                break out;
        }
    }

    let ctx = new jmcl.Context(console, logLevel);
    if (home !== void 0)
        ctx.config.home = home;
    if (gameDir !== void 0)
        ctx.config.mcRoot = gameDir;

    if (cmd === 'launch'){
        let uname, version, offline = false;
        while (argv.length){
            switch (argv[0]){
                case '-u':
                case '--user':
                    uname = oneArg();
                    break;
                case '-v':
                case '--version':
                    version = oneArg();
                    break;
                case '--offline':
                    argv.shift();
                    offline = true;
                    break;
                default:
                    errMsgs.push(`Unknown option ${argv[0]}`);
                    argv.shift();
            }
        }
        uname || errMsgs.push('User name missing');
        version || errMsgs.push('Version missing');
        if (!errMsgs.length){
            let prc = await jmcl.launch(ctx, {uname, version, offline});
            return new Promise((resolve, reject) => {
                prc.on('exit', (code) => resolve(code));
            });
        }
    }
    else if (cmd === 'logout'){
        let uname;
        while (argv.length){
            switch (argv[0]){
                case '-u':
                case '--user':
                    uname = oneArg();
                    break;
                default:
                    errMsgs.push(`Unknown option ${argv[0]}`);
                    argv.shift();
            }
        }
        uname || errMsgs.push('User name missing');
        if (!errMsgs.length){
            await jmcl.logout(ctx, uname);
            return 0;
        }
    }
    else {
        errMsgs.push(cmd === null ? 'Command missing' : `Unknown command ${cmd}`);
    }

    for (let e of errMsgs){
        console.error(e);
    }
    console.log(`Try ${pkg.name} --help for help`);
    return -1;
}

module.exports = async (argv) => {
    try {
        process.exitCode = await main(argv);
    }
    catch(e){
        console.error(e);
        process.exitCode = -1;
    }
}