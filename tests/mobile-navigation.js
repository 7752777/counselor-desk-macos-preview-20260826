const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const page = path.join(__dirname, '..', 'index.html');
const htmlSource = fs.readFileSync(page, 'utf8');
assert.match(htmlSource, /\.layout\{padding-left:0;z-index:auto\}/, 'mobile layout must not trap the drawer below the scrim');
assert.match(htmlSource, /\.mcard-copy\{[^}]*overflow-wrap:anywhere/, 'mobile record cards must keep long summaries readable');

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Could not load|Not implemented|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  const dom = await JSDOM.fromFile(page, {
    runScripts:'dangerously', resources:'usable', url:'https://mobile-navigation.local/', pretendToBeVisual:true, virtualConsole,
    beforeParse(window) { Object.defineProperty(window, 'innerWidth', { value:390, configurable:true }); },
  });
  await wait(820);
  const { window: w } = dom;
  const d = w.document;
  assert.equal(d.querySelector('#modal-root').children.length, 0, 'mobile welcome experience must not open a blocking modal');
  await w.CWB.welcome.reset();
  assert.equal(await w.CWB.welcome.showDaily(true), false, 'mobile daily greeting must not open a blocking modal');
  assert.equal(d.querySelector('#modal-root').children.length, 0, 'manual mobile daily greeting must remain non-blocking');
  const menu = d.querySelector('#btn-menu');
  const nav = d.querySelector('#sidenav');
  assert.equal(nav.getAttribute('role'), 'dialog', 'mobile navigation drawer should expose a dialog role');
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  menu.click();
  assert.equal(nav.classList.contains('open'), true);
  assert.equal(menu.getAttribute('aria-expanded'), 'true');
  assert.equal(nav.getAttribute('aria-hidden'), 'false');
  assert.equal(nav.getAttribute('aria-modal'), 'true');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
  assert.equal(nav.classList.contains('open'), false);
  assert.equal(menu.getAttribute('aria-expanded'), 'false');
  assert.equal(nav.getAttribute('aria-modal'), 'false');
  const group = d.querySelector('[data-fold="资料与平台"]');
  if (typeof group.matches !== 'function') Object.defineProperty(group, 'matches', { configurable:true, value:selector => w.Element.prototype.matches.call(group, selector) });
  group.dispatchEvent(new w.MouseEvent('click', { bubbles:true }));
  const search = d.querySelector('#nav-search');
  search.value = 'AI 智能工作台';
  search.dispatchEvent(new w.Event('input', { bubbles:true }));
  assert.equal(d.querySelector('[data-view="ai"]').style.display, '');
  assert.notEqual(nav.querySelector('[data-view="ai"]').style.display, 'none');
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS mobile-navigation');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
