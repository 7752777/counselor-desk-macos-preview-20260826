const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<script defer src="src/core/cwb-ai.js" data-cwb-ai></script>', `<script>${fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai.js'), 'utf8')}</script>`).replace('<script defer src="src/core/cwb-ai-workflow.js" data-cwb-ai-workflow></script>', `<script>${fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai-workflow.js'), 'utf8')}</script>`);
  const vc = new VirtualConsole(); vc.on('jsdomError', error => { if (!/scrollTo|Could not load|Not implemented/i.test(error.message)) throw error; });
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://summary.local/', pretendToBeVisual:true, virtualConsole:vc });
  await wait(750);
  const { CWB } = dom.window;
  CWB.db.tasks = [{ id:'in', title:'班会', due:'2026-08-03', status:'done' }, { id:'out', title:'旧任务', due:'2026-07-01', status:'done' }];
  const records = CWB.ai.recordsForRange('2026-08-01', '2026-08-07');
  assert.equal(records.length, 1);
  assert.equal(records[0].title, '班会');
  assert.equal(records[0].collection, 'tasks', 'range snapshots must retain their source collection');
  assert.equal(records[0].id, 'in', 'range snapshots must retain the stable source record ID');
  const context = CWB.ai.context.build({ purpose:'work_summary', records });
  assert.equal(context.records[0].collection, 'tasks', 'explicit range context must prefer the source collection');
  assert.equal(context.sources[0].collection, 'tasks', 'range sources must remain linked to the task collection');
  const worklog = CWB.ai.confirmWorkSummary({ text:'本周完成班会', range:{ from:'2026-08-01', to:'2026-08-07' }, sources:records });
  assert.equal(worklog.source, 'AI 工作总结（人工确认）');
  assert.equal(worklog.ai_source_count, 1);
  dom.window.close(); console.log('PASS work-summary');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
