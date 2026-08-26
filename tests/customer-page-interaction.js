const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'services', 'license-server', 'customer.html'), 'utf8');
  const calls = [];
  const dom = new JSDOM(html, {
    runScripts:'dangerously',
    url:'https://license.example.test/customer?plan=ai',
    pretendToBeVisual:true,
    beforeParse(window) {
      // Deliberately omit window.crypto to exercise the compatibility fallback.
      Object.defineProperty(window, 'crypto', { configurable:true, value:undefined });
      window.fetch = async (url, options) => {
        calls.push({ url:String(url), options:options || {} });
        if (String(url).endsWith('/api/v1/products')) return { ok:true, status:200, json:async () => ({ products:[{ plan:'ai', label:'AI <unsafe>', ai_enabled:true, perpetual_updates:false, price_minor:49900, currency:'CNY&<unsafe>' }] }) };
        if (String(url).endsWith('/api/v1/orders')) return { ok:true, status:200, json:async () => ({ order:{ order_id:'ord_ui', plan:'ai', amount_minor:49900, currency:'CNY', status:'pending', payment_url:'https://pay.example.test/order/ord_ui', access_token_expires_at:'2030-01-01T00:00:00.000Z' }, access_token:'ord_access_ui' }) };
        throw new Error(`unexpected request: ${url}`);
      };
    },
  });
  try {
    await wait(25);
    const productTitle = dom.window.document.querySelector('.product-title');
    assert.equal(productTitle.textContent, 'AI <unsafe>');
    assert.equal(productTitle.querySelector('img'), null, 'product labels must be HTML-escaped');
    assert.equal(dom.window.document.querySelector('.product-price').textContent, '499.00 CNY&<unsafe>');
    assert.equal(dom.window.document.querySelector('.product-price').querySelector('img'), null, 'product currency must be HTML-escaped');
    assert.equal(dom.window.document.querySelector('input[name="plan"]').value, 'ai', 'purchase page must honor the selected plan from the workbench');
    assert.equal(dom.window.document.querySelector('input[name="plan"]').checked, true);
    const email = dom.window.document.querySelector('#customer-email');
    email.value = 'teacher@example.test';
    dom.window.document.querySelector('#order-form').dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
    await wait(25);
    assert.equal(dom.window.document.querySelector('#order-id').textContent, 'ord_ui');
    assert.match(dom.window.document.querySelector('#order-access-expiry').textContent, /2030/);
    assert.equal(dom.window.document.querySelector('#pay-order').hidden, false, 'a verified HTTPS checkout URL should expose the payment action');
    const orderCall = calls.find(item => item.url.endsWith('/api/v1/orders'));
    assert.ok(orderCall, 'submitting the customer form must call the order API');
    assert.match(orderCall.options.headers['Idempotency-Key'], /^customer_/);
  } finally {
    dom.window.close();
  }
  console.log('PASS customer-page-interaction');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
