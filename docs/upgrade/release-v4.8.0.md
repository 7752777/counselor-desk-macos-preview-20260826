# v4.8.0 发布收尾记录

> 状态：正式发布完成。

本文档记录 v4.8.0 的发布门槛、发布前审计、正式资产和发布后限制。当前源码版本已经切换为 `4.8.0`，正式下载以 GitHub 私有 Release 实际存在的资产和校验清单为准。

## 当前边界

| 项目 | 状态 |
| --- | --- |
| 版本号 | `package.json`、Electron 包和页面 `APP_VERSION` 均为 `4.8.0` |
| 分支 | 正式代码冻结由 `v4.8.0` Tag 指向 `63c429d`；发布后文档回填提交为 `49b4dbc`，已同步到 `codex/ai-upgrade` 和 `master` |
| Tag | [`v4.8.0`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.0) 已创建并指向 `63c429d` |
| GitHub Release | [`v4.8.0`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.0) 已发布为非 Draft、非 prerelease |
| Windows/macOS 包 | Windows x64/ARM64 和 macOS Universal 已构建、烟测、生成校验清单并上传；包未签名，macOS 未公证 |
| Web/离线包 | `CounselorDesk-v4.8.0-Offline.html` 已构建、生成校验清单并上传 |
| Pages | 私有仓库不以 Pages 访问性作为发布证明 |
| 历史版本 | `v4.7.1` 及更早 Tag/Release 保留，不覆盖 |

## 2026-08-22 代码冻结证据

- 本地完整 `pnpm test` 退出码为 `0`，覆盖全模块、AI、Electron/SQLite、IndexedDB、v11 迁移、备份、附件、交换包和 10,000 条导入性能。
- `pnpm test:v48` 和 `pnpm test:desktop` 退出码为 `0`，覆盖局域网服务、二维码配对、冲突、远程加密备份、跨端恢复、学生批量导入、桌面卡片模式和 SQLite 烟测。
- `pnpm lint`、`pnpm build:release`、`pnpm check:public`、`pnpm check:secrets`、`pnpm test:release` 和 `git diff --check` 均通过。
- 真实浏览器视口 `1440x920`、`1280x800`、`1024x768`、`390x844`、`360x800` 已验收；远端 Ubuntu 完整测试通过；macOS CI 的打包和 Universal 架构验证通过，候选制品上传曾受 Actions 配额影响，不影响正式 Release 的直接资产上传。
- 真实手机扫码、证书信任、长时间多设备同步、WebDAV 服务商互操作、实机数据目录回滚和签名/公证属于发布后的已知限制，不被自动化门禁冒充为已验收。

## 已完成的候选实现

