const crypto = require('node:crypto');
const { hash } = require('../services/license-server/postgres-store.cjs');

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function createCommercialMemoryStore(options) {
  const opts = options || {};
  const products = new Map([
    ['standard', { plan:'standard', product_id:'counselor-desk', label:'普通版', ai_enabled:false, perpetual_updates:false, major_version:4, price_minor:Number(opts.standardPrice ?? 1000), currency:'CNY', metadata:{ display_price:'10 元' } }],
    ['standard_perpetual', { plan:'standard_perpetual', product_id:'counselor-desk', label:'普通永久更新版', ai_enabled:false, perpetual_updates:true, major_version:4, price_minor:Number(opts.standardPerpetualPrice ?? 2000), currency:'CNY', metadata:{ display_price:'20 元' } }],
    ['ai', { plan:'ai', product_id:'counselor-desk', label:'AI 增强版', ai_enabled:true, perpetual_updates:false, major_version:4, price_minor:Number(opts.aiPrice ?? 4000), currency:'CNY', metadata:{ display_price:'40 元' } }],
    ['ai_perpetual', { plan:'ai_perpetual', product_id:'counselor-desk', label:'永久 AI 增强版', ai_enabled:true, perpetual_updates:true, major_version:4, price_minor:Number(opts.aiPerpetualPrice ?? 6000), currency:'CNY', metadata:{ display_price:'60 元' } }],
  ]);
  const orders = new Map(); const licenses = new Map(); const devices = new Map(); const webhooks = new Map(); const emails = new Map(); const audits = []; const manifests = new Map(); const trials = new Map(); const batches = new Map(); const organizations = new Map(); const organizationWorkspaces = new Map(); const telemetry = new Map(); const redemptionCampaigns = new Map(); const redemptions = new Map(); const managedRelayGrants = new Map();
  const copy = value => clone(value);
  return {
    products, orders, licenses, devices, webhooks, emails, audits, manifests, trials, batches, organizations, organizationWorkspaces, telemetry, redemptionCampaigns, redemptions, managedRelayGrants,
    async listProducts() { return [...products.values()].map(copy); },
    async getProduct(plan) { return copy(products.get(plan)); },
    async upsertRedemptionCampaign(value) { const row = { ...value, product_id:value.product_id || 'counselor-desk', metadata:value.metadata || {} }; redemptionCampaigns.set(row.campaign_id, row); return copy(row); },
    async getRedemptionCampaignByCodeHash(codeHash) { return copy([...redemptionCampaigns.values()].find(row => row.code_hash === codeHash)); },
    async getRedemptionByWorkspace(campaignId, workspaceId) { return copy([...redemptions.values()].find(row => row.campaign_id === campaignId && row.workspace_id === workspaceId)); },
    async getManagedRelayGrant(campaignId, licenseId) { return copy([...managedRelayGrants.values()].find(row => row.campaign_id === campaignId && row.license_id === licenseId)); },
    async getActiveManagedRelayGrant(licenseId, workspaceId) { return copy([...managedRelayGrants.values()].find(row => row.license_id === licenseId && row.workspace_id === workspaceId && row.status === 'active')); },
    async createManagedRelayGrant(value) {
      const grant = value && value.grant || {};
      const existing = [...managedRelayGrants.values()].find(row => row.campaign_id === grant.campaign_id && row.license_id === grant.license_id);
      if (existing) return copy(existing);
      const row = { ...grant, grant_id:grant.grant_id || id('grant'), issued_at:new Date().toISOString(), revoked_at:null, metadata:grant.metadata || {} };
      managedRelayGrants.set(row.grant_id, row);
      return copy(row);
    },
    async createRedeemedLicense(value) {
      const existing = [...redemptions.values()].find(row => row.campaign_id === value.redemption.campaign_id && row.workspace_id === value.redemption.workspace_id);
      if (existing) return { redemption:copy(existing), license:copy(licenses.get(existing.license_id)) };
      const license = { ...value.license, token_hash:hash(value.license.token), status:'active', revoked_after:0, created_at:new Date().toISOString(), revoked_at:null };
      licenses.set(license.license_id, license);
      const redemption = { redemption_id:value.redemption.redemption_id || id('redemption'), ...value.redemption, license_id:license.license_id, redeemed_at:new Date().toISOString() };
      redemptions.set(`${redemption.campaign_id}:${redemption.workspace_id}`, redemption);
      return { redemption:copy(redemption), license:copy(license) };
    },
    async createOrder(value) {
      const existing = [...orders.values()].find(row => row.idempotency_key === value.idempotency_key);
      if (existing) { if (existing.request_hash !== value.request_hash) { const error = new Error('ORDER_IDEMPOTENCY_CONFLICT'); error.code = 'ORDER_IDEMPOTENCY_CONFLICT'; throw error; } return copy(existing); }
      const order = { order_id:value.order_id || id('ord'), idempotency_key:value.idempotency_key, request_hash:value.request_hash, product_id:value.product_id, plan:value.plan, customer_email:value.customer_email, amount_minor:value.amount_minor, currency:value.currency, provider:value.provider || '', provider_order_id:'', status:'pending', access_token_hash:value.access_token_hash, access_token_expires_at:value.access_token_expires_at || null, metadata:value.metadata || {}, created_at:new Date().toISOString(), paid_at:null, fulfilled_at:null, refunded_at:null };
      orders.set(order.order_id, order); return copy(order);
    },
    async getOrder(orderId) { return copy(orders.get(orderId)); },
    async updateOrderCheckout(value) { const order = orders.get(value.order_id); if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { code:'ORDER_NOT_FOUND' }); order.metadata = { ...(order.metadata || {}), checkout_url:value.checkout_url, checkout_source:'payment_adapter', checkout_created_at:new Date().toISOString() }; order.provider = value.provider || order.provider; return copy(order); },
    async getOrderByAccessToken(token) { return copy([...orders.values()].find(row => row.access_token_hash === hash(token))); },
    async markOrderPaid(value) { const order = orders.get(value.order_id); if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { code:'ORDER_NOT_FOUND' }); if (order.status === 'refunded') throw Object.assign(new Error('ORDER_STATE_INVALID'), { code:'ORDER_STATE_INVALID' }); order.status = order.status === 'fulfilled' ? 'fulfilled' : 'paid'; order.provider = value.provider || order.provider; order.provider_order_id = value.provider_order_id || order.provider_order_id; order.paid_at ||= new Date().toISOString(); return copy(order); },
    async markOrderFulfilled(orderId) { const order = orders.get(orderId); order.status = 'fulfilled'; order.fulfilled_at ||= new Date().toISOString(); return copy(order); },
    async markOrderRefunded(orderId) { const order = orders.get(orderId); if (!order) throw Object.assign(new Error('ORDER_NOT_FOUND'), { code:'ORDER_NOT_FOUND' }); order.status = 'refunded'; order.refunded_at = new Date().toISOString(); return copy(order); },
    async createLicense(value) { const record = { ...value, token_hash:hash(value.token), status:'active', revoked_after:0, created_at:new Date().toISOString(), revoked_at:null }; licenses.set(record.license_id, record); return copy(record); },
    async getTrialByIdempotency(key) { return copy([...trials.values()].find(row => row.idempotency_key === key)); },
    async createTrial(value) {
      const existing = [...trials.values()].find(row => row.idempotency_key === value.trial.idempotency_key);
      if (existing) return { trial:copy(existing), license:copy(licenses.get(existing.license_id)) };
      const license = { ...value.license, token_hash:hash(value.license.token), status:'active', revoked_after:0, created_at:new Date().toISOString(), revoked_at:null };
      licenses.set(license.license_id, license);
      const trial = { ...value.trial, license_id:license.license_id, status:'active', created_at:new Date().toISOString() };
      trials.set(trial.trial_id, trial);
      return { trial:copy(trial), license:copy(license) };
    },
    async getBatchByIdempotency(key) { return copy([...batches.values()].find(row => row.batch.idempotency_key === key)); },
    async createLicenseBatch(value) {
      const existing = [...batches.values()].find(row => row.batch.idempotency_key === value.batch.idempotency_key);
      if (existing) return copy(existing);
      const created = { batch:copy(value.batch), licenses:[] };
      value.licenses.forEach(licenseValue => { const license = { ...licenseValue, token_hash:hash(licenseValue.token), status:'active', revoked_after:0, created_at:new Date().toISOString(), revoked_at:null }; licenses.set(license.license_id, license); created.licenses.push(copy(license)); });
      batches.set(created.batch.batch_id, created);
      return copy(created);
    },
    async createOrganization(value) { const row = { ...value, created_at:new Date().toISOString(), updated_at:new Date().toISOString() }; organizations.set(row.organization_id, row); return copy(row); },
    async upsertOrganizationWorkspace(value) { const key = `${value.organization_id}:${value.workspace_id}`; const row = { ...value, updated_at:new Date().toISOString() }; organizationWorkspaces.set(key, row); return copy(row); },
    async listOrganizationWorkspaces(organizationId) { return [...organizationWorkspaces.values()].filter(row => row.organization_id === organizationId).map(copy); },
    async recordTelemetry(value) { const inserted = !telemetry.has(value.event_id); if (inserted) telemetry.set(value.event_id, copy(value)); return { inserted, event:inserted ? copy(value) : copy(telemetry.get(value.event_id)) }; },
    async getLicense(idValue) { return copy(licenses.get(idValue)); },
    async getLicenseByOrder(orderId) { return copy([...licenses.values()].find(row => row.order_id === orderId)); },
    async listDevices(licenseId) { return [...devices.values()].filter(row => row.license_id === licenseId).map(copy); },
    async activateDevice(value) {
      const license = licenses.get(value.license_id); if (!license) throw Object.assign(new Error('LICENSE_NOT_FOUND'), { code:'LICENSE_NOT_FOUND' });
      if (license.status !== 'active') throw Object.assign(new Error('LICENSE_REVOKED'), { code:'LICENSE_REVOKED' });
      if (license.workspace_id && license.workspace_id !== value.workspace_id) throw Object.assign(new Error('LICENSE_WORKSPACE_MISMATCH'), { code:'LICENSE_WORKSPACE_MISMATCH' });
      const key = `${value.license_id}:${value.device_id}`; const existing = devices.get(key); const active = [...devices.values()].filter(row => row.license_id === value.license_id && row.status === 'active');
      if (!existing && active.length >= Number(license.device_limit || 3)) throw Object.assign(new Error('LICENSE_DEVICE_LIMIT'), { code:'LICENSE_DEVICE_LIMIT' });
      if (!license.workspace_id) license.workspace_id = value.workspace_id;
      const device = existing || { license_id:value.license_id, device_id:value.device_id, activated_at:new Date().toISOString() };
      Object.assign(device, { workspace_id:value.workspace_id, status:'active', last_seen_at:new Date().toISOString(), deactivated_at:null }); devices.set(key, device); return { license:copy(license), device:copy(device) };
    },
    async touchDevice(value) { const row = devices.get(`${value.license_id}:${value.device_id}`); if (!row || row.status !== 'active' || row.workspace_id !== value.workspace_id) throw Object.assign(new Error('LICENSE_DEVICE_NOT_FOUND'), { code:'LICENSE_DEVICE_NOT_FOUND' }); row.last_seen_at = new Date().toISOString(); return copy(row); },
    async deactivateDevice(value) { const row = devices.get(`${value.license_id}:${value.device_id}`); if (!row) throw Object.assign(new Error('LICENSE_DEVICE_NOT_FOUND'), { code:'LICENSE_DEVICE_NOT_FOUND' }); row.status = 'revoked'; row.deactivated_at = new Date().toISOString(); return copy(row); },
    async revokeLicense(value) { const license = licenses.get(value.license_id); if (!license) throw Object.assign(new Error('LICENSE_NOT_FOUND'), { code:'LICENSE_NOT_FOUND' }); license.status = 'revoked'; license.revoked_after = Date.parse(value.revoked_after || new Date()); license.revoked_at = new Date().toISOString(); license.revoke_reason = value.reason || ''; return copy(license); },
    async recordWebhook(value) { const key = `${value.provider}:${value.event_id}`; if (webhooks.has(key)) return { inserted:false, event:copy(webhooks.get(key)) }; const row = { ...value, status:'received' }; webhooks.set(key, row); return { inserted:true, event:copy(row) }; },
    async completeWebhook(value) { const row = webhooks.get(`${value.provider}:${value.event_id}`); if (row) Object.assign(row, value); return copy(row); },
    async enqueueEmail(value) { const row = { message_id:value.message_id || id('mail'), ...value, status:'pending', attempts:0 }; emails.set(row.message_id, row); return copy(row); },
    async claimEmail(messageId) { const row = emails.get(messageId); if (!row || ['sent','sending'].includes(row.status)) return null; row.status = 'sending'; row.attempts += 1; return copy(row); },
    async markEmailSent(messageId) { const row = emails.get(messageId); row.status = 'sent'; row.sent_at = new Date().toISOString(); return copy(row); },
    async markEmailFailed(messageId, cause) { const row = emails.get(messageId); row.status = 'failed'; row.last_error = String(cause); return copy(row); },
    async listDueEmails() { return [...emails.values()].filter(row => ['pending','failed'].includes(row.status)).map(copy); },
    async createAudit(value) { const row = { audit_id:value.audit_id || id('audit'), ...value, created_at:new Date().toISOString() }; audits.push(row); return copy(row); },
    async listAudit() { return audits.map(copy); },
    async latestPublishedManifest(channel) { return copy(manifests.get(channel)); },
    async saveManifest(value) { manifests.set(value.channel, copy(value.manifest)); return { manifest_id:value.manifest_id, version:value.version, channel:value.channel, status:value.status }; },
  };
}

module.exports = { createCommercialMemoryStore };
