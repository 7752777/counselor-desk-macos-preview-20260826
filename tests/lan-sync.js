const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { createLanSyncHost, encryptState, decryptState } = require('../desktop/lan-sync.cjs');

function request(port, requestPath, options) {
  const opts = options || {};
  const body = opts.body == null ? null : (Buffer.isBuffer(opts.body) ? opts.body : Buffer.from(JSON.stringify(opts.body), 'utf8'));
  const headers = Object.assign({}, opts.headers || {}, body ? { 'content-length':body.length } : {});
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (body && !Buffer.isBuffer(opts.body)) headers['content-type'] = 'application/json';
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname:'127.0.0.1', port, path:requestPath, method:opts.method || 'GET', rejectUnauthorized:false, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed = null;
        try { parsed = JSON.parse(raw.toString('utf8')); } catch (_) {}
        resolve({ status:response.statusCode, body:parsed, raw });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'cwb-lan-sync-'));
  const secret = Buffer.alloc(32, 4).toString('base64');
  const state = { devices:[{ id:'persisted' }] };
  const encoded = encryptState(state, secret);
  assert.deepEqual(decryptState(encoded, secret), state);
  assert.throws(() => decryptState(encoded, Buffer.alloc(32, 5).toString('base64')), /SYNC_STATE_DECRYPT_FAILED/);
  let host;
  let restarted;
  const records = new Map();
  const auditEvents = [];
  try {
    host = await createLanSyncHost({ dataDir:root, stateSecret:secret, workspace_id:'w1', host:'127.0.0.1', port:0, allowedCollections:['students'], audit:(action, details) => auditEvents.push({ action, details }), recordStore:{ get:(collection, id) => records.get(id) || null, put:(collection, record) => { records.set(record.id, record); return record; } } });
    const started = await host.start();
    assert.equal(started.running, true);
    assert.match(started.fingerprint, /^[0-9a-f:]+$/);

    const health = await request(started.port, '/api/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.data_schema_version, 11);

    const pairing = host.createPairingCode();
    const pairingRequest = await request(started.port, '/api/v1/pairing/request', { method:'POST', body:{ pairing_id:pairing.pairing_id, code:pairing.code, device_id:'phone-1', device_name:'手机' } });
    assert.equal(pairingRequest.status, 200);
    const pendingPairing = await request(started.port, `/api/v1/pairing/result?request_id=${encodeURIComponent(pairingRequest.body.request.id)}&device_id=phone-1`);
    assert.equal(pendingPairing.body.result.status, 'pending');
    const confirmed = await request(started.port, '/api/v1/pairing/confirm', { method:'POST', headers:{ 'x-cwb-host-token':started.admin_token }, body:{ request_id:pairingRequest.body.request.id, approve:true } });
    assert.equal(confirmed.status, 200);
    const token = confirmed.body.result.device.token;
    const secondPairing = host.createPairingCode();
    const secondRequest = await request(started.port, '/api/v1/pairing/request', { method:'POST', body:{ pairing_id:secondPairing.pairing_id, code:secondPairing.code, device_id:'desktop-2', device_name:'第二设备' } });
    const secondConfirmed = await request(started.port, '/api/v1/pairing/confirm', { method:'POST', headers:{ 'x-cwb-host-token':started.admin_token }, body:{ request_id:secondRequest.body.request.id, approve:true } });
    const secondToken = secondConfirmed.body.result.device.token;
    const delivered = await request(started.port, `/api/v1/pairing/result?request_id=${encodeURIComponent(pairingRequest.body.request.id)}&device_id=phone-1`);
    assert.equal(delivered.body.result.token, token, 'client can retrieve its one-time token after host approval');
    const consumed = await request(started.port, `/api/v1/pairing/result?request_id=${encodeURIComponent(pairingRequest.body.request.id)}&device_id=phone-1`);
    assert.equal(consumed.body.result.token_available, false, 'pairing token delivery is one-time');
    const publicHealth = await request(started.port, '/api/v1/health');
    assert.equal(Object.prototype.hasOwnProperty.call(publicHealth.body.status.devices[0], 'token_hash'), false, 'health must not expose token verifiers');
    const manifest = await request(started.port, '/api/v1/workspace/manifest', { token });
    assert.equal(manifest.status, 200);
    assert.deepEqual(manifest.body.collections, ['students']);
    assert.equal(manifest.body.fingerprint, started.fingerprint, 'manifest must expose the TLS fingerprint required by clients');

    const pushed = await request(started.port, '/api/v1/sync/push', { method:'POST', token, body:{ operations:[{ workspace_id:'w1', device_id:'phone-1', idempotency_key:'op-1', collection:'students', record_id:'s1', base_revision:0, patch:{ class_name:'一班' } }] } });
    assert.equal(pushed.status, 200);
    assert.equal(pushed.body.results[0].status, 'accepted');
    assert.equal(records.get('s1').class_name, '一班', 'HTTP sync writes the attached business repository');
    assert.equal(records.get('s1').student_id, 's1', 'HTTP sync must preserve the student record stable ID');
    const invalidStudentIdentity = await request(started.port, '/api/v1/sync/push', { method:'POST', token, body:{ operations:[{ workspace_id:'w1', device_id:'phone-1', idempotency_key:'op-invalid-student-id', collection:'students', record_id:'s1', base_revision:1, patch:{ student_id:'s2' } }] } });
    assert.equal(invalidStudentIdentity.status, 400);
    assert.equal(invalidStudentIdentity.body.code, 'SYNC_STUDENT_ID_IMMUTABLE');
    assert.equal(records.get('s1').student_id, 's1', 'invalid stable ID updates must not alter the repository');
    const duplicate = await request(started.port, '/api/v1/sync/push', { method:'POST', token, body:{ operations:[{ workspace_id:'w1', device_id:'phone-1', idempotency_key:'op-1', collection:'students', record_id:'s1', base_revision:0, patch:{ class_name:'一班' } }] } });
    assert.equal(duplicate.body.results[0].status, 'duplicate');
    assert.equal((await request(started.port, '/api/v1/sync/pull', { method:'POST', token, body:{ cursor:0 } })).body.operations.length, 1);

    const bytes = Buffer.from('attachment-content');
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const init = await request(started.port, '/api/v1/attachments/init', { method:'POST', token, body:{ attachment_id:'photo-1', size:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex') } });
    assert.equal(init.status, 200);
    const uploadId = init.body.upload.upload_id;
    const chunk = await request(started.port, `/api/v1/attachments/chunk?upload_id=${uploadId}&offset=0`, { method:'PUT', token, body:bytes });
    assert.equal(chunk.status, 200, JSON.stringify(chunk.body));
    const chunkMeta = JSON.parse(await fsp.readFile(path.join(root, 'attachments', '.sync-uploads', `${uploadId}.json`), 'utf8'));
    assert.deepEqual(chunkMeta.received, [[0, bytes.length]], JSON.stringify(chunkMeta));
    const complete = await request(started.port, '/api/v1/attachments/complete', { method:'POST', token, body:{ upload_id:uploadId } });
    assert.equal(complete.status, 200, JSON.stringify(complete.body));
    assert.notEqual(fs.readFileSync(path.join(root, 'attachments', 'photo-1.bin')).toString(), bytes.toString(), 'attachments must not be stored as plaintext');
    assert.equal((await request(started.port, '/api/v1/attachments/photo-1', { token })).status, 200);
    assert.deepEqual((await request(started.port, '/api/v1/attachments/photo-1', { token })).raw, bytes, 'authorized download must decrypt the attachment');
    assert.equal((await request(started.port, '/api/v1/attachments/photo-1', { token:'wrong-token' })).status, 401, 'attachment download must authenticate the device');
    assert.equal((await request(started.port, '/api/v1/attachments/init', { method:'POST', token:'wrong-token', body:{ attachment_id:'not-authorized', size:bytes.length, sha256:digest } })).status, 401, 'attachment init must authenticate the device');
    const stagedBytes = Buffer.from('staged-secret-attachment');
    const stagedHash = crypto.createHash('sha256').update(stagedBytes).digest('hex');
    const stagedInit = await request(started.port, '/api/v1/attachments/init', { method:'POST', token, body:{ attachment_id:'photo-staged', size:stagedBytes.length, sha256:stagedHash } });
    const stagedUploadId = stagedInit.body.upload.upload_id;
    const otherDeviceInit = await request(started.port, '/api/v1/attachments/init', { method:'POST', token:secondToken, body:{ attachment_id:'photo-staged', size:stagedBytes.length, sha256:stagedHash } });
    assert.notEqual(otherDeviceInit.body.upload.upload_id, stagedUploadId, 'an upload task must not be reused across devices');
    assert.equal((await request(started.port, `/api/v1/attachments/chunk?upload_id=${stagedUploadId}&offset=0`, { method:'PUT', token:secondToken, body:stagedBytes })).status, 403, 'another device cannot append to an upload task');
    assert.equal((await request(started.port, '/api/v1/attachments/complete', { method:'POST', token:secondToken, body:{ upload_id:stagedUploadId } })).status, 403, 'another device cannot complete an upload task');
    assert.equal((await request(started.port, `/api/v1/attachments/chunk?upload_id=${stagedUploadId}&offset=0`, { method:'PUT', token, body:stagedBytes })).status, 200);
    const stagedChunkDir = path.join(root, 'attachments', '.sync-uploads', `${stagedUploadId}.chunks`);
    const stagedChunkFiles = await fsp.readdir(stagedChunkDir);
    assert.ok(stagedChunkFiles.length > 0, 'interrupted upload keeps an encrypted chunk file for resume');
    assert.notEqual((await fsp.readFile(path.join(stagedChunkDir, stagedChunkFiles[0]))).toString(), stagedBytes.toString(), 'temporary upload chunks must not be stored as plaintext');
    const gapBytes = Buffer.from('gap-resume-attachment');
    const gapHash = crypto.createHash('sha256').update(gapBytes).digest('hex');
    const gapInit = await request(started.port, '/api/v1/attachments/init', { method:'POST', token, body:{ attachment_id:'photo-gap', size:gapBytes.length, sha256:gapHash } });
    const gapUploadId = gapInit.body.upload.upload_id;
    assert.equal((await request(started.port, `/api/v1/attachments/chunk?upload_id=${gapUploadId}&offset=5`, { method:'PUT', token, body:gapBytes.subarray(5) })).status, 200);
    const gapResume = await request(started.port, '/api/v1/attachments/init', { method:'POST', token, body:{ attachment_id:'photo-gap', size:gapBytes.length, sha256:gapHash } });
    assert.equal(gapResume.body.upload.offset, 0, 'resuming a non-contiguous upload must return the first missing offset');
    assert.equal((await request(started.port, `/api/v1/attachments/chunk?upload_id=${gapUploadId}&offset=0`, { method:'PUT', token, body:gapBytes.subarray(0, 5) })).body.upload.offset, gapBytes.length);
    assert.equal((await request(started.port, '/api/v1/attachments/complete', { method:'POST', token, body:{ upload_id:gapUploadId } })).status, 200);
    assert.deepEqual((await request(started.port, '/api/v1/attachments/photo-gap', { token })).raw, gapBytes, 'out-of-order encrypted chunks must reassemble correctly');
    assert.ok(auditEvents.some(item => item.action === 'sync_operation_accepted'));
    assert.ok(auditEvents.some(item => item.action === 'sync_attachment_completed'));
    assert.ok(!auditEvents.some(item => Object.prototype.hasOwnProperty.call(item.details, 'patch')));

    await host.stop();
    restarted = await createLanSyncHost({ dataDir:root, stateSecret:secret, workspace_id:'w1', host:'127.0.0.1', port:0, allowedCollections:['students'], recordStore:{ get:(collection, id) => records.get(id) || null, put:(collection, record) => { records.set(record.id, record); return record; } } });
    const restartedInfo = await restarted.start();
    const resumedInit = await request(restartedInfo.port, '/api/v1/attachments/init', { method:'POST', token, body:{ attachment_id:'photo-staged', size:stagedBytes.length, sha256:stagedHash } });
    assert.equal(resumedInit.body.upload.upload_id, stagedUploadId, 'interrupted upload metadata survives a host restart');
    assert.equal(resumedInit.body.upload.offset, stagedBytes.length, 'resumed upload returns the contiguous offset after restart');
    const legacyBytes = Buffer.from('legacy-plaintext-candidate');
    const legacyPath = path.join(root, 'attachments', 'legacy-attachment.bin');
    await fsp.writeFile(legacyPath, legacyBytes);
    assert.deepEqual((await request(restartedInfo.port, '/api/v1/attachments/legacy-attachment', { token })).raw, legacyBytes, 'legacy attachment remains readable during compatibility upgrade');
    assert.notEqual((await fsp.readFile(legacyPath)).toString(), legacyBytes.toString(), 'legacy plaintext attachment is re-encrypted before download completes');
    const persistedManifest = await request(restartedInfo.port, '/api/v1/workspace/manifest', { token });
    assert.equal(persistedManifest.status, 200, 'paired device remains authorized after host restart');
    const unauthorized = await request(restartedInfo.port, '/api/v1/workspace/manifest', { token:'wrong-token' });
    assert.equal(unauthorized.status, 401);
    assert.ok((await request(restartedInfo.port, '/api/v1/sync/pull', { method:'POST', token, body:{ cursor:0 } })).body.operations.length >= 1);
    console.log('PASS lan-sync');
  } finally {
    if (restarted) await restarted.stop();
    if (host) await host.stop();
    await fsp.rm(root, { recursive:true, force:true });
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
