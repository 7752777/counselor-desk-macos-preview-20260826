# AI 实现逐项对账与收口记录（2026-08-20）

更新时间：2026-08-20  
工作分支：`codex/ai-upgrade`  
历史发布基线：`v4.7.0`  
当前候选：维护分支 `codex/ai-upgrade`，尚未正式发布，未创建新 Tag/Release，未重新部署 Pages

这份记录用于解决“计划写了、页面看见了，但链路是否真的打通”无法长期判断的问题。判断顺序为：当前源码和定向测试 > 当前工作区构建结果 > 审计文档 > 历史 Release 说明。它不把历史版本的发布证据写成当前候选已经上线。

## 结论

- AI 基础治理已经真实落地：provider、用途授权、额度、超时/取消、relay、SSRF、请求/响应大小、出站脱敏、字段级一次性授权、审计、来源状态、建议状态机和跨端集合均有代码与测试证据。
- AI 页面融合已经落地到学生、谈话、任务、成绩、帮扶、预警、心理、资助、就业、资料、党团、班委、住宿、家校、科研、查课、查寝、量化、竞赛、通知和班级分析等业务范围。
- 本次重新对账发现并补齐三个记录级缺口：班级课表周视图、当前住宿安排、已保存随机点名结果。它们现在都能绑定 `target_collection` 和 `target_record_id`，并进入本地上下文和来源回链。
- 随机点名上下文的日期字段已从不存在的 `call_date` 修正为规范化后的 `date`，日期范围筛选不再静默漏掉点名记录。
- “AI 有按钮”不等于“真实模型质量已证明”。真实模型中文质量、图片识别质量、学校政策口径、长期设备压力和教师满意度仍需人工验收。

## 功能链路对账

| 链路 | 具体能力 | 当前状态 | 证据/限制 |
| --- | --- | --- | --- |
| 模型配置 | provider、模型、用途白名单、启停、每日额度、连接测试 | 已完成 | `src/core/cwb-ai.js`、`src/core/cwb-ai-workflow.js`；连接测试不携带业务上下文 |
| 模型协议 | OpenAI-compatible、Anthropic、Gemini、视觉消息转换 | 已完成 | 图片只允许具备视觉能力且经过附件授权的 provider |
| 中转 relay | 来源限制、HTTPS、允许域名、SSRF/DNS、超时、请求/响应限制 | 已完成 | `scripts/ai-relay.js`；不把密钥写入日志、备份或审计 |
| 上下文 | 当前学生、班级、事项、日期范围、页面、跨模块集合和选定来源 | 已完成 | 最多 240 条；返回 `requested/eligible/matched/truncated/context_limit` |
| 脱敏 | 默认移除姓名、学号、联系方式、心理、纪律、资助、预警、重点和附件敏感字段 | 已完成 | 内部 ID、附件 ID、审计 ID、指纹不出站；授权只对当前请求有效 |
| 来源 | 本地记录、资料、用户主动提供的公开 HTTPS 网页、核验状态、引用片段、更新时间和指纹 | 已完成 | 失效、变更、删除或超过 30 天未核验的网页来源不能进入新请求 |
| 建议中心 | 草稿、待审核、已查看、已采纳、转任务/谈话/留痕、驳回、反馈和去重 | 已完成 | 高风险/敏感建议必须有人工确认时间和确认方式 |
| 工作记录 | 谈话、家校联系、任务、活动、查课、查寝、通知转化生成待确认草稿 | 已完成 | 确认前不写入正式事实；来源变化后必须重新核对 |
| 页面级入口 | 各业务页提供当前页 AI 操作 | 已完成 | 通讯录、备份、访问审计、照片页不显示泛化 AI 上下文入口 |
| 记录级入口 | 具体学生、任务、业务档案、就业、住宿、科研、查课查寝、竞赛等记录绑定 AI | 已完成 | 本次补齐课表、当前住宿、已保存点名记录 |
| 跨端保存 | 浏览器 IndexedDB、离线 HTML、Electron、备份恢复、手机交换包 | 已完成 | 新增 AI 集合沿用统一集合清单和 v10 边界 |

## 页面与记录级入口矩阵

