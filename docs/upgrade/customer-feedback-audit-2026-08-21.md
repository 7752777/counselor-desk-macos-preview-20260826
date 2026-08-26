# v4.8.0 客户反馈逐项审计

> 状态：v4.8.0 已正式发布。本文件保留发布前逐项审计过程；正式 Tag、Release、资产和限制以[v4.8.0 发布收尾记录](./release-v4.8.0.md)为准。
>
> 本记录把客户反馈拆成可验证的交付项，区分“已交付”“仅核心服务/契约”“发布后仍需实机或服务商抽查”。不得因为局部代码存在，就扩大为未验证的设备或服务商承诺。

## 版本边界

| 项目 | 当前事实 |
| --- | --- |
| 正式版本 | `v4.8.0`，历史 Tag/Release 不覆盖 |
| 当前分支 | `codex/ai-upgrade` |
| 发布范围 | v4.8.0 数据版本、Electron 安全修复、局域网主机核心、学生身份导入和自动备份定时检查 |
| 工作区协议 | `schema_version: 8` |
| 候选业务版本 | `data_schema_version: 11` |
| 同步协议 | `sync_protocol_version: 1` |
| GitHub | `7752777/counselor-desk` 已设为私有；协作者权限以 GitHub Settings 实际显示为准 |

## 反馈对账

| 反馈 | 当前工作区状态 | 风险 | 验收证据/剩余工作 |
| --- | --- | --- | --- |
| 多设备数据割裂 | 已完成局域网主机核心、客户端连接/拉取/推送/离线队列/冲突收件箱页面、附件分块上传/下载和 Electron 主仓真实记录适配 | 高 | `src/core/cwb-v48.js`、`src/core/cwb-v48-ui.js`、`desktop/lan-sync.cjs`、`tests/lan-sync.js`、`tests/v48-services.js`、`tests/v48-management-ui.js`、`tests/v48-lan-ui.js` 已通过；手机真实 HTTPS 信任、二维码/自动发现和多设备长时间压力测试仍待最终验收 |
| Electron `repository-put` 解密报错 | 已完成错误码、版本化密钥 envelope、仓储健康检查、恢复包核心和数据修复/恢复页面入口 | 高 | `desktop/vault.cjs`、`desktop/recovery-kit.cjs`、`desktop/sqlite-store.cjs`、`src/core/cwb-v48-ui.js`、`tests/desktop-contract.js` 已通过；Windows/macOS 损坏数据库回滚实测仍待最终验收 |
| 安装路径固定 C 盘 | 根配置已改为可选择安装目录，数据目录与安装目录分离 | 高 | `electron-builder.yml` 和 `tests/electron-package-config.js`；Windows 实机安装迁移仍属于最终发布验收 |
| 备份只在下次启动补做 | 桌面渲染进程现在每分钟检查一次，到期或达到变更阈值才真正写入；启动时仍立即补做一次 | 高 | `index.html` 的 `desktopBackupScheduler`、`tests/backup-desktop-scheduler.js` 已通过；Electron 关闭期间无法执行，界面已明确说明 |
| 学生导入不能稳定更新 | 已完成 `student_id`、当前学号、历史学号的优先匹配，姓名不自动匹配；默认合并，覆盖需确认和恢复点；学生台账已接入多选批量编辑、归档、删除和一次撤销 | 高 | `src/core/cwb-v48.js`、`index.html`、`tests/v48-core.js`、`tests/v48-student-import-ui.js`、`tests/v48-management-ui.js` 已通过；真实大名单和跨端人工验收仍待最终发布批次 |
| 学生字段不够、照片/家长/紧急联系人难维护 | 既有档案字段、照片附件仓、家长联系集合、字段目录和批量维护界面已进入候选；批量编辑覆盖导师、班主任、家长、居住、紧急联系人、学业和关注字段 | 中 | `src/core/cwb-v48-ui.js`、`index.html` 和 `tests/v48-core.js`/`tests/v48-management-ui.js` 已通过；全部既有表单的真实浏览器逐字段回读和桌面实机验收仍待完成 |
| 心理工作和语音整理 | 已完成真实录音页面、逐次授权、OpenAI-compatible/relay 转写、二次脱敏草稿、人工确认写入和群体最小人数聚合 | 高 | `index.html`、`src/core/cwb-v48.js`、`src/core/cwb-ai.js`、`scripts/ai-relay.js` 与 `tests/ai-voice-*` 已覆盖；真实设备麦克风权限、长音频压力和真实 provider 质量仍需发布前验收 |
| 一生一表与 Word 反向汇总 | 已完成受支持 DOCX 模板上传校验、批量生成预览、单人/批量 Word 工作包和内容控件反向汇总预览/CSV 导出 | 高 | `v4_form_templates`、`v4_form_jobs` 已进入候选 manifest；不承诺任意 Word 自动识别，也不自动把反向汇总写回学生事实 |
| 动态分班、宿舍/空课时联查 | 已完成 `v4_student_class_history` 页面和“班级/宿舍/空课时联合走访”弹窗，按日期计算历史班级、有效住宿和课表空课时 | 中 | 当前是派生查询和 CSV 导出；宿舍联查在真实跨端恢复、空课表边界和大名单压力下仍待验收 |
| 活动图片、工作分类 | 活动附件仓、容量检查、哈希去重和回滚能力已有；工作分类中心已支持系统分类保护和学校自定义分类 | 中 | 工作节点新建/筛选/导出与批量活动图片在真实浏览器和跨端附件恢复中仍需验收 |
| 部门政策/资料推送 | 已完成本地工作区发布、学院/年级/班级范围、角色可见性、已读、撤回、内容包导入/导出和冲突保留页面 | 中 | `v4_content_pushes`、`v4_content_reads` 与管理 UI 已接入；角色是本地策略标签，不替代账号认证；普通角色按当前工作区上下文导出，跨端压力和真实协作设备验收仍待完成 |
| 云端备份 | 已完成只传输加密 `.cwbk` 的 HTTPS/WebDAV 适配器和候选备份页面配置向导；支持测试连接、上传、下载预览恢复和删除 | 高 | `CWBV48.createRemoteBackupAdapter()`、`index.html`、`tests/v48-storage-hardening.js`、`tests/v48-management-ui.js` 已通过 HTTPS、凭据 URL、重定向、大小、超时、加密标记、不上传密钥和配置不保存凭据边界；真实 WebDAV 服务商互操作和真实备份恢复仍待验收 |
| 默认安装和数据目录迁移 | 核心 IPC、迁移前副本、迁移后健康检查、失败保留原目录和恢复/诊断页面已完成 | 高 | Windows/macOS 跨盘实机安装、损坏数据库回滚和恢复后附件计数验收仍属于最终发布验收 |

