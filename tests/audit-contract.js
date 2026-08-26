const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const path = require('node:path');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = path.join(__dirname, '..');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/Could not load script|Not implemented: window\.scrollTo|HTMLCanvasElement/i.test(String(error && error.message || error))) {
      errors.push(String(error && error.message || error));
    }
  });
  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), {
    runScripts:'dangerously', resources:'usable', pretendToBeVisual:true,
    url:`file:///${path.join(root, 'index.html').replace(/\\/g, '/')}`, virtualConsole,
  });
  await wait(1000);
  const { window: w } = dom;
  assert.ok(w.CWB && w.CWB.audit && w.CWB.repositories && w.CWB.repositories.auditLog, 'audit repository should be available');
  const repository = w.CWB.repositories.auditLog;
  const originalPut = repository.put;
  repository.put = async () => { throw new Error('INJECTED_AUDIT_REPOSITORY_FAILURE'); };
  try {
    await assert.rejects(
      () => w.CWB.audit.log('backup_restore', { source:'audit-contract' }),
      error => error && error.code === 'AUDIT_WRITE_FAILED' && error.audit_action === 'backup_restore',
      'required audit actions must expose a diagnostic failure'
    );
    const optional = await w.CWB.audit.log('ordinary_audit', { source:'audit-contract' });
    assert.equal(optional.ok, false, 'optional audit failures should remain observable');
    assert.equal(optional.code, 'AUDIT_WRITE_DEFERRED');
    await assert.rejects(
      () => w.CWB.audit.required('custom_required', {}),
      error => error && error.code === 'AUDIT_WRITE_FAILED',
      'callers must be able to force required audit semantics'
    );
  } finally {
    repository.put = originalPut;
  }
  const saved = await w.CWB.audit.log('ordinary_audit_after_restore', { source:'audit-contract' });
  assert.ok(saved && saved.id, 'audit writes should recover after the repository is restored');
  assert.deepEqual(errors, [], 'audit contract should not add unexpected runtime errors');
  dom.window.close();
  console.log('PASS audit-contract');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
