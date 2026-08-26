# v4.8.0 局域网同步与存储可靠性记录

> 状态：工作区候选技术记录。当前公开版本仍为 `v4.7.1`，本文件不构成上线承诺。

## 目标

解决浏览器 IndexedDB、Electron SQLite 和附件仓之间的数据割裂，同时保持本地优先、可恢复和不把学生明细上传到云端的边界。

```text
Electron 主机：SQLite + 加密附件仓 + HTTPS 同步服务
       ↑ 一次性配对码、配对令牌、证书指纹
手机网页 / 浏览器网页 / 其他桌面端
```

客户端不得直接共享 SQLite 文件。主机负责事务、修订号、附件索引和审计；客户端只能提交带 `idempotency_key` 的操作。

## 已实现的主机核心

### 密钥和仓储

- `desktop/vault.cjs` 负责版本化主密钥 envelope、原子写入和损坏保护。
- `desktop/recovery-kit.cjs` 使用 `Argon2id + AES-256-GCM` 加密恢复包，恢复口令不足、错误或 envelope 损坏都会拒绝。
- `desktop/sqlite-store.cjs` 支持 SQLite 完整性检查和加密记录 payload 检查。
- `desktop/main.cjs` 将错误转换为稳定错误码，并提供仓储健康、数据目录迁移和恢复 IPC。
- 数据目录和安装目录分离；迁移前留副本，迁移失败不删除原目录。

### HTTPS 和配对

- `desktop/lan-sync.cjs` 使用 TLS 1.2、自签名证书和 SHA-256 指纹。
- 配对码一次性、短时有效；主机必须明确确认请求。
- 设备状态、令牌、配对、撤销、同步和冲突状态写入加密状态文件并在主机重启后恢复。
- 设备撤销后原令牌立即失效；重放和重复提交使用幂等键拒绝。

### 同步操作

同步操作使用以下字段：

```text
workspace_id
device_id
operation_id
idempotency_key
collection
record_id
base_revision
patch
updated_at
schema_version
```

不同字段可以合并；同字段修改进入冲突收件箱，保留双方值、设备、时间和版本。同步记录不保存附件二进制，只保存附件 ID 和必要元数据。

### 附件

附件 API 已限制单块大小、总大小、偏移范围和 SHA-256；客户端现在提供可重复提交的分块上传入口，主机返回第一个连续缺失偏移，非连续分块不会被“已收到总量”错误跳过，断网后可以继续，不需要从零上传。主机重启会恢复有效上传元数据；损坏的任务元数据会被拒绝并记录最小审计。所有设备路由（包括冲突和附件接口）都会校验活动 bearer token，不能只凭请求头存在就放行。

主机附件在传输完成后使用工作区同步密钥以 AES-256-GCM 加密写入 `attachments/*.bin`；临时分块也以独立 AES-GCM envelope 写入 `${upload_id}.chunks/*.chunk`，不会把断点上传内容以明文写入磁盘。临时目录只在上传任务存续期间存在，并由启动清理和过期清理回收；清理按上传任务整体处理，避免留下孤儿分块。受授权的 `GET /api/v1/attachments/:id` 才会解密返回；旧候选中已经存在的明文附件在兼容读取时会先原子重加密再返回，不会把新附件继续按明文写入。

### 管理页面和业务接入

- `src/core/cwb-v48-ui.js` 已把客户端连接、拉取、推送、离线队列和冲突收件箱接入工作台；令牌默认只保存在当前页面会话，持久化状态不保存令牌。
- 冲突收件箱支持保留本机、采用主机和手动编辑；手动编辑只允许修改冲突字段，确认后由主机生成新修订，避免把“最后写入”误当成事实裁决。
- 政策推送支持工作区、学院、年级、班级范围，内容包导入会先合并并保留新本地版本，失败时恢复导入前快照；工作分类中心只允许维护学校自定义分类，系统职责分类受保护。
- 内容推送服务还支持 `workspace_admin`、`content_editor`、`teacher`、`viewer` 本地策略角色。页面列表、已读和普通角色导出必须携带当前工作区上下文；角色只用于本地策略判断，不替代账号认证，也不扩大局域网同步对学生明细的共享范围。
- 动态分班页面的联合走访弹窗是本地派生查询，不写入学生事实：按所选日期计算历史班级、有效住宿和课表空课时，并支持 CSV 导出；缺课表显示“未记录”。

