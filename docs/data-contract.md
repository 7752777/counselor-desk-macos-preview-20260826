# 数据参考：字段、导入与联动

## v4.9.0 候选数据契约设计与发布边界

v4.9.0 候选保持 `schema_version: 8`、`data_schema_version: 11` 和 `sync_protocol_version: 1`。商业许可证、设备令牌和模型 API Key 是运行时凭据，不是业务事实，不进入 `CWBCollections`、SQLite records、IndexedDB 工作区、备份、手机交换包或学生导出。许可证只通过 Electron `safeStorage` 专用文件读取；浏览器伴侣使用独立命名空间。更新迁移前建立恢复点，失败时保留当前有效数据。

本页用于查找数据处理原则。不同学校的字段口径不同，工作台的目标是帮助映射和保留信息，不替代学校的数据标准。

## v4.8.5 数据契约设计与发布状态

v4.8.5 不改变 `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1`、稳定 `student_id` 关联、旧学号兼容快照或既有导入/导出格式。单文件图标内联、离线路由验收、主测试门禁和本地备份传输测试不涉及业务数据；本次不新增集合、不删除字段、不触发数据迁移。正式版本证据见[v4.8.5 发布收尾记录](./upgrade/release-v4.8.5.md)。

## v4.8.2 历史数据契约设计与发布状态

v4.8.2 不改变 `schema_version: 8`、`data_schema_version: 11`、`sync_protocol_version: 1`、稳定 `student_id` 关联、旧学号兼容快照或既有导入/导出格式。证书图片仍只通过附件 ID 关联，恢复包仍使用独立恢复口令；本次维护收口同步客户端异步状态保存、业务仓储写入失败回退和批量替换前完整校验，不新增集合、不删除字段、不触发数据迁移。正式版本证据见[v4.8.2 发布收尾记录](./upgrade/release-v4.8.2.md)。

## 学生记录的基本识别

| 信息 | 用途 | 建议 |
| --- | --- | --- |
| 学号 | 常用识别键 | 始终按文本处理，避免前导零消失。 |
| 姓名 | 人工核对 | 同名不是重复的充分条件，应结合学号、班级等信息。 |
| 班级 / 专业 / 学院 | 筛选与分组 | 允许随学校口径调整。 |
| 联系与家庭信息 | 工作联系 | 仅在制度允许、工作必要的范围内使用和导出。 |
| 自定义字段 | 本校特有信息 | 导入前确认含义；未知列应先保留，再决定是否纳入规范字段。 |

## v4.5.0 / v4.6.0 / v4.7.0 常用学生字段

下表是工作台可识别的常用字段方向，不是要求每所学校都填写的必填表。缺少的字段可以留空；本校已有但未列出的字段应作为自定义字段保留，而不是为了导入而删掉。

| 字段方向 | 常见含义 | 常见使用位置 |
| --- | --- | --- |
| 社区 / 书院 | 学生所属社区、书院或园区 | 组合筛选、分组、导入与导出 |
| 培养层次 | 本科、专科、研究生或本校定义的层次 | 台账筛选、统计、学生档案 |
| 学生状态 | 在读、休学、毕业、退学等本校状态 | 台账、导出、交接前核对 |
| 关注类型 | 学业、经济、心理、就业或本校分类 | 重点跟进、谈话计划、筛选 |
| 危机等级 | 仅按本校授权口径记录的工作风险级别 | 跟进频率、提醒、闭环记录 |
| 预警解除状态 | 已解除、待核实、持续跟进等 | 筛选、统计、阶段性复核 |
| 历史学号 | 转专业、学籍变动前的识别信息 | 重复提示、迁移与旧材料关联 |
| 导师 / 班主任 | 学校导师制或班主任制下的日常联系对象 | 学生档案、导入、筛选和导出 |
| 家长关系 / 联系方式 | 家庭联系的关系、电话和邮箱 | 学生档案、必要时的家校联系 |
| 家庭地址 / 居住类型 | 家庭住址、校内/校外居住和校外地址 | 学生档案、住宿核对 |
| 房东联系方式 | 校外居住场景下的房东电话和地址 | 学生档案，默认不纳入 AI 出站上下文 |
| 照片 / 附件 ID | 学生照片和业务文件在附件仓中的引用 | 画像、活动、查课查寝和导出索引 |

> 对健康、心理、家庭、纪律、资助和党员发展等敏感字段，应遵循最小必要原则。工作台可以帮助组织记录，不应把推测、标签或未经确认的结论当作客观事实。

## 导入原则

1. 先选集合，再识别表头，确认映射后才写入。
2. 一次导入不要混入多个无关业务集合；复杂工作簿应分工作表、分任务处理。
3. 对学号、日期、枚举、数值和附件引用做预览与抽查。
4. 对疑似重复只提示并交由人工决定，避免自动覆盖真实记录。
5. 批量导入前创建备份；导入后保留来源文件和导入报告，直到抽查完成。

### 学生导入的合并与覆盖

学生名单默认使用“合并更新”：来源文件中缺少的学生不会被删除，已存在学生按稳定 `student_id`、当前学号和历史学号进行匹配。需要以来源文件替换当前名单时，必须在预览页明确选择“覆盖”，系统会先建立恢复点、显示预计删除数量，并提供撤销/恢复路径。更正学号不会创建新的学生身份，旧学号会进入 `student_number_history`，业务记录继续按 `student_id` 关联。

导入别名中，“班主任”只映射 `homeroom_teacher_name`，“导师”只映射 `advisor_name`；不会把班主任误写成辅导员。未知列保留为自定义字段，不能为了通过导入而静默丢弃。

### 一次复杂导入的推荐步骤

1. 选择目标业务集合，例如学生、谈话、住宿或活动，而不是把不同性质的数据混在一个任务里。
2. 选择工作表，确认合并单元格、多行表头、序号列和实际表头所在行。
3. 检查自动识别结果，手工确认学号、姓名、班级、日期、状态和枚举值的映射。
4. 在预览中处理空值、重复、异常日期和无法识别的字段；不确定时暂停或取消，不要“先导入再说”。
5. 写入后抽查来源表中的几条记录、关联附件和导出结果；需要重新处理时使用导入任务的回滚/重试路径。

