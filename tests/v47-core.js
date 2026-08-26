const assert = require('node:assert/strict');
const { CWBCollections } = require('../src/core/cwb-collections.js');
const v47 = require('../src/core/cwb-v47.js');
const migration = require('../src/core/v10-migration.js');

assert.equal(v47.SCHEMA_VERSION, 10);
assert.equal(CWBCollections.schemaVersion, 11);
for (const key of v47.COLLECTIONS) assert.ok(CWBCollections.custom.includes(key), `manifest missing ${key}`);

const students = [
  { id:'s1', student_number:'001', full_name:'甲', class_name:'一班', gender:'男' },
  { id:'s2', student_number:'002', full_name:'乙', class_name:'一班', gender:'女' },
  { id:'s3', student_number:'003', full_name:'丙', class_name:'二班', gender:'男' },
];
const prepared = v47.rollCall.prepare({ students, class_names:['一班'], count:2, seed:'replay' });
const first = v47.rollCall.run({ students, class_names:['一班'], count:2, seed:'replay' });
const second = v47.rollCall.run({ prepared });
assert.deepEqual(first.selected_student_ids, second.selected_student_ids, 'a saved seed must reproduce point-call results');
assert.equal(new Set(first.selected_student_ids).size, first.selected_student_ids.length, 'point-call results must not repeat');
assert.equal(first.selected_student_ids.every(id => ['s1','s2'].includes(id)), true);

const checks = [
  v47.classChecks.create({ id:'c1', class_name:'一班', course:'高数', date:'2026-08-19', status:'已查', absent_count:2 }),
  v47.classChecks.create({ id:'c2', class_name:'一班', course:'英语', date:'2026-08-19', status:'异常', late_count:1 }),
];
assert.deepEqual(v47.classChecks.summary(checks, {}), { total:2, checked:1, pending:0, abnormal:1, resolved:0, absent:2, late:1 });

const inspection = v47.dorm.inspections.create({ id:'i1', building_name:'一号楼', room_number:'101', result:'存在异常' });
const exception = v47.dorm.exceptions.create({ id:'e1', inspection_id:inspection.id, level:'重要', description:'消防通道堆物' });
assert.equal(v47.dorm.exceptions.list([exception], { status:'待处理' }).length, 1);
assert.equal(v47.dorm.exceptions.resolve(exception, { result:'已清理' }).status, '已关闭');

const rule = v47.assessment.rules.create({ id:'rule-1', term:'2026-2027-1', version:'v2', base_score:100 });
const entries = [
  v47.assessment.entries.create({ id:'a1', student_id:'s1', student_name:'甲', class_name:'一班', term:'2026-2027-1', dimension:'志愿服务', score:5, direction:'加分' }),
  v47.assessment.entries.create({ id:'a2', student_id:'s1', student_name:'甲', class_name:'一班', term:'2026-2027-1', dimension:'考勤', score:2, direction:'扣分' }),
];
const totals = v47.assessment.totals(entries, [rule], { term:'2026-2027-1' });
assert.equal(totals.rows[0].final_score, 103);
assert.equal(totals.rows[0].rank, 1);

assert.equal(v47.tools.links.validateUrl('https://example.com'), true);
assert.equal(v47.tools.links.validateUrl('http://example.com'), false);
assert.equal(v47.tools.links.validateUrl('https://user:pass@example.com'), false);
assert.equal(v47.employment.safety.create({ organization:'可疑单位', risk_level:'高风险' }).risk_level, '高风险');
assert.equal(v47.competitions.entries.create({ competition_id:'comp-1', student_id:'s1', status:'已报名' }).status, '已报名');

const academic = v47.academicSummary({ grades:[
  { student_id:'s1', student_name:'甲', class_name:'一班', term:'2026-2027-1', course:'高数', score:58, gpa:0 },
  { student_id:'s1', student_name:'甲', class_name:'一班', term:'2026-2027-1', course:'英语', score:86, gpa:3.2 },
] , term:'2026-2027-1' });
assert.equal(academic.totals.failed_students, 1);
assert.equal(academic.rows[0].courses, 2);

const migrated = migration.migrate({ data_schema_version:9, settings:{ theme:'light' }, custom:{} }, { collections:v47.COLLECTIONS, from_schema_version:9 });
assert.equal(migrated.schema_version, 10);
assert.equal(migrated.state.data_schema_version, 10);
for (const key of v47.COLLECTIONS) assert.ok(Array.isArray(migrated.state.custom[key]), `migration must create ${key}`);

console.log('PASS v47-core');