## 版本和集合

工作区协议仍为 `schema_version:8`，候选业务版本为 `data_schema_version:11`，同步协议为 `sync_protocol_version:1`。v10 到 v11 只新增集合，不删除旧集合或旧字段：

```text
v4_sync_devices
v4_sync_outbox
v4_sync_conflicts
v4_sync_revisions
v4_backup_runs
v4_student_field_catalog
v4_student_identity_conflicts
v4_form_templates
v4_form_jobs
v4_student_class_history
v4_content_pushes
v4_content_reads
v4_work_categories
```

迁移入口为 `src/core/v11-migration.js`，共享清单位于 `src/core/cwb-collections.js`，候选核心服务位于 `src/core/cwb-v48.js`。当前已用脱敏夹具验证浏览器工作区、单文件离线 HTML、加密备份、手机工作包、交换包、自定义集合和附件 ID/内容回读；这属于契约级恢复证据，真实 Electron、手机设备和长期断网重连仍需最终发布验收。

## 备份计划语义

- 桌面端工作台运行期间每 60 秒调用一次到期检查。
- 到期条件只有两个：超过每日/每周/每月周期，或达到变更数量阈值。
- 检查未到期时不写备份文件；到期时读取桌面安全存储中的备份口令并生成加密包。
- 缺少备份口令、写入失败和仓储解密失败会保存有限错误码，界面显示下一步处理，而不是提示成功。
- 程序退出后不能继续运行 JavaScript 定时器；下次启动会立即补做检查。
- 每次成功备份会在 `v4_backup_runs` 追加一条最小运行记录，最多保留 50 条；记录本身不增加业务变更计数，恢复和换机包会保留这些记录。
- 浏览器没有后台文件写权限，网页关闭时不会承诺自动备份；支持的浏览器可使用用户主动授权的文件目录保存。

实现入口：`desktopBackupScheduler`、`CWB.backup.runDueJobs()`、`CWB.backup.status()` 和 `CWB.backup.configureSchedule()`。

## 尚未完成的实机与发布闭环

以下内容仍是 v4.8.0 发布前任务。客户端核心与管理页面已经进入候选并通过定向测试，下面只列剩余风险：

- 手机/浏览器客户端的真实 HTTPS 证书信任、二维码配对和长时间断网重连验收。
- 加密离线 outbox 在真实客户端重启后的恢复、自动 flush 和多设备压力测试；当前脱敏夹具只验证协议和持久化契约。
- 附件分块 API、客户端上传 UI、断点续传和过期上传任务清理已完成核心实现；真实手机断网重连、浏览器文件权限和大附件压力仍待最终设备验收。
- `CWBV48.createRemoteBackupAdapter()` 已提供 HTTPS/WebDAV 用户自有存储的加密包传输核心，备份页面也已接入完整候选配置向导：支持测试连接、端点配置、上传、下载预览恢复和删除；只接受 `encrypted:true` 的 `.cwbk` 字节，不上传密钥，强制 HTTPS、禁止 URL 内嵌账号密码、禁止跟随重定向并限制大小/超时。真实 WebDAV 服务商仍未做互操作验收。
- Windows/macOS 实机安装、数据目录跨盘迁移、恢复口令换机和损坏 SQLite 回滚。
- 手机真实 HTTPS 信任、自动发现/二维码配对和长时间断网重连尚未作为正式设备能力验收。