## 导出与最小化原则

导出是一次新的数据处理。选择最少必要字段，避免把联系方式、家庭、健康、纪律、心理或身份信息随表格扩散。CSV/Excel 打开前后都应检查公式、编码和共享范围。

### v4.5.0 统一导出包

统一接口为：

```js
CWB.export.createPackage(options)
CWB.export.toCsv(options)
CWB.export.toXlsx(options)
CWB.export.toDocx(options)
CWB.export.toPrintableHtml(options)
CWB.export.toPdf(options)
```

导出包可以同时包含学生、谈话、活动、工作留痕、党团流程、课表和通讯录，保留当前筛选条件、字段选择、列顺序、封面、目录、页眉、页脚、页码和附件索引。HTML 用于浏览器和手机系统打印，Electron 可用 `printToPDF` 生成 PDF；浏览器 PDF 的分页和页眉效果由系统打印实现。敏感字段在导出预览后仍需人工确认并写入审计。

### 模板中心格式

模板中心提供 CSV/XLSX 模板和说明页。第一行是“中文表头（稳定字段名）”，第二行是示例数据；填写前删除示例行。说明包含字段名、中文表头、必填性、数据类型、`YYYY-MM-DD` 日期格式、可选值、敏感字段标记、多值分隔规则以及学生 ID、学号和附件 ID 的用途。`student_id` 用于已有记录关联，不能用姓名猜测稳定身份；附件 ID 只引用附件仓中的已存在文件。

### 领导统计视图

领导统计视图只能导出固定的数值汇总，例如学生总数、重点关注人数、未解除风险、在办/逾期事项、谈话、预警和就业意向记录数量。视图名称和指标选择保存于本机工作区设置；CSV 只有“指标、数值”两列，不包含学生姓名、学号、联系方式、地址或心理详情。它用于阶段性汇总，不替代学校正式报表口径或敏感名单审批。

## 关联记录

谈话、任务、住宿、成绩、奖惩、活动、组织任职和附件应尽量保留稳定的学生引用；仅依赖姓名会在同名、改名或转班场景下产生歧义。迁移和恢复时，内部 ID、附件关联、历史学号与自定义字段应被保留；具体兼容范围以发布版本说明为准。

v4.5.0 新增的 `v4_contacts` 是辅导员个人通讯备忘录，默认不与学生关联；`v4_class_schedules` 只记录所带班级课表；`v4_activity_participants` 用 `student_id + term + activity_id` 去重统计；`v4_league_cases` 记录团员发展国家基线和学校附加节点。四个集合都应随 IndexedDB、Electron SQLite、便携 HTML、备份和手机交换包迁移。

v4.6.0 追加以下集合，均使用业务 schema v9 增量迁移；这些集合已由 v4.7.0 正式版本继续兼容并纳入统一 manifest：

| 集合 | 主要用途 | 关联原则 |
| --- | --- | --- |
| `v4_dorm_buildings` / `v4_dorm_rooms` | 楼栋、房间、容量、床位和状态 | 房间通过 `building_id` 关联楼栋 |
| `v4_dorm_batches` | 学年、学期、排宿/调宿批次 | 批次是方案和历史的业务范围 |
| `v4_dorm_assignments` | 学生当前/计划住宿位置 | 优先 `student_id`，保留学号和姓名快照 |
| `v4_dorm_transfers` | 原位置、新位置、原因、办理人、状态和附件 | 追加历史，不覆盖原调宿记录；撤销使用 `status=cancelled` 作废标记，不硬删除 |
| `v4_committee_role_catalog` | 默认、自定义班委角色字典 | 只属于当前工作区，不写死在代码 |
| `v4_committee_evaluations` | 班委周期、日期、等级和备注 | 关联 `student_id`，等级必须人工录入 |
| `v4_family_contacts` | 家长联系过程记录 | 与 `v4_contacts` 分离，按学生稳定 ID 关联 |
| `v4_worklog_drafts` | 由业务记录生成的待确认工作记录 | 保存来源集合、来源 ID、来源哈希、来源状态和重新核对时间；来源变化或删除后不能直接确认 |
| `v4_research_projects` | 科研课题、阶段、截止日期和历史 | 阶段任务按项目/阶段去重关联 |

排宿方案必须先生成预览，经过人工确认才可以更新学生宿舍快照；确认时必须重新检查当前活动住宿、楼栋启用状态、房间可用状态、床位归属、性别限制、容量冲突和同一方案中的重复 `student_id`。分析结果是派生聚合，缺失记录为“未记录”而不是零。新增集合不得把附件二进制直接写入记录，只保存附件 ID。

业务记录的 `student_id` 必须来自明确的学生引用。记录自身的 `id` 不能在缺少 `student_id` 时自动回退为学生 ID；否则会把业务记录错误关联到不存在的学生。只有从 `students` 集合读取的学生对象，才可以用其稳定 `id` 生成排宿或聚合输入。

日期工具和业务日期按真实日历校验，`2026-02-31`、`2026-04-31` 等不存在日期必须被拒绝，不得依赖 JavaScript 日期构造器的自动归一化。

班级分析的 `term` 是记录级筛选：已选择学期时，没有相同 `term` 的谈话、成绩、活动参与、奖惩、资助或考勤记录不能进入该学期统计；活动参与统计按 `student_id + term + activity_id` 去重，没有稳定活动 ID 的自由文本不会静默计入。学生当前关注等级、就业状态等快照字段不伪装成某个学期的事实记录。

学生画像中的电话字段只输出脱敏值；查看完整号码要求工作台访问锁已启用、完成二次验证并写入访问审计。班级分析默认只输出聚合数量，姓名、学号和敏感指标明细必须经过访问锁验证后才能下钻。

