const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'desktop-release.yml'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
assert.match(workflow, /CSC_LINK|WIN_CSC_LINK/);
assert.match(workflow, /CSC_KEY_PASSWORD|WIN_CSC_KEY_PASSWORD/);
assert.match(workflow, /notarize|notarytool|APPLE_ID/i);
assert.match(workflow, /check-release-signing/);
assert.match(builder, /oneClick: false/);
assert.match(builder, /allowToChangeInstallationDirectory: true/);
console.log('PASS release-signing-contract');
