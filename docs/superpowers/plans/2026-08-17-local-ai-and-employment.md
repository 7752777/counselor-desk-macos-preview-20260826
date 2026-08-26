# 本地 AI 与就业资源升级 Implementation Plan

> 实施状态：源码、本地验证、跨平台构建和正式公开发布均已完成，已纳入 v4.4.5。本文计划中的复选框保留原始执行轨迹；完整实际结果、公开附件、Pages 和限制见[v4.4.5 历史发布收尾记录](../../upgrade/release-v4.4.5.md)。本文形成时的当前基线为 v4.4.6；当前公开产品基线已升级为[v4.7.0](../../upgrade/release-v4.7.0.md)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 schema v8 本地工作区中交付受权限、配额与审计约束的 AI 草稿工作流，以及可维护的约 80 条就业资源库。

**Architecture:** 新增无 DOM 的 AI 工作流模块，用于校验任务授权、每日额度、草稿与证书字段。页面只负责配置、编辑和明确确认；所有新增集合由 `CWBCollections` 驱动并透传到浏览器、便携包、Electron、备份与迁移。既有初版页面被收敛到这一工作流，不改变稳定学生 ID 或附件仓边界。

**Tech Stack:** Vanilla JavaScript、单文件 `index.html`、IndexedDB、Electron SQLite、Node assert/JSDOM、schema v8。

## 实际完成情况

- AI 治理、可取消草稿、证书人工确认、日期范围总结、就业资源、统一集合清单和跨端迁移边界均已实现并完成对应定向/综合验证。
- 后续补齐了跨模块上下文、建议中心、来源核验、记录级动作、敏感字段逐请求授权、relay 安全和移动端导航/窄屏交互。
- 原始步骤中的“预期失败”仅描述开发时的测试驱动阶段，不代表当前代码仍未完成；v4.4.5 的真实 GitHub Release、Pages 和跨平台 runner 证据已回填到发布收尾记录。

---

### Task 1: AI 工作流数据契约与持久化边界

**Files:**
- Create: `src/core/cwb-ai-workflow.js`
- Create: `tests/cwb-ai-workflow.js`
- Modify: `src/core/cwb-ai.js`
- Modify: `src/core/cwb-collections.js`
- Modify: `index.html`
- Modify: `tests/cwb-collections.js`

- [ ] **Step 1: 写入失败测试，锁定未知用途、禁用模型、未授权用途、额度与草稿结构。**

```js
const workflow = sandbox.CWBAIWorkflow;
assert.throws(() => workflow.authorize({ enabled:true, allowedPurposes:['work_summary'], dailyQuota:1 }, 'certificate_recognition', []), /AI_PURPOSE_NOT_ALLOWED/);
assert.throws(() => workflow.authorize({ enabled:true, allowedPurposes:['work_summary'], dailyQuota:1 }, 'work_summary', [{ purpose:'work_summary', status:'completed', created_at:today }]), /AI_DAILY_QUOTA_EXCEEDED/);
assert.equal(workflow.normalizeDraft({ kind:'certificate', status:'draft' }).schema_version, 8);
```

- [ ] **Step 2: 运行 `node tests/cwb-ai-workflow.js`，确认因模块不存在而失败。**

- [ ] **Step 3: 实现纯函数模块与模型配置扩展。**

```js
const PURPOSES = Object.freeze(['certificate_recognition', 'work_summary', 'notice_rewrite', 'warning_assist']);
function authorize(provider, purpose, audits, date = new Date()) {
  if (!provider || provider.enabled === false) throw new Error('AI_PROVIDER_DISABLED');
  if (!PURPOSES.includes(purpose) || !(provider.allowedPurposes || []).includes(purpose)) throw new Error('AI_PURPOSE_NOT_ALLOWED');
  const used = (audits || []).filter(item => item.purpose === purpose && item.status === 'completed' && sameLocalDay(item.created_at, date)).length;
  if (Number(provider.dailyQuota) > 0 && used >= Number(provider.dailyQuota)) throw new Error('AI_DAILY_QUOTA_EXCEEDED');
  return { purpose, used, remaining:Math.max(0, Number(provider.dailyQuota || 0) - used) };
}
```

`normalizeProviderConfig` 追加 `supportsVision:false`，并把用途列表规范为受支持的用途。`normalizeDraft` 生成 `id`、`kind`、`status`、`provider_id`、`audit_id`、`source_attachment_id`、`student_id`、`student_number`、`payload`、创建/更新时间和 `schema_version:8`。

- [ ] **Step 4: 将 `v4_ai_drafts` 加入 `CWBCollections.custom`，并把 `index.html` 中的自定义集合初始化、仓储、同步、恢复循环改为从 `CWBCollections.custom` 派生。**

