const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const os = require('node:os');
const net = require('node:net');
const { URL } = require('node:url');
const selfsigned = require('selfsigned');
const { createSyncHost, SCHEMA_VERSION, SYNC_PROTOCOL_VERSION } = require('../src/core/cwb-v48.js');

const MAX_JSON_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_CHUNK_BYTES = 1024 * 1024;
const STATE_FORMAT = 'CWB-SYNC-STATE-1';

function errorWithCode(code, message, cause) {
  const error = new Error(`${code}: ${message || code}`);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function text(value) { return String(value == null ? '' : value).trim(); }
function json(value) { return JSON.stringify(value); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
const ATTACHMENT_FORMAT = 'CWBSYNC1';
function attachmentKey(secret) { return crypto.createHash('sha256').update(`cwb-sync-attachment\0${String(secret)}`).digest(); }
function encryptAttachment(payload, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', attachmentKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(payload)), cipher.final()]);
  return Buffer.concat([Buffer.from(ATTACHMENT_FORMAT, 'ascii'), iv, cipher.getAuthTag(), ciphertext]);
}
function decryptAttachment(payload, secret) {
  const buffer = Buffer.from(payload);
  if (buffer.subarray(0, ATTACHMENT_FORMAT.length).toString('ascii') !== ATTACHMENT_FORMAT) throw errorWithCode('SYNC_ATTACHMENT_FORMAT_INVALID', '附件仓格式无效');
  if (buffer.length < ATTACHMENT_FORMAT.length + 28) throw errorWithCode('SYNC_ATTACHMENT_FORMAT_INVALID', '附件仓载荷不完整');
  try {
    const start = ATTACHMENT_FORMAT.length;
    const decipher = crypto.createDecipheriv('aes-256-gcm', attachmentKey(secret), buffer.subarray(start, start + 12));
    decipher.setAuthTag(buffer.subarray(start + 12, start + 28));
    return Buffer.concat([decipher.update(buffer.subarray(start + 28)), decipher.final()]);
  } catch (cause) { throw errorWithCode('SYNC_ATTACHMENT_DECRYPT_FAILED', '附件无法解密', cause); }
}
function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function safeName(value, label) {
  const name = text(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(name)) throw errorWithCode('SYNC_ATTACHMENT_ID_INVALID', `${label || '名称'}无效`);
  return name;
}
function atomicWriteSync(filePath, data, mode) {
  const target = path.resolve(filePath);
  fs.mkdirSync(path.dirname(target), { recursive:true });
  const temp = `${target}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  try {
    const handle = fs.openSync(temp, 'wx', mode || 0o600);
    try { fs.writeFileSync(handle, data); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
    fs.renameSync(temp, target);
  } catch (error) {
    try { fs.rmSync(temp, { force:true }); } catch (_) {}
    throw error;
  }
  try { fs.chmodSync(target, mode || 0o600); } catch (_) {}
  return target;
}
function encryptState(snapshot, secret) {
  const key = crypto.createHash('sha256').update(String(secret)).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(json(snapshot), 'utf8')), cipher.final()]);
  return Buffer.concat([Buffer.from(STATE_FORMAT, 'ascii'), iv, cipher.getAuthTag(), ciphertext]);
}
function decryptState(payload, secret) {
  const buffer = Buffer.from(payload);
  if (buffer.subarray(0, STATE_FORMAT.length).toString('ascii') !== STATE_FORMAT || buffer.length < STATE_FORMAT.length + 28) throw errorWithCode('SYNC_STATE_FORMAT_INVALID', '局域网同步状态文件格式无效');
  const key = crypto.createHash('sha256').update(String(secret)).digest();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, buffer.subarray(STATE_FORMAT.length, STATE_FORMAT.length + 12));
    decipher.setAuthTag(buffer.subarray(STATE_FORMAT.length + 12, STATE_FORMAT.length + 28));
    return JSON.parse(Buffer.concat([decipher.update(buffer.subarray(STATE_FORMAT.length + 28)), decipher.final()]).toString('utf8'));
  } catch (error) {
    throw errorWithCode('SYNC_STATE_DECRYPT_FAILED', '局域网同步状态无法解密，原文件未覆盖', error);
  }
}
function loadState(filePath, secret) {
  try { return decryptState(fs.readFileSync(filePath), secret); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
function persistState(filePath, secret, snapshot) { atomicWriteSync(filePath, encryptState(snapshot, secret)); }

function tlsAltNames(bindHost) {
  const values = [{ type:2, value:'localhost' }, { type:7, ip:'127.0.0.1' }];
  const host = text(bindHost);
  if (host && host !== '0.0.0.0' && host !== '::' && host !== 'localhost') {
    if (net.isIP(host)) values.push({ type:7, ip:host });
    else values.push({ type:2, value:host });
  }
  if (!host || host === '0.0.0.0' || host === '::') {
    for (const entries of Object.values(os.networkInterfaces())) for (const item of entries || []) {
      if (item && item.family === 'IPv4' && !item.internal && net.isIP(item.address)) values.push({ type:7, ip:item.address });
    }
  }
  const seen = new Set();
  return values.filter(item => { const key = `${item.type}:${item.ip || item.value}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

function tlsNamesMatch(certificate, bindHost) {
  if (!certificate || !certificate.subjectAltName || typeof certificate.checkHost !== 'function') return false;
  return tlsAltNames(bindHost).every(item => {
    try { return Boolean(certificate.checkHost(item.ip || item.value)); }
    catch (_) { return false; }
  });
}

async function ensureTls(tlsDir, bindHost) {
  const keyPath = path.join(tlsDir, 'host-key.pem');
  const certPath = path.join(tlsDir, 'host-cert.pem');
  await fsp.mkdir(tlsDir, { recursive:true });
  try {
    const [key, cert] = await Promise.all([fsp.readFile(keyPath, 'utf8'), fsp.readFile(certPath, 'utf8')]);
    const parsed = new crypto.X509Certificate(cert);
    if (tlsNamesMatch(parsed, bindHost)) return { key, cert };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const generated = selfsigned.generate([{ name:'commonName', value:'Counselor Desk LAN' }], {
    keySize:2048,
    days:365,
    algorithm:'sha256',
    extensions:[
      { name:'basicConstraints', cA:false },
      { name:'keyUsage', keyUsages:['digitalSignature', 'keyEncipherment'] },
      { name:'extKeyUsage', usages:['serverAuth'] },
      { name:'subjectAltName', altNames:tlsAltNames(bindHost) },
    ],
  });
  atomicWriteSync(keyPath, Buffer.from(generated.private, 'utf8'));
  atomicWriteSync(certPath, Buffer.from(generated.cert, 'utf8'));
  return { key:generated.private, cert:generated.cert };
}

function readBody(request, maxBytes) {
  const max = Number(maxBytes || MAX_JSON_BYTES);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > max) { reject(errorWithCode('SYNC_REQUEST_TOO_LARGE', '请求超过大小限制')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}
function parseJsonBody(buffer) {
  if (!buffer.length) return {};
  try { return JSON.parse(buffer.toString('utf8')); }
  catch (error) { throw errorWithCode('SYNC_JSON_INVALID', '请求 JSON 无效', error); }
}
function send(response, status, body, headers) {
  const payload = Buffer.from(json(body), 'utf8');
  response.writeHead(status, Object.assign({ 'content-type':'application/json; charset=utf-8', 'content-length':payload.length, 'cache-control':'no-store' }, headers || {}));
  response.end(payload);
}
function sendBinary(response, status, payload, headers) {
  const value = Buffer.from(payload);
  response.writeHead(status, Object.assign({ 'content-type':'application/octet-stream', 'content-length':value.length, 'cache-control':'no-store', 'x-content-type-options':'nosniff' }, headers || {}));
  response.end(value);
}
function errorStatus(error) {
  const code = text(error && (error.code || String(error.message || '').split(':')[0]));
  if (code === 'SYNC_STATE_PERSIST_FAILED') return 503;
  if (['SYNC_DEVICE_UNAUTHORIZED', 'SYNC_HOST_TOKEN_INVALID'].includes(code)) return 401;
  if (['SYNC_PAIRING_INVALID', 'SYNC_PAIRING_EXPIRED', 'SYNC_OPERATION_SCOPE_INVALID'].includes(code)) return 403;
  if (code === 'SYNC_PAIRING_RATE_LIMITED') return 429;
  if (['SYNC_CONFLICT_NOT_FOUND', 'SYNC_UPLOAD_NOT_FOUND', 'SYNC_ATTACHMENT_NOT_FOUND'].includes(code)) return 404;
  if (code === 'SYNC_UPLOAD_DEVICE_SCOPE_INVALID') return 403;
  if (['SYNC_ATTACHMENT_CONFLICT', 'SYNC_ATTACHMENT_INCOMPLETE'].includes(code)) return 409;
  if (['SYNC_REQUEST_TOO_LARGE', 'SYNC_ATTACHMENT_TOO_LARGE'].includes(code)) return 413;
  if (code.startsWith('SYNC_')) return 400;
  return 500;
}

async function createLanSyncHost(options) {
  const opts = options || {};
  const requestedDataDir = text(opts.dataDir);
  const dataDir = path.resolve(requestedDataDir);
  const stateSecret = text(opts.stateSecret);
  if (!requestedDataDir || !stateSecret) throw errorWithCode('SYNC_CONFIGURATION_INVALID', '局域网主机必须提供数据目录和工作区密钥');
  await fsp.mkdir(dataDir, { recursive:true });
  const bindHost = text(opts.host) || '127.0.0.1';
  const tls = await ensureTls(path.join(dataDir, 'tls'), bindHost);
  const certificate = new crypto.X509Certificate(tls.cert);
  const fingerprint = certificate.fingerprint256.toLowerCase();
  const statePath = path.join(dataDir, 'sync-state.cwb');
  const initialState = loadState(statePath, stateSecret);
  const attachmentDir = path.join(dataDir, 'attachments');
  const uploadDir = path.join(attachmentDir, '.sync-uploads');
  await fsp.mkdir(uploadDir, { recursive:true });
  const hashToken = value => sha256(Buffer.from(String(value || ''), 'utf8'));
  const audit = typeof opts.audit === 'function' ? opts.audit : () => {};
  function auditEvent(action, details) {
    try { const result = audit(action, details || {}); if (result && typeof result.catch === 'function') result.catch(() => {}); } catch (_) {}
  }
  let server;
  let address;
  const adminToken = crypto.randomBytes(32).toString('base64url');
  const uploads = new Map();
  const sync = createSyncHost({
    workspace_id:text(opts.workspace_id) || 'workspace-local',
    allowedCollections:opts.allowedCollections,
    hashToken,
    recordStore:opts.recordStore,
    audit,
    initialState,
    persist:snapshot => {
      try { return persistState(statePath, stateSecret, snapshot); }
      catch (error) { throw errorWithCode('SYNC_STATE_PERSIST_FAILED', '局域网同步状态无法保存，当前操作已回滚', error); }
    },
  });

  function requireDevice(request) {
    const header = text(request.headers.authorization);
    if (!header.startsWith('Bearer ')) throw errorWithCode('SYNC_DEVICE_UNAUTHORIZED', '缺少设备令牌');
    return header.slice(7).trim();
  }
  function requireAdmin(request) {
    if (!constantTimeEqual(request.headers['x-cwb-host-token'], adminToken)) throw errorWithCode('SYNC_HOST_TOKEN_INVALID', '主机确认令牌无效');
  }
  function uploadPath(uploadId) { return path.join(uploadDir, `${safeName(uploadId, '上传任务')}.part`); }
  function uploadChunksPath(uploadId) { return path.join(uploadDir, `${safeName(uploadId, '上传任务')}.chunks`); }
  function uploadChunkPath(uploadId, offset) { return path.join(uploadChunksPath(uploadId), `${String(offset)}.chunk`); }
  function uploadMetaPath(uploadId) { return path.join(uploadDir, `${safeName(uploadId, '上传任务')}.json`); }
  function normalizeUploadMetadata(value, expectedUploadId) {
    const source = value && typeof value === 'object' ? value : {};
    const uploadId = safeName(source.upload_id, '上传任务');
    if (expectedUploadId && uploadId !== expectedUploadId) throw errorWithCode('SYNC_UPLOAD_METADATA_INVALID', '附件上传任务 ID 不一致');
    const attachmentId = safeName(source.attachment_id, '附件 ID');
    const size = Number(source.size);
    const digest = text(source.sha256).toLowerCase();
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ATTACHMENT_BYTES || !/^[a-f0-9]{64}$/.test(digest)) throw errorWithCode('SYNC_UPLOAD_METADATA_INVALID', '附件上传任务元数据无效');
    if (source.received != null && !Array.isArray(source.received)) throw errorWithCode('SYNC_UPLOAD_METADATA_INVALID', '附件上传任务分块记录无效');
    const received = (Array.isArray(source.received) ? source.received : []).map(range => {
      if (!Array.isArray(range) || range.length !== 2) throw errorWithCode('SYNC_UPLOAD_METADATA_INVALID', '附件上传任务分块范围无效');
      const start = Number(range[0]); const end = Number(range[1]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > size) throw errorWithCode('SYNC_UPLOAD_METADATA_INVALID', '附件上传任务分块范围越界');
      return [start, end];
    }).sort((left, right) => left[0] - right[0]);
    for (let index = 1; index < received.length; index += 1) if (received[index][0] < received[index - 1][1]) throw errorWithCode('SYNC_UPLOAD_METADATA_INVALID', '附件上传任务分块范围重叠');
    const deviceId = text(source.device_id);
    if (deviceId.length > 160 || /[\x00-\x1f\x7f]/.test(deviceId)) throw errorWithCode('SYNC_UPLOAD_METADATA_INVALID', '附件上传设备标识无效');
    return Object.assign({}, source, { upload_id:uploadId, attachment_id:attachmentId, device_id:deviceId, size, sha256:digest, received, name:text(source.name).slice(0, 240), mime_type:text(source.mime_type).slice(0, 160) || 'application/octet-stream' });
  }
  function contiguousOffset(meta) {
    let offset = 0;
    for (const range of meta.received || []) {
      if (range[0] > offset) break;
      offset = Math.max(offset, range[1]);
    }
    return offset;
  }
  async function removeUploadArtifacts(uploadId) {
    const key = safeName(uploadId, '上传任务');
    await Promise.all([
      fsp.rm(uploadPath(key), { force:true }),
      fsp.rm(uploadChunksPath(key), { force:true, recursive:true }),
      fsp.rm(uploadMetaPath(key), { force:true }),
    ]);
    uploads.delete(key);
  }
  async function loadUploadMetadata() {
    let entries = [];
    try { entries = await fsp.readdir(uploadDir, { withFileTypes:true }); } catch (_) { return; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const uploadId = entry.name.slice(0, -5);
      try {
        const meta = normalizeUploadMetadata(JSON.parse(await fsp.readFile(path.join(uploadDir, entry.name), 'utf8')), uploadId);
        if (!meta.completed) uploads.set(uploadId, meta);
      } catch (error) {
        auditEvent('sync_upload_metadata_ignored', { upload_id:uploadId, code:error.code || 'SYNC_UPLOAD_METADATA_INVALID' });
      }
    }
  }
  async function cleanupUploads(maxAgeMs) {
    const maxAge = Math.max(60 * 1000, Number(maxAgeMs) || 24 * 60 * 60 * 1000);
    const cutoff = Date.now() - maxAge;
    let removed = 0;
    let removedUploads = 0;
    let entries = [];
    try { entries = await fsp.readdir(uploadDir, { withFileTypes:true }); } catch (_) { return 0; }
    const groups = new Map();
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isDirectory()) continue;
      const match = entry.name.match(/^(.*)\.(json|part|chunks)$/);
      if (!match) continue;
      const target = path.join(uploadDir, entry.name);
      try {
        const stat = await fsp.stat(target);
        const group = groups.get(match[1]) || { newest:0, items:[] };
        group.newest = Math.max(group.newest, stat.mtimeMs);
        group.items.push({ entry, target });
        groups.set(match[1], group);
      } catch (_) {}
    }
    for (const [uploadId, group] of groups) {
      if (group.newest >= cutoff) continue;
      for (const item of group.items) {
        try { await fsp.rm(item.target, { force:true, recursive:item.entry.isDirectory() }); removed += 1; } catch (_) {}
      }
      uploads.delete(uploadId);
      removedUploads += 1;
    }
    if (removed) auditEvent('sync_uploads_cleaned', { removed, uploads:removedUploads });
    return removed;
  }
  function assertUploadOwner(meta, deviceId) {
    const owner = text(deviceId);
    if (!owner || !meta || !text(meta.device_id) || text(meta.device_id) !== owner) throw errorWithCode('SYNC_UPLOAD_DEVICE_SCOPE_INVALID', '附件上传任务属于其他设备或旧版本未绑定设备');
  }
  async function initUpload(input, deviceId) {
    const owner = text(deviceId);
    if (!owner) throw errorWithCode('SYNC_DEVICE_UNAUTHORIZED', '设备标识无效');
    const attachmentId = safeName(input && input.attachment_id, '附件 ID');
    const size = Number(input && input.size);
    const expectedHash = text(input && input.sha256).toLowerCase();
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ATTACHMENT_BYTES) throw errorWithCode('SYNC_ATTACHMENT_TOO_LARGE', '附件超过 50MB 限制');
    if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw errorWithCode('SYNC_ATTACHMENT_HASH_INVALID', '附件 SHA-256 无效');
    for (const meta of uploads.values()) if (meta.attachment_id === attachmentId && meta.sha256 === expectedHash && meta.device_id === owner && !meta.completed) return { upload_id:meta.upload_id, offset:contiguousOffset(meta), chunk_size:MAX_CHUNK_BYTES };
    const uploadId = crypto.randomBytes(18).toString('hex');
    const meta = { upload_id:uploadId, attachment_id:attachmentId, device_id:owner, size, sha256:expectedHash, name:text(input && input.name).slice(0, 240), mime_type:text(input && input.mime_type).slice(0, 160) || 'application/octet-stream', received:[], created_at:new Date().toISOString() };
    fs.mkdirSync(uploadChunksPath(uploadId), { recursive:false, mode:0o700 });
    uploads.set(uploadId, meta);
    atomicWriteSync(uploadMetaPath(uploadId), Buffer.from(json(meta), 'utf8'));
    return { upload_id:uploadId, offset:0, chunk_size:1024 * 1024 };
  }
  function getUpload(uploadId, deviceId) {
    const key = safeName(uploadId, '上传任务');
    const memory = uploads.get(key);
    if (memory) {
      const normalized = normalizeUploadMetadata(memory, key);
      assertUploadOwner(normalized, deviceId); uploads.set(key, normalized);
      return normalized;
    }
    try {
      const meta = normalizeUploadMetadata(JSON.parse(fs.readFileSync(uploadMetaPath(key), 'utf8')), key);
      assertUploadOwner(meta, deviceId); uploads.set(key, meta); return meta;
    } catch (error) { if (error.code === 'ENOENT') throw errorWithCode('SYNC_UPLOAD_NOT_FOUND', '附件上传任务不存在'); throw errorWithCode('SYNC_UPLOAD_METADATA_INVALID', '附件上传任务元数据无效', error); }
  }
  function receivedBytes(meta) { return meta.received.reduce((sum, range) => sum + Math.max(0, range[1] - range[0]), 0); }
  function addRange(meta, start, end) {
    const ranges = meta.received.concat([[start, end]]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    ranges.forEach(range => { const last = merged[merged.length - 1]; if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]); else merged.push(range); });
    meta.received = merged;
  }
  async function writeChunk(uploadId, offset, buffer, deviceId) {
    const meta = getUpload(uploadId, deviceId);
    const start = Number(offset);
    if (!buffer.length) throw errorWithCode('SYNC_ATTACHMENT_CHUNK_EMPTY', '附件分块不能为空');
    if (!Number.isSafeInteger(start) || start < 0 || start + buffer.length > meta.size) throw errorWithCode('SYNC_ATTACHMENT_OFFSET_INVALID', '附件分块偏移无效');
    await fsp.mkdir(uploadChunksPath(meta.upload_id), { recursive:true, mode:0o700 });
    // Keep resumable chunks encrypted at rest as well. Each chunk has its own
    // authenticated envelope, so offsets remain plaintext offsets without
    // requiring a random-access stream cipher or a plaintext staging file.
    atomicWriteSync(uploadChunkPath(meta.upload_id, start), encryptAttachment(buffer, stateSecret), 0o600);
    addRange(meta, start, start + buffer.length); atomicWriteSync(uploadMetaPath(meta.upload_id), Buffer.from(json(meta), 'utf8'));
    return { upload_id:meta.upload_id, offset:contiguousOffset(meta), received:receivedBytes(meta), size:meta.size };
  }
  async function completeUpload(uploadId, deviceId) {
    const meta = getUpload(uploadId, deviceId);
    if (!(meta.size === 0 || (meta.received.length === 1 && meta.received[0][0] === 0 && meta.received[0][1] === meta.size))) throw errorWithCode('SYNC_ATTACHMENT_INCOMPLETE', '附件仍有未上传分块');
    const file = Buffer.alloc(meta.size);
    let chunkEntries = [];
    try { chunkEntries = await fsp.readdir(uploadChunksPath(meta.upload_id), { withFileTypes:true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const entry of chunkEntries) {
      if (!entry.isFile() || !entry.name.endsWith('.chunk')) continue;
      const offset = Number(entry.name.slice(0, -6));
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > meta.size) throw errorWithCode('SYNC_ATTACHMENT_OFFSET_INVALID', '附件临时分块偏移无效');
      const encrypted = await fsp.readFile(path.join(uploadChunksPath(meta.upload_id), entry.name));
      let chunk;
      try { chunk = decryptAttachment(encrypted, stateSecret); } catch (error) { throw error; }
      if (offset + chunk.length > meta.size) throw errorWithCode('SYNC_ATTACHMENT_OFFSET_INVALID', '附件临时分块超出范围');
      chunk.copy(file, offset);
    }
    if (sha256(file) !== meta.sha256) { await removeUploadArtifacts(meta.upload_id); throw errorWithCode('SYNC_ATTACHMENT_HASH_MISMATCH', '附件 SHA-256 校验失败'); }
    const target = path.join(attachmentDir, `${meta.attachment_id}.bin`);
    try {
      const stored = await fsp.readFile(target);
      let existing;
      try { existing = decryptAttachment(stored, stateSecret); }
      catch (error) {
        if (error.code !== 'SYNC_ATTACHMENT_FORMAT_INVALID') throw error;
        // Upgrade legacy candidate files that were written before encrypted
        // attachment-at-rest support. They are re-encrypted on first access.
        existing = stored;
      }
      if (sha256(existing) !== meta.sha256) throw errorWithCode('SYNC_ATTACHMENT_CONFLICT', '同名附件已存在且内容不同');
      if (stored.subarray(0, ATTACHMENT_FORMAT.length).toString('ascii') !== ATTACHMENT_FORMAT) atomicWriteSync(target, encryptAttachment(existing, stateSecret), 0o600);
      await removeUploadArtifacts(meta.upload_id); auditEvent('sync_attachment_deduplicated', { upload_id:meta.upload_id, attachment_id:meta.attachment_id, size:meta.size, sha256:meta.sha256 }); return { upload_id:meta.upload_id, attachment_id:meta.attachment_id, name:meta.name, mime_type:meta.mime_type, deduplicated:true, size:meta.size, sha256:meta.sha256 };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    atomicWriteSync(target, encryptAttachment(file, stateSecret), 0o600); await removeUploadArtifacts(meta.upload_id); auditEvent('sync_attachment_completed', { upload_id:meta.upload_id, attachment_id:meta.attachment_id, size:meta.size, sha256:meta.sha256 });
    return { upload_id:meta.upload_id, attachment_id:meta.attachment_id, name:meta.name, mime_type:meta.mime_type, deduplicated:false, size:meta.size, sha256:meta.sha256 };
  }
  async function route(request, response) {
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
    const pathname = requestUrl.pathname;
    if (request.method === 'GET' && pathname === '/api/v1/health') {
      send(response, 200, { ok:true, tls:true, fingerprint, schema_version:8, data_schema_version:SCHEMA_VERSION, sync_protocol_version:SYNC_PROTOCOL_VERSION, status:sync.status() }); return;
    }
    if (request.method === 'POST' && pathname === '/api/v1/pairing/request') { send(response, 200, { ok:true, request:sync.requestPairing(parseJsonBody(await readBody(request))) }); return; }
    if (request.method === 'GET' && pathname === '/api/v1/pairing/result') { const requestId = requestUrl.searchParams.get('request_id'); const deviceId = requestUrl.searchParams.get('device_id'); send(response, 200, { ok:true, result:sync.getPairingResult(requestId, deviceId) }); return; }
    if (request.method === 'POST' && pathname === '/api/v1/pairing/confirm') { requireAdmin(request); const body = parseJsonBody(await readBody(request)); send(response, 200, { ok:true, result:sync.confirmPairing(body.request_id, body.approve !== false) }); return; }
    const token = requireDevice(request);
    // Every device route, including conflict and attachment operations, must
    // authenticate the bearer token. Presence of an Authorization header is
    // not authorization and must never be treated as such.
    const device = sync.authenticate(token);
    if (request.method === 'GET' && pathname === '/api/v1/workspace/manifest') { send(response, 200, { ok:true, workspace_id:text(opts.workspace_id) || 'workspace-local', schema_version:8, data_schema_version:SCHEMA_VERSION, sync_protocol_version:SYNC_PROTOCOL_VERSION, fingerprint, collections:opts.allowedCollections || [] }); return; }
    if (request.method === 'POST' && pathname === '/api/v1/sync/push') { send(response, 200, Object.assign({ ok:true }, sync.push(token, parseJsonBody(await readBody(request)).operations || []))); return; }
    if (request.method === 'POST' && pathname === '/api/v1/sync/pull') { const body = parseJsonBody(await readBody(request)); send(response, 200, Object.assign({ ok:true }, sync.pull(token, body.cursor || 0))); return; }
    if (request.method === 'GET' && pathname === '/api/v1/sync/conflicts') { send(response, 200, { ok:true, conflicts:sync.listConflicts() }); return; }
    if (request.method === 'POST' && pathname === '/api/v1/sync/conflicts/resolve') { const body = parseJsonBody(await readBody(request)); send(response, 200, { ok:true, conflict:sync.resolveConflict(body.conflict_id, body.choice) }); return; }
    if (request.method === 'POST' && pathname === '/api/v1/attachments/init') { send(response, 200, { ok:true, upload:await initUpload(parseJsonBody(await readBody(request)), device.id) }); return; }
    if (request.method === 'PUT' && pathname === '/api/v1/attachments/chunk') { const uploadId = requestUrl.searchParams.get('upload_id'); const offset = requestUrl.searchParams.get('offset'); send(response, 200, { ok:true, upload:await writeChunk(uploadId, offset, await readBody(request, MAX_CHUNK_BYTES), device.id) }); return; }
    if (request.method === 'POST' && pathname === '/api/v1/attachments/complete') { const body = parseJsonBody(await readBody(request)); send(response, 200, { ok:true, attachment:await completeUpload(body.upload_id, device.id) }); return; }
    const attachmentMatch = pathname.match(/^\/api\/v1\/attachments\/([^/]+)$/);
    if (request.method === 'GET' && attachmentMatch) {
      const attachmentId = safeName(decodeURIComponent(attachmentMatch[1]), '附件 ID');
      const target = path.join(attachmentDir, `${attachmentId}.bin`);
      let stored; try { stored = await fsp.readFile(target); } catch (error) { if (error.code === 'ENOENT') throw errorWithCode('SYNC_ATTACHMENT_NOT_FOUND', '附件不存在'); throw error; }
      let bytes;
      try { bytes = decryptAttachment(stored, stateSecret); }
      catch (error) {
        if (error.code !== 'SYNC_ATTACHMENT_FORMAT_INVALID') throw error;
        bytes = stored;
        // Legacy candidate files were written before attachment-at-rest
        // encryption. Upgrade them before returning any bytes so a download
        // cannot leave the vault in plaintext after the compatibility read.
        atomicWriteSync(target, encryptAttachment(bytes, stateSecret), 0o600);
        auditEvent('sync_attachment_reencrypted_legacy', { attachment_id:attachmentId, size:bytes.length, sha256:sha256(bytes) });
      }
      if (bytes.length > MAX_ATTACHMENT_BYTES) throw errorWithCode('SYNC_ATTACHMENT_TOO_LARGE', '附件超过 50MB 限制');
      sendBinary(response, 200, bytes); return;
    }
    throw errorWithCode('SYNC_ROUTE_NOT_FOUND', '同步接口不存在');
  }
  async function start() {
    if (server) return status();
    await loadUploadMetadata();
    await cleanupUploads();
    server = https.createServer({ key:tls.key, cert:tls.cert, minVersion:'TLSv1.2' }, (request, response) => { route(request, response).catch(error => { if (!response.headersSent) { const code = text(error && (error.code || String(error.message || '').split(':')[0])) || 'SYNC_INTERNAL_ERROR'; send(response, errorStatus(error), { ok:false, code, message:errorStatus(error) >= 500 ? '局域网同步服务内部错误' : error.message }); } else response.destroy(); }); });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(opts.port || 0), bindHost, resolve); });
    address = server.address(); return status({ admin_token:adminToken });
  }
  async function stop() { if (!server) return; await new Promise(resolve => server.close(resolve)); server = null; address = null; }
  function status(extra) {
    const host = address && address.address || bindHost;
    const port = address && address.port || Number(opts.port || 0);
    const visibleHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    const baseUrl = server ? ['https://', visibleHost, ':', String(port)].join('') : '';
    const addresses = host === '0.0.0.0' ? Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address) : [host];
    return Object.assign({ running:Boolean(server), host, port, base_url:baseUrl, addresses, fingerprint, state_path:statePath, status:sync.status() }, extra || {});
  }
  return Object.freeze({ start, stop, status, cleanupUploads, createPairingCode:sync.createPairingCode, confirmPairing:sync.confirmPairing, getPairingResult:sync.getPairingResult, pauseDevice:sync.pauseDevice, resumeDevice:sync.resumeDevice, revokeDevice:sync.revokeDevice, listConflicts:sync.listConflicts, sync });
}

module.exports = { createLanSyncHost, encryptState, decryptState, loadState, persistState, encryptAttachment, decryptAttachment, MAX_ATTACHMENT_BYTES };
