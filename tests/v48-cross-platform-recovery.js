const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const { TextEncoder, TextDecoder } = require('node:util');
const { JSDOM, VirtualConsole } = require('jsdom');

const page = path.join(__dirname, '..', 'output', 'v4-preview.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const customCollections = [
  'v4_sync_devices', 'v4_sync_outbox', 'v4_sync_conflicts', 'v4_sync_revisions', 'v4_backup_runs',
  'v4_student_field_catalog', 'v4_student_identity_conflicts', 'v4_form_templates', 'v4_form_jobs',
  'v4_student_class_history', 'v4_content_pushes', 'v4_content_reads', 'v4_work_categories',
];

function createBridge() {
  const collections = new Map();
  const attachments = new Map();
  const records = collection => { if (!collections.has(collection)) collections.set(collection, new Map()); return collections.get(collection); };
  return {
    async repositoryList(collection) { return [...records(collection).values()].map(clone); },
    async repositoryGet(collection, id) { return clone(records(collection).get(String(id)) || null); },
    async repositoryPut(collection, record) { records(collection).set(String(record.id), clone(record)); return clone(record); },
    async repositoryPutMany(collection, values) { values.forEach(value => records(collection).set(String(value.id), clone(value))); return values.map(clone); },
    async repositoryReplaceManyAtomic(collection, values) { collections.set(collection, new Map(values.map(value => [String(value.id), clone(value)]))); return values.map(clone); },
    async repositoryDelete(collection, id) { return records(collection).delete(String(id)); },
    async repositoryCount(collection) { return records(collection).size; },
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
  // The single-file runtime loads the bundled dependency surface through
  // JSDOM's file loader. On slower disks this can exceed five seconds even
  // when both workspace readiness markers eventually become healthy.
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (dom.window.CWB && dom.window.document.documentElement.dataset.v4Ready === 'true' && dom.window.document.documentElement.dataset.v8Ready === 'true') return dom;
    await wait(25);
  }
  dom.window.close();
  throw new Error('application startup timed out');
}

(async () => {
  const dom = await openApp();
  const password = 'v48-cross-platform-password';
  try {
    const { window } = dom;
    const student = window.CWB.norm.student({ id:'cross-platform-student', student_id:'cross-platform-student', student_number:'CP-001', full_name:'跨端恢复学生', class_name:'一班' });
    window.CWB.db.students.push(student);
    await window.CWB.attachments.add({ id:'cross-platform-attachment', student_id:student.id, name:'certificate.txt', blob:new window.Blob(['certificate'], { type:'text/plain' }), mimeType:'text/plain', allowDuplicate:true });
    const records = Object.fromEntries(customCollections.map((collection, index) => [collection, { id:`cross-${index}`, schema_version:8, collection, student_id:student.id }]));
    records.v4_student_field_catalog = { id:'cross-field', name:'research_status', label:'科研状态', type:'text', schema_version:8 };
    records.v4_content_pushes = { id:'cross-push', title:'本地资料', body:'仅工作区内容', schema_version:8 };
    for (const collection of customCollections) window.CWB.db.custom[collection].push(records[collection]);
    if (typeof window.CWB_V4_SYNC === 'function') await Promise.resolve(window.CWB_V4_SYNC('custom'));

    const packageValue = window.CWB.bridge.buildPackage();
    const portable = await window.CWB.buildPortableHtml();
    const embedded = JSON.parse(portable.html.match(/window\.__CWB_EMBED__=([\s\S]*?)<\/script>/)[1]);
    const phone = await window.CWB.sync.createPhonePackage();
    const envelope = await window.CWB.backup.export(password);
    const codec = window.CWBv8BackupCodec.createBackupCodec({ crypto:window.crypto, argon2:window.argon2, verifyV8Backup:window.CWBv8.verifyBackup });
    const decoded = await codec.decrypt(envelope, password);

    for (const collection of customCollections) {
      assert.ok(Array.isArray(packageValue.custom[collection]), `${collection} is present in exchange package`);
      assert.ok(Array.isArray(embedded.workspace.state.custom[collection]), `${collection} is present in portable HTML`);
      assert.ok(Array.isArray(phone.custom[collection]), `${collection} is present in phone package`);
      assert.ok(Array.isArray(decoded.backup.data.custom[collection]), `${collection} is present in encrypted backup`);
    }
    assert.ok(phone.attachments.some(item => item.id === 'cross-platform-attachment'), 'phone package retains attachment payload');
    assert.ok(decoded.backup.attachments.some(item => item.id === 'cross-platform-attachment'), 'encrypted backup retains attachment payload');

    const exchangeTarget = await openApp();
    try {
      await exchangeTarget.window.CWB.importExchangePackage(JSON.parse(JSON.stringify(packageValue)), 'merge');
      await wait(80);
      assert.equal(exchangeTarget.window.CWB.db.custom.v4_content_pushes.find(item => item.id === 'cross-push').title, '本地资料');
    } finally { exchangeTarget.window.close(); }

    const phoneTarget = await openApp();
    try {
      await phoneTarget.window.CWB.sync.applyPhonePackage(JSON.parse(JSON.stringify(phone)), 'merge');
      await wait(80);
      assert.equal(phoneTarget.window.CWB.db.custom.v4_student_field_catalog.find(item => item.id === 'cross-field').name, 'research_status');
    } finally { phoneTarget.window.close(); }

    const backupTarget = await openApp();
    try {
      await backupTarget.window.CWB.backup.restore(JSON.parse(JSON.stringify(envelope)), password, 'merge');
      await wait(80);
      assert.equal(backupTarget.window.CWB.db.custom.v4_work_categories.find(item => item.id === 'cross-12').collection, 'v4_work_categories');
      assert.ok(await backupTarget.window.CWB.attachments.get('cross-platform-attachment'), 'backup restore rehydrates attachment bytes');
    } finally { backupTarget.window.close(); }
  } finally { dom.window.close(); }
  console.log('PASS v48-cross-platform-recovery');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
