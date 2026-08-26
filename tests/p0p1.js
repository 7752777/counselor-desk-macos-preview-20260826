const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'index.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(error.message)) errors.push(error.message); });
  vc.on('error', (...args) => errors.push(args.join(' ')));
  const dom = await JSDOM.fromFile(file, { runScripts:'dangerously', resources:'usable', url:'https://p0p1.local/', virtualConsole:vc, pretendToBeVisual:true });
  await wait(700);
  const { window:w } = dom;
  const d = w.document;
  const c = w.CWB;
  assert.ok(c, 'CWB API should be available');

  assert.ok(d.querySelector('[data-save-status]'), 'visible persistence status is required');
  c.go('bridge'); await wait(20);
  assert.ok(d.querySelector('[data-act="export-diagnostics"]'), 'diagnostic export action is required');
  c.go('students'); await wait(20);
  assert.equal(c.store.read('ui_state').view, 'students', 'current view should persist');

  c.db.students = Array.from({ length: 101 }, (_, index) => c.norm.student({ id:`p0p1-${index}`, student_number:`P${index}`, full_name:`测试学生${index}`, class_name:'一班' }));
  c.save('students'); c.go('students'); await wait(20);
  assert.equal(d.querySelector('.student-table-wrap').dataset.windowed, 'true', 'large student lists should use windowed rendering');
  d.querySelector('[data-act="student-bulk-toggle"]').click(); await wait(10);
  assert.ok(d.querySelector('[data-act="student-bulk-edit"]'), 'student bulk edit action is required');
  assert.ok(d.querySelector('[data-act="student-bulk-select-all"]'), 'student bulk select-all action is required');

  const attachmentFile = { name:'voice.m4a', type:'audio/mp4', size:16 };
  const first = await c.v4.attachments.ingest(attachmentFile, 'p0p1-record', 'data:audio/mp4;base64,AAAA');
  const duplicate = await c.v4.attachments.ingest(attachmentFile, 'p0p1-record', 'data:audio/mp4;base64,AAAA');
  assert.equal(duplicate.id, first.id, 'same record and content should deduplicate attachments');
  await assert.rejects(() => c.v4.attachments.ingest({ name:'large.bin', size:26 * 1024 * 1024 }, 'p0p1-record', 'data:application/octet-stream;base64,AA=='), /25MB/);
  assert.deepEqual(c.v4.attachments.validateLinks({ attachments:[first.id, 'missing-attachment'] }), ['missing-attachment']);

  const preset = c.importer.saveMappingPreset('students', 'P0/P1测试预设', { '教务班级':'class_name' });
  assert.equal(preset.name, 'P0/P1测试预设');
  assert.ok(c.importer.getMappingPresets('students').some(item => item.name === preset.name), 'mapping presets should persist');

  const student = c.db.students[0];
  c.db.talks.push(c.norm.talk({ student_number:student.student_number, student_name:student.full_name, date:'2026-08-01', summary:'谈话记录' }));
  c.db.worklogs.push(c.norm.normV4Record({ student_number:student.student_number, student_name:student.full_name, category:'班会', date:'2026-08-02', summary:'班会记录' }, 'worklogs'));
  c.db.students[0].crisis_level = '一级';
  c.go('students'); await wait(20);
  d.querySelector('[data-act="student-view"]').click(); await wait(20);
  assert.ok(d.querySelector('[data-student-timeline]'), 'student dossier should expose unified timeline');
  d.querySelector('[data-close]').click();
  c.go('talks'); await wait(20);
  assert.ok(d.querySelector('[data-talk-schedule]'), 'talk view should expose crisis scheduling');

  c.db.grades = [
    c.norm.normV4Record({ student_number:'P0', student_name:'测试学生0', class_name:'一班', term:'2025-2026-1', course:'高数', score:55, failed:true }, 'grades'),
    c.norm.normV4Record({ student_number:'P0', student_name:'测试学生0', class_name:'一班', term:'2025-2026-2', course:'英语', score:78, failed:false }, 'grades'),
  ];
  c.save('grades'); c.go('grades'); await wait(20);
  assert.ok(d.querySelector('[data-grade-trend]'), 'grades view should show term trend');
  c.db.material = [c.norm.material({ title:'心理危机干预流程', category:'制度', source:'学生处', tags:'心理,危机', content:'二级预警谈话安排' })];
  assert.equal(c.utils.materialSearch(c.db.material, '危机 谈话')[0].title, '心理危机干预流程', 'material search should search full text');
  c.go('material'); await wait(20);
  assert.ok(d.querySelector('[data-filter="material.q"]'), 'material view should expose full-text search');

  c.go('grades'); await wait(20); d.querySelector('[data-act="v4-bulk-toggle"]').click(); await wait(10);
  assert.ok(d.querySelector('[data-act="v4-select"]'), 'v4 modules should expose batch selection');
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS p0-p1');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
