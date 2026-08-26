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
  assert.match(html, /data-ai-certificate-student><option value="">请选择学生<\/option>\$\{DB\.students\.map\(s => `\<option value="\$\{esc\(s\.id\)\}"/,
    'certificate confirmation must use stable student_id as the select value');
  assert.match(html, /consent_id:consent\.id, request_id:requestId/, 'certificate model request must reuse the consent request id');
  assert.match(html, /audit_id:response\.audit\.id, request_id:requestId, consent_id:consent\.id/, 'certificate draft must keep the model request id');
  assert.match(html, /const studentId = \(\$\('\[data-ai-certificate-student\]', mask\) \|\| \{\}\)\.value/,
    'certificate confirmation must submit stable student_id');
  assert.doesNotMatch(html, /data-ai-certificate-student><option value="\$\{esc\(s\.student_number\)\}"/, 'certificate selector must not use student number as its primary value');
  assert.match(html, /确认发送证书图片给模型/, 'certificate recognition must require an explicit outbound image confirmation');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/scrollTo|Could not load|Not implemented/i.test(error.message)) errors.push(error.message); });
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://certificate.local/', pretendToBeVisual:true, virtualConsole });
  await wait(750);
  const { CWB } = dom.window;
  CWB.db.students = [CWB.norm.student({ id:'student-1', student_number:'S001', full_name:'王同学', class_name:'一班' })];
  CWB.db.rewards = [];
  assert.equal(CWB.db.rewards.length, 0);
  const draft = CWB.ai.createCertificateDraft({ title:'国家奖学金', source_attachment_id:'att-1', provider_id:'provider-1', consent_id:'consent-1', request_id:'certificate-request-1' });
  assert.equal(CWB.db.rewards.length, 0);
  assert.equal(draft.source_attachment_id, 'att-1');
  assert.equal(draft.consent_id, 'consent-1');
  assert.equal(draft.request_id, 'certificate-request-1');
  assert.deepEqual(Array.from(draft.sensitive_categories), ['attachments']);
  const reward = CWB.ai.confirmCertificateDraft(draft.id, { student_id:'student-1', title:'国家奖学金' });
  assert.equal(reward.student_id, 'student-1');
  assert.equal(reward.student_number, 'S001');
  assert.equal(reward.attachment_id, 'att-1');
  assert.equal(Array.from(reward.attachment_ids).join(','), 'att-1');
  assert.equal(reward.ai_request_id, 'certificate-request-1');
  assert.equal(reward.source, 'AI 证书识别（人工确认）');
  assert.equal(CWB.db.custom.v4_ai_drafts[0].status, 'confirmed');
  const confirmationAudit = CWB.db.custom.v4_ai_audit.find(item => item.action === 'certificate_confirm');
  assert.equal(confirmationAudit.request_id, 'certificate-request-1', 'certificate confirmation must keep the generation request id');
  assert.equal(confirmationAudit.sensitiveRequested, true);
  assert.equal(confirmationAudit.sensitiveAuthorized, true);
  assert.throws(() => CWB.ai.confirmCertificateDraft(draft.id, { student_id:'missing', title:'无效' }), /CERTIFICATE_CONFIRMATION_INVALID/);
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS certificate-recognition');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
