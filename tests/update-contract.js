const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const update = require('../src/core/cwb-update.js');
const license = require('../src/core/cwb-license.js');

(async () => {
  const bytes = Buffer.from('cwb update package contract', 'utf8');
  const hash = await update.sha256(bytes);
  const manifest = {
    format:update.MANIFEST_FORMAT, version:'4.9.1', channel:'stable', key_id:'test-key', manifest_signature:'test-signature',
    platforms:[{ platform:'win32', arch:'x64', url:'https://updates.example.test/cwb-4.9.1-win-x64.exe', sha256:hash, signature:'package-signature', required_entitlement:'core_update' }],
  };
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ type:'spki', format:'der' }).toString('base64');
  manifest.manifest_signature = Buffer.from(crypto.sign(null, Buffer.from(update.manifestSigningBytes(manifest)), privateKey)).toString('base64url');
  manifest.key_id = 'test-key';
  global.CWBLicense = license;
  const normalized = update.normalizeManifest(manifest);
  assert.equal(normalized.version, '4.9.1');
  assert.equal(update.compareVersions('4.9.1', '4.9.0'), 1);
  assert.equal(update.compareVersions('4.9.0', '4.9.0'), 0);
  assert.equal(update.compareVersions('4.8.9', '4.9.0'), -1);
  assert.equal(update.selectPackage(normalized, 'win32', 'x64').sha256, hash);
  assert.equal(await update.verifyManifestSignature(manifest, { 'test-key':publicDer }), true);
  assert.throws(() => update.normalizeManifest({ ...manifest, platforms:[{ ...manifest.platforms[0], url:'http://unsafe.test/pkg' }] }), error => error.code === 'UPDATE_URL_INVALID');
  assert.throws(() => update.normalizeManifest({ ...manifest, platforms:[{ ...manifest.platforms[0], sha256:'bad' }] }), error => error.code === 'UPDATE_HASH_INVALID');

  const manager = update.createManager({
    currentVersion:'4.8.5', platform:'win32', arch:'x64',
    transport:{
      fetchManifest:async () => manifest,
      download:async (_pkg, options) => { options.onProgress(0.5); options.onProgress(1); return { bytes, path:'C:/temp/cwb-update.exe' }; },
      install:async (_pkg, options) => { assert.equal(typeof options.createRecoveryPoint, 'function'); return { ok:true, restarted:false }; },
    },
    requireEntitlement:feature => assert.equal(feature, 'core_update'),
    createRecoveryPoint:async () => ({ id:'recovery-1' }),
  });
  const available = await manager.check();
  assert.equal(available.package.platform, 'win32');
  const downloaded = await manager.download();
  assert.equal(downloaded.path, 'C:/temp/cwb-update.exe');
  assert.equal(manager.status().status, 'downloaded');
  const installed = await manager.install();
  assert.deepEqual(installed, { ok:true, restarted:false });
  assert.equal(manager.status().status, 'installed');

  let entitlementFetches = 0;
  const lockedManager = update.createManager({
    currentVersion:'4.8.5', platform:'win32', arch:'x64',
    requireEntitlement:() => { const failure = new Error('LICENSE_REQUIRED'); failure.code = 'LICENSE_REQUIRED'; throw failure; },
    transport:{ fetchManifest:async () => { entitlementFetches += 1; return manifest; } },
  });
  await assert.rejects(() => lockedManager.check(), error => error.code === 'LICENSE_REQUIRED');
  assert.equal(entitlementFetches, 0, 'update manifests must not be fetched before entitlement is accepted');

  const bad = update.createManager({ currentVersion:'4.8.5', platform:'win32', arch:'x64', transport:{ download:async () => ({ bytes:Buffer.from('tampered') }) } });
  await bad.check(manifest);
  await assert.rejects(() => bad.download(), error => error.code === 'UPDATE_HASH_MISMATCH');
  assert.equal(bad.status().status, 'error');
  const signedManager = update.createManager({ currentVersion:'4.8.5', platform:'win32', arch:'x64', requireSignature:true, publicKeys:{ 'test-key':publicDer }, transport:{ fetchManifest:async () => manifest } });
  assert.ok(await signedManager.check());
  console.log('PASS update-contract');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
