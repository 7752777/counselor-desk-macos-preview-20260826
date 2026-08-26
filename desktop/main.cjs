const { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSqliteStore } = require('./sqlite-store.cjs');
const { migrateLegacyDesktopData } = require('./data-migration.cjs');
const { resolveDataTarget } = require('./data-target.cjs');
const { activateDataDirectory } = require('./data-directory.cjs');
const { CWBCollections } = require('../src/core/cwb-collections.js');
const { codedError, loadOrCreateVaultKey, writeVaultKey, atomicWriteFile } = require('./vault.cjs');
const { createRecoveryKit, recoverMasterKey } = require('./recovery-kit.cjs');
const { createLanSyncHost } = require('./lan-sync.cjs');
const { createElectronUpdateRuntime } = require('./update-runtime.cjs');
const { createUpdateScheduler } = require('./update-scheduler.cjs');
const { verifyPlatformSignature } = require('./platform-signature.cjs');
const { validateLicenseState } = require('./license-state.cjs');
const desktopConfig = require('./runtime-config.cjs');
const { createPairingQrPayload } = require('../src/core/cwb-v48.js');
const licenseCore = require('../src/core/cwb-license.js');
const QRCode = require('qrcode');

const APP_VERSION = require('../package.json').version;
const APP_IDENTITY = 'Counselor Desk';

// Keep the established v4 user-data root stable across package upgrades.
app.setName(APP_IDENTITY);
if (process.env.CWB_DESKTOP_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.CWB_DESKTOP_USER_DATA));
}
let mainWindow;
let sqliteStore;
let vaultKeyCache;
let lanSyncHost;
let updateRuntime;
let updateScheduler;
let quitting = false;

function repositoryError(error) {
  if (error && /^SAFE_STORAGE_|^VAULT_|^REPOSITORY_/.test(String(error.code || ''))) return error;
  const message = String(error && error.message || error || 'repository operation failed');
  if (/database disk image is malformed|not a database|malformed database|SQLITE_CORRUPT|SQLITE_NOTADB|WAL/i.test(message)) {
    return codedError('REPOSITORY_CORRUPTED', '本地 SQLite 数据库或 WAL 文件损坏；请打开数据修复向导，不要删除或覆盖原数据', error);
  }
  if (/SQLITE_RECORD_FORMAT_INVALID|JSON|authenticate|decrypt|cipher|bad decrypt/i.test(message)) {
    return codedError('REPOSITORY_DECRYPT_FAILED', '本地仓储无法解密；请打开数据修复向导，不要删除或覆盖原数据', error);
  }
  return error instanceof Error ? error : codedError('REPOSITORY_OPERATION_FAILED', message, error);
}

const ALLOWED_COLLECTIONS = new Set(CWBCollections.desktopCollections);
function validateCollection(collection) {
  const value = String(collection || '');
  if (!ALLOWED_COLLECTIONS.has(value)) throw new Error('REPOSITORY_COLLECTION_NOT_ALLOWED');
  return value;
}
function validateRecordId(id) {
  const value = String(id || '');
  if (!value || value.length > 240 || /[\x00-\x1f]/.test(value)) throw new Error('REPOSITORY_ID_INVALID');
  return value;
}
function validateAttachmentId(id) {
  const value = validateRecordId(id);
  if (value.includes('/') || value.includes('\\') || value === '.' || value === '..') throw codedError('ATTACHMENT_ID_INVALID', '附件 ID 不能包含路径字符');
  return value;
}

function userDataPath(...parts) { return path.join(app.getPath('userData'), ...parts); }
async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); return dir; }
function safeFileName(value, fallback) {
  const cleaned = String(value || fallback).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.\.+/g, '_').trim();
  return cleaned || fallback;
}

