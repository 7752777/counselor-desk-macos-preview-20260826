const assert = require('node:assert/strict');
const generator = require('../services/license-server/scripts/generate-redemption-codes.cjs');
const redemption = require('../services/license-server/redemption-code.cjs');

const generated = redemption.generate();
assert.match(generated.code, /^CWB-REDEEM-1\.[A-Za-z0-9_-]{43}$/);
assert.match(generated.code_hash, /^[a-f0-9]{64}$/);
assert.equal(redemption.hash(generated.code), generated.code_hash);
assert.throws(() => redemption.parse('CWB-REDEEM-1.too-short'), error => error.code === 'REDEMPTION_CODE_INVALID');
assert.throws(() => redemption.normalizeCampaign({ campaign_id:'test', plan:'ai', code:generated.code, code_hash:generated.code_hash }), error => error.code === 'REDEMPTION_PLAINTEXT_FORBIDDEN');
assert.throws(() => redemption.normalizeCampaign({ campaign_id:'test', plan:'ai', code_hash:generated.code_hash, status:'unknown' }), error => error.code === 'REDEMPTION_STATUS_INVALID');
const campaign = redemption.normalizeCampaign({ campaign_id:'test-campaign', plan:'ai_perpetual', code_hash:generated.code_hash, status:'active' });
assert.equal(campaign.plan, 'ai_perpetual');
assert.equal(campaign.product_id, '');
assert.equal(typeof generator.generateCampaigns, 'function');
const campaigns = generator.generateCampaigns();
assert.equal(campaigns.length, 3);
assert.deepEqual(campaigns.map(item => item.campaign_id), [
  'pilot-standard-perpetual',
  'contributor-ai-perpetual',
  'friendship-managed-relay',
]);
assert.equal(campaigns[2].metadata.managed_relay, true);
assert.equal(campaigns[2].metadata.kind, 'managed_relay');
console.log('PASS redemption-code');
