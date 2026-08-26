# 开发源权威清单

更新时间：2026-08-23

本次 v4.5.0 老师反馈逐条实现、迁移边界和验收结果见[老师反馈全量审计](./teacher-feedback-audit-2026-08-18.md)；v4.6.0 日常协同增强见[本轮审计](./next-optimization-audit-2026-08-19.md)；v4.7.0 参考工作台功能与 UI 见[参考工作台审计](./reference-product-feature-and-ui-audit-2026-08-19.md)及[历史发布收尾记录](./release-v4.7.0.md)；v4.7.1 AI、保存和跨端维护见[历史发布收尾记录](./release-v4.7.1.md)；v4.8.0 客户反馈与局域网同步见[客户反馈审计](./customer-feedback-audit-2026-08-21.md)和[历史发布收尾记录](./release-v4.8.0.md)；v4.8.3 的历史 UI 收口见[发布收尾记录](./release-v4.8.3.md)；v4.8.5 的当前发布完整性见[发布收尾记录](./release-v4.8.5.md)；当前版本、AI 收口和未完成项以[全量开发计划对账](./full-plan-reconciliation-2026-08-19.md)、[当前收口总账](./closeout-status-2026-08-22.md)和[v4.8.5 发布收尾记录](./release-v4.8.5.md)为准。

v4.9.0 商业授权候选的实现、测试和外部部署边界见[候选收尾记录](./release-v4.9.0.md)、[商业授权方案](./commercial-licensing-v4.9.0.md)、[激活安全模型](./activation-security-model.md)、[更新与分发方案](./update-and-distribution-v4.9.0.md)和[商业发布方案](./commercial-release-v4.9.0.md)。这些文档不表示生产授权服务、支付、代码签名、公证或 CDN 已部署。

## 唯一开发基线

后续开发、测试和构建只使用以下独立 Git 项目目录：

- 路径：`F:\CounselorDesk\counselor-desk-development`
- 分支：`codex/ai-upgrade`
- 当前产品维护发布：`v4.8.5`；Tag commit、Actions 和正式资产哈希以[`v4.8.5 发布收尾记录`](./release-v4.8.5.md)中的实际证据为准；v4.8.3、v4.8.2、v4.8.1、v4.8.0、v4.7.1、v4.7.0、v4.6.0、v4.5.0、v4.4.6 及更早版本作为历史发布保留；不移动或覆盖历史 Tag
- 既有历史 Tag：`v4.4.3` 指向 `5ddb502e527543f5f8e4f3f922979e09d57f1cf0`，本批不改写
- 历史 Release：`v4.7.0`；Release 和附件证据见[ v4.7.0 发布收尾记录](./release-v4.7.0.md)，当前仓库为私有，原 Pages 返回 HTTP 404；v4.6.0、v4.5.0 和 v4.4.6 作为历史版本保留
- 远程仓库：`origin https://github.com/7752777/counselor-desk.git`
- Git 形态：独立完整克隆，不依赖外部 linked worktree 或主仓库目录
- 当前架构：本地优先 Web/单文件离线 HTML/Electron 共用业务界面

## v4.7.0 发布后的维护边界

历史发布事实为 `v4.7.0`。分支 `codex/ai-upgrade` 当前包含未提交的维护候选；它没有随历史 Tag、Release 或 Pages 一起发布。[收尾查漏补缺审计](./closeout-audit-2026-08-19.md)保留逐条实现和局部验证事实，包含：

- 学生及家校联系方式默认脱敏，完整号码必须经过工作台访问锁和访问审计；班级分析个人明细、指标下钻同样受控。
- 班级分析按记录 `term` 筛选，活动参与按 `student_id + term + activity_id` 去重，学生时间线补齐家校联系、住宿、调宿、班委考核和活动参与。
- 奖惩共享附件删除保护、排宿重复学生预检、日期真实性校验和来源变化草稿的哈希复核闭环。
- AI 来源链收口：工作总结、证书、通知和建议转化保留建议/草稿/生成审计/模型/用途/来源/上下文/确认审计；无稳定学生 ID 的建议不能转谈话；凭据状态按实际写入结果回填。完整契约见[AI 全面审计](./ai-comprehensive-audit-2026-08-19.md)。

