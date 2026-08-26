const assert = require('node:assert/strict');
const { createPairingQrPayload, parsePairingQrPayload } = require('../src/core/cwb-v48.js');

const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
const input = {
  host:'https://192.168.1.20:43123',
  workspace_id:'workspace-local',
  pairing_id:'pairing_1234567890',
  code:'12345678',
  fingerprint:'AA:BB:CC:DD:EE:FF',
  expires_at:expiresAt,
  token:'must-not-be-included',
  token_hash:'must-not-be-included',
  student_id:'must-not-be-included',
};

const created = createPairingQrPayload(input);
assert.equal(created.version, 1);
assert.match(created.payload, /^cwb:\/\/lan-pair\/?\?/);
assert.ok(created.payload.includes('host=https%3A%2F%2F192.168.1.20%3A43123'));
assert.ok(!created.payload.includes('token'));
assert.ok(!created.payload.includes('student_id'));
assert.deepEqual(parsePairingQrPayload(created.payload), {
  version:1,
  host:'https://192.168.1.20:43123',
  workspace_id:'workspace-local',
  pairing_id:'pairing_1234567890',
  code:'12345678',
  fingerprint:'aa:bb:cc:dd:ee:ff',
  expires_at:expiresAt,
});

assert.throws(() => createPairingQrPayload(Object.assign({}, input, { host:'http://192.168.1.20:43123' })), /SYNC_PAIRING_QR_HOST_INVALID/);
assert.throws(() => createPairingQrPayload(Object.assign({}, input, { code:'1234567' })), /SYNC_PAIRING_QR_CODE_INVALID/);
assert.throws(() => createPairingQrPayload(Object.assign({}, input, { expires_at:new Date(Date.now() - 1000).toISOString() })), /SYNC_PAIRING_QR_EXPIRED/);
assert.throws(() => parsePairingQrPayload(`${created.payload}&token=secret`), /SYNC_PAIRING_QR_FIELD_INVALID/);
assert.throws(() => parsePairingQrPayload(created.payload.replace('cwb://lan-pair?', 'cwb://lan-pair/untrusted/?')), /SYNC_PAIRING_QR_FORMAT_INVALID/);
console.log('PASS v48-pairing-qr');