## 已落地到候选的细节

### 桌面仓储和恢复

- 主密钥采用版本化 envelope 和原子写入；密钥读取失败时不会生成新密钥覆盖旧数据库。
- 仓储错误被归一为可诊断错误码，例如 `VAULT_KEY_DECRYPT_FAILED`、`REPOSITORY_DECRYPT_FAILED` 和 `REPOSITORY_CORRUPTED`。
- SQLite 完整性、加密 payload、附件索引和附件解密分别检查。
- 恢复包使用 `Argon2id + AES-256-GCM` 加密工作区主密钥；遗失恢复口令不提供后门。

### 局域网主机

- 客户端不能直接打开同一个 SQLite 文件，只能通过主机 API 访问。
- 配对请求需要一次性配对码，并由主机明确确认；设备可以撤销。
- 同字段冲突保留本地值、对端值、设备和版本，进入人工冲突模型；不使用最后写入覆盖。
- 附件采用分块、偏移、大小和 SHA-256 校验；主机正式附件和断点上传临时分块均以 AES-256-GCM 加密落盘；非连续分块恢复第一个连续缺口，主机重启保留有效上传元数据，旧候选明文附件兼容读取时先重加密；业务记录只保存附件 ID。

### 学生身份和备份

- `student_id` 是稳定业务关联主键；学号只作为当前快照或历史兼容值。
- 空白导入字段默认保留原值；显式清空和覆盖导入必须单独确认。
- 学生台账已经提供当前页/筛选结果选择、批量编辑、批量归档、批量删除、差异确认和一次撤销；批量字段覆盖导师、班主任、家长、居住、紧急联系人、学业和关注信息。
- 桌面运行时每分钟检查一次备份计划，日期或变更量未到阈值时不产生文件写入。
- 浏览器关闭期间不能运行后台写文件，网页和手机端只显示本地快照/手动加密备份边界。

