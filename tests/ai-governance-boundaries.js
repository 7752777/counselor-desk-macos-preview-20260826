const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '..');
const aiSource = fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai.js'), 'utf8');
const workflowSource = fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai-workflow.js'), 'utf8');

const coreSandbox = { console, URL, setTimeout, clearTimeout };
coreSandbox.globalThis = coreSandbox;
vm.runInNewContext(aiSource, coreSandbox, { filename:'cwb-ai-boundaries.js' });
const core = coreSandbox.CWBAI;
const authorized = core.redact({ name:'张三', student_number:'20240001', phone:'13812345678', api_key:'secret-value' }, { categories:['identity', 'contact'] });
assert.equal(authorized.name, '张三', 'authorized identity values should remain available for the current request');
assert.equal(authorized.student_number, '20240001');
assert.equal(authorized.phone, '13812345678');
assert.equal(authorized.api_key, '[已脱敏]', 'secret-like fields must never be restored by sensitive authorization');
const openAiRequest = core.buildChatRequest({ key:'custom', baseUrl:'https://example.test/v1', model:'demo' }, [
  { role:'system', content:'系统规则' }, { role:'user', content:'请求内容' }, { role:'assistant', content:'已有答复' },
]);
assert.deepEqual(openAiRequest.body.messages.map(item => item.role), ['system', 'user', 'assistant']);
const anthropicRequest = core.buildChatRequest({ key:'custom', protocol:'anthropic', baseUrl:'https://example.test/v1', model:'demo' }, [
  { role:'system', content:'系统规则' }, { role:'user', content:'请求内容' },
]);
assert.equal(anthropicRequest.body.system, '系统规则');
assert.deepEqual(anthropicRequest.body.messages.map(item => item.role), ['user']);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/scrollTo|Could not load|Not implemented|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message)); });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<script defer src="src/core/cwb-ai.js" data-cwb-ai></script>', `<script>${aiSource}</script>`)
    .replace('<script defer src="src/core/cwb-ai-workflow.js" data-cwb-ai-workflow></script>', `<script>${workflowSource}</script>`);
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://ai-governance-boundaries.local/', pretendToBeVisual:true, virtualConsole });
  await wait(750);
  const { window: w } = dom;
  const student = w.CWB.db.students.find(item => item && item.id);
  const otherStudent = w.CWB.db.students.find(item => item && item.id && item.id !== student.id);
  assert.ok(student && otherStudent, 'demo students should be available for scope checks');
  w.CWB.db.custom.v4_ai_audit = w.CWB.db.custom.v4_ai_audit || [];
  w.CWB.db.custom.v4_ai_suggestions = w.CWB.db.custom.v4_ai_suggestions || [];
  w.CWB.db.custom.v4_ai_consents = w.CWB.db.custom.v4_ai_consents || [];
  w.CWB.db.custom.v4_ai_drafts = w.CWB.db.custom.v4_ai_drafts || [];

  const rejected = w.CWB.ai.suggestions.create({ id:'boundary-rejected', purpose:'student_followup', status:'rejected', title:'已驳回', payload:{ text:'x' } });
  const rejectedAuditCount = w.CWB.db.custom.v4_ai_audit.length;
  assert.equal(w.CWB.ai.suggestions.reject(rejected.id).status, 'rejected');
  assert.equal(w.CWB.db.custom.v4_ai_audit.length, rejectedAuditCount, 'repeated rejection should be idempotent');
  assert.throws(() => w.CWB.ai.suggestions.accept(rejected.id, { confirmed:true }), /AI_SUGGESTION_TRANSITION_INVALID/);

  const accepted = w.CWB.ai.suggestions.create({ id:'boundary-accepted', purpose:'student_followup', status:'accepted', title:'已采纳', payload:{ text:'x' } });
  assert.equal(accepted.status, 'review', 'accepted suggestions without confirmation evidence must be downgraded to review');
  const acceptedAuditCount = w.CWB.db.custom.v4_ai_audit.length;
  assert.equal(w.CWB.ai.suggestions.accept(accepted.id, { confirmed:true }).status, 'accepted');
  assert.ok(w.CWB.db.custom.v4_ai_audit.length > acceptedAuditCount, 'accepting a downgraded legacy suggestion must create confirmation evidence');

  const provider = { id:'boundary-provider', key:'custom', model:'boundary-demo', enabled:true, allowedPurposes:['student_summary'], dailyQuota:10 };
  const contextForA = { purpose:'student_summary', student_id:student.id, target_view:'students', target_collection:'students', target_record_id:'student-record-a', dateRange:null, class_name:'', records:[], sources:[], authorizedCategories:['contact'], authorizedFields:[] };
  const consent = w.CWB.ai.consents.authorize({
    purpose:'student_summary', student_id:student.id, categories:['contact'], fields:[],
    context_scope:{ student_id:student.id, target_view:'students', target_collection:'students', target_record_id:'student-record-a' },
  });
  await assert.rejects(() => w.CWB.ai.run({
    provider, purpose:'student_summary', context:Object.assign({}, contextForA, { student_id:otherStudent.id, target_record_id:'student-record-a' }),
    sensitive:true, sensitiveCategories:['contact'], consent_id:consent.id, send:async () => ({ text:'不应发送' }),
  }), /AI_SENSITIVE_CONSENT_SCOPE_MISMATCH/);
  await assert.rejects(() => w.CWB.ai.run({
    provider, purpose:'student_summary', context:Object.assign({}, contextForA, { target_record_id:'student-record-b' }),
    sensitive:true, sensitiveCategories:['contact'], consent_id:consent.id, send:async () => ({ text:'不应发送' }),
  }), /AI_SENSITIVE_CONSENT_SCOPE_MISMATCH/);
  const sentMessages = [];
  const originalSendChat = w.CWBAI.sendChat;
  w.CWBAI.sendChat = async (_provider, messages) => { sentMessages.push(messages); return { text:'已完成' }; };
  const outcome = await w.CWB.ai.run({
    provider, purpose:'student_summary', context:contextForA, sensitive:true, sensitiveCategories:['contact'], consent_id:consent.id,
    apiKey:'test-key-not-real', messages:[{ role:'user', content:`请处理 ${student.full_name} ${student.student_number} 13812345678` }],
  });
  assert.equal(outcome.result.text, '已完成');
  assert.equal(sentMessages.length, 1);
  assert.equal(JSON.stringify(sentMessages[0]).includes(student.full_name), false, 'outbound messages must scrub known student names');
  assert.equal(JSON.stringify(sentMessages[0]).includes(student.student_number), false, 'outbound messages must scrub student numbers');
  assert.equal(JSON.stringify(sentMessages[0]).includes('13812345678'), true, 'an explicitly authorized contact category may be used for this request');
  assert.match(JSON.stringify(sentMessages[0]), /\[已脱敏\]/);
  assert.equal(w.CWB.db.custom.v4_ai_consents.find(item => item.id === consent.id).used_at != null, true);
  const identityRequestId = 'boundary-identity-request';
  const identityContext = Object.assign({}, contextForA, {
    authorizedCategories:['identity'],
    records:[{ id:'boundary-local-record', student_id:student.id, title:'身份授权测试' }],
  });
  const identityConsent = w.CWB.ai.consents.authorize({
    request_id:identityRequestId, purpose:'student_summary', student_id:student.id, categories:['identity'], fields:[],
    context_scope:{ student_id:student.id, target_view:'students', target_collection:'students', target_record_id:'student-record-a' },
  });
  await w.CWB.ai.run({
    provider, purpose:'student_summary', request_id:identityRequestId, context:identityContext,
    sensitive:true, sensitiveCategories:['identity'], consent_id:identityConsent.id, apiKey:'test-key-not-real',
    messages:[{ role:'user', content:`身份授权仍不得发送内部标识 ${student.id} boundary-local-record ${student.full_name} ${student.student_number}` }],
  });
  const identityOutbound = JSON.stringify(sentMessages[1]);
  assert.equal(identityOutbound.includes(student.id), false, 'internal student_id must stay redacted even when identity is authorized');
  assert.equal(identityOutbound.includes('boundary-local-record'), false, 'local record ids must not leave the local context');
  assert.equal(identityOutbound.includes(student.full_name), true, 'identity authorization should still allow the selected name when needed');
  w.CWBAI.sendChat = originalSendChat;
  await assert.rejects(() => w.CWB.ai.run({
    provider, purpose:'student_summary', context:contextForA, sensitive:true, sensitiveCategories:['contact'], consent_id:consent.id,
    send:async () => ({ text:'不应重复发送' }),
  }), /AI_SENSITIVE_CONSENT_ALREADY_USED/);

  const orphanSuggestion = w.CWB.ai.suggestions.create({ id:'boundary-orphan', purpose:'student_followup', status:'accepted', human_confirmed_at:'2026-08-20T10:00:00.000Z', confirmation_method:'测试人工确认', student_id:'missing-student-id', student_number:'missing-number', title:'无效关联', payload:{ text:'草稿' } });
  const orphanRecord = w.CWB.ai.suggestions.convert(orphanSuggestion.id, 'task');
  assert.equal(orphanRecord.student_id || '', '', 'conversion must not preserve an invalid student id');
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS ai-governance-boundaries');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
