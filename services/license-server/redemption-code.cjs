/*
 * Long-lived campaign redemption codes are deployment secrets. This module
 * only validates and hashes them; it never contains a production plaintext
 * code and must not be used as a substitute for signed licenses.
 */
const crypto = require('node:crypto');

const PREFIX = 'CWB-REDEEM-1.';
const MIN_RANDOM_LENGTH = 32;

function text(value) { return String(value == null ? '' : value).trim(); }
function error(code, message) { const cause = new Error(`${code}: ${message || code}`); cause.code = code; return cause; }
function parse(input) {
  const value = text(input);
  if (!value.startsWith(PREFIX) || value.length > 512) throw error('REDEMPTION_CODE_INVALID', '兑换码格式无效');
  const randomPart = value.slice(PREFIX.length);
  if (randomPart.length < MIN_RANDOM_LENGTH || !/^[A-Za-z0-9_-]+$/.test(randomPart)) throw error('REDEMPTION_CODE_INVALID', '兑换码强度不足');
  return Object.freeze({ prefix:PREFIX, random_part:randomPart });
}
function hash(input) {
  const value = text(input);
  parse(value);
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
function normalizeCampaign(input) {
  const value = input || {};
  const campaignId = text(value.campaign_id);
  const plan = text(value.plan);
  const productId = text(value.product_id);
  const codeHash = text(value.code_hash).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{2,80}$/.test(campaignId)) throw error('REDEMPTION_CAMPAIGN_INVALID', '兑换活动编号无效');
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(plan)) throw error('REDEMPTION_PLAN_INVALID', '兑换活动档位无效');
  if (productId && !/^[a-z][a-z0-9._-]{1,80}$/.test(productId)) throw error('REDEMPTION_PRODUCT_INVALID', '兑换活动产品无效');
  if (!/^[a-f0-9]{64}$/.test(codeHash)) throw error('REDEMPTION_HASH_INVALID', '兑换码哈希无效');
  if (Object.prototype.hasOwnProperty.call(value, 'code') || Object.prototype.hasOwnProperty.call(value, 'plaintext')) throw error('REDEMPTION_PLAINTEXT_FORBIDDEN', '部署配置不得包含兑换码明文');
  const status = text(value.status || 'active');
  if (!['active', 'paused', 'revoked'].includes(status)) throw error('REDEMPTION_STATUS_INVALID', '兑换活动状态无效');
  return Object.freeze({ campaign_id:campaignId, product_id:productId, plan, code_hash:codeHash, status, metadata:value.metadata && typeof value.metadata === 'object' ? { ...value.metadata } : {} });
}
function generate() {
  const code = `${PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  return Object.freeze({ code, code_hash:hash(code) });
}

module.exports = { PREFIX, MIN_RANDOM_LENGTH, parse, hash, normalizeCampaign, generate };
