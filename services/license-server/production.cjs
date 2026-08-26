/* Commercial service domain layer. No HTTP or framework concerns belong here. */
const crypto = require('node:crypto');
const licenseCore = require('../../src/core/cwb-license.js');
const updateCore = require('../../src/core/cwb-update.js');
const relayCore = require('../../src/core/cwb-license-relay.js');
const { hash, codedError } = require('./postgres-store.cjs');
const redemptionCode = require('./redemption-code.cjs');
const operations = require('./commercial-operations.cjs');

const ORDER_ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function text(value) { return String(value == null ? '' : value).trim(); }
function nowIso(value) { return new Date(value == null ? Date.now() : value).toISOString(); }
function required(value, code) { const result = text(value); if (!result || result.length > 240 || /[\x00-\x1f]/.test(result)) throw codedError(code, '字段无效'); return result; }
function credential(value, code) { const result = text(value); if (!result || result.length > 16 * 1024 || /[\x00-\x1f]/.test(result)) throw codedError(code, '凭据无效'); return result; }
function email(value) { const result = required(value, 'ORDER_EMAIL_REQUIRED').toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) || result.length > 320) throw codedError('ORDER_EMAIL_INVALID', '邮箱地址无效'); return result; }
function publicLicense(value) {
  if (!value) return null;
  const entitlement = licenseCore.PLANS[value.plan] || {};
  return { license_id:value.license_id, product_id:value.product_id, plan:value.plan, workspace_id:value.workspace_id || '', kid:value.kid, major_version:Number(value.major_version), device_limit:Number(value.device_limit), ai:Boolean(entitlement.ai), perpetual_updates:Boolean(entitlement.perpetualUpdates), managed_relay:Boolean(value.metadata && value.metadata.managed_relay), status:value.status, issued_at:value.issued_at, expires_at:value.expires_at || '', trial:Boolean(value.metadata && value.metadata.trial), revoked_at:value.revoked_at || null };
}
function checkoutUrl(value) { return value && value.metadata && value.metadata.checkout_source === 'payment_adapter' ? text(value.metadata.checkout_url) : ''; }
function productView(value) { return value ? { plan:value.plan, product_id:value.product_id, label:value.label, ai_enabled:Boolean(value.ai_enabled), perpetual_updates:Boolean(value.perpetual_updates), major_version:Number(value.major_version), price_minor:Number(value.price_minor), currency:value.currency, metadata:value.metadata || {} } : null; }
function randomSecret(prefix) { return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`; }
function orderAccessExpiry(order) {
  const explicit = Date.parse(text(order && order.access_token_expires_at));
  if (Number.isFinite(explicit)) return explicit;
  const created = Date.parse(text(order && order.created_at));
  return Number.isFinite(created) ? created + ORDER_ACCESS_TOKEN_TTL_MS : NaN;
}
function assertOrderAccessActive(order, nowValue) {
  const expiresAt = orderAccessExpiry(order);
  if (!Number.isFinite(expiresAt) || new Date(nowValue == null ? Date.now() : nowValue).getTime() >= expiresAt) throw codedError('ORDER_ACCESS_EXPIRED', '订单取件凭证已过期，请重新获取订单交付链接');
  return new Date(expiresAt).toISOString();
}

function createCommercialService(options) {
  const opts = options || {};
  const store = opts.store;
  const signer = opts.signer;
  if (!store) throw codedError('LICENSE_STORE_REQUIRED');
  if (!signer || typeof signer.issue !== 'function') throw codedError('LICENSE_SIGNER_REQUIRED');
  const productId = text(opts.productId || licenseCore.PRODUCT_ID);
  const majorVersion = Number(opts.majorVersion || 4);
  const productionMode = opts.productionMode === true || text(process.env.CWB_LICENSE_ENV).toLowerCase() === 'production';
  const requirePrices = opts.requireConfiguredPrices !== false && productionMode;
  const orderAccessSecret = text(opts.orderAccessSecret || process.env.CWB_ORDER_ACCESS_SECRET || (!productionMode ? 'development-only-order-access-secret' : ''));
  if (!orderAccessSecret) throw codedError('ORDER_ACCESS_SECRET_REQUIRED', '生产订单访问令牌必须配置独立服务端密钥');
  const publicKeys = opts.publicKeys || signer.publicKeys || (signer.kid ? { [signer.kid]:signer.publicKey } : {});
  const updatePublicKeys = opts.updatePublicKeys || publicKeys;
  const telemetrySalt = text(opts.telemetrySalt || process.env.CWB_TELEMETRY_SALT);
  const configuredRedemptions = Array.isArray(opts.redemptionCampaigns) ? opts.redemptionCampaigns.map(redemptionCode.normalizeCampaign) : [];
  const payment = opts.payment && typeof opts.payment.createCheckout === 'function' ? opts.payment : null;
  const now = typeof opts.now === 'function' ? opts.now : () => new Date();
  const audit = async (action, details, actor) => {
    if (typeof store.createAudit === 'function') await store.createAudit({ actor_type:actor && actor.actor_type || 'system', actor_id:actor && actor.actor_id || '', action, subject_type:details && details.subject_type || '', subject_id:details && details.subject_id || '', details:details || {} });
  };
  function admin(actor) { if (!actor || actor.authenticated !== true) throw codedError('LICENSE_ADMIN_UNAUTHORIZED'); return actor; }
  function orderAccessToken(idempotencyKey) { return `ord_${crypto.createHmac('sha256', orderAccessSecret).update(String(idempotencyKey), 'utf8').digest('base64url')}`; }
  function parseAndVerify(token, licenseId) {
    const parsed = licenseCore.parse(token);
    if (parsed.product_id !== productId) throw codedError('LICENSE_PRODUCT_MISMATCH');
    if (licenseId && parsed.license_id !== String(licenseId)) throw codedError('LICENSE_AUTH_INVALID');
    return Promise.resolve(licenseCore.verifySignature(parsed, publicKeys)).then(() => parsed);
  }
  function redemptionCampaignByHash(codeHash) {
    return configuredRedemptions.find(item => item.code_hash === codeHash) || null;
  }
  function isManagedRelayCampaign(campaign) {
    const metadata = campaign && campaign.metadata && typeof campaign.metadata === 'object' ? campaign.metadata : {};
    return metadata.managed_relay === true || text(metadata.kind) === 'managed_relay';
  }
  function publicRelayGrant(value) {
    if (!value) return null;
    return { grant_id:text(value.grant_id), campaign_id:text(value.campaign_id), license_id:text(value.license_id), workspace_id:text(value.workspace_id), status:text(value.status || 'active'), issued_at:value.issued_at || '', revoked_at:value.revoked_at || null };
  }
  async function findAndAuthenticate(input) {
    const value = input || {}; const token = text(value.token); if (!token) throw codedError('LICENSE_AUTH_REQUIRED');
    const parsed = await parseAndVerify(token, value.license_id);
    const record = await store.getLicense(parsed.license_id);
    if (!record) throw codedError('LICENSE_NOT_FOUND');
    if (hash(token) !== text(record.token_hash)) throw codedError('LICENSE_AUTH_INVALID');
    if (record.product_id !== parsed.product_id || record.plan !== parsed.plan) throw codedError('LICENSE_AUTH_INVALID');
    if (record.status !== 'active') throw codedError('LICENSE_REVOKED');
    const deviceId = required(value.device_id, 'LICENSE_DEVICE_REQUIRED'); const workspaceId = required(value.workspace_id, 'LICENSE_WORKSPACE_REQUIRED');
    const devices = await store.listDevices(record.license_id); const device = devices.find(row => row.device_id === deviceId);
    if (!device || device.status !== 'active') throw codedError('LICENSE_DEVICE_NOT_FOUND');
    if (device.workspace_id !== workspaceId || (record.workspace_id && record.workspace_id !== workspaceId)) throw codedError('LICENSE_WORKSPACE_MISMATCH');
    return { token, parsed, record, device, workspaceId, deviceId };
  }
  async function issueForOrder(order, actor) {
    if (!order) throw codedError('ORDER_NOT_FOUND');
    if (!['paid', 'fulfilled'].includes(order.status)) throw codedError('ORDER_NOT_PAID');
    const existing = order.order_id && typeof store.getLicenseByOrder === 'function' ? await store.getLicenseByOrder(order.order_id) : null;
    if (existing) return existing;
    const product = await store.getProduct(order.plan);
    if (!product || product.product_id !== productId) throw codedError('ORDER_PRODUCT_UNAVAILABLE');
    if (requirePrices && Number(product.price_minor) <= 0) throw codedError('ORDER_PRICE_NOT_CONFIGURED');
    const upgradeFrom = text(order.metadata && order.metadata.upgrade_from_license_id);
    const payload = { license_id:randomSecret('lic'), product_id:productId, plan:product.plan, ai:product.ai_enabled === true, perpetual_updates:product.perpetual_updates === true, major_version:Number(product.major_version || majorVersion), device_limit:3, issued_at:nowIso(now()), status:'active', workspace_id:text(order.metadata && order.metadata.upgrade_workspace_id), metadata:upgradeFrom ? { upgraded_from_license_id:upgradeFrom, upgraded_from_plan:text(order.metadata && order.metadata.upgrade_from_plan) } : {} };
    const token = await signer.issue(payload);
    const created = await store.createLicense({ ...payload, order_id:order.order_id, token, kid:signer.kid });
    if (typeof store.markOrderFulfilled === 'function') await store.markOrderFulfilled(order.order_id);
    if (typeof store.enqueueEmail === 'function') await store.enqueueEmail({ order_id:order.order_id, recipient:order.customer_email, kind:'license_delivery', payload:{ order_id:order.order_id, license_id:created.license_id, token, plan:product.plan, label:product.label } });
    await audit('license_issued', { subject_type:'license', subject_id:created.license_id, order_id:order.order_id, plan:product.plan }, actor);
    return created;
  }
  async function issueStandaloneLicense(input) {
    const value = input || {};
    const plan = required(value.plan, 'LICENSE_PLAN_REQUIRED');
    if (!licenseCore.PLANS[plan]) throw codedError('LICENSE_PLAN_INVALID');
    const product = await store.getProduct(plan);
    if (!product || product.product_id !== productId) throw codedError('ORDER_PRODUCT_UNAVAILABLE');
    const payload = {
      license_id:randomSecret('lic'), product_id:productId, plan,
      ai:product.ai_enabled === true, perpetual_updates:product.perpetual_updates === true,
      major_version:Number(product.major_version || majorVersion), device_limit:3,
      issued_at:nowIso(now()), status:'active', workspace_id:text(value.workspace_id) || '',
      expires_at:text(value.expires_at) || '', metadata:value.metadata || {},
    };
    const token = await signer.issue(payload);
    return { payload, token, license_id:payload.license_id, kid:signer.kid };
  }
  async function createOrderForProduct(product, input, actor, options) {
    const value = input || {}; const config = options || {};
    if (!product || product.product_id !== productId) throw codedError('ORDER_PRODUCT_UNAVAILABLE');
    const amountMinor = Number(config.amount_minor == null ? product.price_minor : config.amount_minor);
    if (!Number.isInteger(amountMinor) || amountMinor < 0) throw codedError('ORDER_PRICE_INVALID');
    if (requirePrices && amountMinor <= 0) throw codedError('ORDER_PRICE_NOT_CONFIGURED');
    const idempotencyKey = required(value.idempotency_key, 'ORDER_IDEMPOTENCY_REQUIRED');
    const customerEmail = email(config.customer_email || value.customer_email);
    const accessToken = orderAccessToken(idempotencyKey);
    const accessTokenExpiresAt = nowIso(new Date(new Date(now()).getTime() + ORDER_ACCESS_TOKEN_TTL_MS));
    const customerMetadata = value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata) ? { ...value.metadata } : {};
    delete customerMetadata.checkout_url; delete customerMetadata.checkout_source; delete customerMetadata.checkout_created_at;
    const metadata = { ...customerMetadata, ...(config.metadata || {}) };
    const requestHash = hash(JSON.stringify({ plan:product.plan, email:customerEmail, operation:text(config.operation || 'purchase'), upgrade_from_license_id:text(metadata.upgrade_from_license_id) }));
    let order = await store.createOrder({ order_id:value.order_id, idempotency_key:idempotencyKey, request_hash:requestHash, product_id:productId, plan:product.plan, customer_email:customerEmail, amount_minor:amountMinor, currency:product.currency || 'CNY', provider:text(value.provider), access_token_hash:hash(accessToken), access_token_expires_at:accessTokenExpiresAt, metadata });
    if (payment && !checkoutUrl(order) && typeof store.updateOrderCheckout === 'function') {
      try {
        const checkout = await payment.createCheckout({ order_id:order.order_id, plan:order.plan, amount_minor:order.amount_minor, currency:order.currency, customer_email:order.customer_email });
        order = await store.updateOrderCheckout({ order_id:order.order_id, provider:checkout.provider, checkout_url:checkout.checkout_url });
      } catch (cause) {
        await audit('order_checkout_unavailable', { subject_type:'order', subject_id:order.order_id, code:text(cause && cause.code) || 'ORDER_CHECKOUT_UNAVAILABLE' }, actor);
      }
    }
    await audit(text(config.audit_action || 'order_created'), { subject_type:'order', subject_id:order.order_id, plan:product.plan, amount_minor:order.amount_minor, upgrade_from_license_id:text(metadata.upgrade_from_license_id) }, actor);
    return { order: { order_id:order.order_id, plan:order.plan, amount_minor:order.amount_minor, currency:order.currency, status:order.status, created_at:order.created_at, access_token_expires_at:order.access_token_expires_at || accessTokenExpiresAt, payment_url:checkoutUrl(order) }, access_token:accessToken };
  }
  return {
    async health() {
      if (typeof store.health === 'function') return store.health();
      return { ok:true, backend:'in-memory-contract' };
    },
    async products() { return (await store.listProducts()).map(productView); },
    async createTrial(input, actor) {
      admin(actor);
      const trial = operations.normalizeTrialInput(input, now);
      if (!licenseCore.PLANS[trial.plan]) throw codedError('LICENSE_PLAN_INVALID');
      if (typeof store.getTrialByIdempotency !== 'function' || typeof store.createTrial !== 'function') throw codedError('COMMERCIAL_OPERATIONS_UNAVAILABLE', '试用授权存储尚未配置');
      const existing = await store.getTrialByIdempotency(trial.idempotency_key);
      if (existing) {
        const existingLicense = await store.getLicense(existing.license_id);
        return { trial:existing, license:publicLicense(existingLicense), token:existingLicense && existingLicense.token };
      }
      const issued = await issueStandaloneLicense({ plan:trial.plan, expires_at:trial.expires_at, metadata:{ ...trial.metadata, trial:true, trial_id:trial.trial_id } });
      const created = await store.createTrial({ trial, license:issued.payload ? { ...issued.payload, token:issued.token, kid:issued.kid } : issued });
      await audit('trial_issued', { subject_type:'trial', subject_id:trial.trial_id, license_id:created.license.license_id, plan:trial.plan, expires_at:trial.expires_at }, actor);
      return { trial:created.trial, license:publicLicense(created.license), token:created.license.token };
    },
    async createLicenseBatch(input, actor) {
      admin(actor);
      const batch = operations.normalizeBatchInput(input);
      if (!licenseCore.PLANS[batch.plan]) throw codedError('LICENSE_PLAN_INVALID');
      if (typeof store.getBatchByIdempotency !== 'function' || typeof store.createLicenseBatch !== 'function') throw codedError('COMMERCIAL_OPERATIONS_UNAVAILABLE', '批量授权存储尚未配置');
      const existing = await store.getBatchByIdempotency(batch.idempotency_key);
      if (existing) return { batch:existing.batch, licenses:(existing.licenses || []).map(item => ({ ...publicLicense(item), token:item.token })) };
      const licenses = [];
      for (let index = 0; index < batch.count; index += 1) {
        const issued = await issueStandaloneLicense({ plan:batch.plan, workspace_id:batch.workspace_ids[index] || '', metadata:{ ...batch.metadata, batch_id:batch.batch_id, ordinal:index + 1, organization_id:batch.organization_id || '' } });
        licenses.push({ ...issued.payload, token:issued.token, kid:issued.kid });
      }
      const created = await store.createLicenseBatch({ batch:{ ...batch, quantity:batch.count }, licenses });
      await audit('license_batch_issued', { subject_type:'license_batch', subject_id:batch.batch_id, plan:batch.plan, quantity:batch.count, organization_id:batch.organization_id || '' }, actor);
      return { batch:created.batch, licenses:(created.licenses || []).map(item => ({ ...publicLicense(item), token:item.token })) };
    },
    async createOrganization(input, actor) {
      admin(actor);
      const organization = operations.normalizeOrganizationInput(input);
      if (!licenseCore.PLANS[organization.plan]) throw codedError('LICENSE_PLAN_INVALID');
      if (typeof store.createOrganization !== 'function' || typeof store.upsertOrganizationWorkspace !== 'function') throw codedError('COMMERCIAL_OPERATIONS_UNAVAILABLE', '学校授权存储尚未配置');
      const createdOrganization = await store.createOrganization(organization);
      let batch = null;
      let licenses = [];
      if (organization.workspace_ids.length) {
        const result = await this.createLicenseBatch({ batch_id:`${organization.organization_id}_batch`, idempotency_key:`${organization.organization_id}_initial`, customer_email:organization.customer_email, plan:organization.plan, count:organization.workspace_ids.length, workspace_ids:organization.workspace_ids, organization_id:organization.organization_id, metadata:organization.metadata }, actor);
        batch = result.batch; licenses = result.licenses;
        for (let index = 0; index < organization.workspace_ids.length; index += 1) await store.upsertOrganizationWorkspace({ organization_id:organization.organization_id, workspace_id:organization.workspace_ids[index], license_id:licenses[index] && licenses[index].license_id, status:'active' });
      }
      await audit('organization_license_pool_created', { subject_type:'organization', subject_id:organization.organization_id, plan:organization.plan, workspace_count:organization.workspace_ids.length }, actor);
      return { organization:createdOrganization, batch, licenses, workspaces:typeof store.listOrganizationWorkspaces === 'function' ? await store.listOrganizationWorkspaces(organization.organization_id) : [] };
    },
    async organizationWorkspaces(organizationId, actor) {
      admin(actor);
      if (typeof store.listOrganizationWorkspaces !== 'function') throw codedError('COMMERCIAL_OPERATIONS_UNAVAILABLE');
      return { organization_id:required(organizationId, 'ORGANIZATION_ID_INVALID'), workspaces:await store.listOrganizationWorkspaces(organizationId) };
    },
    async recordTelemetry(input) {
      if (!telemetrySalt || typeof store.recordTelemetry !== 'function') throw codedError('TELEMETRY_NOT_CONFIGURED', '匿名指标未配置服务端盐值或存储');
      const event = operations.normalizeTelemetryInput(input, { salt:telemetrySalt, maxAgeMs:7 * 24 * 60 * 60 * 1000 });
      return store.recordTelemetry(event);
    },
    async createOrder(input, actor) {
      const value = input || {}; const product = await store.getProduct(required(value.plan, 'LICENSE_PLAN_REQUIRED'));
      return createOrderForProduct(product, value, actor);
    },
    async createUpgradeOrder(input, actor) {
      const value = input || {}; const auth = await findAndAuthenticate(value);
      const sourceProduct = await store.getProduct(auth.record.plan);
      const targetProduct = await store.getProduct(required(value.target_plan || value.plan, 'LICENSE_PLAN_REQUIRED'));
      if (!sourceProduct || sourceProduct.product_id !== productId || !targetProduct || targetProduct.product_id !== productId) throw codedError('ORDER_PRODUCT_UNAVAILABLE');
      if (sourceProduct.currency !== targetProduct.currency) throw codedError('LICENSE_UPGRADE_CURRENCY_MISMATCH');
      const amountMinor = Number(targetProduct.price_minor) - Number(sourceProduct.price_minor);
      if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw codedError('LICENSE_UPGRADE_NOT_AVAILABLE', '所选档位不是当前许可证的可升级目标');
      const sourceOrder = auth.record.order_id && typeof store.getOrder === 'function' ? await store.getOrder(auth.record.order_id) : null;
      const customerEmail = text(sourceOrder && sourceOrder.customer_email) || value.customer_email;
      const result = await createOrderForProduct(targetProduct, value, actor, {
        amount_minor:amountMinor,
        customer_email:customerEmail,
        operation:'upgrade',
        audit_action:'license_upgrade_order_created',
        metadata:{ upgrade_from_license_id:auth.record.license_id, upgrade_from_plan:sourceProduct.plan, upgrade_workspace_id:auth.workspaceId },
      });
      return { ...result, upgrade:{ from_plan:sourceProduct.plan, target_plan:targetProduct.plan, credit_minor:Number(sourceProduct.price_minor), amount_minor:amountMinor } };
    },
    async redeem(input) {
      const value = input || {};
      const code = credential(value.code, 'REDEMPTION_CODE_REQUIRED');
      const codeHash = redemptionCode.hash(code);
      let campaign = typeof store.getRedemptionCampaignByCodeHash === 'function' ? await store.getRedemptionCampaignByCodeHash(codeHash) : null;
      if (!campaign) campaign = redemptionCampaignByHash(codeHash);
      if (!campaign || campaign.status !== 'active') throw codedError('REDEMPTION_CODE_INVALID', '兑换码无效或已暂停');
      if (isManagedRelayCampaign(campaign)) throw codedError('REDEMPTION_CODE_USE_MANAGED_FLOW', '友情 AI 码需要在已激活 AI 许可证后单独配置');
      if (text(campaign.product_id) && text(campaign.product_id) !== productId) throw codedError('REDEMPTION_PLAN_INVALID', '兑换活动不属于当前产品');
      const workspaceId = required(value.workspace_id, 'LICENSE_WORKSPACE_REQUIRED');
      const deviceId = required(value.device_id, 'LICENSE_DEVICE_REQUIRED');
      const existing = typeof store.getRedemptionByWorkspace === 'function' ? await store.getRedemptionByWorkspace(campaign.campaign_id, workspaceId) : null;
      let license;
      let redemption;
      if (existing) {
        license = await store.getLicense(existing.license_id);
        redemption = existing;
        if (!license || license.status !== 'active') throw codedError('LICENSE_REVOKED', '此兑换对应的许可证已撤销');
      } else {
        const product = await store.getProduct(campaign.plan);
        if (!product || product.product_id !== productId) throw codedError('REDEMPTION_PLAN_INVALID', '兑换活动档位不可用');
        const issued = await issueStandaloneLicense({ plan:campaign.plan, workspace_id:workspaceId, metadata:{ redemption_campaign_id:campaign.campaign_id, ...(campaign.metadata || {}) } });
        if (typeof store.createRedeemedLicense !== 'function') throw codedError('REDEMPTION_STORAGE_UNAVAILABLE', '兑换存储尚未配置');
        const created = await store.createRedeemedLicense({ license:{ ...issued.payload, token:issued.token, kid:issued.kid }, redemption:{ campaign_id:campaign.campaign_id, workspace_id:workspaceId, metadata:{ source:'campaign_code' } } });
        license = created.license; redemption = created.redemption;
      }
      const activated = await store.activateDevice({ license_id:license.license_id, workspace_id:workspaceId, device_id:deviceId });
      await audit(existing ? 'redemption_reused' : 'redemption_completed', { subject_type:'redemption', subject_id:redemption.redemption_id, campaign_id:campaign.campaign_id, license_id:license.license_id, workspace_id:workspaceId, device_id:deviceId, plan:campaign.plan }, { actor_type:'device', actor_id:deviceId, authenticated:true });
      return { ok:true, redemption_id:redemption.redemption_id, license_id:license.license_id, token:license.token, payload:publicLicense(activated.license), devices:await store.listDevices(license.license_id) };
    },
    async redeemManagedRelay(input) {
      const value = input || {};
      const auth = await findAndAuthenticate(value);
      if (auth.parsed.ai !== true) throw codedError('LICENSE_AI_NOT_ENTITLED', '请先激活 AI 增强版许可证');
      const code = credential(value.code, 'MANAGED_RELAY_CODE_REQUIRED');
      const codeHash = redemptionCode.hash(code);
      let campaign = typeof store.getRedemptionCampaignByCodeHash === 'function' ? await store.getRedemptionCampaignByCodeHash(codeHash) : null;
      if (!campaign) campaign = redemptionCampaignByHash(codeHash);
      if (!campaign || campaign.status !== 'active' || !isManagedRelayCampaign(campaign)) throw codedError('MANAGED_RELAY_CODE_INVALID', '友情 AI 码无效、已暂停或不属于友情服务');
      if (text(campaign.product_id) && text(campaign.product_id) !== productId) throw codedError('REDEMPTION_PLAN_INVALID', '友情 AI 活动不属于当前产品');
      if (typeof store.getManagedRelayGrant !== 'function' || typeof store.createManagedRelayGrant !== 'function') throw codedError('MANAGED_RELAY_STORAGE_UNAVAILABLE', '友情 AI 服务尚未配置');
      const existing = await store.getManagedRelayGrant(campaign.campaign_id, auth.record.license_id);
      const grant = existing || await store.createManagedRelayGrant({ grant:{ grant_id:randomSecret('grant'), campaign_id:campaign.campaign_id, license_id:auth.record.license_id, workspace_id:auth.workspaceId, status:'active', metadata:{ source:'friendship_code' } } });
      if (!grant || grant.status !== 'active') throw codedError('MANAGED_RELAY_REVOKED', '友情 AI 服务资格已撤销');
      await audit(existing ? 'managed_relay_reused' : 'managed_relay_redeemed', { subject_type:'managed_relay_grant', subject_id:grant.grant_id, campaign_id:campaign.campaign_id, license_id:auth.record.license_id, workspace_id:auth.workspaceId, device_id:auth.deviceId }, { actor_type:'device', actor_id:auth.deviceId, authenticated:true });
      return { ok:true, grant:publicRelayGrant(grant), license_id:auth.record.license_id };
    },
     async getOrder(orderId, accessToken) { const order = accessToken ? await store.getOrderByAccessToken(accessToken) : await store.getOrder(orderId); if (!order || (orderId && order.order_id !== String(orderId))) throw codedError('ORDER_NOT_FOUND'); const accessTokenExpiresAt = assertOrderAccessActive(order, now()); return { order_id:order.order_id, product_id:order.product_id, plan:order.plan, amount_minor:order.amount_minor, currency:order.currency, status:order.status, created_at:order.created_at, access_token_expires_at:accessTokenExpiresAt, payment_url:checkoutUrl(order), paid_at:order.paid_at, fulfilled_at:order.fulfilled_at, license:typeof store.getLicenseByOrder === 'function' ? publicLicense(await store.getLicenseByOrder(order.order_id)) : null }; },
     async customerDelivery(orderId, accessToken) {
       const bearer = credential(accessToken, 'ORDER_ACCESS_REQUIRED');
       if (typeof store.getOrderByAccessToken !== 'function') throw codedError('ORDER_DELIVERY_UNAVAILABLE', '订单交付存储未配置');
       const order = await store.getOrderByAccessToken(bearer);
       if (!order || order.order_id !== String(orderId)) throw codedError('ORDER_NOT_FOUND');
       assertOrderAccessActive(order, now());
       if (order.status !== 'fulfilled' || typeof store.getLicenseByOrder !== 'function') throw codedError('ORDER_NOT_FULFILLED', '订单尚未完成授权交付');
       const license = await store.getLicenseByOrder(order.order_id);
       if (!license || !license.token) throw codedError('LICENSE_DELIVERY_UNAVAILABLE', '许可证交付内容暂不可用');
       if (license.status !== 'active') throw codedError('LICENSE_REVOKED', '许可证已撤销，不能重新下载');
       const content = `${JSON.stringify({
         format:'cwb-license-file',
         version:1,
         product_id:license.product_id,
         license_id:license.license_id,
         plan:license.plan,
         issued_at:license.issued_at,
         token:license.token,
       }, null, 2)}\n`;
       await audit('license_delivery_downloaded', { subject_type:'order', subject_id:order.order_id, license_id:license.license_id }, { actor_type:'customer', actor_id:order.order_id, authenticated:true });
       return { filename:`counselor-desk-${license.license_id}.cwb-license`, content_type:'application/json; charset=utf-8', content };
     },
    async confirmPayment(input, actor) {
      admin(actor); const value = input || {}; const order = await store.markOrderPaid({ order_id:required(value.order_id, 'ORDER_ID_INVALID'), provider:value.provider, provider_order_id:value.provider_order_id });
      await audit('order_payment_confirmed', { subject_type:'order', subject_id:order.order_id, provider:order.provider || '' }, actor);
      const license = await issueForOrder(order, actor);
      return { order:{ order_id:order.order_id, status:'fulfilled' }, license:publicLicense(license) };
    },
    async handleWebhook(input, actor) {
      const value = input || {}; const provider = required(value.provider, 'WEBHOOK_PROVIDER_REQUIRED'); const eventId = required(value.event_id, 'WEBHOOK_EVENT_REQUIRED');
      const payloadHash = hash(JSON.stringify(value.payload || {})); const recorded = await store.recordWebhook({ provider, event_id:eventId, event_type:value.event_type, payload_hash:payloadHash });
      if (!recorded.inserted) {
        if (recorded.event && recorded.event.payload_hash && recorded.event.payload_hash !== payloadHash) throw codedError('WEBHOOK_REPLAY_PAYLOAD_MISMATCH', '同一事件 ID 的载荷不一致');
        if (!recorded.event || recorded.event.status !== 'failed') return { ok:true, duplicate:true };
      }
      try {
        const event = value.payload || {}; const paid = event.type === 'payment_succeeded' || event.status === 'paid'; const refunded = event.type === 'refund_succeeded' || event.status === 'refunded';
        if (!paid && !refunded) { await store.completeWebhook({ provider, event_id:eventId, status:'ignored' }); return { ok:true, ignored:true }; }
        const order = refunded ? await store.markOrderRefunded(required(event.order_id, 'ORDER_ID_INVALID')) : await store.markOrderPaid({ order_id:required(event.order_id, 'ORDER_ID_INVALID'), provider, provider_order_id:event.provider_order_id });
        let license = null;
        if (paid) license = await issueForOrder(order, actor);
        if (refunded && typeof store.getLicenseByOrder === 'function') { const current = await store.getLicenseByOrder(order.order_id); if (current) await store.revokeLicense({ license_id:current.license_id, reason:'payment_refunded', revoked_after:now() }); }
        await store.completeWebhook({ provider, event_id:eventId, status:'processed' });
        await audit(refunded ? 'license_refunded' : 'order_webhook_processed', { subject_type:'order', subject_id:order.order_id, event_id:eventId }, actor);
        return { ok:true, duplicate:false, order:{ order_id:order.order_id, status:order.status }, license:publicLicense(license) };
      } catch (cause) { await store.completeWebhook({ provider, event_id:eventId, status:'failed', error_code:cause.code || 'WEBHOOK_PROCESS_FAILED' }); throw cause; }
    },
    async activate(input) { const value = input || {}; const token = credential(value.token, 'LICENSE_TOKEN_REQUIRED'); const parsed = await parseAndVerify(token); const record = await store.getLicense(parsed.license_id); if (!record || hash(token) !== record.token_hash) throw codedError('LICENSE_NOT_FOUND'); const result = await store.activateDevice({ license_id:parsed.license_id, workspace_id:required(value.workspace_id, 'LICENSE_WORKSPACE_REQUIRED'), device_id:required(value.device_id, 'LICENSE_DEVICE_REQUIRED') }); await audit('license_activated', { subject_type:'license', subject_id:record.license_id, device_id:value.device_id }, { actor_type:'device', actor_id:value.device_id, authenticated:true }); return { ok:true, license_id:record.license_id, token, devices:await store.listDevices(record.license_id), payload:publicLicense(result.license) }; },
    async refresh(input) { const auth = await findAndAuthenticate(input); const device = await store.touchDevice({ license_id:auth.record.license_id, device_id:auth.deviceId, workspace_id:auth.workspaceId }); const managedRelay = typeof store.getActiveManagedRelayGrant === 'function' ? await store.getActiveManagedRelayGrant(auth.record.license_id, auth.workspaceId) : null; return { ok:true, token:auth.token, license:publicLicense(auth.record), device, managed_relay:publicRelayGrant(managedRelay) }; },
    async deactivate(input) { const auth = await findAndAuthenticate(input); await store.deactivateDevice({ license_id:auth.record.license_id, device_id:auth.deviceId }); await audit('device_deactivated', { subject_type:'license', subject_id:auth.record.license_id, device_id:auth.deviceId }, { actor_type:'device', actor_id:auth.deviceId, authenticated:true }); return { ok:true }; },
    async deactivateDevice(input) {
      const auth = await findAndAuthenticate(input);
      const targetDeviceId = required(input && input.target_device_id, 'LICENSE_DEVICE_REQUIRED');
      const target = await store.deactivateDevice({ license_id:auth.record.license_id, device_id:targetDeviceId });
      await audit('device_deactivated_by_device', { subject_type:'license', subject_id:auth.record.license_id, actor_device_id:auth.deviceId, device_id:targetDeviceId }, { actor_type:'device', actor_id:auth.deviceId, authenticated:true });
      return { ok:true, device:target, devices:await store.listDevices(auth.record.license_id) };
    },
    async issueRelayToken(input) {
      const auth = await findAndAuthenticate(input);
      if (auth.parsed.ai !== true) throw codedError('LICENSE_AI_NOT_ENTITLED', '当前许可证不包含 AI 增强功能');
      const managedRelay = input && (input.managed_relay === true || text(input.managed_relay).toLowerCase() === 'true');
      let grant = null;
      if (managedRelay) {
        if (typeof store.getActiveManagedRelayGrant !== 'function') throw codedError('MANAGED_RELAY_STORAGE_UNAVAILABLE', '友情 AI 服务尚未配置');
        grant = await store.getActiveManagedRelayGrant(auth.record.license_id, auth.workspaceId);
        if (!grant) throw codedError('AI_MANAGED_RELAY_GRANT_REQUIRED', '当前工作区尚未激活友情 AI 服务');
      }
      const issuedAt = new Date(now()).getTime();
      const expiresAt = new Date(issuedAt + relayCore.MAX_LIFETIME_MS).toISOString();
      const assertion = await signer.issue({ license_id:auth.record.license_id, product_id:productId, ai:true, managed_relay:managedRelay, grant_id:grant && grant.grant_id || '', issued_at:new Date(issuedAt).toISOString(), expires_at:expiresAt, device_id:auth.deviceId }, { prefix:relayCore.TOKEN_PREFIX });
      await audit('ai_relay_token_issued', { subject_type:'license', subject_id:auth.record.license_id, device_id:auth.deviceId, expires_at:expiresAt, managed_relay:managedRelay, grant_id:grant && grant.grant_id || '' }, { actor_type:'device', actor_id:auth.deviceId, authenticated:true });
      return { ok:true, assertion, expires_at:expiresAt, managed_relay:managedRelay, grant:publicRelayGrant(grant) };
    },
    async devices(input) { const auth = await findAndAuthenticate(input); return { devices:await store.listDevices(auth.record.license_id) }; },
    async revoke(input, actor) { admin(actor); const value = input || {}; const license = await store.revokeLicense({ license_id:required(value.license_id, 'LICENSE_ID_INVALID'), reason:text(value.reason), revoked_after:now() }); await audit('license_revoked', { subject_type:'license', subject_id:license.license_id, reason:text(value.reason) }, actor); return { ok:true, license:publicLicense(license) }; },
    async adminDevices(licenseId, actor) { admin(actor); const license = await store.getLicense(required(licenseId, 'LICENSE_ID_INVALID')); if (!license) throw codedError('LICENSE_NOT_FOUND'); return store.listDevices(license.license_id); },
    async adminOrder(orderId, actor) { admin(actor); const order = await store.getOrder(required(orderId, 'ORDER_ID_INVALID')); if (!order) throw codedError('ORDER_NOT_FOUND'); return { order:{ order_id:order.order_id, product_id:order.product_id, plan:order.plan, customer_email:order.customer_email, amount_minor:order.amount_minor, currency:order.currency, status:order.status, provider:order.provider, provider_order_id:order.provider_order_id, created_at:order.created_at, paid_at:order.paid_at, fulfilled_at:order.fulfilled_at, refunded_at:order.refunded_at }, license:typeof store.getLicenseByOrder === 'function' ? publicLicense(await store.getLicenseByOrder(order.order_id)) : null }; },
    async retryEmail(messageId, actor) {
      admin(actor);
      if (typeof store.claimEmail !== 'function' || typeof store.markEmailFailed !== 'function' || !opts.mailer || typeof opts.mailer.send !== 'function') throw codedError('EMAIL_NOT_CONFIGURED', '邮件服务尚未配置');
      const message = await store.claimEmail(required(messageId, 'EMAIL_ID_INVALID'));
      if (!message) throw codedError('EMAIL_NOT_FOUND_OR_NOT_DUE');
      try { const result = await opts.mailer.send(message); await store.markEmailSent(message.message_id); await audit('email_sent', { subject_type:'email', subject_id:message.message_id, provider_message_id:result && result.id || '' }, actor); return { ok:true, message_id:message.message_id }; }
      catch (cause) { await store.markEmailFailed(message.message_id, cause.message || cause.code || 'EMAIL_SEND_FAILED'); throw codedError('EMAIL_SEND_FAILED', '邮件发送失败，已保留重试状态', cause); }
    },
    async processDueEmails(limit) {
      if (!opts.mailer || typeof opts.mailer.send !== 'function' || typeof store.listDueEmails !== 'function') return { processed:0, skipped:true };
      const due = await store.listDueEmails(limit); let processed = 0;
      for (const item of due) { try { await this.retryEmail(item.message_id, { authenticated:true, actor_type:'email_worker', actor_id:'worker' }); processed += 1; } catch (_) {} }
      return { processed, skipped:false };
    },
    async updates(channel) { const manifest = await store.latestPublishedManifest(channel || 'stable'); if (!manifest) throw codedError('UPDATE_NOT_FOUND'); return manifest; },
    async publishUpdate(input, actor) {
      admin(actor);
      const manifest = updateCore.normalizeManifest(input && input.manifest ? input.manifest : input);
      await updateCore.verifyManifestSignature(manifest, updatePublicKeys);
      if (typeof store.saveManifest !== 'function') throw codedError('UPDATE_STORE_UNAVAILABLE');
      const saved = await store.saveManifest({ manifest_id:text(input && input.manifest_id) || randomSecret('manifest'), version:manifest.version, channel:manifest.channel, manifest, status:'published' });
      await audit('update_manifest_published', { subject_type:'update_manifest', subject_id:saved.manifest_id, version:manifest.version, channel:manifest.channel }, actor);
      return saved;
    },
    async audit(actor) { admin(actor); if (typeof store.listAudit !== 'function') return []; return store.listAudit(); },
    async issueManual(input, actor) { admin(actor); const value = input || {}; const orderResult = await this.createOrder({ plan:value.plan, customer_email:value.customer_email, idempotency_key:value.idempotency_key || randomSecret('manual') }, actor); const paid = await this.confirmPayment({ order_id:orderResult.order.order_id, provider:'manual', provider_order_id:text(value.provider_order_id) || randomSecret('payment') }, actor); return { ...orderResult, ...paid }; },
    publicKeys,
  };
}

module.exports = { ORDER_ACCESS_TOKEN_TTL_MS, createCommercialService, codedError, hash };
