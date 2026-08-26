# 开发、测试与构建

这页面向参与开发的人。当前正式代码基线为 v4.8.5，工作区前瞻版为 v4.9.1；使用产品不需要执行这些命令。v4.8.5 及更早 Tag、Release 和资产作为历史基线保留。

## 环境

- Node.js：以仓库 `package.json` 的 engines 和 package manager 字段为准。
- 包管理器：pnpm。
- Windows/macOS 桌面打包需要对应平台、Electron 工具链和足够的本机磁盘空间。

```powershell
pnpm install --frozen-lockfile
pnpm test
pnpm run build:release
pnpm run check:public
```

`pnpm run check:public` 会复制当前源码到一次性临时公开树，排除开发专用资料后执行公开面检查；因此开发工作区可以保留仅供维护使用的资料，同时验证正式发布会看到的文件边界。临时树会在检查结束后自动清理。

## v4.9.1 前瞻版开发边界

商业授权候选的实现入口是 `src/core/cwb-license.js`、`src/core/cwb-update.js`、`desktop/update-runtime.cjs`、`services/license-server/production.cjs` 和 `services/license-server/server.cjs`。`service.cjs` 只用于内存契约测试；生产启动使用 `bootstrap.cjs`，通过 PostgreSQL、外部 KMS signer、管理员认证和可选 mailer 注入。桌面端使用 `electron-updater`，但只有配置生产更新地址、清单签名、平台代码签名和公证后才可以交付正式安装包。

商业测试入口为 `pnpm test:commercial`，覆盖许可证、权益、更新、桌面存储、内存/生产服务契约、PostgreSQL 参数化查询、订单 webhook、清单签名和锁定 UI。授权服务目录可单独执行 `pnpm --dir services/license-server install --frozen-lockfile`、`schema:check` 和 `test`。普通版必须保持 AI 锁定；AI 许可证和模型 API Key 是两个独立条件；许可证、设备令牌和模型凭据不能进入业务备份、交换包、导出或普通日志。生产授权服务不得复用仓库内的内存存储或把签名私钥放进项目目录。

本轮收口后，任务完成/删除、通用 v4 业务批量删除和分类文件批量删除均必须等待真实仓储保存；失败时恢复业务记录、工作留痕草稿和附件。新增事务回归包含任务失败回滚与文件批量整体回滚，样例覆盖回归明确不伪造 AI、同步和备份状态。详细事实以[全量收口审计](./upgrade/full-plan-closeout-audit-2026-08-23.md)为准。

客户手册源文件为 `docs/product-manual-v4.9.1.md`，使用 `pnpm docs:product-manual` 生成单栏 PDF 到 `output/pdf/学工智伴-v4.9.1-产品手册.pdf`。PDF 生成依赖本机中文字体、ReportLab 和 Poppler；截图来自 `assets/screenshots/v4.9.0/` 的隔离虚构演示数据，不把真实学生资料写入文档或截图。

生产授权服务必须设置 `CWB_LICENSE_ENV=production`、`CWB_LICENSE_DATABASE_SSL=true` 和精确的 `CWB_LICENSE_CORS_ORIGINS`。`bootstrap.cjs`、数据库迁移和管理员 Key 命令会拒绝不安全生产配置；共享明文 `CWB_LICENSE_ADMIN_TOKEN` 只允许本地兼容代码，不允许进入生产。配置样例和逐项证据见[授权服务环境样例](../services/license-server/.env.example)与[v4.9.0 实施对账](./upgrade/v4.9.0-implementation-reconciliation-2026-08-23.md)。

AI 模型请求和公开来源抓取都有客户端超时，并继续接受用户取消信号。超时会记录安全错误码、释放当前请求状态并保留不含密钥的重试范围；来源只有 HTTPS 且通过公开地址格式校验、成功核验后才会进入新的上下文。导入或恢复的异常来源会自动标记为“需要重新核验”，不会因为记录中的 `verified` 标记直接绕过边界。

AI 生成控件在请求进行时禁用其他生成动作，只保留取消入口。敏感授权弹窗取消时不会创建模型请求，并会清理待确认的 `running` 状态；刷新后遗留的未完成状态也可以通过“取消请求”清理，避免页面长期显示假定的进行中状态。

模型未配置、API 密钥缺失或视觉模型返回文本片段数组时也有明确处理：前两者写入不含密钥的失败审计，后者统一拼接可读文本后再保存草稿；这些失败和兼容处理不会改变业务事实记录。

本次 v4.5.0 老师反馈、v4.6.0 日常协同和 v4.7.0 参考工作台批次均保留长期审计；v4.8.0 客户反馈、局域网同步和存储事实以[客户反馈审计](./upgrade/customer-feedback-audit-2026-08-21.md)和[局域网同步与存储记录](./upgrade/lan-sync-and-storage-v4.8.0.md)为准，v4.8.1/v4.8.2/v4.8.3 的历史维护以对应发布收尾记录为准，当前 v4.8.5 的发布完整性维护以[v4.8.5 发布收尾记录](./upgrade/release-v4.8.5.md)为准。完整 `pnpm test` 可能运行较久，最终版本必须以实际退出码 0 和对应 Actions 结果为准；测试输出中的 jsdom 合成资源提示不影响断言结果。