async function getVaultKey() {
  if (vaultKeyCache) return vaultKeyCache;
  vaultKeyCache = await loadOrCreateVaultKey({
    keyPath:userDataPath('vault', process.env.CWB_DESKTOP_SMOKE ? 'smoke-key.bin' : 'key.bin'),
    safeStorage,
    allowSmoke:Boolean(process.env.CWB_DESKTOP_SMOKE),
  });
  return vaultKeyCache;
}
function licenseStateFile() { return userDataPath('vault', 'license-state.bin'); }
async function readLicenseState() {
  if (!safeStorage.isEncryptionAvailable()) throw codedError('SAFE_STORAGE_UNAVAILABLE', '系统安全存储不可用，无法读取许可证');
  let encrypted;
  try { encrypted = await fs.readFile(licenseStateFile()); }
  catch (error) { if (error.code === 'ENOENT') return null; throw codedError('LICENSE_STATE_READ_FAILED', '许可证状态文件无法读取', error); }
  try {
    const raw = safeStorage.decryptString(encrypted);
    return validateLicenseState(JSON.parse(raw));
  } catch (error) {
    if (error && error.code === 'LICENSE_STATE_INVALID') throw error;
    throw codedError('LICENSE_STATE_DECRYPT_FAILED', '许可证状态无法由系统安全存储解密', error);
  }
}
async function writeLicenseState(value) {
  if (!safeStorage.isEncryptionAvailable()) throw codedError('SAFE_STORAGE_UNAVAILABLE', '系统安全存储不可用，无法保存许可证');
  const next = validateLicenseState(value);
  if (next == null) { await fs.rm(licenseStateFile(), { force:true }); return null; }
  const encrypted = safeStorage.encryptString(JSON.stringify(next));
  await atomicWriteFile(licenseStateFile(), encrypted);
  return { saved:true };
}
function licenseMode() { return String(desktopConfig.mode || 'development').trim().toLowerCase(); }
function licensePublicKeys() {
  if (!desktopConfig.publicKeys || typeof desktopConfig.publicKeys !== 'object') throw codedError('LICENSE_PUBLIC_KEY_INVALID', '许可证公钥配置不是有效 JSON');
  return desktopConfig.publicKeys;
}
function licenseServiceTarget(pathname) {
  const base = String(desktopConfig.serviceUrl || '').trim().replace(/\/$/, '');
  if (!/^https:\/\//i.test(base)) throw codedError('LICENSE_SERVICE_UNAVAILABLE', '当前桌面包没有配置 HTTPS 授权服务');
  let baseUrl;
  try { baseUrl = new URL(`${base}/`); } catch (error) { throw codedError('LICENSE_SERVICE_UNAVAILABLE', '桌面包的授权服务地址无效', error); }
  const value = String(pathname || '').trim();
  if (!/^\/api\/v1\/[A-Za-z0-9_?=&%./:-]+$/.test(value) || value.includes('..')) throw codedError('LICENSE_REQUEST_INVALID', '授权请求路径无效');
  const target = new URL(value, `${base}/`);
  if (target.origin !== baseUrl.origin || !target.pathname.startsWith('/api/v1/')) throw codedError('LICENSE_REQUEST_INVALID', '授权请求不在受控服务范围内');
  return target;
}
async function requestLicenseService(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const method = String(value.method || 'POST').trim().toUpperCase();
  if (!['GET', 'POST'].includes(method)) throw codedError('LICENSE_REQUEST_INVALID', '授权请求方法无效');
  const target = licenseServiceTarget(value.path);
  const headers = { Accept:'application/json' };
  const suppliedHeaders = value.headers && typeof value.headers === 'object' && !Array.isArray(value.headers) ? value.headers : {};
  for (const name of ['Authorization', 'Idempotency-Key']) {
    const headerValue = String(suppliedHeaders[name] || '').trim();
    if (headerValue) headers[name] = headerValue.slice(0, 512);
  }
  let body;
  if (method !== 'GET') {
    body = JSON.stringify(value.body && typeof value.body === 'object' ? value.body : {});
    if (Buffer.byteLength(body, 'utf8') > 256 * 1024) throw codedError('LICENSE_REQUEST_INVALID', '授权请求内容过大');
    headers['Content-Type'] = 'application/json';
  }
  let response;
  try {
    response = await fetch(target, { method, headers, body, redirect:'error' });
  } catch (error) {
    throw codedError('LICENSE_SERVICE_UNAVAILABLE', '授权服务暂时不可用，请检查网络后重试', error);
  }
  let result = null;
  try { result = await response.json(); } catch (_) {}
  if (!response.ok) {
    const code = String(result && (result.code || result.error) || `LICENSE_HTTP_${response.status}`);
    throw codedError(code, String(result && result.message || '授权服务请求失败'));
  }
  return result || {};
}
async function requireDesktopEntitlement(feature) {
  if (licenseMode() !== 'commercial') return true;
  const stored = await readLicenseState();
  if (!stored || !stored.token) throw codedError('LICENSE_REQUIRED', '当前桌面工作区尚未激活商业许可证');
  let parsed;
  try {
    parsed = licenseCore.parse(stored.token);
    await licenseCore.verifySignature(parsed, licensePublicKeys());
    const decision = licenseCore.evaluate(parsed, { currentVersion:APP_VERSION, productId:licenseCore.PRODUCT_ID, now:Date.now(), state:stored, offline:true });
    if ((feature === 'perpetual_updates' && !decision.perpetual_updates) || (feature === 'core_update' && !decision.updates)) {
      throw codedError('LICENSE_UPDATE_NOT_ENTITLED', '当前许可证不包含此版本的更新权益');
    }
    return true;
  } catch (error) {
    if (error && error.code) throw error;
    throw codedError('LICENSE_STATE_INVALID', '桌面许可证无法验证', error);
  }
}
async function writeMainAudit(action, details) {
  if (!sqliteStore) return;
  try { await getVaultKey(); sqliteStore.put('audit_log', { id:`audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, action, details:details || {}, operator:'desktop-main', operated_at:new Date().toISOString(), schema_version:8 }); } catch (_) {}
}

function encryptBuffer(buffer, keyText) {
  const key = crypto.createHash('sha256').update(keyText).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([Buffer.from('CWB4'), iv, cipher.getAuthTag(), ciphertext]);
}

function decryptBuffer(buffer, keyText) {
  if (buffer.subarray(0, 4).toString() !== 'CWB4') throw new Error('ATTACHMENT_FORMAT_INVALID');
  const key = crypto.createHash('sha256').update(keyText).digest();
  const iv = buffer.subarray(4, 16);
  const tag = buffer.subarray(16, 32);
  const ciphertext = buffer.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function validateBackupEnvelope(envelope) {
  if (!envelope || envelope.format !== 'cwbk' || ![7, 8].includes(Number(envelope.version)) || typeof envelope.ciphertext !== 'string' || typeof envelope.integrity !== 'string') throw new Error('BACKUP_ENVELOPE_INVALID');
  return envelope;
}

async function saveBackupEnvelope(envelope, folder) {
  validateBackupEnvelope(envelope);
  const resolved = path.resolve(folder);
  await ensureDir(resolved);
  const filename = safeFileName(`学工智伴-v${APP_VERSION}-${new Date().toISOString().replace(/[:.]/g, '-')}.cwbk`, 'backup.cwbk');
  const target = path.join(resolved, filename);
  const serialized = JSON.stringify(envelope);
  if (Buffer.byteLength(serialized, 'utf8') > 1024 * 1024 * 1024) throw new Error('BACKUP_FILE_TOO_LARGE');
  await atomicWriteFile(target, serialized);
  await writeMainAudit('backup_saved', { path:target });
  return { saved:true, path:target };
}

async function readBackupEnvelope(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 1024 * 1024 * 1024) throw new Error('BACKUP_FILE_TOO_LARGE');
  let text;
  try { text = await fs.readFile(filePath, 'utf8'); } catch (_) { throw new Error('BACKUP_FILE_READ_FAILED'); }
  let envelope;
  try { envelope = JSON.parse(text); } catch (_) { throw new Error('BACKUP_FILE_INVALID'); }
  return validateBackupEnvelope(envelope);
}

async function createUpdateRecoveryPoint() {
  const current = path.resolve(app.getPath('userData'));
  const recoveryRoot = path.join(path.dirname(current), 'counselor-desk-recovery');
  const recoveryPath = path.join(recoveryRoot, `before-update-${APP_VERSION}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  await ensureDir(recoveryRoot);
  await getVaultKey();
  if (!sqliteStore) throw codedError('SQLITE_UNAVAILABLE', '更新前无法访问当前工作区仓储');
  let beforeHealth;
  try {
    beforeHealth = await sqliteStore.health({ verifyPayloads:true });
    if (typeof sqliteStore.checkpoint === 'function') sqliteStore.checkpoint();
    await fs.cp(current, recoveryPath, { recursive:true, errorOnExist:true });
    let candidate;
    try {
      candidate = createSqliteStore(path.join(recoveryPath, 'counselor-v4.sqlite'), () => vaultKeyCache);
      if (!candidate) throw codedError('SQLITE_UNAVAILABLE', '恢复点校验缺少 SQLite 运行时');
      const afterHealth = await candidate.health({ verifyPayloads:true });
      const attachmentHealth = await inspectAttachmentVault({ key:vaultKeyCache, folder:path.join(recoveryPath, 'vault', 'attachments'), store:candidate });
      if (!attachmentHealth.ok || afterHealth.encrypted_records !== beforeHealth.encrypted_records) {
        throw codedError('UPDATE_RECOVERY_POINT_INVALID', '更新前恢复点校验未通过');
      }
      const result = { ok:true, path:recoveryPath, encrypted_records:afterHealth.encrypted_records, attachments:attachmentHealth.count, created_at:new Date().toISOString() };
      await writeMainAudit('update_recovery_point_created', { path:recoveryPath, encrypted_records:result.encrypted_records, attachments:result.attachments });
      return result;
    } finally {
      if (candidate) candidate.close();
    }
  } catch (error) {
    await fs.rm(recoveryPath, { recursive:true, force:true }).catch(() => {});
    throw codedError(error.code || 'UPDATE_RECOVERY_POINT_FAILED', '更新前恢复点创建或校验失败，安装已取消', error);
  }
}

function updateInstallStateFile() { return userDataPath('vault', 'update-install-state.json'); }
function recoveryRootPath() { return path.join(path.dirname(path.resolve(app.getPath('userData'))), 'counselor-desk-recovery'); }
function pathInside(parent, child) {
  const root = path.resolve(parent) + path.sep;
  const target = path.resolve(child);
  return target.startsWith(root) && target !== path.resolve(parent);
}

function validateUpdateInstallState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw codedError('UPDATE_STATE_INVALID', '更新状态文件格式无效');
  const phase = String(value.phase || '').trim();
  if (!['pending', 'installing', 'completed', 'rolled-back', 'rollback-failed'].includes(phase)) throw codedError('UPDATE_STATE_INVALID', '更新状态阶段无效');
  const recovery = value.recovery_point && typeof value.recovery_point === 'object' ? value.recovery_point : null;
  if (recovery && recovery.path && !pathInside(recoveryRootPath(), recovery.path)) throw codedError('UPDATE_STATE_INVALID', '更新恢复点路径不在受控目录内');
  return {
    phase,
    target_version:String(value.target_version || '').slice(0, 32),
    started_at:String(value.started_at || '').slice(0, 64),
    completed_at:String(value.completed_at || '').slice(0, 64),
    updated_at:String(value.updated_at || '').slice(0, 64),
    reason:String(value.reason || '').slice(0, 120),
    rollback_error:String(value.rollback_error || '').slice(0, 120),
    recovery_point:recovery ? { ok:recovery.ok === true, path:String(recovery.path || ''), encrypted_records:Number(recovery.encrypted_records || 0), attachments:Number(recovery.attachments || 0), created_at:String(recovery.created_at || '') } : null,
    rollback_result:value.rollback_result && typeof value.rollback_result === 'object' ? { ok:value.rollback_result.ok === true, preserved_failed_path:String(value.rollback_result.preserved_failed_path || '') } : null,
  };
}

async function loadUpdateInstallState() {
  let raw;
  try { raw = await fs.readFile(updateInstallStateFile(), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw codedError('UPDATE_STATE_READ_FAILED', '更新状态文件无法读取', error); }
  if (Buffer.byteLength(raw, 'utf8') > 256 * 1024) throw codedError('UPDATE_STATE_INVALID', '更新状态文件超过大小限制');
  let value;
  try { value = JSON.parse(raw); } catch (error) { throw codedError('UPDATE_STATE_INVALID', '更新状态文件不是有效 JSON', error); }
  return validateUpdateInstallState(value);
}

async function persistUpdateInstallState(value) {
  const validated = validateUpdateInstallState(value);
  await atomicWriteFile(updateInstallStateFile(), JSON.stringify(validated));
  return { saved:true, phase:validated.phase };
}

async function rollbackUpdateRecoveryPoint(recovery) {
  const recoveryPath = recovery && recovery.path ? path.resolve(String(recovery.path)) : '';
  const current = path.resolve(app.getPath('userData'));
  if (!recoveryPath || !pathInside(recoveryRootPath(), recoveryPath)) throw codedError('UPDATE_RECOVERY_POINT_INVALID', '更新恢复点路径无效');
  if (sqliteStore) { try { sqliteStore.close(); } catch (_) {} sqliteStore = null; }
  const failedPath = path.join(recoveryRootPath(), `failed-update-current-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  await ensureDir(recoveryRootPath());
  let movedCurrent = false;
  try {
    await fs.rename(current, failedPath);
    movedCurrent = true;
    await fs.rename(recoveryPath, current);
  } catch (cause) {
    if (movedCurrent) await fs.rename(failedPath, current).catch(() => {});
    throw codedError('UPDATE_ROLLBACK_FAILED', '更新恢复点无法替换当前数据目录，原目录已尽力保留', cause);
  }
  try {
    sqliteStore = createSqliteStore(userDataPath('counselor-v4.sqlite'), () => vaultKeyCache || 'uninitialized-vault-key');
    const health = await sqliteStore.health({ verifyPayloads:true });
    const attachments = await inspectAttachmentVault({ key:vaultKeyCache, folder:userDataPath('vault', 'attachments'), store:sqliteStore });
    if (!attachments.ok) throw codedError('UPDATE_ROLLBACK_FAILED', '恢复后的附件仓储校验失败');
    await writeMainAudit('update_recovery_point_rolled_back', { preserved_failed_path:failedPath, encrypted_records:Number(health.encrypted_records || 0), attachments:Number(attachments.count || 0) });
    return { ok:true, preserved_failed_path:failedPath, encrypted_records:Number(health.encrypted_records || 0), attachments:Number(attachments.count || 0) };
  } catch (cause) {
    if (sqliteStore) { try { sqliteStore.close(); } catch (_) {} sqliteStore = null; }
    const brokenRecoveryPath = path.join(recoveryRootPath(), `failed-update-recovery-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
    await fs.rename(current, brokenRecoveryPath).catch(() => {});
    await fs.rename(failedPath, current).catch(() => {});
    throw codedError('UPDATE_ROLLBACK_FAILED', '恢复点替换后校验失败，已恢复原数据目录；请保留失败副本', cause);
  }
}

async function createWindow() {
  sqliteStore = createSqliteStore(userDataPath('counselor-v4.sqlite'), () => vaultKeyCache || 'uninitialized-vault-key');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#eef2f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  // The Windows build is a focused local workspace. The default Electron
  // File/Edit/View menu duplicates no product controls and makes the title
  // area needlessly busy; macOS keeps its conventional application menu.
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // The renderer is a local application surface; never let untrusted content
    // navigate it and inherit the preload/IPC bridge.
    if (!url.startsWith('file://')) event.preventDefault();
  });
  updateRuntime = createElectronUpdateRuntime({
    currentVersion:APP_VERSION,
    feedUrl:desktopConfig.updateFeedUrl,
    manifestUrl:desktopConfig.updateManifestUrl,
    manifestPublicKeys:licensePublicKeys(),
    requireManifestSignature:licenseMode() === 'commercial',
    requirePackageHash:licenseMode() === 'commercial',
    requirePlatformSignature:licenseMode() === 'commercial',
    requireRecoveryPoint:licenseMode() === 'commercial',
    platform:process.platform,
    arch:process.arch,
    requireEntitlement:requireDesktopEntitlement,
    createRecoveryPoint:createUpdateRecoveryPoint,
    persistInstallState:persistUpdateInstallState,
    loadInstallState:loadUpdateInstallState,
    rollbackRecoveryPoint:rollbackUpdateRecoveryPoint,
    validateAfterUpdate:async () => {
      if (!sqliteStore) throw codedError('SQLITE_UNAVAILABLE', '更新后无法打开工作区仓储');
      const health = await sqliteStore.health({ verifyPayloads:true });
      const attachments = await inspectAttachmentVault({ key:vaultKeyCache, folder:userDataPath('vault', 'attachments'), store:sqliteStore });
      if (!attachments.ok) throw codedError('UPDATE_POST_INSTALL_VALIDATION_FAILED', '更新后附件仓储校验未通过');
      return { ok:true, encrypted_records:Number(health.encrypted_records || 0), attachments:Number(attachments.count || 0) };
    },
    verifyDownloadedPackage:(filePath) => verifyPlatformSignature(filePath, { platform:process.platform, expectedPublisher:desktopConfig.publisher }),
  });
  updateRuntime.subscribe(state => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try { mainWindow.webContents.send('cwb:update-state', state); } catch (_) {}
  });
  await updateRuntime.resumeAfterLaunch();
  await mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  startAutomaticUpdateChecks();
}

function startAutomaticUpdateChecks() {
  if (updateScheduler) updateScheduler.stop();
  const enabled = licenseMode() === 'commercial'
    && Boolean(String(desktopConfig.updateFeedUrl || '').trim())
    && Boolean(String(desktopConfig.updateManifestUrl || '').trim());
  updateScheduler = createUpdateScheduler({
    enabled,
    check:async () => {
      if (!updateRuntime) return null;
      const result = await updateRuntime.check();
      if (result && result.updateInfo) {
        await writeMainAudit('update_auto_available', { version:String(result.updateInfo.version || '') });
      }
      return result;
    },
    onError:error => {
      const code = String(error && error.code || 'UPDATE_CHECK_FAILED');
      if (!['LICENSE_REQUIRED', 'LICENSE_UPDATE_NOT_ENTITLED'].includes(code)) writeMainAudit('update_auto_check_failed', { code });
    },
  });
  updateScheduler.start();
}

function migrateDesktopData() {
  return migrateLegacyDesktopData({
    appDataRoot:path.dirname(app.getPath('userData')),
    userDataRoot:app.getPath('userData'),
  });
}

function dataPath(...parts) { return path.join(app.getPath('userData'), ...parts); }

function assertDataTarget(target) {
  try { return resolveDataTarget(target, app.getPath('userData')); }
  catch (error) { throw codedError(error.code || 'DATA_TARGET_INVALID', String(error.message || '数据目录无效').replace(/^[A-Z0-9_]+:\s*/, '')); }
}

async function countFiles(folder) {
  try {
    const entries = await fs.readdir(folder, { withFileTypes:true });
    let count = 0;
    for (const entry of entries) {
      const child = path.join(folder, entry.name);
      count += entry.isDirectory() ? await countFiles(child) : 1;
    }
    return count;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function inspectAttachmentVault(options) {
  const opts = options || {};
  const folder = opts.folder || dataPath('vault', 'attachments');
  let entries = [];
  try { entries = await fs.readdir(folder, { withFileTypes:true }); }
  catch (error) { if (error.code === 'ENOENT') return { ok:true, count:0, encrypted_bytes:0, plaintext_bytes:0, corrupt:[], missing:[], orphan:[] }; throw error; }
  const files = entries.filter(entry => entry.isFile() && entry.name.endsWith('.bin'));
  const key = opts.key || await getVaultKey();
  const corrupt = [];
  let encryptedBytes = 0;
  let plaintextBytes = 0;
  for (const entry of files) {
    const attachmentId = entry.name.slice(0, -4);
    try {
      const payload = await fs.readFile(path.join(folder, entry.name));
      encryptedBytes += payload.length;
      const bytes = decryptBuffer(payload, key);
      plaintextBytes += bytes.length;
      if (bytes.length > 50 * 1024 * 1024) corrupt.push({ id:attachmentId, code:'ATTACHMENT_SIZE_LIMIT' });
    } catch (error) {
      corrupt.push({ id:attachmentId, code:error.code || 'ATTACHMENT_DECRYPT_FAILED' });
    }
  }
  let indexed = [];
  const indexStore = opts.store || sqliteStore;
  if (indexStore) {
    try { indexed = await indexStore.list('attachments'); }
    catch (error) { corrupt.push({ id:'<index>', code:error.code || 'ATTACHMENT_INDEX_CORRUPTED' }); }
  }
  const fileIds = new Set(files.map(entry => entry.name.slice(0, -4)));
  const indexIds = new Set(indexed.map(item => String(item && item.id || '')).filter(Boolean));
  const missing = [...indexIds].filter(id => !fileIds.has(id));
  const orphan = [...fileIds].filter(id => !indexIds.has(id));
  return { ok:corrupt.length === 0 && missing.length === 0, count:files.length, encrypted_bytes:encryptedBytes, plaintext_bytes:plaintextBytes, indexed_count:indexed.length, corrupt, missing, orphan };
}

async function migrateDataDirectory(target) {
  const requested = assertDataTarget(target);
  const current = path.resolve(app.getPath('userData'));
  const targetStat = await fs.stat(requested).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (targetStat && !targetStat.isDirectory()) throw codedError('DATA_TARGET_NOT_DIRECTORY', '目标数据路径不是文件夹');
  const targetExists = Boolean(targetStat);
  if (targetExists && (await fs.readdir(requested)).length) throw codedError('DATA_TARGET_NOT_EMPTY', '目标数据目录必须为空');
  await getVaultKey();
  if (!sqliteStore) throw codedError('SQLITE_UNAVAILABLE', '当前工作区仓储不可用');
  const beforeHealth = await sqliteStore.health({ verifyPayloads:true });
  const beforeAttachments = await countFiles(dataPath('vault', 'attachments'));
  const recoveryRoot = path.join(path.dirname(current), 'counselor-desk-recovery');
  const recoveryCopy = path.join(recoveryRoot, `before-data-migration-${Date.now()}`);
  await ensureDir(recoveryRoot);
  await fs.cp(current, recoveryCopy, { recursive:true, errorOnExist:true });
  const temporary = `${requested}.migration-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  let targetPrepared = false;
  try {
    await fs.cp(current, temporary, { recursive:true, errorOnExist:true });
    let candidate;
    let afterHealth;
    let afterAttachments;
    try {
      candidate = createSqliteStore(path.join(temporary, 'counselor-v4.sqlite'), () => vaultKeyCache);
      if (!candidate) throw codedError('SQLITE_UNAVAILABLE', '目标运行时不支持 SQLite');
      afterHealth = await candidate.health({ verifyPayloads:true });
      afterAttachments = await countFiles(path.join(temporary, 'vault', 'attachments'));
      const attachmentHealth = await inspectAttachmentVault({ key:vaultKeyCache, folder:path.join(temporary, 'vault', 'attachments'), store:candidate });
      if (!attachmentHealth.ok) throw codedError('DATA_MIGRATION_ATTACHMENT_CORRUPTED', '目标数据目录的附件校验失败');
    } finally {
      if (candidate) candidate.close();
    }
    if (beforeAttachments !== afterAttachments) throw codedError('DATA_MIGRATION_ATTACHMENT_MISMATCH', '附件数量校验失败');
    if (beforeHealth.encrypted_records !== afterHealth.encrypted_records) throw codedError('DATA_MIGRATION_RECORD_MISMATCH', '记录数量校验失败');
      targetPrepared = true;
      if (targetExists) await fs.cp(temporary, requested, { recursive:true, errorOnExist:false });
      else await fs.rename(temporary, requested);
      await fs.rm(temporary, { recursive:true, force:true });
    const oldStore = sqliteStore;
    await activateDataDirectory({
      current,
      requested,
      oldStore,
      setUserData:value => app.setPath('userData', value),
      setStore:value => { sqliteStore = value; },
      createStore:file => createSqliteStore(file, () => vaultKeyCache),
    });
    await writeMainAudit('data_directory_migrated', { from:current, to:requested, recovery_copy:recoveryCopy });
    return { ok:true, from:current, to:requested, recovery_copy:recoveryCopy, attachments:beforeAttachments, encrypted_records:beforeHealth.encrypted_records };
    } catch (error) {
      await fs.rm(temporary, { recursive:true, force:true }).catch(() => {});
      if (targetPrepared) await fs.rm(requested, { recursive:true, force:true }).catch(() => {});
      throw error;
    }
}

async function runDesktopSmoke() {
  sqliteStore = createSqliteStore(userDataPath('counselor-v4.sqlite'), () => vaultKeyCache || 'uninitialized-vault-key');
  await getVaultKey();
  const persistedTask = sqliteStore.get('records_tasks', 'v8-smoke-task');
  const legacy = sqliteStore.put('records_students', { id:'legacy-schema-7', schema_version:7, student_number:'20240001', full_name:'Legacy Student' });
  const current = sqliteStore.put('records_tasks', { id:'v8-smoke-task', title:'Desktop smoke task' });
  const attachmentId = 'desktop-smoke-attachment';
  const attachmentDir = await ensureDir(userDataPath('vault', 'attachments'));
  const attachmentPath = path.join(attachmentDir, `${attachmentId}.bin`);
  const attachmentBytes = Buffer.from('desktop-smoke');
  const vaultKey = await getVaultKey();
  let persistedAttachment = false;
  try { persistedAttachment = decryptBuffer(await fs.readFile(attachmentPath), vaultKey).equals(attachmentBytes); } catch (_) {}
  await fs.writeFile(attachmentPath, encryptBuffer(attachmentBytes, vaultKey));
  const attachment = decryptBuffer(await fs.readFile(attachmentPath), vaultKey).equals(attachmentBytes);
  const requiresPersistence = process.env.CWB_DESKTOP_SMOKE_EXPECT_PERSISTENCE === '1';
  const persistence = !requiresPersistence || (persistedTask && persistedTask.title === 'Desktop smoke task' && persistedAttachment);
  const backupFolder = await ensureDir(userDataPath('backups'));
  const backupEnvelope = { format:'cwbk', version:8, schemaVersion:8, ciphertext:'desktop-smoke', integrity:'desktop-smoke-integrity' };
  const savedBackup = await saveBackupEnvelope(backupEnvelope, backupFolder);
  const restoredBackup = await readBackupEnvelope(savedBackup.path);
  const backup = savedBackup.saved && restoredBackup.version === 8 && restoredBackup.ciphertext === backupEnvelope.ciphertext;
  sqliteStore.close();
  sqliteStore = null;
  console.log(JSON.stringify({ ok:true, schemaVersion:current.schema_version, sqlite:Boolean(current && legacy), attachment, persistence, migration:true, backup }));
  app.exit(0);
}

ipcMain.handle('desktop:choose-backup-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('desktop:save-backup', async (_event, envelope, requestedFolder) => {
  const folder = requestedFolder || (await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })).filePaths[0];
  if (!folder) return { saved: false, reason: 'cancelled' };
  return saveBackupEnvelope(envelope, folder);
});

ipcMain.handle('desktop:open-backup', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'CWB encrypted backup', extensions: ['cwbk'] }] });
  if (result.canceled) return null;
  return readBackupEnvelope(result.filePaths[0]);
});

ipcMain.handle('desktop:open-data-folder', async () => {
  const folder = await ensureDir(app.getPath('userData'));
  const error = await shell.openPath(folder);
  if (error) throw new Error('DATA_FOLDER_OPEN_FAILED');
  return { path: folder };
});

ipcMain.handle('desktop:get-data-location', async () => ({ path:app.getPath('userData'), install_path:app.getAppPath(), platform:process.platform }));
ipcMain.handle('desktop:choose-data-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties:['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('desktop:migrate-data-folder', async (_event, target) => migrateDataDirectory(target));

ipcMain.handle('desktop:export-recovery-kit', async (_event, password, requestedFolder) => {
  const key = await getVaultKey();
  const envelope = await createRecoveryKit(key, String(password || ''));
  const folder = requestedFolder || (await dialog.showOpenDialog(mainWindow, { properties:['openDirectory', 'createDirectory'] })).filePaths[0];
  if (!folder) return { saved:false, reason:'cancelled' };
  const filename = safeFileName(`学工智伴-恢复包-${new Date().toISOString().replace(/[:.]/g, '-')}.cwrk`, 'counselor-desk-recovery.cwrk');
  const target = path.join(path.resolve(folder), filename);
  await atomicWriteFile(target, Buffer.from(JSON.stringify(envelope), 'utf8'));
  await writeMainAudit('recovery_kit_exported', { path:target, kdf:envelope.kdf, version:envelope.version });
  return { saved:true, path:target, envelope_version:envelope.version, kdf:envelope.kdf, warning:'恢复口令只在创建时由你掌握；遗失后没有后门解锁。' };
});

ipcMain.handle('desktop:open-recovery-kit', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties:['openFile'], filters:[{ name:'CWB recovery kit', extensions:['cwrk'] }] });
  if (result.canceled) return null;
  let envelope;
  try { envelope = JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')); }
  catch (_) { throw codedError('RECOVERY_KIT_INVALID', '恢复包文件无法读取'); }
  return { path:result.filePaths[0], envelope };
});

ipcMain.handle('desktop:restore-recovery-kit', async (_event, envelope, password) => {
  const recoveredKey = await recoverMasterKey(envelope, String(password || ''));
  const oldKey = vaultKeyCache;
  const oldStore = sqliteStore;
  const keyPath = dataPath('vault', 'key.bin');
  const keyBackup = `${keyPath}.before-recovery-${Date.now()}`;
  let keyExisted = false;
  try { await fs.access(keyPath); keyExisted = true; } catch (_) {}
  let keyReplaced = false;
  let candidate;
  try {
    if (oldStore) oldStore.close();
    sqliteStore = null;
    candidate = createSqliteStore(dataPath('counselor-v4.sqlite'), () => recoveredKey);
    if (!candidate) throw codedError('SQLITE_UNAVAILABLE', '当前运行时不支持 SQLite');
    await candidate.health({ verifyPayloads:true });
    const attachmentHealth = await inspectAttachmentVault({ key:recoveredKey, store:candidate });
    if (!attachmentHealth.ok) throw codedError('ATTACHMENT_DECRYPT_FAILED', '恢复主密钥无法验证附件仓，未替换当前密钥');
    await fs.copyFile(keyPath, keyBackup).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await writeVaultKey(keyPath, recoveredKey, safeStorage);
    keyReplaced = true;
    vaultKeyCache = recoveredKey;
    sqliteStore = candidate;
    candidate = null;
    await writeMainAudit('recovery_kit_restored', { key_backup:keyBackup });
    return { ok:true, key_backup:keyBackup, verified:true };
  } catch (error) {
    if (candidate) candidate.close();
    if (keyReplaced) {
      try {
        if (keyExisted) await fs.copyFile(keyBackup, keyPath);
        else await fs.rm(keyPath, { force:true });
      } catch (rollbackError) {
        error = codedError('VAULT_KEY_ROLLBACK_FAILED', '恢复失败且原主密钥无法恢复，请立即停止写入并使用恢复副本', rollbackError);
      }
    }
    sqliteStore = null;
    vaultKeyCache = oldKey;
    if (oldStore && oldKey) sqliteStore = createSqliteStore(dataPath('counselor-v4.sqlite'), () => oldKey);
    throw error.code ? error : codedError('REPOSITORY_DECRYPT_FAILED', '恢复包与当前数据库不匹配，未替换原密钥', error);
  }
});

ipcMain.handle('desktop:lan-sync-start', async (_event, options) => {
  if (lanSyncHost) return lanSyncHost.status();
  const value = options && typeof options === 'object' ? options : {};
  lanSyncHost = await createLanSyncHost({
    dataDir:userDataPath('lan-sync'),
    stateSecret:await getVaultKey(),
    workspace_id:value.workspace_id || 'workspace-local',
    host:value.host || '0.0.0.0',
    port:value.port || 0,
    allowedCollections:CWBCollections.sync,
    recordStore:sqliteStore ? {
      get:(collection, id) => sqliteStore.get(CWBCollections.desktopName(collection), id),
      put:(collection, record) => sqliteStore.put(CWBCollections.desktopName(collection), record),
      delete:(collection, id) => sqliteStore.delete(CWBCollections.desktopName(collection), id),
    } : null,
    audit:(action, details) => writeMainAudit(action, details),
  });
  const started = await lanSyncHost.start();
  await writeMainAudit('lan_sync_started', { host:started.host, port:started.port, fingerprint:started.fingerprint });
  return started;
});
ipcMain.handle('desktop:lan-sync-stop', async () => {
  if (!lanSyncHost) return { running:false };
  const host = lanSyncHost;
  lanSyncHost = null;
  await host.stop();
  await writeMainAudit('lan_sync_stopped', {});
  return { running:false };
});
ipcMain.handle('desktop:lan-sync-status', async () => lanSyncHost ? lanSyncHost.status() : { running:false });
ipcMain.handle('desktop:lan-sync-pairing-code', async () => {
  if (!lanSyncHost) throw codedError('SYNC_HOST_NOT_RUNNING', '请先启动局域网数据中枢');
  return lanSyncHost.createPairingCode();
});
ipcMain.handle('desktop:lan-sync-pairing-qr', async () => {
  if (!lanSyncHost) throw codedError('SYNC_HOST_NOT_RUNNING', '请先启动局域网数据中枢');
  const pairing = lanSyncHost.createPairingCode();
  const status = lanSyncHost.status();
  const addresses = Array.isArray(status.addresses) ? status.addresses.filter(Boolean) : [];
  const host = addresses.length && Number(status.port) ? `https://${addresses[0]}:${status.port}` : String(status.base_url || '');
  const fingerprint = String(status.fingerprint || '');
  const workspaceId = String(status.status && status.status.workspace_id || status.workspace_id || 'workspace-local');
  const qr = createPairingQrPayload({ host, workspace_id:workspaceId, pairing_id:pairing.pairing_id, code:pairing.code, fingerprint, expires_at:pairing.expires_at });
  let dataUrl = '';
  let qrError = '';
  try {
    dataUrl = await QRCode.toDataURL(qr.payload, { type:'image/png', errorCorrectionLevel:'M', margin:2, width:320 });
  } catch (error) {
    qrError = 'PAIRING_QR_GENERATION_FAILED';
    await writeMainAudit('lan_sync_pairing_qr_failed', { pairing_id:pairing.pairing_id, code:qrError });
  }
  await writeMainAudit('lan_sync_pairing_qr_created', { pairing_id:pairing.pairing_id, expires_at:pairing.expires_at, qr_available:Boolean(dataUrl) });
  return Object.assign({}, pairing, { host, workspace_id:workspaceId, fingerprint, payload:qr.payload, data_url:dataUrl, qr_available:Boolean(dataUrl), qr_error:qrError });
});
ipcMain.handle('desktop:lan-sync-confirm-pairing', async (_event, requestId, approve) => {
  if (!lanSyncHost) throw codedError('SYNC_HOST_NOT_RUNNING', '请先启动局域网数据中枢');
  const result = lanSyncHost.confirmPairing(requestId, approve !== false);
  await writeMainAudit('lan_sync_pairing_confirmed', { request_id:String(requestId || ''), approved:approve !== false });
  return result;
});
ipcMain.handle('desktop:lan-sync-revoke-device', async (_event, deviceId) => {
  if (!lanSyncHost) throw codedError('SYNC_HOST_NOT_RUNNING', '请先启动局域网数据中枢');
  const result = lanSyncHost.revokeDevice(deviceId);
  await writeMainAudit('lan_sync_device_revoked', { device_id:String(deviceId || ''), revoked:result });
  return result;
});
ipcMain.handle('desktop:lan-sync-pause-device', async (_event, deviceId) => {
  if (!lanSyncHost) throw codedError('SYNC_HOST_NOT_RUNNING', '请先启动局域网数据中枢');
  const result = lanSyncHost.pauseDevice(deviceId);
  await writeMainAudit('lan_sync_device_paused', { device_id:String(deviceId || ''), paused:result });
  return result;
});
ipcMain.handle('desktop:lan-sync-resume-device', async (_event, deviceId) => {
  if (!lanSyncHost) throw codedError('SYNC_HOST_NOT_RUNNING', '请先启动局域网数据中枢');
  const result = lanSyncHost.resumeDevice(deviceId);
  await writeMainAudit('lan_sync_device_resumed', { device_id:String(deviceId || ''), resumed:result });
  return result;
});

ipcMain.handle('desktop:get-vault-status', async () => ({ available: safeStorage.isEncryptionAvailable(), root: userDataPath('vault') }));
ipcMain.handle('desktop:repository-health', async () => {
  const result = { ok:true, checks:{ safe_storage:{ ok:safeStorage.isEncryptionAvailable() }, vault_key:{ ok:false }, sqlite:{ ok:false }, attachment_index:{ ok:false }, attachments:{ ok:false } } };
  let vaultReady = false;
  try { await getVaultKey(); vaultReady = true; result.checks.vault_key = { ok:true }; }
  catch (error) { result.ok = false; result.checks.vault_key = { ok:false, code:error.code || 'VAULT_KEY_UNKNOWN', message:error.message }; }
  if (!sqliteStore) { result.ok = false; result.checks.sqlite = { ok:false, code:'SQLITE_UNAVAILABLE' }; }
  else {
    try { result.checks.sqlite = await sqliteStore.health({ verifyPayloads:true }); }
    catch (error) { result.ok = false; result.checks.sqlite = { ok:false, code:error.code || 'REPOSITORY_CORRUPTED', message:error.message }; }
    try { const indexed = await sqliteStore.list('attachments'); result.checks.attachment_index = { ok:true, count:indexed.length }; }
    catch (error) { result.ok = false; result.checks.attachment_index = { ok:false, code:error.code || 'ATTACHMENT_INDEX_CORRUPTED', message:error.message }; }
  }
  if (vaultReady) {
    try { result.checks.attachments = await inspectAttachmentVault(); }
    catch (error) { result.ok = false; result.checks.attachments = { ok:false, code:error.code || 'ATTACHMENT_DECRYPT_FAILED', message:error.message }; }
  } else {
    result.ok = false;
    result.checks.attachments = { ok:false, code:'VAULT_KEY_REQUIRED', message:'主密钥不可用，无法检查附件仓' };
  }
  if (Object.values(result.checks).some(check => check && check.ok === false)) result.ok = false;
  return result;
});
ipcMain.handle('desktop:set-backup-secret', async (_event, secret) => {
  if (!secret || String(secret).length < 8 || !safeStorage.isEncryptionAvailable()) return false;
  const file = userDataPath('vault', 'backup-secret.bin');
  await ensureDir(path.dirname(file));
  await atomicWriteFile(file, safeStorage.encryptString(String(secret)));
  return true;
});
ipcMain.handle('desktop:get-backup-secret', async () => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try { return safeStorage.decryptString(await fs.readFile(userDataPath('vault', 'backup-secret.bin'))); } catch (_) { return null; }
});
ipcMain.handle('desktop:set-ai-secret', async (_event, id, secret) => {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const providerId = validateRecordId(id);
  const value = String(secret || '').trim();
  if (!value || value.length > 4096) return false;
  const file = userDataPath('vault', `ai-secret-${safeFileName(providerId, 'provider')}.bin`);
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, safeStorage.encryptString(value), { flag:'w' });
  await writeMainAudit('ai_secret_saved', { provider_id:providerId });
  return true;
});
ipcMain.handle('desktop:get-ai-secret', async (_event, id) => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  const providerId = validateRecordId(id);
  try { return safeStorage.decryptString(await fs.readFile(userDataPath('vault', `ai-secret-${safeFileName(providerId, 'provider')}.bin`))); } catch (_) { return null; }
});
ipcMain.handle('desktop:delete-ai-secret', async (_event, id) => {
  const providerId = validateRecordId(id);
  try { await fs.rm(userDataPath('vault', `ai-secret-${safeFileName(providerId, 'provider')}.bin`), { force:true }); await writeMainAudit('ai_secret_deleted', { provider_id:providerId }); return true; } catch (_) { return false; }
});
ipcMain.handle('desktop:get-license-state', async () => readLicenseState());
ipcMain.handle('desktop:set-license-state', async (_event, state) => {
  const result = await writeLicenseState(state);
  if (result) await writeMainAudit('license_state_saved', { status:String(state && state.status || ''), license_id:'stored-separately' });
  return result;
});
ipcMain.handle('desktop:delete-license-state', async () => {
  await writeLicenseState(null);
  await writeMainAudit('license_state_deleted', {});
  return true;
});
ipcMain.handle('desktop:license-request', async (_event, input) => {
  const value = input && typeof input === 'object' ? input : {};
  const result = await requestLicenseService(value);
  await writeMainAudit('license_service_request', { method:String(value.method || 'POST').toUpperCase(), path:String(value.path || '') });
  return result;
});
ipcMain.handle('desktop:update-status', async () => updateRuntime ? updateRuntime.status() : { status:'idle', version:APP_VERSION, error:'' });
ipcMain.handle('desktop:update-check', async () => {
  if (!updateRuntime) throw codedError('UPDATE_RUNTIME_UNAVAILABLE', '桌面更新运行时尚未初始化');
  const result = await updateRuntime.check();
  await writeMainAudit('update_checked', { status:result.state.status, version:result.updateInfo && result.updateInfo.version || '' });
  return result;
});
ipcMain.handle('desktop:update-download', async () => {
  if (!updateRuntime) throw codedError('UPDATE_RUNTIME_UNAVAILABLE', '桌面更新运行时尚未初始化');
  const result = await updateRuntime.download();
  await writeMainAudit('update_download_requested', { status:result.status });
  return result;
});
ipcMain.handle('desktop:update-install', async () => {
  if (!updateRuntime) throw codedError('UPDATE_RUNTIME_UNAVAILABLE', '桌面更新运行时尚未初始化');
  const result = await updateRuntime.install();
  await writeMainAudit('update_install_requested', { status:result.status });
  return result;
});
ipcMain.handle('desktop:update-cancel', async () => {
  if (!updateRuntime) throw codedError('UPDATE_RUNTIME_UNAVAILABLE', '桌面更新运行时尚未初始化');
  const result = updateRuntime.cancel();
  await writeMainAudit('update_cancelled', {});
  return result;
});
ipcMain.handle('desktop:prune-backups', async (_event, folder, retain) => {
  if (!folder || typeof folder !== 'string') return 0;
  const resolved = path.resolve(folder);
  const keep = Math.max(1, Math.min(100, Number(retain) || 8));
  const entries = (await fs.readdir(resolved, { withFileTypes: true })).filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.cwbk')).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries.slice(0, Math.max(0, entries.length - keep))) await fs.rm(path.join(resolved, entry.name), { force: true });
  return Math.min(entries.length, keep);
});

