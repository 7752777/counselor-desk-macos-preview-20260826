const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSqliteStore } = require('../desktop/sqlite-store.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-v4-sqlite-'));
const file = path.join(dir, 'records.sqlite');
let store = createSqliteStore(file, () => 'test-vault-key');
if (!store) {
  console.log('SKIP electron-sqlite: node:sqlite unavailable');
  process.exit(0);
}
const first = store.put('records_students', { id: 'stu-1', schema_version: 7, student_number: '20240001', full_name: '张明' });
assert.equal(first.id, 'stu-1');
assert.equal(first.schema_version, 7, 'explicit legacy records must remain readable as schema v7');
assert.equal(store.get('records_students', 'stu-1').full_name, '张明');
assert.equal(store.list('records_students').length, 1);
assert.equal(store.count('records_students'), 1);
assert.equal(store.delete('records_students', 'stu-1'), true);
assert.equal(store.count('records_students'), 0);
const current = store.put('records_tasks', { id: 'task-v8', title: 'v8 default record' });
assert.equal(current.schema_version, 8, 'new desktop records must default to schema v8');
store.replaceManyAtomic('records_tasks', [{ id: 'task-replaced', title: 'replaced task' }]);
assert.equal(store.get('records_tasks', 'task-replaced').title, 'replaced task', 'non-student collections must retain actual record ids after atomic replacement');
assert.equal(store.list('records_tasks').length, 1);
store.replaceManyAtomic('records_tasks', []);
assert.equal(store.count('records_tasks'), 0, 'an empty atomic replacement must leave no sentinel records');
store.put('records_students', { id:'corrupt-1', full_name:'corrupted payload fixture' });
store.close();

const { DatabaseSync } = require('node:sqlite');
const corruptedPayloadDb = new DatabaseSync(file);
corruptedPayloadDb.prepare('UPDATE records SET payload=? WHERE collection=? AND record_id=?').run(Buffer.from('not-an-encrypted-record'), 'records_students', 'corrupt-1');
corruptedPayloadDb.close();
store = createSqliteStore(file, () => 'test-vault-key');
assert.throws(() => store.health({ verifyPayloads:true }), error => error.code === 'REPOSITORY_DECRYPT_FAILED', 'corrupted encrypted payloads must be diagnosable');
store.close();

const malformedFile = path.join(dir, 'malformed.sqlite');
fs.writeFileSync(malformedFile, 'this is not sqlite');
assert.throws(() => createSqliteStore(malformedFile, () => 'test-vault-key'), error => error.code === 'REPOSITORY_CORRUPTED', 'a malformed SQLite file must not be replaced or silently re-created');
fs.rmSync(dir, { recursive: true, force: true });
console.log('PASS electron-sqlite');
