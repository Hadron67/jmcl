export function randHex(len){
    var ret = '';
    while(len --> 0){
        ret += (Math.round((Math.random() * 100)) % 16).toString(16);
    }
    return ret;
}
