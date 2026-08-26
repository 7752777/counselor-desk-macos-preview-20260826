const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const https = require('node:https');
const selfsigned = require('selfsigned');
const v48 = require('../src/core/cwb-v48.js');

function createResponse(status, headers, body) {
  const values = Object.fromEntries(Object.entries(headers || {}).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  const bytes = Buffer.from(body || []);
  return {
    ok:status >= 200 && status < 300,
    status,
    headers:{ get:name => values[String(name).toLowerCase()] || null },
    arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function request(fetchUrl, init) {
  const options = init || {};
  const url = new URL(fetchUrl);
  const body = options.body == null ? null : Buffer.from(options.body);
  const headers = Object.assign({}, options.headers || {});
  if (body) headers['content-length'] = body.length;
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname:url.hostname,
      port:url.port,
      path:`${url.pathname}${url.search}`,
      method:options.method || 'GET',
      rejectUnauthorized:false,
      headers,
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(createResponse(response.statusCode || 500, response.headers, Buffer.concat(chunks))));
    });
    req.once('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  const generated = await selfsigned.generate([{ name:'commonName', value:'localhost' }], {
    keySize:2048,
    days:1,
    algorithm:'sha256',
    extensions:[{ name:'subjectAltName', altNames:[{ type:2, value:'localhost' }, { type:7, ip:'127.0.0.1' }] }],
  });
  const files = new Map();
  const server = https.createServer({ key:generated.private, cert:generated.cert }, (requestIn, response) => {
    const name = decodeURIComponent(new URL(requestIn.url || '/', 'https://localhost').pathname.replace(/^\/workspace\//, ''));
    if (!name && (requestIn.method === 'OPTIONS' || requestIn.method === 'HEAD')) {
      response.writeHead(204, { allow:'OPTIONS, HEAD, GET, PUT, DELETE' }); response.end(); return;
    }
    if (!name || name.includes('/') || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.cwbk$/i.test(name)) {
      response.writeHead(400); response.end(); return;
    }
    const chunks = [];
    requestIn.on('data', chunk => chunks.push(chunk));
    requestIn.on('end', () => {
      if (requestIn.method === 'PUT') {
        files.set(name, Buffer.concat(chunks));
        response.writeHead(201, { 'x-cwb-backup-encrypted':'1' }); response.end(); return;
      }
      if (requestIn.method === 'GET') {
        const value = files.get(name);
        if (!value) { response.writeHead(404); response.end(); return; }
        response.writeHead(200, { 'content-type':'application/octet-stream', 'x-cwb-backup-encrypted':'1' }); response.end(value); return;
      }
      if (requestIn.method === 'DELETE') { files.delete(name); response.writeHead(204); response.end(); return; }
      response.writeHead(405); response.end();
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  const adapter = v48.createRemoteBackupAdapter({
    mode:'webdav',
    base_url:`https://127.0.0.1:${address.port}/workspace/`,
    timeout_ms:5000,
    fetch:request,
  });
  const bytes = Buffer.from('encrypted-backup-test-payload');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  try {
    const connection = await adapter.testConnection();
    assert.equal(connection.ok, true);
    const uploaded = await adapter.upload({ filename:'daily.cwbk', bytes, encrypted:true, sha256 });
    assert.equal(uploaded.size, bytes.length);
    assert.deepEqual([...files.get('daily.cwbk')], [...bytes], 'test server should receive the encrypted package bytes');
    const downloaded = await adapter.download('daily.cwbk');
    assert.deepEqual([...downloaded.bytes], [...bytes]);
    assert.equal(downloaded.marked_encrypted, true);
    assert.equal((await adapter.remove('daily.cwbk')).ok, true);
    await assert.rejects(() => adapter.download('daily.cwbk'), /REMOTE_BACKUP_HTTP_404/);
    console.log('PASS v48-remote-backup-e2e (local HTTPS/WebDAV transport)');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