| 页面/记录 | AI 用途 | 目标集合 | 当前入口 | 自动写入事实 |
| --- | --- | --- | --- | --- |
| 学生台账/画像 | `student_summary`、`student_followup` | `students` | 当前学生选择器、学生行动作 | 否 |
| 谈心谈话 | `talk_brief`、`talk_note` | `talks` | 当前页和谈话记录动作 | 只生成草稿 |
| 任务/工作留痕 | `task_plan`、`workday_actions`、`work_summary` | `tasks`、`worklogs`、`v4_worklog_drafts` | 当前页、记录级动作、建议中心 | 否 |
| 成绩/学业/帮扶 | `academic_support`、`class_summary` | `grades`、`v4_academic_terms`、`v4_assessment_entries` | 学生行和班级聚合动作 | 否 |
| 心理/预警/重点/资助/纪律 | `care_followup`、`warning_assist`、`record_completeness` | 对应业务集合 | 页面和记录级动作 | 不生成诊断、结论或认定 |
| 党团/班委 | `organization_checklist`、`committee_evaluation_draft` | `v4_party_cases`、`v4_league_cases`、`v4_positions`、`v4_committee_evaluations` | 流程/任职/考核动作 | 不生成审批或最终等级 |
| 住宿 | `dorm_conflict` | `v4_dorm_buildings`、`v4_dorm_rooms`、`v4_dorm_batches`、`v4_dorm_assignments`、`v4_dorm_transfers` | 楼栋、房间、批次、当前安排、调宿历史 | 不自动排床或调宿 |
| 科研 | `research_checklist` | `v4_research_projects` | 项目记录动作 | 不改变审批状态 |
| 查课/查寝/点名 | `worklog_draft`、`dorm_conflict` | `v4_class_checks`、`v4_dorm_inspections`、`v4_dorm_exceptions`、`v4_roll_call_sessions` | 记录动作；点名历史可回链 | 不替代教务或人工复核 |
| 课表 | `workday_actions` | `v4_class_schedules` | 周视图、列表、移动卡片的课表记录动作 | 否 |
| 通知 | `notice_capture`、`notice_rewrite` | `v4_ai_sources`、`v4_ai_suggestions`、`v4_worklog_drafts` | 主动粘贴/文本导入、双栏编辑 | 只在确认后转草稿 |
| 就业/竞赛/资料 | `employment_coach`、`competition_coach`、`knowledge_search` | 对应资源集合 | 资源、意向、联系、竞赛、资料动作 | 否 |
| 个人通讯录 | 无泛化上下文动作 | `v4_contacts` | 普通本地增删改查 | 不自动上传或关联学生 |

## 本次代码收口

1. `index.html` 的 `AI_RECORD_ACTIONS` 增加 `v4_class_schedules`，登记 `schedule-edit` 选择器和集合映射。
2. 记录动作宿主增加 `article.schedule-entry`，保证课表默认周视图也能显示 AI 操作，不只在列表表格和移动卡片显示。
3. `src/core/cwb-v46-ui.js` 在当前住宿表增加 `v4_dorm_assignments` 记录级“AI 住宿检查”，不改变排宿确认和住宿事实。
4. `src/core/cwb-v47-ui.js` 增加已保存点名结果列表，并为 `v4_roll_call_sessions` 记录绑定“AI 点名留痕”。
5. `AI_CONTEXT_SPECS` 将随机点名日期字段改为规范化记录的 `date`。
6. `tests/ai-cross-module-audit.js` 增加课表、当前住宿、点名历史入口和点名日期范围回归断言。

## 已完成、部分完成与未完成

### 已完成

- AI 运行治理、跨模块上下文、敏感字段授权、出站安全、来源核验、建议状态机、建议转化和审计链。
- AI 结果在页面内可被查看、编辑、驳回、采纳或转为任务/谈话/留痕；高风险业务不自动修改事实。
- 业务记录使用 `student_id` 作为本地关联主键，学号仅保留兼容快照。
- AI 集合进入浏览器、离线 HTML、Electron、备份和手机交换边界。
- 课表、住宿当前安排和点名历史的记录级目标绑定已补齐。

### 部分完成

- 真实模型输出质量尚未建立脱敏固定样本和人工评分基线；自动化测试使用模拟 sender。
- 页面级入口覆盖已完整，但部分页面只有通用“材料完整性/工作建议”提示，仍可继续按学校工作场景细化 prompt 和结果卡片。
- 来源检索是关键词和用户主动抓取，不是向量知识库；网页来源有 30 天核验期限，但学校制度仍需人工核验。
- 建议去重是确定性键，不是语义相似度去重；目前没有多人审核队列和角色权限。

### 未完成/外部依赖

- 重点学生锁仍是“防误看”，不是数据库级加密；真正加密、密钥生命周期和加密备份需独立高风险批次。
- 历史已经暴露的 API key 必须由密钥所属服务商账户持有人撤销、轮换；本地代码不能代替账户操作。
- 真实手机触控、Electron 长时间运行、大附件恢复压力和真实模型图片识别仍需受控设备人工验收。
- 仓库已设为私有，但当前候选尚未提交/推送/发布；仓库私有后历史 Pages 地址不可作为当前在线入口。

