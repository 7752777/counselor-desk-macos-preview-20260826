const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const v48 = require('../src/core/cwb-v48.js');

const audit = [];
const admin = v48.createContentPushService({
  actor:{ id:'admin-1', role:'workspace_admin', name:'管理员' },
  audit:(action, details) => audit.push({ action, details }),
});
const teacher = { id:'teacher-1', role:'teacher' };
const editor = { id:'editor-1', role:'content_editor' };

const teacherOnly = admin.publish({ id:'teacher-only', title:'教师通知', body:'只给辅导员查看', audience_roles:['teacher'] });
const editorOwned = admin.publish({ id:'editor-owned', title:'编辑通知', body:'编辑本人可撤回', audience_roles:['content_editor'] }, editor);
const scopedTeacher = admin.publish({ id:'scoped-teacher', title:'计算机学院通知', body:'只给指定学院辅导员查看', scope:{ workspace_id:'workspace-local', college:'计算机学院' }, audience_roles:['teacher'] });
assert.equal(admin.list({}).length, 2);
assert.equal(admin.list({}, undefined, teacher).length, 1, 'role audience must filter visible content');
assert.equal(admin.listAll(teacher, { workspace_id:'workspace-local', college:'计算机学院' }).length, 2, 'teacher list must honor the active scope');
assert.equal(admin.listAll(teacher, { workspace_id:'workspace-local', college:'外国语学院' }).length, 1, 'teacher list must not leak another college');
assert.throws(() => admin.publish({ title:'越权发布', body:'不应保存' }, teacher), /CONTENT_PERMISSION_DENIED/);
assert.throws(() => admin.markRead(teacherOnly.id, 'someone-else', teacher), /CONTENT_PERMISSION_DENIED/, 'reader identity must be bound to the actor');
assert.throws(() => admin.retract(teacherOnly.id, teacher), /CONTENT_PERMISSION_DENIED/);
assert.throws(() => admin.retract(teacherOnly.id, editor), /CONTENT_PERMISSION_DENIED/);
assert.equal(admin.retract(editorOwned.id, editor).status, 'retracted', 'content editor may retract own content');
const read = admin.markRead(teacherOnly.id, teacher.id, teacher);
assert.equal(read.reader_role, 'teacher');
assert.equal(admin.markRead(teacherOnly.id, 'admin-1', { id:'admin-1', role:'workspace_admin' }).reader_id, 'admin-1');
assert.throws(() => admin.markRead(editorOwned.id, teacher.id, teacher), /CONTENT_PERMISSION_DENIED/, 'retracted content cannot receive a read receipt');
assert.throws(() => admin.markRead(scopedTeacher.id, teacher.id, teacher, { workspace_id:'workspace-local', college:'外国语学院' }), /CONTENT_PERMISSION_DENIED/, 'read must honor the active scope');
const scopedRead = admin.markRead(scopedTeacher.id, teacher.id, teacher, { workspace_id:'workspace-local', college:'计算机学院' });
assert.equal(scopedRead.reader_role, 'teacher');
const teacherPackage = admin.exportPackage({ workspace_id:'workspace-local', college:'计算机学院' }, { actor:teacher });
assert.equal(teacherPackage.pushes.length, 2, 'teacher export must be visible-only within the active scope');
assert.equal(teacherPackage.reads.every(item => item.reader_id === teacher.id), true, 'teacher export must only include the current reader receipts');
assert.equal(admin.exportPackage({ workspace_id:'workspace-local', college:'外国语学院' }, { actor:teacher }).pushes.length, 1, 'teacher export must not leak another college');
assert.equal(admin.exportPackage({ workspace_id:'workspace-local', college:'计算机学院' }, { actor:editor }).pushes.length, 2, 'content editor export must be limited to the active scope');
assert.throws(() => admin.importPackage({ format:'cwb-content-package', version:1, pushes:[] }, { actor:teacher }), /CONTENT_PERMISSION_DENIED/);
assert.ok(audit.some(item => item.action === 'content_push_published' && item.details.actor_role === 'workspace_admin'));
assert.ok(audit.some(item => item.action === 'content_push_read' && item.details.actor_id === 'teacher-1'));

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'cwb-v48-ui.js'), 'utf8');
assert.match(indexHtml, /source_collection/);
assert.match(indexHtml, /source_label/);
assert.match(indexHtml, /provenance:Object\.values\(collections\)/);
assert.match(indexHtml, /content_role_changed/);
assert.match(uiSource, /content_role/);
assert.doesNotMatch(uiSource, /data-v48-field=\\"operator_role\\"/);
console.log('PASS v48-content-export');
