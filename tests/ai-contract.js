const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<script defer src="src/core/cwb-ai.js" data-cwb-ai></script>', `<script>${fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai.js'), 'utf8')}</script>`)
    .replace('<script defer src="src/core/cwb-ai-workflow.js" data-cwb-ai-workflow></script>', `<script>${fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai-workflow.js'), 'utf8')}</script>`);
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Could not load|Not implemented|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://ai-contract.local/', pretendToBeVisual:true, virtualConsole });
  await wait(850);
  const { window: w } = dom;
  const { CWB } = w;
  assert.ok(CWB && CWB.ai, 'AI public API should be installed');

  CWB.db.custom.v4_files = [{ id:'file-contract', title:'合同来源', content:'已核验来源片段', category:'测试资料', updated_at:'2026-08-19T09:00:00.000Z', schema_version:8 }];
  const sourceContext = CWB.ai.context.build({ purpose:'knowledge_search', target_collection:'v4_files', target_record_id:'file-contract', records:[] });
  const source = sourceContext.sources.find(item => item.collection === 'v4_files' && item.record_id === 'file-contract');
  assert.ok(source && source.source_fingerprint, 'tracked local sources must carry a freshness fingerprint');
  CWB.db.custom.v4_ai_sources = [source];
  CWB.db.custom.v4_ai_audit = [];
  CWB.db.custom.v4_ai_drafts = [];
  CWB.db.custom.v4_ai_suggestions = [];
  CWB.db.custom.v4_ai_consents = [];

  const auditShape = w.CWBAI.createAuditEntry({ action:'contract', purpose:'work_summary', source_ids:[source.id], source_text_hash:'hash-1', suggestion_id:'suggestion-1', draft_id:'draft-1', context_scope:{ page_view:'ai' }, requested_count:8, eligible_count:6, matched_count:5, context_limit:240, excluded_source_count:2 });
  assert.deepEqual(Array.from(auditShape.source_ids), [source.id]);
  assert.equal(auditShape.source_text_hash, 'hash-1');
  assert.equal(auditShape.suggestion_id, 'suggestion-1');
  assert.equal(auditShape.draft_id, 'draft-1');
  assert.equal(auditShape.context_scope.page_view, 'ai');
  assert.equal(auditShape.requested_count, 8);
  assert.equal(auditShape.eligible_count, 6);
  assert.equal(auditShape.matched_count, 5);
  assert.equal(auditShape.context_limit, 240);
  assert.equal(auditShape.excluded_source_count, 2);
  assert.deepEqual(Array.from(auditShape.sensitive_categories), []);

  const provider = { id:'contract-provider', key:'custom', model:'contract-model', enabled:true, allowedPurposes:['work_summary'], dailyQuota:10 };
  const student = CWB.db.students.find(item => item && item.id);
  const otherStudent = CWB.db.students.find(item => item && item.id && item.id !== student.id);
  assert.ok(student, 'demo student should be available');
  assert.ok(otherStudent, 'a second demo student should be available');
  const scopedContext = CWB.ai.context.build({
    purpose:'student_summary', student_id:student.id,
    records:[
      { id:'scoped-current', student_id:student.id, full_name:student.full_name },
      { id:'scoped-other', student_id:otherStudent.id, full_name:otherStudent.full_name },
    ],
  });
  assert.equal(scopedContext.records.length, 1, 'explicit context must exclude records from another student');
  assert.equal(scopedContext.records[0].record_id, 'scoped-current');
  const originalSendChat = w.CWBAI.sendChat;
  w.CWBAI.sendChat = async () => ({ text:'连接测试成功' });
  const connectionTest = await CWB.ai.providers.test({ provider, apiKey:'test-key-not-real' });
  w.CWBAI.sendChat = originalSendChat;
  assert.equal(connectionTest.ok, true, 'provider connection test should not require business context');
  assert.ok(CWB.db.custom.v4_ai_audit.some(item => item.action === 'provider_test' && item.status === 'completed'));
  const consent = CWB.ai.consents.authorize({ purpose:'student_summary', student_id:student.id, categories:['identity'], fields:['full_name'], context_scope:{ student_id:student.id, page_view:'students' } });
  const consentAudit = CWB.db.custom.v4_ai_audit.at(-1);
  assert.equal(consentAudit.action, 'consent_authorize');
  assert.deepEqual(Array.from(consentAudit.sensitive_categories), ['identity']);
  assert.deepEqual(Array.from(consentAudit.sensitive_fields), ['full_name']);
  assert.equal(consentAudit.context_scope.student_id, student.id);
  assert.equal(consent.granted, true);
  assert.ok(consent.ready && typeof consent.ready.then === 'function', 'AI consent writes should expose a durable completion promise');
  await consent.ready;
  assert.equal(consent.persistence_state, 'committed', 'AI consent should report committed only after persistence completes');
  assert.equal(typeof CWB.ai.awaitMutation, 'function', 'AI public API should expose a persistence waiter');
  const runContext = CWB.ai.context.build({ purpose:'work_summary', records:[], source_ids:[source.id] });
  const run = await CWB.ai.run({
    provider, purpose:'work_summary', apiKey:'test-key-not-real', context:runContext,
    send:async () => ({ text:'一份可编辑工作草稿' }),
  });
  assert.ok(run.audit.id && run.draft.id && run.suggestion.id, 'AI run should create audit, draft and suggestion identifiers');
  assert.equal(run.draft.purpose, 'work_summary', 'AI drafts should retain the canonical purpose');
  assert.ok(run.audit.request_id, 'AI run should create a request identifier');
  assert.equal(typeof run.audit.duration_ms, 'number');
  assert.equal(run.audit.result_kind, 'general');
  assert.equal(run.suggestion.audit_id, run.audit.id);
  assert.equal(run.draft.audit_id, run.audit.id);
  assert.equal(run.audit.draft_id, run.draft.id, 'generation audit should point to its draft');
  assert.equal(run.audit.suggestion_id, run.suggestion.id, 'generation audit should point to its suggestion');
  assert.equal(run.audit.matched_count, run.context.matched_count, 'generation audit should retain the actual outbound context count');
  assert.deepEqual(Array.from(run.suggestion.source_ids), [source.id], 'suggestion should retain the selected source');
  const duplicate = CWB.ai.suggestions.create(Object.assign({}, run.suggestion, { id:'duplicate-contract-attempt', updated_at:new Date().toISOString() }));
  assert.equal(duplicate.id, run.suggestion.id, 'identical pending suggestions should reuse the existing suggestion');
  assert.equal(duplicate.duplicate_count, 1, 'deduplicated suggestions should count repeated generation attempts');
  assert.ok(CWB.db.custom.v4_ai_audit.some(item => item.action === 'suggestion_deduplicated' && item.suggestion_id === run.suggestion.id));
  const accepted = CWB.ai.suggestions.accept(run.suggestion.id, { confirmed:true });
  const task = CWB.ai.suggestions.convert(accepted.id, 'task');
  assert.equal(task.ai_suggestion_id, accepted.id);
  assert.equal(task.ai_audit_id, run.audit.id);
  assert.equal(task.ai_draft_id, run.draft.id);
  assert.equal(task.ai_provider_id, provider.id);
  assert.equal(task.ai_model, provider.model);
  assert.deepEqual(Array.from(task.ai_source_ids), [source.id]);
  assert.ok(task.ai_confirmation_audit_id, 'converted task should retain confirmation audit');
  assert.ok(CWB.db.custom.v4_ai_audit.some(item => item.id === task.ai_confirmation_audit_id && item.suggestion_id === accepted.id));

  const summarySuggestion = CWB.ai.suggestions.create({
    purpose:'work_summary', title:'区间总结', summary:'总结草稿', status:'review', student_id:student.id,
    provider_id:provider.id, model:provider.model, audit_id:run.audit.id, source_ids:[source.id], sources:[source],
    payload:{ draft_id:run.draft.id }, context_scope:{ student_id:student.id, page_view:'ai', dateRange:{ from:'2026-08-01', to:'2026-08-19' } },
  });
  const worklog = CWB.ai.confirmWorkSummary({
    text:'已人工核对的工作总结', range:{ from:'2026-08-01', to:'2026-08-19' }, sources:[{ type:'task' }],
    suggestion_id:summarySuggestion.id, draft_id:run.draft.id, audit_id:run.audit.id, provider_id:provider.id, model:provider.model,
    purpose:'work_summary', source_ids:[source.id], context_scope:summarySuggestion.context_scope, ai_generated:true,
  });
  assert.equal(worklog.ai_suggestion_id, summarySuggestion.id);
  assert.equal(worklog.ai_audit_id, run.audit.id);
  assert.equal(worklog.ai_draft_id, run.draft.id);
  assert.equal(worklog.ai_provider_id, provider.id);
  assert.equal(worklog.ai_model, provider.model);
  assert.deepEqual(Array.from(worklog.ai_source_ids), [source.id]);
  assert.ok(worklog.ai_confirmation_audit_id);
  assert.equal(CWB.ai.suggestions.list({ status:'converted_worklog' }).some(item => item.id === summarySuggestion.id), true);
  assert.throws(() => CWB.ai.confirmWorkSummary({
    text:'重复确认不应再次写入', range:{ from:'2026-08-01', to:'2026-08-19' }, sources:[{ type:'task' }],
    suggestion_id:summarySuggestion.id, draft_id:run.draft.id, audit_id:run.audit.id, provider_id:provider.id, model:provider.model,
    purpose:'work_summary', source_ids:[source.id], context_scope:summarySuggestion.context_scope, ai_generated:true,
  }), /WORK_SUMMARY_ALREADY_CONFIRMED/);

  const staleSummary = CWB.ai.suggestions.create({
    id:'stale-summary-source', purpose:'work_summary', title:'来源变化后的总结', status:'accepted', student_id:student.id,
    source_ids:[source.id], payload:{ text:'不应直接写入正式留痕' }, context_scope:{ student_id:student.id, page_view:'ai' },
  });
  const sourceRecord = CWB.db.custom.v4_files.find(item => item.id === 'file-contract');
  sourceRecord.content = '来源内容已被修改';
  assert.throws(() => CWB.ai.confirmWorkSummary({
    text:'来源已经变化的总结', suggestion_id:staleSummary.id, source_ids:[source.id], ai_generated:true,
  }), /AI_SOURCE_REVIEW_REQUIRED/, 'work-summary confirmation must recheck source freshness before writing a fact record');
  sourceRecord.content = '已核验来源片段';

  const certificateDraft = CWB.ai.createCertificateDraft({
    provider_id:provider.id, model:provider.model, audit_id:run.audit.id, source_attachment_id:'attachment-contract',
    source_ids:[source.id], context_scope:{ page_view:'ai', target_collection:'rewards' }, title:'证书草稿', level:'国家级',
  });
  const reward = CWB.ai.confirmCertificateDraft(certificateDraft.id, { student_id:student.id, title:'国家级证书', level:'国家级' });
  assert.equal(reward.student_id, student.id);
  assert.equal(reward.ai_draft_id, certificateDraft.id);
  assert.equal(reward.ai_audit_id, run.audit.id);
  assert.equal(reward.ai_provider_id, provider.id);
  assert.equal(reward.ai_model, provider.model);
  assert.deepEqual(Array.from(reward.ai_source_ids), [source.id]);
  assert.equal(reward.ai_source_attachment_id, 'attachment-contract');
  assert.equal(CWB.db.custom.v4_ai_drafts.find(item => item.id === certificateDraft.id).purpose, 'certificate_recognition');
  assert.ok(reward.ai_confirmation_audit_id);
  assert.equal(CWB.db.custom.v4_ai_drafts.find(item => item.id === certificateDraft.id).status, 'confirmed');

  // Deferred AI output is used by multi-record workflows that must commit
  // their generation audit and domain draft in one final save.
  const deferredProvider = { id:'deferred-output-provider', key:'custom', model:'deferred-demo', enabled:true, allowedPurposes:['work_summary'], dailyQuota:10 };
  const deferredSyncParts = [];
  const originalDeferredSync = w.CWB_V4_SYNC;
  w.CWB_V4_SYNC = part => { deferredSyncParts.push(part); return Promise.resolve({ ok:true, part:part || 'all' }); };
  const deferredRun = await CWB.ai.run({
    provider:deferredProvider, purpose:'work_summary', apiKey:'test-key-not-real', records:[],
    createSuggestion:false, persistOutput:false, send:async () => ({ text:'延迟保存工作草稿' }),
  });
  assert.ok(deferredRun.audit && deferredRun.draft, 'deferred AI run should still return its generated objects');
  assert.equal(deferredSyncParts.length, 0, 'deferred AI output must not write before the caller commits its final mutation');
  w.CWB_V4_SYNC = originalDeferredSync;

  // Psychological voice confirmation spans psych facts, the AI draft and its
  // confirmation audit. A rejected second collection save must roll back all
  // three in-memory collections and leave the draft retryable.
  const psychDraft = w.CWBAIWorkflow.normalizeDraft({
    id:'psych-contract-rollback', kind:'psych_voice_transcription', purpose:'psych_note_draft', status:'draft',
    student_id:student.id, payload:{ text:'待人工核对的谈话整理' }, provider_id:provider.id, model:provider.model,
  });
  CWB.db.custom.v4_ai_drafts.push(psychDraft);
  const psychCountBefore = CWB.db.psych.length;
  const psychAuditCountBefore = CWB.db.custom.v4_ai_audit.filter(item => item.action === 'psych_note_confirmed').length;
  const originalPsychSync = w.CWB_V4_SYNC;
  w.CWB_V4_SYNC = () => Promise.reject(new Error('TEST_PSYCH_SAVE_FAILURE'));
  await assert.rejects(() => CWB.ai.voice.confirm(psychDraft.id, {
    student_id:student.id, text:'人工核对后的谈话记录', screen_date:'2026-08-20',
    status:'跟踪中', level:'正常', handler:'辅导员', suggestion:'三日后回访',
  }), /TEST_PSYCH_SAVE_FAILURE/);
  assert.equal(CWB.db.psych.length, psychCountBefore, 'failed psych confirmation must not leave a psych fact');
  assert.equal(CWB.db.custom.v4_ai_drafts.find(item => item.id === psychDraft.id).status, 'draft', 'failed psych confirmation must keep the draft retryable');
  assert.equal(CWB.db.custom.v4_ai_audit.filter(item => item.action === 'psych_note_confirmed').length, psychAuditCountBefore, 'failed psych confirmation must not leave a confirmation audit');
  w.CWB_V4_SYNC = originalPsychSync;
  const psychRecord = await CWB.ai.voice.confirm(psychDraft.id, {
    student_id:student.id, text:'人工核对后的谈话记录', screen_date:'2026-08-20',
    status:'跟踪中', level:'正常', handler:'辅导员', suggestion:'三日后回访',
  });
  assert.equal(psychRecord.ai_draft_id, psychDraft.id);
  assert.equal(CWB.db.psych.filter(item => item.ai_draft_id === psychDraft.id).length, 1, 'successful psych retry must create one fact');
  await assert.rejects(() => CWB.ai.voice.confirm(psychDraft.id, { student_id:student.id, text:'重复确认' }), /AI_PSYCH_DRAFT_NOT_AVAILABLE/);

  const visionProvider = { id:'vision-contract-provider', key:'custom', model:'vision-contract-model', enabled:true, supportsVision:true, allowedPurposes:['certificate_recognition'], dailyQuota:10 };
  let visionCalls = 0;
  const visionConsent = CWB.ai.consents.authorize({
    purpose:'certificate_recognition', categories:['attachments'], source_attachment_id:'attachment-vision',
    context_scope:{ page_view:'ai', target_view:'rewards', target_collection:'rewards' },
  });
  const visionContext = CWB.ai.context.build({ purpose:'certificate_recognition', page_view:'ai', target_view:'rewards', target_collection:'rewards', sensitiveCategories:['attachments'], records:[] });
  const visionRun = await CWB.ai.run({
    provider:visionProvider, purpose:'certificate_recognition', context:visionContext, sensitive:true,
    sensitiveCategories:['attachments'], consent_id:visionConsent.id, source_attachment_id:'attachment-vision',
    messages:[w.CWBAI.buildVisionMessage('识别证书', 'data:image/png;base64,abc')], createDraft:false, createSuggestion:false,
    send:async () => { visionCalls += 1; return { text:'{"title":"证书"}' }; },
  });
  assert.equal(visionCalls, 1, 'an attachment-authorized vision request should reach the sender once');
  assert.deepEqual(Array.from(visionRun.audit.sensitive_categories), ['attachments']);
  assert.equal(visionRun.audit.source_attachment_id, 'attachment-vision');
  assert.equal(CWB.db.custom.v4_ai_consents.find(item => item.id === visionConsent.id).used_at != null, true);
  const textOnlyVisionProvider = Object.assign({}, visionProvider, { id:'text-only-vision-provider', supportsVision:false });
  const unsupportedVisionConsent = CWB.ai.consents.authorize({
    purpose:'certificate_recognition', categories:['attachments'], source_attachment_id:'attachment-unsupported-vision',
    context_scope:{ page_view:'ai', target_view:'rewards', target_collection:'rewards' },
  });
  await assert.rejects(() => CWB.ai.run({
    provider:textOnlyVisionProvider, purpose:'certificate_recognition', context:visionContext, sensitive:true,
    sensitiveCategories:['attachments'], consent_id:unsupportedVisionConsent.id, source_attachment_id:'attachment-unsupported-vision',
    messages:[w.CWBAI.buildVisionMessage('识别证书', 'data:image/png;base64,abc')], createDraft:false, createSuggestion:false,
    send:async () => { throw new Error('text-only provider must reject images'); },
  }), /AI_PROVIDER_VISION_UNSUPPORTED/);
  assert.equal(CWB.db.custom.v4_ai_consents.find(item => item.id === unsupportedVisionConsent.id).used_at, '', 'unsupported vision providers must not consume attachment consent');
  await assert.rejects(() => CWB.ai.run({
    provider:visionProvider, purpose:'certificate_recognition', source_attachment_id:'attachment-unbound',
    messages:[w.CWBAI.buildVisionMessage('识别证书', 'data:image/png;base64,abc')], createDraft:false, createSuggestion:false,
    send:async () => { throw new Error('image request must be blocked'); },
  }), /AI_ATTACHMENT_CONSENT_REQUIRED/);
  const noKeyConsent = CWB.ai.consents.authorize({
    purpose:'certificate_recognition', categories:['attachments'], source_attachment_id:'attachment-no-key',
    context_scope:{ page_view:'ai', target_view:'rewards', target_collection:'rewards' },
  });
  const noKeyContext = CWB.ai.context.build({ purpose:'certificate_recognition', page_view:'ai', target_view:'rewards', target_collection:'rewards', sensitiveCategories:['attachments'], records:[] });
  await assert.rejects(() => CWB.ai.run({
    provider:visionProvider, purpose:'certificate_recognition', context:noKeyContext, sensitive:true,
    sensitiveCategories:['attachments'], consent_id:noKeyConsent.id, source_attachment_id:'attachment-no-key',
    messages:[w.CWBAI.buildVisionMessage('识别证书', 'data:image/png;base64,abc')], createDraft:false, createSuggestion:false,
  }), /AI_API_KEY_REQUIRED/);
  assert.equal(CWB.db.custom.v4_ai_consents.find(item => item.id === noKeyConsent.id).used_at, '', 'missing API keys must not consume attachment consent');

  const feedback = CWB.ai.suggestions.feedback(run.suggestion.id, 'helpful');
  assert.ok(feedback.ready && typeof feedback.ready.then === 'function', 'suggestion feedback should expose durable completion');
  await CWB.ai.awaitMutation(feedback);
  assert.equal(feedback.value, 'helpful', 'suggestion feedback should be recorded');
  assert.equal(CWB.ai.suggestions.feedbackState(run.suggestion.id).label, '有帮助');
  assert.equal(CWB.db.custom.v4_ai_audit.filter(item => item.action === 'suggestion_feedback').length, 1);

  const batchReviewA = CWB.ai.suggestions.create({ id:'batch-review-contract-a', purpose:'work_summary', title:'批量审阅 A', status:'review', payload:{ text:'A' }, persist:false });
  const batchReviewB = CWB.ai.suggestions.create({ id:'batch-review-contract-b', purpose:'work_summary', title:'批量审阅 B', status:'review', payload:{ text:'B' }, persist:false });
  const batchReview = CWB.ai.suggestions.reviewMany([batchReviewA.id, batchReviewB.id], 'rejected', { confirmed:true });
  await w.__CWB_LAST_SAVE_PROMISE__;
  assert.equal(batchReview.updated.length, 2, 'batch review should update every eligible suggestion');
  assert.equal(CWB.ai.suggestions.list({ query:'批量审阅 A' })[0].status, 'rejected');
  assert.ok(CWB.db.custom.v4_ai_audit.some(item => item.action === 'suggestion_batch_review' && item.result_kind === 'rejected'));

  const originalBatchSync = w.CWB_V4_SYNC;
  w.CWB_V4_SYNC = () => Promise.reject(new Error('TEST_BATCH_REVIEW_SAVE_FAILURE'));
  const failedBatchA = CWB.ai.suggestions.create({ id:'batch-review-contract-fail-a', purpose:'work_summary', title:'失败批量 A', status:'review', payload:{ text:'A' }, persist:false });
  const failedBatchB = CWB.ai.suggestions.create({ id:'batch-review-contract-fail-b', purpose:'work_summary', title:'失败批量 B', status:'review', payload:{ text:'B' }, persist:false });
  CWB.ai.suggestions.reviewMany([failedBatchA.id, failedBatchB.id], 'rejected', { confirmed:true });
  await assert.rejects(w.__CWB_LAST_SAVE_PROMISE__, /TEST_BATCH_REVIEW_SAVE_FAILURE/);
  assert.equal(CWB.ai.suggestions.list({ query:'失败批量 A' })[0].status, 'review', 'failed batch review must restore suggestion state');
  assert.equal(CWB.ai.suggestions.list({ query:'失败批量 B' })[0].status, 'review', 'failed batch review must restore every suggestion');
  w.CWB_V4_SYNC = originalBatchSync;

  const publicFailure = CWB.ai.suggestions.create({ id:'public-ready-failure', purpose:'work_summary', title:'公共等待失败', status:'review', payload:{ text:'待保存' }, persist:false });
  const originalPublicSync = w.CWB_V4_SYNC;
  w.CWB_V4_SYNC = () => Promise.reject(new Error('TEST_PUBLIC_READY_FAILURE'));
  const rejectedPublic = CWB.ai.suggestions.reject(publicFailure.id);
  assert.equal(rejectedPublic.persistence_state, 'pending', 'public mutation should start in pending state');
  await assert.rejects(() => rejectedPublic.ready, /TEST_PUBLIC_READY_FAILURE/);
  assert.equal(rejectedPublic.persistence_state, 'failed', 'public mutation should expose failed persistence state');
  assert.equal(CWB.ai.suggestions.list({ query:'公共等待失败' })[0].status, 'review', 'public mutation failure should restore the prior state');
  w.CWB_V4_SYNC = originalPublicSync;

  const asyncPublic = CWB.ai.suggestions.create({ id:'public-ready-async', purpose:'work_summary', title:'公共异步接口', status:'review', payload:{ text:'异步接口' }, persist:false });
  const acceptedAsync = await CWB.ai.suggestions.acceptAsync(asyncPublic.id, { confirmed:true });
  assert.equal(acceptedAsync.status, 'accepted', 'async public mutation should resolve the committed object');
  assert.equal(acceptedAsync.persistence_state, 'committed', 'async public mutation should resolve after persistence');

  const localNotice = await CWB.ai.notice.preview({ text:'请各班于2026年9月1日前提交材料。', source:'本地预览测试' });
  assert.ok(localNotice.source_record && localNotice.source_record.id);
  assert.ok(localNotice.audit_id);
  assert.equal(localNotice.audit.source_text_hash.length > 0, true);
  const confirmedNotice = CWB.ai.notice.confirm(localNotice, { confirmed:true });
  assert.ok(confirmedNotice.suggestion.source_ids.includes(localNotice.source_record.id));
  assert.equal(confirmedNotice.suggestion.audit_id, localNotice.audit_id);
  assert.ok(CWB.db.custom.v4_ai_audit.some(item => item.action === 'notice_confirm' && item.suggestion_id === confirmedNotice.suggestion.id));
  const quality = CWB.ai.metrics.summary({ days:30 });
  assert.ok(quality.total >= 2, 'AI metrics should include completed generation and provider test records');
  assert.equal(typeof quality.latency_ms.p95, 'number');
  assert.ok(quality.generation_total >= 1, 'AI metrics should expose generation-only totals');
  assert.ok(quality.provider_test_total >= 1, 'AI metrics should separate provider connection tests');
  assert.ok(quality.by_purpose.some(item => item.name === 'work_summary'), 'AI metrics should group generations by purpose');
  assert.ok(quality.by_provider.some(item => item.name === 'custom'), 'AI metrics should group generations by provider');
  assert.equal(quality.feedback_total, 1, 'AI metrics should count the latest feedback per suggestion');
  assert.equal(quality.feedback_by_value.find(item => item.name === 'helpful').count, 1);
  const localDay = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
  const todayValue = localDay(new Date());
  const generationToday = CWB.db.custom.v4_ai_audit.filter(item => item.action === 'generate' && localDay(item.created_at) === todayValue).length;
  const completedGenerationToday = CWB.db.custom.v4_ai_audit.filter(item => item.action === 'generate' && item.status === 'completed' && localDay(item.created_at) === todayValue).length;
  const connectionTestsToday = CWB.db.custom.v4_ai_audit.filter(item => item.action === 'provider_test' && localDay(item.created_at) === todayValue).length;
  CWB.db.custom.v4_ai_audit.push({ action:'consent_authorize', status:'completed', sourceCount:99, created_at:new Date().toISOString() });
  const usage = CWB.ai.metrics.usage();
  assert.equal(usage.total, generationToday, 'today usage must count generation audits only');
  assert.equal(usage.completed, completedGenerationToday, 'today success count must count generation audits only');
  assert.equal(usage.connection_tests, connectionTestsToday, 'connection tests must be reported separately from generation usage');

  const parsedNotice = await CWB.ai.notice.parse({
    text:'请于2026年9月10日前提交材料。', source:'解析测试',
    mockResponse:JSON.stringify({ title:'材料通知', deadlines:[{ date:'2026-09-10', label:'截止', evidence:'请于2026年9月10日前提交材料。' }], key_points:['提交材料'], todos:['完成提交'], evidence:['请于2026年9月10日前提交材料。'], needs_verification:[] }),
  });
  assert.ok(parsedNotice.suggestion.source_ids.length === 1);
  assert.ok(CWB.db.custom.v4_ai_sources.some(item => item.id === parsedNotice.suggestion.source_ids[0]));
  assert.equal(parsedNotice.audit.source_ids[0], parsedNotice.suggestion.source_ids[0]);

  const noStudentTalk = CWB.ai.suggestions.create({ purpose:'student_followup', title:'无学生谈话', status:'accepted', human_confirmed_at:'2026-08-20T10:00:00.000Z', confirmation_method:'测试人工确认', payload:{ text:'不能创建无对象谈话' } });
  assert.throws(() => CWB.ai.suggestions.convert(noStudentTalk.id, 'talk'), /AI_TALK_STUDENT_REQUIRED/);
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS ai-contract');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
