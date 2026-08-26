/** v4 core contracts: storage adapters, autosave, backup, dictionaries and rules. */
const assert = require('node:assert/strict');
const { createV4Core } = require('../src/core/v4-runtime.js');

function memoryStorage() {
  const map = new Map();
  return { getItem:key => map.has(key) ? map.get(key) : null, setItem:(key,value) => map.set(key, String(value)), removeItem:key => map.delete(key), key:i => [...map.keys()][i] || null, get length(){ return map.size; } };
}

(async () => {
  const storage = memoryStorage();
  const core = createV4Core({ storage, namespace:'test_v4_' });
  const state = { students: [{ id:'s1', full_name:'张三', class_name:'一班' }] };

  assert.equal(core.pageSize.normalize(7), 10);
  assert.equal(core.pageSize.normalize(50), 50);
  assert.deepEqual(core.pageSize.slice(state.students, 2, 10).map(x => x.id), []);

  let writes = 0;
  const saved = core.autosave.create(() => { writes += 1; return state; }, { debounceMs:1 });
  saved.markDirty();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(writes, 1, 'dirty state should be persisted after debounce');

  const backup = core.backup.create({ settings:{}, students:state.students }, { attachments:[] });
  assert.equal(backup.schemaVersion, 7);
  assert.equal(core.backup.verify(backup), true);
  const restored = core.backup.restore(backup);
  assert.equal(restored.students[0].full_name, '张三');

  const dict = core.dictionary.normalize({ options:['二级库','一级库'], defaultValue:'二级库' });
  assert.equal(dict.options.length, 2);
  assert.equal(core.dictionary.resolve('临时等级', dict).temporary, true);

  assert.deepEqual(core.rules.academicRisk({ class_name:'一班', failedCount:3 }, { '一班':{ failedCourseThreshold:2 } }), { triggered:true, threshold:2 });
  assert.deepEqual(core.rules.accommodationRisk({ class_name:'一班', moves:2, sameReasonMoves:1 }, { '一班':{ moveThreshold:2, sameReasonThreshold:3 } }), { triggered:true, reason:'累计调宿次数达到 2 次' });
  assert.deepEqual(core.rules.accommodationRisk({ class_name:'一班', moves:1, sameReasonMoves:1 }, { '一班':{ moveThreshold:2, sameReasonThreshold:3 } }), { triggered:false });
  const attachment = await core.attachments.ingest({ name:'谈话照片.jpg', type:'image/jpeg', size:4 }, 'talk-1', 'data:image/jpeg;base64,AA==');
  assert.equal(attachment.recordId, 'talk-1');
  assert.equal(core.attachments.list('talk-1').length, 1);
  assert.equal(core.attachments.remove(attachment.id), true);
  console.log('PASS v4-core');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
