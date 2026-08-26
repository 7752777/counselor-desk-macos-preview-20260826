const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = html.match(/const STUDENT_LIVE_LINK_RULES = Object\.freeze\([\s\S]*?\nfunction studentChangedFields/);
assert.ok(block, 'student live-link rules should remain available');
const source = block[0].replace(/\nfunction studentChangedFields$/, '');
const api = new Function('DB', 'cloneData', 'today', `${source}\nreturn { studentLiveLinkImpact, studentLiveLinkSnapshot, restoreStudentLiveLinkSnapshot, restoreStudentLiveLinkSnapshotIfUnchanged, syncStudentLiveLinks, liveRows:() => DB.tasks };`)(
  {
    tasks: [
      { id:'open-task', student_id:'student-1', student_number:'OLD', student_name:'旧姓名', class_name:'原班', status:'todo' },
      { id:'done-task', student_id:'student-1', student_number:'OLD', student_name:'旧姓名', class_name:'原班', status:'done' },
      { id:'legacy-task', student_number:'OLD', student_name:'旧姓名', class_name:'原班', status:'todo' },
    ],
    custom: {
      v4_worklog_drafts: [{ id:'draft-1', student_id:'student-1', student_number:'OLD', student_name:'旧姓名', class_name:'原班', status:'draft' }],
      v4_student_class_history: [{ id:'history-1', student_id:'student-1', student_number:'OLD', student_name:'旧姓名', class_name:'原班', status:'historical' }],
    },
  },
  value => JSON.parse(JSON.stringify(value)),
  () => '2026-08-24',
);

const student = { id:'student-1', student_id:'student-1', student_number:'NEW', full_name:'新姓名', class_name:'新班' };
assert.equal(api.studentLiveLinkImpact(student).count, 2, 'only open stable-ID links should be considered live');
const snapshot = api.studentLiveLinkSnapshot([student]);
const result = api.syncStudentLiveLinks(student);
assert.equal(result.changed, 2, 'open task and draft should follow the current student snapshot');
assert.deepEqual(result.collections.sort(), ['tasks', 'v4_worklog_drafts'].sort());

const rows = api.studentLiveLinkImpact(student).rows;
assert.ok(rows.every(item => item.row.student_name === '新姓名' && item.row.student_number === 'NEW' && item.row.class_name === '新班'));
const db = api.liveRows();
assert.deepEqual(db.find(item => item.id === 'done-task').student_name, '旧姓名', 'completed task must retain its historical display snapshot');
assert.deepEqual(db.find(item => item.id === 'legacy-task').student_name, '旧姓名', 'number-only legacy links must not be rewritten');
api.restoreStudentLiveLinkSnapshot(snapshot);
assert.equal(snapshot[0].row.student_name, '旧姓名', 'rollback must restore the original row reference');
assert.equal(snapshot[0].row.student_number, 'OLD');
const beforeUndo = api.studentLiveLinkSnapshot([student]);
api.syncStudentLiveLinks(student);
const afterUndo = api.studentLiveLinkSnapshot([student]);
const hydratedRows = api.liveRows().map(row => Object.assign({}, row));
api.liveRows().splice(0, api.liveRows().length, ...hydratedRows);
const changedAfterEdit = api.liveRows().find(row => row.id === 'open-task');
changedAfterEdit.note = '老师后来补充的内容';
const undoResult = api.restoreStudentLiveLinkSnapshotIfUnchanged(beforeUndo, afterUndo);
assert.equal(undoResult.restored, 2, 'undo should restore unchanged linked rows, including untouched historical snapshots');
assert.equal(undoResult.conflicts, 1, 'undo must detect a linked row edited after the bulk operation');
assert.equal(changedAfterEdit.note, '老师后来补充的内容', 'undo must not overwrite a newer linked-row edit');
assert.equal(changedAfterEdit.student_name, '新姓名', 'the newer linked-row edit should retain the synchronized snapshot');
console.log('PASS student-live-link-sync');
