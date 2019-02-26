const path = require('path');
// const fs = require('fs');
const shell = require('shelljs');
const reload = require('require-uncached');

// 部署工具
const os = require('./osIndex');
const mkdirp = require('mkdirp');

const ftp = require('./ftpIndex');

// 邮件通知
const nodemailer = require('nodemailer');

const prettyHtml = require('json-pretty-html').default;

let transporter = nodemailer.createTransport({
    host: 'smtp.163.com', // 使用内置传输发送邮件 查看支持列表：https://nodemailer.com/smtp/well-known/
    port: 465, // SMTP 端口
    secureConnection: true, // 使用 SSL
    secure: true,
    auth: {
        user: '15801351602@163.com',
        pass: 'wang126206',
    }
});

class Deployer {
    constructor({
            mailTo = '977696449@qq.com',
            data = {},
            gitlabDataPath = '_nginxroot_',
            // 使用 glob 匹配目录文件
            pattern = '**/*',
            callback = function() {}
        } = {}) {
            this.options = {
                mailTo,
                data,
                gitlabDataPath,
                pattern,
                callback
            };

            // 用于存储所有的部署信息，然后邮件通知
            this.results = [];
            this._deploy(() => {
                let {
                    data,
                    callback
                } = this.options;
                callback.call(this);
                let html = prettyHtml({
                    results: this.results,
                    data
                });
                let mailOptions = {
                    from: '"部署通知 "<15801351602@163.com>', // sender address
                    to: this.mailTo, // list of receivers
                    subject: 'NAME:' + (data.project ? data.project.name : '') + ' REF:' + data.ref + ' SHA:' + data.checkout_sha, // Subject line
                    // 发送text或者html格式
                    // text: 'Hello world?', // plain text body
                    html,
                    // html: fs.createReadStream(path.resolve(__dirname, 'email.html')) // 流
                };

                // send mail with defined transport object
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        return console.log(error);
                    }
                    console.log('Message sent: %s', info.messageId);
                    // Message sent: <04ec7731-cc68-1ef6-303c-61b0f796b78f@qq.com>
                });
            });
        }
        // 部署静态资源
    _deploy(callback) {
        let data = this.options.data;
        // 一、从 gitlab 上拉取数据，并进入到项目根目录
        // 仓库信息
        const repository = data.repository;
        const ref = data.ref || '';
        const {
            name,
            clone_url,
            ssh_url
        } = repository;

        if (!ref) {
            this.results.push({
                type: 'error',
                msg: 'No ref Name'
            });
            callback();
            return;
        }
        const refs = ref.split('/');
        const branchName = refs[refs.length - 1];
        // 没有分支，退出
        if (!branchName) {
            this.results.push({
                type: 'error',
                msg: 'No Branch Name'
            });
            callback();
            return;
        }

        // git clone 出来的项目目录
        if (name == 'wanglinfei1.github.io') {
            // 存放所有 gitlab 数据的目录
            var dataRoot = path.resolve(__dirname, '../');
            var cloneProject = path.join(this.options.gitlabDataPath.split('/')[0]); //+ ':' + branchName
            var projectRoot = path.resolve(__dirname, path.join(dataRoot, cloneProject));
            this.options.pattern = '/!(_webhook_)/**/*';
        } else {
            // 存放所有 gitlab 数据的目录
            var dataRoot = path.resolve(__dirname, '../', this.options.gitlabDataPath);
            var cloneProject = path.join(name); //+ ':' + branchName
            var projectRoot = path.resolve(__dirname, path.join(dataRoot, cloneProject));
        }
        // 检查是否有 git
        if (!shell.which('git')) {
            this.results.push({
                type: 'error',
                msg: 'Sorry This Script Requires Git'
            });
            callback();
            return;
        }

        // 创建存放数据的目录
        mkdirp.sync(dataRoot);

        // 进入到数据目录
        shell.cd(dataRoot);

        // clone 数据
        if (shell.exec('git clone -b ' + branchName + ' ' + clone_url + ' ' +
                cloneProject).code !== 0) {
            shell.echo('Error: Git Clone failed');
            this.results.push({
                type: 'error',
                msg: 'Git Clone Failed'
            });
        }

        // 进入到项目
        shell.cd(projectRoot);

        // 拉取最新数据
        if (shell.exec('git pull').code !== 0) {
            shell.echo('Error: Git Pull failed');
            this.results.push({
                type: 'error',
                msg: 'Git Pull Failed'
            });
            callback();
            return;
        }
        // 从根目录 ssfe.js 文件中获取相关的配置信息
        var ssfe = null;
        try {
            // 重复加载，避免使用缓存
            var ssfePath = path.resolve(__dirname, path.join(projectRoot, 'ssfe.js'));
            ssfe = reload(ssfePath);
        } catch (error) {
            this.results.push({
                type: 'error',
                msg: 'No ssfe.js'
            });
            callback();
            return;
        }

        // 用于文件部署结果
        let results = [];
        const deployerConfigs = this._getDeployerConfig('deployer', data,
            ssfe, projectRoot);
        const ftpDeployerConfigs = this._getDeployerConfig('ftpDeployer', data,
            ssfe, projectRoot);
        const finish = (result) => {
                results.push(result);
                if (results.length === deployerConfigs.length + ftpDeployerConfigs.length) {
                    this.results = this.results.concat(results);
                    callback();
                }
            }
            // 二、os 部署

        deployerConfigs.forEach(function(config) {
            console.log(config);
            if (!config.enable) {
                results.push({
                    type: 'error',
                    msg: 'Config Enable Is False'
                });
                return;
            }
            try {
                config.finish = finish;
                new os.Deployer(config);
            } catch (error) {
                results.push({
                    type: 'error',
                    msg: error
                });
            }
        });
        // 三、ftp 部署

        ftpDeployerConfigs, ftpDeployerConfigs.forEach(function(config) {
            console.log(config);
            if (!config.enable) {
                results.push({
                    type: 'error',
                    msg: 'Config Enable Is False'
                });
                return;
            }
            try {
                config.finish = finish;
                new ftp.Deployer(config);
            } catch (error) {
                results.push({
                    type: 'error',
                    msg: error
                });
            }
        });

        if (deployerConfigs.length + ftpDeployerConfigs.length === 0) {
            this.results.push({
                type: 'error',
                msg: 'No Deployer Config'
            });
            callback();
        }

    }
    _getDeployerConfig(type, data, ssfe, projectRoot) {
        let deployerConfigs = [];

        if (ssfe && ssfe[type]) {

            // 看配置是数组还是json
            if (Array.isArray(ssfe[type])) {
                deployerConfigs = ssfe[type];
            } else {
                deployerConfigs.push(ssfe[type]);
            }
            // 根据配置数组，遍历部署
            deployerConfigs.forEach((config, i) => {
                config = config || {};
                // 如果配置是方法，则从方法中提取配置
                if (typeof config === 'function') {
                    try {
                        config = config(data);
                    } catch (error) {
                        console.log(error);
                        this.results.push(error);
                    }
                }
                // 如果配置不存在，或者配置的路径不是字符串，配置肯定有问题
                if (typeof config.dir !== 'string') {
                    this.results.push({
                        type: 'error',
                        msg: 'No Cofing Or Config Dir Is Not A String'
                    });
                }

                // 默认配置 enable 为 true，即默认是开启上传的
                if (typeof config.enable === 'undefined') {
                    config.enable = true;
                }

                // 配置的路径是从项目根目录开始的，修正路径
                config.dir = path.resolve(__dirname, path.join(projectRoot, config.dir || ''));
                config.gitHubName = data && data.repository && data.repository.name;
                // 获取邮件，以最后一个配置的值为准
                this.mailTo = config.mailTo || this.mailTo || this.options.mailTo;
                config.pattern = config.pattern == '**/*' ? this.options.pattern : config.pattern;
                deployerConfigs[i] = config;

            });

        }
        return deployerConfigs;
    }
}

module.exports = Deployer;