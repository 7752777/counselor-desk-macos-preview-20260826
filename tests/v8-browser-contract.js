const assert = require('node:assert/strict');
const path = require('node:path');
const { TextEncoder, TextDecoder } = require('node:util');
const { JSDOM, VirtualConsole } = require('jsdom');

const page = path.join(__dirname, '..', 'index.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

function createDesktopBridge() {
  const collections = new Map();
  let rejectV8Writes = false;
  const recordsFor = collection => {
    if (!collections.has(collection)) collections.set(collection, new Map());
    return collections.get(collection);
  };
  const rejectIfV8Metadata = (collection, value) => {
    if (rejectV8Writes && collection === 'meta' && value && (value.kind === 'workspace_v8_chunk' || value.kind === 'workspace_v8_pointer')) {
      throw new Error('V8_BRIDGE_WRITE_FORCED_FAILURE');
    }
  };
  return {
    failV8Writes() { rejectV8Writes = true; },
    api: {
      async repositoryList(collection) { return [...recordsFor(collection).values()].map(clone); },
      async repositoryGet(collection, id) { return clone(recordsFor(collection).get(String(id)) || null); },
      async repositoryPut(collection, record) {
        rejectIfV8Metadata(collection, record);
        recordsFor(collection).set(String(record.id), clone(record));
        return clone(record);
      },
      async repositoryPutMany(collection, values) {
        values.forEach(value => recordsFor(collection).set(String(value.id), clone(value)));
        return values.map(clone);
      },
      async repositoryReplaceManyAtomic(collection, values) {
        collections.set(collection, new Map(values.map(value => [String(value.id), clone(value)])));
        return values.map(clone);
      },
      async repositoryDelete(collection, id) { return recordsFor(collection).delete(String(id)); },
      async repositoryCount(collection) { return recordsFor(collection).size; },
      async writeAttachment(input) { return { id:input && input.id }; },
      async readAttachment() { return null; },
      async deleteAttachment() { return true; },
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

async function readPersistedWorkspace(bridge) {
  const records = await bridge.api.repositoryList('meta');
  const pointer = records.find(record => record && record.id === 'workspace_v8_active');
  if (!pointer || !pointer.active || !pointer.active.generation) return null;
  const chunks = records
    .filter(record => record && record.kind === 'workspace_v8_chunk' && record.generation === pointer.active.generation)
    .sort((left, right) => Number(left.index) - Number(right.index));
  if (chunks.length !== Number(pointer.active.chunkCount)) return null;
  return JSON.parse(Buffer.concat(chunks.map(record => Buffer.from(record.value, 'base64'))).toString('utf8'));
}

async function openApp(bridge, virtualConsole) {
  const dom = await JSDOM.fromFile(page, {
    runScripts:'dangerously', resources:'usable', pretendToBeVisual:true, virtualConsole,
    beforeParse(window) {
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
      window.cwbDesktop = bridge.api;
    },
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (dom.window.CWB && dom.window.document.documentElement.dataset.v4Ready === 'true'
      && dom.window.document.documentElement.dataset.v8Ready === 'true') return dom;
    await wait(25);
  }
  const diagnostics = dom.window.CWB && dom.window.CWB.diagnostics && typeof dom.window.CWB.diagnostics.create === 'function'
    ? dom.window.CWB.diagnostics.create()
    : null;
  const state = {
    readyState:dom.window.document.readyState,
    v4Ready:dom.window.document.documentElement.dataset.v4Ready || '',
    v8Ready:dom.window.document.documentElement.dataset.v8Ready || '',
    diagnostics,
  };
  dom.window.close();
  throw new Error(`application startup timed out: ${JSON.stringify(state)}`);
}

function assertCallable(api, names, label) {
  assert.ok(api, `${label} must be exposed`);
  names.forEach(name => assert.equal(typeof api[name], 'function', `${label}.${name} must be callable`));
}

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  const ignored = /scrollTo|Not implemented|Could not load|getaddrinfo/i;
  virtualConsole.on('jsdomError', error => { if (!ignored.test(error.message)) errors.push(error.message); });
  virtualConsole.on('error', (...args) => {
    const message = args.join(' ');
    if (!ignored.test(message)) errors.push(message);
  });

  const bridge = createDesktopBridge();
  let dom;
  try {
    dom = await openApp(bridge, virtualConsole);
    let cwb = dom.window.CWB;
    const document = dom.window.document;
    assert.ok(document.querySelector('script[data-v8-migration]'), 'the migration runtime must load in the browser');
    assert.ok(document.querySelector('script[data-v8-persistence]'), 'the persistence runtime must load in the browser');
    assert.ok(document.querySelector('script[data-v8-runtime]'), 'the workspace runtime must load in the browser');
    assert.ok(document.querySelector('script[data-v8-backup-codec]'), 'the backup codec must load in the browser');
    assertCallable(cwb.workspace, ['mutate', 'flush', 'status', 'getState', 'checkpoint', 'retryPending', 'historyFor', 'hydrateBackup'], 'CWB.workspace');
    assert.equal(cwb.workspace.schemaVersion, 8, 'CWB.workspace must publish schema v8');
    assert.equal(cwb.workspace.dataSchemaVersion, 11, 'logical v4.8 data schema must be v11');
    assert.equal(cwb.workspace.getState().settings.v48_schema_version, 11, 'v8 workspace activation must apply the v11 marker');
    assert.ok(Array.isArray(cwb.workspace.getState().custom.v4_dorm_batches), 'v9 custom collections must remain initialized');
    assert.ok(Array.isArray(cwb.workspace.getState().custom.v4_class_checks), 'v10 custom collections must be initialized');
    assertCallable(cwb.diagnostics, ['create', 'health', 'export'], 'CWB.diagnostics');
    assertCallable(cwb.views, ['create', 'get'], 'CWB.views');
    assertCallable(cwb.leadershipViews, ['metrics', 'create', 'update', 'remove', 'select', 'selected'], 'CWB.leadershipViews');
    assertCallable(cwb.imports, ['createTask', 'pause', 'resume', 'cancel', 'retry'], 'CWB.imports');
    assertCallable(cwb.exports, ['saveTemplate', 'preview'], 'CWB.exports');
    assert.ok(document.querySelector('[data-save-status]'), 'a visible workspace save state is required');
    assert.ok(document.querySelector('[data-act="workspace-retry"]'), 'a visible retry control is required');

    const view = cwb.views.create({ name:'contract view', fields:['full_name'] });
    assert.equal(cwb.views.get(view.id).name, 'contract view', 'views must round-trip through the public API');
    const leadershipView = await cwb.leadershipViews.create({ name:'contract leadership view', metricKeys:['student_total', 'open_tasks'] });
    await cwb.leadershipViews.select(leadershipView.id);
    assert.equal(cwb.leadershipViews.selected().id, leadershipView.id, 'leadership views must select through the public API');
    const importTask = cwb.imports.createTask({ fileName:'contract.xlsx' });
    assert.equal(cwb.imports.pause(importTask.id).status, 'paused', 'import task controls must update task state');
    await cwb.workspace.flush();
    const importTaskEnvelope = await readPersistedWorkspace(bridge);
    assert.ok(
      importTaskEnvelope.data.settings.import_tasks.some(task => task.id === importTask.id && task.status === 'paused'),
      'public import task state must be persisted in the workspace',
    );
    assert.ok(
      importTaskEnvelope.data.settings.leadership_views.some(item => item.id === leadershipView.id && item.metricKeys.join(',') === 'student_total,open_tasks'),
      'leadership views must persist in the workspace settings',
    );
    assert.equal(importTaskEnvelope.data.settings.leadership_view_id, leadershipView.id, 'the selected leadership view must persist in workspace settings');
    const exportTemplate = cwb.exports.saveTemplate({ name:'masked export', fields:['full_name', 'phone'], sensitiveFields:['phone'], redactSensitive:true });
    assert.equal(cwb.exports.preview(exportTemplate.id, [{ full_name:'Contract user', phone:'13800000000' }]).rows[0].phone, '***', 'export previews must apply their template masking policy');

    const directMetadata = { id:'v8-contract-metadata', student_id:'student-contract', name:'metadata-only.txt', mimeType:'text/plain', size:19, content_hash:'a'.repeat(64), thumbnail_id:'thumb-contract' };
    await cwb.workspace.mutate({ type:'attachment.metadata.create', collection:'attachments', operation:'upsert', actor:'contract', record:directMetadata });
    await cwb.workspace.flush();
    let persisted = await readPersistedWorkspace(bridge);
    const persistedMetadata = persisted.data.attachments.find(record => record.id === directMetadata.id);
    assert.ok(persistedMetadata, 'attachment metadata must persist through the workspace');
    assert.equal(Object.hasOwn(persistedMetadata, 'blob'), false, 'workspace history must not carry attachment bytes');

    const attached = await cwb.attachments.add({ id:'v8-contract-attachment', student_id:'student-contract', name:'attachment.txt', blob:new dom.window.Blob(['contract attachment'], { type:'text/plain' }), mimeType:'text/plain' });
    await cwb.workspace.flush();
    persisted = await readPersistedWorkspace(bridge);
    assert.ok(persisted.data.attachments.some(record => record.id === attached.id), 'public attachment writes must update workspace metadata');
    assert.ok(cwb.workspace.historyFor('attachments', attached.id).length > 0, 'public attachment writes must have workspace history');
    await cwb.attachments.delete(attached.id);
    await cwb.workspace.flush();
    persisted = await readPersistedWorkspace(bridge);
    assert.equal(persisted.data.attachments.some(record => record.id === attached.id), false, 'public attachment deletion must update workspace metadata');

    await cwb.repositories.tasks.put({ id:'v8-contract-task', title:'Repository queue' });
    await cwb.workspace.flush();
    persisted = await readPersistedWorkspace(bridge);
    assert.ok(persisted.data.tasks.some(record => record.id === 'v8-contract-task'), 'repository put must commit through the active workspace');
    assert.ok(cwb.workspace.historyFor('tasks', 'v8-contract-task').length > 0, 'repository put must have workspace history');
    await cwb.repositories.tasks.putMany([{ id:'v8-contract-batch-one', title:'Batch one' }, { id:'v8-contract-batch-two', title:'Batch two' }], { atomic:true });
    await cwb.repositories.tasks.delete('v8-contract-batch-two');
    await cwb.workspace.flush();
    persisted = await readPersistedWorkspace(bridge);
    assert.equal(persisted.data.tasks.some(record => record.id === 'v8-contract-batch-two'), false, 'repository deletion must update the authoritative workspace');
    assert.ok(cwb.workspace.historyFor('tasks', 'v8-contract-batch-two').some(entry => entry.action === 'delete'), 'repository deletion must create a restorable history entry');

    dom.window.close();
    dom = await openApp(bridge, virtualConsole);
    cwb = dom.window.CWB;
    assert.equal(cwb.db.tasks.find(record => record.id === 'v8-contract-batch-one').title, 'Batch one', 'the UI database must hydrate from the persisted workspace');
    assert.equal((await cwb.repositories.tasks.get('v8-contract-batch-one')).title, 'Batch one', 'repositories must hydrate from the persisted workspace');
    assert.equal(cwb.imports.get(importTask.id).status, 'paused', 'persisted public import tasks must hydrate after restart');
    assert.equal(cwb.leadershipViews.selected().name, 'contract leadership view', 'the selected leadership view must hydrate after restart');

    bridge.failV8Writes();
    await assert.rejects(
      cwb.workspace.mutate({ type:'attachment.metadata.failure', collection:'attachments', operation:'patch', id:directMetadata.id, actor:'contract', patch:{ name:'will-fail.txt' } }),
      /V8_BRIDGE_WRITE_FORCED_FAILURE/,
      'a rejected persistence bridge write must reject the workspace mutation',
    );
    const failedStatus = cwb.workspace.status();
    assert.equal(failedStatus.state, 'pending_recovery', 'a write failure must remain visibly recoverable');
    assert.equal(dom.window.document.querySelector('[data-save-status]').dataset.state, 'pending_recovery', 'the visible save state must disclose failure');
    assert.equal(dom.window.document.querySelector('[data-act="workspace-retry"]').hidden, false, 'a write failure must reveal the retry control');
    assert.deepEqual(errors, [], 'the browser contract must not emit unexpected runtime errors');
    console.log('PASS v8-browser-contract');
  } finally {
    if (dom) dom.window.close();
  }
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
