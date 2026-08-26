const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitFor(predicate, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(25);
  }
  return false;
}

(async () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(
    /<script\b([^>]*?)\bsrc="(src\/core\/[^"?]+)"([^>]*)><\/script>/gi,
    (tag, before, source, after) => `<script${before}${after}>${fs.readFileSync(path.join(root, source), 'utf8')}</script>`,
  );
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/Could not load script:.*(?:xlsx\.full\.min\.js|argon2-bundled\.min\.js|jszip\.min\.js|echarts\.min\.js|v8-(?:migration|persistence-protocol|workspace-runtime|backup-codec)\.js)/.test(error.message)) console.error(error);
  });
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://c.local/', pretendToBeVisual:true, virtualConsole });
  await wait(1000);
  const cwb = dom.window.CWB;
  assert.ok(cwb && cwb.welcome, 'welcome API should exist');
  assert.ok(cwb.db.settings.welcome_experience, 'welcome preferences should be initialized');

  const setup = dom.window.document.querySelector('#modal-root .modal');
  assert.match(setup.textContent, /欢迎使用学工智伴/);
  assert.match(setup.textContent, /留下喜欢的称呼，选一套顺眼的颜色/);
  assert.ok(setup.querySelector('.welcome-setup-visual img[src*="welcome-education-scene-v2.png"]'), 'setup should show the approved illustration');
  assert.equal(setup.querySelectorAll('[data-welcome-preset]').length, 5, 'setup should offer five theme presets');
  assert.doesNotMatch(setup.textContent, /GOOD MORNING|以后每次打开|隐私说明/i);

  // Freeze the first-open day before setup persists it. The same clock is then
  // used to prove that a non-forced same-day refresh remains suppressed.
  dom.window.__CWB_WELCOME_NOW__ = () => new Date('2026-08-13T08:00:00');
  setup.querySelector('#welcome-name').value = '张三';
  setup.querySelector('#welcome-address').value = '张老师';
  setup.querySelector('#welcome-college').value = '学生工作部';
  dom.window.__CWB_LAST_SAVE_PROMISE__ = null;
  setup.querySelector('[data-welcome-save]').click();
  assert.equal(await waitFor(() => dom.window.__CWB_LAST_SAVE_PROMISE__ && typeof dom.window.__CWB_LAST_SAVE_PROMISE__.then === 'function'), true, 'welcome settings should expose a real save promise');
  await dom.window.__CWB_LAST_SAVE_PROMISE__;
  assert.equal(await cwb.welcome.showDaily(true), true, 'daily greeting should render after welcome settings persist');
  assert.equal(await waitFor(() => {
    const inline = dom.window.document.querySelector('[data-welcome-inline]');
    return !!inline && /张老师/.test(inline.textContent || '');
  }), true, 'daily greeting should appear as a home inline notice');
  const daily = dom.window.document.querySelector('[data-welcome-inline]');
  assert.match(daily.textContent, /张老师/);
  assert.doesNotMatch(daily.textContent, /Chinese Text Project|UNESCO|https?:\/\//i);
  assert.equal(daily.querySelector('a'), null, 'daily quote must not render a source hyperlink');
  assert.ok(daily.querySelector('img.welcome-quote-scene[src*="welcome-morning.png"]'), 'daily quote should use the bundled warm reading-scene image');
  assert.ok(daily.querySelector('.welcome-quote-copy'), 'daily quote should keep its text above the image treatment');
  assert.equal(cwb.db.settings.counselor_name, '张三');
  assert.equal(cwb.db.settings.welcome_experience.addressed_as, '张老师');

  const periods = [
    ['2026-08-13T08:00:00', 'morning', /早上好/],
    ['2026-08-13T12:00:00', 'noon', /中午好/],
    ['2026-08-13T16:00:00', 'afternoon', /下午好/],
    ['2026-08-13T20:00:00', 'evening', /晚上好/],
    ['2026-08-13T02:00:00', 'late', /欢迎回来/]
  ];
  for (const [value, period, expected] of periods) {
    dom.window.__CWB_WELCOME_NOW__ = () => new Date(value);
    assert.equal(cwb.welcome.getGreetingPeriod(), period);
    assert.match(cwb.welcome.getGreetingText(period, 0), expected);
  }

  daily.querySelector('[data-act="welcome-daily-dismiss"]').click();
  assert.equal(await cwb.welcome.showDaily(false), false, 'same-day refresh should not repeat automatically');
  console.log('PASS welcome-experience');
})().catch(error => { console.error(error); process.exitCode = 1; });
