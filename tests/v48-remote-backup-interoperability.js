const assert = require('node:assert/strict');
const v48 = require('../src/core/cwb-v48.js');

const calls = [];
const files = new Map();
const payload = new Uint8Array([1, 2, 3, 4]);
const adapter = v48.createRemoteBackupAdapter({
  base_url:'https://backup.example.test/workspace/',
  upload_endpoint:'api/upload',
  download_endpoint:'api/download',
  max_bytes:16,
  fetch:async (url, init) => {
    calls.push({ url, method:init.method, body:init.body, headers:init.headers });
    const parsed = new URL(url);
    if (init.method === 'HEAD') return { ok:true, status:200, headers:{ get:() => '' } };
    if (init.method === 'POST') { files.set('daily.cwbk', new Uint8Array(init.body)); return { ok:true, status:201, headers:{ get:() => '' } }; }
    if (init.method === 'GET') return { ok:true, status:200, headers:{ get:name => name === 'x-cwb-backup-encrypted' ? '1' : '' }, arrayBuffer:async () => files.get(parsed.pathname.endsWith('daily.cwbk') ? 'daily.cwbk' : '')?.buffer || new ArrayBuffer(0) };
    if (init.method === 'DELETE') { files.delete('daily.cwbk'); return { ok:true, status:204, headers:{ get:() => '' } }; }
    return { ok:false, status:405, headers:{ get:() => '' } };
  },
});

(async () => {
  assert.equal((await adapter.testConnection()).ok, true);
  const uploaded = await adapter.upload({ filename:'daily.cwbk', bytes:payload, encrypted:true, sha256:'a'.repeat(64) });
  assert.equal(uploaded.filename, 'daily.cwbk');
  const downloaded = await adapter.download('daily.cwbk');
  assert.deepEqual([...downloaded.bytes], [...payload]);
  assert.equal((await adapter.remove('daily.cwbk')).ok, true);
  assert.deepEqual(calls.map(item => item.method), ['HEAD', 'POST', 'GET', 'DELETE']);
  assert.equal(calls[1].url, 'https://backup.example.test/workspace/api/upload');
  assert.equal(calls[2].url, 'https://backup.example.test/workspace/api/download/daily.cwbk');
  assert.equal(calls[1].headers['x-cwb-backup-encrypted'], '1');
  await assert.rejects(() => adapter.upload({ filename:'too-large.cwbk', bytes:new Uint8Array(17), encrypted:true, sha256:'b'.repeat(64) }), /REMOTE_BACKUP_SIZE_INVALID/);
  console.log('PASS v48-remote-backup-interoperability');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