AI 建议、来源、授权和转化记录同样优先保存 `student_id`；学号仅作为兼容快照。建议转任务、谈话或工作留痕后，必须能够回链到原建议、来源和人工确认状态，不能把模型输出当作学生事实直接写入。

## 导出前的最后核对

1. 这份文件要交给谁，是否真的需要每个字段？
2. 是否已经在导出预览中移除了不必要的联系方式、家庭、健康、纪律或身份信息？
3. 文件名、页眉页脚、Logo 和备注是否会泄露不该出现的信息？
4. Excel/CSV 是否可能被公式解释？导出后请在受控环境检查编码、列宽和内容。
5. 是否已记录导出的用途、日期和接收范围，并在完成后按本校制度保管或销毁？

需要实际操作时，阅读 [用户手册](./user-guide.md)；需要换机或恢复时，阅读 [备份与迁移](./v4-migration-and-backup.md)。

## v4.7.0 v10 集合（历史发布兼容基线）

业务 `data_schema_version` 已从 9 增量到 10，工作区协议 `schema_version: 8` 继续保留。v4.7.0 引入的新增集合由共享 manifest 声明，并同时进入浏览器 IndexedDB、单文件离线包、Electron SQLite、备份恢复和手机交换包；v4.7.1 只在既有 AI 审计与运行时上增加可选字段和按钮/保存边界，不新增集合：

| 集合 | 关键字段 | 说明 |
| --- | --- | --- |
| `v4_class_checks` | 课表、班级、课程、日期、教学周、状态、到课/未到/迟到、发现、措施、附件 ID | 查课事实与异常处理入口 |
| `v4_roll_call_sessions` | 日期、班级、候选学生 ID、抽取数量、随机种子、结果、复核状态 | 本地随机源；不把抽签交给 AI |
| `v4_dorm_inspections` | 批次、楼栋、房间、日期、检查人、结果、摘要、附件 ID | 查寝事实，与排宿分离 |
| `v4_dorm_exceptions` | 查寝记录、房间/学生、类别、等级、期限、状态、处理结果 | 异常处理可关闭，但不覆盖原始查寝 |
| `v4_assessment_rules` | 学期、规则版本、基础分、维度、阈值、启用状态 | 量化考评规则版本 |
| `v4_assessment_entries` | 学生 ID、学期、维度、加/扣分、来源、证据附件 ID、核验状态 | 排名由明细派生，不重复保存事实 |
| `v4_tool_links` | 名称、分类、HTTPS 地址、说明、排序、收藏、核验状态 | 本地工具入口，不后台抓取 |
| `v4_employment_safety` | 单位、类型、风险等级、理由、来源 URL、核验日期 | 防骗提示，不是自动结论 |
| `v4_competition_resources` | 竞赛、主办方、官网、报名地址、截止时间、来源、核验状态 | 竞赛资源导航 |
| `v4_competition_entries` | 竞赛 ID、学生 ID、项目、角色、分工、状态、获奖等级、附件 ID | 学生报名和材料关系 |

`src/core/v10-migration.js` 只为缺失集合初始化空数组并补充 v10 UI 元数据，不删除旧集合或改写现有学生 ID。姓名、学号和班级仍是快照/兼容信息；业务关联必须保留稳定 `student_id`。附件字段只存 ID，照片和证书等二进制不进入 JSON 记录。历史附件、跨端构建和恢复证据见[发布收尾记录](./upgrade/release-v4.7.0.md)，其下载入口现在需要私有仓库权限。

## 2026-08-19 UI 候选不改变数据契约

当前工作区的首页工作台、统一页面样式、学生筛选布局、右侧上下文区和移动顶栏收口均为展示层改动：不增加集合、不增加字段、不改变 `data_schema_version: 10`、不改变工作区协议 `schema_version: 8`，也不改变导入、导出、备份、恢复和手机交换包格式。首页的数据概览和维护状态均为既有记录的派生显示；上下文区只读取当前页面、任务、草稿和已选择的学生，不建立第二份事实数据。

任何后续 UI 重构都必须保持以下契约：

- 学生及业务记录继续优先通过 `student_id` 关联；学号只是当前快照和兼容筛选。
- 照片、证书、查课/查寝和其他附件继续保存附件 ID，二进制留在附件仓。
- AI 结果继续是建议或草稿，人工确认前不能写入心理、纪律、资助、预警、党团、住宿或学生事实。
- 页面过滤器、列视图和折叠状态只能写入 UI 状态，不能覆盖工作区集合或共享设置。

v4.7.1 的 UI/AI 维护已纳入当前发布线；若后续引入新字段或集合，必须重新建立迁移、备份恢复、Electron、便携 HTML 和手机交换包测试，不能借 UI 版本号顺带改变数据格式。

## AI 数据契约

AI 业务集合同样遵循工作区协议 `schema_version: 8`，不改变学生主数据的稳定 ID 规则：

| 集合 | 关键字段 | 生命周期 |
| --- | --- | --- |
| `v4_ai_providers` | provider、模型、用途白名单、额度、图像能力 | 只保存配置和能力声明；API key 与 relay token 只在会话或桌面安全存储 |
| `v4_ai_audit` | `request_id`、用途、模型、状态、`suggestion_id`、`draft_id`、`source_ids`、授权分类/字段、`context_scope`、耗时、可选 `feedback` | 请求、失败、授权、采纳、确认、转化和建议质量反馈都留痕；不保存密钥、完整请求或完整响应 |
| `v4_ai_drafts` | 草稿 ID、生成审计 ID、来源、学生 ID、敏感分类/字段、业务范围、草稿 payload | 生成后待人工编辑；确认或驳回后保留状态，不直接成为事实 |
| `v4_ai_suggestions` | 建议 ID、风险、状态、来源引用、生成审计、上下文、人工确认 | `draft -> review/viewed -> accepted -> converted_*`；来源失效时禁止直接转化 |
| `v4_ai_sources` | 本地/网页来源、集合记录、稳定来源 ID、`student_id`、兼容 `student_number` 快照、`source_fingerprint`、`source_updated_at`、URL、摘录、抓取/核验时间和状态 | 本地来源可回链到业务集合并在转化前复核指纹；网页来源只接受用户明确触发的公开 HTTPS 地址；失效来源保留追溯但不进入新上下文；学号快照只用于本地范围解析，不能出站 |
| `v4_ai_consents` | 请求 ID、用途、学生/班级/事项范围、敏感分类/字段、过期时间、消费时间 | 默认 15 分钟、单次消费；完成、失败、取消或超范围后不可复用 |

