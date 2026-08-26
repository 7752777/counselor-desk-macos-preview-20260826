const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createSigner } = require('../services/license-server/service.cjs');
const { createCommercialService } = require('../services/license-server/production.cjs');
const { createCommercialMemoryStore } = require('./license-server-fixture.js');
const { createServer } = require('../services/license-server/server.cjs');

(async () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const signer = createSigner({ privateKey, kid:'upgrade-contract' });
  const store = createCommercialMemoryStore();
  const service = createCommercialService({ store, signer, orderAccessSecret:'upgrade-order-secret', publicKeys:{ 'upgrade-contract':signer.publicKey } });
  const admin = { authenticated:true, actor_type:'admin', actor_id:'upgrade-test' };
  const issued = await service.issueManual({ plan:'standard', customer_email:'upgrade@example.test' }, admin);
  const source = store.licenses.get(issued.license.license_id);
  await service.activate({ token:source.token, license_id:source.license_id, workspace_id:'upgrade-workspace', device_id:'upgrade-device' });

  const upgrade = await service.createUpgradeOrder({ token:source.token, license_id:source.license_id, workspace_id:'upgrade-workspace', device_id:'upgrade-device', target_plan:'ai', idempotency_key:'upgrade-order-1' }, { authenticated:true, actor_type:'customer', actor_id:source.license_id });
  assert.equal(upgrade.order.amount_minor, 3000, 'standard to AI must charge only the 30 yuan difference');
  assert.equal(upgrade.upgrade.from_plan, 'standard');
  assert.equal(upgrade.upgrade.target_plan, 'ai');
  assert.equal(store.orders.get(upgrade.order.order_id).metadata.upgrade_from_license_id, source.license_id);
  const repeated = await service.createUpgradeOrder({ token:source.token, license_id:source.license_id, workspace_id:'upgrade-workspace', device_id:'upgrade-device', target_plan:'ai', idempotency_key:'upgrade-order-1' }, { authenticated:true, actor_type:'customer', actor_id:source.license_id });
  assert.equal(repeated.order.order_id, upgrade.order.order_id, 'upgrade order creation must be idempotent');
  const app = createServer({ service, requireHttps:false, rateLimit:{ max:100 } });
  await app.ready();
  const response = await app.inject({ method:'POST', url:`/api/v1/licenses/${encodeURIComponent(source.license_id)}/upgrade-orders`, headers:{ 'content-type':'application/json', authorization:`Bearer ${source.token}`, 'idempotency-key':'upgrade-order-http' }, payload:{ target_plan:'ai', workspace_id:'upgrade-workspace', device_id:'upgrade-device' } });
  assert.equal(response.statusCode, 200, 'upgrade endpoint must accept an authenticated device');
  assert.equal(JSON.parse(response.body).upgrade.amount_minor, 3000);
  await app.close();
  await assert.rejects(() => service.createUpgradeOrder({ token:source.token, license_id:source.license_id, workspace_id:'upgrade-workspace', device_id:'upgrade-device', target_plan:'standard', idempotency_key:'upgrade-downgrade' }, { authenticated:true, actor_type:'customer', actor_id:source.license_id }), error => error.code === 'LICENSE_UPGRADE_NOT_AVAILABLE');
  console.log('PASS commercial-upgrade-order');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
