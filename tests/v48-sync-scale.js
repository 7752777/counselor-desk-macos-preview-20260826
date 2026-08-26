const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const v48 = require('../src/core/cwb-v48.js');

const records = new Map();
const keyFor = (collection, id) => `${collection}:${id}`;
const host = v48.createSyncHost({
  workspace_id:'scale-workspace',
  allowedCollections:['students', 'worklogs'],
  recordStore:{
    get:(collection, id) => records.get(keyFor(collection, id)) || null,
    put:(collection, record) => { records.set(keyFor(collection, record.id), record); return record; },
  },
});
const pairing = host.createPairingCode();
const request = host.requestPairing({ pairing_id:pairing.pairing_id, code:pairing.code, device_id:'scale-client', device_name:'规模测试客户端' });
const device = host.confirmPairing(request.id, true).device;
const operations = [];
for (let index = 0; index < 5000; index += 1) {
  const id = `student-${String(index + 1).padStart(5, '0')}`;
  operations.push({ workspace_id:'scale-workspace', device_id:'scale-client', idempotency_key:`student-op-${index}`, collection:'students', record_id:id, base_revision:0, patch:{ student_id:id, student_number:`2026${String(index + 1).padStart(5, '0')}`, full_name:`测试学生${index + 1}`, class_name:`测试班${(index % 100) + 1}` } });
}
for (let index = 0; index < 5000; index += 1) {
  const id = `worklog-${String(index + 1).padStart(5, '0')}`;
  operations.push({ workspace_id:'scale-workspace', device_id:'scale-client', idempotency_key:`worklog-op-${index}`, collection:'worklogs', record_id:id, base_revision:0, patch:{ id, date:'2026-08-21', title:'规模测试工作记录', status:'已完成' } });
}

const started = performance.now();
const results = [];
for (let offset = 0; offset < operations.length; offset += 500) {
  results.push(...host.push(device.token, operations.slice(offset, offset + 500)).results);
}
const elapsed = performance.now() - started;
assert.equal(results.length, 10000);
assert.equal(results.filter(item => item.status === 'accepted').length, 10000);
assert.equal(records.size, 10000, '5,000 students and 5,000 worklog records must be written');
assert.equal(host.status().queued_operations, 10000);
assert.ok(elapsed < 8000, `10,000 sync operations took ${Math.round(elapsed)}ms`);

const pulled = host.pull(device.token, 0);
assert.equal(pulled.operations.length, 10000);
assert.equal(pulled.cursor, 10000);
assert.equal(records.get(keyFor('students', 'student-00001')).student_id, 'student-00001');
assert.equal(records.get(keyFor('worklogs', 'worklog-05000')).status, '已完成');
console.log(`PASS v48-sync-scale (${Math.round(elapsed)}ms)`);
