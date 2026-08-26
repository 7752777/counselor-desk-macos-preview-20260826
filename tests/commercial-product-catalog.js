'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCommercialMemoryStore } = require('./license-server-fixture.js');
const { prepare } = require('../scripts/prepare-desktop-config.cjs');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const expected = [
    ['standard', '普通版', 1000, '10 元'],
    ['standard_perpetual', '普通永久更新版', 2000, '20 元'],
    ['ai', 'AI 增强版', 4000, '40 元'],
    ['ai_perpetual', '永久 AI 增强版', 6000, '60 元'],
  ];
  const store = createCommercialMemoryStore();
  const products = await store.listProducts();
  assert.equal(products.length, expected.length, 'commercial catalog must contain exactly four plans');
  for (const [plan, label, priceMinor, displayPrice] of expected) {
    const product = products.find(item => item.plan === plan);
    assert.ok(product, `${plan} must exist in the service catalog`);
    assert.equal(product.label, label);
    assert.equal(product.price_minor, priceMinor);
    assert.equal(product.metadata.display_price, displayPrice);
  }

  const schema = read('services/license-server/schema.sql');
  for (const [plan, label, priceMinor] of expected) {
    assert.match(schema, new RegExp(`'${plan}', 'counselor-desk', '${label}'[\\s\\S]{0,120}${priceMinor}, 'CNY'`), `${plan} schema price must stay aligned`);
  }

  const index = read('index.html');
  const customer = read('services/license-server/customer.html');
  const readme = read('README.md');
  assert.match(index, /学工智伴 v4\.9\.0/);
  assert.match(index, /四档授权：10 \/ 20 \/ 40 \/ 60 元/);
  assert.match(index, /前瞻体验用户可免费获得 20 元档/);
  assert.match(index, /Windsky0823/);
  assert.match(index, /意见采纳后免费赠送永久 AI 增强版/);
  assert.match(index, /当前不展示群二维码/);
  assert.doesNotMatch(index, /交流群 1/);
  assert.doesNotMatch(index, /交流群 2/);
  assert.doesNotMatch(index, /交流群 3/);
  assert.match(customer, /普通版 10 元/);
  assert.match(customer, /AI 增强版 40 元/);
  assert.match(customer, /永久 AI 增强版 60 元/);
  assert.match(customer, /前瞻体验用户权益/);
  assert.match(customer, /当前不展示群二维码/);
  assert.match(customer, /通过微信拉入对应微信群/);
  assert.doesNotMatch(customer, /交流群 1/);
  assert.doesNotMatch(customer, /交流群 2/);
  assert.doesNotMatch(customer, /交流群 3/);
  assert.match(customer, /受控的长期通用兑换码/);
  assert.match(customer, /公开购买仍按订单签发独立许可证/);
  assert.doesNotMatch(customer, /所有用户共用同一张许可证/);
  assert.match(readme, /product-manual-v4\.9\.0\.md/);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-product-catalog-'));
  const target = path.join(tempDir, 'license-config.cjs');
  try {
    const config = prepare({
      CWB_LICENSE_MODE: 'commercial',
      CWB_LICENSE_SERVICE_URL: 'https://license.example.test',
      CWB_LICENSE_PUBLIC_KEYS_JSON: JSON.stringify({ primary: 'public-key' }),
      CWB_UPDATE_FEED_URL: 'https://updates.example.test/feed',
      CWB_UPDATE_MANIFEST_URL: 'https://license.example.test/api/v1/updates/latest',
      CWB_PURCHASE_URL: 'https://shop.example.test/customer',
      CWB_DOWNLOAD_CENTER_URL: 'https://download.example.test/counselor-desk',
    }, target);
    assert.equal(config.purchase_url, 'https://shop.example.test/customer');
    assert.equal(config.download_center_url, 'https://download.example.test/counselor-desk');
    assert.throws(() => prepare({
      CWB_LICENSE_MODE: 'commercial',
      CWB_LICENSE_SERVICE_URL: 'https://license.example.test',
      CWB_LICENSE_PUBLIC_KEYS_JSON: JSON.stringify({ primary: 'public-key' }),
      CWB_UPDATE_FEED_URL: 'https://updates.example.test/feed',
      CWB_UPDATE_MANIFEST_URL: 'https://license.example.test/api/v1/updates/latest',
      CWB_PURCHASE_URL: 'http://shop.example.test/customer',
    }, target), /CWB_PURCHASE_URL.*HTTPS/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('PASS commercial-product-catalog');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
