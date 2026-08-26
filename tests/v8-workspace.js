const assert = require('node:assert/strict');

const {
  SCHEMA_VERSION,
  createWorkspace,
  verifyBackup,
} = require('../src/core/v8-workspace-runtime.js');

async function run() {
  assert.equal(SCHEMA_VERSION, 8, 'the workspace runtime publishes schema v8');

  const sourceBuffer = new ArrayBuffer(2);
  const sourceView = new Uint8Array(sourceBuffer);
  sourceView.set([7, 8]);
  const binaryCloneWorkspace = createWorkspace({
    initialState: { settings: {}, payload: { buffer: sourceBuffer, view: sourceView } },
  });
  const exposedBinaryState = binaryCloneWorkspace.getState();
  new Uint8Array(exposedBinaryState.payload.buffer)[0] = 99;
  exposedBinaryState.payload.view[1] = 99;
  const protectedBinaryState = binaryCloneWorkspace.getState();
  assert.equal(new Uint8Array(protectedBinaryState.payload.buffer)[0], 7, 'ArrayBuffer values are cloned defensively');
  assert.equal(protectedBinaryState.payload.view[1], 8, 'typed-array views are cloned defensively');
  const mapSetWorkspace = createWorkspace({
    initialState: { settings: {}, map: new Map([['one', { value: 1 }]]), set: new Set(['one']) },
  });
  const exposedMapSetState = mapSetWorkspace.getState();
  exposedMapSetState.map.get('one').value = 2;
  exposedMapSetState.set.add('two');
  const protectedMapSetState = mapSetWorkspace.getState();
  assert.equal(protectedMapSetState.map.get('one').value, 1, 'Map entries are cloned defensively');
  assert.equal(protectedMapSetState.set.has('two'), false, 'Set values are cloned defensively');

  const rejectedValidationWorkspace = createWorkspace({
    initialState: { students: [], settings: {} },
    validate: () => 'validation rejected',
  });
  await assert.rejects(
    rejectedValidationWorkspace.mutate({ collection: 'students', operation: 'upsert', record: { id: 'blocked-1', full_name: '不应保存' } }),
    /validation rejected/,
  );
  assert.equal(rejectedValidationWorkspace.getState().students.length, 0, 'failed validation leaves live state untouched');
  assert.equal(rejectedValidationWorkspace.historyFor('students', 'blocked-1').length, 0, 'failed validation cannot leak a history entry');

  const prototypeGuardWorkspace = createWorkspace({ initialState: { students: [], settings: {} } });
  for (const dangerousCollection of ['__proto__', 'prototype', 'constructor']) {
    await assert.rejects(
      prototypeGuardWorkspace.mutate({ collection: dangerousCollection, operation: 'upsert', record: { id: 'unsafe', value: true } }),
      /非法集合名/,
      `${dangerousCollection} is rejected before a state operation`,
    );
  }
  await assert.rejects(
    prototypeGuardWorkspace.mutate({
      collection: 'students', operation: 'upsert',
      record: JSON.parse('{"id":"prototype-record","__proto__":{"polluted":true}}'),
    }),
    /危险数据键/,
    'dangerous record keys are rejected before clone can mutate a prototype',
  );
  assert.equal({}.polluted, undefined, 'workspace input cannot mutate Object.prototype');
  assert.deepEqual(prototypeGuardWorkspace.getState(), { students: [], settings: {} }, 'rejected dangerous input leaves state intact');

  const hookWrites = [];
  let failAppliedHook = true;
  const hookFailureWorkspace = createWorkspace({
    initialState: { students: [], settings: {} },
    persist: async envelope => { hookWrites.push(envelope); return { ok: true }; },
    onApplied: () => {
      if (!failAppliedHook) return;
      failAppliedHook = false;
      throw new Error('view adapter failed');
    },
  });
  await assert.rejects(
    hookFailureWorkspace.mutate({ collection: 'students', operation: 'upsert', record: { id: 'hook-1', full_name: '待重试' } }),
    /view adapter failed/,
  );
  assert.equal(hookFailureWorkspace.getState().students[0].id, 'hook-1', 'a failed view hook does not discard the accepted workspace mutation');
  assert.equal(hookFailureWorkspace.status().state, 'pending_recovery', 'a failed view hook leaves a durable recovery obligation');
  assert.equal(hookFailureWorkspace.status().pending, 1);
  assert.equal(hookWrites.length, 0, 'the failed view hook prevents a false successful persistence result');
  assert.deepEqual(await hookFailureWorkspace.retryPending(), { retried: 1, remaining: 0 });
  assert.equal(hookWrites.length, 1, 'retry persists the latest applied state after a view hook failure');
  assert.equal(hookWrites[0].data.students[0].id, 'hook-1');

  let failDefaultHook = true;
  const defaultHookWorkspace = createWorkspace({
    initialState: { students: [], settings: {} },
    onApplied: () => {
      if (!failDefaultHook) return;
      failDefaultHook = false;
      throw new Error('default view adapter failed');
    },
  });
  await assert.rejects(
    defaultHookWorkspace.mutate({ collection: 'students', operation: 'upsert', record: { id: 'default-hook-1' } }),
    /default view adapter failed/,
  );
  assert.deepEqual(await defaultHookWorkspace.retryPending(), { retried: 1, remaining: 0 });
  assert.equal(defaultHookWorkspace.status().state, 'saved', 'the default in-memory adapter clears a recovered pending write');
  assert.equal(defaultHookWorkspace.status().pending, 0, 'the default in-memory adapter clears the pending recovery count');
  assert.equal(defaultHookWorkspace.exportEmergencyBackup().pendingCommands.length, 0, 'the default in-memory adapter clears the recovered emergency envelope');

  const persisted = [];
  const workspace = createWorkspace({
    initialState: {
      students: [],
      settings: { theme: 'light', greeting_enabled: true },
      attachments: [],
    },
    now: (() => {
      let tick = 0;
      return () => `2026-08-12T00:00:${String(++tick).padStart(2, '0')}.000Z`;
    })(),
    persist: async envelope => {
      persisted.push(envelope);
      return { ok: true };
    },
  });

  await Promise.all([
    workspace.mutate({
      type: 'student.create',
      collection: 'students',
      operation: 'upsert',
      record: { id: 'student-1', student_number: '20260001', full_name: '甲同学' },
      actor: 'test',
    }),
    workspace.mutate({
      type: 'student.rename-number',
      collection: 'students',
      operation: 'patch',
      id: 'student-1',
      patch: { student_number: '20269999', class_name: '一班' },
      actor: 'test',
    }),
    workspace.mutate({
      type: 'settings.change-theme',
      collection: 'settings',
      operation: 'patch',
      patch: { theme: 'forest' },
      actor: 'test',
    }),
  ]);
  await workspace.checkpoint({ type: 'migration.before-v8', actor: 'migration' });
  await workspace.flush();

  const state = workspace.getState();
  assert.deepEqual(state.settings, { theme: 'forest', greeting_enabled: true }, 'settings remain a singleton object');
  assert.equal(state.students[0].rev, 2);
  assert.deepEqual(state.students[0].student_number_history, ['20260001']);
  assert.equal(workspace.historyFor('students', 'student-1').length, 2);
  assert.equal(workspace.historyFor('settings', 'settings').length, 1, 'singleton settings are versioned');
  assert.equal(workspace.status().state, 'saved');
  assert.equal(workspace.status().pending, 0);
  assert.ok(persisted.length >= 5, 'mutations, checkpoint, and flush share the persistence queue');

  await workspace.mutate({
    type: 'student.delete',
    collection: 'students',
    operation: 'delete',
    id: 'student-1',
    actor: 'test',
  });
  await workspace.restoreVersion('students', 'student-1', 1, 'restorer');
  assert.equal(workspace.getState().students[0].student_number, '20260001', 'a selected historical version can be restored');
  assert.equal(workspace.getState().students[0].rev, 4, 'restore creates a new version rather than rewriting history');

  await workspace.checkpoint({ type: 'one' });
  await workspace.checkpoint({ type: 'two' });
  await workspace.checkpoint({ type: 'three' });
  await workspace.checkpoint({ type: 'four' });
  const recoveryPoints = workspace.listRecoveryPoints();
  assert.equal(recoveryPoints.length, 3, 'only the latest three automatic recovery points are retained');
  assert.deepEqual(recoveryPoints.map(point => point.meta.type), ['two', 'three', 'four']);
  const persistedRecoveryEnvelope = persisted.at(-1);
  assert.deepEqual(
    persistedRecoveryEnvelope.recoveryPoints.map(point => point.meta.type),
    ['two', 'three', 'four'],
    'the persisted workspace envelope carries retained recovery points',
  );
  const restartedWorkspace = createWorkspace({ envelope: persistedRecoveryEnvelope });
  assert.deepEqual(
    restartedWorkspace.listRecoveryPoints().map(point => point.meta.type),
    ['two', 'three', 'four'],
    'a restarted runtime hydrates recovery points from its persisted envelope',
  );
  assert.equal(workspace.exportEmergencyBackup().recoveryPoints.length, 3, 'emergency backup carries retained recovery points');

  const blob = typeof Blob === 'function' ? new Blob(['attachment body'], { type: 'text/plain' }) : { size: 15, type: 'text/plain', arrayBuffer() {} };
  await workspace.mutate({
    type: 'attachment.add',
    collection: 'attachments',
    operation: 'upsert',
    record: { id: 'attachment-1', name: 'proof.txt', blob, size: blob.size, mimeType: blob.type },
  });
  const attachmentState = workspace.getState().attachments[0];
  const attachmentHistory = workspace.historyFor('attachments', 'attachment-1').at(-1);
  assert.equal(attachmentState.blob, blob, 'the live workspace preserves attachment binary values');
  assert.equal(Object.prototype.hasOwnProperty.call(attachmentHistory.value, 'blob'), false, 'history intentionally omits attachment binary data');
  assert.equal(attachmentHistory.value.__cwb_v8_omitted_binary_fields.blob.size, blob.size, 'history retains attachment audit metadata');
  await assert.rejects(
    workspace.restoreVersion('attachments', 'attachment-1', 1),
    /附件二进制不在版本历史中/,
    'an omitted binary marker cannot be restored as a broken attachment',
  );
  const binaryPayload = new Uint8Array([1, 2, 3]);
  await workspace.mutate({
    type: 'worklog.binary-payload',
    collection: 'worklogs',
    operation: 'upsert',
    record: { id: 'binary-payload-1', payload: binaryPayload },
  });
  const binaryPayloadHistory = workspace.historyFor('worklogs', 'binary-payload-1').at(-1);
  assert.equal(binaryPayloadHistory.value.__cwb_v8_omitted_binary_fields.payload.size, 3, 'all binary field kinds use the generated omission marker');
  await assert.rejects(
    workspace.restoreVersion('worklogs', 'binary-payload-1', 1),
    /附件二进制不在版本历史中/,
    'a generic binary omission marker also blocks unsafe restoration',
  );
  const markerOnlyHistoryWorkspace = createWorkspace({
    initialState: { worklogs: [], settings: {} },
    history: [{
      id: 'forged-omission', collection: 'worklogs', recordId: 'forged-1', revision: 1, action: 'create',
      value: { id: 'forged-1', __cwb_v8_omitted_binary_fields: { attachment: { kind: 'blob', size: 1 } } },
    }],
  });
  await assert.rejects(
    markerOnlyHistoryWorkspace.restoreVersion('worklogs', 'forged-1', 1),
    /附件二进制不在版本历史中/,
    'any reserved binary omission marker prevents an unsafe historical restore',
  );
  const nestedMapBinary = new Map([['binary-value', new Uint8Array([4, 5])]]);
  const nestedSetBinary = new Set([{ binary_value: new Uint8Array([6, 7, 8]) }]);
  const nestedBinaryAuditWorkspace = createWorkspace({ initialState: { worklogs: [], settings: {} } });
  await nestedBinaryAuditWorkspace.mutate({
    collection: 'worklogs',
    operation: 'upsert',
    record: { id: 'nested-binary-1', nested: { map: nestedMapBinary, set: nestedSetBinary } },
  });
  const nestedBinaryHistory = nestedBinaryAuditWorkspace.historyFor('worklogs', 'nested-binary-1')[0].value;
  assert.equal(
    nestedBinaryHistory.nested.map.__cwb_v8_map_entries[0][1].__cwb_v8_omitted_binary_fields.value.size,
    2,
    'Map values recursively omit binary content from history',
  );
  assert.equal(
    nestedBinaryHistory.nested.set.__cwb_v8_set_values[0].__cwb_v8_omitted_binary_fields.binary_value.size,
    3,
    'Set values recursively omit binary content from history',
  );
  assert.equal(nestedBinaryHistory.nested.map.__cwb_v8_map_entries[0][1] instanceof Uint8Array, false, 'history retains no Map binary object');
  await assert.rejects(
    nestedBinaryAuditWorkspace.restoreVersion('worklogs', 'nested-binary-1', 1),
    /附件二进制不在版本历史中/,
    'nested Map or Set binary omissions block unsafe historical restoration',
  );

  await workspace.mutate({
    type: 'worklog.create',
    collection: 'worklogs',
    operation: 'upsert',
    record: { id: 'metadata-1', risk_type: 'manual', package_size: 8 },
  });
  await workspace.mutate({ type: 'worklog.delete', collection: 'worklogs', operation: 'delete', id: 'metadata-1' });
  await workspace.restoreVersion('worklogs', 'metadata-1', 1, 'restorer');
  const restoredMetadata = workspace.getState().worklogs.find(record => record.id === 'metadata-1');
  assert.equal(restoredMetadata.risk_type, 'manual', 'restore preserves legitimate business *_type fields');
  assert.equal(restoredMetadata.package_size, 8, 'restore preserves legitimate business *_size fields');

  const backup = await workspace.createBackup({ source: 'test' });
  const verification = await verifyBackup(backup);
  assert.equal(verification.ok, true);
  assert.equal(backup.manifest.schemaVersion, 8);
  assert.equal(backup.recoveryPoints.length, 3, 'backups retain the recovery-point window');
  assert.deepEqual(backup.attachments, [], 'workspace backups expose a separate attachment payload channel');
  const attachmentPayloadBackup = await workspace.createBackup({
    source:'attachment-payload-test',
    attachments:[{ id:'attachment-payload-1', student_id:'student-1', data_base64:'Ynl0ZXM=', content_hash:'test' }],
    auxiliary:{ audit_log:[{ id:'audit-1', action:'backup_export' }], import_jobs:[{ id:'job-1', status:'paused' }] },
  });
  assert.equal((await verifyBackup(attachmentPayloadBackup)).ok, true, 'attachment payloads are covered by the workspace backup checksum');
  assert.equal(attachmentPayloadBackup.auxiliary.audit_log[0].id, 'audit-1', 'workspace backups retain application auxiliary records');
  assert.equal(
    (await verifyBackup({ ...attachmentPayloadBackup, auxiliary:{ audit_log:[{ id:'audit-1', action:'tampered' }] } })).ok,
    false,
    'tampering with auxiliary audit records invalidates the backup',
  );
  assert.equal(
    (await verifyBackup({ ...attachmentPayloadBackup, attachments:[{ id:'attachment-payload-1', student_id:'student-1', data_base64:'dGFtcGVyZWQ=', content_hash:'test' }] })).ok,
    false,
    'tampering with separately transported attachment bytes invalidates the backup',
  );
  const sameSizeTamperedBackup = {
    ...backup,
    data: {
      ...backup.data,
      attachments: backup.data.attachments.map(record => ({
        ...record,
        blob: new Blob(['x'.repeat(record.blob.size)], { type: record.blob.type }),
      })),
    },
  };
  assert.equal(sameSizeTamperedBackup.data.attachments[0].blob.size, backup.data.attachments[0].blob.size, 'the corruption probe keeps the attachment byte length unchanged');
  assert.equal((await verifyBackup(sameSizeTamperedBackup)).ok, false, 'backup verification detects same-size attachment corruption');
  assert.equal(
    (await verifyBackup({ ...backup, manifest: { ...backup.manifest, source: 'tampered-source' } })).ok,
    false,
    'backup verification covers meaningful manifest source metadata',
  );
  assert.equal(
    (await verifyBackup({ ...backup, manifest: { ...backup.manifest, revision: backup.manifest.revision + 1 } })).ok,
    false,
    'backup verification covers manifest revision metadata',
  );
  const diagnostics = workspace.diagnostics();
  assert.equal(diagnostics.schemaVersion, 8);
  assert.equal(diagnostics.recoveryPoints, 3);
  assert.equal(diagnostics.collections.students, 1);

  const retries = [];
  let online = false;
  const offlineWorkspace = createWorkspace({
    initialState: { students: [], settings: {} },
    maxRetries: 0,
    persist: async envelope => {
      if (!online) throw new Error('disk unavailable');
      retries.push(envelope);
      return { ok: true };
    },
  });
  await assert.rejects(
    offlineWorkspace.mutate({ collection: 'students', operation: 'upsert', record: { id: 'retry-1', full_name: '首次' } }),
    /disk unavailable/,
  );
  await assert.rejects(
    offlineWorkspace.mutate({ collection: 'students', operation: 'patch', id: 'retry-1', patch: { full_name: '最新' } }),
    /disk unavailable/,
  );
  assert.equal(offlineWorkspace.status().state, 'pending_recovery');
  assert.equal(offlineWorkspace.status().pending, 1, 'failed writes coalesce into one latest recovery snapshot');
  online = true;
  const retried = await offlineWorkspace.retryPending();
  assert.deepEqual(retried, { retried: 1, remaining: 0 });
  assert.equal(retries.length, 1, 'retry persists only the newest state, never a stale failed envelope');
  assert.equal(retries[0].data.students[0].full_name, '最新');
  assert.equal(retries[0].revision, 2);
  assert.equal(offlineWorkspace.status().state, 'saved');

  const replacementWorkspace = createWorkspace({ initialState: { students: [], settings: {} } });
  await replacementWorkspace.mutate({
    collection: 'students',
    operation: 'upsert',
    record: { id: 'replace-existing', full_name: '替换前' },
  });
  await replacementWorkspace.mutate({
    collection: 'students',
    operation: 'replace',
    data: [
      { id: 'replace-existing', full_name: '替换后' },
      { id: 'replace-new', full_name: '新记录' },
    ],
  });
  assert.equal(replacementWorkspace.getState().students.find(record => record.id === 'replace-existing').rev, 2, 'safe collection replacement advances an existing record version');
  assert.equal(replacementWorkspace.getState().students.find(record => record.id === 'replace-new').rev, 1, 'safe collection replacement versions added records');
  assert.equal(replacementWorkspace.historyFor('students', 'replace-existing').length, 2, 'safe collection replacement retains prior history');
  await replacementWorkspace.mutate({ collection: 'students', operation: 'replace', data: [] });
  const replacedDeletion = replacementWorkspace.historyFor('students', 'replace-existing').at(-1);
  assert.equal(replacedDeletion.action, 'delete', 'safe collection replacement versions removed records as deletions');
  assert.equal(replacedDeletion.revision, 3);

  const replaceScale = 5000;
  const scaleStudents = Array.from({ length: replaceScale }, (_, index) => ({
    id: `scale-${index}`, rev: 1, full_name: `student-${index}`,
  }));
  const scaleHistory = scaleStudents.map(record => ({
    id: `history-${record.id}`, collection: 'students', recordId: record.id, revision: 1, action: 'create', value: { ...record },
  }));
  const scaleReplaceWorkspace = createWorkspace({
    initialState: { students: scaleStudents, settings: {} },
    history: scaleHistory,
  });
  const replaceStartedAt = performance.now();
  await scaleReplaceWorkspace.mutate({
    collection: 'students',
    operation: 'replace',
    data: scaleStudents.map(record => ({ id: record.id, full_name: `${record.full_name}-updated` })),
  });
  const replaceElapsedMs = performance.now() - replaceStartedAt;
  assert.ok(replaceElapsedMs <= 200, `5,000-record replacement stays within 200ms (actual ${replaceElapsedMs.toFixed(1)}ms)`);
  assert.equal(scaleReplaceWorkspace.getState().students[4999].rev, 2, 'indexed replacement preserves record revision continuity at scale');

  let replacementYields = 0;
  const yieldingReplaceWorkspace = createWorkspace({
    initialState: { students: [], settings: {} },
    yield: async () => { replacementYields += 1; },
    yieldIntervalMs: 0,
  });
  const yieldingStudents = Array.from({ length: 600 }, (_, index) => ({
    id: `yielding-${index}`,
    full_name: `yielding student ${index}`,
  }));
  await yieldingReplaceWorkspace.mutate({
    collection: 'students',
    operation: 'replace',
    data: yieldingStudents,
  });
  assert.ok(replacementYields > 0, 'large replacements cooperatively yield without omitting per-record history');
  assert.equal(yieldingReplaceWorkspace.historyFor('students', 'yielding-599').length, 1, 'yielding replacement retains each record history entry');

  let defaultValidateCalls = 0;
  const defaultValidationScale = createWorkspace({
    initialState: { students: [], settings: {} },
    validate: () => { defaultValidateCalls += 1; return true; },
  });
  await defaultValidationScale.mutate({ collection:'students', operation:'upsert', record:{ id:'validator-contract', full_name:'validator contract' } });
  assert.equal(defaultValidateCalls, 1, 'a supplied validator still receives every accepted mutation');

  const recoveryRevisionWorkspace = createWorkspace({ initialState: { students: [], settings: {} } });
  await recoveryRevisionWorkspace.mutate({
    collection: 'students',
    operation: 'upsert',
    record: { id: 'restore-revision', full_name: '第一版' },
  });
  const recoveryPoint = await recoveryRevisionWorkspace.checkpoint({ type: 'before-revision-advance' });
  await recoveryRevisionWorkspace.mutate({
    collection: 'students',
    operation: 'patch',
    id: 'restore-revision',
    patch: { full_name: '第二版' },
  });
  await recoveryRevisionWorkspace.restoreRecoveryPoint(recoveryPoint.id, 'restorer');
  await recoveryRevisionWorkspace.mutate({
    collection: 'students',
    operation: 'patch',
    id: 'restore-revision',
    patch: { full_name: '恢复后第三版' },
  });
  assert.equal(
    recoveryRevisionWorkspace.getState().students[0].rev,
    3,
    'the next record update after recovery uses the largest historical revision',
  );

  const recoveryValidationWorkspace = createWorkspace({
    initialState: { students: [{ id: 'current-student', full_name: 'current' }], settings: {} },
    recoveryPoints: [{
      id: 'forged-recovery-point', schemaVersion: 8, revision: 7,
      data: { students: [{ id: 'forged-student', full_name: 'forged' }], settings: {} }, history: [],
    }],
    validate: async (candidate, command) => (
      command.operation === 'restore' && candidate.students[0].full_name === 'forged'
        ? 'recovery point rejected' : true
    ),
  });
  const stateBeforeRejectedRecovery = recoveryValidationWorkspace.getState();
  const historyBeforeRejectedRecovery = recoveryValidationWorkspace.diagnostics().historyEntries;
  const statusBeforeRejectedRecovery = recoveryValidationWorkspace.status();
  await assert.rejects(
    recoveryValidationWorkspace.restoreRecoveryPoint('forged-recovery-point', 'restorer'),
    /recovery point rejected/,
  );
  assert.deepEqual(recoveryValidationWorkspace.getState(), stateBeforeRejectedRecovery, 'a rejected recovery point does not replace current state');
  assert.equal(recoveryValidationWorkspace.diagnostics().historyEntries, historyBeforeRejectedRecovery, 'a rejected recovery point does not append history');
  assert.deepEqual(recoveryValidationWorkspace.status(), statusBeforeRejectedRecovery, 'a rejected recovery point does not alter save status');

  const recoveryHookWrites = [];
  const recoveryHookWorkspace = createWorkspace({
    initialState: { students: [{ id: 'recovery-current', full_name: 'current' }], settings: {} },
    recoveryPoints: [{
      id: 'hook-recovery-point', schemaVersion: 8, revision: 5,
      data: { students: [{ id: 'recovery-restored', full_name: 'restored' }], settings: {} }, history: [],
    }],
    persist: async envelope => { recoveryHookWrites.push(envelope); return { ok: true }; },
    onApplied: () => { throw new Error('recovery view adapter failed'); },
  });
  await assert.rejects(
    recoveryHookWorkspace.restoreRecoveryPoint('hook-recovery-point', 'restorer'),
    /recovery view adapter failed/,
  );
  assert.equal(recoveryHookWorkspace.getState().students[0].id, 'recovery-restored', 'recovery state remains available after its view hook fails');
  assert.equal(recoveryHookWorkspace.status().state, 'pending_recovery', 'recovery hook failure creates a durable recovery obligation');
  assert.equal(recoveryHookWrites.length, 0, 'a failed recovery hook cannot report a completed persistence');
  assert.deepEqual(await recoveryHookWorkspace.retryPending(), { retried: 1, remaining: 0 });
  assert.equal(recoveryHookWrites.length, 1, 'retry persists recovered state after its view hook failure');

  const importSource = createWorkspace({
    initialState: { students: [], settings: { theme:'source' } },
  });
  await importSource.mutate({ collection:'students', operation:'upsert', record:{ id:'imported-student', full_name:'导入学生' } });
  await importSource.checkpoint({ type:'import-source' });
  const importBackup = await importSource.createBackup({ source:'hydrate-test' });
  const hydrateWrites = [];
  const hydrateEvents = [];
  const hydrateTarget = createWorkspace({
    initialState: { students:[{ id:'current-student', full_name:'当前学生' }], settings:{ theme:'current' } },
    persist:async envelope => { hydrateWrites.push(envelope); return { ok:true }; },
    onApplied:(state, result, command) => hydrateEvents.push({ state, result, command }),
  });
  await hydrateTarget.hydrateBackup(importBackup, 'backup-import');
  assert.equal(hydrateTarget.getState().students[0].id, 'imported-student', 'a verified backup atomically replaces live data');
  assert.equal(hydrateTarget.getState().settings.theme, 'source');
  assert.equal(hydrateTarget.historyFor('students', 'imported-student').length, 1, 'backup history replaces prior history rather than merging silently');
  assert.equal(hydrateTarget.listRecoveryPoints().length, 1, 'backup recovery points are retained during hydration');
  assert.equal(hydrateTarget.exportEmergencyBackup().revision, importBackup.manifest.revision, 'backup revision becomes the live revision');
  assert.equal(hydrateWrites.length, 1, 'a successful backup import is persisted once');
  assert.equal(hydrateWrites[0].command.type, 'workspace.hydrate_backup');
  assert.equal(hydrateEvents[0].result.operation, 'hydrate_backup', 'the view adapter receives one hydration event');

  const stateBeforeRejectedBackup = hydrateTarget.getState();
  const historyBeforeRejectedBackup = hydrateTarget.diagnostics().historyEntries;
  const writesBeforeRejectedBackup = hydrateWrites.length;
  await assert.rejects(
    hydrateTarget.hydrateBackup({ ...importBackup, manifest:{ ...importBackup.manifest, checksum:'0'.repeat(64) } }),
    /备份校验和不匹配/,
  );
  assert.deepEqual(hydrateTarget.getState(), stateBeforeRejectedBackup, 'a bad checksum cannot alter live state');
  assert.equal(hydrateTarget.diagnostics().historyEntries, historyBeforeRejectedBackup, 'a rejected backup cannot change history');
  assert.equal(hydrateWrites.length, writesBeforeRejectedBackup, 'a rejected backup is never persisted');
  await assert.rejects(
    hydrateTarget.hydrateBackup({ ...importBackup, manifest:{ ...importBackup.manifest, schemaVersion:7 } }),
    /备份版本过旧/,
  );

  console.log('PASS v8-workspace');
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