ipcMain.handle('desktop:repository-list', async (_event, collection) => {
  try {
    if (!sqliteStore) return null;
    collection = validateCollection(collection);
    await getVaultKey();
    return sqliteStore.list(collection);
  } catch (error) { throw repositoryError(error); }
});
ipcMain.handle('desktop:repository-get', async (_event, collection, id) => {
  try {
    if (!sqliteStore) return null;
    collection = validateCollection(collection); id = validateRecordId(id);
    await getVaultKey();
    return sqliteStore.get(collection, id);
  } catch (error) { throw repositoryError(error); }
});
ipcMain.handle('desktop:repository-put', async (_event, collection, record) => {
  try {
    if (!sqliteStore) return null;
    collection = validateCollection(collection);
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw codedError('REPOSITORY_RECORD_INVALID', '记录格式无效');
    if (JSON.stringify(record).length > 2 * 1024 * 1024) throw codedError('REPOSITORY_RECORD_TOO_LARGE', '记录超过大小限制');
    await getVaultKey();
    return sqliteStore.put(collection, record);
  } catch (error) { throw repositoryError(error); }
});
ipcMain.handle('desktop:repository-put-many', async (_event, collection, records) => {
  try {
    if (!sqliteStore) return [];
    collection = validateCollection(collection);
    if (!Array.isArray(records) || records.length > 20000) throw codedError('REPOSITORY_RECORDS_INVALID', '记录批次格式无效');
    if (JSON.stringify(records).length > 20 * 1024 * 1024) throw codedError('REPOSITORY_BATCH_TOO_LARGE', '记录批次超过大小限制');
    for (const record of records) { if (!record || typeof record !== 'object' || Array.isArray(record) || !record.id) throw codedError('REPOSITORY_RECORD_INVALID', '记录格式无效'); if (JSON.stringify(record).length > 2 * 1024 * 1024) throw codedError('REPOSITORY_RECORD_TOO_LARGE', '记录超过大小限制'); }
    await getVaultKey();
    return sqliteStore.putMany(collection, records);
  } catch (error) { throw repositoryError(error); }
});
ipcMain.handle('desktop:repository-replace-many-atomic', async (_event, collection, records) => {
  try {
    if (!sqliteStore) return [];
    collection = validateCollection(collection);
    if (!Array.isArray(records) || records.length > 20000) throw codedError('REPOSITORY_RECORDS_INVALID', '记录批次格式无效');
    if (JSON.stringify(records).length > 20 * 1024 * 1024) throw codedError('REPOSITORY_BATCH_TOO_LARGE', '记录批次超过大小限制');
    for (const record of records) if (!record || typeof record !== 'object' || Array.isArray(record) || !record.id || JSON.stringify(record).length > 2 * 1024 * 1024) throw codedError('REPOSITORY_RECORD_INVALID', '记录格式无效');
    await getVaultKey();
    return sqliteStore.replaceManyAtomic(collection, records);
  } catch (error) { throw repositoryError(error); }
});
ipcMain.handle('desktop:repository-delete', async (_event, collection, id) => {
  try {
    if (!sqliteStore) return false;
    collection = validateCollection(collection); id = validateRecordId(id);
    await getVaultKey();
    return sqliteStore.delete(collection, id);
  } catch (error) { throw repositoryError(error); }
});
ipcMain.handle('desktop:repository-count', async (_event, collection) => {
  try {
    if (!sqliteStore) return 0;
    collection = validateCollection(collection);
    await getVaultKey();
    return sqliteStore.count(collection);
  } catch (error) { throw repositoryError(error); }
});

