const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('node:path');
const file = path.join(__dirname, '..', 'index.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = []; const vc = new VirtualConsole();
  vc.on('jsdomError', e => { if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(e.message)) errors.push(e.message); });
  vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = await JSDOM.fromFile(file, { runScripts:'dangerously', resources:'usable', url:'https://c.local/', virtualConsole:vc, pretendToBeVisual:true });
  await wait(700); const { window:w } = dom, d = w.document;
  d.querySelector('[data-view="students"]').click(); await wait(80);
  assert.ok(d.querySelector('[data-student-page-size]'), 'student page size selector should exist');
  assert.deepEqual([...d.querySelectorAll('[data-student-page-size] option')].map(x => x.value), ['10','20','50','100']);
  assert.ok(d.querySelector('[data-act="student-bulk-toggle"]'), 'student bulk toolbar toggle should exist');
  assert.ok(d.querySelector('.student-table-wrap'), 'student table should expose horizontal scroll wrapper');
  assert.ok(d.querySelector('[data-act="student-page"]'), 'student pagination controls should exist');
  assert.match(d.querySelector('#main').textContent, /社区|书院/);
  d.querySelector('[data-act="student-export"]').click(); await wait(20);
  assert.ok(d.querySelector('[data-export-up]') && d.querySelector('[data-export-down]'), 'student XLSX preview should expose column ordering controls');
  d.querySelector('[data-close]').click(); await wait(10);
  d.querySelector('[data-act="student-new"]').click(); await wait(20);
  assert.match(d.querySelector('.mask').textContent, /专科生/);
  assert.ok(w.CWB.v4 && w.CWB.persistence.autosave, 'v4 persistence APIs should be exposed');
  assert.deepEqual(w.CWB.storage.capabilities().indexedDB, false);
  assert.deepEqual(errors, []);
  dom.window.close(); console.log('PASS v4-ui');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
