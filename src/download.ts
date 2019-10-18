import { URL } from 'url';
import { createWriteStream } from 'fs';
import { ensureDir } from 'fs-extra';
import { dirname } from 'path';
import { request } from 'https';
import { IncomingMessage } from 'http';

interface DownloadListener {
    onDone(i: number, doneCount: number): void;
    onError(i: number, doneCount: number): void;
};

interface DownloadProgressListener {
    count: number;
    totalSize: number;
    onProgress(percent: number): void;
};

export interface DownloadTask {
    url: URL;
    savePath: string;
};

export function downloadNP(url: URL, cb: (err: Error, res: IncomingMessage) => any){
    let req = request({
        host: url.hostname,
        port: 443,
        path: url.pathname,
        method: 'GET'
    }, res => { cb && cb(null, res); cb = null; });
    req.on('error', e => { cb && cb(e, null); cb = null; });
    req.end();
}

export function downloadToFileNP(url: URL, path: string, preg: DownloadProgressListener, cb: (err: Error) => any){
    downloadNP(url, (err, res) => {
        if (err){
            cb(err);
        }
        else {
            ensureDir(dirname(path)).then(() => {
                res.pipe(createWriteStream(path));
                res.on('end', () => { cb && cb(null); cb = null; });
                res.on('error', e => { cb && cb(e); cb = null; });
                if (preg){
                    const ds = preg.totalSize / preg.count;
                    let p = 0, recieved = 0;
                    res.on('data', d => {
                        recieved += d.length;
                        if (recieved > (p + 1) * ds){
                            p++;
                            preg.onProgress(recieved / preg.totalSize);
                        }
                    });
                }
            }).catch(e => { cb && cb(e); cb = null; });
        }
    });
}

export function downloadToFile(url: URL, path: string, p: DownloadProgressListener = null){
    return new Promise<void>((resolve, reject) => {
        downloadToFileNP(url, path, p, err => err ? reject(err) : resolve());
    });
}

export function download(url: URL){
    return new Promise<IncomingMessage>((resolve, reject) => {
        downloadNP(url, (err, res) => err ? reject(err) : resolve(res));
    });
}

export function downloadAll(tasks: DownloadTask[], limit: number, lis: DownloadListener){
    let sendPtr = 0, doneCount = 0;
    let workers: Promise<void>[] = [];
    let errors: Error[] = [];
    function worker(resolve: () => void, reject: (e: any) => any){
        if (sendPtr >= tasks.length){
            resolve();
        }
        else {
            let {savePath, url} = tasks[sendPtr];
            let id = sendPtr;
            sendPtr++;
            downloadToFileNP(url, savePath, null, err => {
                doneCount++;
                if (err){
                    errors.push(err);
                    lis.onError(id, doneCount);
                }
                else {
                    lis.onDone(id, doneCount);
                }
                worker(resolve, reject);
            });
        }
    }

    for (let i = 0; i < limit && i < tasks.length; i++){
        workers.push(new Promise<void>(worker));
    }

    return Promise.all(workers).then(() => {
        if (errors.length){
            throw new Error('Failed to download some files');
        }
    });
}

