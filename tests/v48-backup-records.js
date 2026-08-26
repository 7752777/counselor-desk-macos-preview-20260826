const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const { TextEncoder, TextDecoder } = require('node:util');
const { JSDOM, VirtualConsole } = require('jsdom');

const page = path.join(__dirname, '..', 'output', 'v4-preview.html');
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
    async repositoryList(collection) { return [...records(collection).values()].map(clone); },
    async repositoryGet(collection, id) { return clone(records(collection).get(String(id)) || null); },
    async repositoryPut(collection, record) { records(collection).set(String(record.id), clone(record)); return clone(record); },
    async repositoryPutMany(collection, values) { values.forEach(value => records(collection).set(String(value.id), clone(value))); return values.map(clone); },
    async repositoryReplaceManyAtomic(collection, values) { collections.set(collection, new Map(values.map(value => [String(value.id), clone(value)]))); return values.map(clone); },
    async repositoryDelete(collection, id) { return records(collection).delete(String(id)); },
    async repositoryCount(collection) { return records(collection).size; },
    async writeAttachment(input) { attachmentBytes.set(String(input && input.id), new Uint8Array(input && input.bytes || [])); return { id:input && input.id }; },
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
  };
}

async function openApp() {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/Could not load script:.*(?:xlsx|argon2|jszip|echarts)|Not implemented: HTMLCanvasElement/.test(error.message)) throw error;
  });
  const dom = await JSDOM.fromFile(page, {
    runScripts:'dangerously', resources:'usable', pretendToBeVisual:true, virtualConsole,
    beforeParse(window) {
      Object.defineProperty(window, 'crypto', { value:webcrypto });
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
      window.cwbDesktop = createBridge();
      window.requestAnimationFrame = callback => window.setTimeout(callback, 0);
    },
  });
  // The portable fixture embeds the production vendor runtimes and can take
  // longer than five seconds to parse on a busy release runner.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (dom.window.CWB && dom.window.document.documentElement.dataset.v4Ready === 'true'
      && dom.window.document.documentElement.dataset.v8Ready === 'true') return dom;
    await wait(25);
  }
  dom.window.close();
  throw new Error('application startup timed out');
}

(async () => {
  const dom = await openApp();
  try {
    const { window } = dom;
    const backup = window.CWB.backup;
    assert.equal(typeof backup.listRuns, 'function', 'backup history API is available');
    const beforeRuns = backup.listRuns();
    const beforeChanges = Number(window.CWB.db.settings.backup_state.change_count || 0);

    await backup.export('v48-backup-record-password');
    const firstRuns = backup.listRuns();
    assert.equal(firstRuns.length, beforeRuns.length + 1, 'successful backup creates one run record');
    assert.equal(firstRuns[0].status, 'success');
    assert.equal(firstRuns[0].encrypted, true);
    assert.equal(firstRuns[0].schema_version, 8, 'records use the stable workspace protocol schema');
    assert.equal(Number(window.CWB.db.settings.backup_state.change_count || 0), beforeChanges, 'backup history does not count as a business change');
    const firstId = firstRuns[0].id;

    const secondEnvelope = await backup.export('v48-backup-record-password');
    const codec = window.CWBv8BackupCodec.createBackupCodec({
      crypto:window.crypto,
      argon2:window.argon2,
      verifyV8Backup:window.CWBv8.verifyBackup,
    });
    const decoded = await codec.decrypt(secondEnvelope, 'v48-backup-record-password');
    const restoredRuns = decoded.backup.data.custom.v4_backup_runs;
    assert.ok(Array.isArray(restoredRuns), 'encrypted backup carries backup run history');
    assert.ok(restoredRuns.some(item => item && item.id === firstId), 'backup run history survives encryption');

    const phonePackage = await window.CWB.sync.createPhonePackage();
    assert.match(JSON.stringify(phonePackage), new RegExp(firstId), 'phone exchange package carries backup run history');

    await window.CWB.repositories.v4_backup_runs.delete(firstId);
    assert.equal(backup.listRuns().some(item => item.id === firstId), false, 'restore fixture removes the original run');
    await backup.restore(secondEnvelope, 'v48-backup-record-password', 'replace');
    assert.equal(backup.listRuns().some(item => item.id === firstId), true, 'replace restore rehydrates backup run history');
  } finally {
    dom.window.close();
  }
  console.log('PASS v48-backup-records');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
