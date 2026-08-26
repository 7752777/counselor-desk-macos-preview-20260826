/**
 * Real-browser navigation smoke for the published web surface.
 *
 * The test deliberately uses the same navigation registry that users see and
 * renders every primary route at the release acceptance viewports. It catches
 * broken deferred UI registration, route-level exceptions, and mobile layout
 * overflow without turning normal development into a screenshot comparison.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { chromium, requireBrowserExecutable } = require('../scripts/browser-runtime');

const root = require('node:path').join(__dirname, '..');
const viewports = [
  { name:'desktop-wide', width:1440, height:920 },
  { name:'desktop-compact', width:1280, height:800 },
  { name:'desktop-medium', width:1024, height:768 },
  { name:'mobile-wide', width:390, height:844 },
  { name:'mobile-compact', width:360, height:800 },
];
const secondaryRoutes = ['class-analysis', 'worklog-drafts', 'v48-sync', 'student-fields', 'class-history', 'content-push', 'work-categories', 'form-center', 'recovery'];

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(port, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('BROWSER_SMOKE_SERVER_TIMEOUT');
}

async function stopProcess(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio:'ignore' });
  else child.kill('SIGTERM');
  await new Promise(resolve => {
    if (child.exitCode != null) return resolve();
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
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
  return page.evaluate(() => {
    const main = document.querySelector('#main');
    const body = document.body;
    return {
      view:window.CWBV46Runtime.app.view,
      mainTextLength:main ? main.textContent.trim().length : 0,
      mainChildren:main ? main.children.length : 0,
      scrollWidth:Math.max(document.documentElement.scrollWidth, body.scrollWidth),
      innerWidth:window.innerWidth,
    };
  });
}

(async () => {
  const executablePath = requireBrowserExecutable('BROWSER_SMOKE');
  const port = await freePort();
  const server = spawn(process.execPath, ['scripts/serve-web.js'], {
    cwd:root,
    env:Object.assign({}, process.env, { PORT:String(port), HOST:'127.0.0.1' }),
    windowsHide:true,
    stdio:'ignore',
  });
  let browser;
  const allErrors = [];
  try {
    await waitForServer(port);
    browser = await chromium.launch({ headless:true, executablePath });
    let primaryRoutes = [];

    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport:{ width:viewport.width, height:viewport.height } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(`${viewport.name}: pageerror: ${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error') errors.push(`${viewport.name}: console: ${message.text()}`);
      });
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil:'domcontentloaded' });
      await waitForRuntime(page);
      await closeBlockingModal(page);

      if (!primaryRoutes.length) {
        primaryRoutes = await page.locator('#sidenav .nav-item[data-view]').evaluateAll(items => [...new Set(items.map(item => item.dataset.view).filter(Boolean))]);
        assert.ok(primaryRoutes.length >= 40, `navigation should expose the primary product modules (got ${primaryRoutes.length})`);
      }

      if (viewport.width <= 900) {
        const drawer = page.locator('#sidenav');
        const menu = page.locator('#btn-menu');
        assert.equal(await menu.isEnabled(), true, `${viewport.name}: mobile menu should be enabled`);
        await menu.click();
        assert.equal(await drawer.evaluate(element => element.classList.contains('open')), true, `${viewport.name}: drawer should open`);
        assert.equal(await menu.getAttribute('aria-expanded'), 'true', `${viewport.name}: menu should expose expanded state`);
        await page.keyboard.press('Escape');
        assert.equal(await drawer.evaluate(element => element.classList.contains('open')), false, `${viewport.name}: Escape should close drawer`);
      }

      for (const route of primaryRoutes) {
        const result = await renderRoute(page, route);
        assert.equal(result.view, route, `${viewport.name}: route should remain ${route}`);
        assert.ok(result.mainChildren > 0, `${viewport.name}: ${route} should render a main view`);
        if (viewport.width <= 900) {
          assert.ok(result.scrollWidth <= result.innerWidth + 1, `${viewport.name}: ${route} must not overflow horizontally (${result.scrollWidth} > ${result.innerWidth})`);
        }
      }

      if (viewport.width === 1440) {
        const availableSecondaryRoutes = await page.evaluate(routes => routes.filter(route => typeof window.CWBV46Runtime.VIEWS[route] === 'function'), secondaryRoutes);
        for (const route of availableSecondaryRoutes) {
          const result = await renderRoute(page, route);
          assert.equal(result.view, route, `secondary route should remain ${route}`);
          assert.ok(result.mainChildren > 0, `${route} should render a main view`);
        }
      }

      allErrors.push(...errors);
      await context.close();
    }

    assert.deepEqual(allErrors, [], `browser navigation emitted runtime errors: ${allErrors.join(' | ')}`);
    console.log(`PASS browser-route-smoke (${primaryRoutes.length} primary routes x ${viewports.length} viewports)`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopProcess(server);
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
