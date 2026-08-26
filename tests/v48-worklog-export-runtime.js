const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

(async () => {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/Could not load script:.*(?:xlsx|argon2|jszip|echarts)|Not implemented: HTMLCanvasElement/.test(error.message)) errors.push(error.message);
  });
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'output', 'v4-preview.html'), {
    runScripts:'dangerously', resources:'usable', url:'https://c.local/', pretendToBeVisual:true,
    virtualConsole,
    beforeParse(window) {
      window.requestAnimationFrame = callback => window.setTimeout(callback, 0);
      window.scrollTo = () => {};
      window.fetch = async () => { throw new Error('offline'); };
    },
  });
  await new Promise(resolve => setTimeout(resolve, 900));

  const runtime = dom.window.CWBV46Runtime;
  assert.ok(runtime && runtime.DB, 'single-file runtime must expose the workspace database');
  const sourceTask = { id:'runtime-task-1', title:'来源任务', status:'已完成', updated_at:'2026-08-21T10:00:00.000Z' };
  const worklog = runtime.normV4Record({
    id:'runtime-worklog-1', date:'2026-08-21', title:'来源任务留痕', category:'其他', status:'已归档',
    summary:'已完成来源任务', source_collection:'tasks', source_id:sourceTask.id,
  }, 'worklogs');
  runtime.DB.tasks.push(sourceTask);
  runtime.DB.worklogs.push(worklog);

  const pkg = dom.window.CWB.export.createPackage({ collections:['worklogs'], scope:{ view:'worklogs', query:'来源任务' } });
  const exported = pkg.collections.worklogs;
  assert.ok(exported, 'worklog collection must be exported');
  assert.ok(exported.fields.includes('source_collection'));
  assert.ok(exported.fields.includes('source_id'));
  assert.ok(exported.fields.includes('source_label'));
  assert.equal(exported.rows.length, 1);
  const sourceCollectionIndex = exported.fields.indexOf('source_collection');
  const sourceIdIndex = exported.fields.indexOf('source_id');
  const sourceLabelIndex = exported.fields.indexOf('source_label');
  assert.equal(exported.rows[0][sourceCollectionIndex], 'tasks');
  assert.equal(exported.rows[0][sourceIdIndex], sourceTask.id);
  assert.equal(exported.rows[0][sourceLabelIndex], sourceTask.title);
  assert.equal(pkg.provenance.length, 1);
  assert.equal(pkg.provenance[0].source.source_state, 'active');

  const printable = dom.window.CWB.export.toPrintableHtml({ collections:['worklogs'], title:'来源回链测试' });
  assert.match(printable, /来源任务/);
  assert.match(printable, /来源集合/);
  assert.equal(errors.length, 0, errors.join('\n'));
  dom.window.close();
  console.log('PASS v48-worklog-export-runtime');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
