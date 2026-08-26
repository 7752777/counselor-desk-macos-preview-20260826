const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const releaseScreenshotDirectory = 'v4.9.0';
const releaseScreenshotRoot = path.join(root, 'assets', 'screenshots', releaseScreenshotDirectory);
const releaseScreenshots = fs.readdirSync(releaseScreenshotRoot, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.png$/i.test(entry.name))
  .map(entry => entry.name)
  .sort();

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

function run(relative, args = []) {
  return spawnSync(process.execPath, [path.join(root, relative), ...args], {
    cwd: root,
    encoding: 'utf8'
  });
}

function removeDirectory(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) removeDirectory(full);
    else fs.unlinkSync(full);
  }
  fs.rmdirSync(directory);
}

function assertPackageLinks(directory, relative) {
  // The offline package carries selected user/developer docs, not the private
  // audit archive or build-only source files. Those links must stay inside the
  // repository when present, but do not require copying internal history into
  // a friend-facing package.
  const packageRelative = relative.replace(/\\/g, '/');
  if (packageRelative === 'CHANGELOG.md' || packageRelative === 'docs/README.md' || packageRelative.startsWith('docs/upgrade/')) return;
  const content = fs.readFileSync(path.join(directory, relative), 'utf8');
  const localLinkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of content.matchAll(localLinkPattern)) {
    const target = match[1];
    if (/^(?:[a-z]+:|#|\/\/)/i.test(target)) continue;
    const clean = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (!clean) continue;
    if (/(?:^|\/)upgrade\//i.test(clean) || /\.tex$/i.test(clean) || /(?:^|\/)services\/license-server\/\.env\.example$/i.test(clean)) continue;
    const resolved = path.resolve(path.dirname(path.join(directory, relative)), clean);
    assert.equal(resolved.startsWith(directory), true, `Package link escapes package: ${relative} -> ${target}`);
    assert.equal(fs.existsSync(resolved), true, `Package link is missing: ${relative} -> ${target}`);
  }
}

function packageMarkdownFiles(directory, relative = '') {
  const current = path.join(directory, relative);
  const files = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...packageMarkdownFiles(directory, next));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(next);
  }
  return files;
}

