const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/core/cwb-ai.js', 'utf8');
const calls = [];
const sandbox = {
  console,
  URL,
  location:{ protocol:'http:', hostname:'127.0.0.1', origin:'http://127.0.0.1:4173' },
  fetch:async (url, options) => {
    calls.push({ url, options });
    const request = JSON.parse(options.body);
    return { ok:true, json:async () => request.wire_api === 'responses'
      ? ({ output:[{ content:[{ type:'output_text', text:'relay-responses-ok' }] }] })
      : ({ choices:[{ message:{ content:'relay-ok' } }] }) };
  },
};
sandbox.globalThis = sandbox;
sandbox.CWB_AI_LICENSE_ASSERTION = 'CWB-REL-1.test.assertion';
vm.runInNewContext(source, sandbox, { filename:'cwb-ai.js' });

(async () => {
  const ai = sandbox.CWBAI;
  const config = { key:'custom', baseUrl:'https://queqiao.online/v1', model:'gpt5.5' };
  const relayResult = await ai.sendChat(config, [{ role:'user', content:'hello' }], { apiKey:'secret-value', relayToken:'relay-token-test' });
  assert.equal(relayResult.text, 'relay-ok');
  assert.equal(calls[0].url, 'http://127.0.0.1:4173/api/ai/chat');
  assert.equal(calls[0].options.headers['content-type'], 'application/json');
  assert.equal(calls[0].options.headers['x-ai-relay-token'], 'relay-token-test');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(JSON.parse(calls[0].options.body).apiKey, 'secret-value');
  assert.equal(JSON.parse(calls[0].options.body).url, 'https://queqiao.online/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].options.body).license_assertion, 'CWB-REL-1.test.assertion');

  const responsesConfig = { key:'custom', baseUrl:'https://queqiao.online/v1', model:'gpt5.5', wireApi:'responses' };
  const responsesResult = await ai.sendChat(responsesConfig, [{ role:'user', content:'responses' }], { apiKey:'secret-value', relayToken:'relay-token-test' });
  assert.equal(responsesResult.text, 'relay-responses-ok');
  assert.equal(JSON.parse(calls[1].options.body).url, 'https://queqiao.online/v1/responses');
  assert.equal(JSON.parse(calls[1].options.body).wire_api, 'responses');

  await ai.sendChat(config, [{ role:'user', content:'direct' }], { apiKey:'secret-value', useRelay:false });
  assert.equal(calls[2].url, 'https://queqiao.online/v1/chat/completions');
  assert.equal(calls[2].options.headers.authorization, 'Bearer secret-value');
  assert.equal(calls[2].options.redirect, 'error');

  console.log('PASS cwb-ai-relay-runtime');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
