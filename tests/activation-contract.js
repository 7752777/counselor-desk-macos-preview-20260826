const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder, TextEncoder } = require('node:util');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function tokenFixture() {
  const payload = Buffer.from(JSON.stringify({ license_id:'lic_activation_file', product_id:'counselor-desk', plan:'ai', major_version:4, device_limit:3, status:'active', issued_at:'2026-08-23T00:00:00.000Z', kid:'activation-contract' }), 'utf8').toString('base64url');
  return `CWB-LIC-1.${payload}.YWJj`;
}

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'output', 'v4-preview.html'), 'utf8')
    .replace(/<script data-cwb-license-config>[\s\S]*?<\/script>/, `<script data-cwb-license-config>window.CWB_LICENSE_MODE='commercial';window.CWB_LICENSE_PUBLIC_KEYS={};window.CWB_LICENSE_SERVICE_URL='';</script>`);
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message)); });
  const dom = new JSDOM(source, { runScripts:'dangerously', resources:'usable', url:'https://activation-ui.local/', pretendToBeVisual:true, virtualConsole, beforeParse(window) { window.cwbDesktop = {}; window.scrollTo = () => {}; window.TextDecoder = TextDecoder; window.TextEncoder = TextEncoder; } });
  await wait(900);
  const { window:w } = dom;
  w.CWB.license.openActivation();
  await wait(30);
  const modal = w.document.querySelector('#modal-root .cwb-license-modal');
  assert.ok(modal, 'activation modal should open');
  assert.ok(modal.closest('.modal.wide'), 'activation modal should use the wide layout');
  assert.equal(modal.querySelector('[data-license-purchase]'), null, 'purchase entry stays hidden until payment is enabled');
  assert.equal(modal.querySelector('[data-license-managed-redeem]').disabled, true, 'friend AI must remain unavailable before an AI license is active');
  assert.match(modal.querySelector('label[for="cwb-license-token"]').textContent, /前瞻兑换码/, 'activation modal should explain redemption codes');
  const token = tokenFixture();
  const fileInput = modal.querySelector('#cwb-license-file');
  const file = { name:'activation.cwb-license', type:'text/plain', text:async () => token };
  Object.defineProperty(fileInput, 'files', { configurable:true, value:[file] });
  fileInput.dispatchEvent(new w.Event('change', { bubbles:true }));
  await wait(50);
  assert.equal(modal.querySelector('#cwb-license-token').value, token, 'license file import should populate the activation input');
  assert.equal(w.CWB.license.getState().status, 'unlicensed', 'importing a file must not activate it automatically');

  const qrInput = modal.querySelector('#cwb-license-qr');
  const qrFile = { name:'license.png', type:'image/png' };
  Object.defineProperty(qrInput, 'files', { configurable:true, value:[qrFile] });
  qrInput.dispatchEvent(new w.Event('change', { bubbles:true }));
  await wait(50);
  assert.match(modal.querySelector('.cwb-license-activation-error').textContent, /二维码|浏览器能力|许可证/, 'QR fallback should explain the next available activation path');
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS activation-contract');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
