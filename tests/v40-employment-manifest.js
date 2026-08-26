const assert = require('node:assert/strict');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');

(async () => {
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'output', 'v4-preview.html'), { runScripts:'dangerously', resources:'usable', url:'https://c.local/', virtualConsole:new VirtualConsole(), pretendToBeVisual:true, beforeParse(window) { Object.defineProperty(window, 'crypto', { value:webcrypto, configurable:true }); window.TextEncoder = TextEncoder; window.TextDecoder = TextDecoder; } });
  await new Promise(resolve => setTimeout(resolve, 500));
  const provider = dom.window.CWB.employmentResourceProvider;
  await provider.add({ id:'field-roundtrip', title:'字段往返资源', url:'https://example.com/roundtrip', category:'测试分类', region:'全国', audience:'毕业生', source:'测试来源', tags:'字段,往返', favorite:true, status:'待核验' });
  const manifest = await provider.exportManifest();
  for (const key of ['manifest_version', 'resources', 'key_id', 'algorithm', 'public_key', 'signature', 'created_at']) assert.ok(Object.hasOwn(manifest, key), key);
  assert.equal(manifest.algorithm, 'ECDSA-P256-SHA256');
  assert.ok(manifest.public_key.length > 0 && manifest.signature.length > 0);
  const roundtrip = manifest.resources.find(item => item.id === 'field-roundtrip');
  assert.equal(roundtrip.category, '测试分类');
  assert.equal(roundtrip.audience, '毕业生');
  assert.equal(roundtrip.source, '测试来源');
  assert.equal(roundtrip.tags, '字段,往返');
  assert.equal(roundtrip.favorite, true);
  assert.equal(await provider.importManifest(manifest), manifest.resources.length);
  const tampered = JSON.parse(JSON.stringify(manifest)); tampered.resources = [{ id:'tampered', title:'篡改', url:'https://example.com' }];
  await assert.rejects(() => provider.importManifest(tampered), /SIGNATURE/);
  const unsignedDigest = JSON.parse(JSON.stringify(manifest)); unsignedDigest.algorithm = 'SHA-256-DIGEST';
  await assert.rejects(() => provider.importManifest(unsignedDigest), /ALGORITHM|SIGNATURE/);
  dom.window.close();
  console.log('PASS v40-employment-manifest');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
