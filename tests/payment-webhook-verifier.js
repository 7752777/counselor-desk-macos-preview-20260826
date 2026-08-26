const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createHmacWebhookVerifier } = require('../services/license-server/payment-webhook.cjs');

(async () => {
  const secret = 'contract-webhook-secret';
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = JSON.stringify({ type:'payment_succeeded', order_id:'order-1' });
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  const verify = createHmacWebhookVerifier({ secret });
  assert.equal(await verify({ timestamp, rawBody, signature:`t=${timestamp},v1=${signature}` }), true);
  assert.equal(await verify({ timestamp, rawBody, signature:'bad' }), false);
  await assert.rejects(() => verify({ timestamp:timestamp - 600, rawBody, signature }), error => error.code === 'PAYMENT_WEBHOOK_TIMESTAMP_INVALID');
  console.log('PASS payment-webhook-verifier');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
