import chalk from 'chalk';
import * as pkg from '../package.json';
import { install } from './installer';
import { launch } from './launcher';
import { Context } from './mcenv';
import { UserManager } from './user';
import { VersionManager } from './version';

export { Context, VersionManager, install, launch };
export { UserManager } from './user';

const help =
`Usage: ${pkg.name} [options] <command> [command options]

options:
    -d, --dir <dir>:      Game directory, default to $MINECRAFT_HOME, or os.homedir()/.minecraft if $MINECRAFT_HOME is not set;
    -h, --home <dir>:     Home directory, default to os.homedir();
    --climit <limit>:     Maximum number of concurrent connections used when downloading; 
    --logLevel <level>:   Logging level, where <level> is 
                              one of verbose, info, warn, err, default
                              to info;
    --help                Print this help text and exit;
    -v, --version         Display version and exit.

Commands:
    ${pkg.name} launch [<jvm args>] -u(--user) <email address or user name> -v(--version) <version> [--offline] [--pipes [<port>]]
        Launch Minecraft <version>. Add option --pipes to open a local TCP server and 
        write all log output of Minecraft to it;

    ${pkg.name} logout <email>
        Invalidate all access tokens of <email>;

    ${pkg.name} install <version> [--redownload]
        Install Minecraft <version>, or download missing game files of <version> if already installed.
        A game file with bad check sum would be re-downloaded, but for those without check sums, they
        will be downloaded only when they are missing, use --redownload to re-download all files without
        check sum information;

    ${pkg.name} install-all [--redownload]
        Check and download missing game files of all installed versions;

    ${pkg.name} remove <version>
        Delete Minecraft <version>. Only main jar file and version manifest are deleted, if you want to
        delete libraries and assets, run ${pkg.name} cleanup.

    ${pkg.name} cleanup
        Delete game files that're not used by any installed Minecraft version.

    ${pkg.name} list
        List all installed versions.

    ${pkg.name} list-all [--release]
        List all available verions(verions present in verion manifest).
`;

function isJvmArg(a: string){
    return a.startsWith('-D') || a.startsWith('-X') || a.startsWith('+XX:');
}

