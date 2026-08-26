const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const previewPath = path.join(__dirname, '..', 'output', 'v4-preview.html');

async function openApp() {
  const dom = await JSDOM.fromFile(previewPath, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'https://c.local/',
    virtualConsole: new VirtualConsole(),
    pretendToBeVisual: true,
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  return dom;
}

async function importRows(importer, rows, label) {
  const progress = [];
  const started = Date.now();
  const result = await importer.start({
    collection: 'students',
    rows,
    chunkSize: 500,
    onProgress: item => progress.push({ ...item, at: Date.now() }),
  });
  assert.equal(result.status, 'completed', `${label} must complete`);
  if (rows.length) assert.equal(progress.at(-1).status, 'completed', `${label} must report completion`);
  return Date.now() - started;
}

(async () => {
  // Verify controller boundaries independently from the large-import performance gate.
  const smallDom = await openApp();
  try {
    const importer = smallDom.window.CWB.importer;
    for (const size of [0, 1, 100]) {
      const rows = Array.from({ length: size }, (_, index) => ({
        student_number: `ACCEPT-SMALL-${size}-${index}`,
        full_name: `Acceptance ${index}`,
        class_name: 'Acceptance class',
        custom_fields: { source: 'import-acceptance' },
      }));
      await importRows(importer, rows, `${size}-row import`);
    }

    // Field width is a data-contract concern. Keep it explicit without turning it
    // into an unrelated one-million-cell throughput benchmark.
    const wideRows = Array.from({ length: 100 }, (_, index) => ({
      student_number: `ACCEPT-WIDE-${index}`,
      full_name: `Wide ${index}`,
      class_name: 'Acceptance class',
      custom_fields: Object.fromEntries(Array.from({ length: 100 }, (_, column) => [
        `field_${column}`,
        `value_${index}_${column}`,
      ])),
    }));
    await importRows(importer, wideRows, 'wide-field import');
    const stored = (await smallDom.window.CWB.repositories.students.list())
      .find(item => item.student_number === 'ACCEPT-WIDE-99');
    assert.equal(stored.custom_fields.field_99, 'value_99_99', 'wide custom fields must persist intact');
  } finally {
    smallDom.window.close();
  }

  // The real-browser gate in v40-performance-browser.js owns the 10,000-row
  // responsiveness and persistence contract. JSDOM's IndexedDB shim is not an
  // equivalent execution environment at that scale; keeping this test focused
  // on importer semantics prevents an environment-only timeout from masking a
  // product regression.

  console.log('PASS v40-import-acceptance');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
