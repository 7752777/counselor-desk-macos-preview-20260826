const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, requireBrowserExecutable } = require('../scripts/browser-runtime');

const ROOT = path.resolve(__dirname, '..');
const CANONICAL = ['orgs', 'party', 'rewards', 'activities', 'grades', 'worklogs'];
const NEW_COLLECTIONS = [
  'v4_ai_sources', 'v4_ai_suggestions', 'v4_ai_consents',
  'v4_sync_devices', 'v4_sync_outbox', 'v4_sync_conflicts', 'v4_sync_revisions',
  'v4_backup_runs', 'v4_content_pushes', 'v4_content_reads',
];

function contentType(file) {
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  return 'text/html; charset=utf-8';
}

function createServer() {
  return http.createServer((request, response) => {
    const requestPath = decodeURIComponent(String(request.url || '/').split('?')[0]);
    if (requestPath === '/idb-v5.html') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end('<!doctype html><title>IDB migration fixture</title>');
      return;
    }
    const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
}

(async () => {
  const executablePath = requireBrowserExecutable('V8_CANONICAL_IDB');
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ headless:true, executablePath });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const url = `http://127.0.0.1:${port}/`;
    const legacyPage = await context.newPage();
    await legacyPage.goto(`http://127.0.0.1:${port}/idb-v5.html`, { waitUntil:'domcontentloaded' });
    await legacyPage.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('counselor_desk_v4', 5);
      request.onupgradeneeded = () => {
        const database = request.result;
        ['records_students', 'records_tasks'].forEach(name => {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath:'id' });
        });
        request.transaction.objectStore('records_students').put({ id:'legacy-v5-student', student_number:'LEGACY-V5', full_name:'旧版本学生' });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error || new Error('LEGACY_IDB_CREATE_FAILED'));
    }));
    await legacyPage.addScriptTag({ path:path.join(ROOT, 'src', 'core', 'cwb-collections.js') });
    await legacyPage.addScriptTag({ path:path.join(ROOT, 'src', 'core', 'v4-runtime.js') });
    const legacyProbe = await legacyPage.evaluate(async () => {
      const repository = window.CWB_V4.createRepository('records_students');
      const legacyStudent = await repository.get('legacy-v5-student');
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('counselor_desk_v4');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IDB_REOPEN_FAILED'));
      });
      const stores = [...database.objectStoreNames];
      database.close();
      return { legacyStudent, stores };
    });
    await legacyPage.close();
    await page.goto(url, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.v8Ready === 'true');
    const written = await page.evaluate(async canonical => {
      const expected = {};
      for (const [index, key] of canonical.entries()) {
        const row = { id:`idb-${key}`, title:`${key} record`, student_number:`2024${index}` };
        await window.CWB.repositories[key].put(row);
        expected[key] = row;
      }
      await window.CWB.workspace.flush();
      return expected;
    }, CANONICAL);
    const atomicReplace = await page.evaluate(async () => {
      const rows = Array.from({ length:1200 }, (_, index) => ({
        id:`atomic-student-${index}`,
        student_number:`ATOMIC-${index}`,
        full_name:`Atomic Student ${index}`,
      }));
      await window.CWB.repositories.students.putMany(rows, { normalized:true, render:false });
      return rows.length;
    });
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.v8Ready === 'true');
    const result = await page.evaluate(async canonical => {
      const repositories = {};
      for (const key of canonical) repositories[key] = await window.CWB.repositories[key].get(`idb-${key}`);
      const stores = await new Promise((resolve, reject) => {
        const request = indexedDB.open('counselor_desk_v4');
        request.onsuccess = () => { const database = request.result; const names = [...database.objectStoreNames]; database.close(); resolve(names); };
        request.onerror = () => reject(request.error);
      });
      const atomicStorageRows = await new Promise((resolve, reject) => {
        const request = indexedDB.open('counselor_desk_v4');
        request.onerror = () => reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
        request.onsuccess = () => {
          const database = request.result;
          const read = database.transaction('records_students', 'readonly').objectStore('records_students').getAll();
          read.onsuccess = () => { database.close(); resolve(read.result || []); };
          read.onerror = () => { database.close(); reject(read.error || new Error('INDEXEDDB_READ_FAILED')); };
        };
      });
      const atomicRows = await window.CWB.repositories.students.list();
      return { repositories, stores, atomicStorageRows, atomicRows };
    }, CANONICAL);
    for (const key of CANONICAL) {
      assert.equal(result.repositories[key].id, written[key].id, `${key} must survive a real IndexedDB restart`);
      assert.ok(result.stores.includes(`records_${key}`), `records_${key} must exist in the shared IndexedDB schema`);
    }
    for (const key of NEW_COLLECTIONS) {
      assert.ok(result.stores.includes(`records_custom_${key}`), `records_custom_${key} must be created when an existing browser workspace upgrades`);
    }
    assert.equal(legacyProbe.legacyStudent.student_number, 'LEGACY-V5', 'v5 student data must survive the physical IndexedDB upgrade');
    for (const key of NEW_COLLECTIONS) {
      assert.ok(legacyProbe.stores.includes(`records_custom_${key}`), `physical v5 to v6 upgrade must create records_custom_${key}`);
    }
    assert.equal(atomicReplace, 1200, 'atomic replacement writes its full request chain');
    assert.equal(result.atomicStorageRows.length, 1, 'large replacement uses one atomic IndexedDB payload');
    assert.equal(result.atomicStorageRows[0].id, '__cwb_bulk_students__', 'atomic payload keeps its stable storage key');
    assert.equal(result.atomicRows.length, 1200, 'atomic replacement survives a real IndexedDB reopen through the repository contract');
    assert.equal(result.atomicRows[0].student_number, 'ATOMIC-0', 'atomic replacement keeps the first row');
    assert.equal(result.atomicRows.some(row => row.student_number === 'ATOMIC-1199'), true, 'atomic replacement keeps the final row');
    assert.deepEqual(errors, [], 'canonical collection persistence must not emit page errors');
    console.log('PASS v8-canonical-idb-browser');
  } finally {
    await context.close();
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
