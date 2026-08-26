'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const version = String(packageJson.version || '').trim();
const release = `v${version}`;
const escapedRelease = release.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const releaseState = String(process.env.CWB_RELEASE_STATE || 'candidate').trim().toLowerCase() === 'released' ? 'released' : 'candidate';

assert.match(version, /^\d+\.\d+\.\d+$/, 'package version must be a release semantic version');

const required = releaseState === 'released' ? [
  ['README.md', new RegExp(`当前正式发布为 ${escapedRelease}`)],
  ['使用说明.md', new RegExp(`当前正式版本为 ${escapedRelease}`)],
  ['开发入口说明.md', new RegExp(`当前正式发布：${escapedRelease}`)],
  ['docs/README.md', new RegExp(`当前维护发布线为 ${escapedRelease}`)],
  ['docs/v4-acceptance-report.md', new RegExp(`## ${escapedRelease} 当前正式事实`)],
  ['docs/v4-migration-and-backup.md', new RegExp(`当前维护版本为 ${escapedRelease}`)],
  ['docs/v4-desktop-installation.md', new RegExp(`## ${escapedRelease} 正式安装与数据目录`)],
  ['docs/data-contract.md', new RegExp(`## ${escapedRelease} 数据契约设计与发布状态`)],
  ['docs/release-guide.md', new RegExp(`## 当前发布线[\\s\\S]*\`${escapedRelease}\` 是当前维护发布线`)],
  ['docs/user-guide.md', new RegExp(`## ${escapedRelease} 局域网与可靠性能力`)],
  ['docs/v4-privacy.md', new RegExp(`## ${escapedRelease} 同步和敏感数据边界`)],
  ['docs/architecture.md', new RegExp(`## ${escapedRelease} 局域网和可靠性架构（已发布）`)],
  [`docs/upgrade/release-${release}.md`, new RegExp(escapedRelease)],
] : [
  ['README.md', new RegExp(`当前工作区候选为 ${escapedRelease}`)],
  ['使用说明.md', new RegExp(`当前工作区候选版本为 ${escapedRelease}`)],
  ['开发入口说明.md', new RegExp(`当前工作区候选：${escapedRelease}`)],
  ['docs/README.md', new RegExp(`当前工作区候选线为 ${escapedRelease}`)],
  ['docs/v4-acceptance-report.md', new RegExp(`## ${escapedRelease} 候选验收事实`)],
  ['docs/v4-migration-and-backup.md', new RegExp(`当前工作区候选版本为 ${escapedRelease}`)],
  ['docs/v4-desktop-installation.md', new RegExp(`## ${escapedRelease} 候选安装与数据目录`)],
  ['docs/data-contract.md', new RegExp(`## ${escapedRelease} 候选数据契约设计与发布边界`)],
  ['docs/release-guide.md', new RegExp(`## 当前发布线[\\s\\S]*\`${escapedRelease}\` 是当前工作区商业候选`)],
  ['docs/user-guide.md', new RegExp(`## ${escapedRelease} 局域网与可靠性能力`)],
  ['docs/v4-privacy.md', new RegExp(`## ${escapedRelease} 同步和敏感数据边界`)],
  ['docs/architecture.md', new RegExp(`## ${escapedRelease} 局域网和可靠性架构（候选）`)],
  [`docs/upgrade/release-${release}.md`, new RegExp(escapedRelease)],
];
required.forEach(([file, pattern]) => assert.match(read(file), pattern, `${file} is missing the current release marker`));

const forbidden = [
  ['使用说明.md', /当前正式版本为 v4\.4\.6|v4\.4\.6 Release/],
  ['开发入口说明.md', /当前正式发布：v4\.4\.6/],
  ['docs/v4-acceptance-report.md', /当前维护版本为 v4\.7\.1|v4\.8\.0 当前候选，不是正式验收/],
  ['docs/v4-desktop-installation.md', /v4\.8\.0 候选安装与数据目录（未发布）/],
  ['docs/data-contract.md', /候选新增集合为：/],
  ['docs/release-guide.md', /`v4\.7\.1` 是当前维护发布线|v4\.8\.0 尚未进入发布流程/],
  ['docs/user-guide.md', /下一版本候选：v4\.8\.0（当前工作区，未发布）/],
  ['docs/v4-privacy.md', /v4\.8\.0 候选同步和敏感数据边界（未发布）|当前公开 v4\.7\.1 不具备这些候选能力/],
  ['docs/architecture.md', /当前开发批次的交付与验证事实见\[v4\.7\.0 发布收尾记录\]|v4\.8 候选业务运行时/],
];
forbidden.forEach(([file, pattern]) => assert.doesNotMatch(read(file), pattern, `${file} still exposes a stale current-state claim`));

const changelog = read('CHANGELOG.md');
assert.match(changelog, /^## \[Unreleased\]/m, 'CHANGELOG must keep an unreleased maintenance slot');
if (releaseState === 'released') {
  assert.match(changelog, new RegExp(`^## \\[${escapedRelease.slice(1)}\\]`, 'm'), `CHANGELOG must contain the released ${release} entry`);
  assert.match(changelog, new RegExp(`当前 ${escapedRelease} 发布状态`), `CHANGELOG must explain that ${release} is released`);
} else {
  assert.match(changelog, new RegExp(`当前 ${escapedRelease} 工作区候选状态`), `CHANGELOG must explain that ${release} is not released yet`);
}

console.log('PASS check-doc-current-state');
