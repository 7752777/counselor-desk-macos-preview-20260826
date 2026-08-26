const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const relay = require('../scripts/ai-relay');

const origin = 'http://127.0.0.1:4173';
const allowedHosts = new Set(['queqiao.online']);
const payload = {
  protocol:'openai-compatible', url:'https://queqiao.online/v1/audio/transcriptions', apiKey:'test-key-not-real', model:'transcribe-demo',
  fileName:'recording.webm', mimeType:'audio/webm', audioBase64:Buffer.from([1, 2, 3]).toString('base64'),
};

function mockRequest(body, pathname = relay.TRANSCRIBE_RELAY_PATH, headers = {}, method = 'POST') {
  const request = Readable.from([body]);
  Object.assign(request, { method, url:pathname, headers:Object.assign({ host:'relay.test' }, headers) });
  return request;
}

function mockResponse() {
  return { statusCode:0, headers:{}, body:'', setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); }, end(value = '') { this.body = String(value); this.ended = true; } };
}

(async () => {
  const parsed = relay.validateAudioPayload(payload);
  assert.equal(parsed.audio.toString('hex'), '010203');
  assert.throws(() => relay.validateAudioPayload(Object.assign({}, payload, { audioBase64:'@@@' })), /AI_RELAY_REQUEST_INVALID/);
  await assert.rejects(
    () => relay.validateTarget('http://queqiao.online/v1/audio/transcriptions', async () => [{ address:'104.18.24.10', family:4 }], allowedHosts),
    /AI_RELAY_TARGET/
  );
  let upstream;
  const forwarded = await relay.forwardAudioRequest(payload, {
    lookup:async () => [{ address:'104.18.24.10', family:4 }], allowedHosts,
    requestImpl:async request => { upstream = request; return { status:200, contentType:'application/json', body:'{"text":"ok"}' }; },
  });
  assert.equal(forwarded.status, 200);
  assert.equal(upstream.target.toString(), payload.url);
  assert.equal(upstream.payload.audio.toString('hex'), '010203');
  assert.equal(upstream.headers.authorization, 'Bearer test-key-not-real');
  assert.equal(upstream.payload.apiKey, 'test-key-not-real');

  const options = { allowedOrigins:new Set([origin]), relayToken:'relay-token', requireToken:true, allowedHosts, lookup:async () => [{ address:'104.18.24.10', family:4 }], requestImpl:async () => ({ status:200, contentType:'application/json', body:'{"text":"ok"}' }) };
  const response = mockResponse();
  const handled = await relay.handleAiRelayRequest(mockRequest(JSON.stringify(payload), relay.TRANSCRIBE_RELAY_PATH, { origin, 'x-ai-relay-token':'relay-token' }), response, options);
  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).text, 'ok');
  console.log('PASS ai-voice-relay');
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
