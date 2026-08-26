const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function codedError(code, message, cause) {
  const error = new Error(`${code}: ${message || code}`);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function text(value) { return String(value == null ? '' : value).trim(); }

function commandResult(result) {
  return {
    status:result && result.status != null ? Number(result.status) : 0,
    stdout:text(result && result.stdout),
    stderr:text(result && result.stderr),
  };
}

async function runCommand(command, args, options) {
  try {
    const result = await execFileAsync(command, args, {
      windowsHide:true,
      maxBuffer:256 * 1024,
      ...(options || {}),
    });
    return commandResult({ status:0, stdout:result.stdout, stderr:result.stderr });
  } catch (cause) {
    return commandResult({ status:Number(cause && cause.code) || 1, stdout:cause && cause.stdout, stderr:cause && cause.stderr });
  }
}

function assertValidPath(filePath) {
  const resolved = path.resolve(text(filePath));
  if (!resolved || resolved === path.parse(resolved).root) throw codedError('UPDATE_PACKAGE_PATH_INVALID', '更新包路径无效');
  return resolved;
}

function assertPublisher(output, expectedPublisher) {
  const expected = text(expectedPublisher);
  if (expected && !output.toLowerCase().includes(expected.toLowerCase())) {
    throw codedError('UPDATE_PLATFORM_PUBLISHER_MISMATCH', '更新包签名发布者与商业构建配置不一致');
  }
}

async function verifyWindows(filePath, options) {
  const opts = options || {};
  const script = '$ErrorActionPreference = "Stop"; $signature = Get-AuthenticodeSignature -LiteralPath $args[0]; if ($signature.Status -ne "Valid") { Write-Output $signature.Status; exit 2 }; Write-Output $signature.SignerCertificate.Subject;';
  const result = await (typeof opts.runCommand === 'function'
    ? opts.runCommand('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script, filePath])
    : runCommand('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script, filePath]));
  if (Number(result && result.status) !== 0 || !text(result && result.stdout)) {
    throw codedError('UPDATE_PLATFORM_SIGNATURE_INVALID', `Windows Authenticode 校验失败${result && result.stdout ? `：${text(result.stdout)}` : ''}`);
  }
  assertPublisher(result.stdout, opts.expectedPublisher);
  return { ok:true, platform:'win32', verifier:'authenticode', subject:text(result.stdout) };
}

async function verifyMacApp(appPath, options) {
  const opts = options || {};
  const run = typeof opts.runCommand === 'function' ? opts.runCommand : runCommand;
  const codesign = await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  if (Number(codesign && codesign.status) !== 0) throw codedError('UPDATE_PLATFORM_SIGNATURE_INVALID', 'macOS codesign 校验失败');
  const spctl = await run('spctl', ['--assess', '--type', 'execute', '--verbose=2', appPath]);
  if (Number(spctl && spctl.status) !== 0) throw codedError('UPDATE_PLATFORM_SIGNATURE_INVALID', 'macOS Gatekeeper 校验失败');
  assertPublisher(`${text(codesign && codesign.stdout)} ${text(codesign && codesign.stderr)} ${text(spctl && spctl.stdout)} ${text(spctl && spctl.stderr)}`, opts.expectedPublisher);
  return { ok:true, platform:'darwin', verifier:'codesign-spctl', path:appPath };
}

async function verifyMacPackage(filePath, options) {
  const opts = options || {};
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.app') return verifyMacApp(filePath, opts);
  const run = typeof opts.runCommand === 'function' ? opts.runCommand : runCommand;
  if (ext === '.pkg') {
    const result = await run('pkgutil', ['--check-signature', filePath]);
    if (Number(result && result.status) !== 0 || !/signed|Developer ID/i.test(`${text(result && result.stdout)} ${text(result && result.stderr)}`)) {
      throw codedError('UPDATE_PLATFORM_SIGNATURE_INVALID', 'macOS pkg 签名校验失败');
    }
    assertPublisher(`${text(result && result.stdout)} ${text(result && result.stderr)}`, opts.expectedPublisher);
    return { ok:true, platform:'darwin', verifier:'pkgutil', path:filePath };
  }
  if (ext === '.dmg') {
    const result = await run('spctl', ['--assess', '--type', 'open', '--verbose=2', filePath]);
    if (Number(result && result.status) !== 0) throw codedError('UPDATE_PLATFORM_SIGNATURE_INVALID', 'macOS DMG Gatekeeper 校验失败');
    assertPublisher(`${text(result && result.stdout)} ${text(result && result.stderr)}`, opts.expectedPublisher);
    return { ok:true, platform:'darwin', verifier:'spctl-open', path:filePath };
  }
  if (ext !== '.zip') throw codedError('UPDATE_PLATFORM_SIGNATURE_UNSUPPORTED', '当前 macOS 更新包格式无法进行平台签名校验');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-update-verify-'));
  try {
    const result = await run('ditto', ['-x', '-k', filePath, tempRoot]);
    if (Number(result && result.status) !== 0) throw codedError('UPDATE_PLATFORM_SIGNATURE_INVALID', 'macOS ZIP 解包失败');
    const entries = await fs.readdir(tempRoot, { withFileTypes:true });
    const appEntry = entries.find(entry => entry.isDirectory() && entry.name.toLowerCase().endsWith('.app'));
    if (!appEntry) throw codedError('UPDATE_PLATFORM_SIGNATURE_INVALID', 'macOS ZIP 中没有应用程序包');
    return verifyMacApp(path.join(tempRoot, appEntry.name), opts);
  } finally {
    await fs.rm(tempRoot, { recursive:true, force:true }).catch(() => {});
  }
}

async function verifyPlatformSignature(filePath, options) {
  const opts = options || {};
  const resolved = assertValidPath(filePath);
  const platform = text(opts.platform || process.platform);
  if (platform === 'win32') return verifyWindows(resolved, opts);
  if (platform === 'darwin') return verifyMacPackage(resolved, opts);
  throw codedError('UPDATE_PLATFORM_SIGNATURE_UNSUPPORTED', `当前平台不支持商业更新签名校验：${platform || 'unknown'}`);
}

module.exports = { codedError, runCommand, verifyWindows, verifyMacApp, verifyMacPackage, verifyPlatformSignature };
