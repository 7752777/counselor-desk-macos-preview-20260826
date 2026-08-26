const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = path.join(__dirname, '..');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Could not load|Not implemented|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<script defer src="src/core/cwb-ai.js" data-cwb-ai></script>', '<script>' + fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai.js'), 'utf8') + '</script>')
    .replace('<script defer src="src/core/cwb-ai-workflow.js" data-cwb-ai-workflow></script>', '<script>' + fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai-workflow.js'), 'utf8') + '</script>');
  assert.match(html, /\.employment-resource-actions\{[^}]*flex-wrap:wrap/, 'employment actions should wrap on narrow cards');
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://external-url-safety.local/', pretendToBeVisual:true, virtualConsole });
  await wait(850);
  const { window: w } = dom;
  const safeExternalUrl = w.CWB.utils.safeExternalUrl;
  assert.equal(typeof safeExternalUrl, 'function', 'safe external URL helper should be exposed');
  assert.equal(safeExternalUrl('https://example.com/policy'), 'https://example.com/policy');
  assert.equal(safeExternalUrl('http://example.com/policy'), 'http://example.com/policy');
  assert.equal(safeExternalUrl('http://example.com/policy', { httpsOnly:true }), '');
  for (const value of ['javascript:alert(1)', 'data:text/html,unsafe', 'file:///C:/secret.txt', 'blob:https://example.com/id', '//example.com/policy', '/relative/policy', 'https://user:pass@example.com/policy']) {
    assert.equal(safeExternalUrl(value), '', `unsafe URL should be rejected: ${value}`);
  }
  assert.equal(safeExternalUrl('https://example.com/' + 'a'.repeat(2048)), '');
  assert.equal(safeExternalUrl('https://example.com/policy\nnext'), '');
  assert.equal(safeExternalUrl('https://example.com/policy', { httpsOnly:true }), 'https://example.com/policy');

  w.CWB.db.policy = [
    { id:'safe-policy-url', title:'安全政策链接', category:'规章制度', url:'https://example.com/policy' },
    { id:'unsafe-policy-url', title:'待核验政策链接', category:'规章制度', url:'javascript:alert(1)' },
  ];
  w.CWB.go('policy');
  await wait(40);
  const policySafeLink = w.document.querySelector('[data-policy-open]');
  assert.ok(policySafeLink, 'valid policy URL should render as a link');
  assert.equal(policySafeLink.getAttribute('href'), 'https://example.com/policy');
  const policyCard = [...w.document.querySelectorAll('.policy-resource-card')].find(item => item.textContent.includes('待核验政策链接'));
  assert.ok(policyCard, 'invalid policy card should remain visible for correction');
  assert.equal(policyCard.querySelector('[data-policy-open]'), null);
  assert.match(policyCard.textContent, /网址待核验/);

  w.CWB.db.custom.v4_employment_resources = [
    { id:'safe-employment-url', title:'安全就业链接', url:'https://example.com/jobs', category:'综合', region:'全国', status:'有效' },
    { id:'unsafe-employment-url', title:'待核验就业链接', url:'data:text/html,unsafe', category:'综合', region:'全国', status:'待核验' },
  ];
  w.CWB.go('graduate');
  await wait(40);
  w.document.querySelector('[data-workspace-tab="employment"]').click();
  await wait(40);
  const employmentSafeLink = [...w.document.querySelectorAll('[data-employment-resource]')]
    .find(item => item.textContent.includes('安全就业链接'))?.querySelector('a');
  assert.ok(employmentSafeLink, 'valid employment URL should render as a link');
  assert.equal(employmentSafeLink.getAttribute('href'), 'https://example.com/jobs');
  const employmentCard = [...w.document.querySelectorAll('[data-employment-resource]')]
    .find(item => item.textContent.includes('待核验就业链接'));
  assert.ok(employmentCard, 'invalid employment card should remain visible for correction');
  assert.equal(employmentCard.querySelector('a'), null);
  assert.match(employmentCard.textContent, /网址待核验/);
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS external-url-safety');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
