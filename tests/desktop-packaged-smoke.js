const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const packagedRoot = process.env.CWB_DESKTOP_ARTIFACT_DIR || path.join(root, 'output', 'desktop');
function findExecutable(dir) {
  if (!fs.existsSync(dir)) return null;
  const entries = fs.readdirSync(dir, { withFileTypes:true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExecutable(full);
      if (nested) return nested;
      continue;
    }
    if (process.platform === 'win32' && entry.name === 'counselor-desk.exe') return full;
    if (process.platform === 'darwin' && /\.app[\\/]Contents[\\/]MacOS/.test(full) && fs.statSync(full).mode & 0o111) return full;
  }
  return null;
}
const preferredWindowsExecutable = path.join(packagedRoot, 'win-unpacked', 'counselor-desk.exe');
const executable = process.env.CWB_DESKTOP_EXECUTABLE || (process.platform === 'win32' && fs.existsSync(preferredWindowsExecutable) ? preferredWindowsExecutable : findExecutable(packagedRoot));
if (!executable) {
  if (process.env.CWB_REQUIRE_ARTIFACTS === '1') throw new Error(`desktop-packaged-smoke: no packaged executable in ${packagedRoot}`);
  console.log('SKIP desktop-packaged-smoke: packaged executable is not present');
  process.exit(0);
}
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-packaged-smoke-'));
try {
  for (let run = 0; run < 2; run += 1) {
    const result = spawnSync(executable, ['--no-sandbox'], {
      cwd:root,
      env:Object.assign({}, process.env, { CWB_DESKTOP_SMOKE:'1', CWB_DESKTOP_USER_DATA:userData, CWB_DESKTOP_SMOKE_EXPECT_PERSISTENCE:run === 1 ? '1' : '0' }),
      encoding:'utf8', timeout:120000,
    });
    assert.equal(result.status, 0, `${result.error ? `${result.error.name}: ${result.error.message}\n` : ''}${result.stdout}\n${result.stderr}`);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.match(output, /"ok":true/);
    assert.match(output, /"schemaVersion":8/);
    assert.match(output, /"attachment":true/);
    assert.match(output, /"persistence":true/);
    assert.match(output, /"backup":true/);
    assert.match(output, /"sqlite":true/);
    assert.match(output, /"migration":true/);
  }
  console.log('PASS desktop-packaged-smoke');
} finally {
  fs.rmSync(userData, { recursive:true, force:true });
}
