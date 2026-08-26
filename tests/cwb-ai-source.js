const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const relay = require('../scripts/ai-relay');

assert.equal(relay.SOURCE_RELAY_PATH, '/api/ai/source');

(async () => {
  await assert.rejects(() => relay.resolvePublicSource('http://example.com'), /AI_RELAY_SOURCE_URL_REJECTED/);
  await assert.rejects(() => relay.resolvePublicSource('https://127.0.0.1.example.com'), /AI_RELAY_SOURCE_URL_REJECTED|AI_RELAY_SOURCE_UNRESOLVED/);
  const source = await relay.fetchPublicSource(
    { url:'https://example.com/policy?page=2&token=secret&student=20240001#section', title:'' },
    {
      lookup:async () => [{ address:'93.184.216.34', family:4 }],
      requestImpl:async () => ({ status:200, contentType:'text/html; charset=utf-8', body:'<html><title>公开政策</title><p>来源片段</p></html>' }),
    },
  );
  assert.equal(source.url, 'https://example.com/policy?page=2', 'relay source URLs must remove sensitive query values and fragments before fetching/storing');
  assert.equal(source.title, '公开政策');
  assert.match(source.excerpt, /来源片段/);
  await assert.rejects(() => relay.fetchPublicSource(
    { url:'https://example.com/large' },
    {
      lookup:async () => [{ address:'93.184.216.34', family:4 }],
      maxBytes:8 * 1024 * 1024,
      requestImpl:async () => ({ status:200, contentType:'text/plain', body:'x'.repeat(600000) }),
    },
  ), /AI_RELAY_SOURCE_RESPONSE_TOO_LARGE/, 'relay source size must remain capped even when callers request a larger limit');

  const sandbox = { console, URL, setTimeout, clearTimeout, AbortController };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync('src/core/cwb-ai.js', 'utf8'), sandbox, { filename:'cwb-ai-source.js' });
  assert.equal(sandbox.CWBAI.normalizePublicSourceUrl('https://example.com/a#fragment'), 'https://example.com/a');
  assert.equal(sandbox.CWBAI.normalizePublicSourceUrl('https://example.com/a?page=2&token=secret#fragment'), 'https://example.com/a?page=2');
  assert.throws(() => sandbox.CWBAI.normalizePublicSourceUrl('http://example.com'), /AI_SOURCE_URL_HTTPS_REQUIRED/);
  assert.throws(() => sandbox.CWBAI.normalizePublicSourceUrl('https://192.168.1.5/a'), /AI_SOURCE_URL_NOT_PUBLIC/);
  sandbox.fetch = async () => ({
    ok:true,
    headers:{ get(name) { return name === 'content-type' ? 'text/html' : ''; } },
    async text() { return '<title>重新核验政策</title><p>最新内容</p>'; },
  });
  const refreshed = await sandbox.CWBAI.revalidatePublicSource({ id:'source-1', url:'https://example.com/policy' });
  assert.equal(refreshed.id, 'source-1');
  assert.equal(refreshed.verification_status, 'verified');
  assert.match(refreshed.excerpt, /最新内容/);
  const workflowSandbox = { console, URL, setTimeout, clearTimeout, AbortController };
  workflowSandbox.globalThis = workflowSandbox;
  vm.runInNewContext(fs.readFileSync('src/core/cwb-ai-workflow.js', 'utf8'), workflowSandbox, { filename:'cwb-ai-workflow-source.js' });
  const verified = workflowSandbox.CWBAIWorkflow.normalizeSource({ kind:'web', url:'https://example.com/policy', status:'available' });
  assert.equal(verified.verification_status, 'verified');
  assert.equal(workflowSandbox.CWBAIWorkflow.sourceUsable(verified), true);
  const stale = workflowSandbox.CWBAIWorkflow.normalizeSource({ kind:'web', url:'https://example.com/policy', status:'needs_review', verification_error:'AI_SOURCE_TIMEOUT' });
  assert.equal(stale.verification_status, 'needs_review');
  assert.equal(workflowSandbox.CWBAIWorkflow.sourceUsable(stale), false);
  assert.equal(workflowSandbox.CWBAIWorkflow.sourceUsable({ kind:'local', title:'本地政策' }), true);
  assert.equal(workflowSandbox.CWBAIWorkflow.sourceUsable({ kind:'local', status:'needs_review', title:'需要复核的本地政策' }), false);
  console.log('PASS cwb-ai-source');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