后续改动不得回写或移动 v4.7.0 Tag/Release；若要公开新的维护版本，必须在新的提交上重新执行全量测试、构建、公开面、密钥检查、发布工作流和 Pages 部署，并新建版本证据。

历史发布证据：v4.4.5 的 Release Actions、Pages、正式附件和 SHA-256 清单见[历史发布收尾记录](./release-v4.4.5.md)；v4.4.6 的 Release Actions、Pages、正式附件和 SHA-256 清单见[历史发布收尾记录](./release-v4.4.6.md)。v4.5.0 已建立独立收尾记录，不复用历史 Tag。

当前目录包含源码、测试、构建配置、升级文档、依赖和已有验证产物。以后所有开发、测试、构建、提交都在此目录执行；父目录中的其他文件夹不再作为需求或源码依据。

历史基线、旧 linked worktree、参考图片、用户测试包和其他过程资料已集中移动至：
`F:\CounselorDesk\_archive-non-development-20260817`

## 权威性顺序

需求和实现判断按以下顺序取证：

1. 当前 worktree 中的源码、测试和根目录构建配置。
2. 当前 worktree 中的架构、数据契约、隐私、迁移、安装和发布文档。
3. 归档目录中的参考 UI，仅用于判断目标体验，不证明功能已经实现。
4. 归档目录中的历史文档、候选发布包和旧版本资料，仅在需要追溯行为时作为辅助证据。

## 非开发源

以下归档目录不参与功能设计、源码搜索或依赖判断：

- `F:\CounselorDesk\_archive-non-development-20260817`
- 其中的 `_forensic-vault`、`archives`、`backups`、`cache`、`user-data`
- 其中的 `public-docs-update`、旧 `counselor-desk-next`、`v4.4-integration`
- 其中的 `参考图片`、`用户测试发布包-v4.4.3-候选`、`repository`

归档目录可以由用户在确认无保留价值后自行删除；最终开发目录不得删除或替换。

## 构建入口规则

- 根目录 `electron-builder.yml` 是当前 Electron 打包配置。
- `desktop/electron-builder.yml` 是旧重复配置，不得作为发布依据。
- Electron 主入口为 `desktop/main.cjs`，预加载入口为 `desktop/preload.cjs`。
- Web/离线入口为 `index.html`。
- 核心运行时位于 `src/core`，测试位于 `tests`，构建和检查脚本位于 `scripts`。
- 业务页面目前集中在约 10,000 行的 `index.html`，后续只做受控的增量抽离，不做一次性重写。

## 日常开发入口

```powershell
Set-Location 'F:\CounselorDesk\counselor-desk-development'
pnpm lint
pnpm test:cwb-business
pnpm test:cwb-ai
pnpm test:cwb-employment
pnpm desktop:build:win
```

浏览器入口为根目录 `index.html`；桌面入口为 `desktop/main.cjs`；根目录 `electron-builder.yml` 是唯一桌面打包配置。

## 不可破坏的基线约束

- 保持 schema v8 兼容。
- 保留稳定内部 ID、历史学号、自定义字段、附件关联和导入回滚能力。
- 保持浏览器 IndexedDB 与 Electron SQLite 的业务行为一致。
- 保持备份、恢复、版本历史、附件仓和诊断链路可用。
- 不实现公网实时云同步，不自动上传学生数据；v4.8.0 候选只允许明确配对的同一局域网桌面主机模式，远程存储仅提供用户明确触发的端到端加密备份包。候选页面已提供配置、测试连接、上传、下载预览恢复和删除；真实服务商互操作仍需验收。

## v4.5.0 事实源补充

