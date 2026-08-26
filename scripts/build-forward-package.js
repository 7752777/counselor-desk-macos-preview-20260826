'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const requestedTarget = process.argv.slice(2).find(argument => argument !== '--');
const target = requestedTarget
  ? path.resolve(requestedTarget)
  : path.join(root, 'output', `学工智伴-v${version}-前瞻版交付包-${date}`);

function ensureFile(relative) {
  const source = path.join(root, relative);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`Missing package source: ${relative}`);
  return source;
}

function copy(relative, destination) {
  const source = ensureFile(relative);
  const output = path.join(target, destination || relative);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.copyFileSync(source, output);
}

function readEmbeddedConfig(relative) {
  const source = ensureFile(relative);
  const content = fs.readFileSync(source, 'utf8');
  const read = name => {
    const match = content.match(new RegExp(`window\\.${name}=([^;]+);`));
    if (!match) throw new Error(`Missing commercial web config: ${name} in ${relative}`);
    try { return JSON.parse(match[1]); } catch (cause) { throw new Error(`Invalid commercial web config: ${name} in ${relative}: ${cause.message}`); }
  };
  const config = {
    mode:read('CWB_LICENSE_MODE'),
    serviceUrl:read('CWB_LICENSE_SERVICE_URL'),
    publicKeys:read('CWB_LICENSE_PUBLIC_KEYS'),
  };
  if (config.mode !== 'commercial' || !/^https:\/\//i.test(String(config.serviceUrl || '')) || !config.publicKeys || typeof config.publicKeys !== 'object' || !Object.keys(config.publicKeys).length) {
    throw new Error(`Forward-look web artifact is not a commercial activation build: ${relative}`);
  }
  return config;
}

function assertCommercialDesktopArtifact(relative) {
  const archive = path.join(root, relative, 'resources', 'app.asar');
  if (!fs.existsSync(archive)) throw new Error(`Missing unpacked desktop archive for commercial validation: ${relative}`);
  const content = fs.readFileSync(archive).toString('utf8');
  if (!/"mode"\s*:\s*"commercial"/.test(content) || !/"service_url"\s*:\s*"https:\/\//.test(content) || !/"public_keys"\s*:\s*\{\s*"[^"}]+"\s*:\s*"[^"}]+"/.test(content)) {
    throw new Error(`Forward-look desktop artifact is not a commercial activation build: ${relative}`);
  }
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function assertSafe(directory) {
  const forbidden = /(?:sk-[A-Za-z0-9]{20,}|BEGIN\s+(?:RSA|OPENSSH|EC|PRIVATE)\s+KEY|CWB-REDEEM-1\.[A-Za-z0-9_-]{24,})/;
  for (const file of walk(directory)) {
    if (!/\.(?:html|md|txt|json|csv|js|yml|yaml)$/i.test(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    if (forbidden.test(content)) throw new Error(`Potential secret found in forward-look package: ${path.relative(directory, file)}`);
  }
}

function writeChecksums(directory) {
  const files = walk(directory)
    .filter(file => path.basename(file) !== '文件校验-SHA256.txt')
    .sort((left, right) => path.relative(directory, left).localeCompare(path.relative(directory, right), 'zh-CN'));
  const lines = files.map(file => {
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    return `${digest}  ${path.relative(directory, file).replace(/\\/g, '/')}`;
  });
  fs.writeFileSync(path.join(directory, '文件校验-SHA256.txt'), `${lines.join('\n')}\n`, 'utf8');
}

const webExperienceConfig = readEmbeddedConfig(`output/学工智伴-v${version}-前瞻版体验版.html`);
const webAuthorizedConfig = readEmbeddedConfig(`output/学工智伴-v${version}-前瞻版授权体验.html`);
assertCommercialDesktopArtifact('output/desktop/win-unpacked');
assertCommercialDesktopArtifact('output/desktop/win-arm64-unpacked');
if (webExperienceConfig.serviceUrl !== webAuthorizedConfig.serviceUrl) throw new Error('Forward-look web artifacts use different license services');
if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error(`Forward-look package target must be empty: ${target}`);
fs.mkdirSync(target, { recursive: true });

copy(`output/学工智伴-v${version}-前瞻版体验版.html`, `网页端/学工智伴-v${version}-前瞻版体验版.html`);
copy(`output/学工智伴-v${version}-前瞻版授权体验.html`, `网页端/学工智伴-v${version}-前瞻版授权体验.html`);
copy(`output/pdf/学工智伴-v${version}-产品手册.pdf`, `产品手册/学工智伴-v${version}-产品手册.pdf`);
copy(`output/pdf/学工智伴-v${version}-功能与使用说明书.pdf`, `产品手册/学工智伴-v${version}-功能与使用说明书.pdf`);
copy(`output/pdf/学工智伴-v${version}-购买与激活速查.pdf`, `产品手册/学工智伴-v${version}-购买与激活速查.pdf`);
copy(`output/desktop/counselor-desk-${version}-x64.exe`, `Windows安装包/学工智伴-v${version}-安装程序-x64.exe`);
copy(`output/desktop/counselor-desk-${version}-arm64.exe`, `Windows安装包/学工智伴-v${version}-安装程序-arm64.exe`);
copy(`output/desktop/counselor-desk-${version}-mac-universal.dmg`, `macOS安装包/学工智伴-v${version}-mac-universal.dmg`);
copy(`output/desktop/counselor-desk-${version}-mac-universal.zip`, `macOS安装包/学工智伴-v${version}-mac-universal.zip`);
copy('docs/internal-pilot-quickstart-v4.9.1.md', '说明/前瞻版体验说明.md');
copy('docs/customer-quickstart-v4.9.1.md', '说明/普通用户激活与更新说明.md');
copy('docs/upgrade/forward-look-package-v4.9.1.md', '说明/前瞻版交付记录.md');

const sampleSource = path.join(root, 'samples', 'import-compat');
for (const entry of fs.readdirSync(sampleSource, { withFileTypes: true })) {
  if (entry.isFile() && /\.(?:csv|xls|xlsx|md)$/i.test(entry.name)) copy(path.join('samples', 'import-compat', entry.name), path.join('脱敏导入样表', entry.name));
}

assertSafe(target);
writeChecksums(target);
console.log(`Forward-look package created: ${target}`);
