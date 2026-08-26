# 发布指南

## 当前 v4.9.1 前瞻版的发布边界

当前分支包含 AI 配置、导航历史/自定义分类、任务时间轴/甘特图和长期前瞻兑换码收口，但仍是候选工作区，不等于已经完成正式商业发布。前瞻体验阶段可以在授权服务部署两个活动码：普通永久更新版和永久 AI 增强版；活动码明文不得进入 Git、客户端或公开 Release。正式客户必须走独立签名许可证、支付确认和受保护下载。

本轮 PDF/UI 定向测试和兑换码契约测试通过后，最终发布仍需按一次完整门禁执行：

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

生产 KMS/PostgreSQL/HTTPS、支付 webhook、邮件、下载 CDN、Windows Authenticode、macOS Developer ID/公证和真实跨设备升级没有被本地契约测试替代。

本页面向维护者。目标是让网页、离线 HTML、Windows、macOS、README 和 Release 使用同一提交、同一数据格式、同一套事实说明。

## 当前发布线

`v4.9.1` 是当前工作区前瞻版，尚未替代已发布的 `v4.8.5`，也不把未签名/未公证安装包冒充正式商业稳定版。前瞻清单和下载目录必须先通过公网验收；没有这些证据时不得宣称软件内更新已上线。

### v4.9.1 前瞻版对账

| 项目 | 当前状态 |
| --- | --- |
| 工作区版本 | `4.9.1` |
| 候选分支 | `codex/ai-upgrade` |
| 授权核心 | 已实现签名解析、四档权益、AI 守卫、Electron `safeStorage` 状态和设备契约测试 |
| 更新核心 | 已实现清单/签名/哈希状态机、`electron-updater 6.8.9` 依赖、权益复核和取消入口 |
| 生产服务 | 候选源码已完成 PostgreSQL/KMS/Fastify/订单/webhook/outbox 适配器；真实数据库、KMS、支付、邮件和客户 CDN 尚未部署 |
| 商业构建 | `desktop:build:win` / `desktop:build:mac` 会先生成被忽略的桌面授权配置；正式 job 必须注入商业模式、公钥、授权 HTTPS 地址和更新 feed，否则 fail-closed |
| 平台发布 | 工作流已配置签名/公证凭据缺失即失败；当前没有真实 Windows 证书、macOS Developer ID 或公证证据 |
| 正式发布 | 未创建 `v4.9.0` Tag、Release 或客户分发包 |
| 证据 | [v4.9.1 前瞻版发布审计](./upgrade/release-v4.9.1.md) |

对外产品名称为“学工智伴”。前瞻版产品手册、四档价格、前瞻体验优惠、购买/激活/换机/更新路径和截图见[学工智伴 v4.9.1 产品手册](./product-manual-v4.9.1.md)；产品内和客户页使用同一组价格：10 元、20 元、40 元、60 元。价格和前瞻体验优惠属于当前商业展示口径，正式支付和订单服务仍以生产配置为准。

`v4.8.5` 是当前维护发布线，在 v4.8.3 的跨端高频页面边界之上，修复单文件离线图标外部依赖，增加 `file://` 全路由验收、完整 v4.8/AI 主测试门禁和本地 HTTPS/WebDAV 传输验收。仓库目前为私有；`v4.8.3`、`v4.8.2`、`v4.8.1`、`v4.8.0` 及更早版本的正式发布事实保留在对应历史收尾记录中，不得用旧产物证明新版本。正式 Tag、Release 资产和限制以[v4.8.5 发布收尾记录](./upgrade/release-v4.8.5.md)为准。

v4.9.0 候选新增客户 `/customer` 订单页和受令牌保护的许可证文件下载、平台签名验证器、独立更新状态文件和跨重启恢复点回滚。订单取件令牌默认 7 天有效，授权 HTTP 层只接受精确配置的 HTTPS CORS 来源，并通过错误码区分交付存储、支付验真、邮件和更新清单故障。它们已有契约测试，但只有真实 PostgreSQL/KMS、支付/邮件、CDN、Windows Authenticode、macOS Developer ID/公证和实机升级恢复证据齐全后，才能从候选改成正式商业 Release。候选测试不应生成或上传真实许可证私钥、激活码、客户订单令牌或学生数据。

生产授权服务还必须以 `CWB_LICENSE_ENV=production` 启动；启动前核对 PostgreSQL TLS、精确 CORS、HTTPS 强制和数据库哈希管理员 Key。忘记设置生产标记或误配置共享明文管理员令牌时，服务应直接拒绝启动。当前对账见[v4.9.0 实施对账与发布前审计](./upgrade/v4.9.0-implementation-reconciliation-2026-08-23.md)。

### v4.8.5 当前发布记录

