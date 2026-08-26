const assert = require('node:assert/strict');
const { createManager, createEntitlements } = require('../src/core/cwb-license.js');

(async () => {
  const state = { license:null };
  const manager = { getState:() => state };
  let prompted = 0;
  const commercial = createEntitlements(manager, { mode:'commercial', onRequired:() => { prompted += 1; } });
  assert.equal(commercial.has('ai'), false);
  assert.equal(commercial.has('ai_notice_capture'), false);
  assert.throws(() => commercial.require('ai'), error => error.code === 'LICENSE_REQUIRED' && error.feature === 'ai');
  assert.equal(prompted, 1);
  state.license = { ai:true, updates:true, perpetual_updates:false };
  assert.equal(commercial.has('ai_voice_transcription'), true);
  assert.equal(commercial.has('core_update'), true);
  assert.equal(commercial.has('perpetual_updates'), false);
  assert.equal(commercial.require('ai'), true);
  assert.equal(createEntitlements(manager, { mode:'development' }).has('ai'), true);
  const dev = createManager({ mode:'development', storage:{ get:() => null, set:() => {}, remove:() => {} } });
  await dev.ready;
  assert.equal(createEntitlements(dev, { mode:dev.mode }).has('ai'), true);
  console.log('PASS entitlements');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