业务记录的 AI 关联字段统一使用 `ai_suggestion_id`、`ai_request_id`、`ai_draft_id`、`ai_audit_id`/`ai_generation_audit_id`、`ai_confirmation_audit_id`、`ai_provider_id`、`ai_model`、`ai_purpose`、`ai_source_ids`、`ai_context_scope`、`ai_sensitive_categories` 和 `ai_sensitive_fields`。确认审计通过 `parent_audit_id` 指向生成审计；来源记录通过 `source_ids` 和引用片段回链。`student_id` 只在本地记录中保存，学号快照仅用于兼容范围解析；出站请求会移除稳定 ID、学号快照和未授权身份字段，即使授权身份也不会发送内部稳定 ID。本地 `id/record_id`、附件和指纹等索引也不发送给模型。来源被修改或删除时，建议转换接口必须先返回人工复核错误。

生成文本可以进入明确的 AI 草稿或建议 payload，但不得因为页面刷新把完整输出、请求内容或包含业务记录的来源数组写入 `ui_state`。通知完整原文默认只保存摘要与哈希；只有老师确认勾选保存时才进入本地 AI 草稿。模型连接测试不建立业务草稿，也不携带当前学生、班级或业务记录。

v4.8.0 的 provider 运行时还约束直连响应：默认最大 4 MiB、绝对最大 8 MiB，先按 `content-length`/UTF-8 字节检查再解析 JSON；超限返回 `AI_PROVIDER_RESPONSE_TOO_LARGE`，成功响应不是合法 JSON 时返回 `AI_PROVIDER_INVALID_JSON`。取消信号在响应体读取后再次检查，避免取消竞态落库为成功。图片必须由 `supportsVision: true` 的 provider 处理；Anthropic 消息在发送前转为 `image/source.base64`。建议反馈只允许 `helpful`、`needs_revision`、`not_applicable` 三个枚举，写入既有 `v4_ai_audit`，不新增集合，不保存老师评论原文。

## v4.8.0 v11 数据契约（已发布）

v4.8.0 把业务 `data_schema_version` 增量到 `11`，工作区协议仍为 `schema_version: 8`，同步内部协议单独使用 `sync_protocol_version: 1`。`v10 -> v11` 只初始化缺失集合和设置元数据，不删除旧集合、不重写学生稳定 ID；v4.7.1 及更早版本按兼容迁移进入该版本。

浏览器 IndexedDB 另有独立的物理版本：v4.7 及更早版本使用版本 `5`，v4.8.0 使用版本 `6`。物理版本只负责创建缺失 object store，不等同于业务数据版本，也不替代 v8 工作区迁移。已有版本 5 数据库打开时必须触发一次 v5 → v6 升级；升级后旧记录保持可读，新增 `records_custom_*` 集合可用。任何新增集合都必须同时加入共享 manifest 和该物理升级路径，不能只修改业务 `data_schema_version`。

新增集合及其最小关联如下：

| 集合 | 主要字段/用途 | 不能做的事 |
| --- | --- | --- |
| `v4_sync_devices` | 工作区、设备、授权状态、配对/撤销时间 | 不保存明文密码或模型密钥 |
| `v4_sync_outbox` | 设备、操作、幂等键、集合、记录、基础版本和字段 patch | 不保存附件二进制和完整敏感上下文 |
| `v4_sync_conflicts` | 冲突字段、双方值的受控本地收件箱、处理方式和状态 | 不用最后写入静默覆盖 |
| `v4_sync_revisions` | 主机修订、游标、来源设备和时间 | 不作为学生事实副本 |
| `v4_backup_runs` | 备份触发、状态、错误码、时间和变更计数 | 不保存恢复口令或明文备份内容 |
| `v4_student_field_catalog` | 学校自定义字段名、标签、类型、选项、敏感/导入导出标志 | 不因删除目录字段而删除学生历史值 |
| `v4_student_identity_conflicts` | 无法唯一确认的学生关联待核对清单 | 不按姓名自动合并 |
| `v4_form_templates` / `v4_form_jobs` | 受支持 DOCX 模板、版本、字段、批量生成任务 | 不承诺任意 Word 自动识别或直接回写事实 |
| `v4_student_class_history` | 稳定学生 ID、原/新班级、生效日期和原因 | 不以历史记录覆盖当前事实而不留痕 |
| `v4_content_pushes` / `v4_content_reads` | 本地政策/资料/通知、范围、版本、已读和撤回 | 不共享跨部门学生明细 |
| `v4_work_categories` | 系统职责分类和学校自定义工作节点分类 | 系统基线分类不可删除或重命名 |

学生、同步和导出均继续遵循以下规则：业务关联优先使用明确的 `student_id`；当前学号和历史学号只作为兼容快照；同名不自动匹配；附件记录只保存附件 ID，照片、录音、证书和活动图片进入附件仓。联合走访是按日期派生的历史班级、住宿和课表查询，不新增事实表；缺少课表显示“未记录”，不把缺失考勤当作空闲或缺勤。

心理语音结果先存为 AI 草稿，单次授权、二次脱敏和人工确认完成前不能进入心理事实；原音频不进入业务集合、普通备份或审计。群体主题仅输出达到最小人数阈值的聚合结果，不写回学生记录。内容包导入先做版本/冲突检查，失败恢复导入前快照；工作分类只允许维护学校自定义项。

### v11 跨端状态