| 项目 | 状态 |
| --- | --- |
| 工作区版本 | `4.8.5` |
| 发布分支 | `codex/ai-upgrade` |
| Tag | [`v4.8.5`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.5) |
| Release | [v4.8.5 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.8.5)，正式资产以该页面为准 |
| 发布提交 | `c04732900ee257f8bae02ad25cc1559dd2643bb8` |
| 发布门禁 | [Actions #32578966917](https://github.com/7752777/counselor-desk/actions/runs/32578966917)，Tests、Windows、macOS、Web 和 Draft Release 全部成功 |
| 交付物 | Windows x64/ARM64、macOS Universal DMG/ZIP、离线 HTML 和 SHA-256 清单 |
| 维护内容 | 单文件图标内联；`file://` 232 次路由渲染验收；完整 v4.8/AI 套件纳入主门禁；本地 HTTPS/WebDAV 备份传输验收；延续学生台账、同步持久化、AI 出站授权和恢复口令边界 |
| 限制 | v4.8.5 历史资产仍未签名/公证；v4.9.0 候选不承诺客户安装包，局域网首期只支持同一网络 |

### v4.8.0 当前发布记录

| 项目 | 状态 |
| --- | --- |
| 工作区版本 | `4.8.0` |
| 发布分支 | `codex/ai-upgrade` |
| Tag | [`v4.8.0`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.0)，指向 `63c429df5f877ab5a91476f18b8dc468c3edcbc6` |
| Release | [v4.8.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.8.0)，非 Draft、非 prerelease |
| 交付物 | Windows x64/ARM64、macOS Universal DMG/ZIP、离线 HTML 和三份 SHA-256 清单 |
| 发布证据 | [v4.8.0 发布收尾记录](./upgrade/release-v4.8.0.md) |
| 限制 | Windows/macOS 未签名，macOS 未公证；局域网首期只支持同一网络 |

### v4.7.0 正式发布记录

| 项目 | 已验证事实 |
| --- | --- |
| 工作区版本 | `4.7.0`，历史正式发布；当前工作区另有未提交候选 |
| 发布提交 | [`e01c5b75`](https://github.com/7752777/counselor-desk/commit/e01c5b75a9adcd1e7c882c91a667008b382ce9b4) |
| 发布门禁 | [Actions #32211212549](https://github.com/7752777/counselor-desk/actions/runs/32211212549)，Tests、Windows、macOS、Web 和 Draft Release 全部成功 |
| 正式 Release | [v4.7.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.7.0) |
| Pages 部署 | [Actions #32212075408](https://github.com/7752777/counselor-desk/actions/runs/32212075408) 是历史成功记录；仓库私有后原入口当前 HTTP 404 |
| 交付物 | 离线 HTML、Windows x64 / ARM64、macOS Universal DMG / ZIP 和三份 SHA-256 清单 |
| 数据格式 | 业务 `data_schema_version: 10`；工作区协议 `schema_version: 8` |
| 平台限制 | 未配置代码签名；macOS 未公证；AI relay 需独立受控 HTTPS 服务 |

### 发布前历史归档：v4.8.0 工作区候选记录

该段记录 v4.8.0 发布前的候选范围：Electron 密钥/仓储诊断、恢复口令核心、可选择安装目录、局域网主机核心、v11 迁移、学生稳定 ID 导入与批量维护 UI、桌面备份定时检查、加密附件分块上传/下载、备份运行记录、只传输加密包的 HTTPS/WebDAV 适配器及配置/测试连接/上传/下载预览恢复/删除页面、客户端同步/冲突 UI、心理语音页面、一生一表受支持 DOCX 生成、动态分班联合走访、工作分类和内容推送/内容包页面。手机真实 HTTPS/自动发现、附件真实断网重连、真实 WebDAV 服务商互操作、真实设备跨端恢复和 Windows/macOS 实机回滚属于发布后限制。

正式发布前的门槛、取舍和证据已经回填到[客户反馈逐项审计](./upgrade/customer-feedback-audit-2026-08-21.md)和[v4.8.0 发布收尾记录](./upgrade/release-v4.8.0.md)；本段不代表当前版本仍未发布。

### v4.5.0 历史发布记录

| 项目 | 已验证事实 |
| --- | --- |
| 工作区版本 | `4.5.0`，正式公开 |
| 发布提交 | [`1b773b3dfaa19745541df9e504f6de160c48a75a`](https://github.com/7752777/counselor-desk/commit/1b773b3dfaa19745541df9e504f6de160c48a75a) |
| 发布门禁 | [Actions #32160336549](https://github.com/7752777/counselor-desk/actions/runs/32160336549)，Tests、Windows、macOS、Web 和 Draft Release 全部成功 |
| 正式 Release | [v4.5.0 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.5.0) |
| Pages 部署 | [Actions #32161681464](https://github.com/7752777/counselor-desk/actions/runs/32161681464) 成功；在线入口 HTTP 200，运行时版本 `4.5.0` |
| 交付物 | 离线 HTML、Windows x64 / ARM64、macOS Universal DMG / ZIP 和三份 SHA-256 清单 |
| 平台限制 | 未配置代码签名；macOS 未公证；AI relay 需独立受控 HTTPS 服务 |

### v4.4.4 历史发布记录

| 项目 | 已验证事实 |
| --- | --- |
| 发布提交 | `438badd4fd1fffd6aff36412912309642f02d389` |
| 发布门禁 | [Actions run 32024091313](https://github.com/7752777/counselor-desk/actions/runs/32024091313)，Tests、Windows、macOS、Web、Draft Release 全部成功 |
| 正式 Release | [辅导员工作台 v4.4.4](https://github.com/7752777/counselor-desk/releases/tag/v4.4.4)，2026-08-17 公开 |
| Pages 部署 | [Actions run 32025171557](https://github.com/7752777/counselor-desk/actions/runs/32025171557)，部署成功 |
| Release 附件 | Windows x64 / ARM64、macOS Universal DMG / ZIP、离线 HTML、Windows/macOS/Web 三份 SHA-256 清单 |
| 签名状态 | Windows 与 macOS 构建未配置代码签名；macOS 同时未公证，安装前须核对哈希并遵循本校策略 |

## 发布前

1. 确认工作树只包含本次发布必要的改动，且不含用户数据、临时文件、测试输出和敏感信息。
2. 运行主测试、关键业务回归、真实浏览器 E2E 和公开内容扫描；跳过不等于通过。
3. 产出离线 HTML、Windows 和 macOS 包，记录真实文件名、体积、SHA-256、签名与公证状态。
4. 在目标平台完成安装、启动、附件、备份恢复和退出保存验证。
5. 生成并核验 README 展示的产品截图；只展示当次发布真实可见的能力。
6. 核对本次新增设置类功能的 v8 重启恢复，确认不会被个人视图、导入任务或其他设置写入覆盖。

## 版本事实检查

发布说明必须把“候选已集成”“CI 已验证”“Release 已公开”“Pages 已切换”四种状态分开写。当前 v4.8.0 已完成正式 Release；仓库私有后原 Pages 不再是当前可用入口。具体事实为：

- Git tag、Release URL、Pages URL 与发布提交 SHA；
- Windows/macOS 安装包名称、SHA-256、签名和公证状态；
- 目标平台的安装、启动、附件、SQLite、恢复与退出保存证据；
- 保留的历史 Tag/Release；本次未移动 `v4.6.0`、`v4.5.0` 和更早版本，后续维护应继续从新提交建立独立版本证据。

不允许引用旧构建日志、旧截图或旧 Pages 来证明新版本已经发布。

## 发布顺序

测试 → 创建 Draft Release → Windows 构建并直传 → macOS 构建并直传 → 网页产物并直传 → 校验 Draft 内全部附件 → 公开 Release → Pages。各平台 job 只在本机完成构建、烟测和 SHA-256 后上传到同一个 Draft，不依赖 Actions artifact 在 job 之间传递大文件；这样不会因 GitHub Actions 临时存储配额阻断正式发布。失败时 Draft 保持不公开，重跑会先替换同标签的旧 Draft 和附件；已公开 Release 或 prerelease 禁止被删除。

历史 v4.7.0 仍按旧的 artifact 下载流程完成；该流程只作为历史证据，不作为当前发布方式。

任何一步失败、缺少产物或无法验证，都应停止在 Draft 阶段，不能让 Pages 指向未经验证的提交。

## 发布后

- 在 CHANGELOG、Release 说明和版本状态页写入实际验证结果与明确限制；v4.8.0 的真实提交、Actions、附件大小和 SHA-256 已回填到 CHANGELOG、验收报告、当前基线、依赖清单和发布收尾记录。当前发布线还必须记录最终资产核对和公开操作；Pages 因仓库私有不作为可用性证明。
- 确认在线体验、下载链接、哈希文件、截图和 README 均指向同一版本。
- 仅在新版本完整可用后，清理已过期的 Preview Release、Preview Tag 和远程开发分支；不改写历史提交。

## 发布记录模板

正式发布完成后，维护者应把以下信息写入验收报告和 Release Notes：

| 项目 | 要记录的事实 |
| --- | --- |
| 版本与提交 | Tag、提交 SHA、构建时间、schema 版本 |
| 网页与离线版 | 产物文件名、哈希、实际访问结果 |
| Windows | x64 / ARM64 文件名、哈希、安装与卸载结果、签名状态 |
| macOS | Universal DMG/ZIP、架构、挂载/启动结果、公证状态 |
| 已知限制 | 未验证的平台、明确跳过的环境条件和下一步处理方式 |