## 已通过的定向验证

以下命令在当前候选相关代码状态下已实际通过：

```text
node tests/desktop-contract.js
node tests/electron-surface.js
node tests/electron-sqlite.js
node tests/desktop-electron-smoke.js
node tests/desktop-student-card-mode.js
node tests/lan-sync.js
pnpm test:desktop
node tests/v48-core.js
node tests/v48-services.js
node tests/v48-student-import-ui.js
node tests/v48-lan-ui.js
node tests/v48-management-ui.js
node tests/v48-storage-hardening.js
node tests/v48-cross-platform-recovery.js
pnpm test:backup-scheduler
node tests/cwb-ai-governance.js
node tests/ai-governance-boundaries.js
node tests/ai-contract.js
pnpm lint
```

`pnpm test:backup-scheduler` 会重新生成 `output/v4-preview.html` 后验证桌面桥接模拟、60 秒检查周期、人工 tick、忙碌状态和停止行为。它证明的是渲染进程定时检查契约，不等同于 Windows/macOS 安装包验收。

### 2026-08-21 本批新增落地

- `src/core/cwb-v48-ui.js` 已接入单文件构建，提供局域网同步、加密附件上传入口、学生字段中心、动态分班、政策推送、一生一表模板中心和数据修复入口。
- 主机接受同步操作时通过 `CWBCollections.desktopName()` 写入真实 Electron SQLite 记录；冲突解决会生成新的主机修订，其他设备可通过游标拉取。
- 客户端令牌默认只保存在当前会话；持久化适配器只保存地址、游标、离线队列和冲突摘要，不保存令牌，除非调用方明确提供受保护存储。
- 远程备份页面已提供 HTTPS/WebDAV 配置、测试连接、上传当前加密备份、下载并预览恢复和删除远程备份；Bearer/Basic 凭据只存在当前页面会话，配置持久化时会主动丢弃凭据。
- 学生台账批量维护 UI 已进入单文件候选，保存成功才刷新列表；保存失败保留选择和表单，批量删除/归档有确认与一次撤销。
- AI 新增 `voice_transcription`、`psych_note_draft`、`cohort_summary` 用途；语音请求必须带逐次 `consent_id`，音频不落库；群体聚合按最小人数阈值输出且不包含学生 ID。
- 同步主机通过可注入回调记录配对、设备、同步操作、冲突和附件完成事件；UI 对字段目录、分班历史、内容推送和冲突处理记录本地审计。审计只保存最小元数据，不保存补丁值、令牌、完整请求或附件明文。
- 冲突收件箱现在提供保留本机、采用主机和手动编辑三种处理入口；连接失败会保留当前表单输入，保存失败会恢复 v4.8 管理页面的候选内存快照。
- 心理页面已提供“开始录音 → 单次授权 → 转写整理 → 人工编辑确认”的完整候选路径；取消、失败和关闭都会释放音频，不把原音频写入附件仓。群体主题页面只显示达到阈值的聚合数量。
- 一生一表页面已提供 DOCX 模板字段校验、生成前缺失字段预览、单人/批量 Word 输出和受支持内容控件的结构化 CSV 反向汇总；任意 Word 文本和自动回写仍明确不支持。
- 动态分班页面已提供日期/班级筛选的联合走访弹窗；没有课表显示“未记录”，不会把缺失当成全天空闲；工作分类页面保护系统职责分类，只允许维护学校自定义分类。
- 政策推送页面已提供范围字段、内容包导入/导出和导入失败回滚；冲突不会静默覆盖较新的本地内容。
- 内容推送当前已补齐 `workspace_admin`、`content_editor`、`teacher`、`viewer` 四类本地策略角色；发布、导入、导出、已读、撤回和角色变更均保留最小审计。页面列表、已读和导出都传入当前工作区的学院/年级/班级上下文，普通角色不会因为空上下文而看到其他范围内容；管理员仍可按管理员权限导出完整内容包。
- 工作留痕和工作留痕草稿导出已保留 `source_collection`、`source_id`、`source_label`、`source_state`、`source_updated_at`，并在导出包顶层生成 `provenance` 来源映射。来源记录删除或变化时仍按来源草稿规则提示重新核对，不把导出来源当作事实认证。
- 页面和服务新增验证：`node --check src/core/cwb-v48-ui.js`、`node --check desktop/lan-sync.cjs`、`node tests/v48-management-ui.js`、`node tests/v48-services.js`、`node tests/v48-content-export.js`、`node tests/v48-worklog-export-runtime.js`、`node tests/v48-storage-hardening.js`、`node tests/v48-backup-records.js`、`node tests/v48-cross-platform-recovery.js`、`node tests/v48-lan-ui.js`、`node tests/lan-sync.js`、`node tests/ai-voice-contract.js`、`node tests/ai-voice-relay.js`、`node scripts/check-inline-js.js`。新增 `pnpm test:v48` 在本批代码状态下的结果以最终命令输出为准；其中内容权限测试覆盖跨学院、跨角色已读/导出边界，运行时导出测试加载单文件并检查真实来源回链。

