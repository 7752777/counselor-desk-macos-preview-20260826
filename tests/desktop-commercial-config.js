const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepare } = require('../scripts/prepare-desktop-config.cjs');

const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-commercial-config-')), 'license-config.cjs');
try {
  const config = prepare({
    CWB_LICENSE_MODE:'commercial',
    CWB_LICENSE_SERVICE_URL:'https://license.example.test',
    CWB_LICENSE_PUBLIC_KEYS_JSON:JSON.stringify({ primary:'public-key' }),
    CWB_UPDATE_FEED_URL:'https://updates.example.test/counselor-desk',
    CWB_UPDATE_MANIFEST_URL:'https://license.example.test/api/v1/updates/latest',
    CWB_DOWNLOAD_CENTER_URL:'https://download.example.test/counselor-desk',
    CWB_AI_MANAGED_BASE_URL:'https://queqiao.online',
    CWB_AI_MANAGED_MODEL:'gpt-5.5',
  }, target);
  assert.equal(config.mode, 'commercial');
  assert.equal(config.service_url, 'https://license.example.test');
  assert.equal(config.update_feed_url, 'https://updates.example.test/counselor-desk');
  assert.equal(config.update_manifest_url, 'https://license.example.test/api/v1/updates/latest');
  assert.equal(config.download_center_url, 'https://download.example.test/counselor-desk');
  assert.equal(config.managed_relay_base_url, 'https://queqiao.online');
  assert.equal(config.managed_relay_model, 'gpt-5.5');
  assert.match(fs.readFileSync(target, 'utf8'), /public-key/);
  assert.throws(() => prepare({ CWB_LICENSE_MODE:'commercial', CWB_LICENSE_SERVICE_URL:'http://license.example.test', CWB_UPDATE_FEED_URL:'https://updates.example.test', CWB_UPDATE_MANIFEST_URL:'https://license.example.test/api/v1/updates/latest', CWB_LICENSE_PUBLIC_KEYS_JSON:'{"primary":"key"}' }, target), /HTTPS/);
  assert.throws(() => prepare({ CWB_LICENSE_MODE:'commercial', CWB_LICENSE_SERVICE_URL:'https://license.example.test', CWB_UPDATE_FEED_URL:'https://updates.example.test', CWB_UPDATE_MANIFEST_URL:'https://license.example.test/api/v1/updates/latest', CWB_LICENSE_PUBLIC_KEYS_JSON:'{}' }, target), /public key/);
  const forbiddenPrivateKey = ['-----BEGIN ', 'PRIVATE ', 'KEY-----'].join('');
  assert.throws(() => prepare({ CWB_LICENSE_MODE:'commercial', CWB_LICENSE_SERVICE_URL:'https://license.example.test', CWB_UPDATE_FEED_URL:'https://updates.example.test', CWB_UPDATE_MANIFEST_URL:'https://license.example.test/api/v1/updates/latest', CWB_LICENSE_PUBLIC_KEYS_JSON:JSON.stringify({ primary:forbiddenPrivateKey }) }, target), /private key/i);
  console.log('PASS desktop-commercial-config');
} finally {
  fs.rmSync(path.dirname(target), { recursive:true, force:true });
}
