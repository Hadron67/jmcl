import { request, RequestOptions } from 'https';
import { URL } from 'url';

export interface AjaxOptions {
    // host: string;
    port: number;
    // path: string;
    url: URL;
    method: string;
    headers: {[s: string]: string};
    body?: string;
}

export class StatusError {
    constructor(public code: number, public data: string) {}
}

function checkStatus({status, data}: {status: number, data: string}): string {
    if (status === 200) {
        return data;
    } else {
        throw new StatusError(status, data);
    }
}

export function ajax(opt: AjaxOptions): Promise<{status: number, data: string}> {
    const reqOpt: RequestOptions = {
        host: opt.url.hostname,
        port: opt.port,
        path: opt.url.pathname,
        method: opt.method,
        headers : opt.headers
    };
    return new Promise((acc, rej) => {
        let data = '';
        const req = request(reqOpt, res => {
            res.setEncoding('utf-8');
            res.on('data', d => data += d);
            res.on('end', () => acc({ status: res.statusCode, data }));
        });
        req.on('error', e => rej(e));
        opt.body && req.write(opt.body);
        req.end();
    });
}

export async function httpsGet(url: URL, headers: any = {}): Promise<string> {
    const result = await ajax({
        url,
        port: 443,
        method: 'GET',
        headers
    });
    return checkStatus(result);
}
export async function httpsPost(url: URL, data: any, headers?: any): Promise<string> {
    var postBody = JSON.stringify(data);
    const result = await ajax({
        url,
        port: 443,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(postBody.length),
            ...headers
        },
        body: postBody
    });
    return checkStatus(result);
}