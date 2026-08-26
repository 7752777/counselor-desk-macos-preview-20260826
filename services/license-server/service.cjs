/* Standalone commercial-license service contract.
 *
 * The default store is intentionally in-memory for local integration tests.
 * Production deployments must provide a durable PostgreSQL adapter and a KMS
 * backed signer; this file never reads a private key from the application
 * repository or accepts student/workspace business data beyond workspace_id.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const licenseCore = require('../../src/core/cwb-license.js');

const PRODUCT_ID = licenseCore.PRODUCT_ID;
const text = value => String(value == null ? '' : value).trim();
const now = () => new Date().toISOString();
const b64url = value => Buffer.from(value).toString('base64url');
function codedError(code, message, cause) { const error = new Error(`${code}: ${message || code}`); error.code = code; if (cause) error.cause = cause; return error; }
function json(res, status, value) { const body = JSON.stringify(value); res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(body); }
function tokenFromPayload(privateKey, payload, prefix) {
  const segment = b64url(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(segment, 'utf8'), privateKey);
  return `${prefix || licenseCore.TOKEN_PREFIX}.${segment}.${b64url(signature)}`;
}
function publicKeyDer(privateKey) { return crypto.createPublicKey(privateKey).export({ type:'spki', format:'der' }).toString('base64'); }
function requiredId(value, code) {
  const result = text(value);
  if (!result || result.length > 240 || /[\x00-\x1f]/.test(result)) throw codedError(code, '设备或工作区标识无效');
  return result;
}

function createSigner(options) {
  const opts = options || {};
  if (!opts.privateKey) throw codedError('LICENSE_SIGNING_KEY_REQUIRED', '生产签名器必须从 KMS 或受控密钥文件注入私钥');
  const privateKey = opts.privateKey.type ? opts.privateKey : crypto.createPrivateKey(opts.privateKey);
  const kid = text(opts.kid || 'primary');
  return { kid, publicKey:publicKeyDer(privateKey), issue(payload, options) { return tokenFromPayload(privateKey, Object.assign({}, payload, { kid }), options && options.prefix); } };
}

function createMemoryStore() {
  const licenses = new Map(); const audits = [];
  const audit = (action, details) => audits.push({ action, details:Object.assign({}, details || {}), at:now() });
  return {
    licenses, audits,
    create(record) { licenses.set(record.license_id, Object.assign({}, record, { devices:new Map(record.devices || []) })); return licenses.get(record.license_id); },
    get(id) { return licenses.get(String(id || '')); },
    listDevices(id) { const record = licenses.get(String(id || '')); return record ? [...record.devices.values()].map(item => ({ ...item })) : []; },
    activate(input) {
      const deviceId = requiredId(input.device_id, 'LICENSE_DEVICE_REQUIRED');
      const workspaceId = requiredId(input.workspace_id, 'LICENSE_WORKSPACE_REQUIRED');
      const record = licenses.get(String(input.license_id || ''));
      if (!record || record.token !== input.token) throw codedError('LICENSE_NOT_FOUND', '许可证不存在');
      if (record.status !== 'active') throw codedError('LICENSE_REVOKED', '许可证已撤销');
      if (record.workspace_id && record.workspace_id !== workspaceId) throw codedError('LICENSE_WORKSPACE_MISMATCH', '许可证已绑定其他工作区');
      const existing = record.devices.get(deviceId);
      if (!existing && record.devices.size >= record.device_limit) throw codedError('LICENSE_DEVICE_LIMIT', '已达到许可证设备上限');
      if (!record.workspace_id) record.workspace_id = workspaceId;
      record.devices.set(deviceId, { device_id:deviceId, workspace_id:workspaceId, activated_at:existing && existing.activated_at || now(), last_seen_at:now(), status:'active' });
      audit('license_activated', { license_id:record.license_id, device_id:deviceId });
      return record;
    },
    deactivate(input) { const record = licenses.get(String(input.license_id || '')); const deviceId = requiredId(input.device_id, 'LICENSE_DEVICE_REQUIRED'); if (!record) throw codedError('LICENSE_NOT_FOUND'); if (!record.devices.has(deviceId)) throw codedError('LICENSE_DEVICE_NOT_FOUND'); record.devices.delete(deviceId); audit('device_deactivated', { license_id:record.license_id, device_id:deviceId }); return true; },
    revoke(id, reason) { const record = licenses.get(String(id || '')); if (!record) throw codedError('LICENSE_NOT_FOUND'); record.status = 'revoked'; record.revoked_at = now(); record.revoke_reason = text(reason); audit('license_revoked', { license_id:record.license_id }); return record; },
  };
}

function createLicenseService(options) {
  const opts = options || {};
  const store = opts.store || createMemoryStore();
  const signer = opts.signer;
  const adminToken = text(opts.adminToken || process.env.CWB_LICENSE_ADMIN_TOKEN);
  const publicKeys = opts.publicKeys || (signer ? { [signer.kid]:signer.publicKey } : {});
  function issue(input) {
    if (!signer) throw codedError('LICENSE_SIGNING_KEY_REQUIRED');
    const value = input || {}; const plan = text(value.plan);
    if (!licenseCore.PLANS[plan]) throw codedError('LICENSE_PLAN_INVALID');
    const licenseId = text(value.license_id) || `lic_${crypto.randomUUID()}`;
    const payload = { license_id:licenseId, product_id:PRODUCT_ID, plan, ai:licenseCore.PLANS[plan].ai, perpetual_updates:licenseCore.PLANS[plan].perpetualUpdates, major_version:Number(value.major_version || 4), device_limit:Math.max(1, Math.min(3, Number(value.device_limit || 3))), issued_at:now(), status:'active', workspace_id:text(value.workspace_id) };
    const token = signer.issue(payload); const record = store.create({ ...payload, token, devices:new Map() });
    if (store.audits) store.audits.push({ action:'license_issued', details:{ license_id:licenseId, plan }, at:now() });
    return { license_id:licenseId, token, payload:record };
  }
  function requireAdmin(req) { if (!adminToken || text(req.headers.authorization) !== `Bearer ${adminToken}`) throw codedError('LICENSE_ADMIN_UNAUTHORIZED'); }
  function requestToken(req, input) {
    const header = text(req && req.headers && req.headers.authorization);
    return header.startsWith('Bearer ') ? header.slice(7).trim() : text(input && input.token);
  }
  async function authenticateDevice(req, input, licenseId) {
    const token = requestToken(req, input);
    if (!token) throw codedError('LICENSE_AUTH_REQUIRED', '需要许可证令牌');
    const parsed = licenseCore.parse(token);
    await licenseCore.verifySignature(parsed, publicKeys);
    if (licenseId && parsed.license_id !== String(licenseId)) throw codedError('LICENSE_AUTH_INVALID', '许可证与请求资源不匹配');
    const record = store.get(parsed.license_id);
    if (!record || record.token !== token) throw codedError('LICENSE_NOT_FOUND', '许可证不存在');
    if (record.status !== 'active') throw codedError('LICENSE_REVOKED', '许可证已撤销');
    const deviceId = requiredId(input && input.device_id, 'LICENSE_DEVICE_REQUIRED');
    const device = record.devices.get(deviceId);
    if (!device || device.status !== 'active') throw codedError('LICENSE_DEVICE_NOT_FOUND', '设备未激活或已撤销');
    const workspaceId = requiredId(input && input.workspace_id, 'LICENSE_WORKSPACE_REQUIRED');
    if (device.workspace_id !== workspaceId || (record.workspace_id && record.workspace_id !== workspaceId)) throw codedError('LICENSE_WORKSPACE_MISMATCH', '工作区与许可证不匹配');
    device.last_seen_at = now();
    return { token, parsed, record, device };
  }
  async function body(req) {
    let raw = ''; for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw, 'utf8') > 256 * 1024) throw codedError('LICENSE_REQUEST_TOO_LARGE'); }
    if (!raw) return {}; try { const value = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required'); return value; } catch (cause) { throw codedError('LICENSE_REQUEST_INVALID', '请求 JSON 无效', cause); }
  }
  async function route(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost'); const method = req.method; const parts = url.pathname.split('/').filter(Boolean); const input = method === 'GET' ? Object.fromEntries(url.searchParams.entries()) : await body(req);
      if (method === 'GET' && url.pathname === '/api/v1/health') return json(res, 200, { ok:true, service:'license', product_id:PRODUCT_ID, signer_kid:signer && signer.kid || '' });
      if (method === 'POST' && url.pathname === '/api/v1/admin/licenses') { requireAdmin(req); return json(res, 201, issue(input)); }
      if (method === 'POST' && url.pathname === '/api/v1/licenses/activate') {
        const parsed = licenseCore.parse(input.token); await licenseCore.verifySignature(parsed, publicKeys);
        if (parsed.product_id !== PRODUCT_ID) throw codedError('LICENSE_PRODUCT_MISMATCH');
        const record = store.activate({ license_id:parsed.license_id, token:text(input.token), workspace_id:requiredId(input.workspace_id, 'LICENSE_WORKSPACE_REQUIRED'), device_id:requiredId(input.device_id, 'LICENSE_DEVICE_REQUIRED') });
        return json(res, 200, { ok:true, license_id:record.license_id, token:record.token, devices:store.listDevices(record.license_id) });
      }
      if (method === 'POST' && url.pathname === '/api/v1/licenses/refresh') { const auth = await authenticateDevice(req, input, input.license_id); return json(res, 200, { ok:true, token:auth.record.token, devices:store.listDevices(auth.record.license_id) }); }
      if (method === 'POST' && url.pathname === '/api/v1/licenses/deactivate') { const auth = await authenticateDevice(req, input, input.license_id); store.deactivate({ license_id:auth.record.license_id, device_id:auth.device.device_id }); return json(res, 200, { ok:true }); }
      if (method === 'POST' && url.pathname === '/api/v1/licenses/relay-token') { const auth = await authenticateDevice(req, input, input.license_id); if (!auth.parsed.ai) throw codedError('LICENSE_AI_NOT_ENTITLED'); const issuedAt = Date.now(); const expiresAt = new Date(issuedAt + 5 * 60 * 1000).toISOString(); const assertion = signer.issue({ license_id:auth.record.license_id, product_id:PRODUCT_ID, ai:true, issued_at:new Date(issuedAt).toISOString(), expires_at:expiresAt, device_id:auth.device.device_id }, { prefix:'CWB-REL-1' }); return json(res, 200, { ok:true, assertion, expires_at:expiresAt }); }
      if (method === 'GET' && parts.length === 5 && parts.slice(0, 3).join('/') === 'api/v1/licenses' && parts[4] === 'devices') { const auth = await authenticateDevice(req, input, parts[3]); return json(res, 200, { devices:store.listDevices(auth.record.license_id) }); }
      if (method === 'POST' && parts.length === 5 && parts.slice(0, 3).join('/') === 'api/v1/licenses' && parts[4] === 'revoke') { requireAdmin(req); store.revoke(parts[3], input.reason); return json(res, 200, { ok:true }); }
      if (method === 'POST' && url.pathname === '/api/v1/orders/webhook') return json(res, 202, { ok:false, code:'PAYMENT_WEBHOOK_NOT_CONFIGURED', message:'支付 webhook 需要先完成签名验真和订单适配器配置' });
      return json(res, 404, { ok:false, code:'LICENSE_ROUTE_NOT_FOUND' });
    } catch (cause) { const code = cause && cause.code || 'LICENSE_SERVICE_FAILED'; const status = code.includes('UNAUTHORIZED') || code.includes('AUTH_REQUIRED') || code.includes('AUTH_INVALID') ? 401 : code === 'LICENSE_DEVICE_LIMIT' || code === 'LICENSE_WORKSPACE_MISMATCH' ? 409 : code === 'LICENSE_NOT_FOUND' || code === 'LICENSE_DEVICE_NOT_FOUND' ? 404 : 400; return json(res, status, { ok:false, code }); }
  }
  return { store, signer, issue, route, start({ host='127.0.0.1', port=0 } = {}) { const server = http.createServer((req, res) => route(req, res)); return new Promise(resolve => server.listen(port, host, () => resolve({ server, address:server.address() }))); } };
}

module.exports = { PRODUCT_ID, createSigner, createMemoryStore, createLicenseService, codedError };
