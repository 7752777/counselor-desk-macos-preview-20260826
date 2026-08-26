# v4.9.0 商业授权候选收尾记录

更新时间：2026-08-24

> 2026-08-25 执行补充：友情 Relay 独立迁移、真实 staging 探针、网页包和产品 PDF 已完成；产品手册新增跨端、换机、持续补录和 macOS 交付边界，并扩展到 30 余张主要功能截图。Windows 安装器重建因 electron-builder 外部下载超时未完成，仍使用既有同版本候选包。公众号简介、欢迎语、关键词回复和两篇文章草稿已实际保存且未发表；两篇新图文源稿已经准备，待确认后上传截图并保存。链动小铺商品、百度网盘、真实支付和正式商业发布门禁仍未完成。

## 状态

`v4.9.0` 是当前 `codex/ai-upgrade` 工作区的商业授权候选，不是正式 Tag、Release 或客户下载包。当前正式维护版本仍为 `v4.8.5`；`v4.8.5` 的 Tag、Release、数据格式和历史资产不移动、不覆盖。

本记录只描述当前源码和当前代码状态已经通过的验证。生产授权服务的 PostgreSQL/KMS/Fastify 适配器、订单幂等、邮件 outbox 和清单发布接口已经落在候选源码中，但没有因为适配器存在而视为已部署；支付账号、真实 KMS、签名证书、域名/CDN 和购买流程仍需外部环境证据。

对外产品名称为“学工智伴 v4.9.0”。候选产品目录为普通版 10 元、普通永久更新版 20 元、AI 增强版 40 元、永久 AI 增强版 60 元。前瞻体验用户权益采用人工核验：普通永久更新版免费，AI 增强版 20 元，永久 AI 增强版 30 元；反馈建议被采纳并核验后可赠送永久 AI 增强版。产品手册、功能截图和完整用户路径见[学工智伴 v4.9.0 产品手册](../product-manual-v4.9.0.md)。

## 已落地范围

### 授权和权益

- `src/core/cwb-license.js` 提供 `CWB-LIC-1.<payload>.<signature>` 格式的 Ed25519 签名校验。
- 支持普通版、普通永久更新版、AI 增强版和永久 AI 增强版四档权益。
- 当前工作区按许可证保存授权状态，最多三台设备；首次在线激活，离线宽限 30 天，并检查过期、撤销版本、版本范围和明显时钟回拨。
- Electron 许可证状态写入系统 `safeStorage` 保护的独立文件，不进入 SQLite 业务集合、业务备份、手机交换包、学生导出或普通审计。
- `CWB.entitlements.has/require` 是统一能力判断。普通版在当前主版本可以更新，但不解锁 AI；AI 版本才开放 AI 入口。渲染层按钮只是可见提示，业务函数和请求发送前仍会再次校验。

### AI 边界

学生摘要、成绩解释、谈话 briefing、通知解析、工作留痕草稿、班级分析、就业/竞赛/科研助手、证书识别、心理语音、住宿/查课/查寝建议和来源检索均经过统一授权守卫。没有 AI 权益时不发送模型请求、不保存模型结果；有许可证但没有模型 API Key 时只提示配置模型。模型费用仍由用户自行承担。

AI 输出仍然只能是建议、草稿、解释或字段映射，不能自动写入学生事实、心理/危机、纪律、资助、预警、奖惩、住宿分配或审批结论。

### 更新

- `src/core/cwb-update.js` 提供清单格式、平台选择、HTTPS 地址、Ed25519 清单签名、包签名字段和 SHA-256 校验状态机；`desktop/update-runtime.cjs` 会先对清单原始 JSON 验签，再规范化和选择平台包。
- Electron 使用 `electron-updater 6.8.9` 作为运行时依赖，关闭自动下载和自动安装；检查、下载和安装前都会复核当前更新权益，支持取消下载。
- 安装前通过 Electron 主进程创建并校验真实工作区恢复点，检查 SQLite、WAL、附件索引、附件数量和附件可解密性；数据目录和业务数据路径不随版本更新改变，下载包损坏或安装调用失败会保留错误状态和回退提示。
- 浏览器和单文件离线包不承诺后台自动更新，只能检查版本并由用户获取新文件。

### 授权服务候选实现

