import chalk from 'chalk';

export enum LogLevel {
    verbose = 0,
    info = 1,
    warn = 2,
    err = 3
}

export class Log {
    constructor(public c: Console, public level: LogLevel = LogLevel.info){}
    i(s: string){
        this.level <= LogLevel.info && this.c.log(chalk.blue('INFO ') + s);
    }

    v(s: string){
        this.level <= LogLevel.verbose && this.c.log(chalk.gray('VERBOSE ') + s);
    }

    e(s: string){
        this.level <= LogLevel.err && this.c.log(chalk.red('ERR ') + chalk.gray(s));
    }

    w(s: string){
        this.level <= LogLevel.warn && this.c.log(chalk.yellow('WARN ') + chalk.green(s));
    }
}
