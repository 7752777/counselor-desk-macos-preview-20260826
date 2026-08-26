const assert = require('node:assert/strict');
const { CWBCollections } = require('../src/core/cwb-collections.js');
const migration = require('../src/core/v11-migration.js');
const v48 = require('../src/core/cwb-v48.js');

assert.equal(CWBCollections.schemaVersion, 11);
for (const key of migration.NEW_COLLECTIONS) assert.ok(CWBCollections.custom.includes(key), `manifest missing ${key}`);

const migrated = migration.migrate({
  data_schema_version:10,
  settings:{ theme:'light' },
  students:[{ id:'s1', student_number:'2024001', full_name:'甲' }],
  custom:{},
}, { from_schema_version:10 });
assert.equal(migrated.state.data_schema_version, 11);
assert.equal(migrated.state.settings.sync_protocol_version, 1);
assert.deepEqual(migrated.state.students[0].student_number_history, []);
assert.equal(migration.isV11(migrated.state), true);

const existing = [
  { id:'s1', student_id:'s1', student_number:'2024001', full_name:'甲', class_name:'一班', phone:'13800000000', student_number_history:[] },
  { id:'s2', student_id:'s2', student_number:'2024002', full_name:'乙', student_number_history:['2023999'] },
];
const preview = v48.studentImport.preview([
  { student_id:'s1', student_number:'2024001', class_name:'二班', phone:'' },
  { student_number:'2023999', full_name:'乙' },
  { student_number:'2024003', full_name:'丙', class_name:'三班' },
], existing, { mode:'merge' });
assert.equal(preview.canCommit, true);
assert.equal(preview.summary.update, 2);
assert.equal(preview.summary.create, 1);
const applied = v48.studentImport.apply(existing, preview);
assert.equal(applied.students.length, 3);
assert.equal(applied.students.find(row => row.id === 's1').phone, '13800000000', 'blank import values keep existing data');
assert.deepEqual(applied.students.find(row => row.id === 's2').student_number_history, ['2023999']);
assert.equal(applied.students.find(row => row.id === 's3' || row.student_number === '2024003').student_number, '2024003');

const numberChanged = v48.studentImport.preview([{ student_id:'s1', student_number:'2024999' }], applied.students);
const numberChangedResult = v48.studentImport.apply(applied.students, numberChanged);
const changedStudent = numberChangedResult.students.find(row => row.id === 's1');
assert.equal(changedStudent.student_number, '2024999');
assert.deepEqual(changedStudent.student_number_history, ['2024001']);

const classUpdated = v48.studentImport.preview([{ student_id:'s1', class_name:'三班' }], numberChangedResult.students);
const classUpdatedResult = v48.studentImport.apply(numberChangedResult.students, classUpdated, {
  class_history:[], effective_date:'2026-08-24', reason:'教务分班', source:'导入测试', operator:'测试老师',
});
assert.equal(classUpdatedResult.students.find(row => row.id === 's1').class_name, '三班');
assert.equal(classUpdatedResult.class_history_changes.length, 1, 'class changes from an incremental import must create a dated history fact');
assert.equal(classUpdatedResult.class_history_changes[0].student_id, 's1');
assert.equal(classUpdatedResult.class_history_changes[0].from_class_name, '二班');
assert.equal(classUpdatedResult.class_history_changes[0].to_class_name, '三班');
assert.equal(classUpdatedResult.class_history_changes[0].effective_date, '2026-08-24');
assert.equal(classUpdatedResult.class_history_changes[0].reason, '教务分班', 'history fact must preserve the old and new class for later date-based analysis');
const sameClassPreview = v48.studentImport.preview([{ student_id:'s1', class_name:'三班' }], classUpdatedResult.students);
const sameClassResult = v48.studentImport.apply(classUpdatedResult.students, sameClassPreview, { class_history:classUpdatedResult.class_history, effective_date:'2026-08-24' });
assert.equal(sameClassResult.class_history_changes.length, 0, 'same class imports must not create duplicate history facts');

