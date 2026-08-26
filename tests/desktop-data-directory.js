const assert = require('node:assert/strict');
const path = require('node:path');
const { activateDataDirectory } = require('../desktop/data-directory.cjs');

(async () => {
  const current = path.join(process.cwd(), 'original');
  const requested = path.join(process.cwd(), 'requested');
  await assert.rejects(() => activateDataDirectory({ current:'', requested, createStore:() => null, setUserData:() => {}, setStore:() => {} }), error => error.code === 'DATA_MIGRATION_CONTEXT_INVALID');
  let active = null;
  const calls = [];
  const oldStore = { closed:false, close() { this.closed = true; } };
  await activateDataDirectory({
    current,
    requested,
    oldStore,
    setUserData:value => calls.push(['userData', value]),
    setStore:value => { active = value; },
    createStore:file => ({ file, health:async () => ({ ok:true }), close() {} }),
  });
  assert.equal(oldStore.closed, true);
  assert.equal(active.file, path.join(requested, 'counselor-v4.sqlite'));
  assert.deepEqual(calls, [['userData', requested]]);
  console.log('PASS desktop-data-directory');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