## 发布前必须完成

1. 完成局域网手机真实 HTTPS 信任、二维码/自动发现和多设备长时间压力测试；附件客户端分块上传 UI 已进入候选并通过页面契约测试，仍需真实手机断网重连验收。
2. 在真实 Windows/macOS 环境验证数据目录迁移、恢复包、损坏数据库和失败回滚。
3. 在真实 Windows/macOS/手机环境完成心理录音权限、长音频失败回滚、受支持 DOCX 版式和 Word 反向汇总抽查。
4. 完成宿舍联查大名单压力、工作节点全链路导出和普通角色在真实设备上的范围验收；学生批量编辑/归档 UI 已完成候选实现，仍需真实浏览器和大名单验收。
5. 已完成新增集合的脱敏契约级备份/恢复/手机交换包回归；仍需在真实 Electron、手机和跨设备环境逐集合抽查，确认敏感字段最小化。
6. 真实 WebDAV/HTTPS 服务商互操作和加密包恢复抽查仍待完成；在代码稳定后只执行一次最终全量测试、构建、公开面检查、密钥扫描、Release 契约和真实设备验收。
7. 全部门禁通过后才创建 `v4.8.0` Tag、私有 Release、Windows/macOS 构建和受控分发包。

## 已知限制

- 局域网服务当前是桌面主机核心；客户端附件上传页面和核心分块传输已存在，但不等于手机端已经自动发现、完成证书信任或通过长期压力验收。
- HTTPS 和配对令牌保护传输与授权，但局域网不是绝对安全边界；主机电脑仍需系统账户和磁盘安全。
- 自动备份依赖桌面程序保持运行；程序关闭期间无法后台执行，启动后会立即补做检查。备份运行记录只保存最小元数据，最多保留 50 条。
- 浏览器 IndexedDB 仍受浏览器配置、清理策略和设备空间影响，重要数据应保留加密备份。
- 远程备份配置页面和适配器已完成候选定向验证，但真实 WebDAV 服务商的认证、路径语义、恢复和限流行为尚未互操作验收。
- `v48-cross-platform-recovery` 是脱敏夹具的契约测试，不代表真实 Windows/macOS/手机设备安装、HTTPS 信任或长期断网重连已经通过。
- 本审计不证明 v4.8.0 已公开上线，也不替代最终发布证据。

## 2026-08-21 高风险边界收口

本次维护针对审计中最容易造成数据误操作的边界补了一轮可执行实现：

