import * as os from 'os';

var darwin2mac = {
    '0.1': '0.1',
    '0.2': '1.0.1',
    
};

export function getOS(): { osName: string, osV: string, osArch: string }{
    var sn: string = os.type();
    var v = os.release();
    var a = os.arch();
    switch(sn){
        case 'Darwin': 
            sn = 'osx';
            break;
        case 'Windows_NT':
            sn = 'windows';
            break;
        case 'Linux':
            sn = 'linux';
            break;
        default:
            sn = 'unknown';
    }

    if(a === 'x64'){
        a = 'x86';
    }

    return {
        osName: sn,
        osV: v,
        osArch: a
    };
}