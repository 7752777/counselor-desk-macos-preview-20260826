/** v4.9 durable large import and atomic failure contract. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const file = path.join(__dirname, '..', 'output', 'v4-preview.html');
const build = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-release.js'), file], { cwd:path.join(__dirname, '..'), encoding:'utf8' });
if (build.status !== 0) throw new Error(build.stderr || build.stdout || 'failed to build release preview');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const vc = new VirtualConsole();
  const dom = await JSDOM.fromFile(file, { runScripts:'dangerously', resources:'usable', url:'https://c.local/', virtualConsole:vc, pretendToBeVisual:true });
  const w = dom.window;
  await sleep(900);
  const cwb = w.CWB;

  const before = JSON.stringify(cwb.db.students);
  const failurePreview = cwb.importer.previewCSV('学号,姓名\n0888,原子测试', 'students');
  const studentRepository = cwb.repositories && cwb.repositories.students;
  const realPutMany = studentRepository && studentRepository.putMany;
  const realWrite = cwb.store.write;
  if (studentRepository && typeof realPutMany === 'function') studentRepository.putMany = async () => { throw new Error('TEST_PERSISTENCE_FAILURE'); };
  else cwb.store.write = function (key, value) { return key === 'students' ? false : realWrite.call(this, key, value); };
  const failed = await cwb.importer.commitPreviewAsync(failurePreview.id, { confirmSensitive:true, skipInvalid:true, conflictPolicy:'skip' });
  if (studentRepository && typeof realPutMany === 'function') studentRepository.putMany = realPutMany;
  else cwb.store.write = realWrite;
  assert.equal(failed.ok, false);
  assert.equal(JSON.stringify(cwb.db.students), before, 'failed storage write must leave in-memory data untouched');

  const rows = ['学号,姓名,班级'];
  for (let i = 0; i < 5000; i++) rows.push(`${String(30000000 + i)},学生${i},测试${i % 100}班`);
  const started = Date.now();
  const preview = cwb.importer.previewCSV(rows.join('\n'), 'students');
  const previewElapsed = Date.now() - started;
  assert.equal(preview.summary.ready, 5000);
  assert.ok(previewElapsed < 2000, `5000-row preview took ${previewElapsed}ms`);
  const run = await cwb.importer.commitPreviewAsync(preview.id, { confirmSensitive:true, skipInvalid:true, conflictPolicy:'skip' });
  const elapsed = Date.now() - started;
  assert.equal(run.ok, true, run.error || '5000-row commit failed');
  assert.equal(run.added, 5000);
  assert.ok(elapsed < 150000, `5000-row durable preview and commit took ${elapsed}ms`);
  assert.ok(cwb.db.students.some(student => student.student_number === '30000000'));

  dom.window.close();
  console.log(`PASS import-scale (${elapsed}ms)`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
