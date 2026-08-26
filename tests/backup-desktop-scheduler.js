/** Desktop backup scheduling checks must run while the renderer is open. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'output', 'v4-preview.html'), {
    runScripts:'dangerously', resources:'usable', url:'https://backup-desktop.local/',
    pretendToBeVisual:true, virtualConsole,
    beforeParse(window) { window.cwbDesktop = {}; window.scrollTo = () => {}; },
  });
  const w = dom.window;
  await wait(700);
  assert.ok(w.CWB && w.CWB.desktopBackupScheduler, 'desktop scheduler should be exposed when desktop bridge exists');
  assert.equal(w.CWB.desktopBackupScheduler.interval_ms, 60000, 'scheduler should check once per minute');

  let calls = 0;
  w.CWB.backup.runDueJobs = async () => { calls += 1; return { due:false, reason:'not_due' }; };
  const result = await w.CWB.desktopBackupScheduler.tick();
  assert.equal(result.reason, 'not_due');
  assert.equal(calls, 1);
  assert.equal(w.CWB.desktopBackupScheduler.status().busy, false);
  w.CWB.desktopBackupScheduler.stop();
  assert.equal(w.CWB.desktopBackupScheduler.status().running, false);
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS backup-desktop-scheduler');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
