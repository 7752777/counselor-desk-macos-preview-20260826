const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const license = require('../src/core/cwb-license.js');

function b64url(value) {
  return Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function makeToken(privateKey, overrides) {
  const payload = Object.assign({
    license_id:'lic_contract_001', product_id:'counselor-desk', plan:'ai_perpetual', major_version:4,
    device_limit:3, issued_at:'2026-08-23T00:00:00.000Z', status:'active', kid:'test-kid', workspace_id:'workspace-test',
  }, overrides || {});
  const payloadSegment = b64url(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(payloadSegment, 'utf8'), privateKey);
  return `CWB-LIC-1.${payloadSegment}.${b64url(signature)}`;
}

(async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ type:'spki', format:'der' }).toString('base64');
  const token = makeToken(privateKey);
  const parsed = license.parse(token);
  assert.equal(parsed.license_id, 'lic_contract_001');
  assert.equal(parsed.ai, true);
  assert.equal(parsed.perpetual_updates, true);
  assert.equal(await license.verifySignature(parsed, { 'test-kid':publicDer }), true);
  const browserSandbox = {
    crypto:crypto.webcrypto, TextEncoder, TextDecoder, Uint8Array, JSON, Array, Object, String, RegExp,
    atob:globalThis.atob, btoa:globalThis.btoa,
  };
  browserSandbox.globalThis = browserSandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'cwb-license.js'), 'utf8'), browserSandbox);
  assert.equal(await browserSandbox.CWBLicense.verifySignature(browserSandbox.CWBLicense.parse(token), { 'test-kid':publicDer }), true, 'browser WebCrypto must accept service standard-Base64 public keys');
  await assert.rejects(() => license.verifySignature(parsed, { 'test-kid':publicDer.slice(0, -2) }), error => error.code === 'LICENSE_SIGNATURE_INVALID');
  await assert.rejects(() => license.verifySignature(parsed, {}), error => error.code === 'LICENSE_PUBLIC_KEY_MISSING');
  await assert.rejects(() => license.verifySignature(license.parse(`${token.slice(0, token.lastIndexOf('.'))}.AAAA`), { 'test-kid':publicDer }), error => error.code === 'LICENSE_SIGNATURE_INVALID');

  assert.deepEqual(license.evaluate(parsed, { currentVersion:'4.9.0', productId:'counselor-desk', now:Date.parse('2026-08-23T12:00:00.000Z'), state:{ last_seen_at:'2026-08-23T11:00:00.000Z' } }).updates, true);
  assert.equal(license.evaluate(parsed, { currentVersion:'5.0.0', productId:'counselor-desk', now:Date.parse('2026-08-23T12:00:00.000Z') }).updates, true, 'perpetual licenses may cross major versions');
  const currentMajorToken = license.parse(makeToken(privateKey, { plan:'ai', major_version:4 }));
  assert.throws(() => license.evaluate(currentMajorToken, { currentVersion:'5.0.0', productId:'counselor-desk', now:Date.parse('2026-08-23T12:00:00.000Z') }), error => error.code === 'LICENSE_VERSION_MISMATCH');
  assert.throws(() => license.evaluate(parsed, { currentVersion:'4.9.0', productId:'counselor-desk', offline:true, now:Date.parse('2026-09-24T00:00:00.000Z'), state:{ last_online_at:'2026-08-23T00:00:00.000Z' } }), error => error.code === 'LICENSE_OFFLINE_GRACE_EXPIRED');
  assert.throws(() => license.evaluate(parsed, { currentVersion:'4.9.0', productId:'counselor-desk', now:Date.parse('2026-08-23T12:00:00.000Z'), state:{ last_seen_at:'2026-08-24T00:00:00.000Z' } }), error => error.code === 'LICENSE_CLOCK_ROLLBACK');

  let stored = null;
  const storage = { get:() => stored, set:value => { stored = value; }, remove:() => { stored = null; } };
  const calls = [];
  const manager = license.createManager({
    mode:'commercial', currentVersion:'4.9.0', publicKeys:{ 'test-kid':publicDer }, storage,
    transport:{
      activate:async input => { calls.push(['activate', input]); return { token:input.token, devices:[{ id:'device-1' }] }; },
      refresh:async input => { calls.push(['refresh', input]); return { token:input.token }; },
      deactivate:async input => { calls.push(['deactivate', input]); return { ok:true }; },
      listDevices:async () => [{ id:'device-1' }],
    },
    now:() => Date.parse('2026-08-23T12:00:00.000Z'),
  });
  await manager.ready;
  assert.equal(manager.getState().status, 'unlicensed');
  await assert.rejects(() => manager.refresh(), error => error.code === 'LICENSE_NOT_ACTIVE');
  const active = await manager.activate(token);
  assert.equal(active.license.plan, 'ai_perpetual');
  assert.equal(active.license.ai, true);
  assert.equal(active.license.perpetual_updates, true);
  assert.equal(manager.getState().token, undefined, 'public state must not expose the activation token');
  assert.equal(manager.getState().license.token, undefined, 'public license metadata must not expose the activation token');
  assert.equal(manager.getState().license.payload, undefined, 'public license metadata must not expose the signed payload');
  assert.equal(stored.token, token, 'license state is stored separately from the business workspace');
  assert.deepEqual(await manager.listDevices(), [{ id:'device-1' }]);
  await manager.refresh();
  let deactivatedDevice;
  const deviceManager = license.createManager({
    mode:'commercial', currentVersion:'4.9.0', publicKeys:{ 'test-kid':publicDer },
    storage:{ get:() => null, set:() => {}, remove:() => {} },
    transport:{
      activate:async input => ({ token:input.token }),
      deactivateDevice:async input => { deactivatedDevice = input; return { ok:true, device:{ device_id:input.target_device_id, status:'revoked' } }; },
    },
    now:() => Date.parse('2026-08-23T12:00:00.000Z'),
  });
  await deviceManager.ready;
  await deviceManager.activate(token);
  await deviceManager.deactivateDevice('device-other');
  assert.equal(deactivatedDevice.target_device_id, 'device-other');
  await manager.deactivate();
  assert.equal(manager.getState().status, 'unlicensed');
  assert.deepEqual(calls.map(item => item[0]), ['activate', 'refresh', 'deactivate']);

  let standardStored = null;
  const standardManager = license.createManager({
    mode:'commercial', currentVersion:'4.9.0', publicKeys:{ 'test-kid':publicDer },
    storage:{ get:() => standardStored, set:value => { standardStored = value; }, remove:() => { standardStored = null; } },
    transport:{ activate:async input => ({ token:input.token }) },
    now:() => Date.parse('2026-08-23T12:00:00.000Z'),
  });
  await standardManager.ready;
  const standardToken = makeToken(privateKey, { plan:'standard', ai:false, perpetual_updates:false });
  await standardManager.activate(standardToken);
  const standardEntitlements = license.createEntitlements(standardManager, { mode:'commercial' });
  assert.equal(standardEntitlements.has('ai'), false, 'standard licenses must not unlock AI');
  assert.equal(standardEntitlements.has('core_update'), true, 'standard licenses may receive current-major updates');
  assert.equal(standardEntitlements.has('perpetual_updates'), false, 'standard licenses must not receive perpetual updates');
  const mismatchedFlags = license.parse(makeToken(privateKey, { plan:'standard', ai:true, perpetual_updates:true }));
  assert.equal(mismatchedFlags.ai, false, 'redundant signed flags must not broaden the plan entitlement');
  assert.equal(mismatchedFlags.perpetual_updates, false, 'redundant signed flags must not broaden update entitlement');
  assert.throws(() => license.parse(makeToken(privateKey, { device_limit:4 })), error => error.code === 'LICENSE_INPUT_INVALID');
  assert.throws(() => license.parse(makeToken(privateKey, { device_limit:100 })), error => error.code === 'LICENSE_INPUT_INVALID');

  let offlineStored = null;
  const offlineManager = license.createManager({
    mode:'commercial', currentVersion:'4.9.0', publicKeys:{ 'test-kid':publicDer },
    storage:{ get:() => offlineStored, set:value => { offlineStored = value; }, remove:() => { offlineStored = null; } },
    transport:{
      activate:async () => { const failure = new Error('network unavailable'); failure.code = 'LICENSE_SERVICE_UNAVAILABLE'; throw failure; },
      refresh:async () => { const failure = new Error('network unavailable'); failure.code = 'LICENSE_SERVICE_UNAVAILABLE'; throw failure; },
    },
    now:() => Date.parse('2026-08-23T12:00:00.000Z'),
  });
  await offlineManager.ready;
  const offlineState = await offlineManager.activate(token);
  assert.equal(offlineState.status, 'active', 'a valid signed license can activate during a temporary service outage');
  assert.equal(offlineState.activation_mode, 'offline');
  assert.equal(offlineStored.activation_mode, 'offline');
  const refreshedOffline = await offlineManager.refresh();
  assert.equal(refreshedOffline.activation_mode, 'offline', 'refresh keeps the valid local license during a temporary outage');
  await assert.rejects(() => offlineManager.redeem(`CWB-REDEEM-1.${'a'.repeat(32)}`), error => error.code === 'LICENSE_SERVICE_UNAVAILABLE', 'redemption codes still require the service');

  const dev = license.createManager({ mode:'development', publicKeys:{}, storage:{ get:() => null, set:() => {}, remove:() => {} } });
  await dev.ready;
  assert.equal(dev.getState().status, 'development');
  console.log('PASS license-contract');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
