/**
 * Real-browser smoke for the single-file offline release.
 *
 * HTTP route tests cannot catch missing inlined scripts, file-origin storage
 * behavior, or file://-specific runtime errors. This test intentionally opens
 * the generated offline artifact as a user would open it from disk.
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, requireBrowserExecutable } = require('../scripts/browser-runtime');

const root = path.join(__dirname, '..');
const artifact = path.join(root, 'output', 'v4-preview.html');
const viewports = [
  { name:'desktop-wide', width:1440, height:920 },
  { name:'desktop-medium', width:1024, height:768 },
  { name:'mobile-wide', width:390, height:844 },
  { name:'mobile-compact', width:360, height:800 },
];

function fileUrl(file) {
  return `file://${file.replace(/\\/g, '/').replace(/ /g, '%20')}`;
}

async function waitForRuntime(page) {
  await page.waitForFunction(() => Boolean(
    window.CWBV46Runtime &&
    window.CWBV46UI &&
    window.CWBV47UI &&
    window.CWBV48UI &&
    document.documentElement.dataset.v4Ready === 'true' &&
    document.querySelector('#nav-modules [data-view="class-checks"]')
  ), null, { timeout:30000 });
  await page.waitForTimeout(120);
}

async function closeBlockingModal(page) {
  await page.evaluate(() => {
    const close = document.querySelector('#modal-root .mask [data-close]');
    if (close) close.click();
  });
}

async function renderRoute(page, route) {
  await page.evaluate(view => window.CWBV46Runtime.go(view), route);
  await page.waitForFunction(view => Boolean(
    window.CWBV46Runtime &&
    window.CWBV46Runtime.app.view === view &&
    document.querySelector('#main') &&
    document.querySelector('#main').textContent.trim().length > 10
  ), route, { timeout:10000 });
  return page.evaluate(() => ({
    view:window.CWBV46Runtime.app.view,
    mainChildren:document.querySelector('#main')?.children.length || 0,
    scrollWidth:Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    innerWidth:window.innerWidth,
  }));
}

(async () => {
  if (!fs.existsSync(artifact)) {
    const built = spawnSync(process.execPath, ['scripts/build-release.js', artifact], { cwd:root, stdio:'inherit' });
    assert.equal(built.status, 0, 'offline artifact should be buildable before file-origin smoke');
  }
  assert.equal(fs.existsSync(artifact), true, `offline artifact is missing: ${artifact}`);
  const browser = await chromium.launch({ headless:true, executablePath:requireBrowserExecutable('BROWSER_FILE_SMOKE') });
  const allErrors = [];
  let routeCount = 0;
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport:{ width:viewport.width, height:viewport.height } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(`${viewport.name}: pageerror: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error') {
          const location = message.location()?.url || '';
          errors.push(`${viewport.name}: console: ${message.text()} ${location}`.trim());
        }
      });
      page.on('requestfailed', request => errors.push(`${viewport.name}: requestfailed: ${request.url()} ${request.failure()?.errorText || ''}`.trim()));
      await page.goto(fileUrl(artifact), { waitUntil:'domcontentloaded' });
      await waitForRuntime(page);
      await closeBlockingModal(page);

      const primaryRoutes = await page.locator('#sidenav .nav-item[data-view]').evaluateAll(items => [
        ...new Set(items.map(item => item.dataset.view).filter(Boolean)),
      ]);
      assert.ok(primaryRoutes.length >= 40, `${viewport.name}: expected primary routes in offline file`);

      if (viewport.width <= 900) {
        const menu = page.locator('#btn-menu');
        const drawer = page.locator('#sidenav');
        assert.equal(await menu.isEnabled(), true, `${viewport.name}: file menu should be enabled`);
        await menu.click();
        assert.equal(await drawer.evaluate(element => element.classList.contains('open')), true, `${viewport.name}: file drawer should open`);
        await page.keyboard.press('Escape');
        assert.equal(await drawer.evaluate(element => element.classList.contains('open')), false, `${viewport.name}: file Escape should close drawer`);
      }

      for (const route of primaryRoutes) {
        const result = await renderRoute(page, route);
        routeCount += 1;
        assert.equal(result.view, route, `${viewport.name}: offline route should remain ${route}`);
        assert.ok(result.mainChildren > 0, `${viewport.name}: offline ${route} should render a main view`);
        if (viewport.width <= 900) {
          assert.ok(result.scrollWidth <= result.innerWidth + 1, `${viewport.name}: offline ${route} must not overflow horizontally`);
        }
      }
      allErrors.push(...errors);
      await context.close();
    }
    assert.deepEqual(allErrors, [], `offline browser emitted runtime errors: ${allErrors.join(' | ')}`);
    console.log(`PASS browser-file-route-smoke (${routeCount} route renders x ${viewports.length} file viewports)`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
