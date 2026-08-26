const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packageVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const target = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'output', `counselor-desk-v${packageVersion}`);
const screenshotDirectory = 'v4.9.0';
const screenshotSource = path.join(root, 'assets', 'screenshots', screenshotDirectory);
if (!fs.existsSync(screenshotSource)) throw new Error(`Missing product screenshots: ${screenshotSource}`);
const screenshots = fs.readdirSync(screenshotSource, { withFileTypes: true })
  .filter(entry => entry.isFile() && /\.png$/i.test(entry.name))
  .map(entry => entry.name)
  .sort();
if (!screenshots.length) throw new Error(`No product screenshots found: ${screenshotSource}`);

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive:true });
  fs.copyFileSync(source, destination);
}

function assertReleasePackageSafe(directory) {
  const forbidden = /(?:prompts?|superpowers|\.git(?:\\|\/|$)|node_modules(?:\\|\/|$))/i;
  const queue = [directory];
  while (queue.length) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes:true })) {
      const full = path.join(current, entry.name);
      if (forbidden.test(path.relative(directory, full))) throw new Error(`Release package contains internal material: ${full}`);
      if (entry.isDirectory()) queue.push(full);
    }
  }
}

if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error(`Release package target must be empty: ${target}`);
fs.mkdirSync(target, { recursive:true });

const htmlTarget = path.join(target, `学工智伴-v${packageVersion}.html`);
const built = spawnSync(process.execPath, [path.join(root, 'scripts', 'build-release.js'), htmlTarget], { cwd:root, stdio:'inherit' });
if (built.status !== 0) process.exit(built.status || 1);

for (const relative of [
  'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE', 'SECURITY.md', 'THIRD-PARTY-NOTICES.md',
  'docs/README.md', 'docs/development.md', 'docs/architecture.md', 'docs/getting-started.md', 'docs/quick-start.md', 'docs/user-guide.md',
  'docs/customer-quickstart-v4.9.1.md', 'docs/product-manual-v4.9.1.md',
  'docs/data-contract.md', 'docs/v4-migration-and-backup.md', 'docs/v4-desktop-installation.md',
  'docs/v4-privacy.md', 'docs/release-guide.md', 'docs/v4-acceptance-report.md',
  'docs/upgrade/release-v4.4.6.md', 'docs/upgrade/user-centered-audit-2026-08-18.md', 'docs/upgrade/dependency-inventory.md'
]) copy(path.join(root, relative), path.join(target, relative));

for (const asset of ['logo.svg', 'app-icon.svg', 'banner.svg', 'github-hero-v4.png', 'counselor-desk-hero.png', 'welcome-education-scene-v2.png', 'welcome-morning.png']) copy(path.join(root, 'assets', asset), path.join(target, 'assets', asset));
for (const name of screenshots) copy(path.join(screenshotSource, name), path.join(target, 'assets', 'screenshots', screenshotDirectory, name));
for (const runtime of ['xlsx.full.min.js', 'argon2-bundled.min.js', 'jszip.min.js', 'echarts.min.js', 'xlsx.LICENSE']) copy(path.join(root, 'vendor', runtime), path.join(target, 'vendor', runtime));

const sampleSource = path.join(root, 'samples', 'import-compat');
for (const entry of fs.readdirSync(sampleSource, { withFileTypes:true })) {
  if (entry.isFile() && /\.(csv|xls|xlsx)$/i.test(entry.name)) copy(path.join(sampleSource, entry.name), path.join(target, '脱敏导入样表', entry.name));
}
assertReleasePackageSafe(target);
console.log(`Release package created: ${target}`);
