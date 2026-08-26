const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(html, /\.save-status\{/);
assert.match(html, /\.student-table-wrap\[data-windowed="true"\]/);
assert.match(html, /class=\"schedule-week\"/);
assert.match(html, /class=\"schedule-day\"/);
assert.match(html, /class=\"schedule-entry\"/);
assert.match(html, /data-grade-trend/);
assert.match(html, /@media \(max-width:900px\)/);
assert.match(html, /@media \(max-width:480px\)/);
assert.match(html, /position:sticky;top:0;z-index:60/);
assert.match(html, /content-visibility:auto/);
assert.doesNotMatch(html, /letter-spacing\s*:\s*-/,
  'the product UI must not use negative letter spacing that harms Chinese readability');
assert.equal((html.match(/@media\(max-width:700px\)\{\.ai-inline-bar/g) || []).length, 1,
  'the AI mobile layout rule should have one canonical declaration');
console.log('PASS visual-contract');
