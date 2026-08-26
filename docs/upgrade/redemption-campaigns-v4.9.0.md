# v4.9.0 固定兑换码活动说明

更新时间：2026-08-23

## 给用户的实际体验

工作台的“商业授权”窗口支持正式许可证和三类前瞻/友情服务输入：

- 正式许可证：购买后获得的 `CWB-LIC-1...` 内容或许可证文件。
- 基础前瞻兑换码：维护者私下发放的 `CWB-REDEEM-1...` 内容，解锁普通永久更新版体验，不解锁 AI。
- AI 前瞻兑换码：维护者私下发放的 `CWB-REDEEM-1...` 内容，解锁永久 AI 增强版体验，但默认仍使用用户自己的模型 Key。
- 友情 AI 兑换码：在 AI 许可证已经激活后，在“配置友情 AI”入口单独输入；它只授予开发者托管 AI 服务资格，不替换许可证，也不把 API Key 下发到客户端。

基础码和 AI 码通过“激活许可证”输入；友情 AI 码通过“配置友情 AI”输入。系统在线核验后，为当前工作区建立独立的许可证或托管资格。一个活动码可以发给多位前瞻体验用户，这就是产品层面的“通用密钥”体验；它不是写死在客户端的万能解锁字符串。正式购买仍按订单签发独立许可证，不能用前瞻码代替商品订单。

工作区 ID 由工作区设置自动生成并持久化。没有组织代码或使用旧版回退值的工作区也会得到自己的随机 ID，因此空组织代码不会把多人绑定到同一个许可证。工作区恢复时要保留 `settings.workspace_id`；复制工作区会复制其授权身份，换机应恢复原工作区而不是复制后继续共用身份。客户端兑换、刷新和设备管理始终使用同一个稳定 ID。

## 通用兑换码和许可证的区别

固定码是可多人使用的活动兑换凭据，不是共享许可证。每个工作区兑换后都有独立的 `license_id`、设备列表和审计记录。这样不会让所有用户共同消耗同一个 3 台设备上限，也可以在某个工作区泄露或退款时单独撤销。相同工作区重复输入同一活动码时返回原许可证，不重复生成。活动码一旦泄露，维护者可以暂停整个活动；已经签发的工作区许可证仍可单独撤销。

## 管理者生成和部署

在授权服务仓库的受控终端执行：

```text
node services/license-server/scripts/generate-redemption-codes.cjs
```

脚本会生成两段高熵明文：

1. `pilot-standard-perpetual`，档位 `standard_perpetual`，普通功能与永久更新。
2. `contributor-ai-perpetual`，档位 `ai_perpetual`，AI 权益与永久更新。
3. `friendship-managed-relay`，档位标记为 `ai_perpetual`，metadata 中必须有 `managed_relay: true`，只用于开通开发者友情 AI 托管服务。

明文只显示一次，应立即存入密码管理器并通过私密渠道发放。服务部署模块只保存哈希：

```js
module.exports = { campaigns: [
  { campaign_id: 'pilot-standard-perpetual', plan: 'standard_perpetual', code_hash: '<sha256>', status: 'active', metadata: {} },
  { campaign_id: 'contributor-ai-perpetual', plan: 'ai_perpetual', code_hash: '<sha256>', status: 'active', metadata: {} },
  { campaign_id: 'friendship-managed-relay', plan: 'ai_perpetual', code_hash: '<sha256>', status: 'active', metadata: { managed_relay: true, kind: 'managed_relay' } },
] };
```

通过 `CWB_LICENSE_REDEMPTION_MODULE` 指向这个部署侧模块。它不能放在本项目 Git、客户端、普通环境文件、业务备份、订单邮件日志或公开网盘。服务启动时把哈希同步到 `cwb_license_redemption_campaigns`；兑换关系写入 `cwb_license_redemptions`。

## 暂停、撤销和审计

- 暂停活动：把活动状态改为 `paused`，重启授权服务；之后新兑换失败。
- 已兑换许可证：不会因暂停活动自动失效，仍按正式许可证的设备、刷新和撤销规则管理。
- 换机：在设备管理中撤销旧设备，再让新设备重新在线激活。
- 审计：只记录活动编号、许可证编号、工作区编号、设备编号和动作，不记录兑换码原文。

接口：基础/AI 码使用 `POST /api/v1/licenses/redeem`；友情 AI 码使用 `POST /api/v1/licenses/managed-relay/redeem`，请求必须带已激活许可证的设备凭据。客户端不接受本地伪造的“兑换成功”状态；服务端返回的签名许可证或托管资格必须经过服务端校验，短期 Relay assertion 还要再次由 Relay 验签。

## 友情 AI 的运行边界

- 友情码只保存哈希；服务端建立 `cwb_license_relay_grants` 资格记录，按工作区和 AI 许可证幂等。
- 客户端只拿 15 分钟有效的托管 Relay assertion；维护者 API Key 只放在 Relay 服务器环境变量或 KMS 中。
- Relay 默认按每个许可证每日 30 次成功请求限流，可通过部署环境变量调整；额度不是买断授权的一部分。
- 不记录完整输入内容、完整响应、音频或 API Key，只记录授权编号、用途、时间和错误码等最小审计信息。
- 用户界面会弹出感谢说明：服务由开发者自费提供，上游波动可能导致暂时不可用，AI 输出仍需人工确认。

服务端还会校验活动记录的 `product_id`。活动码所属产品为空时按当前授权服务产品初始化，配置了其他产品标识的活动码会被拒绝，避免错误配置把兑换权益签发到不匹配的产品。

## 当前限制

本实现已完成产品和授权服务代码、迁移和契约测试；真实固定码明文不得写进本仓库，生产部署侧的 KMS、PostgreSQL、HTTPS、限流和托管 API Key 仍需单独配置。通用兑换码是权宜之计：它适合前瞻体验和老用户支持，不适合替代正式订单许可证，也不能防止获得明文的人继续转发。不要把测试环境生成的码发给用户，也不要在聊天记录、截图或公开文档中粘贴生产明文兑换码。
