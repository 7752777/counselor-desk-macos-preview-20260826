'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const license = require('../src/core/cwb-license.js');

const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

assert.match(source, /APP_VERSION\s*=\s*'4\.9\.1'/);
assert.match(source, /v4\.9\.1 · 前瞻版/);
assert.match(source, /data-view="ai-chat"/);
assert.match(source, /默认不读取学生数据/);
assert.match(source, /providerControl/);
assert.match(source, /credentialMode === 'managed_relay'/);
assert.match(source, /updates\/latest\?channel=preview/);
assert.match(source, /data-act="v4-snapshot-restore"/);
assert.match(source, /v4-snapshot-\(\?:create\|clear\|restore\)/);
assert.match(source, /CWBRequireRealData\(\)/);
assert.match(source, /CWBRequireFileUpload\(\)/);
assert.match(source, /data-act="v4-phone-import"/);
assert.match(source, /data-act="v4-backup-restore"/);

const storage = {
  value: null,
  get() { return this.value; },
  set(next) { this.value = next; },
  remove() { this.value = null; },
};
const manager = license.createManager({
  mode: 'commercial',
  currentVersion: '4.9.1',
  storage,
  publicKeys: {},
});

manager.ready.then(() => {
  assert.equal(manager.getState().status, 'unlicensed');
  assert.equal(manager.hasFeature('real_data'), false);
  assert.equal(manager.hasFeature('file_upload'), false);
  assert.equal(manager.hasFeature('ai'), false);
  assert.equal(manager.hasFeature('managed_relay'), false);
  console.log('PASS v491-commercial-ui');
}).catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
