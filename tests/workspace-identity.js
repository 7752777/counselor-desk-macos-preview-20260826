const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const source = fs.readFileSync(path.join(__dirname, '..', 'output', 'v4-preview.html'), 'utf8');

function signedToken(privateKey, payload) {
  const segment = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `CWB-LIC-1.${segment}.${crypto.sign(null, Buffer.from(segment, 'utf8'), privateKey).toString('base64url')}`;
}

async function openWorkspace(settings, options) {
  const opts = options || {};
  const errors = [];
  const calls = [];
  const config = opts.config || "window.CWB_LICENSE_MODE='development';window.CWB_LICENSE_PUBLIC_KEYS={};window.CWB_LICENSE_SERVICE_URL='';";
  const html = source.replace(/<script data-cwb-license-config>[\s\S]*?<\/script>/, `<script data-cwb-license-config>${config}</script>`);
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message)); });
  const dom = new JSDOM(html, {
    runScripts:'dangerously', resources:'usable', url:'https://workspace-identity.local/', pretendToBeVisual:true, virtualConsole,
    beforeParse(window) {
      window.cwbDesktop = {};
      window.scrollTo = () => {};
      window.TextDecoder = TextDecoder;
      window.TextEncoder = TextEncoder;
      try { Object.defineProperty(window, 'crypto', { value:crypto.webcrypto, configurable:true }); } catch (_) {}
      if (settings) window.localStorage.setItem('cwb_v1_settings', JSON.stringify(settings));
      if (opts.fetch) window.fetch = async (url, request) => {
        if (!opts.token) throw new Error('TEST_TOKEN_MISSING');
        calls.push({ url:String(url), body:request && request.body ? JSON.parse(request.body) : null });
        return { ok:true, status:200, json:async () => ({ token:opts.token }) };
      };
    },
  });
  await wait(900);
  return { dom, window:dom.window, settings:JSON.parse(dom.window.localStorage.getItem('cwb_v1_settings') || '{}'), calls, errors };
}

(async () => {
  const first = await openWorkspace(null);
  assert.match(first.settings.workspace_id, /^workspace_[A-Za-z0-9]+$/);
  assert.notEqual(first.settings.workspace_id, 'local-workspace');
  assert.notEqual(first.settings.workspace_id, 'workspace-local');
  assert.equal(first.settings.org_code, 'demo');
  assert.deepEqual(first.errors, []);
  first.dom.window.close();

  const legacy = await openWorkspace({ org_code:'shared-org', onboarding:{ completed:true } });
  assert.match(legacy.settings.workspace_id, /^workspace_[A-Za-z0-9]+$/);
  assert.notEqual(legacy.settings.workspace_id, 'shared-org', 'organization code must not become a shared commercial identity');
  assert.notEqual(legacy.settings.workspace_id, 'local-workspace');
  legacy.dom.window.close();

  const reserved = await openWorkspace({ org_code:'shared-org', workspace_id:'local-workspace', onboarding:{ completed:true } });
  assert.match(reserved.settings.workspace_id, /^workspace_[A-Za-z0-9]+$/);
  assert.notEqual(reserved.settings.workspace_id, 'local-workspace');
  reserved.dom.window.close();

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ type:'spki', format:'der' }).toString('base64');
  const token = signedToken(privateKey, {
    license_id:'lic_workspace_identity', product_id:'counselor-desk', plan:'standard_perpetual', ai:false,
    perpetual_updates:true, major_version:4, device_limit:3, issued_at:'2026-08-25T00:00:00.000Z',
    status:'active', kid:'workspace-identity-test', workspace_id:'server-bound-workspace',
  });
  const commercial = await openWorkspace(null, {
    fetch:true, token,
    config:`window.CWB_LICENSE_MODE='commercial';window.CWB_LICENSE_PUBLIC_KEYS=${JSON.stringify({ 'workspace-identity-test':publicDer })};window.CWB_LICENSE_SERVICE_URL='https://license.test';`,
  });
  const workspaceId = commercial.settings.workspace_id;
  await commercial.window.CWB.license.redeem(`CWB-REDEEM-1.${crypto.randomBytes(32).toString('base64url')}`);
  await commercial.window.CWB.license.refresh();
  const licenseCalls = commercial.calls.filter(item => item.body && item.body.workspace_id);
  assert.equal(licenseCalls.length, 2, 'redemption and refresh should both send workspace identity');
  assert.deepEqual(licenseCalls.map(item => item.body.workspace_id), [workspaceId, workspaceId]);
  assert.notEqual(workspaceId, 'local-workspace');
  assert.deepEqual(commercial.errors, []);
  commercial.dom.window.close();
  console.log('PASS workspace-identity');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
