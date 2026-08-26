const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src', 'core', 'cwb-v47-ui.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'src', 'core', 'cwb-v47.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'scripts', 'build-release.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');

assert.match(html, /data-cwb-v47/);
assert.match(html, /data-cwb-v47-ui/);
for (const view of ['class-checks', 'roll-call', 'dorm-inspections', 'assessment', 'toolbox', 'employment-safety', 'competitions', 'academic-analysis', 'notice-ai']) {
  assert.match(ui, new RegExp(`VIEWS(?:\\[(['"])${view}\\1\\]|\\.${view})`), `missing v4.7 view ${view}`);
}
for (const collection of ['v4_class_checks', 'v4_roll_call_sessions', 'v4_dorm_inspections', 'v4_dorm_exceptions', 'v4_assessment_rules', 'v4_assessment_entries', 'v4_tool_links', 'v4_employment_safety', 'v4_competition_resources', 'v4_competition_entries']) {
  assert.match(core, new RegExp(collection));
  assert.match(html, new RegExp(collection));
}
assert.match(ui, /cwb-v47-layout/);
assert.match(ui, /prefers-reduced-motion/);
assert.match(builder, /v10-migration\.js/);
assert.match(builder, /cwb-v47-ui\.js/);
assert.match(desktop, /src\/core\/cwb-v47\.js/);
assert.match(desktop, /src\/core\/cwb-v47-ui\.js/);

console.log('PASS v47-ui');
