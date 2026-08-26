const assert = require('node:assert/strict');
const { createPostgresStore } = require('../services/license-server/postgres-store.cjs');
const { migrate } = require('../services/license-server/migrate.cjs');

(async () => {
  const calls = [];
  const product = { plan:'ai', product_id:'counselor-desk', label:'AI 增强版', ai_enabled:true, perpetual_updates:false, major_version:4, price_minor:49900, currency:'CNY', metadata:{} };
  const pool = { async query(sql, values) {
    calls.push({ sql, values });
    if (/SELECT 1 AS ok/.test(sql)) return { rows:[{ ok:1 }] };
    if (/FROM cwb_products/.test(sql)) return { rows:[product] };
    if (/SELECT \* FROM cwb_orders WHERE idempotency_key/.test(sql)) return { rows:[] };
    if (/INSERT INTO cwb_orders/.test(sql)) return { rows:[{ order_id:'ord-1', idempotency_key:'idem-1', request_hash:'hash', product_id:'counselor-desk', plan:'ai', customer_email:'a@example.test', amount_minor:49900, currency:'CNY', status:'pending', access_token_hash:'access-hash', metadata:{}, created_at:new Date().toISOString() }] };
    if (/INSERT INTO cwb_licenses/.test(sql)) return { rows:[{ license_id:'lic-1', order_id:'ord-1', product_id:'counselor-desk', plan:'ai', token:'CWB-LIC-1.payload.signature', token_hash:'token-hash', kid:'kid-1', major_version:4, device_limit:3, status:'active', revoked_after:0, issued_at:new Date().toISOString(), metadata:{} }] };
    if (/SELECT \* FROM cwb_licenses WHERE order_id/.test(sql)) return { rows:[] };
    if (/SELECT \* FROM cwb_licenses WHERE license_id/.test(sql)) return { rows:[{ license_id:'lic-1', product_id:'counselor-desk', plan:'ai', token_hash:'token-hash', kid:'kid-1', major_version:4, device_limit:3, status:'active', revoked_after:0, issued_at:new Date().toISOString(), metadata:{} }] };
    if (/SELECT \* FROM cwb_license_devices WHERE license_id/.test(sql)) return { rows:[] };
    if (/SELECT count\(\*\)/.test(sql)) return { rows:[{ count:0 }] };
    if (/INSERT INTO cwb_license_devices/.test(sql)) return { rows:[{ license_id:'lic-1', device_id:'device-1', workspace_id:'workspace-1', status:'active', activated_at:new Date().toISOString(), last_seen_at:new Date().toISOString(), metadata:{} }] };
    if (/UPDATE cwb_licenses SET workspace_id/.test(sql)) return { rows:[] };
    throw new Error(`unexpected SQL in contract: ${sql}`);
  } };
  const store = createPostgresStore({ pool });
  assert.deepEqual(await store.health(), { ok:true, backend:'postgres' });
  assert.equal((await store.getProduct('ai')).plan, 'ai');
  const order = await store.createOrder({ idempotency_key:'idem-1', request_hash:'hash', product_id:'counselor-desk', plan:'ai', customer_email:'a@example.test', amount_minor:49900, currency:'CNY', access_token_hash:'access-hash' });
  assert.equal(order.order_id, 'ord-1');
  const license = await store.createLicense({ license_id:'lic-1', order_id:'ord-1', product_id:'counselor-desk', plan:'ai', token:'CWB-LIC-1.payload.signature', kid:'kid-1', major_version:4, device_limit:3, issued_at:new Date().toISOString() });
  assert.equal(license.license_id, 'lic-1');
  const activated = await store.activateDevice({ license_id:'lic-1', device_id:'device-1', workspace_id:'workspace-1' });
  assert.equal(activated.device.device_id, 'device-1');
  assert.ok(calls.some(call => /INSERT INTO cwb_orders/.test(call.sql) && call.sql.includes('$1')));
  assert.ok(calls.every(call => !call.sql.includes('a@example.test')), 'customer values must be query parameters');

  const migrationCalls = [];
  const migrationPool = { async query(sql, values) { migrationCalls.push({ sql, values }); if (/SELECT name FROM cwb_schema_migrations/.test(sql)) return { rows:[] }; return { rows:[] }; } };
  const migration = await migrate(migrationPool, { schemaPath:require('node:path').join(__dirname, '..', 'services', 'license-server', 'schema.sql') });
  assert.equal(migration.applied, true);
  assert.ok(migrationCalls.some(call => /CREATE TABLE IF NOT EXISTS cwb_products/.test(call.sql)));
  const schemaSql = migrationCalls.find(call => /CREATE TABLE IF NOT EXISTS cwb_products/.test(call.sql)).sql;
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS cwb_license_trials/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS cwb_license_batches/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS cwb_license_organizations/);
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS cwb_telemetry_events/);
  assert.ok(!migrationCalls.some(call => /DROP TABLE|TRUNCATE|DELETE FROM/i.test(call.sql)), 'migration must not delete business data');
  console.log('PASS license-postgres-contract');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
