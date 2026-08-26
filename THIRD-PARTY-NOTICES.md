# 第三方组件说明

本项目使用开源组件完成电子表格解析、图表展示、压缩、备份加密和桌面构建。Counselor Desk 产品本身采用仓库根目录的专有商业许可；第三方组件不因产品商业化而改变其原有许可证。

正式发行包必须同时保留本文件、对应依赖的许可证文本和版权声明。下表是当前直接依赖与已随发行包交付的组件清单；间接依赖以各包管理器锁文件和发行包中的 notices 为准。升级依赖时必须重新核对上游许可证、版本和安全公告。

## 直接依赖

| 组件 | 用途 | 许可证/来源说明 |
| --- | --- | --- |
| SheetJS `xlsx` 0.20.3 | XLSX/CSV 解析与导出 | Apache-2.0；以 `package.json` 固定 tarball 和上游发布说明为准 |
| Argon2 浏览器 bundle | 备份口令派生 | 以 `vendor/argon2-bundled.min.js` 随附的上游版权/许可证为准 |
| JSZip | 交换包压缩 | MIT |
| ECharts | 统计图表 | Apache-2.0 |
| Electron | 桌面运行时 | MIT |
| Electron Builder | Windows/macOS 构建 | MIT |
| Electron Updater | 桌面更新 | MIT |
| `hash-wasm` | 哈希/容量相关计算 | MIT |
| `qrcode` | 局域网配对二维码 | MIT |
| `selfsigned` | 测试 HTTPS 证书 | MIT，仅用于测试和开发夹具 |
| `jsdom` | DOM 契约测试 | MIT，仅用于测试 |
| `playwright-core` | 浏览器验收 | Apache-2.0，仅用于测试 |
| Fastify | 独立授权服务 HTTP 层 | MIT，仅部署在 `services/license-server` |
| `@fastify/rate-limit` | 授权服务限流 | MIT，仅部署在 `services/license-server` |
| `pg` | 授权服务 PostgreSQL 驱动 | MIT，仅部署在 `services/license-server` |

## 产品代码和外部服务

- `src/`、`desktop/`、`scripts/` 和本服务的业务代码属于 Counselor Desk 专有产品，具体授权以 [LICENSE](./LICENSE) 为准。
- Ed25519 私钥、KMS/HSM、支付平台、SMTP/邮件服务、更新 CDN 和代码签名证书不属于仓库内容，也不应被提交。
- 本文件不是对间接依赖许可证的替代；发布流水线应从锁文件生成完整依赖清单，并在交付包中保存对应 notices。
