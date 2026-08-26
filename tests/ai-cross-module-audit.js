const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function withInlineScript(html, relativePath) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const escapedPath = relativePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = new RegExp(`<script\\b[^>]*\\bsrc="${escapedPath}"[^>]*><\\/script>`);
  const replaced = html.replace(tag, `<script defer>${source}</script>`);
  if (replaced === html) throw new Error(`INLINE_SCRIPT_NOT_FOUND:${relativePath}`);
  return replaced;
}

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Could not load|Not implemented|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  [
    'src/core/cwb-ai.js', 'src/core/cwb-ai-workflow.js', 'src/core/cwb-v46.js', 'src/core/cwb-v47.js',
    'src/core/cwb-v46-ui.js', 'src/core/cwb-v47-ui.js',
  ].forEach(relativePath => { html = withInlineScript(html, relativePath); });
  const dom = new JSDOM(html, {
    runScripts:'dangerously', resources:'usable', url:'https://ai-cross-module.local/', pretendToBeVisual:true, virtualConsole,
  });
  await wait(1100);
  const { window: w } = dom;
  const { CWB } = w;
  assert.ok(CWB && CWB.ai && CWB.ai.context, 'AI runtime should be available');
  assert.deepEqual([...w.CWBAI.purposes].sort(), [...w.CWBAIWorkflow.purposes].sort(), 'provider and workflow purpose registries must stay aligned');
  assert.equal(w.CWBAIWorkflow.defaultRiskLevel('dorm_conflict'), 'high');
  assert.equal(w.CWBAIWorkflow.defaultRiskLevel('research_checklist'), 'normal');
  const noticeProvider = w.CWBAI.validateProviderConfig({ key:'custom', baseUrl:'https://example.com/v1', model:'notice-demo', allowedPurposes:['notice_capture'] });
  assert.equal(JSON.stringify(noticeProvider.allowedPurposes), JSON.stringify(['notice_capture']), 'notice capture must remain available in provider authorization');
  assert.equal(w.CWBAIWorkflow.authorize(noticeProvider, 'notice_capture', []).purpose, 'notice_capture');

  const student = CWB.db.students.find(item => item && item.id);
  assert.ok(student, 'a student is required for cross-module checks');
  const custom = CWB.db.custom;
  const put = (collection, record) => {
    custom[collection] = Array.isArray(custom[collection]) ? custom[collection] : [];
    custom[collection].push(Object.assign({ schema_version:8, created_at:'2026-08-19T08:00:00.000Z', updated_at:'2026-08-19T08:00:00.000Z' }, record));
    return record;
  };
  const building = put('v4_dorm_buildings', { id:'audit-building', name:'审计楼', campus:'主校区', gender_limit:'不限', enabled:true });
  put('v4_files', { id:'audit-policy', title:'全局政策资料', content:'班级工作参考政策', category:'政策', updated_at:'2026-08-19T08:00:00.000Z' });
  put('v4_dorm_rooms', { id:'audit-room', building_id:building.id, room_number:'101', capacity:4, bed_numbers:['1','2','3','4'], status:'可用' });
  put('v4_dorm_batches', { id:'audit-batch', academic_year:'2026-2027', term:'秋季', batch_type:'新生入学', status:'草稿' });
  const assignment = put('v4_dorm_assignments', { id:'audit-assignment', batch_id:'audit-batch', student_id:student.id, student_number:student.student_number, student_name:student.full_name, class_name:student.class_name, building_id:building.id, room_id:'audit-room', bed_number:'1', status:'confirmed', check_in_date:'2026-08-20' });
  const transfer = put('v4_dorm_transfers', { id:'audit-transfer', student_id:student.id, student_number:student.student_number, student_name:student.full_name, from_room_id:'audit-room', to_room_id:'audit-room-2', transfer_date:'2026-08-21', reason:'审计测试' });
  put('v4_positions', { id:'audit-position', student_id:student.id, student_number:student.student_number, student_name:student.full_name, name:'就业委员', class_name:student.class_name, status:'在任' });
  put('v4_committee_evaluations', { id:'audit-evaluation', student_id:student.id, student_number:student.student_number, student_name:student.full_name, role_name:'就业委员', class_name:student.class_name, term:'2026-2027-1', evaluation_date:'2026-08-19', grade:'合格', note:'按期完成工作' });
  put('v4_family_contacts', { id:'audit-family', student_id:student.id, student_number:student.student_number, student_name:student.full_name, parent_name:'家长测试', parent_relation:'父亲', contact_date:'2026-08-19', method:'电话', purpose:'入学沟通', summary:'已完成沟通' });
  put('v4_worklog_drafts', { id:'audit-draft', student_id:student.id, student_number:student.student_number, student_name:student.full_name, source_collection:'v4_family_contacts', source_id:'audit-family', date:'2026-08-19', title:'家校联系草稿', summary:'待确认', status:'draft' });
  put('v4_research_projects', { id:'audit-research', name:'辅导员工作研究', level:'校级', current_stage:'application', next_action:'准备申请书', stage_due_date:'2026-09-01', status:'进行中' });
  put('v4_class_schedules', { id:'audit-schedule', class_name:student.class_name, term:'2026-2027-1', weekday:1, start_section:1, end_section:2, course:'测试课程', teacher:'测试教师', room:'A101', updated_at:'2026-08-19' });
  put('v4_roll_call_sessions', { id:'audit-roll', date:'2026-08-19', class_names:[student.class_name], mode:'随机点名', candidate_student_ids:[student.id], selected_student_ids:[student.id], selected_count:1, random_seed:'audit-seed', reviewed:true });
  put('v4_class_checks', { id:'audit-class-check', class_name:student.class_name, course:'测试课程', date:'2026-08-19', status:'已查', present_count:1 });
  put('v4_dorm_inspections', { id:'audit-inspection', building_id:building.id, building_name:building.name, room_number:'101', date:'2026-08-19', result:'存在异常', summary:'待复核' });
  put('v4_dorm_exceptions', { id:'audit-exception', inspection_id:'audit-inspection', room_id:'audit-room', category:'安全', level:'一般', status:'待处理', description:'待复核' });
  put('v4_assessment_entries', { id:'audit-assessment', student_id:student.id, student_number:student.student_number, student_name:student.full_name, class_name:student.class_name, term:'2026-2027-1', dimension:'社会实践', score:2, direction:'加分', source:'审计测试' });
  put('v4_tool_links', { id:'audit-tool', name:'公开工具', category:'日常材料', url:'https://example.com/tool', description:'审计测试', verification_status:'待核验' });
  put('v4_employment_safety', { id:'audit-safety', organization:'测试单位', type:'用人单位', risk_level:'提示', reason:'请核验来源', checked_at:'2026-08-19' });
  put('v4_competition_resources', { id:'audit-competition', name:'测试竞赛', category:'综合类', organizer:'测试主办方', deadline:'2026-09-01', verification_status:'待核验' });
  put('v4_competition_entries', { id:'audit-entry', competition_id:'audit-competition', student_id:student.id, student_number:student.student_number, student_name:student.full_name, project_name:'测试项目', status:'待报名' });
  CWB.db.grades.push({ id:'audit-grade', student_id:student.id, student_number:student.student_number, student_name:student.full_name, class_name:student.class_name, term:'2026-2027-1', course:'测试课程', score:58, gpa:0 });

  const pageCases = [
    ['dorm', 'v4_dorm_buildings', building.id],
    ['committee', 'v4_positions', 'audit-position'],
    ['family', 'v4_family_contacts', 'audit-family'],
    ['research', 'v4_research_projects', 'audit-research'],
    ['worklog-drafts', 'v4_worklog_drafts', 'audit-draft'],
    ['class-checks', 'v4_class_checks', 'audit-class-check'],
    ['dorm-inspections', 'v4_dorm_inspections', 'audit-inspection'],
    ['assessment', 'v4_assessment_entries', 'audit-assessment'],
    ['toolbox', 'v4_tool_links', 'audit-tool'],
    ['employment-safety', 'v4_employment_safety', 'audit-safety'],
    ['competitions', 'v4_competition_resources', 'audit-competition'],
    ['schedules', 'v4_class_schedules', 'audit-schedule'],
  ];
  for (const [view, collection, id] of pageCases) {
    CWB.go(view);
    await wait(35);
    const action = [...w.document.querySelectorAll('[data-ai-record-action]')]
      .find(item => item.dataset.aiRecordAction === `${collection}:${id}`);
    assert.ok(action, `${view} should expose record-level AI action for ${collection}`);
    assert.equal(action.dataset.aiTargetCollection, collection);
    assert.equal(action.dataset.aiTargetRecordId, id);
  }
  CWB.go('dorm');
  await wait(35);
  assert.ok([...w.document.querySelectorAll('[data-ai-record-action]')].some(item => item.dataset.aiRecordAction === `v4_dorm_assignments:${assignment.id}`), 'current dorm assignments should expose an AI conflict check');
  const transferTab = w.document.querySelector('[data-act="v46-dorm-tab"][data-tab="transfers"]');
  assert.ok(transferTab, 'dorm page should expose the transfer history tab');
  transferTab.click();
  await wait(35);
  assert.ok([...w.document.querySelectorAll('[data-ai-record-action]')].some(item => item.dataset.aiRecordAction === `v4_dorm_transfers:${transfer.id}`), 'dorm transfer history should expose an AI conflict check');
  CWB.go('roll-call');
  await wait(35);
  const rollAction = [...w.document.querySelectorAll('[data-ai-record-action]')].find(item => item.dataset.aiRecordAction === 'v4_roll_call_sessions:audit-roll');
  assert.ok(rollAction, 'saved roll-call sessions should expose a record-level AI worklog action');
  assert.equal(rollAction.dataset.aiTargetCollection, 'v4_roll_call_sessions');
  assert.equal(rollAction.dataset.aiTargetRecordId, 'audit-roll');
  CWB.go('class-analysis');
  await wait(35);
  assert.ok(w.document.querySelector('[data-act="ai-inline"][data-ai-purpose="class_summary"]'), 'class analysis should expose an aggregate AI action');
  CWB.go('academic-analysis');
  await wait(35);
  assert.ok(w.document.querySelector('[data-act="ai-inline"][data-ai-purpose="academic_support"][data-ai-student-id]'), 'academic rows should expose student-level AI help action');
  CWB.go('notice-ai');
  await wait(35);
  assert.ok(w.document.querySelector('[data-act="v47-notice-ai"]'), 'notice page should expose explicit AI capture action');

  const context = CWB.ai.context.build({
    purpose:'research_checklist', student_id:student.id, target_view:'research', target_collection:'v4_research_projects', target_record_id:'audit-research',
  });
  assert.ok(context.records.some(item => item.collection === 'v4_research_projects' && item.record_id === 'audit-research'), 'research target must enter cross-module context');
  assert.ok(context.records.some(item => item.collection === 'v4_family_contacts' && item.record_id === 'audit-family'), 'linked family contact must enter student context');
  const classContext = CWB.ai.context.build({ purpose:'worklog_draft', class_name:student.class_name, target_collection:'v4_class_checks' });
  assert.ok(classContext.records.some(item => item.collection === 'v4_class_checks'), 'class scope must include class checks');
  assert.ok(classContext.records.some(item => item.collection === 'v4_files' && item.record_id === 'audit-policy'), 'class scope must retain unlinked local policy sources');
  const scheduleContext = CWB.ai.context.build({ purpose:'workday_actions', target_view:'schedules', target_collection:'v4_class_schedules', target_record_id:'audit-schedule' });
  assert.ok(scheduleContext.records.some(item => item.collection === 'v4_class_schedules' && item.record_id === 'audit-schedule'), 'schedule target must enter context');
  const rollDateContext = CWB.ai.context.build({ purpose:'worklog_draft', dateRange:{ from:'2026-08-19', to:'2026-08-19' }, target_view:'roll-call', target_collection:'v4_roll_call_sessions' });
  assert.ok(rollDateContext.records.some(item => item.collection === 'v4_roll_call_sessions' && item.record_id === 'audit-roll'), 'roll-call date range must use the normalized date field');
  const largeContext = CWB.ai.context.build({ purpose:'work_summary', records:Array.from({ length:300 }, (_, index) => ({ id:'large-' + index, title:'记录 ' + index })) });
  assert.equal(largeContext.records.length, 240, 'AI context must cap explicit records before outbound serialization');
  assert.equal(largeContext.truncated, true, 'AI context preview must expose truncation');
  assert.equal(largeContext.matched_count, 240, 'explicit context should report the accepted record count');

  const provider = { id:'cross-module-provider', key:'custom', model:'cross-module-demo', enabled:true, allowedPurposes:['dorm_conflict'], dailyQuota:10 };
  let outbound = '';
  const originalSendChat = w.CWBAI.sendChat;
  w.CWBAI.sendChat = async (_provider, messages) => { outbound = JSON.stringify(messages); return { text:'住宿冲突建议草稿' }; };
  const outcome = await CWB.ai.run({
    provider, purpose:'dorm_conflict', apiKey:'test-key-not-real', student_id:student.id,
    target_view:'dorm', target_collection:'v4_dorm_assignments', target_record_id:assignment.id,
    context:CWB.ai.context.build({ purpose:'dorm_conflict', student_id:student.id, target_view:'dorm', target_collection:'v4_dorm_assignments', target_record_id:assignment.id }),
  });
  w.CWBAI.sendChat = originalSendChat;
  assert.equal(outcome.suggestion.risk_level, 'high', 'housing suggestions should require explicit confirmation');
  assert.equal(outcome.suggestion.target_collection, 'v4_dorm_assignments');
  assert.equal(outcome.audit.matched_count, outcome.context.matched_count, 'cross-module generation audit should retain outbound record count');
  assert.equal(outcome.audit.context_limit, outcome.context.context_limit, 'cross-module generation audit should retain context limit');
  assert.ok(outcome.audit.request_id, 'cross-module generation audit should have a request id');
  assert.ok(outcome.suggestion.source_ids.length > 0, 'record-level AI output should retain sources');
  assert.equal(outbound.includes(student.id), false, 'student_id must not leave the local context');
  assert.equal(outbound.includes(assignment.id), false, 'local record ids must not leave the local context');
  assert.equal(outbound.includes(student.full_name), false, 'student name must not leave the local context');
  assert.throws(() => CWB.ai.suggestions.accept(outcome.suggestion.id), /AI_SUGGESTION_CONFIRM_REQUIRED/);
  assert.equal(CWB.ai.suggestions.accept(outcome.suggestion.id, { confirmed:true }).status, 'accepted');

  const notice = await CWB.ai.notice.preview({ text:'请各班于2026年9月1日前提交材料。', source:'审计通知' });
  const noticeSyncParts = [];
  const originalNoticeSync = w.CWB_V4_SYNC;
  w.CWB_V4_SYNC = part => { noticeSyncParts.push(part); return Promise.resolve({ ok:true, part:part || 'all' }); };
  const noticeConfirmation = CWB.ai.notice.confirm(notice, { confirmed:true, convertTo:'task' });
  w.CWB_V4_SYNC = originalNoticeSync;
  assert.equal(noticeConfirmation.record.due, '2026-09-01', 'notice deadline should flow into a converted task');
  assert.equal(noticeSyncParts.filter(part => part === 'tasks').length, 1, 'notice task conversion should commit the task once');
  assert.equal(noticeSyncParts.some(part => !part), false, 'notice task conversion should not fall back to an unscoped all-collection save');

  CWB.go('contacts');
  await wait(35);
  assert.equal(w.document.querySelectorAll('#main [data-act="ai-inline"]').length, 0, 'personal contacts must not expose a broad AI context action');
  assert.equal(w.document.querySelectorAll('#main [data-act="ai-notice-capture"],[data-act="ai-go-center"]').length, 0, 'pages without an allowed AI action must not expose a generic AI bar');

  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS ai-cross-module-audit');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
