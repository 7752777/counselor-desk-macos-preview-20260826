const assert = require('node:assert/strict');
const exporter = require('../services/license-server/scripts/export-license-stock.cjs');

const input = exporter.config({
  CWB_LICENSE_SERVICE_URL:'http://127.0.0.1:8787',
  CWB_LICENSE_ADMIN_KEY:'admin-test-key',
  CWB_LICENSE_PLAN:'ai_perpetual',
  CWB_LICENSE_COUNT:'12',
  CWB_LICENSE_BATCH_EMAIL:'inventory@example.test',
  CWB_LICENSE_OUTPUT:'stock.txt',
});
assert.equal(input.count, 12);
assert.equal(input.batchEmail, 'inventory@example.test');
const request = exporter.batchRequest(input);
assert.equal(request.plan, 'ai_perpetual');
assert.equal(request.count, 12);
assert.equal(request.customer_email, 'inventory@example.test');
assert.equal(request.metadata.source, 'digital-goods-stock-export');
assert.equal(request.metadata.stock_batch_email, 'inventory@example.test');
assert.match(request.idempotency_key, /^stock_/);
assert.throws(() => exporter.config({ CWB_LICENSE_SERVICE_URL:'http://127.0.0.1:8787', CWB_LICENSE_ADMIN_KEY:'key', CWB_LICENSE_PLAN:'standard', CWB_LICENSE_COUNT:'501', CWB_LICENSE_BATCH_EMAIL:'inventory@example.test', CWB_LICENSE_OUTPUT:'stock.txt' }), /count must be/);
assert.throws(() => exporter.config({ CWB_LICENSE_SERVICE_URL:'http://127.0.0.1:8787', CWB_LICENSE_ADMIN_KEY:'key', CWB_LICENSE_PLAN:'standard', CWB_LICENSE_COUNT:'1', CWB_LICENSE_BATCH_EMAIL:'invalid', CWB_LICENSE_OUTPUT:'stock.txt' }), /batch-email/);
console.log('PASS license-stock-export');
