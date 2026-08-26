const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const stageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-public-surface-'));

function shouldCopy(source) {
  const relative = path.relative(root, source);
  if (!relative) return true;
  const parts = relative.split(path.sep);
  if (parts.includes('node_modules') || parts.includes('.git')) return false;
  if (['output', 'tmp', 'test-results', 'playwright-report'].includes(parts[0])) return false;
  if (parts[0] === 'docs' && parts[1] === 'superpowers') return false;
  if (parts.length === 1 && parts[0] === '开发入口说明.md') return false;
  return true;
}

try {
  fs.cpSync(root, stageRoot, { recursive: true, filter: shouldCopy });
  const check = spawnSync(process.execPath, [path.join(stageRoot, 'scripts', 'check-public-surface.js')], {
    cwd: stageRoot,
    encoding: 'utf8',
  });
  if (check.stdout) process.stdout.write(check.stdout);
  if (check.stderr) process.stderr.write(check.stderr);
  if (check.error) throw check.error;
  process.exitCode = check.status ?? 1;
} finally {
  fs.rmSync(stageRoot, { recursive: true, force: true });
}
