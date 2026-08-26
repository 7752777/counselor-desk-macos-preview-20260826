const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const v48Ui = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'cwb-v48-ui.js'), 'utf8');
const match = html.match(/const STUDENT_RELATIONSHIP_SOURCES = Object\.freeze\(\[[\s\S]*?\nfunction studentChangedFields/);
assert.ok(match, 'student relationship impact registry should remain available');
const source = match[0].replace(/\nfunction studentChangedFields$/, '');
const target = { id:'student-1', student_id:'student-1', student_number:'20260001', full_name:'测试学生' };
const db = {
  students:[target],
  activities:[{ id:'activity-1', participant_student_ids:['student-1'] }],
  custom:{
    v4_roll_call_sessions:[{ id:'roll-1', selected_student_ids:['student-1'] }],
    v4_form_jobs:[{ id:'form-1', student_ids:['student-1'] }],
    v4_old_record:[{ id:'legacy-1', student_number:'20260001' }],
    v4_unrelated:[{ id:'other-1', student_id:'student-2' }],
  },
};
const impact = new Function('DB', 'window', 'studentByReference', `${source}\nreturn studentRelationshipImpact;`)(
  db,
  { CWBCollections:{ custom:Object.keys(db.custom) } },
  (studentId, studentNumber) => String(studentNumber || '') === target.student_number ? target : String(studentId || '') === target.id ? target : null,
)(target);

assert.equal(impact.stable, 3, 'primary and multi-student stable links should be counted');
assert.equal(impact.snapshotOnly, 1, 'legacy number-only links should be separated from stable links');
assert.deepEqual(
  impact.modules.map(item => item.label),
  ['活动记录', '课堂点名', '一生一表任务', 'old_record'],
  'impact summary should identify every supported relationship source',
);

const changedMatch = html.match(/function studentChangedFields\(before, next\) \{[\s\S]*?\n\}\nfunction hasStudentPhotoInput/);
assert.ok(changedMatch, 'student change detector should remain independently testable');
const changedFields = new Function(`${changedMatch[0].replace(/\nfunction hasStudentPhotoInput$/, '')}\nreturn studentChangedFields;`)();
const stableCustomBefore = {
  phone:'13800000000', parent_phone:'13900000000', custom_fields:{ tags:['资助','就业'], address:{ city:'南京', district:'鼓楼' } },
};
const stableCustomAfter = {
  phone:'13800000000', parent_phone:'13900000000', custom_fields:{ address:{ district:'鼓楼', city:'南京' }, tags:['就业','资助'] },
};
assert.deepEqual(changedFields(stableCustomBefore, stableCustomAfter), [], 'custom fields should ignore object and array ordering');
const expanded = changedFields(stableCustomBefore, Object.assign({}, stableCustomAfter, {
  parent_phone:'13700000000', emergency_contact:'家属', home_addr:'测试路 1 号', crisis_level:'院级', custom_fields:{ priority:'需要复核' },
}));
assert.deepEqual(expanded, ['家长与紧急联系人', '家庭与居住信息', '重点关注与预警', '自定义字段'], 'relationship confirmation should cover long-term contact, residence, sensitive and custom changes');

const classChangeMatch = html.match(/function studentClassChangeRecord\(before, next, options\) \{[\s\S]*?\n\}\nfunction studentForm/);
assert.ok(classChangeMatch, 'class history builder should remain available for profile edits');
const classChange = new Function('normV4Record', 'today', 'DB', `${classChangeMatch[0].replace(/\nfunction studentForm$/, '')}\nreturn studentClassChangeRecord;`)(
  (value, collection) => Object.assign({ collection }, value),
  () => '2026-08-24',
  { settings:{ counselor_name:'测试老师' } },
);
const classHistory = classChange(
  { id:'student-1', student_number:'20260001', full_name:'测试学生', class_name:'原班' },
  { id:'student-1', student_number:'20260001', full_name:'测试学生', class_name:'新班' },
  { reason:'教务分班', source:'教务导入', operator:'测试老师' },
);
assert.equal(classHistory.student_id, 'student-1');
assert.equal(classHistory.class_name, '新班', 'dated class history must expose the active class field used by visit analysis');
assert.equal(classHistory.from_class_name, '原班');
assert.equal(classChange({ class_name:'原班' }, { class_name:'原班' }), null, 'unchanged class should not create a history fact');

assert.match(html, /classHistory\s*=\s*!isNew\s*\?\s*v4Collection\('v4_student_class_history'\)/, 'single-student edits must retain a class history transaction');
assert.match(html, /class_history:beforeClassHistory, source:'学生名单导入'/, 'incremental roster imports must pass class history into the shared import engine');
assert.match(html, /repositories\.v4_student_class_history/, 'desktop and IndexedDB import persistence must address the real custom collection repository');
assert.match(html, /class_history:beforeClassHistory, effective_date:today\(\), reason:'批量编辑学生档案'/, 'bulk edits must create the same dated class history fact');
assert.match(v48Ui, /persistStudentsAndCustomMutation[\s\S]*liveLinkSnapshot/, 'manual class-history edits must snapshot live linked records before mutating them');
assert.match(v48Ui, /extraBaseCollections:!hasLater \? \['tasks'\] : \[\]/, 'current class recalculation must persist linked open task snapshots with the student write');
assert.match(v48Ui, /syncLiveLinks\(student\)/, 'manual class-history edits must refresh open linked snapshots after recalculating the current class');
console.log('PASS student-relationship-impact');
