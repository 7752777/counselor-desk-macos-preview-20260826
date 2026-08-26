const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createSigner } = require('../services/license-server/service.cjs');
const { createCommercialService } = require('../services/license-server/production.cjs');
const { createCommercialMemoryStore } = require('./license-server-fixture.js');

(async () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const signer = createSigner({ privateKey, kid:'webhook-contract' });
  const store = createCommercialMemoryStore();
  const service = createCommercialService({ store, signer, orderAccessSecret:'webhook-secret', publicKeys:{ 'webhook-contract':signer.publicKey } });
  const actor = { authenticated:true, actor_type:'payment_provider', actor_id:'test-pay' };
  const created = await service.createOrder({ plan:'standard_perpetual', customer_email:'customer@example.test', idempotency_key:'webhook-order' }, actor);
  await assert.rejects(() => service.handleWebhook({ provider:'test-pay', event_id:'evt-no-order', payload:{ type:'payment_succeeded' } }, actor), error => error.code === 'ORDER_ID_INVALID');
  const paid = await service.handleWebhook({ provider:'test-pay', event_id:'evt-paid', payload:{ type:'payment_succeeded', order_id:created.order.order_id, provider_order_id:'p-1' } }, actor);
  assert.equal(paid.ok, true);
  assert.equal((await service.handleWebhook({ provider:'test-pay', event_id:'evt-paid', payload:{ type:'payment_succeeded', order_id:created.order.order_id, provider_order_id:'p-1' } }, actor)).duplicate, true);
  assert.equal(store.webhooks.get('test-pay:evt-paid').status, 'processed');
  console.log('PASS order-webhook-contract');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
