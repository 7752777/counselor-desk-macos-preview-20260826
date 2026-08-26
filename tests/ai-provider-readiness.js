const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/core/cwb-ai.js', 'utf8');
const sandbox = { console, URL, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename:'cwb-ai.js' });

const ai = sandbox.CWBAI;
const base = {
  id:'provider-readiness', key:'custom', model:'demo', enabled:true,
  allowedPurposes:['work_summary', 'certificate_recognition'], dailyQuota:2,
};

assert.equal(ai.providerReadiness(null, 'work_summary').code, 'AI_PROVIDER_NOT_CONFIGURED');
assert.equal(ai.providerReadiness(Object.assign({}, base, { enabled:false }), 'work_summary').code, 'AI_PROVIDER_DISABLED');
assert.equal(ai.providerReadiness(Object.assign({}, base, { model:'' }), 'work_summary').code, 'AI_PROVIDER_MODEL_REQUIRED');
assert.equal(ai.providerReadiness(base, 'notice_rewrite', { credentialsAvailable:true }).code, 'AI_PURPOSE_NOT_ALLOWED');
assert.equal(ai.providerReadiness(base, 'work_summary', { credentialsAvailable:false }).code, 'AI_API_KEY_REQUIRED');
assert.equal(ai.providerReadiness(base, 'certificate_recognition', { credentialsAvailable:true, requireVision:true }).code, 'AI_PROVIDER_VISION_UNSUPPORTED');

const now = new Date('2026-08-21T10:00:00.000Z');
const usedAudits = [
  { action:'generate', provider_id:'provider-readiness', provider:'custom', model:'demo', purpose:'work_summary', status:'completed', created_at:'2026-08-21T01:00:00.000Z' },
  { action:'generate', provider_id:'provider-readiness', provider:'custom', model:'demo', purpose:'weekly_summary', status:'completed', created_at:'2026-08-21T02:00:00.000Z' },
  { action:'generate', provider_id:'other-provider', provider:'custom', model:'demo', purpose:'work_summary', status:'completed', created_at:'2026-08-21T02:30:00.000Z' },
  { action:'provider_test', provider_id:'provider-readiness', provider:'custom', model:'demo', purpose:'work_summary', status:'completed', created_at:'2026-08-21T03:00:00.000Z' },
];
const ready = ai.providerReadiness(Object.assign({}, base, { dailyQuota:3 }), 'work_summary', { credentialsAvailable:true, audits:usedAudits, now });
assert.equal(ready.ok, true);
assert.equal(ready.used, 2);
assert.equal(ready.remaining, 1);
assert.equal(ai.providerReadiness(base, 'work_summary', { credentialsAvailable:true, audits:usedAudits, now }).code, 'AI_DAILY_QUOTA_EXCEEDED');
assert.equal(ai.createAuditEntry({ provider_id:'provider-readiness', provider:'custom', model:'demo' }).provider_id, 'provider-readiness');

const html = fs.readFileSync('index.html', 'utf8');
assert.match(html, /function applyAiProviderReadiness\(\)/);
assert.match(html, /data-ai-provider-readiness/);
assert.match(html, /AI_API_KEY_REQUIRED/);
assert.match(html, /data-act="ai-context-preview"/);
assert.match(html, /data-act="ai-clear-output"/);

console.log('PASS ai-provider-readiness');
