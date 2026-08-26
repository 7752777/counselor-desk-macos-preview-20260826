const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts:'dangerously', url:'https://c.local/', pretendToBeVisual:true });
  const { window } = dom;
  await new Promise(resolve => setTimeout(resolve, 700));
  window.CWB.go('students');
  const student = window.CWB.db.students[0];
  window.document.querySelector(`[data-act="student-view"][data-id="${student.id}"]`).click();
  window.document.querySelector('[data-edit-stu]').click();
  if (!window.document.querySelector('[data-student-photo]')) throw new Error('student photo upload input missing');
  window.document.querySelector('[data-close]').click();
  window.CWB.go('material');
  window.document.querySelector('[data-act="material-new"]').click();
  if (!window.document.querySelector('[data-record-files]')) throw new Error('materials attachment input missing');
  dom.window.close();
  console.log('PASS v4-attachments');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
