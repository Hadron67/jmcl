
export function Log(c){
    this.c = c;
}
Log.prototype.i = function(s){
    this.c.log('[jmcl/INFO] ' + s);
}

Log.prototype.v = function(s){
    this.c.log('[jmcl/VERBOSE] ' + s);
}

Log.prototype.e = function(s){
    this.c.log('[jmcl/ERR] ' + s);
}

Log.prototype.w = function(s){
    this.c.log('[jmcl/WARN] ' + s);
}
// export default {
//     i: function(s){
//         console.log('[jmcl/INFO] ' + s);
//     },
    
//     v: function(s){
//         console.log('[jmcl/VERBOSE] ' + s);
//     },
    
//     e: function(s){
//         console.log('[jmcl/ERR] ' + s);
//     },
    
//     w: function(s){
//         console.log('[jmcl/WARN] ' + s);
//     }

// }