# 依赖与单文件发布清单

更新时间：2026-08-19

本项目源码按模块维护，正式网页交付通过 `scripts/build-release.js` 生成单文件 HTML。单文件是分发格式，不是源码维护格式；修改运行库、许可证或构建替换规则时必须同时更新本清单和发布验证记录。

## 运行时依赖

| 组件 | 当前来源/版本事实 | 用途 | 交付方式 | 维护要求 |
| --- | --- | --- | --- | --- |
| SheetJS `xlsx` | `package.json` 固定为 `0.20.3` CDN tarball；`vendor/xlsx.full.min.js` 为离线副本 | Excel/CSV 解析与导出 | 普通网页加载 vendor；单文件内联 | 关注解析安全、许可证和中文编码回归 |
| Argon2 | `vendor/argon2-bundled.min.js`，浏览器 WASM/JS bundle | 加密备份口令派生与校验 | 普通网页加载 vendor；单文件内联 | 不能把界面锁误称为 Argon2 数据库加密；升级后必须验证旧备份恢复 |
| JSZip | `vendor/jszip.min.js` | 照片/附件交换包和压缩处理 | 普通网页加载 vendor；单文件内联 | 保留路径遍历、压缩比和大小限制回归 |
| ECharts | `vendor/echarts.min.js`，当前 bundle 暴露 `6.1.0` 版本标识 | 统计图表 | 普通网页加载 vendor；单文件内联 | 升级后检查图表空数据、窄屏和导出表现 |
| Electron / electron-builder | `package.json` 与 `desktop/package.json` 的锁定依赖 | Windows/macOS 桌面运行和打包 | 仅桌面构建链 | 依赖升级必须跑 SQLite、附件、备份和包级烟测 |
| jsdom / Playwright Core | 开发依赖 | DOM 合同、浏览器和 UI 回归 | 不进入产品 | 测试环境结果不能替代目标浏览器实测 |
| Fastify / `@fastify/rate-limit` / `pg` | `services/license-server/pnpm-lock.yaml`，独立服务依赖 | 授权服务 HTTP、限流和 PostgreSQL | 不进入桌面/网页包，单独部署 | 生产服务必须按服务目录 lockfile 安装，不能把数据库或授权依赖打进客户端 |

## 构建边界

- `index.html` 保留源代码脚本引用，便于开发和按模块审查。
- `scripts/build-release.js` 会把 `xlsx`、Argon2、JSZip、ECharts、v4/v8 runtime、AI、就业、业务和导入 worker 内联到单文件。
- `xlsx` 使用 binary-safe 的 base64 data URL；其他文本运行库以内联脚本注入，避免离线包依赖旁边的 vendor 目录。
- `scripts/build-package.js` 在便携包中复制用户文档、许可证、截图、vendor 版本和脱敏样表，但会拒绝内部开发资料、`.git` 和 `node_modules`。
- 单文件离线包的大小、最终 HTML SHA-256 和附件名称只在最终产物生成后记录；源码修改期间不把开发输出哈希当作发布哈希。

## 升级流程

1. 确认上游项目、版本、许可证和安全公告；不直接覆盖 vendor 文件。
2. 更新 package/lock、vendor 文件、第三方说明和本清单。
3. 运行内联脚本检查、导入兼容、离线构建、备份恢复、图片/附件和完整发布测试。
4. 用真实脱敏表格验证中文编码、日期、公式文本、空值和异常文件；用旧 `.cwbk` 验证恢复。
5. 生成最终离线包并记录 SHA-256；确认 Release 附件、Pages 和 README 来自同一 Tag。

## 当前现实限制

- 单文件交付便于离线携带，但会把多个运行库集中到一个下载文件中，加载时间受设备和浏览器影响。
- 单文件并不能让第三方库“自动更新”；安全补丁必须重新导入 vendor、重新构建和重新发布。
- 浏览器运行库加载失败时，应显示能力检查和应急导出提示，不能静默继续把数据写入不可靠的兼容路径。
- 依赖清单不代表已经完成供应链签名或代码签名；Windows/macOS 产品签名和 macOS 公证仍是独立发布工作。
- 商业授权服务的私钥、订单访问密钥、管理员密钥、支付凭据、SMTP 凭据和数据库 URL 不属于依赖清单，必须由部署密钥系统注入。

## v4.5.0 交付证据

v4.5.0 的单文件离线包大小为 `13,282,191` bytes，SHA-256 为 `1356bd6d9d831a8a664b651f351b65dc941b1eb30c83cfecbc175fa3510946d7`；Windows/macOS 资产大小和 digest、三份清单摘要已回填到[发布收尾记录](./release-v4.5.0.md)。正式证据来自[公开 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.5.0)和 [Web-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.5.0/Web-SHA256.txt)，不使用开发目录中间产物替代。

## v4.4.6 历史交付证据

v4.4.6 的单文件离线包为 `CounselorDesk-v4.4.6-Offline.html`，Release 大小为 13,151,347 bytes，SHA-256 为 `387d7bd7e7efcd58cb79edc6bc99d4dacab32f93b2833114222e0202ce3255e9`。最终文件来自 [v4.4.6 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.4.6)，对应 [Web-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.4.6/Web-SHA256.txt)；它不是开发目录中间产物的哈希。
