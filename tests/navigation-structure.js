const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const page = path.join(__dirname, '..', 'index.html');

(async () => {
  const source = fs.readFileSync(page, 'utf8');
  assert.match(source, /\.sidenav\{[^}]*position:fixed/, 'desktop sidenav is fixed to the viewport');
  assert.match(source, /\.nav-modules\{[^}]*overflow-y:auto/, 'module list has its own vertical scroll region');
  assert.match(source, /function ensureActiveNavVisible\(/, 'active nav entry is brought into view after navigation');
  assert.match(source, /\.scrim\.open\{[^}]*pointer-events:auto/, 'the open mobile drawer scrim accepts taps to close the drawer');

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  const dom = await JSDOM.fromFile(page, {
    runScripts: 'dangerously', resources: 'usable', url: 'https://navigation.local/', pretendToBeVisual: true, virtualConsole,
  });
  await wait(760);
  try {
    const { window: w } = dom;
    const d = w.document;
    assert.deepEqual(errors, [], 'application starts without relevant errors');
    const nav = d.querySelector('#sidenav');
    assert.ok(nav.querySelector('#nav-fixed #nav-search'), 'module search remains in the fixed navigation area');
    assert.ok(nav.querySelector('#nav-fixed #nav-pinned'), 'pinned shortcuts remain in the fixed navigation area');
    const modules = nav.querySelector('#nav-modules');
    assert.ok(modules, 'all modules live in the independent scroll area');
    for (const view of ['party', 'orgs', 'grades', 'rewards', 'activities', 'stay']) {
      assert.ok(modules.querySelector(`[data-view="${view}"]`), `${view} is a direct visible navigation entry`);
    }
    w.CWB.go('party');
    await wait(20);
    assert.ok(modules.querySelector('[data-view="party"].on'), 'the independent party-development entry is reachable');
  } finally {
    dom.window.close();
  }
  console.log('PASS navigation-structure');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
