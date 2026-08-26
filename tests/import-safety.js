/**
 * v3.9 nationwide import safety contract.
 * Each assertion protects user data at an observable boundary.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'index.html');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const runtimeErrors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!/scrollTo|Not implemented|Could not load/i.test(error.message)) runtimeErrors.push(error.message); });
  vc.on('error', (...args) => runtimeErrors.push(args.join(' ')));
  const dom = await JSDOM.fromFile(file, {
    runScripts:'dangerously', resources:'usable', url:'https://c.local/',
    virtualConsole:vc, pretendToBeVisual:true,
  });
  const w = dom.window;
  await sleep(500);
  const cwb = w.CWB;

  assert.equal(Object.keys(cwb.importSchemas || {}).length, 24,
    'all generic modules must publish one import schema');
  for (const [collection, schema] of Object.entries(cwb.importSchemas || {})) {
    assert.ok(schema.fields && schema.fields.record_id, `${collection} must expose stable record_id`);
    assert.ok(Object.values(schema.fields).some(field => field.required), `${collection} must declare required fields`);
  }

  const studentCsv = [
    '学号,姓名,邮箱,身份证号',
    '00123,张三,zhang@example.edu.cn,110101200001010011',
    ',李四,li@example.edu.cn,',
    '00123,张三,other@example.edu.cn,110101200001010011',
    '00999,王五,not-an-email,',
    '00777,赵六,zhao@example.edu.cn,',
  ].join('\n');
  const preview = cwb.importer.previewCSV(studentCsv, 'students');
  assert.ok(preview.id, 'preview must receive an id before any write');
  assert.equal(preview.summary.ready, 1, 'one valid student should be ready');
  assert.equal(preview.summary.pending, 1, 'name-only student must stay pending');
  assert.equal(preview.summary.conflict, 2, 'conflicting duplicate student numbers must be isolated');
  assert.equal(preview.summary.invalid, 1, 'invalid email must remain visible as invalid');
  assert.deepEqual(Array.from(preview.sensitiveFields).sort(), ['email', 'id_card'],
    'only sensitive columns with imported values must be reported');
  assert.equal(preview.rows[0].value.student_number, '00123', 'leading zero student number must survive');
  assert.equal(cwb.norm.student({ student_number:'7', full_name:'未填状态' }).enrollment_status, '待确认',
    'missing enrollment status must not be silently guessed as active');

  const beforeStudents = JSON.stringify(cwb.db.students);
  const normalizedBeforeStudents = JSON.stringify(cwb.db.students.map(student => cwb.norm.student(student)));
  const blocked = cwb.importer.commitPreview(preview.id, { skipInvalid:true, conflictPolicy:'skip' });
  assert.equal(blocked.ok, false, 'sensitive data cannot commit without explicit confirmation');
  assert.equal(JSON.stringify(cwb.db.students), beforeStudents, 'blocked commit must not change student data');

  assert.equal(cwb.importer.resolveRow(preview.id, 2, 'use'), true,
    'a conflicting duplicate group must allow the user to choose one source row');
  assert.equal(preview.summary.conflict, 0, 'choosing one duplicate must resolve the whole duplicate group');
  assert.equal(preview.summary.ready, 2, 'chosen conflict row becomes ready while the alternative is skipped');

  const legacyCommit = cwb.importer.commitPreview(preview.id, {
    skipInvalid:true, conflictPolicy:'skip', confirmSensitive:true,
  });
  assert.equal(legacyCommit.ok, false, 'legacy synchronous student import must not commit');
  assert.equal(legacyCommit.requiresAsync, true, 'legacy student import must direct callers to the durable async path');
  assert.equal(JSON.stringify(cwb.db.students), beforeStudents, 'legacy rejection must not change student data');

  const materialPreview = cwb.importer.previewCSV('标题,分类,内容\n全国资助政策,资助,正文', 'material');
  const materialRun = cwb.importer.commitPreview(materialPreview.id, {});
  assert.equal(materialRun.ok, true, 'valid generic preview should commit');
  const inserted = cwb.db.material.find(row => row.title === '全国资助政策');
  assert.ok(inserted && inserted.id, 'new generic rows must receive a stable record id');
  const roundTrip = cwb.importer.previewCSV(`record_id,标题,分类,内容\n${inserted.id},全国资助政策,资助,更新正文`, 'material');
  assert.equal(roundTrip.summary.update, 1, 'record_id must select an existing record for update');
  assert.equal(roundTrip.summary.conflict, 0, 'record_id update must not be treated as a natural-key collision');
  const localizedRecordId = cwb.importer.previewCSV(
    `记录编号(record_id),标题(title)\n${inserted.id},按中文模板更新`,
    'material'
  );
  assert.equal(localizedRecordId.summary.update, 1,
    'localized record_id template header must select an existing record for update');
  const naturalUpdate = cwb.importer.previewCSV('标题,分类,内容\n全国资助政策,资助,自然键更新', 'material');
  assert.equal(naturalUpdate.summary.update, 1, 'a unique natural-key match should merge-update rather than create a duplicate');
  assert.equal(naturalUpdate.summary.conflict, 0, 'a unique natural-key match must not require an unnecessary manual review');
  const naturalRun = cwb.importer.commitPreview(naturalUpdate.id, {});
  assert.equal(naturalRun.ok, true, 'a unique natural-key update should commit');
  assert.equal(cwb.db.material.filter(row => row.title === '全国资助政策').length, 1, 'natural-key updates must preserve one record');
  assert.equal(cwb.db.material.find(row => row.title === '全国资助政策').content, '自然键更新');
  cwb.db.material.push(cwb.norm.material({ id:'duplicate-natural-key', title:'全国资助政策', category:'资助', content:'历史重复' }));
  const ambiguousNaturalKey = cwb.importer.previewCSV('标题,分类,内容\n全国资助政策,资助,不允许猜测', 'material');
  assert.equal(ambiguousNaturalKey.summary.conflict, 1, 'multiple existing natural-key matches must still require manual review');

  assert.equal(cwb.csvSafeCell('=HYPERLINK("https://bad.example")'), '\'=HYPERLINK("https://bad.example")',
    'formula-looking text must be escaped before spreadsheet export');
  assert.equal(cwb.csvSafeCell('普通文本'), '普通文本');
  assert.match(cwb.importer.reportCSV(preview), /行号,状态,处理,问题/,
    'import reports must be downloadable CSV content');
  assert.equal(cwb.norm.grant({ name:'受助学生', amount:'1200.50' }).amount, 1200.5,
    'money fields must normalize to numbers');
  const maskedPhone = cwb.importer.previewCSV('姓名,离校时间,本人手机号\n测试同学,2026-08-01,150****8821', 'leave');
  assert.equal(maskedPhone.summary.invalid, 0, 'privacy-masked phone numbers must remain importable');

  const badEnum = cwb.importer.previewCSV(
    '任务名称,职责分类,优先级,状态\n枚举校验,不存在的职责,超级紧急,神秘状态',
    'tasks'
  );
  assert.equal(badEnum.summary.invalid, 1, 'unknown module enum values must be rejected explicitly');
  assert.equal(badEnum.rows[0].value.priority, '超级紧急', 'invalid enum source text must remain unchanged in preview');
  assert.match(badEnum.rows[0].errors.join('；'), /职责分类|优先级|状态/,
    'invalid enum errors must name the affected fields');

  const structuralErrors = cwb.importer.previewCSV(
    '学号,姓名,姓名,出生日期\n1.23E+12,甲,乙,2026-02-31',
    'students'
  );
  assert.equal(structuralErrors.summary.invalid, 1,
    'scientific-notation ids, impossible dates and duplicate mappings must block the row');
  assert.ok(structuralErrors.duplicateColumns.length >= 1, 'duplicate mapped columns must be reported structurally');
  assert.match(structuralErrors.rows[0].errors.join('；'), /科学计数法|日期|重复/);

  const health = cwb.storage.health(5_000_000);
  assert.ok(['ok', 'warn', 'critical'].includes(health.level), 'storage health must expose a stable level');
  assert.equal(cwb.storage.health(100).level, 'critical', 'usage over 85% must block large writes');

  const onboardingText = w.document.querySelector('[data-onboarding]').textContent;
  assert.match(onboardingText, /体验示例/);
  assert.match(onboardingText, /三步建立你的工作区/);
  assert.match(onboardingText, /成绩、谈话和业务记录可以在后续工作中逐步补齐/);
  assert.match(onboardingText, /从备份恢复/);

  assert.deepEqual(runtimeErrors, [], 'runtime errors must stay empty');
  dom.window.close();
  console.log('PASS import-safety');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
