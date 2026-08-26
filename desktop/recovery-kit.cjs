const crypto = require('node:crypto');
const { normalizeKey, codedError } = require('./vault.cjs');

let argon2id;
try { ({ argon2id } = require('hash-wasm')); } catch (_) { argon2id = null; }

const RECOVERY_FORMAT = 'cwb-recovery-kit';
const RECOVERY_VERSION = 1;
const DEFAULT_PARAMS = Object.freeze({ iterations:3, memorySize:65536, parallelism:1, hashLength:32 });

function text(value) { return String(value == null ? '' : value).trim(); }
function b64(value) { return Buffer.from(value).toString('base64'); }
function fromB64(value, field) {
  const raw = text(value);
  const bytes = Buffer.from(raw, 'base64');
  if (!raw || !bytes.length || bytes.toString('base64') !== raw) throw codedError('RECOVERY_KIT_INVALID', `${field} 无效`);
  return bytes;
}

function validatePassword(password) {
  const value = String(password || '');
  if (value.length < 12 || value.length > 512) throw codedError('RECOVERY_PASSWORD_TOO_WEAK', '恢复口令至少需要 12 个字符');
  return value;
}

async function derive(password, salt, params) {
  if (typeof argon2id !== 'function') throw codedError('RECOVERY_KDF_UNAVAILABLE', '当前桌面运行时缺少 Argon2id 组件');
  const value = await argon2id({ password:validatePassword(password), salt, iterations:params.iterations, memorySize:params.memorySize, parallelism:params.parallelism, hashLength:params.hashLength, outputType:'binary' });
  return Buffer.from(value);
}

function validateEnvelope(input) {
  let envelope = input;
  if (Buffer.isBuffer(input) || typeof input === 'string') {
    try { envelope = JSON.parse(Buffer.from(input).toString('utf8')); }
    catch (error) { throw codedError('RECOVERY_KIT_INVALID', '恢复包不是有效 JSON', error); }
  }
  if (!envelope || envelope.format !== RECOVERY_FORMAT || Number(envelope.version) !== RECOVERY_VERSION || envelope.kdf !== 'argon2id' || !envelope.params) throw codedError('RECOVERY_KIT_INVALID', '恢复包版本或 KDF 无效');
  const params = Object.assign({}, DEFAULT_PARAMS, envelope.params);
  if (params.iterations < 2 || params.memorySize < 32768 || params.parallelism < 1 || params.hashLength !== 32) throw codedError('RECOVERY_KIT_INVALID', '恢复包 KDF 参数不符合安全边界');
  const salt = fromB64(envelope.salt, 'salt');
  const nonce = fromB64(envelope.nonce, 'nonce');
  const tag = fromB64(envelope.tag, 'tag');
  const ciphertext = fromB64(envelope.ciphertext, 'ciphertext');
  if (salt.length < 16 || nonce.length !== 12 || tag.length !== 16 || ciphertext.length !== 32) throw codedError('RECOVERY_KIT_INVALID', '恢复包加密载荷长度无效');
  return { envelope, params, salt, nonce, tag, ciphertext };
}

async function createRecoveryKit(masterKey, password, options) {
  const opts = options || {};
  const key = Buffer.from(normalizeKey(masterKey), 'base64');
  const params = Object.assign({}, DEFAULT_PARAMS, opts.params || {});
  const salt = opts.salt ? Buffer.from(opts.salt) : crypto.randomBytes(16);
  const nonce = opts.nonce ? Buffer.from(opts.nonce) : crypto.randomBytes(12);
  const derived = await derive(password, salt, params);
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, nonce);
  const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
  const envelope = {
    format:RECOVERY_FORMAT,
    version:RECOVERY_VERSION,
    kdf:'argon2id',
    params,
    salt:b64(salt),
    nonce:b64(nonce),
    tag:b64(cipher.getAuthTag()),
    ciphertext:b64(ciphertext),
    created_at:new Date().toISOString(),
  };
  return envelope;
}

async function recoverMasterKey(input, password) {
  const parsed = validateEnvelope(input);
  const derived = await derive(password, parsed.salt, parsed.params);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', derived, parsed.nonce);
    decipher.setAuthTag(parsed.tag);
    const key = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
    return normalizeKey(key.toString('base64'));
  } catch (error) {
    throw codedError('RECOVERY_PASSWORD_INVALID', '恢复口令不正确或恢复包不匹配', error);
  }
}

module.exports = { RECOVERY_FORMAT, RECOVERY_VERSION, DEFAULT_PARAMS, validatePassword, validateEnvelope, createRecoveryKit, recoverMasterKey };
