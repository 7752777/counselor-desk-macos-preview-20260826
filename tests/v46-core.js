const assert = require('node:assert/strict');
const { CWBCollections } = require('../src/core/cwb-collections.js');
const v46 = require('../src/core/cwb-v46.js');
const v9 = require('../src/core/v9-migration.js');

assert.equal(v46.SCHEMA_VERSION, 9);
for (const collection of v46.COLLECTIONS) assert.ok(CWBCollections.custom.includes(collection), `manifest missing ${collection}`);
assert.equal(CWBCollections.schemaVersion, 11);
assert.equal(CWBCollections.legacySchemaVersion, 8);

const draw = v46.utilities.draw({ items:'甲\n乙\n丙\n甲', count:3, seed:'stable-seed' });
assert.equal(draw.items.length, 3);
assert.equal(new Set(draw.items).size, 3, 'draw without replacement must not repeat');
assert.deepEqual(draw.items, v46.utilities.draw({ items:['甲','乙','丙'], count:3, seed:'stable-seed' }).items, 'seeded draws are reproducible');
assert.throws(() => v46.utilities.draw({ items:['甲'], count:2 }), /UTILITY_DRAW_NOT_ENOUGH/);
const grouped = v46.utilities.group({ items:['a','b','c','d','e'], groupCount:2, seed:'groups' });
assert.equal(grouped.groups.length, 2);
assert.equal(grouped.groups.reduce((sum, item) => sum + item.items.length, 0), 5);
const groupedBySize = v46.utilities.group({ items:['a','b','c','d','e'], groupCount:2, perGroup:2, seed:'group-size' });
assert.equal(groupedBySize.group_count, 3, 'per-group mode must derive enough groups');
assert.equal(groupedBySize.groups.reduce((sum, item) => sum + item.items.length, 0), 5, 'per-group mode must not drop the remainder');
assert.equal(new Set(groupedBySize.groups.flatMap(item => item.items)).size, 5, 'per-group mode must not duplicate members');
assert.ok(v46.utilities.group({ items:['a','b'] }).seed, 'generated group results must expose a replay seed');
assert.equal(v46.utilities.generateRotation({ people:['甲','乙'], startDate:'2026-08-01', intervalDays:7, cycles:3 }).items[1].date, '2026-08-08');
assert.equal(v46.utilities.dateDiff({ from:'2026-08-01', to:'2026-08-11' }).days, 10);
const cleaned = v46.utilities.cleanList('甲, 乙\n甲;;丙');
assert.deepEqual([...cleaned], ['甲','乙','丙']);
assert.equal(cleaned.duplicates, 1);

const studentObjectReference = v46.studentReference({ id:'student-object-1', full_name:'学生甲' }, { studentObject:true });
assert.equal(studentObjectReference.student_id, 'student-object-1', 'student objects may use their stable id');
assert.equal(v46.normalizeAssignment({ id:'assignment-record-1', full_name:'业务记录本身' }).student_id, '', 'business record ids must not become student ids');
assert.throws(() => v46.utilities.dateDiff({ from:'2026-02-31', to:'2026-03-01' }), /UTILITY_DATE_INVALID/, 'invalid calendar dates must be rejected');
assert.throws(() => v46.utilities.generateRotation({ people:['甲'], startDate:'2026-04-31' }), /UTILITY_ROTATION_INPUT_INVALID/, 'rotation must reject normalized invalid dates');

