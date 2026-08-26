const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const licenseCore = require('../src/core/cwb-license.js');
const relayCore = require('../src/core/cwb-license-relay.js');
const redemption = require('../services/license-server/redemption-code.cjs');
const { createSigner } = require('../services/license-server/service.cjs');
const { createCommercialService } = require('../services/license-server/production.cjs');
const { createCommercialMemoryStore } = require('./license-server-fixture.js');
const { createManagedQuotaLimiter } = require('../scripts/ai-relay.js');

(async () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const signer = createSigner({ privateKey, kid:'managed-relay-contract' });
  const store = createCommercialMemoryStore();
  const managedCode = redemption.generate();
  const managedCampaign = redemption.normalizeCampaign({
    campaign_id:'managed-relay-contract', plan:'ai_perpetual', code_hash:managedCode.code_hash,
    status:'active', metadata:{ managed_relay:true, kind:'managed_relay' },
  });
  await store.upsertRedemptionCampaign({ ...managedCampaign, product_id:licenseCore.PRODUCT_ID });
  const service = createCommercialService({ store, signer, orderAccessSecret:'managed-relay-secret', publicKeys:{ [signer.kid]:signer.publicKey }, redemptionCampaigns:[managedCampaign] });
  const issued = await service.issueManual({ plan:'ai_perpetual', customer_email:'managed@example.test', idempotency_key:'managed-relay-order' }, { authenticated:true, actor_type:'test', actor_id:'test' });
  const license = [...store.licenses.values()][0];
  const workspaceId = 'managed-relay-workspace';
  await service.activate({ token:license.token, workspace_id:workspaceId, device_id:'managed-relay-device' });
  const first = await service.redeemManagedRelay({ code:managedCode.code, token:license.token, license_id:license.license_id, workspace_id:workspaceId, device_id:'managed-relay-device' });
  assert.equal(first.grant.status, 'active');
  const second = await service.redeemManagedRelay({ code:managedCode.code, token:license.token, license_id:license.license_id, workspace_id:workspaceId, device_id:'managed-relay-device' });
  assert.equal(second.grant.grant_id, first.grant.grant_id, 'friend code redemption must be idempotent');
  const relay = await service.issueRelayToken({ token:license.token, license_id:license.license_id, workspace_id:workspaceId, device_id:'managed-relay-device', managed_relay:true });
  const parsed = relayCore.parse(relay.assertion);
  assert.equal(parsed.payload.managed_relay, true);
  assert.equal(relayCore.evaluate(parsed, { requireManagedRelay:true }).managed_relay, true);
  await assert.rejects(() => service.redeem({ code:managedCode.code, workspace_id:'other-workspace', device_id:'other-device' }), error => error.code === 'REDEMPTION_CODE_USE_MANAGED_FLOW');
  const quota = createManagedQuotaLimiter({ dailyLimit:2, now:() => Date.parse('2026-08-25T10:00:00.000Z') });
  await quota({ license_id:license.license_id });
  await quota({ license_id:license.license_id });
  await assert.rejects(() => quota({ license_id:license.license_id }), error => error.message === 'AI_MANAGED_QUOTA_EXCEEDED');
  console.log('PASS managed-relay-redemption');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
