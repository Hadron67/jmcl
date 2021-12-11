import ts from 'rollup-plugin-typescript2';
import sourcemaps from 'rollup-plugin-sourcemaps';
import typescript from 'typescript';
import json from '@rollup/plugin-json';

export default {
    input: 'src/main.ts',
    external: [
        'fs',
        'child_process',
        'https',
        'readline',
        'stream',
        'os',
        'path',
        'events',
        'yauzl',
        'url',
        'fs-extra',
        'crypto',
        'chalk',
        'net',
        '@xboxreplay/xboxlive-auth',
        '@azure/msal-node'
    ],

    output: [
        {
            format: 'cjs',
            name: 'jmcl',
            file: 'lib/jmcl.js',
            sourcemap: true
        }
    ],
    plugins:[
        sourcemaps(),
        ts({ typescript }),
        json(),
    ]
}