

# webhook: 新浪体育 gitlab webhook 处理服务

## 使用方法

1. **安装**

```bash
  npm i --save git+ssh://git@git.staff.sina.com.cn:ssfe/webhook.git
```

2. **启动服务，建议用 pm2 来守护进程**
```js
// 参考 test/index.js
const Webhook = require('@ssfe/webhook');
new Webhook();
```

3. **使用2中得到的 url 和 token,在 gitlab 项目中设置 hook,http://git.staff.sina.com.cn/ssfe/{你的项目}/settings/integrations**

4. **在项目根目录，添加 ssfe.js，用于设置一些部署相关的参数，如：**
```js
module.exports = {

    // 如果有多份配置可以使用数组来存放配置，如一份配置用于部署长久缓存的文件，另一份配置用于部署没有缓存的文件（html）
    deployer: [{
            folder: 'ssfe/flowtest',
            dir: 'dist/',
            pattern: '**/*',
            replace: false,
            cache: true
        },

        // 还可以使用函数来返回配置，其中的 data 为 git仓库相关信息
        function (data) {
            return {
                folder: 'ssfe/flowtest',
                dir: ' html/',
                pattern: '**/*',
                replace: true,
                cache: false
            }
        },
    ],

    // 如果只是一份配置，可以直接写上配置
    ftpDeployer: {
        folder: 'ssfe/flowtest',
        dir: 'dist/',
        pattern: '**/*'
    }
};
```

5. **一些特别配置，如部署完成后，可以邮件通知；又如，可通过返回的 data 参数，来决定是否部署及部署参数：**
```js
module.exports = {
    deployer: {

        // 邮件通知，写上该参数，部署情况会通过邮件方式通知，多个邮箱可以用逗号隔开
        mailTo: 'daichang@staff.sina.com.cn, linfei6@staff.sina.com.cn',
        folder: 'ssfe/flowtest',
        dir: 'dist/',
        pattern: '**/*',
        replace: false,
        cache: true
    },
    ftpDeployer: function (data) {
        let config = {

            // 是否部署
            enable: false
        };
        if (data && data.commits && data.commits.length > 0) {
            const msg = data.commits[0].message;

            // 最新一条提交信息中包括 __FTPDEPLOY__ 这个触发关键词才部署
            if (msg.indexOf('__FTPDEPLOY__') >=0) {
                config = {
                    // 确认部署
                    enable: true,
                    folder: 'ssfe/flowtest_ftp',
                    dir: 'dist/',
                    pattern: '**/*'
                }
            }
        }
    }
};
```

6. **具体配置**
  - deployer 可设置为数组，元素可以为一个配置对象，或一个方法，方法可根据 data（git 仓库相关信息 见<http://git.staff.sina.com.cn/help/user/project/integrations/webhooks>） 参数返回不同的配置；最终会部署到 e.sinaimg.cn,详细参数见 <http://git.staff.sina.com.cn/ssfe/scs/>
  - ftpDeployer 类似 deployer，不同的是，最终会部署到对应的 ftp 上，如10.210.227.108,详细参数见 <http://git.staff.sina.com.cn/ssfe/ftp/>

