export enum LogLevel {
    verbose = 0,
    info = 1,
    warn = 2,
    err = 3
}

export class Log {
    constructor(public c: Console, public level: LogLevel = LogLevel.info){}
    i(s){
        this.level <= LogLevel.info && this.c.log('[jmcl/INFO] ' + s);
    }
    
    v(s){
        this.level <= LogLevel.verbose && this.c.log('[jmcl/VERBOSE] ' + s);
    }
    
    e(s){
        this.level <= LogLevel.err && this.c.log('[jmcl/ERR] ' + s);
    }
    
    w(s){
        this.level <= LogLevel.warn && this.c.log('[jmcl/WARN] ' + s);
    }
}
