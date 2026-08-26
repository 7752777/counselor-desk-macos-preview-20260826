const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('../scripts/browser-runtime');

const root = path.join(__dirname, '..');
const electron = process.platform === 'win32'
  ? path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
  : path.join(root, 'node_modules', 'electron', 'dist', 'Electron');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForDevtools(port, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('ELECTRON_DEVTOOLS_TIMEOUT');
}

async function stopElectron(child) {
  if (!child || child.exitCode != null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio:'ignore' });
  else child.kill('SIGTERM');
  await new Promise(resolve => {
    if (child.exitCode != null) return resolve();
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

(async () => {
  assert.ok(fs.existsSync(electron), 'desktop Electron binary is installed');
  const testTempRoot = fs.mkdtempSync(path.join(root, '.tmp-electron-cards-root-'));
  const userData = fs.mkdtempSync(path.join(testTempRoot, 'user-data-'));
  const port = await freePort();
  let child;
  let browser;
  let output = '';
  let passed = false;
  try {
    child = spawn(electron, ['--no-sandbox', `--remote-debugging-port=${port}`, 'desktop'], {
      cwd:root,
      env:Object.assign({}, process.env, { CWB_DESKTOP_USER_DATA:userData }),
      windowsHide:true,
      stdio:['ignore','pipe','pipe'],
    });
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { output += String(chunk); });
    await waitForDevtools(port);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    const deadline = Date.now() + 30000;
    let page = context.pages().find(item => item.url().startsWith('file:'));
    while (!page && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      page = context.pages().find(item => item.url().startsWith('file:'));
    }
    assert.ok(page, 'Electron should expose the local workbench page');
    await page.waitForFunction(() => Boolean(window.CWBV46Runtime && window.desktopRepositoryReady === true), null, { timeout:30000 });
    await page.evaluate(() => {
      const runtime = window.CWBV46Runtime;
      runtime.DB.students = [
        { id:'desktop-card-1', student_number:'D-001', full_name:'桌面卡片甲', gender:'男', class_name:'桌面测试一班', dorm:'3号楼 412', advisor_name:'导师甲', homeroom_teacher_name:'班主任甲', parent_relation:'母亲', photo_assets:[{ id:'desktop-card-photo-1', data_url:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' }] },
        { id:'desktop-card-2', student_number:'D-002', full_name:'桌面卡片乙', gender:'女', class_name:'桌面测试一班', dorm:'3号楼 413', advisor_name:'导师乙', homeroom_teacher_name:'班主任乙', parent_relation:'父亲' },
        { id:'desktop-card-3', student_number:'D-003', full_name:'桌面卡片丙', gender:'男', class_name:'桌面测试二班', dorm:'4号楼 201', advisor_name:'导师丙', homeroom_teacher_name:'班主任丙', parent_relation:'监护人' },
      ];
      runtime.save('students');
      runtime.app.filters.students = Object.assign({}, runtime.app.filters.students, { q:'', cls:'', ids:[], mode:'table', page:1, pageSize:20 });
      runtime.go('students');
    });
    await page.waitForSelector('[data-student-layout="table"]');
    await page.evaluate(() => window.CWBV46Runtime.ACTS['students-mode-cards']());
    await page.waitForSelector('[data-student-layout="cards"] .mcard');
    const rendered = await page.locator('[data-student-layout="cards"]').evaluate(rootElement => ({
      display:getComputedStyle(rootElement).display,
      contentVisibility:getComputedStyle(rootElement).contentVisibility,
      count:rootElement.querySelectorAll('.mcard').length,
      text:rootElement.textContent,
    }));
    assert.notEqual(rendered.display, 'none', 'Electron card mode must be visible');
    assert.equal(rendered.count, 3, 'Electron card mode must render all three students');
    assert.match(rendered.text, /3号楼 412/);
    assert.match(rendered.text, /导师甲/);
    assert.match(rendered.text, /班主任甲/);
    assert.match(rendered.text, /家长关系 母亲/);
    assert.notEqual(rendered.contentVisibility, 'hidden', 'Electron card container must not be hidden by content-visibility');
    await page.waitForTimeout(900);
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.CWBV46Runtime && window.desktopRepositoryReady === true), null, { timeout:30000 });
    await page.waitForSelector('[data-student-layout="cards"] .mcard');
    assert.equal(await page.locator('[data-student-layout="cards"] .mcard').count(), 3, 'Electron must restore card mode after reload');
    passed = true;
    console.log('PASS desktop-student-card-mode');
  } catch (error) {
    if (output) process.stderr.write(output.slice(-4000));
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopElectron(child);
    fs.rmSync(testTempRoot, { recursive:true, force:true, maxRetries:10, retryDelay:200 });
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