共享清单已经接入浏览器/离线构建、Electron 和局域网主机候选 manifest。`tests/v48-cross-platform-recovery.js` 已用脱敏夹具验证浏览器工作区、单文件离线 HTML、加密备份、手机工作包、交换包、自定义 v11 集合以及附件 ID/内容回读；这证明契约和夹具恢复链路成立，不等于真实 Windows/macOS/手机设备的 HTTPS 信任、断网重连或长期压力已经通过。

## AI 治理字段不变量（2026-08-20）

- 额度统计只认 `v4_ai_audit.action === "generate" && status === "completed"`；其他完成审计不得改变每日生成额度。
- `v4_ai_suggestions.status === "accepted"` 只有在 `human_confirmed_at` 和 `confirmation_method` 同时存在时才允许转换为任务、谈话或工作留痕。转换仍需来源存在、未变更、未删除且范围一致。
- `student_id`、`record_id`、`source_id`、`attachment_id`、`request_id`、`audit_id`、`draft_id`、`consent_id` 和来源指纹是本地关联元数据，禁止进入模型出站消息。
- 身份敏感字段的授权范围只对单次请求生效，并绑定当前学生、班级、事项、时间范围或附件；旧学号只作为兼容快照，不作为新的业务主键。
- `v4_ai_sources.kind === "web"` 的 URL 必须是清理过敏感查询参数和片段的 HTTPS 公开地址；relay 和浏览器 core 都执行相同边界检查。

上述字段增加只读审计信息，不改变既有业务事实集合；迁移和备份必须保留这些关联字段，恢复后不得把已确认状态与原始审计链拆开。

## AI 页面入口与上下文维护规则（2026-08-20）

AI 页面入口不是独立的业务事实表。新增或修改一个业务页面时，必须同时检查：`AI_CONTEXT_SPECS` 的集合和日期字段、`AI_VIEW_COLLECTIONS` 的页面映射、`AI_RECORD_ACTIONS` 的用途/标签、记录动作选择器或手动入口，以及 `target_collection`/`target_record_id` 是否能回到本地原记录。

当前已特别核对：`v4_class_schedules` 使用 `updated_at` 作为集合时间字段，`v4_dorm_assignments` 使用入住/更新时间，`v4_roll_call_sessions` 使用规范化后的 `date`。点名的 `candidate_student_ids` 和 `selected_student_ids` 只作为本地记录，出站仍按学生敏感字段规则清理。

记录级 AI 动作只生成建议或工作记录草稿；宿舍不能由 AI 自动排床，点名不能由 AI 决定随机结果，量化考评、党团、心理、纪律、资助、预警和奖惩不能由 AI 自动确认。每个新入口至少要增加一条“页面入口 -> 本地目标记录 -> 上下文/来源 -> 建议或草稿”的回归测试。完整对账见[AI 实现逐项对账](./upgrade/ai-implementation-reconciliation-2026-08-20.md)。

用途字段必须来自 `CWBAI`/`CWBAIWorkflow` 的 canonical 注册表。`risk_review`、`weekly_summary`、`monthly_summary`、`semester_summary` 和 `assistant` 仅作为历史兼容别名；建议筛选按 canonical key 去重，公共运行入口遇到非空未知用途返回 `AI_PURPOSE_INVALID`，不得静默落到其他用途。

## 交互写入与来源完整性（2026-08-20）

业务按钮的成功状态不能只由页面提示决定，必须能从持久化记录回读并在刷新后保持。工具生成结果在当前会话内使用稳定 `result_id`；科研阶段任务使用 `research_stage_<project_id>_<stage>`，并同时保存 `source_id`、`source_collection` 和 `source_stage`。同一来源重复点击只允许得到一条有效任务或留痕，进入下一阶段后才允许生成新的阶段任务。

附件业务写入遵循“附件仓写入 → 业务记录引用 → 失败回滚”的边界。业务记录只保存附件 ID；若业务记录保存失败，刚写入且没有其他引用的附件必须回滚。删除记录时要检查同一集合的共享引用，只清理孤儿附件并写入审计。历史来源附件不能因单条记录删除而被误删。

`v4_worklog_drafts` 必须保存来源集合、来源 ID、来源哈希、来源状态和最近核对时间。来源修改后草稿不可直接确认，来源仍存在时人工重新核对并刷新哈希后才可确认；来源删除后草稿永久不可归档，只能重新创建。业务记录删除、作废和附件清理都必须保持这条来源链可追溯。

这些是数据完整性契约，不是某个页面的临时实现。新增“从记录生成任务/留痕/AI 建议”按钮时必须增加稳定来源键、重复点击回归和失败重试回归；详细行为见[交互连续性审计](./upgrade/interaction-continuity-audit-2026-08-20.md)。

## v4.9.0 商业运行时凭据

商业许可证、设备注册、订单访问令牌、管理员认证和模型 API Key 属于运行时凭据，不属于 `CWBCollections` 的业务事实。许可证格式为 `CWB-LIC-1.<payload>.<signature>`，签名选择 `kid` 对应的 Ed25519 公钥；业务数据、备份、交换包、导出和普通审计不得包含 token 或完整签名载荷。

授权服务数据库只保存产品、订单、许可证、设备、支付事件摘要、邮件 outbox、更新清单和审计元数据。服务端不保存学生记录、业务附件、AI 输入或模型 Key。订单幂等键、webhook 事件 ID、设备主键和许可证编号必须有唯一约束；同一字段冲突或重复支付事件不能产生第二份许可证。

更新清单是独立的 `cwb-update-manifest-1` 文档，平台包必须有 HTTPS 地址、SHA-256、包签名和清单签名。安装更新不改变业务 schema，更新前创建恢复点，失败时回滚程序/数据状态；许可证更新权益只决定可用更新范围，不进入学生事实。

### v4.9.0 授权服务交付字段

