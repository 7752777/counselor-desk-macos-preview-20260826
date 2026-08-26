# v4.4.4 及 AI 深度融合开发收尾总览

更新时间：2026-08-18

本页是截至 2026-08-17 的历史收尾记录，描述 v4.4.4 公开发布事实以及当时的开发目录状态。v4.4.4 已由提交 `438badd4fd1fffd6aff36412912309642f02d389` 正式发布；正式下载版本、签名、公证、SHA-256 和 Pages 状态仍以 [v4.4.4 Release](https://github.com/7752777/counselor-desk/releases/tag/v4.4.4) 为准。2026-08-18 的后续 v4.4.5 候选及正式发布记录保留在[对应历史发布收尾记录](./release-v4.4.5.md)；当前公开产品基线已升级为 [v4.4.6](./release-v4.4.6.md)，不能把后续版本事实倒写进本历史证据。

## 交付范围

### 数据与工作区

- 工作区继续使用 `schema v8`，保留稳定记录 ID、历史学号兼容、自定义字段、附件引用、版本历史、恢复点和失败重试。
- 浏览器 IndexedDB、便携 HTML 和 Electron SQLite 使用统一集合清单；新增业务集合已透传到迁移、备份、交换包、手机同步和桌面仓储边界。
- 业务档案覆盖综合测评、学期学业、处分、资助，并汇入学生画像和时间线。
- 业务档案、就业意向、联系记录优先使用 `student_id`，同时兼容旧学号记录；更正学号不会丢失画像关联。
- 处分附件不再把学号误写入 `student_id`。

### AI 与就业

- AI 模型配置支持用途授权、启停、每日成功调用额度、视觉能力和调用审计。
- 通知改写、预警辅助、工作总结和证书识别统一作为候选、草稿或待确认结果，不自动修改预警、心理、处分、资助或奖励结论。
- 证书识别先保存附件和草稿，人工选择学生、核对字段并确认后才写入获奖档案。
- 工作总结仅基于指定日期范围内已有记录，不补造事实；确认后才写入工作留痕。
- AI 上下文现在支持当前学生、班级、日期区间、当前页面和明确选定的本地/公开来源；默认出站内容移除姓名、学号、联系方式、`student_id` 及其他敏感字段，字段级授权只对本次请求恢复对应字段并留下授权审计，内部 `student_id` 始终不出站。
- `v4_ai_suggestions`、`v4_ai_sources` 和 `v4_ai_consents` 已纳入统一集合清单、浏览器 IndexedDB、Electron、单文件离线包、备份恢复和手机工作包；建议中心支持草稿、待审核、已查看、已采纳、已转任务、已转谈话、已转工作留痕和已驳回状态。
- 建议查看、采纳、驳回和转化均产生审计；转化后的任务、谈话和工作留痕保留建议 ID、来源 ID 和 `student_id`。AI 不自动修改心理、预警、纪律、资助、奖惩或学生事实记录。
- 建议中心支持状态、关键词、用途、风险等级和来源筛选；可选择当前结果并批量标记已查看，不提供批量采纳或批量事实修改。工作台显示当日调用、成功、失败和引用来源统计；失败或取消的请求保存无密钥重试范围，并提供“重试上一次请求”。建议和草稿同时保存模型快照、审计编号、风险等级、来源和业务范围。
- 生成请求进行时会禁用其他生成动作并保留取消入口；敏感授权弹窗点击“暂不授权”不会发送请求，并会清理待确认的 `running` 状态。刷新后遗留的未完成状态也可通过“取消请求”清理，避免假定请求一直运行。
- 本地资料优先作为知识来源；公开网页只有在用户明确提供 HTTPS 地址后才抓取，并保留 URL、标题、抓取时间、最近核验时间、核验状态和引用片段，受超时、大小、内容类型、重定向和私网地址限制。来源核验失败会保留历史记录但标记“需要重新核验”，并从新的模型上下文排除；用户重新核验成功后才恢复可引用状态。
- 就业资源目录提供约 80 条官方或可信入口，支持来源、核验状态、分类、地区、适用对象、收藏和 CSV/签名清单维护。

### 工作台与性能

- 学生台账的组合筛选、排序、字段/列派生结果使用缓存复用；5,000 条组合筛选性能回归通过。
- 10,000 行学生导入改为按块暂存、降低检查点频率并使用原子批量提交；本次最终全量回归中的本地浏览器性能样本耗时约 27.7 秒，最大进度间隔约 143.9ms，低于 200ms 响应门槛，10,000 条均处理完成。
- 首页新增“领导统计视图”：只提供数值聚合，支持创建、切换、编辑、删除和 CSV 导出；不展示姓名、学号、电话、地址或心理详情。
- 旧版个人视图迁入领导视图时自动补齐默认指标；通用设置写入不会覆盖领导视图配置，v8 重启恢复已覆盖。

## 验证记录

### 本轮直接验证

```powershell
pnpm test:optimization
node tests/v8-workspace.js
node tests/v8-persistence-protocol.js
node tests/v8-browser-contract.js
node tests/v8-canonical-idb-browser.js
node tests/v40-browser-storage.js
node tests/v40-ui.js
node tests/v40-student-experience.js
node tests/navigation-structure.js
node tests/ux-operations.js
pnpm lint
node scripts/build-release.js output/v4-preview.html
pnpm build:release
pnpm desktop:build:win
pnpm exec node tests/desktop-windows-architecture.js
pnpm exec node tests/desktop-packaged-smoke.js
pnpm exec node tests/desktop-installer-smoke.js
pnpm check:public
pnpm test:release
git diff --check
```

以上定向测试、优化回归、v8/IndexedDB 回归、lint、发布构建、公开面 staging 检查和发布契约测试均通过。`pnpm test:optimization` 已包含 `tests/leadership-dashboard.js`。

### 已完成的浏览器验收

- 本地页面：`http://127.0.0.1:4173/`。
- 内置浏览器桌面视口：主页加载、领导视图创建、保存后自动选中、指标裁剪、导出、删除和清理均已操作验证。
- 页面控制台未发现应用错误或警告。
- 移动视口验收已完成：`390×844` 和 `360×800` 下首次打开不被欢迎设置遮挡，菜单可打开，抽屉可跳转学生台账；折叠分组搜索仍能显示匹配入口，Escape 和遮罩可关闭，焦点可回到菜单按钮。桌面默认视口复验正常。
- 本轮补充验收：AI 工作台默认上下文预览显示未授权敏感字段不会出站；敏感授权取消后无模型请求、无残留 `running` 状态且生成按钮恢复；`360×800` 页面无横向溢出，底栏保持固定，浏览器控制台无 warning/error。

### 已完成的其他里程碑验证

- 学生台账筛选/排序/派生缓存和 10,000 行导入性能门禁通过。
- 最终候选 HTML 已重新生成：`output/辅导员工作台.html`。
- Windows x64 / ARM64 NSIS 安装包已按当前源码重建：`output/desktop/counselor-desk-4.4.4-x64.exe`、`output/desktop/counselor-desk-4.4.4-arm64.exe`，并生成对应 blockmap；PE 架构检查、解包应用双次持久化烟测和安装器双路径卸载烟测均通过。
- 公开 Release 已提供最终 CI 产物和三份 SHA-256 清单：[Web-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.4.4/Web-SHA256.txt)、[Windows-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.4.4/Windows-SHA256.txt)、[macOS-SHA256.txt](https://github.com/7752777/counselor-desk/releases/download/v4.4.4/macOS-SHA256.txt)。下载后以清单中的 CI 产物哈希为准，不以开发目录中的中间候选文件替代公开清单。
- 先前批次的迁移、备份、附件、交换包回滚、Electron、AI、业务档案和就业资源拆分测试已通过。
- 本次收尾已完整执行单条 `pnpm test` 并以退出码 0 完成；输出中的 jsdom `c.local` 合成资源加载提示和 `window.scrollTo` 未实现提示来自测试夹具，不影响断言结果。

### 后续开发批次验证

- AI 上下文、来源、治理、建议转化、记录级动作和移动导航的定向测试已通过：`tests/cwb-ai-context.js`、`tests/cwb-ai-source.js`、`tests/cwb-ai-governance.js`、`tests/ai-workflow-ui.js`、`tests/ai-record-actions.js`、`tests/v4-modules.js`、`tests/mobile-navigation.js` 和 `scripts/check-inline-js.js`。
- 本轮建议中心新增状态、关键词、用途、风险和来源筛选、失败重试载荷不含密钥、批量查看控件的运行时断言已加入 `tests/cwb-ai-context.js` 和 `tests/ai-workflow-ui.js`；筛选状态、选择状态和重试范围会保存在 UI 状态中。
- `pnpm test:optimization` 已在本批次重新通过，覆盖建议中心、来源、集合清单、就业、移动导航和记录级 AI 动作；本次最终 `pnpm test`、`pnpm test:cwb-ai`、`pnpm lint`、`pnpm build:release`、`pnpm check:public`、`pnpm test:release` 和 `git diff --check` 均已实际执行并通过。新的构建结果只代表当前开发目录，尚未替换公开 v4.4.4。

## 计划完成矩阵

| 计划批次 | 当前状态 | 已完成内容 | 尚未完成内容 |
| --- | --- | --- | --- |
| P0 移动端与 AI 基础设施 | 本地完成 | 首次启动不遮挡导航；抽屉、遮罩、返回键、焦点、搜索和折叠恢复；上下文预览、脱敏、一次性敏感授权、稳定 `student_id` 和三类集合边界。 | 无本地代码阻塞；仍需在新公开产物中复验。 |
| P1 统一建议中心 | 本地完成 | 建议状态机、筛选、人工确认、审计、来源引用、失败重试、批量查看和任务/谈话/留痕转化。 | 不支持批量采纳；高风险、敏感建议和失效来源继续要求人工确认/复核。 |
| P1 核心工作流融合 | 基础闭环完成 | 业务页面统一当前页入口和记录级动作，学生/事项/日期范围上下文可带入，结果只创建建议或草稿。 | 各模块专属指令的真实资料质量、学校口径和专业人员验收仍需持续进行。 |
| P1 受控知识来源 | 本地完成 | 本地资料优先；用户明确触发 HTTPS 公开来源；来源状态、引用片段、重新核验、大小/超时/重定向/私网限制。 | 不做后台全网检索；外部来源失效后必须重新核验。 |
| P2 正式发布 | 未完成 | relay、桌面 `safeStorage`、请求取消/重试、用量统计和移动建议中心已在当前工作区完成。 | 撤销/轮换旧密钥、提交推送、新 Release 和 Pages 部署尚未完成。 |

## 外部发布结果

- 发布提交：[`438badd4fd1fffd6aff36412912309642f02d389`](https://github.com/7752777/counselor-desk/commit/438badd4fd1fffd6aff36412912309642f02d389)。
- GitHub Actions：[run 32024091313](https://github.com/7752777/counselor-desk/actions/runs/32024091313) 已完成 Tests、Windows NSIS、macOS Universal、离线网页和 Draft Release，全 job 成功。
- 正式 Release：[v4.4.4](https://github.com/7752777/counselor-desk/releases/tag/v4.4.4) 已于 2026-08-17 公开，包含 Windows x64 / ARM64、macOS Universal DMG / ZIP、离线 HTML 和三份 SHA-256 清单。
- Pages：[run 32025171557](https://github.com/7752777/counselor-desk/actions/runs/32025171557) 已成功部署到 [https://7752777.github.io/counselor-desk/](https://7752777.github.io/counselor-desk/)，线上入口已验收并无应用控制台错误。
- macOS Universal 构建未配置代码签名或公证；Release 说明已明确标注，安装前必须核对哈希并遵循学校软件管理策略。
- 截至本页记录时，`v4.4.3` 历史 Tag 未被改写；`v4.4.4` 是当时的当前公开下载版本。v4.4.5 状态见本页新增附录。
- 不应把 `output/v4-preview.html`、开发目录或本地 `4173` 服务当作正式生产下载入口。

## 剩余限制

- 本地 `http://127.0.0.1:4173/` 仅用于开发验收，不是公开站点；公开体验入口以 Pages URL 为准。
- 手机上的 `127.0.0.1` 指向手机本机，不能访问电脑上的本地服务；手机测试应使用电脑局域网地址、Pages 地址或离线 HTML。
- 当前 AI 的统一就地入口、记录级动作、跨模块上下文、来源重新核验、移动端基础建议转化和桌面安全密钥存储已经完成；各业务页面的专属指令和真实资料效果仍需持续验收，不允许把通用建议当作专业结论。
- 截至本页原始记录时间，工作区的 AI relay、上下文、建议中心和移动导航修改尚未提交、推送或发布；公开 v4.4.4 不包含本批次改动。v4.4.5 候选的后续状态见[发布收尾记录](./release-v4.4.5.md)。此前暴露过的外部 API 密钥仍需由账户持有人撤销并轮换。
- 发布包未配置代码签名；macOS 包另外未公证，首次启动可能受系统安全策略提示影响。
- 线上验收覆盖公开页面加载、入口结构和控制台错误检查，不等同于每一所学校的网络、安全软件、账号策略和终端兼容性认证。

## 文档入口

- 使用者： [三分钟快速上手](../quick-start.md)、[开始使用](../getting-started.md)、[用户手册](../user-guide.md)
- 数据与安全： [数据参考](../data-contract.md)、[隐私与安全边界](../v4-privacy.md)、[备份与迁移](../v4-migration-and-backup.md)
- 开发与发布： [开发与构建](../development.md)、[发布指南](../release-guide.md)、[架构概览](../architecture.md)
- 升级事实： [当前差异基线](./current-baseline.md)、[实现基线](./implementation-baseline.md)、[开发源权威清单](./source-authority.md)

## 本轮流程说明

- 普通 UI 与文档变更采用局部验证；跨模块、持久化和数据迁移风险采用扩大后的 v8/IndexedDB 测试。
- 独立代码审查代理发现了旧视图迁移和设置并发写入问题，修复后已通过专项回归。
- 没有进行与源码内容无关的常规哈希检查；仅在最终候选 HTML、Windows 安装包和本轮最终离线 HTML 生成后按交付节点执行 SHA-256 校验。
- 本轮后续开发没有重复执行未发生代码变化的历史发布哈希检查；新的发布产物完成前不新增哈希门禁。
- 本次 `pnpm test` 的部分 jsdom 场景会输出合成 `c.local` 资源加载和 `window.scrollTo` 未实现提示；它们来自测试夹具，相关测试断言通过，未形成应用失败。

## 2026-08-18 后续开发批次

- 建议中心的用途、风险、来源筛选现已保持为四个独立控件；窄屏下建议详情、来源核验状态、公开网页回链和任务/谈话/留痕按钮均可换行显示。
- `CWB.ai.sources.revalidate()` 已接入来源目录；重新核验成功会更新标题、摘录和时间，失败会记录安全错误代码并标记 `needs_review`，新上下文不会发送未核验外部来源。
- 学生档案、谈话详情、任务和业务档案编辑入口会记录当前页面、事项 ID 和稳定 `student_id`；学生摘要和谈话 briefing 可以从详情直接生成建议草稿。
- 本批次补齐敏感字段出站授权、建议模型快照、来源抓取/核验时间展示、跨页面事项上下文清理和外部取消信号转发；默认仍不发送内部 `student_id`，未授权联系方式等字段仍保持脱敏。
- 本轮继续补齐模型直连和来源抓取的客户端超时；超时会释放请求控制器并保留无密钥重试范围，外部取消仍与超时区分记录。公开来源在导入/恢复后会重新检查 HTTPS、凭据、私网主机和核验状态，异常快照不会进入新上下文。
- 模型配置前置失败会写入安全失败审计但不会消耗敏感授权；视觉模型的数组化文本响应已统一提取，证书识别等图片草稿不会保存 `[object Object]`。
- 本批次定向验证通过：`node tests/cwb-ai-source.js`、`node tests/cwb-ai-context.js`、`node tests/ai-workflow-ui.js`、`node tests/ai-record-actions.js`、`node tests/mobile-navigation.js`、`node tests/cwb-ai-workflow.js`、`node tests/v4-modules.js` 和 `pnpm lint`。本地 `http://127.0.0.1:4173/` 已复核 AI 页面和四个独立筛选控件；内置浏览器已在 `390×844` 与 `360×800` 真实移动视口验收菜单、抽屉、底栏、折叠搜索、Escape/遮罩关闭和模块跳转。
- 本轮新增回归：`tests/ai-workflow-ui.js` 断言取消敏感授权后不会保留 `.ai-request-state.is-running`；`node tests/ai-workflow-ui.js`、`pnpm test:cwb-ai` 和 `pnpm lint` 在修复后重新通过。
- 截至本页原始记录时间，完整 `pnpm test`、AI 专项、优化回归、构建、公开面、发布契约、lint 和差异检查均已通过；当时开发候选的哈希只代表本地目录，不能替代公开 v4.4.4 的 CI 产物哈希。v4.4.5 版本升级后的最终命令和新产物哈希必须以[发布收尾记录](./release-v4.4.5.md)回填。
- v4.4.5 的提交、推送、跨平台构建、正式 Release 和 Pages 状态不写入本页历史段落，避免把新版本事实混入 v4.4.4 证据。

### 2026-08-18 移动卡片收尾

- 业务档案、就业意向和就业联系在移动视口使用卡片布局，编辑、删除、记录级 AI 动作、`target_collection`、`target_record_id` 和稳定 `student_id` 均保留；摘要使用独立换行样式，长文本不会挤压操作区。
- `tests/mobile-navigation.js` 增加移动卡片摘要样式回归断言；本批次代码变更后已重新执行 `pnpm test:optimization`，结果通过。随后完整 `pnpm test`、AI 专项、`pnpm build:release`、`pnpm check:public`、`pnpm test:release`、`pnpm lint` 和 `git diff --check` 均通过，最终离线包哈希已记录在上方。
- 上一轮开发候选（本轮授权取消状态修复前）的 Windows 安装包已通过架构、解包持久化和安装器烟测：x64 SHA-256 为 `867733A0325832C25D8E6692C9F03564FF6053CA9E3CE699EE9D851352C9CB6C`，ARM64 SHA-256 为 `A99FE2570CA1FA5354B9DCA0993987829DC9265FD747D9FC1BBCFED31FBF5FAF`。本轮只重新生成并校验了最终离线 HTML；Windows 包需在正式发布批次中随新源码重新打包，以上哈希不代表公开 Release 已更新。

### 2026-08-18 外链安全与窄屏动作区收口

- 政策智库和就业资源外链统一使用 `CWB.utils.safeExternalUrl()`，仅允许绝对 `http`/`https` 地址；`javascript:`、`data:`、`file:`、`blob:`、相对地址、带用户名/密码地址、控制字符和超长地址均不会生成链接。非法值仍保留在业务记录中供人工编辑，页面显示“网址待核验”。
- 就业资源卡片动作区增加换行规则，修复动态 AI 记录动作在 `360×800` 下被裁切的问题；浏览器布局检查确认按钮右边界不超过视口，页面 `scrollWidth` 与客户端宽度一致。
- 新增定向回归 `tests/external-url-safety.js`，并挂入 `pnpm test:optimization`；本批次已通过该测试、`pnpm lint`、`git diff --check` 以及内置浏览器 `390×844`/`360×800` 实测。

## 2026-08-18 v4.4.5 发布候选收口

本页前文保留 v4.4.4 的历史正式发布证据；本次新增的 AI relay、跨模块上下文、统一建议中心、来源核验、记录级动作、移动导航和仓库发布工程已整理为 `v4.4.5` 候选。完整范围、版本升级、最终门禁、正式 Release、Pages、跨平台附件和 SHA-256 回填统一记录在[ v4.4.5 发布收尾记录](./release-v4.4.5.md)。

候选阶段已完成的事实包括：

- AI 已从独立工作台扩展为学生、谈话、任务、成绩、资助、心理、就业、资料、班团、组织和工作留痕等模块的统一入口与记录级草稿工作流。
- 统一建议、来源和授权集合已接入浏览器、离线 HTML、Electron、备份、迁移、交换包和手机工作包；稳定 `student_id` 是跨模块关联主键，学号只作兼容快照。
- 手机首次欢迎设置不再遮挡导航；抽屉、折叠搜索、全部展开、恢复导航、Escape、遮罩、焦点和窄屏动作区已完成 `390×844` / `360×800` 验收。
- 发布工作流已改为动态版本附件名和 CHANGELOG 发布说明，并增加 `check:secrets`、Dependabot、Issue 表单和 PR 模板。

在 v4.4.5 的真实 Tag、Actions、Release、跨平台附件和 Pages 完成前，不能把本候选写成正式公开版本，也不能用 v4.4.4 的旧哈希证明新产物。

## 后续附录：v4.4.5 已正式公开

以上“发布候选收口”段落保留 2026-08-18 发布前的历史记录，不改写当时的判断。其后，v4.4.5 已由提交 [`44c833d1bafbe51df844f81cbcc0d638e7e9621e`](https://github.com/7752777/counselor-desk/commit/44c833d1bafbe51df844f81cbcc0d638e7e9621e) 正式公开：

- [GitHub Release v4.4.5](https://github.com/7752777/counselor-desk/releases/tag/v4.4.5) 已为非 Draft、非 Pre-release 的 Latest 版本。
- [Release Actions #25](https://github.com/7752777/counselor-desk/actions/runs/32086383154) 和 [Pages 部署 #46](https://github.com/7752777/counselor-desk/actions/runs/32089792020) 均成功。
- 正式 Release 已提供离线 HTML、Windows x64 / ARM64、macOS Universal DMG / ZIP 和三份 SHA-256 清单；具体附件哈希见[ v4.4.5 发布收尾记录](./release-v4.4.5.md)。
- [在线 Pages 入口](https://7752777.github.io/counselor-desk/) 已返回 200 并确认运行时版本为 4.4.5。

因此，v4.4.5 的正式发布事实以新增附录和[发布收尾记录](./release-v4.4.5.md)为准；本页前文仍只作为 v4.4.4 及发布前候选阶段的历史证据。
