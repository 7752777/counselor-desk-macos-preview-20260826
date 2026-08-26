const assert = require('node:assert/strict');
const v48 = require('../src/core/cwb-v48.js');

(async () => {
  let failSave = true;
  const saved = [];
  const client = v48.createSyncClient({
    workspace_id:'persistence-workspace',
    device_id:'persistence-device',
    save:async payload => {
      await Promise.resolve();
      if (failSave) throw new Error('storage temporarily unavailable');
      saved.push(payload);
      return { ok:true };
    },
  });

  client.enqueue('students', 'student-1', { class_name:'一班' }, 0);
  assert.equal(client.status().queued, 1, 'queue should be visible before the async save settles');
  await assert.rejects(() => client.waitPersistence(), error => error && error.code === 'SYNC_STATE_PERSIST_FAILED');
  assert.equal(client.status().queued, 0, 'a failed queue save must roll back the in-memory queue');
  assert.equal(client.status().last_error, 'SYNC_STATE_PERSIST_FAILED');

  failSave = false;
  client.enqueue('students', 'student-1', { class_name:'二班' }, 0);
  await client.waitPersistence();
  assert.equal(client.status().queued, 1, 'a later successful save should be accepted');
  assert.equal(saved.at(-1).queue.length, 1);

  let saveCount = 0;
  const ordered = v48.createSyncClient({
    workspace_id:'ordered-workspace',
    device_id:'ordered-device',
    save:async payload => {
      saveCount += 1;
      await Promise.resolve();
      if (saveCount === 1) throw new Error('first write failed');
      saved.push(payload);
      return { ok:true };
    },
  });
  ordered.enqueue('students', 'student-2', { class_name:'一班' }, 0);
  ordered.enqueue('students', 'student-3', { class_name:'二班' }, 0);
  await ordered.waitPersistence();
  assert.equal(ordered.status().queued, 2, 'a later queued snapshot must survive an earlier failed write');
  assert.equal(saved.at(-1).queue.length, 2);
  console.log('PASS v48-sync-persistence');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
