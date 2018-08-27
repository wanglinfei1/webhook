const COS = require('cos-nodejs-sdk-v5');

// https://github.com/leizongmin/node-rd 目录遍历
const glob = require('glob');
const path = require('path');
const fs = require('fs');
const config = require('./config');
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

const MIME = {
  'hqx': 'application/mac-binhex40',
  'cpt': 'application/mac-compactpro',
  'csv': 'text/x-comma-separated-values',
  'bin': 'application/macbinary',
  'dms': 'application/octet-stream',
  'lha': 'application/octet-stream',
  'lzh': 'application/octet-stream',
  'exe': 'application/octet-stream',
  'class': 'application/octet-stream',
  'psd': 'application/x-photoshop',
  'so': 'application/octet-stream',
  'sea': 'application/octet-stream',
  'dll': 'application/octet-stream',
  'oda': 'application/oda',
  'pdf': 'application/pdf',
  'ai': 'application/postscript',
  'eps': 'application/postscript',
  'ps': 'application/postscript',
  'smi': 'application/smil',
  'smil': 'application/smil',
  'mif': 'application/vnd.mif',
  'xls': 'application/excel',
  'ppt': 'application/powerpoint',
  'wbxml': 'application/wbxml',
  'wmlc': 'application/wmlc',
  'dcr': 'application/x-director',
  'dir': 'application/x-director',
  'dxr': 'application/x-director',
  'dvi': 'application/x-dvi',
  'gtar': 'application/x-gtar',
  'gz': 'application/x-gzip',
  'php': 'application/x-httpd-php',
  'php4': 'application/x-httpd-php',
  'php3': 'application/x-httpd-php',
  'phtml': 'application/x-httpd-php',
  'phps': 'application/x-httpd-php-source',
  'js': 'application/x-javascript',
  'swf': 'application/x-shockwave-flash',
  'sit': 'application/x-stuffit',
  'tar': 'application/x-tar',
  'tgz': 'application/x-tar',
  'xhtml': 'application/xhtml+xml',
  'xht': 'application/xhtml+xml',
  'zip': 'application/x-zip',
  'mid': 'audio/midi',
  'midi': 'audio/midi',
  'mpga': 'audio/mpeg',
  'mp2': 'audio/mpeg',
  'mp3': 'audio/mpeg',
  'aif': 'audio/x-aiff',
  'aiff': 'audio/x-aiff',
  'aifc': 'audio/x-aiff',
  'ram': 'audio/x-pn-realaudio',
  'rm': 'audio/x-pn-realaudio',
  'rpm': 'audio/x-pn-realaudio-plugin',
  'ra': 'audio/x-realaudio',
  'rv': 'video/vnd.rn-realvideo',
  'wav': 'audio/x-wav',
  'bmp': 'image/bmp',
  'gif': 'image/gif',
  'jpeg': 'image/jpeg',
  'jpg': 'image/jpeg',
  'jpe': 'image/jpeg',
  'png': 'image/png',
  'tiff': 'image/tiff',
  'tif': 'image/tiff',
  'css': 'text/css',
  'html': 'text/html',
  'htm': 'text/html',
  'shtml': 'text/html',
  'sh': 'text/plain',
  'txt': 'text/plain',
  'text': 'text/plain',
  'log': 'text/plain',
  'rtx': 'text/richtext',
  'rtf': 'text/rtf',
  'xml': 'text/xml',
  'xsl': 'text/xml',
  'mpeg': 'video/mpeg',
  'mpg': 'video/mpeg',
  'mpe': 'video/mpeg',
  'qt': 'video/quicktime',
  'mov': 'video/quicktime',
  'avi': 'video/x-msvideo',
  'movie': 'video/x-sgi-movie',
  'doc': 'application/msword',
  'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'word': 'application/msword',
  'xl': 'application/excel',
  'eml': 'message/rfc822',
  'json': 'application/json',
  'ttf': 'application/x-font-ttf',
  'svg': 'image/svg+xml',
  'eot': 'application/vnd.ms-fontobject',
  'woff': 'application/font-woff',
  'map': 'text/plain',
  'cur': 'application/octet-stream',
  'apk': 'application/vnd.android'

};

const cos = new COS({
  SecretId: config.SecretId,
  SecretKey: config.SecretKey,
});

