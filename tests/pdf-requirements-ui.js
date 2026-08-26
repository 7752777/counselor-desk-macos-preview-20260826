const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const page = path.join(__dirname, '..', 'index.html');
const source = fs.readFileSync(page, 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(40);
  }
  return Boolean(predicate());
}

assert.match(source, /'ai-log':viewAiLog/, 'AI log view must be registered in the public view registry');
assert.match(source, /function viewAiLog\(\)/, 'AI log page must exist');
assert.match(source, /data-ai-log-filter/, 'AI log page must expose filters');
assert.match(source, /function ensureNavPins\(\)/, 'navigation pins must have a reusable installer');
assert.match(source, /box\.innerHTML = [\s\S]{0,900}ensureNavPins\(\)/, 'custom navigation refresh must restore pin controls');
assert.match(source, /key:\s*['"]start_date['"][\s\S]{0,180}type:\s*['"]date['"]/, 'tasks must expose an optional start date');
assert.match(source, /key:\s*['"]end_date['"][\s\S]{0,180}type:\s*['"]date['"]/, 'tasks must expose an optional end date');
assert.match(source, /taskDateOnly\(task && task\.created_at\) \|\| due/, 'Gantt must draw a due-only task without inventing a different deadline');
assert.match(source, /平台 AI 服务必须连接受控 relay/, 'platform AI must use a controlled relay rather than a shared client key');
assert.doesNotMatch(source, /sk-[A-Za-z0-9]{20,}/, 'a model API key must never be embedded in the application');

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    const message = String(error && error.message || error);
    if (!/Could not load script:.*(?:xlsx\.full\.min\.js|argon2-bundled\.min\.js|jszip\.min\.js|echarts\.min\.js)|HTMLCanvasElement\.prototype\.getContext|Not implemented|scrollTo/i.test(message)) errors.push(message);
  });
  const dom = await JSDOM.fromFile(page, {
    runScripts: 'dangerously', resources: 'usable', url: `file:///${page.replace(/\\/g, '/')}`,
    pretendToBeVisual: true, virtualConsole,
    beforeParse(window) { window.scrollTo = () => {}; },
  });
  assert.equal(await waitFor(() => !!dom.window.CWBV46Runtime, 7000), true, 'application runtime should boot');
  const { window: w } = dom;
  const d = w.document;
  const runtime = w.CWBV46Runtime;
  try {
    assert.ok(runtime.VIEWS['ai-log'], 'AI log route must be callable');
    runtime.app.navigation = { entries:['home'], index:0, restoring:false };
    runtime.app.view = 'home';
    runtime.go('tasks');
    runtime.go('students');
    runtime.go('tasks');
    assert.deepEqual(runtime.app.navigation.entries, ['home', 'tasks', 'students', 'tasks']);
    d.querySelector('[data-act="nav-back"]').click();
    assert.equal(runtime.app.view, 'students', 'back should return to the immediately previous view');
    d.querySelector('[data-act="nav-back"]').click();
    assert.equal(runtime.app.view, 'tasks', 'back should reach the first task view');
    d.querySelector('[data-act="nav-forward"]').click();
    assert.equal(runtime.app.view, 'students', 'forward should restore the next historical view');

    const task = runtime.normTask({ id:'pdf_due_only_task', title:'PDF due-only task', due:runtime.today(), start_date:'', end_date:'', status:'todo', priority:'P0', created_at:'' });
    runtime.DB.tasks.push(task);
    runtime.app.filters.tasks = Object.assign({}, runtime.app.filters.tasks, { status:'', due:'', q:'', view:'gantt' });
    runtime.app.view = 'tasks';
    runtime.render();
    assert.ok(d.querySelector('[data-act="task-view"][data-view-mode="gantt"].on'), 'Gantt view should be selected');
    assert.ok(d.querySelector('[data-act="task-edit"][data-id="pdf_due_only_task"]'), 'a task with only a deadline should appear in Gantt');
    runtime.app.filters.tasks.view = 'timeline';
    runtime.render();
    assert.ok(d.querySelector('.task-timeline'), 'timeline view should render');

    const audit = runtime.v4Collection('v4_ai_audit');
    audit.push({ id:'pdf_ai_log', action:'generate', purpose:'student_summary', status:'completed', provider:'平台 AI', model:'平台默认模型', created_at:new Date().toISOString(), target_view:'tasks', target_collection:'tasks', target_record_id:'pdf_due_only_task', source_ids:[], sourceCount:0, recordCount:1 });
    runtime.app.aiLogFilter = { q:'', purpose:'', status:'', from:'', to:'' };
    runtime.go('ai-log');
    await wait(80);
    assert.match(d.body.textContent, /AI 调用日志/);
    assert.ok(d.querySelector('[data-act="ai-log-open"][data-id="pdf_ai_log"]'), 'AI log row should expose a detail action');
    d.querySelector('[data-act="ai-log-open"][data-id="pdf_ai_log"]').click();
    await wait(30);
    assert.match(d.querySelector('#modal-root').textContent, /原业务页面/);
    assert.match(d.querySelector('#modal-root').textContent, /工作任务/);
    assert.equal(errors.length, 0, errors.join(' | '));
  } finally {
    dom.window.close();
  }
  console.log('PASS pdf-requirements-ui');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
