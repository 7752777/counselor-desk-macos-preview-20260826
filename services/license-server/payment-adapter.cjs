/* Deployment-side payment adapter contract.
 * Provider credentials and platform-specific API calls stay outside this repo.
 * The adapter may create a checkout URL; payment truth still comes from the
 * separately verified webhook passed to server.cjs.
 */
const crypto = require('node:crypto');

function text(value) { return String(value == null ? '' : value).trim(); }
function httpsUrl(value) {
  let parsed;
  try { parsed = new URL(text(value)); } catch (_) { throw Object.assign(new Error('ORDER_CHECKOUT_URL_INVALID'), { code:'ORDER_CHECKOUT_URL_INVALID' }); }
  if (parsed.protocol !== 'https:') throw Object.assign(new Error('ORDER_CHECKOUT_URL_INVALID'), { code:'ORDER_CHECKOUT_URL_INVALID' });
  return parsed.toString();
}
function createPaymentAdapter(options) {
  const opts = options || {};
  if (typeof opts.createCheckout !== 'function') throw new Error('payment adapter must provide createCheckout(order)');
  return Object.freeze({
    async createCheckout(order) {
      const result = await opts.createCheckout(Object.freeze({ ...order }));
      const checkoutUrl = httpsUrl(result && (result.checkout_url || result.url));
      return Object.freeze({ provider:text(result.provider || opts.provider || 'external'), checkout_url:checkoutUrl, provider_order_id:text(result.provider_order_id) });
    },
  });
}
function createStaticCheckoutAdapter(options) {
  const opts = options || {};
  const template = text(opts.template);
  if (!template) throw new Error('static checkout template is required');
  return createPaymentAdapter({ provider:opts.provider || 'external', createCheckout:async order => ({ provider:opts.provider || 'external', checkout_url:template.replace(/\{order_id\}/g, encodeURIComponent(order.order_id)).replace(/\{plan\}/g, encodeURIComponent(order.plan)) }) });
}
function createRequestId() { return crypto.randomUUID(); }

module.exports = { createPaymentAdapter, createStaticCheckoutAdapter, createRequestId, httpsUrl };
