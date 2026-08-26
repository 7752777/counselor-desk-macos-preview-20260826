# AI 收口加固记录

更新时间：2026-08-19  
工作分支：`codex/ai-upgrade`  
历史发布基线：`v4.7.0`  
状态：当前工作区候选，尚未形成新的 Tag/Release

## 本次实际落地

### 1. 来源新鲜度门禁

- 本地业务来源现在保存 `source_fingerprint` 和 `source_updated_at`。
- 指纹只基于原始业务记录，不包含 AI、时间戳和上下文投影字段。
- 建议转为任务、谈话或工作留痕前，会重新读取原始记录并比较指纹。
- 来源记录被修改时显示“来源已变化”；来源被删除时显示“来源已删除”；两种情况都不能直接转化。
- 上下文直接调用 `CWB.ai.run()` 时同样执行来源新鲜度检查。
- 合成的无集合上下文记录不伪装成可追踪业务来源，仍可用于本地单次测试，但不产生错误的删除判定。

### 1.1 本地来源目录回链

- `CWB.ai.sources.search()` 对政策、模板、资料、就业、竞赛、工具入口和科研记录生成稳定的 `local` 来源 ID，不再每次搜索随机换 ID。
- 本地来源会按 `url`、`source_url`、`official_url`、`website`、`link` 的实际 HTTPS 地址建立可回链引用，同时保存集合、记录 ID、学生兼容快照、`source_fingerprint` 和 `source_updated_at`。
- `aiSuggestionSourceState()` 与 `aiValidateWorkflowContext()` 同时检查 `record` 和 `local` 来源；本地资料修改或删除时统一进入需复核状态。
- 新增回归验证本地来源可搜索、指纹存在、建议采纳后修改来源会被标记为 changed，并阻止转任务。

### 2. 上下文范围安全

- 公共运行入口增加当前学生范围校验，发现其他学生记录混入时拒绝发送。
- 网页来源必须通过 HTTPS、公开地址和最近核验检查；失效来源先重新核验。
- 内部 `student_id`、业务 ID、附件 ID、请求 ID 和来源指纹仍只用于本地关联，不进入模型请求。

### 3. 通知识别的可用性

- 通知识别先检查模型、用途授权和本机密钥是否可用。
- 没有可用模型或暂时无法连接时，直接使用本地规则提取标题、日期、待办和证据片段。
- 本地降级结果仍生成 `v4_ai_drafts`、来源哈希和审计记录，并保存 `fallback_reason`。
- 所有 AI 草稿现在保存 canonical `purpose`；通知降级、证书识别和普通生成不会再出现只有 `kind`、无法按用途追溯的草稿。
- 本地降级不代表 AI 已完成语义理解；结果置信度较低，仍必须人工核对。

### 4. 建议审核

- 新增 `CWB.ai.suggestions.reviewMany(ids, action, options)`。
- 批量查看和批量驳回只改变建议状态，不写入学生事实或正式工作记录。
- 批量采纳仍需要显式确认；高风险建议没有批量自动确认捷径。
- 批量操作保留汇总审计和逐条失败原因，已处理或来源失效的建议会被跳过。

### 5. 外部来源大小

- 浏览器端来源正文限制改为按 UTF-8 字节数计算，与 relay 的字节上限保持一致。
- relay 继续按请求体、响应体和来源正文的字节大小限制，并保留超时、重定向、内容类型和 DNS 私网地址防护。

### 6. 公共运行入口来源门禁

- `CWB.ai.run()` 除了校验 `context.sources`，还校验直接传入的 `sourceRows`，避免调用方把来源放在上下文之外而绕过学生范围、来源状态或业务指纹检查。
- 来源校验在一次性敏感授权消费之前执行；如果来源已变化或不可用，不会白白消耗本次授权。
- 用途别名在建议、草稿、审计和风险等级计算前统一归一，`risk_review` 仍保持 `warning_assist` 的高风险人工确认门禁。

## 定向证据

本次修改后通过：

```text
node tests/ai-source-integrity.js
node tests/ai-contract.js
node tests/cwb-ai-context.js
node tests/ai-workflow-ui.js
```

新增回归覆盖来源被修改、来源被删除、越界学生上下文、失效网页来源、建议批量审核和无模型通知本地降级。完整 `pnpm test`、最终构建和发布检查仍需在本轮所有修改完成后执行一次；本文件不把局部通过写成完整发布证据。

来源目录回链补丁完成后又执行了完整 AI 批次：

```text
pnpm test:cwb-ai  PASS
```

其中包括 `ai-source-directory`、`ai-source-integrity`、`ai-contract`、`ai-egress-contract` 和 `ai-cross-module-audit`；没有重复把历史发布门禁当作本轮候选的验证。

## 仍未完成

- 当前防误看锁仍不是数据库级加密；真正加密、密钥恢复和跨端密钥管理需要独立高风险批次。
- 没有替用户撤销历史暴露的外部 API key；必须由密钥所属服务商账户持有人在后台完成撤销和轮换。
- 尚无真实模型质量评分基线；静态规则、脱敏样本和接口测试不能证明模型输出适合学校业务。
- 建议中心尚未实现语义相似度去重和多人审阅队列；当前只做确定性键去重、筛选、单条审核和安全批量查看/驳回。
- 当前工作区候选尚未提交、推送、重新生成发布产物或部署受控网页入口。

## 2026-08-20 复核补丁

- 修复授权 `contact` 后手机号被通用数字身份规则二次脱敏的回归；自由文本和结构化上下文现在保持同一授权语义。
- 公共 `CWB.ai.run()` 对只有学号快照的记录和来源先解析稳定 `student_id`，跨学生上下文直接返回 `AI_CONTEXT_SCOPE_MISMATCH`；`normalizeSource()` 保留学号快照，但出站层继续删除。
- 工作流来源 URL 校验复用 core 的完整 IPv6 和特殊地址判断；新增 IPv4-mapped IPv6、文档网段和公网 IPv6 回归。
- 受跟踪本地来源仍强制要求 `source_fingerprint`；合约测试从真实本地资料记录生成指纹，不通过放宽门禁来修测试。

本次修改后已通过：

```text
pnpm test:cwb-ai
pnpm test:v47
pnpm test:optimization
node tests/cwb-ai-workflow.js
node tests/ai-source-integrity.js
node --check src/core/cwb-ai-workflow.js
```

完整 `pnpm test` 的此前超时事实、当前候选未发布状态和长期风险以[2026-08-20 AI 全面收口审计](./ai-comprehensive-audit-2026-08-20.md)为准。
