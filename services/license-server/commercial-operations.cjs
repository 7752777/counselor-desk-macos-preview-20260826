/* Commercial operations input boundaries.
 *
 * These helpers deliberately accept product and operational metadata only.
 * Student records, business attachments, model keys, prompts and free-form
 * customer content are rejected or never copied into the returned values.
 */
const crypto = require('node:crypto');

const TRIAL_MAX_DAYS = 30;
const BATCH_MAX_LICENSES = 500;
const TELEMETRY_CONSENT_VERSION = '1';
const TELEMETRY_EVENTS = new Set([
  'app_started', 'app_updated', 'license_activated', 'license_refresh_failed',
  'update_check_failed', 'update_installed', 'backup_completed', 'sync_completed',
]);
const TELEMETRY_PROPERTIES = new Set(['duration_ms', 'records_count', 'attachments_count', 'error_code', 'channel']);

function text(value) { return String(value == null ? '' : value).trim(); }
function codedError(code, message) { const error = new Error(`${code}: ${message || code}`); error.code = code; return error; }
function required(value, code) {
  const result = text(value);
  if (!result || result.length > 240 || /[\x00-\x1f]/.test(result)) throw codedError(code, '字段无效');
  return result;
}
function email(value) {
  const result = required(value, 'CUSTOMER_EMAIL_REQUIRED').toLowerCase();
  if (result.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw codedError('CUSTOMER_EMAIL_INVALID', '邮箱地址无效');
  return result;
}
function integer(value, min, max, code) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw codedError(code, `数值必须在 ${min} 至 ${max} 之间`);
  return result;
}
function iso(value, code) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw codedError(code, '日期无效');
  return parsed.toISOString();
}
function randomId(prefix) { return `${prefix}_${crypto.randomUUID()}`; }

function normalizeTrialInput(input, now) {
  const value = input || {};
  const days = integer(value.days == null ? 7 : value.days, 1, TRIAL_MAX_DAYS, 'TRIAL_DAYS_INVALID');
  const startedAt = iso(value.started_at || (typeof now === 'function' ? now() : new Date()), 'TRIAL_START_INVALID');
  const expiresAt = new Date(new Date(startedAt).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  return {
    trial_id:required(value.trial_id || randomId('trial'), 'TRIAL_ID_INVALID'),
    idempotency_key:required(value.idempotency_key || randomId('trial-request'), 'TRIAL_IDEMPOTENCY_REQUIRED'),
    customer_email:email(value.customer_email),
    plan:required(value.plan, 'LICENSE_PLAN_REQUIRED'),
    days, started_at:startedAt, expires_at:expiresAt,
    metadata:value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata) ? { ...value.metadata } : {},
  };
}

function normalizeBatchInput(input) {
  const value = input || {};
  const count = integer(value.count, 1, BATCH_MAX_LICENSES, 'LICENSE_BATCH_SIZE_INVALID');
  const workspaceIds = Array.isArray(value.workspace_ids) ? [...new Set(value.workspace_ids.map(text).filter(Boolean))] : [];
  if (workspaceIds.length && workspaceIds.length !== count) throw codedError('LICENSE_BATCH_WORKSPACE_COUNT_MISMATCH', '工作区数量必须与许可证数量一致');
  return {
    batch_id:required(value.batch_id || randomId('batch'), 'LICENSE_BATCH_ID_INVALID'),
    idempotency_key:required(value.idempotency_key || randomId('batch-request'), 'LICENSE_BATCH_IDEMPOTENCY_REQUIRED'),
    customer_email:email(value.customer_email),
    plan:required(value.plan, 'LICENSE_PLAN_REQUIRED'),
    count,
    workspace_ids:workspaceIds,
    organization_id:text(value.organization_id) || null,
    metadata:value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata) ? { ...value.metadata } : {},
  };
}

function normalizeOrganizationInput(input) {
  const value = input || {};
  const workspaceIds = Array.isArray(value.workspace_ids) ? [...new Set(value.workspace_ids.map(text).filter(Boolean))] : [];
  if (workspaceIds.length > BATCH_MAX_LICENSES) throw codedError('ORGANIZATION_WORKSPACE_LIMIT', '工作区数量超过上限');
  return {
    organization_id:required(value.organization_id || randomId('org'), 'ORGANIZATION_ID_INVALID'),
    name:required(value.name, 'ORGANIZATION_NAME_REQUIRED').slice(0, 160),
    customer_email:email(value.customer_email),
    plan:required(value.plan || 'standard_perpetual', 'LICENSE_PLAN_REQUIRED'),
    workspace_ids:workspaceIds,
    status:text(value.status || 'active') === 'active' ? 'active' : 'paused',
    metadata:value.metadata && typeof value.metadata === 'object' && !Array.isArray(value.metadata) ? { ...value.metadata } : {},
  };
}

function hashInstallationId(value, salt) {
  const installationId = required(value, 'TELEMETRY_INSTALLATION_REQUIRED');
  const secret = required(salt, 'TELEMETRY_SALT_REQUIRED');
  return crypto.createHmac('sha256', secret).update(installationId, 'utf8').digest('hex');
}

function normalizeTelemetryInput(input, options) {
  const value = input || {};
  const opts = options || {};
  if (value.consent !== true) throw codedError('TELEMETRY_CONSENT_REQUIRED', '未获得匿名指标授权');
  const eventName = text(value.event_name);
  if (!TELEMETRY_EVENTS.has(eventName)) throw codedError('TELEMETRY_EVENT_INVALID', '指标事件不在允许清单中');
  const props = {};
  const source = value.properties && typeof value.properties === 'object' && !Array.isArray(value.properties) ? value.properties : {};
  for (const key of TELEMETRY_PROPERTIES) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const item = source[key];
    if (key === 'error_code' || key === 'channel') props[key] = text(item).slice(0, 80);
    else if (Number.isFinite(Number(item))) props[key] = Math.max(0, Math.min(1000000000, Number(item)));
  }
  const result = {
    event_id:required(value.event_id || randomId('metric'), 'TELEMETRY_EVENT_ID_INVALID'),
    installation_id_hash:hashInstallationId(value.installation_id, opts.salt),
    event_name:eventName,
    app_version:required(value.app_version, 'TELEMETRY_APP_VERSION_REQUIRED').slice(0, 32),
    platform:required(value.platform, 'TELEMETRY_PLATFORM_REQUIRED').slice(0, 32),
    arch:text(value.arch).slice(0, 32),
    properties:props,
    consent_version:TELEMETRY_CONSENT_VERSION,
    occurred_at:value.occurred_at ? iso(value.occurred_at, 'TELEMETRY_DATE_INVALID') : new Date().toISOString(),
  };
  if (opts.maxAgeMs && Date.now() - Date.parse(result.occurred_at) > opts.maxAgeMs) throw codedError('TELEMETRY_EVENT_TOO_OLD', '指标事件已过期');
  return result;
}

module.exports = {
  TRIAL_MAX_DAYS, BATCH_MAX_LICENSES, TELEMETRY_CONSENT_VERSION, TELEMETRY_EVENTS,
  normalizeTrialInput, normalizeBatchInput, normalizeOrganizationInput,
  normalizeTelemetryInput, hashInstallationId, codedError,
};
