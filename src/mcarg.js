export function MCArg(temp){
    this.argTemp = temp;
    this.argv = {};
}
MCArg.prototype.arg = function(name, v){
    this.argv[name] = v;
    return this;
}
MCArg.prototype.toString = function(){
    var ret = this.argTemp;
    for(var name in this.argv){
        ret = ret.replace('${' + name + '}', this.argv[name]);
    }
    return ret;
}