const datedHistory = [
  { id:'h-early', student_id:'s-history', effective_date:'2026-08-01', created_at:'2026-08-01T10:00:00.000Z', from_class_name:'一班', to_class_name:'二班', class_name:'二班' },
  { id:'h-same-day-2', student_id:'s-history', effective_date:'2026-08-24', created_at:'2026-08-24T11:00:00.000Z', from_class_name:'三班', to_class_name:'四班', class_name:'四班' },
  { id:'h-same-day-1', student_id:'s-history', effective_date:'2026-08-24', created_at:'2026-08-24T10:00:00.000Z', from_class_name:'二班', to_class_name:'三班', class_name:'三班' },
  { id:'h-late', student_id:'s-history', effective_date:'2026-09-01', created_at:'2026-08-24T12:00:00.000Z', from_class_name:'四班', to_class_name:'五班', class_name:'五班' },
];
const datedStudent = { id:'s-history', student_id:'s-history', class_name:'四班' };
assert.equal(v48.analysis.activeClassAtDate(datedStudent, datedHistory, '2026-07-31'), '一班', 'a date before the first transition must use the earliest known predecessor, not today\'s class');
assert.equal(v48.analysis.activeClassAtDate(datedStudent, datedHistory, '2026-08-24'), '四班', 'same-day transitions must be ordered by creation time');
assert.equal(v48.analysis.activeClassAtDate(datedStudent, datedHistory, '2026-08-31'), '四班', 'a later date before the next transition must keep the latest effective class');
assert.equal(v48.analysis.activeClassAtDate(datedStudent, datedHistory, '2026-09-02'), '五班', 'the next dated transition must take effect on its effective date');
const brokenHistory = v48.analysis.classHistoryIntegrity({ students:[datedStudent], class_history:datedHistory.concat({ id:'h-break', student_id:'s-history', effective_date:'2026-10-01', created_at:'2026-08-24T12:00:00.000Z', from_class_name:'错误班', to_class_name:'五班', class_name:'五班' }) });
assert.equal(brokenHistory.ok, false, 'a broken class transition chain must be visible for manual repair');
assert.equal(brokenHistory.issues[0].type, 'chain_break');

const identityReview = v48.studentIdentityReview.scan({
  students:[
    { id:'stable-a', student_id:'stable-a', student_number:'A-001', full_name:'甲', class_name:'一班' },
    { id:'stable-b', student_id:'stable-b', student_number:'B-001', full_name:'乙', class_name:'二班' },
  ],
  records:{
    talks:[
      { id:'legacy-number', student_number:'A-001', student_name:'甲', summary:'历史谈话' },
      { id:'legacy-name', student_name:'乙', summary:'只有姓名的历史记录' },
      { id:'stable-record', student_id:'stable-b', student_number:'B-001', student_name:'乙' },
    ],
  },
});
assert.equal(identityReview.length, 2, 'stable records should not enter the identity repair queue');
assert.equal(identityReview.find(row => row.record_id === 'legacy-number').match_type, 'current_student_number');
assert.equal(identityReview.find(row => row.record_id === 'legacy-name').reason, 'name_only_manual');
const repaired = v48.studentIdentityReview.resolve({ id:'legacy-name', student_name:'乙' }, { id:'stable-b', student_number:'B-001', full_name:'乙', class_name:'二班' });
assert.equal(repaired.student_id, 'stable-b');
assert.equal(repaired.student_number, 'B-001');
assert.equal(repaired.student_name, '乙');
assert.equal(repaired.class_name, '二班');

const ambiguous = v48.studentImport.preview([{ student_number:'same', full_name:'同名' }], [
  { id:'a', student_number:'same', full_name:'A' }, { id:'b', student_number:'same', full_name:'B' },
]);
assert.equal(ambiguous.canCommit, false);
assert.equal(ambiguous.summary.manual, 1);

const replacePreview = v48.studentImport.preview([{ student_id:'s1', full_name:'甲' }], applied.students, { mode:'replace' });
assert.equal(replacePreview.summary.delete, 2);
assert.throws(() => v48.studentImport.apply(applied.students, replacePreview, { mode:'replace' }), /REPLACE_CONFIRM/);
const replaced = v48.studentImport.apply(applied.students, replacePreview, { mode:'replace', confirmReplace:true });
assert.equal(replaced.students.length, 1);
assert.equal(replaced.removed.length, 2);

