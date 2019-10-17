import { Writable } from "stream";
import { createInterface } from 'readline';

export function input(question: string, hidden: boolean = false): Promise<string>{
    var mutableStdout = new Writable({
        write(chunk, encoding, callback) {
            if (muted)
                process.stdout.write(chunk as string, encoding);
            callback();
        }
    });
    var muted = true;
    var rl = createInterface({
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
