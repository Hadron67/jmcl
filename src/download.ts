import { download } from './ajax';
import { URL } from 'url';
import { createWriteStream } from 'fs';
import { ensureDir } from 'fs-extra';
import { dirname } from 'path';

class TaskNode {
    prev: TaskNode = null;
    next: TaskNode = null;

};

interface DownloadListener {
    onDone(): void;
    onError(): void;
};

interface Downloader {
    task(url: URL, path: string, lis: DownloadListener): Promise<void>;
    wait(): Promise<void>;
};

export function createDownloader(limit: number): Downloader{
    let taskCount = 0;
    let tasks: Promise<void>[] = [];

    let resolve: () => any = null;
    function done(){
        taskCount--;
        if (taskCount < limit && resolve){
            process.nextTick(resolve);
            resolve = null;
        }
    }
    function task(url: URL, path: string, lis: DownloadListener){
        if (taskCount >= limit){
            return new Promise<void>((resolve1, reject) => {
                resolve = resolve1;
            });
        }
        else {
            taskCount++;
            tasks.push(download(url).then(async (res) => {
                await ensureDir(dirname(path));
                res.pipe(createWriteStream(path));
                return new Promise<void>((resolve, reject) => {
                    res.on('end', () => {
                        lis.onDone();
                        done();
                        resolve();
                    });
                    res.on('error', e => {
                        lis.onError();
                        done();
                        reject(e);
                    });
                });
            }));
        }
    }
    async function wait(){
        await Promise.all(tasks);
    }

    return {
        task, wait
    }
}

export interface DownloadTask {
    url: URL;
    savePath: string;
};

export async function downloadAll(){

}

export async function downloadToFile(url: URL, path: string){
    const res = await download(url);
    return new Promise<void>((resolve, reject) => {
        res.pipe(createWriteStream(path));
        res.on('end', () => resolve());
        res.on('error', e => reject(e));
    });
}