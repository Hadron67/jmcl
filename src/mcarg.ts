export class MCArg {
    argv: {[s: string]: string} = {};
    constructor(public argTemp: string){}
    arg(name: string, v: string){
        this.argv[name] = v;
        return this;
    }
    toString(){
        var ret = this.argTemp;
        for(var name in this.argv){
            ret = ret.replace('${' + name + '}', this.argv[name]);
        }
        return ret;
    }
    
}
