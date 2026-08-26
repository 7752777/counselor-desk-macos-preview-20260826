const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const electronDirectory = path.join(root, 'node_modules', 'electron', 'dist');
const electronNames = process.platform === 'win32' ? ['electron.exe'] : ['Electron', 'electron'];
const electron = electronNames.map(name => path.join(electronDirectory, name)).find(fs.existsSync);
if (!electron) {
  throw new Error('desktop-electron-smoke: required Electron binary is not installed');
}
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-electron-smoke-'));
try {
  for (let run = 0; run < 2; run += 1) {
    const result = spawnSync(electron, ['--no-sandbox', 'desktop'], {
      cwd:root,
      env:Object.assign({}, process.env, { CWB_DESKTOP_SMOKE:'1', CWB_DESKTOP_USER_DATA:userData, CWB_DESKTOP_SMOKE_EXPECT_PERSISTENCE:run === 1 ? '1' : '0' }),
      encoding:'utf8', timeout:120000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /"ok":true/);
    assert.match(output, /"schemaVersion":8/);
    assert.match(output, /"attachment":true/);
    assert.match(output, /"migration":true/);
    assert.match(output, /"backup":true/);
    assert.match(output, /"sqlite":true/);
    assert.match(output, /"persistence":true/);
    if (result.stdout.trim()) console.log(result.stdout.trim());
  }
  console.log('PASS desktop-electron-smoke');
} finally {
  fs.rmSync(userData, { recursive:true, force:true });
}
