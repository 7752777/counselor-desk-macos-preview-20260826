const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('node:path');

const page = path.join(__dirname, '..', 'index.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openWithoutV8() {
  const source = readFileSync(page, 'utf8')
    .replace(/<script defer src="src\/core\/v8-[^"]+"[^>]*><\/script>\s*/g, '');
  const dom = new JSDOM(source, {
    url:`file:///${page.replace(/\\/g, '/')}`,
    runScripts:'dangerously', resources:'usable', pretendToBeVisual:true,
    virtualConsole:new VirtualConsole(),
    beforeParse(window) {
      Object.defineProperty(window, 'crypto', { value:webcrypto });
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
    },
  });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (dom.window.CWB && !dom.window.CWB.workspace) return dom;
    await wait(25);
  }
  dom.window.close();
  throw new Error('fallback application startup timed out');
}

(async () => {
  const dom = await openWithoutV8();
  try {
    const { window } = dom;
    window.CWB.db.tasks = [{ id:'fallback-current-task', title:'Current task must survive' }];
    const unsafe = {
      package:'counselor-desk', package_version:8,
      tasks:[{ id:'fallback-incoming-task', title:'Incoming task must not leak' }],
      attachments:[{ id:'fallback-attachment', data_base64:'AA==' }],
    };
    await assert.rejects(() => window.CWB.importExchangePackage(unsafe, 'replace'), /V8_WORKSPACE_REQUIRED/);
    assert.equal(window.CWB.db.tasks.find(row => row.id === 'fallback-current-task')?.title, 'Current task must survive');
    assert.equal(window.CWB.db.tasks.some(row => row.id === 'fallback-incoming-task'), false);
    const legacy = {
      package:'counselor-desk', package_version:7,
      tasks:[{ id:'fallback-legacy-task', title:'Legacy JSON recovery remains available' }],
    };
    const applied = await window.CWB.importExchangePackage(legacy, 'replace');
    assert.equal(applied.tasks, 1);
    assert.equal(window.CWB.db.tasks.find(row => row.id === 'fallback-legacy-task')?.title, 'Legacy JSON recovery remains available');
    console.log('PASS exchange-fallback-safety');
  } finally {
    dom.window.close();
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
