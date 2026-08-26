const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const license = require('../src/core/cwb-license.js');

function token(privateKey, payload) {
  const segment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `CWB-LIC-1.${segment}.${crypto.sign(null, Buffer.from(segment, 'utf8'), privateKey).toString('base64url')}`;
}

(async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ type:'spki', format:'der' }).toString('base64');
  const code = `CWB-REDEEM-1.${crypto.randomBytes(32).toString('base64url')}`;
  const signedToken = token(privateKey, { license_id:'lic_redeemed_client', product_id:'counselor-desk', plan:'ai_perpetual', ai:true, perpetual_updates:true, major_version:4, device_limit:3, issued_at:'2026-08-23T00:00:00.000Z', status:'active', kid:'client-redemption' });
  const calls = [];
  let stored = null;
  const manager = license.createManager({
    mode:'commercial', currentVersion:'4.9.0', publicKeys:{ 'client-redemption':publicDer },
    storage:{ get:() => stored, set:value => { stored = value; }, remove:() => { stored = null; } },
    workspaceId:() => 'client-workspace',
    transport:{
      redeem:async input => { calls.push(input); return { token:signedToken }; },
      activate:async () => { throw new Error('formal activation must not handle a redemption code'); },
    },
    now:() => Date.parse('2026-08-23T12:00:00.000Z'),
  });
  await manager.ready;
  assert.equal(manager.isRedemptionCode(code), true);
  assert.equal(manager.isRedemptionCode('CWB-REDEEM-1.short'), false);
  const state = await manager.redeem(code);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workspace_id, 'client-workspace');
  assert.equal(state.license.plan, 'ai_perpetual');
  assert.equal(state.license.ai, true);
  assert.equal(stored.token, signedToken);
  await assert.rejects(() => manager.redeem('CWB-REDEEM-1.bad'), error => error.code === 'REDEMPTION_CODE_INVALID');
  console.log('PASS redemption-client');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
