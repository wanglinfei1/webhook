// https://github.com/mscdex/node-ftp
const Ftp = require('ftp');

// https://github.com/leizongmin/node-rd 目录遍历
const glob = require('glob');
const path = require('path');
const fs = require('fs');

// 上传进度条
const ProgressBar = require('progress');

// 终端样式
const chalk = require('chalk');

// 用于生成随机目录
const intformat = require('biguint-format'),
  FlakeId = require('flake-idgen')
const flakeIdGen = new FlakeId({
  id: 1
});
const getDecFlakeId = () => {
  return intformat(flakeIdGen.next(), 'dec');
};

class Deployer {
  constructor({
    // 是否在终端显示上传信息
    log = true,
    // ftp host
    host = '118.24.172.195',
    // ftp port
    port = 2121,
    // ftp user
    user = 'root',
    // ftp pass
    password = 'wang@1206',
    // 要部署在哪个文件夹下
    folder = '',
    // 要部署的文件（夹）目录
    dir = '',
    gitHubName='',
    // 使用 glob 匹配目录文件
    pattern = '**/*',
    // 已经存在的文件，要不要替换
    replace = true,
    // 在 replace 为 true,是否还检查文件的存在；开启会提示哪些文件被替换，不开启速度更快;replace为 false,check 强制设置为 true
    check = false,
    // 文件最大20M
    maxSize = 20,
    // 一次上传最大文件数
    maxCount = 200,
    // 上传完成回调，参数 result 返回结果
    finish = function () {}
  } = {}) {
    this.options = {
      log,
      host,
      port,
      user,
      password,
      folder,
      dir,
      gitHubName,
      pattern,
      replace,
      check,
      maxSize,
      maxCount,
      finish,
    };
    this.options.folder = this._getFolder();
    this.files = [];
    this.result = [];
    this._createFtp(()=>{
      this._tip();
      this.put();
    });

  }
  _getFolder() { // 如果没设置 folder 则使用随机 path
    let folder = this.options.folder;
    let gitHubName = this.options.gitHubName
    const uuid = getDecFlakeId();
    const length = uuid.length;

    if (!folder&&gitHubName!='wanglinfei1.github.io') {
      folder = path.join('u', uuid.substring(length, length - 1), uuid.substring(
        length - 1, length - 3), uuid.substring(length - 3, length - 6),
        uuid.substring(length - 6, 0));
    }
    return folder;
  }
  _createFtp(cb){
    var self = this;
    const {
      host,
      port,
      user,
      password
    } = this.options;
    if(!this._ftp){
      this._ftp = new Ftp();
    }
    this._ftp.on('ready', cb);
    try {
      this._ftp.connect({
        host,
        port,
        user,
        password
      });
      this._ftp.on('error',function(error){
        self._finish({
          type: 'ftp_connect_error',
          msg: error
        });
      });
      this._ftp.on('end',function(res){
        self._finish({
          type: 'ftp_connect_end',
          msg: res
        });
      });
    } catch (error) {
      self._finish({
        type: 'ftp_connect_error',
        msg: error
      });
    }

  }
  put() {
    const self = this;
    const {
      dir,
      pattern,
      folder,
      maxCount,
      finish
    } = this.options;
    this.files = [];
    glob(dir +'/'+ pattern, {}, (err, files) => {
      let msg = '';
      files.forEach((f) => {  // 获取要上传的文件列表
        const s = fs.statSync(f);
        let key = path.join(folder, path.relative(dir, f));
        key = key.split(path.sep).join('/');
        if (s.isFile()) {
          this.files.push({
            key,
            f,
            s
          });
        }
      });

      if (this.files.length === 0) {
        msg = '没有需要上传的文件:)';
      }

      if (this.files.length > maxCount) {
        msg = '文件数超出 maxCount(' + maxCount +
          '个) 配置，请减少上传文件，或个性 maxCount 参数：）';
      }

      if (msg && typeof finish === 'function') {
        self._warn(msg);
        finish.call(this, msg);
        this._ftp.end();
        return;
      }

      this.files.forEach(function (val) {
        const {
          f,
          key,
          s
        } = val;
        self._put(f, key, s); // 开始上传文件
      });

      if (this.options.log) {
        this.bar = new ProgressBar(chalk.green(chalk.bold('UPLOADING... ') +
          '|:bar| :rate00/bps :percent :etas'), {
          complete: '=',
          incomplete: '-',
          width: 20,
          total: this.files.length
        });
      }

    });
  }
  _put(filePath, key, stats) {
    const self = this;
    const file = fs.createReadStream(filePath);
    const {
      replace,
      maxSize,
      cache
    } = this.options;

    let ext = path.extname(filePath);
    const maxAge = cache ? 3600 * 24 * 365 : 60
    let expires = new Date();
    expires.setTime(expires.getTime() + maxAge * 1000);
    // expires = expires.toUTCString();

    const upload = (msg = '') => { // 上传文件
      const filePath = path.dirname(key);
      this._ftp.mkdir(filePath,true, err => {
        if(err){
          console.log(filePath, err);
          return;
        }
        this._ftp.put(file, key, error => {
          if (!error) {
            self._finish({
              type: 'success',
              msg,
              key
            });
          }else{
            self._finish({
              type: 'error',
              msg: '上传失败',
              error: error,
              key
            });
          }
        });
      });
    };

    const checkFile = (key, cb) => {
      this._ftp.list(key, (err, res) => {
        cb(err, res);
      });
    };

    if (stats.size / 1024 / 1024 > maxSize) {
      self._finish({
        type: 'error',
        msg: '文件大小超出 maxSize(' + maxSize + 'm) 配置',
        key
      });
      return;
    }

    if (!replace) { // 如果文件存在，并且不希望被替换，则上传之前，先检查一下，如果存在，则不处理
      checkFile(key, (err, data) => {
        if (err) {
          self._finish({
            type: 'error',
            msg: '检查是否存在时出错',
            key
          });
        } else {
          if (data.length > 0) {
            self._finish({
              type: 'success',
              msg: '已存在，不替换',
              key
            });
          } else {
            upload();
          }
        }
      });
    } else {
      if (this.options.check) {
        checkFile(key, (err, data) => {
          if (err) {
            self._finish({
              type: 'error',
              msg: '检查文件是否存在时出错',
              key
            });
          } else {
            if (data.length > 0) {
              upload('已存在，强制替换!');
            } else {
              upload();
            }
          }
        });
      } else {
        upload();
      }

    }
  }
  _tip() { // 操作提示
    const {
      host,
      replace,
      folder
    } = this.options;
    if (replace) {
      this._warn('设置了 replace:true，文件存在亦会强制替换');
    } else {
      this._warn('设置了 replace:false，文件存在则不上传替换');
    }
    if (folder.indexOf('u/') === 0) {
      this._warn('没有设置 folder, 将使用随机目录 ' + 'http://' + host + '/' + folder);
    }
  }
  _warn(msg) { // 输出提示语
    this._log(chalk.yellow('* ' + msg));
  }
  _log(msg) {
    if (this.options.log) {
      console.log(msg);
    }
  }
  _finish(msg) {
    const {
      finish,
      host,
      port
    } = this.options;
    this.result.push(msg);
    this.bar && this.bar.tick();
    if (this.result.length === this.files.length) {
      this._log(chalk.green(chalk.bold('DETAIL:')));
      this.result.forEach((val, key) => {
        if (val.type === 'error') {
          this._log(chalk.red(key + 1 + '.', '×', val.msg, chalk.underline(
            'ftp://' + host+':'+port+ '/' + val.key)));
        } else {
          this._log(chalk.green(key + 1 + '.', '√', val.msg, chalk.underline(
            'ftp://' + host+':'+port+ '/' + val.key)));
        }
      });


      if (typeof finish === 'function') {
        finish.call(this, this.result);
        this._ftp.end();
      }
    }
  }
}

module.exports = {
  Deployer
};
