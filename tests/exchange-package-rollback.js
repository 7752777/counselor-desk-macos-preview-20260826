const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { TextEncoder, TextDecoder } = require('node:util');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const page = path.join(__dirname, '..', 'index.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function createBridge() {
  const collections = new Map();
  const attachments = new Map();
  const rows = collection => {
    if (!collections.has(collection)) collections.set(collection, new Map());
    return collections.get(collection);
  };
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  return {
    async repositoryList(collection) { return [...rows(collection).values()].map(copy); },
    async repositoryGet(collection, id) { return copy(rows(collection).get(String(id)) || null); },
    async repositoryPut(collection, record) { rows(collection).set(String(record.id), copy(record)); return copy(record); },
    async repositoryPutMany(collection, values) { values.forEach(record => rows(collection).set(String(record.id), copy(record))); return values.map(copy); },
    async repositoryReplaceManyAtomic(collection, values) { collections.set(collection, new Map(values.map(record => [String(record.id), copy(record)]))); return values.map(copy); },
    async repositoryDelete(collection, id) { return rows(collection).delete(String(id)); },
    async repositoryCount(collection) { return rows(collection).size; },
    async writeAttachment(input) { attachments.set(String(input.id), new Uint8Array(input.bytes || [])); return { id:input.id }; },
    async readAttachment(id) { return attachments.get(String(id)) || null; },
    async deleteAttachment(id) { return attachments.delete(String(id)); },
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
  const dom = await JSDOM.fromFile(page, {
    runScripts:'dangerously', resources:'usable', pretendToBeVisual:true,
    virtualConsole:new VirtualConsole(),
    beforeParse(window) {
      Object.defineProperty(window, 'crypto', { value:webcrypto });
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
      window.cwbDesktop = createBridge();
    },
  });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (dom.window.CWB && dom.window.document.documentElement.dataset.v8Ready === 'true') return dom;
    await wait(25);
  }
  dom.window.close();
  throw new Error('application startup timed out');
}

(async () => {
  const dom = await openApp();
  try {
    const { window } = dom;
    await window.CWB.workspace.mutate({
      type:'test.current-task', collection:'tasks', operation:'upsert', actor:'test',
      record:{ id:'rollback-current-task', title:'Current task must survive' },
    });
    await window.CWB.attachments.add({
      id:'rollback-current-attachment', student_id:'rollback-current-task', name:'current.txt',
      blob:new window.Blob(['current attachment'], { type:'text/plain' }), mimeType:'text/plain', allowDuplicate:true,
    });
    const exchange = window.CWB.bridge.buildPackage();
    exchange.tasks = [{ id:'rollback-incoming-task', title:'Incoming task must not leak' }];
    exchange.workspace = Object.assign({}, exchange.workspace, {
      schemaVersion:8,
      state:Object.assign({}, exchange.workspace.state, { tasks:exchange.tasks }),
      history:[], recoveryPoints:[],
    });
    exchange.attachments = [{
      id:'rollback-invalid-attachment', student_id:'rollback-incoming-task', name:'broken.bin',
      mimeType:'application/octet-stream', size:4, data_base64:'not*valid-base64',
    }];
    await assert.rejects(() => window.CWB.importExchangePackage(exchange, 'replace'), /InvalidCharacterError|base64|ATTACHMENT/i);
    assert.equal(window.CWB.db.tasks.find(row => row.id === 'rollback-current-task')?.title, 'Current task must survive');
    assert.equal(window.CWB.workspace.getState().tasks.find(row => row.id === 'rollback-current-task')?.title, 'Current task must survive');
    assert.ok(await window.CWB.attachments.get('rollback-current-attachment'));
    assert.equal(window.CWB.db.tasks.some(row => row.id === 'rollback-incoming-task'), false);
    assert.equal(await window.CWB.attachments.get('rollback-invalid-attachment'), null);
    console.log('PASS exchange-package-rollback');
  } finally {
    dom.window.close();
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
