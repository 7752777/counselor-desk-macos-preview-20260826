const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const textExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.ts', '.txt', '.yml', '.yaml'
]);
const patterns = [
  { name:'OpenAI-compatible key', pattern:/\bsk-[A-Za-z0-9]{40,}\b/g },
  { name:'GitHub classic token', pattern:/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name:'GitHub fine-grained token', pattern:/\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
  { name:'Google API key', pattern:/\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name:'AWS access key', pattern:/\bAKIA[0-9A-Z]{16}\b/g },
  { name:'private key', pattern:/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name:'long bearer token', pattern:/\bBearer\s+[A-Za-z0-9._~-]{32,}\b/g },
];

const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd:root, encoding:'buffer'
});
if (listed.status !== 0) {
  console.error('secret-scan: unable to enumerate repository files');
  process.exit(1);
}

const files = listed.stdout.toString('utf8').split('\0').filter(Boolean);
const findings = [];
for (const relative of files) {
  const extension = path.extname(relative).toLowerCase();
  if (!textExtensions.has(extension)) continue;
  const absolute = path.join(root, relative);
  let content;
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > 4 * 1024 * 1024) continue;
    content = fs.readFileSync(absolute, 'utf8');
  } catch (_) {
    continue;
  }
  for (const entry of patterns) {
    entry.pattern.lastIndex = 0;
    let match;
    while ((match = entry.pattern.exec(content))) {
      const line = content.slice(0, match.index).split('\n').length;
      findings.push(`${relative}:${line} ${entry.name}`);
    }
  }
}

if (findings.length) {
  console.error('Potential credentials found in repository files:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log(`PASS secret-scan (${files.length} repository files inspected)`);
