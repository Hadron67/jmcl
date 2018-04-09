export class Log {
    constructor(public c: Console){}
    i(s){
        this.c.log('[jmcl/INFO] ' + s);
    }
    
    v(s){
        this.c.log('[jmcl/VERBOSE] ' + s);
    }
    
    e(s){
        this.c.log('[jmcl/ERR] ' + s);
    }
    
    w(s){
        this.c.log('[jmcl/WARN] ' + s);
    }
}
