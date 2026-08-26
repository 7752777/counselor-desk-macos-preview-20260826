const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

(async () => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/Could not load script:.*(?:xlsx\.full\.min\.js|argon2-bundled\.min\.js|jszip\.min\.js|echarts\.min\.js)|Not implemented: HTMLCanvasElement\.prototype\.getContext/.test(error.message)) console.error(error);
  });
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'output', 'v4-preview.html'), {
    runScripts:'dangerously',
    resources:'usable',
    url:'https://c.local/',
    pretendToBeVisual:true,
    virtualConsole,
    beforeParse(window) { window.requestAnimationFrame = callback => window.setTimeout(callback, 0); window.scrollTo = () => {}; },
  });
  await new Promise(resolve => setTimeout(resolve, 900));
  const cwb = dom.window.CWB;
  assert.ok(cwb && cwb.importer && cwb.repositories, 'browser runtime did not initialize');

  const first = cwb.norm.student({ id:'stable-1', student_number:'OLD-1', full_name:'甲', class_name:'一班', phone:'13800000000' });
  const second = cwb.norm.student({ id:'stable-2', student_number:'OLD-2', full_name:'乙', class_name:'一班' });
  cwb.db.students = [first, second];

  const byStableId = cwb.importer.previewCSV('student_id,学号,姓名,班级\nstable-1,NEW-1,甲,二班', 'students');
  assert.equal(byStableId.summary.update, 1, 'stable student_id should update an existing row');
  assert.equal(byStableId.summary.add, 0, 'stable student_id must not create a duplicate');
  const committed = await cwb.importer.commitPreviewAsync(byStableId.id, { confirmSensitive:true });
  assert.equal(committed.ok, true, committed.error || 'stable ID import failed');
  assert.equal(cwb.db.students.filter(row => row.id === 'stable-1').length, 1);
  assert.equal(cwb.db.students.find(row => row.id === 'stable-1').class_name, '二班');
  assert.equal(cwb.db.students.find(row => row.id === 'stable-1').phone, '13800000000', 'blank fields must keep existing values');
  assert.equal(cwb.db.students.find(row => row.id === 'stable-1').student_number, 'NEW-1');
  const historyValue = cwb.db.students.find(row => row.id === 'stable-1').student_number_history[0];
  assert.equal(String(historyValue && typeof historyValue === 'object' ? historyValue.value : historyValue), 'OLD-1');

  const historical = cwb.importer.previewCSV('学号,姓名,班级\nOLD-1,甲,三班', 'students');
  assert.equal(historical.summary.update, 1, 'historical student number should resolve the stable record');
  const historicalCommit = await cwb.importer.commitPreviewAsync(historical.id, { confirmSensitive:true });
  assert.equal(historicalCommit.ok, true, historicalCommit.error || 'historical number import failed');
  const updated = cwb.db.students.find(row => row.id === 'stable-1');
  assert.equal(updated.class_name, '三班');
  assert.equal(updated.student_number, 'NEW-1', 'historical number must not overwrite current number');

  const mergeMissing = cwb.importer.previewCSV('student_id,姓名,班级\nstable-1,甲,四班', 'students');
  const mergeResult = await cwb.importer.commitPreviewAsync(mergeMissing.id, { confirmSensitive:true });
  assert.equal(mergeResult.ok, true, mergeResult.error || 'merge import failed');
  assert.equal(cwb.db.students.some(row => row.id === 'stable-2'), true, 'merge import must keep source-missing students');

  const replace = cwb.importer.previewCSV('student_id,姓名\nstable-1,甲', 'students');
  replace.studentImportMode = 'replace';
  cwb.refreshV48StudentImportPreview(replace);
  assert.equal(replace.summary.delete, 1, 'replace preview should show deletion count');
  const blocked = await cwb.importer.commitPreviewAsync(replace.id, { confirmSensitive:true, studentImportMode:'replace' });
  assert.equal(blocked.ok, false, 'replace import must require explicit confirmation');
  const replaced = await cwb.importer.commitPreviewAsync(replace.id, { confirmSensitive:true, studentImportMode:'replace', confirmReplace:true });
  assert.equal(replaced.ok, true, replaced.error || 'confirmed replace import failed');
  assert.equal(cwb.db.students.length, 1);

  const clear = cwb.importer.previewCSV('student_id,姓名,联系电话\nstable-1,甲,', 'students');
  clear.clearEmpty = true;
  cwb.refreshV48StudentImportPreview(clear);
  const clearResult = await cwb.importer.commitPreviewAsync(clear.id, { confirmSensitive:true });
  assert.equal(clearResult.ok, true, clearResult.error || 'explicit clear import failed');
  assert.equal(cwb.db.students[0].phone, '');

  // The resumable large-file path must apply the same stable identity rule as
  // the interactive preview path; otherwise a background import could create
  // a duplicate after a student number correction.
  const chunked = await cwb.importer.start({
    collection:'students',
    rows:[{ student_id:'stable-1', student_number:'NEW-1', class_name:'五班' }],
    chunkSize:1,
  });
  assert.equal(chunked.status, 'completed', 'chunked stable-ID import should complete');
  assert.equal(cwb.db.students.filter(row => row.id === 'stable-1').length, 1, 'chunked stable-ID import must not duplicate');
  assert.equal(cwb.db.students.find(row => row.id === 'stable-1').class_name, '五班');

  // Current and historical student numbers must remain valid compatibility
  // keys after a correction, but an ambiguous historical number may never
  // silently associate a record with an arbitrary same-number student.
  const linked = cwb.db.students.find(row => row.id === 'stable-1');
  assert.equal(cwb.students.resolveReference('', 'OLD-1'), linked, 'historical numbers should resolve the corrected student');
  cwb.db.students.push(cwb.norm.student({ id:'stable-ambiguous', student_number:'OTHER-1', full_name:'同名学生', student_number_history:[{ value:'OLD-1' }] }));
  cwb.save('students');
  assert.equal(cwb.students.resolveReference('', 'OLD-1'), null, 'ambiguous history must enter manual review instead of silently choosing a student');
  cwb.db.students.pop(); cwb.save('students');
  assert.equal(cwb.db.students.length, 1);
  cwb.db.talks = [{ id:'legacy-talk', student_number:'OLD-1', student_name:'甲' }];
  const linkedImpact = cwb.students.relationshipImpact(linked);
  assert.ok(linkedImpact.stable >= 1, 'dated class changes are legitimate stable-ID relationships');
  assert.ok(linkedImpact.modules.some(item => item.label === '班级变动'), 'class history should be visible in the relationship summary');
  assert.equal(linkedImpact.snapshotOnly, 1, 'legacy-only links are surfaced for later stable-ID cleanup');

  // The legacy synchronous API must never fall back to number-only matching.
  // It should refuse without changing the roster, while the async path keeps
  // the student snapshot and dated class history undoable as one operation.
  cwb.db.students = [cwb.norm.student({ id:'lifecycle-student', student_id:'lifecycle-student', student_number:'LIFE-001', full_name:'长期更新测试', class_name:'原班' })];
  cwb.db.custom.v4_student_class_history = [];
  await cwb.save('students');
  await cwb.save('custom');
  const legacyPreview = cwb.importer.previewCSV('学号,姓名,班级\nLIFE-001,长期更新测试,旧 API 不应写入', 'students');
  const legacyResult = cwb.importer.commitPreview(legacyPreview.id, { skipInvalid:true, conflictPolicy:'skip', confirmSensitive:true });
  assert.equal(legacyResult.ok, false, 'legacy synchronous student import must not write data');
  assert.equal(legacyResult.requiresAsync, true, 'legacy student import must direct callers to the durable async path');
  assert.equal(cwb.db.students[0].class_name, '原班');
  const classChange = cwb.importer.previewCSV('student_id,姓名,班级\nlifecycle-student,长期更新测试,新班', 'students');
  const classChangeResult = await cwb.importer.commitPreviewAsync(classChange.id, { confirmSensitive:true });
  assert.equal(classChangeResult.ok, true, classChangeResult.error || 'class change import failed');
  assert.equal(classChangeResult.classHistoryAdded, 1, 'class changes must report the dated history created');
  assert.equal(cwb.db.custom.v4_student_class_history.length, 1, 'class change must persist a dated history fact');
  const undone = await cwb.importer.undoAsync(classChangeResult.runId);
  assert.equal(undone, true, 'student import undo should succeed through the durable path');
  assert.equal(cwb.db.students[0].class_name, '原班', 'undo should restore the student snapshot');
  assert.equal(cwb.db.custom.v4_student_class_history.length, 0, 'undo should restore class history with the student snapshot');

  // A term-end score sheet commonly contains only these three columns. The
  // import must update the existing student even when the stored record has a
  // cultivation level that the score sheet does not repeat.
  cwb.db.students = [cwb.norm.student({
    id:'stable-score-1', student_id:'stable-score-1', student_number:'2024001',
    full_name:'成绩测试', student_level:'undergraduate', academic_score:'', class_name:'一班',
  })];
  const scoreOnly = cwb.importer.previewCSV('学号,姓名,分数\n2024001,成绩测试,91.5', 'students');
  assert.equal(scoreOnly.summary.update, 1, '学号+姓名+成绩 should update the existing student');
  assert.equal(scoreOnly.summary.add, 0, 'score-only import must not create a duplicate student');
  cwb.refreshV48StudentImportPreview(scoreOnly);
  assert.equal(scoreOnly.v48StudentPreview.rows[0].matchType, 'student_number', 'preview should expose the current student-number match used by the UI');
  assert.equal(Array.from(scoreOnly.v48StudentPreview.rows[0].changes, change => change.field).join(','), 'academic_score', 'preview should expose the actual field written by the score sheet');
  const scoreCommit = await cwb.importer.commitPreviewAsync(scoreOnly.id, { confirmSensitive:true });
  assert.equal(scoreCommit.ok, true, scoreCommit.error || 'score-only import failed');
  assert.equal(cwb.db.students.length, 1, 'score-only import must preserve the student count');
  assert.equal(cwb.db.students[0].academic_score, 91.5, 'score-only import should write the mapped academic score');

  // Long-lived workspaces need an explicit repair surface for old rows that
  // have only a student-number/name snapshot; the UI must not silently merge
  // those rows while keeping the import path usable.
  cwb.db.students = [cwb.norm.student({ id:'identity-student-1', student_number:'ID-001', full_name:'待核对学生', class_name:'一班' })];
  cwb.db.talks = [{ id:'identity-legacy-talk', student_number:'ID-001', student_name:'待核对学生', summary:'旧谈话记录' }];
  const identityRoute = dom.window.document.createElement('button');
  identityRoute.dataset.view = 'identity-review';
  dom.window.document.body.appendChild(identityRoute);
  identityRoute.click();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.match(dom.window.document.querySelector('#main').textContent, /学生关联维护/);
  assert.match(dom.window.document.querySelector('#main').textContent, /待核对学生/);
  const repairButton = dom.window.document.querySelector('[data-act="student-identity-link"]');
  assert.ok(repairButton, 'identity review should expose a manual repair action');
  repairButton.click();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.ok(dom.window.document.querySelector('[data-identity-search]'), 'repair action should open a searchable confirmation dialog');
  const cancel = dom.window.document.querySelector('#modal-root [data-close]');
  if (cancel) cancel.click();

  // A new term frequently starts with only the core roster. The ledger should
  // guide later, incremental completion without treating missing information
  // as zero or silently rewriting the old business snapshot.
  cwb.db.students = [cwb.norm.student({
    id:'long-term-student-1', student_id:'long-term-student-1', student_number:'LT-001', full_name:'长期维护测试', class_name:'测试班',
    phone:'', emergency_phone:'', residence_type:'', dorm:'', dorm_room:'', academic_score:'', photo_ids:[], photo_assets:[],
  })];
  cwb.db.grades = [];
  cwb.db.talks = [{ id:'long-term-legacy-talk', student_number:'LT-001', student_name:'长期维护测试', summary:'历史谈话快照' }];
  await cwb.save('students');
  cwb.go('students');
  await new Promise(resolve => setTimeout(resolve, 80));
  const maintenance = dom.window.document.querySelector('.student-maintenance-guidance');
  assert.ok(maintenance, 'real roster with partial data should receive a compact maintenance guide');
  assert.match(maintenance.textContent, /补充联系方式/);
  assert.match(maintenance.textContent, /等待或录入成绩/);
  const maintenanceBulk = dom.window.document.querySelector('[data-act="student-maintenance-bulk"]');
  assert.ok(maintenanceBulk, 'maintenance guide should lead directly into the existing bulk editor');
  maintenanceBulk.click();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.match(dom.window.document.querySelector('#main').textContent, /已选 1 人/, 'maintenance shortcut should select exactly the incomplete student');
  const profileButton = dom.window.document.querySelector('[data-act="student-view"]');
  assert.ok(profileButton, 'the test student should still open through the normal profile action');
  profileButton.click();
  await new Promise(resolve => setTimeout(resolve, 40));
  const relationship = dom.window.document.querySelector('.student-relationship-summary');
  assert.ok(relationship, 'student profile should show cross-module relationship summary');
  assert.match(relationship.textContent, /仅学号快照/);
  assert.match(relationship.textContent, /历史谈话快照|谈心谈话/);
  assert.ok(dom.window.document.querySelector('[data-student-relationship-review]'), 'legacy-only links should retain an explicit manual review entry point');
  dom.window.document.querySelector('#modal-root [data-close]')?.click();

  dom.window.close();
  console.log('PASS v48-student-import-ui');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
