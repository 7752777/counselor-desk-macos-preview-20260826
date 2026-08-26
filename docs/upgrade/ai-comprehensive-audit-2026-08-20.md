# AI 全面收口审计（2026-08-20）

更新时间：2026-08-20  
工作分支：`codex/ai-upgrade`  
历史发布基线：`v4.7.0`  
当前状态：源码和最终门禁已收口；当前候选尚未正式发布

本记录是 2026-08-19 两份 AI 审计的补充事实源。判断顺序为：当前源码与测试 > 当前工作区构建配置 > 本记录 > 历史 Release 记录。它不把历史 `v4.7.0` 的 Release、Pages 或 Actions 证据写成当前候选已经上线。

## 版本与仓库边界

- GitHub 仓库 `7752777/counselor-desk` 已设为私有，历史 Tag/Release 保留；仓库私有降低源码直接暴露风险，但不等同于数据库、终端、备份或附件仓加密。
- 历史 `v4.7.0` Release 仍是版本基线；仓库私有后原 GitHub Pages 地址返回 404，不能作为当前在线入口。
- 当前工作区包含 AI 安全和 UI 收口修改，`package.json` 仍为 `4.7.0`，因此不能把当前候选称为新的正式版本。
- 当前候选尚未创建新 Tag/Release、生成正式新离线/桌面附件或部署新的 Pages。

## 逐项落地核对

