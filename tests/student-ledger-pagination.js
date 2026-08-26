const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  vc.on('error', (...args) => errors.push(args.join(' ')));
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'index.html'), {
    runScripts:'dangerously',
    resources:'usable',
    url:'https://student-pagination.local/',
    pretendToBeVisual:true,
    virtualConsole:vc,
  });
  await wait(700);
  const { window:w } = dom;
  const d = w.document;
  const c = w.CWB;
  assert.ok(c, 'CWB should be available');
  c.db.students = Array.from({ length:21 }, (_, index) => c.norm.student({
    id:`pagination-${index}`,
    student_number:`P-${String(index).padStart(2, '0')}`,
    full_name:`Student ${index}`,
    class_name:'Class A',
  }));
  c.save('students');
  c.go('students');
  await wait(40);

  const pageSize = d.querySelector('[data-student-page-size]');
  assert.ok(pageSize, 'student ledger should expose a page-size selector');
  assert.ok(d.querySelector('[data-student-ledger-actions]'), 'primary ledger actions have their own aligned group');
  assert.ok(d.querySelector('[data-student-ledger-paging] [data-student-ledger-controls]'), 'pagination controls have their own aligned row');
  assert.deepEqual([...pageSize.options].map(option => option.value), ['10', '20', '50', '100']);
  assert.ok(pageSize.closest('.student-page-size'), 'page-size words and selector should remain one intentional control');
  assert.equal(d.querySelectorAll('[data-student-ledger-controls]').length, 1, 'the ledger should render one deliberate pagination control row instead of duplicating it below the filters');
  pageSize.value = '10';
  pageSize.dispatchEvent(new w.Event('change', { bubbles:true }));
  await wait(20);
  assert.equal(d.querySelectorAll('[data-student-row]').length, 10, 'ten-row page should render ten rows');
  assert.equal(d.querySelector('[data-student-page-current]').textContent.trim(), '1');
  assert.equal(d.querySelector('[data-act="v4-students-more"]'), null, 'the legacy load-more control is removed when true pagination is available');
  d.querySelector('[data-act="student-page"][data-dir="next"]').click();
  await wait(20);
  assert.equal(d.querySelectorAll('[data-student-row]').length, 10, 'second page should render ten rows');
  assert.equal(d.querySelector('[data-student-page-current]').textContent.trim(), '2');
  assert.equal(d.querySelector('[data-student-row]').dataset.studentId, 'pagination-10');
  const saved = c.store.read('ui_state');
  assert.equal(saved.filters.students.pageSize, 10, 'page size should persist');
  assert.equal(saved.filters.students.page, 2, 'current page should persist');

  c.go('students');
  await wait(20);
  assert.equal(d.querySelector('[data-student-page-current]').textContent.trim(), '2', 'rerender should retain current page');

  d.querySelector('[data-act="student-page"][data-dir="next"]').click();
  await wait(20);
  assert.equal(d.querySelectorAll('[data-student-row]').length, 1, 'last page should render its remaining row');
  const lastRowDelete = d.querySelector('[data-student-row] [data-act="student-del"]');
  assert.ok(lastRowDelete, 'row delete action should remain available');
  lastRowDelete.click();
  await wait(10);
  const confirm = d.querySelector('[data-yes]');
  assert.ok(confirm, 'deletion should require confirmation');
  confirm.click();
  await wait(40);
  assert.equal(d.querySelector('[data-student-page-current]').textContent.trim(), '2', 'deleting the only row on the last page should clamp to the previous page');
  assert.equal(c.store.read('ui_state').filters.students.page, 2, 'the clamped page is persisted after deletion');

  d.querySelector('[data-act="student-bulk-toggle"]').click();
  await wait(20);
  assert.ok(d.querySelector('[data-act="student-bulk-edit"]'), 'bulk mode exposes bulk edit');
  assert.ok(d.querySelector('[data-act="student-bulk-select-all"]'), 'bulk mode can select all filtered results');
  assert.equal(d.querySelectorAll('.student-select-col').length > 0, true, 'selection column is sticky and rendered first');
  assert.equal(d.querySelectorAll('.student-action-col').length > 0, true, 'action column is sticky and rendered second');
  assert.equal(d.querySelectorAll('[data-student-scroll-proxy]').length, 2, 'top and bottom horizontal scroll proxies are provided');

  d.querySelector('[data-act="student-bulk-select-all"]').click();
  await wait(15);
  assert.match(d.querySelector('.student-bulk-bar').textContent, /20/, 'selecting filtered results includes every filtered student, not only the current page');
  d.querySelector('[data-act="student-bulk-edit"]').click();
  await wait(15);
  const community = d.querySelector('[data-k="community"]');
  assert.ok(community, 'bulk editor can update community/college');
  community.value = '启明书院';
  d.querySelector('.modal [data-ok]').click();
  await wait(15);
  const bulkConfirm = d.querySelector('[data-yes]');
  assert.ok(bulkConfirm, 'bulk edit shows a confirmation with field differences');
  bulkConfirm.click();
  await wait(35);
  assert.equal(c.db.students.every(student => student.community === '启明书院'), true, 'confirmed bulk edit updates every selected filtered student');
  assert.ok(d.querySelector('[data-act="student-bulk-undo"]'), 'one undo is offered after a bulk edit');
  d.querySelector('[data-act="student-bulk-undo"]').click();
  await wait(35);
  assert.equal(c.db.students.every(student => !student.community), true, 'undo restores the prior values once');

  c.db.students = Array.from({ length:5000 }, (_, index) => c.norm.student({
    id:`filter-perf-${index}`,
    student_number:`FP-${String(index).padStart(5, '0')}`,
    full_name:`Filter Performance ${index}`,
    class_name:`Class ${index % 8}`,
    community:index % 2 ? '启明书院' : '致远书院',
    student_type:index % 3 ? '本科生' : '专科生',
    enrollment_status:index % 5 ? '在读' : '休学',
    focus:index % 4 ? [] : ['study'],
    crisis_level:index % 10 ? '' : '院级',
    crisis_relieved:false,
  }));
  c.save('students');
  c.go('students');
  await wait(40);
  const communityFilter = d.querySelector('[data-filter="students.community"]');
  const typeFilter = d.querySelector('[data-filter="students.studentType"]');
  const enrollmentFilter = d.querySelector('[data-filter="students.enrollment"]');
  const started = w.performance.now();
  communityFilter.value = '启明书院';
  communityFilter.dispatchEvent(new w.Event('change', { bubbles:true }));
  await wait(0);
  typeFilter.value = '本科生';
  typeFilter.dispatchEvent(new w.Event('change', { bubbles:true }));
  await wait(0);
  enrollmentFilter.value = '在读';
  enrollmentFilter.dispatchEvent(new w.Event('change', { bubbles:true }));
  await wait(0);
  const elapsed = w.performance.now() - started;
  assert.ok(d.querySelectorAll('[data-student-row]').length > 0, 'the combined filter renders matching ledger rows');
  assert.ok(elapsed <= 200, `5,000-student combined filtering took ${elapsed.toFixed(1)}ms, exceeding the 200ms release gate`);

  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS student-ledger-pagination');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