授权服务数据库不属于 `CWBCollections`，与学生工作区迁移、备份和交换包分开维护。`cwb_orders.access_token_expires_at` 是订单取件凭证的服务端过期时间，当前新订单默认有效 7 天；旧数据库记录缺少该列时按 `created_at + 7 天` 兼容计算，无法得到可靠创建时间的记录直接拒绝取件。取件过期返回 `ORDER_ACCESS_EXPIRED`，订单号本身永远不能替代访问令牌。

订单访问令牌由独立 `CWB_ORDER_ACCESS_SECRET` 对幂等键派生，数据库只保存 SHA-256 哈希和过期时间；普通订单查询返回状态、产品和非敏感许可证摘要，许可证 token 只在同一访问令牌通过校验且订单已完成签发时由 `.cwb-license` 下载接口返回。下载响应使用 `Cache-Control: no-store`，审计只保存订单/许可证编号和动作，不保存 token 内容。

客户服务 HTTP 层的 CORS 不是默认开放能力。生产只允许部署配置中的完整 HTTPS 来源，禁止通配符、非本地 HTTP、路径、查询、片段和凭据；非法来源返回 `LICENSE_CORS_ORIGIN_NOT_ALLOWED`。订单交付、支付验真未配置、邮件和更新清单存储不可用分别返回可诊断的 503 错误码，避免把服务端故障伪装成用户输入错误。

## AI 输出与健康报告契约（v4.7.1）

AI 生成结果仍属于建议/草稿，不属于业务事实。`CWB.ai.run()` 在模型响应成功后、写入 `v4_ai_drafts` 和 `v4_ai_suggestions` 之前执行二次输出脱敏：内部 `student_id`、业务记录 ID、附件 ID、审计/请求/建议索引不出现在结果中；未授权身份和联系方式也不出现在结果中。当前范围的身份/联系方式经过一次性授权后可以保留允许字段，但不改变内部 ID 永不出站的规则。

`v4_ai_audit.output_redacted` 是布尔审计字段，表示模型返回文本是否经过本地二次清理。它不保存原始模型响应，也不改变现有 `request_id`、`draft_id`、`suggestion_id` 和来源链。迁移、备份、恢复和交换包必须保留该字段；旧记录缺少该字段时按 `false` 兼容读取。

`CWB.ai.health()` 是只读派生报告，不新增事实集合。报告包含 `status`、`checks`、`missing_collections`、`missing_views`、`providers`、`unavailable_purposes`、`source_review_count`、`pending_suggestions` 和 `pending_drafts`。它可以反映当前工作区 AI 接入状态，但不能替代真实模型质量、人工安全审核、设备恢复测试或发布验证。

## 2026-08-21 保存队列与草稿同步不变量

`save(part)` 的返回值是可等待的保存结果；调用方必须等待 `awaitTrackedSave()` 或等价的业务事务 Promise，不能在发起同步后立即把成功状态写入页面。保存失败时，内存回滚和待同步标记必须保留，便于当前按钮重试。

基础集合保存如果触发 `v4_worklog_drafts` 来源复核，必须同时写入并同步 `custom` 集合。显式删除/作废来源产生的草稿状态变化使用待同步版本标记，只有基础集合与 `custom` 同时成功后才清除。这样 v8 工作区、IndexedDB/兼容镜像和页面内存不会出现“页面显示已过期、重载后又恢复草稿”的分叉。

来源指纹至少覆盖会改变工作事实的 `note`、`findings`、`measures`、`inspection_target`、`location`、`visit_type`、`priority`、`due` 以及既有日期、结果、状态字段；基础保存批量刷新的 `updated_at` 属于存储元数据，不参与指纹。新增来源字段如果能改变工作记录含义，必须同步加入指纹并补充“修改后不可直接归档”的回归测试。

## AI provider readiness 与审计字段（2026-08-21）

`v4_ai_audit.provider_id` 是可选的非敏感模型连接标识。成功生成审计用它与 `purpose` 组成额度统计范围；旧审计缺少该字段时按 `provider` 和 `model` 兼容读取。它不保存 API key、relay 令牌、请求原文或模型原始响应。

`CWBAI.providerReadiness()` 和 AI 健康卡只返回当前运行时派生状态，不写入 `v4_ai_readiness` 或其他新集合。`secret_set` 不是当前浏览器密钥本身，普通浏览器必须能从当前会话读取凭据；Electron 最终以安全存储读取结果为准。readiness 失败不会改变学生、任务、谈话或其他业务事实。

## v4.8.0 数据契约设计与发布状态

v4.8.0 把业务 `data_schema_version` 从 10 增量到 11，工作区协议仍保持 `schema_version:8`，另设 `sync_protocol_version:1`。迁移只新增集合和可选字段，迁移前创建恢复点，旧导入格式和历史版本继续可读；v4.7.1 数据按迁移规则兼容读取。

v4.8.0 新增的本地集合包括：`v4_sync_devices`、`v4_sync_outbox`、`v4_sync_conflicts`、`v4_sync_revisions`、`v4_backup_runs`、`v4_student_field_catalog`、`v4_student_identity_conflicts`、`v4_form_templates`、`v4_form_jobs`、`v4_student_class_history`、`v4_content_pushes`、`v4_content_reads` 和 `v4_work_categories`。所有集合已由共享清单进入浏览器 IndexedDB、离线 HTML、Electron、局域网主机、备份恢复和换机边界；逐集合真实跨端恢复仍列为发布后抽查。

学生导入采用 `student_id`、当前学号、历史学号、人工确认的身份优先级；姓名不自动匹配。空白字段默认保留原值，明确勾选清空后才允许清除已有字段。导入核心保留差异预览、恢复点和撤销契约；学生台账的批量编辑、归档、删除和一次撤销页面已交付，真实学校大名单和跨端人工验收继续作为维护抽查。

同步记录不得直接保存附件二进制；业务记录仍只保存附件 ID。主机正式附件和断点上传临时分块使用 AES-256-GCM 加密落盘，授权下载才解密到当前会话。同步操作必须包含工作区、设备、幂等键、基础版本和字段 patch。不同字段修改可以合并，同字段修改保留双方值并进入冲突收件箱。