- `services/license-server/postgres-store.cjs` 使用参数化 PostgreSQL 查询和事务，覆盖产品、订单、许可证、设备、撤销、webhook 幂等、邮件 outbox、更新清单和审计；`schema.sql` 与 `migrate.cjs` 只增量初始化，不删除业务数据。
- `services/license-server/kms-signer.cjs` 只接受外部 KMS/HSM `sign(bytes)` 适配器；源码没有生产私钥读取路径，`kid` 和公钥轮换由部署配置管理。
- `services/license-server/production.cjs` 已实现服务端价格读取、订单访问令牌幂等、人工确认付款、独立许可证签发、三设备边界、刷新、解绑、退款撤销、邮件失败重试和管理员审计。
- `services/license-server/server.cjs` 已提供 Fastify 路由、管理员认证、限流、错误码映射、订单查询、设备管理和更新清单发布入口；`bootstrap.cjs` 缺少数据库、签名器或管理员配置时会拒绝启动。
- `scripts/build-update-manifest.js` 与 `scripts/sign-update-manifest.js` 已把更新包哈希、包签名和清单签名拆为两个步骤；发布工作流增加 Windows/macOS 签名与公证凭据缺失时的 fail-closed 检查。

## 候选阶段自动化证据

以下是候选前一阶段已经通过的自动化验证清单。由于 2026-08-23 又修改了授权服务客户交付边界，不能把下列历史通过结果直接当作本次最终门禁；最终门禁必须在代码稳定后重新执行。

```text
node tests/license-contract.js
node tests/entitlements.js
node tests/update-contract.js
node tests/update-runtime.js
node tests/license-storage.js
node tests/license-server-contract.js
node tests/license-server-production-contract.js
node tests/license-postgres-contract.js
node tests/order-webhook-contract.js
node tests/update-manifest-builder.js
node tests/release-signing-contract.js
node tests/electron-surface.js
node tests/desktop-contract.js
node tests/desktop-student-card-mode.js
node tests/ai-contract.js
node tests/ai-governance-boundaries.js
pnpm test:license-ui
pnpm test:commercial
pnpm test:desktop
pnpm lint
pnpm check:public
pnpm check:secrets
pnpm check:docs
pnpm test:release
git diff --check
```

此前收口中发现并修复了预加载环境读取、浏览器 WebCrypto 公钥格式、更新清单原文验签和真实更新前恢复点接入问题。当前证据应以本记录末尾“最新局部收口证据”和最终门禁结果为准：

```text
候选前一阶段：pnpm test / build:release / check:public / check:secrets / check:docs / test:release / test:commercial / git diff --check 均曾通过
本次客户交付边界变更后的完整门禁：已通过（2026-08-23）
```

完整测试中的 `https://c.local/...` JSDOM 加载信息是测试夹具未提供外部脚本资源产生的环境噪声；相关用例继续通过，未发现应用运行期错误。

## 尚未具备的生产条件

- 生产服务适配器已经实现，但尚未连接真实 PostgreSQL、KMS/HSM、管理员身份系统、支付平台、邮件服务和审计告警；内存服务仍只用于契约测试。
- 支付 webhook 的路由、事件幂等和退款撤销契约已实现，真实支付平台验签、订单页面、邮件交付、自助换机和售后流程尚未接入真实服务商。
- 本地没有生产许可证公钥、更新 CDN、Windows 代码签名证书、macOS Developer ID 和公证凭据；这些不应写入 Git，需在部署平台配置。
- `electron-updater` 运行依赖已加入代码候选，`CWB_UPDATE_MANIFEST_URL` 已纳入桌面配置和商业构建检查，但没有真实更新清单、安装包签名和失败后跨重启回滚的设备证据。
- Windows、macOS、局域网手机、断网 30 天宽限、换机和真实购买链路仍需在候选冻结后验收。

## 兼容和恢复边界

保持 `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1`。v4.8.5 工作区可以直接打开，许可证状态、设备令牌和模型 API Key不进入业务迁移；更新前必须先生成加密恢复点，迁移失败不得覆盖当前有效工作区。

许可证丢失时，不能从业务备份恢复授权，也不存在绕过签名或恢复口令的后门。用户应通过授权服务重新激活；学生数据恢复和商业授权恢复是两条独立流程。

