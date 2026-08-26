'use strict';

const dns = require('node:dns').promises;
const crypto = require('node:crypto');
const https = require('node:https');
const net = require('node:net');
const relayLicense = require('../src/core/cwb-license-relay.js');

const RELAY_PATH = '/api/ai/chat';
const TRANSCRIBE_RELAY_PATH = '/api/ai/transcribe';
const SOURCE_RELAY_PATH = '/api/ai/source';
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_AUDIO_REQUEST_BYTES = 36 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 45 * 1000;
const DEFAULT_SOURCE_TIMEOUT_MS = 8 * 1000;
const DEFAULT_MANAGED_DAILY_QUOTA = 30;
const ALLOWED_PROTOCOLS = new Set(['openai-compatible', 'anthropic', 'gemini']);
const DEFAULT_ORIGINS = new Set(['http://127.0.0.1:4173', 'http://localhost:4173']);
const DEFAULT_HOSTS = new Set([
  'api.openai.com', 'api.deepseek.com', 'generativelanguage.googleapis.com', 'api.anthropic.com',
  'dashscope.aliyuncs.com', 'open.bigmodel.cn', 'ark.cn-beijing.volces.com', 'api.moonshot.cn',
  'queqiao.online',
]);
const SENSITIVE_SOURCE_QUERY = /(?:api[-_]?key|access[-_]?token|auth|code|credential|email|key|mobile|name|password|passwd|phone|refresh[-_]?token|secret|session|sig(?:nature)?|student|ticket|token|uid)/i;

function createManagedQuotaLimiter(options) {
  const opts = options || {};
  const limit = Math.max(1, Number(opts.dailyLimit || DEFAULT_MANAGED_DAILY_QUOTA));
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const rows = new Map();
  return async assertion => {
    const payload = assertion && assertion.license_id ? assertion : {};
    const licenseId = String(payload.license_id || '').trim();
    if (!licenseId) throw new Error('AI_LICENSE_ASSERTION_INVALID');
    const day = new Date(now()).toISOString().slice(0, 10);
    const key = `${licenseId}:${day}`;
    const count = Number(rows.get(key) || 0) + 1;
    if (count > limit) throw new Error('AI_MANAGED_QUOTA_EXCEEDED');
    rows.set(key, count);
    if (rows.size > 10_000) {
      const oldest = rows.keys().next().value;
      if (oldest) rows.delete(oldest);
    }
    return { license_id:licenseId, day, used:count, limit };
  };
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (net.isIPv4(value)) {
    const parts = value.split('.').map(Number);
    const [a, b, c] = parts;
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && b === 18) ||
      (a === 198 && b === 19) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224;
  }
  if (!net.isIPv6(value)) return false;
  if (value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') || value.startsWith('ff') || value.startsWith('2001:db8:')) return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice(7);
    if (net.isIPv4(mapped)) return isPrivateAddress(mapped);
    const parts = mapped.split(':');
    if (parts.length === 2 && parts.every(part => /^[0-9a-f]{1,4}$/.test(part))) {
      const high = Number.parseInt(parts[0], 16);
      const low = Number.parseInt(parts[1], 16);
      return isPrivateAddress(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
    }
  }
  return false;
}

