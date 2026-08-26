/* Fastify HTTP boundary for the standalone commercial service.
 *
 * This file does not create a signer or a database connection implicitly.
 * Production bootstrap must inject both, so a missing KMS/database cannot
 * silently start an insecure service.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { codedError } = require('./production.cjs');

function text(value) { return String(value == null ? '' : value).trim(); }
function authHeader(request) {
  const value = text(request && request.headers && request.headers.authorization);
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8'); const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function errorStatus(code) {
  if (code === 'LICENSE_ADMIN_UNAUTHORIZED' || code === 'LICENSE_AUTH_REQUIRED' || code === 'LICENSE_AUTH_INVALID' || code === 'LICENSE_SIGNATURE_INVALID' || code === 'ORDER_ACCESS_REQUIRED' || code === 'ORDER_ACCESS_EXPIRED') return 401;
  if (code === 'LICENSE_CORS_ORIGIN_NOT_ALLOWED' || code === 'AI_MANAGED_RELAY_GRANT_REQUIRED' || code === 'MANAGED_RELAY_REVOKED') return 403;
  if (code === 'LICENSE_NOT_FOUND' || code === 'LICENSE_DEVICE_NOT_FOUND' || code === 'ORDER_NOT_FOUND' || code === 'UPDATE_NOT_FOUND') return 404;
  if (code === 'LICENSE_DEVICE_LIMIT' || code === 'LICENSE_WORKSPACE_MISMATCH' || code === 'ORDER_IDEMPOTENCY_CONFLICT' || code === 'ORDER_STATE_INVALID' || code === 'ORDER_NOT_FULFILLED') return 409;
  if (code === 'LICENSE_DB_FAILED' || code === 'LICENSE_KMS_SIGN_FAILED' || code === 'LICENSE_SERVICE_UNAVAILABLE' || code === 'ORDER_DELIVERY_UNAVAILABLE' || code === 'LICENSE_DELIVERY_UNAVAILABLE' || code === 'UPDATE_STORE_UNAVAILABLE' || code === 'EMAIL_NOT_CONFIGURED' || code === 'PAYMENT_WEBHOOK_NOT_CONFIGURED' || code === 'COMMERCIAL_OPERATIONS_UNAVAILABLE' || code === 'TELEMETRY_NOT_CONFIGURED' || code === 'REDEMPTION_STORAGE_UNAVAILABLE') return 503;
  if (code === 'RATE_LIMITED') return 429;
  return 400;
}
function createRateLimiter(options) {
  const opts = options || {};
  const max = Math.max(1, Number(opts.max || 60)); const windowMs = Math.max(1000, Number(opts.windowMs || 60_000)); const hits = new Map();
  return request => {
    const key = text(request && request.ip) || 'unknown'; const current = Date.now();
    const maxKeys = Math.max(100, Number(opts.maxKeys || 10_000));
    if (!hits.has(key) && hits.size >= maxKeys) {
      for (const [candidate, value] of hits) if (current - value.started_at >= windowMs) hits.delete(candidate);
      if (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
    }
    const row = hits.get(key);
    if (!row || current - row.started_at >= windowMs) { hits.set(key, { started_at:current, count:1 }); return; }
    row.count += 1;
    if (row.count > max) throw codedError('RATE_LIMITED', '请求过于频繁，请稍后重试');
  };
}

function normalizeCorsOrigins(input) {
  const values = Array.isArray(input) ? input : text(input).split(',').map(value => value.trim()).filter(Boolean);
  return new Set(values.map(value => {
    if (value === '*') throw codedError('LICENSE_CORS_CONFIG_INVALID', '生产授权服务不允许使用通配 CORS 来源');
    let parsed;
    try { parsed = new URL(value); } catch (cause) { throw codedError('LICENSE_CORS_CONFIG_INVALID', 'CORS 来源必须是完整 URL', cause); }
    if (!['https:', 'http:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))) throw codedError('LICENSE_CORS_CONFIG_INVALID', 'CORS 来源必须使用 HTTPS');
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) throw codedError('LICENSE_CORS_CONFIG_INVALID', 'CORS 来源不能包含路径、查询、片段或凭据');
    return parsed.origin;
  }));
}

function isFileActivationRoute(request) {
  const pathname = String(request && request.url || '').split('?')[0];
  return /^\/api\/v1\/licenses\/(?:activate|redeem|managed-relay\/redeem)$/.test(pathname);
}
function installCors(app, input, requireHttps, options) {
  const allowed = normalizeCorsOrigins(input);
  const allowFileOrigin = Boolean(options && options.allowFileOrigin === true);
  if (!allowed.size && !allowFileOrigin) return allowed;
  app.addHook('onRequest', async (request, reply) => {
    const origin = text(request.headers && request.headers.origin);
    if (requireHttps && text(request.headers['x-forwarded-proto'] || request.protocol).toLowerCase() !== 'https') throw codedError('LICENSE_HTTPS_REQUIRED', '生产授权服务必须通过 HTTPS 访问');
    if (!origin) return;
    const opaqueFileOrigin = origin === 'null' && allowFileOrigin && isFileActivationRoute(request);
    if (!allowed.has(origin) && !opaqueFileOrigin) throw codedError('LICENSE_CORS_ORIGIN_NOT_ALLOWED', '当前来源未被授权服务允许');
    reply.header('Access-Control-Allow-Origin', origin);
    if (!opaqueFileOrigin) reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type, Idempotency-Key, X-Admin-Api-Key, X-Order-Access-Token');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    reply.header('Vary', 'Origin');
    if (request.method === 'OPTIONS') return reply.code(204).send();
  });
  app.route({ method:'OPTIONS', url:'/*', handler:async (_request, reply) => reply.code(204).send() });
  return allowed;
}

function createAdminAuthenticator(options) {
  const opts = options || {};
  const configured = text(opts.apiKey || process.env.CWB_LICENSE_ADMIN_TOKEN);
  const lookup = typeof opts.lookup === 'function' ? opts.lookup : null;
  const authenticate = typeof opts.authenticate === 'function' ? opts.authenticate : async request => {
    const provided = text(request && request.headers && (request.headers['x-admin-api-key'] || authHeader(request)));
    if (!provided) return null;
    if (lookup) {
      const row = await lookup(crypto.createHash('sha256').update(provided, 'utf8').digest('hex'));
      if (!row || row.status !== 'active' || !safeEqual(text(row.key_hash), crypto.createHash('sha256').update(provided, 'utf8').digest('hex'))) return null;
      return { authenticated:true, actor_type:'admin_api_key', actor_id:text(row.key_id) || 'admin', roles:Array.isArray(row.roles) ? row.roles : ['operator'] };
    }
    if (!configured || !safeEqual(provided, configured)) return null;
    return { authenticated:true, actor_type:'admin_api_key', actor_id:text(request.headers['x-admin-actor']) || 'admin', roles:['operator'] };
  };
  return authenticate;
}

function createServer(options) {
  const opts = options || {};
  const service = opts.service;
  if (!service) throw codedError('LICENSE_SERVICE_REQUIRED');
  let fastifyFactory = opts.fastifyFactory;
  if (!fastifyFactory) {
    try { fastifyFactory = require('fastify'); }
    catch (cause) { throw codedError('LICENSE_SERVER_DEPENDENCY_MISSING', '请先安装 license-server 的 Fastify 依赖', cause); }
  }
  // Only deployments that explicitly place the service behind a trusted local proxy
  // may use forwarded client addresses for rate limiting and audit metadata.
  const app = opts.app || fastifyFactory({ logger:opts.logger || false, bodyLimit:256 * 1024, trustProxy:opts.trustProxy === true });
  const requireHttps = opts.requireHttps === true;
  installCors(app, opts.corsOrigins, requireHttps, { allowFileOrigin:opts.allowFileOrigin === true });
  if (opts.captureRawBody !== false && typeof app.removeContentTypeParser === 'function' && typeof app.addContentTypeParser === 'function') {
    app.removeContentTypeParser('application/json');
    app.addContentTypeParser('application/json', { parseAs:'string' }, (request, body, done) => {
      request.cwbRawBody = String(body || '');
      try { done(null, request.cwbRawBody ? JSON.parse(request.cwbRawBody) : {}); }
      catch (cause) { const error = codedError('LICENSE_REQUEST_INVALID', '请求 JSON 无效', cause); done(error); }
    });
  }
  const authenticateAdmin = createAdminAuthenticator(opts.admin || {});
  const limit = createRateLimiter(opts.rateLimit || {});
  const adminActor = async request => {
    const actor = await authenticateAdmin(request);
    if (!actor) throw codedError('LICENSE_ADMIN_UNAUTHORIZED');
    return actor;
  };
  const bodyWithIdempotency = request => Object.assign({}, request.body || {}, { idempotency_key:text(request.headers['idempotency-key'] || request.body && request.body.idempotency_key) });
  const sendError = (reply, cause) => { const code = text(cause && cause.code) || 'LICENSE_SERVICE_FAILED'; return reply.code(errorStatus(code)).send({ ok:false, code, message:text(cause && cause.message).replace(`${code}: `, '') }); };
  const publicGuard = async request => {
    limit(request);
    if (requireHttps && text(request.headers['x-forwarded-proto'] || request.protocol).toLowerCase() !== 'https') throw codedError('LICENSE_HTTPS_REQUIRED', '生产授权服务必须通过 HTTPS 访问');
  };
  const adminGuard = async request => { limit(request); request.cwbActor = await adminActor(request); };
  const protectedInput = request => Object.assign({}, request.body || {}, { token:text(authHeader(request) || request.body && request.body.token), license_id:text(request.params && request.params.id || request.body && request.body.license_id), workspace_id:text(request.body && request.body.workspace_id), device_id:text(request.body && request.body.device_id) });
  const orderAccessToken = request => {
    const token = text(request && request.headers && (request.headers['x-order-access-token'] || authHeader(request)));
    if (!token) throw codedError('ORDER_ACCESS_REQUIRED', '查询订单必须提供订单访问令牌');
    return token;
  };

  app.setErrorHandler((cause, request, reply) => sendError(reply, cause));
  const page = fileName => reply => reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache').header('Referrer-Policy', 'no-referrer').header('X-Content-Type-Options', 'nosniff').header('X-Frame-Options', 'DENY').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' https:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'").type('text/html; charset=utf-8').send(fs.readFileSync(path.join(__dirname, fileName), 'utf8'));
  app.get('/admin', async (_request, reply) => page('admin.html')(reply));
  app.get('/customer', async (_request, reply) => page('customer.html')(reply));
  app.get('/api/v1/health', { preHandler:publicGuard }, async () => ({ ok:true, service:'license', product_id:service.publicKeys ? 'counselor-desk' : 'license', ...(typeof service.health === 'function' ? await service.health() : {}) }));
  app.get('/api/v1/products', { preHandler:publicGuard }, async () => ({ products:await service.products() }));
  app.post('/api/v1/orders', { preHandler:publicGuard }, async request => service.createOrder(bodyWithIdempotency(request), { actor_type:'customer', actor_id:text(request.headers['x-customer-id']) || 'customer', authenticated:true }));
  app.get('/api/v1/orders/:id', { preHandler:publicGuard }, async request => service.getOrder(request.params.id, orderAccessToken(request)));
  app.get('/api/v1/orders/:id/license', { preHandler:publicGuard }, async (request, reply) => {
    const delivery = await service.customerDelivery(request.params.id, orderAccessToken(request));
    return reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache').header('Content-Disposition', `attachment; filename="${delivery.filename}"`).type('application/json').send(delivery.content);
  });
  app.post('/api/v1/licenses/activate', { preHandler:publicGuard }, async request => service.activate(request.body || {}));
  app.post('/api/v1/licenses/redeem', { preHandler:publicGuard }, async request => service.redeem(request.body || {}));
  app.post('/api/v1/licenses/managed-relay/redeem', { preHandler:publicGuard }, async request => service.redeemManagedRelay(request.body || {}));
  app.post('/api/v1/licenses/refresh', { preHandler:publicGuard }, async request => service.refresh(protectedInput(request)));
  app.post('/api/v1/licenses/deactivate', { preHandler:publicGuard }, async request => service.deactivate(protectedInput(request)));
  app.post('/api/v1/licenses/:id/upgrade-orders', { preHandler:publicGuard }, async request => service.createUpgradeOrder(Object.assign({}, protectedInput(request), { license_id:request.params.id, target_plan:text(request.body && (request.body.target_plan || request.body.plan)), customer_email:text(request.body && request.body.customer_email), idempotency_key:text(request.headers['idempotency-key'] || request.body && request.body.idempotency_key) }), { actor_type:'customer', actor_id:text(request.params.id), authenticated:true }));
  app.post('/api/v1/licenses/:id/devices/:deviceId/deactivate', { preHandler:publicGuard }, async request => service.deactivateDevice(Object.assign({}, protectedInput(request), { license_id:request.params.id, target_device_id:text(request.params.deviceId) })));
  app.post('/api/v1/licenses/relay-token', { preHandler:publicGuard }, async request => service.issueRelayToken(protectedInput(request)));
  app.get('/api/v1/licenses/:id/devices', { preHandler:publicGuard }, async request => service.devices(Object.assign({}, protectedInput(request), { license_id:request.params.id, workspace_id:text(request.query && request.query.workspace_id), device_id:text(request.query && request.query.device_id), token:text(authHeader(request)) })));
  app.get('/api/v1/updates/latest', { preHandler:publicGuard }, async request => service.updates(text(request.query && request.query.channel) || 'stable'));
  app.post('/api/v1/telemetry/events', { preHandler:publicGuard }, async request => service.recordTelemetry(request.body || {}));
  app.post('/api/v1/admin/updates/publish', { preHandler:adminGuard }, async request => service.publishUpdate(request.body || {}, request.cwbActor));
  app.post('/api/v1/orders/webhook', { preHandler:publicGuard }, async request => {
    if (typeof opts.verifyWebhook !== 'function') throw codedError('PAYMENT_WEBHOOK_NOT_CONFIGURED', '支付 webhook 尚未配置签名验真适配器');
    const provider = text(request.headers['x-payment-provider'] || request.body && request.body.provider);
    const verified = await opts.verifyWebhook({ provider, signature:text(request.headers['x-payment-signature']), timestamp:text(request.headers['x-payment-timestamp']), rawBody:text(request.cwbRawBody), payload:request.body || {} });
    if (verified !== true) throw codedError('PAYMENT_WEBHOOK_INVALID', '支付 webhook 签名校验失败');
    return service.handleWebhook({ provider, event_id:text(request.headers['x-payment-event-id'] || request.body && request.body.event_id), event_type:text(request.body && request.body.type), payload:request.body || {} }, { actor_type:'payment_provider', actor_id:provider, authenticated:true });
  });
  app.post('/api/v1/admin/orders', { preHandler:adminGuard }, async request => service.createOrder(bodyWithIdempotency(request), request.cwbActor));
  app.post('/api/v1/admin/orders/:id/confirm', { preHandler:adminGuard }, async request => service.confirmPayment(Object.assign({}, request.body || {}, { order_id:request.params.id }), request.cwbActor));
  app.post('/api/v1/admin/licenses/manual', { preHandler:adminGuard }, async request => service.issueManual(request.body || {}, request.cwbActor));
  app.post('/api/v1/admin/trials', { preHandler:adminGuard }, async request => service.createTrial(request.body || {}, request.cwbActor));
  app.post('/api/v1/admin/license-batches', { preHandler:adminGuard }, async request => service.createLicenseBatch(request.body || {}, request.cwbActor));
  app.post('/api/v1/admin/organizations', { preHandler:adminGuard }, async request => service.createOrganization(request.body || {}, request.cwbActor));
  app.get('/api/v1/admin/organizations/:id/workspaces', { preHandler:adminGuard }, async request => service.organizationWorkspaces(request.params.id, request.cwbActor));
  app.post('/api/v1/admin/licenses/:id/revoke', { preHandler:adminGuard }, async request => service.revoke(Object.assign({}, request.body || {}, { license_id:request.params.id }), request.cwbActor));
  app.get('/api/v1/admin/licenses/:id/devices', { preHandler:adminGuard }, async request => ({ devices:await service.adminDevices(request.params.id, request.cwbActor) }));
  app.get('/api/v1/admin/audit', { preHandler:adminGuard }, async request => ({ events:await service.audit(request.cwbActor) }));
  app.get('/api/v1/admin/orders/:id', { preHandler:adminGuard }, async request => service.adminOrder(request.params.id, request.cwbActor));
  app.post('/api/v1/admin/email-outbox/:id/retry', { preHandler:adminGuard }, async request => service.retryEmail(request.params.id, request.cwbActor));
  return app;
}

async function startFromEnv(options) {
  const opts = options || {};
  if (!opts.service) throw codedError('LICENSE_SERVICE_REQUIRED');
  const app = createServer(opts);
  await app.listen({ host:text(opts.host || process.env.CWB_LICENSE_HOST || '127.0.0.1'), port:Number(opts.port || process.env.CWB_LICENSE_PORT || 8787) });
  return app;
}

module.exports = { createServer, startFromEnv, createAdminAuthenticator, createRateLimiter, normalizeCorsOrigins, codedError };
