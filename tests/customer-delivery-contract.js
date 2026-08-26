const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createSigner } = require('../services/license-server/service.cjs');
const { createCommercialService } = require('../services/license-server/production.cjs');
const { createServer } = require('../services/license-server/server.cjs');
const { createCommercialMemoryStore } = require('./license-server-fixture.js');

(async () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const signer = createSigner({ privateKey, kid:'delivery-contract' });
  const store = createCommercialMemoryStore();
  const service = createCommercialService({ store, signer, orderAccessSecret:'delivery-secret', publicKeys:{ 'delivery-contract':signer.publicKey } });
  const actor = { authenticated:true, actor_type:'admin_api_key', actor_id:'delivery-admin' };
  const app = createServer({ service, admin:{ apiKey:'delivery-admin-key' } });
  await app.ready();
  try {
    let response = await app.inject({ method:'GET', url:'/customer' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /下载许可证文件/);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['x-frame-options'], 'DENY');
    assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);

    response = await app.inject({ method:'POST', url:'/api/v1/orders', headers:{ 'content-type':'application/json', 'idempotency-key':'delivery-order' }, payload:{ plan:'ai', customer_email:'customer@example.test' } });
    assert.equal(response.statusCode, 200);
    const created = JSON.parse(response.body);
    const orderId = created.order.order_id;
    const accessToken = created.access_token;
    assert.ok(created.order.access_token_expires_at);
    response = await app.inject({ method:'GET', url:`/api/v1/orders/${orderId}` });
    assert.equal(response.statusCode, 401);
    response = await app.inject({ method:'GET', url:`/api/v1/orders/${orderId}/license`, headers:{ 'x-order-access-token':accessToken } });
    assert.equal(response.statusCode, 409);

    await service.confirmPayment({ order_id:orderId, provider:'manual' }, actor);
    response = await app.inject({ method:'GET', url:`/api/v1/orders/${orderId}`, headers:{ 'x-order-access-token':accessToken } });
    assert.equal(response.statusCode, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(JSON.parse(response.body), 'token'), false, 'ordinary order response must not expose activation token');
    response = await app.inject({ method:'GET', url:`/api/v1/orders/${orderId}/license`, headers:{ 'x-order-access-token':accessToken } });
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-disposition'], /attachment/);
    const delivery = JSON.parse(response.body);
    assert.match(delivery.token, /^CWB-LIC-1\./);
    assert.equal(delivery.plan, 'ai');
    response = await app.inject({ method:'GET', url:`/api/v1/orders/${orderId}/license`, headers:{ 'x-order-access-token':'ord_invalid' } });
    assert.equal(response.statusCode, 404);
    const expiredStore = createCommercialMemoryStore();
    const expiredService = createCommercialService({ store:expiredStore, signer, orderAccessSecret:'expired-secret', publicKeys:{ 'delivery-contract':signer.publicKey }, now:() => new Date('2026-08-23T00:00:00.000Z') });
    const expired = await expiredService.createOrder({ plan:'ai', customer_email:'expired@example.test', idempotency_key:'expired-order' }, actor);
    expiredStore.orders.get(expired.order.order_id).access_token_expires_at = '2026-08-22T00:00:00.000Z';
    await assert.rejects(() => expiredService.getOrder(expired.order.order_id, expired.access_token), error => error.code === 'ORDER_ACCESS_EXPIRED');
  } finally {
    await app.close();
  }
  console.log('PASS customer-delivery-contract');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
