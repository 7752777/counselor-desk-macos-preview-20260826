const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'output', 'v4-preview.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openApp() {
  const console = new VirtualConsole();
  console.on('jsdomError', error => { if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(error.message)) console.error(error.message); });
  const dom = await JSDOM.fromFile(file, { runScripts:'dangerously', resources:'usable', url:'https://transactional-operations.local/', pretendToBeVisual:true, virtualConsole:console });
  await wait(850);
  return { dom, window:dom.window };
}

(async () => {
  const ctx = await openApp();
  const w = ctx.window;
  const runtime = w.CWBV46Runtime;
  const cwb = w.CWB;
  assert.ok(runtime && typeof runtime.deleteV4FileRecordsTransactional === 'function');

  const originalSync = w.CWB_V4_SYNC;
  const task = runtime.normTask({ id:'transaction-task', title:'事务失败后重试', status:'todo', due:runtime.today() });
  runtime.DB.tasks.push(task);
  w.CWB_V4_SYNC = () => Promise.reject(new Error('TEST_TASK_SAVE_FAILURE'));
  await assert.rejects(runtime.ACTS['task-done'](task.id), /TEST_TASK_SAVE_FAILURE/);
  assert.equal(runtime.DB.tasks.find(row => row.id === task.id).status, 'todo', 'failed task completion must restore the task');
  assert.equal(runtime.v4Collection('v4_worklog_drafts').some(row => row.source_id === task.id), false, 'failed task completion must restore draft state');
  w.CWB_V4_SYNC = originalSync;
  await runtime.ACTS['task-done'](task.id);
  assert.equal(runtime.DB.tasks.find(row => row.id === task.id).status, 'done', 'successful task completion should persist the task');
  assert.equal(runtime.v4Collection('v4_worklog_drafts').filter(row => row.source_id === task.id).length, 1, 'successful task completion should create one draft');

  const files = runtime.v4Collection('v4_files');
  files.splice(0, files.length,
    { id:'transaction-file-a', title:'文件 A', attachment_id:'transaction-attachment-a', versions:[], schema_version:8 },
    { id:'transaction-file-b', title:'文件 B', attachment_id:'transaction-attachment-b', versions:[], schema_version:8 });
  const attachments = new Map([
    ['transaction-attachment-a', { id:'transaction-attachment-a', name:'A.pdf', blob:new w.Blob(['a'], { type:'application/pdf' }), mimeType:'application/pdf' }],
    ['transaction-attachment-b', { id:'transaction-attachment-b', name:'B.pdf', blob:new w.Blob(['b'], { type:'application/pdf' }), mimeType:'application/pdf' }],
  ]);
  cwb.attachments.get = async id => attachments.get(String(id)) || null;
  cwb.attachments.delete = async id => { attachments.delete(String(id)); return true; };
  cwb.attachments.add = async record => { attachments.set(String(record.id), record); return record; };
  cwb.attachments.put = async record => { attachments.set(String(record.id), record); return record; };
  const repository = cwb.repositories.v4_files;
  const originalReplace = repository.replaceManyAtomic;
  let failOnce = true;
  repository.replaceManyAtomic = async rows => { if (failOnce) { failOnce = false; throw new Error('TEST_FILE_BATCH_SAVE_FAILURE'); } return originalReplace.call(repository, rows); };
  await assert.rejects(runtime.deleteV4FileRecordsTransactional(files.slice()), /TEST_FILE_BATCH_SAVE_FAILURE/);
  repository.replaceManyAtomic = originalReplace;
  assert.equal(files.length, 2, 'failed file batch must restore every file row');
  assert.ok(attachments.has('transaction-attachment-a') && attachments.has('transaction-attachment-b'), 'failed file batch must restore every attachment');
  await runtime.deleteV4FileRecordsTransactional(files.slice());
  assert.equal(files.length, 0, 'successful file batch should remove every selected file');
  assert.equal(attachments.size, 0, 'successful file batch should remove orphan attachments');
  w.CWB_V4_SYNC = originalSync;
  ctx.dom.window.close();
  console.log('PASS transactional-operations');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
