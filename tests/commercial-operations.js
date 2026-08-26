const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const licenseCore = require('../src/core/cwb-license.js');
const telemetryCore = require('../src/core/cwb-telemetry.js');
const { createSigner } = require('../services/license-server/service.cjs');
const { createCommercialService } = require('../services/license-server/production.cjs');
const { createCommercialMemoryStore } = require('./license-server-fixture.js');
const operations = require('../services/license-server/commercial-operations.cjs');

(async () => {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  const signer = createSigner({ privateKey, kid:'operations-contract' });
  const store = createCommercialMemoryStore();
  const service = createCommercialService({ store, signer, orderAccessSecret:'operations-secret', telemetrySalt:'telemetry-salt' });
  const actor = { authenticated:true, actor_type:'admin_api_key', actor_id:'ops-admin' };

  const trial = await service.createTrial({ plan:'ai', customer_email:'trial@example.test', days:14, idempotency_key:'trial-1' }, actor);
  assert.equal(trial.trial.status, 'active');
  assert.equal(trial.trial.days, 14);
  assert.equal(trial.license.trial, true);
  assert.ok(trial.license.expires_at);
  assert.match(trial.token, /^CWB-LIC-1\./);
  const trialParsed = licenseCore.parse(trial.token);
  assert.equal(trialParsed.expires_at, trial.trial.expires_at);
  const trialRetry = await service.createTrial({ plan:'ai', customer_email:'trial@example.test', days:14, idempotency_key:'trial-1' }, actor);
  assert.equal(trialRetry.license.license_id, trial.license.license_id, 'trial issuance must be idempotent');

  const batch = await service.createLicenseBatch({ plan:'standard_perpetual', customer_email:'batch@example.test', count:3, workspace_ids:['w-a','w-b','w-c'], idempotency_key:'batch-1' }, actor);
  assert.equal(batch.batch.quantity, 3);
  assert.equal(batch.licenses.length, 3);
  assert.deepEqual(batch.licenses.map(item => item.workspace_id), ['w-a','w-b','w-c']);
  assert.equal(new Set(batch.licenses.map(item => item.token)).size, 3);
  const batchRetry = await service.createLicenseBatch({ plan:'standard_perpetual', customer_email:'batch@example.test', count:3, workspace_ids:['w-a','w-b','w-c'], idempotency_key:'batch-1' }, actor);
  assert.deepEqual(batchRetry.licenses.map(item => item.license_id), batch.licenses.map(item => item.license_id));

  const organization = await service.createOrganization({ organization_id:'college-1', name:'示例学院', customer_email:'college@example.test', plan:'ai_perpetual', workspace_ids:['college-w1','college-w2'] }, actor);
  assert.equal(organization.organization.organization_id, 'college-1');
  assert.equal(organization.workspaces.length, 2);
  assert.equal(organization.licenses.length, 2);
  assert.deepEqual(organization.workspaces.map(item => item.workspace_id), ['college-w1','college-w2']);
  const listed = await service.organizationWorkspaces('college-1', actor);
  assert.equal(listed.workspaces.length, 2);

  await assert.rejects(() => service.recordTelemetry({ consent:false, installation_id:'raw-installation', event_name:'app_started', app_version:'4.9.0', platform:'win32' }), error => error.code === 'TELEMETRY_CONSENT_REQUIRED');
  const telemetry = await service.recordTelemetry({ consent:true, installation_id:'raw-installation', event_name:'app_started', app_version:'4.9.0', platform:'win32', properties:{ prompt:'must-drop', student_id:'must-drop', records_count:12 } });
  assert.equal(telemetry.inserted, true);
  const storedMetric = [...store.telemetry.values()][0];
  assert.notEqual(storedMetric.installation_id_hash, 'raw-installation');
  assert.deepEqual(storedMetric.properties, { records_count:12 });

  const telemetryManager = telemetryCore.createManager({ storage:{ get:() => false, set:() => {} }, installationId:'install-1', appVersion:'4.9.0', platform:'browser' });
  assert.equal((await telemetryManager.record({ event_name:'app_started' })).skipped, true);
  telemetryManager.setOptIn(true);
  const sent = [];
  const activeManager = telemetryCore.createManager({ storage:{ get:() => true, set:() => {} }, installationId:'install-2', appVersion:'4.9.0', platform:'browser', transport:async value => { sent.push(value); return { ok:true }; } });
  await activeManager.record({ event_name:'backup_completed', properties:{ attachments_count:2, secret:'drop' } });
  assert.equal(sent[0].consent, true);
  assert.equal(sent[0].properties.secret, undefined);

  assert.throws(() => operations.normalizeBatchInput({ plan:'ai', customer_email:'x@example.test', count:501 }), error => error.code === 'LICENSE_BATCH_SIZE_INVALID');
  assert.throws(() => operations.normalizeTelemetryInput({ consent:true, installation_id:'i', event_name:'unknown', app_version:'4.9.0', platform:'browser' }, { salt:'s' }), error => error.code === 'TELEMETRY_EVENT_INVALID');
  console.log('PASS commercial-operations');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
