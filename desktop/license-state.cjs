const { codedError } = require('./vault.cjs');

function text(value) { return String(value == null ? '' : value).trim(); }

function bounded(value, code, max = 240) {
  const result = text(value);
  if (result.length > max || /[\x00-\x1f]/.test(result)) throw codedError(code, '许可证状态字段无效');
  return result;
}

function validateManagedRelayState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw codedError('LICENSE_STATE_INVALID', '友情 AI 状态格式无效');
  const status = bounded(value.status, 'LICENSE_STATE_INVALID');
  if (!['active', 'revoked'].includes(status)) throw codedError('LICENSE_STATE_INVALID', '友情 AI 状态无效');
  const grantId = bounded(value.grant_id, 'LICENSE_STATE_INVALID');
  const licenseId = bounded(value.license_id, 'LICENSE_STATE_INVALID');
  if (!grantId || !licenseId) throw codedError('LICENSE_STATE_INVALID', '友情 AI 状态缺少资格编号');
  return {
    grant_id:grantId,
    campaign_id:bounded(value.campaign_id, 'LICENSE_STATE_INVALID'),
    license_id:licenseId,
    status,
    issued_at:bounded(value.issued_at, 'LICENSE_STATE_INVALID'),
    revoked_at:bounded(value.revoked_at, 'LICENSE_STATE_INVALID'),
  };
}

function validateLicenseState(value) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw codedError('LICENSE_STATE_INVALID', '许可证状态格式无效');
  const token = bounded(value.token, 'LICENSE_STATE_INVALID', 64 * 1024);
  if (!token || !token.startsWith('CWB-LIC-1.')) throw codedError('LICENSE_STATE_INVALID', '许可证状态缺少有效激活码');
  return {
    status:bounded(value.status, 'LICENSE_STATE_INVALID'),
    reason:bounded(value.reason, 'LICENSE_STATE_INVALID'),
    token,
    last_online_at:bounded(value.last_online_at, 'LICENSE_STATE_INVALID'),
    last_seen_at:bounded(value.last_seen_at, 'LICENSE_STATE_INVALID'),
    device_id:bounded(value.device_id, 'LICENSE_STATE_INVALID'),
    managed_relay:value.managed_relay == null ? null : validateManagedRelayState(value.managed_relay),
  };
}

module.exports = { validateLicenseState, validateManagedRelayState };
