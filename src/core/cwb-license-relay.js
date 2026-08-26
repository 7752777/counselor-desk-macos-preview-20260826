/* Short-lived commercial assertion for the AI relay.
 * It contains entitlement metadata only, never a model key or business data.
 */
(function installCwbLicenseRelay(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBLicenseRelay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbLicenseRelay(root) {
  'use strict';

  const TOKEN_PREFIX = 'CWB-REL-1';
  const PRODUCT_ID = 'counselor-desk';
  const MAX_LIFETIME_MS = 15 * 60 * 1000;
  const CLOCK_SKEW_MS = 5 * 60 * 1000;
  const text = value => String(value == null ? '' : value).trim();
  const error = (code, message, cause) => { const value = new Error(`${code}: ${message || code}`); value.code = code; if (cause) value.cause = cause; return value; };

  function decode(value, field) {
    const raw = text(value);
    if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) throw error('AI_LICENSE_ASSERTION_INVALID', `${field || '授权凭据'}编码无效`);
    const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - raw.length % 4) % 4);
    try {
      const bytes = typeof Buffer !== 'undefined' ? Buffer.from(padded, 'base64') : Uint8Array.from(atob(padded), char => char.charCodeAt(0));
      if (!bytes.length) throw new Error('empty');
      const json = typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('utf8') : new TextDecoder().decode(bytes);
      return JSON.parse(json);
    } catch (cause) { throw error('AI_LICENSE_ASSERTION_INVALID', `${field || '授权凭据'}不是有效 JSON`, cause); }
  }

  function parse(input) {
    const token = text(input);
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) throw error('AI_LICENSE_ASSERTION_INVALID');
    const payload = decode(parts[1], '授权载荷');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw error('AI_LICENSE_ASSERTION_INVALID');
    if (!text(payload.kid) || !text(payload.license_id) || text(payload.product_id) !== PRODUCT_ID) throw error('AI_LICENSE_ASSERTION_INVALID');
    if (!text(parts[2]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw error('AI_LICENSE_ASSERTION_INVALID');
    return Object.freeze({ token, payload, payload_segment:parts[1], signature_segment:parts[2] });
  }

  function keyObject(publicKey) {
    if (typeof require !== 'function' || !publicKey) return null;
    const crypto = require('node:crypto');
    if (typeof publicKey === 'object' && publicKey.type) return publicKey;
    if (String(publicKey).includes('BEGIN')) return crypto.createPublicKey(publicKey);
    return crypto.createPublicKey({ key:Buffer.from(String(publicKey), 'base64'), format:'der', type:'spki' });
  }

  async function verifySignature(parsed, publicKeys) {
    const value = parsed && parsed.payload ? parsed : parse(parsed);
    const keys = publicKeys || {};
    const publicKey = keys[value.payload.kid] || keys.default || (typeof keys === 'string' ? keys : '');
    if (!publicKey) throw error('AI_LICENSE_PUBLIC_KEY_MISSING');
    const crypto = typeof require === 'function' ? require('node:crypto') : null;
    if (crypto) {
      const raw = value.signature_segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.signature_segment.length % 4) % 4);
      const signature = Buffer.from(raw, 'base64');
      if (!crypto.verify(null, Buffer.from(value.payload_segment, 'utf8'), keyObject(publicKey), signature)) throw error('AI_LICENSE_ASSERTION_INVALID');
      return true;
    }
    const subtle = root && root.crypto && root.crypto.subtle;
    if (!subtle) throw error('AI_LICENSE_ASSERTION_UNSUPPORTED');
    throw error('AI_LICENSE_ASSERTION_UNSUPPORTED', 'AI relay assertion 只在授权服务端校验');
  }

  function evaluate(parsed, options) {
    const value = parsed && parsed.payload ? parsed : parse(parsed);
    const opts = options || {};
    const now = Number(opts.now == null ? Date.now() : opts.now);
    const payload = value.payload || {};
    const issued = Date.parse(String(payload.issued_at || ''));
    const expires = Date.parse(String(payload.expires_at || ''));
    if (payload.product_id !== PRODUCT_ID || payload.ai !== true) throw error('AI_LICENSE_NOT_ENTITLED');
    const managedRelay = payload.managed_relay === true;
    if (managedRelay && !text(payload.grant_id)) throw error('AI_LICENSE_ASSERTION_INVALID', '托管 AI 授权缺少资格编号');
    if (opts.requireManagedRelay === true && !managedRelay) throw error('AI_MANAGED_RELAY_GRANT_REQUIRED', '当前 AI 授权不包含友情托管服务');
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > MAX_LIFETIME_MS + CLOCK_SKEW_MS) throw error('AI_LICENSE_ASSERTION_INVALID');
    if (now + CLOCK_SKEW_MS < issued || now > expires + CLOCK_SKEW_MS) throw error('AI_LICENSE_ASSERTION_EXPIRED');
    return Object.freeze({ ok:true, license_id:text(payload.license_id), expires_at:payload.expires_at, kid:text(payload.kid), managed_relay:managedRelay, grant_id:text(payload.grant_id) });
  }

  return Object.freeze({ TOKEN_PREFIX, PRODUCT_ID, MAX_LIFETIME_MS, parse, verifySignature, evaluate });
});