- Electron 密钥 envelope、恢复包、仓储健康检查、错误码和数据目录迁移核心。
- 可选择安装目录的 NSIS 配置变更。
- 局域网主机核心：HTTPS、证书指纹、配对码、设备授权/撤销、幂等、字段冲突和附件分块校验；正式附件和临时断点分块均加密落盘，授权下载时解密。
- `v10 -> v11` 增量迁移、共享集合 manifest、学生 `student_id` 优先导入核心和覆盖恢复点契约。
- 桌面运行期间每分钟备份到期检查，以及备份失败状态提示。
- 备份成功后写入最多 50 条 `v4_backup_runs` 最小运行记录；记录不计入业务变更阈值，备份/换机包/恢复测试已覆盖。
- `CWBV48.createRemoteBackupAdapter()` 已提供只上传加密 `.cwbk` 的 HTTPS/WebDAV 核心；候选页面已提供地址、端点、认证方式、测试连接、上传、下载预览恢复和删除，凭据只保留当前会话；真实服务商互操作尚待验收。
- 本地内容推送服务和学生自定义字段目录服务的核心契约。
- 本地内容推送角色与范围策略：`workspace_admin`、`content_editor`、`teacher`、`viewer`；普通角色的列表、已读和内容包导出均按当前工作区上下文过滤，管理员按权限导出全量；角色仍是本地策略标签，不是真实账号认证。
- 局域网客户端连接、证书指纹比对、拉取、推送、离线队列和冲突收件箱页面；冲突支持保留本机、采用主机和手动编辑，主机同步操作已接入真实 Electron SQLite 记录，冲突解决会产生可拉取修订。
- 学生字段中心、动态分班、政策资料发布/已读/撤回、模板版本与一生一表任务草稿、数据修复诊断入口。
- `voice_transcription`、`psych_note_draft`、`cohort_summary` AI 用途和逐次授权/音频不落库/最小人数聚合边界。
- 同步审计回调和管理页面操作审计：只记录操作类型、集合/记录 ID、设备、字段名、版本、附件哈希等最小元数据，不记录字段补丁值、令牌或附件明文；保存失败会回滚候选内存变更并保留重试。
- 心理页面候选闭环：浏览器录音、单次敏感授权、转写 relay、二次脱敏、人工编辑确认和群体主题阈值聚合；原音频取消/失败/完成后释放，不进入附件仓。
- 一生一表候选闭环：受支持 DOCX 模板字段校验、缺失字段预览、单人/批量 Word 输出，以及内容控件反向汇总预览和结构化 CSV 导出。
- 动态分班联合走访、工作分类中心和内容包导入/导出页面已经接入；联合走访按日期和班级筛选并明确区分“无课表记录”和“空课时”。
- 学生台账已接入多选批量编辑、批量归档、批量删除、差异确认和一次撤销；远程备份页面配置、测试连接、上传、下载预览恢复和删除均已进入候选 UI。

逐条事实见[客户反馈审计](./customer-feedback-audit-2026-08-21.md)，存储和同步细节见[局域网同步与存储记录](./lan-sync-and-storage-v4.8.0.md)。

## 已知限制与未纳入本次自动化资产证据

本节不是 v4.8.0 Release 的阻断项，而是发布后仍需在目标学校环境完成的实机/服务商核验。Release 工作流已经完成可重复的源码、测试、构建、资产和校验清单门禁；这些外部条件不能被自动化脚本冒充为已完成。

- 手机真实 HTTPS 信任、二维码/自动发现和多设备长期压力测试；附件客户端分块上传 UI 已进入候选并通过 `v48-lan-ui`，仍需真实手机断网重连验收。
- 数据目录迁移和恢复包的 Windows/macOS 实机回滚测试；当前已提供诊断/恢复页面入口。
- 手机/桌面真实麦克风权限、长音频压力、DOCX 版式和 Word 反向汇总真实文件抽查。
- 宿舍联查大名单压力、普通角色真实设备范围权限、工作节点全链路导出、真实 WebDAV/HTTPS 服务商互操作和加密包恢复抽查。
- 新集合在真实 IndexedDB、单文件、Electron、备份恢复和手机交换包中的逐集合读写验收；当前已通过脱敏夹具契约测试，仍缺真实设备抽查。
- 真实 5,000 名学生、10,000 条业务记录及照片/证书/活动附件的跨端恢复验收。
- 正式构建、密钥扫描、公开面检查、Release 契约、签名/公证和受控分发证据。

## 发布前命令

代码稳定后执行一次最终门禁；修复问题后只重跑受影响测试，再补做一次最终门禁：

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

定向批次命令：

```text
pnpm test:desktop
pnpm test:lan-sync
pnpm test:v48
pnpm test:backup-state
```

## 正式发布步骤（已执行）

1. 将 `package.json`、锁文件、用户手册、数据契约和发布记录切换到 `4.8.0`。
2. 创建 v10 到 v11 迁移恢复点，验证旧 v4.7.1 数据可读、旧 Tag/Release 不变。
3. 完成 Windows/macOS 构建、安装路径选择、数据目录迁移、恢复口令和附件回读实机验收。
4. 生成离线 HTML、桌面包、校验清单；哈希只在最终产物生成时计算一次。
5. 创建 `v4.8.0` Tag 和私有 GitHub Release，上传正式构建、说明和校验清单。
6. 将实际提交、Actions、Release 资产、安装包和跨端恢复结果回填本文档。

