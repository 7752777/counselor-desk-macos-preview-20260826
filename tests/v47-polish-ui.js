const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '..');
const htmlPath = path.join(root, 'index.html');
const uiSource = fs.readFileSync(path.join(root, 'src', 'core', 'cwb-v47-ui.js'), 'utf8');
const htmlSource = fs.readFileSync(htmlPath, 'utf8');

assert.match(uiSource, /:root \{ --nav-w: 0px; \}/, 'v4.7 mobile styles must restore the zero-width desktop nav variable');
assert.match(uiSource, /\.layout\.cwb-v47-layout \{ padding-left: 0; \}/, 'v4.7 mobile layout must remove the desktop nav offset');
assert.match(uiSource, /\.sidenav \{ top: 0; \}/, 'v4.7 mobile drawer must start at the viewport top');
assert.match(uiSource, /body\.cwb-v47-surface \.btn \{ min-height: 44px; \}/, 'v4.7 mobile buttons must preserve touch target height');
assert.match(uiSource, /body\.cwb-v47-surface \.btn-sm \{ min-height: 38px; \}/, 'v4.7 mobile compact buttons must preserve touch target height');
assert.match(uiSource, /use href="#i-x"/, 'context close action must use the shared icon system');
assert.match(uiSource, /v47-page-view/, 'reference-workbench pages must share a stable page wrapper');
assert.match(uiSource, /工具入口/, 'external links and daily utilities must use distinct labels');
assert.match(uiSource, /home-summary::\-webkit-scrollbar/, 'mobile summary strip should hide its decorative scrollbar');
assert.match(uiSource, /home-system-detail-grid/, 'home maintenance details should expose a structured detail grid');
assert.match(uiSource, /home-system-items \{ display: grid; grid-template-columns: repeat\(5/, 'home maintenance summary should keep five compact status items');
assert.match(uiSource, /body\.cwb-v47-surface \.brand > span:last-child/, 'mobile brand text must be allowed to shrink without pushing controls off-screen');
assert.match(uiSource, /@media \(max-width: 380px\)/, 'the narrow mobile breakpoint must be explicit');
assert.match(uiSource, /@media \(min-width: 1280px\) and \(max-width: 1350px\)/, 'the compact desktop breakpoint must protect readable central tables');
assert.match(uiSource, /grid-template-columns: minmax\(0, 1fr\) 264px/, 'the compact desktop context panel must leave room for the main work area');
assert.match(uiSource, /max-width: 1350px[\s\S]{0,900}topbar-search-wrap/, 'compact desktop topbar should reserve room for the main work area');
assert.match(uiSource, /topbar-acts #btn-export span[\s\S]{0,260}display: none/, 'compact desktop backup actions should keep icon entry points without text overflow');
assert.match(uiSource, /app\.bridgeTab === 'backup'[\s\S]{0,180}activeView = 'backup'/, 'backup subview should be identified in the context panel');
assert.match(uiSource, /\.tw table \{ min-width: 780px; \}/, 'dense desktop tables must retain a readable minimum width');
assert.match(uiSource, /topbar-acts \[data-act="export-diagnostics"\]/, 'the narrow mobile breakpoint must remove nonessential diagnostic chrome');
assert.match(uiSource, /\.save-status::before \{ content: '\u2713';/, 'the narrow mobile breakpoint must preserve a compact save indicator');
assert.match(htmlSource, /home-hero-mark/, 'home workbench should expose a visual anchor for the day');
assert.match(htmlSource, /data-act="onboarding-import"/, 'demo data state should offer a direct real-list import action');
assert.match(htmlSource, /const homeTodoRows = homePriorityTodo;/, 'home should keep the first screen limited to the five highest-priority items');
assert.match(htmlSource, /id="scrim"/, 'mobile navigation must provide a closable scrim');
assert.match(htmlSource, /aria-controls="sidenav"/, 'mobile menu must expose its controlled navigation region');
assert.match(htmlSource, /function reconcileDeferredRuntime\(\)/, 'startup must reconcile deferred runtime scripts before the first health view');
assert.match(htmlSource, /function studentMaintenancePlan\(\)/, 'student ledger must derive long-term maintenance prompts from current records');
assert.match(htmlSource, /function studentMaintenanceGuidanceMarkup\(\)/, 'student ledger must expose a compact next-step guidance surface');
assert.match(htmlSource, /function refreshDemoRelativeDates\(\)/, 'demo dates must follow the current day instead of becoming stale overdue work');
assert.match(htmlSource, /demo_reference_date/, 'demo workspace must persist its relative-date anchor');
assert.match(htmlSource, /student-relationship-summary/, 'student profile must expose cross-module relationship counts');
assert.match(htmlSource, /async setStep\(step\)/, 'onboarding navigation must persist its step before routing');
assert.match(htmlSource, /async tour\(\)[\s\S]{0,2400}persistSettingsMutation/, 'opening the feature tour must persist its seen marker through the settings transaction');
assert.match(htmlSource, /const welcomeExperience = \{[\s\S]{0,260}async reset\(\) \{[\s\S]{0,900}persistSettingsMutation[\s\S]{0,900}welcome_experience/, 'welcome reset must not report success before its state is durable');
assert.match(htmlSource, /async function leadershipViewSaveSettings\(mutate\)[\s\S]{0,900}persistSettingsMutation/, 'saved dashboard views must use the unified settings transaction rather than a parallel write');
assert.match(htmlSource, /function applyFold\(\) \{[\s\S]{0,260}typeof document === 'undefined'/, 'late UI persistence callbacks must tolerate a disposed preview document');
assert.match(htmlSource, /toast\(msg, type, ms, action\) \{[\s\S]{0,260}typeof document === 'undefined'/, 'late persistence feedback must not create UI in a disposed preview document');
assert.match(htmlSource, /function renderDailyGreeting\(\)/, 'daily greeting should be rendered as a non-blocking home inline notice');
assert.match(htmlSource, /data-act="welcome-daily-dismiss"/, 'daily greeting should provide a dismiss action without opening a modal');
assert.match(htmlSource, /function aiCapabilityMatrixHtml\(provider\)/, 'AI page should expose separate text, vision and audio readiness checks');
assert.match(htmlSource, /function aiProviderReadinessNextStep\(code\)/, 'AI readiness failures must expose an actionable next step');
assert.match(htmlSource, /AI_BROWSER_RECORDING_UNSUPPORTED/, 'voice UI must distinguish browser recording support from provider support');
assert.match(htmlSource, /bodyWithMarkupFix/, 'AI page should normalize generated card markup before rendering');
assert.match(htmlSource, /ai-workspace-selection/, 'AI context controls should use a dedicated responsive workspace layout');
assert.match(htmlSource, /ai-workspace-config/, 'AI model and purpose controls should use grouped fields');
assert.match(htmlSource, /relay_token.*中转访问令牌/, 'AI provider form should explain relay credentials separately from model keys');
assert.match(htmlSource, /DOMContentLoaded.*attempt/, 'startup reconciliation must wait for deferred scripts and DOM readiness');
assert.match(htmlSource, /function syncDrawerState\(open\)[\s\S]*?addEventListener\('resize'/, 'mobile drawer semantics must follow responsive breakpoint changes');
assert.match(htmlSource, /window\.CWB\.ai\.governance = window\.CWBAI/, 'AI page must bind the loaded governance runtime after startup');
assert.match(htmlSource, /ACTS\['v4-org-delete'\][\s\S]{0,500}deleteDataRecordTransactional\('v4_positions'/, 'committee deletion must wait for transactional persistence');
assert.match(htmlSource, /ACTS\['v4-org-import'\][\s\S]{0,3000}persistArrayMutation\(items, 'custom'/, 'committee import must commit as one recoverable batch');
assert.match(htmlSource, /ACTS\['v4-employment-favorite'\][\s\S]{0,1200}persistArrayMutation\(list, 'custom'/, 'employment favorite changes must wait for durable persistence');
assert.match(htmlSource, /data-act=\"v4-photo-review\"|ACTS\['v4-photo-review'\][\s\S]{0,3200}awaitTrackedSave\(save\('custom'\)\)/, 'manual photo review must not confirm before queue and student persistence finish');
assert.match(uiSource, /\{ isNew:true \}\); }, 'v47-class-edit'/, 'schedule-linked class check must open as a new record');
assert.match(uiSource, /if \(opts\.isNew === true\) delete next\.id/, 'schedule-linked class check must not reuse the schedule ID');
assert.match(uiSource, /assessmentEntryKey/, 'assessment entries must expose a stable duplicate key');
assert.match(uiSource, /competitionEntryKey/, 'competition entries must expose a stable duplicate key');
assert.match(uiSource, /var originalResult = s\.rollResult/, 'roll-call save must retain the pre-save UI result for rollback');
assert.match(uiSource, /s\.rollResult = originalResult; s\.rollSavedId = originalSavedId/, 'roll-call save failure must restore the review state');
assert.match(htmlSource, /ACTS\['activity-delete'\][\s\S]{0,1800}deleteDataRecordWithAttachments\('activities'/, 'activity deletion must preserve participant and attachment rollback semantics');
assert.match(htmlSource, /ACTS\['worklog-delete'\][\s\S]{0,1200}deleteDataRecordWithAttachments\('worklogs'/, 'worklog deletion must preserve attachment rollback semantics');
assert.match(htmlSource, /function updateBaseRecordTransactional\(collection, id, mutate\)[\s\S]{0,1400}await awaitTrackedSave\(window\.__CWB_LAST_SAVE_PROMISE__\)/, 'legacy state changes must wait for durable persistence and restore on failure');
assert.match(htmlSource, /simple\.forEach\(\(\[action, collection, title, done\]\)[\s\S]{0,500}deleteDataRecordWithAttachments\(collection, id\)/, 'legacy delete actions must include attachment-aware rollback');
assert.match(htmlSource, /async undoAsync\(runId\)[\s\S]*?await replaceImportHistory\(previousHistory\)/, 'import undo must restore both data and history when either side fails');
assert.match(htmlSource, /\.save-status,\.cwb-license-status,\.topbar \[data-act="export-diagnostics"\]\{display:none!important\}/, 'mobile topbar must hide nonessential text and diagnostic controls');
assert.match(htmlSource, /\.topbar-sp\{display:none\}/, 'mobile topbar must remove the desktop flex spacer');
assert.match(uiSource, /contextReturnFocus/, 'context panel must retain the opener for focus restoration');
assert.match(uiSource, /event\.key !== 'Escape'/, 'context panel must support Escape to close');
assert.match(uiSource, /addEventListener\('resize'/, 'context accessibility state must follow responsive breakpoint changes');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, timeout = 5000, interval = 50) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(interval);
  }
  return Boolean(predicate());
}

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    const message = String(error && error.message || error);
    if (!/Could not load script:.*(?:xlsx\.full\.min\.js|argon2-bundled\.min\.js|jszip\.min\.js|echarts\.min\.js)|HTMLCanvasElement\.prototype\.getContext|Not implemented/i.test(message)) errors.push(message);
  });
  const dom = await JSDOM.fromFile(htmlPath, {
    runScripts: 'dangerously', resources: 'usable', url: `file:///${htmlPath.replace(/\\/g, '/')}`, pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) { Object.defineProperty(window, 'innerWidth', { value:390, configurable:true }); },
  });
  await waitFor(() => dom.window.document.querySelector('#cwb-v48-polished-style'));
  const { window: w } = dom;
  const d = w.document;
  const style = d.querySelector('#cwb-v48-polished-style');
  assert.ok(style, 'polished v4.7 surface style must be installed');
  assert.match(style.textContent, /--nav-w: 0px/);
  assert.equal(d.body.classList.contains('cwb-v47-surface'), true);
  const contextClose = d.querySelector('#cwb-v47-context [data-act="v47-context-toggle"]');
  assert.ok(contextClose, 'context panel must expose a close action');
  assert.equal(contextClose.querySelector('use').getAttribute('href'), '#i-x');
  assert.equal(d.querySelector('.v47-context-toggle')?.getAttribute('aria-expanded'), 'false', 'hidden narrow context must expose a collapsed state');

  const menuButton = d.querySelector('#btn-menu');
  const drawer = d.querySelector('#sidenav');
  const drawerCloseButton = d.querySelector('#sidenav [data-drawer-close]');
  assert.ok(menuButton && drawer && drawerCloseButton, 'mobile navigation should expose open and close controls');
  menuButton.click();
  assert.equal(drawer.classList.contains('open'), true, 'menu button should open the mobile drawer');
  assert.equal(menuButton.getAttribute('aria-expanded'), 'true', 'open drawer should expose aria-expanded=true');
  drawerCloseButton.click();
  assert.equal(drawer.classList.contains('open'), false, 'menu button should close the mobile drawer when it is open');
  assert.equal(menuButton.getAttribute('aria-expanded'), 'false', 'closed drawer should expose aria-expanded=false');

  const runtime = w.CWBV46Runtime;
  assert.ok(runtime && runtime.DB && runtime.go, 'shared runtime must be available');
  assert.ok(d.querySelector('.home-command-center'), 'home should expose the focused command center');
  assert.ok(d.querySelector('.home-system-strip'), 'home should expose compact data and maintenance status');
  const maintenance = d.querySelector('[data-home-maintenance-details]');
  assert.ok(maintenance, 'home should expose expandable data maintenance details');
  assert.equal(maintenance.open, false, 'maintenance details should be collapsed by default');
  maintenance.querySelector('summary').click();
  await wait(40);
  assert.equal(maintenance.open, true, 'maintenance details should be expandable');
  assert.equal(runtime.app.v4.homeMaintenanceOpen, true, 'maintenance detail state should persist in UI state');
  runtime.go('students');
  await wait(40);
  runtime.go('home');
  await wait(80);
  assert.equal(d.querySelector('[data-home-maintenance-details]').open, true, 'maintenance detail state should survive navigation');
  assert.ok(d.querySelector('.home-analytics'), 'home should keep analytics available behind a disclosure');
  assert.equal(d.querySelectorAll('#main .today').length, 0, 'legacy duplicate today list must not remain on the home page');
  assert.equal(d.querySelectorAll('#main .kpis').length, 0, 'legacy duplicate KPI strip must not remain on the home page');
  const homeAnalytics = d.querySelector('.home-analytics');
  assert.equal(homeAnalytics.open, false, 'secondary analytics should be collapsed by default');
  homeAnalytics.querySelector('summary').click();
  await wait(80);
  assert.equal(homeAnalytics.open, true, 'secondary analytics should be expandable');
  assert.ok(d.querySelector('#v4-trend-chart'), 'expanded analytics should keep the trend chart anchor');
  const scheduleRows = runtime.v4Collection('v4_class_schedules');
  scheduleRows.push({ id:'polish-schedule', class_name:'测试班', term:'当前学期', weekday:(new Date().getDay() || 7), start_section:'1', end_section:'2', course:'测试课程', room:'A101' });
  runtime.go('class-checks');
  await wait(120);
  const scheduleAction = d.querySelector('[data-act="v47-class-from-schedule"]');
  assert.ok(scheduleAction, 'today schedule must expose a one-click class check action');
  scheduleAction.click();
  await wait(60);
  assert.match(d.querySelector('#modal-root').textContent, /新增查课记录/);
  d.querySelector('#modal-root [data-close]')?.click();

  runtime.go('notice-ai');
  await wait(120);
  const noticeInput = d.querySelector('[data-v47-notice-text]');
  noticeInput.value = '请各班于2026年8月25日前提交安全教育材料。';
  d.querySelector('[data-act="v47-notice-preview"]').click();
  assert.equal(await waitFor(() => !!d.querySelector('[data-v47-notice-title]'), 5000), true, 'notice preview must finish before assertions');
  assert.ok(d.querySelector('[data-v47-notice-title]'), 'notice preview must render an editable title');
  assert.ok(d.querySelector('[data-v47-notice-evidence]'), 'notice preview must render evidence editing');
  runtime.go('ai');
  await wait(120);
  assert.equal(d.querySelectorAll('.ai-workspace-selection').length, 1, 'AI context controls should render as one scoped workspace');
  assert.equal(d.querySelectorAll('.ai-workspace-config').length, 1, 'AI model configuration should render as one grouped area');
  assert.ok(d.querySelector('.ai-workspace-config [data-ai-provider]')?.closest('.ai-workspace-field'), 'AI provider should have a readable field label');
  assert.ok(d.querySelector('.ai-capability-grid'), 'AI capability matrix should remain visible after layout normalization');
  assert.equal(d.querySelector('#main').innerHTML.includes('class="card-bd><div'), false, 'malformed card body markup must never reach the rendered page');
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS v47-polish-ui');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