| 领域 | 当前实现 | 自动化/代码证据 | 结论 |
| --- | --- | --- | --- |
| provider 与用途 | provider 白名单、用途白名单、用途别名、停用模型、每日成功调用额度 | `src/core/cwb-ai.js`、`src/core/cwb-ai-workflow.js`、`tests/cwb-ai-governance.js` | 已落地 |
| 模型协议 | OpenAI-compatible、Anthropic、Gemini；视觉消息按 provider 能力校验，Anthropic 图片转换为 `image`/`base64` 消息 | `buildChatRequest()`、`sendChat()`、`tests/cwb-ai-hardening.js` | 已落地 |
| relay | 同源/受控中转、来源限制、允许模型域名、HTTPS、重定向、响应体和超时限制 | `scripts/ai-relay.js`、`tests/ai-relay.js`、`tests/cwb-ai-relay-runtime.js` | 已落地 |
| SSRF 边界 | IPv4 私网/保留网段、IPv4-mapped IPv6、ULA、链路本地、文档网段、6to4 私网映射 | `isPrivateAddress()`、`isPrivateHostname()`、工作流来源校验 | 已落地 |
| AI 上下文 | 当前学生、班级、页面、目标事项、日期范围、选定来源、跨模块集合，240 条上限和截断统计 | `CWB.ai.context.build/preview()`、`tests/cwb-ai-context.js` | 已落地 |
| 学生范围 | 结构化记录和来源均按稳定 `student_id` 校验；只有学号快照时先解析稳定 ID；跨学生直接拒绝 | `aiValidateWorkflowContext()`、`aiValidateWorkflowSources()`、`tests/ai-source-integrity.js` | 已加固 |
| 敏感授权 | 分类级和字段级授权，绑定学生/班级/页面/事项/日期范围；15 分钟有效、单次消费 | `v4_ai_consents`、`aiConsentForRequest()`、边界测试 | 已落地 |
| 出站脱敏 | 默认脱敏姓名、学号、身份证、电话、邮箱、家庭、心理、纪律、资助、预警、重点和附件；内部 ID、附件 ID、审计索引、请求索引和来源指纹始终不出站 | `aiOutboundContext()`、`aiSanitizeMessages()`、`tests/ai-egress-contract.js` | 已落地 |
| 授权联系方式 | 明确授权 `contact` 后保留手机号；通用数字身份规则不会再次把已授权手机号遮掉；未授权仍脱敏 | 2026-08-20 修复、`tests/ai-governance-boundaries.js` | 已修复 |
| 来源链 | 本地资料优先；本地来源有稳定 ID、集合/记录回链、指纹和更新时间；网页来源需用户主动触发、HTTPS、公开地址、核验状态和引用片段 | `v4_ai_sources`、`ai-source-directory`、`ai-source-integrity` | 已落地 |
| 来源新鲜度 | 记录修改、删除、缺指纹、学生范围不符或网页失效时，禁止继续生成或转化 | `aiValidateWorkflowSources()`、建议来源状态检查 | 已落地 |
| 来源大小 | 浏览器按 UTF-8 字节限制；relay 同时限制请求、响应和来源正文 | `utf8ByteLength()`、relay 测试 | 已落地 |
| 直连响应安全 | 非 relay 请求也在解析 JSON 前检查 `content-length`/UTF-8 字节上限；超限和非法 JSON 使用安全错误码 | `readJsonPayload()`、`tests/cwb-ai-hardening.js` | 已加固 |
| 取消竞态 | 外部 AbortSignal 在响应体读取后再次检查；服务端已返回但请求已取消时不生成成功审计、草稿或建议 | `sendChat()`、`aiWorkflowRun()`、`tests/cwb-ai-hardening.js` | 已加固 |
| 消息结构清洗 | 公共运行入口只保留角色、文本和合法 `data:image/png|jpeg|jpg|webp`；未知结构字段和内部索引不出站 | `aiSanitizeMessages()`、`tests/ai-egress-contract.js` | 已加固 |
| 建议中心 | 草稿、待审核、已查看、已采纳、已转任务/谈话/留痕、已驳回；确定性键去重；批量查看/驳回不写事实 | `CWB.ai.suggestions.*`、`tests/ai-contract.js` | 已落地 |
| 人工确认 | 高风险和敏感建议必须人工采纳；转换后保留建议、草稿、来源、生成审计和确认审计 | `aiSuggestionConvert()`、工作总结/证书测试 | 已落地 |
| 通知 AI | 老师主动粘贴/导入；模型不可用时本地规则降级；保存哈希、证据、fallback 原因；取消不会错误降级 | `CWB.ai.notice.*`、`tests/ai-source-integrity.js`、出站测试 | 已落地 |
| 证书识别 | 图片先进入附件仓和草稿；附件授权绑定 source attachment；人工选择学生和核对字段后写奖惩 | `createCertificateDraft()`、`confirmCertificateDraft()` | 已落地 |
| 工作留痕 | 工作总结、谈话、家校、任务、查课、查寝、活动和通知转化都走草稿/确认链 | `v4_worklog_drafts`、`CWB.ai.confirmWorkSummary()` | 已落地 |
| 审计与指标 | 记录 request、用途、模型、范围、授权、来源、耗时、失败码、建议/草稿关联、确认链和截断状态；连接测试不带业务上下文；建议质量反馈按最新值统计 | `v4_ai_audit`、`metrics.summary()`、`suggestions.feedback()`、provider test | 已落地 |
| 建议质量反馈 | 建议详情提供“有帮助 / 需要修改 / 不适用”；反馈只写既有 AI 审计，不保存原文、不改变业务事实，并按用途汇总 | `suggestion_feedback` 审计、`feedback_by_value`、`feedback_by_purpose`、`tests/ai-contract.js` | 已落地 |
| 跨端集合 | AI provider/audit/draft/suggestion/source/consent 随统一集合清单进入 IndexedDB、离线 HTML、Electron、备份和手机交换包 | `src/core/cwb-collections.js`、v8/v10 迁移测试 | 已落地 |
| 页面融合 | 学生、谈话、任务、业务档案、就业、住宿、班委、科研、查课查寝、竞赛、资料、班级分析等提供当前页或记录级动作 | `src/core/cwb-v46-ui.js`、`src/core/cwb-v47-ui.js`、`tests/ai-cross-module-audit.js` | 已落地基础入口 |

## 2026-08-20 实际修复

1. 修复敏感联系方式授权后的二次脱敏：自由文本和结构化上下文的通用 8–14 位数字规则现在会保留明确授权的 11 位手机号；内部 ID、学号和身份证规则不受影响。
2. 加固公共 `CWB.ai.run()` 的直接调用：手工传入只有学号快照的记录或来源时，先解析稳定 `student_id`，跨学生范围立即拒绝。
3. `CWBAIWorkflow.normalizeSource()` 保留 `student_number` 兼容快照，供本地范围校验使用；该字段仍在出站层脱敏，不发送给模型。
4. 工作流来源 URL 校验复用 core 的完整 IPv6/保留地址判断；在没有 core 的独立工作流环境下对 IPv6 采取保守拒绝，并补齐 IPv4 保留网段判断。
5. 修正 AI 合约测试夹具：受跟踪的 `v4_files` 来源必须从真实本地记录生成指纹，缺指纹来源继续保持拒绝。
6. 直连模型响应在 JSON 解析前执行 4 MiB 默认、8 MiB 硬上限的 UTF-8 字节检查；超大响应返回 `AI_PROVIDER_RESPONSE_TOO_LARGE`，成功响应的非法 JSON 返回 `AI_PROVIDER_INVALID_JSON`，不把原始响应写入审计。
7. 请求取消后增加响应体读取后的竞态检查；即使服务端已经返回，已取消请求也只产生取消/失败路径，不继续落库为完成、草稿或建议。
8. 视觉请求必须同时满足 `provider.supportsVision === true` 和附件授权；Anthropic provider 将 OpenAI 风格 `image_url` 转换为官方 `image`/`source.base64` 结构。
9. 公共消息入口清洗未知顶层字段和未知 content part，只保留安全角色、文本及受校验的图片 data URL；新增建议质量反馈，写入 `v4_ai_audit` 并提供最近 30 天按用途/反馈类型统计。