## 历史 v4.7.0 发布基线

历史 `v4.7.0` 在当时的 Tag、Release 和 Pages 发布中交付了以下维护收口；仓库现已私有，原 Pages 当前不可访问：

- 学生档案和家校联系列表默认只显示电话脱敏值；完整号码要求启用工作台访问锁并留下访问审计。
- 班级分析默认只显示聚合结果，个人明细和指标下钻受访问锁保护；按学期筛选时只统计记录自身匹配的 `term`。
- 活动参与按 `student_id + term + activity_id` 去重；学生时间线补充家校联系、住宿/调宿、班委考核和活动参与，并避免活动主记录重复展示。
- 奖惩附件删除会检查同集合共享引用，只清理孤儿附件；来源变化的工作记录草稿必须重新核对，来源仍存在时刷新来源哈希后才能确认，来源删除后不可归档。
- 排宿预览会提前拦截重复学生，确认时仍会重新检查容量、床位、房间和楼栋状态；日期工具拒绝不存在的日历日期。

以上内容以[收尾查漏补缺审计](./upgrade/closeout-audit-2026-08-19.md)为历史实现事实源，以[v4.7.0 发布收尾记录](./upgrade/release-v4.7.0.md)为历史发布证据源。当前工作区的新增 AI/UI 修改必须重新验证和发布，不能借用历史 Tag。

## AI 中转

`pnpm web:dev` 现在同时提供同源 `POST /api/ai/chat` 中转入口。网页在 `127.0.0.1` 或 `localhost` 打开时会自动使用该入口，避免模型服务没有开放浏览器 CORS 导致请求被拦截。中转端只接受 OpenAI-compatible、Anthropic 或 Gemini 请求，要求 HTTPS 公网模型地址，拒绝内网目标、重定向、超大请求和未授权来源；API 密钥只在转发期间存在于内存，不写入日志、备份或响应。

需要把网页部署到 GitHub Pages 等静态站点时，静态站点本身不能运行中转端。可在独立 Node 服务上运行 `pnpm ai:relay`，通过 `AI_RELAY_ORIGINS` 指定允许的网页来源，通过 `AI_RELAY_HOSTS` 限制可代理的模型域名（例如 `queqiao.online`），并在 AI 模型连接的“中转地址（可选）”中填写该服务的 HTTPS 地址。中转服务绑定非回环地址时必须设置 `AI_RELAY_TOKEN`，网页模型配置中的“中转访问令牌（可选）”只保存在当前浏览器会话；生产环境应使用 HTTPS 反向代理保护中转服务，不要把中转端直接暴露在未受控的公网地址上。

## AI 工作流边界

本轮收口补充：失败重试中的请求文本只保留在当前进程内，持久化 `ui_state` 会删除请求文本；出站处理即使授权身份信息也强制移除内部 `student_id`、记录 `id/record_id`、附件/审计索引和来源指纹。建议、草稿、确认和转换审计使用同一 `request_id` 链路。

AI 工作台已经从单一生成入口扩展为可审核的跨模块工作流：上下文可以按当前学生、班级、日期区间、当前页面和选定资料来源组合；默认只发送脱敏记录，敏感分类和字段授权只对当前请求生效，并写入 `v4_ai_consents` 与调用审计。上下文和建议统一使用稳定 `student_id`，学号只保留为兼容快照。

统一建议保存于 `v4_ai_suggestions`，状态包括草稿、待审核、已查看、已采纳、已转任务、已转谈话、已转工作留痕和已驳回。建议中心支持状态、关键词、用途、风险等级和来源筛选，可选择当前结果并批量标记为已查看；批量操作不采纳建议，也不修改业务事实。转化记录保留建议 ID、来源 ID 和学生稳定 ID；在人工确认前不得修改心理、预警、纪律、资助、奖惩或其他事实记录。`v4_ai_sources` 保存本地资料和用户明确触发的公开 HTTPS 来源；本地来源保存稳定来源 ID、集合/记录回链和业务指纹，资料被修改或删除后必须重新核对，不能直接转化。外部来源必须保留 URL、标题、抓取时间、最近核验时间、核验状态和引用片段。外部来源核验失败后标记为“需要重新核验”，保留旧引用用于追溯，但不会进入新的 AI 上下文；用户重新核验成功后才恢复可引用状态。

所有内置业务页面都有统一的 AI 当前页入口，会沿用当前页面、当前事项和稳定 `student_id`；学生、任务、谈话、成绩、帮扶、预警、心理、资助、就业、资料、班团、组织和专题页面按用途提供记录级动作。打开学生档案、谈话详情、任务、业务档案或就业记录入口时，会记住对应上下文；学生档案可直接生成学生摘要，谈话详情可直接生成会前 briefing。入口只创建建议或草稿，仍需在建议中心人工审核和转化，详情页的专属业务指令仍需用真实业务资料持续验收。