冲突收件箱已经支持“保留本机、采用主机、手动编辑”三种方式；主机解决会生成可拉取的新修订，审计只保存冲突字段名和处理模式，不保存字段值。

## 安全边界

局域网不是安全边界。主机应使用系统账户保护、磁盘加密和受控 Wi-Fi；配对码不能通过公开群聊传播。同步首期不共享心理、危机、资助、纪律、联系方式等学生明细；任何跨部门明细共享都需要单独的账号、角色、字段授权和合规设计。

## 验证记录

已通过：`pnpm test:v48`（包含 `node tests/lan-sync.js`、`node tests/v48-storage-hardening.js`、`node tests/v48-backup-records.js`、`node tests/v48-services.js`、`node tests/v48-content-export.js`、`node tests/v48-worklog-export-runtime.js`、`node tests/v48-lan-ui.js`、`node tests/v48-management-ui.js`、`node tests/v48-cross-platform-recovery.js` 和 `pnpm test:backup-scheduler`）、`node --check desktop/lan-sync.cjs`、`node scripts/check-inline-js.js`。本批新增断言包括未授权附件接口拒绝、正式附件和临时分块均非明文、非连续分块恢复第一个缺口、主机重启续传、旧明文附件兼容读取时重加密、授权下载回读、失败拉取保留游标、备份运行记录恢复、远程备份适配器的 HTTPS/加密包边界、远程配置不保存凭据、内容推送跨范围读写和工作留痕来源回链，以及浏览器/离线/备份/手机工作包/交换包的脱敏恢复契约。最终发布前仍需执行真实客户端/冲突/附件测试、Windows/macOS 实机迁移回滚、真实 WebDAV 互操作和设备级跨端恢复测试。

## 2026-08-21 安全边界维护

远程备份端点现在在网络请求前验证：只允许 HTTPS 基址下的同源相对路径，绝对 URL、前导斜杠、反斜杠、查询/片段、`.`/`..` 和 URL 编码后的目录穿越都会返回 `REMOTE_BACKUP_ENDPOINT_INVALID`。基址带查询参数返回 `REMOTE_BACKUP_URL_QUERY_FORBIDDEN`。这些错误不会被包装成 `REMOTE_BACKUP_NETWORK_FAILED`，便于用户修正配置。

桌面迁移新增无 Electron 依赖的路径/事务测试，覆盖空路径、当前目录、工作区嵌套、候选仓解密失败、原仓恢复成功和原仓恢复失败。局域网配对页面新增地址、配对 ID、配对码和证书指纹复制按钮；二维码与自动发现仍未实现，手机端必须手动录入并等待主机确认。

提交前还实际通过 `pnpm lint`、`pnpm check:public`、`pnpm check:secrets` 和 `git diff --check`；密钥扫描检查 313 个仓库文件。上述结果只证明候选代码门禁，不替代真实客户端、Windows/macOS 实机迁移回滚、WebDAV 服务商互操作和设备级恢复测试。

## 2026-08-21 同步事务回滚与客户端错误边界

同步主机现在把状态文件写入视为一次提交边界。配对码、配对请求、设备确认/撤销、同步操作和冲突解决在修改内存前创建快照；`persist()` 抛错时恢复快照，并按绑定仓储提供的 `get/put/delete` 回退已写入的业务记录。Electron 主进程已经提供 `delete`，因此新记录也能在提交失败后清理。自定义 `recordStore` 若不提供 `delete`，不得用于需要新记录回滚的生产主机适配器。

同步服务的稳定错误码包括 `SYNC_STATE_DECRYPT_FAILED`、`SYNC_PAIRING_RATE_LIMITED`、`SYNC_DEVICE_UNAUTHORIZED`、`SYNC_RECORD_APPLY_FAILED` 和 `SYNC_STATE_PERSIST_FAILED`。配对错误达到 5 次返回 429；重复操作仍按 `idempotency_key` 去重。审计只记录动作、集合、记录 ID、设备、字段名和版本，不记录 patch 值或令牌。

