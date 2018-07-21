import ts from 'rollup-plugin-typescript2';
import sourcemaps from 'rollup-plugin-sourcemaps';
import typescript from 'typescript';

export default {
    input: 'src/main.ts',
    external: ['fs', 'child_process', 'https', 'readline', 'stream', 'os'],

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
        ts({ typescript })
    ]
}