function isLoopbackHost(hostname) {
  const value = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

function isPrivateHostname(hostname) {
  const value = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return value === 'localhost' || value.endsWith('.localhost') || value.endsWith('.local') || value.endsWith('.internal') || isPrivateAddress(value);
}

function parseAllowedOrigins(value) {
  if (value == null || String(value).trim() === '') return new Set(DEFAULT_ORIGINS);
  return new Set(String(value).split(',').map(item => item.trim()).filter(Boolean));
}

function parseAllowedHosts(value) {
  if (value == null || String(value).trim() === '') return new Set(DEFAULT_HOSTS);
  return new Set(String(value).split(',').map(item => item.trim().toLowerCase().replace(/\.$/, '')).filter(Boolean));
}

function readRequestBody(request, maxBytes = MAX_REQUEST_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    request.on('data', chunk => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      total += buffer.length;
      if (total > maxBytes) {
        fail(new Error('AI_RELAY_REQUEST_TOO_LARGE'));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.on('error', fail);
  });
}

async function resolveTarget(rawUrl, lookup = dns.lookup, allowedHosts = parseAllowedHosts()) {
  let target;
  try { target = new URL(String(rawUrl || '')); } catch (_) { throw new Error('AI_RELAY_TARGET_INVALID'); }
  const hostname = target.hostname.toLowerCase().replace(/\.$/, '');
  if (target.protocol !== 'https:' || target.username || target.password || target.port && target.port !== '443' || target.search || target.hash) throw new Error('AI_RELAY_TARGET_REJECTED');
  if (!allowedHosts.has(hostname)) throw new Error('AI_RELAY_TARGET_HOST_FORBIDDEN');
  if (!/(?:\/chat\/completions|\/responses|\/messages|\/audio\/transcriptions)$/.test(target.pathname)) throw new Error('AI_RELAY_TARGET_REJECTED');
  if (isPrivateHostname(hostname)) throw new Error('AI_RELAY_TARGET_REJECTED');
  let addresses;
  try { addresses = await lookup(hostname, { all:true, verbatim:true }); } catch (_) { throw new Error('AI_RELAY_TARGET_UNRESOLVED'); }
  if (!Array.isArray(addresses) || !addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('AI_RELAY_TARGET_REJECTED');
  const address = addresses[0];
  return { url:target.toString(), target, address:address.address, family:address.family };
}

async function validateTarget(rawUrl, lookup = dns.lookup, allowedHosts = parseAllowedHosts()) {
  return (await resolveTarget(rawUrl, lookup, allowedHosts)).url;
}

function validatePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('AI_RELAY_REQUEST_INVALID');
  const protocol = String(input.protocol || '');
  const wireApi = String(input.wire_api || input.wireApi || '').trim();
  const apiKey = String(input.apiKey || '').trim();
  const credentialMode = String(input.credential_mode || input.credentialMode || 'user_key').trim();
  const body = input.body;
  if (!ALLOWED_PROTOCOLS.has(protocol) || !['user_key', 'managed_relay'].includes(credentialMode) || credentialMode === 'user_key' && !apiKey || apiKey.length > 4096 || !body || typeof body !== 'object' || Array.isArray(body)) throw new Error('AI_RELAY_REQUEST_INVALID');
  if (!String(body.model || '').trim() || (!Array.isArray(body.messages) && !Array.isArray(body.input))) throw new Error('AI_RELAY_REQUEST_INVALID');
  if (wireApi && !['chat_completions', 'responses'].includes(wireApi)) throw new Error('AI_RELAY_REQUEST_INVALID');
  const serializedBody = JSON.stringify(body);
  if (Buffer.byteLength(serializedBody, 'utf8') > MAX_REQUEST_BYTES) throw new Error('AI_RELAY_REQUEST_TOO_LARGE');
  return { url:input.url, protocol, wireApi, credentialMode, apiKey, body, licenseAssertion:String(input.license_assertion || '').trim() };
}

function validateAudioPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('AI_RELAY_REQUEST_INVALID');
  const protocol = String(input.protocol || '');
  const apiKey = String(input.apiKey || '').trim();
  const credentialMode = String(input.credential_mode || input.credentialMode || 'user_key').trim();
  const model = String(input.model || '').trim();
  const audioBase64 = String(input.audioBase64 || '').trim();
  if (protocol !== 'openai-compatible' || !['user_key', 'managed_relay'].includes(credentialMode) || credentialMode === 'user_key' && !apiKey || apiKey.length > 4096 || !model || !audioBase64 || audioBase64.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(audioBase64)) throw new Error('AI_RELAY_REQUEST_INVALID');
  const audio = Buffer.from(audioBase64, 'base64');
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw new Error(audio.length ? 'AI_RELAY_AUDIO_TOO_LARGE' : 'AI_RELAY_REQUEST_INVALID');
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > MAX_AUDIO_REQUEST_BYTES) throw new Error('AI_RELAY_REQUEST_TOO_LARGE');
  return {
    url:input.url, protocol, credentialMode, apiKey, model, licenseAssertion:String(input.license_assertion || '').trim(),
    fileName:String(input.fileName || 'counselor-voice.webm').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'counselor-voice.webm',
    mimeType:String(input.mimeType || 'audio/webm').split(';')[0].toLowerCase(), audio,
  };
}

