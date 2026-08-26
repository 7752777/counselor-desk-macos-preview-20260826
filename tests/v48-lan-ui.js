const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

(async () => {
  const errors = [];
  const desktopStatus = { running:true, addresses:['192.168.1.20'], port:43123, fingerprint:'aa:bb:cc:dd', status:{ devices:[], pending_pairings:[] } };
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Could not load script:.*(?:xlsx|argon2|jszip|echarts)|Not implemented: HTMLCanvasElement/.test(error.message)) errors.push(error.message); });
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'output', 'v4-preview.html'), { runScripts:'dangerously', resources:'usable', url:'https://c.local/', pretendToBeVisual:true, virtualConsole, beforeParse(window) {
    window.requestAnimationFrame = callback => window.setTimeout(callback, 0); window.scrollTo = () => {};
    window.cwbDesktop = {
      lanSyncStatus:async () => desktopStatus,
      lanSyncStart:async () => desktopStatus,
      lanSyncStop:async () => ({ running:false }),
      lanSyncPairingCode:async () => ({ pairing_id:'pairing-test', code:'123456', expires_at:'2026-08-21T12:00:00.000Z' }),
      lanSyncPairingQr:async () => ({ pairing_id:'pairing-test', code:'12345678', expires_at:'2026-08-21T12:00:00.000Z', host:'https://192.168.1.20:43123', fingerprint:'aa:bb:cc:dd', data_url:'data:image/png;base64,aGVsbG8=' }),
      lanSyncConfirmPairing:async () => ({ ok:true }),
      lanSyncPauseDevice:async () => ({ ok:true }),
      lanSyncResumeDevice:async () => ({ ok:true }),
      lanSyncRevokeDevice:async () => ({ ok:true }),
    };
  } });
  await new Promise(resolve => setTimeout(resolve, 850));
  assert.ok(dom.window.CWB.sync, 'sync facade should be available');
  assert.equal(typeof dom.window.CWB.sync.createPhonePackage, 'function', 'LAN facade must preserve phone export');
  assert.equal(typeof dom.window.CWB.sync.applyPhonePackage, 'function', 'LAN facade must preserve phone import');
  assert.equal(typeof dom.window.CWB.sync.previewPhonePackage, 'function', 'LAN facade must preserve phone diff preview');
  assert.equal(typeof dom.window.CWB.sync.host, 'object', 'LAN host facade should be exposed');
  assert.equal(typeof dom.window.CWB.sync.client, 'object', 'LAN client facade should be exposed');
  assert.ok(dom.window.document.querySelector('[data-view="bridge"]'), 'legacy platform bridge navigation entry is present');
  const button = dom.window.document.querySelector('[data-view="v48-sync"]');
  assert.ok(button, 'v4.8 LAN sync navigation entry is present');
  button.click();
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.match(dom.window.document.body.textContent, /局域网数据中枢/);
  assert.ok(dom.window.document.querySelector('[data-act="v48-sync-pair-status"]'), 'client pairing flow exposes one-time token polling');
  assert.ok(dom.window.document.querySelector('[data-act="v48-sync-auto-toggle"]'), 'client sync exposes an explicit auto-sync toggle');
  assert.match(dom.window.document.body.textContent, /桌面端功能/);
  const uploadForm = dom.window.document.querySelector('[data-v48-attachment-upload]');
  assert.ok(uploadForm, 'LAN sync page exposes an attachment upload form');
  assert.ok(uploadForm.querySelector('[data-v48-attachment-file]'), 'attachment upload uses a file picker');
  assert.ok(uploadForm.querySelector('[data-v48-upload-status]'), 'attachment upload exposes progress/status text');
  assert.match(uploadForm.textContent, /上传并校验/);
  assert.ok(dom.window.document.querySelector('[data-v48-queue-storage]'), 'offline queue exposes its actual persistence layer');
  const desktopQueueBoundary = dom.window.document.querySelector('[data-v48-queue-boundary]');
  assert.ok(desktopQueueBoundary, 'offline queue exposes a storage boundary notice');
  assert.match(desktopQueueBoundary.textContent, /桌面工作区仓储/);

  // A browser without IndexedDB must never be described as having a
  // database-encrypted queue. This emulates the compatibility path without
  // changing the normal desktop fixture used by the rest of this test.
  const desktopBridge = dom.window.cwbDesktop;
  dom.window.cwbDesktop = null;
  dom.window.CWB_V4_IDB_ACTIVE = false;
  dom.window.CWBV46Runtime.go('v48-sync');
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.match(dom.window.document.querySelector('[data-v48-queue-storage]').textContent, /兼容离线队列/);
  assert.match(dom.window.document.querySelector('[data-v48-queue-boundary]').textContent, /未使用数据库级加密/);
  dom.window.cwbDesktop = desktopBridge;
  dom.window.CWBV46Runtime.go('v48-sync');
  await new Promise(resolve => setTimeout(resolve, 40));
  const qrForm = dom.window.document.querySelector('[data-v48-sync-qr]');
  assert.ok(qrForm, 'client pairing exposes a QR payload input');
  assert.match(dom.window.document.querySelector('.v48-qr-card').textContent, /不会自动连接/);
  const qr = dom.window.CWBV48.createPairingQrPayload({
    host:'https://192.168.1.20:43123',
    workspace_id:'workspace-local',
    pairing_id:'pairing_client_test',
    code:'87654321',
    fingerprint:'aa:bb:cc:dd:ee:ff',
    expires_at:new Date(Date.now() + 300000).toISOString(),
  });
  qrForm.querySelector('[data-v48-field="qr_payload"]').value = qr.payload;
  qrForm.dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(dom.window.document.querySelector('[data-v48-sync-connect] [data-v48-field="base_url"]').value, 'https://192.168.1.20:43123');
  assert.equal(dom.window.document.querySelector('[data-v48-sync-connect] [data-v48-field="workspace_id"]').value, 'workspace-local');
  assert.equal(dom.window.document.querySelector('[data-v48-sync-connect] [data-v48-field="fingerprint"]').value, 'aa:bb:cc:dd:ee:ff');
  assert.equal(dom.window.document.querySelector('[data-v48-sync-pair] [data-v48-field="pairing_id"]').value, 'pairing_client_test');
  assert.equal(dom.window.document.querySelector('[data-v48-sync-pair] [data-v48-field="code"]').value, '87654321');
  assert.equal(dom.window.CWBV46Runtime.app.v48.syncToken, '', 'pairing QR fill must not create a device token');
  assert.ok(!String(dom.window.localStorage.getItem('cwb_v1_ui_state') || '').includes('87654321'), 'pairing code must not enter durable UI state');
  const invalidForm = dom.window.document.querySelector('[data-v48-sync-qr]');
  invalidForm.querySelector('[data-v48-field="qr_payload"]').value = qr.payload + '&token=secret';
  invalidForm.dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(dom.window.document.querySelector('#toast-root').textContent, /二维码解析失败/);
  assert.ok(!JSON.stringify(dom.window.CWBV46Runtime.app).includes('secret'), 'invalid QR payload must not enter application state');
  const offlineClient = dom.window.CWBV48UI.syncClient();
  offlineClient.enqueue('students', 'offline-student', { advisor_name:'测试导师' }, 0);
  await new Promise(resolve => setTimeout(resolve, 80));
  const outbox = dom.window.CWBV46Runtime.DB.custom.v4_sync_outbox || [];
  assert.ok(outbox.some(item => item && item.kind === 'client_outbox' && item.record_id === 'offline-student'), 'offline queue must persist in the sync outbox collection');
  assert.equal(offlineClient.snapshot().has_token, false, 'offline queue persistence must not create a token');

  // The same device may work with more than one local workspace. Durable
  // state must be keyed by both values so switching workspaces cannot expose
  // another workspace's queue after a refresh.
  const appState = dom.window.CWBV46Runtime.app;
  appState.v48.syncClient = null;
  appState.v48.syncState = { workspace_id:'workspace-a', device_id:'shared-device', base_url:'https://a.local' };
  const workspaceA = dom.window.CWBV48UI.syncClient();
  workspaceA.enqueue('students', 'workspace-a-student', { class_name:'A 班' }, 0);
  await new Promise(resolve => setTimeout(resolve, 80));
  appState.v48.syncClient = null;
  appState.v48.syncState = { workspace_id:'workspace-b', device_id:'shared-device', base_url:'https://b.local' };
  const workspaceB = dom.window.CWBV48UI.syncClient();
  workspaceB.enqueue('students', 'workspace-b-student', { class_name:'B 班' }, 0);
  await new Promise(resolve => setTimeout(resolve, 80));
  const revisions = dom.window.CWBV46Runtime.DB.custom.v4_sync_revisions || [];
  assert.ok(revisions.some(item => item.workspace_id === 'workspace-a' && item.device_id === 'shared-device'), 'workspace A state must persist independently');
  assert.ok(revisions.some(item => item.workspace_id === 'workspace-b' && item.device_id === 'shared-device'), 'workspace B state must persist independently');
  appState.v48.syncClient = null;
  appState.v48.syncState = { workspace_id:'workspace-a', device_id:'shared-device' };
  const restoredA = dom.window.CWBV48UI.syncClient();
  assert.ok(restoredA.snapshot().queue.some(item => item.record_id === 'workspace-a-student'), 'workspace A refresh must restore only its own queue');
  assert.equal(restoredA.snapshot().queue.some(item => item.record_id === 'workspace-b-student'), false, 'workspace A refresh must not restore workspace B queue');
  appState.v48.syncClient = null;
  appState.v48.syncState = { workspace_id:'workspace-b', device_id:'shared-device' };
  const restoredB = dom.window.CWBV48UI.syncClient();
  assert.ok(restoredB.snapshot().queue.some(item => item.record_id === 'workspace-b-student'), 'workspace B refresh must restore only its own queue');
  assert.equal(restoredB.snapshot().queue.some(item => item.record_id === 'workspace-a-student'), false, 'workspace B refresh must not restore workspace A queue');
  dom.window.CWBV46Runtime.app.lanSyncStatus = desktopStatus;
  dom.window.CWBV46Runtime.go('bridge');
  await new Promise(resolve => setTimeout(resolve, 80));
  const pairButton = dom.window.document.querySelector('[data-act="lan-sync-pair"]');
  assert.ok(pairButton, 'desktop LAN page exposes pairing action');
  pairButton.click();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(dom.window.document.querySelectorAll('[data-lan-pair-copy]').length, 4, 'pairing modal exposes copy actions for address, id, code and fingerprint');
  assert.ok(dom.window.document.querySelector('[data-lan-pair-qr]'), 'pairing modal displays a generated QR image');
  assert.match(dom.window.document.body.textContent, /不会自动信任证书/);
  assert.match(dom.window.document.body.textContent, /局域网自动发现/);
  assert.equal(errors.length, 0, errors.join('\n'));
  dom.window.close();
  console.log('PASS v48-lan-ui');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
