# v4.8.0 客户反馈全流程执行方案

> 状态：规划基线已完成并随 `v4.8.0` 正式 Release 交付；本文保留发布前方案和批次边界，当前资产证据见[发布收尾记录](./release-v4.8.0.md)。
>
> 当前正式基线：`v4.8.0`。`v4.7.1` 及更早版本、Tag 和 Release 保留；`codex/ai-upgrade` 只用于后续维护，不替代正式发布物。

## 1. 本轮目标

本轮针对客户反馈集中处理四类问题：数据可靠性、学生台账、学工特色业务、跨设备使用体验。目标不是增加孤立页面，而是让“录入、保存、同步、跟进、导出、恢复”形成可追溯闭环。

当前真实缺口已经核对如下：

- 当前没有局域网数据中枢，浏览器、Electron 和手机工作包之间仍以本地存储或手动交换为主。
- `desktop:repository-put` 解密失败会直接冒泡为通用 IPC 错误，缺少可诊断错误码和恢复向导。
- 根目录正式构建配置仍使用 `oneClick: true`，安装器没有提供用户选择安装目录的界面。
- 学生导入当前实际按“学号 + 培养层次”匹配，尚未实现 `student_id` 优先。
- 自动备份主要依赖保存时检查和启动时补做；浏览器关闭期间不能后台写入文件。
- 当前没有部门数据共享中台和政策资料版本推送体系。

## 2. 已锁定的产品决策

| 主题 | 本轮决定 |
| --- | --- |
| 局域网主机 | Windows、macOS 同期支持，首期只允许同一局域网；由 Electron 主进程启动主机服务。 |
| 设备配对 | 主机确认的一次性配对码或二维码；设备可以暂停、恢复和撤销。 |
| 同步冲突 | 不同字段自动合并；同字段冲突进入人工冲突收件箱。 |
| 云端能力 | 只做端到端加密备份，不做云端实时业务同步。首期提供用户自有 WebDAV/HTTPS 存储适配边界。 |
| 协作范围 | 首期只做本地政策、资料和通知推送，不共享学生明细。 |
| 主密钥 | Windows/macOS 系统安全存储负责日常解锁，独立恢复口令负责换机恢复。 |
| 学生导入 | `student_id` 优先、当前学号和历史学号其次；姓名不自动匹配。 |
| 心理语音 | 允许使用已配置 AI，但每次重新授权，默认不保存原音频。 |
| 一生一表 | 内置版本化基线模板加学校自定义模板。 |
| 版本 | 目标为 `v4.8.0`，保留 `v4.7.1` 历史 Tag、Release 和旧数据格式。 |

## 3. 版本、协议和迁移边界

- 工作区协议继续保持 `schema_version: 8`。
- 业务数据版本从 `data_schema_version: 10` 增量到 `11`。
- 新增 `sync_protocol_version: 1`，与业务数据版本分开管理。
- `v10 -> v11` 只增不删，迁移前自动创建恢复点。
- 所有新集合必须通过 `src/core/cwb-collections.js` 统一进入浏览器 IndexedDB、离线 HTML、Electron SQLite、局域网主机、备份恢复和换机包。
- 旧导入格式、旧字段、旧 Tag、旧 Release 和稳定 `student_id` 关联必须继续可读。
- 无法确定的历史学生关联进入人工核对队列，不按姓名静默猜测。

## 4. P0：桌面端、密钥和备份

### 4.1 Electron 仓储修复

修改 `desktop/main.cjs`、`desktop/sqlite-store.cjs` 和 `desktop/preload.cjs`：

- 增加 `SAFE_STORAGE_UNAVAILABLE`、`VAULT_KEY_MISSING`、`VAULT_KEY_DECRYPT_FAILED`、`VAULT_KEY_FORMAT_INVALID`、`REPOSITORY_DECRYPT_FAILED`、`REPOSITORY_CORRUPTED` 错误码。
- 密钥损坏时禁止生成新密钥覆盖旧数据库。
- 分别检查系统安全存储、密钥文件、SQLite/WAL、附件索引和附件解密。
- 密钥采用版本化 envelope 和原子写入。
- 使用 Argon2id 派生独立恢复口令，恢复口令只显示一次并明确“遗失不可恢复”。
- 增加仓储健康检查和数据修复向导：诊断、选择恢复点、验证、恢复、失败回滚。

### 4.2 安装路径和数据目录

