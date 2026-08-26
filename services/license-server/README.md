# Counselor Desk 授权服务

这是独立的商业授权、订单、设备和更新清单服务。它只处理许可证和订单元数据，不读取学生台账、业务记录、业务附件、模型 API Key、模型输入文本或 AI 输出。

## 目录

- `service.cjs`：内存契约服务，仅用于本地测试，不得直接用于生产。
- `postgres-store.cjs`：参数化 SQL、事务、订单幂等、设备、撤销、webhook、邮件 outbox 和更新清单持久化。
- `production.cjs`：订单、手动确认付款、许可证签发、激活、刷新、换机、退款撤销和审计规则。
- `kms-signer.cjs`：KMS/HSM 签名边界，只接受外部 `sign(bytes)` 适配器，不读取私钥文件。
- `server.cjs`：Fastify HTTP 路由、管理员认证、限流和错误码映射。
- `bootstrap.cjs`：生产启动器，要求部署环境注入 PostgreSQL、KMS signer、管理员密钥和订单访问密钥。
- `schema.sql` / `migrate.cjs`：只增不删的授权数据库初始化与迁移。
- `admin.html`：同源管理员操作页，不显示学生内容。
- `customer.html`：同源客户购买、订单查询和许可证文件交付页；订单访问令牌只在当前会话中使用，默认服务端有效期为 7 天。
- `commercial-operations.cjs`：试用授权、批量许可证、学校/学院授权池和匿名指标的输入白名单；不接触学生数据。

## 本地检查

```powershell
pnpm --dir services/license-server install --frozen-lockfile
pnpm --dir services/license-server schema:check
pnpm --dir services/license-server test
```

`service.cjs` 的内存签名器仅用于契约测试。生产服务必须运行 `bootstrap.cjs`，并提供：

```text
CWB_LICENSE_DATABASE_URL
CWB_LICENSE_DATABASE_SSL=true
CWB_ORDER_ACCESS_SECRET
CWB_LICENSE_SIGNER_MODULE
CWB_LICENSE_MAILER_MODULE（可选；未配置时只保留邮件 outbox）
CWB_LICENSE_WEBHOOK_SECRET（仅适用于采用 timestamp.rawBody HMAC 规则的支付平台）
CWB_LICENSE_CORS_ORIGINS（生产必填；逗号分隔的精确 HTTPS 来源，禁止通配符）
CWB_TELEMETRY_SALT（可选；启用匿名指标时必须配置，必须使用部署侧随机高熵值）
```

生产还必须设置 `CWB_LICENSE_ENV=production`。启动器会拒绝 PostgreSQL 未启用 TLS、CORS 未配置、关闭 HTTPS 或设置共享明文管理员令牌的环境。生产管理员认证只能使用数据库中的哈希 API Key；先完成迁移，再在受控终端运行 `pnpm --dir services/license-server admin:key`，原文只显示一次。部署变量样例见 [.env.example](./.env.example)，其中所有地址和凭据都必须替换为部署系统注入的真实值。

`CWB_LICENSE_SIGNER_MODULE` 是部署目录外的模块，导出 `createSigner()` 或 `signer`；签名器必须由 KMS/HSM 提供 Ed25519 签名，返回 `kid`、公钥和 `issue()`。仓库没有私钥读取后门。`bootstrap.cjs` 只接受显式 `CWB_LICENSE_ENV=production` 的生产启动；本地内存契约请使用 `service.cjs` 和测试夹具，不要用生产启动器代替本地服务。生产环境还应通过 HTTPS 反向代理暴露服务，不直接把 Fastify 监听端口开放到公网。

## 固定兑换码活动

前瞻版普通永久更新版和贡献者/老客户永久 AI 增强版可以使用长期固定兑换码。固定码不是多人共用的正式许可证，而是一次兑换凭据：服务端按 `SHA-256(code)` 查找活动，为当前工作区签发独立的 Ed25519 许可证，再按正常设备流程激活。这样两个固定码不会共享 3 台设备的上限，也能针对工作区撤销和审计。

在受控终端执行 `node services/license-server/scripts/generate-redemption-codes.cjs` 一次。脚本只在终端显示两段明文，部署配置只保存输出的哈希。将哈希放进部署侧 `CWB_LICENSE_REDEMPTION_MODULE` 模块，例如：