- 桌面数据目录选择在调用 `path.resolve()` 之前拒绝 `null`、空字符串、空白字符串和非字符串参数，不会把空值解析为当前进程目录；根目录、当前工作区、工作区内部和工作区上级目录仍拒绝。目标路径是已有文件时返回明确的 `DATA_TARGET_NOT_DIRECTORY`。
- 数据目录激活提取为 `desktop/data-directory.cjs` 事务辅助模块。候选目录必须先通过 SQLite 加密 payload 健康检查，激活失败会关闭候选仓、恢复原目录并重新打开原仓；原仓也无法打开时返回 `DATA_MIGRATION_ROLLBACK_FAILED`，保持无活动仓状态，避免继续写入未知数据。
- 远程备份端点现在只接受基址同源的相对路径，拒绝绝对 URL、前导斜杠、反斜杠、查询/片段、协议前缀、`.`/`..` 及 URL 编码后的目录穿越。端点校验在网络请求前执行，错误不会被误报成网络故障；基址查询参数也拒绝，凭据和令牌仍不进入设置或备份。
- 早期候选的局域网桌面页增加主机地址、一次性配对 ID、配对码和证书指纹的逐项复制入口，并明确提示当时未启用二维码或自动发现，客户端需要手动输入并由主机人工确认。复制的是连接信息，不包含主机管理令牌；当前二维码状态以本文最新收口段为准。

本批新增或受影响的定向证据：

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

这些测试覆盖路径判定、迁移激活失败/回滚失败、密钥与仓储契约、远程端点安全和桌面配对弹窗；它们不能替代 Windows/macOS 实机迁移、真实手机证书信任、真实 WebDAV 互操作或长期同步压力验收。v4.8.0 正式 Tag、Release、安装包和离线 Web 资产已完成；上述真实设备/服务商项目列为发布后抽查。

## 2026-08-21 内容权限与工作留痕导出收口

本批修复了内容推送页面与核心服务之间的上下文丢失问题：页面列表调用 `listAll(actor, context)`，导出调用 `exportPackage(context, { actor })`，已读调用 `markRead(pushId, readerId, actor, context)`。普通角色在学院、年级或班级范围内只能看到和导出当前上下文匹配的已发布内容；跨范围标记已读会被核心服务拒绝。未传上下文的旧核心调用仍保留兼容语义，但页面不再使用空上下文。

导出工作留痕时，构建后的单文件运行时会重新从本地集合解析来源记录，写入来源标签和来源状态，并在包顶层写入 `provenance`。这条链路只提供可回查关系，不替代人工核对、访问锁或导出前敏感字段确认；来源已删除或已变化时仍应回到业务记录处理。

本节验证了服务级权限、页面入口和真实构建产物运行时三层边界。它仍是 v4.8.0 候选证据，不代表真实账号认证、真实多设备协作或正式 Release 已完成。

## 2026-08-21 提交前收尾证据

本批修改实际通过 `pnpm test:v48`、`pnpm lint`、`pnpm check:public`、`pnpm check:secrets` 和 `git diff --check`。新增定向测试已纳入 `package.json` 的 `test:v48`：内容推送跨学院/跨角色权限、同步规模、远程备份互操作和构建后工作留痕来源回链均有运行时断言。该证据只覆盖当前候选的代码与文档门禁；真实设备、真实账号认证、WebDAV 服务商、长期断网重连和大数据量附件恢复仍保持“待验收”，不能据此宣布 v4.8.0 正式上线。

## 2026-08-21 P0 持久化事务与传输边界加固

本轮针对“同步状态写入失败后是否会留下半提交数据”进行了代码级收口：

- `createSyncHost()` 的配对码创建、错误配对次数、设备确认/撤销、同步 push 和冲突解决现在经过统一事务快照；状态文件持久化失败时恢复内存快照。
- 绑定 Electron SQLite 的同步仓储同时保存业务记录回退信息。已有记录恢复原值，新记录在提交失败时调用仓储 `delete` 清理，避免业务库先变更、同步状态未落盘。
- 配对码固定为 8 位数字，错误尝试达到 5 次后返回 `SYNC_PAIRING_RATE_LIMITED`；主机 HTTP 层映射为 429。
- 客户端在进入网络异常捕获前完成 HTTPS、凭据、查询参数和片段校验；配置错误不会再被误报为 `SYNC_NETWORK_UNAVAILABLE`。
- 主机自签名证书保留 `localhost` 和 `127.0.0.1` 的 SAN；首次连接仍必须人工核对证书指纹。
- Electron preload 将通用 IPC 异常转换为带稳定 `code` 的 `CWBDesktopError`，可区分 `REPOSITORY_DECRYPT_FAILED`、密钥损坏和附件错误。
- 事务内审计改为提交成功后发送；状态或业务回滚时不会留下“已确认/已接受/已解决/已撤销”的假成功审计。

