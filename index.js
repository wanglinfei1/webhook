const Webhook = require('./webHook');

const port = 8888;

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());
app.listen(port, function() {
    console.log('Webhook service running at http://localhost:' + port);
});
app.all('/*', function(req, res, next) {
    console.log(req.path)
    if (req.path == '/' || req.path == '//') {
        res.redirect(301, 'http://wzytop.cn');
    }
    next();
});
var hook = new Webhook({
    port: port,
    app: app
});