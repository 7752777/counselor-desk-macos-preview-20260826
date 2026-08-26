/* PostgreSQL persistence adapter for the commercial service.
 *
 * All values are bound query parameters. The adapter never accepts or stores
 * student records, business attachments, model keys, prompts, or AI output.
 */
const crypto = require('node:crypto');

function text(value) { return String(value == null ? '' : value).trim(); }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function codedError(code, message, cause) {
  const error = new Error(`${code}: ${message || code}`);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}
function required(value, code) {
  const result = text(value);
  if (!result || result.length > 240 || /[\x00-\x1f]/.test(result)) throw codedError(code, '字段无效');
  return result;
}
function credential(value, code) {
  const result = text(value);
  if (!result || result.length > 16 * 1024 || /[\x00-\x1f]/.test(result)) throw codedError(code, '凭据无效');
  return result;
}
function hash(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function randomId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }

function createPostgresStore(options) {
  const opts = options || {};
  const pool = opts.pool;
  if (!pool || typeof pool.query !== 'function') throw codedError('LICENSE_DB_REQUIRED', '必须注入 PostgreSQL pool');
  const now = typeof opts.now === 'function' ? opts.now : () => new Date();
  const productId = text(opts.productId || 'counselor-desk');

  async function query(sql, values) {
    try { return await pool.query(sql, values || []); }
    catch (cause) { throw codedError('LICENSE_DB_FAILED', '授权数据库操作失败', cause); }
  }
  async function withTransaction(work) {
    const client = typeof pool.connect === 'function' ? await pool.connect() : null;
    if (!client) return work({ query });
    try {
      await client.query('BEGIN');
      const result = await work({ query:(sql, values) => client.query(sql, values || []) });
      await client.query('COMMIT');
      return result;
    } catch (cause) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      if (cause && cause.code && /^(?:LICENSE|ORDER|WEBHOOK|EMAIL|UPDATE)_/.test(cause.code)) throw cause;
      throw codedError('LICENSE_DB_FAILED', '授权数据库事务失败', cause);
    } finally { client.release(); }
  }
  function mapProduct(row) { return row ? { ...row, price_minor:Number(row.price_minor), major_version:Number(row.major_version), ai_enabled:Boolean(row.ai_enabled), perpetual_updates:Boolean(row.perpetual_updates), metadata:clone(row.metadata || {}) } : null; }
  function mapOrder(row) { return row ? { ...row, amount_minor:Number(row.amount_minor), metadata:clone(row.metadata || {}) } : null; }
  function mapLicense(row) { return row ? { ...row, major_version:Number(row.major_version), device_limit:Number(row.device_limit), revoked_after:Number(row.revoked_after || 0), metadata:clone(row.metadata || {}) } : null; }
  function mapDevice(row) { return row ? { ...row, metadata:clone(row.metadata || {}) } : null; }
  function mapRelayGrant(row) { return row ? { ...row, metadata:clone(row.metadata || {}) } : null; }

  return {
    productId,
    hash,
    async health() {
      const result = await query('SELECT 1 AS ok');
      return { ok:Boolean(result.rows && result.rows[0] && Number(result.rows[0].ok) === 1), backend:'postgres' };
    },
    async listProducts() {
      const result = await query('SELECT plan, product_id, label, ai_enabled, perpetual_updates, major_version, price_minor, currency, metadata FROM cwb_products WHERE product_id = $1 AND active = true ORDER BY plan', [productId]);
      return result.rows.map(mapProduct);
    },
    async getProduct(plan) {
      const result = await query('SELECT plan, product_id, label, ai_enabled, perpetual_updates, major_version, price_minor, currency, metadata FROM cwb_products WHERE product_id = $1 AND plan = $2 AND active = true LIMIT 1', [productId, required(plan, 'LICENSE_PLAN_REQUIRED')]);
      return mapProduct(result.rows[0]);
    },
    async upsertRedemptionCampaign(input) {
      const value = input || {};
      const result = await query(`INSERT INTO cwb_license_redemption_campaigns (campaign_id,product_id,plan,code_hash,status,metadata)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (campaign_id) DO UPDATE SET product_id=EXCLUDED.product_id,plan=EXCLUDED.plan,code_hash=EXCLUDED.code_hash,status=EXCLUDED.status,metadata=EXCLUDED.metadata,updated_at=now()
        RETURNING *`, [required(value.campaign_id, 'REDEMPTION_CAMPAIGN_INVALID'), required(value.product_id || productId, 'LICENSE_PRODUCT_INVALID'), required(value.plan, 'REDEMPTION_PLAN_INVALID'), required(value.code_hash, 'REDEMPTION_HASH_INVALID'), required(value.status || 'active', 'REDEMPTION_STATUS_INVALID'), value.metadata || {}]);
      return { ...result.rows[0], metadata:clone(result.rows[0].metadata || {}) };
    },
    async getRedemptionCampaignByCodeHash(codeHash) {
      const result = await query('SELECT * FROM cwb_license_redemption_campaigns WHERE code_hash=$1 LIMIT 1', [required(codeHash, 'REDEMPTION_HASH_INVALID')]);
      return result.rows[0] ? { ...result.rows[0], metadata:clone(result.rows[0].metadata || {}) } : null;
    },
    async getRedemptionByWorkspace(campaignId, workspaceId) {
      const result = await query('SELECT * FROM cwb_license_redemptions WHERE campaign_id=$1 AND workspace_id=$2 LIMIT 1', [required(campaignId, 'REDEMPTION_CAMPAIGN_INVALID'), required(workspaceId, 'LICENSE_WORKSPACE_REQUIRED')]);
      return result.rows[0] ? { ...result.rows[0], metadata:clone(result.rows[0].metadata || {}) } : null;
    },
    async getManagedRelayGrant(campaignId, licenseId) {
      const result = await query('SELECT * FROM cwb_license_relay_grants WHERE campaign_id=$1 AND license_id=$2 LIMIT 1', [required(campaignId, 'REDEMPTION_CAMPAIGN_INVALID'), required(licenseId, 'LICENSE_ID_INVALID')]);
      return mapRelayGrant(result.rows[0]);
    },
    async getActiveManagedRelayGrant(licenseId, workspaceId) {
      const result = await query("SELECT * FROM cwb_license_relay_grants WHERE license_id=$1 AND workspace_id=$2 AND status='active' ORDER BY issued_at DESC LIMIT 1", [required(licenseId, 'LICENSE_ID_INVALID'), required(workspaceId, 'LICENSE_WORKSPACE_REQUIRED')]);
      return mapRelayGrant(result.rows[0]);
    },
    async createManagedRelayGrant(input) {
      const value = input || {}; const grant = value.grant || {};
      return withTransaction(async tx => {
        const existing = await tx.query('SELECT * FROM cwb_license_relay_grants WHERE campaign_id=$1 AND license_id=$2 FOR UPDATE', [required(grant.campaign_id, 'REDEMPTION_CAMPAIGN_INVALID'), required(grant.license_id, 'LICENSE_ID_INVALID')]);
        if (existing.rows[0]) return mapRelayGrant(existing.rows[0]);
        const result = await tx.query(`INSERT INTO cwb_license_relay_grants (grant_id,campaign_id,license_id,workspace_id,status,metadata)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [required(grant.grant_id || randomId('grant'), 'MANAGED_RELAY_GRANT_INVALID'), required(grant.campaign_id, 'REDEMPTION_CAMPAIGN_INVALID'), required(grant.license_id, 'LICENSE_ID_INVALID'), required(grant.workspace_id, 'LICENSE_WORKSPACE_REQUIRED'), text(grant.status || 'active'), grant.metadata || {}]);
        return mapRelayGrant(result.rows[0]);
      });
    },
    async createRedeemedLicense(input) {
      const value = input || {}; const license = value.license || {}; const redemption = value.redemption || {};
      return withTransaction(async tx => {
        const campaign = await tx.query('SELECT campaign_id FROM cwb_license_redemption_campaigns WHERE campaign_id=$1 FOR UPDATE', [required(redemption.campaign_id, 'REDEMPTION_CAMPAIGN_INVALID')]);
        if (!campaign.rows[0]) throw codedError('REDEMPTION_CODE_INVALID', '兑换活动不存在');
        const existing = await tx.query('SELECT * FROM cwb_license_redemptions WHERE campaign_id=$1 AND workspace_id=$2 FOR UPDATE', [required(redemption.campaign_id, 'REDEMPTION_CAMPAIGN_INVALID'), required(redemption.workspace_id, 'LICENSE_WORKSPACE_REQUIRED')]);
        if (existing.rows[0]) {
          const stored = await tx.query('SELECT * FROM cwb_licenses WHERE license_id=$1 LIMIT 1', [required(existing.rows[0].license_id, 'LICENSE_ID_INVALID')]);
          return { redemption:{ ...existing.rows[0], metadata:clone(existing.rows[0].metadata || {}) }, license:mapLicense(stored.rows[0]) };
        }
        const createdLicense = await tx.query(`INSERT INTO cwb_licenses (license_id,order_id,product_id,plan,workspace_id,token,token_hash,kid,major_version,device_limit,status,revoked_after,issued_at,metadata)
          VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,'active',0,$10,$11) RETURNING *`, [required(license.license_id, 'LICENSE_ID_INVALID'), required(license.product_id || productId, 'LICENSE_PRODUCT_INVALID'), required(license.plan, 'LICENSE_PLAN_REQUIRED'), text(license.workspace_id) || null, credential(license.token, 'LICENSE_TOKEN_REQUIRED'), hash(license.token), required(license.kid, 'LICENSE_KID_REQUIRED'), Number(license.major_version), Math.max(1, Math.min(3, Number(license.device_limit || 3))), license.issued_at || now(), license.metadata || {}]);
        const createdRedemption = await tx.query(`INSERT INTO cwb_license_redemptions (redemption_id,campaign_id,workspace_id,license_id,metadata)
          VALUES ($1,$2,$3,$4,$5) RETURNING *`, [required(redemption.redemption_id || randomId('redemption'), 'REDEMPTION_ID_INVALID'), required(redemption.campaign_id, 'REDEMPTION_CAMPAIGN_INVALID'), required(redemption.workspace_id, 'LICENSE_WORKSPACE_REQUIRED'), required(license.license_id, 'LICENSE_ID_INVALID'), redemption.metadata || {}]);
        return { redemption:{ ...createdRedemption.rows[0], metadata:clone(createdRedemption.rows[0].metadata || {}) }, license:mapLicense(createdLicense.rows[0]) };
      });
    },
    async createOrder(input) {
      const value = input || {};
      const orderId = required(value.order_id || randomId('ord'), 'ORDER_ID_INVALID');
      const idempotencyKey = required(value.idempotency_key, 'ORDER_IDEMPOTENCY_REQUIRED');
      const requestHash = required(value.request_hash || hash(JSON.stringify({ product_id:value.product_id, plan:value.plan, customer_email:value.customer_email })), 'ORDER_REQUEST_HASH_INVALID');
      return withTransaction(async tx => {
        const existing = await tx.query('SELECT * FROM cwb_orders WHERE idempotency_key = $1 LIMIT 1', [idempotencyKey]);
        if (existing.rows[0]) {
          if (text(existing.rows[0].request_hash) && existing.rows[0].request_hash !== requestHash) throw codedError('ORDER_IDEMPOTENCY_CONFLICT', '幂等键已用于其他订单');
          return mapOrder(existing.rows[0]);
        }
        const result = await tx.query(`INSERT INTO cwb_orders (order_id, idempotency_key, request_hash, product_id, plan, customer_email, amount_minor, currency, provider, status, access_token_hash, access_token_expires_at, metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12) RETURNING *`, [orderId, idempotencyKey, requestHash, required(value.product_id || productId, 'ORDER_PRODUCT_INVALID'), required(value.plan, 'LICENSE_PLAN_REQUIRED'), required(value.customer_email, 'ORDER_EMAIL_REQUIRED').toLowerCase(), Number(value.amount_minor), required(value.currency || 'CNY', 'ORDER_CURRENCY_INVALID'), text(value.provider), required(value.access_token_hash, 'ORDER_ACCESS_TOKEN_REQUIRED'), value.access_token_expires_at || null, value.metadata || {}]);
        return mapOrder(result.rows[0]);
      });
    },
    async getOrder(orderId) { const result = await query('SELECT * FROM cwb_orders WHERE order_id = $1 LIMIT 1', [required(orderId, 'ORDER_ID_INVALID')]); return mapOrder(result.rows[0]); },
    async updateOrderCheckout(input) {
      const value = input || {};
      const current = await query('SELECT metadata FROM cwb_orders WHERE order_id=$1 LIMIT 1', [required(value.order_id, 'ORDER_ID_INVALID')]);
      if (!current.rows[0]) throw codedError('ORDER_NOT_FOUND');
      const metadata = { ...(current.rows[0].metadata || {}), checkout_url:required(value.checkout_url, 'ORDER_CHECKOUT_URL_INVALID'), checkout_source:'payment_adapter', checkout_created_at:now() };
      const result = await query('UPDATE cwb_orders SET provider=COALESCE($2,provider), metadata=$3, updated_at=$4 WHERE order_id=$1 RETURNING *', [value.order_id, text(value.provider), metadata, now()]);
      return mapOrder(result.rows[0]);
    },
    async getLicenseByOrder(orderId) { const result = await query('SELECT * FROM cwb_licenses WHERE order_id=$1 LIMIT 1', [required(orderId, 'ORDER_ID_INVALID')]); return mapLicense(result.rows[0]); },
    async getOrderByAccessToken(accessToken) { const result = await query('SELECT * FROM cwb_orders WHERE access_token_hash = $1 LIMIT 1', [hash(required(accessToken, 'ORDER_ACCESS_TOKEN_REQUIRED'))]); return mapOrder(result.rows[0]); },
    async markOrderPaid(input) {
      const value = input || {};
      return withTransaction(async tx => {
        const locked = await tx.query('SELECT * FROM cwb_orders WHERE order_id = $1 FOR UPDATE', [required(value.order_id, 'ORDER_ID_INVALID')]);
        const order = mapOrder(locked.rows[0]);
        if (!order) throw codedError('ORDER_NOT_FOUND');
        if (order.status === 'refunded' || order.status === 'cancelled') throw codedError('ORDER_STATE_INVALID', '订单状态不允许标记为已支付');
        const result = await tx.query(`UPDATE cwb_orders SET status = CASE WHEN status = 'fulfilled' THEN status ELSE 'paid' END,
          provider = COALESCE($2, provider), provider_order_id = COALESCE($3, provider_order_id), paid_at = COALESCE(paid_at, $4), updated_at = $4 WHERE order_id = $1 RETURNING *`, [order.order_id, text(value.provider), text(value.provider_order_id), now()]);
        return mapOrder(result.rows[0]);
      });
    },
    async markOrderFulfilled(orderId) { const result = await query("UPDATE cwb_orders SET status='fulfilled', fulfilled_at=COALESCE(fulfilled_at,$2), updated_at=$2 WHERE order_id=$1 RETURNING *", [required(orderId, 'ORDER_ID_INVALID'), now()]); return mapOrder(result.rows[0]); },
    async markOrderRefunded(orderId) { const result = await query("UPDATE cwb_orders SET status='refunded', refunded_at=$2, updated_at=$2 WHERE order_id=$1 RETURNING *", [required(orderId, 'ORDER_ID_INVALID'), now()]); return mapOrder(result.rows[0]); },
    async createLicense(input) {
      const value = input || {};
      const result = await query(`INSERT INTO cwb_licenses (license_id, order_id, product_id, plan, workspace_id, token, token_hash, kid, major_version, device_limit, status, revoked_after, issued_at, metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active',0,$11,$12) RETURNING *`, [required(value.license_id, 'LICENSE_ID_INVALID'), text(value.order_id) || null, required(value.product_id || productId, 'LICENSE_PRODUCT_INVALID'), required(value.plan, 'LICENSE_PLAN_REQUIRED'), text(value.workspace_id) || null, credential(value.token, 'LICENSE_TOKEN_REQUIRED'), hash(value.token), required(value.kid, 'LICENSE_KID_REQUIRED'), Number(value.major_version), Math.max(1, Math.min(3, Number(value.device_limit || 3))), value.issued_at || now(), value.metadata || {}]);
      return mapLicense(result.rows[0]);
    },
    async getTrialByIdempotency(idempotencyKey) {
      const result = await query('SELECT * FROM cwb_license_trials WHERE idempotency_key=$1 LIMIT 1', [required(idempotencyKey, 'TRIAL_IDEMPOTENCY_REQUIRED')]);
      return result.rows[0] ? { ...result.rows[0], metadata:clone(result.rows[0].metadata || {}) } : null;
    },
    async createTrial(input) {
      const value = input || {}; const trial = value.trial || {}; const license = value.license || {};
      return withTransaction(async tx => {
        const existing = await tx.query('SELECT * FROM cwb_license_trials WHERE idempotency_key=$1 LIMIT 1', [required(trial.idempotency_key, 'TRIAL_IDEMPOTENCY_REQUIRED')]);
        if (existing.rows[0]) {
          const row = existing.rows[0];
          const storedLicense = await tx.query('SELECT * FROM cwb_licenses WHERE license_id=$1 LIMIT 1', [required(row.license_id, 'LICENSE_ID_INVALID')]);
          return { trial:{ ...row, metadata:clone(row.metadata || {}) }, license:mapLicense(storedLicense.rows[0]) };
        }
        const createdLicense = await tx.query(`INSERT INTO cwb_licenses (license_id, order_id, product_id, plan, workspace_id, token, token_hash, kid, major_version, device_limit, status, revoked_after, issued_at, metadata)
          VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,'active',0,$10,$11) RETURNING *`, [required(license.license_id, 'LICENSE_ID_INVALID'), required(license.product_id || productId, 'LICENSE_PRODUCT_INVALID'), required(license.plan, 'LICENSE_PLAN_REQUIRED'), text(license.workspace_id) || null, credential(license.token, 'LICENSE_TOKEN_REQUIRED'), hash(license.token), required(license.kid, 'LICENSE_KID_REQUIRED'), Number(license.major_version), Math.max(1, Math.min(3, Number(license.device_limit || 3))), license.issued_at || now(), license.metadata || {}]);
        const createdTrial = await tx.query(`INSERT INTO cwb_license_trials (trial_id,idempotency_key,license_id,customer_email,plan,started_at,expires_at,status,metadata)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8) RETURNING *`, [required(trial.trial_id, 'TRIAL_ID_INVALID'), required(trial.idempotency_key, 'TRIAL_IDEMPOTENCY_REQUIRED'), required(license.license_id, 'LICENSE_ID_INVALID'), required(trial.customer_email, 'CUSTOMER_EMAIL_REQUIRED'), required(trial.plan, 'LICENSE_PLAN_REQUIRED'), trial.started_at || now(), trial.expires_at, trial.metadata || {}]);
        return { trial:{ ...createdTrial.rows[0], metadata:clone(createdTrial.rows[0].metadata || {}) }, license:mapLicense(createdLicense.rows[0]) };
      });
    },
    async getBatchByIdempotency(idempotencyKey) {
      const result = await query('SELECT * FROM cwb_license_batches WHERE idempotency_key=$1 LIMIT 1', [required(idempotencyKey, 'LICENSE_BATCH_IDEMPOTENCY_REQUIRED')]);
      return result.rows[0] ? { ...result.rows[0], quantity:Number(result.rows[0].quantity), metadata:clone(result.rows[0].metadata || {}) } : null;
    },
    async createLicenseBatch(input) {
      const value = input || {}; const batch = value.batch || {}; const licenses = Array.isArray(value.licenses) ? value.licenses : [];
      if (!licenses.length || licenses.length !== Number(batch.quantity)) throw codedError('LICENSE_BATCH_SIZE_INVALID', '批量许可证数量不一致');
      return withTransaction(async tx => {
        const existing = await tx.query('SELECT * FROM cwb_license_batches WHERE idempotency_key=$1 LIMIT 1', [required(batch.idempotency_key, 'LICENSE_BATCH_IDEMPOTENCY_REQUIRED')]);
        if (existing.rows[0]) {
          const existingLicenses = await tx.query('SELECT l.* FROM cwb_license_batch_items i JOIN cwb_licenses l ON l.license_id=i.license_id WHERE i.batch_id=$1 ORDER BY i.ordinal', [existing.rows[0].batch_id]);
          return { batch:{ ...existing.rows[0], quantity:Number(existing.rows[0].quantity), metadata:clone(existing.rows[0].metadata || {}) }, licenses:existingLicenses.rows.map(mapLicense) };
        }
        const createdBatch = await tx.query(`INSERT INTO cwb_license_batches (batch_id,idempotency_key,organization_id,customer_email,plan,quantity,status,metadata)
          VALUES ($1,$2,$3,$4,$5,$6,'active',$7) RETURNING *`, [required(batch.batch_id, 'LICENSE_BATCH_ID_INVALID'), required(batch.idempotency_key, 'LICENSE_BATCH_IDEMPOTENCY_REQUIRED'), text(batch.organization_id) || null, required(batch.customer_email, 'CUSTOMER_EMAIL_REQUIRED'), required(batch.plan, 'LICENSE_PLAN_REQUIRED'), Number(batch.quantity), batch.metadata || {}]);
        const created = [];
        for (let index = 0; index < licenses.length; index += 1) {
          const license = licenses[index];
          const row = await tx.query(`INSERT INTO cwb_licenses (license_id, order_id, product_id, plan, workspace_id, token, token_hash, kid, major_version, device_limit, status, revoked_after, issued_at, metadata)
            VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,'active',0,$10,$11) RETURNING *`, [required(license.license_id, 'LICENSE_ID_INVALID'), required(license.product_id || productId, 'LICENSE_PRODUCT_INVALID'), required(license.plan, 'LICENSE_PLAN_REQUIRED'), text(license.workspace_id) || null, credential(license.token, 'LICENSE_TOKEN_REQUIRED'), hash(license.token), required(license.kid, 'LICENSE_KID_REQUIRED'), Number(license.major_version), Math.max(1, Math.min(3, Number(license.device_limit || 3))), license.issued_at || now(), license.metadata || {}]);
          await tx.query('INSERT INTO cwb_license_batch_items (batch_id,license_id,ordinal,workspace_id) VALUES ($1,$2,$3,$4)', [required(batch.batch_id, 'LICENSE_BATCH_ID_INVALID'), required(license.license_id, 'LICENSE_ID_INVALID'), index + 1, text(license.workspace_id) || null]);
          created.push(mapLicense(row.rows[0]));
        }
        return { batch:{ ...createdBatch.rows[0], quantity:Number(createdBatch.rows[0].quantity), metadata:clone(createdBatch.rows[0].metadata || {}) }, licenses:created };
      });
    },
    async createOrganization(input) {
      const value = input || {};
      const result = await query(`INSERT INTO cwb_license_organizations (organization_id,name,customer_email,status,metadata)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id) DO UPDATE SET name=EXCLUDED.name,customer_email=EXCLUDED.customer_email,status=EXCLUDED.status,metadata=EXCLUDED.metadata,updated_at=now() RETURNING *`, [required(value.organization_id, 'ORGANIZATION_ID_INVALID'), required(value.name, 'ORGANIZATION_NAME_REQUIRED'), required(value.customer_email, 'CUSTOMER_EMAIL_REQUIRED'), required(value.status || 'active', 'ORGANIZATION_STATUS_INVALID'), value.metadata || {}]);
      return { ...result.rows[0], metadata:clone(result.rows[0].metadata || {}) };
    },
    async upsertOrganizationWorkspace(input) {
      const value = input || {};
      const result = await query(`INSERT INTO cwb_license_organization_workspaces (organization_id,workspace_id,license_id,status)
        VALUES ($1,$2,$3,$4) ON CONFLICT (organization_id,workspace_id) DO UPDATE SET license_id=EXCLUDED.license_id,status=EXCLUDED.status,updated_at=now() RETURNING *`, [required(value.organization_id, 'ORGANIZATION_ID_INVALID'), required(value.workspace_id, 'LICENSE_WORKSPACE_REQUIRED'), text(value.license_id) || null, required(value.status || 'active', 'ORGANIZATION_WORKSPACE_STATUS_INVALID')]);
      return result.rows[0] || null;
    },
    async listOrganizationWorkspaces(organizationId) {
      const result = await query('SELECT organization_id,workspace_id,license_id,status,created_at,updated_at FROM cwb_license_organization_workspaces WHERE organization_id=$1 ORDER BY workspace_id', [required(organizationId, 'ORGANIZATION_ID_INVALID')]);
      return result.rows;
    },
    async recordTelemetry(input) {
      const value = input || {};
      const result = await query(`INSERT INTO cwb_telemetry_events (event_id,installation_id_hash,event_name,app_version,platform,arch,properties,consent_version,occurred_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (event_id) DO NOTHING RETURNING event_id,occurred_at`, [required(value.event_id, 'TELEMETRY_EVENT_ID_INVALID'), required(value.installation_id_hash, 'TELEMETRY_INSTALLATION_HASH_REQUIRED'), required(value.event_name, 'TELEMETRY_EVENT_INVALID'), required(value.app_version, 'TELEMETRY_APP_VERSION_REQUIRED'), required(value.platform, 'TELEMETRY_PLATFORM_REQUIRED'), text(value.arch) || null, value.properties || {}, required(value.consent_version, 'TELEMETRY_CONSENT_REQUIRED'), value.occurred_at || now()]);
      return { inserted:Boolean(result.rows[0]), event:result.rows[0] || null };
    },
    async getLicense(licenseId) { const result = await query('SELECT * FROM cwb_licenses WHERE license_id=$1 LIMIT 1', [required(licenseId, 'LICENSE_ID_INVALID')]); return mapLicense(result.rows[0]); },
    async getLicenseByToken(token) { const result = await query('SELECT * FROM cwb_licenses WHERE token_hash=$1 LIMIT 1', [hash(credential(token, 'LICENSE_TOKEN_REQUIRED'))]); return mapLicense(result.rows[0]); },
    async listDevices(licenseId) { const result = await query('SELECT license_id, device_id, workspace_id, status, activated_at, last_seen_at, deactivated_at, metadata FROM cwb_license_devices WHERE license_id=$1 ORDER BY activated_at', [required(licenseId, 'LICENSE_ID_INVALID')]); return result.rows.map(mapDevice); },
    async activateDevice(input) {
      const value = input || {};
      return withTransaction(async tx => {
        const locked = await tx.query('SELECT * FROM cwb_licenses WHERE license_id=$1 FOR UPDATE', [required(value.license_id, 'LICENSE_ID_INVALID')]);
        const license = mapLicense(locked.rows[0]);
        if (!license) throw codedError('LICENSE_NOT_FOUND');
        if (license.status !== 'active') throw codedError('LICENSE_REVOKED');
        const workspaceId = required(value.workspace_id, 'LICENSE_WORKSPACE_REQUIRED');
        const deviceId = required(value.device_id, 'LICENSE_DEVICE_REQUIRED');
        if (license.workspace_id && license.workspace_id !== workspaceId) throw codedError('LICENSE_WORKSPACE_MISMATCH');
        const existing = await tx.query('SELECT * FROM cwb_license_devices WHERE license_id=$1 AND device_id=$2 FOR UPDATE', [license.license_id, deviceId]);
        const activeCount = await tx.query("SELECT count(*)::int AS count FROM cwb_license_devices WHERE license_id=$1 AND status='active'", [license.license_id]);
        if (!existing.rows[0] && Number(activeCount.rows[0].count) >= license.device_limit) throw codedError('LICENSE_DEVICE_LIMIT');
        const timestamp = now();
        if (existing.rows[0]) {
          const updated = await tx.query("UPDATE cwb_license_devices SET workspace_id=$3,status='active',last_seen_at=$4,deactivated_at=NULL WHERE license_id=$1 AND device_id=$2 RETURNING license_id,device_id,workspace_id,status,activated_at,last_seen_at,deactivated_at,metadata", [license.license_id, deviceId, workspaceId, timestamp]);
          return { license, device:mapDevice(updated.rows[0]) };
        }
        const inserted = await tx.query(`INSERT INTO cwb_license_devices (license_id, device_id, workspace_id, status, activated_at, last_seen_at)
          VALUES ($1,$2,$3,'active',$4,$4) RETURNING license_id,device_id,workspace_id,status,activated_at,last_seen_at,deactivated_at,metadata`, [license.license_id, deviceId, workspaceId, timestamp]);
        if (!license.workspace_id) await tx.query('UPDATE cwb_licenses SET workspace_id=$2,updated_at=$3 WHERE license_id=$1', [license.license_id, workspaceId, timestamp]);
        return { license, device:mapDevice(inserted.rows[0]) };
      });
    },
    async touchDevice(input) { const result = await query("UPDATE cwb_license_devices SET last_seen_at=$4 WHERE license_id=$1 AND device_id=$2 AND workspace_id=$3 AND status='active' RETURNING license_id,device_id,workspace_id,status,activated_at,last_seen_at,deactivated_at,metadata", [required(input.license_id, 'LICENSE_ID_INVALID'), required(input.device_id, 'LICENSE_DEVICE_REQUIRED'), required(input.workspace_id, 'LICENSE_WORKSPACE_REQUIRED'), now()]); return mapDevice(result.rows[0]); },
    async deactivateDevice(input) { const result = await query("UPDATE cwb_license_devices SET status='revoked',deactivated_at=$3,last_seen_at=$3 WHERE license_id=$1 AND device_id=$2 RETURNING license_id,device_id,workspace_id,status,activated_at,last_seen_at,deactivated_at,metadata", [required(input.license_id, 'LICENSE_ID_INVALID'), required(input.device_id, 'LICENSE_DEVICE_REQUIRED'), now()]); if (!result.rows[0]) throw codedError('LICENSE_DEVICE_NOT_FOUND'); return mapDevice(result.rows[0]); },
    async revokeLicense(input) { const value = input || {}; const result = await query("UPDATE cwb_licenses SET status='revoked',revoked_after=$2,revoked_at=$3,revoke_reason=$4,updated_at=$3 WHERE license_id=$1 RETURNING *", [required(value.license_id, 'LICENSE_ID_INVALID'), Date.parse(value.revoked_after || now()), now(), text(value.reason)]); if (!result.rows[0]) throw codedError('LICENSE_NOT_FOUND'); return mapLicense(result.rows[0]); },
    async recordWebhook(input) { const value = input || {}; const result = await query(`INSERT INTO cwb_webhook_events (provider,event_id,event_type,payload_hash,status) VALUES ($1,$2,$3,$4,'received') ON CONFLICT (provider,event_id) DO NOTHING RETURNING provider,event_id,event_type,payload_hash,status`, [required(value.provider, 'WEBHOOK_PROVIDER_REQUIRED'), required(value.event_id, 'WEBHOOK_EVENT_REQUIRED'), required(value.event_type || 'unknown', 'WEBHOOK_TYPE_REQUIRED'), required(value.payload_hash, 'WEBHOOK_HASH_REQUIRED')]); return { inserted:Boolean(result.rows[0]), event:result.rows[0] || null }; },
    async completeWebhook(input) { const value = input || {}; const result = await query('UPDATE cwb_webhook_events SET status=$3,processed_at=$4,error_code=$5 WHERE provider=$1 AND event_id=$2 RETURNING *', [required(value.provider, 'WEBHOOK_PROVIDER_REQUIRED'), required(value.event_id, 'WEBHOOK_EVENT_REQUIRED'), required(value.status || 'processed', 'WEBHOOK_STATUS_REQUIRED'), now(), text(value.error_code) || null]); return result.rows[0] || null; },
    async enqueueEmail(input) { const value = input || {}; const result = await query(`INSERT INTO cwb_email_outbox (message_id,order_id,recipient,kind,payload,status) VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`, [required(value.message_id || randomId('mail'), 'EMAIL_ID_INVALID'), text(value.order_id) || null, required(value.recipient, 'EMAIL_RECIPIENT_REQUIRED'), required(value.kind, 'EMAIL_KIND_REQUIRED'), value.payload || {}]); return result.rows[0]; },
    async claimEmail(messageId) { const result = await query("UPDATE cwb_email_outbox SET status='sending',attempts=attempts+1 WHERE message_id=$1 AND status IN ('pending','failed') AND next_attempt_at <= now() RETURNING *", [required(messageId, 'EMAIL_ID_INVALID')]); return result.rows[0] || null; },
    async markEmailSent(messageId) { const result = await query("UPDATE cwb_email_outbox SET status='sent',sent_at=$2,last_error=NULL WHERE message_id=$1 RETURNING *", [required(messageId, 'EMAIL_ID_INVALID'), now()]); return result.rows[0] || null; },
    async markEmailFailed(messageId, cause, retryAt) { const result = await query("UPDATE cwb_email_outbox SET status='failed',last_error=$2,next_attempt_at=$3 WHERE message_id=$1 RETURNING *", [required(messageId, 'EMAIL_ID_INVALID'), text(cause).slice(0, 1000), retryAt || new Date(Date.now() + 15 * 60 * 1000)]); return result.rows[0] || null; },
    async listDueEmails(limit) { const result = await query("SELECT * FROM cwb_email_outbox WHERE status IN ('pending','failed') AND next_attempt_at <= now() ORDER BY created_at LIMIT $1", [Math.max(1, Math.min(100, Number(limit || 20)))]); return result.rows; },
    async createAudit(input) { const value = input || {}; const result = await query('INSERT INTO cwb_audit_events (audit_id,actor_type,actor_id,action,subject_type,subject_id,details) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING audit_id,created_at', [required(value.audit_id || randomId('audit'), 'AUDIT_ID_INVALID'), required(value.actor_type || 'system', 'AUDIT_ACTOR_TYPE_INVALID'), text(value.actor_id) || null, required(value.action, 'AUDIT_ACTION_REQUIRED'), text(value.subject_type) || null, text(value.subject_id) || null, value.details || {}]); return result.rows[0]; },
    async getAdminApiKey(keyHash) { const result = await query('SELECT key_id,key_hash,roles,status,created_at,last_used_at FROM cwb_admin_api_keys WHERE key_hash=$1 LIMIT 1', [required(keyHash, 'ADMIN_KEY_HASH_INVALID')]); if (!result.rows[0]) return null; await query('UPDATE cwb_admin_api_keys SET last_used_at=$2 WHERE key_id=$1', [result.rows[0].key_id, now()]); return { ...result.rows[0], roles:Array.isArray(result.rows[0].roles) ? result.rows[0].roles : [] }; },
    async listAudit(limit) { const result = await query('SELECT audit_id,actor_type,actor_id,action,subject_type,subject_id,details,created_at FROM cwb_audit_events ORDER BY created_at DESC LIMIT $1', [Math.max(1, Math.min(200, Number(limit || 100)))]); return result.rows.map(row => ({ ...row, details:clone(row.details || {}) })); },
    async latestManifest(input) { const value = input || {}; const result = await query("SELECT manifest FROM cwb_update_manifests WHERE channel=$1 AND status='published' AND version=$2 LIMIT 1", [required(value.channel || 'stable', 'UPDATE_CHANNEL_INVALID'), required(value.version, 'UPDATE_VERSION_REQUIRED')]); return result.rows[0] ? clone(result.rows[0].manifest) : null; },
    async latestPublishedManifest(channel) { const result = await query("SELECT manifest FROM cwb_update_manifests WHERE channel=$1 AND status='published' ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 1", [required(channel || 'stable', 'UPDATE_CHANNEL_INVALID')]); return result.rows[0] ? clone(result.rows[0].manifest) : null; },
    async saveManifest(input) { const value = input || {}; const result = await query(`INSERT INTO cwb_update_manifests (manifest_id,version,channel,manifest,status,published_at) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (version,channel) DO UPDATE SET manifest=EXCLUDED.manifest,status=EXCLUDED.status,published_at=EXCLUDED.published_at RETURNING *`, [required(value.manifest_id || randomId('manifest'), 'UPDATE_MANIFEST_ID_INVALID'), required(value.version, 'UPDATE_VERSION_REQUIRED'), required(value.channel || 'stable', 'UPDATE_CHANNEL_INVALID'), value.manifest || {}, required(value.status || 'draft', 'UPDATE_MANIFEST_STATUS_INVALID'), value.status === 'published' ? (value.published_at || now()) : null]); return result.rows[0]; },
  };
}

module.exports = { createPostgresStore, hash, codedError };
