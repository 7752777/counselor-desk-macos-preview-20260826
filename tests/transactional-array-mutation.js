const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const match = html.match(/async function persistArrayMutation\(list, part, mutate\) \{[\s\S]*?\n\}\n\nfunction desktopBackupErrorCode/);
assert.ok(match, 'transactional array mutation helper should remain available');

const source = match[0].replace(/\n\nfunction desktopBackupErrorCode$/, '');
const cloneData = value => value == null ? value : JSON.parse(JSON.stringify(value));
let failWrites = false;
let writes = 0;
const save = () => {
  writes += 1;
  return failWrites ? Promise.reject(new Error('TEST_SAVE_FAILURE')) : Promise.resolve({ ok:true });
};
const awaitTrackedSave = async promise => promise;
const mutationQueues = new Map();
const queueTransactionalMutation = (key, operation) => {
  const previous = mutationQueues.get(key) || Promise.resolve();
  const queued = previous.then(operation, operation);
  mutationQueues.set(key, queued.catch(() => {}));
  return queued;
};
const persistMutationQueueKey = (_list, part) => part === 'custom' ? 'persist:custom' : `persist:${part || 'all'}`;
const persistArrayMutation = new Function('cloneData', 'save', 'awaitTrackedSave', 'queueTransactionalMutation', 'persistMutationQueueKey', `${source}\nreturn persistArrayMutation;`)(cloneData, save, awaitTrackedSave, queueTransactionalMutation, persistMutationQueueKey);
const settingsMatch = html.match(/async function persistSettingsMutation\(mutate\) \{[\s\S]*?\n\}\nasync function persistArrayMutation/);
assert.ok(settingsMatch, 'settings mutation helper should remain available');
const settingsSource = settingsMatch[0].replace(/\nasync function persistArrayMutation$/, '');
const settingsDb = { settings:{ ui:{ preset:'blueprint' }, saved_filters:[], content_role:'content_editor' } };
const persistSettingsMutation = new Function('DB', 'cloneData', 'save', 'awaitTrackedSave', `${settingsSource}\nreturn persistSettingsMutation;`)(settingsDb, cloneData, save, awaitTrackedSave);
const workspaceMatch = html.match(/function snapshotDataMutation\(collections\) \{[\s\S]*?\n\}\nfunction trackDataMutationSave/);
assert.ok(workspaceMatch, 'transactional workspace snapshot helpers should remain available');
const workspaceSource = workspaceMatch[0].replace(/\nfunction trackDataMutationSave$/, '');
const workspaceDb = {
  settings:{ ui:{ preset:'blueprint', density:'comfortable' }, backup_state:{ change_count:3 } },
  students:[{ id:'stable-student', full_name:'编辑中的学生', class_name:'一班', custom_fields:{ veteran_status:'否' } }],
  custom:{ v4_family_contacts:[{ id:'family-contact', student_id:'stable-student', outcome:'待回访' }], v4_filters:[{ id:'saved-filter', name:'一班' }] },
};
const workspaceHelpers = new Function('DB', 'cloneData', 'v4Collection', `${workspaceSource}\nreturn { snapshotDataMutation, restoreDataMutation };`)(workspaceDb, cloneData, key => workspaceDb.custom[key] || (workspaceDb.custom[key] = []));

