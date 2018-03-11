import fs from 'fs';
import cpc from 'child_process';
import https from 'https';
import readline from 'readline';
import { Writable } from 'stream';

export function pass(arg){
    return new Promise(function(acc, reject){
        acc(arg);
    });
}
export function reject(reason){
    return new Promise(function(acc, reject){
        reject(reason);
    });
}
export function fileExists(fn){
    return new Promise(function(acc, reject){
        fs.exists(fn, function(exi){
            acc(exi);
        });
    });
}
export function mkdir(path, mask){
    return new Promise(function(acc, rej){
        fs.mkdir(path, mask, function(err){
            err ? rej(err) : acc();
        });
    });
}
export function mkdirIfNotExists(path, mask){
    return fileExists(path)
        .then(function(exi){
            if(!exi){
                return mkdir(path, mask);
            }
        });
}
export function readFile(fn){
    return new Promise(function(acc, reject){
        fs.readFile(fn, function(err, data){
            err ? reject(err) : acc(data.toString());
        });
    });
}
export function writeFile(fn, s){
    return new Promise(function(acc, reject){
        fs.writeFile(fn, s, function(err){
            err ? reject(err) : acc();
        });
    });
}
export function exec(cmd, stdout, stderr){
    return new Promise(function(acc, reject){
        var pr = cpc.exec(cmd, function(err, stdout, stderr){
            err ? reject(err) : acc();
        });
        pr.stdout.pipe(stdout);
        pr.stderr.pipe(stderr);
    });
}
export function httpsRequest(host, path, data){
    var postBody = JSON.stringify(data);
    var opt = {
        host: host,
        port: 443,
        path: path,
        method: 'POST',
        headers : {
            'Content-Type': 'application/json',
            'Content-Length': postBody.length
        }
    };
    return new Promise(function(acc, rej){
        var data = '';
        var req = https.request(opt, function(res){
            res.setEncoding('utf-8');
            res.on('data', function(d){
                data += d;
            });
            res.on('end', function(){
                acc(data);
            });
        });
        req.on('error', function(e){
            rej(e);
        });
        req.write(postBody);
        req.end();
    });
}
export function input(question, hidden){
    var mutableStdout = new Writable({
        write: function(chunk, encoding, callback) {
            if (this.muted)
                process.stdout.write(chunk, encoding);
            callback();
        }
    });
    var rl = readline.createInterface({
        input: process.stdin,
        output: !!hidden ? mutableStdout : process.stdout,
        terminal: true
    });
    return new Promise(function(acc, rej){
        mutableStdout.muted = true;
        rl.question(question, function(answer){
            console.log('');
            rl.close();
            acc(answer);
        });
        mutableStdout.muted = false;
    });
}
