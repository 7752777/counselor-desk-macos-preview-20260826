const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSqliteStore } = require('../desktop/sqlite-store.cjs');
const vault = require('../desktop/vault.cjs');
const recovery = require('../desktop/recovery-kit.cjs');
const { activateDataDirectory } = require('../desktop/data-directory.cjs');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.cjs'), 'utf8');
const lanSync = fs.readFileSync(path.join(root, 'desktop', 'lan-sync.cjs'), 'utf8');
const vaultSource = fs.readFileSync(path.join(root, 'desktop', 'vault.cjs'), 'utf8');
const recoverySource = fs.readFileSync(path.join(root, 'desktop', 'recovery-kit.cjs'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');

for (const token of [
  'desktop:repository-health',
  'REPOSITORY_DECRYPT_FAILED',
  'REPOSITORY_CORRUPTED',
  'desktop:export-recovery-kit',
  'desktop:restore-recovery-kit',
  'desktop:migrate-data-folder',
  'verifyPayloads:true',
  'verifyPlatformSignature',
  'update-install-state.json',
  'rollbackUpdateRecoveryPoint',
]) assert.ok(main.includes(token), `main contract missing ${token}`);
for (const token of ['desktop:get-license-state', 'desktop:set-license-state', 'desktop:delete-license-state', 'desktop:license-request', 'license-state.bin', 'licenseServiceTarget']) assert.ok(main.includes(token), `license IPC contract missing ${token}`);
for (const token of ['SAFE_STORAGE_UNAVAILABLE', 'VAULT_KEY_DECRYPT_FAILED', 'VAULT_KEY_FORMAT_INVALID', 'atomicWriteFile', 'loadOrCreateVaultKey']) assert.ok(vaultSource.includes(token), `vault contract missing ${token}`);
for (const token of ['argon2id', 'RECOVERY_PASSWORD_INVALID', 'RECOVERY_KDF_UNAVAILABLE']) assert.ok(recoverySource.includes(token), `recovery contract missing ${token}`);
for (const token of ['repositoryHealth', 'exportRecoveryKit', 'restoreRecoveryKit', 'getDataLocation', 'migrateDataFolder', 'lanSyncPauseDevice', 'lanSyncResumeDevice', 'getLicenseState', 'setLicenseState', 'deleteLicenseState', 'licenseRequest']) assert.ok(preload.includes(token), `preload contract missing ${token}`);
for (const token of ['https.createServer', 'TLSv1.2', '/api/v1/pairing/request', '/api/v1/pairing/result', '/api/v1/sync/push', '/api/v1/attachments/chunk', 'SYNC_STATE_DECRYPT_FAILED']) assert.ok(lanSync.includes(token), `LAN sync contract missing ${token}`);
assert.match(builder, /oneClick:\s*false/);
assert.match(builder, /allowToChangeInstallationDirectory:\s*true/);
assert.match(builder, /include: desktop\/installer\.nsh/);

function fakeSafeStorage() {
  return {
    isEncryptionAvailable:() => true,
    encryptString:value => Buffer.from(`safe:${value}`, 'utf8'),
    decryptString:payload => {
      const value = Buffer.from(payload).toString('utf8');
      if (!value.startsWith('safe:')) throw new Error('safe-storage-decrypt-failed');
      return value.slice(5);
    },
  };
}

(async () => {
  const safeStorage = fakeSafeStorage();
  const raw = Buffer.alloc(32, 7).toString('base64');
  const envelope = vault.encodeVaultKey(raw, safeStorage);
  assert.equal(vault.decodeVaultKey(envelope, safeStorage), raw);
  assert.equal(vault.parseEnvelope(envelope).envelope.version, 1);
  assert.throws(() => vault.decodeVaultKey(Buffer.from(JSON.stringify({ format:'cwb-vault-key', version:1, algorithm:'electron-safe-storage', payload:'broken' })), safeStorage), /VAULT_KEY_FORMAT_INVALID/);

  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cwb-desktop-contract-'));
  try {
    const keyPath = path.join(dir, 'vault', 'key.bin');
    const corrupt = Buffer.from('{"format":"cwb-vault-key","version":1,"algorithm":"electron-safe-storage","payload":"broken"}', 'utf8');
    await fsp.mkdir(path.dirname(keyPath), { recursive:true });
    await fsp.writeFile(keyPath, corrupt);
    await assert.rejects(() => vault.loadOrCreateVaultKey({ keyPath, safeStorage }), error => error.code === 'VAULT_KEY_FORMAT_INVALID');
    assert.deepEqual(await fsp.readFile(keyPath), corrupt, 'corrupt key must never be replaced by a new key');

    const dbPath = path.join(dir, 'records.sqlite');
    const store = createSqliteStore(dbPath, () => raw);
    assert.ok(store, 'node:sqlite is required for the desktop contract');
    store.put('records_students', { id:'s1', full_name:'甲' });
    assert.equal(store.health({ verifyPayloads:true }).encrypted_records, 1);
    store.close();
    const wrongKeyProbe = spawnSync(process.execPath, ['-e', `const s=require(${JSON.stringify(path.join(root, 'desktop', 'sqlite-store.cjs'))}).createSqliteStore(${JSON.stringify(dbPath)},()=>Buffer.alloc(32,8).toString('base64')); try{s.health({verifyPayloads:true});process.exit(1)}catch(e){process.exitCode=e.code==='REPOSITORY_DECRYPT_FAILED'?0:2}finally{s.close()}`], { encoding:'utf8' });
    assert.equal(wrongKeyProbe.status, 0, wrongKeyProbe.stderr || wrongKeyProbe.stdout);

    const kit = await recovery.createRecoveryKit(raw, 'correct-recovery-password', { params:{ iterations:2, memorySize:32768 } });
    assert.equal(kit.kdf, 'argon2id');
    assert.equal(await recovery.recoverMasterKey(kit, 'correct-recovery-password'), raw);
    await assert.rejects(() => recovery.recoverMasterKey(kit, 'wrong-recovery-password'), error => error.code === 'RECOVERY_PASSWORD_INVALID');

    const paths = [];
    const state = { currentStore:null, userData:dir };
    const oldStore = { closed:false, close() { this.closed = true; } };
    const makeStore = file => {
      paths.push(file);
      if (file.includes('new-data')) return { health:async () => { throw Object.assign(new Error('candidate-decrypt-failed'), { code:'REPOSITORY_DECRYPT_FAILED' }); }, close() {} };
      return { health:async () => ({ ok:true }), close() {} };
    };
    await assert.rejects(() => activateDataDirectory({
      current:dir,
      requested:path.join(dir, 'new-data'),
      oldStore,
      setUserData:value => { state.userData = value; },
      setStore:value => { state.currentStore = value; },
      createStore:makeStore,
    }), error => error.code === 'DATA_MIGRATION_ACTIVATION_FAILED');
    assert.equal(oldStore.closed, true, 'migration closes the old store before activation');
    assert.equal(state.userData, dir, 'activation failure restores the original data directory');
    assert.ok(state.currentStore, 'activation failure restores a verified original store');
    assert.ok(paths.some(file => file.endsWith(path.join('new-data', 'counselor-v4.sqlite'))));

    const rollbackState = { currentStore:null, userData:dir };
    await assert.rejects(() => activateDataDirectory({
      current:dir,
      requested:path.join(dir, 'new-data'),
      oldStore:{ close() {} },
      setUserData:value => { rollbackState.userData = value; },
      setStore:value => { rollbackState.currentStore = value; },
      createStore:file => ({ health:async () => { if (file.includes('new-data') || file.includes('counselor-v4.sqlite')) throw new Error('store-unavailable'); }, close() {} }),
    }), error => error.code === 'DATA_MIGRATION_ROLLBACK_FAILED');
    assert.equal(rollbackState.currentStore, null, 'rollback failure leaves no active store to prevent further writes');
  } finally {
    await fsp.rm(dir, { recursive:true, force:true });
  }
  console.log('PASS desktop-contract');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