新增 `tests/v48-p0-hardening.js` 覆盖持久化失败回滚、已有/新增业务记录回滚、冲突回滚、设备撤销回滚、配对码数字格式、五次限流、HTTPS/凭据/指纹校验、TLS SAN 和 IPC 错误码提取。该测试与 `node tests/lan-sync.js`、`node tests/v48-services.js` 已在本批代码状态通过。

本节仍属于 v4.8.0 未发布候选。真实 Windows/macOS 密钥损坏、SQLite/WAL 损坏、跨盘迁移和手机设备断网恢复必须在最终发布门禁中单独验收。

## 2026-08-21 配对、设备状态与客户端重试收口

本批对局域网同步做了反向使用流程核对，发现“主机确认配对后客户端没有可靠拿到令牌”是实际阻断问题，已补齐：

- `POST /api/v1/pairing/request` 返回的请求 ID会写入客户端同步状态；主机确认后，客户端使用请求 ID和自身设备 ID调用 `GET /api/v1/pairing/result` 获取一次性令牌。
- 原始设备令牌只在主机内存的短期交付表中保存，领取后立即删除；不会进入同步状态快照、备份、交换包或普通审计。主机在交付前重启或交付窗口过期时，用户必须重新配对。
- `v4_sync_devices` 的公开状态只返回设备名称、状态、时间和 ID，不返回 `token_hash`；健康接口和 `authenticate()` 的公开元数据同样不返回令牌校验值。
- 主机设备支持“暂停同步 / 恢复同步 / 撤销设备”。暂停设备不能拉取、推送或上传附件，恢复后继续使用原令牌，撤销后必须重新配对；三种状态变更均进入最小审计。
- 客户端增加“立即同步”和 60 秒自动检查。网络、权限或本地仓储失败会保存 `last_error`、把连接显示为需处理，并保留离线队列和游标；成功后才移除已完成队列。
- `ui_state` 持久化会主动剔除 `syncToken`、同步客户端对象和配对草稿令牌；队列、游标、冲突摘要和配对请求 ID可以保留，令牌永不落入界面设置备份。

本批实际通过：`node tests/v48-sync-resilience.js`、`node tests/lan-sync.js`、`node tests/v48-services.js`、`node tests/v48-p0-hardening.js`、`node tests/v48-lan-ui.js`、`node tests/v48-management-ui.js`、`node tests/electron-surface.js`、`node tests/desktop-contract.js`、`node tests/security-boundary.js`、`node scripts/build-release.js output/v4-preview.html`、`node scripts/check-inline-js.js`以及相关文件 `node --check`。这些是代码和构建产物契约证据，不替代手机真实证书信任、二维码/自动发现、主机重启前后的真实配对体验和长期断网测试。

在二维码批次之前，历史快照曾明确记录二维码和局域网自动发现尚未启用；配对请求采用人工复制地址/请求信息和轮询结果。当前二维码已交付，但自动发现、真实手机/浏览器的证书信任、自动重连、附件断点续传和长时间压力仍是发布后限制。历史段落中的“未创建 Tag/Release、正式用户为 v4.7.1”不再代表当前状态。

## 2026-08-21 照片保存效率与最新回归

本轮继续按“点击 -> 持久化 -> 失败恢复 -> 再次操作”检查学生档案照片路径：

- `v4UploadPhotoForStudent()` 在附件写入、学生引用保存和旧附件清理之间保持失败回滚；成功上传只在确有清理失败、需要写入 `photo_cleanup_pending_ids` 时进行第二次学生保存，避免无条件重复完整 v8 持久化。
- 学生档案编辑器在照片上传成功后不再追加一次重复 `save('students')`；照片保存失败会恢复原对象、移除新附件并保留错误供界面重试。
- `tests/photo-storage.js` 新增成功上传单次学生写入断言；本轮实际通过 `node tests/photo-storage.js`、`node tests/interaction-continuity.js`、`node tests/v48-sync-resilience.js`、`node tests/v48-student-import-ui.js`、`node tests/ai-cross-module-audit.js` 和 `node tests/ai-workflow-ui.js`。
- JSDOM 照片和交互测试在当前 v8 持久化协议下会执行完整状态校验，运行时间明显长于普通静态测试；这属于验证成本，不应被误判为产品界面卡死。真实浏览器仍需在最终视口验收中确认照片按钮的等待状态、失败提示和重试体验。