### v4.8.0 发布状态

截至 2026-08-22，`src/core/v11-migration.js`、`src/core/cwb-v48.js`、`src/core/cwb-collections.js` 和 `desktop/lan-sync.cjs` 已实现 v10 到 v11 的迁移/服务核心，`data_schema_version:11` 已用于 v4.8.0/v4.8.1/v4.8.2 备份、交换包和局域网 manifest。v4.8.2 Tag、私有 Release 和正式资产证据见[发布收尾记录](./upgrade/release-v4.8.2.md)；迁移前恢复点和逐集合跨端读写仍是运行维护时的抽查要求。

已发布新增集合为：

| 集合 | 当前状态 | 备注 |
| --- | --- | --- |
| `v4_sync_devices` / `v4_sync_outbox` / `v4_sync_conflicts` / `v4_sync_revisions` | 主机核心、Electron 记录适配、客户端持久化队列、冲突收件箱 UI 和附件传输接口随 v4.8.0 发布 | 手机真实 HTTPS 证书信任/自动发现和长时间压力测试属于发布后抽查 |
| `v4_backup_runs` | 已进入 manifest/迁移契约；成功备份写入最多 50 条最小运行记录，且不计入业务变更阈值 | 逐集合恢复实测属于发布后维护抽查 |
| `v4_student_field_catalog` / `v4_student_identity_conflicts` | 字段目录、身份导入核心、学生字段中心和批量维护 UI 随 v4.8.0 发布 | 真实学校大名单和逐字段实机回读属于发布后抽查 |
| `v4_form_templates` / `v4_form_jobs` | 模板中心、版本/占位符记录、缺失字段预览、受支持 DOCX 生成和内容控件反向 CSV 汇总随 v4.8.0 发布 | 任意 Word 自动识别和反向结果自动写回明确不支持；跨端附件回读属于发布后抽查 |
| `v4_student_class_history` | 集合、迁移、动态分班页面和日期/班级联合走访查询随 v4.8.0 发布，变更同步当前学生班级 | 大名单压力和跨端恢复属于发布后抽查 |
| `v4_content_pushes` / `v4_content_reads` / `v4_work_categories` | 本地内容服务、范围发布、角色可见性、已读/撤回、内容包导入导出和系统/自定义分类页面随 v4.8.0 发布 | 角色是本地策略标签，不等于账号认证；跨端协作压力属于发布后抽查 |

桌面端备份计划在工作台运行期间每 60 秒检查一次，但只在日期或变更量达到阈值时写入加密文件；成功结果写入最多 50 条 `v4_backup_runs` 最小记录，记录不增加业务变更计数；浏览器关闭期间不能后台写文件。`CWBV48.createRemoteBackupAdapter()` 与候选页面已提供用户明确触发的 HTTPS/WebDAV 加密 `.cwbk` 测试连接、上传、下载预览恢复和删除，凭据不写入设置；真实服务商互操作和真实恢复抽查仍待验收。局域网主机使用 HTTPS、证书指纹、一次性配对和幂等操作，局域网本身不视为安全边界。详见[局域网同步与存储记录](./upgrade/lan-sync-and-storage-v4.8.0.md)。

### 内容推送与工作留痕来源契约（2026-08-21）

`v4_content_pushes` 的 `scope` 可包含 `workspace_id`、`college`、`grade`、`class_name`，`audience_roles` 只允许 `workspace_admin`、`content_editor`、`teacher`、`viewer`。这些角色是当前本地工作区的策略标签，不是登录认证或跨部门授权。页面读取、标记已读和普通角色导出必须传入当前上下文；核心服务拒绝跨范围的已读操作，管理员导出可以覆盖全量内容。

工作留痕和 `v4_worklog_drafts` 的导出可以包含 `source_collection`、`source_id`、`source_label`、`source_state`、`source_updated_at`。导出包的顶层 `provenance` 是记录 ID 到来源记录的回链快照；来源状态为 `deleted` 或 `changed` 时只用于提示重新核对，不能被解释为来源内容仍然权威。来源回链不包含 API key、完整 AI 请求、附件二进制或未选择导出的敏感字段。

### 2026-08-21 候选安全契约补充

数据目录迁移的路径参数必须是非空字符串，且目标不能是磁盘根目录、当前目录、当前工作区内部路径或文件；迁移事务在候选 SQLite 通过 `verifyPayloads` 后才激活。远程备份端点不是任意 URL：它必须是 HTTPS 基址下的相对路径，拒绝绝对 URL、查询参数和目录穿越；该限制属于传输契约，不是 UI 提示，可由核心服务直接拒绝。

局域网配对信息包含地址、一次性 `pairing_id`、短期 `code`、过期时间和证书指纹。配对信息不等于授权令牌，最终授权仍由主机确认；v4.8.0 提供二维码和手动录入两种方式，但客户端仍须人工核对指纹，自动发现未启用。上述字段不进入学生业务记录，配对和设备撤销只写最小本地审计元数据。

## v4.8.0 同步提交契约补充（2026-08-21）

`createSyncHost()` 的 `persist(snapshot)` 是同步状态的原子提交边界。配对、设备、操作、修订和冲突状态在提交前保存快照；持久化抛错后必须恢复快照。若配置了 `recordStore`，主机在写入业务记录前记录旧值；Electron 生产适配器提供 `get/put/delete`，已有记录回写旧值，新记录调用 `delete`。

事务审计也遵循同一提交边界：`audit` 事件在事务内暂存，只有 `persist(snapshot)` 成功且业务记录没有抛错后才发出；失败时不产生“已接受、已确认、已解决或已撤销”的成功审计。

同步仓储适配器的最低契约：

```text
get(collection, id) -> record | null
put(collection, record) -> record
delete(collection, id) -> boolean
```

缺少 `delete` 的仅内存/规模测试适配器可以验证协议，但不能作为需要新记录失败回滚保证的生产主机适配器。同步记录继续禁止保存附件二进制，附件通过独立分块接口和附件 ID 关联。

