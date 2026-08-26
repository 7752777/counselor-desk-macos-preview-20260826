const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openApp() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(error.message)) errors.push(error.message);
  });
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'output', 'v4-preview.html'), {
    runScripts:'dangerously', resources:'usable', url:'https://import-merge-regression.local/',
    pretendToBeVisual:true, virtualConsole,
  });
  await wait(850);
  return { dom, window:dom.window, errors };
}

(async () => {
  const ctx = await openApp();
  const { dom, window:w, errors } = ctx;
  const cwb = w.CWB;
  assert.ok(cwb && cwb.importer && cwb.repositories, 'import runtime should be available');

  cwb.db.tasks = [{ id:'task-1', title:'开学报到统计', due:'2026-09-01', source:'旧来源', note:'保留字段' }];
  const taskPreview = cwb.importer.previewCSV('任务名称,截止日期,来源\n开学报到统计,2026-09-01,学院通知', 'tasks');
  assert.equal(taskPreview.summary.update, 1, 'natural-key task import should update an existing row');
  assert.equal(taskPreview.summary.add, 0, 'natural-key task import must not duplicate');
  const taskCommit = await cwb.importer.commitPreviewAsync(taskPreview.id, { confirmSensitive:true });
  assert.equal(taskCommit.ok, true, taskCommit.error || 'task import should commit');
  assert.equal(cwb.db.tasks.length, 1);
  assert.equal(cwb.db.tasks[0].source, '学院通知');
  assert.equal(cwb.db.tasks[0].note, '保留字段', 'omitted import fields must remain unchanged');

  cwb.db.material = [];
  const duplicate = cwb.importer.previewCSV('标题,分类,内容\n同一材料,通知,正文\n同一材料,通知,正文', 'material');
  assert.equal(duplicate.summary.add, 1, 'identical duplicate rows should produce one add');
  assert.equal(duplicate.summary.skipped, 1, 'identical duplicate rows should be skipped');
  const duplicateCommit = await cwb.importer.commitPreviewAsync(duplicate.id, { confirmSensitive:true, skipInvalid:true, conflictPolicy:'skip' });
  assert.equal(duplicateCommit.ok, true, duplicateCommit.error || 'duplicate material import should commit');
  assert.equal(cwb.db.material.length, 1);

  const conflict = cwb.importer.previewCSV('标题,分类,内容\n冲突材料,通知,正文 A\n冲突材料,通知,正文 B', 'material');
  assert.equal(conflict.summary.conflict, 2, 'different duplicate rows must enter conflict review');
  const conflictCommit = await cwb.importer.commitPreviewAsync(conflict.id, { confirmSensitive:true });
  assert.equal(conflictCommit.ok, false, 'unresolved conflicts must not be written');
  assert.equal(cwb.db.material.length, 1);

  cwb.db.grades = [cwb.norm.normV4Record({
    id:'grade-1', student_id:'student-stable-1', student_number:'20260001', student_name:'成绩学生',
    class_name:'一班', term:'2026-2027-1', course:'高等数学', score:60, failed:false,
  }, 'grades')];
  const gradePreview = cwb.importer.previewCSV('学生姓名,学号,分数\n成绩学生,20260001,92', 'grades');
  assert.equal(gradePreview.summary.add, 1, 'a three-column grade sheet should be treated as a new grade row when term/course are absent');
  assert.equal(gradePreview.summary.update, 0);
  // The student-ledger workflow is intentionally tested separately: a score-only
  // sheet belongs to the students target and updates academic_score by number.
  cwb.db.students = [cwb.norm.student({ id:'student-stable-1', student_number:'20260001', full_name:'成绩学生', academic_score:'' })];
  const scorePreview = cwb.importer.previewCSV('学号,姓名,分数\n20260001,成绩学生,92', 'students');
  assert.equal(scorePreview.summary.update, 1, 'score-only student import should resolve by current student number');
  const scoreCommit = await cwb.importer.commitPreviewAsync(scorePreview.id, { confirmSensitive:true });
  assert.equal(scoreCommit.ok, true, scoreCommit.error || 'score-only student import should commit');
  assert.equal(cwb.db.students.length, 1);
  assert.equal(cwb.db.students[0].academic_score, 92);

  const materialRepository = cwb.repositories.material;
  assert.ok(materialRepository && typeof materialRepository.putMany === 'function', 'material repository should support atomic persistence');
  const beforeRollback = cwb.db.material.map(row => ({ ...row }));
  const rollbackPreview = cwb.importer.previewCSV('标题,分类,内容\n回滚材料,通知,不应保存', 'material');
  const originalPutMany = materialRepository.putMany;
  let persistAttempts = 0;
  materialRepository.putMany = async function (rows, options) {
    if (persistAttempts++ === 0) throw new Error('TEST_IMPORT_PERSIST_FAILURE');
    return originalPutMany.call(this, rows, options);
  };
  let rollbackResult;
  try {
    rollbackResult = await cwb.importer.commitPreviewAsync(rollbackPreview.id, { confirmSensitive:true });
  } finally {
    materialRepository.putMany = originalPutMany;
  }
  assert.equal(rollbackResult.ok, false, 'persistence failure should return a retryable failure');
  const stripRevision = rows => rows.map(row => {
    const value = { ...row };
    delete value.rev;
    delete value.updated_at;
    return value;
  });
  assert.deepEqual(stripRevision(cwb.db.material), stripRevision(beforeRollback), 'persistence failure must restore the in-memory collection');

  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS import-merge-regression');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
