/** Platform exchange exports must be minimized by default and preserve stable student links. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'output', 'v4-preview.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  vc.on('error', (...args) => errors.push(args.join(' ')));
  const dom = await JSDOM.fromFile(file, {
    runScripts:'dangerously', resources:'usable', url:'https://platform-export.local/',
    virtualConsole:vc, pretendToBeVisual:true,
  });
  const w = dom.window;
  await wait(800);
  const cwb = w.CWB;
  cwb.db.students = [cwb.norm.student({
    id:'stable-student-1', student_id:'stable-student-1', student_number:'20260001', full_name:'张敏',
    phone:'13800138000', parent_phone:'13900139000', id_card:'110101199001010011',
    crisis_level:'校级', crisis_way:'心理中心转介', focus:['psych'], focus_level:'一级',
    note:'不能对外发送的敏感说明',
  })];
  cwb.db.talks = [{ id:'talk-sensitive-1', student_id:'stable-student-1', student_number:'20260001', student_name:'张敏', date:'2026-08-18', summary:'心理危机原文', judge:'内部研判', action:'联系家长' }];
  cwb.db.psych = [{ id:'psych-sensitive-1', student_id:'stable-student-1', level:'重度', concern:'心理危机详情' }];
  cwb.db.grant = [{ id:'grant-sensitive-1', student_id:'stable-student-1', difficulty_level:'特别困难', amount:8000 }];
  cwb.db.focus = [{ id:'focus-sensitive-1', student_id:'stable-student-1', level:'一级', reason:'家庭特殊情况' }];

  assert.equal(typeof cwb.bridge.buildPlatformPackage, 'function', 'platform package builder should be public');
  const pkg = cwb.bridge.buildPlatformPackage({ from:'2026-08-01', to:'2026-08-31' });
  assert.equal(pkg.privacy.mode, 'platform_minimal');
  assert.equal(pkg.students[0].student_id, 'stable-student-1');
  assert.equal(pkg.students[0].student_number, undefined, 'raw student number must not leave the platform-safe package');
  assert.equal(pkg.students[0].student_number_masked, '******01');
  assert.equal(pkg.students[0].full_name, undefined, 'raw student name must not leave the platform-safe package');
  assert.equal(pkg.students[0].full_name_masked, '张*');
  assert.equal(pkg.students[0].phone, undefined);
  assert.equal(pkg.students[0].phone_masked, '*******8000');
  assert.equal(pkg.students[0].crisis_level, undefined);
  assert.equal(pkg.students[0].crisis_code, 'C1');
  assert.equal(pkg.students[0].note, undefined);
  assert.equal(pkg.psych.length, 0, 'psychology records must be excluded by default');
  assert.equal(pkg.grant.length, 0, 'aid records must be excluded by default');
  assert.equal(pkg.focus.length, 0, 'focus records must be excluded by default');
  assert.equal(pkg.talks[0].summary, undefined, 'talk narratives must not leave the platform-safe package');
  assert.deepEqual(pkg.attachments, undefined, 'platform package builder must not include attachment payloads');
  assert.deepEqual(pkg.workspace, null, 'platform package must not include workspace history');
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS platform-export-privacy');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
