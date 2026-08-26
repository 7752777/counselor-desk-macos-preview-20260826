const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'output', 'v4-preview.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const activeModal = document => document.querySelector('#modal-root .mask');

async function openApp() {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(error.message)) errors.push(error.message);
  });
  console.on('error', (...args) => errors.push(args.join(' ')));
  const dom = await JSDOM.fromFile(file, {
    runScripts:'dangerously', resources:'usable', url:'https://business-bulk-transaction.local/',
    pretendToBeVisual:true, virtualConsole:console,
  });
  await wait(850);
  return { dom, errors, window:dom.window, document:dom.window.document };
}

function assessment(id, attachmentId) {
  return {
    id, student_id:'bulk-student', student_number:'B001', student_name:'批量测试学生', class_name:'一班',
    term:'2026-2027-1', score:90, rank:1, level:'优秀', status:'已登记',
    note:'批量事务测试', attachment_ids:attachmentId ? [attachmentId] : [],
  };
}

function installAttachmentStore(cwb, values) {
  const records = new Map(values.map(item => [String(item.id), Object.assign({}, item)]));
  const deleted = [];
  cwb.attachments.get = async id => records.get(String(id)) || null;
  cwb.attachments.delete = async id => { deleted.push(String(id)); return records.delete(String(id)); };
  cwb.attachments.put = async record => { records.set(String(record.id), Object.assign({}, record)); return Object.assign({}, record); };
  cwb.attachments.add = async record => { records.set(String(record.id), Object.assign({}, record)); return Object.assign({}, record); };
  return { records, deleted };
}

async function prepareBusinessPage(ctx, rows, drafts) {
  const { window:w, document:d } = ctx;
  const cwb = w.CWB;
  cwb.db.students = [{ id:'bulk-student', student_number:'B001', full_name:'批量测试学生', class_name:'一班' }];
  cwb.db.custom.v4_assessments = rows;
  cwb.db.custom.v4_worklog_drafts = drafts;
  cwb.go('business');
  await wait(100);
  d.querySelector('[data-act="business-bulk-toggle"]').click();
  await wait(80);
  const checkboxes = [...d.querySelectorAll('.tw [data-act="business-bulk-select"]')];
  assert.deepEqual(checkboxes.map(input => input.dataset.id).sort(), rows.map(row => row.id).sort(), 'bulk selection must use stable row IDs after display sorting');
  d.querySelector('[data-act="business-bulk-select-all"]').click();
  await wait(70);
  const deleteButton = d.querySelector('[data-act="business-bulk-delete"]');
  assert.ok(deleteButton && !deleteButton.disabled, 'bulk delete should enable after selecting records');
  deleteButton.click();
  await wait(70);
  assert.ok(activeModal(d), 'bulk delete should open a confirmation modal');
  return activeModal(d).querySelector('[data-yes]');
}

(async () => {
  {
    const ctx = await openApp();
    const cwb = ctx.window.CWB;
    const attachments = installAttachmentStore(cwb, [
      { id:'bulk-attachment-1', name:'材料 1.pdf', mimeType:'application/pdf', blob:{ size:1 } },
      { id:'bulk-attachment-2', name:'材料 2.pdf', mimeType:'application/pdf', blob:{ size:1 } },
    ]);
    const confirm = await prepareBusinessPage(ctx, [assessment('bulk-a', 'bulk-attachment-1'), assessment('bulk-b', 'bulk-attachment-2')], []);
    confirm.click();
    await wait(220);
    assert.equal(cwb.db.custom.v4_assessments.length, 0, 'successful bulk delete should remove every selected record');
    assert.deepEqual(attachments.deleted.sort(), ['bulk-attachment-1', 'bulk-attachment-2'], 'successful bulk delete should remove every orphan attachment');
    assert.equal(attachments.records.size, 0, 'successful bulk delete should leave no deleted attachment behind');
    ctx.dom.window.close();
  }

  {
    const ctx = await openApp();
    const cwb = ctx.window.CWB;
    const attachments = installAttachmentStore(cwb, [{ id:'bulk-attachment-rollback', name:'回滚材料.pdf', mimeType:'application/pdf', blob:{ size:1 } }]);
    const repository = cwb.repositories.v4_assessments;
    assert.ok(repository && typeof repository.putMany === 'function', 'business repository should expose atomic putMany');
    const originalPutMany = repository.putMany;
    repository.putMany = async () => { throw new Error('TEST_BULK_PERSIST_FAILURE'); };
    try {
      const confirm = await prepareBusinessPage(ctx, [assessment('bulk-rollback', 'bulk-attachment-rollback')], [{ id:'bulk-draft-rollback', source_collection:'v4_assessments', source_id:'bulk-rollback', status:'draft', source_state:'active' }]);
      confirm.click();
      await wait(280);
    } finally {
      repository.putMany = originalPutMany;
    }
    assert.equal(cwb.db.custom.v4_assessments.length, 1, 'failed bulk delete must restore the business record in memory');
    assert.equal(cwb.db.custom.v4_assessments[0].id, 'bulk-rollback');
    assert.ok(attachments.deleted.includes('bulk-attachment-rollback'), 'failed bulk delete should enter attachment cleanup before the simulated persistence failure');
    assert.ok(attachments.records.has('bulk-attachment-rollback'), 'failed bulk delete must restore the removed attachment');
    assert.equal(cwb.db.custom.v4_worklog_drafts[0].status, 'draft', 'failed bulk delete must restore the linked worklog draft state');
    assert.ok(ctx.errors.every(message => !/TEST_BULK_PERSIST_FAILURE/.test(message)), 'expected failure should be handled by the retryable confirmation UI');
    ctx.dom.window.close();
  }
  console.log('PASS business-bulk-transaction');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
