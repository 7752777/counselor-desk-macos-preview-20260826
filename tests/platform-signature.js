const assert = require('node:assert/strict');
const { verifyPlatformSignature, codedError } = require('../desktop/platform-signature.cjs');

(async () => {
  let calls = [];
  const windows = await verifyPlatformSignature('C:/updates/counselor-desk-4.9.1.exe', {
    platform:'win32',
    runCommand:async (command, args) => { calls.push([command, args]); return { status:0, stdout:'CN=Counselor Desk Release' }; },
    expectedPublisher:'Counselor Desk Release',
  });
  assert.equal(windows.verifier, 'authenticode');
  assert.equal(calls[0][0], 'powershell.exe');
  assert.match(String(calls[0][1].at(-1)), /counselor-desk-4\.9\.1\.exe$/i);

  await assert.rejects(
    () => verifyPlatformSignature('C:/updates/counselor-desk-4.9.1.exe', { platform:'win32', runCommand:async () => ({ status:2, stdout:'HashMismatch' }) }),
    error => error.code === 'UPDATE_PLATFORM_SIGNATURE_INVALID',
  );
  await assert.rejects(
    () => verifyPlatformSignature('C:/updates/counselor-desk-4.9.1.exe', { platform:'win32', runCommand:async () => ({ status:0, stdout:'CN=Unexpected Publisher' }), expectedPublisher:'Counselor Desk Release' }),
    error => error.code === 'UPDATE_PLATFORM_PUBLISHER_MISMATCH',
  );

  calls = [];
  const macApp = await verifyPlatformSignature('/tmp/Counselor Desk.app', {
    platform:'darwin',
    runCommand:async (command, args) => { calls.push([command, args]); return { status:0, stdout:'valid Developer ID Counselor Desk' }; },
  });
  assert.equal(macApp.verifier, 'codesign-spctl');
  assert.deepEqual(calls.map(item => item[0]), ['codesign', 'spctl']);

  calls = [];
  const macDmg = await verifyPlatformSignature('/tmp/counselor-desk-4.9.1.dmg', {
    platform:'darwin',
    runCommand:async (command, args) => { calls.push([command, args]); return { status:0, stdout:'source=Developer ID Application: Counselor Desk' }; },
  });
  assert.equal(macDmg.verifier, 'spctl-open');
  assert.equal(calls[0][0], 'spctl');

  await assert.rejects(
    () => verifyPlatformSignature('/tmp/counselor-desk-4.9.1.tar.gz', { platform:'darwin', runCommand:async () => ({ status:0, stdout:'' }) }),
    error => error.code === 'UPDATE_PLATFORM_SIGNATURE_UNSUPPORTED',
  );
  await assert.rejects(
    () => verifyPlatformSignature('/tmp/counselor-desk-4.9.1.exe', { platform:'linux', runCommand:async () => ({ status:0, stdout:'' }) }),
    error => error.code === 'UPDATE_PLATFORM_SIGNATURE_UNSUPPORTED',
  );
  assert.equal(codedError('TEST_CODE').code, 'TEST_CODE');
  console.log('PASS platform-signature');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
