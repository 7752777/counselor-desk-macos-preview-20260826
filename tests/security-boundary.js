/** The focused-record lock must be presented as anti-peek UI protection, not encryption. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(html, /防误看锁，不是加密/, 'focused records must disclose that the lock is not encryption');
assert.match(html, /清除口令不会解密或恢复数据/, 'clearing the anti-peek lock must not be described as password recovery');
assert.match(html, /清除防误看锁（不恢复口令）/, 'the recovery action must name its irreversible security meaning');
assert.match(html, /'focus-forget': \(\) => security\.require\(/, 'clearing a focused-record lock must honor the global access lock when enabled');
assert.match(html, /加密备份：\$\{esc\(backup\.label\)\}/, 'backup page must keep the encrypted-backup status visible');
assert.match(html, /const backupDetail = .*backup\.encrypted \?/, 'home workflow must expose encrypted-backup state');
assert.match(html, /请先生成加密备份/, 'home workflow must expose the missing encrypted-backup action');
assert.match(html, /delete persistedV4\.syncToken/, 'LAN sync tokens must be removed before ui_state persistence');
assert.match(html, /delete persistedV4\.syncClient/, 'LAN sync client objects must not enter ui_state persistence');
assert.match(html, /delete persistedV4\.syncDraft\.token/, 'pairing tokens must not enter durable UI drafts');

console.log('PASS security-boundary');
