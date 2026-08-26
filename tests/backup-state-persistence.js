/** Business changes must persist the backup freshness counter with the data. */
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
    runScripts:'dangerously', resources:'usable', url:'https://backup-state.local/',
    virtualConsole:vc, pretendToBeVisual:true,
  });
  const w = dom.window;
  await wait(700);
  const before = Number(w.CWB.db.settings.backup_state.change_count || 0);
  w.CWB.db.tasks.push(w.CWB.norm.task({ id:'backup-state-task', title:'备份状态持久化测试' }));
  w.CWB.save('tasks');
  const stored = JSON.parse(w.localStorage.getItem('cwb_v1_settings') || '{}');
  assert.equal(Number(stored.backup_state && stored.backup_state.change_count), before + 1,
    'saving business data must persist the backup freshness counter');
  assert.ok(stored.backup_state.last_change_at, 'saving business data must persist the latest change time');
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS backup-state-persistence');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
