const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createElectronUpdateRuntime } = require('../desktop/update-runtime.cjs');
const update = require('../src/core/cwb-update.js');
const license = require('../src/core/cwb-license.js');
global.CWBLicense = license;

function fakeUpdater() {
  const handlers = {};
  return {
    autoDownload:true, autoInstallOnAppQuit:true,
    on:(event, handler) => { handlers[event] = handler; },
    setFeedURL:options => { this.feed = options; },
    checkForUpdates:async () => { handlers['update-available']({ version:'4.9.1' }); return { updateInfo:{ version:'4.9.1' } }; },
    downloadUpdate:async () => { handlers['update-downloaded']({ version:'4.9.1' }); },
    quitAndInstall:(isSilent, isForceRunAfter) => { assert.equal(isSilent, false); assert.equal(isForceRunAfter, true); },
  };
}

(async () => {
  const updater = fakeUpdater(); let recoveryPoints = 0;
  const runtime = createElectronUpdateRuntime({ currentVersion:'4.9.0', autoUpdater:updater, createRecoveryPoint:async () => { recoveryPoints += 1; } });
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  const checked = await runtime.check();
  assert.equal(checked.updateInfo.version, '4.9.1');
  await runtime.download();
  assert.equal(runtime.status().status, 'downloaded');
  await runtime.install();
  assert.equal(recoveryPoints, 1);
  assert.equal(runtime.status().status, 'installing');

  const updateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-update-runtime-'));
  try {
    const packagePath = path.join(updateDir, 'counselor-desk-update.exe');
    const packageBytes = Buffer.from('signed desktop update package', 'utf8');
    fs.writeFileSync(packagePath, packageBytes);
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const publicDer = publicKey.export({ type:'spki', format:'der' }).toString('base64');
    const manifest = {
      format:update.MANIFEST_FORMAT, version:'4.9.1', channel:'stable', key_id:'update-runtime-kid', manifest_signature:'',
      platforms:[{ platform:'win32', arch:'x64', url:'https://updates.example.test/counselor-desk-update.exe', sha256:crypto.createHash('sha256').update(packageBytes).digest('hex'), signature:'package-signature' }],
    };
    manifest.manifest_signature = crypto.sign(null, Buffer.from(update.manifestSigningBytes(manifest)), privateKey).toString('base64url');
    const handlers = {};
    const signedUpdater = {
      autoDownload:true, autoInstallOnAppQuit:true,
      on:(event, handler) => { handlers[event] = handler; },
      setFeedURL:() => {},
      checkForUpdates:async () => { handlers['update-available']({ version:'4.9.1' }); return { updateInfo:{ version:'4.9.1' } }; },
      downloadUpdate:async () => { handlers['update-downloaded']({ version:'4.9.1', downloadedFile:packagePath }); return [packagePath]; },
      quitAndInstall:() => {},
    };
    const signedRuntime = createElectronUpdateRuntime({
      currentVersion:'4.9.0', platform:'win32', arch:'x64', autoUpdater:signedUpdater,
      feedUrl:'https://updates.example.test/feed', fetchManifest:async () => manifest,
      requireManifestSignature:true, manifestPublicKeys:{ 'update-runtime-kid':publicDer }, requirePackageHash:true,
      requirePlatformSignature:true, verifyDownloadedPackage:async () => true,
      requireRecoveryPoint:true, createRecoveryPoint:async () => ({ ok:true, path:path.join(updateDir, 'recovery') }),
    });
    await signedRuntime.check();
    await signedRuntime.download();
    assert.equal(signedRuntime.status().downloaded_sha256, manifest.platforms[0].sha256);
    const installed = await signedRuntime.install();
    assert.equal(installed.recovery_point.ok, true);
  } finally {
    fs.rmSync(updateDir, { recursive:true, force:true });
  }
  const unavailable = createElectronUpdateRuntime({ currentVersion:'4.9.0' });
  await assert.rejects(() => unavailable.check(), error => error.code === 'UPDATE_RUNTIME_UNAVAILABLE');
  console.log('PASS update-runtime');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
