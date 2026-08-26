/** Attachment deletion must remove the linked thumbnail from every storage layer. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'output', 'v4-preview.html');

(async () => {
  const dom = await JSDOM.fromFile(file, {
    runScripts:'dangerously', resources:'usable', url:'https://attachment-cleanup.local/',
    virtualConsole:new VirtualConsole(), pretendToBeVisual:true,
  });
  const w = dom.window;
  await new Promise(resolve => setTimeout(resolve, 700));
  const parent = await w.CWB.attachments.put({
    id:'cleanup-photo', name:'photo.jpg', student_id:'cleanup-student',
    thumbnail_id:'cleanup-photo::thumbnail', blob:new w.Blob(['original'], { type:'image/jpeg' }), mimeType:'image/jpeg',
  });
  await w.CWB.attachments.put({
    id:'cleanup-photo::thumbnail', parent_id:'cleanup-photo', is_thumbnail:true,
    name:'photo thumbnail', blob:new w.Blob(['thumbnail'], { type:'image/jpeg' }), mimeType:'image/jpeg',
  });
  assert.ok(await w.CWB.attachments.get(parent.id));
  assert.ok(await w.CWB.attachments.get('cleanup-photo::thumbnail'));
  assert.equal(await w.CWB.attachments.delete(parent.id), true);
  assert.equal(await w.CWB.attachments.get(parent.id) == null, true, 'parent attachment should be removed');
  assert.equal(await w.CWB.attachments.get('cleanup-photo::thumbnail') == null, true, 'thumbnail should be removed with its parent');
  dom.window.close();
  console.log('PASS attachment-cleanup');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
