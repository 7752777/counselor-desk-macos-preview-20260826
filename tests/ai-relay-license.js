const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const relay = require('../scripts/ai-relay');
const relayCore = require('../src/core/cwb-license-relay.js');

const origin = 'http://127.0.0.1:4173';
const allowedHosts = new Set(['queqiao.online']);
const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
const publicDer = publicKey.export({ type:'spki', format:'der' }).toString('base64');
const issuedAt = new Date('2026-08-23T12:00:00.000Z');
const payload = { kid:'relay-test', license_id:'lic-relay-test', product_id:'counselor-desk', ai:true, issued_at:issuedAt.toISOString(), expires_at:new Date(issuedAt.getTime() + 5 * 60 * 1000).toISOString() };
const segment = Buffer.from(JSON.stringify(payload)).toString('base64url');
const assertion = `${relayCore.TOKEN_PREFIX}.${segment}.${crypto.sign(null, Buffer.from(segment), privateKey).toString('base64url')}`;

function request(body, headers = {}) { const value = Readable.from([body]); Object.assign(value, { method:'POST', url:relay.RELAY_PATH, headers:Object.assign({ host:'relay.test', origin }, headers) }); return value; }
function response() { return { statusCode:0, headers:{}, body:'', setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); }, end(value = '') { this.body = String(value); } }; }
function chat(license_assertion) { return JSON.stringify({ protocol:'openai-compatible', url:'https://queqiao.online/v1/chat/completions', apiKey:'model-key', body:{ model:'demo', messages:[{ role:'user', content:'hello' }] }, license_assertion }); }

(async () => {
  const options = { allowedOrigins:new Set([origin]), allowedHosts, requireToken:false, requireLicense:true, licensePublicKeys:{ 'relay-test':publicDer }, now:issuedAt.getTime(), lookup:async () => [{ address:'104.18.24.10', family:4 }], requestImpl:async value => { assert.equal(value.body.messages[0].content, 'hello'); assert.equal(JSON.stringify(value.body).includes(assertion), false); return { status:200, contentType:'application/json', body:'{"choices":[{"message":{"content":"ok"}}]}' }; } };
  let result = response();
  await relay.handleAiRelayRequest(request(chat('')), result, options);
  assert.equal(result.statusCode, 401);
  assert.equal(JSON.parse(result.body).error.code, 'AI_LICENSE_ASSERTION_INVALID');
  result = response();
  await relay.handleAiRelayRequest(request(chat(assertion)), result, options);
  assert.equal(result.statusCode, 200);
  assert.equal(JSON.parse(result.body).choices[0].message.content, 'ok');
  await assert.rejects(() => relay.verifyLicenseAssertion(assertion, { requireLicense:true, licensePublicKeys:{ 'relay-test':publicDer }, now:issuedAt.getTime() + 12 * 60 * 1000 }), error => error.code === 'AI_LICENSE_ASSERTION_EXPIRED');
  console.log('PASS ai-relay-license');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
