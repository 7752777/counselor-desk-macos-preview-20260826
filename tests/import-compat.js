/** v3.9 CSV/Excel compatibility and mapping contract. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { TextDecoder, TextEncoder } = require('node:util');
const { JSDOM, VirtualConsole } = require('jsdom');
const XLSX = require('xlsx');
assert.equal(XLSX.version, '0.20.3', 'offline spreadsheet parser must use the audited fixed release');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'index.html');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => { if (!/scrollTo|Not implemented|Could not load/i.test(error.message)) errors.push(error.message); });
  const dom = await JSDOM.fromFile(file, { runScripts:'dangerously', resources:'usable', url:'https://c.local/', virtualConsole:vc, pretendToBeVisual:true,
    beforeParse(window) { window.TextDecoder = TextDecoder; window.TextEncoder = TextEncoder; }
  });
  const w = dom.window;
  await sleep(500);
  const importer = w.CWB.importer;

  const gb18030 = Uint8Array.from([
    0xD1,0xA7,0xBA,0xC5,0x2C,0xD0,0xD5,0xC3,0xFB,0x0A,
    0x30,0x30,0x31,0x2C,0xD5,0xC5,0xC8,0xFD,
  ]);
  const decoded = importer.decodeCSVBytes(gb18030, 'auto');
  assert.equal(decoded.encoding, 'gb18030');
  assert.equal(decoded.text, '学号,姓名\n001,张三');

  const headerRows = [
    ['某高校2026级学生信息表'], [], ['序号','学号','姓名','行政班名称'], ['1','0001','张三','计科一班'],
  ];
  const detection = importer.detectHeaderRow(headerRows, 'students');
  assert.equal(detection.headerRow, 3, 'header scanning must inspect title rows before the real header');
  assert.ok(detection.score >= 3, 'header recommendation must report its field-match confidence');

  const mapped = importer.previewCSV('学号,姓名,行政班名称\n0007,李华,计科一班', 'students', {
    mapping:{ 行政班名称:'class_name' },
  });
  assert.equal(mapped.rows[0].value.class_name, '计科一班', 'manual mapping must affect preview data');
  importer.saveMappingPreset('students', '本校教务表', { 行政班名称:'class_name' });
  assert.equal(importer.getMappingPresets('students')[0].name, '本校教务表', 'school mappings must persist locally');
  importer.saveMappingPreset('students', '本校自定义班别', { 班别自定义:'class_name' });
  const reusedPreset = importer.previewCSV('学号,姓名,班别自定义\n0008,周同学,智能科学一班', 'students');
  assert.equal(reusedPreset.rows[0].value.class_name, '智能科学一班', 'matching saved school mapping must be reused automatically');

  const fileLike = { name:'学生.csv', type:'text/csv', arrayBuffer:async () => gb18030.buffer };
  const filePreview = await importer.previewFile(fileLike, 'students', { encoding:'auto' });
  assert.equal(filePreview.source.encoding, 'gb18030');
  assert.equal(filePreview.rows[0].value.student_number, '001');

  const campusLeavePreview = importer.previewCSV([
    '\u59d3\u540d,\u5b66\u53f7,\u73ed\u7ea7,\u79bb\u6821\u65f6\u95f4,\u8fd4\u6821\u65f6\u95f4',
    '\u6d4b\u8bd5\u7532,202400000001,24\u673a\u5668\u4eba01,7/25/26,8/30/26',
    '\u6d4b\u8bd5\u4e59,202400000002,24\u673a\u5668\u4eba01,7\u670827\u53f7,8/31/26',
    '\u6d4b\u8bd5\u4e19,202400000003,24\u673a\u5668\u4eba01,2026\u5e747\u670828\u65e5,2026\u5e748\u670831\u65e5',
  ].join('\n'), 'leave');
  assert.equal(campusLeavePreview.summary.ready, 3, 'campus leave dates must remain importable');
  assert.equal(JSON.stringify(campusLeavePreview.rows.map(row => [row.value.leave_date, row.value.return_date])), JSON.stringify([
    ['2026-07-25', '2026-08-30'],
    ['2026-07-27', '2026-08-31'],
    ['2026-07-28', '2026-08-31'],
  ]), 'campus leave date variants must normalize to ISO before validation');

  const detailedGradesPreview = importer.previewCSV([
    '学号,姓名,开课学期,班级名称,课程编号,课程名称,总成绩,成绩标志,课程性质,课程属性,补重学期,备注',
    '测试01,202400000001,2025-2026-1,24机器人01,COURSE-001,大学英语,437,,必修,专业基础,,',
    '测试02,202400000002,2025-2026-1,24机器人01,COURSE-002,教育心理学,优,,选修,通识,,',
    '测试03,202400000003,2025-2026-1,24机器人01,COURSE-003,编程基础,不及格,,必修,专业基础,,',
  ].join('\n'), 'grades');
  assert.equal(detailedGradesPreview.summary.ready, 3, 'standard detailed grade exports must not be blocked by auxiliary columns');
  assert.deepEqual(Array.from(detailedGradesPreview.duplicateColumns), [], 'course codes and attributes must not duplicate grade fields');
  assert.equal(JSON.stringify(detailedGradesPreview.rows.map(row => [row.value.course, row.value.score, row.value.failed])), JSON.stringify([
    ['大学英语', 43.7, true],
    ['教育心理学', 90, false],
    ['编程基础', 0, true],
  ]), 'grade scores must normalize before numeric validation');

  w.XLSX = XLSX;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['说明页']]), '说明');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['某高校学生信息导出'],
    ['生成时间：2026-08-05'],
    ['学号', '姓名', '行政班名称'],
    ['000042', '陈同学', '人工智能一班'],
  ]), '学生名单');
  const excelBytes = XLSX.write(workbook, { type:'array', bookType:'xlsx' });
  const excelPreview = await importer.previewFile({
    name:'多工作表学生名单.xlsx', type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    arrayBuffer:async () => excelBytes,
  }, 'students', { sheetName:'学生名单' });
  assert.deepEqual(Array.from(excelPreview.sheets), ['说明', '学生名单']);
  assert.equal(excelPreview.source.headerRow, 3, 'Excel title rows must be skipped after header detection');
  assert.equal(excelPreview.rows[0].value.student_number, '000042', 'Excel leading-zero student number text must survive');

  const recommendedSheetPreview = await importer.previewFile({
    name:'多工作表学生名单.xlsx', type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    arrayBuffer:async () => excelBytes,
  }, 'students');
  assert.equal(recommendedSheetPreview.source.sheet, '学生名单', 'the worksheet with the strongest schema header match must be recommended');
  assert.equal(recommendedSheetPreview.source.headerRow, 3, 'recommended worksheet must retain its detected header row');

  const templateColumns = w.CWB.studentTemplateColumns();
  for (const field of ['id_card','home_addr','parent_phone']) {
    const column = templateColumns.find(item => item.field === field);
    assert.ok(column && /敏感/.test(column.header), `${field} must be present and visibly marked sensitive`);
  }

  const sampleDir = path.join(root, 'samples', 'import-compat');
  const sampleFiles = fs.readdirSync(sampleDir).filter(name => /\.(csv|xls|xlsx)$/i.test(name));
  assert.ok(sampleFiles.length >= 10, 'release must include at least 10 anonymized compatibility samples');
  const gbSample = Uint8Array.from(fs.readFileSync(path.join(sampleDir, '11-GB18030.csv')));
  assert.equal(importer.decodeCSVBytes(gbSample, 'auto').encoding, 'gb18030');
  const xlsxSample = Uint8Array.from(fs.readFileSync(path.join(sampleDir, '12-Excel-多工作表合并标题.xlsx')));
  const samplePreview = await importer.previewFile({ name:'兼容样表.xlsx', arrayBuffer:async () => xlsxSample.buffer }, 'students', { sheetName:'学生名单' });
  assert.equal(samplePreview.rows[0].value.student_number, '000013');

  const indexSource = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(indexSource, /cdn\.jsdelivr\.net\/npm\/xlsx/, 'runtime Excel support must not depend on CDN');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-offline-release-'));
  const target = path.join(tempDir, '辅导员工作台.html');
  try {
    const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-release.js'), target], { cwd:root, encoding:'utf8' });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    const release = fs.readFileSync(target, 'utf8');
    assert.match(release, /SheetJS|xlsx\.js/i, 'release must embed the offline Excel parser');
    assert.ok(!release.includes('<script defer src="vendor/xlsx.full.min.js"'), 'release must remain a portable single file');
  } finally {
    fs.rmSync(tempDir, { recursive:true, force:true });
  }

  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS import-compat');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