async function verifyLicenseAssertion(value, options = {}) {
  if (options.requireLicense !== true) return { ok:true, skipped:true };
  const parsed = relayLicense.parse(value);
  await relayLicense.verifySignature(parsed, options.licensePublicKeys || {});
  return relayLicense.evaluate(parsed, { now:options.now == null ? Date.now() : options.now, requireManagedRelay:options.requireManagedRelay === true });
}

function readResponseBody(response, maxBytes = MAX_RESPONSE_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    response.on('data', chunk => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        fail(new Error('AI_RELAY_RESPONSE_TOO_LARGE'));
        response.destroy();
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    response.on('error', fail);
  });
}

function requestHttpsJson({ target, address, family, headers, body, timeoutMs }) {
  const serializedBody = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = https.request({
      protocol:'https:', hostname:address, port:target.port || 443, path:`${target.pathname}${target.search}`,
      method:'POST', servername:target.hostname,
      headers:Object.assign({}, headers, { host:target.host, 'content-length':Buffer.byteLength(serializedBody, 'utf8') }),
      lookup:(_hostname, _options, callback) => callback(null, address, family),
    }, response => {
      readResponseBody(response).then(bodyText => {
        if (settled) return;
        settled = true;
        resolve({ status:response.statusCode || 502, contentType:response.headers['content-type'] || 'application/json', body:bodyText });
      }).catch(fail);
    });
    request.setTimeout(timeoutMs, () => {
      const error = new Error('AI_RELAY_UPSTREAM_TIMEOUT');
      fail(error);
      request.destroy();
    });
    request.on('error', fail);
    request.write(serializedBody);
    request.end();
  });
}

function requestHttpsMultipart({ target, address, family, headers, payload, timeoutMs }) {
  const boundary = `----cwbAudio${crypto.randomBytes(12).toString('hex')}`;
  const parts = [
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${payload.model}\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nzh\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${payload.fileName}"\r\nContent-Type: ${payload.mimeType}\r\n\r\n`, 'utf8'),
    payload.audio,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ];
  const body = Buffer.concat(parts);
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = error => { if (settled) return; settled = true; reject(error); };
    const request = https.request({
      protocol:'https:', hostname:address, port:target.port || 443, path:`${target.pathname}${target.search}`,
      method:'POST', servername:target.hostname,
      headers:Object.assign({}, headers, { host:target.host, 'content-type':`multipart/form-data; boundary=${boundary}`, 'content-length':body.length }),
      lookup:(_hostname, _options, callback) => callback(null, address, family),
    }, response => {
      readResponseBody(response).then(bodyText => {
        if (settled) return;
        settled = true;
        resolve({ status:response.statusCode || 502, contentType:response.headers['content-type'] || 'application/json', body:bodyText });
      }).catch(fail);
    });
    request.setTimeout(timeoutMs, () => { fail(new Error('AI_RELAY_UPSTREAM_TIMEOUT')); request.destroy(); });
    request.on('error', fail);
    request.end(body);
  });
}

