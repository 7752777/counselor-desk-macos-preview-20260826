const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const VAULT_FORMAT = 'cwb-vault-key';
const VAULT_VERSION = 1;

function codedError(code, message, cause) {
  const error = new Error(`${code}: ${message || code}`);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function normalizeKey(value) {
  const text = String(value || '');
  const bytes = Buffer.from(text, 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== text) {
    throw codedError('VAULT_KEY_FORMAT_INVALID', '工作区主密钥格式无效');
  }
  return text;
}

function envelopeBuffer(payload, algorithm, extra) {
  return Buffer.from(JSON.stringify(Object.assign({
    format:VAULT_FORMAT,
    version:VAULT_VERSION,
    algorithm,
    payload:Buffer.from(payload).toString('base64'),
    created_at:new Date().toISOString(),
  }, extra || {})), 'utf8');
}

function parseEnvelope(stored) {
  const text = Buffer.from(stored).toString('utf8').trim();
  if (!text.startsWith('{')) return null;
  let envelope;
  try { envelope = JSON.parse(text); }
  catch (error) { throw codedError('VAULT_KEY_FORMAT_INVALID', '工作区主密钥文件不是有效格式', error); }
  if (!envelope || envelope.format !== VAULT_FORMAT || Number(envelope.version) !== VAULT_VERSION || typeof envelope.algorithm !== 'string' || typeof envelope.payload !== 'string') {
    throw codedError('VAULT_KEY_FORMAT_INVALID', '工作区主密钥版本或字段无效');
  }
  const payload = Buffer.from(envelope.payload, 'base64');
  if (!payload.length || payload.toString('base64') !== envelope.payload) throw codedError('VAULT_KEY_FORMAT_INVALID', '工作区主密钥载荷无效');
  return { envelope, payload };
}

function decodeVaultKey(stored, safeStorage, options) {
  const opts = options || {};
  const parsed = parseEnvelope(stored);
  if (parsed) {
    if (parsed.envelope.algorithm === 'smoke-test' && opts.allowSmoke) {
      return normalizeKey(parsed.payload.toString('utf8'));
    }
    if (parsed.envelope.algorithm !== 'electron-safe-storage' || !safeStorage || !safeStorage.isEncryptionAvailable()) {
      throw codedError('SAFE_STORAGE_UNAVAILABLE', '系统安全存储不可用，无法解锁工作区');
    }
    let raw;
    try { raw = safeStorage.decryptString(parsed.payload); }
    catch (error) { throw codedError('VAULT_KEY_DECRYPT_FAILED', '工作区主密钥无法由系统安全存储解密', error); }
    return normalizeKey(raw);
  }
  if (opts.allowSmoke) return normalizeKey(Buffer.from(stored).toString('utf8').trim());
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) throw codedError('SAFE_STORAGE_UNAVAILABLE', '系统安全存储不可用，无法解锁工作区');
  let raw;
  try { raw = safeStorage.decryptString(Buffer.from(stored)); }
  catch (error) { throw codedError('VAULT_KEY_DECRYPT_FAILED', '旧版工作区主密钥无法由系统安全存储解密', error); }
  return normalizeKey(raw);
}

async function atomicWriteFile(filePath, data, options) {
  const opts = options || {};
  const target = path.resolve(filePath);
  await fs.mkdir(path.dirname(target), { recursive:true });
  if (opts.exclusive) {
    let handle;
    try {
      handle = await fs.open(target, 'wx');
      await handle.writeFile(data);
      await handle.sync();
      return target;
    } finally {
      if (handle) await handle.close();
    }
  }
  const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await fs.open(temp, 'wx');
    await handle.writeFile(data);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temp, target);
    return target;
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await fs.rm(temp, { force:true }).catch(() => {});
    throw error;
  }
}

function encodeVaultKey(raw, safeStorage, options) {
  const opts = options || {};
  const key = normalizeKey(raw);
  if (opts.allowSmoke && (!safeStorage || !safeStorage.isEncryptionAvailable())) return envelopeBuffer(Buffer.from(key, 'utf8'), 'smoke-test');
  if (!safeStorage || !safeStorage.isEncryptionAvailable()) throw codedError('SAFE_STORAGE_UNAVAILABLE', '系统安全存储不可用，不能写入工作区主密钥');
  let encrypted;
  try { encrypted = safeStorage.encryptString(key); }
  catch (error) { throw codedError('SAFE_STORAGE_UNAVAILABLE', '系统安全存储无法写入工作区主密钥', error); }
  return envelopeBuffer(encrypted, 'electron-safe-storage');
}

async function loadOrCreateVaultKey(options) {
  const opts = options || {};
  const keyPath = path.resolve(opts.keyPath);
  const smoke = Boolean(opts.allowSmoke);
  try {
    return decodeVaultKey(await fs.readFile(keyPath), opts.safeStorage, { allowSmoke:smoke });
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }
  if (!smoke && (!opts.safeStorage || !opts.safeStorage.isEncryptionAvailable())) throw codedError('SAFE_STORAGE_UNAVAILABLE', '系统安全存储不可用，不能初始化工作区');
  const raw = crypto.randomBytes(32).toString('base64');
  const encoded = encodeVaultKey(raw, opts.safeStorage, { allowSmoke:smoke });
  try {
    await atomicWriteFile(keyPath, encoded, { exclusive:true });
    return raw;
  } catch (error) {
    if (error && error.code !== 'EEXIST') throw error;
    return decodeVaultKey(await fs.readFile(keyPath), opts.safeStorage, { allowSmoke:smoke });
  }
}

async function writeVaultKey(filePath, raw, safeStorage, options) {
  const encoded = encodeVaultKey(raw, safeStorage, options);
  return atomicWriteFile(filePath, encoded);
}

module.exports = {
  VAULT_FORMAT,
  VAULT_VERSION,
  codedError,
  normalizeKey,
  parseEnvelope,
  decodeVaultKey,
  encodeVaultKey,
  atomicWriteFile,
  loadOrCreateVaultKey,
  writeVaultKey,
};
