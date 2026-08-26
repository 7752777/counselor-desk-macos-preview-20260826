const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'win32') {
  console.log('SKIP desktop-windows-architecture: Windows package check only runs on Windows');
  process.exit(0);
}

const root = path.join(__dirname, '..');
const artifactDir = process.env.CWB_DESKTOP_ARTIFACT_DIR || path.join(root, 'output', 'desktop');

function peMachine(file) {
  const binary = fs.readFileSync(file);
  assert.equal(binary.subarray(0, 2).toString('ascii'), 'MZ', `${file} must be a PE file`);
  const peOffset = binary.readUInt32LE(0x3c);
  assert.equal(binary.subarray(peOffset, peOffset + 4).toString('ascii'), 'PE\0\0', `${file} must contain a PE signature`);
  return binary.readUInt16LE(peOffset + 4);
}

const targets = [
  { dir:'win-unpacked', machine:0x8664, label:'x64' },
  { dir:'win-arm64-unpacked', machine:0xaa64, label:'ARM64' }
];
for (const target of targets) {
  const executable = path.join(artifactDir, target.dir, 'counselor-desk.exe');
  if (!fs.existsSync(executable)) {
    if (process.env.CWB_REQUIRE_ARTIFACTS === '1') throw new Error(`${target.label} unpacked executable is missing: ${executable}`);
    console.log(`SKIP desktop-windows-architecture: ${target.label} package is not present`);
    process.exit(0);
  }
  assert.equal(peMachine(executable), target.machine, `${target.label} executable must have the correct PE architecture`);
}

console.log('PASS desktop-windows-architecture');