const bulkBefore = [
  { id:'bulk-1', student_id:'bulk-1', full_name:'甲', class_name:'一班', advisor_name:'旧导师', residence_type:'校内', custom_fields:{ cohort:'A' } },
  { id:'bulk-2', student_id:'bulk-2', full_name:'乙', class_name:'一班', parent_phone:'13800000000', custom_fields:{ cohort:'B' } },
  { id:'bulk-3', student_id:'bulk-3', full_name:'丙', class_name:'二班' },
];
const bulkEdited = v48.studentBulk.apply(bulkBefore, ['bulk-1','bulk-2'], { class_name:'三班', advisor_name:'新导师', custom_fields:{ cohort:'C' } }, { mode:'edit', clearFields:['parent_phone'] });
assert.equal(bulkEdited.students.find(row => row.id === 'bulk-1').class_name, '三班');
assert.equal(bulkEdited.students.find(row => row.id === 'bulk-1').custom_fields.cohort, 'C');
assert.equal(bulkEdited.students.find(row => row.id === 'bulk-2').parent_phone, '');
assert.equal(bulkEdited.class_history_changes.length, 2, 'bulk class changes must create one dated fact per changed student');
assert.equal(bulkEdited.class_history_changes[0].from_class_name, '一班');
assert.equal(bulkEdited.class_history_changes[0].to_class_name, '三班');
const bulkProfile = v48.studentBulk.apply(bulkEdited.students, ['bulk-1'], {
  college_name:'信息学院', major_name:'软件工程', grade:'2026', student_level:'本科', homeroom_teacher_name:'班主任', politics:'共青团员',
  email:'student@example.test', qq:'10001', home_addr:'家庭地址', parent_relation:'母亲', residence_address:'校外地址', landlord_phone:'13900000000', landlord_address:'房东地址',
  emergency_contact:'紧急联系人', emergency_phone:'13700000000', academic_score:'优秀', credits:20, class_rank:3, enrollment_date:'2026-09-01', graduation_date:'2030-06-30', crisis_relieved:true, note:'批量维护',
}, { mode:'edit' });
const profileRow = bulkProfile.students.find(row => row.id === 'bulk-1');
assert.equal(profileRow.homeroom_teacher_name, '班主任');
assert.equal(profileRow.parent_relation, '母亲');
assert.equal(profileRow.graduation_date, '2030-06-30');
assert.equal(profileRow.crisis_relieved, true);
assert.equal(profileRow.note, '批量维护');
const bulkArchived = v48.studentBulk.apply(bulkEdited.students, ['bulk-1'], {}, { mode:'archive' });
assert.equal(bulkArchived.students.find(row => row.id === 'bulk-1').enrollment_status, '已归档');
const bulkDeleted = v48.studentBulk.apply(bulkArchived.students, ['bulk-2'], {}, { mode:'delete', confirmDelete:true });
assert.equal(bulkDeleted.students.some(row => row.id === 'bulk-2'), false);
assert.equal(bulkDeleted.removed.length, 1);

const formXml = '<w:document><w:p><w:r><w:t>{{student.full_name}}</w:t></w:r></w:p><w:sdt><w:sdtPr><w:alias w:val="student.class_name"/></w:sdtPr><w:sdtContent><w:r><w:t>班级</w:t></w:r></w:sdtContent></w:sdt></w:document>';
const formCheck = v48.forms.validateTemplate({ fields:['student.full_name','student.class_name'] }, formXml);
assert.equal(formCheck.valid, true);
assert.deepEqual(formCheck.extracted.sort(), ['student.class_name','student.full_name']);
const renderedForm = v48.forms.renderXml(formXml, { full_name:'甲', class_name:'三班' });
assert.match(renderedForm.xml, />甲</);
assert.match(renderedForm.xml, />三班</);
assert.deepEqual(v48.forms.readContentControls(formXml), [{ field:'student.class_name', value:'班级', source:'content_control' }]);
const reverse = v48.forms.previewReverse({ class_name:'一班' }, { 'student.class_name':'二班' });
assert.equal(reverse.requires_confirmation, true);