## 2026-08-22 正式发布证据（当前权威）

- Tag：[`v4.8.0`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.0)，目标提交 [`63c429d`](https://github.com/7752777/counselor-desk/commit/63c429df5f877ab5a91476f18b8dc468c3edcbc6)。Tag 不移动，历史 `v4.7.1` 及更早 Tag/Release 不覆盖。
- Release：[`v4.8.0`](https://github.com/7752777/counselor-desk/releases/tag/v4.8.0)，2026-08-22 05:23:43 UTC 发布，状态为非 Draft、非 prerelease；仓库为私有，下载需要仓库权限。
- Actions：发布运行 [#32553621535](https://github.com/7752777/counselor-desk/actions/runs/32553621535) 全部成功：Tests [#96984253701](https://github.com/7752777/counselor-desk/actions/runs/32553621535/job/96984253701)、Windows [#96984870306](https://github.com/7752777/counselor-desk/actions/runs/32553621535/job/96984870306)、macOS [#96985369548](https://github.com/7752777/counselor-desk/actions/runs/32553621535/job/96985369548)、Web [#96985722973](https://github.com/7752777/counselor-desk/actions/runs/32553621535/job/96985722973)、资产发布核对 [#96985770031](https://github.com/7752777/counselor-desk/actions/runs/32553621535/job/96985770031)。
- Windows 资产：`counselor-desk-4.8.0-x64.exe` 约 91.3 MB，SHA-256 `4ea2329aebc539dfc60862956f789765d27de12ff9f9a1314ca94e96aea61afc`；`counselor-desk-4.8.0-arm64.exe` 约 85.7 MB，SHA-256 `d3ded899594e9ac60c597e8744bfb47ea7a45d9b40221d68548d6ee01a5257b7`。
- macOS 资产：`counselor-desk-4.8.0-mac-universal.dmg` 约 187.7 MB，SHA-256 `b887bba9847c47ed076b2ed058bee4e0dbce91a9874db6c1fb40a2e2d8748b99`；`counselor-desk-4.8.0-mac-universal.zip` 约 187.2 MB，SHA-256 `da10c783ad8ab146e0aeb030ef25f3225077a6630f683805ad40aa00d475337e`。
- Web 资产：`CounselorDesk-v4.8.0-Offline.html` 约 13.5 MB，SHA-256 `69263c2056f6bee2ce3beb81e07cf94beca35b7a2a5a1dd7c9dae0a610f0b8f5`。
- 校验清单：Release 同时提供 `Windows-SHA256.txt`、`macOS-SHA256.txt` 和 `Web-SHA256.txt`；下载后应先核验清单，再安装或打开。
- 发布边界：Windows/macOS 包未签名，macOS 未公证；局域网首期只允许同一网络，手机端不会自动信任证书；浏览器关闭期间无法后台写文件或同步；本版本不提供云端实时学生业务同步、数据库级加密、后台全网抓取或 AI 自动事实认定。

本文前面的候选状态、阶段性“尚未发布”表述是发布前审计历史；如与本节冲突，以本节的实际 Tag、Release、Actions 和资产证据为准。

以下带日期的阶段性章节保留为发布前审计记录，用来说明发现问题、验证范围和当时的发布判断；当前正式状态以本节以及本文顶部的 Tag、Release、Actions 和资产清单为准。

## 当前验证证据

v4.8.0 发布代码已通过桌面、局域网核心、v48 服务、学生导入 UI、局域网 UI、桌面备份调度器、远程备份配置 UI、跨端恢复契约和 inline lint 定向测试；完整自动化门禁、正式构建、Windows x64/ARM64、macOS Universal、离线 Web 和资产核对由发布 Actions 完成。真实手机、服务商互操作、长期同步、签名/公证等限制不被自动化测试冒充为已验收。

本批新增定向证据：`pnpm test:v48` 已通过，包含 `node tests/v48-storage-hardening.js`、`node tests/v48-cross-platform-recovery.js`、`node tests/v48-backup-records.js`、`node tests/v48-lan-ui.js`、`node tests/lan-sync.js`、`node tests/v48-content-export.js` 和 `node tests/v48-worklog-export-runtime.js`；其中覆盖主机所有设备路由令牌校验、正式附件/临时分块非明文、授权下载回读、远程加密备份适配器、备份运行记录恢复、学生批量维护页面、远程备份配置页面、内容推送跨学院/跨角色权限和构建后工作留痕来源回链。`node tests/v48-management-ui.js` 额外覆盖手动冲突编辑、连接失败保留会话表单、远程配置不持久化凭据。JSDOM 页面测试主动过滤未安装 Canvas 的环境噪声，不替代真实浏览器视觉验收。

## 2026-08-21 内容权限与工作留痕导出收口

本批修复了内容推送页面与核心服务之间的上下文丢失问题：页面列表调用 `listAll(actor, context)`，导出调用 `exportPackage(context, { actor })`，已读调用 `markRead(pushId, readerId, actor, context)`。普通角色在学院、年级或班级范围内只能看到和导出当前上下文匹配的已发布内容；跨范围标记已读会被核心服务拒绝。未传上下文的旧核心调用仍保留兼容语义，但页面不再使用空上下文。

导出工作留痕时，构建后的单文件运行时会重新从本地集合解析来源记录，写入来源标签和来源状态，并在包顶层写入 `provenance`。这条链路只提供可回查关系，不替代人工核对、访问锁或导出前敏感字段确认；来源已删除或已变化时仍应回到业务记录处理。

本节验证了服务级权限、页面入口和真实构建产物运行时三层边界。它仍是 v4.8.0 候选证据，不代表真实账号认证、真实多设备协作或正式 Release 已完成。

## 2026-08-21 提交前验证结果

本批代码和文档提交前实际执行并通过：

```text
pnpm test:v48
pnpm lint
pnpm check:public
pnpm check:secrets
git diff --check
```

其中 `pnpm test:v48` 包含新增的内容权限、同步规模、远程备份互操作和构建后工作留痕来源回链测试；`check:secrets` 检查了 313 个仓库文件。由于该段记录的是发布前批次，未重复执行同一代码状态下已经通过的完整命令；最终发布代码随后完成完整门禁并生成正式资产。真实手机、WebDAV、长期同步和附件恢复实机抽查属于发布后维护范围。

## 2026-08-21 高风险维护更新

本批是 `codex/ai-upgrade` 的发布前候选审计记录，当时正式版本为 `v4.7.1`。新增收口内容如下：

- `desktop/data-target.cjs` 对空数据目录、根目录、当前目录和工作区内路径做纯函数校验；`desktop/data-directory.cjs` 覆盖候选仓激活失败和原仓回滚失败两种事务结果。
- `desktop/main.cjs` 使用迁移事务辅助模块，候选仓健康检查通过前不会切换活动仓；回滚失败时不保留可写活动仓，并返回可诊断错误码。
- `CWBV48.createRemoteBackupAdapter()` 在网络请求前验证端点路径，拒绝绝对地址和目录穿越；测试覆盖原始与 URL 编码的 `..`、查询参数基址和本地错误码保留。
- 局域网主机页面增加可复制的地址、配对 ID、配对码和证书指纹；当前仍明确没有二维码/自动发现，不把该能力写成已完成。

本批局部验证已经通过：`node tests/desktop-data-target.js`、`node tests/desktop-data-directory.js`、`node tests/desktop-contract.js`、`node tests/v48-storage-hardening.js`、`node tests/v48-lan-ui.js` 和相关 `node --check`。由于本批修改涉及桌面持久化和远程 URL 安全，最终发布前仍需按“发布前命令”重新执行一次完整门禁；不能沿用本批之前的全量绿色记录。

## 2026-08-22 当前界面与交互证据

本地真实浏览器已验收 `1440x920`、`1280x800`、`1024x768`、`390x844` 和 `360x800`：三栏/窄桌面上下文、移动抽屉与底栏、遮罩关闭、Escape 焦点返回、分组导航搜索、sticky 顶栏、无横向溢出和学生台账卡片模式均通过。卡片模式中多余的表格滚动代理已修复。详细事实见[当前收口总账](./closeout-status-2026-08-22.md)。

本轮将通知预览公共调用统一为异步持久化语义，`pnpm test:cwb-ai`、`node tests/v45-teacher-feedback.js`、`node tests/v47-polish-ui.js` 和 `node tests/interaction-continuity.js` 均通过。交互回归中曾因测试在通知预览前注入保存失败而误把预览失败当成确认失败；现已修正测试时序，仍保留确认事务失败后的回滚断言。这里仍是未发布候选证据，不能替代最终完整门禁。

## 2026-08-22 AI 写入链路与失败回滚复核

本批重新运行 `pnpm test:cwb-ai`，覆盖治理、模型就绪、用途边界、relay、语音、来源、上下文、记录转换、跨模块、出站脱敏、建议质量反馈和 AI 输出健康检查，全部通过。`node tests/interaction-continuity.js` 也已通过，确认以下行为：

- 通知预览必须等待本地来源和审计持久化后才返回结果；页面不会把 Promise 当成通知内容渲染。
- AI 建议接受、证书确认、工作总结确认和通知确认失败时，建议、草稿、审计和正式业务记录按事务快照恢复。
- 失败操作不提示成功；表单和确认框保留重试入口，成功重试不重复创建记录。
- AI 输出继续执行二次脱敏，内部 `student_id`、记录 ID、附件 ID、审计 ID 不进入模型出站或普通业务备份。

本节验证的是发布前候选的代码与 JSDOM/契约行为；真实模型质量、真实麦克风、Electron 实机、手机设备和最终构建后来由正式工作流或发布后限制分别记录。

## 2026-08-21 P0 收口证据

本批在未切换版本号、未创建 Tag/Release 的状态下完成同步持久化安全收口：

- 同步主机状态快照和 Electron 业务记录具备提交失败回滚；新增业务记录使用仓储删除接口清理。
- 配对码数字化、五次错误限流、HTTPS 客户端配置错误保留、证书 SAN 和 IPC 诊断错误码均已覆盖。
- 事务内成功审计改为提交后发送；失败回滚不会产生确认、接受、解决或撤销的假成功审计。
- 新增 `pnpm test:v48-p0`、`test:sync-conflicts`、`test:sync-attachments`、`test:student-identity`、`test:student-bulk`、`test:student-forms`、`test:derived-analysis`、`test:ai-sensitive-voice`、`test:form-mapping` 和 `test:content-push` 入口，便于后续按风险运行定向验证。

本批实际已运行并通过：

```text
node --check src/core/cwb-v48.js
node --check desktop/lan-sync.cjs
node --check desktop/main.cjs
node tests/v48-p0-hardening.js
node tests/v48-services.js
pnpm test:lan-sync
```

代码变更后，之前在旧代码状态通过的 `pnpm test:v48`、完整测试、构建和发布门禁不能直接沿用；最终发布前必须在最终代码状态按本文发布前命令重新执行。源码阶段未做哈希检查，最终产物生成时才检查哈希。

## 2026-08-21 最新候选变更

- 配对流程新增客户端轮询领取一次性令牌；主机只在内存短期保存交付令牌，健康/设备状态不暴露 `token_hash`。
- 设备管理新增暂停和恢复；暂停设备不能同步或传附件，撤销仍为不可逆的重新配对边界。
- 客户端新增 `syncNow()` 和 60 秒自动同步调度；失败会保留队列和游标并保存错误状态，成功后才清理已完成队列。
- `ui_state` 持久化明确删除会话令牌、同步客户端对象和令牌草稿，避免配对凭据进入普通设置备份。

本批实际定向验证：`node tests/v48-sync-resilience.js`、`node tests/lan-sync.js`、`node tests/v48-services.js`、`node tests/v48-p0-hardening.js`、`node tests/v48-lan-ui.js`、`node tests/v48-management-ui.js`、`node tests/electron-surface.js`、`node tests/desktop-contract.js`、`node tests/security-boundary.js`、`node scripts/build-release.js output/v4-preview.html`、`node scripts/check-inline-js.js`及相关 `node --check`。由于当前仍是候选代码，未在本批重复执行完整 `pnpm test`、`pnpm build:release`、`pnpm test:release`或产物哈希；最终代码稳定后必须重新执行一次完整门禁。

## 2026-08-21 照片持久化回归收口

学生照片保存路径又完成一次小范围可靠性优化：成功上传只执行一次学生记录持久化；只有旧附件清理失败、确实需要保存待清理标记时才追加写入。档案编辑器也避免在照片上传内部保存成功后再次保存同一学生，减少延迟和二次失败窗口。照片保存失败仍会恢复原照片引用并清理新附件。

本次变更后实际通过：

```text
node tests/photo-storage.js
node tests/interaction-continuity.js
node tests/v48-student-import-ui.js
node tests/v48-sync-resilience.js
node tests/ai-cross-module-audit.js
node tests/ai-workflow-ui.js
```

此前完整门禁和 v4.8 定向门禁的结果不能直接覆盖本次源码变更；本节只记录局部回归，正式发布前仍需按本文“发布前命令”重新执行完整测试、构建、公开面、密钥扫描和 Release 契约。当前仍未创建 `v4.8.0` Tag/Release，正式用户仍以 `v4.7.1` 为准。

## 2026-08-21 全量回归状态纠偏

本候选在完整 `pnpm test` 的 IndexedDB 浏览器契约阶段发现一处测试假设错误：大批量学生导入采用 `__cwb_bulk_students__` 单条原子载荷，底层行数不是逻辑学生数。已将 `tests/v8-canonical-idb-browser.js` 改为验证“原始载荷完整 + 仓储 reopen 后逻辑记录完整”，受影响测试 `node tests/v8-canonical-idb-browser.js` 已通过。

在该测试修正后，完整 `pnpm test` 已重新执行并退出码 `0`；`v8-canonical-idb-browser` 通过，10,000 条浏览器导入样本耗时 `4788.5ms`，最大事件循环间隔 `176ms`。随后执行的 `pnpm lint`、`pnpm build:release`、`pnpm check:public`、`pnpm check:secrets`、`pnpm test:release` 和 `git diff --check` 也全部退出码 `0`。当前不创建 `v4.8.0` Tag、Release、正式安装包或 Pages 发布物，正式用户仍以 `v4.7.1` 为准。

## 2026-08-21 完整回归结果

修正原子载荷测试契约后，完整 `pnpm test` 实际退出码为 `0`，覆盖回归、导入/导出、AI 治理、Electron/SQLite、浏览器存储、迁移、备份、附件、工作区和交换包。JSDOM 中的 `https://c.local` 资源加载错误仍会输出为既有模拟环境噪声，但相关测试断言通过，不能把它写成真实网络或人工浏览器验收。

## 2026-08-21 二维码批次状态

在上述历史记录之后，发布前工作区候选新增了二维码配对实现：`desktop:lan-sync-pairing-qr`、预加载安全桥接、`CWBV48.createPairingQrPayload()` / `parsePairingQrPayload()`、`qrcode@1.5.4` 和构建后 UI 契约测试均已加入。该批已通过 `node tests/v48-pairing-qr.js`、`node scripts/build-release.js output/v4-preview.html`、`node tests/v48-lan-ui.js` 和相关语法检查。

因此，本文件较早出现的“二维码尚未实现”是历史快照；发布前截至本节，二维码已在工作区候选中实现，但自动发现、自动证书信任、真实手机扫码/HTTPS 信任和多设备长期压力仍未通过。该候选随后完成最终门禁并创建 `v4.8.0` Tag、Release 和正式安装包；自动发现、真实证书信任和长期压力仍按发布后限制维护。

## 2026-08-22 当前事实总账回链

最新候选状态、已完成能力、未完成事项和证据分层统一见[当前收口总账](./closeout-status-2026-08-22.md)。本轮 AI 持久化与离线队列文案修改发生在上述验证之后，因此旧的完整门禁记录不能直接覆盖当前工作区；代码稳定后必须重新执行本文规定的最终门禁。没有真实设备、正式安装包和发布证据前，不得切换版本号或创建 `v4.8.0` Tag/Release。

## 2026-08-22 最新完整测试 checkpoint

同步补丁已统一清理客户端传入的记录元数据，并对 `students` 集合强制保持 `student_id === record_id`；错误修改稳定 ID 会返回 `SYNC_STUDENT_ID_IMMUTABLE`。本次新增回归已通过 `node tests/v48-core.js`、`node tests/lan-sync.js`。

随后在相同代码状态下重新执行完整 `pnpm test`，退出码为 `0`，覆盖全模块回归、AI、Electron/SQLite、浏览器 IndexedDB、v11 迁移、备份、附件、交换包和 10,000 条导入性能。性能样本约 `4.76s`，最大事件循环间隔约 `175ms`。这只证明当前测试环境的自动化契约，不替代 Windows/macOS 实机、真实手机 HTTPS/二维码信任、长时间多设备同步、真实 WebDAV、附件跨端恢复和签名/公证。

当前仍需在代码冻结后重新执行 `pnpm lint`、`pnpm build:release`、`pnpm check:public`、`pnpm check:secrets`、`pnpm test:release` 和 `git diff --check`，再生成正式产物；在这些证据齐全前，`package.json` 继续保持 `4.7.1`，不创建 `v4.8.0` Tag/Release。

## 2026-08-22 AI 入口与批量审阅维护

- 清理重复的旧证书识别入口，当前唯一入口为带附件逐次授权、`persistOutput:false` 延迟保存、证书草稿和人工确认链路的 `startAiCertificateRecognition`。
- 修复建议中心批量驳回只改内存的问题。批量状态、批量审计和 `v4_ai_suggestions` 现在通过同一持久化事务提交；保存失败会恢复整批建议，按钮不会清空选择或显示虚假成功。
- 局部验证已通过：`node scripts/build-release.js output/v4-preview.html`、`node tests/ai-contract.js`、`node tests/ai-source-integrity.js`、`node tests/interaction-continuity.js` 和 `node tests/v47-polish-ui.js`。

本节仍是未发布候选证据，不替代最终完整门禁、真实设备验收、正式安装包或 v4.8.0 Release。

## 2026-08-22 IndexedDB 兼容性阻断修复

本轮真实浏览器验收发现已有 v4.7 工作区使用物理 IndexedDB 版本 5，而 v4.8 候选 manifest 已包含更多集合；旧数据库不会触发升级，通知 AI 本地预览因此报 object store 缺失。运行时现已将物理数据库版本增量到 6，并保持工作区协议 `schema_version:8`、业务 `data_schema_version:11` 和 `sync_protocol_version:1` 不变。

修复后的回归夹具先创建 v5 数据库，再由当前运行时升级，确认旧学生记录仍然可读，且 `v4_ai_sources`、`v4_ai_suggestions`、`v4_ai_consents`、同步、备份运行和内容推送相关 stores 均创建成功。真实浏览器已有工作区重新加载后保存状态恢复为“已保存”；通知样例的“本地预览重点”成功生成结果。

本条关闭了一个旧浏览器工作区的代码级阻断，但不改变发布状态：`v4.8.0` 仍未切换版本号、未创建 Tag/Release、未生成正式安装包。修复后必须重新完成本文发布前命令，并补齐 Windows/macOS、真实手机局域网、WebDAV、长时间同步和照片/证书/活动附件恢复验收。

全量现状和分批路线见[当前全量状态与后续提升路线](./comprehensive-status-and-roadmap-2026-08-22.md)。

## 2026-08-22 修复后最终自动化门禁

IndexedDB 物理版本修复、AI 公共写入对象级 `ready` 承诺、审计契约和相关回归纳入发布前候选后，已重新执行并通过最终自动化门禁：

```text
pnpm test                 # exit 0
pnpm lint                 # exit 0
pnpm build:release        # exit 0
pnpm check:public         # exit 0
pnpm check:secrets        # exit 0，318 个仓库文件
pnpm test:release         # exit 0
git diff --check          # exit 0
```

`build:release` 生成了 `output/辅导员工作台.html` 候选产物。完整测试覆盖全模块回归、AI、Electron/SQLite、IndexedDB 旧库升级、迁移、备份、附件、交换包和 10,000 条导入性能。JSDOM 的 `https://c.local` 报错是既有外部 origin 模拟噪声，未导致断言失败。

自动化门禁通过后，当时仍有真实环境发布前待验收项：Windows/macOS 安装和数据目录迁移、损坏密钥/SQLite/WAL 恢复、真实手机扫码与证书指纹信任、断网重连和长期同步、真实 WebDAV、照片/证书/活动附件恢复、签名/公证。随后正式工作流完成 Windows x64/ARM64、macOS Universal、Web 资产和 Release；未完成的外部条件现列为发布后限制。

## 2026-08-22 公共 AI 写入语义更新

候选代码新增 `CWB.ai.awaitMutation()`、返回对象 `ready` 和 `persistence_state`，并提供建议、敏感授权和通知确认的异步公共方法。页面入口已等待对象级持久化承诺，不再把全局最后一次保存 Promise 当作唯一完成证据。`pnpm test:cwb-ai` 已重新通过，覆盖慢/失败保存、整条建议回滚、批量审阅和异步采纳。

本节只更新候选证据，不改变正式版本边界。由于该修改发生在此前完整门禁之后，发布前仍必须重新执行完整 `pnpm test`、lint、构建、公开面、密钥扫描、Release 契约和 `git diff --check`，并完成 Windows/macOS、真实手机、WebDAV、长时间同步和附件恢复验收。

在物理 IndexedDB 版本修复后重新执行并通过：

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

本次 `pnpm test` 已包含 v5→v6 旧库升级、AI 本地预览相关浏览器存储和 v8 交换/恢复回归；`build:release` 生成候选 `output/辅导员工作台.html`，密钥扫描检查 317 个仓库文件。10,000 条性能样本功能通过，但本机最大事件循环间隔约 756.7ms，发布前仍需低配设备和真实附件数据复核。

发布前自动化门禁通过不等于当时已经完成正式资产发布。Windows/macOS 实机安装与回滚、真实手机 HTTPS/二维码信任、长时间同步、WebDAV 服务商互操作、照片/证书/活动附件跨端恢复、签名/公证随后按正式 Release 证据和发布后限制分别记录。

## 2026-08-22 发布前最终门禁与判定（历史）

发布前工作区候选在修复 5,000 条替换重复深拷贝后，重新执行最后一次全量回归和发布门禁，全部退出码为 `0`：

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

本次门禁覆盖全模块业务、AI 保存回滚、Electron/SQLite、IndexedDB v5→v6 兼容、v8/v11 迁移、附件、备份、手机交换包、局域网实现和 10,000 条导入性能。`build:release` 当时只生成工作区预览 `output/辅导员工作台.html`。

真实浏览器已通过 `1440x920`、`1280x800`、`1024x768`、`390x844`、`360x800`；当时 Windows x64 修复后构建、桌面打包持久化和 NSIS 安装器烟测通过。ARM64 和 macOS 的后续正式资产由发布工作流完成，证据见本文顶部正式发布章节。

因此该段只代表当时的发布前判断；之后已创建 `v4.8.0` Tag、私有 Release 并上传正式资产。真实手机局域网、WebDAV、长时间同步、照片/证书/活动附件恢复、签名/公证仍按顶部已知限制维护。
