/** Real-browser import performance gate. Measures progress cadence and event-loop stalls. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium, requireBrowserExecutable } = require('../scripts/browser-runtime');

function within(label, operation, timeout = 60000) {
  let timer;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT_${timeout}MS`)), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
}

(async () => {
  const executablePath = requireBrowserExecutable('V40_PERFORMANCE');
  const browser = await chromium.launch({ headless:true, executablePath });
  const lifecycle = [];
  try {
    const page = await browser.newPage();
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) lifecycle.push(`navigated:${frame.url()}`); });
    page.on('crash', () => lifecycle.push('page-crash'));
    page.on('close', () => lifecycle.push('page-close'));
    await within('V40_PERFORMANCE_NAVIGATION', page.goto(`file://${path.resolve('output/v4-preview.html').replace(/\\/g, '/')}`));
    await within('V40_PERFORMANCE_BOOT', page.waitForFunction(() => document.documentElement.dataset.v4Ready === 'true'));
    const baselineCount = await within('V40_PERFORMANCE_BASELINE', page.evaluate(() => {
      // The importer stages from the hydrated in-memory workspace, which may
      // contain demo rows not yet mirrored by the compatibility repository.
      return Array.isArray(window.CWB.db && window.CWB.db.students) ? window.CWB.db.students.length : 0;
    }));
    const result = await within('V40_PERFORMANCE_IMPORT', page.evaluate(async () => {
    const progress = [];
    const eventGaps = [];
    let lastTick = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      eventGaps.push(now - lastTick);
      lastTick = now;
    }, 10);
    const rows = Array.from({ length:10000 }, (_, index) => ({
      student_number:`PERF-${index}`,
      full_name:`性能测试${index}`,
      class_name:`性能测试班${index % 20}`,
      dorm:`${index % 100 + 1}-${index % 6 + 1}`,
      custom_fields:{ source:'browser-performance-gate' },
    }));
    const started = performance.now();
    const result = await window.CWB.importer.start({ collection:'students', rows, chunkSize:128, fileHash:'browser-performance-gate-v1', onProgress:item => progress.push({ status:item.status, processed:item.processed, at:performance.now() }) });
    const elapsed = performance.now() - started;
    clearInterval(timer);
    const progressGaps = progress.slice(1).map((item, index) => item.at - progress[index].at);
    const maxEventLoopGap = Math.max(0, ...eventGaps);
    return {
      status:result.status,
      elapsed,
      progressCount:progress.length,
      maxProgressGap:Math.max(0, ...progressGaps),
      maxEventLoopGap,
      maxEventLoopAt:eventGaps.indexOf(maxEventLoopGap),
      progressAt:progress.map(item => Math.round(item.at - started)),
      processed:progress.at(-1)?.processed || 0,
    };
    }));
    await within('V40_PERFORMANCE_RELOAD', page.reload({ waitUntil:'domcontentloaded', timeout:60000 }));
    await within('V40_PERFORMANCE_REHYDRATE', page.waitForFunction(() => document.documentElement.dataset.v4Ready === 'true'));
    const persisted = await within('V40_PERFORMANCE_PERSISTENCE', page.evaluate(async () => { const rows = await window.CWB.repositories.students.list(); return { count:rows.length, first:rows.find(row => row.student_number === 'PERF-0')?.student_number }; }));
    assert.equal(persisted.count, baselineCount + 10000);
    assert.equal(persisted.first, 'PERF-0');
    console.log(`v40 performance sample: ${JSON.stringify(result)}`);
    assert.equal(result.status, 'completed');
    assert.equal(result.processed, 10000);
    assert.ok(result.progressCount >= 2, `expected progress callbacks, got ${result.progressCount}`);
    assert.ok(result.elapsed <= 30000, `10,000-row import ${result.elapsed.toFixed(1)}ms exceeds 30s`);
    assert.ok(result.maxProgressGap <= 200, `import responsiveness gap ${result.maxProgressGap.toFixed(1)}ms exceeds 200ms`);
    console.log(`PASS v40-performance-browser (${JSON.stringify(result)})`);
  } catch (error) {
    error.message = `${error.message}\nV40_PERFORMANCE_LIFECYCLE=${lifecycle.join(',') || 'none'}`;
    throw error;
  } finally {
    await within('V40_PERFORMANCE_BROWSER_CLOSE', browser.close(), 5000).catch(() => {});
  }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
