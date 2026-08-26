const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = path.join(__dirname, '..');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Could not load|Not implemented|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<script defer src="src/core/cwb-ai.js" data-cwb-ai></script>', '<script>' + fs.readFileSync(path.join(root, 'src/core/cwb-ai.js'), 'utf8') + '</script>')
    .replace('<script defer src="src/core/cwb-ai-workflow.js" data-cwb-ai-workflow></script>', '<script>' + fs.readFileSync(path.join(root, 'src/core/cwb-ai-workflow.js'), 'utf8') + '</script>');
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://ai-context.local/', pretendToBeVisual:true, virtualConsole });
  await wait(850);
  const { window: w } = dom;
  const student = w.CWB.db.students.find(item => item && item.id);
  assert.ok(student, 'demo student should be available');
  const otherStudent = w.CWB.db.students.find(item => item && item.id && item.id !== student.id);
  assert.ok(otherStudent, 'a second demo student should be available for scope isolation');
  w.CWB.db.custom.v4_ai_sources = w.CWB.db.custom.v4_ai_sources || [];
  w.CWB.db.custom.v4_ai_suggestions = w.CWB.db.custom.v4_ai_suggestions || [];
  w.CWB.db.custom.v4_ai_audit = w.CWB.db.custom.v4_ai_audit || [];
  w.CWB.db.custom.v4_ai_consents = w.CWB.db.custom.v4_ai_consents || [];
  w.CWB.db.tasks.push(w.CWB.norm.task({ id:'ai-context-task', title:'上下文测试任务', student_id:student.id, student_number:student.student_number, due:'2026-08-17' }));
  w.CWB.db.tasks.push(w.CWB.norm.task({ id:'ai-context-other-task', title:'其他学生任务', student_id:otherStudent.id, student_number:otherStudent.student_number, due:'2026-08-17' }));
  const context = w.CWB.ai.context.build({ purpose:'student_summary', student_id:student.id, includeSensitive:false });
  assert.ok(context.records.some(item => item.record_id === 'ai-context-task'), 'student-linked task should be in context');
  assert.equal(context.records.some(item => item.record_id === 'ai-context-other-task'), false, 'student context must exclude another student in the same page scope');
  const linked = context.records.find(item => item.record_id === 'ai-context-task');
  assert.equal(linked.student_id, student.id);
  assert.equal(linked.student_number, '[已脱敏]');
  const preview = w.CWB.ai.context.preview({ purpose:'student_summary', student_id:student.id });
  assert.ok(preview.sensitiveCategories.includes('identity'), 'preview should expose identity authorization boundary');
  const schedule = { id:'ai-context-schedule', class_name:student.class_name, term:'2026-2027-1', weekday:1, start_section:1, end_section:2, course:'上下文课表', updated_at:'2026-08-19' };
  w.CWB.db.custom.v4_class_schedules = [schedule];
  const scheduleContext = w.CWB.ai.context.build({ purpose:'workday_actions', target_view:'schedules', target_collection:'v4_class_schedules', target_record_id:schedule.id });
  assert.ok(scheduleContext.records.some(item => item.collection === 'v4_class_schedules' && item.record_id === schedule.id), 'schedule records should be available to targeted AI context');
  const studentScheduleContext = w.CWB.ai.context.build({ purpose:'student_summary', student_id:student.id, target_view:'schedules', target_collection:'v4_class_schedules', target_record_id:schedule.id });
  assert.ok(studentScheduleContext.records.some(item => item.record_id === schedule.id), 'an explicitly selected unlinked target may enter context');
  assert.equal(studentScheduleContext.sources.find(item => item.record_id === schedule.id).student_id, '', 'unlinked target must not be assigned to the selected student');
  const otherTargetContext = w.CWB.ai.context.build({ purpose:'student_summary', student_id:student.id, target_view:'tasks', target_collection:'tasks', target_record_id:'ai-context-other-task' });
  assert.equal(otherTargetContext.records.some(item => item.record_id === 'ai-context-other-task'), false, 'a target record from another student must remain excluded');
  const capped = w.CWB.ai.context.build({ purpose:'work_summary', records:Array.from({ length:300 }, (_, index) => ({ id:'capped-' + index, title:'记录 ' + index })) });
  assert.equal(capped.records.length, 240, 'explicit AI context must be bounded');
  assert.equal(capped.eligible_count, 300, 'context should report eligible records before the hard limit');
  assert.equal(capped.matched_count, 240, 'context should report records actually included after the hard limit');
  assert.equal(capped.truncated, true, 'bounded context must disclose truncation');
  const consent = w.CWB.ai.consents.authorize({ purpose:'student_summary', student_id:student.id, categories:['identity'], fields:[] });
  assert.equal(consent.granted, true);
  assert.equal(w.CWB.db.custom.v4_ai_consents.at(-1).id, consent.id);
  const source = w.CWBAIWorkflow.normalizeSource({ kind:'record', collection:'tasks', record_id:'ai-context-task', student_id:student.id, title:'上下文测试任务', excerpt:'来源片段' });
  const otherSource = w.CWBAIWorkflow.normalizeSource({ id:'other-student-source', kind:'record', collection:'tasks', record_id:'ai-context-other-task', student_id:otherStudent.id, title:'其他学生来源', excerpt:'不应混入当前学生' });
  w.CWB.db.custom.v4_ai_sources.push(otherSource);
  const crossStudentContext = w.CWB.ai.context.build({ purpose:'student_summary', student_id:student.id, source_ids:[otherSource.id] });
  assert.equal(crossStudentContext.sources.some(item => item.id === otherSource.id), false, 'record sources from another student must be excluded');
  assert.ok(crossStudentContext.excluded_source_ids.includes(otherSource.id), 'cross-student sources should be visible as excluded scope evidence');
  const suggestion = w.CWB.ai.suggestions.create({
    purpose:'student_followup', title:'测试跟进建议', summary:'建立一次回访任务', student_id:student.id,
    risk_level:'high', sources:[source], sensitive_categories:[], payload:{ text:'请在三天内回访并记录结果。' },
  });
  const crossStudentSuggestion = w.CWB.ai.suggestions.create({ purpose:'student_followup', title:'跨学生来源', summary:'不能转化', student_id:student.id, status:'accepted', human_confirmed_at:'2026-08-19T10:00:00.000Z', confirmation_method:'测试人工确认', sources:[otherSource], payload:{ text:'不应转化' } });
  assert.throws(() => w.CWB.ai.suggestions.convert(crossStudentSuggestion.id, 'task'), /AI_SUGGESTION_SOURCE_SCOPE_MISMATCH/);
  const unconfirmedAccepted = w.CWB.ai.suggestions.create({ purpose:'student_followup', title:'未确认建议', summary:'不能直接转化', student_id:student.id, status:'accepted', payload:{ text:'缺少人工确认链' } });
  assert.throws(() => w.CWB.ai.suggestions.convert(unconfirmedAccepted.id, 'task'), /AI_SUGGESTION_CONFIRM_REQUIRED/);
  const sourceContext = w.CWB.ai.context.build({ purpose:'student_followup', student_id:student.id, source_ids:[source.id] });
  assert.ok(sourceContext.sources.some(item => item.id === source.id), 'selected directory source should be included in context');
  assert.equal(sourceContext.selected_source_ids.length, 1);
  assert.equal(sourceContext.selected_source_ids[0], source.id);
  const staleSource = w.CWBAIWorkflow.normalizeSource({ id:'stale-context-source', kind:'web', url:'https://example.com/stale', title:'需重新核验', status:'needs_review', verification_status:'needs_review' });
  w.CWB.db.custom.v4_ai_sources.push(staleSource);
  const staleContext = w.CWB.ai.context.build({ purpose:'knowledge_search', student_id:student.id, source_ids:[staleSource.id] });
  assert.equal(staleContext.sources.some(item => item.id === staleSource.id), false, 'unverified web sources must not enter outbound context');
  assert.ok(staleContext.excluded_source_ids.includes(staleSource.id), 'excluded web sources must be visible to preview/audit layers');
  const staleSuggestion = w.CWB.ai.suggestions.create({
    purpose:'knowledge_search', title:'失效来源转化测试', summary:'不能直接转化', sources:[staleSource], payload:{ text:'需要重新核验来源' },
  });
  w.CWB.ai.suggestions.accept(staleSuggestion.id);
  assert.throws(() => w.CWB.ai.suggestions.convert(staleSuggestion.id, 'task'), /AI_SUGGESTION_SOURCE_REVIEW_REQUIRED/);
  assert.equal(suggestion.status, 'draft');
  assert.equal(w.CWB.ai.suggestions.list({ query:'测试跟进建议' })[0].id, suggestion.id);
  assert.equal(w.CWB.ai.suggestions.list({ purpose:'student_followup', source_id:source.id })[0].id, suggestion.id);
  assert.equal(w.CWB.ai.suggestions.list({ risk_level:'high' })[0].id, suggestion.id);
  const accepted = w.CWB.ai.suggestions.accept(suggestion.id, { confirmed:true });
  assert.equal(accepted.status, 'accepted');
  assert.ok(accepted.human_confirmed_at, 'accepted suggestions must retain human confirmation time');
  const task = w.CWB.ai.suggestions.convert(suggestion.id, 'task');
  assert.equal(task.student_id, student.id);
  assert.equal(task.ai_suggestion_id, suggestion.id);
  assert.equal(task.student_name, student.full_name);
  assert.equal(task.ai_source_ids.length, 1);
  assert.equal(task.ai_source_ids[0], source.id);
  assert.equal(w.CWB.ai.suggestions.list({ status:'converted_task' })[0].status, 'converted_task');
  for (const target of ['talk', 'worklog']) {
    const followup = w.CWB.ai.suggestions.create({
      purpose:'student_followup', title:`转${target}测试`, summary:'保留学生关联和来源', student_id:student.id,
      sources:[source], payload:{ text:'请保留来源并建立人工确认记录。' },
    });
    w.CWB.ai.suggestions.accept(followup.id);
    const converted = w.CWB.ai.suggestions.convert(followup.id, target);
    assert.equal(converted.student_id, student.id);
    assert.equal(converted.student_name, student.full_name);
    assert.equal(converted.ai_source_ids.length, 1);
    assert.equal(converted.ai_source_ids[0], source.id);
    assert.equal(w.CWB.ai.suggestions.list({ status:`converted_${target}` })[0].status, `converted_${target}`);
  }
  const draft = w.CWB.ai.suggestions.create({ purpose:'student_followup', title:'查看状态测试', student_id:student.id, payload:{ text:'待查看' } });
  assert.equal(w.CWB.ai.suggestions.viewed(draft.id).status, 'viewed');
  const provider = { id:'context-provider', key:'custom', model:'context-demo', enabled:true, allowedPurposes:['student_summary'], dailyQuota:10 };
  let sentMessages = [];
  const originalSendChat = w.CWBAI.sendChat;
  w.CWBAI.sendChat = async (_provider, messages) => { sentMessages = messages; return { text:'已基于脱敏上下文生成' }; };
  await w.CWB.ai.run({ provider, purpose:'student_summary', apiKey:'test-key-not-real', messages:[{ role:'user', content:`请处理内部关联 ${student.id}` }], records:[{ id:'outbound-record', student_id:student.id, student_number:student.student_number, full_name:student.full_name, summary:'可发送摘要' }], createSuggestion:false });
  w.CWBAI.sendChat = originalSendChat;
  const outbound = JSON.stringify(sentMessages);
  assert.equal(outbound.includes(student.id), false, 'internal student_id must not be sent by default');
  assert.equal(outbound.includes(student.student_number), false, 'student number must not be sent by default');
  assert.equal(outbound.includes(student.full_name), false, 'student name must not be sent by default');
  assert.equal(outbound.includes(student.id), false, 'internal student_id must not be sent even when it appears in the user prompt');
  await assert.rejects(() => w.CWB.ai.run({ provider, purpose:'student_summary', sensitiveCategories:['identity'], records:[{ id:'unauthorized-record', student_id:student.id, full_name:student.full_name }], createSuggestion:false, send:async () => { throw new Error('should not send'); } }), /AI_SENSITIVE_CONSENT_REQUIRED/);
  assert.equal(w.CWB.db.custom.v4_ai_audit.at(-1).error, 'AI_SENSITIVE_CONSENT_REQUIRED');
  assert.equal(w.CWB.db.custom.v4_ai_audit.at(-1).sensitiveRequested, true);
  assert.equal(w.CWB.db.custom.v4_ai_audit.at(-1).sensitiveAuthorized, false, 'missing consent must not be recorded as authorized');
  const preAuthorizedContext = w.CWB.ai.context.build({ purpose:'student_summary', student_id:student.id, sensitiveCategories:['identity'], records:[{ id:'pre-authorized-record', student_id:student.id, full_name:student.full_name, summary:'上下文授权绕过测试' }] });
  assert.deepEqual(preAuthorizedContext.authorizedCategories, ['identity']);
  await assert.rejects(() => w.CWB.ai.run({ provider, purpose:'student_summary', context:preAuthorizedContext, createSuggestion:false, send:async () => { throw new Error('context authorization must not bypass consent'); } }), /AI_SENSITIVE_CONSENT_REQUIRED/);
  assert.equal(w.CWB.db.custom.v4_ai_audit.at(-1).error, 'AI_SENSITIVE_CONSENT_REQUIRED', 'caller-supplied sensitive context must still require a fresh consent');
  const consentForIdentity = w.CWB.ai.consents.authorize({ purpose:'student_summary', student_id:student.id, categories:['identity'], fields:[] });
  w.CWBAI.sendChat = async (_provider, messages) => { sentMessages = messages; return { text:'已基于授权身份上下文生成' }; };
  const authorizedRun = await w.CWB.ai.run({ provider, purpose:'student_summary', apiKey:'test-key-not-real', consent_id:consentForIdentity.id, sensitiveCategories:['identity'], records:[{ id:'authorized-record', student_id:student.id, student_number:student.student_number, full_name:student.full_name, phone:'13812345678', summary:'授权字段测试' }], createSuggestion:false });
  w.CWBAI.sendChat = originalSendChat;
  const authorizedOutbound = JSON.stringify(sentMessages);
  assert.equal(authorizedOutbound.includes(student.full_name), true, 'an explicitly authorized identity category should be available for the current request');
  assert.equal(authorizedOutbound.includes(student.student_number), true, 'an explicitly authorized identity category should include the compatible number snapshot');
  assert.equal(authorizedOutbound.includes('13812345678'), false, 'unauthorized contact fields must remain redacted');
  assert.equal(authorizedRun.draft.model, provider.model, 'AI draft should keep a model snapshot alongside its audit ID');
  const scopedConsent = w.CWB.ai.consents.authorize({ purpose:'student_summary', student_id:student.id, categories:['identity'], fields:[] });
  w.CWBAI.sendChat = async (_provider, messages) => { sentMessages = messages; return { text:'已限制在当前学生范围内生成' }; };
  await w.CWB.ai.run({
    provider, purpose:'student_summary', student_id:student.id, apiKey:'test-key-not-real', consent_id:scopedConsent.id,
    sensitiveCategories:['identity'], messages:[{ role:'user', content:`当前学生 ${student.full_name}，不要处理 ${otherStudent.full_name} ${otherStudent.student_number}` }],
    records:[{ id:'scoped-record', student_id:student.id, student_number:student.student_number, full_name:student.full_name, summary:'当前学生记录' }], createSuggestion:false,
  });
  w.CWBAI.sendChat = originalSendChat;
  const scopedOutbound = JSON.stringify(sentMessages);
  assert.equal(scopedOutbound.includes(student.full_name), true, 'identity authorization should allow the selected student');
  assert.equal(scopedOutbound.includes(otherStudent.full_name), false, 'identity authorization must not expose another student outside the selected scope');
  assert.equal(scopedOutbound.includes(otherStudent.student_number), false, 'identity authorization must not expose another student number outside the selected scope');
  assert.ok(w.CWB.db.custom.v4_ai_consents.find(item => item.id === consentForIdentity.id).used_at, 'sensitive consent must be consumed by one request');
  await assert.rejects(() => w.CWB.ai.run({ provider, purpose:'student_summary', apiKey:'test-key-not-real', consent_id:consentForIdentity.id, sensitiveCategories:['identity'], records:[], createSuggestion:false }), /AI_SENSITIVE_CONSENT_ALREADY_USED/);
  const noisyProvider = { id:'noisy-provider', key:'custom', model:'noisy-demo', enabled:true, allowedPurposes:['student_summary'], dailyQuota:10 };
  await assert.rejects(() => w.CWB.ai.run({ provider:noisyProvider, purpose:'student_summary', records:[], createSuggestion:false, send:async () => { throw new Error('provider response https://secret.example/?token=hidden'); } }), /AI_REQUEST_FAILED/);
  assert.equal(w.CWB.db.custom.v4_ai_audit.at(-1).error, 'AI_REQUEST_FAILED', 'audit errors must be normalized to safe codes');
  await assert.rejects(() => w.CWB.ai.providers.test({ provider:{ id:'disabled-provider', key:'custom', model:'disabled-demo', enabled:false }, apiKey:'test-key-not-real' }), /AI_PROVIDER_DISABLED/);
  w.CWBAI.sendChat = async () => { throw new Error('AI_PROVIDER_REQUEST_ABORTED'); };
  await assert.rejects(() => w.CWB.ai.providers.test({ provider:{ id:'cancel-provider', key:'custom', model:'cancel-demo', enabled:true }, apiKey:'test-key-not-real' }), /AI_PROVIDER_REQUEST_ABORTED/);
  assert.equal(w.CWB.db.custom.v4_ai_audit.filter(item => item.action === 'provider_test').at(-1).status, 'cancelled', 'cancelled provider tests must be auditable as cancelled');
  w.CWBAI.sendChat = originalSendChat;
  assert.ok(w.CWB.db.custom.v4_ai_audit.some(item => item.action === 'suggestion_convert'), 'suggestion conversions should be audited');
  assert.equal(w.CWBAIWorkflow.suggestionRequiresExplicitConfirmation({ risk_level:'high' }), true);
  assert.equal(w.CWBAIWorkflow.suggestionRequiresExplicitConfirmation({ risk_level:'normal' }), false);
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS cwb-ai-context');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
