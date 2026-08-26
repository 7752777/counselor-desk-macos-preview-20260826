const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const page = path.join(__dirname, '..', 'index.html');
  const source = fs.readFileSync(page, 'utf8');
  assert.match(source, /data-act="leadership-view-edit"/, 'home should expose a leadership-view editor');
  assert.match(source, /data-act="leadership-view-export"/, 'home should expose leadership CSV export');

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  const dom = await JSDOM.fromFile(page, { runScripts:'dangerously', resources:'usable', url:'https://leadership.local/', pretendToBeVisual:true, virtualConsole });
  await wait(800);
  try {
    const api = dom.window.CWB.leadershipViews;
    assert.equal(typeof api.metrics, 'function');
    assert.equal(typeof api.create, 'function');
    assert.equal(typeof api.update, 'function');
    assert.equal(typeof api.remove, 'function');
    const metrics = api.metrics();
    assert.ok(metrics.every(item => typeof item.key === 'string' && typeof item.label === 'string' && Number.isFinite(item.value)), 'leadership metrics must be numeric aggregates');
    assert.ok(metrics.every(item => !/姓名|学号|电话|地址|心理详情/.test(item.label)), 'leadership metrics must not expose direct identifiers');
    const view = await api.create({ name:'院系周报', metricKeys:['student_total', 'focus_students'] });
    assert.deepEqual(Array.from(view.metricKeys), ['student_total', 'focus_students']);
    await api.select(view.id);
    assert.equal(api.selected().id, view.id, 'selecting a saved view should make it current');
    assert.equal((await api.update(view.id, { name:'院系月报' })).name, '院系月报');
    assert.equal(await api.remove(view.id), true);
    delete dom.window.CWB.db.settings.leadership_views;
    dom.window.CWB.db.settings.personal_views = [{ id:'legacy_leadership', kind:'leadership', name:'旧版统计视图' }];
    dom.window.CWB.db.settings.leadership_view_id = 'legacy_leadership';
    const legacy = api.selected();
    assert.deepEqual(Array.from(legacy.metricKeys), ['student_total', 'focus_students', 'active_crisis', 'open_tasks', 'overdue_tasks', 'month_talks'], 'legacy leadership views should receive default metric keys');
    assert.deepEqual(errors, []);
  } finally {
    dom.window.close();
  }
  console.log('PASS leadership-dashboard');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
