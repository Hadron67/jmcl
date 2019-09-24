var jmcl = require('../index.js');

var ctx = new jmcl.Context(console);

jmcl.launch(ctx, {
    uname: 'Test',
    version: '1.14.4',
    offline: true
});