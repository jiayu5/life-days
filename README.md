# Big Days

记录人生中重要的日子，看看从那天起已经走了多远。Big Days 以时间线卡片展示纪念日，也支持查看日期详情和经过或剩余的天数。

## 功能

- 新增、编辑和删除日期，为事件添加备注。
- 按日期浏览事件，查看时间间隔和天数。
- 支持邮箱验证码登录，事件按用户隔离存储。

## 项目结构

- `index.html`、`style.css`、`app.js`：页面、样式和交互。
- `dates.js`、`deck.js`、`ink.js`：日期计算、卡片浏览和视觉效果。
- `worker.js`、`auth.js`：静态资源、事件 API 和登录逻辑。
- `drizzle/`：D1 数据库建表迁移。
- `build.mjs`：将前端资源和服务端代码打包到 `dist/server/index.js`。

## 构建与运行

需要安装支持 ES modules 的 Node.js。在项目根目录运行：

```sh
node build.mjs
```

构建产物是一个包含静态资源的 Worker 模块，输出在 `dist/server/index.js`。运行完整应用需要支持 Worker 的运行环境，并绑定名为 `DB` 的 Cloudflare D1 数据库；按顺序执行 `drizzle/0000_events.sql` 和 `drizzle/0001_email_login.sql` 初始化数据库。仓库目前没有独立的本地服务器或部署配置，直接打开 HTML 文件无法使用事件 API。

## 登录配置

邮箱登录使用 Resend 发送验证码。运行环境需设置以下变量：

| 变量 | 用途 |
| --- | --- |
| `RESEND_API_KEY` | Resend API 密钥 |
| `EMAIL_FROM` | 发送验证码的邮箱地址 |
| `EMAIL_LOGIN_SECRET` | 用于验证码摘要的密钥 |
| `OWNER_LOGIN_EMAIL` | 主用户邮箱 |
| `EMAIL_LOGIN_AUDIENCE` | 可选；设为 `owner` 时只允许主用户邮箱登录 |
| `EMAIL_LOGIN_REQUIRED` | 可选；设为 `1` 时，邮箱登录未配置完整将拒绝访问 |

未配置完整的邮箱登录时，服务依赖托管环境提供的 `oai-authenticated-user-id` 请求头识别用户，因此自行部署时应配置邮箱登录，或确保该身份头只由可信的认证层提供。不要将密钥提交到仓库。

字体许可见 `bodoni-moda-OFL.txt`。
