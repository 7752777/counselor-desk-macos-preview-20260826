const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

async function waitFor(predicate, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Could not load script:.*(?:xlsx|argon2|jszip|echarts)|Not implemented: HTMLCanvasElement/.test(error.message)) errors.push(error.message); });
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'output', 'v4-preview.html'), {
    runScripts:'dangerously', resources:'usable', url:'https://c.local/', pretendToBeVisual:true, virtualConsole:virtualConsole,
    beforeParse(window) { window.requestAnimationFrame = callback => window.setTimeout(callback, 0); window.scrollTo = () => {}; window.fetch = async () => { throw new Error('offline'); }; },
  });
  await new Promise(resolve => setTimeout(resolve, 900));
  for (const view of ['v48-sync', 'student-fields', 'class-history', 'content-push', 'work-categories', 'form-center', 'recovery']) {
    const button = dom.window.document.querySelector(`[data-view="${view}"]`);
    assert.ok(button, `missing v4.8 navigation entry: ${view}`);
    button.click();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(dom.window.document.querySelector('[data-v48-page]')?.dataset.v48Page, view);
  }
  assert.match(dom.window.document.body.textContent, /冲突收件箱/);
  assert.match(dom.window.document.body.textContent, /数据修复与恢复/);
  const recoveryUiSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'cwb-v48-ui.js'), 'utf8');
  assert.match(recoveryUiSource, /恢复口令至少需要 12 位/);
  assert.match(recoveryUiSource, /data-v48-recovery-pass-confirm[^>]+type="password" minlength="12"/);
  assert.match(recoveryUiSource, /data-v48-restore-pass[^>]+type="password" minlength="12"/);
  const runtime = dom.window.CWBV46Runtime;
  assert.ok(runtime && runtime.app, 'v4.8 UI runtime is exposed for integration');
  runtime.go('class-history');
  await new Promise(resolve => setTimeout(resolve, 30));
  const jointVisitButton = dom.window.document.querySelector('[data-act="v48-joint-visit"]');
  assert.ok(jointVisitButton, 'dynamic class history page exposes joint visit action');
  jointVisitButton.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(dom.window.document.body.textContent, /班级 \/ 宿舍 \/ 空课时联合走访/);
  dom.window.document.querySelector('[data-close]').click();
  runtime.go('content-push');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(dom.window.document.querySelector('[data-act="v48-content-import"]'), 'content push exposes package import');
  assert.ok(dom.window.document.querySelector('[data-act="v48-content-export"]'), 'content push exposes package export');
  runtime.app.v48 = Object.assign({}, runtime.app.v48 || {}, { syncState:{}, syncConflicts:[{ id:'conflict-ui-1', status:'open', collection:'students', record_id:'s1', fields:[{ field:'class_name', local:'一班', incoming:'二班' }] }] });
  runtime.go('v48-sync');
  await new Promise(resolve => setTimeout(resolve, 30));
  const manualButton = dom.window.document.querySelector('[data-act="v48-conflict-manual"]');
  assert.ok(manualButton, 'conflict inbox exposes manual editor');
  manualButton.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(dom.window.document.querySelector('[data-v48-conflict-values]'), 'manual conflict editor opens');
  dom.window.document.querySelector('[data-close]').click();
  runtime.go('v48-sync');
  await new Promise(resolve => setTimeout(resolve, 20));
  const form = dom.window.document.querySelector('[data-v48-sync-connect]');
  form.querySelector('[data-v48-field="base_url"]').value = 'https://offline.local:1234';
  form.querySelector('[data-v48-field="token"]').value = 'session-only-token';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(dom.window.document.querySelector('[data-v48-field="token"]').value, 'session-only-token', 'sync failure preserves the session form');
  runtime.go('backup');
  await new Promise(resolve => setTimeout(resolve, 30));
  const remoteForm = dom.window.document.querySelector('[data-remote-backup-config]');
  assert.ok(remoteForm, 'backup page exposes user-owned encrypted remote storage configuration');
  remoteForm.querySelector('[data-rb-field="base_url"]').value = 'https://backup.example.test/cwb/';
  remoteForm.querySelector('[data-rb-field="enabled"]').value = 'true';
  dom.window.__CWB_LAST_SAVE_PROMISE__ = null;
  remoteForm.dispatchEvent(new dom.window.Event('submit', { bubbles:true, cancelable:true }));
  await waitFor(() => dom.window.__CWB_LAST_SAVE_PROMISE__ && typeof dom.window.__CWB_LAST_SAVE_PROMISE__.then === 'function', 60000);
  await dom.window.__CWB_LAST_SAVE_PROMISE__;
  await waitFor(() => dom.window.CWB && dom.window.CWB.db && dom.window.CWB.db.settings && dom.window.CWB.db.settings.remote_backup, 60000);
  assert.equal(dom.window.CWB.db.settings.remote_backup.base_url, 'https://backup.example.test/cwb/');
  assert.equal(dom.window.CWB.db.settings.remote_backup.enabled, true, 'remote backup configuration persists without credentials');
  assert.equal(dom.window.CWB.db.settings.remote_backup.bearer_token, undefined, 'remote tokens are not written to workspace settings');
  const psychButton = dom.window.document.querySelector('[data-view="psych"]');
  assert.ok(psychButton, 'psychology navigation entry is present');
  psychButton.click();
  await new Promise(resolve => setTimeout(resolve, 40));
  const voiceButton = dom.window.document.querySelector('[data-act="psych-voice"]');
  const cohortButton = dom.window.document.querySelector('[data-act="psych-cohort"]');
  assert.ok(voiceButton, 'psychology page exposes voice整理 action');
  assert.ok(cohortButton, 'psychology page exposes cohort aggregation action');
  cohortButton.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(dom.window.document.body.textContent, /群体心理主题聚合/);
  dom.window.document.querySelector('[data-close]').click();
  voiceButton.click();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(dom.window.document.body.textContent, /谈话录音整理/);
  assert.match(dom.window.document.body.textContent, /原音频不会保存/);
  assert.ok(dom.window.document.querySelector('[data-psych-voice-start]'), 'voice recorder modal opens');
  dom.window.document.querySelector('[data-close]').click();
  assert.equal(errors.length, 0, errors.join('\n'));
  dom.window.close();
  console.log('PASS v48-management-ui');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
