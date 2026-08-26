const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/core/cwb-employment.js', 'utf8');
const sandbox = { console };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename:'cwb-employment.js' });

const employment = sandbox.CWBEmployment;
assert.ok(employment, 'CWBEmployment should be exposed');
const intent = employment.normalizeIntent({ student_id:'student-1', student_number:20240001, graduation_year:'2027', expected_role:'产品运营' });
assert.equal(intent.schema_version, 8);
assert.equal(intent.student_id, 'student-1');
assert.equal(intent.student_number, '20240001');
assert.equal(intent.graduation_year, 2027);
assert.equal(intent.status, '待填报');

const contact = employment.normalizeContact({ student_id:'student-1', student_number:'20240001', contacted_at:'2026-08-17', channel:'电话', summary:'确认材料清单' });
assert.equal(contact.schema_version, 8);
assert.equal(contact.student_id, 'student-1');
assert.equal(contact.student_number, '20240001');
assert.equal(contact.channel, '电话');
assert.equal(contact.status, '已记录');
assert.match(contact.id, /^employment_contact_/);

console.log('PASS cwb-employment');
