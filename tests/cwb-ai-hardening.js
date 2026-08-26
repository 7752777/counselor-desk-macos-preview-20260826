const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/core/cwb-ai.js', 'utf8');
const workflow = fs.readFileSync('src/core/cwb-ai-workflow.js', 'utf8');

const workflowSandbox = { console, URL, setTimeout, clearTimeout, AbortController };
workflowSandbox.globalThis = workflowSandbox;
vm.runInNewContext(workflow, workflowSandbox, { filename:'cwb-ai-hardening-workflow.js' });
const aiWorkflow = workflowSandbox.CWBAIWorkflow;

const verified = aiWorkflow.normalizeSource({ kind:'web', url:'https://example.com/policy', status:'available' });
assert.equal(aiWorkflow.sourceUsable(verified), true);
assert.equal(aiWorkflow.sourceUsable({ kind:'web', url:'http://example.com/policy', status:'available', verification_status:'verified' }), false);
assert.equal(aiWorkflow.sourceUsable({ kind:'web', url:'https://127.0.0.1/policy', status:'available', verification_status:'verified' }), false);
assert.equal(aiWorkflow.sourceUsable({ kind:'web', url:'https://example.com/policy', status:'available', verification_status:'verified', last_verified_at:'2026-08-18T00:00:00.000Z' }), true);

let pendingReject;
const sandbox = {
  console, URL, setTimeout, clearTimeout, AbortController,
  fetch:(_url, options) => new Promise((_resolve, reject) => {
    pendingReject = reject;
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once:true });
  }),
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename:'cwb-ai-hardening.js' });

assert.equal(sandbox.CWBAI.extractResponseText({ choices:[{ message:{ content:[{ type:'text', text:'片段一' }, { type:'text', text:'片段二' }] } }] }), '片段一片段二');
assert.equal(sandbox.CWBAI.isPrivateAddress('::ffff:7f00:1'), true, 'IPv4-mapped loopback must be rejected');
assert.equal(sandbox.CWBAI.isPrivateAddress('0:0:0:0:0:ffff:7f00:1'), true, 'expanded IPv4-mapped loopback must be rejected');
assert.equal(sandbox.CWBAI.isPrivateAddress('::ffff:192.168.0.1'), true, 'IPv4-mapped private address must be rejected');
assert.equal(sandbox.CWBAI.isPrivateAddress('2001:db8::1'), true, 'IPv6 documentation range must not be treated as public');
assert.equal(sandbox.CWBAI.isPrivateAddress('2001:4860:4860::8888'), false, 'public IPv6 should remain usable');
assert.throws(() => sandbox.CWBAI.normalizeProviderConfig({ key:'custom', baseUrl:'https://user:secret@example.test/v1', model:'demo' }), /AI_PROVIDER_BASE_URL_INVALID/);
assert.throws(() => sandbox.CWBAI.normalizeProviderConfig({ key:'custom', baseUrl:'https://example.test/v1?api_key=secret', model:'demo' }), /AI_PROVIDER_BASE_URL_INVALID/);
assert.throws(() => sandbox.CWBAI.normalizeRelayUrl('https://relay.example/api/ai/chat?token=secret'), /AI_PROVIDER_RELAY_URL_INVALID/);
const nestedRedacted = sandbox.CWBAI.redact({ contact:{ phone:'13812345678', name:'张三' }, identity:{ name:'张三', student_number:'20240001' } }, { categories:['contact'] });
assert.equal(nestedRedacted.contact.phone, '13812345678');
assert.equal(nestedRedacted.contact.name, '[已脱敏]', 'contact authorization must not implicitly authorize nested identity fields');
assert.equal(nestedRedacted.identity.name, '[已脱敏]');

