/* Generic HMAC webhook verifier. Payment providers with asymmetric signatures
 * or provider-specific canonicalization must inject their official adapter. */
const crypto = require('node:crypto');

function text(value) { return String(value == null ? '' : value).trim(); }
function codedError(code, message) { const error = new Error(`${code}: ${message || code}`); error.code = code; return error; }
function safeEqual(left, right) { const a = Buffer.from(String(left), 'utf8'); const b = Buffer.from(String(right), 'utf8'); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function decodeSignature(value) {
  const input = text(value); if (!input) return '';
  const pair = input.split(',').map(item => item.trim()).find(item => item.startsWith('v1='));
  const result = pair ? pair.slice(3) : input;
  return result.replace(/^sha256=/i, '').trim();
}
function createHmacWebhookVerifier(options) {
  const opts = options || {}; const secret = text(opts.secret); const toleranceMs = Math.max(30_000, Number(opts.toleranceMs || 5 * 60 * 1000));
  if (!secret) throw codedError('PAYMENT_WEBHOOK_SECRET_REQUIRED');
  return async input => {
    const value = input || {}; const rawBody = text(value.rawBody); const timestamp = Number(value.timestamp || 0); const signature = decodeSignature(value.signature);
    if (!rawBody || !timestamp || !signature) return false;
    const timestampMs = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp;
    if (Math.abs(Date.now() - timestampMs) > toleranceMs) throw codedError('PAYMENT_WEBHOOK_TIMESTAMP_INVALID', '支付事件超出允许时间窗');
    const expectedHex = crypto.createHmac(opts.algorithm || 'sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
    const expectedBase64 = Buffer.from(expectedHex, 'hex').toString('base64');
    return safeEqual(signature.toLowerCase(), expectedHex.toLowerCase()) || safeEqual(signature, expectedBase64);
  };
}

module.exports = { createHmacWebhookVerifier, decodeSignature, codedError };
