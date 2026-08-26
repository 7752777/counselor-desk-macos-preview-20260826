const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo|HTMLCanvasElement/i.test(String(error && error.message))) {
      errors.push(String(error && error.message));
    }
  });
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts:'dangerously', resources:'usable', pretendToBeVisual:true, virtualConsole,
  });
  await wait(1200);
  const { window: w } = dom;
  assert.ok(w.CWB && w.CWB.ai && w.CWB.worklogDrafts, 'the local page should expose AI and worklog draft APIs');

  const createSuggestion = (id, summary) => w.CWB.ai.suggestions.create({
    id, purpose:'work_summary', title:'AI 留痕闭环测试', summary, status:'review',
    payload:{ text:summary, next_action:'人工补充后归档' }, risk_level:'normal', sources:[],
  });

  const firstSuggestion = createSuggestion('ai-worklog-conversion-1', '原始建议内容');
  const accepted = w.CWB.ai.suggestions.accept(firstSuggestion.id, { confirmed:true });
  const converted = w.CWB.ai.suggestions.convert(accepted.id, 'worklog');
  assert.equal(converted.status, 'draft');
  const confirmed = w.CWB.worklogDrafts.confirm(converted.id, { summary:'已核对并确认的工作留痕' });
  assert.equal(confirmed.status, '已归档', 'workflow-only suggestion status changes must not invalidate the draft');
  assert.equal(w.CWB.db.custom.v4_worklog_drafts.find(item => item.id === converted.id).status, 'confirmed');
  assert.ok(w.CWB.db.worklogs.some(item => item.source_draft_id === converted.id), 'confirmed draft should create one formal worklog');
  const worklogCount = w.CWB.db.worklogs.filter(item => item.source_draft_id === converted.id).length;
  w.CWB.worklogDrafts.confirm(converted.id, { summary:'再次确认不应新增重复留痕' });
  assert.equal(w.CWB.db.worklogs.filter(item => item.source_draft_id === converted.id).length, worklogCount, 'reconfirming a draft should update the same formal worklog');

  const secondSuggestion = createSuggestion('ai-worklog-conversion-2', '待核对建议');
  const edited = w.CWB.ai.suggestions.accept(secondSuggestion.id, { confirmed:true });
  const editedDraft = w.CWB.ai.suggestions.convert(edited.id, 'worklog');
  const source = w.CWB.db.custom.v4_ai_suggestions.find(item => String(item.id) === String(edited.id));
  source.summary = '建议事实已被修改';
  source.updated_at = new Date().toISOString();
  assert.throws(
    () => w.CWB.worklogDrafts.confirm(editedDraft.id),
    /WORKLOG_DRAFT_SOURCE_RECHECK_REQUIRED/,
    'editing suggestion content must still require source re-review',
  );

  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS ai-worklog-conversion');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
