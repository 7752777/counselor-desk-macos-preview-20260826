# 友情 AI 托管服务说明

更新时间：2026-08-25

## 给前瞻体验用户的实际说明

友情 AI 不是第四种商品，也不是把开发者的 API Key 复制给用户。它是给采纳建议、前瞻体验用户或开发者指定人员的服务资格：用户先激活 AI 增强版许可证，再在工作台的“商业授权”窗口输入友情 AI 码。成功后，平台 AI 服务可以使用开发者自费配置的受控 Relay。

界面会显示感谢说明：服务由开发者自费购买并免费提供；上游服务可能波动、拥堵或暂时不可用；不承诺无限额度；AI 输出仍然只是建议或草稿，不能替代老师确认。

## 三类码的边界

| 输入 | 作用 | 是否解锁 AI | 是否配置开发者 API |
| --- | --- | --- | --- |
| 基础前瞻码 | 建立普通永久更新版前瞻许可证 | 否 | 否 |
| AI 前瞻码 | 建立永久 AI 增强版前瞻许可证 | 是 | 否，默认使用体验者自己的 Key |
| 友情 AI 码 | 在现有 AI 许可证上建立托管资格 | 不单独提供许可证 | 是，通过服务端 Relay |

基础码、AI 码和友情 AI 码都只保存服务端哈希。正式订单仍然使用独立签名许可证；前瞻通用码不能当作正式支付凭证。

## 技术流程

```text
AI 许可证激活
  -> 友情码兑换
  -> cwb_license_relay_grants 记录当前工作区资格
  -> 请求前申请 15 分钟 CWB-REL-1 assertion
  -> Relay 验签、检查 managed_relay 和额度
  -> Relay 从服务端环境变量/KMS 读取 API Key
  -> 只转发脱敏请求，返回建议/草稿
```

托管 API Key 不进入桌面包、网页 HTML、许可证、兑换码、业务备份、手机交换包、Git、公众号或普通日志。Relay 不记录完整 Prompt、完整响应、音频或 Key；生产部署应将用途、时间、工作区哈希、耗时和错误码写入受控审计。

当前默认每日额度为每个 AI 许可证 30 次成功请求，可通过 `CWB_AI_MANAGED_DAILY_QUOTA` 调整。额度只由 Relay 服务端决定，用户界面必须把“服务暂时不可用”和“本地数据异常”区分开。

## 部署要求

生产环境至少需要：

- `CWB_LICENSE_REDEMPTION_MODULE` 中增加第三个活动 `friendship-managed-relay`，metadata 为 `{ managed_relay: true, kind: "managed_relay" }`；
- PostgreSQL 执行新增的 `cwb_license_relay_grants` 表迁移；
- Relay 使用与授权服务一致的公钥，开启 `AI_RELAY_REQUIRE_LICENSE=1`；
- `CWB_AI_MANAGED_API_KEY` 只放在服务器环境变量或 KMS，禁止写 `.env` 入 Git；
- 设置 `CWB_AI_MANAGED_DAILY_QUOTA`、HTTPS、精确 CORS、限流、监控和错误告警；
- 不把第三个码的明文粘贴到公众号、群公告、网盘或工单。

在受控服务器生成三枚明文的命令仍是：

```text
node services/license-server/scripts/generate-redemption-codes.cjs
```

命令输出只在受控终端显示一次。将三段明文存入密码管理器，将输出模板中的哈希写入部署侧模块；不要把包含明文的终端日志提交或发送。

## 最新验证记录（2026-08-25）

已完成真实前瞻服务器验证：

- PostgreSQL 已执行独立 `v4.9.0-managed-relay` 增量迁移；`cwb_license_redemption_campaigns`、`cwb_license_redemptions` 和 `cwb_license_relay_grants` 三张表均存在。
- 服务器活动配置已确认包含 `pilot-standard-perpetual`、`contributor-ai-perpetual` 和 `friendship-managed-relay` 三组活动，数据库只保存哈希。
- 通过公网 HTTPS 真实完成一次临时 AI 许可证签发、设备激活、友情码兑换、`managed_relay=true` Relay assertion 申请和测试许可证撤销；兑换码、许可证令牌和管理员凭据均未输出到日志。
- `OPTIONS https://license.windsky.store/api/ai/chat` 预检通过，Relay 公网入口仍只经 HTTPS 反向代理暴露。

未完成或有意未执行：

- 本次没有发送真实模型请求，未验证上游中转站的实际回答质量、额度扣减和费用；需要单独的低风险、无学生数据探针后再验收。
- 当前仍是 staging signer，不是 KMS/HSM；Windows/macOS 签名、公证、支付回调、退款回收、正式更新 CDN 和多设备实机仍不能视为完成。
- 服务器上的托管 API Key 只供 Relay 读取，未进入本项目、客户端、前瞻版交付包、公众号或普通备份；正式发布前仍建议轮换曾在对话中暴露过的上游 Key。
