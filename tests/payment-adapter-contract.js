'use strict';

const assert = require('node:assert/strict');
const { createPaymentAdapter, createStaticCheckoutAdapter } = require('../services/license-server/payment-adapter.cjs');

(async () => {
  const adapter = createStaticCheckoutAdapter({ provider:'demo', template:'https://pay.example.test/checkout/{order_id}?plan={plan}' });
  const value = await adapter.createCheckout({ order_id:'ord_123', plan:'ai' });
  assert.equal(value.provider, 'demo');
  assert.equal(value.checkout_url, 'https://pay.example.test/checkout/ord_123?plan=ai');
  await assert.rejects(() => createPaymentAdapter({ createCheckout:async () => ({ url:'http://insecure.example.test/pay' }) }).createCheckout({ order_id:'ord_1' }), error => error.code === 'ORDER_CHECKOUT_URL_INVALID');
  console.log('PASS payment-adapter-contract');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
