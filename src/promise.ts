import * as fs from 'fs';
import * as cpc from 'child_process';
import * as https from 'https';
import * as readline from 'readline';
import { Writable } from 'stream';

export function pass<T>(arg: T): Promise<T>{
    return new Promise<T>(function(acc, reject){
        acc(arg);
    });
}
export function reject<T>(reason: T): PromiseLike<T>{
    return new Promise<T>(function(acc, reject){
        reject(reason);
    });
}
export function fileExists(fn: fs.PathLike): Promise<boolean>{
    return new Promise<boolean>((acc, reject) => {
        fs.exists(fn, exi => acc(exi));
    });
}
export function mkdir(path: fs.PathLike, mask: string | number){
    return new Promise<void>(function(acc, rej){
        fs.mkdir(path, mask, function(err){
            err ? rej(err) : acc();
        });
    });
}
export async function mkdirIfNotExists(path: fs.PathLike, mask: string | number){
    if (!await fileExists(path)){
        await mkdir(path, mask);
    }
}
export function readFile(fn: fs.PathLike): Promise<string>{
    return new Promise(function(acc, reject){
        fs.readFile(fn, function(err, data){
            err ? reject(err) : acc(data.toString());
        });
    }) as Promise<string>;
}
export function writeFile(fn: fs.PathLike, s: any){
    return new Promise(function(acc, reject){
        fs.writeFile(fn, s, function(err){
            err ? reject(err) : acc();
        });
    });
}
export function exec(cmd: string, args: string[], stdout, stderr){
    return new Promise(function(acc, reject){
        let p = cpc.spawn(cmd, args);
        p.stdout.pipe(stdout);
        p.stderr.pipe(stderr);
        p.on('exit', () => acc());
        p.on('error', err => reject(err));
        // var pr = cpc.exec(cmd, function(err, stdout, stderr){
        //     err ? reject(err) : acc();
        // });
        // pr.stdout.pipe(stdout);
        // pr.stderr.pipe(stderr);
    });
}
export interface AjaxOptions {
    host: string;
    port: number;
    path: string;
    method: string;
    headers: {[s: string]: string};
    body?: string;
}
export function ajax(opt: AjaxOptions): Promise<string>{
    var reqOpt = {
        host: opt.host,
        port: opt.port,
        path: opt.path,
        method: opt.method,
        headers : opt.headers
    };
    return new Promise((acc, rej) => {
        var data = '';
        var req = https.request(opt, res => {
            res.setEncoding('utf-8');
            res.on('data', d => data += d);
            res.on('end', () => acc(data));
        });
        req.on('error', e => rej(e));
        opt.body && req.write(opt.body);
        req.end();
    }) as Promise<string>;
}
export function httpsGet(host: string, path: string): Promise<string>{
    return ajax({
        host,
        path,
        port: 443,
        method: 'GET',
        headers: {}
    });
}
export function httpsPost(host: string, path: string, data: any): Promise<string>{
    var postBody = JSON.stringify(data);
    return ajax({
        host,
        path,
        port: 443,
        method: 'POST',
        headers : {
            'Content-Type': 'application/json',
            'Content-Length': String(postBody.length)
        },
        body: postBody
    });
}
export function input(question: string, hidden: boolean = false): Promise<string>{
    var mutableStdout = new Writable({
        write(chunk, encoding, callback) {
            if (muted)
                process.stdout.write(chunk as string, encoding);
            callback();
        }
    });
    var muted = true;
    var rl = readline.createInterface({
        input: process.stdin,
        output: hidden ? mutableStdout : process.stdout,
        terminal: true
    });
    return new Promise(function(acc, rej){
        muted = true;
        rl.question(question, function(answer){
            console.log('');
            rl.close();
            acc(answer);
        });
        muted = false;
    }) as Promise<string>;
}
