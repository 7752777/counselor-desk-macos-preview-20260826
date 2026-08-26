/* Production bootstrap. Secrets and signer implementations stay outside this
 * repository and are injected through deployment-owned adapter modules. */
const path = require('node:path');
const { migrate } = require('./migrate.cjs');
const { createPostgresStore } = require('./postgres-store.cjs');
const { createCommercialService } = require('./production.cjs');
const { createServer } = require('./server.cjs');
const { createMailer } = require('./mailer.cjs');
const { createHmacWebhookVerifier } = require('./payment-webhook.cjs');
const { normalizeCampaign } = require('./redemption-code.cjs');
const { assertProductionEnvironment, listEnv, text:configText } = require('./config.cjs');

function requiredEnv(name, environment) { const value = String((environment || process.env)[name] || '').trim(); if (!value) throw new Error(`${name} is required`); return value; }
function loadExternal(modulePath, label) {
  if (!modulePath) throw new Error(`${label} adapter module is required; private keys must remain outside this repository`);
  const resolved = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath);
  return require(resolved);
}

async function createProductionApp(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const corsOrigins = opts.corsOrigins != null ? opts.corsOrigins : listEnv(env, 'CWB_LICENSE_CORS_ORIGINS');
  const deployment = assertProductionEnvironment(env, { corsOrigins });
  if (!deployment.production && opts.allowDevelopmentBootstrap !== true) {
    throw Object.assign(new Error('LICENSE_ENV_PRODUCTION_REQUIRED: bootstrap.cjs only starts an explicitly marked production service'), { code:'LICENSE_ENV_PRODUCTION_REQUIRED' });
  }
  let pg;
  try { pg = require('pg'); } catch (cause) { const error = new Error('license-server dependencies are not installed'); error.cause = cause; throw error; }
  const pool = opts.pool || new pg.Pool({ connectionString:requiredEnv('CWB_LICENSE_DATABASE_URL', env), max:Number(env.CWB_LICENSE_DB_POOL_MAX || 10), ssl:String(env.CWB_LICENSE_DATABASE_SSL || '').toLowerCase() === 'true' ? { rejectUnauthorized:true } : undefined });
  await migrate(pool);
  const signerModule = opts.signerModule || loadExternal(env.CWB_LICENSE_SIGNER_MODULE, 'CWB_LICENSE_SIGNER_MODULE');
  const signer = typeof signerModule.createSigner === 'function' ? await signerModule.createSigner({ env }) : signerModule.signer;
  if (!signer || typeof signer.issue !== 'function') throw new Error('external signer module must export createSigner() or signer');
  const store = opts.store || createPostgresStore({ pool });
  if (deployment.production && (!store || typeof store.getAdminApiKey !== 'function')) throw new Error('LICENSE_ADMIN_STORE_REQUIRED: production requires hashed database admin key lookup');
  let redemptionCampaigns = opts.redemptionCampaigns || [];
  if (!redemptionCampaigns.length && env.CWB_LICENSE_REDEMPTION_MODULE) {
    const moduleValue = loadExternal(env.CWB_LICENSE_REDEMPTION_MODULE, 'CWB_LICENSE_REDEMPTION_MODULE');
    redemptionCampaigns = moduleValue.campaigns || moduleValue.redemptionCampaigns || [];
  }
  redemptionCampaigns = redemptionCampaigns.map(normalizeCampaign);
  if (typeof store.upsertRedemptionCampaign === 'function') {
    for (const campaign of redemptionCampaigns) await store.upsertRedemptionCampaign({ ...campaign, product_id:campaign.product_id || 'counselor-desk' });
  }
  let mailer = opts.mailer;
  if (!mailer && env.CWB_LICENSE_MAILER_MODULE) { const moduleValue = loadExternal(env.CWB_LICENSE_MAILER_MODULE, 'CWB_LICENSE_MAILER_MODULE'); mailer = createMailer(moduleValue); }
  let payment = opts.payment;
  if (!payment && env.CWB_LICENSE_PAYMENT_MODULE) { const moduleValue = loadExternal(env.CWB_LICENSE_PAYMENT_MODULE, 'CWB_LICENSE_PAYMENT_MODULE'); payment = typeof moduleValue.createPaymentAdapter === 'function' ? await moduleValue.createPaymentAdapter({ env }) : moduleValue.payment || moduleValue; }
  const service = opts.service || createCommercialService({ store, signer, mailer, payment, redemptionCampaigns, productionMode:true, orderAccessSecret:requiredEnv('CWB_ORDER_ACCESS_SECRET', env), telemetrySalt:env.CWB_TELEMETRY_SALT });
  const admin = deployment.production
    ? { lookup:keyHash => store.getAdminApiKey(keyHash) }
    : (configText(env.CWB_LICENSE_ADMIN_TOKEN) ? { apiKey:env.CWB_LICENSE_ADMIN_TOKEN } : { lookup:keyHash => store.getAdminApiKey(keyHash) });
  const verifyWebhook = opts.verifyWebhook || (env.CWB_LICENSE_WEBHOOK_SECRET ? createHmacWebhookVerifier({ secret:env.CWB_LICENSE_WEBHOOK_SECRET }) : undefined);
  const app = createServer({ service, admin, verifyWebhook, rateLimit:opts.rateLimit, corsOrigins, allowFileOrigin:String(env.CWB_LICENSE_ALLOW_FILE_ORIGIN || '').toLowerCase() === 'true', requireHttps:String(env.CWB_LICENSE_REQUIRE_HTTPS || '').toLowerCase() !== 'false', trustProxy:String(env.CWB_LICENSE_TRUST_PROXY || '').toLowerCase() === 'true' });
  return { app, pool, service };
}

if (require.main === module) {
  createProductionApp().then(async ({ app }) => {
    await app.listen({ host:process.env.CWB_LICENSE_HOST || '127.0.0.1', port:Number(process.env.CWB_LICENSE_PORT || 8787) });
    console.log('Counselor Desk license service started');
  }).catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
}

module.exports = { createProductionApp, assertProductionEnvironment };