async function forwardAiRequest(input, options = {}) {
  const payload = validatePayload(input);
  const upstreamKey = payload.credentialMode === 'managed_relay' ? String(options.managedApiKey || process.env.CWB_AI_MANAGED_API_KEY || '').trim() : payload.apiKey;
  if (!upstreamKey) throw new Error(payload.credentialMode === 'managed_relay' ? 'AI_MANAGED_CREDENTIAL_UNAVAILABLE' : 'AI_RELAY_REQUEST_INVALID');
  const targetInfo = await resolveTarget(payload.url, options.lookup || dns.lookup, options.allowedHosts || parseAllowedHosts(process.env.AI_RELAY_HOSTS));
  const isAnthropic = payload.protocol === 'anthropic';
  const isResponses = /\/responses$/.test(targetInfo.target.pathname);
  if (isAnthropic !== /\/messages$/.test(targetInfo.target.pathname)) throw new Error('AI_RELAY_TARGET_PROTOCOL_MISMATCH');
  if (isResponses) {
    if (payload.protocol !== 'openai-compatible' || !Array.isArray(payload.body.input) || Array.isArray(payload.body.messages)) throw new Error('AI_RELAY_TARGET_PROTOCOL_MISMATCH');
  } else if (!isAnthropic && (!/\/chat\/completions$/.test(targetInfo.target.pathname) || !Array.isArray(payload.body.messages))) {
    throw new Error('AI_RELAY_TARGET_PROTOCOL_MISMATCH');
  }
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const headers = { 'content-type':'application/json' };
  if (isAnthropic) {
    headers['anthropic-version'] = '2023-06-01';
    headers['x-api-key'] = upstreamKey;
  } else headers.authorization = `Bearer ${upstreamKey}`;
  try {
    const requestImpl = options.requestImpl || requestHttpsJson;
    const result = await requestImpl({ target:targetInfo.target, address:targetInfo.address, family:targetInfo.family, headers, body:payload.body, timeoutMs });
    if (Buffer.byteLength(String(result.body || ''), 'utf8') > MAX_RESPONSE_BYTES) throw new Error('AI_RELAY_RESPONSE_TOO_LARGE');
    return result;
  } catch (error) {
    if (error && /^AI_RELAY_/.test(error.message || '')) throw error;
    throw new Error('AI_RELAY_UPSTREAM_UNAVAILABLE');
  }
}

async function forwardAudioRequest(input, options = {}) {
  const payload = validateAudioPayload(input);
  const upstreamKey = payload.credentialMode === 'managed_relay' ? String(options.managedApiKey || process.env.CWB_AI_MANAGED_API_KEY || '').trim() : payload.apiKey;
  if (!upstreamKey) throw new Error(payload.credentialMode === 'managed_relay' ? 'AI_MANAGED_CREDENTIAL_UNAVAILABLE' : 'AI_RELAY_REQUEST_INVALID');
  const targetInfo = await resolveTarget(payload.url, options.lookup || dns.lookup, options.allowedHosts || parseAllowedHosts(process.env.AI_RELAY_HOSTS));
  if (!/\/audio\/transcriptions$/.test(targetInfo.target.pathname)) throw new Error('AI_RELAY_TARGET_PROTOCOL_MISMATCH');
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS);
  try {
    const result = await (options.requestImpl || requestHttpsMultipart)({
      target:targetInfo.target, address:targetInfo.address, family:targetInfo.family,
      headers:{ authorization:`Bearer ${upstreamKey}` }, payload, timeoutMs,
    });
    if (Buffer.byteLength(String(result.body || ''), 'utf8') > MAX_RESPONSE_BYTES) throw new Error('AI_RELAY_RESPONSE_TOO_LARGE');
    return result;
  } catch (error) {
    if (error && /^AI_RELAY_/.test(error.message || '')) throw error;
    throw new Error('AI_RELAY_UPSTREAM_UNAVAILABLE');
  }
}