该修复仍属于未发布 `v4.8.0` 候选；之前同一代码状态的完整门禁结果不自动覆盖本次代码变更，最终发布前须重新执行受影响测试和一次完整门禁。

## 2026-08-21 全量验证中的存储契约纠偏

全量回归发现 `tests/v8-canonical-idb-browser.js` 原先把 IndexedDB 原始物理行数当成学生人数，导致大名单原子载荷场景错误失败。当前实现将 1,200 条学生作为一个 `__cwb_bulk_students__` 载荷原子提交；真实业务读取通过仓储层解包，数据没有丢失。测试已补充原始载荷键、仓储 reopen 后 1,200 条逻辑记录和首尾记录校验，`node tests/v8-canonical-idb-browser.js` 已通过。

本条属于持久化契约维护，不代表 `v4.8.0` 已正式发布。修正测试后完整 `pnpm test` 已重新跑完并退出码 `0`；候选构建、lint、公开面、密钥扫描、Release 契约和差异检查也已通过。真实设备恢复和正式发布仍不在本次本地门禁证据内，继续按发布收尾记录管理。

最终浏览器性能样本：10,000 条学生处理完成，耗时 `4788.5ms`，最大进度事件间隔 `9.4ms`，最大事件循环间隔 `176ms`。该结果用于当前候选的回归证据，不承诺所有浏览器和低配终端达到同样耗时。

## 2026-08-21 局域网二维码配对收口

本批将局域网配对从“手工复制四项信息”补齐为“二维码 + 明文回退”两种入口。桌面主进程新增 `desktop:lan-sync-pairing-qr`，预加载层只暴露无参数的安全方法；二维码生成使用锁定版本 `qrcode@1.5.4`，不会把主机管理令牌、设备令牌、`token_hash`、主密钥、学生数据、记录 ID 或附件 ID 放入载荷。

二维码载荷由 `CWBV48.createPairingQrPayload()` 生成，协议为 `cwb://lan-pair`，只允许以下字段：协议版本、HTTPS 主机地址、工作区 ID、一次性 `pairing_id`、8 位数字配对码、证书指纹和过期时间。`parsePairingQrPayload()` 会拒绝非 HTTPS 地址、凭据/查询/片段、未知字段、重复字段、错误版本、错误配对码格式和已过期载荷。二维码本身不等于授权，扫描后仍需核对证书指纹、提交请求并由主机人工确认。

桌面弹窗显示二维码、有效期和一次性配对码，同时保留主机地址、配对 ID、配对码和证书指纹的逐项复制按钮。二维码生成失败时仍可手动配对；弹窗明确提示二维码不会自动信任证书，不会启用局域网自动发现，过期后必须重新生成。

本批局部证据：`node tests/v48-pairing-qr.js`、`node scripts/build-release.js output/v4-preview.html`、`node tests/v48-lan-ui.js` 及相关 `node --check` 已通过；随后完整 `pnpm test:v48`、`pnpm lint`、`pnpm check:public`、`pnpm check:secrets` 和 `git diff --check` 也已通过。该证据只证明候选代码、载荷约束、Electron/页面桥接契约和构建后页面行为；真实手机扫码、手机对自签名 HTTPS 证书的信任、自动重连、自动发现和长时间同步压力仍未完成，不能据此宣布 v4.8.0 正式发布。

## 2026-08-22 当前事实总账回链

15 条客户反馈及后续存储、同步、AI 和体验补充需求的当前状态，统一以[当前收口总账](./closeout-status-2026-08-22.md)和[v4.8.0 发布收尾记录](./release-v4.8.0.md)为准。新增的 AI 保存事务回滚和局域网队列能力已随 v4.8.0 交付；真实设备、跨网络服务互操作和长期压力仍需单独取得发布后证据。