class Deployer {
  constructor({
    // 是否在终端显示上传信息
    log = true,
    // 终端显示时的文件 host,只用在终端：）
    host = 'ftp.wzytop.top',
    // 建议使用默认配置，新浪存储参数，相当于一个域名下的一个子目录
    bucket = config.Bucket,
    // Bucket 所在区域
    region = config.Region,
    // 要部署在哪个文件夹下，会在部署每个文件时，和文件路径拼一起做为 key
    folder = '',
    // 要部署的文件（夹）目录
    dir = '',
    gitHubName='',
    // 使用 glob 匹配目录文件
    pattern = '**/*',
    // 已经存在的文件，要不要替换
    replace = false,
    // 在 replace 为 true,是否还检查文件的存在；开启会提示哪些文件被替换，不开启速度更快;replace为 false,check 强制设置为 true
    check = true,
    // 文件最大20M
    maxSize = 20,
    // 一次上传最大文件数
    maxCount = 200,
    // 是否使用缓存，默认为 true 缓存一年；false 缓存一分钟
    cache = true,
    // 上传完成回调，参数 result 返回结果
    finish = function() {}
  } = {}) {
    this.options = {
      log,
      host,
      bucket,
      region,
      folder,
      gitHubName,
      dir,
      pattern,
      replace,
      check,
      maxSize,
      maxCount,
      cache,
      finish
    };
    this.options.folder = this._getFolder();
    this.files = [];
    this.result = [];
    this._tip();
    this.put();
  }
  _warn(msg) {
    this._log(chalk.yellow('* ' + msg));
  }
  _tip() {
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
  _getFolder() {
    let folder = this.options.folder;
    let gitHubName = this.options.gitHubName;
    const uuid = getDecFlakeId();
    const length = uuid.length;

    // 如果没设置 folder 则使用随机 path
    if (!folder&&gitHubName!='wanglinfei1.github.io') {
      folder = path.join('u', uuid.substring(length, length - 1), uuid.substring(
          length - 1, length - 3), uuid.substring(length - 3, length - 6),
        uuid.substring(length - 6, 0));
    }
    return folder;
  }
  _log(msg) {
    if (this.options.log) {
      console.log(msg);
    }
  }
  _finish(msg) {
    const {
      finish,
      host
    } = this.options;
    this.result.push(msg);
    this.bar && this.bar.tick();
    if (this.result.length === this.files.length) {
      this._log(chalk.green(chalk.bold('DETAIL:')));
      this.result.forEach((val, key) => {
        if (val.type === 'error') {
          this._log(chalk.red(key + 1 + '.', '×', val.msg, chalk.underline(
            'http://' + host + '/' + val.key)));
        } else {
          this._log(chalk.green(key + 1 + '.', '√', val.msg, chalk.underline(
            'http://' + host + '/' + val.key)));
        }
      });


      if (typeof finish === 'function') {
        finish.call(this, this.result);
      }
    }
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
    ext = ext ? ext.slice(1) : 'unknown';
    const contentType = MIME[ext];
    const maxAge = cache ? 3600 * 24 * 365 : 60
    let expires = new Date();
    expires.setTime(expires.getTime() + maxAge * 1000);
    // expires = expires.toUTCString();

    const params = {
      Bucket: this.options.bucket,
      Region: this.options.region,
      Key: key,
      'ContentLength': stats.size,
      Body: file,
    };

    const upload = (msg = '') => {

      // TODO 文件现在都是下载
      cos.putObject(params, function(err, data) {
        if (err) {
          self._finish({
            type: 'error',
            msg: '上传失败',
            error: JSON.stringify(err),
            key
          });
        } else {
          self._finish({
            type: 'success',
            msg,
            key
          });
        }
      })
    };

    const checkFile = (key, cb) => {
      cos.headObject({
        Bucket: params.Bucket, //required
        Region: params.Region, //
        Key: key //查询key
      }, cb);
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
          console.log(err)
        } else {
          console.log(data)
        }
        if (err) {
          if (err.statusCode == 404) {
            upload();
          } else {
            self._finish({
              type: 'error',
              err: err,
              msg: '检查是否存在时出错',
              key
            });
          }

        } else {
          if (data.statusCode == 200) {
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
            if (err.statusCode == 404) {
              upload();
            } else {
              self._finish({
                type: 'error',
                msg: '检查是否存在时出错',
                err: err,
                key
              });
            }
          } else {
            if (data.statusCode == 200) {
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
    console.log(dir + '/' + pattern)
    glob(dir + '/' + pattern, {}, (err, files) => {
      let msg = '';
      files.forEach((f) => {
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
        return;
      }

      this.files.forEach(function(val) {
        const {
          f,
          key,
          s
        } = val;
        self._put(f, key, s);
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
}

module.exports = {
  Deployer
};
