/** IndexedDB attachment capacity must participate in large-write admission. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'output', 'v4-preview.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const dom = await JSDOM.fromFile(file, {
    runScripts:'dangerously', resources:'usable', url:'https://storage-capacity.local/',
    virtualConsole:new VirtualConsole(), pretendToBeVisual:true,
  });
  const w = dom.window;
  await wait(900);
  assert.equal(typeof w.CWB?.attachments?.add, 'function', 'attachment repository should be ready');
  await w.CWB.attachments.clear();
  const first = new w.Blob([new Uint8Array(3 * 1024 * 1024)], { type:'application/octet-stream' });
  await w.CWB.attachments.add({ id:'capacity-first', name:'capacity-first.bin', blob:first, student_id:'capacity-student' });
  const health = await w.CWB.storage.inspect();
  assert.ok(health.attachments.bytes >= 3 * 1024 * 1024, 'capacity inspection must include IndexedDB attachment bytes');
  assert.equal(w.CWB.storage.canWriteLarge(2 * 1024 * 1024), false, 'cached capacity check must reject a write beyond the safe threshold');
  const before = (await w.CWB.attachments.list()).length;
  await assert.rejects(
    w.CWB.attachments.add({ id:'capacity-second', name:'capacity-second.bin', blob:new w.Blob([new Uint8Array(2 * 1024 * 1024)], { type:'application/octet-stream' }) }),
    /STORAGE_CAPACITY_LOW/,
    'large attachment writes must stop before consuming the remaining unsafe quota',
  );
  assert.equal((await w.CWB.attachments.list()).length, before, 'a rejected attachment must not be persisted');
  await w.CWB.attachments.clear();
  dom.window.close();
  console.log('PASS storage-capacity');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