const building = v46.dorm.normalizeBuilding({ id:'b1', name:'一号楼', gender_limit:'男' });
const room = v46.dorm.normalizeRoom({ id:'r1', building_id:'b1', room_number:'101', capacity:1, bed_numbers:['A'] });
const plan = v46.dorm.plan({
  batch_id:'batch-1', buildings:[building], rooms:[room], students:[
    { id:'s1', student_number:'001', full_name:'甲', gender:'男', class_name:'一班' },
    { id:'s2', student_number:'002', full_name:'乙', gender:'女', class_name:'一班' },
  ], check_in_date:'2026-09-01',
});
assert.equal(plan.assigned_count, 1);
assert.equal(plan.conflicts[0].type, 'no_available_bed');
const validPlan = v46.dorm.plan({ batch_id:'batch-2', buildings:[building], rooms:[v46.dorm.normalizeRoom({ id:'r2', building_id:'b1', capacity:1 })], students:[{ id:'s1', student_number:'001', full_name:'甲', gender:'男' }] });
assert.equal(validPlan.valid, true);
const filteredPlan = v46.dorm.plan({ batch_id:'batch-filter', buildings:[v46.dorm.normalizeBuilding({ id:'b-filter', name:'混合楼', gender_limit:'不限' })], rooms:[v46.dorm.normalizeRoom({ id:'r-filter', building_id:'b-filter', capacity:2 })], filters:{ gender:'女', grade:'2025', student_type:'本科' }, students:[{ id:'s-filter-yes', full_name:'符合', gender:'女', grade:'2025', student_type:'本科' }, { id:'s-filter-no', full_name:'不符合', gender:'男', grade:'2024', student_type:'本科' }] });
assert.equal(filteredPlan.selected_count, 1, 'dorm filters must use normalized gender, grade, and student type');
assert.equal(filteredPlan.assignments[0].student_id, 's-filter-yes');
const applied = v46.dorm.apply(validPlan, { buildings:[building], rooms:[v46.dorm.normalizeRoom({ id:'r2', building_id:'b1', capacity:1 })] });
assert.equal(applied.assignments[0].status, 'confirmed');
assert.equal(applied.studentPatches[0].student_id, 's1');
assert.equal(applied.assignments[0].student_gender, '男', 'dorm assignment keeps the gender snapshot');
assert.throws(() => v46.dorm.apply(validPlan, {
  buildings:[building],
  rooms:[v46.dorm.normalizeRoom({ id:'r2', building_id:'b1', capacity:1 })],
  existingAssignments:[{ id:'existing-s1', student_id:'s1', room_id:'r2', building_id:'b1', bed_number:'1', status:'confirmed' }],
}), /DORM_PLAN_INVALID/, 'confirm must recheck current student occupancy');
const unavailable = v46.dorm.validate({ assignments:[{ id:'assignment-unavailable', student_id:'s3', building_id:'b1', room_id:'r3', bed_number:'1' }] }, {
  buildings:[building], rooms:[v46.dorm.normalizeRoom({ id:'r3', building_id:'b1', capacity:1, status:'维修' })],
});
assert.equal(unavailable.valid, false);
assert.equal(unavailable.errors[0].type, 'room_unavailable');
const multiPlan = v46.dorm.plan({ batch_id:'batch-multi', buildings:[v46.dorm.normalizeBuilding({ id:'b-multi', name:'混合楼', gender_limit:'不限' })], rooms:[v46.dorm.normalizeRoom({ id:'r-multi', building_id:'b-multi', capacity:2 })], students:[
  { id:'s-multi-1', student_number:'101', full_name:'甲一', gender:'男' },
  { id:'s-multi-2', student_number:'102', full_name:'乙二', gender:'女' },
] });
assert.equal(multiPlan.assigned_count, 2);
assert.equal(v46.dorm.apply(multiPlan, { buildings:[{ id:'b-multi', name:'混合楼', gender_limit:'不限' }], rooms:[{ id:'r-multi', building_id:'b-multi', capacity:2 }] }).assignments.length, 2, 'applying a complete plan must retain every assignment');
const duplicateStudentPlan = v46.dorm.plan({ batch_id:'batch-duplicate', buildings:[v46.dorm.normalizeBuilding({ id:'b-duplicate', name:'重复检查楼', gender_limit:'不限' })], rooms:[v46.dorm.normalizeRoom({ id:'r-duplicate', building_id:'b-duplicate', capacity:2 })], students:[
  { id:'same-student', student_number:'201', full_name:'重复学生', gender:'男' },
  { id:'same-student', student_number:'201', full_name:'重复学生', gender:'男' },
] });
assert.equal(duplicateStudentPlan.valid, false, 'dorm preview must reject duplicate student ids before confirmation');
assert.ok(duplicateStudentPlan.conflicts.some(item => item.type === 'duplicate_student'));
const genderConflict = v46.dorm.validate({ assignments:[{ id:'assignment-gender', student_id:'s2', student_gender:'女', building_id:'b1', room_id:'r2', bed_number:'1' }] }, { buildings:[building], rooms:[v46.dorm.normalizeRoom({ id:'r2', building_id:'b1', capacity:1 })] });
assert.equal(genderConflict.valid, false);
assert.equal(genderConflict.errors[0].type, 'gender_limit');
assert.equal(v46.normalizeTransfer({ id:'transfer-1', status:'cancelled' }).status, 'cancelled');

assert.equal(v46.committee.evaluate({ student_id:'s1', role_name:'就业委员', grade:'优秀' }).grade, '优秀');
assert.throws(() => v46.committee.evaluate({ student_id:'s1', grade:'不确定' }), /COMMITTEE_EVALUATION_GRADE_INVALID/);
assert.ok(v46.committee.normalizeCatalog([{ key:'custom', name:'自定义委员', custom:true }]).some(item => item.name === '自定义委员'));

