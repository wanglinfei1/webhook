const url = require('url');
const path = require('path');
// const fs = require('fs');
const Deployer = require('./deployer.js');
const crypto = require('crypto');

class Webhook {
  constructor({
    // 写在 gitlab 上的请求地址的路径，如 http://example.com/hook
    hookPath = 'hook',
    // 执行结果的路径
    resultPath = 'result',
    // 存放拉取下来的数据
    gitlabDataPath = '_nginxroot_/_webhook_/',
    // 监听端口
    port = 8888,
    app = null,
  } = {}) {
    this.options = {
      hookPath,
      resultPath,
      gitlabDataPath,
      port,
      app
    };
    this._create();
  }

  // 创建服务，用于监听 gitlab hook 请求
  _create() {
    var self =this;
    // Verification function to check if it is actually GitHub who is POSTing here
    const verifyGitHub = (req) => {
      if (!req.headers['user-agent'].includes('GitHub-Hookshot')) {
        return false;
      }
      // Compare their hmac signature to our hmac signature
      // (hmac = hash-based message authentication code)
      const theirSignature = req.headers['x-hub-signature'];
      const payload = JSON.stringify(req.body);
      const secret = '64546676e145_4345_8523_8d52408b2319'; // TODO: Replace me
      const ourSignature = `sha1=${crypto.createHmac('sha1', secret).update(payload).digest('hex')}`;
      return crypto.timingSafeEqual(Buffer.from(theirSignature), Buffer.from(ourSignature));
    };

    const notAuthorized = (req, res) => {
      console.log('Someone who is NOT GitHub is calling, redirect them');
      res.redirect(301, 'http://wzytop.top'); // Redirect to domain root
    };

    const authorizationSuccessful = (req,res) => {
      console.log('GitHub is calling, do something here');
      this._hook(req, res);
    };
    if(this.options.app){
      var app = this.options.app;
    }else{
      const express = require('express');
      const bodyParser = require('body-parser');
      var app = express();
      app.use(bodyParser.json());
      app.listen(self.options.port,function(){
        console.log('Webhook service running at http://localhost:'+self.options.port);
      });
    }
    app.post('/**/hook', (req, res) => {
      if (verifyGitHub(req)) {
        // GitHub calling
        authorizationSuccessful(req,res);
      } else {
        // Someone else calling
        notAuthorized(req, res);
      }
    });
    app.all('/**/hook', notAuthorized); // Only webhook requests allowed at this address
  }

  // 处理 hook 请求
  _hook(req, res) {
     res.__timeoutid = setTimeout(() => {
       this._end(res, {
         type: 'error',
         msg: 'Response Timeout, No Deployer\'s Result'
       });
     }, 6e3);

      var hookData={};

      // 格式化 post 过来的 hook 数据
      try {
        hookData = req.body;
      } catch (e) {
        return this._end(res, e);
      }
      // 如果没有仓库信息不处理
      if (!hookData || !hookData.repository) {
        return;
      }

      this.results = {};

      // 尝试部署
      new Deployer({
        data: hookData,
        gitlabDataPath: this.options.gitlabDataPath,
        callback: function() {
          console.log(this.results);
        }
      });
      // 先把结果返回
      this._end(res, {
        MAIL: 'NAME:' + (hookData.project?(hookData.project.name||''):'') + ' REF:' + hookData.ref + ' SHA:' + hookData.checkout_sha||''
      });
  }

  _end(res, result) {

    if (res.__end) {
      return;
    }
    res.writeHead(200, {
      'content-type': 'application/json'
    });
    res.end(JSON.stringify(result));
    res.__end = true;
  }
}

module.exports = Webhook;