function assertRepositoryLinks(relative) {
  const content = read(relative);
  const localLinkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (const match of content.matchAll(localLinkPattern)) {
    const target = match[1];
    if (/^(?:[a-z]+:|#|\/\/|\.\.\/\.\.\/(?:issues|discussions|security)(?:\/|$))/i.test(target)) continue;
    const clean = decodeURIComponent(target.split('#')[0].split('?')[0]);
    if (!clean) continue;
    const resolved = path.resolve(path.dirname(path.join(root, relative)), clean);
    assert.equal(resolved === root || resolved.startsWith(`${root}${path.sep}`), true, `Repository link escapes project: ${relative} -> ${target}`);
    assert.equal(fs.existsSync(resolved), true, `Repository link is missing: ${relative} -> ${target}`);
  }
}

for (const relative of [
  'docs/prompts',
  'docs/prompt-archive.md',
  'docs/项目反推提示词.md',
  'docs/迭代记录',
  'docs/decisions',
  'docs/v4-ux-optimization-plan.md',
  'docs/使用指南.md',
  'docs/辅导员工作台使用手册.md',
  'docs/数据格式与联动约定.md',
  'docs/二次开发指南.md'
]) {
  assert.equal(fs.existsSync(path.join(root, relative)), false, `Internal material remains public: ${relative}`);
}

const readme = read('README.md');
for (const heading of [
  '# 学工智伴 v4.9.0 商业候选 · Counselor Desk',
  '## 🎯 这是给一线工作留出来的一张工作台',
  '## ✨ v4.8.5 的核心体验',
  '## 🚀 从这里开始',
  '## 🔐 本地优先，也把边界说清楚',
  '## 🖼️ v4.9.0 界面一览',
  '## 🪜 一次次把工作做细：完整版本历程'
]) {
  assert.match(readme, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(readme, /提示词|AI\s*复现|生成过程|生成模型|设计令牌|素材路径|工程对话|内部验收/i);
assert.doesNotMatch(readme, /Windows-安装版\.msi|macOS-安装版\.dmg/);
assert.match(readme, /formal%20release-v4\.8\.5/, 'README must identify the current verified release rather than a pre-release candidate');
assert.doesNotMatch(readme, /Release Candidate|正在进行最终发布验证|当前在线体验仍是已发布的旧版/, 'README must not retain candidate-era release messaging after publication');
assert.match(readme, /v3\.8(?:\.0)?\*{0,2}\s*\|\s*2026-08-04/, 'README must retain the earlier v3.8 milestone alongside the v4 timeline');
assert.match(readme, /v3\.9(?:\.0)?\*{0,2}\s*\|\s*2026-08-05/, 'README must retain the earlier v3.9 milestone alongside the v4 timeline');
assert.match(readme, /v4\.0\*{0,2}\s*\|\s*2026-08-07/, 'README must keep the factual v4.0 milestone');
assert.match(readme, /v4\.4\.0\*{0,2}\s*\|\s*2026-08-13/, 'README must distinguish the v4.4.0 integration milestone');

const changelog = read('CHANGELOG.md');
assert.match(changelog, /## \[4\.4\.0\].*正式发布/, 'CHANGELOG must contain a factual v4.4.0 release entry');
assert.doesNotMatch(changelog, /v4\.4\.0 还没有创建公开 Tag|现有在线体验仍是等待替换的旧站/, 'CHANGELOG must not retain pre-release claims after publication');

const acceptance = read('docs/v4-acceptance-report.md');
assert.match(acceptance, /ed362d73a1c95bded26bdfba811a10eb73b5b2a2/, 'acceptance report must identify the released source commit');
assert.match(acceptance, /31768117637/, 'acceptance report must link the verified release gate run');
assert.match(acceptance, /31768796087/, 'acceptance report must link the published Pages deployment');

const banner = read('assets/banner.svg');
assert.doesNotMatch(banner, /v4\.0\.0|v3\.9|v3\.8/);

const currentPublicText = [
  readme,
  read('CHANGELOG.md'),
  read('CONTRIBUTING.md'),
  read('SECURITY.md'),
  ...fs.readdirSync(path.join(root, 'docs'))
    .filter(name => name.endsWith('.md'))
    .map(name => read(path.join('docs', name))),
  read('samples/import-compat/README.md')
].join('\n');
// Historical versions remain useful context; stale binary names must not be
// advertised as current downloads.
assert.doesNotMatch(currentPublicText, /Windows-安装版\.msi|macOS-安装版\.dmg/);

const docsIndex = read('docs/README.md');
assert.doesNotMatch(docsIndex, /提示词|AI\s*复现|superpowers|设计与实施计划|内部验收/i);
assert.match(docsIndex, /开发与构建/);

const architecture = read('docs/architecture.md');
for (const phrase of ['schema v8', 'CWB.workspace', 'CWB.views', 'CWB.imports', 'CWB.exports', 'CWB.diagnostics', '测试分层']) {
  assert.match(architecture, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(architecture, /v3\.9|v4\.0|提示词|生成过程|实施计划|执行计划|ADR-/i);

for (const relative of [
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  ...fs.readdirSync(path.join(root, 'docs'))
    .filter(name => name.endsWith('.md'))
    .map(name => path.join('docs', name)),
  'samples/import-compat/README.md'
]) assertRepositoryLinks(relative);

const packageBuilder = read('scripts/build-package.js');
assert.doesNotMatch(packageBuilder, /copyDirectory\(path\.join\(root, 'docs'\)/);
assert.doesNotMatch(packageBuilder, /v4\.0-全面验收报告|品牌与素材说明|公开仓库维护指南/);
assert.match(packageBuilder, /assertReleasePackageSafe/);

const packageTarget = path.join(root, 'tmp', 'public-surface-package-check');
removeDirectory(packageTarget);
fs.mkdirSync(packageTarget, { recursive: true });
fs.writeFileSync(path.join(packageTarget, 'stale.txt'), 'stale release material', 'utf8');
const stalePackageBuild = run('scripts/build-package.js', [packageTarget]);
assert.notEqual(stalePackageBuild.status, 0, 'Release package must reject a non-empty target directory');
removeDirectory(packageTarget);
const packageBuild = run('scripts/build-package.js', [packageTarget]);
assert.equal(packageBuild.status, 0, packageBuild.stderr || packageBuild.stdout);
for (const unexpected of ['desktop', 'docs/prompts', 'docs/superpowers', 'docs/迭代记录', 'stale.txt']) {
  assert.equal(fs.existsSync(path.join(packageTarget, unexpected)), false, `Offline package leaked ${unexpected}`);
}
for (const expected of [
  '学工智伴-v4.9.0.html',
  'README.md',
  'CONTRIBUTING.md',
  'THIRD-PARTY-NOTICES.md',
  'assets/github-hero-v4.png',
  'assets/welcome-education-scene-v2.png',
  'assets/welcome-morning.png',
  'docs/getting-started.md',
  'docs/development.md',
  'docs/architecture.md',
  'docs/quick-start.md',
  'docs/user-guide.md',
  'docs/v4-privacy.md',
  ...releaseScreenshots.map(name => path.join('assets', 'screenshots', releaseScreenshotDirectory, name)),
]) {
  assert.equal(fs.existsSync(path.join(packageTarget, expected)), true, `Offline package missed ${expected}`);
}
for (const screenshot of releaseScreenshots) {
  const source = path.join(releaseScreenshotRoot, screenshot);
  const packaged = path.join(packageTarget, 'assets', 'screenshots', releaseScreenshotDirectory, screenshot);
  assert.deepEqual(fs.readFileSync(packaged), fs.readFileSync(source), `Offline package screenshot must match the release source: ${screenshot}`);
}
for (const relative of packageMarkdownFiles(packageTarget)) assertPackageLinks(packageTarget, relative);
removeDirectory(packageTarget);

// The workspace keeps a developer-only root guide for current-state checks;
// validate the same filtered tree that release checks expose publicly.
const publicCheck = run('scripts/check-public-surface-staged.js');
assert.equal(publicCheck.status, 0, publicCheck.stderr || publicCheck.stdout);
assert.match(publicCheck.stdout, /Public surface check passed/);

console.log('PASS public-surface-cleanup');
