const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const { TextEncoder, TextDecoder } = require('node:util');
const { JSDOM, VirtualConsole } = require('jsdom');

const page = path.join(__dirname, '..', 'index.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function createBridge() {
  const collections = new Map();
  const attachmentBytes = new Map();
  const records = collection => {
    if (!collections.has(collection)) collections.set(collection, new Map());
    return collections.get(collection);
  };
  return {
    api: {
      async repositoryList(collection) { return [...records(collection).values()].map(clone); },
      async repositoryGet(collection, id) { return clone(records(collection).get(String(id)) || null); },
      async repositoryPut(collection, record) { records(collection).set(String(record.id), clone(record)); return clone(record); },
      async repositoryPutMany(collection, values) { values.forEach(value => records(collection).set(String(value.id), clone(value))); return values.map(clone); },
      async repositoryReplaceManyAtomic(collection, values) { collections.set(collection, new Map(values.map(value => [String(value.id), clone(value)]))); return values.map(clone); },
      async repositoryDelete(collection, id) { return records(collection).delete(String(id)); },
      async repositoryCount(collection) { return records(collection).size; },
      async writeAttachment(input) {
        attachmentBytes.set(String(input && input.id), new Uint8Array(input && input.bytes || []));
        return { id:input && input.id };
      },
      async readAttachment(id) { return attachmentBytes.get(String(id)) || null; },
      async deleteAttachment(id) { return attachmentBytes.delete(String(id)); },
      async saveBackup() { return { saved:false, reason:'test' }; },
      async openBackup() { return null; },
      async setBackupSecret() { return true; },
      async getBackupSecret() { return ''; },
      async pruneBackups() { return 0; },
      async getVaultStatus() { return { available:false }; },
      async chooseBackupFolder() { return null; },
      async openDataFolder() { return null; },
      async openExternal() { return true; },
    },
  };
}

async function openApp(bridge, virtualConsole) {
  const dom = await JSDOM.fromFile(page, {
    runScripts:'dangerously', resources:'usable', pretendToBeVisual:true, virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window, 'crypto', { value:webcrypto });
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
      window.cwbDesktop = bridge.api;
    },
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (dom.window.CWB && dom.window.document.documentElement.dataset.v4Ready === 'true'
      && dom.window.document.documentElement.dataset.v8Ready === 'true') return dom;
    await wait(25);
  }
  throw new Error('application startup timed out');
}