事务内审计事件先进入内存队列，只有状态和业务记录都提交成功后才发送；失败回滚会丢弃队列，避免审计显示一个实际未落盘的成功操作。

客户端先解析并校验 HTTPS 基址，再进入网络请求异常处理。这样 HTTP 地址、URL 凭据、查询/片段和缺失证书指纹分别保留 `SYNC_HTTPS_REQUIRED`、`SYNC_BASE_URL_INVALID` 和 `SYNC_CERTIFICATE_FINGERPRINT_REQUIRED`，不会被包装成普通网络故障。主机自签名证书包含 `localhost`、`127.0.0.1` 及绑定的局域网 IPv4 SAN；首次连接仍要求老师人工比对指纹。

本批定向证据：`node tests/v48-p0-hardening.js`、`node tests/v48-services.js`、`node tests/lan-sync.js` 和三个相关文件的 `node --check` 已通过。该证据不替代真实设备配对、断网重连、跨盘迁移和附件压力测试。

## 2026-08-21 客户端配对与设备控制补充

局域网配对现在形成可完成的闭环：客户端提交一次性配对码后保存 `pairing_request_id`，主机人工确认，客户端再以请求 ID和设备 ID轮询 `/api/v1/pairing/result`，令牌只返回一次。交付令牌不写入主机状态快照；健康、状态和设备认证元数据不返回 `token_hash`。二维码和自动发现仍未实现，不能在用户文案中暗示已经支持。

设备状态分为 `active`、`paused` 和 `revoked`。暂停只阻断同步和附件接口，不删除设备或离线队列；恢复继续使用原令牌；撤销立即失效且必须重新配对。主机桌面页提供暂停、恢复和撤销按钮，操作成功后才刷新状态并显示成功提示。

客户端同步状态新增 `syncNow()`、`startAutoSync()`、`stopAutoSync()`、`pollPairing()` 和 `next_sync_at`。连接成功后页面开启 60 秒自动检查；错误时保留队列、游标和表单并显示可诊断错误码。`ui_state`只保存非秘密的地址、游标、队列、冲突摘要和请求 ID，主动删除会话令牌、同步对象和令牌草稿。

本批定向证据新增 `tests/v48-sync-resilience.js`，并更新 `tests/lan-sync.js` 覆盖待确认、一次性令牌领取、重复领取失败和健康状态脱敏；仍需真实手机/浏览器证书信任、主机重启配对、自动重连和附件压力验收。

## 2026-08-21 二维码配对实现补充

桌面端现已提供二维码配对入口。主进程通过 `desktop:lan-sync-pairing-qr` 创建一次性配对信息，使用 `qrcode@1.5.4` 输出 PNG Data URL；核心载荷格式为 `cwb://lan-pair`，只包含版本、HTTPS 地址、工作区 ID、一次性配对 ID、8 位配对码、证书指纹和过期时间。`token`、`token_hash`、主密钥、学生数据、记录 ID 和附件 ID 均不进入二维码。

配对弹窗同时保留四项明文复制回退，并提示扫码后仍需核对证书指纹、提交请求、等待主机人工确认。二维码过期即失效；生成失败不会阻断手动配对。该功能已通过 `tests/v48-pairing-qr.js` 和构建后 `tests/v48-lan-ui.js`，但真实手机扫码、自签名证书信任、自动发现和多设备长时间压力仍待发布前验收。

## 2026-08-22 队列与恢复当前事实

局域网离线队列的页面文案现在按真实存储能力区分为“桌面工作区队列”“IndexedDB 队列”和“兼容离线队列”；未启用 IndexedDB 的兼容路径明确提示未使用数据库级加密，不把内存或普通兼容队列描述成加密存储。AI 与同步相关状态保存失败时保留队列、输入和可重试状态。相关回归见 `tests/v48-lan-ui.js`、`tests/ai-output-health.js` 和[当前收口总账](./closeout-status-2026-08-22.md)。
