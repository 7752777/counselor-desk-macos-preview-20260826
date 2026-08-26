/* Bake only public commercial configuration into a desktop package.
 * Private signing keys, payment secrets and model keys are intentionally not
 * accepted here. The generated file is ignored and exists only in the build
 * workspace and packaged application.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const defaultTarget = path.join(root, 'desktop', 'license-config.generated.cjs');
const text = value => String(value == null ? '' : value).trim();
const envBool = value => ['1', 'true', 'yes', 'on'].includes(text(value).toLowerCase());

function parsePublicKeys(environment) {
  const raw = text(environment.CWB_LICENSE_PUBLIC_KEYS_JSON || '{}');
  let value;
  try { value = JSON.parse(raw); } catch (cause) { throw new Error(`CWB_LICENSE_PUBLIC_KEYS_JSON is not valid JSON: ${cause.message}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CWB_LICENSE_PUBLIC_KEYS_JSON must be a JSON object');
  const serialized = JSON.stringify(value);
  if (/PRIVATE KEY|"d"\s*:/i.test(serialized)) throw new Error('Public license configuration must not contain a private key');
  return value;
}

function requireHttps(value, name) {
  let parsed;
  try { parsed = new URL(value); } catch (_) { throw new Error(`${name} must be an HTTPS URL for a commercial build`); }
  if (parsed.protocol !== 'https:') throw new Error(`${name} must be an HTTPS URL for a commercial build`);
  return parsed.toString().replace(/\/$/, '');
}

function prepare(environment, target) {
  const env = environment || process.env;
  const mode = text(env.CWB_LICENSE_MODE || 'development').toLowerCase();
  if (!['development', 'commercial'].includes(mode)) throw new Error('CWB_LICENSE_MODE must be development or commercial');
  const publicKeys = parsePublicKeys(env);
  const config = {
    mode,
    payment_ready:envBool(env.CWB_PAYMENT_READY),
    service_url:mode === 'commercial' ? requireHttps(text(env.CWB_LICENSE_SERVICE_URL), 'CWB_LICENSE_SERVICE_URL') : text(env.CWB_LICENSE_SERVICE_URL),
    public_keys:publicKeys,
    update_feed_url:mode === 'commercial' ? requireHttps(text(env.CWB_UPDATE_FEED_URL), 'CWB_UPDATE_FEED_URL') : text(env.CWB_UPDATE_FEED_URL),
    update_manifest_url:mode === 'commercial' ? requireHttps(text(env.CWB_UPDATE_MANIFEST_URL), 'CWB_UPDATE_MANIFEST_URL') : text(env.CWB_UPDATE_MANIFEST_URL),
    allow_unsigned_preview:mode === 'commercial' && envBool(env.CWB_ALLOW_UNSIGNED_PREVIEW),
    purchase_url:mode === 'commercial' && text(env.CWB_PURCHASE_URL) ? requireHttps(text(env.CWB_PURCHASE_URL), 'CWB_PURCHASE_URL') : text(env.CWB_PURCHASE_URL),
    download_center_url:mode === 'commercial' && text(env.CWB_DOWNLOAD_CENTER_URL) ? requireHttps(text(env.CWB_DOWNLOAD_CENTER_URL), 'CWB_DOWNLOAD_CENTER_URL') : text(env.CWB_DOWNLOAD_CENTER_URL),
    managed_relay_url:mode === 'commercial' && text(env.CWB_AI_MANAGED_RELAY_URL) ? requireHttps(text(env.CWB_AI_MANAGED_RELAY_URL), 'CWB_AI_MANAGED_RELAY_URL') : text(env.CWB_AI_MANAGED_RELAY_URL),
    managed_relay_base_url:mode === 'commercial' && text(env.CWB_AI_MANAGED_BASE_URL) ? requireHttps(text(env.CWB_AI_MANAGED_BASE_URL), 'CWB_AI_MANAGED_BASE_URL') : text(env.CWB_AI_MANAGED_BASE_URL),
    managed_relay_model:text(env.CWB_AI_MANAGED_MODEL || ''),
  };
  if (mode === 'commercial' && !Object.keys(publicKeys).length) throw new Error('Commercial desktop builds require at least one license public key');
  const output = target || defaultTarget;
  fs.writeFileSync(output, `/* Generated at build time. Do not add credentials here. */\nmodule.exports = Object.freeze(${JSON.stringify(config, null, 2)});\n`, 'utf8');
  return config;
}

if (require.main === module) console.log(`Desktop license configuration prepared: ${prepare(process.env).mode}`);

module.exports = { prepare };