ipcMain.handle('desktop:write-attachment', async (_event, input) => {
  try {
    if (!input || !input.id || !input.bytes) throw codedError('ATTACHMENT_INPUT_INVALID', '附件输入无效');
    input.id = validateAttachmentId(input.id);
    const key = await getVaultKey();
    const dir = await ensureDir(userDataPath('vault', 'attachments'));
    const target = path.join(dir, safeFileName(input.id, 'attachment.bin') + '.bin');
    const bytes = Buffer.from(input.bytes);
    if (bytes.length > 50 * 1024 * 1024) throw codedError('ATTACHMENT_SIZE_LIMIT', '附件超过 50MB 限制');
    await atomicWriteFile(target, encryptBuffer(bytes, key));
    await writeMainAudit('attachment_write', { id:input.id, size:bytes.length });
    return { id: input.id, path: target, size: bytes.length, mimeType: input.mimeType || 'application/octet-stream' };
  } catch (error) { throw repositoryError(error); }
});

ipcMain.handle('desktop:read-attachment', async (_event, id) => {
  try {
    id = validateAttachmentId(id);
    const key = await getVaultKey();
    const target = path.join(userDataPath('vault', 'attachments'), safeFileName(id, 'attachment.bin') + '.bin');
    const encrypted = await fs.readFile(target);
    return decryptBuffer(encrypted, key);
  } catch (error) { throw repositoryError(error); }
});
ipcMain.handle('desktop:delete-attachment', async (_event, id) => {
  try {
    id = validateAttachmentId(id);
    const target = path.join(userDataPath('vault', 'attachments'), safeFileName(id, 'attachment.bin') + '.bin');
    await fs.rm(target, { force: true }); await writeMainAudit('attachment_delete', { id }); return true;
  } catch (error) { throw repositoryError(error); }
});