传输契约要求客户端先完成 HTTPS 基址、URL 凭据/查询/片段和证书指纹校验，再执行 fetch；错误码必须保持为 `SYNC_HTTPS_REQUIRED`、`SYNC_BASE_URL_INVALID` 或 `SYNC_CERTIFICATE_FINGERPRINT_REQUIRED`，不得被网络异常处理器改写为 `SYNC_NETWORK_UNAVAILABLE`。配对码为 8 位数字，5 次错误后返回 `SYNC_PAIRING_RATE_LIMITED`。

v4.8.0 客户端同步接口补充为：`requestPairing()`保存 `pairing_request_id`；`pollPairing()`调用 `/api/v1/pairing/result`一次性领取令牌；`syncNow()`先提交离线队列再拉取修订；`startAutoSync()`/`stopAutoSync()`控制当前会话的定时检查。状态可包含 `queued`、`cursor`、`conflicts`、`last_error`、`auto_sync`和`next_sync_at`，这些字段不包含令牌。

主机公开设备状态只允许 `id`、`name`、`status`、配对/连接时间等元数据；`token_hash`只存在加密主机状态内部，不能出现在健康接口、普通 UI 状态、备份导出或审计详情。设备状态为 `active`、`paused`或`revoked`；暂停和撤销会在所有需要设备认证的同步/附件路由生效。

## 2026-08-21 IndexedDB 大批量学生存储契约

浏览器端大批量学生替换使用 `replaceManyAtomic()` 的单条原子载荷模式：物理集合 `records_students` 保存稳定 ID `__cwb_bulk_students__`、`records_json` 以及存储元数据；旧版分块载荷 `__cwb_bulk_students__:N` 仍可读取。该载荷是持久化实现细节，不是业务学生记录。

业务代码、导入恢复和页面统计必须通过 `CWB.repositories.students.list()`、`get()` 和 `count()` 读取逻辑学生集合。不能直接把 IndexedDB 原始 `getAll()` 的行数当作学生人数，也不能删除或改写载荷记录来“清理单个学生”。仓储会在替换、删除、刷新和重新打开时解包，并在下一次原子替换时重新提交完整载荷；普通单条保存仍按学生 ID 更新逻辑集合。

`tests/v8-canonical-idb-browser.js` 同时验证两层契约：真实 IndexedDB reopen 后原子载荷仍只有一个稳定存储记录，仓储 API 解包后仍返回全部 1,200 条学生。这样可以同时防止半写入和底层实现变化导致的错误统计。

## v4.8.0 局域网二维码载荷契约

桌面端二维码使用 `cwb://lan-pair` URI。载荷只允许以下字段：`v`、`host`、`workspace_id`、`pairing_id`、`code`、`fingerprint`、`expires_at`。其中 `host` 必须是无凭据、无查询和无片段的 HTTPS 根地址；`code` 必须是 8 位数字；`expires_at` 必须是未来时间；其他字段由核心服务做长度和字符校验。

`CWBV48.createPairingQrPayload()` 只从白名单字段构造载荷，`CWBV48.parsePairingQrPayload()` 拒绝重复字段和未知字段。二维码中不得出现设备令牌、`token_hash`、主密钥、API key、学生姓名/学号、`student_id`、业务记录 ID、附件 ID 或完整同步补丁。二维码内容属于短期配对秘密，界面不写入普通设置、备份或交换包；生成和使用只写最小审计元数据。

二维码扫码只替代手工抄录，不替代证书指纹核对和主机人工确认。自动发现、自动证书信任和手机真实扫码兼容性不属于当前数据契约的已验收范围。

## 2026-08-22 当前发布事实

证书识别只有一个正式页面入口：附件逐次授权后，模型结果先进入 v4_ai_drafts，人工选择学生并确认字段后才写入 rewards。建议中心批量查看和驳回使用同一建议与审计快照事务；批量保存失败时恢复整批内存状态。页面按钮的状态变化不能作为数据契约证据，必须同时等待 CWB_V4_SYNC、Electron 或 IndexedDB 的真实保存结果。

v4.8.2 继续使用 `schema_version:8`、业务 `data_schema_version:11` 和 `sync_protocol_version:1`；详细集合、兼容和发布边界见[当前收口总账](./upgrade/closeout-status-2026-08-22.md)。AI 授权、审计、来源、草稿和建议的跨集合保存，以及局域网队列/游标保存，必须在实际持久化完成后才返回成功；失败不得留下孤立的“已完成”审计、建议、队列或游标。该规则已由 `tests/ai-output-health.js`、通知解析回归和 `tests/v48-sync-persistence.js` 覆盖。

## 2026-08-22 AI 公共写入完成契约

为兼容历史同步调用，`CWB.ai.suggestions.create/feedback/accept/reject/viewed/reviewMany/convert` 和 `CWB.ai.consents.authorize` 仍返回当前对象或结果对象，但返回值现在带有非枚举的 `ready` Promise 和 `persistence_state` 状态。状态可为 `pending`、`committed`、`failed` 或 `not_requested`；调用方必须在需要确认落盘时等待 `result.ready`，或调用 `CWB.ai.awaitMutation(result)`。

同时提供 `createAsync`、`feedbackAsync`、`acceptAsync`、`rejectAsync`、`viewedAsync`、`reviewManyAsync`、`convertAsync`、`authorizeAsync` 和 `notice.confirmAsync`。异步接口只在实际保存成功后 resolve；保存失败先执行既有内存快照回滚，再 reject。`persist:false` 只允许内部组合事务使用，表示尚未请求持久化，不能向用户显示“已保存”。

页面按钮优先等待返回对象自身的 `ready`，不再依赖全局 `__CWB_LAST_SAVE_PROMISE__` 作为唯一成功依据；全局变量仅保留为旧页面和兼容动作的过渡桥。新增公共写入接口必须补充成功、失败、取消、重试和刷新回读测试。
