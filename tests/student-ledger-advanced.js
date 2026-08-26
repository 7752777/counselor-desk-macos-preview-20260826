const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openApp() {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', url: 'https://student-ledger-advanced.local/', pretendToBeVisual: true, virtualConsole,
  });
  await wait(760);
  assert.deepEqual(errors, [], 'application starts without relevant errors');
  return dom;
}

(async () => {
  const dom = await openApp();
  try {
    const { window: w } = dom;
    const { document: d, CWB: c } = w;
    assert.ok(c.schema.student.community, 'student schema has a community/college field');
    assert.ok(c.schema.student.student_type, 'student schema has an explicit student type field');
    assert.equal(c.stuHeaderToField('社区/书院'), 'community', 'community headers map during import');
    assert.equal(c.stuHeaderToField('学生类型'), 'student_type', 'student type headers map during import');

    const imported = c.stuNormalizeRow({
      student_number: 'ADV-1', full_name: '扩展字段学生', community: '启明书院', student_type: '专科生',
      enrollment_status: '休学', focus: 'psych,study', focus_level: 'L2', crisis_level: '院级', crisis_relieved: '否',
    });
    assert.equal(imported.community, '启明书院');
    assert.equal(imported.student_type, '专科生');
    assert.deepEqual(Array.from(imported.focus), ['psych', 'study']);
    assert.equal(imported.crisis_relieved, false, 'textual false values do not become a released alert');
    assert.equal(Object.hasOwn(imported.custom_fields, 'focus_type'), false, 'import aliases do not leak into custom fields');

    const normalizedAlias = c.norm.student({
      student_number: 'ADV-ALIAS', full_name: '兼容别名学生', focus_type: 'psych', crisis_relieved: '否',
    });
    assert.deepEqual(Array.from(normalizedAlias.focus), ['psych'], 'student normalization retains focus type aliases');
    assert.equal(Object.hasOwn(normalizedAlias.custom_fields, 'focus_type'), false, 'student normalization does not preserve focus aliases as custom fields');
    assert.equal(normalizedAlias.schema_version, 8, 'newly normalized students use schema v8');

    c.db.students = [
      c.norm.student(imported),
      c.norm.student({ student_number: 'ADV-2', full_name: '已解除学生', community: '致远书院', student_type: '本科生', enrollment_status: '在读', focus: ['econ'], focus_level: 'L1', crisis_level: '校级', crisis_relieved: true }),
      c.norm.student({ student_number: 'ADV-3', full_name: '普通学生', community: '启明书院', student_type: '本科生', enrollment_status: '在读', focus: [], crisis_level: '', crisis_relieved: false }),
    ];
    c.save('students');
    c.go('students');
    await wait(50);

    for (const key of ['community', 'studentType', 'enrollment', 'focusType', 'crisis', 'relieved']) {
      assert.ok(d.querySelector(`[data-filter="students.${key}"]`), `student ledger exposes ${key} as a combination filter`);
    }
    const community = d.querySelector('[data-filter="students.community"]');
    community.value = '启明书院';
    community.dispatchEvent(new w.Event('change', { bubbles: true }));
    await wait(25);
    assert.equal(d.querySelectorAll('[data-student-row]').length, 2, 'community filter combines with the ledger');
    const type = d.querySelector('[data-filter="students.studentType"]');
    type.value = '专科生';
    type.dispatchEvent(new w.Event('change', { bubbles: true }));
    await wait(25);
    assert.equal(d.querySelectorAll('[data-student-row]').length, 1, 'student type combines with community');
    const released = d.querySelector('[data-filter="students.relieved"]');
    released.value = 'unreleased';
    released.dispatchEvent(new w.Event('change', { bubbles: true }));
    await wait(25);
    assert.equal(d.querySelectorAll('[data-student-row]').length, 1, 'unreleased crisis filter keeps the matching active alert');

    d.querySelector('[data-act="students-clear-filters"]').click();
    await wait(25);
    d.querySelector('[data-act="student-new"]').click();
    await wait(15);
    assert.ok(d.querySelector('[data-k="community"]'), 'student form edits community');
    assert.ok(d.querySelector('[data-k="student_type"]'), 'student form edits explicit student type');
    d.querySelector('[data-close]').click();

    assert.ok(c.studentImportSchema.fields.community, 'community is available to the import mapping schema');
    assert.ok(c.studentImportSchema.fields.student_type, 'student type is available to the import mapping schema');
    assert.ok(c.studentTemplateColumns().some(column => column.field === 'community'), 'community is present in the import template');
    assert.ok(c.studentTemplateColumns().some(column => column.field === 'crisis_relieved'), 'release status is present in the import template');

    c.go('students');
    await wait(20);
    d.querySelector('[data-student-tab="analysis"]').click();
    await wait(20);
    const stats = d.querySelector('[data-student-dimension-stats]');
    assert.ok(stats, 'student analysis exposes dimension statistics for extended fields');
    assert.match(stats.textContent, /启明书院/);
    assert.match(stats.textContent, /专科生/);
    assert.match(stats.textContent, /psych/, 'focus types are included in extended-field statistics');
    assert.match(stats.textContent, /院级/, 'crisis levels are included in extended-field statistics');
    assert.match(stats.textContent, /已解除/, 'release status is included in extended-field statistics');

    c.go('students');
    await wait(20);
    d.querySelector('[data-student-tab="ledger"]').click();
    await wait(20);
    d.querySelector('[data-filter-set="students.mode"][data-v="cards"]').click();
    await wait(20);
    const studentCards = d.querySelector('[data-student-layout="cards"]');
    assert.ok(studentCards, 'student ledger renders a dedicated card container');
    assert.notEqual(w.getComputedStyle(studentCards).display, 'none', 'card mode must be visible on desktop');
    assert.equal(studentCards.querySelectorAll('.mcard').length, 3, 'card mode retains the filtered student records');
    d.querySelector('[data-filter-set="students.mode"][data-v="table"]').click();
    await wait(20);
    assert.ok(d.querySelector('[data-student-column-view]'), 'ledger exposes personal column views');
    assert.ok(d.querySelector('[data-act="student-manage-columns"]'), 'ledger exposes column order, width, and group controls');
    assert.ok(d.querySelector('[data-act="student-save-filter"]'), 'ledger can save the current combination filter');

    const preferences = c.db.settings.student_ledger;
    preferences.saved_filters = [{
      id: 'saved-community',
      name: 'Saved community',
      filters: { q: '', cls: '', level: '', community: imported.community, studentType: '', enrollment: '', focus: '', focusType: '', crisis: '', relieved: '', field: '', value: '' },
    }];
    c.save('settings');
    c.go('students');
    await wait(20);
    const savedFilter = d.querySelector('[data-student-saved-filter]');
    assert.ok(savedFilter, 'saved filter schemes can be selected from the ledger');
    savedFilter.value = 'saved-community';
    savedFilter.dispatchEvent(new w.Event('change', { bubbles: true }));
    await wait(25);
    assert.equal(d.querySelectorAll('[data-student-row]').length, 2, 'selecting a saved scheme restores its combination filters');
  } finally {
    dom.window.close();
  }
  console.log('PASS student-ledger-advanced');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
