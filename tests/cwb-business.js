const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/core/cwb-business.js', 'utf8');
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename:'cwb-business.js' });

const business = sandbox.CWBBusiness;
assert.ok(business, 'CWBBusiness should be exposed');

const assessment = business.normalizeAssessment({ student_id:'student-1', student_number:20240001, term:'2025-2026-1', score:'88.5', rank:'3' });
assert.equal(assessment.schema_version, 8);
assert.equal(assessment.student_id, 'student-1');
assert.equal(assessment.student_number, '20240001');
assert.equal(assessment.score, 88.5);
assert.equal(assessment.rank, 3);
assert.equal(assessment.status, '已登记');

const academic = business.normalizeAcademicTerm({ student_number:'20240001', term:'2025-2026-1', failed_count:'2', warning_level:'黄色' });
assert.equal(academic.failed_count, 2);
assert.equal(academic.warning_level, '黄色');

const discipline = business.normalizeDiscipline({ student_number:'20240001', decision_date:'2026-01-02', document_attachment_id:'att_1' });
assert.equal(discipline.relieved, false);
assert.equal(discipline.status, '生效中');
assert.equal(discipline.document_attachment_id, 'att_1');

const aid = business.normalizeAid({ student_number:'20240001', amount:'1200', aid_type:'临时补助' });
assert.equal(aid.amount, 1200);
assert.equal(aid.aid_type, '临时补助');

const profile = business.buildStudentProfile('20240001', {
  assessments:[assessment], academicTerms:[academic], disciplines:[discipline], aids:[aid],
  employmentIntents:[{ student_number:'20240001', status:'求职' }], employmentContacts:[{ student_number:'20240001', status:'已记录' }],
});
assert.equal(profile.student_number, '20240001');
assert.equal(profile.assessment_count, 1);
assert.equal(profile.academic_term_count, 1);
assert.equal(profile.active_discipline_count, 1);
assert.equal(profile.aid_count, 1);
assert.equal(profile.employment_contact_count, 1);
assert.equal(profile.events.length, 4);

const renamedProfile = business.buildStudentProfile({ id:'student-1', student_number:'20249999' }, {
  assessments:[assessment], academicTerms:[], disciplines:[], aids:[], employmentIntents:[], employmentContacts:[],
});
assert.equal(renamedProfile.assessment_count, 1, 'stable IDs retain the association after a student number changes');
const legacyProfile = business.buildStudentProfile({ id:'student-2', student_number:'20240001' }, {
  assessments:[{ student_number:'20240001', level:'旧记录' }], academicTerms:[], disciplines:[], aids:[], employmentIntents:[], employmentContacts:[],
});
assert.equal(legacyProfile.assessment_count, 1, 'legacy number-only records remain associated');

console.log('PASS cwb-business');
