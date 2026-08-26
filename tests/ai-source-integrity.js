const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<script defer src="src/core/cwb-ai.js" data-cwb-ai></script>', `<script>${fs.readFileSync(path.join(root, 'src/core/cwb-ai.js'), 'utf8')}</script>`)
    .replace('<script defer src="src/core/cwb-ai-workflow.js" data-cwb-ai-workflow></script>', `<script>${fs.readFileSync(path.join(root, 'src/core/cwb-ai-workflow.js'), 'utf8')}</script>`);
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/scrollTo|Could not load|Not implemented|getaddrinfo/i.test(String(error && error.message))) throw error; });
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://ai-source-integrity.local/', pretendToBeVisual:true, virtualConsole });
  await wait(800);
  const { window: w } = dom;
  const student = w.CWB.db.students.find(item => item && item.id);
  assert.ok(student, 'a student fixture is required');
  w.CWB.db.tasks.push(w.CWB.norm.task({ id:'source-integrity-task', student_id:student.id, student_number:student.student_number, title:'原始任务标题', due:'2026-08-19' }));

  const context = w.CWB.ai.context.build({ purpose:'task_plan', student_id:student.id, target_view:'tasks', target_collection:'tasks', target_record_id:'source-integrity-task' });
  const source = context.sources.find(item => item.collection === 'tasks' && item.record_id === 'source-integrity-task');
  assert.ok(source && source.source_fingerprint, 'record sources should retain a local freshness fingerprint');
  const repeatedContext = w.CWB.ai.context.build({ purpose:'task_plan', student_id:student.id, target_view:'tasks', target_collection:'tasks', target_record_id:'source-integrity-task' });
  const repeatedSource = repeatedContext.sources.find(item => item.collection === 'tasks' && item.record_id === 'source-integrity-task');
  assert.equal(repeatedSource.id, source.id, 'the same business record must keep a stable source id across context builds');
  const provider = { id:'integrity-provider', key:'custom', model:'integrity', enabled:true, allowedPurposes:['task_plan'], dailyQuota:20 };
  const suggestion = w.CWB.ai.suggestions.create({
    purpose:'task_plan', title:'来源完整性测试', student_id:student.id, sources:[source], source_ids:[source.id],
    payload:{ text:'请人工核对来源后执行' }, status:'review', risk_level:'normal',
  });
  w.CWB.ai.suggestions.accept(suggestion.id);
  w.CWB.db.tasks.find(item => item.id === 'source-integrity-task').title = '来源已修改';
  assert.throws(() => w.CWB.ai.suggestions.convert(suggestion.id, 'task'), /AI_SUGGESTION_SOURCE_REVIEW_REQUIRED/);

  await assert.rejects(() => w.CWB.ai.run({
    provider, purpose:'task_plan', context:{ student_id:student.id, records:[], sources:[] }, sourceRows:[source],
    send:async () => ({ text:'绕过来源校验不应发送' }),
  }), /AI_SOURCE_REVIEW_REQUIRED/);

  await assert.rejects(() => w.CWB.ai.run({
    provider, purpose:'task_plan', context:{ student_id:student.id, records:[], sources:[] }, sourceRows:[source.id],
    send:async () => ({ text:'裸来源 ID 不应绕过复核' }),
  }), /AI_SOURCE_REVIEW_REQUIRED/);
  await assert.rejects(() => w.CWB.ai.run({
    provider, purpose:'task_plan', context:{ student_id:student.id, records:[], sources:[] },
    sourceRows:[{ kind:'local', collection:'tasks', record_id:'source-integrity-task', status:'available' }],
    send:async () => ({ text:'缺少指纹的跟踪来源不应发送' }),
  }), /AI_SOURCE_REVIEW_REQUIRED/);

  const staleWeb = w.CWBAIWorkflow.normalizeSource({ id:'integrity-stale-web', kind:'web', url:'https://example.com/stale', status:'needs_review', verification_status:'needs_review' });
  await assert.rejects(() => w.CWB.ai.run({ provider, purpose:'task_plan', context:{ student_id:student.id, records:[], sources:[staleWeb] }, send:async () => ({ text:'不应发送' }) }), /AI_SOURCE_REVIEW_REQUIRED/);

  const other = w.CWB.db.students.find(item => item && item.id !== student.id);
  await assert.rejects(() => w.CWB.ai.run({ provider, purpose:'task_plan', context:{ student_id:student.id, records:[{ id:'outside', student_id:other.id }], sources:[] }, send:async () => ({ text:'不应发送' }) }), /AI_CONTEXT_SCOPE_MISMATCH/);
  await assert.rejects(() => w.CWB.ai.run({ provider, purpose:'task_plan', context:{ student_id:student.id, records:[{ id:'outside-by-number', student_number:other.student_number, note:'学号-only 越界记录' }], sources:[] }, send:async () => ({ text:'不应发送' }) }), /AI_CONTEXT_SCOPE_MISMATCH/);
  await assert.rejects(() => w.CWB.ai.run({ provider, purpose:'task_plan', context:{ student_id:student.id, records:[], sources:[{ id:'outside-source-by-number', kind:'local', collection:'notes', record_id:'outside-source-by-number', student_number:other.student_number, title:'越界来源', excerpt:'不应发送', status:'available', verification_status:'not_applicable' }] }, send:async () => ({ text:'不应发送' }) }), /AI_CONTEXT_SCOPE_MISMATCH/);

  const batchA = w.CWB.ai.suggestions.create({ purpose:'task_plan', title:'批量查看 A', payload:{ text:'A' } });
  const batchB = w.CWB.ai.suggestions.create({ purpose:'task_plan', title:'批量查看 B', payload:{ text:'B' } });
  const viewed = w.CWB.ai.suggestions.reviewMany([batchA.id, batchB.id], 'viewed');
  assert.equal(viewed.updated.length, 2);
  assert.equal(w.CWB.ai.suggestions.list({ query:'批量查看 A' })[0].status, 'viewed');
  const rejected = w.CWB.ai.suggestions.reviewMany([batchA.id, batchB.id], 'rejected', { confirmed:true });
  assert.equal(rejected.updated.length, 2);

  w.CWB.db.custom.v4_ai_providers = [];
  const fallback = await w.CWB.ai.notice.parse({ text:'请于2026年9月1日前提交材料。', source:'本地降级测试' });
  assert.equal(fallback.local_fallback, true, 'notice capture should remain usable without a configured model');
  assert.ok(fallback.draft && w.CWB.db.custom.v4_ai_drafts.some(item => item.id === fallback.draft.id), 'local fallback should still create an auditable draft');
  assert.equal(fallback.draft.purpose, 'notice_capture', 'notice fallback drafts should retain their purpose');
  assert.ok(w.CWB.db.custom.v4_ai_audit.some(item => item.fallback_reason === 'AI_PROVIDER_NOT_CONFIGURED'), 'fallback reason should be auditable');

  const noticeProvider = { id:'notice-integrity-provider', key:'custom', model:'notice-integrity', enabled:true, secret_set:true, allowedPurposes:['notice_capture'], dailyQuota:20 };
  w.CWB.db.custom.v4_ai_providers = [noticeProvider];
  w.sessionStorage.setItem('cwb_ai_secret_notice-integrity-provider', 'test-key-not-real');
  w.CWB.go('ai');
  await wait(40);
  const staleSensitiveCategory = w.document.querySelector('[data-ai-sensitive-category="identity"]');
  assert.ok(staleSensitiveCategory, 'AI page should expose sensitive-category controls for the stale-authorization regression');
  staleSensitiveCategory.checked = true;
  staleSensitiveCategory.dispatchEvent(new w.Event('change', { bubbles:true }));
  let outbound = '';
  const originalSendChat = w.CWBAI.sendChat;
  w.CWBAI.sendChat = async (_provider, messages) => { outbound = JSON.stringify(messages); return { text:JSON.stringify({ title:'材料通知', key_points:['提交材料'], deadlines:[], todos:[], needs_verification:[], evidence:['提交材料'] }) }; };
  const parsedNotice = await w.CWB.ai.notice.parse({ text:'请联系张三，电话 13812345678，邮箱 teacher@example.com，学号 20240001，于2026年9月1日前提交。', source:'脱敏回归' });
  assert.equal(parsedNotice.outbound_redacted, true, 'notice requests should report text redaction');
  assert.equal(outbound.includes('13812345678'), false, 'notice phone numbers must not leave the local page by default');
  assert.equal(outbound.includes('teacher@example.com'), false, 'notice email addresses must not leave the local page by default');
  assert.equal(outbound.includes('20240001'), false, 'notice identity numbers must not leave the local page by default');
  assert.equal(outbound.includes('2026年9月1日'), true, 'notice dates must remain available to the model');
  assert.equal(parsedNotice.audit.sensitiveRequested, false, 'notice capture must ignore stale AI page sensitive state');
  assert.deepEqual(Array.from(parsedNotice.audit.sensitive_categories || []), [], 'notice capture must not inherit stale sensitive categories');

  const className = student.class_name;
  await assert.rejects(() => w.CWB.ai.run({
    provider, purpose:'task_plan',
    context:{ class_name:className, scope:{ class_name:className }, records:[{ id:'class-outside', class_name:'明确越界班', title:'越界记录' }], sources:[] },
    send:async () => ({ text:'不应发送' }),
  }), /AI_CONTEXT_SCOPE_MISMATCH/);
  await assert.rejects(() => w.CWB.ai.run({
    provider, purpose:'task_plan',
    context:{ class_name:className, scope:{ class_name:className }, records:[], sources:[{ id:'class-source-outside', kind:'local', collection:'notes', record_id:'class-source-outside', class_name:'明确越界班', status:'available', verification_status:'not_applicable' }] },
    send:async () => ({ text:'不应发送' }),
  }), /AI_CONTEXT_SCOPE_MISMATCH/);
  const globalPolicyRun = await w.CWB.ai.run({
    provider, purpose:'task_plan',
    context:{ class_name:className, scope:{ class_name:className }, records:[{ id:'global-policy', collection:'v4_files', title:'全局政策资料', content:'不关联学生或班级的公共政策' }], sources:[] },
    send:async () => ({ text:'公共政策上下文可以使用' }), createSuggestion:false,
  });
  assert.equal(globalPolicyRun.audit.status, 'completed', 'unlinked global policy records should remain available in a class-scoped request');
  w.CWBAI.sendChat = async () => { throw new Error('AI_PROVIDER_REQUEST_ABORTED'); };
  await assert.rejects(() => w.CWB.ai.notice.parse({ text:'取消测试：请于2026年9月1日前提交。', source:'取消回归' }), /AI_PROVIDER_REQUEST_ABORTED/);
  w.CWBAI.sendChat = originalSendChat;

  dom.window.close();
  console.log('PASS ai-source-integrity');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
