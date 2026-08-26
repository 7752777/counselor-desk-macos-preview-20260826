const assert = require('node:assert/strict');
const v48 = require('../src/core/cwb-v48.js');

function jsonResponse(body, status = 200) {
  return { ok:status >= 200 && status < 300, status, json:async () => body, headers:{ get:() => 'application/json' } };
}

(async () => {
  assert.throws(() => v48.createRemoteBackupAdapter({ base_url:'http://backup.local' }), /REMOTE_BACKUP_HTTPS_REQUIRED/);
  assert.throws(() => v48.createRemoteBackupAdapter({ base_url:'https://user:pass@backup.local' }), /REMOTE_BACKUP_URL_CREDENTIALS_FORBIDDEN/);
  assert.throws(() => v48.createRemoteBackupAdapter({ base_url:'https://backup.local/cwb/?token=inline' }), /REMOTE_BACKUP_URL_QUERY_FORBIDDEN/);

  const endpointProbe = v48.createRemoteBackupAdapter({ base_url:'https://backup.local/cwb/', fetch:async () => ({ ok:true, status:200, headers:{ get:() => '' } }) });
  for (const endpoint of ['/outside', '../outside', '%2e%2e/outside', 'https://other.local/outside']) {
    await assert.rejects(() => endpointProbe.upload({ endpoint, filename:'probe.cwbk', bytes:new Uint8Array([1]), encrypted:true, sha256:'a'.repeat(64) }), /REMOTE_BACKUP_ENDPOINT_INVALID/);
  }
  const configuredPathProbe = v48.createRemoteBackupAdapter({ base_url:'https://backup.local/cwb/', upload_endpoint:'../outside', fetch:async () => ({ ok:true, status:200, headers:{ get:() => '' } }) });
  await assert.rejects(() => configuredPathProbe.upload({ filename:'probe.cwbk', bytes:new Uint8Array([1]), encrypted:true, sha256:'a'.repeat(64) }), /REMOTE_BACKUP_ENDPOINT_INVALID/);

  const calls = [];
  const encrypted = new Uint8Array([1, 2, 3, 4]);
  const adapter = v48.createRemoteBackupAdapter({
    base_url:'https://backup.local/workspace/',
    mode:'webdav',
    fetch:async (url, init) => {
      calls.push({ url, init });
      if (init.method === 'GET') return { ok:true, status:200, headers:{ get:name => name === 'x-cwb-backup-encrypted' ? '1' : 'application/octet-stream' }, arrayBuffer:async () => encrypted.buffer };
      return { ok:true, status:204, headers:{ get:() => '' } };
    },
  });
  await assert.rejects(() => adapter.upload({ filename:'test.cwbk', bytes:encrypted }), /REMOTE_BACKUP_ENCRYPTION_REQUIRED/);
  const uploaded = await adapter.upload({ filename:'test.cwbk', bytes:encrypted, encrypted:true });
  assert.equal(uploaded.key_uploaded, false);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers['x-cwb-backup-encrypted'], '1');
  assert.equal(calls[0].init.headers['x-cwb-backup-sha256'].length, 64);
  const connection = await adapter.testConnection();
  assert.equal(connection.ok, true, 'remote backup adapter exposes a non-mutating connection test');
  assert.equal(calls.some(call => call.init && call.init.method === 'OPTIONS'), true, 'WebDAV connection tests use OPTIONS without uploading data');
  const downloaded = await adapter.download('test.cwbk');
  assert.deepEqual([...downloaded.bytes], [...encrypted]);
  assert.equal(downloaded.marked_encrypted, true);
  const unmarkedAdapter = v48.createRemoteBackupAdapter({
    base_url:'https://backup.local/workspace/',
    fetch:async () => ({ ok:true, status:200, headers:{ get:() => '' }, arrayBuffer:async () => encrypted.buffer }),
  });
  await assert.rejects(() => unmarkedAdapter.download('test.cwbk'), /REMOTE_BACKUP_ENCRYPTION_REQUIRED/);

  let pullAttempts = 0;
  const client = v48.createSyncClient({
    base_url:'https://sync.local',
    workspace_id:'w1',
    device_id:'d1',
    token:'session-token',
    fetch:async (url, init) => {
      const path = new URL(url).pathname;
      if (path === '/api/v1/sync/pull') {
        pullAttempts += 1;
        return jsonResponse({ ok:true, cursor:1, operations:[{ collection:'students', record_id:'s1', updated_at:'2026-08-21T10:00:00.000Z', patch:{ class_name:'一班' } }] });
      }
      if (path === '/api/v1/attachments/init') return jsonResponse({ ok:true, upload:{ upload_id:'u1', offset:0, chunk_size:2 } });
      if (path === '/api/v1/attachments/chunk') return jsonResponse({ ok:true, upload:{ offset:Number(new URL(url).searchParams.get('offset')) + init.body.byteLength } });
      if (path === '/api/v1/attachments/complete') return jsonResponse({ ok:true, attachment:{ attachment_id:'a1', size:4 } });
      if (path === '/api/v1/attachments/a1') return { ok:true, status:200, headers:{ get:() => 'application/octet-stream' }, arrayBuffer:async () => encrypted.buffer };
      throw new Error(`unexpected path ${path}`);
    },
    recordStore:{
      get:async () => ({ id:'s1', student_id:'s1', class_name:'旧班级' }),
      put:async () => { if (pullAttempts === 1) throw Object.assign(new Error('temporary'), { code:'REPOSITORY_BUSY' }); },
    },
  });
  const firstPull = await client.pull();
  assert.equal(firstPull.retry_required, true);
  assert.equal(client.status().cursor, 0, 'failed pull must retain the old cursor');
  const secondPull = await client.pull();
  assert.equal(secondPull.retry_required, false);
  assert.equal(client.status().cursor, 1);
  const upload = await client.uploadAttachment({ attachment_id:'a1', bytes:encrypted, filename:'photo.bin', mime_type:'image/png' });
  assert.equal(upload.attachment_id, 'a1');
  const download = await client.downloadAttachment('a1');
  assert.deepEqual([...download.bytes], [...encrypted]);
  assert.equal(calls.some(call => call.init && call.init.redirect === 'error'), true, 'remote backup requests reject redirects');
  console.log('PASS v48-storage-hardening');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
