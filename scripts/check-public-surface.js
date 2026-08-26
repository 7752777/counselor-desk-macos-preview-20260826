const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageVersion = require(path.join(root, 'package.json')).version;
const required = ['index.html', 'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md'];
const publicDocs = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md'];
const forbiddenText = [
  'README_EN.md',
  '<your-username>',
  '<original-username>',
  '<maintainer-email>',
  'dweeedon/counselor-desk',
  'ea40c80e38ef48478bb12a2376e142ea.sh2.agentos-app.net'
];
const forbiddenPaths = [
  '开发入口说明.md',
  'docs/prompts',
  'docs/prompt-archive.md',
  'docs/项目反推提示词.md',
  'docs/superpowers',
  'docs/迭代记录',
  'docs/decisions',
  'docs/v4-ux-optimization-plan.md',
  'docs/v4.0-p0-p1实施与验收.md',
  'docs/v4.0-全面验收报告.md',
  'docs/v4.0-架构与验收.md',
  'docs/测试报告-v3.9.md',
  'docs/公开仓库维护指南.md',
  'docs/品牌与素材说明.md'
];
const forbiddenTerms = /(?:提示词|项目反推|AI\s*复现|生成过程|生成模型|生成式素材|工程对话|内部验收|设计令牌|素材路径|superpowers)/i;
const historicalDocPaths = [
  'docs/使用指南.md',
  'docs/辅导员工作台使用手册.md',
  'docs/数据格式与联动约定.md',
  'docs/二次开发指南.md'
];

for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing required file: ${file}`);
}

for (const relative of forbiddenPaths) {
  if (fs.existsSync(path.join(root, relative))) throw new Error(`Internal public-surface material remains: ${relative}`);
}

for (const relative of historicalDocPaths) {
  if (fs.existsSync(path.join(root, relative))) throw new Error(`Historical duplicate documentation remains public: ${relative}`);
}

for (const file of publicDocs) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  for (const text of forbiddenText) {
    if (content.includes(text)) throw new Error(`${file} contains release placeholder: ${text}`);
  }
  if (forbiddenTerms.test(content)) throw new Error(`${file} contains internal-process language`);
}

const currentReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
if (/Windows-安装版\.msi|macOS-安装版\.dmg/i.test(currentReadme)) {
  throw new Error('README contains obsolete v4.0 download or package claims');
}
if (!/v3\.8(?:\.0)?\*{0,2}\s*\|\s*2026-08-04/.test(currentReadme) || !/v3\.9(?:\.0)?\*{0,2}\s*\|\s*2026-08-05/.test(currentReadme) || !/v4\.0\*{0,2}\s*\|\s*2026-08-07/.test(currentReadme) || !/v4\.4(?:\.0)?\*{0,2}\s*\|\s*2026-08-13/.test(currentReadme)) {
  throw new Error('README must retain the factual v3.8 to v4.4 iteration timeline');
}

function walkPublicText(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full);
    if (entry.isDirectory()) {
      walkPublicText(full);
      continue;
    }
    if (!/\.(?:md|txt)$/i.test(entry.name)) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (forbiddenTerms.test(content)) throw new Error(`${relative} contains internal-process language`);
  }
}
walkPublicText(path.join(root, 'docs'));

function walkNonDocumentationText(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full);
    if (relative === '.git' || relative.startsWith(`.git${path.sep}`)) continue;
    if (relative === 'node_modules' || relative.startsWith(`node_modules${path.sep}`)) continue;
    if (relative === 'output' || relative.startsWith(`output${path.sep}`)) continue;
    if (relative === 'tmp' || relative.startsWith(`tmp${path.sep}`)) continue;
    if (relative === 'vendor' || relative.startsWith(`vendor${path.sep}`)) continue;
    if (entry.isDirectory()) {
      walkNonDocumentationText(full);
      continue;
    }
    if (!/\.(?:md|txt)$/i.test(entry.name)) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (forbiddenTerms.test(content)) throw new Error(`${relative} contains internal-process language`);
  }
}
walkNonDocumentationText(root);

const found = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full);
    if (relative === '.git' || relative.startsWith(`.git${path.sep}`)) continue;
    if (relative === 'node_modules' || relative.startsWith(`node_modules${path.sep}`)) continue;
    if (relative === 'output' || relative.startsWith(`output${path.sep}`)) continue;
    if (entry.isDirectory()) walk(full);
    else if (/\.(backup\.json|bak|dump)$/i.test(entry.name)) found.push(relative);
  }
}
walk(root);
if (found.length) throw new Error(`Sensitive backup-like files found: ${found.join(', ')}`);

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const appHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const welcomeIllustration = path.join('assets', 'welcome-education-scene-v2.png');
const welcomeQuoteIllustration = path.join('assets', 'welcome-morning.png');
if (!appHtml.includes("function welcomeSceneSource()") || !appHtml.includes("embedded[file] || `assets/${file}`")) throw new Error('Welcome setup must resolve the approved illustration from the packaged app root');
if (!fs.existsSync(path.join(root, welcomeIllustration))) throw new Error(`Missing welcome illustration: ${welcomeIllustration}`);
if (!appHtml.includes("function welcomeQuoteSceneSource()") || !appHtml.includes("'welcome-morning.png'")) throw new Error('Daily quote must resolve the bundled reading-scene image');
if (!fs.existsSync(path.join(root, welcomeQuoteIllustration))) throw new Error(`Missing daily quote illustration: ${welcomeQuoteIllustration}`);
for (const heading of ['🎯 这是给一线工作留出来的一张工作台', '🚀 从这里开始', '🔐 本地优先，也把边界说清楚', `🖼️ v${packageVersion} 界面一览`]) {
  if (!readme.includes(`## ${heading}`)) throw new Error(`README is missing product section: ${heading}`);
}
if (!new RegExp(`^## ✨ v${packageVersion}(?: 的核心体验| 前瞻版的核心体验)$`, 'm').test(readme)) {
  throw new Error(`README is missing product section: ✨ v${packageVersion} 的核心体验`);
}
if (!appHtml.includes('data-student-page-size')) throw new Error('Student page-size selector is missing');
if (!appHtml.includes('data-act="student-page"')) throw new Error('Student pagination controls are missing');
if (appHtml.includes('data-act="v4-students-more"')) throw new Error('Legacy student load-more control remains');
if (/DeepSeek|大模型|AI 写作/.test(appHtml)) throw new Error('index.html contains unshipped model-integration language');
if (appHtml.includes('閸旂姾娴?') || appHtml.includes('閺囨潙顦?')) throw new Error('index.html contains mojibake pagination text');

const localLinkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const missingLinks = [];
for (const match of readme.matchAll(localLinkPattern)) {
  const target = match[1];
  if (/^(?:[a-z]+:|#|\/\/)/i.test(target)) continue;
  const cleanTarget = decodeURIComponent(target.split('#')[0].split('?')[0]);
  if (!cleanTarget) continue;
  const resolved = path.resolve(root, cleanTarget);
  if ((!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) || !fs.existsSync(resolved)) missingLinks.push(target);
}
if (missingLinks.length) throw new Error(`Missing README local links: ${missingLinks.join(', ')}`);

console.log('Public surface check passed');
