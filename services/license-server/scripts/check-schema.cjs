const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'schema.sql');
const source = fs.readFileSync(file, 'utf8');
const required = ['cwb_products','cwb_orders','cwb_licenses','cwb_license_devices','cwb_webhook_events','cwb_email_outbox','cwb_update_manifests','cwb_audit_events','request_hash'];
for (const name of required) if (!source.includes(name)) throw new Error(`schema missing ${name}`);
if (!/PRIMARY KEY \(provider, event_id\)/.test(source)) throw new Error('schema must support webhook idempotency');
if (!/UNIQUE \(version, channel\)/.test(source)) throw new Error('schema must support manifest replacement');
const redemptionFile = path.join(__dirname, '..', 'schema-redemptions.sql');
const redemptions = fs.readFileSync(redemptionFile, 'utf8');
for (const name of ['cwb_license_redemption_campaigns','cwb_license_redemptions','UNIQUE (campaign_id, workspace_id)']) if (!redemptions.includes(name)) throw new Error(`redemption schema missing ${name}`);
const managedRelayFile = path.join(__dirname, '..', 'schema-managed-relay.sql');
const managedRelay = fs.readFileSync(managedRelayFile, 'utf8');
for (const name of ['cwb_license_relay_grants','UNIQUE (campaign_id, license_id)']) if (!managedRelay.includes(name)) throw new Error(`managed relay schema missing ${name}`);
console.log('PASS license schema check');
