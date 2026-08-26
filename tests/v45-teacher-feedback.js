const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const workflowSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'cwb-ai-workflow.js'), 'utf8');
const dom = new JSDOM(html, {
  runScripts:'dangerously',
  url:'https://c.local/',
  beforeParse(window) {
    window.requestAnimationFrame = callback => window.setTimeout(callback, 0);
    window.scrollTo = () => {};
  },
});
const { window } = dom;
window.eval(workflowSource);

(async () => {

const normalizedStudent = window.CWB.stuNormalizeRow(window.CWB.csvTextToObjects(
  '学号,姓名,导师,班主任,家长关系,居住类型,当前居住地址,房东电话\n20260001,张三,王老师,李老师,母亲,校外,校外地址,13800000000',
)[0]);
assert.equal(normalizedStudent.advisor_name, '王老师');
assert.equal(normalizedStudent.homeroom_teacher_name, '李老师');
assert.equal(normalizedStudent.parent_relation, '母亲');
assert.equal(normalizedStudent.residence_type, '校外');
assert.equal(normalizedStudent.residence_address, '校外地址');
assert.equal(normalizedStudent.landlord_phone, '13800000000');

const student = window.CWB.norm.student({ id:'student-v45', student_number:'20260001', full_name:'张三' });
student.student_number = '20260002';
student.student_number_history = [{ value:'20260001', recorded_at:'2026-08-18T00:00:00.000Z' }];
window.CWB.db.students = [student];
assert.equal(window.CWB.db.students[0].id, 'student-v45');
assert.equal(window.CWB.db.students[0].student_number_history[0].value, '20260001');

const preview = window.CWB.importer.previewCSV('学号,姓名\n20260001,张三', 'students');
assert.equal(preview.studentImportMode || 'merge', 'merge');
window.CWB.openImportPreview(preview, {});
assert.ok(window.document.querySelector('[data-import-mode]'), 'student import mode control should be visible');
assert.ok(window.document.body.textContent.includes('合并更新'), 'merge import should be the default');

window.CWB.db.custom.v4_contacts = [
  { id:'contact-v45', name:'李老师', department:'学工办', office_phone:'010-00000000', schema_version:8 },
  { id:'contact-v45-2', name:'王老师', department:'教务处', office_phone:'010-11111111', schema_version:8 },
];
const exportPackage = window.CWB.export.createPackage({ collection:'v4_contacts', fields:['name','department'] });
assert.deepEqual(Array.from(exportPackage.collections.v4_contacts.fields), ['name','department']);
assert.equal(exportPackage.collections.v4_contacts.rows[0][0], '李老师');
assert.match(window.CWB.export.toPrintableHtml({ collection:'v4_contacts', title:'通讯录打印工作包' }), /通讯录打印工作包/);
const filteredExport = window.CWB.export.createPackage({ collection:'v4_contacts', fields:['name'], scope:{ view:'contacts', filters:{ department:'教务处' } } });
assert.deepEqual(JSON.parse(JSON.stringify(filteredExport.collections.v4_contacts.rows)), [['王老师']]);

const noticePreview = await window.CWB.ai.notice.preview({ text:'请各班于2026年9月1日前提交班会材料。', source:'学院学工办' });
assert.equal(noticePreview.notice.deadlines[0].date, '2026年9月1日');
assert.equal(noticePreview.source.original_saved, false);
const confirmed = window.CWB.ai.notice.confirm(noticePreview, { confirmed:true });
assert.equal(confirmed.original_saved, false);
assert.equal(confirmed.suggestion.status, 'accepted');
const stored = window.CWB.db.custom.v4_ai_suggestions.find(item => item.id === confirmed.suggestion.id);
assert.equal(Object.prototype.hasOwnProperty.call(stored.payload, 'original_text'), false, 'notice original must not be saved by default');

window.CWB.openTemplateCenter('v4_contacts');
assert.ok(window.document.querySelector('[data-template-center-select]'), 'template center should render');
assert.ok(window.document.body.textContent.includes('个人电话'), 'template center should expose contact fields');
assert.ok(window.document.body.textContent.includes('模板第一行是'), 'template center should explain the two-row template');

assert.equal((html.match(/data-act="v4-party-new"/g) || []).length, 1, 'party creation should have one visible entry');
assert.match(html, /'v4-party-new':\s*\(\)\s*=>\s*partyCaseForm\(null\)/, 'party creation should use the unified form handler');
assert.match(html, /application_at:String\(value\.application_at \|\| ''\)/, 'empty party dates must remain empty');
assert.match(html, /syncPartyCompatibilityMirror\(list\)/, 'party saves should update the legacy compatibility mirror');
assert.match(html, /Array\.isArray\(item\.attachments\)/, 'legacy records without attachment arrays should render safely');

  console.log('PASS v45-teacher-feedback');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
