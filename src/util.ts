import { createHash } from "crypto";

export function randHex(len: number){
    var ret = '';
    while(len --> 0){
        ret += (Math.round((Math.random() * 100)) % 16).toString(16);
    }
    return ret;
}
export function sha1sum(s: string){
    let hash = createHash('sha1');
    hash.write(s);
    hash.end();
    return hash.read().toString('hex');
}