const trend = v48.analysis.studentGradeTrend('s1', [
  { student_id:'s1', term:'2025-2026-1', course:'A', score:80, gpa:3.2 },
  { student_id:'s1', term:'2025-2026-1', course:'B', score:55, gpa:1.0 },
]);
assert.equal(trend.terms[0].failed_count, 1);
assert.equal(trend.terms[0].average_score, 67.5);
const hours = v48.analysis.leaveClassHours('s1', [{ id:'l1', student_id:'s1', date:'2026-08-17', status:'已批准', class_name:'一班' }], [{ id:'c1', class_name:'一班', weekday:1, start_section:1, end_section:2 }]);
assert.equal(hours.covered_class_hours, 2);
assert.equal(v48.analysis.classDataQuality({ students:[{ student_number:'1', full_name:'甲' }], fields:['student_number','class_name'] }).incomplete, 1);
assert.throws(() => v48.sensitiveAi.prepareVoice({ purpose:'voice_transcription', student_id:'s1' }), /AI_SENSITIVE_CONSENT_REQUIRED/);
const voiceRequest = v48.sensitiveAi.prepareVoice({ purpose:'voice_transcription', student_id:'s1', consent_id:'consent-1', authorized:true, size:1024 });
assert.equal(voiceRequest.audio_saved, false);
assert.throws(() => v48.sensitiveAi.normalizeVoiceDraft({ purpose:'psych_note_draft', draft:'内容' }), /AI_SENSITIVE_CONSENT_REQUIRED/);
const cohort = v48.sensitiveAi.cohortSummary([
  { student_id:'s1', interests:['科创'] }, { student_id:'s2', interests:['科创'] }, { student_id:'s3', interests:['科创'] }, { student_id:'s4', interests:['科创'] }, { student_id:'s5', interests:['科创'] },
  { student_id:'s6', interests:['个人主题'] },
], { minimum_group_size:5 });
assert.equal(cohort.groups[0].topic, '科创');
assert.equal(cohort.suppressed_groups, 1);

const content = v48.createContentPushService({ pushes:[], reads:[] });
const contentRow = content.publish({ id:'push-1', title:'本地政策', body:'请按时提交材料', scope:{ college:'计算机学院' }, updated_at:'2026-08-21T09:00:00.000Z' });
assert.equal(content.list({ college:'计算机学院' }).length, 1);
assert.equal(content.list({ college:'外国语学院' }).length, 0);
const contentPackage = content.exportPackage();
const newerLocalUpdatedAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const importedContent = v48.createContentPushService({ pushes:[Object.assign({}, contentRow, { body:'本地旧版本', updated_at:newerLocalUpdatedAt })], reads:[] });
const importReport = importedContent.importPackage(contentPackage);
assert.equal(importReport.conflicts.length, 1, 'newer local content must not be silently overwritten');
assert.equal(importedContent.listAll()[0].body, '本地旧版本');

const categories = v48.createWorkCategoryCatalog({ categories:[] });
assert.ok(categories.list().some(item => item.key === 'community'));
const customCategory = categories.add({ key:'student_services', label:'学生事务专项' });
assert.equal(categories.list().some(item => item.key === customCategory.key), true);
assert.throws(() => categories.remove('community'), /WORK_CATEGORY_SYSTEM_PROTECTED/);

const jointVisit = v48.analysis.jointVisitCandidates({
  date:'2026-08-21', students:[{ id:'s1', student_id:'s1', student_number:'1', full_name:'甲', class_name:'原一班' }],
  class_history:[{ student_id:'s1', previous_class_name:'原一班', class_name:'新一班', effective_date:'2026-08-20' }],
  dorm_assignments:[{ student_id:'s1', building_id:'b1', room_id:'r1', check_in_date:'2026-08-01', status:'confirmed' }],
  schedules:[{ class_name:'新一班', weekday:5, start_section:1, end_section:2, course:'课程 A' }],
});
assert.equal(jointVisit.rows[0].class_name, '新一班');
assert.equal(jointVisit.rows[0].dorm_assignment.room_id, 'r1');
assert.equal(jointVisit.rows[0].free_sections.includes(1), false);

