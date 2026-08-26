const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CWBCollections } = require('../src/core/cwb-collections.js');

const requiredLogical = [
  'students', 'tasks', 'talks', 'orgs', 'party', 'rewards', 'activities',
  'grades', 'worklogs', 'warn', 'help', 'grant', 'focus', 'psych',
  'graduate', 'policy', 'material', 'comp', 'tpl', 'learning_materials',
  'learning_notes', 'learning_sessions', 'v4_ai_providers', 'v4_ai_audit',
  'v4_ai_drafts',
  'v4_employment_intents', 'v4_employment_contacts', 'v4_assessments',
  'v4_academic_terms', 'v4_disciplines', 'v4_aid_records', 'v4_contacts',
  'v4_class_schedules', 'v4_activity_participants', 'v4_league_cases', 'v4_photo_queue',
];

for (const key of requiredLogical) {
  assert.ok(CWBCollections.logical.includes(key), `logical collection missing: ${key}`);
}

for (const key of CWBCollections.logical) {
  assert.equal(CWBCollections.desktopName(key).startsWith('records_'), true, `desktop mapping missing: ${key}`);
}

assert.ok(CWBCollections.workspace.every(key => CWBCollections.logical.includes(key)));
assert.ok(CWBCollections.sync.every(key => CWBCollections.workspace.includes(key)));
assert.ok(CWBCollections.backup.every(key => CWBCollections.logical.includes(key)));

const root = path.join(__dirname, '..');
const desktopMain = fs.readFileSync(path.join(root, 'desktop', 'main.cjs'), 'utf8');
const browserEntry = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const releaseBuilder = fs.readFileSync(path.join(root, 'scripts', 'build-release.js'), 'utf8');
const v4Runtime = fs.readFileSync(path.join(root, 'src', 'core', 'v4-runtime.js'), 'utf8');
const v8Migration = fs.readFileSync(path.join(root, 'src', 'core', 'v8-migration.js'), 'utf8');
assert.match(desktopMain, /require\('\.\.\/src\/core\/cwb-collections\.js'\)/, 'desktop must use the shared manifest');
assert.match(browserEntry, /<script data-cwb-collections>/, 'browser must embed the shared manifest for offline startup');
const embeddedManifest = browserEntry.match(/<script data-cwb-collections>[\s\S]*?const custom = Object\.freeze\(\[([^\]]+)\]\);/);
assert.ok(embeddedManifest, 'browser must expose a parseable embedded custom manifest');
const embeddedCustom = [...embeddedManifest[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.deepEqual(embeddedCustom, CWBCollections.custom, 'browser embedded manifest must match the shared manifest');
assert.match(browserEntry, /src\/core\/cwb-ai-workflow\.js/, 'browser must load the AI workflow runtime');
assert.match(browserEntry, /const customRepositoryKeys = CWB_COLLECTIONS\.custom;/, 'runtime repositories must derive from the shared custom manifest');
assert.match(releaseBuilder, /cwb-collections\.js/, 'portable build must inline the shared manifest');
assert.match(releaseBuilder, /cwb-ai-workflow\.js/, 'portable build must inline the AI workflow runtime');
assert.match(v4Runtime, /CWBCollections\.desktopCollections/, 'IndexedDB schema must derive stores from the shared manifest');
assert.match(v8Migration, /CWBCollections\.storagePaths\(\)/, 'migration must derive persisted paths from the shared manifest');

console.log('PASS cwb-collections');
