const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function waitForRemoval(target, timeoutMs = 20000) {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + timeoutMs;
  while (fs.existsSync(target) && Date.now() < deadline) Atomics.wait(pause, 0, 0, 100);
  return !fs.existsSync(target);
}

if (process.platform !== 'win32') {
  console.log('SKIP desktop-installer-smoke: Windows installer test only runs on Windows');
  process.exit(0);
}
const root = path.join(__dirname, '..');
const artifactDir = process.env.CWB_DESKTOP_ARTIFACT_DIR || path.join(root, 'output', 'desktop');
const installer = fs.existsSync(artifactDir) && fs.readdirSync(artifactDir).map(name => path.join(artifactDir, name))
  .find(file => /counselor-desk-.*-x64\.exe$/i.test(file));
if (!installer || !fs.existsSync(installer)) {
  if (process.env.CWB_REQUIRE_ARTIFACTS === '1') throw new Error(`desktop-installer-smoke: x64 NSIS installer is not present in ${artifactDir}`);
  console.log('SKIP desktop-installer-smoke: NSIS installer is not present');
  process.exit(0);
}
const installDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-installer-smoke-'));
const appDataRoot = process.env.APPDATA || os.tmpdir();
const userData = path.join(appDataRoot, 'Counselor Desk');
if (fs.existsSync(userData) && process.env.CWB_ALLOW_REAL_APPDATA !== '1') {
  if (process.env.CWB_REQUIRE_ARTIFACTS === '1') {
    throw new Error(`desktop-installer-smoke requires a clean CI user-data root: ${userData}`);
  }
  console.log(`SKIP desktop-installer-smoke: refusing to alter existing user data at ${userData}; run on a clean CI account`);
  try { fs.rmSync(installDir, { recursive:true, force:true, maxRetries:10, retryDelay:500 }); } catch (_) {}
  process.exit(0);
}
try {
  // In CI this is a clean Windows account. NSIS and Electron then exercise the
  // same real user-data root, including both uninstall choices.
  const smokeEnv = Object.assign({}, process.env, { CWB_DESKTOP_USER_DATA:userData });
  const install = spawnSync(installer, ['/S', `/D=${installDir}`], { env:smokeEnv, encoding:'utf8', timeout:180000 });
  assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);
  const installEntries = fs.readdirSync(installDir);
  const executable = installEntries.map(name => path.join(installDir, name)).find(file => /counselor-desk\.exe$/i.test(file));
  assert.ok(executable, 'NSIS installation should contain the ASCII-safe application executable');
  const smoke = spawnSync(executable, ['--no-sandbox'], { env:Object.assign({}, smokeEnv, { CWB_DESKTOP_SMOKE:'1' }), encoding:'utf8', timeout:120000 });
  assert.equal(smoke.status, 0, `${smoke.stdout}\n${smoke.stderr}`);
  assert.match(`${smoke.stdout}\n${smoke.stderr}`, /"schemaVersion":8/);
  assert.ok(fs.existsSync(path.join(userData, 'counselor-v4.sqlite')), 'installer smoke must create desktop SQLite data');
  const uninstaller = installEntries.map(name => path.join(installDir, name)).find(file => /^Uninstall .*\.exe$/i.test(path.basename(file)));
  assert.ok(fs.existsSync(uninstaller), 'NSIS uninstaller should be installed');
  const uninstallKeep = spawnSync(uninstaller, ['/S'], { env:smokeEnv, encoding:'utf8', timeout:180000 });
  assert.equal(uninstallKeep.status, 0, `${uninstallKeep.stdout}\n${uninstallKeep.stderr}`);
  assert.ok(fs.existsSync(path.join(userData, 'counselor-v4.sqlite')), 'silent uninstall must retain user data by default');

  const reinstall = spawnSync(installer, ['/S', `/D=${installDir}`], { env:smokeEnv, encoding:'utf8', timeout:180000 });
  assert.equal(reinstall.status, 0, `${reinstall.stdout}\n${reinstall.stderr}`);
  const deleteUninstaller = fs.readdirSync(installDir).map(name => path.join(installDir, name)).find(file => /^Uninstall .*\.exe$/i.test(path.basename(file)));
  assert.ok(deleteUninstaller, 'reinstalled NSIS package should contain an uninstaller');
  const uninstallDelete = spawnSync(deleteUninstaller, ['/S', '/DELETEUSERDATA=1'], { env:smokeEnv, encoding:'utf8', timeout:180000 });
  assert.equal(uninstallDelete.status, 0, `${uninstallDelete.stdout}\n${uninstallDelete.stderr}`);
  assert.ok(waitForRemoval(userData), 'explicit /DELETEUSERDATA uninstall must remove data and attachments within the smoke timeout');
  console.log('PASS desktop-installer-smoke');
} finally {
  try { fs.rmSync(installDir, { recursive:true, force:true, maxRetries:10, retryDelay:500 }); }
  catch (_) { console.warn(`installer smoke temp directory remains locked: ${installDir}`); }
}