- 根目录 `electron-builder.yml` 作为唯一正式构建配置。
- Windows NSIS 改为非一键安装并启用自定义安装目录。
- 程序安装目录和工作区数据目录完全分离。
- 数据目录迁移前先生成加密备份，迁移后校验数据库、附件数量、内容哈希和重新打开结果。
- 迁移失败保留原目录，不删除或覆盖用户原始数据。

### 4.3 自动备份 API

```js
CWB.backup.schedule()
CWB.backup.status()
CWB.backup.runNow()
CWB.backup.previewRestore()
CWB.backup.commitRestore()
CWB.backup.exportRecoveryKit()
```

- Electron/局域网主机按每日或变更阈值自动备份，主机运行期间使用定时器。
- 浏览器端保留 IndexedDB 加密快照；支持 File System Access API 时再写入用户选择的目录。
- 浏览器关闭期间无法后台写文件，界面必须明确显示这个平台限制。
- 首页显示上次备份、备份后变更数、失败原因和下一次备份时间。
- 恢复先完整性校验和差异预览，再保存当前工作区回退快照。
- 恢复失败自动回滚，不把半恢复状态显示为成功。
- 云端适配器只上传加密包，不上传密钥、明文学生数据或明文附件。

## 5. P1：局域网数据中枢

### 5.1 架构

```text
Electron 主机：SQLite + 加密附件仓 + 同步服务
        ↑ HTTPS、证书指纹、一次性配对令牌
手机网页、浏览器网页、其他桌面端
```

- 客户端不得直接共享或打开同一个 SQLite 文件。
- 主机负责事务、版本、附件、审计和冲突收件箱。
- 主机只监听局域网，不默认开放公网。
- 客户端使用加密离线队列；主机恢复后自动提交。
- 远程客户端不能因为配对成功而获得未授权的管理员操作。

### 5.2 同步集合和接口

新增内部集合：

```text
v4_sync_devices
v4_sync_outbox
v4_sync_conflicts
v4_sync_revisions
v4_backup_runs
```

同步操作必须包含 `workspace_id`、`device_id`、`operation_id`、`idempotency_key`、`collection`、`record_id`、`base_revision`、`patch`、`updated_at` 和 `schema_version`。

```js
CWB.sync.host.start()
CWB.sync.host.stop()
CWB.sync.host.status()
CWB.sync.host.createPairingCode()
CWB.sync.host.revokeDevice()
CWB.sync.client.connect()
CWB.sync.client.pull()
CWB.sync.client.flushQueue()
CWB.sync.client.listConflicts()
CWB.sync.client.resolveConflict()
```

服务端接口：

```text
GET  /api/v1/health
POST /api/v1/pairing/request
POST /api/v1/pairing/confirm
GET  /api/v1/workspace/manifest
POST /api/v1/sync/pull
POST /api/v1/sync/push
POST /api/v1/attachments/init
PUT  /api/v1/attachments/chunk
POST /api/v1/attachments/complete
```

### 5.3 冲突和附件

- 不同字段修改自动合并。
- 同字段修改保留双方值、来源设备、时间和版本，由老师选择或手动编辑。
- `idempotency_key` 防止网络重试生成重复记录。
- 附件采用分块上传、内容哈希、断点续传和失败清理。
- 业务记录只保存附件 ID，不把二进制放入同步记录。
- 配对、同步、冲突解决、设备撤销和附件操作全部写入本地审计。

## 6. P1：学生台账和导入

### 6.1 身份匹配

身份优先级固定为：导入的有效 `student_id`、当前学号、历史学号、人工确认。姓名不参与自动合并。

学号更正时保留稳定 `student_id`，把旧学号追加到 `student_number_history`，并保持谈话、成绩、奖惩、资助、住宿、就业和工作记录关联。无法唯一确认的记录进入人工核对清单。

### 6.2 增量导入

- 默认合并更新，不因源文件缺少学生而删除旧记录。
- 只更新文件中出现的字段。
- 空白默认保留原值；清空字段必须显式勾选。
- 预览逐行、逐字段差异，单独显示重复学号、同文件冲突和学号变更。
- 覆盖导入先创建恢复点并显示预计删除数量。
- 导入失败同时恢复业务数据和撤销记录。

### 6.3 字段和批量操作

新增 `v4_student_field_catalog`，保存字段名、标签、类型、可选值、敏感级别、导入导出权限和更新时间。

