const assert = require('node:assert/strict');
const { createElectronUpdateRuntime } = require('../desktop/update-runtime.cjs');

(async () => {
  let persisted = [];
  let rolledBack = 0;
  const failingUpdater = {
    autoDownload:false,
    autoInstallOnAppQuit:false,
    on() {},
    checkForUpdates:async () => ({ updateInfo:{ version:'4.9.1' } }),
    downloadUpdate:async () => ({}),
    quitAndInstall:() => { const error = new Error('installer failed'); error.code = 'INSTALLER_FAILED'; throw error; },
  };
  const runtime = createElectronUpdateRuntime({
    currentVersion:'4.9.0',
    autoUpdater:failingUpdater,
    createRecoveryPoint:async () => ({ ok:true, path:'C:/recovery/before-update' }),
    persistInstallState:async value => { persisted.push(value); return { saved:true }; },
    rollbackRecoveryPoint:async recovery => { rolledBack += 1; assert.equal(recovery.path, 'C:/recovery/before-update'); return { ok:true, preserved_failed_path:'C:/recovery/failed-current' }; },
  });
  await runtime.check();
  await runtime.download();
  await assert.rejects(() => runtime.install(), error => error.code === 'INSTALLER_FAILED' && error.rollback_error === undefined);
  assert.equal(rolledBack, 1);
  assert.equal(runtime.status().status, 'rolled-back');
  assert.equal(runtime.status().rollback_required, false);
  assert.equal(persisted[0].phase, 'installing');
  assert.equal(persisted.at(-1).phase, 'rolled-back');

  let launchRollback = 0;
  let launchPersisted;
  const resumed = createElectronUpdateRuntime({
    currentVersion:'4.9.0',
    loadInstallState:async () => ({ phase:'installing', target_version:'4.9.1', recovery_point:{ ok:true, path:'C:/recovery/before-update' } }),
    persistInstallState:async value => { launchPersisted = value; },
    rollbackRecoveryPoint:async () => { launchRollback += 1; return { ok:true, preserved_failed_path:'C:/recovery/failed-current' }; },
  });
  const resumedState = await resumed.resumeAfterLaunch();
  assert.equal(resumedState.persisted_phase, 'rolled-back');
  assert.equal(launchRollback, 1);
  assert.equal(launchPersisted.phase, 'rolled-back');

  let clearedValidation = 0;
  const completed = createElectronUpdateRuntime({
    currentVersion:'4.9.1',
    loadInstallState:async () => ({ phase:'installing', target_version:'4.9.1', recovery_point:{ ok:true, path:'C:/recovery/before-update' } }),
    persistInstallState:async value => { if (value.phase === 'completed') clearedValidation += 1; },
    validateAfterUpdate:async () => ({ ok:true }),
  });
  const completedState = await completed.resumeAfterLaunch();
  assert.equal(completedState.persisted_phase, 'completed');
  assert.equal(clearedValidation, 1);

  console.log('PASS update-rollback');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
