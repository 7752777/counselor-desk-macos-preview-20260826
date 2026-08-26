const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (predicate, timeout = 1200) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(20);
  }
  return !!predicate();
};

(async () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'src', 'core', 'cwb-v47-ui.js'), 'utf8');
  const v46Source = fs.readFileSync(path.join(root, 'src', 'core', 'cwb-v46-ui.js'), 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    const message = String(error && error.message || error);
    if (!/Could not load script|Not implemented: window\.scrollTo|HTMLCanvasElement/i.test(message)) errors.push(message);
  });
  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true,
    url: `file:///${path.join(root, 'index.html').replace(/\\/g, '/')}`, virtualConsole,
  });
  await wait(900);
  const { window: w } = dom;
  const runtime = w.CWBV46Runtime;
  assert.ok(runtime && runtime.ACTS, 'runtime action registry should be available');
  assert.match(source, /data-act="task-edit" data-id=/, 'context tasks should carry a direct task action and id');
  assert.match(source, /(?:type="button"[^>]*class="v47-stat"|class="v47-stat"[^>]*type="button")/, 'stat buttons must not submit surrounding forms');
  assert.match(html, /ids\.forEach\(id => markV46WorklogSourceStale\('students', id, 'deleted'\)/, 'student bulk deletion must invalidate source drafts before removal');
  assert.match(html, /markV46WorklogSourceStale\(key, item\.id, 'deleted'\)/, 'business deletion must invalidate source drafts before repository deletion');
  assert.match(v46Source, /markSourceDraftStale\(key, id, 'deleted'/, 'v4.6 shared deletion must invalidate source drafts');
  assert.match(source, /markSourceDraftStale\(key, id, 'deleted'/, 'v4.7 shared deletion must invalidate source drafts');
  assert.match(v46Source, /releaseRecordAttachments\('v4_family_contacts'/, 'family contact deletion must release orphaned attachments');
  assert.match(v46Source, /releaseRecordAttachments\('v4_research_projects'/, 'research deletion must release orphaned attachments');
  assert.match(v46Source, /同一学生、同一班委角色和考核周期已经有记录/, 'committee evaluations must reject duplicate business records');
  assert.match(v46Source, /在任或代理班委必须关联学生[^\n]+return false/, 'committee validation must keep its form open for correction');

  const attachmentFields = runtime.attachmentIdsFromRecord({
    attachment_id:'attachment-primary',
    document_attachment_id:'attachment-document',
    evidence_attachment_id:'attachment-evidence',
    versions:[{ attachment_id:'attachment-history' }],
  });
  assert.deepEqual(new Set(attachmentFields), new Set(['attachment-primary', 'attachment-document', 'attachment-evidence', 'attachment-history']), 'attachment reference discovery should include singular, document, evidence and version fields');
  const originalAttachmentDelete = w.CWB.attachments.delete;
  w.CWB.attachments.delete = async () => { throw new Error('TEST_ATTACHMENT_DELETE_FAILURE'); };
  await assert.rejects(
    runtime.removeV4RecordAttachments('v4_test_attachment_failure', { id:'attachment-owner', attachment_id:'attachment-failure' }),
    error => error && error.message === 'ATTACHMENT_DELETE_FAILED',
    'attachment cleanup failure must stop the owning record deletion'
  );
  w.CWB.attachments.delete = originalAttachmentDelete;

  const photoStudent = w.CWB.norm.student({ id:'ux-photo-rollback', student_number:'UX-PHOTO-ROLLBACK', full_name:'照片回滚测试' });
  const originalStudentPut = w.CWB.repositories.students && w.CWB.repositories.students.put;
  assert.equal(typeof originalStudentPut, 'function', 'student repository should expose async put for photo rollback');
  w.CWB.repositories.students.put = async () => { throw new Error('TEST_STUDENT_PUT_FAILURE'); };
  await assert.rejects(
    w.CWB.photos.uploadForStudent(new w.File(['rollback-photo'], 'rollback.jpg', { type:'image/jpeg' }), photoStudent),
    error => error && error.message === 'TEST_STUDENT_PUT_FAILURE',
    'student photo persistence failure should surface to the caller'
  );
  w.CWB.repositories.students.put = originalStudentPut;
  assert.equal((photoStudent.photo_assets || []).length, 0, 'photo persistence failure must restore the in-memory photo references');
  assert.equal((photoStudent.photo_ids || []).length, 0, 'photo persistence failure must restore the in-memory photo ids');
  assert.equal((await w.CWB.attachments.findForStudent(photoStudent.id)).some(item => item.name === 'rollback.jpg'), false, 'photo persistence failure must remove the newly stored attachment');

  Object.defineProperty(w, 'innerWidth', { value:1024, configurable:true });
  const contextToggle = w.document.querySelector('.v47-context-toggle');
  assert.ok(contextToggle, 'medium desktop should expose a context panel toggle');
  contextToggle.click();
  await wait(40);
  const contextPanel = w.document.querySelector('#cwb-v47-context');
  assert.equal(contextPanel.getAttribute('aria-hidden'), 'false', 'opening the context panel should expose it to assistive technology');
  assert.equal(contextPanel.contains(w.document.activeElement), true, 'opening the context panel should move focus inside it');
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
  await wait(30);
  assert.equal(contextPanel.getAttribute('aria-hidden'), 'true', 'Escape should close the medium context panel');
  assert.equal(w.document.activeElement, contextToggle, 'closing the context panel should return focus to its opener');

  const pending = runtime.normTask({ id: 'ux-pending-task', title: '连续性测试任务', due: runtime.today(), status: 'todo' });
  runtime.DB.tasks.push(pending);
  runtime.go('home');
  await wait(100);
  const contextTask = w.document.querySelector('[data-act="task-edit"][data-id="ux-pending-task"]');
  assert.ok(contextTask, 'right context task should open the selected task directly');
  contextTask.click();
  await wait(30);
  assert.match(w.document.querySelector('#modal-root').textContent, /编辑任务/, 'context task action should open the task editor');
  w.document.querySelector('#modal-root [data-close]').click();

  // Context quick actions must carry the selected student into the next record.
  const contextStudent = runtime.DB.students[0];
  runtime.app.v4 = Object.assign({}, runtime.app.v4 || {}, { aiStudentId:contextStudent.id });
  runtime.go('home');
  await wait(100);
  const clearContextStudent = w.document.querySelector('#cwb-v47-context [data-act="v47-context-clear-student"]');
  assert.ok(clearContextStudent, 'selected student context should provide an explicit clear action');
  clearContextStudent.click();
  await wait(30);
  assert.equal(runtime.app.v4.aiStudentId, '', 'clearing context should remove the persisted student selection');
  assert.equal(runtime.app.v47.aiStudentId, '', 'clearing context should remove the v47 student selection');
  assert.equal(w.document.querySelector('#cwb-v47-context [data-act="task-new"]').dataset.studentId || '', '', 'cleared context must not prefill new tasks');
  runtime.app.v4 = Object.assign({}, runtime.app.v4 || {}, { aiStudentId:contextStudent.id });
  runtime.go('home');
  await wait(80);
  const contextCreateTask = w.document.querySelector('#cwb-v47-context [data-act="task-new"]');
  assert.equal(contextCreateTask.dataset.studentId, contextStudent.id, 'context task action should carry the selected student id');
  contextCreateTask.click();
  await wait(30);
  assert.equal(w.document.querySelector('#modal-root [data-k="student_name"]').value, contextStudent.full_name, 'context task form should prefill the student name');
  assert.equal(w.document.querySelector('#modal-root [data-k="student_number"]').value, contextStudent.student_number, 'context task form should prefill the student number');
  w.document.querySelector('#modal-root [data-close]').click();
  const contextCreateTalk = w.document.querySelector('#cwb-v47-context [data-act="talk-new"]');
  contextCreateTalk.click();
  await wait(30);
  assert.equal(w.document.querySelector('#modal-root [data-k="student_name"]').value, contextStudent.full_name, 'context talk form should prefill the student name');
  assert.equal(w.document.querySelector('#modal-root .mask').dataset.linkedStudentId, contextStudent.id, 'context talk form should retain the stable student id');
  w.document.querySelector('#modal-root [data-close]').click();
  const contextCreateWorklog = w.document.querySelector('#cwb-v47-context [data-act="worklog-new"]');
  contextCreateWorklog.click();
  await wait(30);
  assert.equal(w.document.querySelector('#modal-root [data-k="student_name"]').value, contextStudent.full_name, 'context worklog form should prefill the student name');
  assert.equal(w.document.querySelector('#modal-root [data-k="student_number"]').value, contextStudent.student_number, 'context worklog form should prefill the student number');
  w.document.querySelector('#modal-root [data-close]').click();

  runtime.openStudent(contextStudent);
  await wait(30);
  const profileTalk = w.document.querySelector('#modal-root [data-new-talk]');
  assert.ok(profileTalk, 'student profile should keep a direct talk action');
  profileTalk.click();
  await wait(30);
  assert.equal(w.document.querySelector('#modal-root .mask').dataset.linkedStudentId, contextStudent.id, 'student profile talk action should retain the stable student id');
  w.document.querySelector('#modal-root [data-close]').click();

  // Student picker changes must replace the stable relationship instead of
  // leaving the previous student attached to a newly edited form.
  const pickerStudents = [
    { id:'ux-picker-a', full_name:'连续性选择甲', student_number:'UX-PICKER-A', class_name:'连续性测试甲班' },
    { id:'ux-picker-b', full_name:'连续性选择乙', student_number:'UX-PICKER-B', class_name:'连续性测试乙班' },
  ];
  runtime.DB.students.push(...pickerStudents);
  runtime.go('tasks');
  await wait(60);
  runtime.ACTS['task-new']();
  await wait(30);
  const pickerModal = w.document.querySelector('#modal-root');
  const pickerName = pickerModal.querySelector('[data-k="student_name"]');
  const pickerNumber = pickerModal.querySelector('[data-k="student_number"]');
  const pickerTitle = pickerModal.querySelector('[data-k="title"]');
  pickerName.value = pickerStudents[0].full_name;
  pickerName.dispatchEvent(new w.Event('input', { bubbles:true }));
  assert.equal(pickerNumber.value, pickerStudents[0].student_number, 'typing a unique student name should fill the matching current student number');
  assert.equal(pickerModal.querySelector('.mask').dataset.linkedStudentId, pickerStudents[0].id, 'name selection should set the stable student id');
  pickerName.value = pickerStudents[1].full_name;
  pickerName.dispatchEvent(new w.Event('input', { bubbles:true }));
  assert.equal(pickerNumber.value, pickerStudents[1].student_number, 'changing the student name should replace the previous number');
  assert.equal(pickerModal.querySelector('.mask').dataset.linkedStudentId, pickerStudents[1].id, 'changing the student name should replace the previous stable student id');
  pickerTitle.value = '学生选择一致性测试';
  pickerName.value = pickerStudents[0].full_name;
  pickerNumber.value = pickerStudents[1].student_number;
  pickerModal.querySelector('[data-ok]').click();
  await wait(40);
  assert.ok(w.document.querySelector('#modal-root [data-ok]'), 'conflicting student name and number should keep the form open');
  pickerNumber.value = pickerStudents[0].student_number;
  pickerNumber.dispatchEvent(new w.Event('input', { bubbles:true }));
  pickerModal.querySelector('[data-ok]').click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-ok]'), 15000), true, 'task form should finish its durable save before later actions continue');
  const pickerTask = runtime.DB.tasks.find(item => item.title === '学生选择一致性测试');
  assert.equal(pickerTask && pickerTask.student_id, pickerStudents[0].id, 'a corrected student picker should save the current stable student id');
  assert.equal(pickerTask && pickerTask.student_number, pickerStudents[0].student_number, 'a corrected student picker should save the current number snapshot');

  // Select-based business records must keep the stable ID even though the
  // visible compatibility control still displays the current student number.
  runtime.ACTS['business-new']('', { dataset:{ key:'v4_assessments' } });
  await wait(30);
  const businessModal = w.document.querySelector('#modal-root');
  const businessStudent = businessModal.querySelector('[data-k="student_number"]');
  businessStudent.value = pickerStudents[0].student_number;
  businessStudent.dispatchEvent(new w.Event('change', { bubbles:true }));
  businessModal.querySelector('[data-k="term"]').value = '连续性学期';
  businessModal.querySelector('[data-ok]').click();
  await wait(100);
  const businessRecord = runtime.v4Collection('v4_assessments').find(item => item.term === '连续性学期');
  assert.equal(businessRecord && businessRecord.student_id, pickerStudents[0].id, 'business record should persist the selected stable student id');
  assert.equal(businessRecord && businessRecord.student_number, pickerStudents[0].student_number, 'business record should retain the current number snapshot');

  runtime.ACTS['employment-intent-new']();
  await wait(30);
  const intentModal = w.document.querySelector('#modal-root');
  const intentStudent = intentModal.querySelector('[data-k="student_number"]');
  assert.equal(intentStudent.value, '', 'new employment intent should require an explicit student selection');
  intentStudent.value = pickerStudents[1].student_number;
  intentStudent.dispatchEvent(new w.Event('change', { bubbles:true }));
  intentModal.querySelector('[data-k="graduation_year"]').value = '2027';
  intentModal.querySelector('[data-ok]').click();
  await wait(100);
  const intentRecord = runtime.v4Collection('v4_employment_intents').find(item => String(item.student_number) === pickerStudents[1].student_number && (item.graduation_year === 2027 || String(item.graduation_year) === '2027'));
  assert.equal(intentRecord && intentRecord.student_id, pickerStudents[1].id, 'employment intent should persist the selected stable student id');

  const draftCountBefore = runtime.v4Collection('v4_worklog_drafts').length;
  const completed = runtime.normTask({ id: 'ux-completed-task', title: '幂等完成测试', due: runtime.today(), status: 'todo' });
  runtime.DB.tasks.push(completed);
  runtime.ACTS['task-done'](completed.id);
  const draftCountAfterFirst = runtime.v4Collection('v4_worklog_drafts').length;
  runtime.ACTS['task-done'](completed.id);
  const draftCountAfterSecond = runtime.v4Collection('v4_worklog_drafts').length;
  assert.equal(completed.status, 'done');
  assert.equal(draftCountAfterFirst, draftCountBefore + 1, 'first completion should create one worklog draft');
  assert.equal(draftCountAfterSecond, draftCountAfterFirst, 'repeating completion should not create another draft');

  let calls = 0;
  runtime.ACTS['ux-test-async'] = async () => { calls += 1; await wait(60); };
  const button = w.document.createElement('button');
  button.type = 'button'; button.dataset.act = 'ux-test-async'; button.textContent = '测试异步动作';
  w.document.body.append(button);
  button.click();
  assert.equal(button.getAttribute('aria-busy'), 'true', 'async actions should expose a busy state immediately');
  button.click();
  await wait(120);
  assert.equal(calls, 1, 'repeated clicks during an async action should be ignored');
  assert.equal(button.getAttribute('aria-busy'), null, 'async action should release its busy state');
  delete runtime.ACTS['ux-test-async'];

  let confirmAttempts = 0;
  runtime.ui.confirm('连续性确认测试', '第一次执行故意失败，确认弹窗应保留并允许重试。', async () => {
    confirmAttempts += 1;
    if (confirmAttempts === 1) throw new Error('TEST_CONFIRM_RETRY');
  });
  w.document.querySelector('#modal-root [data-yes]').click();
  await wait(30);
  assert.equal(confirmAttempts, 1, 'confirmation action should run once before retry');
  assert.ok(w.document.querySelector('#modal-root [data-yes]'), 'failed confirmation should keep the dialog open');
  const retryToast = [...w.document.querySelectorAll('#toast-root .toast-action')].find(item => item.textContent === '重试');
  assert.ok(retryToast, 'failed confirmation should expose a retry action');
  retryToast.click();
  await wait(40);
  assert.equal(confirmAttempts, 2, 'retry should run the confirmation action exactly once more');
  assert.equal(w.document.querySelector('#modal-root [data-yes]'), null, 'successful retry should close the confirmation dialog');

  const changedSource = runtime.normTask({ id:'ux-source-changed', title:'来源变化测试', due:runtime.today(), status:'todo', note:'初始记录' });
  runtime.DB.tasks.push(changedSource);
  const changedDraft = w.CWBV46UI.createWorklogDraft(changedSource, 'tasks');
  assert.equal(changedDraft.status, 'draft');
  changedSource.note = '来源已修改'; changedSource.updated_at = new Date().toISOString();
  await w.awaitTrackedSave(runtime.save('tasks'));
  assert.equal(runtime.v4Collection('v4_worklog_drafts').find(item => item.id === changedDraft.id).source_state, 'changed', 'editing a source record should stale its draft');
  assert.equal(w.CWB.workspace.getState().custom.v4_worklog_drafts.find(item => item.id === changedDraft.id).source_state, 'changed', 'source change should persist in the v8 workspace custom state');
  assert.equal(w.CWBV46UI.sourceHash(Object.assign({}, changedSource, { updated_at:'2099-01-01T00:00:00.000Z' }), 'tasks'), w.CWBV46UI.sourceHash(changedSource, 'tasks'), 'storage timestamp changes alone must not invalidate a source draft');

  const deletedSource = runtime.normTask({ id:'ux-source-deleted', title:'来源删除测试', due:runtime.today(), status:'todo' });
  runtime.DB.tasks.push(deletedSource);
  const deletedDraft = w.CWBV46UI.createWorklogDraft(deletedSource, 'tasks');
  runtime.ACTS['task-del'](deletedSource.id);
  w.document.querySelector('#modal-root [data-yes]').click();
  // Earlier actions intentionally leave durable writes in the serialized
  // queue; allow the slow JSDOM persistence fixture to drain without
  // weakening the requirement that the dialog closes only after saving.
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-yes]'), 15000), true, 'source deletion confirmation should close after its save completes');
  const deletedDraftAfter = runtime.v4Collection('v4_worklog_drafts').find(item => item.id === deletedDraft.id);
  assert.equal(deletedDraftAfter.status, 'stale', 'deleting a source record should stale its draft');
  assert.equal(deletedDraftAfter.source_state, 'deleted', 'deleted source drafts must carry a deleted reason');
  assert.equal(w.CWB.workspace.getState().custom.v4_worklog_drafts.find(item => item.id === deletedDraft.id).source_state, 'deleted', 'source deletion should persist in the v8 workspace custom state');

  // Confirming or dismissing a worklog draft must be a durable, retryable
  // action: a failed save cannot leave a confirmed draft or a half-created
  // formal worklog behind in the in-memory view.
  const draftSource = runtime.normTask({ id:'ux-draft-confirm-source', title:'留痕确认来源', due:runtime.today(), status:'todo', note:'来源事实' });
  runtime.DB.tasks.push(draftSource);
  const draftToConfirm = w.CWBV46UI.createWorklogDraft(draftSource, 'tasks', { persist:false });
  assert.equal(draftToConfirm.status, 'draft', 'new worklog draft should start in draft state');
  const worklogCountBeforeConfirm = runtime.DB.worklogs.length;
  const syncBeforeDraftConfirm = w.CWB_V4_SYNC;
  w.CWB_V4_SYNC = () => Promise.reject(new Error('TEST_DRAFT_CONFIRM_FAILURE'));
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  await assert.rejects(
    () => w.CWB.worklogDrafts.confirmAsync(draftToConfirm.id),
    /TEST_DRAFT_CONFIRM_FAILURE/,
    'failed draft confirmation should reject instead of reporting success'
  );
  assert.equal(runtime.v4Collection('v4_worklog_drafts').find(item => item.id === draftToConfirm.id).status, 'draft', 'failed draft confirmation should restore the draft state');
  assert.equal(runtime.DB.worklogs.length, worklogCountBeforeConfirm, 'failed draft confirmation should not leave a formal worklog');
  w.CWB_V4_SYNC = () => Promise.resolve({ ok:true });
  await w.CWB.worklogDrafts.confirmAsync(draftToConfirm.id);
  assert.equal(runtime.v4Collection('v4_worklog_drafts').find(item => item.id === draftToConfirm.id).status, 'confirmed', 'successful draft confirmation should archive the draft');
  assert.equal(runtime.DB.worklogs.filter(item => item.source_draft_id === draftToConfirm.id).length, 1, 'successful draft confirmation should create one formal worklog');
  await w.CWB.worklogDrafts.confirmAsync(draftToConfirm.id);
  assert.equal(runtime.DB.worklogs.filter(item => item.source_draft_id === draftToConfirm.id).length, 1, 'repeating draft confirmation should update rather than duplicate the formal worklog');

  const dismissSource = runtime.normTask({ id:'ux-draft-dismiss-source', title:'留痕驳回来源', due:runtime.today(), status:'todo', note:'驳回来源事实' });
  runtime.DB.tasks.push(dismissSource);
  const draftToDismiss = w.CWBV46UI.createWorklogDraft(dismissSource, 'tasks', { persist:false, id:'ux-draft-dismiss' });
  w.CWB_V4_SYNC = () => Promise.reject(new Error('TEST_DRAFT_DISMISS_FAILURE'));
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  await assert.rejects(
    () => w.CWB.worklogDrafts.dismissAsync(draftToDismiss.id),
    /TEST_DRAFT_DISMISS_FAILURE/,
    'failed draft dismissal should reject instead of losing the draft'
  );
  assert.equal(runtime.v4Collection('v4_worklog_drafts').find(item => item.id === draftToDismiss.id).status, 'draft', 'failed draft dismissal should restore the draft state');
  w.CWB_V4_SYNC = () => Promise.resolve({ ok:true });
  await w.CWB.worklogDrafts.dismissAsync(draftToDismiss.id);
  assert.equal(runtime.v4Collection('v4_worklog_drafts').find(item => item.id === draftToDismiss.id).status, 'dismissed', 'successful draft dismissal should mark the draft dismissed');
  w.CWB_V4_SYNC = syncBeforeDraftConfirm;

  runtime.go('utilities');
  await wait(80);
  const utilityInput = w.document.querySelector('[data-v46-utility-list]');
  assert.ok(utilityInput, 'utility page should expose a list input');
  utilityInput.value = '甲\n乙\n丙';
  runtime.ACTS['v46-utility-run']();
  const taskCountBeforeUtility = runtime.DB.tasks.filter(item => item.source_type === 'utility_result').length;
  await runtime.ACTS['v46-utility-save-task']();
  await runtime.ACTS['v46-utility-save-task']();
  assert.equal(runtime.DB.tasks.filter(item => item.source_type === 'utility_result').length, taskCountBeforeUtility + 1, 'repeating utility task save should not duplicate the result');
  const worklogCountBeforeUtility = runtime.DB.worklogs.filter(item => item.source_collection === 'utility_result').length;
  await runtime.ACTS['v46-utility-save-worklog']();
  await runtime.ACTS['v46-utility-save-worklog']();
  assert.equal(runtime.DB.worklogs.filter(item => item.source_collection === 'utility_result').length, worklogCountBeforeUtility + 1, 'repeating utility worklog save should not duplicate the result');

  const researchId = 'ux-research-project';
  runtime.v4Collection('v4_research_projects').push(w.CWBV46.normalizeRecord('v4_research_projects', { id:researchId, name:'连续性课题', current_stage:'application' }));
  const researchTaskCountBefore = runtime.DB.tasks.filter(item => String(item.source_id || '') === researchId).length;
  await runtime.ACTS['v46-research-task'](researchId);
  await runtime.ACTS['v46-research-task'](researchId);
  assert.equal(runtime.DB.tasks.filter(item => String(item.source_id || '') === researchId).length, researchTaskCountBefore + 1, 'repeating research stage task generation should not duplicate the stage');

  const openFormAndClose = async (view, action, title) => {
    runtime.go(view);
    await wait(50);
    runtime.ACTS[action]();
    await wait(30);
    assert.match(w.document.querySelector('#modal-root').textContent, new RegExp(title), `${action} should open its form`);
    w.document.querySelector('#modal-root [data-close]').click();
    await wait(20);
  };
  await openFormAndClose('committee', 'v46-committee-position-new', '新增班委任职');
  await openFormAndClose('committee', 'v46-committee-evaluation-new', '新增班委考核');
  await openFormAndClose('family', 'v46-family-new', '新增家校联系记录');
  await openFormAndClose('assessment', 'v47-assessment-entry-new', '新增量化积分');
  await openFormAndClose('dorm-inspections', 'v47-dorm-exception-new', '登记查寝异常');
  await openFormAndClose('competitions', 'v47-competition-entry-new', '登记竞赛报名');

  const originalSync = w.CWB_V4_SYNC;
  let failWrites = true;

  // Legacy student forms must use the same stable-ID and retry contract as
  // the newer v4 forms. A failed create must not leave a duplicate on retry.
  const legacyStudent = runtime.DB.students[0];
  runtime.ACTS['attend-new']();
  await wait(30);
  const legacyAttendMask = w.document.querySelector('#modal-root');
  legacyAttendMask.querySelector('[data-k="name"]').value = legacyStudent.full_name;
  legacyAttendMask.querySelector('[data-k="name"]').dispatchEvent(new w.Event('input', { bubbles:true }));
  legacyAttendMask.querySelector('[data-k="date"]').value = runtime.today();
  legacyAttendMask.querySelector('[data-k="note"]').value = '传统表单稳定 ID 重试测试';
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  legacyAttendMask.querySelector('[data-ok]').click();
  assert.equal(await waitFor(() => { const button = w.document.querySelector('#modal-root [data-ok]'); return !!button && !button.disabled; }, 5000), true, 'failed legacy student form save should finish before assertions');
  assert.ok(w.document.querySelector('#modal-root [data-ok]'), 'failed legacy student form save should keep the form open');
  assert.equal(runtime.DB.attend.filter(item => item.note === '传统表单稳定 ID 重试测试').length, 0, 'failed legacy student save should roll back the new record');
  const legacyRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(legacyRetry, 'failed legacy student save should expose a retry action');
  failWrites = false;
  legacyRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-ok]'), 5000), true, 'successful legacy student retry should close the form');
  const legacyAttend = runtime.DB.attend.filter(item => item.note === '传统表单稳定 ID 重试测试');
  assert.equal(legacyAttend.length, 1, 'successful legacy student retry should create one record');
  assert.equal(legacyAttend[0].student_id, legacyStudent.id, 'legacy student form should persist the stable student id');
  w.CWB_V4_SYNC = originalSync;

  // High-frequency task and talk forms must keep their transaction open until
  // talks, follow-up tasks and worklog drafts are durable. A failed save must
  // leave the form open and a retry must create exactly one linked set.
  runtime.go('tasks');
  await wait(60);
  runtime.ACTS['task-new']();
  await wait(30);
  const taskFormMask = w.document.querySelector('#modal-root');
  taskFormMask.querySelector('[data-k="title"]').value = '连续性任务表单回滚';
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  taskFormMask.querySelector('[data-ok]').click();
  assert.equal(await waitFor(() => { const button = w.document.querySelector('#modal-root [data-ok]'); return !!button && !button.disabled; }, 5000), true, 'failed task form save should finish before assertions');
  assert.ok(w.document.querySelector('#modal-root [data-ok]'), 'failed task form save should keep the form open');
  assert.equal(runtime.DB.tasks.filter(item => item.title === '连续性任务表单回滚').length, 0, 'failed task form save should roll back the task');
  const taskRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(taskRetry, 'failed task form save should expose a retry action');
  failWrites = false;
  taskRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-ok]'), 5000), true, 'successful task form retry should close the form');
  assert.equal(runtime.DB.tasks.filter(item => item.title === '连续性任务表单回滚').length, 1, 'successful task retry should create one task');

  runtime.go('talks');
  await wait(60);
  runtime.ACTS['talk-new']();
  await wait(30);
  const talkFormMask = w.document.querySelector('#modal-root');
  talkFormMask.querySelector('[data-k="student_name"]').value = legacyStudent.full_name;
  talkFormMask.querySelector('[data-k="student_name"]').dispatchEvent(new w.Event('input', { bubbles:true }));
  talkFormMask.querySelector('[data-k="start_date"]').value = runtime.today();
  talkFormMask.querySelector('[data-k="follow_date"]').value = runtime.today();
  talkFormMask.querySelector('[data-k="summary"]').value = '连续性谈话表单回滚';
  const talkBefore = runtime.DB.talks.length;
  const followTaskBefore = runtime.DB.tasks.filter(item => item.source_type === 'talk_follow_up').length;
  const talkDraftBefore = runtime.v4Collection('v4_worklog_drafts').length;
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  talkFormMask.querySelector('[data-ok]').click();
  assert.equal(await waitFor(() => { const button = w.document.querySelector('#modal-root [data-ok]'); return !!button && !button.disabled; }, 5000), true, 'failed talk form save should finish before assertions');
  assert.ok(w.document.querySelector('#modal-root [data-ok]'), 'failed talk form save should keep the form open');
  assert.equal(runtime.DB.talks.length, talkBefore, 'failed talk form save should roll back the talk');
  assert.equal(runtime.DB.tasks.filter(item => item.source_type === 'talk_follow_up').length, followTaskBefore, 'failed talk form save should roll back the follow-up task');
  assert.equal(runtime.v4Collection('v4_worklog_drafts').length, talkDraftBefore, 'failed talk form save should roll back the generated worklog draft');
  const talkRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(talkRetry, 'failed talk form save should expose a retry action');
  failWrites = false;
  talkRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-ok]'), 5000), true, 'successful talk form retry should close the form');
  assert.equal(runtime.DB.talks.filter(item => item.summary === '连续性谈话表单回滚').length, 1, 'successful talk retry should create one talk');
  const retriedTalk = runtime.DB.talks.find(item => item.summary === '连续性谈话表单回滚');
  assert.equal(runtime.DB.tasks.filter(item => item.source_type === 'talk_follow_up' && String(item.source_talk_id) === String(retriedTalk && retriedTalk.id)).length, 1, 'successful talk retry should create one linked follow-up task');
  assert.equal(runtime.v4Collection('v4_worklog_drafts').filter(item => item.source_collection === 'talks' && item.summary === '连续性谈话表单回滚').length, 1, 'successful talk retry should create one linked worklog draft');
  w.CWB_V4_SYNC = originalSync;

  // Dorm transfers write custom accommodation history and the student's base
  // snapshot together. A failure must restore both before the form can retry.
  const dormStudent = runtime.DB.students[0];
  const dormBuilding = { id:'ux-dorm-building', name:'连续性测试楼', campus:'主校区', gender_limit:'不限', enabled:true, schema_version:9 };
  const dormSourceRoom = { id:'ux-dorm-source-room', building_id:dormBuilding.id, room_number:'101', capacity:1, bed_numbers:['1'], status:'可用', schema_version:9 };
  const dormTargetRoom = { id:'ux-dorm-target-room', building_id:dormBuilding.id, room_number:'202', capacity:1, bed_numbers:['1'], status:'可用', schema_version:9 };
  const dormBatch = { id:'ux-dorm-batch', academic_year:'2026-2027', term:'秋季', batch_type:'日常调整', status:'草稿', schema_version:9 };
  const dormAssignment = { id:'ux-dorm-assignment', batch_id:dormBatch.id, student_id:dormStudent.id, student_number:dormStudent.student_number, student_name:dormStudent.full_name, class_name:dormStudent.class_name, building_id:dormBuilding.id, room_id:dormSourceRoom.id, bed_number:'1', status:'confirmed', check_in_date:runtime.today(), schema_version:9 };
  runtime.v4Collection('v4_dorm_buildings').push(dormBuilding);
  runtime.v4Collection('v4_dorm_rooms').push(dormSourceRoom, dormTargetRoom);
  runtime.v4Collection('v4_dorm_batches').push(dormBatch);
  runtime.v4Collection('v4_dorm_assignments').push(dormAssignment);
  const dormStudentBefore = { dorm_building:dormStudent.dorm_building, dorm_room:dormStudent.dorm_room, dorm:dormStudent.dorm, residence_type:dormStudent.residence_type };
  runtime.go('dorm');
  await wait(60);
  runtime.ACTS['v46-dorm-transfer-new']();
  await wait(35);
  const dormTransferMask = w.document.querySelector('#modal-root');
  assert.ok(dormTransferMask, 'dorm transfer should open a form');
  dormTransferMask.querySelector('[data-k="assignment_id"]').value = dormAssignment.id;
  dormTransferMask.querySelector('[data-k="to_room_id"]').value = dormTargetRoom.id;
  dormTransferMask.querySelector('[data-k="to_bed_number"]').value = '1';
  dormTransferMask.querySelector('[data-k="transfer_date"]').value = runtime.today();
  dormTransferMask.querySelector('[data-k="reason"]').value = '连续性测试调宿';
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  dormTransferMask.querySelector('[data-ok]').click();
  const dormFailureSettled = await waitFor(() => { const button = w.document.querySelector('#modal-root [data-ok]'); return !!button && !button.disabled; }, 5000);
  assert.equal(dormFailureSettled, true, 'failed dorm transfer save should finish before assertions');
  assert.ok(w.document.querySelector('#modal-root [data-ok]'), 'failed dorm transfer save should keep the form open');
  assert.equal(runtime.v4Collection('v4_dorm_transfers').some(item => item.reason === '连续性测试调宿'), false, 'failed dorm transfer should not leave history');
  assert.equal(runtime.v4Collection('v4_dorm_assignments').some(item => item.room_id === dormTargetRoom.id), false, 'failed dorm transfer should not leave the target assignment');
  assert.deepEqual({ dorm_building:dormStudent.dorm_building, dorm_room:dormStudent.dorm_room, dorm:dormStudent.dorm, residence_type:dormStudent.residence_type }, dormStudentBefore, 'failed dorm transfer should restore the student snapshot');
  const dormTransferRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(dormTransferRetry, 'failed dorm transfer should expose a retry action');
  failWrites = false;
  dormTransferRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-ok]'), 5000), true, 'successful dorm transfer retry should finish before assertions');
  assert.equal(w.document.querySelector('#modal-root [data-ok]'), null, 'successful dorm transfer retry should close the form');
  assert.equal(runtime.v4Collection('v4_dorm_transfers').filter(item => item.reason === '连续性测试调宿').length, 1, 'successful dorm transfer retry should create one history record');
  assert.equal(runtime.v4Collection('v4_dorm_assignments').filter(item => item.room_id === dormTargetRoom.id).length, 1, 'successful dorm transfer retry should create one target assignment');
   assert.equal(runtime.v4Collection('v4_dorm_assignments').find(item => item.id === dormAssignment.id).status, 'checked_out', 'successful dorm transfer should close the original assignment');

  const dormTransfer = runtime.v4Collection('v4_dorm_transfers').find(item => item.reason === '连续性测试调宿');
  assert.ok(dormTransfer, 'successful dorm transfer should create a transfer history row');
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  runtime.ACTS['v46-dorm-cancel-transfer'](dormTransfer.id);
  w.document.querySelector('#modal-root [data-yes]').click();
  assert.equal(await waitFor(() => { const button = w.document.querySelector('#modal-root [data-yes]'); return !!button && !button.disabled; }, 5000), true, 'failed dorm transfer cancellation should finish before assertions');
  assert.ok(w.document.querySelector('#modal-root [data-yes]'), 'failed dorm transfer cancellation should keep confirmation open');
  assert.equal(dormTransfer.status, 'active', 'failed dorm transfer cancellation should restore the active status');
  const dormCancelRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(dormCancelRetry, 'failed dorm transfer cancellation should expose a retry action');
  failWrites = false;
  dormCancelRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-yes]'), 5000), true, 'successful dorm transfer cancellation retry should finish before assertions');
  assert.equal(w.document.querySelector('#modal-root [data-yes]'), null, 'successful dorm transfer cancellation retry should close confirmation');
  assert.equal(dormTransfer.status, 'cancelled', 'successful dorm transfer cancellation should mark the history row invalid');
  w.CWB_V4_SYNC = originalSync;

  const familyStudent = runtime.DB.students[0];
  runtime.go('family');
  await wait(60);
  runtime.ACTS['v46-family-new']();
  await wait(30);
  const familyMask = w.document.querySelector('#modal-root');
  familyMask.querySelector('[data-k="student_id"]').value = familyStudent.id;
  familyMask.querySelector('[data-k="contact_date"]').value = runtime.today();
  familyMask.querySelector('[data-k="purpose"]').value = '连续性家校联系';
  familyMask.querySelector('[data-k="summary"]').value = '连续性失败恢复测试';
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  familyMask.querySelector('[data-ok]').click();
  assert.equal(await waitFor(() => { const button = w.document.querySelector('#modal-root [data-ok]'); return !!button && !button.disabled; }, 5000), true, 'failed family contact save should finish before assertions');
  assert.equal(runtime.v4Collection('v4_family_contacts').some(item => item.purpose === '连续性家校联系'), false, 'failed family contact should not leave the contact record');
  assert.equal(runtime.v4Collection('v4_worklog_drafts').some(item => item.title === '家校联系 · ' + familyStudent.full_name), false, 'failed family contact should not leave its worklog draft');
  const familyRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(familyRetry, 'failed family contact should expose a retry action');
  failWrites = false;
  familyRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-ok]'), 5000), true, 'successful family contact retry should close the form');
  assert.equal(runtime.v4Collection('v4_family_contacts').filter(item => item.purpose === '连续性家校联系').length, 1, 'successful family contact retry should create one record');
  assert.equal(runtime.v4Collection('v4_worklog_drafts').filter(item => item.title === '家校联系 · ' + familyStudent.full_name).length, 1, 'successful family contact retry should create one worklog draft');

  runtime.go('research');
  await wait(60);
  runtime.ACTS['v46-research-new']();
  await wait(30);
  const researchMask = w.document.querySelector('#modal-root');
  researchMask.querySelector('[data-k="name"]').value = '连续性科研课题';
  researchMask.querySelector('[data-k="stage_due_date"]').value = runtime.today();
  researchMask.querySelector('[data-k="next_action"]').value = '准备申请材料';
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  researchMask.querySelector('[data-ok]').click();
  assert.equal(await waitFor(() => { const button = w.document.querySelector('#modal-root [data-ok]'); return !!button && !button.disabled; }, 5000), true, 'failed research project save should finish before assertions');
  assert.equal(runtime.v4Collection('v4_research_projects').some(item => item.name === '连续性科研课题'), false, 'failed research project should not leave a project row');
  const researchRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(researchRetry, 'failed research project should expose a retry action');
  failWrites = false;
  researchRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-ok]'), 5000), true, 'successful research project retry should close the form');
  assert.equal(runtime.v4Collection('v4_research_projects').filter(item => item.name === '连续性科研课题').length, 1, 'successful research project retry should create one row');
  w.CWB_V4_SYNC = originalSync;

  const rollbackFile = {
    id:'ux-file-rollback', title:'当前文件', version:2, content:'当前版本内容',
    versions:[
      { version:1, name:'历史文件', content:'历史版本内容', url:'https://example.com/old' },
      { version:2, name:'当前文件', content:'当前版本内容', url:'https://example.com/new' },
    ], updated_at:new Date().toISOString(), schema_version:8,
  };
  runtime.v4Collection('v4_files').push(rollbackFile);
  const fileRepository = w.CWB.repositories && w.CWB.repositories.v4_files;
  const originalFilePut = fileRepository && fileRepository.put;
  assert.equal(typeof originalFilePut, 'function', 'file repository should expose async put for rollback tests');
  fileRepository.put = async () => { throw new Error('TEST_ROLLBACK_SAVE_FAILURE'); };
  await assert.rejects(
    runtime.rollbackV4FileTransactional(rollbackFile, rollbackFile.versions[0]),
    error => error && error.message === 'TEST_ROLLBACK_SAVE_FAILURE',
    'file rollback save failure should surface and restore the previous version'
  );
  assert.equal(rollbackFile.version, 2, 'failed file rollback should restore the previous version number');
  assert.equal(rollbackFile.title, '当前文件', 'failed file rollback should restore the previous title');
  assert.equal(rollbackFile.content, '当前版本内容', 'failed file rollback should restore the previous content');
  fileRepository.put = originalFilePut;
  await runtime.rollbackV4FileTransactional(rollbackFile, rollbackFile.versions[0]);
  assert.equal(rollbackFile.version, 1, 'successful file rollback should switch the current version');
  assert.equal(rollbackFile.title, '历史文件', 'successful file rollback should restore the historical title');
  assert.equal(rollbackFile.content, '历史版本内容', 'successful file rollback should restore historical content');
  w.CWB_V4_SYNC = originalSync;

  const partyRows = runtime.v4Collection('v4_party_cases');
  const partyStudent = runtime.DB.students[0];
  const partyCase = { id:'ux-party-save-rollback', stage:'party_applicant', rule_version:'2026-05-11', student_id:partyStudent && partyStudent.id, student_number:partyStudent && partyStudent.student_number, birth_date:'2000-01-01', application_at:runtime.today(), audit_log:[], schema_version:8 };
  partyRows.push(partyCase);
  const partySync = w.CWB_V4_SYNC;
  w.CWB_V4_SYNC = () => Promise.reject(new Error('TEST_PARTY_SAVE_FAILURE'));
  await assert.rejects(
    runtime.ACTS['v4-party-complete']('', { dataset:{ index:String(partyRows.length - 1) } }),
    error => error && error.message === 'TEST_PARTY_SAVE_FAILURE',
    'party step save failure should surface to the caller'
  );
  const restoredParty = partyRows.find(item => item.id === partyCase.id);
  assert.equal(restoredParty.steps[0].status, 'pending', 'failed party step completion should restore the pending state');
  w.CWB_V4_SYNC = partySync;
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  await w.awaitTrackedSave(runtime.save('settings'));
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  runtime.go('toolbox');
  await wait(60);
  runtime.ACTS['v47-tool-new']();
  await wait(30);
  const failedForm = w.document.querySelector('#modal-root');
  failedForm.querySelector('[data-k="name"]').value = '失败后重试工具';
  failedForm.querySelector('[data-k="url"]').value = 'https://example.com/tool';
  failedForm.querySelector('[data-ok]').click();
  const toolFailureSettled = await waitFor(() => { const button = w.document.querySelector('#modal-root [data-ok]'); return !!button && !button.disabled; }, 5000);
  assert.equal(toolFailureSettled, true, 'form save failure should finish before assertions');
  assert.ok(w.document.querySelector('#modal-root [data-ok]'), 'form save failure should keep the editor open');
  assert.equal(w.document.querySelector('#modal-root [data-k="name"]').value, '失败后重试工具', 'form save failure should preserve entered values');
  assert.equal(runtime.v4Collection('v4_tool_links').filter(item => item.name === '失败后重试工具').length, 0, 'form save failure should roll back the in-memory v4 record before retry');
  const formRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(formRetry, 'form save failure should expose a retry action');
  failWrites = false;
  formRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-ok]'), 5000), true, 'successful form retry should finish before assertions');
  assert.equal(w.document.querySelector('#modal-root [data-ok]'), null, 'successful form retry should close the editor');
  assert.equal(runtime.v4Collection('v4_tool_links').filter(item => item.name === '失败后重试工具').length, 1, 'form retry should not duplicate the v4 record');

  const confirmTask = runtime.normTask({ id:'ux-confirm-save-failure', title:'确认保存失败测试', due:runtime.today(), status:'todo' });
  runtime.DB.tasks.push(confirmTask);
  failWrites = true;
  runtime.ui.confirm('确认保存失败测试', '用于验证失败时确认框保留。', () => { runtime.save('tasks'); });
  w.document.querySelector('#modal-root [data-yes]').click();
  assert.equal(await waitFor(() => { const button = w.document.querySelector('#modal-root [data-yes]'); return !!button && !button.disabled; }, 5000), true, 'confirmation save failure should finish before assertions');
  assert.ok(w.document.querySelector('#modal-root [data-yes]'), 'confirmation save failure should keep the dialog open');
  const confirmRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(confirmRetry, 'confirmation save failure should expose a retry action');
  failWrites = false;
  confirmRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-yes]')), true, 'successful confirmation retry should close the dialog');

  const deleteTool = { id:'ux-delete-save-failure', name:'删除失败回滚工具', url:'https://example.com/delete', category:'其他', schema_version:9 };
  runtime.v4Collection('v4_tool_links').push(deleteTool);
  failWrites = true;
  runtime.ACTS['v47-tool-delete'](deleteTool.id);
  w.document.querySelector('#modal-root [data-yes]').click();
  assert.equal(await waitFor(() => { const button = w.document.querySelector('#modal-root [data-yes]'); return !!button && !button.disabled; }, 5000), true, 'delete save failure should finish before assertions');
  assert.ok(w.document.querySelector('#modal-root [data-yes]'), 'delete save failure should keep the confirmation dialog open');
  assert.equal(runtime.v4Collection('v4_tool_links').some(item => item.id === deleteTool.id), true, 'delete save failure should restore the in-memory row');
  const deleteRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(deleteRetry, 'delete save failure should expose a retry action');
  failWrites = false;
  deleteRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-yes]'), 5000), true, 'successful delete retry should finish before assertions');
  assert.equal(w.document.querySelector('#modal-root [data-yes]'), null, 'successful delete retry should close the confirmation dialog');
  assert.equal(runtime.v4Collection('v4_tool_links').some(item => item.id === deleteTool.id), false, 'successful delete retry should remove the row exactly once');

  // Low-frequency v4 editors use the same mutation boundary as the main
  // workspace. A failed write must not leave an added row in memory, and a
  // retry must add it once rather than duplicating the record.
  assert.equal(typeof runtime.persistArrayMutation, 'function', 'array editors should expose the transactional mutation helper');
  const contactRows = runtime.v4Collection('v4_contacts');
  const contactId = 'ux-contact-save-failure';
  failWrites = true;
  await assert.rejects(
    () => runtime.persistArrayMutation(contactRows, 'custom', list => list.push({ id:contactId, name:'通讯录回滚测试' })),
    /TEST_SAVE_FAILURE/,
    'contact save failure should surface to the caller'
  );
  assert.equal(contactRows.some(item => item.id === contactId), false, 'contact save failure should remove the in-memory row');
  failWrites = false;
  await runtime.persistArrayMutation(contactRows, 'custom', list => list.push({ id:contactId, name:'通讯录回滚测试' }));
  assert.equal(contactRows.filter(item => item.id === contactId).length, 1, 'contact retry should create exactly one row');
  const editableContact = { id:'ux-contact-edit-save-failure', name:'编辑前名称', department:'学生工作处' };
  contactRows.push(editableContact);
  failWrites = true;
  await assert.rejects(
    () => runtime.persistArrayMutation(contactRows, 'custom', list => {
      const item = list.find(value => value.id === editableContact.id);
      Object.assign(item, { name:'不应残留的名称', department:'就业指导中心' });
    }),
    /TEST_SAVE_FAILURE/,
    'editing an existing row should surface its failed write'
  );
  const restoredContact = contactRows.find(item => item.id === editableContact.id);
  assert.equal(restoredContact, editableContact, 'failed edit rollback should preserve the editor record reference for retry');
  assert.equal(restoredContact.name, '编辑前名称', 'failed edit rollback should restore the original field values');
  assert.equal(restoredContact.department, '学生工作处', 'failed edit rollback should restore all changed fields');
  failWrites = false;
  await runtime.persistArrayMutation(contactRows, 'custom', list => {
    const item = list.find(value => value.id === editableContact.id);
    Object.assign(item, { name:'重试后名称', department:'就业指导中心' });
  });
  assert.equal(editableContact.name, '重试后名称', 'a retry should persist through the same editor record reference');
  assert.equal(editableContact.department, '就业指导中心', 'a retry should not require reopening the editor');
  assert.match(html, /async onSave\(v\) \{\n      const next = normNode/, 'work-node editor must wait for a transactional save');
  assert.match(html, /await persistArrayMutation\(DB\.node, 'node'/, 'work-node editor must roll back a failed save');
  assert.match(html, /await persistArrayMutation\(DB\.policy, 'policy'/, 'policy editor must roll back a failed save');
  assert.match(html, /await persistArrayMutation\(DB\.material, 'material'/, 'material editor must roll back a failed save');
  assert.match(html, /await persistArrayMutation\(DB\.comp, 'comp'/, 'competition editor must roll back a failed save');
  assert.match(html, /await persistArrayMutation\(DB\.tpl, 'tpl'/, 'template editor must roll back a failed save');
  assert.match(html, /const snapshot = snapshotDataMutation\(\['activities', 'custom'\]\)/, 'activity edit must snapshot its related participant collection');
  assert.match(html, /cleanup_failed_attachment_ids/, 'attachment-bearing editors must report cleanup failures for recovery');

  // AI certificate confirmation spans rewards, the AI draft and its audit.
  // A failed workspace save must restore all three collections, rather than
  // leaving a confirmed draft without its corresponding award record.
  const certificateStudent = runtime.DB.students[0];
  const certificateDraft = w.CWBAIWorkflow.normalizeDraft({
    id:'ux-certificate-save-failure', kind:'certificate', purpose:'certificate_recognition', status:'draft',
    payload:{ title:'国家级证书回滚测试' }, student_id:'', source_attachment_id:'',
  });
  runtime.v4Collection('v4_ai_drafts').push(certificateDraft);
  const rewardsBeforeCertificate = runtime.DB.rewards.length;
  failWrites = true;
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  w.CWB.ai.confirmCertificateDraft(certificateDraft.id, { student_id:certificateStudent.id, title:'国家级证书回滚测试', level:'国家级' });
  await assert.rejects(() => w.awaitTrackedSave(w.__CWB_LAST_SAVE_PROMISE__), /TEST_SAVE_FAILURE/, 'certificate confirmation save failure should be observable to the caller');
  assert.equal(runtime.DB.rewards.length, rewardsBeforeCertificate, 'failed certificate confirmation should not leave an award record');
  assert.equal(runtime.v4Collection('v4_ai_drafts').find(item => item.id === certificateDraft.id).status, 'draft', 'failed certificate confirmation should restore the draft');
  failWrites = false;
  w.CWB_V4_SYNC = originalSync;
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  w.CWB.ai.confirmCertificateDraft(certificateDraft.id, { student_id:certificateStudent.id, title:'国家级证书回滚测试', level:'国家级' });
  await w.awaitTrackedSave(w.__CWB_LAST_SAVE_PROMISE__);
  assert.equal(runtime.DB.rewards.filter(item => item.ai_draft_id === certificateDraft.id).length, 1, 'successful certificate confirmation should create one award record');

  const certificateDraftAudit = { id:'ux-certificate-draft-audit', action:'certificate_recognition', status:'completed' };
  runtime.v4Collection('v4_ai_audit').push(certificateDraftAudit);
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  const unsavedCertificateDraft = w.CWB.ai.createCertificateDraft({
    id:'ux-certificate-draft-save-failure', audit_id:certificateDraftAudit.id, title:'证书草稿保存回滚测试',
  });
  const certificateDraftSaveError = await w.awaitTrackedSave(w.__CWB_LAST_SAVE_PROMISE__).then(() => null, error => error);
  assert.ok(certificateDraftSaveError, `certificate draft save failure should be observable to the caller (got ${String(certificateDraftSaveError && certificateDraftSaveError.message || certificateDraftSaveError)})`);
  assert.match(String(certificateDraftSaveError.message || certificateDraftSaveError), /TEST_SAVE_FAILURE/);
  assert.equal(runtime.v4Collection('v4_ai_drafts').some(item => item.id === unsavedCertificateDraft.id), false, 'failed certificate draft save should remove the draft');
  assert.equal(runtime.v4Collection('v4_ai_audit').find(item => item.id === certificateDraftAudit.id).draft_id, undefined, 'failed certificate draft save should restore the generation audit');
  failWrites = false;
  w.CWB_V4_SYNC = originalSync;

  const workSummarySuggestion = w.CWB.ai.suggestions.create({
    id:'ux-work-summary-save-failure', purpose:'work_summary', title:'工作总结保存回滚测试', summary:'仅用于失败恢复验证',
    status:'review', persist:false,
  });
  const worklogCountBeforeSummary = runtime.DB.worklogs.length;
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  w.CWB.ai.confirmWorkSummary({
    text:'工作总结失败恢复测试', sources:[], suggestion_id:workSummarySuggestion.id, ai_generated:true,
  });
  await assert.rejects(() => w.awaitTrackedSave(w.__CWB_LAST_SAVE_PROMISE__), /TEST_SAVE_FAILURE/, 'work summary save failure should be observable to the caller');
  assert.equal(runtime.DB.worklogs.length, worklogCountBeforeSummary, 'failed work summary confirmation should not leave a formal worklog');
  assert.equal(w.CWB.ai.suggestions.list({ query:'工作总结保存回滚测试' }).find(item => item.id === workSummarySuggestion.id).status, 'review', 'failed work summary confirmation should restore the suggestion state');
  assert.equal(runtime.v4Collection('v4_ai_audit').some(item => item.action === 'work_summary_confirm' && item.suggestion_id === workSummarySuggestion.id), false, 'failed work summary confirmation should remove its confirmation audit');
  failWrites = false;
  w.CWB_V4_SYNC = originalSync;
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  const confirmedSummary = w.CWB.ai.confirmWorkSummary({
    text:'工作总结失败恢复测试', sources:[], suggestion_id:workSummarySuggestion.id, ai_generated:true,
  });
  await w.awaitTrackedSave(w.__CWB_LAST_SAVE_PROMISE__);
  assert.equal(confirmedSummary.ai_suggestion_id, workSummarySuggestion.id, 'successful work summary retry should retain the suggestion link');
  assert.equal(runtime.DB.worklogs.filter(item => item.ai_suggestion_id === workSummarySuggestion.id).length, 1, 'successful work summary retry should create one formal worklog');

  // Deleting a model connection must not hide a failed persistence operation;
  // the credential is restored so the user can retry without re-entering it.
  const providerRows = runtime.v4Collection('v4_ai_providers');
  const provider = { id:'ux-provider-delete-rollback', key:'custom', name:'删除回滚模型', model:'test-model', baseUrl:'https://example.com/v1', enabled:true, secret_set:true, allowedPurposes:['task_plan'], schema_version:10 };
  providerRows.push(provider);
  const sessionValues = new Map([
    ['cwb_ai_secret_ux-provider-delete-rollback', 'test-secret'],
    ['cwb_ai_relay_token_ux-provider-delete-rollback', 'test-relay'],
  ]);
  Object.defineProperty(w, 'sessionStorage', { configurable:true, value:{
    getItem:key => sessionValues.has(String(key)) ? sessionValues.get(String(key)) : null,
    setItem:(key, value) => sessionValues.set(String(key), String(value)),
    removeItem:key => sessionValues.delete(String(key)),
  } });
  failWrites = true;
  w.CWB_V4_SYNC = () => failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
  runtime.ACTS['ai-provider-delete']('', { dataset:{ index:String(providerRows.indexOf(provider)) } });
  w.document.querySelector('#modal-root [data-yes]').click();
  assert.equal(await waitFor(() => { const button = w.document.querySelector('#modal-root [data-yes]'); return !!button && !button.disabled; }, 5000), true, 'model delete save failure should finish before assertions');
  assert.ok(w.document.querySelector('#modal-root [data-yes]'), 'model delete save failure should keep the confirmation dialog open');
  assert.equal(providerRows.some(item => item.id === provider.id), true, 'model delete save failure should restore the provider configuration');
  assert.equal(sessionValues.get('cwb_ai_secret_ux-provider-delete-rollback'), 'test-secret', 'model delete save failure should restore the API secret');
  assert.equal(sessionValues.get('cwb_ai_relay_token_ux-provider-delete-rollback'), 'test-relay', 'model delete save failure should restore the relay token');
  const providerDeleteRetry = [...w.document.querySelectorAll('#toast-root .toast-action')].filter(item => item.textContent === '重试').at(-1);
  assert.ok(providerDeleteRetry, 'model delete save failure should expose a retry action');
  failWrites = false;
  providerDeleteRetry.click();
  assert.equal(await waitFor(() => !w.document.querySelector('#modal-root [data-yes]'), 5000), true, 'successful model delete retry should finish before assertions');
  assert.equal(w.document.querySelector('#modal-root [data-yes]'), null, 'successful model delete retry should close the confirmation dialog');
  assert.equal(providerRows.some(item => item.id === provider.id), false, 'successful model delete retry should remove the provider exactly once');
  assert.equal(sessionValues.has('cwb_ai_secret_ux-provider-delete-rollback'), false, 'successful model delete should remove the API secret');
  assert.equal(sessionValues.has('cwb_ai_relay_token_ux-provider-delete-rollback'), false, 'successful model delete should remove the relay token');

  const aiFailure = w.CWB.ai.suggestions.create({ id:'ux-ai-save-failure', purpose:'task_plan', status:'review', title:'AI 保存失败回滚', payload:{ text:'仅用于回归' } });
  failWrites = true;
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  w.CWB.ai.suggestions.accept(aiFailure.id, { confirmed:true });
  await assert.rejects(() => w.awaitTrackedSave(w.__CWB_LAST_SAVE_PROMISE__), /TEST_SAVE_FAILURE/, 'AI suggestion save failure should be observable to the caller');
  assert.equal(w.CWB.ai.suggestions.list({ query:'AI 保存失败回滚' }).some(item => item.id === aiFailure.id && item.status === 'review'), true, 'failed AI acceptance should restore the review state');

  // Notice preview persists its local source and audit before confirmation.
  // Keep that preparation writable so the injected failure exercises only
  // the confirmation transaction below.
  failWrites = false;
  w.__CWB_LAST_SAVE_PROMISE__ = null;
  const noticePreview = await w.CWB.ai.notice.preview({ text:'请于 2026 年 9 月 1 日前提交材料。', source:'保存失败回归' });
  failWrites = true;
  const noticeConfirmResult = w.CWB.ai.notice.confirm(noticePreview, { confirmed:true });
  const noticeId = noticeConfirmResult.suggestion.id;
  await assert.rejects(() => w.awaitTrackedSave(w.__CWB_LAST_SAVE_PROMISE__), /TEST_SAVE_FAILURE/, 'AI notice confirmation failure should be observable to the caller');
  assert.equal(w.CWB.ai.suggestions.list({}).some(item => item.id === noticeId), false, 'failed AI notice confirmation should not leave a half-created suggestion');
  failWrites = false;
  w.CWB_V4_SYNC = originalSync;

  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS interaction-continuity');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