ipcMain.handle('desktop:print-html-to-pdf', async (_event, html) => {
  const source = String(html || '');
  if (!source || source.length > 20 * 1024 * 1024) throw new Error('PRINT_HTML_TOO_LARGE');
  const printWindow = new BrowserWindow({
    show:false,
    width:1200,
    height:900,
    webPreferences:{ contextIsolation:true, sandbox:true, nodeIntegration:false, webSecurity:true },
  });
  try {
    await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(source));
    const pdf = await printWindow.webContents.printToPDF({ printBackground:true, preferCSSPageSize:true });
    await writeMainAudit('print_to_pdf', { bytes:pdf.length });
    return pdf;
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
});

ipcMain.handle('desktop:open-external', async (_event, url) => {
  const parsed = new URL(String(url));
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('EXTERNAL_URL_INVALID');
  await shell.openExternal(parsed.toString());
  return true;
});

app.whenReady().then(async () => {
  // Smoke runs always use an isolated user-data directory. Importing a real
  // user's legacy vault into it would both defeat isolation and make the
  // platform safe-storage key impossible to decrypt in the test profile.
  if (!process.env.CWB_DESKTOP_SMOKE) migrateDesktopData();
  if (process.env.CWB_DESKTOP_SMOKE) return runDesktopSmoke();
  return createWindow();
});
app.on('before-quit', event => {
  if (quitting) return;
  if (updateScheduler) updateScheduler.stop();
  if (!lanSyncHost) return;
  event.preventDefault();
  quitting = true;
  const host = lanSyncHost;
  lanSyncHost = null;
  host.stop().finally(() => app.quit());
});
app.on('window-all-closed', () => { if (sqliteStore) sqliteStore.close(); if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