```js
module.exports = { campaigns: [
  { campaign_id: 'pilot-standard-perpetual', plan: 'standard_perpetual', code_hash: '<sha256>', status: 'active' },
  { campaign_id: 'contributor-ai-perpetual', plan: 'ai_perpetual', code_hash: '<sha256>', status: 'active' },
] };
```

明文固定码只通过受控的私密渠道发给对应用户，不写入 Git、客户端、普通日志、学生数据备份或公开网盘。暂停活动时把 `status` 改为 `paused` 并重启授权服务；已兑换工作区的许可证不会被自动删除。接口为 `POST /api/v1/licenses/redeem`，客户端只提交兑换码、工作区 ID 和设备 ID，服务端不记录兑换码原文。

如果配置 `CWB_LICENSE_PAYMENT_MODULE`，部署模块可以导出 `createPaymentAdapter()`，并实现 `createCheckout(order)` 返回受 HTTPS 校验的支付地址。支付地址只作为用户“去支付”入口；订单是否已付款仍只能由 `/api/v1/orders/webhook` 的支付平台签名验真或受控管理员确认决定。仓库不包含任何链动小铺或其他支付平台的私有 API 实现，避免把未核实的平台接口写死进产品。

生产管理员 Key 存在 `cwb_admin_api_keys` 的 SHA-256 哈希中。迁移完成后可在受控终端运行 `pnpm --dir services/license-server admin:key` 生成一次性 Key；命令只显示一次原文，之后请求使用 `x-admin-api-key`。生产启动器不接受 `CWB_LICENSE_ADMIN_TOKEN`，也不接受把所有管理员共用一个环境变量；如需轮换，新增受控 Key 后撤销旧 Key，并保留审计记录。

## 面向客户的实际闭环

普通客户只需要看到“选择档位 → 支付 → 获取许可证 → 下载应用 → 激活”。支付平台负责收款和带签名的订单通知；本服务负责订单幂等、签发独立许可证、设备上限、撤销和受保护取件；安装包由独立下载中心托管。当前仓库不包含真实支付账户、商户密钥、KMS 私钥、邮件账号或下载 CDN，因此 `/customer` 是候选交付页，不是已经上线的商城。

链动小铺官网（<https://www.ldxp.cn/>）公开说明支持数字虚拟商品自动发货，适合小规模试运营；在未取得其官方 webhook/API 和退款通知规则前，不要把它的前端跳转当作支付确认。Cloud Studio（<https://cloudstudio.net/>）适合开发和预览，不作为生产授权服务、数据库或私钥托管平台。平台选型、预生成库存许可证的试运营边界和正式自动发码方案见 [商业闭环与平台选型方案](../../docs/upgrade/commercial-closed-loop-v4.9.0.md)。

## 关键流程

```text
产品目录（服务端价格）
→ 幂等创建订单
→ 支付平台签名 webhook 或管理员确认
→ 事务签发独立许可证
→ 邮件 outbox / 订单页交付
→ 首次在线激活并绑定工作区与设备
→ 刷新、解绑、换机、退款撤销
```

客户端接口：

```text
GET  /api/v1/health
GET  /api/v1/products
POST /api/v1/orders
GET  /api/v1/orders/:id
GET  /api/v1/orders/:id/license
POST /api/v1/licenses/activate
POST /api/v1/licenses/refresh
POST /api/v1/licenses/deactivate
POST /api/v1/licenses/:id/devices/:deviceId/deactivate
GET  /api/v1/licenses/:id/devices
GET  /api/v1/updates/latest
```

管理员接口：

```text
POST /api/v1/admin/licenses/manual
POST /api/v1/admin/trials
POST /api/v1/admin/license-batches
POST /api/v1/admin/organizations
GET  /api/v1/admin/organizations/:id/workspaces
POST /api/v1/admin/orders/:id/confirm
POST /api/v1/admin/licenses/:id/revoke
GET  /api/v1/admin/licenses/:id/devices
GET  /api/v1/admin/orders/:id
GET  /api/v1/admin/audit
POST /api/v1/admin/email-outbox/:id/retry
POST /api/v1/admin/updates/publish
POST /api/v1/orders/webhook
```