async function resolvePublicSource(rawUrl, lookup = dns.lookup) {
  let target;
  try { target = new URL(String(rawUrl || '')); } catch (_) { throw new Error('AI_RELAY_SOURCE_URL_INVALID'); }
  const hostname = target.hostname.toLowerCase().replace(/\.$/, '');
  if (target.protocol !== 'https:' || target.username || target.password || target.port || isPrivateHostname(hostname)) throw new Error('AI_RELAY_SOURCE_URL_REJECTED');
  [...target.searchParams.keys()].forEach(key => {
    if (SENSITIVE_SOURCE_QUERY.test(key)) target.searchParams.delete(key);
  });
  target.hash = '';
  let addresses;
  try { addresses = await lookup(hostname, { all:true, verbatim:true }); } catch (_) { throw new Error('AI_RELAY_SOURCE_UNRESOLVED'); }
  if (!Array.isArray(addresses) || !addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('AI_RELAY_SOURCE_URL_REJECTED');
  const address = addresses[0];
  return { url:target.toString(), target, address:address.address, family:address.family };
}

function requestHttpsText({ target, address, family, timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = https.request({
      protocol:'https:', hostname:address, port:443, path:target.pathname + target.search,
      method:'GET', servername:target.hostname,
      headers:{ accept:'text/html,text/plain,application/json,application/xml', host:target.host },
      lookup:(_hostname, _options, callback) => callback(null, address, family),
    }, response => {
      const length = Number(response.headers['content-length'] || 0);
      if (length > maxBytes) { response.destroy(); fail(new Error('AI_RELAY_SOURCE_RESPONSE_TOO_LARGE')); return; }
      readResponseBody(response, maxBytes).then(body => {
        if (settled) return;
        settled = true;
        resolve({ status:response.statusCode || 502, contentType:String(response.headers['content-type'] || ''), body });
      }).catch(fail);
    });
    request.setTimeout(timeoutMs, () => { fail(new Error('AI_RELAY_SOURCE_TIMEOUT')); request.destroy(); });
    request.on('error', fail);
    request.end();
  });
}

async function fetchPublicSource(input, options = {}) {
  const value = input && typeof input === 'object' ? input : { url:input };
  const targetInfo = await resolvePublicSource(value.url, options.lookup || dns.lookup);
  const maxBytes = Math.min(MAX_SOURCE_BYTES, Math.max(1024, Number(options.maxBytes) || MAX_SOURCE_BYTES));
  const result = await (options.requestImpl || requestHttpsText)({
    target:targetInfo.target, address:targetInfo.address, family:targetInfo.family,
    timeoutMs:Math.max(1000, Number(options.timeoutMs) || DEFAULT_SOURCE_TIMEOUT_MS),
    maxBytes,
  });
  if (Buffer.byteLength(String(result.body || ''), 'utf8') > maxBytes) throw new Error('AI_RELAY_SOURCE_RESPONSE_TOO_LARGE');
  if (result.status < 200 || result.status >= 300) throw new Error('AI_RELAY_SOURCE_FETCH_FAILED');
  if (result.contentType && !/(?:text\/html|text\/plain|application\/json|application\/xml)/i.test(result.contentType)) throw new Error('AI_RELAY_SOURCE_CONTENT_TYPE_UNSUPPORTED');
  const text = String(result.body || '');
  const title = String(value.title || (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || targetInfo.url).replace(/\s+/g, ' ').trim().slice(0, 240);
  const excerpt = text.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
  const retrievedAt = new Date().toISOString();
  return { url:targetInfo.url, title, excerpt, retrieved_at:retrievedAt, status:'available', verification_status:'verified', last_verified_at:retrievedAt, verification_error:'' };
}

function writeJson(response, status, value, origin) {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('vary', 'Origin');
  if (origin) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type, x-ai-relay-token, x-cwb-license-assertion');
  }
  response.end(body);
  return true;
}

function requestOrigin(request, allowedOrigins) {
  const origin = String(request.headers.origin || '').trim();
  if (!origin) return null;
  return allowedOrigins.has(origin) ? origin : null;
}

function relayTokenStatus(request, configuredToken, required) {
  if (required && !configuredToken) return 'AI_RELAY_TOKEN_NOT_CONFIGURED';
  if (configuredToken && String(request.headers['x-ai-relay-token'] || '') !== configuredToken) return 'AI_RELAY_TOKEN_INVALID';
  return '';
}

