var jmcl = require('../');
var cli = require('./arg.js');
var pkg = require('../package.json');
const os = require('os');
const chalk = require('chalk');

const help = 
`Usage: ${pkg.name} [options] <command> [command options]

options: 
    -d, --dir <dir>:      Game directory, default to os.homedir()/.minecraft;
    -h, --home <dir>:     Home directory, default to os.homedir();
    --climit <limit>:     Maximum number of concurrent connections used when downloading; 
    --logLevel <level>:   Logging level, where <level> is 
                              one of verbose, info, warn, err, default
                              to info;
    --help                Print this help text and exit;
    -v, --version         Display version and exit.

Commands:
    ${pkg.name} launch -u(--user) <email address or user name> -v(--version) <version> [--offline]
        Launch Minecraft <version>;

    ${pkg.name} logout <email>
        Invalidate all access tokens of <email>;

    ${pkg.name} install <version>
        Install Minecraft <version>, or download missing game files of <version> if already installed;
    
    ${pkg.name} install-all
        Check and download missing game files of all installed versions;
    
    ${pkg.name} remove <version>
        Delete Minecraft <version>. Only main jar file and version manifest are deleted, if you want to
        delete libraries and assets, run ${pkg.name} cleanup.
    
    ${pkg.name} cleanup
        Delete game files that're not used by any installed Minecraft version.
`;

async function main(argv){
    let errMsgs = [];
    let cmd = null, home = null, gameDir = null, logLevel = 'info';
    let climit = 20;
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
            case '--climit':
                climit = Number(oneArg());
                break;
            default:
                cmd = argv.shift();
                break out;
        }
    }

    let ctx = new jmcl.Context(console, logLevel);
    if (home !== null)
        ctx.config.home = home;
    if (gameDir !== null)
        ctx.config.mcRoot = gameDir;
    ctx.config.downloadConcurrentLimit = climit;

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
        if (argv.length){
            await jmcl.logout(ctx, argv[0]);
            return 0;
        }
        else {
            errMsgs.push('User name missing');
        }
    }
    else if (cmd === 'install'){
        if (argv.length){
            await jmcl.install(ctx, argv.shift());
            return 0;
        }
        else {
            errMsgs.push('Version missing');
        }
    }
    else if (cmd === 'remove'){
        if (argv.length){
            const vm = new jmcl.VersionManager(ctx);
            await vm.deleteVersion(argv[0]);
            return 0;
        }
        else {
            errMsgs.push('Version missing');
        }
    }
    else if (cmd === 'install-all'){
        await ctx.prepareDirs();
        const vm = new jmcl.VersionManager(ctx);
        await vm.loadAllVersions(true);
        await vm.validateAllVersions();
        return 0;
    }
    else if (cmd === 'list'){
        await ctx.prepareDirs();
        const vm = new jmcl.VersionManager(ctx);
        console.log("Installed versions:");
        for (const v of await vm.listInstalled()){
            console.log('-   ' + chalk.bold(v));
        }
        return 0;
    }
    else if (cmd === 'cleanup'){
        await ctx.prepareDirs();
        const vm = new jmcl.VersionManager(ctx);
        await vm.loadAllVersions(false);
        await vm.cleanup();
        return 0;
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