## 已执行验证

本轮代码修改后的实际结果：

```text
pnpm test:cwb-ai                    PASS（本轮 AI 安全与反馈改动后重新执行）
node tests/cwb-ai-governance.js     PASS
node tests/cwb-ai-hardening.js      PASS
node tests/ai-egress-contract.js    PASS
node tests/ai-contract.js           PASS
node tests/ai-workflow-ui.js        PASS
node tests/ai-cross-module-audit.js PASS
node tests/cwb-ai-context.js        PASS
node tests/ai-source-integrity.js   PASS
node --check src/core/cwb-ai.js     PASS
node --check src/core/cwb-ai-workflow.js PASS
```

同一候选在本轮 AI 代码修改后已重新通过 `pnpm test:v47` 和 `pnpm test:optimization`；其中优化组合串行运行使用 600 秒外层门限，17 个单项全部通过。

此前完整 `pnpm test` 曾超时；最终代码状态已重新执行并以退出码 0 通过。当前尚未把本轮候选写成新的 Release 证据。

## 仍未完成或不能由本轮代码替代

- 重点学生锁仍是“防误看”，不是 Argon2/数据库级加密；忘记密码不可恢复、跨端密钥管理和加密备份需要独立高风险批次。
- 历史暴露过的外部 API key 仍需密钥所属服务商账户持有人撤销和轮换；代码无法替用户完成外部账户操作。
- 当前连接测试只证明请求链路可用，不代表真实模型的业务质量、视觉识别质量或中文输出质量；尚无脱敏固定样本人工评分基线。
- 来源检索仍是结构化关键词检索和用户主动抓取，不是带权限继承、向量语义检索和版本化知识库；不做后台全网爬取。
- 建议去重目前是确定性键，不是语义相似度去重；当前已能记录单机建议的最新质量反馈，但尚无多人审阅队列、学校级审阅权限和跨版本质量基线。
- 尚未完成受控真实设备的长期 IndexedDB、Electron SQLite、附件、备份恢复压力测试；5,000/10,000 合成数据回归不能替代长期运行证据。
- 内置浏览器的整页截图/移动真实触控接口仍受会话能力限制；已有 DOM、ARIA、尺寸和自动化回归不能写成“人工截图验收”。

## 后续顺序

1. 先完成当前候选最终门禁和文档一致性检查，再决定是否升版本、提交和受控发布。
2. 单独立项数据库级加密和密钥生命周期，不与普通 UI/AI 迭代混发。
3. 建立固定脱敏样本、人工评分表和 provider/用途质量趋势，区分“连接成功”和“建议可用”。
4. 在受控设备进行长时间压力、升级、恢复和附件清理测试；失败时保留快照和诊断包。
5. 之后再做来源语义检索、相似建议去重和多角色审核，不引入后台自动监听或自动写事实。

## 2026-08-20 继续加固（本轮）

本轮在上一版审计结论上继续反向核对公共 API、来源边界、授权范围和用户错误反馈，实际修复以下六处容易被忽略的细节：

| 检查项 | 修复结果 | 回归证据 |
| --- | --- | --- |
| 每日额度口径 | `CWBAIWorkflow.authorize()` 现在只统计 `action: generate` 且已完成的真实模型生成；授权、反馈、转化、证书确认和通知确认不再误扣额度 | `tests/cwb-ai-workflow.js`、`pnpm test:cwb-ai` |
| 身份授权范围 | 姓名和学号即使获得 `identity` 授权，也只允许当前学生、当前班级或当前上下文实际关联的学生；其他学生的姓名/学号仍会被出站清理 | `aiScopedIdentityValues()`、`tests/cwb-ai-context.js`、`tests/ai-governance-boundaries.js` |
| relay 来源 URL | relay 端与浏览器 core 一样清理 `token`、`api_key`、`session`、`student` 等敏感查询参数并删除片段；清理后的 URL 才进入请求和来源记录 | `scripts/ai-relay.js`、`tests/cwb-ai-source.js` |
| 建议转化确认链 | 建议转任务/谈话/工作留痕除 `status: accepted` 外，还必须有 `human_confirmed_at` 和 `confirmation_method`；直接写入 accepted 的旧/伪造记录不能绕过人工确认 | `suggestionHasHumanConfirmation()`、`tests/ai-contract.js`、`tests/ai-governance-boundaries.js` |
| provider 治理 | 连接测试明确拒绝停用 provider；取消或取消竞态记录为 `cancelled`，不记作失败或成功 | `aiTestProvider()`、`tests/cwb-ai-context.js` |
| 错误可操作性 | 补齐非法 JSON、响应过大、用途未授权、额度耗尽、敏感授权、附件授权、视觉能力和建议确认等中文提示 | `aiRequestErrorLabel()`、`pnpm lint` |