学生台账增加多选批量编辑、批量归档、批量住宿维护、批量班级/导师/班主任/家长维护、差异预览、回退快照和撤销入口。

补齐并统一显示学生照片、紧急联系人、退伍士兵身份、家长联系方式、家庭地址、居住类型、房东信息、导师、班主任、奖助勤分类、伙食补助和困难认定材料。

### 6.4 派生统计

```js
CWB.analysis.studentGradeTrend(studentId, options)
CWB.analysis.leaveClassHours(studentId, options)
CWB.analysis.classDataQuality(options)
```

成绩趋势、请假覆盖课时和数据质量均为派生结果。已批准请假、未记录考勤、旷课和迟到分开统计，缺失数据显示“未记录”，不直接当成零或旷课。

## 7. P1：特色业务和 AI

### 7.1 心理工作

增加兴趣、人工重点关注、谈话主题、后续工作建议、访问范围和审计字段。语音流程每次重新授权，明确显示外发范围，AI 仅生成转写/整理草稿，返回后再次脱敏，老师确认后才保存，默认不保存原音频。

新增 AI 用途：`voice_transcription`、`psych_note_draft`、`cohort_summary`。群体画像只提供达到最小人数阈值的脱敏聚合，不做诊断、不生成危机结论、不写回学生事实。

### 7.2 一生一表

新增 `v4_form_templates` 和 `v4_form_jobs`，支持版本化基线 Word 模板、学校自定义模板、字段占位符、批量导出、打印工作包和受支持模板的 Word 反向汇总。

反向汇总先显示字段映射和冲突，不静默覆盖。任意未使用受支持占位符或内容控件的 Word 文件不承诺自动识别。

### 7.3 动态分班、活动和工作节点

新增 `v4_student_class_history` 保存班级变更、日期、原因、来源和操作人，支持查询当前/历史班级、宿舍变化和空课时段。

工作节点分类改为可配置字典，默认增加社区管理、劳动卫生等类别。活动支持批量图片上传，附件全部成功后才提交业务记录，失败时清理未引用附件。

学校智慧学工、教务、就业、住宿和材料入口继续复用 `v4_tool_links`，网址必须经过安全校验。

### 7.4 AI 页面级入口

AI 入口嵌入学生档案、导入预览、请假考勤、心理记录、一生一表、工作留痕、班级分析、同步冲突和政策资料页面。

AI 只能生成建议、草稿、解释或映射，不能自动修改学生事实、心理、纪律、资助、预警、奖惩、住宿分配或审批状态。内部 ID、API key、完整请求、完整响应和音频不进入普通备份。

## 8. P1：内容推送和体验

新增 `v4_content_pushes`、`v4_content_reads` 和 `v4_work_categories`。

本机管理员可以发布政策、学习资料、模板和通知，配置适用范围、发布时间、版本、撤回和已读状态，并支持导入导出。本轮不开放跨部门学生明细共享。

首页增加数据源、同步状态、离线队列、冲突数和最近备份状态。待办按逾期、今日、近期和待确认折叠，首屏只显示 4-6 个统计数字和最紧急 5 条事项。保存、导入、同步和恢复必须显示真实持久化状态，失败时保留表单和重试入口。

## 9. 测试和发布门禁

P0 定向测试：

```text
pnpm test:desktop
pnpm test:backup-state
pnpm test:release
```

覆盖错误密钥、损坏密钥、中断写入、SQLite/WAL 损坏、恢复口令、数据目录迁移、自定义安装路径和备份回滚。P0 完成后进行一次架构与安全综合审查。

P1 新增定向测试：

```text
pnpm test:lan-sync
pnpm test:sync-conflicts
pnpm test:sync-attachments
pnpm test:student-identity
pnpm test:student-bulk
pnpm test:student-forms
pnpm test:derived-analysis
pnpm test:ai-sensitive-voice
pnpm test:form-mapping
pnpm test:content-push
```

覆盖配对过期、重放攻击、设备撤销、离线队列、字段合并、附件续传、5000 名学生和 10000 条记录、学号更正、同名不合并、部分字段更新、Word 往返、语音授权、AI 二次脱敏和内容撤回。

最终只在代码和文档稳定后运行：

```text
pnpm test
pnpm lint
pnpm build:release
pnpm check:public
pnpm check:secrets
pnpm test:release
git diff --check
```

