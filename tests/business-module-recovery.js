const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'index.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const activeModal = document => {
  const modals = document.querySelectorAll('#modal-root .mask');
  return modals[modals.length - 1] || null;
};

async function openApp(storage) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(error.message)) errors.push(error.message);
  });
  virtualConsole.on('error', (...args) => errors.push(args.join(' ')));
  const html = fs.readFileSync(file, 'utf8')
    .replace('<script defer src="src/core/cwb-business.js" data-cwb-business></script>', () => `<script>${fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'cwb-business.js'), 'utf8')}</script>`);
  const dom = new JSDOM(html, {
    beforeParse(window) {
      Object.entries(storage || {}).forEach(([key, value]) => window.localStorage.setItem(`cwb_v1_${key}`, JSON.stringify(value)));
    },
    pretendToBeVisual:true,
    resources:'usable',
    runScripts:'dangerously',
    url:'https://business-module-recovery.local/',
    virtualConsole,
  });
  await wait(750);
  return { dom, errors, window:dom.window, document:dom.window.document };
}

(async () => {
  const storage = {
    settings:{ counselor_name:'测试辅导员', college_name:'测试学院', ui:{}, onboarding:{ completed:true, skipped:true }, welcome_experience:{ completed:true, skipped:true, greeting_enabled:false, quote_enabled:false } },
    students:[{ id:'student-1', student_number:'S001', full_name:'王同学', class_name:'一班', crisis_level:'一级', crisis_relieved:false }],
    talks:[{ id:'talk-1', student_number:'S001', student_name:'王同学', date:'2026-08-01', summary:'谈话记录' }],
    custom:{
      v4_positions:[{ id:'position-1', name:'班长', duty:'组织班会', class_name:'一班', student_number:'S001', term:'2026-2027' }],
      v4_party_cases:[{ id:'party-1', student_number:'S001', student_name:'王同学', stage:'积极分子', date:'2026-08-03' }],
    },
  };
  const { dom, errors, window, document } = await openApp(storage);
  const cwb = window.CWB;
  assert.ok(window.CWBBusiness, 'the business profile runtime should load with the application');

  assert.ok(cwb.db.orgs.some(row => row.id === 'position-1' && row.position === '班长'), 'legacy position records should map into orgs without changing IDs');
  assert.ok(cwb.db.party.some(row => row.id === 'party-1'), 'legacy party cases should map into party without changing IDs');
  assert.ok(cwb.db.worklogs, 'worklogs collection should always exist');
  assert.ok(cwb.db.grades, 'grades collection should always exist');

  for (const view of ['orgs', 'party', 'rewards', 'activities', 'grades', 'worklogs']) {
    const nav = document.querySelector(`[data-view="${view}"]`);
    assert.ok(nav, `${view} should have an independent navigation entry`);
    nav.click();
    await wait(25);
    assert.ok(document.querySelector(`[data-v4-module="${view}"]`), `${view} should render independently`);
  }

  cwb.db.worklogs.push(cwb.norm.normV4Record({ id:'worklog-1', student_number:'S001', student_name:'王同学', date:'2026-08-02', category:'班会', summary:'班会记录' }, 'worklogs'));
  cwb.go('students');
  await wait(25);
  document.querySelector('[data-act="student-view"]').click();
  await wait(25);
  const timeline = document.querySelector('[data-student-timeline]');
  assert.ok(timeline, 'student dossier should expose a unified timeline');
  assert.match(timeline.textContent, /班会记录/, 'timeline should include worklogs');
  document.querySelector('[data-close]').click();

  cwb.db.custom.v4_assessments = [window.CWBBusiness.normalizeAssessment({
    id:'assessment-stable-id', student_id:'student-1', student_number:'S001', student_name:'王同学', term:'2025-2026-2', level:'优秀', score:90,
  })];
  cwb.db.students[0].student_number = 'S001-REVISED';
  cwb.go('students');
  await wait(25);
  document.querySelector('[data-act="student-view"]').click();
  await wait(25);
  const stableProfile = activeModal(document);
  assert.match(stableProfile.textContent, /综测记录\s*1/, 'stable IDs retain business profile counts after student-number correction');
  assert.match(stableProfile.querySelector('[data-student-timeline]').textContent, /综合测评/, 'stable IDs retain business timeline entries after student-number correction');
  stableProfile.querySelector('[data-close]').click();

  cwb.go('talks');
  await wait(25);
  assert.ok(document.querySelector('[data-talk-schedule]'), 'talks view should expose crisis scheduling');

  cwb.db.grades = [
    cwb.norm.normV4Record({ id:'grade-1', student_number:'S001', student_name:'王同学', class_name:'一班', term:'2025-2026-1', course:'高等数学', score:55, failed:true }, 'grades'),
    cwb.norm.normV4Record({ id:'grade-2', student_number:'S001', student_name:'王同学', class_name:'一班', term:'2025-2026-2', course:'大学英语', score:80, failed:false }, 'grades'),
    cwb.norm.normV4Record({ id:'grade-3', student_number:'S002', student_name:'李同学', class_name:'二班', term:'2025-2026-1', course:'大学物理', score:58, failed:true }, 'grades'),
  ];
  cwb.db.help = [
    cwb.norm.help({ id:'help-1', student_number:'S001', name:'王同学', class_name:'一班', type:'学业困难重点帮扶', helper:'王老师', cycle:'本学期', measure:'每周一次答疑', status:'跟踪中' }),
  ];
  cwb.go('grades');
  await wait(25);
  assert.ok(document.querySelector('[data-grade-trend]'), 'grade records should render a term trend');
  const gradeSupport = document.querySelector('[data-grade-support]');
  assert.ok(gradeSupport, 'grade records with academic risk should expose a linked academic-support section');
  assert.match(gradeSupport.textContent, /王老师/, 'grade support should show the matching DB.help record instead of a derived placeholder');
  const editSupport = gradeSupport.querySelector('[data-act="grade-support-edit"][data-id="help-1"]');
  assert.ok(editSupport, 'linked support should open its real help record for editing');
  editSupport.click();
  await wait(25);
  assert.equal(activeModal(document).querySelector('[data-k="type"]').value, '学业困难重点帮扶', 'editing a linked automatic-support record must preserve its actual support type');
  activeModal(document).querySelector('[data-close]').click();
  const createSupport = gradeSupport.querySelector('[data-act="grade-support-new"][data-id="grade-3"]');
  assert.ok(createSupport, 'an at-risk student without DB.help should offer a prefilled support-record action');
  createSupport.click();
  await wait(25);
  assert.equal(activeModal(document).querySelector('[data-k="student_number"]').value, 'S002', 'new support records from grades should preserve the student number');
  assert.equal(activeModal(document).querySelector('[data-k="class_name"]').value, '二班', 'new support records from grades should preserve the class');
  activeModal(document).querySelector('[data-close]').click();
  document.querySelector('[data-act="v4-bulk-toggle"]').click();
  await wait(25);
  assert.ok(document.querySelector('[data-act="v4-select"]'), 'generic business modules should support batch selection');

  const canonicalOrg = cwb.norm.normV4Record({
    id:'canonical-org-1', student_number:'S001', student_name:'Student One', position:'Class representative',
    term:'2026-2027', status:'active', summary:'canonical write',
  }, 'orgs');
  cwb.db.orgs.push(canonicalOrg);
  cwb.save('orgs');
  assert.ok(cwb.db.custom.v4_positions.some(row => row.id === canonicalOrg.id && row.position === canonicalOrg.position),
    'saving canonical organizations should preserve a compatible legacy mirror');

  const exchange = cwb.bridge.buildPackage();
  for (const kind of ['orgs', 'party', 'rewards', 'activities', 'grades', 'worklogs']) {
    assert.ok(Array.isArray(exchange[kind]), `exchange package should include ${kind}`);
  }
  cwb.bridge.applyPackage({
    package:'counselor-desk', package_version:8,
    custom:{ v4_positions:[{ id:'legacy-import-org', name:'Legacy import position', student_number:'S001' }] },
  }, 'merge');
  assert.ok(cwb.db.orgs.some(row => row.id === 'legacy-import-org' && row.position === 'Legacy import position'),
    'legacy custom organization data should remain importable through the exchange bridge');

  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS business-module-recovery');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