```js
const customKeys = (window.CWBCollections && window.CWBCollections.custom) || [];
for (const key of customKeys) await directReplaceCollection(key, custom[key] || []);
```

保留 AI 密钥不进入任意集合的现有设计；只持久化不含密钥的配置、审计和草稿。

- [ ] **Step 5: 运行 `node tests/cwb-ai-workflow.js && pnpm test:cwb-ai && pnpm test:cwb-collections`，确认契约、脱敏和集合边界通过。**

### Task 2: AI 页面治理与可取消草稿调用

**Files:**
- Create: `tests/ai-workflow-ui.js`
- Modify: `index.html`
- Modify: `tests/v40-runtime.js`

- [ ] **Step 1: 写入 JSDOM 失败测试，覆盖页面用途控制与失败不写入。**

```js
provider.allowedPurposes = ['work_summary'];
await assert.rejects(() => window.CWB.ai.run({ provider, purpose:'certificate_recognition', messages:[] }), /AI_PURPOSE_NOT_ALLOWED/);
assert.equal(window.CWB.db.custom.v4_ai_audit.at(-1).status, 'failed');
assert.equal(window.CWB.db.custom.v4_ai_drafts.length, 0);
```

- [ ] **Step 2: 运行 `node tests/ai-workflow-ui.js`，确认 API 尚未暴露而失败。**

- [ ] **Step 3: 用单一 `CWB.ai.run` 封装现有 `aiRunDraft` 和 `ai-run`。**

```js
const controller = new AbortController();
const decision = window.CWBAIWorkflow.authorize(provider, purpose, v4Collection('v4_ai_audit'));
const result = await window.CWBAI.sendChat(provider, messages, { apiKey:secret, signal:controller.signal, max_tokens });
const draft = window.CWBAIWorkflow.normalizeDraft({ kind, provider_id:provider.id, audit_id:audit.id, payload:{ text:result.text, range, sources } });
```

在 `finally` 中清理进行中的 controller；成功和失败都记录不含提示词的审计；仅成功时创建草稿。页面新增用途多选、每日额度、图像能力开关、配额状态和“取消本次请求”按钮。既有通知改写、风险分析和通用助手改走该 API。

- [ ] **Step 4: 运行 `node tests/ai-workflow-ui.js && node tests/v40-runtime.js`，确认错误状态、重复点击保护和现有运行时行为通过。**

### Task 3: 证书识别的附件、稳定 ID 与人工确认

**Files:**
- Create: `tests/certificate-recognition.js`
- Modify: `index.html`
- Modify: `src/core/cwb-business.js`
- Modify: `tests/cwb-business.js`

- [ ] **Step 1: 写入失败测试，确认草稿不写入奖励、确认后以稳定 ID 关联且附件引用被保留。**

```js
assert.equal(CWB.db.rewards.length, 0);
const draft = CWB.ai.createCertificateDraft({ title:'国家奖学金', source_attachment_id:'att-1' });
assert.equal(CWB.db.rewards.length, 0);
CWB.ai.confirmCertificateDraft(draft.id, { student_id:'student-1', title:'国家奖学金' });
assert.equal(CWB.db.rewards[0].student_id, 'student-1');
assert.equal(CWB.db.rewards[0].attachment_id, 'att-1');
```

- [ ] **Step 2: 运行 `node tests/certificate-recognition.js`，确认当前实现缺少草稿 API 或稳定 ID 而失败。**

- [ ] **Step 3: 让证书上传先进入附件仓，再生成和保存草稿。**

上传支持 PNG、JPEG、WebP；PDF 在本轮仅支持选择已有图片预览，不伪造 PDF 视觉识别。页面显示“处理中/草稿/失败/取消”，并把模型原文置于可编辑备注。调用前检查 `supportsVision` 和 `certificate_recognition` 授权。

- [ ] **Step 4: 实现确认写入。**

```js
const linked = linkedStudentValues({ student_id:values.student_id, student_number:values.student_number });
if (!linked.student_id || !String(values.title || '').trim()) throw new Error('CERTIFICATE_CONFIRMATION_INVALID');
DB.rewards.push(CWB.norm.normV4Record({
  id:`reward_${Date.now()}`, student_id:linked.student_id, student_number:linked.student_number,
  student_name:linked.student_name, title:values.title, attachment_id:draft.source_attachment_id,
  source:'AI 证书识别（人工确认）', status:'已确认', schema_version:8,
}, 'rewards'));
```

