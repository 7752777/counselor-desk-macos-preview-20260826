const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function inlineScript(html, relativePath) {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  return html.replace(
    `<script defer src="${relativePath}" data-cwb-ai${relativePath.endsWith('cwb-ai-workflow.js') ? '-workflow' : ''}></script>`,
    `<script>${source}</script>`,
  );
}

function assertDoesNotContain(value, forbidden, label) {
  assert.equal(String(value).includes(String(forbidden)), false, `${label} must not contain ${forbidden}`);
}

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Could not load|Not implemented|getaddrinfo/i.test(String(error && error.message))) {
      errors.push(String(error && error.message));
    }
  });
  const root = path.join(__dirname, '..');
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = inlineScript(html, 'src/core/cwb-ai.js');
  html = inlineScript(html, 'src/core/cwb-ai-workflow.js');
  const dom = new JSDOM(html, {
    runScripts:'dangerously', resources:'usable', url:'https://ai-output-health.local/', pretendToBeVisual:true, virtualConsole,
  });
  await wait(900);
  const { window: w } = dom;
  const { CWB } = w;
  assert.ok(CWB && CWB.ai && typeof CWB.ai.run === 'function');
  assert.equal(typeof CWB.ai.health, 'function');

  const student = CWB.db.students.find(item => item && item.id && item.full_name && item.student_number);
  assert.ok(student, 'a demo student with identity fields is required');
  const phone = '13800138000';
  const recordId = 'ai-output-health-record';
  const records = [{
    id:recordId,
    student_id:student.id,
    full_name:student.full_name,
    student_name:student.full_name,
    student_number:student.student_number,
    phone,
    title:'AI output safety fixture',
  }];
  const provider = {
    id:'ai-output-health-provider', key:'custom', model:'output-health-demo', enabled:true,
    allowedPurposes:['work_summary'], dailyQuota:20,
  };
  CWB.db.custom.v4_ai_providers = [provider];
  CWB.db.custom.v4_ai_audit = [];
  CWB.db.custom.v4_ai_drafts = [];
  CWB.db.custom.v4_ai_suggestions = [];
  CWB.db.custom.v4_ai_consents = [];

  const rawOutput = `safe summary | student_id=${student.id} | record_id=${recordId} | name=${student.full_name} | number=${student.student_number} | phone=${phone}`;
  const first = await CWB.ai.run({
    provider,
    purpose:'work_summary',
    student_id:student.id,
    target_view:'students',
    target_collection:'students',
    target_record_id:recordId,
    records,
    apiKey:'test-key-not-real',
    send:async () => ({ text:rawOutput }),
  });
  const forbiddenWithoutConsent = [student.id, recordId, student.full_name, student.student_number, phone];
  [first.result.text, first.draft.payload.text, first.suggestion.payload.text, first.suggestion.summary].forEach((value, index) => {
    forbiddenWithoutConsent.forEach(item => assertDoesNotContain(value, item, `redacted output ${index}`));
    assert.match(value, /safe summary/);
  });
  const firstAudit = CWB.db.custom.v4_ai_audit.find(item => item.request_id === first.audit.request_id);
  assert.equal(firstAudit.output_redacted, true, 'redaction must be recorded in the generation audit');

  const sensitiveContext = CWB.ai.context.build({
    purpose:'work_summary',
    includeSensitive:true,
    sensitiveCategories:['identity', 'contact'],
    student_id:student.id,
    target_view:'students',
    target_collection:'students',
    target_record_id:recordId,
    records,
  });
  const consent = CWB.ai.consents.authorize({
    purpose:'work_summary',
    student_id:student.id,
    categories:['identity', 'contact'],
    context_scope:{ student_id:student.id, target_view:'students', target_collection:'students', target_record_id:recordId },
  });
  const authorizedRaw = `authorized | ${student.full_name} | ${student.student_number} | ${phone} | ${recordId}`;
  const authorized = await CWB.ai.run({
    provider,
    purpose:'work_summary',
    student_id:student.id,
    target_view:'students',
    target_collection:'students',
    target_record_id:recordId,
    records,
    context:sensitiveContext,
    sensitiveCategories:['identity', 'contact'],
    consent_id:consent.id,
    apiKey:'test-key-not-real',
    send:async () => ({ text:authorizedRaw }),
  });
  assert.match(authorized.result.text, new RegExp(student.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(authorized.result.text, new RegExp(student.student_number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(authorized.result.text, new RegExp(phone));
  assertDoesNotContain(authorized.result.text, recordId, 'authorized output');
  const authorizedAudit = CWB.db.custom.v4_ai_audit.find(item => item.request_id === authorized.audit.request_id);
  assert.equal(authorizedAudit.output_redacted, true, 'internal IDs must still be redacted after identity authorization');

  const health = CWB.ai.health();
  assert.ok(Array.isArray(health.checks));
  assert.equal(health.missing_collections.length, 0);
  assert.equal(health.missing_views.length, 0);
  assert.equal(health.checks.find(item => item.key === 'runtime').status, 'ok');
  assert.equal(health.checks.find(item => item.key === 'purpose_contract').status, 'ok');
  CWB.go('ai');
  assert.ok(w.document.querySelector('.ai-health-card'), 'AI page should render the health card');
  assert.ok(w.document.querySelector('[data-act="ai-health-refresh"]'), 'AI page should expose a health refresh action');

  const preview = await CWB.ai.notice.preview({
    text:'请于 2026-08-30 前提交材料。', source:'学院通知', received_at:'2026-08-22T09:00:00+08:00',
  });
  assert.ok(preview.audit_id, 'notice preview must return a persisted audit id');
  assert.ok(CWB.db.custom.v4_ai_audit.some(item => item && item.id === preview.audit_id), 'notice preview audit must be persisted before returning');

  const parsedNotice = await CWB.ai.notice.parse({
    text:'请于 2026-08-30 前提交材料。', source:'学院通知', received_at:'2026-08-22T09:00:00+08:00',
    mockResponse:JSON.stringify({ title:'材料提交', audience:'全体学生', key_points:['提交材料'], deadlines:[{ date:'2026-08-30', label:'截止', evidence:'2026-08-30' }], todos:['提交材料'], needs_verification:[], evidence:['2026-08-30'], confidence:0.9 }),
  });
  assert.ok(parsedNotice.suggestion && parsedNotice.suggestion.id, 'notice parse must create a reviewable suggestion');
  assert.ok(CWB.db.custom.v4_ai_sources.some(item => item && item.id === parsedNotice.source_record.id), 'notice parse must persist its source before returning');

  // A successful model response is not enough: the audit, draft and
  // suggestion must either persist together or be removed together when the
  // workspace write fails.
  const originalSync = w.CWB_V4_SYNC;
  const failedRequestId = 'ai-output-health-save-failure';
  w.CWB_V4_SYNC = () => Promise.reject(new Error('TEST_AI_SAVE_FAILURE'));
  await assert.rejects(
    CWB.ai.run({
      provider, purpose:'work_summary', request_id:failedRequestId,
      target_view:'students', target_collection:'students', target_record_id:recordId,
      records, apiKey:'test-key-not-real', send:async () => ({ text:'must roll back as one unit' }),
    }),
    /AI_REQUEST_FAILED|TEST_AI_SAVE_FAILURE/,
    'AI output persistence failure must reach the caller'
  );
  assert.equal(CWB.db.custom.v4_ai_drafts.some(item => item && item.request_id === failedRequestId), false, 'failed AI output must not leave a draft');
  assert.equal(CWB.db.custom.v4_ai_suggestions.some(item => item && item.request_id === failedRequestId), false, 'failed AI output must not leave a suggestion');
  assert.equal(CWB.db.custom.v4_ai_audit.some(item => item && item.request_id === failedRequestId && item.status === 'completed'), false, 'failed AI output must not leave a completed audit');
  w.CWB_V4_SYNC = originalSync;

  const failedNoticeText = '请于 2026-09-01 前提交失败回滚测试材料。';
  w.CWB_V4_SYNC = () => Promise.reject(new Error('TEST_NOTICE_SAVE_FAILURE'));
  await assert.rejects(
    CWB.ai.notice.parse({ text:failedNoticeText, source:'失败回滚测试', mockResponse:JSON.stringify({ title:'失败回滚', audience:'全体学生', key_points:['测试'], deadlines:[], todos:[], needs_verification:[], evidence:[], confidence:0.5 }) }),
    /TEST_NOTICE_SAVE_FAILURE|AI_REQUEST_FAILED/,
    'notice parse persistence failure must reach the caller'
  );
  assert.equal(CWB.db.custom.v4_ai_sources.some(item => item && item.title === '失败回滚'), false, 'failed notice parse must roll back its source');
  assert.equal(CWB.db.custom.v4_ai_suggestions.some(item => item && item.title === '失败回滚'), false, 'failed notice parse must roll back its suggestion');
  w.CWB_V4_SYNC = originalSync;

  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS ai-output-health');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
