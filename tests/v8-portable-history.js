const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, requireBrowserExecutable } = require('../scripts/browser-runtime');

(async () => {
  const executablePath = requireBrowserExecutable('V8_PORTABLE_HISTORY');
  const browser = await chromium.launch({ headless:true, executablePath });
  const page = await browser.newPage();
  let portableDir;
  try {
    await page.goto(`file://${path.resolve('output/v4-preview.html').replace(/\\/g, '/')}`, { waitUntil:'domcontentloaded', timeout:60000 });
    await page.waitForFunction(() => document.documentElement.dataset.v8Ready === 'true');
    const result = await page.evaluate(async () => {
      await window.CWB.workspace.mutate({
        type:'portable.history.create', collection:'tasks', operation:'upsert', actor:'portable-test',
        record:{ id:'portable-v8-history-task', title:'Portable workspace history' },
      });
      await window.CWB.workspace.mutate({
        type:'portable.canonical.create', collection:'orgs', operation:'upsert', actor:'portable-test',
        record:{ id:'portable-v8-history-org', position:'班长', student_name:'Portable member' },
      });
      await window.CWB.workspace.checkpoint({ reason:'portable-history' });
      const portable = await window.CWB.buildPortableHtml();
      const match = portable.html.match(/window\.__CWB_EMBED__=([\s\S]*?)<\/script>/);
      const embedded = JSON.parse(match[1]);
      return {
        workspace:embedded.workspace,
        orgs:embedded.orgs,
        attachments:embedded.attachments,
        html:portable.html,
      };
    });
    assert.equal(Number(result.workspace.schemaVersion), 8, 'portable HTML must publish schema v8 workspace data');
    assert.ok(result.workspace.state.tasks.some(row => row.id === 'portable-v8-history-task'), 'portable HTML must retain workspace task state');
    assert.ok(result.workspace.history.some(entry => entry.recordId === 'portable-v8-history-task'), 'portable HTML must retain workspace record history');
    assert.ok(result.workspace.recoveryPoints.length >= 1, 'portable HTML must retain migration/recovery points');
    assert.ok(Array.isArray(result.orgs), 'portable HTML must include canonical business collection mirrors');
    assert.ok(result.orgs.some(row => row.id === 'portable-v8-history-org'), 'portable HTML must mirror canonical business records');
    assert.ok(Array.isArray(result.attachments), 'portable HTML must include attachment payloads');
    portableDir = fs.mkdtempSync(path.join(path.resolve('output'), 'cwb-v8-portable-'));
    const portableFile = path.join(portableDir, 'counselor-desk-portable.html');
    fs.writeFileSync(portableFile, result.html, 'utf8');
    const portableContext = await browser.newContext();
    const liveFilePage = await portableContext.newPage();
    await liveFilePage.goto(`file://${path.resolve('output/v4-preview.html').replace(/\\/g, '/')}`, { waitUntil:'domcontentloaded', timeout:60000 });
    await liveFilePage.waitForFunction(() => document.documentElement.dataset.v8Ready === 'true' && window.CWB && window.CWB.workspace);
    const normalMarkers = await liveFilePage.evaluate(async () => {
      const importJob = { id:'normal-file-import-job', collection:'students', status:'cancelled', schema_version:8, updated_at:new Date().toISOString() };
      await window.CWB.workspace.mutate({
        type:'portable.file-origin.live', collection:'tasks', operation:'upsert', actor:'portable-test',
        record:{ id:'portable-live-file-origin-task', title:'Must not leak into portable snapshot' },
      });
      await window.CWB.repositories.students.put({ id:'normal-file-student', student_number:'NORMAL-FILE-001', full_name:'Normal file student' });
      await window.CWB.repositories.orgs.put({ id:'normal-file-org', position:'Normal file organization', student_name:'Normal member' });
      await window.CWB.repositories.testSnapshots.put({ id:'normal-file-custom', name:'Normal custom repository', payload:{} });
      await window.CWB.repositories.meta.put({ id:'normal-file-meta', kind:'portable-isolation' });
      await window.CWB.audit.log('normal_file_audit', { marker:'normal-file-audit' });
      await window.CWB.attachments.add({ id:'normal-file-attachment', student_id:'normal-file-student', name:'normal-file.txt', blob:new Blob(['normal-file-attachment'], { type:'text/plain' }) });
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('counselor_desk_v4');
        request.onerror = () => reject(request.error || new Error('NORMAL_IMPORT_DB_OPEN_FAILED'));
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('import_jobs', 'readwrite');
          transaction.objectStore('import_jobs').put(importJob);
          transaction.oncomplete = () => { database.close(); resolve(); };
          transaction.onerror = () => { database.close(); reject(transaction.error || new Error('NORMAL_IMPORT_DB_WRITE_FAILED')); };
        };
      });
      await window.CWB.workspace.flush({ type:'portable-isolation-normal-flush', actor:'portable-test' });
      return {
        student:await window.CWB.repositories.students.get('normal-file-student'),
        org:await window.CWB.repositories.orgs.get('normal-file-org'),
        custom:await window.CWB.repositories.testSnapshots.get('normal-file-custom'),
        meta:await window.CWB.repositories.meta.get('normal-file-meta'),
        audit:(await window.CWB.audit.list()).find(row => row.details && row.details.marker === 'normal-file-audit'),
        attachment:await window.CWB.attachments.get('normal-file-attachment'),
        import:(await window.CWB.importer.listJobs()).find(row => row.id === 'normal-file-import-job'),
      };
    });
    assert.ok(normalMarkers.student, 'normal file page must persist a collection record before portable isolation is checked');
    assert.ok(normalMarkers.org, 'normal file page must persist a canonical collection record before portable isolation is checked');
    assert.ok(normalMarkers.custom, 'normal file page must persist a custom collection record before portable isolation is checked');
    assert.ok(normalMarkers.meta, 'normal file page must persist metadata before portable isolation is checked');
    assert.ok(normalMarkers.audit, 'normal file page must persist an audit record before portable isolation is checked');
    assert.ok(normalMarkers.attachment, 'normal file page must persist an attachment before portable isolation is checked');
    assert.ok(normalMarkers.import, 'normal file page must persist an import checkpoint before portable isolation is checked');
    const portablePage = await portableContext.newPage();
    await portablePage.addInitScript(() => {
      const open = indexedDB.open.bind(indexedDB);
      window.__cwbPortableIndexedDbOpens = [];
      indexedDB.open = function trackedOpen(name) {
        window.__cwbPortableIndexedDbOpens.push(String(name));
        return open.apply(indexedDB, arguments);
      };
    });
    try {
      await portablePage.goto(`file://${portableFile.replace(/\\/g, '/')}`, { waitUntil:'domcontentloaded', timeout:60000 });
      await portablePage.waitForFunction(() => document.documentElement.dataset.v8Ready === 'true' && window.CWB && window.CWB.workspace);
      const restored = await portablePage.evaluate(async () => {
        const workspace = window.CWB.workspace.exportEmergencyBackup();
        return {
          task:window.CWB.db.tasks.find(row => row.id === 'portable-v8-history-task'),
          canonical:window.CWB.db.orgs.find(row => row.id === 'portable-v8-history-org'),
          stateTask:workspace.state.tasks.find(row => row.id === 'portable-v8-history-task'),
          history:workspace.history.filter(entry => entry.recordId === 'portable-v8-history-task'),
          recoveryPoints:workspace.recoveryPoints.length,
          leakedTask:window.CWB.db.tasks.find(row => row.id === 'portable-live-file-origin-task'),
          normalStudent:await window.CWB.repositories.students.get('normal-file-student'),
          normalOrg:await window.CWB.repositories.orgs.get('normal-file-org'),
          normalCustom:await window.CWB.repositories.testSnapshots.get('normal-file-custom'),
          normalMeta:await window.CWB.repositories.meta.get('normal-file-meta'),
          normalAudit:(await window.CWB.audit.list()).find(row => row.details && row.details.marker === 'normal-file-audit'),
          normalAttachment:await window.CWB.attachments.get('normal-file-attachment'),
          normalImport:(await window.CWB.importer.listJobs()).find(row => row.id === 'normal-file-import-job'),
          indexedDbOpens:window.__cwbPortableIndexedDbOpens.slice(),
        };
      });
      assert.equal(restored.task && restored.task.title, 'Portable workspace history', 'portable HTML must restore the task into the live DB');
      assert.equal(restored.stateTask && restored.stateTask.title, 'Portable workspace history', 'portable HTML must restore the task into workspace state');
      assert.equal(restored.canonical && restored.canonical.position, '班长', 'portable HTML must restore canonical business records into the live DB');
      assert.ok(restored.history.length >= 1, 'portable HTML must restore record history into the active workspace');
      assert.ok(restored.recoveryPoints >= 1, 'portable HTML must restore recovery points into the active workspace');
      assert.equal(restored.leakedTask, undefined, 'portable HTML must ignore pre-existing file-origin workspace data');
      assert.equal(restored.normalStudent == null, true, 'portable HTML must not read normal file collection repositories');
      assert.equal(restored.normalOrg == null, true, 'portable HTML must not read normal file canonical repositories');
      assert.equal(restored.normalCustom == null, true, 'portable HTML must not read normal file custom repositories');
      assert.equal(restored.normalMeta == null, true, 'portable HTML must not read normal file metadata repositories');
      assert.equal(restored.normalAudit, undefined, 'portable HTML must not read normal file audit repositories');
      assert.equal(restored.normalAttachment == null, true, 'portable HTML must not read normal file attachment repositories');
      assert.equal(restored.normalImport, undefined, 'portable HTML must not read normal file import repositories');
      assert.equal(restored.indexedDbOpens.includes('counselor_desk_v4'), false, 'portable HTML must not open the shared primary IndexedDB database');
      assert.equal(restored.indexedDbOpens.includes('counselor_desk_v4_imports'), false, 'portable HTML must not open the shared import IndexedDB database');

      const portableMarkers = await portablePage.evaluate(async () => {
        await window.CWB.repositories.students.put({ id:'portable-file-student', student_number:'PORTABLE-FILE-001', full_name:'Portable file student' });
        await window.CWB.repositories.orgs.put({ id:'portable-file-org', position:'Portable file organization', student_name:'Portable member' });
        await window.CWB.repositories.testSnapshots.put({ id:'portable-file-custom', name:'Portable custom repository', payload:{} });
        await window.CWB.repositories.meta.put({ id:'portable-file-meta', kind:'portable-isolation' });
        await window.CWB.audit.log('portable_file_audit', { marker:'portable-file-audit' });
        await window.CWB.attachments.add({ id:'portable-file-attachment', student_id:'portable-file-student', name:'portable-file.txt', blob:new Blob(['portable-file-attachment'], { type:'text/plain' }) });
        const task = window.CWB.importer.start({ collection:'students', rows:[{ student_number:'PORTABLE-IMPORT-001', full_name:'Portable import student' }], chunkSize:1 });
        window.CWB.importer.cancel(task.id);
        await task;
        await window.CWB.workspace.flush({ type:'portable-isolation-portable-flush', actor:'portable-test' });
        return {
          student:await window.CWB.repositories.students.get('portable-file-student'),
          org:await window.CWB.repositories.orgs.get('portable-file-org'),
          custom:await window.CWB.repositories.testSnapshots.get('portable-file-custom'),
          meta:await window.CWB.repositories.meta.get('portable-file-meta'),
          audit:(await window.CWB.audit.list()).find(row => row.details && row.details.marker === 'portable-file-audit'),
          attachment:await window.CWB.attachments.get('portable-file-attachment'),
          import:(await window.CWB.importer.listJobs()).find(row => row.id === task.id),
        };
      });
      assert.ok(portableMarkers.student, 'portable collection repositories must stay usable in memory');
      assert.ok(portableMarkers.org, 'portable canonical repositories must stay usable in memory');
      assert.ok(portableMarkers.custom, 'portable custom repositories must stay usable in memory');
      assert.ok(portableMarkers.meta, 'portable metadata repositories must stay usable in memory');
      assert.ok(portableMarkers.audit, 'portable audit repositories must stay usable in memory');
      assert.ok(portableMarkers.attachment, 'portable attachment repositories must stay usable in memory');
      assert.ok(portableMarkers.import, 'portable import repositories must stay usable in memory');

      const normalAfterPortable = await liveFilePage.evaluate(async portableImportId => ({
        workspace:window.CWB.workspace.exportEmergencyBackup(),
        student:await window.CWB.repositories.students.get('portable-file-student'),
        org:await window.CWB.repositories.orgs.get('portable-file-org'),
        custom:await window.CWB.repositories.testSnapshots.get('portable-file-custom'),
        meta:await window.CWB.repositories.meta.get('portable-file-meta'),
        audit:(await window.CWB.audit.list()).find(row => row.details && row.details.marker === 'portable-file-audit'),
        attachment:await window.CWB.attachments.get('portable-file-attachment'),
        import:(await window.CWB.importer.listJobs()).find(row => row.id === portableImportId),
      }), portableMarkers.import.id);
      assert.equal(normalAfterPortable.workspace.state.students.find(row => row.id === 'portable-file-student'), undefined, 'portable v8 persistence must not write into normal file workspaces');
      assert.equal(normalAfterPortable.student == null, true, 'portable collection repository writes must not reach normal file repositories');
      assert.equal(normalAfterPortable.org == null, true, 'portable canonical repository writes must not reach normal file repositories');
      assert.equal(normalAfterPortable.custom == null, true, 'portable custom repository writes must not reach normal file repositories');
      assert.equal(normalAfterPortable.meta == null, true, 'portable metadata writes must not reach normal file repositories');
      assert.equal(normalAfterPortable.audit, undefined, 'portable audit writes must not reach normal file repositories');
      assert.equal(normalAfterPortable.attachment == null, true, 'portable attachment writes must not reach normal file repositories');
      assert.equal(normalAfterPortable.import, undefined, 'portable import writes must not reach normal file repositories');
    } finally {
      await portableContext.close();
    }
    console.log('PASS v8-portable-history');
  } finally {
    await browser.close();
    if (portableDir) fs.rmSync(portableDir, { recursive:true, force:true });
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
