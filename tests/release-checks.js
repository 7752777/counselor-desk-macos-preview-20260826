const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function run(script) {
  return spawnSync(process.execPath, [path.join(root, script)], {
    cwd: root,
    encoding: 'utf8'
  });
}

const inline = run('scripts/check-inline-js.js');
assert.equal(inline.status, 0, inline.stderr || inline.stdout);
assert.match(inline.stdout, /Inline JavaScript syntax OK/);

const publicSurface = run('scripts/check-public-surface-staged.js');
assert.equal(publicSurface.status, 0, publicSurface.stderr || publicSurface.stdout);
assert.match(publicSurface.stdout, /Public surface check passed/);

const html = require('node:fs').readFileSync(path.join(root, 'index.html'), 'utf8');
  const packageBuilder = require('node:fs').readFileSync(path.join(root, 'scripts', 'build-package.js'), 'utf8');
  const releaseBuilder = require('node:fs').readFileSync(path.join(root, 'scripts', 'build-release.js'), 'utf8');
const compactHeader = html.match(/@media \(max-width:480px\)\s*\{([\s\S]*?)\n\}/);
assert.ok(compactHeader, 'Expected a compact mobile header media query');
assert.match(compactHeader[1], /\.topbar-search-wrap\{display:none\}/);
assert.match(compactHeader[1], /\.topbar\{padding:0 10px;gap:6px;overflow:hidden\}/);
  for (const token of ['docs/v4-acceptance-report.md', 'docs/release-guide.md', 'banner.svg', 'counselor-desk-hero.png', 'welcome-education-scene-v2.png', 'welcome-morning.png', 'screenshots', 'xlsx.full.min.js', 'argon2-bundled.min.js', 'jszip.min.js', 'echarts.min.js']) assert.ok(packageBuilder.includes(token), `release package is missing: ${token}`);
  for (const stale of ['docs/v4.0-全面验收报告.md', '品牌与素材说明.md', 'assetsSource']) assert.ok(!packageBuilder.includes(stale), `release package still references stale material: ${stale}`);
  assert.match(releaseBuilder, /data:application\/javascript;base64/, 'standalone release must load the binary-safe SheetJS runtime');

const portableFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-release-check-')), 'CounselorDesk.html');
const portableBuild = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-release.js'), portableFile], { cwd:root, encoding:'utf8' });
assert.equal(portableBuild.status, 0, portableBuild.stderr || portableBuild.stdout);
const portableHtml = fs.readFileSync(portableFile, 'utf8');
for (const asset of ['welcome-education-scene-v2.png', 'welcome-morning.png']) {
  assert.match(portableHtml, new RegExp(`"${asset}":"data:image/png;base64,`), `portable release should inline ${asset}`);
  assert.ok(!portableHtml.includes(`assets/${asset}`), `portable release must not depend on an adjacent ${asset}`);
}

console.log('PASS release-checks');