### 本轮最终验证

```text
pnpm test:cwb-ai       PASS
pnpm lint              PASS
pnpm check:secrets     PASS
pnpm check:public      PASS
git diff --check       PASS（仅有 CRLF 转换提示，无空白错误）
pnpm build:release     PASS（生成当前候选 `output/辅导员工作台.html`）
pnpm test:release      PASS
```

本轮没有启动独立审查代理：修改集中在同一条 AI 治理链，由当前实现代理完成批量自检；由于涉及出站脱敏、持久化建议转化和 provider 权限，已通过一次合并 AI 门禁，而不是为每个小修复重复执行全量流程。没有生成新的正式离线/桌面发布产物，因此没有执行哈希检查。此前 `pnpm test:cwb-ai` 的旧测试夹具先暴露了两处缺少人工确认元数据的问题，补齐夹具后最终门禁通过，这一过程不改写为“首次即通过”。

### 当前真实状态

- GitHub `7752777/counselor-desk` 已是私有仓库；本机 `origin` 认证访问正常，历史 `v4.7.0` Tag 保留。
- 当前分支仍是 `codex/ai-upgrade` 的未发布候选；`package.json` 仍为 `4.7.0`，本轮修复不属于历史 `v4.7.0` Release，未提交、未创建新 Tag/Release、未重新部署 Pages。
- AI 公共入口、跨端集合和历史需求对账均有源码/测试证据；不能由本轮代码替代的事项仍是数据库级加密、历史 API key 撤销轮换、真实模型质量基线、真实设备长期压力测试、语义检索/相似度去重和内置浏览器人工触控截图验收。

## 全量验证补充

首次 `pnpm test` 在 900 秒门限内未返回，退出码为 `124`，定位后确认是导入测试静态契约与当前事件分发器变量名不一致；更新 `tests/import-loop.js` 后完整命令重新退出码 0。`v40-route-alias` 在 JSDOM 关闭窗口后仍会输出一次 `Uncaught SyntaxError` 和 `window.scrollTo` 未实现提示，但测试退出码为 0；这些属于测试夹具能力噪声，真实浏览器不受影响，也不能把它描述为人工浏览器截图验收通过。

## 2026-08-20 记录级入口继续对账

在上述审计之后又逐项核对了 `AI_CONTEXT_SPECS`、`AI_VIEW_COLLECTIONS`、`AI_RECORD_ACTIONS`、记录动作选择器和实际页面 `data-act`。发现并修复三处页面入口没有完全接入统一记录链的问题：

- `v4_class_schedules`：加入记录动作映射，并让默认周视图的 `article.schedule-entry` 也能显示“AI 课表安排”；列表和移动卡片继续共用同一目标集合与记录 ID。
- `v4_dorm_assignments`：住宿专项的当前住宿表增加绑定具体住宿记录的“AI 住宿检查”，不改变排宿预览和人工确认边界。
- `v4_roll_call_sessions`：随机点名页面增加已保存结果列表和“AI 点名留痕”，保存结果后才允许进入记录上下文。

同时修正随机点名上下文日期字段：规范化记录使用 `date`，不再使用不存在的 `call_date`。详细逐项矩阵、维护规则、部分完成项和本次验证见[AI 实现逐项对账与收口记录](./ai-implementation-reconciliation-2026-08-20.md)。

本次新增入口的定向回归已通过：`node tests/ai-cross-module-audit.js`、`node tests/ai-record-actions.js`，并通过 `node --check src/core/cwb-v46-ui.js` 和 `node --check src/core/cwb-v47-ui.js`。HTML 文件不使用 `node --check index.html`，应由项目 lint、构建和 JSDOM/浏览器测试解析。

## 2026-08-20 用途与全量验证事实更新

