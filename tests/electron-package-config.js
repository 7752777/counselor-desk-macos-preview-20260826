const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = fs.readFileSync(path.resolve(__dirname, '..', 'electron-builder.yml'), 'utf8');
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const installer = fs.readFileSync(path.resolve(__dirname, '..', 'desktop', 'installer.nsh'), 'utf8');
const rootPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
const desktopPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'desktop', 'package.json'), 'utf8'));
const legacyConfig = fs.readFileSync(path.resolve(__dirname, '..', 'desktop', 'electron-builder.yml'), 'utf8');

assert.equal(desktopPackage.version, rootPackage.version, 'desktop package version must match the root release version');
assert.match(config, /!desktop\/electron-builder\.yml/, 'the root builder must remain the only formal desktop build contract');
assert.match(legacyConfig, /Formal builds use \.\.\/electron-builder\.yml/, 'the legacy desktop config must identify the root builder as authoritative');

assert.match(config, /^productName: 学工智伴$/m, 'The installed product name must use the current Chinese product identity');
assert.match(config, /^executableName: counselor-desk$/m, 'The Windows executable must use an ASCII-safe file name for installation');
assert.match(config, /^icon: assets\/app-icon\.svg$/m, 'The shared icon remains SVG so macOS can generate its native icon format');
assert.match(config, /^win:\r?\n  icon: assets\/app-icon\.ico$/m, 'Windows builds must use the checked-in ICO asset instead of converting SVG during packaging');
assert.ok(fs.existsSync(path.resolve(__dirname, '..', 'assets', 'app-icon.ico')), 'the Windows ICO asset must be present for reproducible packaging');
assert.match(config, /^  shortcutName: 学工智伴$/m, 'The desktop shortcut must use the current Chinese product identity');
assert.match(config, /^    - nsis$/m, 'Windows release builds must use the requested NSIS installer target');
assert.match(config, /^  include: desktop\/installer\.nsh$/m, 'the root NSIS build must load the custom uninstall contract');
assert.doesNotMatch(config, /^    - msi$/m, 'Windows release builds must use one installer contract');
assert.doesNotMatch(config, /^    - portable$/m, 'Windows release builds must not use the failed portable target');
assert.match(config, /^  - assets\/welcome-education-scene-v2\.png$/m, 'the welcome illustration must ship inside desktop builds');
assert.match(config, /^  - assets\/welcome-morning\.png$/m, 'the daily quote reading-scene image must ship inside desktop builds');
assert.match(installer, /DELETEUSERDATA/, 'NSIS must support an explicit, auditable data-deletion switch');
assert.match(installer, /!insertmacro un\.GetParameters/, 'the NSIS uninstaller must initialize its own command-line parser');
assert.match(installer, /!insertmacro un\.GetOptions/, 'the NSIS uninstaller must initialize its own option parser');
assert.match(installer, /IfSilent/, 'silent uninstall must retain user data unless deletion is explicitly requested');
assert.match(installer, /\$\{GetOptions\} \$R0 "\/DELETEUSERDATA=" \$R1/, 'NSIS must parse the explicit deletion switch value');
assert.match(installer, /StrCmp \$R1 "1" cwbRemoveUserData/, 'only an explicit deletion value may remove user data');
for (const runtime of ['v8-migration.js', 'v8-persistence-protocol.js', 'v8-workspace-runtime.js', 'v8-backup-codec.js']) {
  assert.match(config, new RegExp(`^  - src/core/${runtime.replace('.', '\\.')}$`, 'm'), `${runtime} must ship inside desktop builds`);
}
for (const runtime of ['cwb-v46-ui.js', 'cwb-v47-ui.js', 'cwb-v48.js', 'cwb-v48-ui.js']) {
  assert.match(config, new RegExp(`^  - src/core/${runtime.replace('.', '\\.')}$`, 'm'), `${runtime} must ship inside desktop builds`);
}
const localScripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
  .map(match => match[1])
  .filter(src => !/^https?:/i.test(src));
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const src of localScripts) {
  assert.match(config, new RegExp(`^  - ${escapeRegex(src)}$`, 'm'), `${src} is referenced by index.html but missing from the formal desktop package`);
}

console.log('PASS electron-package-config');
