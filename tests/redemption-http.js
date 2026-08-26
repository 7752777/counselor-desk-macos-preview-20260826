const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const redemption = require('../services/license-server/redemption-code.cjs');
const { createSigner } = require('../services/license-server/service.cjs');
const { createCommercialService } = require('../services/license-server/production.cjs');
const { createCommercialMemoryStore } = require('./license-server-fixture.js');
const { createServer } = require('../services/license-server/server.cjs');

(async () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const signer = createSigner({ privateKey, kid:'redemption-http' });
  const store = createCommercialMemoryStore();
  const generated = redemption.generate();
  const campaign = redemption.normalizeCampaign({ campaign_id:'http-campaign', plan:'ai_perpetual', code_hash:generated.code_hash, status:'active' });
  await store.upsertRedemptionCampaign({ ...campaign, product_id:'counselor-desk' });
  const service = createCommercialService({ store, signer, orderAccessSecret:'redemption-http-secret', publicKeys:{ [signer.kid]:signer.publicKey }, redemptionCampaigns:[campaign] });
  const app = createServer({ service, rateLimit:{ max:100 } });
  await app.ready();
  let response = await app.inject({ method:'POST', url:'/api/v1/licenses/redeem', headers:{ 'content-type':'application/json' }, payload:{ code:generated.code, workspace_id:'http-redeem-w1', device_id:'http-redeem-d1' } });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.payload.plan, 'ai_perpetual');
  assert.match(body.token, /^CWB-LIC-1\./);
  response = await app.inject({ method:'POST', url:'/api/v1/licenses/redeem', headers:{ 'content-type':'application/json' }, payload:{ code:'CWB-REDEEM-1.' + 'z'.repeat(43), workspace_id:'http-redeem-w2', device_id:'http-redeem-d2' } });
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).code, 'REDEMPTION_CODE_INVALID');
  await app.close();
  console.log('PASS redemption-http');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