async function handleAiRelayRequest(request, response, options = {}) {
  const pathname = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`).pathname;
  if (pathname !== RELAY_PATH && pathname !== TRANSCRIBE_RELAY_PATH && pathname !== SOURCE_RELAY_PATH) return false;
  const allowedOrigins = options.allowedOrigins || parseAllowedOrigins(process.env.AI_RELAY_ORIGINS);
  const origin = requestOrigin(request, allowedOrigins);
  if (origin === null) return writeJson(response, 403, { error:{ code:'AI_RELAY_ORIGIN_FORBIDDEN' } }, '');
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.setHeader('cache-control', 'no-store');
    response.setHeader('vary', 'Origin');
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type, x-ai-relay-token, x-cwb-license-assertion');
    response.end();
    return true;
  }
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST, OPTIONS');
    return writeJson(response, 405, { error:{ code:'AI_RELAY_METHOD_NOT_ALLOWED' } }, origin);
  }
  const configuredToken = options.relayToken != null ? String(options.relayToken) : String(process.env.AI_RELAY_TOKEN || '');
  const tokenError = relayTokenStatus(request, configuredToken, options.requireToken === true);
  if (tokenError) return writeJson(response, tokenError === 'AI_RELAY_TOKEN_INVALID' ? 401 : 503, { error:{ code:tokenError } }, origin);
  try {
    const rawBody = await readRequestBody(request, pathname === TRANSCRIBE_RELAY_PATH ? MAX_AUDIO_REQUEST_BYTES : MAX_REQUEST_BYTES);
    let input;
    try { input = JSON.parse(rawBody); } catch (_) { throw new Error('AI_RELAY_REQUEST_INVALID'); }
    const managedCredential = String(input && (input.credential_mode || input.credentialMode) || 'user_key') === 'managed_relay';
    const assertion = await verifyLicenseAssertion(input && input.license_assertion, Object.assign({}, options, { requireLicense:options.requireLicense === true || managedCredential, requireManagedRelay:managedCredential }));
    if (managedCredential && typeof options.consumeManagedQuota === 'function') await options.consumeManagedQuota(assertion);
    const result = pathname === SOURCE_RELAY_PATH
      ? await fetchPublicSource(input, options)
      : pathname === TRANSCRIBE_RELAY_PATH
        ? await forwardAudioRequest(input, options)
        : await forwardAiRequest(input, options);
    if (pathname === SOURCE_RELAY_PATH) return writeJson(response, 200, { source:result }, origin);
    response.statusCode = result.status;
    response.setHeader('content-type', result.contentType || 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('vary', 'Origin');
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
    response.setHeader('access-control-allow-headers', 'content-type, x-ai-relay-token, x-cwb-license-assertion');
    response.end(result.body);
  } catch (error) {
    const candidateCode = String(error && (error.code || error.message) || '');
    const code = /^(?:AI_RELAY|AI_SOURCE|AI_LICENSE|AI_MANAGED)_/.test(candidateCode) ? candidateCode : 'AI_RELAY_UPSTREAM_UNAVAILABLE';
    const status = /^AI_LICENSE_/.test(code) ? 401 : /QUOTA|RATE_LIMITED/.test(code) ? 429 : /TIMEOUT|UNAVAILABLE|TOO_LARGE/.test(code) ? 502 : 400;
    writeJson(response, status, { error:{ code } }, origin);
  }
  return true;
}

module.exports = {
  RELAY_PATH,
  TRANSCRIBE_RELAY_PATH,
  SOURCE_RELAY_PATH,
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  MAX_SOURCE_BYTES,
  validatePayload,
  validateAudioPayload,
  validateTarget,
  forwardAiRequest,
  forwardAudioRequest,
  resolvePublicSource,
  fetchPublicSource,
  handleAiRelayRequest,
  verifyLicenseAssertion,
  createManagedQuotaLimiter,
  parseAllowedOrigins,
  parseAllowedHosts,
  isPrivateAddress,
  isLoopbackHost,
};