视口验收使用 `1440x920`、`1280x800`、`1024x768`、`390x844` 和 `360x800`，并覆盖 Windows、macOS、浏览器 IndexedDB、离线 HTML、Electron、局域网客户端、备份恢复和带照片/证书/活动附件的数据集。

全部通过后才能创建 `v4.8.0` Tag、私有 GitHub Release、Windows/macOS 构建和受控分发包。Pages 不作为私有仓库可访问性的替代证明。

## 10. 执行和记录规则

- 相关工作按 3-4 个子任务组成批次，普通 UI 只做局部验证。
- 涉及安全、持久化、公共接口、迁移和同步时进行批次级综合审查，不为每个小改动重复审查。
- 同一代码状态已经通过的命令不机械重复；哈希只在最终产物生成时执行。
- 最终汇报必须列出已完成内容、实际测试、主动跳过的重复验证、审查原因、发布证据和剩余风险。

## 11. 当前明确未完成项

本节是方案初始写入时的风险快照，不能当作当前状态清单，也不能写成 v4.7.1 已完成。当前实现状态以本文件后面的“执行回填”及[客户反馈逐项审计](./customer-feedback-audit-2026-08-21.md)为准。

## 12. 2026-08-21 执行回填

本方案中的“计划”章节保留最初需求和设计语义；截至本次回填，以下内容已进入当前 `codex/ai-upgrade` 工作区候选，并通过对应的源码语法、服务或页面定向验证：

- 已落地：v11 迁移清单、Electron 仓储诊断/恢复入口、局域网主机核心、客户端连接/拉取/推送/离线队列/冲突收件箱、`student_id` 优先导入和桌面备份到期检查。
- 已落地：心理录音页面、逐次敏感授权、OpenAI-compatible/relay 转写、二次脱敏草稿、人工确认和群体主题最小人数聚合；原音频不入库。
- 已落地：受支持 DOCX 模板校验、Word 生成预览/批量输出、内容控件反向汇总预览和 CSV 导出；不承诺任意 Word 自动识别或直接回写事实。
- 已落地：联合走访日期/班级筛选、历史班级/住宿/空课时派生查询、工作分类中心、系统分类保护、内容推送范围和内容包导入/导出冲突回滚。

当前仍不能标记为正式上线：手机真实 HTTPS 信任和自动发现、附件客户端真实断网重连验收、真实 WebDAV 服务商互操作、Windows/macOS 实机迁移/恢复回滚、多设备长期压力、真实设备逐集合恢复，以及大名单批量维护的实机验收。附件分块上传 UI、主机正式/临时附件加密落盘、备份运行记录、远程备份配置页面和远程加密包适配器核心、学生批量编辑/归档/删除/撤销 UI 已进入候选并通过定向测试，但不能替代最终设备、互操作和发布门禁。脱敏跨端恢复契约已通过，不等于真实设备恢复完成。正式版本仍是 `v4.7.1`；候选验证不能替代最终发布门禁。

## 2026-08-21 执行回填：配对与同步按钮闭环

针对“功能已经写了但用户是否真的能完成操作”的复核，本批补齐并验证了以下计划项：

- 主机确认配对后，客户端可通过 `/api/v1/pairing/result`以请求 ID和设备 ID一次性领取令牌；令牌交付不写入持久化状态，重复领取不会再次返回。
- 主机设备管理增加暂停/恢复，暂停状态在同步和附件路由统一生效；撤销仍会让设备必须重新配对。
- 客户端增加 `pollPairing()`、`syncNow()`、`startAutoSync()`和`stopAutoSync()`；连接成功后 UI 开启 60 秒自动检查，网络失败保留离线队列和错误码。
- `ui_state`持久化主动删除 `syncToken`、同步客户端对象和令牌草稿，只保留队列、游标、冲突摘要、地址和请求 ID等恢复所需的非秘密状态。
- 健康接口、设备列表和认证公开结果使用设备元数据投影，不再暴露 `token_hash`。

本批定向证据：`tests/v48-sync-resilience.js`、`tests/lan-sync.js`、`tests/v48-services.js`、`tests/v48-p0-hardening.js`、`tests/v48-lan-ui.js`、`tests/v48-management-ui.js`、`tests/electron-surface.js`、`tests/desktop-contract.js`、`tests/security-boundary.js`、构建后 `output/v4-preview.html`、`scripts/check-inline-js.js`和相关语法检查均已通过。二维码/自动发现、真实移动端证书信任、主机重启配对、长期断网重连和最终完整门禁仍为发布阻断项。