(async () => {
  const editable = { id:'editable-row', title:'编辑前标题', status:'todo' };
  const rows = [editable, { id:'other-row', title:'其他记录' }];

  failWrites = true;
  await assert.rejects(
    () => persistArrayMutation(rows, 'custom', list => {
      const row = list.find(item => item.id === editable.id);
      Object.assign(row, { title:'不应留存的标题', status:'done', new_field:'temporary' });
    }),
    /TEST_SAVE_FAILURE/,
    'a failed update should be observable'
  );
  const rolledBack = rows.find(item => item.id === editable.id);
  assert.equal(rolledBack, editable, 'rollback must preserve the editor-held record reference');
  assert.deepEqual(rolledBack, { id:'editable-row', title:'编辑前标题', status:'todo' }, 'rollback must restore every previous field and remove temporary fields');

  failWrites = false;
  await persistArrayMutation(rows, 'custom', list => {
    const row = list.find(item => item.id === editable.id);
    Object.assign(row, { title:'重试已保存', status:'done' });
  });
  assert.equal(editable.title, '重试已保存', 'retry should use the same editor-held object');
  assert.equal(editable.status, 'done', 'retry should persist the edited status');

  const settingsReference = settingsDb.settings;
  failWrites = true;
  await assert.rejects(
    () => persistSettingsMutation(settings => {
      settings.ui.preset = 'calm';
      settings.saved_filters.push({ id:'temporary-filter' });
      settings.content_role = 'workspace_admin';
    }),
    /TEST_SAVE_FAILURE/,
    'a failed settings update should be observable'
  );
  assert.equal(settingsDb.settings, settingsReference, 'settings rollback should preserve references used by open dialogs');
  assert.deepEqual(settingsDb.settings, { ui:{ preset:'blueprint' }, saved_filters:[], content_role:'content_editor' }, 'settings rollback should restore nested preferences and roles');
  failWrites = false;
  await persistSettingsMutation(settings => { settings.ui.preset = 'calm'; settings.saved_filters.push({ id:'saved-filter' }); });
  assert.equal(settingsReference.ui.preset, 'calm', 'settings retry should persist through the same settings object');
  assert.equal(settingsReference.saved_filters.length, 1, 'settings retry should not retain the failed temporary preference');

  const beforeNew = rows.length;
  failWrites = true;
  await assert.rejects(
    () => persistArrayMutation(rows, 'custom', list => list.push({ id:'failed-new-row', title:'不应残留的新记录' })),
    /TEST_SAVE_FAILURE/,
    'a failed create should be observable'
  );
  assert.equal(rows.length, beforeNew, 'a failed create must not leave a partial row in memory');
  assert.equal(rows.some(item => item.id === 'failed-new-row'), false, 'a failed create must remove its generated row');
  assert.ok(writes >= 5, 'failed writes should attempt a restore save before returning control to the user');

  // Cross-collection mutations (such as a record plus its worklog draft or
  // attachment metadata) must also roll back in place. Open dialogs retain
  // these objects while a save is pending, so replacement would make retry
  // edits appear to work but write an obsolete detached object.
  const settingsRef = workspaceDb.settings;
  const studentRef = workspaceDb.students[0];
  const customRef = workspaceDb.custom;
  const contactRef = workspaceDb.custom.v4_family_contacts[0];
  const workspaceSnapshot = workspaceHelpers.snapshotDataMutation(['students', 'v4_family_contacts']);
  workspaceDb.settings.ui.preset = 'calm';
  workspaceDb.settings.backup_state.change_count = 99;
  studentRef.class_name = '二班'; studentRef.custom_fields.veteran_status = '是'; studentRef.temporary = true;
  contactRef.outcome = '已完成'; workspaceDb.custom.v4_family_contacts.push({ id:'orphan-contact' });
  workspaceDb.custom.v4_filters[0].name = '二班';
  workspaceHelpers.restoreDataMutation(workspaceSnapshot);
  assert.equal(workspaceDb.settings, settingsRef, 'workspace rollback must preserve the settings object held by an open dialog');
  assert.equal(workspaceDb.students[0], studentRef, 'workspace rollback must preserve the selected student object');
  assert.equal(workspaceDb.custom, customRef, 'workspace rollback must preserve custom collection roots used by extensions');
  assert.equal(workspaceDb.custom.v4_family_contacts[0], contactRef, 'workspace rollback must preserve related record references');
  assert.deepEqual(workspaceDb.settings, { ui:{ preset:'blueprint', density:'comfortable' }, backup_state:{ change_count:3 } });
  assert.deepEqual(studentRef, { id:'stable-student', full_name:'编辑中的学生', class_name:'一班', custom_fields:{ veteran_status:'否' } });
  assert.deepEqual(contactRef, { id:'family-contact', student_id:'stable-student', outcome:'待回访' });
  assert.deepEqual(workspaceDb.custom.v4_filters, [{ id:'saved-filter', name:'一班' }], 'nested custom preferences should also roll back');

  console.log('PASS transactional-array-mutation');
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
