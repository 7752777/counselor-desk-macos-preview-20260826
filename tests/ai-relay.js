const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const relay = require('../scripts/ai-relay');

const allowedOrigin = 'http://127.0.0.1:4173';
const allowedHosts = new Set(['queqiao.online']);

function input(overrides = {}) {
  return Object.assign({
    protocol:'openai-compatible',
    url:'https://queqiao.online/v1/chat/completions',
    apiKey:'test-key-not-real',
    body:{ model:'demo', messages:[{ role:'user', content:'hello' }] },
  }, overrides);
}

function mockRequest(body, headers = {}, method = 'POST') {
  const request = Readable.from(body == null ? [] : [body]);
  Object.assign(request, {
    method,
    url:relay.RELAY_PATH,
    headers:Object.assign({ host:'relay.test' }, headers),
  });
  return request;
}

function mockResponse() {
  return {
    statusCode:0,
    headers:{},
    body:'',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    end(value = '') { this.body = String(value); this.ended = true; },
  };
}

async function runRelay(body, headers, options, method = 'POST') {
  const response = mockResponse();
  const handled = await relay.handleAiRelayRequest(mockRequest(body, headers, method), response, options);
  assert.equal(handled, true);
  return response;
}

(async () => {
  assert.deepEqual([...relay.parseAllowedOrigins(`${allowedOrigin}, https://example.test`)], [allowedOrigin, 'https://example.test']);
  assert.deepEqual([...relay.parseAllowedHosts('queqiao.online, API.OPENAI.COM.')], ['queqiao.online', 'api.openai.com']);

  assert.equal(relay.isPrivateAddress('0.0.0.0'), true);
  assert.equal(relay.isPrivateAddress('10.0.0.1'), true);
  assert.equal(relay.isPrivateAddress('100.64.0.1'), true);
  assert.equal(relay.isPrivateAddress('192.0.2.1'), true);
  assert.equal(relay.isPrivateAddress('192.88.99.1'), true);
  assert.equal(relay.isPrivateAddress('198.18.0.1'), true);
  assert.equal(relay.isPrivateAddress('203.0.113.1'), true);
  assert.equal(relay.isPrivateAddress('224.0.0.1'), true);
  assert.equal(relay.isPrivateAddress('::'), true);
  assert.equal(relay.isPrivateAddress('::1'), true);
  assert.equal(relay.isPrivateAddress('::ffff:7f00:1'), true);
  assert.equal(relay.isPrivateAddress('fe80::1'), true);
  assert.equal(relay.isPrivateAddress('fc00::1'), true);
  assert.equal(relay.isPrivateAddress('2001:db8::1'), true);
  assert.equal(relay.isPrivateAddress('104.18.24.10'), false);

  await assert.rejects(
    () => relay.validateTarget('http://example.test/v1/chat/completions', async () => [{ address:'104.18.24.10', family:4 }], new Set(['example.test'])),
    /AI_RELAY_TARGET_REJECTED/,
  );
  await assert.rejects(
    () => relay.validateTarget('https://127.0.0.1/v1/chat/completions', async () => [{ address:'127.0.0.1', family:4 }], new Set(['127.0.0.1'])),
    /AI_RELAY_TARGET_REJECTED/,
  );
  await assert.rejects(
    () => relay.validateTarget('https://queqiao.online/v1/chat/completions', async () => [
      { address:'104.18.24.10', family:4 }, { address:'192.168.1.20', family:4 },
    ], allowedHosts),
    /AI_RELAY_TARGET_REJECTED/,
  );
  await assert.rejects(
    () => relay.validateTarget('https://unknown.example/v1/chat/completions', async () => [{ address:'104.18.24.10', family:4 }], allowedHosts),
    /AI_RELAY_TARGET_HOST_FORBIDDEN/,
  );
  await assert.rejects(
    () => relay.validateTarget('https://queqiao.online:8443/v1/chat/completions', async () => [{ address:'104.18.24.10', family:4 }], allowedHosts),
    /AI_RELAY_TARGET_REJECTED/,
  );
  assert.equal(
    await relay.validateTarget('https://queqiao.online/v1/chat/completions', async () => [{ address:'104.18.24.10', family:4 }], allowedHosts),
    'https://queqiao.online/v1/chat/completions',
  );
  assert.equal(
    await relay.validateTarget('https://queqiao.online/v1/responses', async () => [{ address:'104.18.24.10', family:4 }], allowedHosts),
    'https://queqiao.online/v1/responses',
  );

  assert.throws(
    () => relay.validatePayload({ protocol:'openai-compatible', url:'https://queqiao.online/v1/chat/completions', apiKey:'test-key-not-real', body:{ model:'demo' } }),
    /AI_RELAY_REQUEST_INVALID/,
  );

  let upstreamRequest;
  const requestImpl = async request => {
    upstreamRequest = request;
    return { status:200, contentType:'application/json', body:'{"choices":[{"message":{"content":"ok"}}]}' };
  };
  const forwarded = await relay.forwardAiRequest(input(), {
    lookup:async () => [{ address:'104.18.24.10', family:4 }],
    allowedHosts,
    requestImpl,
  });
  assert.equal(forwarded.status, 200);
  assert.equal(upstreamRequest.target.toString(), 'https://queqiao.online/v1/chat/completions');
  assert.equal(upstreamRequest.address, '104.18.24.10');
  assert.equal(upstreamRequest.headers.authorization, 'Bearer test-key-not-real');
  assert.equal(upstreamRequest.headers['content-type'], 'application/json');
  assert.equal(JSON.stringify(upstreamRequest.body).includes('test-key-not-real'), false);

  const responsesPayload = input({
    wire_api:'responses', url:'https://queqiao.online/v1/responses',
    body:{ model:'demo', input:[{ role:'user', content:[{ type:'input_text', text:'hello' }] }] },
  });
  const responsesForwarded = await relay.forwardAiRequest(responsesPayload, {
    lookup:async () => [{ address:'104.18.24.10', family:4 }], allowedHosts,
    requestImpl:async request => { upstreamRequest = request; return { status:200, contentType:'application/json', body:'{"output":[{"content":[{"type":"output_text","text":"ok"}]}]}' }; },
  });
  assert.equal(responsesForwarded.status, 200);
  assert.equal(upstreamRequest.target.toString(), 'https://queqiao.online/v1/responses');
  assert.equal(upstreamRequest.body.input[0].content[0].type, 'input_text');
  await assert.rejects(
    () => relay.forwardAiRequest(input({ url:'https://queqiao.online/v1/responses' }), { lookup:async () => [{ address:'104.18.24.10', family:4 }], allowedHosts, requestImpl }),
    /AI_RELAY_TARGET_PROTOCOL_MISMATCH/,
  );

  await assert.rejects(
    () => relay.forwardAiRequest(input(), {
      lookup:async () => [{ address:'104.18.24.10', family:4 }],
      allowedHosts,
      requestImpl:async () => { throw new Error('upstream error test-key-not-real'); },
    }),
    /AI_RELAY_UPSTREAM_UNAVAILABLE/,
  );
  await assert.rejects(
    () => relay.forwardAiRequest(input(), {
      lookup:async () => [{ address:'104.18.24.10', family:4 }],
      allowedHosts,
      requestImpl:async () => ({ status:200, body:'x'.repeat(relay.MAX_RESPONSE_BYTES + 1) }),
    }),
    /AI_RELAY_RESPONSE_TOO_LARGE/,
  );

  const handlerOptions = {
    allowedOrigins:new Set([allowedOrigin]),
    relayToken:'relay-token-test',
    requireToken:true,
    allowedHosts,
    lookup:async () => [{ address:'104.18.24.10', family:4 }],
    requestImpl,
  };
  let response = await runRelay('', {}, handlerOptions, 'OPTIONS');
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error.code, 'AI_RELAY_ORIGIN_FORBIDDEN');

  response = await runRelay('', { origin:'https://untrusted.example' }, handlerOptions, 'OPTIONS');
  assert.equal(response.statusCode, 403);
  assert.equal(JSON.parse(response.body).error.code, 'AI_RELAY_ORIGIN_FORBIDDEN');

  response = await runRelay('', { origin:allowedOrigin }, handlerOptions, 'OPTIONS');
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], allowedOrigin);
  assert.match(response.headers['access-control-allow-headers'], /x-ai-relay-token/);

  response = await runRelay(JSON.stringify(input()), { origin:allowedOrigin }, handlerOptions);
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).error.code, 'AI_RELAY_TOKEN_INVALID');

  response = await runRelay(JSON.stringify(input()), { origin:allowedOrigin, 'x-ai-relay-token':'relay-token-test' }, handlerOptions);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['access-control-allow-origin'], allowedOrigin);
  assert.equal(JSON.parse(response.body).choices[0].message.content, 'ok');

  console.log('PASS ai-relay');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
