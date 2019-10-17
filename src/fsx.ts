import * as fs from 'fs';
import { createHash } from 'crypto';

// interface FileInfo {
//     file: string; 
//     isDir: boolean;
// };

// function rmFile(file: fs.PathLike){
//     return new Promise((resolve, reject) => {
//         fs.unlink(file, err => err ? reject(err) : resolve());
//     });
// }
// export function mkdir(path: fs.PathLike, mask: string | number){
//     return new Promise<void>(function(acc, rej){
//         fs.mkdir(path, mask, function(err){
//             err ? rej(err) : acc();
//         });
//     });
// }
// export function rmdir(dir: fs.PathLike){
//     return new Promise((resolve, reject) => {
//         fs.rmdir(dir, err => err ? reject(err) : resolve());
//     });
// }
export function exists(fn: fs.PathLike): Promise<boolean>{
    return new Promise<boolean>((acc, reject) => {
        fs.exists(fn, exi => acc(exi));
    });
}

export function readFile(fn: fs.PathLike): Promise<string>{
    return new Promise<string>(function(acc, reject){
        fs.readFile(fn, function(err, data){
            err ? reject(err) : acc(data.toString());
        });
    });
}
export function writeFile(fn: fs.PathLike, s: any){
    return new Promise(function(acc, reject){
        fs.writeFile(fn, s, function(err){
            err ? reject(err) : acc();
        });
    });
}
export function fileSHA1(f: fs.PathLike){
    return new Promise<string>((resolve, reject) => {
        let hash = createHash('sha1');
        let fd = fs.createReadStream(f);
        fd.on('close', () => {
            hash.end();
            resolve(hash.read().toString('hex'));
        });
    });
}
// function ls(dir: string): Promise<FileInfo[]> {
//     return new Promise<FileInfo[]>((resolve, reject) => {
//         let ret: FileInfo[] = [];
//         fs.readdir(dir, (err, files) => {
//             if (err){
//                 reject(err);
//             }
//             else if (files.length > 0){
//                 let count = 0;
//                 for (let file of files){
//                     fs.stat(pathd.join(dir, file), (err, stat) => {
//                         if (!err){
//                             ret.push({file, isDir: stat.isDirectory()});
//                         }
//                         count++;
//                         if (count >= files.length){
//                             resolve(ret);
//                         }
//                     });
//                 }
//             }
//             else {
//                 resolve([]);
//             }
//         });
//     });
// }

// export function emptyDir(dir: string){
//     async function emptyOne(dir: string, top: boolean){
//         let list = await ls(dir);
//         top && (list = list.filter(({file, isDir}) => !isDir || file.charAt(0) !== '.'));
//         let pr = list.map(({file, isDir}) => { 
//             file = pathd.join(dir, file);
//             return isDir ? emptyOne(file, false).then(() => rmdir(file)) : rmFile(file);
//         })
//         await Promise.all(pr);
//     }
//     return emptyOne(dir, true);
// }