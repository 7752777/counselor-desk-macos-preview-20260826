const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeBlob {
  constructor(parts, options = {}) {
    this.type = options.type || '';
    this.name = options.name || '';
    this.bytes = Uint8Array.from(parts.flatMap(part => Array.from(part instanceof Uint8Array ? part : Buffer.from(String(part)))));
    this.size = this.bytes.byteLength;
  }
  async arrayBuffer() { return this.bytes.slice().buffer; }
}

class FakeFormData {
  constructor() { this.values = []; }
  append(name, value, filename) { this.values.push({ name, value, filename }); }
}

function makeSandbox(fetch) {
  const sandbox = {
    console, URL, setTimeout, clearTimeout, Blob:FakeBlob, FormData:FakeFormData,
    btoa:value => Buffer.from(value, 'binary').toString('base64'),
    location:{ protocol:'http:', hostname:'127.0.0.1', origin:'http://127.0.0.1:4173' }, fetch,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync('src/core/cwb-ai.js', 'utf8'), sandbox, { filename:'cwb-ai.js' });
  return sandbox;
}

(async () => {
  const calls = [];
  const sandbox = makeSandbox(async (url, options) => {
    calls.push({ url, options });
    return { ok:true, status:200, headers:{ get:() => '' }, json:async () => ({ text:'整理后的谈话文字' }) };
  });
  const ai = sandbox.CWBAI;
  const config = { key:'custom', baseUrl:'https://example.test/v1', model:'chat-demo', transcriptionModel:'transcribe-demo', supportsAudioTranscription:true, allowedPurposes:['voice_transcription'] };
  const audio = new FakeBlob([Uint8Array.from([1, 2, 3])], { type:'audio/webm', name:'recording.webm' });
  const direct = await ai.sendAudioTranscription(config, audio, { apiKey:'secret-value', useRelay:false });
  assert.equal(direct.text, '整理后的谈话文字');
  assert.equal(direct.model, 'transcribe-demo', 'voice audit output must identify the actual transcription model, not the chat model');
  assert.equal(calls[0].url, 'https://example.test/v1/audio/transcriptions');
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret-value');
  assert.equal(calls[0].options.body instanceof FakeFormData, true);
  assert.equal(calls[0].options.body.values.find(item => item.name === 'file').filename, 'recording.webm');
  const relay = await ai.sendAudioTranscription(config, audio, { apiKey:'secret-value', relayToken:'relay-token' });
  assert.equal(relay.text, '整理后的谈话文字');
  assert.equal(calls[1].url, 'http://127.0.0.1:4173/api/ai/transcribe');
  const relayBody = JSON.parse(calls[1].options.body);
  assert.equal(relayBody.url, 'https://example.test/v1/audio/transcriptions');
  assert.equal(relayBody.apiKey, 'secret-value');
  assert.equal(Buffer.from(relayBody.audioBase64, 'base64').toString('hex'), '010203');
  assert.equal(relayBody.fileName, 'recording.webm');
  assert.equal(calls[1].options.headers['x-ai-relay-token'], 'relay-token');
  assert.equal(ai.normalizeAudioInput({ type:'audio/webm;codecs=opus', size:3 }).mimeType, 'audio/webm');
  assert.equal(ai.normalizeAudioInput({ type:'audio/mp4', name:'recording.webm', size:3 }).name, 'counselor-voice.m4a', 'the uploaded filename must match the actual MIME type');
  assert.throws(() => ai.normalizeAudioInput({ type:'video/mp4', size:3 }), /AI_AUDIO_MIME_UNSUPPORTED/);
  assert.throws(() => ai.normalizeAudioInput({ type:'audio/webm', size:26 * 1024 * 1024 }), /AI_AUDIO_TOO_LARGE/);
  const silentWav = ai.createSilentWav(320);
  assert.equal(Buffer.from(silentWav.slice(0, 4)).toString(), 'RIFF', 'the endpoint probe must use a valid WAV container');
  assert.equal(Buffer.from(silentWav.slice(8, 12)).toString(), 'WAVE', 'the endpoint probe must use a WAV header');
  const notDeclared = ai.transcriptionReadiness(ai.normalizeProviderConfig({ key:'custom', baseUrl:'https://example.test/v1', model:'chat-model', allowedPurposes:['voice_transcription'] }), { credentialsAvailable:true });
  assert.equal(notDeclared.code, 'AI_PROVIDER_AUDIO_UNSUPPORTED', 'chat capability must not imply speech capability');
  const voiceConfig = ai.normalizeProviderConfig({ key:'custom', baseUrl:'https://example.test/v1', model:'chat-model', transcriptionModel:'transcribe-demo', supportsAudioTranscription:true, allowedPurposes:['voice_transcription'] });
  const voiceReady = ai.transcriptionReadiness(voiceConfig, { credentialsAvailable:true });
  assert.equal(voiceReady.ok, true, 'a declared OpenAI-compatible transcription provider should be ready');
  assert.equal(voiceReady.model, 'transcribe-demo');
  await assert.rejects(
    () => ai.sendAudioTranscription(Object.assign({}, config, { supportsAudioTranscription:false }), audio, { apiKey:'secret-value', useRelay:false }),
    /AI_PROVIDER_AUDIO_UNSUPPORTED/,
    'the low-level audio transport must not bypass the provider capability declaration'
  );
  const webmOnly = ai.normalizeProviderConfig({ key:'custom', baseUrl:'https://example.test/v1', model:'chat-model', transcriptionModel:'transcribe-demo', supportsAudioTranscription:true, audioMimeTypes:'audio/webm', allowedPurposes:['voice_transcription'] });
  assert.deepEqual(Array.from(webmOnly.audioMimeTypes), ['audio/webm'], 'provider audio MIME declarations should be normalized once at configuration time');
  assert.equal(ai.transcriptionReadiness(webmOnly, { credentialsAvailable:true, captureMimeTypes:['audio/mp4'] }).code, 'AI_AUDIO_CAPTURE_FORMAT_UNSUPPORTED', 'a declared provider format must block incompatible browser capture before recording');
  assert.equal(ai.transcriptionReadiness(webmOnly, { credentialsAvailable:true, captureMimeTypes:['audio/webm'] }).ok, true, 'a compatible browser capture format should remain ready');
  await assert.rejects(
    () => ai.sendAudioTranscription(webmOnly, new FakeBlob([Uint8Array.from([1, 2, 3])], { type:'audio/mp4', name:'recording.m4a' }), { apiKey:'secret-value', useRelay:false }),
    /AI_AUDIO_CAPTURE_FORMAT_UNSUPPORTED/,
    'the request layer must repeat the declared-format guard after recording'
  );
  const unavailable = makeSandbox(async () => ({ ok:false, status:404, headers:{ get:() => '' }, json:async () => ({ error:{ message:'not found' } }) }));
  await assert.rejects(() => unavailable.CWBAI.sendAudioTranscription(config, audio, { apiKey:'secret-value', useRelay:false }), /AI_AUDIO_ENDPOINT_UNAVAILABLE/);
  const emptyResponse = makeSandbox(async () => ({ ok:true, status:200, headers:{ get:() => '' }, json:async () => ({ text:'' }) }));
  const probeAudio = new emptyResponse.Blob([emptyResponse.CWBAI.createSilentWav(320)], { type:'audio/wav' });
  const probe = await emptyResponse.CWBAI.sendAudioTranscription(config, probeAudio, { apiKey:'secret-value', useRelay:false, allowEmptyText:true });
  assert.equal(probe.empty_transcript, true, 'an endpoint probe may validly return an empty transcript');
  console.log('PASS ai-voice-contract');
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
