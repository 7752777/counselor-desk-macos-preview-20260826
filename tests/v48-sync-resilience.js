const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const v48 = require('../src/core/cwb-v48.js');

const hashToken = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const audit = [];
const host = v48.createSyncHost({ workspace_id:'resilience-workspace', hashToken, allowedCollections:['students'], audit:(action, details) => audit.push({ action, details }) });
const pairing = host.createPairingCode();
const request = host.requestPairing({ pairing_id:pairing.pairing_id, code:pairing.code, device_id:'resilience-device', device_name:'恢复测试设备' });
const device = host.confirmPairing(request.id, true).device;

assert.equal(host.pauseDevice(device.id), true);
assert.equal(host.status().devices.find(item => item.id === device.id).status, 'paused');
assert.equal(Object.prototype.hasOwnProperty.call(host.status().devices[0], 'token_hash'), false, 'host status must not expose token verifiers');
assert.throws(() => host.authenticate(device.token), error => error.code === 'SYNC_DEVICE_PAUSED');
assert.throws(() => host.pull(device.token, 0), error => error.code === 'SYNC_DEVICE_PAUSED');
assert.equal(host.resumeDevice(device.id), true);
assert.equal(host.authenticate(device.token).status, 'active');
assert.equal(Object.prototype.hasOwnProperty.call(host.authenticate(device.token), 'token_hash'), false, 'device authentication result must be public metadata only');
assert.equal(host.push(device.token, [{
  workspace_id:'resilience-workspace', device_id:device.id, idempotency_key:'resilience-op-1',
  collection:'students', record_id:'resilience-student', base_revision:0, patch:{ class_name:'一班' },
}]).results[0].status, 'accepted');
assert.ok(audit.some(item => item.action === 'sync_device_paused'));
assert.ok(audit.some(item => item.action === 'sync_device_resumed'));

const snapshots = [];
let pushShouldFail = false;
const records = new Map();
const clientFetch = async (url, requestOptions) => {
  const pathname = new URL(url).pathname;
  if (pathname === '/api/v1/workspace/manifest') return { ok:true, status:200, json:async () => ({ ok:true, workspace_id:'resilience-workspace', data_schema_version:11, fingerprint:'aa:bb', collections:['students'] }) };
  if (pathname === '/api/v1/sync/push') {
    if (pushShouldFail) throw new Error('offline');
    const operations = JSON.parse(requestOptions.body).operations;
    return { ok:true, status:200, json:async () => ({ ok:true, results:operations.map(operation => ({ status:'accepted', idempotency_key:operation.idempotency_key })) }) };
  }
  if (pathname === '/api/v1/sync/pull') return { ok:true, status:200, json:async () => ({ ok:true, cursor:0, operations:[] }) };
  throw new Error(`unexpected route ${pathname}`);
};
const client = v48.createSyncClient({
  base_url:'https://lan.test:1234', workspace_id:'resilience-workspace', device_id:'client-resilience', token:device.token,
  fetch:clientFetch, save:value => snapshots.push(value), recordStore:{
    get:async (_collection, id) => records.get(id) || null,
    put:async (_collection, record) => { records.set(record.id, record); return record; },
  },
});

(async () => {
  await client.connect({ fingerprint:'aa:bb' });
  client.enqueue('students', 'resilience-student', { advisor_name:'王老师' }, 0);
  pushShouldFail = true;
  await assert.rejects(() => client.syncNow(), error => error.code === 'SYNC_NETWORK_UNAVAILABLE');
  assert.equal(client.status().queued, 1, 'failed sync must retain the offline queue');
  assert.equal(client.status().connected, false, 'failed sync must be visible as disconnected');
  assert.equal(client.status().last_error, 'SYNC_NETWORK_UNAVAILABLE');
  pushShouldFail = false;
  assert.equal(client.startAutoSync({ interval_ms:5000 }).auto_sync, true);
  assert.equal(client.status().next_sync_at !== '', true);
  const result = await client.syncNow();
  assert.equal(result.pushed.queued, 0);
  assert.equal(client.status().queued, 0);
  client.stopAutoSync();
  assert.equal(client.status().auto_sync, false);
  const restored = v48.createSyncClient({ load:() => snapshots[snapshots.length - 1], fetch:clientFetch });
  assert.equal(restored.status().queued, 0, 'persisted queue state must be restorable');
  console.log('PASS v48-sync-resilience');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
