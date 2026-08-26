const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.cjs'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const stateCodec = require('../desktop/license-state.cjs');

for (const token of ['desktop:get-license-state', 'desktop:set-license-state', 'desktop:delete-license-state', 'safeStorage.encryptString', 'license-state.bin', 'atomicWriteFile']) {
  assert.ok(main.includes(token), `desktop license storage missing ${token}`);
}
const persisted = stateCodec.validateLicenseState({
  status:'active', reason:'', token:'CWB-LIC-1.payload.signature', device_id:'device-1',
  last_online_at:'2026-08-25T00:00:00.000Z', last_seen_at:'2026-08-25T00:00:00.000Z',
  managed_relay:{ grant_id:'grant-1', campaign_id:'friendship-managed-relay', license_id:'license-1', status:'active', issued_at:'2026-08-25T00:00:00.000Z' },
});
assert.equal(persisted.managed_relay.grant_id, 'grant-1', 'Electron safe storage must retain managed relay qualification');
assert.equal(persisted.managed_relay.license_id, 'license-1');
assert.throws(() => stateCodec.validateLicenseState({ token:'CWB-LIC-1.payload.signature', managed_relay:{ status:'active' } }), /LICENSE_STATE_INVALID/);
assert.throws(() => stateCodec.validateManagedRelayState({ grant_id:'grant-1', license_id:'license-1', status:'unknown' }), /LICENSE_STATE_INVALID/);
for (const token of ['getLicenseState', 'setLicenseState', 'deleteLicenseState', 'licenseConfig']) assert.ok(preload.includes(token), `preload license bridge missing ${token}`);
for (const token of ['data-cwb-license', 'data-cwb-update', 'CWB.entitlements', 'CWB_LICENSE_MODE', 'cwb-ai-locked', "require('ai')"]) assert.ok(html.includes(token), `renderer license contract missing ${token}`);
for (const token of ['src/core/cwb-license.js', 'src/core/cwb-update.js']) assert.ok(builder.includes(token), `desktop package missing ${token}`);
assert.match(main, /license-state.bin/);
assert.match(main, /validateLicenseState/);
assert.match(main, /license-state\.cjs/);
assert.doesNotMatch(main, /license-state.*records_|records_.*license-state/, 'license state must not be placed in SQLite collection names');
console.log('PASS license-storage');
