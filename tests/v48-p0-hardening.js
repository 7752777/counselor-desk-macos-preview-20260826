const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { X509Certificate } = crypto;
const v48 = require('../src/core/cwb-v48.js');
const { createLanSyncHost } = require('../desktop/lan-sync.cjs');

const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

function errorCode(error) {
  return String(error && (error.code || error.message) || '');
}

function assertThrowsCode(action, code) {
  assert.throws(action, error => errorCode(error).includes(code), `expected ${code}`);
}

function createRecordStore(records) {
  const key = (collection, id) => `${collection}:${id}`;
  return {
    get:(collection, id) => records.get(key(collection, id)) || null,
    put:(collection, record) => { records.set(key(collection, record.id), { ...record }); return record; },
    delete:(collection, id) => records.delete(key(collection, id)),
  };
}

async function testTransactionalRollback() {
  const records = new Map([['students:s1', { id:'s1', student_id:'s1', class_name:'一班' }]]);
  const auditEvents = [];
  let failPersist = false;
  const host = v48.createSyncHost({
    workspace_id:'p0-workspace',
    hashToken:sha256,
    allowedCollections:['students'],
    recordStore:createRecordStore(records),
    audit:(action, details) => auditEvents.push({ action, details }),
    persist:() => { if (failPersist) throw Object.assign(new Error('state write failed'), { code:'SYNC_STATE_PERSIST_FAILED' }); },
  });

  const pairing = host.createPairingCode();
  const request = host.requestPairing({ pairing_id:pairing.pairing_id, code:pairing.code, device_id:'p0-device' });
  const beforeConfirm = host.snapshot();
  failPersist = true;
  assertThrowsCode(() => host.confirmPairing(request.id, true), 'SYNC_STATE_PERSIST_FAILED');
  assert.deepEqual(host.snapshot(), beforeConfirm, 'failed pairing confirmation must restore the in-memory state');
  assert.equal(auditEvents.some(item => item.action === 'sync_pairing_confirmed'), false, 'failed confirmation must not emit a success audit');
  failPersist = false;
  const device = host.confirmPairing(request.id, true).device;

  const beforePush = host.snapshot();
  failPersist = true;
  assertThrowsCode(() => host.push(device.token, [{
    workspace_id:'p0-workspace', device_id:'p0-device', idempotency_key:'p0-operation',
    collection:'students', record_id:'s1', base_revision:0, patch:{ class_name:'二班' },
  }]), 'SYNC_STATE_PERSIST_FAILED');
  assert.deepEqual(host.snapshot(), beforePush, 'failed push must restore revisions, idempotency keys and operations');
  assert.equal(records.get('students:s1').class_name, '一班', 'failed push must restore the business record');
  assert.equal(auditEvents.some(item => item.action === 'sync_operation_accepted' && item.details.idempotency_key === 'p0-operation'), false, 'failed push must not emit an accepted audit');
  assertThrowsCode(() => host.push(device.token, [{
    workspace_id:'p0-workspace', device_id:'p0-device', idempotency_key:'p0-new-operation',
    collection:'students', record_id:'new-student', base_revision:0, patch:{ full_name:'新学生' },
  }]), 'SYNC_STATE_PERSIST_FAILED');
  assert.equal(records.has('students:new-student'), false, 'a new record written before a failed commit must be deleted during rollback');
  failPersist = false;
  assert.equal(host.push(device.token, [{
    workspace_id:'p0-workspace', device_id:'p0-device', idempotency_key:'p0-operation',
    collection:'students', record_id:'s1', base_revision:0, patch:{ class_name:'二班' },
  }]).results[0].status, 'accepted');

  const conflict = host.push(device.token, [{
    workspace_id:'p0-workspace', device_id:'p0-device', idempotency_key:'p0-conflict',
    collection:'students', record_id:'s1', base_revision:0, patch:{ class_name:'三班' },
  }]);
  assert.equal(conflict.results[0].status, 'conflict');
  const conflictId = host.listConflicts()[0].id;
  const beforeResolve = host.snapshot();
  failPersist = true;
  assertThrowsCode(() => host.resolveConflict(conflictId, { mode:'incoming' }), 'SYNC_STATE_PERSIST_FAILED');
  assert.deepEqual(host.snapshot(), beforeResolve, 'failed conflict resolution must remain open');
  assert.equal(records.get('students:s1').class_name, '二班', 'failed conflict resolution must not change the record');
  assert.equal(auditEvents.some(item => item.action === 'sync_conflict_resolved'), false, 'failed conflict resolution must not emit a resolved audit');
  failPersist = false;
  assert.equal(host.resolveConflict(conflictId, { mode:'incoming' }).status, 'resolved');
  assert.equal(records.get('students:s1').class_name, '三班');

  const beforeRevoke = host.snapshot();
  failPersist = true;
  assertThrowsCode(() => host.revokeDevice('p0-device'), 'SYNC_STATE_PERSIST_FAILED');
  assert.deepEqual(host.snapshot(), beforeRevoke, 'failed device revocation must not leave a half-revoked device');
  assert.equal(auditEvents.some(item => item.action === 'sync_device_revoked'), false, 'failed revocation must not emit a revoked audit');
  failPersist = false;
  assert.equal(host.revokeDevice('p0-device'), true);
}