const visionMessage = sandbox.CWBAI.buildVisionMessage('识别', 'data:image/jpeg;base64,abc');
const anthropic = sandbox.CWBAI.normalizeProviderConfig({ key:'custom', protocol:'anthropic', baseUrl:'https://example.test/v1', model:'claude-demo', supportsVision:true });
const anthropicRequest = sandbox.CWBAI.buildChatRequest(anthropic, [visionMessage]);
assert.equal(anthropicRequest.body.messages[0].content[0].type, 'text');
assert.equal(anthropicRequest.body.messages[0].content[1].type, 'image');
assert.equal(anthropicRequest.body.messages[0].content[1].source.media_type, 'image/jpeg');
assert.equal(anthropicRequest.body.messages[0].content[1].source.data, 'abc');
assert.throws(() => sandbox.CWBAI.buildChatRequest({ key:'custom', baseUrl:'https://example.test/v1', model:'text-only' }, [visionMessage]), /AI_PROVIDER_VISION_UNSUPPORTED/);

(async () => {
  await assert.rejects(
    () => sandbox.CWBAI.sendChat({ key:'custom', baseUrl:'https://example.test/v1', model:'demo' }, [{ role:'user', content:'请求' }], { apiKey:'test-key', useRelay:false, timeoutMs:1000 }),
    /AI_PROVIDER_REQUEST_TIMEOUT/,
  );
  assert.equal(typeof pendingReject, 'function');
  sandbox.fetch = async () => ({ ok:true, async json() { return { source:{ url:'https://another.example/policy', title:'错误来源' } }; } });
  await assert.rejects(
    () => sandbox.CWBAI.fetchPublicSource({ url:'https://example.com/policy' }, { relayUrl:'/api/ai/source' }),
    /AI_SOURCE_FETCH_INVALID_RESPONSE/,
  );
  sandbox.fetch = async () => ({ ok:true, status:200, headers:{ get:() => '70000' }, text:async () => JSON.stringify({ choices:[{ message:{ content:'过大响应' } }] }) });
  await assert.rejects(
    () => sandbox.CWBAI.sendChat({ key:'custom', baseUrl:'https://example.test/v1', model:'demo' }, [{ role:'user', content:'请求' }], { apiKey:'test-key', useRelay:false, maxResponseBytes:64 * 1024 }),
    /AI_PROVIDER_RESPONSE_TOO_LARGE/,
    'direct provider responses must be bounded before JSON parsing',
  );
  await assert.rejects(
    () => sandbox.CWBAI.sendChat({ key:'custom', baseUrl:'https://example.test/v1', model:'demo' }, [{ role:'user', content:'x'.repeat(70000) }], { apiKey:'test-key', useRelay:false, maxRequestBytes:64 * 1024 }),
    /AI_PROVIDER_REQUEST_TOO_LARGE/,
    'direct provider requests must be bounded before network transport',
  );
  sandbox.fetch = async () => ({ ok:true, status:200, headers:{ get:() => '' }, json:async () => ({ source:{ url:'https://example.com/policy', title:'x', excerpt:'x'.repeat(600000) } }) });
  await assert.rejects(
    () => sandbox.CWBAI.fetchPublicSource({ url:'https://example.com/policy' }, { relayUrl:'/api/ai/source' }),
    /AI_PROVIDER_RESPONSE_TOO_LARGE/,
    'relay source responses must be bounded in the browser before parsing',
  );
  sandbox.fetch = async () => ({ ok:true, status:200, headers:{ get:() => '' }, text:async () => '{invalid-json' });
  await assert.rejects(
    () => sandbox.CWBAI.sendChat({ key:'custom', baseUrl:'https://example.test/v1', model:'demo' }, [{ role:'user', content:'请求' }], { apiKey:'test-key', useRelay:false }),
    /AI_PROVIDER_INVALID_JSON/,
    'successful non-JSON provider responses must fail safely',
  );
  const cancelController = new AbortController();
  sandbox.fetch = async (_url, options) => ({ ok:true, status:200, headers:{ get:() => '' }, text:async () => { cancelController.abort(); return JSON.stringify({ choices:[{ message:{ content:'不应落库' } }] }); } });
  await assert.rejects(
    () => sandbox.CWBAI.sendChat({ key:'custom', baseUrl:'https://example.test/v1', model:'demo' }, [{ role:'user', content:'请求' }], { apiKey:'test-key', useRelay:false, signal:cancelController.signal }),
    /AI_PROVIDER_REQUEST_ABORTED/,
    'a cancelled request must not become a successful response after the server replies',
  );
  console.log('PASS cwb-ai-hardening');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