## 验证记录

本次代码修改后已执行：

```text
node --check src/core/cwb-v46-ui.js
node --check src/core/cwb-v47-ui.js
node tests/ai-cross-module-audit.js
node tests/ai-record-actions.js
pnpm test:cwb-ai
pnpm test:v47
pnpm lint
pnpm check:public
pnpm check:secrets
git diff --check
pnpm build:release
pnpm test:release
```

上述命令均通过。`pnpm test:cwb-ai` 包含 AI 全套治理、来源、出站、建议、跨模块和集合目录回归；`pnpm test:v47` 包含 v4.7 核心/UI/视觉契约；构建和发布契约也通过。`node --check index.html` 不作为验证命令，因为 Node 不支持直接解析 `.html` 扩展名；HTML 内联脚本由项目 lint、构建和 JSDOM/浏览器测试验证。

本候选的完整 `pnpm test` 已实际运行约 904 秒后以退出码 `124` 超时，过程中没有捕获断言失败输出；因此不能记为全量通过，也不能用“没有捕获断言失败”替代通过。原串行测试拆成核心导入/v4.5、AI/Electron、工作区/备份/交换三组后均退出码为 0；在最终发布前仍需针对最终代码重新执行完整门禁，若再次超时必须保留退出码和分组替代验证记录。

没有启动独立审查代理：本次改动集中在 AI 记录入口和上下文字段，由实现代理批量自检并用跨模块测试验证。没有进行哈希检查：本次没有生成正式发布物或传输文件。

## 维护规则

以后新增 AI 页面或集合必须同时完成：

1. 在用途注册表和风险表中登记用途；
2. 在 `AI_CONTEXT_SPECS` 和视图集合映射中登记上下文来源；
3. 在 `AI_RECORD_ACTIONS`、选择器/手动入口和目标集合映射中登记记录级动作；
4. 明确敏感字段、来源引用、人工确认和禁止自动修改的边界；
5. 把新增集合接入备份、迁移、Electron、离线包和手机交换；
6. 增加至少一条“页面入口 -> 本地目标记录 -> 上下文/来源 -> 建议/草稿”的回归测试；
7. 文档同时写明已完成、部分完成、外部依赖和不能由自动化替代的验收项。

## 2026-08-20 用途注册表收口

- `index.html` 的主用途选择器已补齐 canonical `warning_assist`（预警辅助分析）和 `certificate_recognition`（证书识别草稿）。旧的 `risk_review`、`weekly_summary`、`monthly_summary`、`semester_summary` 和 `assistant` 仍作为兼容别名接受，但建议中心筛选会按 canonical key 去重展示。
- `aiGovernedPurpose()` 现在依赖 `CWBAIWorkflow.canonicalPurpose()` 和正式用途注册表；非空且未登记的用途直接返回 `AI_PURPOSE_INVALID`，不会静默变成 `work_summary`。这条规则防止新增页面拼写错误后绕过 provider 用途授权和审计口径。
- `tests/ai-workflow-ui.js` 已增加未知用途失败和主工作台 canonical 用途选项断言。

## 2026-08-20 输出安全与健康检查回归

- 模型返回文本在生成审计、草稿和建议写入前统一经过 `aiSanitizeGeneratedOutput()`；未授权身份/联系方式和本地记录索引不会从模型回显进入持久化结果，明确授权只放行当前范围允许的身份字段。
- `v4_ai_audit.output_redacted` 记录是否发生二次输出清理，便于区分“模型原文返回”与“本地安全处理后的结果”。原始响应不写入审计。
- `CWB.ai.health()` 和 AI 工作台健康卡片检查核心运行时、用途合同、六类 AI 集合、页面级入口、模型配置、来源待核验数量和审核队列；入口函数缺失会被报告为 `missing_views`。
- 新增 `tests/ai-output-health.js`，验证未授权回显、当前学生授权、内部 ID 清理、草稿/建议落库、审计字段和健康卡片渲染。

本次完整 AI 定向命令 `pnpm test:cwb-ai` 实际退出码为 0，包含 15 个用例；首次完整 `pnpm test` 的失败来自 `tests/import-loop.js` 旧事件分发器变量名静态匹配，修正后完整测试退出码为 0。当前候选准备推送到私有仓库的 `codex/ai-upgrade` 分支，仍未正式发布。

## 2026-08-20 最终全量门禁

最终代码状态已通过 `pnpm test`、`pnpm lint`、`pnpm build:release`、`pnpm check:public`、`pnpm check:secrets`、`pnpm test:release` 和 `git diff --check`。本次推送不生成正式发布附件，因此不计算发布哈希；正式发布仍需新版本 Tag、Release、平台构建和受控网页部署证据。
