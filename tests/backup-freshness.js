/** Backup freshness must surface both elapsed days and change-threshold risk. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'index.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  vc.on('error', (...args) => errors.push(args.join(' ')));
  const dom = await JSDOM.fromFile(file, {
    runScripts:'dangerously', resources:'usable', url:'https://backup-freshness.local/',
    virtualConsole:vc, pretendToBeVisual:true,
  });
  const w = dom.window;
  await wait(700);
  assert.equal(typeof w.CWB.backupStatus, 'function', 'backup freshness should be public for UI and diagnostics');
  const now = Date.now();
  w.CWB.db.settings.backup_schedule = { frequency:'daily', change_threshold:2, enabled:false };
  w.CWB.db.settings.backup_state = {
    last_encrypted_at:new Date(now - 3 * 86400000).toISOString(),
    last_change_at:new Date(now - 1 * 3600000).toISOString(),
    change_count:7, last_encrypted_change_count:5, last_warning_at:'', last_json_export_at:'',
  };
  const status = w.CWB.backupStatus();
  assert.equal(status.ageDays, 3);
  assert.equal(status.changesAfterBackup, 2);
  assert.equal(status.dueByChange, true);
  assert.equal(status.dueByTime, true);
  assert.equal(status.stale, true);
  assert.match(status.prompt, /3 天|变更 2 条/);
  w.CWB.go('home');
  await wait(40);
  assert.match(w.document.body.textContent, /距上次加密备份 3 天|备份后变更 2 条/);
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS backup-freshness');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