export async function main(argv: string[], errMsgs: string[]): Promise<void> {
    let cmd = null, home = null, gameDir = null, logLevel = 'info';
    let climit = 20;
    function oneArg(): string {
        let name = argv.shift();
        if (argv.length){
            return argv.shift();
        } else {
            errMsgs.push(`option ${name} requires one argument`);
            throw 'help';
        }
    }
    function requiredShift(): string {
        if (argv.length) {
            return argv.shift();
        } else {
            errMsgs.push('Missing argument');
            throw 'help';
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
                throw 'help';
            case '-v':
            case '--version':
                argv.shift();
                console.log(pkg.version);
                return;
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

    let ctx = new Context(console, logLevel);
    if (home !== null)
        ctx.config.home = home;
    if (gameDir !== null)
        ctx.config.mcRoot = gameDir;
    ctx.config.downloadConcurrentLimit = climit;

    if (cmd === 'launch'){
        let uname = '', version = '', offline = false, pipeServerPort: number = null, javaPath = '';
        const jvmArgs = [];
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
                case '--java':
                    javaPath = oneArg();
                    break;
                case '--pipes':
                    argv.shift();
                    pipeServerPort = 35194;
                    if (argv.length && /[0-9]+/.test(argv[0])){
                        pipeServerPort = Number(argv.shift());
                    }
                    break;
                case '--res':
                    argv.shift();
                    if (/^[0-9]+x[0-9]+$/.test(argv[0])){
                        ctx.config.resolution = argv[0].split('x').map(r => Number(r));
                    }
                    else {
                        errMsgs.push(`Invalid resolution ${argv[0]}`);
                    }
                    argv.shift();
                    break;
                default:
                    if (isJvmArg(argv[0])){
                        jvmArgs.push(argv[0]);
                        argv.shift();
                    }
                    else {
                        errMsgs.push(`Unknown option ${argv[0]}`);
                        argv.shift();
                    }
            }
        }
        uname || errMsgs.push('User name missing');
        version || errMsgs.push('Version missing');
        if (!errMsgs.length){
            let prc = await launch(ctx, {uname, version, offline, pipeServerPort, jvmArgs, javaPath});
            return new Promise((resolve, reject) => {
                prc.on('exit', (code) => resolve());
            });
        }
    } else if (cmd === 'install'){
        let redownload = false, version = null;
        while (argv.length){
            switch (argv[0]){
                case '--redownload':
                    redownload = true;
                    argv.shift();
                    break;
                default:
                    version = argv.shift();
            }
        }
        if (version){
            await install(ctx, version, redownload);
            return;
        } else {
            errMsgs.push('Version missing');
        }
    } else if (cmd === 'remove'){
        if (argv.length){
            const vm = new VersionManager(ctx);
            await vm.deleteVersion(argv[0]);
            return;
        } else {
            errMsgs.push('Version missing');
        }
    } else if (cmd === 'install-all'){
        let redownload = false;
        if (argv.length && argv[0] === '--redownload'){
            redownload = true;
        }
        await ctx.prepareDirs();
        const vm = new VersionManager(ctx);
        await vm.loadAllVersions(true);
        await vm.validateAllVersions(redownload);
        return;
    } else if (cmd === 'list'){
        await ctx.prepareDirs();
        const vm = new VersionManager(ctx);
        console.log("Installed versions:");
        for (const v of await vm.listInstalled()){
            console.log('-   ' + chalk.bold(v));
        }
        return;
    } else if (cmd === 'list-all'){
        let releaseOnly = false;
        while (argv.length){
            switch (argv[0]){
                case '--release':
                    argv.shift();
                    releaseOnly = true;
                    break;
                default:
                    errMsgs.push(`Unknown option ${argv[0]}`);
                    argv.shift();
            }
        }
        if (errMsgs.length === 0){
            const vm = new VersionManager(ctx);
            let verions = await vm.getAvailableVersions();

            if (releaseOnly){
                verions = verions.filter(v => v.type === "release");
            }

            const installed = Array(verions.length);
            const latest = await vm.getLatest();
            await Promise.all(verions.map(async (v, i) => installed[i] = await vm.isInstalled(v.id)));
            for (let _a = verions, i = _a.length - 1; i >= 0; i--){
                let tag = '', v = verions[i];
                installed[i] && (tag += chalk.blue('[installed]'));
                latest.release === v.id && (tag += chalk.green('[latest]'));
                latest.release !== latest.snapshot && latest.snapshot === v.id && (tag += chalk.yellow('[latest snapshot]'));
                console.log("-   " + chalk.bold(`${v.id} `) + tag);
            }
            return;
        }
    } else if (cmd === 'cleanup'){
        await ctx.prepareDirs();
        const vm = new VersionManager(ctx);
        await vm.loadAllVersions(false);
        await vm.cleanup();
        return;
    } else if (cmd === 'user') {
        const um = new UserManager(ctx);
        await um.loadFromFile();
        const subcmd = requiredShift();
        switch (subcmd) {
            case 'add': {
                const userName = requiredShift();
                if (um.getUser(userName) !== null) {
                    errMsgs.push(`User ${userName} already exists`);
                    throw '';
                }
                const userType = requiredShift();
                const userEmail = requiredShift();
                const user = UserManager.createUser(userEmail, userType);
                if (user === null) {
                    errMsgs.push(`Invalid user type ${userType}`);
                    throw '';
                }
                um.addUser(userName, user);
                ctx.log.i(`added ${userType} user "${userName}" with account name ${userEmail}`);
                break;
            }
            case 'validate': {
                const userName = requiredShift();
                const user = um.getUser(userName);
                if (user === null) {
                    errMsgs.push(`Unknown user "${userName}"`);
                    throw '';
                }
                await user.makeValid(() => ctx.readInput(`password for ${user.getAccountName()}:`, true), async () => { await um.save(); }, ctx.log);
                await um.save();
                ctx.log.i(`validated, user name: ${user.getName()}`);
                break;
            }
            case 'logout': {
                const userName = requiredShift();
                const user = um.getUser(userName);
                if (user === null) {
                    errMsgs.push(`Unknown user "${userName}"`);
                    throw '';
                }
                await user.logout();
                await um.save();
                break;
            }
            case 'remove': {
                const userName = requiredShift();
                if (um.removeUser(userName) === null) {
                    errMsgs.push(`Unknown user "${userName}"`);
                    throw '';
                }
                await um.save();
                ctx.log.i(`removed user "${userName}"`);
                break;
            }
            case 'rename': {
                const userName = requiredShift();
                if (um.getUser(userName) === null) {
                    errMsgs.push(`Unknown user "${userName}"`);
                    throw '';
                }
                const newName = requiredShift();
                if (um.getUser(newName) !== null) {
                    errMsgs.push(`User "${newName}" already exists`);
                    throw '';
                }
                um.addUser(newName, um.removeUser(userName));
                await um.save();
                ctx.log.i(`renamed user "${userName}" to "${newName}"`);
                break;
            }
            case 'list': {
                um.forEach((id, u) => console.log(`-    ${id}, account: ${u.getAccountName()}, name: ${u.getName() || '<unavailable>'}, type: ${u.getType()}`));
                break;
            }
            default: errMsgs.push(`Unknown subcommand "${subcmd}" for user`); throw 'help';
        }
    } else {
        errMsgs.push(cmd === null ? 'Command missing' : `Unknown command ${cmd}`);
        throw 'help';
    }
}