let storedSchedule;
let runCount = 0;
const scheduler = v48.createBackupScheduler({ now:() => new Date('2026-08-21T00:00:00Z'), load:() => ({}), save:value => { storedSchedule = value; }, run:async () => { runCount += 1; return { saved:true }; } });
assert.equal(scheduler.schedule({ enabled:true, frequency:'daily', change_threshold:2 }).due, true);
scheduler.markChanged(2);
const run = scheduler.runNow();
assert.equal(storedSchedule.enabled, true);
assert.equal(typeof scheduler.status().due, 'boolean');
run.then(result => {
  assert.equal(result.ok, true);
  assert.equal(runCount, 1);
});

const sync = v48.createSyncEngine({ workspace_id:'w1', device_id:'d1' });
const operation = sync.enqueue('students', 's1', { class_name:'二班' }, 0);
assert.equal(operation.schema_version, 11);
assert.equal(operation.patch.student_id, 's1', 'student sync operations must carry the stable student ID');
const merged = sync.merge({ id:'s1', class_name:'一班' }, operation);
assert.equal(merged.record.class_name, '二班');
assert.equal(merged.record.student_id, 's1');
assert.equal(sync.status().queued, 1);
assert.equal(v48.SYNC_PROTOCOL_VERSION, 1);
assert.throws(() => sync.enqueue('students', 's1', { student_id:'s2' }, 0), /SYNC_STUDENT_ID_IMMUTABLE/);

let restorePreviewCalls = 0;
let restoreCommitCalls = 0;
const backupTarget = {
  previewRestore:async () => { restorePreviewCalls += 1; return { students:2 }; },
  restore:async (_envelope, _password, mode) => { restoreCommitCalls += 1; return { restored:true, mode }; },
};
const recoveryCalls = [];
v48.installBackupFacade(backupTarget, {
  load:() => ({}),
  save:() => {},
  run:async () => ({ saved:true }),
  desktop:{ exportRecoveryKit:(password, folder) => { recoveryCalls.push([password, folder]); return { saved:true }; } },
});
const committed = backupTarget.commitRestore({ format:'cwbk' }, 'password');
assert.equal(typeof backupTarget.schedule, 'function');
assert.equal(typeof backupTarget.status, 'function');
assert.equal(typeof backupTarget.runNow, 'function');
assert.equal(typeof backupTarget.commitRestore, 'function');
assert.equal(typeof backupTarget.exportRecoveryKit, 'function');
assert.deepEqual(backupTarget.exportRecoveryKit('recovery-secret', 'D:/backups'), { saved:true });
assert.deepEqual(recoveryCalls, [['recovery-secret', 'D:/backups']]);

const hostCalls = [];
const syncFacade = v48.createSyncFacade({
  desktop:{
    lanSyncStart:options => { hostCalls.push(['start', options]); return { running:true }; },
    lanSyncStop:() => { hostCalls.push(['stop']); return { running:false }; },
    lanSyncStatus:() => ({ running:true }),
    lanSyncPairingCode:() => ({ code:'12345678' }),
    lanSyncRevokeDevice:id => ({ id, revoked:true }),
    lanSyncPauseDevice:id => ({ id, paused:true }),
    lanSyncResumeDevice:id => ({ id, resumed:true }),
  },
  client:{
    connect:value => ({ connected:true, value }),
    pull:() => ({ operations:[] }),
    flushQueue:() => ({ queued:0 }),
    syncNow:() => ({ ok:true }),
    listConflicts:() => [],
    resolveConflict:id => ({ id, status:'resolved' }),
    status:() => ({ connected:false }),
  },
});
assert.equal(syncFacade.host.createPairingCode().code, '12345678');
assert.equal(syncFacade.host.start({ port:1234 }).running, true);
assert.equal(syncFacade.client.connect({ base_url:'https://lan.local' }).connected, true);
assert.deepEqual(syncFacade.client.pull(), { operations:[] });
assert.equal(hostCalls[0][0], 'start');

committed.then(result => {
  assert.equal(restorePreviewCalls, 1);
  assert.equal(restoreCommitCalls, 1);
  assert.equal(result.preview.students, 2);
  console.log('PASS v48-core');
}).catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