AI 工作台会显示当日调用、成功、失败和引用来源统计。模型请求失败或被取消后，工作台只保存用途、请求范围、模型索引、当前学生/班级/事项、日期区间、来源 ID 和授权范围；请求文本只保留在当前进程，提供无密钥重试。API 密钥和中转令牌不进入重试状态或 `ui_state`。建议和草稿保存模型快照、canonical 用途、审计编号、风险等级、来源引用和业务范围。公共 `CWB.ai.run()` 也会校验直接传入的 `sourceRows`，不会因为来源未放进 `context.sources` 就绕过新鲜度或学生范围检查。
用途必须先在 `CWBAI`/`CWBAIWorkflow` 正式注册；旧用途别名只用于兼容历史数据，页面筛选按 canonical key 去重。公共运行入口遇到非空未知用途必须失败并返回 `AI_PURPOSE_INVALID`，不得静默回退到工作总结，否则会造成 provider 授权、额度和审计口径错配。

v4.5.0 新增的 `v4_contacts`、`v4_class_schedules`、`v4_activity_participants`、`v4_league_cases`、v4.6.0 的住宿/班委/家长联系/工作记录草稿/科研集合与 v4.7.0 的查课/点名/查寝/量化/工具箱/就业防骗/竞赛集合，均与既有 AI 集合一起纳入浏览器 IndexedDB、Electron、单文件离线包、备份恢复和手机工作包的统一集合清单；各版本的公开附件、哈希、Release 和 Pages 证据只引用对应收尾记录。

学生导入默认合并更新，覆盖模式建立恢复点并显示删除数量；附件二进制只进入附件仓，写入前做容量检查，失败时回滚本批附件。党员主记录为 `v4_party_cases`，旧 `party` 作为兼容镜像；团员流程保存规则版本、官方来源、核验时间、核心节点和学校附加节点。

## 移动端验收

移动端采用“顶栏菜单 + 抽屉 + 底部工作区栏”。首次打开手机页面不再自动弹出欢迎设置或每日问候遮挡导航；抽屉有明确的 `aria-expanded`、`aria-hidden` 和 `aria-modal` 状态，支持遮罩、Escape 和返回焦点关闭。导航分组折叠时搜索仍会显示匹配项，并提供全部展开和恢复导航入口。建议中心在窄屏下把筛选器、来源状态和转化按钮改为可换行的独立控件，避免按钮挤压或筛选器嵌套失效；业务档案、就业意向和就业联系的移动卡片保留编辑、删除和记录级 AI 动作，长摘要使用独立可换行样式。已在 `390×844` 和 `360×800` 响应式移动视口复核菜单、底栏、搜索、折叠和页面跳转；顶部栏滚动后保持 `top=0`，页面没有横向溢出。

手机访问电脑上的 `127.0.0.1` 时，地址指向手机自身，不是电脑开发服务。手机验收应使用 Pages 地址、电脑局域网 IP，或直接打开构建出的单文件离线包。

## v4.6.0 / v4.7.0 定向验证

除既有回归外，v4.6.0 至少执行 `pnpm test:v46`、`pnpm test:cwb-collections`、`pnpm test:backup-state` 和 `pnpm test:desktop`；v4.7.0 追加 `pnpm test:v47`、v10 迁移、查课/点名/查寝、量化、工具箱、就业防骗、竞赛、学业分析和 Pages 运行时检查。本轮还使用 `node tests/remaining-optimization-ui.js`、`node tests/v40-student-experience.js` 和移动导航测试覆盖模式切换、照片、电话脱敏、来源复核、班级访问锁和移动导航。浏览器验收覆盖 `1440×920`、`1280×800`、`1024×768`、`390×844`、`360×800`；桌面端重点检查 v4.7 外部运行时、学生卡片模式、刷新、重启和附件引用。排宿、工作记录草稿、班委考核、科研阶段和班级聚合使用脱敏数据验证人工确认边界。

## v4.7.1 验证记录