管理员 API Key 只适合受控管理面；正式环境应在反向代理或身份系统后再启用，并设置限流、来源限制、审计和密钥轮换。支付 webhook 必须先由支付适配器完成签名、时间窗和事件 ID 验证，客户端不能声明支付成功。

客户交付页位于 `/customer`。创建订单会返回一次订单访问令牌；客户端不得把它拼入 URL 或普通日志，查询订单和下载许可证都必须通过 `x-order-access-token`。`GET /api/v1/orders/:id` 只返回脱敏许可证摘要，`GET /api/v1/orders/:id/license` 仅在订单已完成、许可证仍 active 且访问令牌匹配时返回 `application/json` 的 `.cwb-license` 内容，并设置 `Cache-Control: no-store`。退款或撤销后下载会被拒绝。服务端只记录订单/许可证编号和动作，不记录 token 内容。
新订单取件令牌默认 7 天有效，旧订单缺少过期字段时按创建时间兼容计算；过期返回 `ORDER_ACCESS_EXPIRED`。`GET /api/v1/orders/:id` 只返回脱敏许可证摘要，`GET /api/v1/orders/:id/license` 仅在订单已完成、许可证仍 active 且访问令牌匹配时返回 `application/json` 的 `.cwb-license` 内容，并设置 `Cache-Control: no-store`。退款或撤销后下载会被拒绝。服务端只记录订单/许可证编号和动作，不记录 token 内容。

生产 CORS 只允许 `CWB_LICENSE_CORS_ORIGINS` 中的完整 HTTPS 来源；禁止 `*`、路径、查询、片段、凭据和非本地 HTTP 来源。服务默认强制 HTTPS，预检请求同样执行 HTTPS 校验；交付存储、支付验真、邮件和更新清单不可用时返回明确 503 错误码。客户页响应使用 no-store、禁止 iframe 嵌入和最小内容安全策略。

`payment-webhook.cjs` 提供通用 HMAC 验真示例，支持 `t=...,v1=...` 或独立时间戳/签名头；具有专用规则的支付平台应使用官方 SDK/适配器，通过 `verifyWebhook` 注入，不能把通用 HMAC 规则当成所有平台的验签实现。

## 商业运营边界

试用许可证最多 30 天，仍使用四档产品中的一个签名档位并由 `expires_at` 控制到期；批量授权最多 500 份，每份许可证仍独立签名、独立设备上限和独立撤销。学校/学院授权池以组织和工作区映射管理，不把一个许可证扩大成无限工作区，也不改变单工作区绑定规则。

匿名指标必须由客户主动选择开启。服务端只接受固定事件和固定属性，安装标识用 `CWB_TELEMETRY_SALT` 做 HMAC 后保存；不保存原始安装标识、IP 作为业务字段、学生标识、附件、模型请求内容、模型输入/输出或 API Key。未配置盐值时指标接口明确返回 `TELEMETRY_NOT_CONFIGURED`。

## 数据边界

数据库表只包含产品、订单、许可证、设备、webhook 事件、邮件 outbox、更新清单和管理员审计。许可证 token 只在签发/交付和客户端授权链路中使用；业务备份、学生导出、手机交换包和普通日志不携带 token、模型 Key 或学生数据。生产数据库需要独立备份、访问控制、加密存储和恢复演练。

## 发布前仍需外部配置

前瞻候选服务器的隔离部署记录和链动小铺逐行库存导出流程见 [前瞻候选服务器部署记录](../../docs/upgrade/staging-server-deployment-v4.9.0.md)。前瞻版导出的是独立签名许可证库存；平台只能负责逐张发货，不能替代授权服务的激活、设备绑定和撤销。平台付款成功、退款和订单绑定仍需取得其官方 webhook/API 规则后再接入。

代码和契约测试通过不等于服务已经上线。正式商业交付前必须取得真实 PostgreSQL、KMS/HSM、公钥轮换、支付 webhook、邮件服务、域名/HTTPS、更新 CDN、Windows 证书、macOS Developer ID 和公证凭据，并在 Windows、macOS、断网、换机、退款和恢复环境取得证据。
