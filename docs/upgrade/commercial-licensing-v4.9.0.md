# v4.9.0 商业授权与 AI 解锁

本文定义买断产品的授权边界。它不是支付平台、KMS 或最终用户许可协议的替代品。

## 四档产品

| 档位 | 核心业务 | AI | 更新 |
| --- | --- | --- | --- |
| 普通版 | 完整核心业务 | 锁定 | 当前主版本内的安全和必要修复 |
| 普通永久更新版 | 完整核心业务 | 锁定 | 后续核心版本 |
| AI 增强版 | 完整核心业务 | 当前主版本 AI | 当前主版本内更新 |
| 永久 AI 增强版 | 完整核心业务 | 全部 AI | 后续核心与 AI 版本 |

每个订单生成独立许可证，不使用共享万能 Key。许可证绑定一个工作区，默认最多 3 台设备；首个激活在线完成，最近一次在线校验后允许最多 30 天离线宽限。安全漏洞和严重数据修复不能因更新权益到期而阻断。

AI 模型 API Key、模型服务费用和第三方服务合规责任由客户承担，不包含在买断价内。

## 客户侧 API

```js
CWB.license.parse(input)
CWB.license.getState()
CWB.license.activate(input)
CWB.license.refresh()
CWB.license.deactivate()
CWB.license.listDevices()
CWB.license.exportReceipt()
CWB.entitlements.has(feature)
CWB.entitlements.require(feature)
CWB.update.check()
CWB.update.download()
CWB.update.install()
CWB.update.status()
```

令牌格式为：

```text
CWB-LIC-1.<base64url(payload)>.<base64url(ed25519_signature)>
```

签名私钥不进入客户端源码、构建包、日志、备份、交换包或本 Git 仓库。客户端只内置商业构建所需的公钥和服务地址；当前候选默认开发模式，生产构建必须显式注入 `CWB_LICENSE_MODE=commercial`、`CWB_LICENSE_PUBLIC_KEYS_JSON`、授权服务 `CWB_LICENSE_SERVICE_URL`、更新 feed `CWB_UPDATE_FEED_URL` 和签名清单地址 `CWB_UPDATE_MANIFEST_URL`。三个服务地址都必须是 HTTPS。`scripts/prepare-desktop-config.cjs` 会在打包前生成被 `.gitignore` 排除的 `desktop/license-config.generated.cjs`，Electron 主进程和 preload 优先读取该构建配置；缺少公钥、服务地址或不安全地址时直接失败，不能靠用户机器环境变量把已打包产品切回开发模式。

## 激活与 AI 访问

用户点击锁定的 AI 入口时看到当前档位、激活入口和模型费用说明。客户端先验证格式和签名，再由授权服务绑定工作区与设备。激活成功后刷新所有 AI 入口；设备达到上限时进入设备管理。没有许可证、许可证不属于本产品、版本不匹配、撤销、宽限期过期或检测到明显时钟回拨时，生成动作拒绝。

AI 入口同时有 UI 状态、业务层守卫和请求前守卫，不能通过改按钮样式绕过；设备上限也在客户端和服务端分别校验，当前上限固定为三台。已生成的历史草稿允许继续人工编辑和确认，许可证刷新失败不会无故删除已有业务记录。

## Electron 与网页的区别

Electron 是正式商业载体，许可证状态保存在操作系统 `safeStorage` 保护的专用文件。网页和单文件 HTML 是受限伴侣：可以展示授权入口，但浏览器本地存储不提供同等硬件安全边界，也不承诺不可破解 DRM。若未来要求更强保护，AI 请求必须始终经过在线 relay。

## 发码服务

`services/license-server/service.cjs` 保留为本地契约；生产候选使用 `postgres-store.cjs`、`production.cjs`、`server.cjs`、`kms-signer.cjs` 和 `bootstrap.cjs`。生产链条为：订单确认 → 服务端签发 → 邮件 outbox/订单页交付 → 首次激活 → 设备管理 → 刷新/换机/撤销。候选代码已经提供 PostgreSQL 参数化查询、事务、订单幂等、支付事件幂等、邮件失败重试、管理员审计、更新清单发布和 fail-closed 启动；`bootstrap.cjs` 还要求显式生产标记、PostgreSQL TLS、精确 CORS、HTTPS 和数据库哈希管理员 Key。真实数据库、KMS/HSM、支付、邮件、域名和告警仍需部署配置。

