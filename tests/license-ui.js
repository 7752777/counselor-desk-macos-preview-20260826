const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'output', 'v4-preview.html'), 'utf8')
    .replace(/<script data-cwb-license-config>[\s\S]*?<\/script>/, `<script data-cwb-license-config>window.CWB_LICENSE_MODE='commercial';window.CWB_LICENSE_PUBLIC_KEYS={};window.CWB_LICENSE_SERVICE_URL='';</script>`);
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message)); });
  const dom = new JSDOM(source, { runScripts:'dangerously', resources:'usable', url:'https://license-ui.local/', pretendToBeVisual:true, virtualConsole, beforeParse(window) { window.cwbDesktop = {}; window.scrollTo = () => {}; } });
  await wait(900);
  const { window:w } = dom;
  assert.ok(w.CWB && w.CWB.entitlements, 'commercial entitlement runtime should be installed');
  assert.equal(w.CWB.entitlements.has('ai'), false);
  assert.equal(w.CWB.license.getState().status, 'unlicensed');
  const lockable = w.document.querySelectorAll('[data-act^="ai-"],[data-ai-student-summary],[data-ai-action]');
  assert.ok(lockable.length > 0, 'AI actions should exist in the rendered application');
  const lockedAction = [...lockable].find(item => item.classList.contains('cwb-ai-locked'));
  assert.ok(lockedAction, 'unlicensed AI actions should be visibly locked');
  assert.equal(lockedAction.getAttribute('aria-disabled'), 'true');
  assert.equal(lockedAction.dataset.cwbLicenseDisabled, 'true');
  assert.equal(lockedAction.getAttribute('tabindex'), '0', 'locked AI actions must remain keyboard reachable');
  assert.equal(lockedAction.disabled, false, 'native disabled must not hide the activation entry point');
  let activationOpens = 0;
  w.CWB.license.openActivation = () => { activationOpens += 1; };
  lockedAction.dispatchEvent(new w.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
  assert.equal(activationOpens, 1, 'Enter on a locked AI action should open activation');
  if (typeof w.go === 'function') {
    w.go('notice-ai');
    await wait(120);
    const noticeAction = w.document.querySelector('[data-act="v47-notice-ai"]');
    assert.ok(noticeAction, 'notice AI action should exist');
    assert.ok(noticeAction.classList.contains('cwb-ai-locked'), 'legacy-routed AI actions must use the same lock state');
    assert.equal(noticeAction.getAttribute('aria-disabled'), 'true');
  }
  await assert.rejects(() => w.CWB.ai.run({ purpose:'student_summary', provider:{ id:'locked-provider', enabled:true } }), error => error.code === 'LICENSE_REQUIRED');
  assert.throws(() => w.CWB.ai.sources.search({ query:'政策' }), error => error.code === 'LICENSE_REQUIRED');
  await assert.rejects(() => w.CWB.ai.sources.fetch({ url:'https://example.com/policy' }), error => error.code === 'LICENSE_REQUIRED');
  await assert.rejects(() => w.CWB.ai.notice.parse({ text:'请于明日提交材料' }), error => error.code === 'LICENSE_REQUIRED');
  await assert.rejects(() => w.CWB.ai.providers.test({ provider:{ id:'locked-provider', enabled:true } }), error => error.code === 'LICENSE_REQUIRED');
  await assert.rejects(() => w.CWB.ai.voice.transcribe({ audio:new w.Blob(['audio'], { type:'audio/webm' }) }), error => error.code === 'LICENSE_REQUIRED');
  assert.equal(w.document.querySelectorAll('.cwb-license-status')[0].textContent, '未激活');
  assert.match(w.document.body.textContent, /当前工作区未激活 AI 增强版许可证|激活 AI 授权/);
  assert.match(source, /ensureManagedRelayProvider/);
  assert.match(source, /自动选中开发者托管 AI/);
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS license-ui');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