- 新集合：`v4_contacts`、`v4_class_schedules`、`v4_activity_participants`、`v4_league_cases`。
- 学生稳定 ID、历史学号、导师/班主任、家长和居住字段的契约见[数据参考](../data-contract.md)；迁移、备份和附件边界见[备份与迁移](../v4-migration-and-backup.md)。
- 团员发展国家基线：团中央印发的[发展团员工作细则](https://news.youth.cn/gn/202308/t20230822_14734345.htm)，规则版本 `2023-08-22`，本地核验时间 `2026-08-18`；流程手册参考[官方发展团员工作手册](https://zhtj.youth.cn/zhtj/static/help/P20260526.pdf)，作为材料和节点的参考来源，不替代学校团组织文件。
- AI 通知识别只接受老师主动粘贴或导入，边界和接口见[用户手册](../user-guide.md)及审计记录；不后台接入钉钉或学校系统。
- 页面移动验收尺寸为 `390×844`、`360×800`；手机访问电脑服务时不能把 `127.0.0.1` 当作电脑地址。

## v4.6.0 规则来源和事实边界

- 宿舍楼栋、房间、床位、批次和调宿字段是本地工作区数据结构，不宣称替代学校住宿管理系统；性别限制、容量和重复入住只是提交前的本地一致性检查。
- 科研阶段名称是通用工作节点，不代表任何学校的立项、审批或结题制度；学校可在备注和任务中维护本校要求。
- 班委角色、考核等级和改进建议由辅导员按本校制度录入；AI 只生成草稿，不是评价或组织认定来源。
- 工作记录草稿的事实来源是本地业务记录和人工确认；AI 通知只接受老师主动粘贴或导入，不读取钉钉、学校系统或浏览器通知。
- 团员发展仍以[团中央发展团员工作细则](https://news.youth.cn/gn/202308/t20230822_14734345.htm)为国家基线，规则版本 `2023-08-22`；v4.6 不新增团员资格或审批结论。

## v4.7.0 参考功能与规则来源

- 《图片笔记.pdf》由用户提供，作为九页产品体验参考，提取的是信息架构、工作台布局、筛选/统计/结果顺序和交互模式，不作为本项目业务规则或实现来源。逐页拆分见[参考工作台功能与界面审计](./reference-product-feature-and-ui-audit-2026-08-19.md)。
- 查课、点名、查寝、量化考评、工具箱、就业防骗、竞赛和学业分析的字段是本地工作区结构，不声称替代教务、住宿、综测、就业或竞赛主管部门系统。学校可在备注、规则版本和附加任务中维护本校口径。
- v4.7.0 的 v10 迁移依据当前源码 `src/core/v10-migration.js` 和共享集合 manifest，不引入外部数据库协议；公开版本边界以[发布收尾记录](./release-v4.7.0.md)中的实际证据为准。
- AI 仅用于解释、摘要、清单和草稿。任何床位、积分等级、就业风险、学业预警、纪律/心理/资助结论和学生事实仍以人工确认、学校制度和原始记录为准。

## v4.8.0 客户反馈事实源（已发布）

- 方案和逐项状态以[客户反馈全流程执行方案](./customer-feedback-execution-plan-2026-08-21.md)和[客户反馈逐项审计](./customer-feedback-audit-2026-08-21.md)为准；局域网和存储细节以[局域网同步与存储记录](./lan-sync-and-storage-v4.8.0.md)为准。
- Electron 密钥、恢复包、仓储健康和局域网主机的实现事实以 `desktop/vault.cjs`、`desktop/recovery-kit.cjs`、`desktop/sqlite-store.cjs`、`desktop/main.cjs`、`desktop/lan-sync.cjs` 和对应测试为准。
- v10 到 v11 迁移、同步集合和 v4.8.0 学生字段/内容服务以 `src/core/v11-migration.js`、`src/core/cwb-collections.js`、`src/core/cwb-v48.js` 为准；`tests/v48-cross-platform-recovery.js` 已验证脱敏契约级恢复，但 manifest 和夹具都不等于真实设备的 HTTPS、断网或长期压力验收。
- 桌面自动备份定时检查以 `index.html` 的 `desktopBackupScheduler` 和 `tests/backup-desktop-scheduler.js` 为准：每 60 秒检查，到期才写入；浏览器关闭期间不后台写文件。
- v4.8.0 发布证据见[release-v4.8.0.md](./release-v4.8.0.md)及 GitHub 私有 Release。该版本已具备 Tag、Release、正式构建、最终门禁和资产校验记录；后续文档仍须区分正式资产与发布后实机/服务商限制。

## v4.8.5 维护发布事实源（当前）

- 当前版本和正式资产以[release-v4.8.5.md](./release-v4.8.5.md)及 GitHub 私有 Release 为准；`v4.8.3`、`v4.8.2`、`v4.8.1`、`v4.8.0` Tag/Release 和历史资产不移动。
- 证书图片出站授权提示的事实源是 `index.html` 的 `requestAiAttachmentConsent()` 和 `tests/certificate-recognition.js`；授权仍是单次、单附件，结果先进入草稿，人工确认后才写入奖惩事实。
- 恢复口令的事实源是 `src/core/cwb-v48-ui.js` 的 `v48-recovery-export` / `v48-recovery-import` 动作、`desktop/recovery-kit.cjs` 和 `tests/v48-management-ui.js`；底层最低长度为 12 位，页面不得提示更短口令。
- v4.8.5 不新增集合、不改变 `schema_version:8`、`data_schema_version:11` 或 `sync_protocol_version:1`；版本兼容和发布门禁以 `package.json`、`desktop/package.json`、`index.html`、`scripts/build-release.js`、`scripts/check-doc-current-state.js` 和 Release 工作流为准。

## v4.9.0 商业授权候选事实源

- 许可证格式、四档计划、离线宽限、时钟回拨和公共状态脱敏以 `src/core/cwb-license.js` 与 `tests/license-contract.js`、`tests/entitlements.js` 为准；Electron 专用存储以 `desktop/main.cjs`、`desktop/preload.cjs` 和 `tests/license-storage.js` 为准。
- 更新清单、签名、哈希、下载取消和安装状态以 `src/core/cwb-update.js`、`desktop/update-runtime.cjs` 与 `tests/update-contract.js`、`tests/update-runtime.js` 为准。没有生产更新清单和平台签名时，不把运行时契约写成正式升级服务。
- 发码和设备认证契约以 `services/license-server/production.cjs`、`services/license-server/server.cjs`、`services/license-server/README.md` 和对应测试为准。`service.cjs` 默认内存存储，只用于契约测试；生产候选已提供 PostgreSQL、KMS/HSM、数据库管理员 Key、订单幂等和审计适配器，但真实部署仍需外部服务证据。
- AI 入口是否锁定以 `CWB.entitlements` 和 `index.html` 的 `refreshCommercialUi`/业务守卫为准；许可证和模型 API Key 是两套独立凭据，二者都不进入业务备份、交换包、导出和普通日志。
- v4.9.0 仍保持 `schema_version:8`、`data_schema_version:11`、`sync_protocol_version:1` 和 v4.8.5 的 `student_id`、历史学号、附件 ID 兼容。

## 2026-08-19 工作区候选的权威边界

当前分支新增的 UI 与 AI 收口依据是 `index.html`、`src/core/cwb-ai.js`、`src/core/cwb-ai-workflow.js`、`src/core/cwb-v46-ui.js`、`src/core/cwb-v47-ui.js`、`tests/v47-polish-ui.js` 和 `tests/ai-contract.js`；它们只证明工作区候选的实现与局部回归，不改变历史 v4.7.0 的发布事实。具体改动、测试输出、浏览器 DOM 验收、未完成事项和发布前要求统一记录在[UI 收口审计](./ui-redesign-closeout-audit-2026-08-19.md)和[AI 全面审计](./ai-comprehensive-audit-2026-08-19.md)。

在候选正式发布前，权威性顺序仍是：源码和测试 > 构建配置 > 本地审计 > 已存在 Release/Pages 证据。当前 `codex/ai-upgrade` 是维护分支候选，未创建新 Tag/Release/Pages；不要因为 `package.json` 仍显示 `4.7.1` 就推断候选已上线。新发布必须使用新提交、新版本号和新附件证据，不移动历史 Tag。

## v4.8.0 事实来源（发布前审计快照）

| 事实 | 权威来源 | 当前结论 |
| --- | --- | --- |
| v11 集合和迁移 | `src/core/cwb-collections.js`、`src/core/v11-migration.js`、`tests/v48-core.js`、`tests/v48-cross-platform-recovery.js` | v4.8.0 只增不删；脱敏跨端契约已通过，真实设备恢复仍待发布后抽查 |
| Electron 密钥/仓储/数据目录 | `desktop/vault.cjs`、`desktop/recovery-kit.cjs`、`desktop/sqlite-store.cjs`、`desktop/main.cjs`、`tests/desktop-contract.js` | v4.8.0 核心已交付；Windows/macOS 实机回滚列为发布后抽查 |
| 局域网同步 | `desktop/lan-sync.cjs`、`src/core/cwb-v48.js`、`tests/lan-sync.js`、`tests/v48-services.js` | 主机核心和客户端管理页面已随 v4.8.0 交付；真实手机信任/发现未完成 |
| 学生身份和批量维护 | `src/core/cwb-v48.js`、`index.html`、`tests/v48-core.js`、`tests/v48-student-import-ui.js`、`tests/v48-management-ui.js` | `student_id` 优先导入和批量编辑/归档/删除/撤销 UI 已随 v4.8.0 交付；真实大名单验收列为维护抽查 |
| 远程加密备份 | `src/core/cwb-v48.js`、`index.html`、`tests/v48-storage-hardening.js`、`tests/v48-management-ui.js` | 适配器和配置/测试连接/上传/下载预览恢复/删除页面已随 v4.8.0 交付；真实 WebDAV 互操作未完成 |
| 脱敏跨端恢复 | `tests/v48-cross-platform-recovery.js` | 浏览器、离线 HTML、加密备份、手机工作包、交换包、自定义集合和附件回读契约已通过；不等于真实设备验收 |
| 心理语音 | `index.html` 的 `psychVoiceForm`/`aiTranscribeVoice`、`scripts/ai-relay.js`、`tests/ai-voice-contract.js`、`tests/ai-voice-relay.js` | 单次授权、转写草稿、人工确认和原音频不落库已交付；设备质量仍待验收 |
| 内容推送/工作分类/联合走访 | `src/core/cwb-v48-ui.js`、`src/core/cwb-v48.js`、`tests/v48-management-ui.js`、`tests/v48-core.js` | 页面和服务已随 v4.8.0 接入；权限细化和跨端压力仍待验收 |
| v4.8 发布状态 | `docs/upgrade/release-v4.8.0.md`、Git history/remote | `v4.8.0` Tag、私有 Release、Windows x64/ARM64、macOS Universal 和离线 Web 资产已发布；Pages 不作为私有仓库入口 |

团员发展规则仍以[团中央印发发展团员工作细则](https://news.youth.cn/gn/202308/t20230822_14734345.htm)为国家基线，规则版本 `2023-08-22`；本地业务页面不替代学校团组织审批。PDF 参考产品只作为 UI/信息架构来源，不作为 v4.8 业务规则来源。

## 2026-08-21 v4.8 高风险维护事实源

- 数据目录空值、路径边界和迁移回滚的事实源为 `desktop/data-target.cjs`、`desktop/data-directory.cjs`、`desktop/main.cjs` 及 `tests/desktop-data-target.js`、`tests/desktop-data-directory.js`；不能仅以页面文案或历史审计推断迁移已通过实机验收。
- 远程备份 HTTPS/WebDAV 端点限制的事实源为 `src/core/cwb-v48.js` 的 `createRemoteBackupAdapter()` 和 `tests/v48-storage-hardening.js`；测试通过只证明核心拒绝规则，不证明任意 WebDAV 服务商兼容。
- 局域网配对复制入口的事实源为 `index.html` 的 `lan-syncCard()`/`lan-sync-pair` 动作和 `tests/v48-lan-ui.js`；发布前阶段明确没有二维码或自动发现，二维码随后已加入 v4.8.0。
- 正式版本状态仍以 GitHub Tag/Release 和 `docs/upgrade/release-v4.8.0.md` 实际回填为准。截至 2026-08-22，`v4.8.0` 已创建 Tag、私有 Release、正式桌面包和离线 Web 资产；`v4.7.1` 作为历史兼容版本保留，Pages 不作为私有仓库入口。

## 2026-08-22 当前事实更正

上面“当前明确没有二维码”的内容是二维码实现前的历史快照。v4.8.0 已实现 `desktop:lan-sync-pairing-qr` 和 `cwb://lan-pair` 白名单载荷；二维码仍不自动发现、不自动信任证书，真实手机扫码/证书信任属于发布后限制。AI 持久化回滚、局域网队列文案、同步状态保存失败回滚、业务仓储原子回退、证书授权提示、恢复口令校验、学生台账 AI 操作列、移动高频页面收口和 v4.8.5 离线/备份门禁统一以[当前收口总账](./closeout-status-2026-08-22.md)和[v4.8.5 发布收尾记录](./release-v4.8.5.md)为准。正式版本为 `v4.8.5`。

## 2026-08-23 商业交付边界核验来源

| 事实 | 权威来源 | 核验结论 |
| --- | --- | --- |
| 许可证格式、权益和 AI 守卫 | `src/core/cwb-license.js`、`index.html`、`tests/license-contract.js`、`tests/entitlements.js` | 代码级 Ed25519 校验和统一守卫已通过；不能证明客户端不可破解 DRM |
| 更新验签与失败回滚 | `src/core/cwb-update.js`、`desktop/update-runtime.cjs`、`desktop/platform-signature.cjs`、`tests/update-rollback.js` | 注入式状态机已通过；真实安装器、证书和公证仍待设备证据 |
| 客户订单取件 | `services/license-server/production.cjs`、`server.cjs`、`schema.sql`、`tests/customer-delivery-contract.js` | 令牌哈希、7 天过期、已签发下载和撤销边界已通过内存/HTTP 契约；真实 PostgreSQL 与邮件未部署 |
| CORS、HTTPS、限流和页面安全头 | `services/license-server/server.cjs`、`bootstrap.cjs`、`tests/license-server-http-contract.js` | 精确来源和服务错误码已通过；生产反向代理、WAF、告警和限流容量仍需部署验证 |
| Electron 安全存储 | `desktop/main.cjs`、Electron safeStorage 官方文档（https://www.electronjs.org/docs/latest/api/safe-storage） | 本机调用契约已实现；系统钥匙串可用性和真实换机仍需 Windows/macOS 验收 |
| Electron 更新机制 | `desktop/update-runtime.cjs`、Electron Builder 更新文档（https://www.electron.build/auto-update） | 运行时契约和签名校验封装已实现；真实 CDN、签名证书和跨重启安装仍未核验 |

本节的外部链接仅说明平台机制来源，不是项目已取得证书、公证或服务商上线证明。商业发布仍以目标平台产物、部署日志、支付/邮件回执和发布收尾记录中的可复核证据为准。

## 2026-08-25 外部交付事实源

链动小铺四档商品、三类前瞻/友情码、服务器真实兑换验证、前瞻版交付包和公众号待提交边界统一记录在[外部交付、链动小铺与公众号执行记录](./external-delivery-and-wechat-v4.9.0.md)。
