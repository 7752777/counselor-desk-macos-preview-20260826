const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = path.join(__dirname, '..');
  const htmlPath = path.join(root, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/Could not load script|Not implemented: window\.scrollTo|HTMLCanvasElement/i.test(error.message)) errors.push(error.message);
  });
  const dom = await JSDOM.fromFile(htmlPath, {
    runScripts: 'dangerously', resources: 'usable', url: `file:///${htmlPath.replace(/\\/g, '/')}`,
    pretendToBeVisual: true, virtualConsole,
  });
  const { window } = dom;
  const { document } = window;
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};
  await sleep(650);

  const cwb = window.CWB;
  const main = () => document.querySelector('#main');
  const click = element => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const rows = () => [...main().querySelectorAll('.tw tbody tr')];

  // Sensitive imports must teach the user what to do instead of silently swallowing a click.
  const preview = cwb.importer.previewCSV('student_number,full_name,Parent Phone\n__ux_sensitive,测试学生,13800138000', 'students');
  cwb.openImportPreview(preview, {});
  const confirmImport = document.querySelector('[data-import-confirm]');
  assert.equal(confirmImport.disabled, false, 'sensitive import confirm button should remain clickable to show guidance');
  confirmImport.click();
  await sleep(20);
  assert.match(document.querySelector('#toast-root').textContent, /先勾选.*确认/, 'sensitive import should explain the missing acknowledgement');
  document.querySelector('#modal-root [data-close]').click();

  // A task completion command is different from a batch-selection checkbox.
  cwb.go('tasks');
  await sleep(30);
  assert.equal(main().querySelector('[data-act="task-toggle"]').tagName, 'BUTTON', 'single-task completion should be an explicit button');
  click(main().querySelector('[data-act="bulk-toggle"]'));
  await sleep(30);
  assert.ok(main().querySelector('[data-act="bulk-select-all"]'), 'batch mode should provide select-all for the current result set');

  // Home metrics should open the next actionable state, not just the parent module.
  cwb.go('home');
  await sleep(30);
  click(main().querySelector('[data-home-shortcut="tasks-overdue"]'));
  await sleep(30);
  assert.equal(main().querySelector('[data-filter="tasks.due"]').value, 'overdue', 'overdue home shortcut should preserve the overdue filter');
  cwb.go('home');
  await sleep(30);
  click(main().querySelector('[data-home-shortcut="talks-follow"]'));
  await sleep(30);
  assert.equal(main().querySelector('[data-filter="talks.follow"]').value, 'pending', 'follow-up home shortcut should open pending talks');
  cwb.go('home');
  await sleep(30);
  click(main().querySelector('[data-home-shortcut="worklog-drafts"]'));
  await sleep(30);
  assert.match(main().textContent, /待确认工作记录/, 'draft shortcut should open the confirmation queue directly');

  // A draft must remain traceable to the record that produced it.
  const sourceTask = { id:'ux-source-task', title:'来源核对任务', status:'open', due:'2026-09-01', classes:'UX 测试班', note:'来源记录' };
  cwb.db.tasks.push(sourceTask);
  cwb.db.custom.v4_worklog_drafts.push({ id:'ux-source-draft', title:'来源核对草稿', date:'2026-08-21', student_name:'测试学生', source_collection:'tasks', source_id:sourceTask.id, source_state:'active', status:'draft', summary:'来源核对内容' });
  cwb.go('worklog-drafts');
  await sleep(30);
  const draftSearch = main().querySelector('[data-v46-draft-search]');
  draftSearch.value = '来源核对';
  draftSearch.dispatchEvent(new window.Event('input', { bubbles:true }));
  await sleep(240);
  assert.equal(main().querySelectorAll('.v46-draft-row').length, 1, 'draft queue search should narrow the confirmation list');
  click(main().querySelector('[data-act="v46-draft-source"]'));
  await sleep(30);
  assert.match(document.querySelector('#modal-root').textContent, /编辑任务/, 'draft source action should open the originating task');
  document.querySelector('#modal-root [data-close]').click();

  // The action existed in source before, but this keeps the real click flow from regressing.
  cwb.go('talks');
  await sleep(30);
  click(main().querySelector('[data-act="talk-view"]'));
  await sleep(20);
  assert.match(document.querySelector('#modal-root').textContent, /谈话记录/, 'talk detail action should open a detail dialog');
  document.querySelector('#modal-root [data-close]').click();

  cwb.go('stay');
  await sleep(30);
  assert.equal(
    main().querySelector('.tw thead tr').children.length,
    main().querySelector('.tw tbody tr').children.length,
    'stay records should render one cell for each table header',
  );

  cwb.go('report');
  await sleep(30);
  assert.ok(main().querySelector('[data-act="open-local-data"]'), 'work summary should expose the local data folder action');
  assert.match(main().textContent, /本机任务、谈话和重点关注记录自动整理/, 'summary must explain its local-record basis');
  assert.doesNotMatch(main().textContent, /AI|提示词|模型/, 'the counselor-facing summary must not expose model or prompt language');

  for (const view of ['pleave', 'attend', 'node', 'warn']) {
    cwb.go(view);
    await sleep(30);
    const filters = main().querySelectorAll('.kpi[data-act="filter-shortcut"]');
    assert.equal(filters.length, 3, `${view} KPI cards should be clickable filters`);
  }

  cwb.go('pleave');
  await sleep(30);
  const pleaveRows = rows().length;
  click(main().querySelector('.kpi[data-act="filter-shortcut"]'));
  await sleep(30);
  assert.ok(rows().length < pleaveRows, 'clicking a leave KPI should narrow the displayed records');

  assert.match(html, /\.card\s*>\s*\.kpis\s*\{[^}]*margin:\s*16px\s+18px/s, 'direct KPI groups need a visual gutter');
  assert.match(html, /#btn-menu\s*\{\s*display:none/, 'desktop keeps the sidebar visible and hides the redundant menu button');
  assert.match(html, /\[data-theme="dark"\]\s*\{[^}]*--bg:\s*#191b1f/s, 'dark mode should use the calm charcoal palette');
  click(document.querySelector('#btn-theme'));
  await sleep(20);
  assert.equal(window.getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(), '#191b1f', 'dark mode must override a previously selected light preset background');
  assert.match(fs.readFileSync(path.join(root, 'desktop', 'preload.cjs'), 'utf8'), /openDataFolder/, 'desktop bridge should expose the data-folder action');
  assert.match(fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8'), /desktop:open-data-folder/, 'desktop main process should implement the data-folder action');
  assert.doesNotMatch(html, /交给 AI|帮我在这个辅导员工作台里增加一个|提示词/, 'the public application must not contain an AI prompt-style extension entry');
  assert.deepEqual(errors, [], `unexpected browser errors: ${errors.join(' | ')}`);

  dom.window.close();
  console.log('PASS ux-operations');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
