'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const screenshotDirectory = path.join(root, 'assets', 'screenshots', 'v4.4.0');
const screenshots = [
  '01-overview.png',
  '02-students-pagination-bulk.png',
  '03-import-preview.png',
  '04-student-timeline.png',
  '05-party-development.png',
  '06-talk-crisis-schedule.png',
  '07-grades-support.png',
  '08-backup-migration.png',
];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngDimensions(file) {
  const source = fs.readFileSync(file);
  assert.ok(source.length >= 24, `${path.relative(root, file)} is too small to be a PNG`);
  assert.ok(source.subarray(0, pngSignature.length).equals(pngSignature), `${path.relative(root, file)} must be a PNG`);
  assert.equal(source.toString('ascii', 12, 16), 'IHDR', `${path.relative(root, file)} is missing a PNG IHDR header`);
  return { width:source.readUInt32BE(16), height:source.readUInt32BE(20) };
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const captureScript = fs.readFileSync(path.join(root, 'scripts', 'capture-release-screenshots.js'), 'utf8');

assert.match(
  captureScript,
  /async function waitForRouteContent\(page, route\)/,
  'release capture must wait for route-specific content instead of a timing-only delay',
);
assert.match(
  captureScript,
  /home:\s*'\.today'/,
  'the overview capture must wait until the rendered daily overview is present',
);
assert.match(
  captureScript,
  /backup:\s*'\.v4-head'/,
  'the backup capture must wait for the rendered backup page, not an implementation-only marker',
);
assert.match(
  captureScript,
  /await waitForRouteContent\(page, route\)/,
  'each release capture must wait for its route content before taking a screenshot',
);
assert.match(
  captureScript,
  /01-overview\.png', 'home', async page => \{[\s\S]*\.today-list \{ max-height:330px; overflow:hidden; \}[\s\S]*scrollIntoView\(\{ block:'start' \}\)/,
  'the overview capture must frame the daily overview within the release viewport',
);

for (const filename of screenshots) {
  const relative = `./assets/screenshots/v4.4.0/${filename}`;
  const file = path.join(screenshotDirectory, filename);
  assert.ok(fs.existsSync(file), `Missing required v4.4.0 release screenshot: ${relative}`);
  const dimensions = pngDimensions(file);
  assert.deepEqual(dimensions, { width:2560, height:1440 }, `${relative} must be exactly 2560x1440`);

  const markdownReference = `](${relative}`;
  const htmlReference = `src="${relative}"`;
  const singleQuotedHtmlReference = `src='${relative}'`;
  assert.ok(
    readme.includes(markdownReference) || readme.includes(htmlReference) || readme.includes(singleQuotedHtmlReference),
    `README must link ${relative} as an individual screenshot`,
  );
}

console.log('PASS release-screenshots');