历史 v4.7.0 的远程发布门禁见 [#32211212549](https://github.com/7752777/counselor-desk/actions/runs/32211212549)。v4.7.1 在 2026-08-20 至 2026-08-21 的实际定向验证为：`pnpm test:cwb-ai`、`pnpm test:v47`、`pnpm test:optimization`、`node tests/cwb-ai-workflow.js`、`node tests/ai-source-integrity.js` 和 `node --check src/core/cwb-ai-workflow.js` 均通过。此前完整 `pnpm test` 曾超时，首次失败定位为导入闭环测试仍匹配旧事件分发器变量名；更新 `tests/import-loop.js` 后完整测试重新退出码 0。版本号修改前的完整 lint、构建、公开面、密钥扫描、Release 契约和差异检查也已通过；版本号修改后的受影响门禁需按发布记录重新执行。

公开版本 HTML 的 SHA-256 只在对应发布产物生成后记录；最终扫描源码、文档、备份和发布产物不得发现常见真实 API key、GitHub token 或 Slack token 模式。该扫描不替代账户持有人撤销此前已暴露密钥。

此前暴露过的密钥仍必须由账户持有人在服务后台撤销并换发新密钥；这项外部操作不能由本地代码代替，新密钥不得进入源码、文档、日志、备份或 Git。

## 开发原则

1. 先写或更新会失败的回归测试，再改实现。
2. 不以“页面能打开”代替数据恢复、导入、附件与真实浏览器验证。
3. 任何数据格式变更都要覆盖旧备份、旧浏览器数据、桌面 SQLite、附件关联和迁移前恢复点。
4. 公开文档只能描述已经验证的事实；未构建的桌面包、未签名的文件和未部署的网页必须明确标注。
5. 设置类功能写入前要检查与个人视图、导入任务等共享设置的并发覆盖风险，并补充 v8 重启恢复测试。

## 发布门禁

发布顺序为：测试 → Windows → macOS → 网页产物 → Draft Release → 人工确认 → Pages。历史 v4.7.0 已按该顺序完成；v4.7.1 必须按[本版本发布收尾记录](./upgrade/release-v4.7.1.md)独立取证。保留 `v4.7.0`、`v4.6.0`、`v4.5.0` 和更早版本的 Tag/Release，不覆盖历史发布物；未完成签名/公证的平台包不得写成已签名或已公证。

在修改发布工作流、桌面配置或数据格式前，先阅读 [贡献指南](../CONTRIBUTING.md) 与 [发布状态](./v4-acceptance-report.md)。

## v4.7.0 / v4.7.1 开发与验证

v4.7.0 的核心文件是 `src/core/cwb-v47.js`、`src/core/cwb-v47-ui.js` 和 `src/core/v10-migration.js`；新增集合必须先加入 `src/core/cwb-collections.js`，再确认浏览器、离线 HTML、Electron、备份、恢复和手机交换包均从共享清单读取。UI 修改应同时检查宽屏、1024-1279px 中等桌面和 `390×844`/`360×800` 窄屏，不把窄屏压成三栏。

开发阶段优先使用定向命令：`pnpm test:v47`、`pnpm test:cwb-collections`、`node --check src/core/cwb-v47.js`、`node --check src/core/cwb-v47-ui.js`。只有 v4.7.0 里程碑和最终交付再执行全量测试、完整构建、lint、公开面、密钥扫描、Release 契约和差异检查；同一代码状态下不重复运行已经通过且未覆盖新风险的命令。

新增功能的测试重点是：v10 只增不删迁移、随机点名种子复核且不重复、查寝事实/异常分离、量化排名由明细派生、外链安全校验、通知人工确认、右侧上下文折叠和表格空/有数据两种渲染状态。不要只用静态字符串断言代替关键持久化或浏览器交互验证。

## 当前工作区收口规则

2026-08-19 的 UI 收口和 2026-08-20 至 2026-08-21 的 AI/保存链路收口已纳入 v4.7.1；UI 不改变数据契约，AI 只扩展本地来源校验、出站脱敏、范围门禁和可用性预检。开发阶段使用以下最小验证集合：

```text
pnpm test:v47
pnpm lint
node tests/remaining-optimization-ui.js
```

这批修改完成后再执行一次里程碑门禁：

```text
pnpm test
pnpm lint
pnpm test:optimization
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

同一代码状态下已经通过且没有覆盖新风险的命令不重复执行。普通 UI 修改不做哈希；只有生成新的正式离线/桌面发布产物时，才计算一次最终哈希。公开 v4.7.0 的发布证据不能用来替代 v4.7.1 的 Tag/Release/Pages 和产物证据。

内置浏览器如果没有整页截图控制接口，可以记录 DOM 尺寸、横向滚动宽度、ARIA 状态、按钮可用性和键盘交互；必须明确写出“未完成截图验收”，不能把这种证据描述成截图通过。本批还必须确认首页不同时出现旧 today/KPI 与新版主区，并确认数据概览展开后图表锚点仍存在。完整 UI 需求见[UI 收口与历史需求查漏补缺审计](./upgrade/ui-redesign-closeout-audit-2026-08-19.md)，AI 逐项状态见[2026-08-20 AI 全面收口审计](./upgrade/ai-comprehensive-audit-2026-08-20.md)。

2026-08-20 AI 收口新增的最小验证包括：直连模型响应超限、非法 JSON、取消竞态、Anthropic 视觉消息转换、`supportsVision` 能力门禁、未知结构化消息清洗和建议质量反馈审计。对应命令为 `node tests/cwb-ai-hardening.js`、`node tests/ai-egress-contract.js`、`node tests/ai-contract.js`、`node tests/ai-workflow-ui.js`；上述测试已纳入 v4.8.0 发布验证。AI 反馈不新增集合，若修改 `v4_ai_audit` 字段或请求协议，必须重新执行 `pnpm test:cwb-ai` 和跨端集合/备份回归。

### AI 入口变更的最小验收

新增业务页或记录级 AI 按钮时，先检查 `AI_CONTEXT_SPECS`、`AI_VIEW_COLLECTIONS`、`AI_RECORD_ACTIONS` 和实际 `data-act` 是否一致；若页面使用自定义列表而不是统一增强器，必须显式生成 `data-ai-record-action`。至少运行对应的跨模块入口测试和语法检查。2026-08-20 的课表、住宿、点名入口复核使用 `node tests/ai-cross-module-audit.js`、`node tests/ai-record-actions.js`、`node --check src/core/cwb-v46-ui.js` 和 `node --check src/core/cwb-v47-ui.js`。

不要使用 `node --check index.html` 验证 HTML；Node 会按扩展名拒绝该文件。应使用仓库的 `pnpm lint`、`pnpm build:release`、JSDOM 测试或受控浏览器验收。版本号或发布产物变化后，不能把修改前的全量门禁结果直接复用为最终证据。

发布流程和证据字段见[ v4.7.1 发布收尾记录](./upgrade/release-v4.7.1.md)；`v4.7.0` 是历史发布基线，v4.7.1 必须建立独立的 Tag、Release、Actions、Pages 和附件证据。完整状态见[全量开发计划对账](./upgrade/full-plan-reconciliation-2026-08-19.md)。

## AI 收口验证（2026-08-20）

修改 AI 出站、来源、授权、provider 或建议状态时，先执行受影响的定向测试；本轮最终执行并通过：

```text
pnpm test:cwb-ai
pnpm lint
pnpm check:secrets
pnpm check:public
git diff --check
```

`pnpm test:cwb-ai` 覆盖 provider 治理、relay、来源、上下文范围、敏感授权、出站字段、建议确认、通知、证书和跨模块 AI 入口。不要把连接测试通过当作模型业务质量通过，也不要把源码密钥扫描通过当作历史密钥已撤销。只有生成正式发布产物时才执行最终哈希检查；当前 AI 候选没有生成新产物，因此本轮不做哈希检查。

本候选的 AI 定向命令当前包含 15 个用例，新增 `tests/ai-output-health.js` 验证模型回显敏感信息时页面结果、草稿、建议和 `output_redacted` 审计的一致性，以及 `CWB.ai.health()`/AI 健康卡片的运行时状态。不要把健康报告显示“运行链完整”理解为模型质量或数据加密证明；真实模型中文/图片质量、设备长期运行、密钥轮换和数据库级加密仍需独立验收。完整 `pnpm test` 已在修复导入测试契约后以退出码 0 通过。

文档批次完成后的受影响门禁已执行：`pnpm test:desktop`、`pnpm test:release`、`pnpm check:public`、`pnpm check:secrets` 和 `git diff --check` 均退出码 0；最终完整 `pnpm test` 和 `pnpm build:release` 也通过。公开面检查、密钥扫描和发布契约以最终代码状态重新通过。文档/候选构建没有生成正式发布附件，因此没有哈希检查。Electron 测试产生的 `.tmp-electron-cards-root-sKjswo` 已加入忽略规则，只是本地合成数据缓存，不属于发布内容。

## 交互连续性收口（2026-08-20）

新增或修改业务按钮时，必须从“点击前 → 保存中 → 成功/失败 → 刷新后 → 再次点击”走完整路径。工具结果和科研阶段任务使用稳定来源键幂等写入；任务规范化器必须保留 `source_id`、`source_collection` 和可选 `source_stage`，不能只按标题或日期猜测重复。

带附件的业务保存必须在附件仓和业务记录之间实现失败回滚；删除记录时检查同集合共享引用，只清理孤儿附件。来源记录被修改或删除后，`v4_worklog_drafts` 必须进入来源复核/来源已删除状态，不能用旧草稿直接制造正式留痕。表单失败必须保留输入并允许重试。

桌面端上下文面板必须验证焦点进入、`Escape` 关闭、焦点返回和刷新状态恢复；Electron 学生台账必须用独立工作区验证表格/卡片/照片模式的真实渲染、刷新和重启。对应回归入口为 `pnpm test:interaction`、`pnpm test:desktop-cards`；跨模块集合、附件和备份变化仍需追加 `pnpm test:v46`、`pnpm test:cwb-collections` 和 `pnpm test:backup-state`。

详细逐条记录见[交互连续性与按钮闭环审计](./upgrade/interaction-continuity-audit-2026-08-20.md)。本收口属于 v4.7.1，不能借用历史 `v4.7.0` 的发布证据。

## 2026-08-21 保存与来源链维护规则

保存类按钮必须等待统一的 `save()` Promise；业务层不要只调用保存后立即关闭弹窗，也不要只观察同步桥的最后一次调用。`awaitTrackedSave()` 会把保存结果统一成成功/失败语义，保存队列允许失败后的下一次操作重新尝试。

AI 公共写入还必须返回可等待的持久化承诺。旧同步 API 的返回对象要提供 `ready` 和 `persistence_state`；新代码优先使用 `CWB.ai.awaitMutation(result)` 或对应的 `*Async` 方法。不得在 `ready` 尚未完成时清空选择、关闭确认框、显示“已保存”或继续依赖下一次全局保存覆盖本次结果。测试必须注入慢保存和失败保存，确认状态回滚、输入保留和重试后可回读。

当任务、谈话、学生或其他基础集合的编辑/删除使 `v4_worklog_drafts` 变化时，必须同时提交 `custom` 集合。显式来源失效通过待同步版本标记保持到成功保存；失败时不能清掉标记。来源指纹要覆盖会影响工作事实的备注、结果、地点、查课/查寝情况、处理措施、优先级和日期字段。

本规则的最小回归是 `pnpm test:interaction`；涉及 v4.6/v4.7 集合或 AI 来源链时追加 `pnpm test:v46`、`pnpm test:v47` 和 `pnpm test:cwb-ai`。2026-08-21 这组定向验证均通过；完整发布门禁仍只在文档和代码候选稳定后执行一次。

页面启动还必须验证延迟脚本协调：内联 `boot()` 可能早于 AI、v4.6 和 v4.7 的 `defer` 脚本，不能把首屏健康卡的瞬时缺口当成最终状态。`DOMContentLoaded` 后应等待核心对象就绪、绑定 `CWB.ai.governance` 并重绘一次；`tests/v47-polish-ui.js` 的静态契约用于防止这条启动保护被移除。2026-08-21 真实 `4173` 页面和 `pnpm test:v47`、`pnpm lint` 均验证通过。

## AI readiness 与额度隔离（2026-08-21）

修改 AI 页面按钮或 provider 配置时，必须同时验证 `CWBAI.providerReadiness()` 和实际请求路径。readiness 只负责当前 UI 的可用性提示，不能替代请求前二次校验；测试必须覆盖未配置、停用、缺少模型名、用途未授权、缺少当前会话密钥、视觉能力不足和额度用尽。浏览器测试要区分 `secret_set` 与 `sessionStorage` 中的当前密钥，Electron 测试要覆盖安全存储读取失败。

每日额度按 `provider_id + purpose` 统计，只计算成功的 `generate` 审计。新增 `v4_ai_audit.provider_id` 后，旧审计仍按连接器和模型名兼容匹配；不要把密钥或 relay 令牌写入审计。连接测试、失败、取消和本地通知解析必须验证不会消耗生成额度。最小验证入口为 `node tests/ai-provider-readiness.js`、`node tests/ai-workflow-ui.js` 和 `pnpm test:cwb-ai`。

## 2026-08-21 最终候选验证账本

本次代码稳定后的最终验证已经完成：完整 `pnpm test` 退出码 0；`pnpm build:release` 生成 `output/辅导员工作台.html`；`pnpm check:public`、`pnpm check:secrets`（281 个仓库文件）和 `pnpm test:release` 均通过；`git diff --check` 只有 Git 的换行格式提示，没有空白错误。此前同一代码状态下已经通过的定向命令没有机械重复；完整门禁是在修复实际失败后重新执行的一次最终验证。

本轮没有启动独立审查代理：v4.8.5 属于单文件构建、测试门禁和本地传输验收的中风险维护，已由当前代理进行一次批量综合审查，并用真实 Chromium、离线文件路由、v4.8/AI 定向套件和最终发布门禁覆盖风险。没有做常规源码哈希检查；正式产物哈希只在创建维护版本 Release 时执行。v4.8.3 及更早历史提交、Tag、Release 和资产哈希以对应发布收尾记录为准，当前 v4.8.5 以[v4.8.5 发布收尾记录](./upgrade/release-v4.8.5.md)为准。

## v4.8.0 客户反馈执行规则

v4.8.0 计划的唯一执行入口是[客户反馈全流程执行方案](./upgrade/customer-feedback-execution-plan-2026-08-21.md)。它涉及安全、持久化、迁移、公共接口和局域网同步，按 P0/P1 批次执行；P0 完成后做一次架构与安全综合审查，普通 UI 不重复启动审查代理。

v4.8.0 已实现并通过 v11 迁移、局域网主机与客户端同步核心、真实 Electron SQLite 回写、冲突收件箱 UI、同步审计、Electron 密钥/仓储诊断、学生 `student_id` 导入核心、学生批量编辑/归档/删除 UI、桌面备份定时检查、加密附件正式/临时分块、备份运行记录、远程加密包适配器及其配置/测试连接/上传/下载预览恢复/删除页面、心理语音页面、内容包、工作分类、联合走访和对应 UI 契约的一批定向测试。受支持 DOCX 生成和内容控件反向 CSV 汇总也已交付。手机真实 HTTPS 信任/自动发现、真实 WebDAV 服务商互操作、数据目录迁移实机测试、真实批量回滚和大名单压力、任意 Word 兼容边界、真实音频设备压力、真实设备断网重连、逐集合跨端恢复和真实账号/协作权限验收列为发布后维护项。脱敏跨端恢复契约已经通过，但不代替真实设备验收；上述能力已随 v4.8.0 交付，当前维护修复和正式资产以 v4.8.1 发布收尾记录为准。常规开发不重复哈希或全量门禁。

本轮新增的最小验证包括：`node --check src/core/cwb-v48-ui.js`、`node --check src/core/cwb-v48.js`、`node tests/v48-core.js`、`node tests/v48-content-export.js`、`node tests/v48-worklog-export-runtime.js`、`node tests/v48-management-ui.js`、`node tests/ai-voice-contract.js`、`node tests/ai-voice-relay.js`、`node scripts/build-release.js output/v4-preview.html` 和 `node scripts/check-inline-js.js`。新增测试覆盖工作分类入口、联合走访弹窗、内容包导入/导出入口、跨学院/跨角色内容权限、构建后工作留痕来源回链、语音授权、relay 音频上限和单文件内联；测试没有重复执行已在同一代码状态通过的完整门禁。

2026-08-21 提交前收尾实际通过：`pnpm test:v48`、`pnpm lint`、`pnpm check:public`、`pnpm check:secrets` 和 `git diff --check`。`check:secrets` 检查 313 个仓库文件；`git diff --check` 仅输出 Git 的换行转换提示，没有空白错误。本段是发布前批次记录，后续最终代码状态已完成完整门禁、正式构建和 Release；不把这段的局部验证当作唯一发布证明。

发布前阶段不得把工作区候选的局域网服务、远程加密备份、手机真实 HTTPS、恢复向导实机回滚、真实设备跨端恢复或学生批量页面写成正式上线；该阶段记录现已由 v4.8.0 正式 Release 覆盖。附件加密传输、备份运行记录、远程备份配置页面、心理语音、内容推送、工作分类、联合走访和受支持 DOCX 能力已随 v4.8.0 交付；真实服务商、真实设备、跨端重连和本地策略角色不等于账号认证，仍按[客户反馈逐项审计](./upgrade/customer-feedback-audit-2026-08-21.md)的发布后限制维护。

## 2026-08-21 轻量验证账本补充

本批高风险维护只运行受影响范围的验证：

```text
node tests/desktop-data-target.js
node tests/desktop-data-directory.js
node tests/desktop-contract.js
node tests/v48-storage-hardening.js
node tests/v48-lan-ui.js
node --check desktop/main.cjs
node --check desktop/data-directory.cjs
node --check src/core/cwb-v48.js
```

没有在每个补丁后重复执行全量测试、构建或哈希检查；`output/v4-preview.html` 只用于局部 UI 夹具。由于本批修改了桌面持久化和远程备份安全边界，最终代码稳定后必须重新运行一次 `pnpm test`、`pnpm lint`、`pnpm build:release`、`pnpm check:public`、`pnpm check:secrets`、`pnpm test:release` 和 `git diff --check`。正式产物哈希只在生成 v4.8.0 发布物时计算。

新增桌面内部模块 `desktop/data-target.cjs` 和 `desktop/data-directory.cjs` 应保持无 DOM、无网络依赖，以便在不启动 Electron 的情况下覆盖路径和迁移回滚边界。远程备份 URL 校验必须在 fetch 前发生，避免本地参数错误被包装成网络故障。

## v4.8.0 P0 批次验证规则（2026-08-21）

同步、桌面仓储和公共传输接口属于高风险批次。修改后先运行最小范围命令：

```text
node --check src/core/cwb-v48.js
node --check desktop/lan-sync.cjs
node --check desktop/main.cjs
node tests/v48-p0-hardening.js
node tests/v48-services.js
pnpm test:lan-sync
```

`tests/v48-p0-hardening.js` 专门验证持久化失败回滚、业务记录回滚、配对限流、HTTPS/指纹边界、TLS SAN 和 Electron IPC 错误码。同步状态的 `persist` 失败不得留下半更新内存状态；绑定 Electron 的 `recordStore` 必须提供 `get/put/delete`，以便回退新记录。错误码提取不能把配置错误转换为网络错误。

本批完成后才进入下一批学生导入和 AI 页面维护；不在同一代码状态重复运行已通过的全量命令。最终发布前仍只运行一次完整测试、构建、lint、公开面、密钥扫描和 Release 检查；源码开发阶段不做常规哈希检查。

2026-08-21 同步批次新增 `pnpm test:sync-resilience`，并将其纳入 `test:sync-conflicts`和`test:v48`。该测试验证暂停/恢复、令牌校验值不出状态接口、网络失败保留离线队列、错误状态持久化和自动同步启动/停止。`tests/lan-sync.js`额外验证 HTTP 配对结果的一次性令牌领取和健康接口脱敏。修改后只运行受影响的桌面、同步和构建后 UI 测试；没有重复沿用旧代码状态的完整门禁结果。

## 2026-08-21 候选照片路径验证规则

学生照片属于附件仓高风险写入。修改照片上传、档案保存或附件清理时，至少验证附件写入、学生引用、失败回滚和再次上传四条路径。成功路径只允许一次学生记录持久化；只有清理失败需要记录 `photo_cleanup_pending_ids` 时才允许第二次写入。对应回归为 `node tests/photo-storage.js`，交互失败恢复由 `node tests/interaction-continuity.js` 覆盖。

本轮因代码发生变化只运行了受影响的照片、交互、学生导入、同步和 AI 页面测试，没有机械重复同一代码状态下已经通过的完整测试、构建或哈希检查。照片测试在 JSDOM 中会执行完整 v8 持久化校验，运行时间较长；这不是跳过验证的理由，但也不能把它等同于真实设备性能验收。最终 `v4.8.0` 发布前仍需一次完整门禁和目标设备验收。

## 2026-08-21 全量回归中的 IndexedDB 契约纠偏

全量 `pnpm test` 首次执行到 `tests/v8-canonical-idb-browser.js` 时，发现测试把大名单原子载荷的物理行数误判为业务行数（期望 1,200，实际 1）。这不是数据丢失：`records_students` 的单条 `__cwb_bulk_students__` 载荷由仓储 API 解包后仍包含 1,200 条学生。测试已改为同时检查原始载荷稳定键和仓储 reopen 后的逻辑条数，受影响测试已通过。

该记录用于防止未来维护者为了满足错误的底层行数断言而破坏原子写入。修正后完整 `pnpm test` 已退出码 `0`；后续仍必须在发布前完成构建、lint、公开面、密钥扫描和 Release 契约，不能用全量测试替代真实设备恢复验收。

## 2026-08-21 二维码配对批次验证规则

二维码属于局域网配对公共接口和隐私边界，按中高风险批次验证。核心层必须验证 HTTPS 地址、固定字段白名单、重复/未知字段、8 位配对码、指纹格式和过期时间；Electron 层必须验证 IPC 与预加载桥接；页面层必须验证二维码、四项明文回退、过期提示和证书不自动信任文案。

本批实际运行：`node --check src/core/cwb-v48.js`、`node --check desktop/main.cjs`、`node --check desktop/preload.cjs`、`node tests/v48-pairing-qr.js`、`node scripts/build-release.js output/v4-preview.html`、`node tests/v48-lan-ui.js` 和 `git diff --check`。没有重复执行同一代码状态下的完整回归、构建和哈希检查；最终发布前仍需按发布收尾记录重新执行完整门禁和真实设备验收。

## 2026-08-22 当前验证纪律与证据

本轮后续局部验证又通过 node tests/ai-contract.js、node tests/ai-source-integrity.js、node tests/interaction-continuity.js、node tests/v47-polish-ui.js 和候选预览构建。新增断言覆盖批量建议审阅的真实保存/整批回滚，以及唯一证书识别入口。由于代码和文档随后仍需继续收口，最终 pnpm test、完整构建、公开面、密钥扫描和 Release 契约仍须在最终代码状态重新执行。

本轮局部验证新增 `node tests/ai-output-health.js`、`node tests/v48-lan-ui.js`、相关 `node --check` 和候选预览构建；这些命令覆盖本轮改变的保存等待、失败回滚、队列文案和 IndexedDB 兼容风险。修复物理数据库版本后已重新完成最终 `pnpm test`、构建、lint、公开面、密钥扫描、Release 契约和差异检查；阶段性总账、跳过的重复验证、真实环境缺口和最终证据见[当前收口总账](./upgrade/closeout-status-2026-08-22.md)。源码阶段未做哈希检查，正式产物生成时才检查。

## v4.9.1 前瞻版商业控制面最小验证

商业授权、更新 runtime 和客户交付属于高风险批次，不能只用按钮灰色状态证明安全。当前批次的局部验证为：

```text
node --check desktop/platform-signature.cjs
node --check desktop/update-runtime.cjs
node --check desktop/main.cjs
node tests/platform-signature.js
node tests/update-rollback.js
node tests/update-runtime.js
node tests/activation-contract.js
node tests/customer-delivery-contract.js
```

`pnpm test:update` 已包含更新契约、Electron runtime、安装失败回滚和平台签名分支；`pnpm test:license-server` 已包含客户交付接口；`pnpm test:activation` 会重新生成离线预览并验证文件导入不自动激活。测试中的平台命令均为注入式结果，不能替代真实 Windows Authenticode、macOS Developer ID、公证、安装器重启和生产 CDN 证据。

## 2026-08-25 PDF/UI 收口与前瞻通用码

`node tests/pdf-requirements-ui.js` 覆盖 PDF 需求中新增的 AI 日志路由、页面历史、任务起止日期、甘特图单日任务、平台 AI 不内置共享 Key 和 AI 日志回链；`node tests/ai-workflow-ui.js` 覆盖失败重试、取消、重试链、敏感授权和 API Key 不进入 UI 状态。`pnpm test:redemption` 覆盖两个长期活动码档位、跨工作区独立许可证、同工作区复用、HTTP 路由和客户端二次签名校验。

长期活动码只在授权服务部署侧生成：`node services/license-server/scripts/generate-redemption-codes.cjs`。脚本明文只显示一次；部署模块和 PostgreSQL 只保存 SHA-256 哈希。客户端只接受 `CWB-REDEEM-1...` 格式并在线兑换，不能在离线 HTML 中用固定字符串伪造激活。该方案满足前瞻体验阶段的“通用密钥”体验，但不宣称防复制；正式客户仍使用独立签名许可证。

新增的 `services/license-server/customer.html` 只负责客户购买、订单查询和许可证下载，不负责支付确认。客户访问令牌不放入 URL，服务端订单摘要不返回激活码，下载接口设置 `no-store`；真实支付、邮件、KMS、PostgreSQL、域名和限流告警部署前仍保持候选状态。当前代码稳定后才执行一次最终全量门禁，未在每个小修复后重复运行全量测试或哈希检查。
