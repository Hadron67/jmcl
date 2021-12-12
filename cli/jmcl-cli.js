const jmcl = require('../');

module.exports = async () => {
    const errors = [];
    try {
        await jmcl.main(process.argv.slice(2), errors);
        process.exitCode = 0;
    } catch(e) {
        if (typeof e !== 'string') {
            console.error(e);
        }
        for (const e of errors) {
            console.error(e);
        }
        process.exitCode = -1;
    }
}