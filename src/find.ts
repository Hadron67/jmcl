import { ls } from "./fsx";
import { join } from "path";

export async function findAssets(dir: string){
    let r = await Promise.all((await ls(dir))
        .filter(d => d.isDir)
        .map(d => ls(join(dir, d.file)))
    );
    if (r.length){
        return r.reduce((prev, cur) => prev.concat(cur)).filter(f => !f.isDir).map(f => f.file);
    } else {
        return [];
    }
    // return (await Promise.all((await ls(dir))
    //     .filter(d => d.isDir)
    //     .map(d => ls(join(dir, d.file)))
    // )).reduce((prev, cur) => prev.concat(cur)).filter(f => !f.isDir).map(f => f.file);
}

export async function findLibraries(dir: string){
    
}