订单访问令牌由服务端的 `CWB_ORDER_ACCESS_SECRET` 对幂等键派生，服务端只保存哈希和过期时间；新订单默认有效 7 天，同一幂等请求在有效期内可以恢复同一访问令牌，过期后返回 `ORDER_ACCESS_EXPIRED`。不把客户令牌明文写入业务表。客户查询 `GET /api/v1/orders/:id` 必须同时提交该令牌，不能只凭可枚举的订单号读取状态。该密钥必须独立于许可证签名密钥，轮换前需要完成订单查询和售后迁移方案。

生产启动要求 `CWB_LICENSE_ENV=production`、`CWB_LICENSE_DATABASE_URL`、`CWB_LICENSE_DATABASE_SSL=true`、精确的 `CWB_LICENSE_CORS_ORIGINS`、`CWB_ORDER_ACCESS_SECRET` 和外置 `CWB_LICENSE_SIGNER_MODULE`；管理员只能使用 `cwb_admin_api_keys` 的哈希 Key，生产拒绝 `CWB_LICENSE_ADMIN_TOKEN`。签名模块必须来自 KMS/HSM，并返回 `kid`、公钥和签名函数；任何私钥文件、支付密钥、SMTP 密码、客户订单访问令牌都禁止进入源码、日志、备份、交换包或 Git。

服务端价格只从 `cwb_products` 读取，客户端提交的金额会被忽略；生产环境未配置正价时拒绝创建订单。支付成功只能来自验签 webhook 或受审计保护的管理员确认，不能信任客户端字段。退款事件会撤销关联许可证，但不删除客户业务数据。

## 客户购买与安全交付

授权服务新增同源客户页 `GET /customer`。客户页只读取服务端产品目录，创建订单时提交产品档位、邮箱和幂等键；订单访问令牌只保存在当前浏览器会话，不放入 URL、普通订单查询结果或工作台业务数据。当前代码同时支持管理员人工确认和支付 webhook，未部署真实支付适配器前不会把“创建订单”显示为“已付款”。

订单状态查询必须使用 `x-order-access-token`。普通 `GET /api/v1/orders/:id` 只返回订单状态和脱敏许可证摘要；签发完成后，只有同一订单访问令牌才能请求 `GET /api/v1/orders/:id/license` 下载 `.cwb-license` JSON 文件。下载响应设置 `no-store`，服务端审计只记订单、许可证编号和动作，不记激活码内容。退款或撤销后的许可证不能重新下载。

工作台的“导入许可证文件”只读取并填充激活输入框，不会自动绑定工作区；用户仍需明确点击激活。支持 `.cwb-license`、JSON、TXT 和二维码图片。二维码依赖浏览器 `BarcodeDetector`；能力缺失时必须降级到文件导入或粘贴，不把二维码识别失败误报成许可证签名失败。激活码和许可证文件都是高敏凭据，客户应离线保管，不放入 Git、网盘公开链接、业务备份或学生导出。

## 商业运营增强

P2 运营能力已经纳入候选服务层，但是否对外开放由生产运营配置决定：

- `/api/v1/admin/trials` 签发 1 至 30 天试用许可证；试用仍使用四档签名档位，过期由签名载荷 `expires_at` 控制。
- `/api/v1/admin/license-batches` 一次生成最多 500 份独立许可证；每份许可证保留独立 `license_id`、设备上限、工作区绑定和撤销能力，批次只是交付和售后分组。
- `/api/v1/admin/organizations` 管理学校/学院授权池和工作区映射；学校授权不等于把学生数据上传到授权服务，也不把一个工作区许可证扩大成无限工作区。
- `/api/v1/telemetry/events` 只接受主动同意后的匿名运行指标。客户端默认关闭，服务端只保存安装标识的 HMAC、版本、平台、允许清单内的事件和数值属性；未配置 `CWB_TELEMETRY_SALT` 时接口拒绝接收。

试用、批量和学校授权的 token 只在受保护管理员响应或受控交付链路中出现，禁止写入普通日志、业务备份、学生导出和邮件日志。价格、试用天数、批量数量上限、退款和售后策略以服务端配置与最终用户协议为准，客户端不写死商业价格。

## AI Relay 短期凭据

AI 增强许可证激活后，客户端按需向授权服务申请 `CWB-REL-1.<payload>.<signature>` 短期 assertion。Relay 校验签名、产品、AI 权益、设备和过期时间后才允许请求继续转发；assertion 不会发送给模型，也不会写入业务备份。客户端只在运行时内存中保存当前 assertion，刷新或失败后重新申请。Relay 仍属于提高普通复制成本的授权边界，不是不可破解 DRM；离线宽限期间的本地直连能力也不应对客户承诺为绝对防复制。
