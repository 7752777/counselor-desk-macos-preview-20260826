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
    .replace('<script defer src="src/core/cwb-ai.js" data-cwb-ai></script>', `<script>${fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai.js'), 'utf8')}</script>`)
    .replace('<script defer src="src/core/cwb-ai-workflow.js" data-cwb-ai-workflow></script>', `<script>${fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai-workflow.js'), 'utf8')}</script>`);
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://ai-egress-contract.local/', pretendToBeVisual:true, virtualConsole });
  await wait(800);
  const { window: w } = dom;
  const student = w.CWB.db.students.find(item => item && item.id);
  assert.ok(student, 'a student fixture is required');
  const context = w.CWB.ai.context.build({
    purpose:'student_summary',
    student_id:student.id,
    records:[{
      id:'egress-record-id',
      student_id:student.id,
      source_fingerprint:'egress-fingerprint',
      source_attachment_id:'egress-attachment-id',
      attachment_ids:['egress-attachment-id'],
      note:'可发送的业务摘要',
    }],
  });
  context.sources.push({
    id:'free-text-source', kind:'local', collection:'records', record_id:'free-text-source', title:'联系资料',
    url:'https://example.com/policy?page=2&token=source-secret#section',
    excerpt:'联系人电话 13812345678，邮箱 teacher@example.com，编号 20240001。', status:'available', verification_status:'not_applicable',
  });
  const provider = { id:'egress-provider', key:'custom', model:'egress-demo', enabled:true, allowedPurposes:['student_summary'], dailyQuota:10 };
  const sentMessages = [];
  const originalSendChat = w.CWBAI.sendChat;
  w.CWBAI.sendChat = async (_provider, messages) => { sentMessages.push(messages); return { text:'已完成脱敏出站测试' }; };
  const result = await w.CWB.ai.run({
    provider,
    purpose:'student_summary',
    context,
    apiKey:'test-key-not-real',
    source_attachment_id:'egress-attachment-id',
    messages:[{ role:'user', tool_name:'不应出站', content:[
      { type:'text', text:'请处理 egress-record-id egress-fingerprint egress-attachment-id ' + student.id },
      { type:'tool_use', tool_name:'不应出站的结构化字段', input:{ secret:'不应出站' } },
    ] }],
    createDraft:false,
    createSuggestion:false,
  });
  w.CWBAI.sendChat = originalSendChat;
  const outbound = JSON.stringify(sentMessages);
  assert.equal(result.audit.status, 'completed');
  assert.equal(outbound.includes('egress-record-id'), false, 'business record ids must not leave the local context');
  assert.equal(outbound.includes('egress-fingerprint'), false, 'source fingerprints must not leave the local context');
  assert.equal(outbound.includes('egress-attachment-id'), false, 'attachment ids must not leave the local context');
  assert.equal(outbound.includes(student.id), false, 'student stable ids must not leave the local context');
  assert.equal(outbound.includes('13812345678'), false, 'phone numbers in source excerpts must not leave the local context');
  assert.equal(outbound.includes('teacher@example.com'), false, 'email addresses in source excerpts must not leave the local context');
  assert.equal(outbound.includes('20240001'), false, 'identity numbers in source excerpts must not leave the local context');
  assert.equal(outbound.includes('source-secret'), false, 'source URL token query values must not leave the local context');
  assert.equal(outbound.includes('page=2'), true, 'ordinary source URL query values may remain for citation context');
  assert.equal(outbound.includes('tool_name'), false, 'unknown structured message fields must not leave the local context');
  assert.equal(outbound.includes('不应出站'), false, 'unknown structured message content must be discarded');
  assert.match(outbound, /可发送的业务摘要/);
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS ai-egress-contract');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
