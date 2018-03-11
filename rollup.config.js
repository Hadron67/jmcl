
export default {
    input: 'src/main.js',
    external: ['fs', 'child_process', 'https', 'readline', 'stream'],

    output: [
        {
            format: 'cjs',
            name: 'jmcl',
            file: 'lib/jmcl.js'
        }
    ]
}