## 正式发布前门禁

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
pnpm test:commercial
git diff --check
```

只有上述命令和 Windows/macOS 实机、更新服务、签名/公证、激活/撤销/换机以及恢复证据全部齐备后，才可以创建 `v4.9.0` Tag、私有 Release 和客户分发包。当前候选不满足这一条件。

## 客户材料与本轮新增证据

- `docs/product-manual-v4.9.0.md`：单栏产品手册，包含目录、主要功能、AI 边界、授权档位、购买激活、无卸载更新、隐私、安全和 FAQ。
- `assets/screenshots/v4.9.0/`：58 张虚构演示数据截图；本次产品手册和公众号草稿按模块选取 30 余张，覆盖首页、台账、导入、档案、谈话、任务、课表、点名、查寝、成绩、奖助勤、就业、AI、备份、局域网和商业中心。
- `output/pdf/学工智伴-v4.9.0-产品手册.pdf`：按中文字体、目录、页码、表格和截图渲染检查的本地交付 PDF；`output/` 按仓库规则不进入源码提交，PDF 可由 `python scripts/build-product-manual-pdf.py` 重新生成。
- `docs/wechat-launch-article-v4.9.0.md`、`docs/wechat-activation-article-v4.9.0.md`：两篇用户向公众号图文源稿，正文按截图位置分段，后台只保存为草稿，不自动发表。
- `tests/commercial-product-catalog.js`：校验服务端四档目录、价格、产品名称、前瞻体验说明、二维码占位和购买链接 HTTPS 校验，并纳入 `pnpm test:commercial`。

本轮截图和 PDF 只证明候选界面与客户说明材料已经形成，不证明支付、KMS、邮件、CDN、代码签名、公证或真实安装升级已经上线。

## 2026-08-23 本轮收口补充

本轮继续完成了此前审计指出的四个缺口：

- `desktop/platform-signature.cjs` 已接入 Electron 更新 runtime，Windows Authenticode、macOS `codesign`/`spctl`/`pkgutil` 和未知平台拒绝路径均有注入式契约测试。
- `desktop/update-runtime.cjs` 已支持独立安装状态持久化、启动后目标版本判断、更新后工作区健康检查和恢复点回滚；Electron 主进程保留失败目录，不生成新密钥覆盖旧数据。
- `services/license-server/customer.html`、订单访问令牌交付接口和 `tests/customer-delivery-contract.js` 已落地。普通订单摘要不暴露激活码，已签发许可证通过 `GET /api/v1/orders/:id/license` 且必须携带订单令牌下载。
- 客户页补齐旧浏览器 `crypto.randomUUID` 回退、产品目录 HTML 转义、取件有效期显示和安全响应头；订单取件令牌默认 7 天有效，过期返回 `ORDER_ACCESS_EXPIRED`。
- 授权 HTTP 层补齐精确 CORS 来源、禁止通配/不安全来源、OPTIONS 预检、限流键清理和交付/支付/邮件/更新错误码映射；`customer-page-interaction` 与 HTTP/CORS 契约覆盖这些边界。
- 生产授权启动补齐配置 fail-closed：必须显式设置 `CWB_LICENSE_ENV=production`、PostgreSQL TLS 和精确 CORS；禁止关闭 HTTPS 或使用共享明文 `CWB_LICENSE_ADMIN_TOKEN`。直接迁移命令和管理员 Key 命令复用同一配置校验。
- `tests/activation-contract.js` 覆盖许可证文件导入不自动激活、二维码能力缺失降级提示；设备解绑服务接口继续由已有授权服务契约覆盖。

本轮实际通过：

```text
node tests/platform-signature.js
node tests/update-rollback.js
node tests/update-runtime.js
node tests/customer-delivery-contract.js
node tests/customer-page-interaction.js
node tests/license-server-http-contract.js
node tests/license-server-production-contract.js
node tests/activation-contract.js
node tests/desktop-contract.js
node scripts/build-release.js output/v4-preview.html
```

## 2026-08-23 最终候选门禁

在本轮代码和文档收口后重新执行了完整候选门禁：

```text
pnpm test                 PASS
pnpm lint                 PASS
pnpm build:release        PASS -> output/辅导员工作台.html
pnpm check:public         PASS
pnpm check:secrets        PASS
pnpm check:docs           PASS
pnpm test:release         PASS
pnpm test:commercial      PASS
git diff --check          PASS
```

这组结果只证明当前源码候选和注入式/契约测试通过，不替代真实生产服务、平台签名、公证、支付、邮件、CDN、跨重启升级和 Windows/macOS 实机证据。正式发布门槛仍保持不变。

这些是本轮修改后的局部和最终候选证据。局部 inject/内存 store 测试不能替代真实 PostgreSQL、KMS/HSM、支付、邮件、CDN、平台签名、公证、跨重启安装器和 Windows/macOS 实机，因此当前仍不创建 Tag、Release 或客户包。

## 2026-08-24 优先级调整与自动更新收口

本轮暂停继续扩展 AI 语音识别，优先完成长期数据维护和更新基础设施：

- 普通数组编辑、业务删除、批量删除和带附件删除统一使用持久化分区队列；自定义集合按整体 `custom` 分区串行化，减少连续操作中的覆盖和回滚竞态。
- Electron 商业候选增加启动后约 30 秒的首次自动检查和每 6 小时低频检查；发现新版本只向界面提示，不静默下载或安装。用户仍需在“版本更新”中确认下载、校验和重启安装。
- 更新状态通过受限 preload IPC 回传；安装前恢复点、清单签名、SHA-256、平台签名、重启后 SQLite/附件健康检查和失败回滚继续保留。
- 新增 `desktop/update-scheduler.cjs` 和 `tests/update-scheduler.js`，本地更新契约、运行时、失败回滚、调度器和桌面 IPC 定向测试已通过。

本轮不能改变正式发布边界：当前 GitHub 仓库没有配置 Windows/macOS 签名、公证、商业授权公钥、更新 CDN 等 Actions Secrets，尚未取得真实跨重启设备证据。因此本轮只把 `v4.9.0` 收口为可继续验收的工作区候选；不把自动化测试写成完整商业 Release，不创建没有签名和更新清单的客户安装包。

## 2026-08-24 用户优先级收口与发布对账

按本轮交付优先级，AI 语音识别暂停继续扩展，不作为本次候选发布的新增承诺。现有文本/图片/语音能力矩阵、许可证守卫、语音端点诊断和人工确认边界保留；真实中转站、麦克风、普通话识别质量和音频额度仍归入后续迭代。

本轮的关键目标已收口为“长期数据维护 + 桌面端自动更新 + 商业候选可推送”：

- 学生补录“学号、姓名、分数”会按稳定 `student_id`、当前学号和历史学号匹配，更新既有学生，不按姓名自动新建或合并；缺少唯一身份时进入人工核对。
- 普通编辑、批量编辑、删除、撤销和带附件业务记录都等待真实持久化后再提示成功；失败保留表单并恢复关联数据。学生基本资料变更不会覆盖成绩、谈话、住宿、奖惩、资助和心理等历史事实；进行中事项只同步当前快照。
- Electron 桌面端在启动约 30 秒后、之后每 6 小时低频检查一次。发现新版本只提示用户；用户确认后才下载、校验并重启安装，不要求先卸载旧版本，数据目录、SQLite 和附件仓保持不变。安装失败保留旧版本和恢复入口。
- 浏览器与单文件离线包不能在关闭页面后后台安装更新，用户需在“版本更新”中手动获取新文件，并先完成备份/导出；这不是 Electron 无卸载更新能力的替代品。
- 工作台商业中心已提供四档价格展示、购买/订单/许可证交付契约、激活入口、AI 锁定提示和更新入口；但真实微信商户支付、支付验签 webhook、邮件交付、正式下载 CDN、生产 KMS/HSM、平台签名和公证尚未连接，因此当前不能向客户宣称“已可付款后自动收码并正式升级”。

截至本记录更新，候选源码层面的自动化证据为：

```text
pnpm test                 PASS
pnpm lint                 PASS
pnpm build:release        PASS
pnpm check:public         PASS
pnpm check:secrets        PASS
pnpm check:docs           PASS
pnpm test:release         PASS
pnpm test:commercial      PASS
git diff --check          PASS
```

上述结果证明当前候选源码、契约测试和构建检查通过，不证明真实支付、生产授权、邮件、CDN、Windows/macOS 代码签名、公证、跨重启升级和客户设备恢复已经通过。当前正式维护版本仍是 `v4.8.5`；本次推送的是 `codex/ai-upgrade` 候选分支，不创建未经外部配置和实机证据支持的 `v4.9.0` Tag/Release。
