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
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://ai-record-actions.local/', pretendToBeVisual:true, virtualConsole });
  await wait(850);
  const { window: w } = dom;
  const student = w.CWB.db.students.find(item => item && item.id);
  assert.ok(student, 'a demo student should be available');
  const task = w.CWB.norm.task({ id:'record-action-task', title:'记录级 AI 动作测试', student_id:student.id, student_number:student.student_number, due:'2026-08-18', note:'需要拆解的任务' });
  w.CWB.db.tasks.push(task);
  w.CWB.go('tasks');
  await wait(40);
  const action = w.document.querySelector('[data-ai-record-action="tasks:record-action-task"]');
  assert.ok(action, 'task rows should expose a record-level AI action');
  assert.equal(action.dataset.aiTargetCollection, 'tasks');
  assert.equal(action.dataset.aiTargetRecordId, task.id);
  assert.equal(action.dataset.aiStudentId, student.id);

  const grade = { id:'record-action-grade', student_id:student.id, student_number:student.student_number, student_name:student.full_name, class_name:student.class_name, term:'2026-春', course:'跨页面 AI 测试', score:88 };
  w.CWB.db.grades.push(grade);
  w.CWB.go('grades');
  await wait(40);
  const gradeAction = w.document.querySelector('[data-ai-record-action="grades:record-action-grade"]');
  assert.ok(gradeAction, 'v4 grade rows should expose a record-level AI action');
  assert.equal(gradeAction.dataset.aiTargetCollection, 'grades');
  assert.equal(gradeAction.dataset.aiStudentId, student.id);
  assert.ok(w.document.querySelector('.mcards [data-ai-record-action="grades:record-action-grade"]'), 'grade mobile cards should retain the AI action');

  const assessment = { id:'record-action-assessment', student_id:student.id, student_number:student.student_number, student_name:student.full_name, class_name:student.class_name, term:'2026-春', score:92, rank:3 };
  w.CWB.db.custom.v4_assessments = w.CWB.db.custom.v4_assessments || [];
  w.CWB.db.custom.v4_assessments.push(assessment);
  w.CWB.go('business');
  await wait(40);
  const assessmentAction = w.document.querySelector('[data-ai-record-action="v4_assessments:record-action-assessment"]');
  assert.ok(assessmentAction, 'business archive rows should expose a record-level AI action');
  assert.equal(assessmentAction.dataset.aiTargetCollection, 'v4_assessments');
  assert.equal(assessmentAction.dataset.aiStudentId, student.id);
  assert.ok(w.document.querySelector('.mcards [data-ai-record-action="v4_assessments:record-action-assessment"]'), 'business mobile cards should retain the AI action');

  const intent = { id:'record-action-intent', student_id:student.id, student_number:student.student_number, student_name:student.full_name, graduation_year:'2026', status:'意向收集', direction:'技术研发', expected_role:'工程师', preferred_region:'本地' };
  w.CWB.db.custom.v4_employment_intents = w.CWB.db.custom.v4_employment_intents || [];
  w.CWB.db.custom.v4_employment_intents.push(intent);
  w.CWB.go('graduate');
  await wait(40);
  const intentTab = w.document.querySelector('[data-workspace-parent="graduate"][data-workspace-tab="intent"]');
  assert.ok(intentTab, 'graduate page should expose the employment intent tab');
  intentTab.click();
  await wait(40);
  const intentAction = w.document.querySelector('[data-ai-record-action="v4_employment_intents:record-action-intent"]');
  assert.ok(intentAction, 'employment intent rows should expose a record-level AI action');
  assert.equal(intentAction.dataset.aiTargetCollection, 'v4_employment_intents');
  assert.equal(intentAction.dataset.aiStudentId, student.id);
  assert.ok(w.document.querySelector('.mcards [data-ai-record-action="v4_employment_intents:record-action-intent"]'), 'employment intent mobile cards should retain the AI action');

  const contact = { id:'record-action-contact', student_id:student.id, student_number:student.student_number, student_name:student.full_name, contacted_at:'2026-08-18', channel:'电话', contact_type:'材料提醒', summary:'移动卡片测试', next_at:'2026-08-20' };
  w.CWB.db.custom.v4_employment_contacts = w.CWB.db.custom.v4_employment_contacts || [];
  w.CWB.db.custom.v4_employment_contacts.push(contact);
  const contactTab = w.document.querySelector('[data-workspace-parent="graduate"][data-workspace-tab="contacts"]');
  assert.ok(contactTab, 'graduate page should expose the employment contact tab');
  contactTab.click();
  await wait(40);
  const contactAction = w.document.querySelector('[data-ai-record-action="v4_employment_contacts:record-action-contact"]');
  assert.ok(contactAction, 'employment contact rows should expose a record-level AI action');
  assert.equal(contactAction.dataset.aiTargetCollection, 'v4_employment_contacts');
  assert.ok(w.document.querySelector('.mcards [data-ai-record-action="v4_employment_contacts:record-action-contact"]'), 'employment contact mobile cards should retain the AI action');

  const context = w.CWB.ai.context.build({ purpose:'task_plan', target_view:'tasks', target_collection:'tasks', target_record_id:task.id, student_id:student.id });
  assert.ok(context.records.some(item => item.record_id === task.id), 'target task should be included in context');
  assert.equal(context.target_collection, 'tasks');
  assert.equal(context.target_record_id, task.id);

  const provider = { id:'record-action-provider', key:'custom', model:'record-action-demo', enabled:true, allowedPurposes:['task_plan'], dailyQuota:10 };
  const outcome = await w.CWB.ai.run({ provider, purpose:'task_plan', target_view:'tasks', target_collection:'tasks', target_record_id:task.id, student_id:student.id, send:async () => ({ text:'已生成任务拆解建议' }) });
  assert.equal(outcome.draft.target_collection, 'tasks');
  assert.equal(outcome.draft.target_record_id, task.id);
  assert.equal(outcome.suggestion.target_collection, 'tasks');
  assert.equal(outcome.audit.target_collection, 'tasks');

  const accepted = w.CWB.ai.suggestions.accept(outcome.suggestion.id);
  const converted = w.CWB.ai.suggestions.convert(accepted.id, 'task');
  assert.equal(converted.ai_suggestion_id, accepted.id);
  assert.equal(converted.ai_audit_id, outcome.audit.id);
  assert.equal(converted.ai_target_collection, 'tasks');
  assert.equal(converted.student_id, student.id);

  const phonePackage = await w.CWB.sync.createPhonePackage();
  assert.ok(phonePackage.custom.v4_ai_suggestions.some(item => item.id === outcome.suggestion.id), 'phone exchange should include AI suggestions');
  assert.ok(phonePackage.custom.v4_ai_sources.some(item => item.collection === 'tasks' && item.record_id === task.id), 'phone exchange should include record sources');
  const portable = await w.CWB.buildPortableHtml();
  assert.ok(portable.data.custom.v4_ai_drafts.some(item => item.id === outcome.draft.id), 'portable data should include AI drafts');
  const embedded = JSON.parse(portable.html.match(/window\.__CWB_EMBED__=([\s\S]*?)<\/script>/)[1]);
  assert.ok(embedded.custom.v4_ai_consents, 'portable HTML should include AI consent collection');
  assert.ok(embedded.custom.v4_ai_suggestions.some(item => item.id === outcome.suggestion.id), 'portable HTML should retain AI suggestions');
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS ai-record-actions');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
