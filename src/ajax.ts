import { request } from 'https';
import { URL } from 'url';
import { Stream } from 'stream';
import { IncomingMessage } from 'http';

export interface AjaxOptions {
    // host: string;
    port: number;
    // path: string;
    url: URL;
    method: string;
    headers: {[s: string]: string};
    body?: string;
}
export function ajax(opt: AjaxOptions): Promise<string>{
    var reqOpt = {
        host: opt.url.hostname,
        port: opt.port,
        path: opt.url.pathname,
        method: opt.method,
        headers : opt.headers
    };
    return new Promise((acc, rej) => {
        var data = '';
        var req = request(reqOpt, res => {
            res.setEncoding('utf-8');
            res.on('data', d => data += d);
            res.on('end', () => acc(data));
        });
        req.on('error', e => rej(e));
        opt.body && req.write(opt.body);
        req.end();
    }) as Promise<string>;
}

export function httpsGet(url: URL): Promise<string>{
    return ajax({
        url,
        port: 443,
        method: 'GET',
        headers: {}
    });
}
export function httpsPost(url: URL, data: any): Promise<string>{
    var postBody = JSON.stringify(data);
    return ajax({
        url,
        port: 443,
        method: 'POST',
        headers : {
            'Content-Type': 'application/json',
            'Content-Length': String(postBody.length)
        },
        body: postBody
    });
}