async function testPairingAndTransportBoundaries() {
  const limited = v48.createSyncHost({ workspace_id:'limited', hashToken:sha256 });
  const pairing = limited.createPairingCode();
  assert.match(pairing.code, /^\d{8}$/, 'pairing codes must be eight digits');
  for (let index = 0; index < 4; index += 1) assertThrowsCode(() => limited.requestPairing({ pairing_id:pairing.pairing_id, code:'00000000', device_id:'bad-device' }), 'SYNC_PAIRING_INVALID');
  assertThrowsCode(() => limited.requestPairing({ pairing_id:pairing.pairing_id, code:'00000000', device_id:'bad-device' }), 'SYNC_PAIRING_RATE_LIMITED');
  assertThrowsCode(() => limited.requestPairing({ pairing_id:pairing.pairing_id, code:pairing.code, device_id:'bad-device' }), 'SYNC_PAIRING_RATE_LIMITED');

  const insecure = v48.createSyncClient({ base_url:'http://127.0.0.1:1234', fetch:async () => { throw new Error('must not fetch'); } });
  await assert.rejects(() => insecure.connect({ fingerprint:'aa:bb' }), error => error && error.code === 'SYNC_HTTPS_REQUIRED');
  const credentialUrl = v48.createSyncClient({ base_url:'https://user:pass@127.0.0.1:1234', fetch:async () => { throw new Error('must not fetch'); } });
  await assert.rejects(() => credentialUrl.connect({ fingerprint:'aa:bb' }), error => error && error.code === 'SYNC_BASE_URL_INVALID');
  const noFingerprint = v48.createSyncClient({
    base_url:'https://127.0.0.1:1234',
    fetch:async () => ({ ok:true, status:200, json:async () => ({ ok:true, workspace_id:'w', fingerprint:'aa:bb' }) }),
  });
  await assert.rejects(() => noFingerprint.connect(), error => error && error.code === 'SYNC_CERTIFICATE_FINGERPRINT_REQUIRED');
}

async function testTlsSanAndIpcDiagnostics() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'cwb-p0-hardening-'));
  let host;
  try {
    host = await createLanSyncHost({ dataDir:root, stateSecret:'p0-secret', host:'127.0.0.1', port:0, allowedCollections:['students'] });
    await host.start();
    const certificate = new X509Certificate(await fsp.readFile(path.join(root, 'tls', 'host-cert.pem')));
    assert.match(String(certificate.subjectAltName), /DNS:localhost/);
    assert.match(String(certificate.subjectAltName), /IP Address:127\.0\.0\.1/);
  } finally {
    if (host) await host.stop();
    await fsp.rm(root, { recursive:true, force:true });
  }

  const preload = fs.readFileSync(path.resolve(__dirname, '..', 'desktop', 'preload.cjs'), 'utf8');
  let api;
  const contextBridge = { exposeInMainWorld:(name, value) => { api = value; } };
  const ipcRenderer = { invoke:async () => { throw new Error("Error invoking remote method 'desktop:repository-put': REPOSITORY_DECRYPT_FAILED: payload cannot be decrypted"); } };
  vm.runInNewContext(preload, { require:() => ({ contextBridge, ipcRenderer }), Error, Promise, Object, String, RegExp });
  await assert.rejects(() => api.repositoryPut('students', { id:'s1' }), error => error && error.name === 'CWBDesktopError' && error.code === 'REPOSITORY_DECRYPT_FAILED');

  const main = fs.readFileSync(path.resolve(__dirname, '..', 'desktop', 'main.cjs'), 'utf8');
  assert.match(main, /function validateAttachmentId/);
  assert.match(main, /value\.includes\('\/'\)/);
  assert.match(main, /VAULT_KEY_ROLLBACK_FAILED/);
}

(async () => {
  await testTransactionalRollback();
  await testPairingAndTransportBoundaries();
  await testTlsSanAndIpcDiagnostics();
  console.log('PASS v48-p0-hardening');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