(async () => {
  const virtualConsole = new VirtualConsole();
  const bridge = createBridge();
  const dom = await openApp(bridge, virtualConsole);
  try {
    const { window } = dom;
    assert.ok(window.document.querySelector('script[data-v8-backup-codec]'), 'the v8 backup codec must be loaded by the app');
    assert.ok(window.CWBv8BackupCodec, 'the browser must expose the v8 backup codec');
    assert.equal(window.CWB.bridge.PACKAGE_VERSION, 8, 'exchange packages must publish schema v8');

    await window.CWB.workspace.mutate({
      type:'integration.task.create', collection:'tasks', operation:'upsert', actor:'integration-test',
      record:{ id:'v8-backup-integration-task', title:'History survives backup' },
    });
    await window.CWB.workspace.mutate({
      type:'integration.task.revise', collection:'tasks', operation:'upsert', actor:'integration-test',
      record:{ id:'v8-backup-integration-task', title:'History survives backup' },
    });
    await window.CWB.workspace.checkpoint({ reason:'integration-test' });
    const backup = await window.CWB.backup.export('integration-password');
    assert.equal(backup.format, 'cwbk');
    assert.equal(Number(backup.version), 8, 'active encrypted backups must use cwbk v8');
    assert.equal(Number(backup.schemaVersion), 8);
    const codec = window.CWBv8BackupCodec.createBackupCodec({
      crypto:window.crypto,
      argon2:window.argon2,
      verifyV8Backup:window.CWBv8.verifyBackup,
    });
    const decoded = await codec.decrypt(backup, 'integration-password');
    assert.ok(Array.isArray(decoded.backup.attachments), 'encrypted v8 backups carry a separate attachment payload');
    assert.ok(decoded.backup.attachments.every(item => item && item.id), 'attachment payload records retain stable IDs');

    const packageValue = window.CWB.bridge.buildPackage();
    assert.equal(Number(packageValue.package_version), 8);
    assert.equal(Number(packageValue.workspace && packageValue.workspace.schemaVersion), 8, 'JSON exchange must carry the v8 workspace envelope');
    assert.ok(Array.isArray(packageValue.workspace.history), 'JSON exchange must retain workspace history');
    assert.ok(Array.isArray(packageValue.workspace.recoveryPoints), 'JSON exchange must retain recovery points');

    const portable = await window.CWB.buildPortableHtml();
    const embeddedMatch = portable.html.match(/window\.__CWB_EMBED__=([\s\S]*?)<\/script>/);
    assert.ok(embeddedMatch, 'portable HTML must embed its workspace payload');
    const embedded = JSON.parse(embeddedMatch[1]);
    assert.equal(Number(embedded.workspace && embedded.workspace.schemaVersion), 8, 'portable HTML must carry schema v8');
    assert.ok(Array.isArray(embedded.workspace.history));
    assert.ok(Array.isArray(embedded.workspace.recoveryPoints));

    const phone = await window.CWB.sync.createPhonePackage();
    assert.equal(Number(phone.package_version), 8);
    assert.equal(Number(phone.workspace && phone.workspace.schemaVersion), 8, 'phone exchange must carry schema v8');

    const targetDom = await openApp(createBridge(), virtualConsole);
    try {
      const target = targetDom.window;
      await target.CWB.sync.applyPhonePackage(JSON.parse(JSON.stringify(phone)), 'merge');
      const importedHistory = target.CWB.workspace.historyFor('tasks', 'v8-backup-integration-task');
      assert.ok(importedHistory.length >= 2, 'phone exchange must restore the exported v8 record history rather than only replaying current records');
    } finally {
      targetDom.window.close();
    }

    const exchangeTargetDom = await openApp(createBridge(), virtualConsole);
    try {
      const target = exchangeTargetDom.window;
      const exchangePackage = JSON.parse(JSON.stringify(packageValue));
      const applied = await target.CWB.importExchangePackage(exchangePackage, 'merge');
      assert.ok(applied.tasks >= 1, 'the legacy exchange import must still apply its current task rows');
      const importedHistory = target.CWB.workspace.historyFor('tasks', 'v8-backup-integration-task');
      assert.ok(importedHistory.length >= 2, 'JSON exchange import must restore the exported v8 record history rather than only replaying current records');
    } finally {
      exchangeTargetDom.window.close();
    }

    const failedExchangeDom = await openApp(createBridge(), virtualConsole);
    try {
      const target = failedExchangeDom.window;
      await target.CWB.workspace.mutate({
        type:'integration.exchange.current', collection:'tasks', operation:'upsert', actor:'integration-test',
        record:{ id:'exchange-rollback-current-task', title:'Current task must survive a rejected package' },
      });
      await target.CWB.attachments.add({
        id:'exchange-rollback-current-attachment', student_id:'exchange-rollback-current-task', name:'current.txt',
        blob:new target.Blob(['current attachment'], { type:'text/plain' }), mimeType:'text/plain', allowDuplicate:true,
      });
      const malformedExchange = JSON.parse(JSON.stringify(packageValue));
      malformedExchange.attachments = [{ id:'exchange-rollback-invalid-attachment', data_base64:'%%not-base64%%', mimeType:'text/plain' }];
      await assert.rejects(
        () => target.CWB.importExchangePackage(malformedExchange, 'replace'),
        /InvalidCharacterError|base64|ATTACHMENT/i,
        'invalid attachment input must reject the exchange package before it replaces the workspace',
      );
      assert.equal(
        target.CWB.workspace.getState().tasks.find(item => item.id === 'exchange-rollback-current-task')?.title,
        'Current task must survive a rejected package',
        'a rejected exchange package must leave the original workspace state intact',
      );
      assert.ok(
        await target.CWB.attachments.get('exchange-rollback-current-attachment'),
        'a rejected exchange package must leave existing attachment bytes intact',
      );
      assert.equal(
        target.CWB.workspace.getState().tasks.some(item => item.id === 'v8-backup-integration-task'),
        false,
        'a rejected replace package must not leave incoming records behind',
      );
    } finally {
      failedExchangeDom.window.close();
    }

    await window.CWB.repositories.tasks.delete('v8-backup-integration-task');
    assert.equal(await window.CWB.repositories.tasks.get('v8-backup-integration-task'), null);
    await window.CWB.backup.restore(backup, 'integration-password', 'merge');
    const restored = await window.CWB.repositories.tasks.get('v8-backup-integration-task');
    assert.equal(restored && restored.title, 'History survives backup', 'v8 restore must rehydrate the live repository');
    const restoredInMemory = window.CWB.db.tasks.find(item => item.id === 'v8-backup-integration-task');
    assert.equal(restoredInMemory && restoredInMemory.title, 'History survives backup', 'v8 restore must also rehydrate the live UI state');

    const duplicateAttachmentBlob = new window.Blob(['same bytes, separate stable IDs'], { type:'text/plain' });
    await window.CWB.attachments.add({
      id:'backup-attachment-source', student_id:'v8-backup-integration-task', name:'source.txt', blob:duplicateAttachmentBlob, mimeType:'text/plain', allowDuplicate:true,
    });
    const sourceAttachment = await window.CWB.attachments.get('backup-attachment-source');
    const sourceBytes = new Uint8Array(await new Promise((resolve, reject) => {
      const reader = new window.FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(sourceAttachment.blob);
    }));
    const sourceHash = Buffer.from(await webcrypto.subtle.digest('SHA-256', sourceBytes)).toString('hex');
    await window.CWB.attachments.put(Object.assign({}, sourceAttachment, { content_hash:sourceHash }));
    const duplicateAttachmentBackup = await window.CWB.backup.export('integration-password');
    await window.CWB.attachments.delete('backup-attachment-source');
    await window.CWB.attachments.add({
      id:'backup-attachment-existing-duplicate', student_id:'v8-backup-integration-task', name:'existing.txt', blob:duplicateAttachmentBlob, mimeType:'text/plain', allowDuplicate:true,
    });
    await window.CWB.backup.restore(duplicateAttachmentBackup, 'integration-password', 'merge');
    const restoredSourceAttachment = await window.CWB.attachments.get('backup-attachment-source');
    const attachmentIdsAfterRestore = (await window.CWB.attachments.list()).map(item => item && item.id).join(',');
    assert.ok(restoredSourceAttachment, `restore must preserve an attachment ID even when another local attachment has identical bytes (found: ${attachmentIdsAfterRestore})`);

    await window.CWB.workspace.mutate({
      type:'integration.history.remote', collection:'tasks', operation:'upsert', actor:'integration-test',
      record:{ id:'backup-merge-history-remote', title:'remote history' },
    });
    const historyBackup = await window.CWB.backup.export('integration-password');
    await window.CWB.workspace.mutate({
      type:'integration.history.local', collection:'tasks', operation:'upsert', actor:'integration-test',
      record:{ id:'backup-merge-history-local', title:'local history' },
    });
    assert.ok(window.CWB.workspace.historyFor('tasks', 'backup-merge-history-local').length > 0, 'the local record must have history before merge restore');
    await window.CWB.backup.restore(historyBackup, 'integration-password', 'merge');
    assert.ok(window.CWB.workspace.historyFor('tasks', 'backup-merge-history-local').length > 0, 'merge restore must retain local record history alongside incoming history');

    await window.CWB.workspace.mutate({
      type:'integration.rollback.backup', collection:'tasks', operation:'upsert', actor:'integration-test',
      record:{ id:'backup-rollback-task', title:'backup title' },
    });
    const rollbackBackup = await window.CWB.backup.export('integration-password');
    await window.CWB.workspace.mutate({
      type:'integration.rollback.current', collection:'tasks', operation:'upsert', actor:'integration-test',
      record:{ id:'backup-rollback-task', title:'current title' },
    });
    const addAttachment = window.CWB.attachments.add;
    window.CWB.attachments.add = async () => { throw new Error('INJECTED_ATTACHMENT_WRITE_FAILURE'); };
    try {
      await assert.rejects(
        () => window.CWB.backup.restore(rollbackBackup, 'integration-password', 'merge'),
        /INJECTED_ATTACHMENT_WRITE_FAILURE/,
      );
    } finally {
      window.CWB.attachments.add = addAttachment;
    }
    const rollbackTask = window.CWB.workspace.getState().tasks.find(item => item.id === 'backup-rollback-task');
    assert.equal(rollbackTask && rollbackTask.title, 'current title', 'an attachment restore failure must roll workspace state back to its pre-restore value');

    await window.CWB.repositories.auditLog.put({
      id:'backup-auxiliary-rollback-audit', action:'backup audit', details:{ source:'backup' },
    });
    await window.CWB.repositories.meta.put({
      id:'import_history:backup-auxiliary-rollback-history', kind:'import_history',
      run:{ id:'backup-auxiliary-rollback-history', coll:'students', at:'2026-08-13T00:00:00.000Z', source:'backup' },
    });
    let releaseBackupImportJob;
    const backupImportJob = window.CWB.importer.start({
      collection:'auxiliary-rollback', rows:[{ id:'backup-auxiliary-rollback-job-row' }],
      onChunk:() => new Promise(resolve => { releaseBackupImportJob = resolve; }),
    });
    for (let deadline = Date.now() + 1000; !releaseBackupImportJob && Date.now() < deadline; await wait(10)) {}
    assert.equal(typeof releaseBackupImportJob, 'function', 'the backup import job must remain pending while its auxiliary snapshot is exported');
    await window.CWB.workspace.mutate({
      type:'integration.auxiliary.backup', collection:'tasks', operation:'upsert', actor:'integration-test',
      record:{ id:'backup-auxiliary-rollback-task', title:'backup title' },
    });
    const auxiliaryRollbackBackup = await window.CWB.backup.export('integration-password');
    assert.ok(auxiliaryRollbackBackup, 'the auxiliary rollback fixture must export successfully');
    assert.ok((await window.CWB.importer.listJobs()).some(job => job.id === backupImportJob.id), 'the backup must contain its pending import job');
    await window.CWB.importer.discardJob(backupImportJob.id);
    releaseBackupImportJob();
    await backupImportJob;
    await wait(10);
    await window.CWB.repositories.auditLog.put({
      id:'backup-auxiliary-rollback-audit', action:'current audit', details:{ source:'current' },
    });
    await window.CWB.repositories.meta.put({
      id:'import_history:backup-auxiliary-rollback-history', kind:'import_history',
      run:{ id:'backup-auxiliary-rollback-history', coll:'students', at:'2026-08-13T00:00:00.000Z', source:'current' },
    });
    let releaseCurrentImportJob;
    const currentImportJob = window.CWB.importer.start({
      collection:'auxiliary-rollback', rows:[{ id:'current-auxiliary-rollback-job-row' }],
      onChunk:() => new Promise(resolve => { releaseCurrentImportJob = resolve; }),
    });
    for (let deadline = Date.now() + 1000; !releaseCurrentImportJob && Date.now() < deadline; await wait(10)) {}
    assert.equal(typeof releaseCurrentImportJob, 'function', 'the current import job must remain pending while restore writes its backup job');
    await window.CWB.workspace.mutate({
      type:'integration.auxiliary.current', collection:'tasks', operation:'upsert', actor:'integration-test',
      record:{ id:'backup-auxiliary-rollback-task', title:'current title' },
    });
    try {
      const logAudit = window.CWB.audit.log;
      window.CWB.audit.log = async (action, details) => {
        if (action === 'backup_restore') throw new Error('INJECTED_AUXILIARY_WRITE_FAILURE');
        return logAudit(action, details);
      };
      try {
        await assert.rejects(
          () => window.CWB.backup.restore(auxiliaryRollbackBackup, 'integration-password', 'merge'),
          /INJECTED_AUXILIARY_WRITE_FAILURE/,
        );
      } finally {
        window.CWB.audit.log = logAudit;
      }
      const auxiliaryRollbackTask = window.CWB.workspace.getState().tasks.find(item => item.id === 'backup-auxiliary-rollback-task');
      const auxiliaryRollbackAudit = await window.CWB.repositories.auditLog.get('backup-auxiliary-rollback-audit');
      const auxiliaryRollbackHistory = (await window.CWB.importer.getHistoryAsync()).find(run => run.id === 'backup-auxiliary-rollback-history');
      const auxiliaryRollbackJobs = await window.CWB.importer.listJobs();
      assert.equal(auxiliaryRollbackTask && auxiliaryRollbackTask.title, 'current title', 'a post-auxiliary failure must roll workspace state back to its pre-restore value');
      assert.equal(auxiliaryRollbackAudit && auxiliaryRollbackAudit.details && auxiliaryRollbackAudit.details.source, 'current', 'a post-auxiliary failure must restore the previous audit record');
      assert.equal(auxiliaryRollbackHistory && auxiliaryRollbackHistory.source, 'current', 'a post-auxiliary failure must restore the previous import history record');
      assert.ok(auxiliaryRollbackJobs.some(job => job.id === currentImportJob.id), 'a post-auxiliary failure must retain the current pending import job');
      assert.ok(!auxiliaryRollbackJobs.some(job => job.id === backupImportJob.id), 'a post-auxiliary failure must remove the imported pending job');
    } finally {
      await window.CWB.importer.discardJob(currentImportJob.id);
      releaseCurrentImportJob();
      await currentImportJob;
    }

    const exchangeRollbackTask = { id:'exchange-rollback-current-task', title:'Current exchange task must survive' };
    await window.CWB.workspace.mutate({
      type:'integration.exchange.rollback.current', collection:'tasks', operation:'upsert', actor:'integration-test', record:exchangeRollbackTask,
    });
    await window.CWB.attachments.add({
      id:'exchange-rollback-current-attachment', student_id:'exchange-rollback-current-task', name:'current-exchange.txt',
      blob:new window.Blob(['current exchange attachment'], { type:'text/plain' }), mimeType:'text/plain', allowDuplicate:true,
    });
    const incomingExchangeTask = { id:'exchange-rollback-incoming-task', title:'Incoming task must not leak' };
    const malformedExchange = JSON.parse(JSON.stringify(window.CWB.bridge.buildPackage()));
    malformedExchange.tasks = [incomingExchangeTask];
    malformedExchange.workspace = Object.assign({}, malformedExchange.workspace || {}, {
      schemaVersion:8, state:Object.assign({}, malformedExchange.workspace && malformedExchange.workspace.state || {}, { tasks:[incomingExchangeTask] }), history:[], recoveryPoints:[],
    });
    malformedExchange.attachments = [{
      id:'exchange-rollback-invalid-attachment', student_id:'exchange-rollback-incoming-task', name:'broken.bin', mimeType:'application/octet-stream', size:4, data_base64:'not*valid-base64',
    }];
    await assert.rejects(
      () => window.CWB.importExchangePackage(malformedExchange, 'replace'),
      'a malformed exchange attachment must reject before any durable import is accepted',
    );
    await wait(50);
    assert.equal(window.CWB.db.tasks.find(item => item.id === exchangeRollbackTask.id).title, exchangeRollbackTask.title, 'a failed replacement exchange restores the live legacy task database');
    assert.equal(window.CWB.workspace.getState().tasks.find(item => item.id === exchangeRollbackTask.id).title, exchangeRollbackTask.title, 'a failed replacement exchange restores the v8 workspace state');
    assert.ok(await window.CWB.attachments.get('exchange-rollback-current-attachment'), 'a failed replacement exchange restores attachments removed before the malformed payload is discovered');
    assert.equal(window.CWB.db.tasks.some(item => item.id === incomingExchangeTask.id), false, 'a failed replacement exchange does not leak incoming records into the legacy database');
    assert.equal(window.CWB.workspace.getState().tasks.some(item => item.id === incomingExchangeTask.id), false, 'a failed replacement exchange does not leak incoming records into the workspace');
    assert.equal(await window.CWB.attachments.get('exchange-rollback-invalid-attachment'), null, 'a malformed incoming attachment never reaches the attachment repository');
    const legacyEnvelope = await window.CWB_V4.encryptBackup({
      package:'counselor-desk', package_version:7,
      students:[{ id:'legacy-v7-student', student_number:'LEGACY-001', full_name:'Legacy restore' }],
      tasks:[], talks:[], stay:[], leave:[], honor:[], pleave:[], attend:[], node:[], warn:[], help:[], grant:[], focus:[], psych:[], graduate:[], policy:[], material:[], comp:[], tpl:[], learning_materials:[], learning_notes:[], learning_sessions:[], custom:{},
    }, 'integration-password');
    await window.CWB.backup.restore(legacyEnvelope, 'integration-password', 'merge');
    const legacyRestored = await window.CWB.repositories.students.get('legacy-v7-student');
    assert.equal(legacyRestored && legacyRestored.full_name, 'Legacy restore', 'legacy cwbk v7 files migrate and restore into the live v8 workspace');
    const legacyInMemory = window.CWB.db.students.find(item => item.id === 'legacy-v7-student');
    assert.equal(legacyInMemory && legacyInMemory.full_name, 'Legacy restore', 'legacy cwbk v7 files must also refresh the live UI state');
    console.log('PASS v8-backup-integration');
  } finally {
    dom.window.close();
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
