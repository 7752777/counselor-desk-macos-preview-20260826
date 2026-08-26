/* Runtime configuration shared by the Electron main process and preload.
 * Commercial builds prefer the generated, packaged config so a customer's
 * environment cannot accidentally switch a release back to development mode.
 * Source/dev runs still accept explicit environment overrides when no build
 * config has been generated.
 */
const generated = (() => {
  try { return require('./license-config.generated.cjs'); } catch (_) { return {}; }
})();

function text(value) { return String(value == null ? '' : value).trim(); }
function envBool(value) { return ['1', 'true', 'yes', 'on'].includes(text(value).toLowerCase()); }
function envJson(value) {
  try {
    const parsed = JSON.parse(text(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) { return {}; }
}

const env = typeof process !== 'undefined' && process && process.env ? process.env : {};
const hasGenerated = generated && typeof generated === 'object' && Object.keys(generated).length > 0;
const config = {
  mode:text(hasGenerated && generated.mode || env.CWB_LICENSE_MODE || 'development').toLowerCase(),
  serviceUrl:text(hasGenerated && generated.service_url || env.CWB_LICENSE_SERVICE_URL || ''),
  publicKeys:hasGenerated && generated.public_keys && typeof generated.public_keys === 'object'
    ? generated.public_keys : envJson(env.CWB_LICENSE_PUBLIC_KEYS_JSON),
  paymentReady:hasGenerated ? generated.payment_ready === true : envBool(env.CWB_PAYMENT_READY),
  updateFeedUrl:text(hasGenerated && generated.update_feed_url || env.CWB_UPDATE_FEED_URL || ''),
  updateManifestUrl:text(hasGenerated && generated.update_manifest_url || env.CWB_UPDATE_MANIFEST_URL || ''),
  purchaseUrl:text(hasGenerated && generated.purchase_url || env.CWB_PURCHASE_URL || ''),
  downloadCenterUrl:text(hasGenerated && generated.download_center_url || env.CWB_DOWNLOAD_CENTER_URL || ''),
  managedRelayUrl:text(hasGenerated && generated.managed_relay_url || env.CWB_AI_MANAGED_RELAY_URL || ''),
  managedRelayBaseUrl:text(hasGenerated && generated.managed_relay_base_url || env.CWB_AI_MANAGED_BASE_URL || ''),
  managedRelayModel:text(hasGenerated && generated.managed_relay_model || env.CWB_AI_MANAGED_MODEL || ''),
};

module.exports = Object.freeze(config);