const family = v46.familyContacts.normalize({ id:'family-1', student_id:'s1', contact_name:'家长', relation:'母亲', date:'2026-08-18', channel:'电话', summary:'已沟通' });
assert.equal(family.parent_relation, '母亲');
const draft = v46.worklogDrafts.createFromRecord(family, { source_collection:'v4_family_contacts' });
assert.equal(draft.status, 'draft');
assert.equal(draft.source_id, family.id);
assert.equal(v46.worklogDrafts.confirm(draft).status, 'confirmed');
const aiSuggestionSource = { id:'ai-source-1', kind:'general', purpose:'student_followup', title:'回访建议', summary:'三天内回访', payload:{ text:'请记录结果', next_action:'回访' }, source_ids:['source-1'], risk_level:'high', status:'accepted', updated_at:'2026-08-20T10:00:00.000Z' };
const aiSuggestionHash = v46.worklogDrafts.sourceHash(aiSuggestionSource, 'v4_ai_suggestions');
assert.equal(aiSuggestionHash, v46.worklogDrafts.sourceHash(Object.assign({}, aiSuggestionSource, { status:'converted_worklog', updated_at:'2026-08-20T10:05:00.000Z' }), 'v4_ai_suggestions'), 'AI suggestion workflow transitions must not invalidate its content snapshot');
assert.notEqual(aiSuggestionHash, v46.worklogDrafts.sourceHash(Object.assign({}, aiSuggestionSource, { summary:'已修改建议内容' }), 'v4_ai_suggestions'), 'editing AI suggestion content must require source review');
const staleDraft = v46.worklogDrafts.normalize({ id:'stale-draft', status:'stale', source_state:'changed', source_id:'family-1', source_collection:'v4_family_contacts' });
assert.throws(() => v46.worklogDrafts.confirm(staleDraft), /WORKLOG_DRAFT_SOURCE_RECHECK_REQUIRED/);
assert.equal(v46.worklogDrafts.confirm(staleDraft, { source_rechecked:true }).status, 'confirmed');

const project = v46.research.normalize({ id:'research-1', name:'课题', current_stage:'application', stage_due_date:'2026-09-01' });
const advanced = v46.research.advance(project, 'submission', { note:'材料已提交' });
assert.equal(advanced.current_stage, 'submission');
assert.equal(advanced.stage_history.length, 1);
assert.equal(v46.research.task(advanced).id, 'research_stage_research-1_submission');

const summary = v46.analysis.classSummary({
  class_name:'一班', students:[{ id:'s1', student_number:'001', full_name:'甲', class_name:'一班', grade:'2024' }, { id:'s2', student_number:'002', full_name:'乙', class_name:'一班', grade:'2024' }],
  talks:[{ id:'t1', student_id:'s1', date:'2026-08-10' }], rewards:[{ id:'w1', student_id:'s1', date:'2026-08-11' }], attend:[{ id:'a1', student_id:'s2', date:'2026-08-12', type:'旷课' }], grades:[], activityParticipants:[], grants:[],
});
assert.equal(summary.student_count, 2);
assert.equal(summary.rows.find(row => row.student_id === 's1').talks_count, 1);
assert.equal(summary.rows.find(row => row.student_id === 's2').absence_count, 1);
assert.equal(summary.rows.find(row => row.student_id === 's1').academic_warning_count, null, 'unrecorded metrics stay null');
assert.equal(v46.analysis.drillDown('absence_count', { class_name:'一班', students:summary.rows, attend:[{ id:'a1', student_id:'s2', type:'旷课' }] }).length, 1);
const termSummary = v46.analysis.classSummary({
  class_name:'一班', term:'2026-2027-1', students:[{ id:'s1', student_number:'001', full_name:'甲', class_name:'一班' }, { id:'s2', student_number:'002', full_name:'乙', class_name:'一班' }],
  talks:[{ id:'term-talk', student_id:'s1', term:'2026-2027-1', date:'2026-09-01' }, { id:'other-talk', student_id:'s1', term:'2025-2026-2', date:'2026-01-01' }],
  activityParticipants:[{ id:'p1', activity_id:'activity-1', student_id:'s1', term:'2026-2027-1' }, { id:'p2', activity_id:'activity-1', student_id:'s1', term:'2026-2027-1' }, { id:'p3', activity_id:'activity-2', student_id:'s1', term:'2025-2026-2' }],
});
assert.equal(termSummary.rows.find(row => row.student_id === 's1').talks_count, 1, 'class analysis must honor term filter');
assert.equal(termSummary.rows.find(row => row.student_id === 's1').activity_count, 1, 'class activity analysis must deduplicate by student, term, and activity');

const migrated = v9.migrate({ settings:{ theme:'light' }, custom:{} }, { collections:v46.COLLECTIONS });
assert.equal(migrated.schema_version, 9);
assert.equal(migrated.state.settings.v46_schema_version, 9);
assert.equal(migrated.state.data_schema_version, 9);
assert.ok(Array.isArray(migrated.state.custom.v4_research_projects));

console.log('PASS v46-core');
