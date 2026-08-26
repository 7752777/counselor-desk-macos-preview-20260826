const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const v48 = require('../src/core/cwb-v48.js');

const catalog = v48.createStudentFieldCatalog();
const field = catalog.add({ name:'research_status', label:'科研状态', type:'select', options:['未开始', '进行中', '已结题'], sensitive:false, required:true });
assert.equal(field.name, 'research_status');
assert.equal(catalog.validate({ research_status:'进行中' }).valid, true);
assert.equal(catalog.validate({ research_status:'其他' }).errors[0].code, 'option');
assert.equal(catalog.preview(['姓名', '科研状态'], { 科研状态:'research_status' })[1].matched, true);

const content = v48.createContentPushService();
const push = content.publish({ title:'本周政策提醒', body:'请在周五前完成材料核验', scope:{ college:'教育学院' } });
assert.equal(content.list({ college:'教育学院' }).length, 1);
assert.equal(content.list({ college:'其他学院' }).length, 0);
assert.equal(content.markRead(push.id, 'local-teacher').reader_id, 'local-teacher');
assert.equal(content.markRead(push.id, 'local-teacher').id, content.reads()[0].id);
assert.equal(content.retract(push.id, 'local-admin').status, 'retracted');

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const auditEvents = [];
const host = v48.createSyncHost({ workspace_id:'w1', hashToken:sha256, allowedCollections:['students'], audit:(action, details) => auditEvents.push({ action, details }) });
const pairing = host.createPairingCode();
const request = host.requestPairing({ pairing_id:pairing.pairing_id, code:pairing.code, device_id:'phone-1', device_name:'手机' });
const confirmed = host.confirmPairing(request.id, true);
const token = confirmed.device.token;
const accepted = host.push(token, [{ workspace_id:'w1', device_id:'phone-1', idempotency_key:'op-1', collection:'students', record_id:'s1', base_revision:0, patch:{ class_name:'一班' } }]);
assert.equal(accepted.results[0].status, 'accepted');
assert.equal(host.push(token, [{ workspace_id:'w1', device_id:'phone-1', idempotency_key:'op-1', collection:'students', record_id:'s1', base_revision:0, patch:{ class_name:'一班' } }]).results[0].status, 'duplicate');
const secondPairing = host.createPairingCode();
const secondRequest = host.requestPairing({ pairing_id:secondPairing.pairing_id, code:secondPairing.code, device_id:'desktop-2' });
const second = host.confirmPairing(secondRequest.id, true);
const merged = host.push(second.device.token, [{ workspace_id:'w1', device_id:'desktop-2', idempotency_key:'op-2', collection:'students', record_id:'s1', base_revision:1, patch:{ advisor_name:'张老师' } }]);
assert.equal(merged.results[0].status, 'accepted', 'different fields should merge');
const conflict = host.push(second.device.token, [{ workspace_id:'w1', device_id:'desktop-2', idempotency_key:'op-3', collection:'students', record_id:'s1', base_revision:0, patch:{ class_name:'二班' } }]);
assert.equal(conflict.results[0].status, 'conflict');
assert.equal(host.listConflicts().length, 1);
assert.equal(host.resolveConflict(host.listConflicts()[0].id, { mode:'manual', values:{ class_name:'二班' } }).status, 'resolved');
assert.equal(host.pull(token, 0).operations.length, 3, 'conflict resolution is published as a host revision for other devices');
assert.ok(auditEvents.some(item => item.action === 'sync_pairing_confirmed'));
assert.ok(auditEvents.some(item => item.action === 'sync_conflict_opened'));
assert.ok(auditEvents.some(item => item.action === 'sync_conflict_resolved' && item.details.mode === 'manual'));
assert.ok(!auditEvents.some(item => Object.prototype.hasOwnProperty.call(item.details, 'patch')));
assert.equal(host.revokeDevice('phone-1'), true);
assert.throws(() => host.pull(token, 0), /SYNC_DEVICE_UNAUTHORIZED/);

const records = new Map([['s1', { id:'s1', student_id:'s1', class_name:'一班' }]]);
const storedHost = v48.createSyncHost({
  workspace_id:'w2', hashToken:sha256, allowedCollections:['students'],
  recordStore:{ get:(collection, id) => records.get(id) || null, put:(collection, record) => { records.set(record.id, record); return record; } },
});
const storedPairing = storedHost.createPairingCode();
const storedRequest = storedHost.requestPairing({ pairing_id:storedPairing.pairing_id, code:storedPairing.code, device_id:'client-1', device_name:'测试客户端' });
const storedDevice = storedHost.confirmPairing(storedRequest.id, true).device;
assert.equal(storedHost.push(storedDevice.token, [{ workspace_id:'w2', device_id:'client-1', idempotency_key:'stored-1', collection:'students', record_id:'s1', base_revision:0, patch:{ class_name:'二班' } }]).results[0].status, 'accepted');
assert.equal(records.get('s1').class_name, '二班', 'accepted sync operations write the business repository');
const clientFetch = async (url, request) => {
  const pathname = new URL(url).pathname;
  if (pathname === '/api/v1/workspace/manifest') return { ok:true, status:200, json:async () => ({ ok:true, workspace_id:'w2', data_schema_version:11, fingerprint:'aa:bb', collections:['students'] }) };
  if (pathname === '/api/v1/sync/push') return { ok:true, status:200, json:async () => Object.assign({ ok:true }, storedHost.push(storedDevice.token, JSON.parse(request.body).operations)) };
  if (pathname === '/api/v1/sync/pull') return { ok:true, status:200, json:async () => Object.assign({ ok:true }, storedHost.pull(storedDevice.token, JSON.parse(request.body).cursor)) };
  if (pathname === '/api/v1/sync/conflicts') return { ok:true, status:200, json:async () => ({ ok:true, conflicts:storedHost.listConflicts() }) };
  throw new Error('unexpected test route');
};
let clientSnapshot = {};
const client = v48.createSyncClient({ base_url:'https://lan.test:1234', workspace_id:'w2', device_id:'client-1', token:storedDevice.token, fetch:clientFetch, save:value => { clientSnapshot = value; }, recordStore:{ get:(collection, id) => records.get(id) || null, put:(collection, record) => { records.set(record.id, record); return record; } } });
client.connect({ fingerprint:'aa:bb' }).then(async () => {
  client.enqueue('students', 's1', { advisor_name:'张老师' }, 1);
  assert.equal(client.status().queued, 1);
  assert.equal((await client.flushQueue()).results[0].status, 'accepted');
  assert.equal(records.get('s1').advisor_name, '张老师');
  assert.equal(clientSnapshot.queue.length, 0);
  console.log('PASS v48-services');
}).catch(error => { console.error(error.stack || error.message); process.exit(1); });