确认后更新草稿状态和审计事件；取消、删除草稿、学生不匹配和识别失败均不得写入 `rewards`。学生时间线只读取确认后的奖励记录。

- [ ] **Step 5: 运行 `node tests/certificate-recognition.js && pnpm test:cwb-business && node tests/business-module-recovery.js`。**

### Task 4: 日期范围总结与可维护就业资源

**Files:**
- Create: `src/core/cwb-employment-resources.js`
- Create: `tests/work-summary.js`
- Create: `tests/employment-resources.js`
- Modify: `index.html`
- Modify: `src/core/cwb-collections.js`
- Modify: `tests/v40-employment-manifest.js`
- Modify: `tests/cwb-collections.js`

- [ ] **Step 1: 写入总结范围失败测试。**

```js
const records = CWB.ai.recordsForRange('2026-08-01', '2026-08-07');
assert.ok(records.every(item => item.date >= '2026-08-01' && item.date <= '2026-08-07'));
const draft = CWB.ai.confirmWorkSummary({ text:'本周已完成 2 项工作', range:{ from:'2026-08-01', to:'2026-08-07' }, sources:records });
assert.equal(CWB.db.worklogs.at(-1).source, 'AI 工作总结（人工确认）');
```

- [ ] **Step 2: 写入资源库失败测试。**

```js
assert.ok(resources.length >= 80);
assert.equal(new Set(resources.map(item => item.url)).size, resources.length);
assert.ok(resources.every(item => /^https:\/\//.test(item.url) && item.source));
assert.equal(filterResources(resources, { favorite:true }).every(item => item.favorite), true);
```

- [ ] **Step 3: 运行 `node tests/work-summary.js && node tests/employment-resources.js`，确认范围 API、80 条资源和收藏筛选尚未满足。**

- [ ] **Step 4: 实现总结的范围选择、来源计数和确认保存。**

`aiContextRecords` 接受 `{ from, to }`，将任务、谈话、活动、预警、帮扶、就业和业务档案标准化为有 `date` 的来源记录后过滤；无法确定日期的记录不进入范围总结。确认时保存正文、范围、来源集合和记录数到工作留痕，并引用 AI 草稿 ID。

- [ ] **Step 5: 建立资源种子和资源规范化函数。**

每条记录使用 `{ id, title, url, category, region, audience, tags, source, verified_at, status, favorite:false }`。种子仅含官方或可信公共服务入口，按全国、区域、招聘平台、升学/基层项目、残障与重点群体服务等分类；首次初始化按 ID 合并，绝不覆盖用户字段。资源页面增加收藏、失效标记、分类/对象/地区/收藏筛选、CSV 导入导出；保留已存在的签名 JSON 清单导入导出用于完整性验证。

- [ ] **Step 6: 运行 `node tests/work-summary.js && node tests/employment-resources.js && node tests/v40-employment-manifest.js && pnpm test:cwb-employment`。**

### Task 5: 跨端集成、文档与最终验收

**Files:**
- Modify: `docs/upgrade/current-baseline.md`
- Modify: `docs/user-guide.md`
- Modify: `tests/v8-migration.js`
- Modify: `tests/v8-backup-integration.js`
- Modify: `tests/desktop-data-migration.js`

- [ ] **Step 1: 为草稿集合与扩展资源写入迁移/备份/桌面失败测试。**

```js
assert.deepEqual(migrated.data.custom.v4_ai_drafts, [{ id:'draft-1', schema_version:8 }]);
assert.ok(desktopCollections.includes('records_custom_v4_ai_drafts'));
assert.equal(restored.custom.v4_employment_resources[0].favorite, true);
```

- [ ] **Step 2: 运行三项测试，确认新集合未完整透传时失败。**

- [ ] **Step 3: 用集合清单驱动迁移、备份和桌面验证，更新用户文档。**

文档说明模型能力要求、密钥边界、授权和额度、证书人工核验、总结不得补造事实、就业资源维护和内置浏览器本地访问限制。不得声称 PDF 已具备视觉识别，或称任何 AI 输出会自动归档。

- [ ] **Step 4: 运行受影响集成测试。**

```powershell
node tests/v8-migration.js
node tests/v8-backup-integration.js
node tests/desktop-data-migration.js
node tests/v40-ui.js
```

- [ ] **Step 5: 执行一次最终完整验证。**

```powershell
pnpm lint
pnpm test
pnpm build:release
git diff --check
git status --short
```

若内置浏览器仍拒绝 `127.0.0.1`，记录为宿主权限限制；不使用其他浏览器、CDP 或自动化绕过该限制。桌面验收仅在已有桌面运行条件下执行对应烟测，不重新执行与本次无关的安装器哈希或网络下载。
