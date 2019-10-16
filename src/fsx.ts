import * as fs from 'fs';
import * as pathd from 'path';

interface FileInfo {
    file: string; 
    isDir: boolean;
};

function rmFile(file: fs.PathLike){
    return new Promise((resolve, reject) => {
        fs.unlink(file, err => err ? reject(err) : resolve());
    });
}

export function rmdir(dir: fs.PathLike){
    return new Promise((resolve, reject) => {
        fs.rmdir(dir, err => err ? reject(err) : resolve());
    });
}


function ls(dir: string): Promise<FileInfo[]> {
    return new Promise<FileInfo[]>((resolve, reject) => {
        let ret: FileInfo[] = [];
        fs.readdir(dir, (err, files) => {
            if (err){
                reject(err);
            }
            else if (files.length > 0){
                let count = 0;
                for (let file of files){
                    fs.stat(pathd.join(dir, file), (err, stat) => {
                        if (!err){
                            ret.push({file, isDir: stat.isDirectory()});
                        }
                        count++;
                        if (count >= files.length){
                            resolve(ret);
                        }
                    });
                }
            }
            else {
                resolve([]);
            }
        });
    });
}

export function emptyDir(dir: string){
    async function emptyOne(dir: string, top: boolean){
        let list = await ls(dir);
        top && (list = list.filter(({file, isDir}) => !isDir || file.charAt(0) !== '.'));
        let pr = list.map(({file, isDir}) => { 
            file = pathd.join(dir, file);
            return isDir ? emptyOne(file, false).then(() => rmdir(file)) : rmFile(file);
        })
        await Promise.all(pr);
    }
    return emptyOne(dir, true);
}