本轮继续检查“用途能否被页面正确选择、筛选和授权”。主 AI 工作台已直接展示 canonical `warning_assist` 与 `certificate_recognition`；建议中心对旧别名做 canonical 去重。公共 `CWB.ai.run()` 对非空未知用途返回 `AI_PURPOSE_INVALID`，不再静默降级为 `work_summary`。对应回归见 `tests/ai-workflow-ui.js`。

全量命令 `pnpm test` 首次运行因导入测试静态契约失败；修复后最终代码状态退出码 0。分组替代验证、AI 定向测试、v4.7、lint、构建和发布契约也均通过，首次失败记录保留用于审计，不再作为当前最终状态。

## 2026-08-20 输出安全与健康检查补充

本轮在上述入口和用途对账之后又完成了两项实际收口：

- `aiSanitizeGeneratedOutput()` 对模型返回的文本再次执行本地出站规则。未授权时，学生姓名、学号、手机号和当前请求中的本地记录 ID 不会进入页面返回值、AI 草稿或建议；即使明确授权当前学生的身份和联系方式，`student_id`、`record_id` 等内部索引仍然会被清理。
- `CWB.ai.createAuditEntry()` 新增 `output_redacted` 布尔字段；生成结果发生二次清理时审计标记为 `true`，不保存模型原始响应。
- `CWB.ai.health()` 返回运行时、用途合同、AI 集合、页面入口、模型、来源状态和待审核队列报告。AI 工作台展示同一报告；页面入口函数缺失时现在会报告为缺口，不再产生假阴性。

## 2026-08-22 公共写入与页面等待复核

此前部分建议、授权和通知确认入口通过全局 `__CWB_LAST_SAVE_PROMISE__` 暂存保存结果，外部调用者容易在持久化完成前拿到“已采纳/已生成”的对象。当前候选增加了 `result.ready`、`persistence_state`、`CWB.ai.awaitMutation()` 以及对应 `*Async` 公共方法；页面入口已改为等待返回对象自身的持久化承诺。

本批实际通过 `pnpm test:cwb-ai`。新增回归覆盖：授权保存完成状态、建议反馈完成状态、公共写入失败后的整条建议回滚、异步采纳接口，以及通知确认和批量审阅的页面等待。该契约仍属于 v4.8.0 未发布候选，不能作为 v4.7.1 正式版本 API 承诺。

本次实际验证：

```text
pnpm test:cwb-ai       PASS（15 个 AI 定向用例，包含 ai-output-health）
node tests/ai-output-health.js PASS
node tests/ai-workflow-ui.js PASS
node tests/ai-contract.js PASS
node tests/cwb-ai-context.js PASS
node tests/ai-egress-contract.js PASS
node tests/ai-cross-module-audit.js PASS
node tests/ai-worklog-conversion.js PASS
```

这组结果只证明当前 `codex/ai-upgrade` 工作区候选的自动化契约；不证明真实模型输出质量、真实设备触控、数据库级加密或正式发布。当前候选仍未正式发布；本次只推送维护分支，不打新 Tag、不创建 Release、不重新部署 Pages。

## 2026-08-20 最终候选门禁

首次完整 `pnpm test` 暴露 `tests/import-loop.js` 仍按旧事件分发器变量名匹配的测试契约问题；实现中的 `invokeAction(button)` 实际已经正确把按钮元素传给动作。更新测试断言后重新执行，最终门禁结果为：

```text
pnpm test            PASS
pnpm lint            PASS
pnpm build:release   PASS
pnpm check:public    PASS
pnpm check:secrets   PASS（最终扫描 279 个仓库文件）
pnpm test:release    PASS
git diff --check     PASS
```

完整测试同时覆盖导入/导出、40 个视图、Electron、10,000 条性能样本、附件容量、备份恢复、v8/v9/v10 迁移和手机交换包。`c.local`、`window.scrollTo` 等 JSDOM 资源/能力提示仍是测试夹具噪声，不影响退出码，也不等同于真实浏览器人工截图验收。当前分支已准备推送到私有 GitHub，但候选未创建新 Tag/Release/Pages。

## 2026-08-22 当前事实总账回链

本轮继续核对“生成成功是否等于已经安全落盘”：敏感授权创建/消费、通知预览/解析、建议反馈与批量审阅、语音授权、证书授权及 AI 输出失败路径均等待实际保存结果；跨集合写入失败时恢复快照并保留重试入口。未启用 IndexedDB 的局域网兼容队列不再显示数据库级加密文案。最新证据和未完成的真实模型质量、麦克风、设备及正式发布验收见[当前收口总账](./closeout-status-2026-08-22.md)。
