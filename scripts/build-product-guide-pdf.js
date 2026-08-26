'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const source = path.join(root, 'docs', 'product-guide-v4.9.1.tex');
const outputDir = path.join(root, 'output', 'pdf');
const outputPdf = path.join(outputDir, 'product-guide-v4.9.1.pdf');
const customerPdf = path.join(outputDir, '学工智伴-v4.9.1-功能与使用说明书.pdf');
const primaryManualPdf = path.join(outputDir, '学工智伴-v4.9.1-产品手册.pdf');

function candidates() {
  const configured = process.env.TECTONIC_BIN;
  const local = process.platform === 'win32'
    ? path.join(root, 'tmp', 'tools', 'tectonic-0.17.0', 'tectonic.exe')
    : path.join(root, 'tmp', 'tools', 'tectonic-0.17.0', 'tectonic');
  return [configured, local, 'tectonic'].filter(Boolean);
}

function run(binary) {
  for (const extension of ['aux', 'log', 'out', 'toc', 'fls', 'synctex.gz']) {
    const intermediate = path.join(outputDir, `product-guide-v4.9.1.${extension}`);
    if (fs.existsSync(intermediate)) fs.rmSync(intermediate, { force: true });
  }
  return spawnSync(binary, [
    '--keep-logs',
    '--keep-intermediates',
    '--synctex',
    '--reruns', '2',
    '--outdir', outputDir,
    source,
  ], { cwd: root, encoding: 'utf8', stdio: 'inherit' });
}

if (!fs.existsSync(source)) {
  console.error(`Missing LaTeX source: ${source}`);
  process.exit(1);
}
fs.mkdirSync(outputDir, { recursive: true });

let result;
let selected;
for (const binary of candidates()) {
  result = run(binary);
  if (!result.error) {
    selected = binary;
    break;
  }
}

if (!selected || !result || result.status !== 0) {
  console.error('Unable to build the product guide with Tectonic. Install Tectonic or set TECTONIC_BIN.');
  process.exit(result && Number.isInteger(result.status) ? result.status || 1 : 1);
}

if (!fs.existsSync(outputPdf)) {
  console.error(`Tectonic finished without producing ${outputPdf}`);
  process.exit(1);
}
fs.copyFileSync(outputPdf, customerPdf);
fs.copyFileSync(outputPdf, primaryManualPdf);
console.log(`PASS build product guide with ${selected}`);
console.log(`PDF: ${primaryManualPdf}`);
console.log(`Alias: ${customerPdf}`);
