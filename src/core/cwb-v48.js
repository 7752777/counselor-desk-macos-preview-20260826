/* v4.8 storage-agnostic services. The browser, portable HTML, Electron, and
 * LAN host can share identity, derived analysis, backup scheduling, and sync
 * conflict rules without importing DOM or platform-specific code. */
(function installCwbV48(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.CWBV48 = api;
    root.CWB = root.CWB || {};
    root.CWB.v48 = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbV48(root) {
  'use strict';

  const SCHEMA_VERSION = 11;
  const SYNC_PROTOCOL_VERSION = 1;
  const text = value => String(value == null ? '' : value).trim();
  const now = () => new Date().toISOString();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const list = value => Array.isArray(value) ? value : [];
  const id = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const hasOwn = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
  function secureToken(prefix, length) {
    const size = Number(length || 24);
    const bytes = new Uint8Array(size);
    if (root && root.crypto && typeof root.crypto.getRandomValues === 'function') root.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    return `${prefix}_${Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')}`;
  }
  function secureDigits(length) {
    const size = Math.max(4, Number(length) || 8);
    const bytes = new Uint8Array(size);
    if (root && root.crypto && typeof root.crypto.getRandomValues === 'function') root.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    return Array.from(bytes, value => String(value % 10)).join('');
  }
  function constantTokenEqual(left, right) {
    const a = String(left == null ? '' : left);
    const b = String(right == null ? '' : right);
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
    return difference === 0;
  }

  function sanitizeSyncPatch(collection, recordId, patch) {
    const value = clone(patch || {});
    const collectionName = text(collection);
    const stableId = text(recordId);
    delete value.id;
    delete value.record_id;
    delete value.collection;
    if (collectionName === 'students') {
      const supplied = text(value.student_id);
      if (supplied && supplied !== stableId) {
        const error = new Error('SYNC_STUDENT_ID_IMMUTABLE');
        error.code = 'SYNC_STUDENT_ID_IMMUTABLE';
        throw error;
      }
      // A student record created or repaired through sync must always carry
      // the same stable ID as its record key.
      value.student_id = stableId;
    }
    return value;
  }

  const COLLECTIONS = Object.freeze([
    'v4_sync_devices', 'v4_sync_outbox', 'v4_sync_conflicts', 'v4_sync_revisions', 'v4_backup_runs',
    'v4_student_field_catalog', 'v4_student_identity_conflicts', 'v4_form_templates', 'v4_form_jobs',
    'v4_student_class_history', 'v4_content_pushes', 'v4_content_reads', 'v4_work_categories',
  ]);
  const SENSITIVE_STUDENT_FIELDS = Object.freeze(new Set([
    'full_name', 'student_number', 'phone', 'email', 'qq', 'id_card', 'parent_name', 'parent_phone',
    'home_addr', 'family_address', 'psych_level', 'crisis_level', 'difficulty_level',
  ]));
  const CONTENT_ROLES = Object.freeze(['workspace_admin', 'content_editor', 'teacher', 'viewer']);
  const CONTENT_ROLE_LABELS = Object.freeze({ workspace_admin:'工作区管理员', content_editor:'内容编辑', teacher:'辅导员', viewer:'只读查看' });
  const CONTENT_ROLE_PERMISSIONS = Object.freeze({
    workspace_admin:Object.freeze(['read', 'publish', 'retract', 'import', 'export', 'export_visible']),
    content_editor:Object.freeze(['read', 'publish', 'retract_own', 'import', 'export_visible']),
    teacher:Object.freeze(['read', 'export_visible']),
    viewer:Object.freeze(['read']),
  });

  function historyNumbers(student) {
    const value = student || {};
    return [...new Set((Array.isArray(value.student_number_history) ? value.student_number_history : [])
      .map(item => text(item && typeof item === 'object' ? item.value : item)).filter(Boolean))];
  }

  function identityIndexes(existing) {
    const byId = new Map();
    const byNumber = new Map();
    const byHistory = new Map();
    list(existing).forEach(student => {
      if (!student || typeof student !== 'object') return;
      const record = student;
      const studentId = text(record.id || record.student_id);
      if (studentId) byId.set(studentId, record);
      const current = text(record.student_number);
      if (current) {
        const rows = byNumber.get(current) || [];
        rows.push(record); byNumber.set(current, rows);
      }
      historyNumbers(record).forEach(number => {
        const rows = byHistory.get(number) || [];
        rows.push(record); byHistory.set(number, rows);
      });
    });
    return { byId, byNumber, byHistory };
  }

  function resolveStudent(row, indexes) {
    const value = row && typeof row === 'object' ? row : {};
    const explicitId = text(value.student_id || value.id);
    if (explicitId) {
      const match = indexes.byId.get(explicitId);
      return match ? { type:'student_id', record:match, candidates:[match] } : { type:'manual', candidates:[], reason:'student_id_not_found' };
    }
    const number = text(value.student_number || value.number);
    if (number) {
      const current = indexes.byNumber.get(number) || [];
      if (current.length === 1) return { type:'student_number', record:current[0], candidates:current };
      if (current.length > 1) return { type:'ambiguous', candidates:current, reason:'duplicate_current_student_number' };
      const history = indexes.byHistory.get(number) || [];
      if (history.length === 1) return { type:'student_number_history', record:history[0], candidates:history };
      if (history.length > 1) return { type:'ambiguous', candidates:history, reason:'duplicate_history_student_number' };
    }
    return { type:'new', candidates:[], reason:number ? 'student_number_not_found' : 'missing_identity' };
  }

  function fieldSet(row) {
    const keys = Array.isArray(row && row.__presentFields) ? row.__presentFields : Object.keys(row || {});
    return new Set(keys.filter(key => !String(key).startsWith('__')));
  }

  function createStudentId(options) {
    const generator = options && typeof options.idGenerator === 'function' ? options.idGenerator : null;
    return text(generator ? generator() : '') || id('student');
  }

  function diffRecord(before, incoming, options) {
    const opts = options || {};
    const clearEmpty = opts.clearEmpty === true;
    const fields = fieldSet(incoming);
    const patch = {};
    const changes = [];
    fields.forEach(field => {
      if (field === 'id' || field === 'student_id' || field === 'student_number_history') return;
      const incomingValue = incoming[field];
      const empty = incomingValue == null || (typeof incomingValue === 'string' && incomingValue.trim() === '');
      if (empty && !clearEmpty) return;
      const beforeValue = before && before[field];
      if (JSON.stringify(beforeValue) === JSON.stringify(incomingValue)) return;
      patch[field] = incomingValue;
      changes.push({ field, before:clone(beforeValue), after:clone(incomingValue), cleared:empty });
    });
    return { patch, changes };
  }

  function preserveStudentNumberHistory(before, patch) {
    const current = text(before && before.student_number);
    const next = text(patch.student_number);
    if (!current || !next || current === next) return;
    const history = historyNumbers(before);
    if (!history.includes(current)) history.push(current);
    patch.student_number_history = history.filter(number => number !== next);
  }

  function buildStudentClassHistory(before, next, options) {
    const previous = before || {}; const current = next || {}; const opts = options || {};
    const fromClass = text(previous.class_name); const toClass = text(current.class_name);
    const studentId = text(current.id || current.student_id || previous.id || previous.student_id);
    if (!studentId || fromClass === toClass) return null;
    return {
      id:id('class_history'), schema_version:SCHEMA_VERSION, student_id:studentId,
      student_number:text(current.student_number || previous.student_number), student_name:text(current.full_name || previous.full_name),
      previous_class_name:fromClass, from_class_name:fromClass, to_class_name:toClass, class_name:toClass,
      effective_date:(text(opts.effective_date) || now()).slice(0, 10), reason:text(opts.reason) || '学生名单导入',
      source:text(opts.source) || '学生名单导入', operator:text(opts.operator) || 'local-user', created_at:now(), updated_at:now(),
    };
  }

  function previewStudentImport(rows, existing, options) {
    const opts = Object.assign({ mode:'merge', clearEmpty:false }, options || {});
    const source = list(rows).map((row, index) => Object.assign({}, row, { __sourceRow:Number(row && row.__sourceRow || index + 2) }));
    const indexes = identityIndexes(existing);
    const seenIds = new Map();
    const matchedIds = new Set();
    const resultRows = [];
    for (const row of source) {
      const resolution = resolveStudent(row, indexes);
      const rowNumber = row.__sourceRow;
      if (resolution.type === 'ambiguous' || resolution.type === 'manual') {
        resultRows.push({ rowNumber, status:'manual', action:'review', reason:resolution.reason, candidates:resolution.candidates.map(item => text(item.id)) });
        continue;
      }
      if (resolution.record) {
        const recordId = text(resolution.record.id || resolution.record.student_id);
        if (seenIds.has(recordId)) {
          resultRows.push({ rowNumber, status:'conflict', action:'review', reason:'duplicate_identity_in_file', duplicateOf:seenIds.get(recordId), recordId });
          continue;
        }
        seenIds.set(recordId, rowNumber); matchedIds.add(recordId);
        const diff = diffRecord(resolution.record, row, opts);
        const patch = clone(diff.patch);
        if (resolution.type === 'student_number_history' && text(row.student_number)) {
          delete patch.student_number;
          diff.changes = diff.changes.filter(change => change.field !== 'student_number');
        }
        preserveStudentNumberHistory(resolution.record, patch);
        resultRows.push({ rowNumber, status:'ready', action:'update', matchType:resolution.type, recordId, patch, changes:diff.changes });
      } else {
        const fields = fieldSet(row);
        const record = {};
        fields.forEach(field => { if (field !== 'id' && field !== 'student_id' && field !== '__sourceRow') record[field] = clone(row[field]); });
        if (!text(record.full_name) && !text(record.student_number)) {
          resultRows.push({ rowNumber, status:'invalid', action:'skip', reason:'missing_name_and_student_number' });
          continue;
        }
        const newId = text(row.student_id || row.id);
        if (newId) {
          resultRows.push({ rowNumber, status:'manual', action:'review', reason:'student_id_not_found', candidates:[] });
          continue;
        }
        record.id = createStudentId(opts);
        record.student_number_history = [];
        resultRows.push({ rowNumber, status:'ready', action:'create', recordId:record.id, record, changes:Object.keys(record).map(field => ({ field, before:undefined, after:clone(record[field]) })) });
      }
    }
    const matched = new Set([...matchedIds]);
    const missing = list(existing).filter(student => {
      const recordId = text(student && (student.id || student.student_id));
      return recordId && !matched.has(recordId);
    });
    const manual = resultRows.filter(row => row.status === 'manual' || row.status === 'conflict');
    const ready = resultRows.filter(row => row.status === 'ready');
    return {
      mode:opts.mode === 'replace' ? 'replace' : 'merge',
      clearEmpty:opts.clearEmpty === true,
      rows:resultRows,
      summary:{ total:resultRows.length, ready:ready.length, update:ready.filter(row => row.action === 'update').length, create:ready.filter(row => row.action === 'create').length, manual:manual.length, invalid:resultRows.filter(row => row.status === 'invalid').length, missing:missing.length, delete:opts.mode === 'replace' ? missing.length : 0 },
      missing:missing.map(student => ({ id:text(student.id || student.student_id), name:text(student.full_name), student_number:text(student.student_number) })),
      canCommit:manual.length === 0 && resultRows.every(row => row.status !== 'invalid'),
      generatedAt:now(),
    };
  }

  function applyStudentImport(existing, preview, options) {
    if (!preview || !Array.isArray(preview.rows)) throw new Error('STUDENT_IMPORT_PREVIEW_REQUIRED');
    const opts = Object.assign({ mode:preview.mode || 'merge' }, options || {});
    if (!preview.canCommit) throw new Error('STUDENT_IMPORT_REVIEW_REQUIRED');
    if (opts.mode === 'replace' && opts.confirmReplace !== true) throw new Error('STUDENT_IMPORT_REPLACE_CONFIRM_REQUIRED');
    const rows = list(existing).map(clone);
    const classHistory = list(opts.class_history).map(clone);
    const classHistoryChanges = [];
    const index = new Map(rows.map((record, position) => [text(record && (record.id || record.student_id)), position]));
    const updated = [];
    preview.rows.filter(row => row.status === 'ready').forEach(item => {
      if (item.action === 'create') {
        const value = Object.assign({}, clone(item.record), { id:item.record.id, student_id:item.record.id, updated_at:now() });
        rows.push(value); index.set(value.id, rows.length - 1); updated.push({ action:'create', id:value.id });
        return;
      }
      const position = index.get(item.recordId);
      if (position == null) throw new Error('STUDENT_IMPORT_MATCH_DISAPPEARED');
      const before = rows[position];
      const patch = clone(item.patch || {});
      preserveStudentNumberHistory(before, patch);
      const next = Object.assign({}, before, patch, { id:before.id, student_id:before.student_id || before.id, updated_at:now() });
      const classChange = buildStudentClassHistory(before, next, opts);
      if (classChange && !classHistory.some(record => text(record.student_id) === text(classChange.student_id)
        && text(record.effective_date) === text(classChange.effective_date)
        && text(record.from_class_name || record.previous_class_name) === text(classChange.from_class_name)
        && text(record.to_class_name || record.class_name) === text(classChange.to_class_name))) {
        classHistory.push(classChange); classHistoryChanges.push(clone(classChange));
      }
      rows[position] = next;
      updated.push({ action:'update', id:before.id, changes:item.changes || [] });
    });
    const removed = [];
    if (opts.mode === 'replace') {
      const keep = new Set(preview.rows.filter(item => item.status === 'ready').map(item => item.recordId));
      for (let position = rows.length - 1; position >= 0; position -= 1) {
        const recordId = text(rows[position] && (rows[position].id || rows[position].student_id));
        if (recordId && !keep.has(recordId) && !preview.rows.some(item => item.action === 'create' && item.recordId === recordId)) removed.push(rows[position]);
      }
      for (const record of removed) rows.splice(rows.indexOf(record), 1);
    }
    return { students:rows, class_history:classHistory, class_history_changes:classHistoryChanges, updated, removed:removed.map(clone), undo:{ students: list(existing).map(clone), createdAt:now() }, report:{ added:updated.filter(item => item.action === 'create').length, updated:updated.filter(item => item.action === 'update').length, deleted:removed.length } };
  }

  function applyStudentBulk(existing, ids, patch, options) {
    const opts = Object.assign({ mode:'edit', clearFields:[] }, options || {});
    const selected = new Set(list(ids).map(text).filter(Boolean));
    if (!selected.size) throw new Error('STUDENT_BULK_SELECTION_REQUIRED');
    if (!['edit', 'archive', 'delete'].includes(opts.mode)) throw new Error('STUDENT_BULK_MODE_INVALID');
    if (opts.mode === 'delete' && opts.confirmDelete !== true) throw new Error('STUDENT_BULK_DELETE_CONFIRM_REQUIRED');
    const before = list(existing).filter(item => selected.has(text(item && (item.id || item.student_id)))).map(clone);
    if (!before.length) throw new Error('STUDENT_BULK_SELECTION_NOT_FOUND');
    const clearFields = new Set(list(opts.clearFields).map(text).filter(Boolean));
    const sourcePatch = patch && typeof patch === 'object' ? patch : {};
    const rows = list(existing).map(clone);
    const beforeById = new Map(list(existing).map(value => [text(value && (value.id || value.student_id)), value]));
    const classHistory = list(opts.class_history).map(clone);
    const classHistoryChanges = [];
    const changed = [];
    const protectedFields = new Set(['id', 'student_id', 'student_number_history', 'created_at', 'updated_at', 'schema_version', 'custom_fields', 'custom_field_meta']);
    const hasValue = value => !(value == null || (typeof value === 'string' && value.trim() === ''));
    const customPatch = sourcePatch.custom_fields && typeof sourcePatch.custom_fields === 'object' ? sourcePatch.custom_fields : {};
    rows.forEach((row, index) => {
      const rowId = text(row && (row.id || row.student_id));
      if (!selected.has(rowId)) return;
      if (opts.mode === 'delete') return;
      if (opts.mode === 'archive') {
        row.enrollment_status = '已归档';
        row.archived_at = now();
      }
      if (opts.mode === 'edit' || opts.mode === 'archive') {
        clearFields.forEach(field => {
          if (field.indexOf('custom_fields.') !== 0 && !protectedFields.has(field)) row[field] = Array.isArray(row[field]) ? [] : '';
        });
        Object.keys(sourcePatch).forEach(field => {
          if (protectedFields.has(field) || field === 'custom_fields') return;
          if (!clearFields.has(field) && hasValue(sourcePatch[field])) row[field] = clone(sourcePatch[field]);
        });
        const currentCustom = Object.assign({}, row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {});
        clearFields.forEach(field => {
          if (field.indexOf('custom_fields.') === 0) currentCustom[field.slice('custom_fields.'.length)] = '';
        });
        Object.keys(customPatch).forEach(field => {
          if (clearFields.has(`custom_fields.${field}`) || clearFields.has(field)) currentCustom[field] = '';
          else if (hasValue(customPatch[field])) currentCustom[field] = clone(customPatch[field]);
        });
        row.custom_fields = currentCustom;
        row.updated_at = now();
        row.schema_version = 8;
      }
      const beforeRow = beforeById.get(rowId);
      const classChange = beforeRow && buildStudentClassHistory(beforeRow, row, opts);
      if (classChange && !classHistory.some(record => text(record.student_id) === text(classChange.student_id)
        && text(record.effective_date) === text(classChange.effective_date)
        && text(record.from_class_name || record.previous_class_name) === text(classChange.from_class_name)
        && text(record.to_class_name || record.class_name) === text(classChange.to_class_name))) {
        classHistory.push(classChange); classHistoryChanges.push(clone(classChange));
      }
      rows[index] = row;
      changed.push({ id:rowId, mode:opts.mode });
    });
    const removed = opts.mode === 'delete' ? rows.filter(row => selected.has(text(row && (row.id || row.student_id)))) : [];
    const nextRows = opts.mode === 'delete' ? rows.filter(row => !selected.has(text(row && (row.id || row.student_id)))) : rows;
    return {
      students:nextRows,
      before,
      removed:removed.map(clone),
      changed,
      class_history:classHistory, class_history_changes:classHistoryChanges,
      undo:{ students:list(existing).map(clone), class_history:list(opts.class_history).map(clone), createdAt:now(), mode:opts.mode },
      report:{ selected:before.length, changed:changed.length, deleted:removed.length, archived:opts.mode === 'archive' ? changed.length : 0 },
    };
  }

  /* Long-lived workspaces contain records created before stable student IDs
   * became mandatory. Surface those records for deliberate repair instead of
   * guessing from names or silently rewriting historical facts. */
  const IDENTITY_REVIEW_DEFAULT_SOURCES = Object.freeze([
    'tasks', 'talks', 'stay', 'leave', 'honor', 'pleave', 'attend', 'node', 'warn', 'help',
    'grant', 'focus', 'psych', 'graduate', 'party', 'rewards', 'activities', 'grades', 'worklogs',
  ]);

  function studentDisplayName(record) {
    const value = record || {};
    return text(value.full_name || value.student_name || value.name);
  }

  function reviewRecordId(collection, record, index) {
    const value = record || {};
    return text(value.id || value.record_id) || `${text(collection) || 'record'}:${Number(index) + 1}`;
  }

  function scanStudentIdentityConflicts(input, options) {
    const source = input && typeof input === 'object' ? input : {};
    const students = list(source.students);
    const indexes = identityIndexes(students);
    const opts = options || {};
    const selected = Array.isArray(opts.collections) && opts.collections.length
      ? opts.collections.map(text).filter(Boolean)
      : IDENTITY_REVIEW_DEFAULT_SOURCES.slice();
    const rows = [];
    selected.forEach(collection => {
      list(source.records && source.records[collection]).forEach((record, index) => {
        if (!record || typeof record !== 'object') return;
        const explicitId = text(record.student_id);
        const recordId = reviewRecordId(collection, record, index);
        if (explicitId && indexes.byId.has(explicitId)) return;
        const number = text(record.student_number || record.student_no);
        const name = studentDisplayName(record);
        const current = number ? (indexes.byNumber.get(number) || []) : [];
        const historical = number ? (indexes.byHistory.get(number) || []) : [];
        const candidates = current.length === 1 ? current
          : current.length > 1 ? current
            : historical.length === 1 ? historical
              : historical.length > 1 ? historical
                : name ? students.filter(student => studentDisplayName(student) === name) : [];
        let reason = explicitId ? 'student_id_not_found' : 'missing_student_id';
        if (current.length > 1) reason = 'duplicate_current_student_number';
        else if (!current.length && historical.length > 1) reason = 'duplicate_history_student_number';
        else if (!current.length && !historical.length && name) reason = 'name_only_manual';
        else if (!number && !name) reason = 'missing_identity';
        rows.push({
          id:`${collection}:${recordId}`,
          collection,
          record_id:recordId,
          student_id:explicitId,
          student_number:number,
          student_name:name,
          reason,
          match_type:current.length === 1 ? 'current_student_number' : historical.length === 1 ? 'historical_student_number' : name ? 'name_candidate' : '',
          candidate_ids:candidates.map(student => text(student && (student.id || student.student_id))).filter(Boolean),
          candidate_count:candidates.length,
          status:'pending',
        });
      });
    });
    return rows;
  }

  function resolveStudentIdentityRecord(record, student, options) {
    const source = record && typeof record === 'object' ? record : null;
    const target = student && typeof student === 'object' ? student : null;
    if (!source || !target) throw new Error('STUDENT_IDENTITY_RESOLUTION_REQUIRED');
    const targetId = text(target.id || target.student_id);
    if (!targetId) throw new Error('STUDENT_IDENTITY_TARGET_ID_REQUIRED');
    const opts = options || {};
    const next = clone(source);
    next.student_id = targetId;
    if (opts.refresh_snapshots === true || !text(next.student_number)) next.student_number = text(target.student_number);
    if (opts.refresh_snapshots === true || !text(next.student_name || next.name)) {
      if (hasOwn(next, 'student_name')) next.student_name = text(target.full_name);
      if (hasOwn(next, 'name') && !hasOwn(next, 'student_name')) next.name = text(target.full_name);
    }
    if (opts.refresh_snapshots === true || !text(next.class_name)) next.class_name = text(target.class_name);
    next.student_identity_reconciled_at = now();
    next.student_identity_reconciled_by = text(opts.operator) || 'local-user';
    return next;
  }

  const studentIdentityReview = Object.freeze({
    DEFAULT_SOURCES:IDENTITY_REVIEW_DEFAULT_SOURCES,
    scan:scanStudentIdentityConflicts,
    resolve:resolveStudentIdentityRecord,
  });
  const studentImport = Object.freeze({ identityIndexes, resolveStudent, preview:previewStudentImport, apply:applyStudentImport, diff:diffRecord, buildClassHistory:buildStudentClassHistory });
  const studentBulk = Object.freeze({ apply:applyStudentBulk });

  function xmlEscape(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function formValue(student, key) {
    const path = text(key).replace(/^student\./, '');
    if (!path) return '';
    const parts = path.split('.').filter(Boolean);
    let current = student || {};
    for (const part of parts) {
      if (current == null) return '';
      current = current[part];
    }
    if (Array.isArray(current)) return current.join('、');
    if (current === true) return '是';
    if (current === false) return '否';
    return current == null ? '' : String(current);
  }

  function extractFormFields(source) {
    const value = String(source == null ? '' : source);
    const fields = new Set();
    const placeholderPattern = /{{\s*(student\.[A-Za-z][A-Za-z0-9_.]{0,127})\s*}}/g;
    let match;
    while ((match = placeholderPattern.exec(value))) fields.add(match[1]);
    const controlPattern = /<w:sdt\b[\s\S]*?<\/w:sdt>/g;
    while ((match = controlPattern.exec(value))) {
      const block = match[0];
      const alias = block.match(/<w:alias\b[^>]*w:val="([^"]+)"/);
      const tag = block.match(/<w:tag\b[^>]*w:val="([^"]+)"/);
      const key = text(alias && alias[1] || tag && tag[1]);
      if (/^student\.[A-Za-z][A-Za-z0-9_.]{0,127}$/.test(key)) fields.add(key);
    }
    return [...fields];
  }

  function validateFormTemplate(template, source) {
    const value = template && typeof template === 'object' ? template : {};
    const extracted = extractFormFields(source || value.source_text || '');
    const declared = list(value.fields).map(text).filter(Boolean);
    const fields = [...new Set((declared.length ? declared : extracted).map(field => field.startsWith('student.') ? field : `student.${field}`))];
    const invalid = fields.filter(field => !/^student\.[A-Za-z][A-Za-z0-9_.]{0,127}$/.test(field));
    const missingFromDeclaration = extracted.filter(field => declared.length && !fields.includes(field));
    return { valid:invalid.length === 0 && missingFromDeclaration.length === 0 && fields.length > 0, fields, extracted, invalid, missing_from_declaration:missingFromDeclaration, supported:fields.length > 0 };
  }

  function mergeFormRows(template, students) {
    const validation = validateFormTemplate(template, template && template.source_text || '');
    const fields = validation.fields;
    return list(students).map(student => {
      const values = Object.fromEntries(fields.map(field => [field, formValue(student, field)]));
      return { student_id:text(student && (student.id || student.student_id)), student_number:text(student && student.student_number), full_name:text(student && student.full_name), values, missing:fields.filter(field => !text(values[field])), ready:fields.every(field => text(values[field])) };
    });
  }

  function renderFormXml(source, student) {
    let xml = String(source == null ? '' : source);
    const missing = new Set();
    xml = xml.replace(/{{\s*(student\.[A-Za-z][A-Za-z0-9_.]{0,127})\s*}}/g, (full, field) => {
      const value = formValue(student, field); if (!text(value)) missing.add(field); return xmlEscape(value);
    });
    xml = xml.replace(/<w:sdt\b[\s\S]*?<\/w:sdt>/g, block => {
      const alias = block.match(/<w:alias\b[^>]*w:val="([^"]+)"/);
      const tag = block.match(/<w:tag\b[^>]*w:val="([^"]+)"/);
      const field = text(alias && alias[1] || tag && tag[1]);
      if (!/^student\.[A-Za-z][A-Za-z0-9_.]{0,127}$/.test(field)) return block;
      const value = formValue(student, field); if (!text(value)) missing.add(field);
      return block.replace(/(<w:sdtContent\b[^>]*>[\s\S]*?<w:t\b[^>]*>)[\s\S]*?(<\/w:t>)/, (full, start, end) => `${start}${xmlEscape(value)}${end}`);
    });
    return { xml, missing:[...missing] };
  }

  function xmlText(value) {
    return String(value == null ? '' : value).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  }

  function readFormContentControls(source) {
    const records = [];
    const controlPattern = /<w:sdt\b[\s\S]*?<\/w:sdt>/g;
    let match;
    while ((match = controlPattern.exec(String(source == null ? '' : source)))) {
      const block = match[0];
      const alias = block.match(/<w:alias\b[^>]*w:val="([^"]+)"/);
      const tag = block.match(/<w:tag\b[^>]*w:val="([^"]+)"/);
      const field = text(alias && alias[1] || tag && tag[1]);
      if (!/^student\.[A-Za-z][A-Za-z0-9_.]{0,127}$/.test(field)) continue;
      const content = block.match(/<w:sdtContent\b[\s\S]*?<\/w:sdtContent>/);
      records.push({ field, value:xmlText(content && content[0] || ''), source:'content_control' });
    }
    return records;
  }

  function previewFormReverse(existing, incoming, mapping) {
    const source = incoming && typeof incoming === 'object' ? incoming : {};
    const fields = Object.keys(source).filter(key => /^student\./.test(key));
    const map = mapping && typeof mapping === 'object' ? mapping : {};
    const resolved = fields.map(field => ({ field, target:text(map[field] || field.replace(/^student\./, '')), value:source[field] }));
    const conflicts = [];
    const current = existing && typeof existing === 'object' ? existing : {};
    resolved.forEach(item => { const before = formValue(current, item.target); if (text(before) && text(item.value) && text(before) !== text(item.value)) conflicts.push({ field:item.target, before, after:item.value }); });
    return { fields:resolved, conflicts, requires_confirmation:conflicts.length > 0 };
  }

  const forms = Object.freeze({ extractFields:extractFormFields, validateTemplate:validateFormTemplate, mergeRows:mergeFormRows, renderXml:renderFormXml, readContentControls:readFormContentControls, previewReverse:previewFormReverse });

  function studentRows(rows, studentId) {
    const idValue = text(studentId);
    return list(rows).filter(row => text(row && row.student_id) === idValue);
  }

  function studentGradeTrend(studentId, grades, options) {
    const opts = options || {};
    const idValue = text(studentId);
    const rows = studentRows(grades, idValue).filter(row => !opts.term || text(row.term) === text(opts.term));
    const byTerm = new Map();
    rows.forEach(row => {
      const term = text(row.term) || '未记录学期';
      const value = Number(row.score);
      const item = byTerm.get(term) || { term, scores:[], failed_count:0, gpa_values:[] };
      if (Number.isFinite(value)) { item.scores.push(value); if (value < Number(opts.failThreshold || 60)) item.failed_count += 1; }
      const gpa = Number(row.gpa); if (Number.isFinite(gpa)) item.gpa_values.push(gpa);
      byTerm.set(term, item);
    });
    const terms = [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term)).map(item => Object.assign(item, {
      average_score:item.scores.length ? Number((item.scores.reduce((sum, value) => sum + value, 0) / item.scores.length).toFixed(2)) : null,
      gpa:item.gpa_values.length ? Number((item.gpa_values.reduce((sum, value) => sum + value, 0) / item.gpa_values.length).toFixed(2)) : null,
      recorded:item.scores.length > 0,
    }));
    return { student_id:idValue, terms, recorded:terms.length > 0, missing:terms.length === 0 };
  }

  function weekday(value) {
    const date = new Date(`${text(value)}T00:00:00`);
    if (!Number.isFinite(date.getTime())) return 0;
    return date.getDay() || 7;
  }

  function leaveClassHours(studentId, leaves, schedules, options) {
    const opts = options || {};
    const relevant = studentRows(leaves, studentId).filter(row => !opts.from || text(row.date || row.start_date) >= text(opts.from));
    const classes = list(schedules);
    let covered = 0; let matched = 0; let unknown = 0;
    const details = [];
    relevant.forEach(leave => {
      if (text(leave.status) && !['已批准', 'approved', '通过'].includes(text(leave.status))) return;
      const date = text(leave.date || leave.start_date);
      const day = weekday(date);
      const candidates = classes.filter(item => text(item.class_name) === text(leave.class_name || opts.class_name) && Number(item.weekday) === day);
      if (!candidates.length) { unknown += 1; details.push({ leave_id:leave.id, date, status:'未匹配课表' }); return; }
      candidates.forEach(item => {
        const hours = Math.max(1, Number(item.end_section || item.start_section || 1) - Number(item.start_section || 1) + 1);
        covered += hours; matched += 1;
        details.push({ leave_id:leave.id, date, schedule_id:item.id, hours, status:'已覆盖' });
      });
    });
    return { student_id:text(studentId), covered_class_hours:covered, matched_classes:matched, unmatched_leave_records:unknown, details };
  }

  function classDataQuality(options) {
    const opts = options || {};
    const students = list(opts.students);
    const fields = Array.isArray(opts.fields) && opts.fields.length ? opts.fields : ['student_number', 'full_name', 'class_name', 'phone'];
    const missing = Object.fromEntries(fields.map(field => [field, students.filter(row => !text(row && row[field])).length]));
    return { total:students.length, fields, missing, complete:students.filter(row => fields.every(field => text(row && row[field]))).length, incomplete:students.filter(row => fields.some(field => !text(row && row[field]))).length };
  }

  const analysis = Object.freeze({ studentGradeTrend, leaveClassHours, classDataQuality, activeClassAtDate, classHistoryIntegrity });

  function prepareSensitiveVoiceRequest(input) {
    const value = input && typeof input === 'object' ? input : {};
    if (value.authorized !== true || !text(value.consent_id)) throw new Error('AI_SENSITIVE_CONSENT_REQUIRED');
    const purpose = text(value.purpose) || 'voice_transcription';
    if (!['voice_transcription', 'psych_note_draft'].includes(purpose)) throw new Error('AI_PURPOSE_INVALID');
    const size = Number(value.size || value.audio_size || 0);
    if (size > 25 * 1024 * 1024) throw new Error('AI_AUDIO_TOO_LARGE');
    return {
      purpose,
      consent_id:text(value.consent_id),
      student_id:text(value.student_id),
      audio_saved:false,
      outbound_audio:true,
      source_name:text(value.source_name).slice(0, 160),
      duration_seconds:Math.max(0, Math.min(7200, Number(value.duration_seconds || 0))),
      requested_at:now(),
      human_confirmed:false,
      sensitive_fields:['psychology'],
    };
  }

  function normalizeSensitiveVoiceDraft(input) {
    const value = input && typeof input === 'object' ? input : {};
    if (!text(value.consent_id) || text(value.purpose) !== 'psych_note_draft') throw new Error('AI_SENSITIVE_CONSENT_REQUIRED');
    return {
      id:text(value.id) || id('psych_draft'),
      purpose:'psych_note_draft',
      consent_id:text(value.consent_id),
      student_id:text(value.student_id),
      draft:text(value.draft || value.text || value.content).slice(0, 12000),
      audio_saved:false,
      human_confirmed:value.human_confirmed === true,
      status:value.human_confirmed === true ? 'confirmed' : 'draft',
      created_at:text(value.created_at) || now(),
      updated_at:now(),
    };
  }

  function cohortSummary(records, options) {
    const opts = options || {};
    const threshold = Math.max(3, Number(opts.minimum_group_size || opts.min_group_size || 5));
    const groups = new Map();
    list(records).forEach(record => {
      const value = record && typeof record === 'object' ? record : {};
      const studentId = text(value.student_id || value.id);
      const keys = [...new Set([...(Array.isArray(value.interests) ? value.interests : []), ...(Array.isArray(value.topics) ? value.topics : []), text(value.interest), text(value.topic)].map(text).filter(Boolean))];
      keys.forEach(key => { const item = groups.get(key) || { topic:key, student_ids:new Set(), count:0 }; if (studentId) item.student_ids.add(studentId); item.count += 1; groups.set(key, item); });
    });
    const visible = [...groups.values()].filter(item => item.student_ids.size >= threshold).map(item => ({ topic:item.topic, count:item.student_ids.size }));
    return { minimum_group_size:threshold, suppressed_groups:[...groups.values()].filter(item => item.student_ids.size < threshold).length, groups:visible.sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic)), student_count:new Set(list(records).map(item => text(item && (item.student_id || item.id))).filter(Boolean)).size, human_interpretation_required:true, diagnosis:false };
  }

  const sensitiveAi = Object.freeze({ prepareVoice:prepareSensitiveVoiceRequest, normalizeVoiceDraft:normalizeSensitiveVoiceDraft, cohortSummary });

  function createBackupScheduler(options) {
    const opts = options || {};
    const clock = typeof opts.now === 'function' ? opts.now : () => new Date();
    const load = typeof opts.load === 'function' ? opts.load : () => ({});
    const save = typeof opts.save === 'function' ? opts.save : () => {};
    const run = typeof opts.run === 'function' ? opts.run : async () => ({ saved:false, reason:'backup_runner_missing' });
    let state = Object.assign({ enabled:false, frequency:'daily', change_threshold:50, folder:'', retain:8, last_run_at:'', last_success_at:'', last_error:'', changes_since_last:0 }, clone(load()) || {});
    const interval = value => value === 'monthly' ? 30 : value === 'weekly' ? 7 : 1;
    const status = () => {
      const nowValue = clock(); const last = state.last_success_at ? new Date(state.last_success_at).getTime() : 0;
      const ageDays = last ? Math.max(0, Math.floor((nowValue.getTime() - last) / 86400000)) : null;
      const dueByTime = !last || ageDays >= interval(state.frequency);
      const dueByChange = Number(state.change_threshold) > 0 && Number(state.changes_since_last) >= Number(state.change_threshold);
      return Object.assign({}, clone(state), { age_days:ageDays, due:state.enabled && (dueByTime || dueByChange), due_by_time:dueByTime, due_by_change:dueByChange, next_days:last ? Math.max(0, interval(state.frequency) - ageDays) : 0 });
    };
    const persist = () => { save(clone(state)); return status(); };
    return {
      schedule(config) {
        const value = config || {};
        state = Object.assign({}, state, { enabled:value.enabled !== false, frequency:['daily','weekly','monthly'].includes(value.frequency) ? value.frequency : state.frequency || 'daily', change_threshold:Math.max(0, Number(value.change_threshold == null ? state.change_threshold : value.change_threshold) || 0), folder:typeof value.folder === 'string' ? value.folder : state.folder || '', retain:Math.max(1, Math.min(100, Number(value.retain == null ? state.retain : value.retain) || 8)) });
        return persist();
      },
      status,
      markChanged(count) { state.changes_since_last = Math.max(0, Number(state.changes_since_last || 0) + Math.max(1, Number(count) || 1)); return persist(); },
      recordSuccess(at) {
        const value = at ? new Date(at) : clock();
        const timestamp = Number.isFinite(value.getTime()) ? value.toISOString() : clock().toISOString();
        state.last_run_at = timestamp; state.last_success_at = timestamp; state.last_error = ''; state.changes_since_last = 0;
        return persist();
      },
      async runNow(meta) {
        state.last_run_at = clock().toISOString();
        try {
          const result = await run(Object.assign({}, clone(state), meta || {}, { scheduled_at:state.last_run_at }));
          state.last_success_at = clock().toISOString(); state.last_error = ''; state.changes_since_last = 0;
          persist(); return Object.assign({ ok:true }, result || {}, { status:status() });
        } catch (error) {
          state.last_error = text(error && error.message || error) || 'BACKUP_RUN_FAILED'; persist();
          const next = new Error(state.last_error); next.code = error && error.code || 'BACKUP_RUN_FAILED'; throw next;
        }
      },
    };
  }

  function installBackupFacade(existing, options) {
    const target = existing || {};
    const service = createBackupScheduler(options);
    const opts = options || {};
    target.schedule = service.schedule;
    target.status = service.status;
    target.runNow = service.runNow;
    target.markChanged = service.markChanged;
    target.recordSuccess = service.recordSuccess;
    target.v48Scheduler = service;
    // Keep restore destructive work behind a named commit operation. The
    // preview is repeated here so callers cannot accidentally commit a stale
    // or tampered envelope after showing an earlier preview.
    target.commitRestore = async function (envelope, password, mode) {
      if (typeof target.previewRestore !== 'function' || typeof target.restore !== 'function') throw new Error('BACKUP_RESTORE_UNAVAILABLE');
      const preview = await target.previewRestore(envelope, password);
      const result = await target.restore(envelope, password, mode || 'merge');
      return Object.assign({}, result || {}, { preview });
    };
    target.exportRecoveryKit = function (password, folder) {
      const desktop = opts.desktop || (root && root.cwbDesktop);
      if (!desktop || typeof desktop.exportRecoveryKit !== 'function') {
        const error = new Error('恢复包导出需要桌面端');
        error.code = 'RECOVERY_KIT_DESKTOP_REQUIRED';
        throw error;
      }
      return desktop.exportRecoveryKit(password, folder || '');
    };
    return target;
  }

  function createSyncFacade(options) {
    const opts = options || {};
    const desktop = opts.desktop || (root && root.cwbDesktop);
    const getClient = () => {
      const value = typeof opts.client === 'function' ? opts.client() : opts.client;
      if (!value || typeof value !== 'object') {
        const error = new Error('局域网客户端尚未初始化');
        error.code = 'SYNC_CLIENT_UNAVAILABLE';
        throw error;
      }
      return value;
    };
    const callDesktop = (name, args) => {
      if (!desktop || typeof desktop[name] !== 'function') {
        const error = new Error('当前环境不支持局域网主机操作');
        error.code = 'SYNC_HOST_DESKTOP_REQUIRED';
        throw error;
      }
      return desktop[name](...(args || []));
    };
    const host = {
      start: options => callDesktop('lanSyncStart', [options]),
      stop: () => callDesktop('lanSyncStop'),
      status: () => callDesktop('lanSyncStatus'),
      createPairingCode: () => callDesktop('lanSyncPairingCode'),
      revokeDevice: deviceId => callDesktop('lanSyncRevokeDevice', [deviceId]),
      pauseDevice: deviceId => callDesktop('lanSyncPauseDevice', [deviceId]),
      resumeDevice: deviceId => callDesktop('lanSyncResumeDevice', [deviceId]),
    };
    const client = {
      connect: (...args) => getClient().connect(...args),
      requestPairing: (...args) => getClient().requestPairing(...args),
      pollPairing: (...args) => getClient().pollPairing(...args),
      pull: (...args) => getClient().pull(...args),
      flushQueue: (...args) => getClient().flushQueue(...args),
      syncNow: (...args) => getClient().syncNow(...args),
      listConflicts: (...args) => getClient().listConflicts(...args),
      resolveConflict: (...args) => getClient().resolveConflict(...args),
      uploadAttachment: (...args) => getClient().uploadAttachment(...args),
      downloadAttachment: (...args) => getClient().downloadAttachment(...args),
      status: (...args) => getClient().status(...args),
      startAutoSync: (...args) => getClient().startAutoSync(...args),
      stopAutoSync: (...args) => getClient().stopAutoSync(...args),
      enqueue: (...args) => getClient().enqueue(...args),
    };
    return Object.freeze({ host:Object.freeze(host), client:Object.freeze(client) });
  }

  function createRemoteBackupAdapter(options) {
    const opts = options || {};
    const fetcher = typeof opts.fetch === 'function' ? opts.fetch : (root && typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    const maxBytes = Math.max(1, Math.min(1024 * 1024 * 1024, Number(opts.max_bytes || 1024 * 1024 * 1024)));
    const timeoutMs = Math.max(1000, Math.min(120000, Number(opts.timeout_ms || 30000)));
    const mode = ['webdav', 'https'].includes(text(opts.mode)) ? text(opts.mode) : 'https';
    const uploadEndpoint = text(opts.upload_endpoint || 'backups') || 'backups';
    const downloadEndpoint = text(opts.download_endpoint || 'backups') || 'backups';
    const baseUrl = (() => {
      try {
        const parsed = new URL(text(opts.base_url));
        if (parsed.protocol !== 'https:') throw new Error('REMOTE_BACKUP_HTTPS_REQUIRED');
        if (parsed.username || parsed.password || parsed.hash) throw new Error('REMOTE_BACKUP_URL_CREDENTIALS_FORBIDDEN');
        if (parsed.search) throw new Error('REMOTE_BACKUP_URL_QUERY_FORBIDDEN');
        return parsed;
      } catch (error) {
        if (/^REMOTE_BACKUP_/.test(String(error && error.message || ''))) throw error;
        throw new Error('REMOTE_BACKUP_URL_INVALID');
      }
    })();
    const extraHeaders = typeof opts.getHeaders === 'function' ? opts.getHeaders : () => (opts.headers && typeof opts.headers === 'object' ? opts.headers : {});
    function filename(value) {
      const name = text(value);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.cwbk$/i.test(name)) throw new Error('REMOTE_BACKUP_FILENAME_INVALID');
      return name;
    }
    function bytesFrom(value) {
      if (value == null) return new Uint8Array(0);
      if (value instanceof Uint8Array) return value;
      if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
      if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      throw new Error('REMOTE_BACKUP_BYTES_INVALID');
    }
    async function readBytes(value) { return value && typeof value.arrayBuffer === 'function' ? new Uint8Array(await value.arrayBuffer()) : bytesFrom(value); }
    async function digest(value) {
      const bytes = await readBytes(value);
      if (!root || !root.crypto || !root.crypto.subtle) throw new Error('REMOTE_BACKUP_HASH_UNAVAILABLE');
      const hash = await root.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash), item => item.toString(16).padStart(2, '0')).join('');
    }
    function relativeEndpoint(name, allowEmpty) {
      const raw = text(name);
      if (!raw && allowEmpty) return '';
      if (!raw || raw.length > 512 || raw.startsWith('/') || raw.startsWith('\\') || raw.includes('\\') || raw.includes('?') || raw.includes('#') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) throw new Error('REMOTE_BACKUP_ENDPOINT_INVALID');
      let decoded;
      try { decoded = decodeURIComponent(raw); } catch (_) { throw new Error('REMOTE_BACKUP_ENDPOINT_INVALID'); }
      const segments = decoded.split('/');
      if (segments.some(segment => !segment || segment === '.' || segment === '..')) throw new Error('REMOTE_BACKUP_ENDPOINT_INVALID');
      return raw;
    }
    function endpoint(name) {
      const pathName = relativeEndpoint(name, true);
      const base = new URL(baseUrl.toString());
      if (!base.pathname.endsWith('/')) base.pathname += '/';
      const resolved = new URL(pathName, base);
      if (resolved.origin !== base.origin) throw new Error('REMOTE_BACKUP_ENDPOINT_INVALID');
      return resolved.toString();
    }
    async function request(method, name, body, headers) {
      if (!fetcher) throw new Error('REMOTE_BACKUP_FETCH_UNAVAILABLE');
      const targetUrl = endpoint(name);
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : 0;
      const requestHeaders = Object.assign({ 'cache-control':'no-store', 'x-cwb-backup-encrypted':'1' }, extraHeaders() || {}, headers || {});
      let response;
      try {
        response = await fetcher(targetUrl, { method, body, headers:requestHeaders, signal:controller && controller.signal, redirect:'error', credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store' });
      } catch (error) {
        if (error && error.name === 'AbortError') throw new Error('REMOTE_BACKUP_TIMEOUT');
        throw new Error('REMOTE_BACKUP_NETWORK_FAILED');
      } finally { if (timer) clearTimeout(timer); }
      if (!response.ok) {
        const failure = new Error(`REMOTE_BACKUP_HTTP_${response.status}`); failure.status = response.status; throw failure;
      }
      return response;
    }
    async function testConnection() {
      // A connection test never uploads a backup. OPTIONS is the least
      // surprising probe for WebDAV; HTTPS adapters use HEAD so a custom
      // endpoint does not receive a synthetic business payload.
      const method = mode === 'webdav' ? 'OPTIONS' : 'HEAD';
      const response = await request(method, '');
      return { ok:true, mode, base_url:baseUrl.toString(), status:Number(response.status || 200), tested_at:now() };
    }
    async function upload(input) {
      const value = input && typeof input === 'object' ? input : {};
      if (value.encrypted !== true) throw new Error('REMOTE_BACKUP_ENCRYPTION_REQUIRED');
      const bytes = await readBytes(value.bytes || value.package || value.payload);
      if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new Error('REMOTE_BACKUP_SIZE_INVALID');
      const name = filename(value.filename || `counselor-desk-${Date.now()}.cwbk`);
      const sha = text(value.sha256) || await digest(bytes);
      if (!/^[a-f0-9]{64}$/i.test(sha)) throw new Error('REMOTE_BACKUP_HASH_INVALID');
      const target = mode === 'webdav' ? name : text(value.endpoint || uploadEndpoint);
      const response = await request(mode === 'webdav' ? 'PUT' : 'POST', target, bytes, { 'content-type':'application/octet-stream', 'x-cwb-backup-sha256':sha.toLowerCase(), 'x-cwb-backup-filename':name });
      return { ok:true, mode, filename:name, url:endpoint(target), sha256:sha.toLowerCase(), size:bytes.byteLength, status:Number(response.status || 200), key_uploaded:false };
    }
    async function download(name) {
      const safe = filename(name);
      const response = await request('GET', mode === 'webdav' ? safe : `${downloadEndpoint}/${safe}`);
      let bytes;
      try { bytes = new Uint8Array(await response.arrayBuffer()); } catch (_) { throw new Error('REMOTE_BACKUP_RESPONSE_INVALID'); }
      if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new Error('REMOTE_BACKUP_SIZE_INVALID');
      const markedEncrypted = text(response.headers && response.headers.get && response.headers.get('x-cwb-backup-encrypted')) === '1';
      if (!markedEncrypted) throw new Error('REMOTE_BACKUP_ENCRYPTION_REQUIRED');
      return { ok:true, mode, filename:safe, bytes, size:bytes.byteLength, marked_encrypted:true, key_uploaded:false };
    }
    async function remove(name) { const safe = filename(name); await request('DELETE', mode === 'webdav' ? safe : `${downloadEndpoint}/${safe}`); return { ok:true, filename:safe }; }
    return Object.freeze({ mode, base_url:baseUrl.toString(), testConnection, upload, download, remove, limits:{ max_bytes:maxBytes, timeout_ms:timeoutMs }, key_uploaded:false });
  }

  function createSyncEngine(options) {
    const opts = options || {};
    const deviceId = text(opts.device_id) || id('device');
    const workspaceId = text(opts.workspace_id) || 'workspace-local';
    const state = { devices:[], outbox:[], conflicts:[], revisions:new Map(), fieldRevisions:new Map(), seen:new Set(), incoming:[] };
    const operationId = () => id('sync_op');
    function enqueue(collection, recordId, patch, baseRevision) {
      const collectionName = text(collection);
      const recordKey = text(recordId);
      const operation = { workspace_id:workspaceId, device_id:deviceId, operation_id:operationId(), idempotency_key:id('idem'), collection:collectionName, record_id:recordKey, base_revision:Number(baseRevision || 0), patch:sanitizeSyncPatch(collectionName, recordKey, patch), updated_at:now(), schema_version:SCHEMA_VERSION };
      state.outbox.push(operation); return clone(operation);
    }
    function pull(operations) { list(operations).forEach(operation => { if (!operation || state.seen.has(operation.idempotency_key)) return; state.seen.add(operation.idempotency_key); state.incoming.push(clone(operation)); }); return state.incoming.map(clone); }
    function push(operations) { const accepted=[]; list(operations || state.outbox).forEach(operation => { const key=text(operation && operation.idempotency_key); if (!key || state.seen.has(key)) return; state.seen.add(key); accepted.push(clone(operation)); }); state.outbox = state.outbox.filter(item => !accepted.some(value => value.idempotency_key === item.idempotency_key)); return accepted; }
    function merge(current, operation) {
      const record = clone(current || {}); const revisionKey = `${operation.collection}:${operation.record_id}`; const currentRevision = Number(state.revisions.get(revisionKey) || 0);
      const baseRevision = Number(operation.base_revision || 0);
      const conflicting = Object.keys(operation.patch || {}).filter(field => {
        const fieldRevision = state.fieldRevisions.get(`${revisionKey}:${field}`);
        return baseRevision < currentRevision && fieldRevision && fieldRevision.revision > baseRevision;
      });
      if (conflicting.length) {
        const conflict = { id:id('conflict'), workspace_id:workspaceId, collection:operation.collection, record_id:operation.record_id, device_id:operation.device_id, base_revision:baseRevision, current_revision:currentRevision, fields:conflicting.map(field => ({ field, local:clone(record[field]), incoming:clone(operation.patch[field]) })), status:'open', created_at:now() };
        state.conflicts.push(conflict); return { merged:false, conflict:clone(conflict), record };
      }
      const revision = currentRevision + 1;
      Object.assign(record, sanitizeSyncPatch(operation.collection, operation.record_id, operation.patch));
      state.revisions.set(revisionKey, revision);
      Object.keys(operation.patch || {}).forEach(field => state.fieldRevisions.set(`${revisionKey}:${field}`, { revision, device_id:operation.device_id }));
      return { merged:true, record, revision };
    }
    function resolveConflict(conflictId, choice) {
      const conflict = state.conflicts.find(item => String(item.id) === String(conflictId)); if (!conflict) throw new Error('SYNC_CONFLICT_NOT_FOUND');
      if (!['local','incoming','manual'].includes(choice && choice.mode)) throw new Error('SYNC_CONFLICT_CHOICE_INVALID');
      if (choice.mode === 'manual' && (!choice.values || typeof choice.values !== 'object')) throw new Error('SYNC_MANUAL_VALUES_REQUIRED');
      conflict.resolution = clone(choice); conflict.status = 'resolved'; conflict.resolved_at = now(); return clone(conflict);
    }
    return Object.freeze({ deviceId, workspaceId, enqueue, pull, push, merge, listConflicts:() => state.conflicts.map(clone), resolveConflict, status:() => ({ device_id:deviceId, workspace_id:workspaceId, queued:state.outbox.length, incoming:state.incoming.length, conflicts:state.conflicts.filter(item => item.status === 'open').length }) });
  }

  /* Browser and secondary desktop clients use this small transport wrapper.
   * It deliberately keeps the token in memory unless the caller supplies an
   * encrypted persistence adapter. Business records are applied through the
   * caller's repository, so this module remains usable by IndexedDB, Electron
   * and the portable runtime without importing any platform code. */
  function createSyncClient(options) {
    const opts = options || {};
    const deviceId = text(opts.device_id) || id('device');
    const workspaceId = text(opts.workspace_id) || 'workspace-local';
    const fetcher = typeof opts.fetch === 'function' ? opts.fetch : (root && typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    const recordStore = opts.recordStore && typeof opts.recordStore === 'object' ? opts.recordStore : null;
    const load = typeof opts.load === 'function' ? opts.load : () => ({});
    const save = typeof opts.save === 'function' ? opts.save : () => {};
    const persisted = clone(load()) || {};
    const state = {
      base_url:text(persisted.base_url || opts.base_url),
      workspace_id:text(persisted.workspace_id || workspaceId) || workspaceId,
      device_id:text(persisted.device_id || deviceId) || deviceId,
      cursor:Number(persisted.cursor || 0),
      queue:list(persisted.queue).map(clone),
      conflicts:list(persisted.conflicts).map(clone),
      pairing_request_id:text(persisted.pairing_request_id),
      fingerprint:text(persisted.fingerprint),
      connected:false,
      last_sync_at:text(persisted.last_sync_at),
      last_error:text(persisted.last_error),
      auto_sync:false,
      auto_sync_interval_ms:Math.max(5000, Number(persisted.auto_sync_interval_ms || opts.auto_sync_interval_ms || 60000)),
      next_sync_at:'',
    };
    let token = text(opts.token);
    let autoSyncTimer = null;
    let syncInFlight = null;
    let persistSequence = 0;
    let persistTail = Promise.resolve({ ok:true });
    let lastPersist = persistTail;
    let durableState = null;
    function statePayload() {
      return {
        base_url:state.base_url,
        workspace_id:state.workspace_id,
        device_id:state.device_id,
        cursor:state.cursor,
        queue:state.queue.map(clone),
        conflicts:state.conflicts.map(clone),
        pairing_request_id:state.pairing_request_id,
        fingerprint:state.fingerprint,
        last_sync_at:state.last_sync_at,
        last_error:state.last_error,
        auto_sync_interval_ms:state.auto_sync_interval_ms,
      };
    }
    function restoreDurableState(snapshot) {
      const value = snapshot || {};
      state.base_url = text(value.base_url);
      state.workspace_id = text(value.workspace_id) || workspaceId;
      state.device_id = text(value.device_id) || deviceId;
      state.cursor = Number(value.cursor || 0);
      state.queue = list(value.queue).map(clone);
      state.conflicts = list(value.conflicts).map(clone);
      state.pairing_request_id = text(value.pairing_request_id);
      state.fingerprint = text(value.fingerprint);
      state.last_sync_at = text(value.last_sync_at);
      state.last_error = text(value.last_error);
      state.auto_sync_interval_ms = Math.max(5000, Number(value.auto_sync_interval_ms || opts.auto_sync_interval_ms || 60000));
      state.next_sync_at = '';
    }
    durableState = clone(statePayload());
    function persist() {
      const payload = clone(statePayload());
      const sequence = ++persistSequence;
      const run = persistTail.catch(() => {}).then(async () => {
        let result;
        try {
          result = await save(payload);
          if (result && result.ok === false) throw transportError('SYNC_STATE_PERSIST_FAILED', result.error || '同步状态未能保存');
        } catch (error) {
          const failure = error && error.code === 'SYNC_STATE_PERSIST_FAILED' ? error : transportError('SYNC_STATE_PERSIST_FAILED', error && error.message || '同步状态未能保存');
          failure.cause = error;
          if (sequence === persistSequence) {
            restoreDurableState(durableState);
            state.connected = false;
            state.last_error = failure.code;
          }
          throw failure;
        }
        durableState = clone(payload);
        return result || { ok:true };
      });
      persistTail = run.catch(() => {});
      lastPersist = run;
      // Callers that do not need to await this operation must still not create
      // an unhandled rejection. waitPersistence() exposes the same promise to
      // UI and integration callers that need a durable completion boundary.
      run.catch(() => {});
      return run;
    }
    async function waitPersistence() { return lastPersist; }
    function transportError(code, message) { const error = new Error(message || code); error.code = code; return error; }
    function normalizeBaseUrl(value) {
      const raw = text(value);
      if (!raw) throw transportError('SYNC_BASE_URL_REQUIRED', '请填写局域网主机 HTTPS 地址');
      let parsed;
      try { parsed = new URL(raw); } catch (_) { throw transportError('SYNC_BASE_URL_INVALID', '局域网主机地址格式无效'); }
      if (parsed.protocol !== 'https:') throw transportError('SYNC_HTTPS_REQUIRED', '局域网数据中枢必须使用 HTTPS');
      if (parsed.username || parsed.password || parsed.search || parsed.hash) throw transportError('SYNC_BASE_URL_INVALID', '主机地址不能包含账号、密码、查询参数或片段');
      return parsed.toString().replace(/\/+$/, '');
    }
    function endpoint(pathname) { return `${normalizeBaseUrl(state.base_url)}${pathname}`; }
    async function call(pathname, options) {
      if (!fetcher) throw transportError('SYNC_FETCH_UNAVAILABLE', '当前环境没有可用的网络请求能力');
      const request = Object.assign({ headers:{ 'content-type':'application/json' } }, options || {});
      request.headers = Object.assign({}, request.headers || {});
      if (token) request.headers.authorization = `Bearer ${token}`;
      const url = endpoint(pathname);
      let response;
      try { response = await fetcher(url, request); }
      catch (error) { throw transportError('SYNC_NETWORK_UNAVAILABLE', '无法连接局域网数据中枢，请确认主机和网络仍可访问'); }
      let body = {};
      try { body = await response.json(); } catch (_) { throw transportError('SYNC_RESPONSE_INVALID', '局域网数据中枢返回了无效响应'); }
      if (!response.ok || body.ok === false) throw transportError(text(body.code) || `SYNC_HTTP_${response.status}`, text(body.message) || '局域网同步请求失败');
      return body;
    }
    async function callBinary(pathname, options) {
      if (!fetcher) throw transportError('SYNC_FETCH_UNAVAILABLE', '当前环境没有可用的网络请求能力');
      const request = Object.assign({ headers:{} }, options || {});
      request.headers = Object.assign({}, request.headers || {});
      if (token) request.headers.authorization = `Bearer ${token}`;
      const url = endpoint(pathname);
      let response;
      try { response = await fetcher(url, request); }
      catch (_) { throw transportError('SYNC_NETWORK_UNAVAILABLE', '无法连接局域网数据中枢，请确认主机和网络仍可访问'); }
      if (!response.ok) {
        let body = {};
        try { body = await response.json(); } catch (_) {}
        throw transportError(text(body.code) || `SYNC_HTTP_${response.status}`, text(body.message) || '局域网同步请求失败');
      }
      let bytes;
      try { bytes = new Uint8Array(await response.arrayBuffer()); }
      catch (_) { throw transportError('SYNC_RESPONSE_INVALID', '局域网数据中枢返回了无效附件'); }
      if (bytes.byteLength > 50 * 1024 * 1024) throw transportError('SYNC_ATTACHMENT_TOO_LARGE', '下载附件超过 50MB 限制');
      return { bytes, mime_type:text(response.headers && (response.headers.get ? response.headers.get('content-type') : response.headers['content-type'])) || 'application/octet-stream', size:bytes.byteLength };
    }
    function patchOperation(collection, recordId, patch, baseRevision) {
      const value = sanitizeSyncPatch(collection, recordId, patch);
      return { workspace_id:state.workspace_id, device_id:state.device_id, operation_id:id('sync_op'), idempotency_key:secureToken('idem', 12), collection:text(collection), record_id:text(recordId), base_revision:Number(baseRevision || 0), patch:value, updated_at:now(), schema_version:SCHEMA_VERSION };
    }
    async function applyOperation(operation) {
      if (!recordStore || typeof recordStore.get !== 'function' || typeof recordStore.put !== 'function') return { applied:false, reason:'record_store_missing' };
      const current = clone(await recordStore.get(operation.collection, operation.record_id)) || { id:operation.record_id, student_id:operation.collection === 'students' ? operation.record_id : undefined };
      const next = Object.assign({}, current, sanitizeSyncPatch(operation.collection, operation.record_id, operation.patch), { id:operation.record_id, updated_at:operation.updated_at || now() });
      await recordStore.put(operation.collection, next);
      return { applied:true, record:next };
    }
    function recordFailure(error) {
      state.connected = false;
      state.last_error = text(error && (error.code || error.message)) || 'SYNC_REQUEST_FAILED';
      if (!error || error.code !== 'SYNC_STATE_PERSIST_FAILED') persist();
      return error;
    }
    function scheduleAutoSync() {
      if (autoSyncTimer) clearTimeout(autoSyncTimer);
      if (!state.auto_sync) return;
      const delay = Math.max(5000, Number(state.auto_sync_interval_ms || 60000));
      state.next_sync_at = new Date(Date.now() + delay).toISOString();
      autoSyncTimer = setTimeout(async () => {
        autoSyncTimer = null;
        try { await syncNow(); } catch (_) {}
        scheduleAutoSync();
      }, delay);
    }
    async function connect(input) {
      const value = input || {};
      if (value.base_url) state.base_url = normalizeBaseUrl(value.base_url);
      if (value.workspace_id) state.workspace_id = text(value.workspace_id);
      if (value.token) token = text(value.token);
      try {
        const manifest = await call('/api/v1/workspace/manifest', { method:'GET' });
        const expected = text(value.fingerprint || state.fingerprint);
        const received = text(manifest.fingerprint);
        if (!expected) throw transportError('SYNC_CERTIFICATE_FINGERPRINT_REQUIRED', '首次连接必须填写并核对主机证书指纹');
        if (!received || expected.toLowerCase() !== received.toLowerCase()) throw transportError('SYNC_CERTIFICATE_FINGERPRINT_MISMATCH', '主机证书指纹与已确认指纹不一致，已停止同步');
        if (received) state.fingerprint = received;
        state.connected = true; state.last_error = ''; await persist();
        return clone({ connected:true, workspace_id:manifest.workspace_id, data_schema_version:manifest.data_schema_version, collections:manifest.collections, fingerprint:received || state.fingerprint });
      } catch (error) { throw recordFailure(error); }
    }
    async function requestPairing(input) {
      const value = input || {};
      const previous = state.base_url;
      if (value.base_url) state.base_url = normalizeBaseUrl(value.base_url);
      try { const request = (await call('/api/v1/pairing/request', { method:'POST', body:JSON.stringify({ pairing_id:text(value.pairing_id), code:text(value.code), device_id:state.device_id, device_name:text(value.device_name) || '未命名设备' }) })).request; state.pairing_request_id = text(request && request.id); await persist(); return request; }
      finally { state.base_url = previous || state.base_url; }
    }
    async function pollPairing(input) {
      const value = input || {};
      const requestId = text(value.request_id || state.pairing_request_id);
      if (!requestId) throw transportError('SYNC_PAIRING_REQUEST_REQUIRED', '还没有待查询的配对请求');
      const device = text(value.device_id || state.device_id);
      const query = `?request_id=${encodeURIComponent(requestId)}&device_id=${encodeURIComponent(device)}`;
      const body = await call(`/api/v1/pairing/result${query}`, { method:'GET' });
      const result = body.result || body;
      if (result && result.token) { token = text(result.token); state.pairing_request_id = ''; state.last_error = ''; await persist(); }
      return clone(result);
    }
    function enqueue(collection, recordId, patch, baseRevision) { const operation = patchOperation(collection, recordId, patch, baseRevision); state.queue.push(operation); state.last_error = ''; persist(); return clone(operation); }
    async function pull() {
      try {
        const body = await call('/api/v1/sync/pull', { method:'POST', body:JSON.stringify({ cursor:state.cursor }) });
        const applied = []; const skipped = [];
        for (const operation of list(body.operations)) {
          try { applied.push(Object.assign({ operation:clone(operation) }, await applyOperation(operation))); }
          catch (error) { skipped.push({ operation:clone(operation), code:error.code || 'SYNC_RECORD_APPLY_FAILED' }); }
        }
        // Do not acknowledge a cursor when a record could not be written. The
        // failed operation must be retried after the repository becomes healthy;
        // silently advancing here would permanently lose a remote change.
        if (!skipped.length) state.cursor = Number(body.cursor || state.cursor);
        state.connected = true; state.last_sync_at = now(); state.last_error = skipped.length ? 'SYNC_RECORD_APPLY_FAILED' : '';
        await persist();
        return { cursor:state.cursor, operations:list(body.operations).map(clone), applied, skipped, retry_required:skipped.length > 0 };
      } catch (error) { throw recordFailure(error); }
    }
    async function flushQueue() {
      if (!state.queue.length) return { results:[], queued:0 };
      try {
        const body = await call('/api/v1/sync/push', { method:'POST', body:JSON.stringify({ operations:state.queue.map(clone) }) });
        const results = list(body.results); const completed = new Set(results.filter(item => ['accepted','duplicate','conflict'].includes(item.status)).map(item => text(item.idempotency_key || item.operation && item.operation.idempotency_key)));
        state.queue = state.queue.filter(item => !completed.has(text(item.idempotency_key)));
        results.filter(item => item.status === 'conflict' && item.conflict).forEach(item => {
          if (!state.conflicts.some(conflict => String(conflict.id) === String(item.conflict.id))) state.conflicts.push(clone(item.conflict));
        });
        const failed = results.find(item => !['accepted','duplicate','conflict'].includes(item.status));
        state.connected = true; state.last_sync_at = now(); state.last_error = failed ? text(failed.code || failed.status) || 'SYNC_PUSH_PARTIAL_FAILURE' : '';
        await persist(); return { results:results.map(clone), queued:state.queue.length, conflicts:state.conflicts.filter(item => item.status === 'open').length, retry_required:Boolean(failed) };
      } catch (error) { throw recordFailure(error); }
    }
    async function syncNow() {
      if (syncInFlight) return syncInFlight;
      syncInFlight = (async () => {
        try {
          const pushed = await flushQueue();
          const pulled = await pull();
          return { pushed, pulled, status:status() };
        } finally { syncInFlight = null; }
      })();
      return syncInFlight;
    }
    function startAutoSync(options) {
      const value = options || {};
      state.auto_sync = true;
      state.auto_sync_interval_ms = Math.max(5000, Number(value.interval_ms || value.intervalMs || 60000));
      persist(); scheduleAutoSync();
      return status();
    }
    function stopAutoSync() {
      if (autoSyncTimer) clearTimeout(autoSyncTimer);
      autoSyncTimer = null; state.auto_sync = false; state.next_sync_at = '';
      persist(); return status();
    }
    async function listConflicts() {
      const body = await call('/api/v1/sync/conflicts', { method:'GET' }); state.conflicts = list(body.conflicts).map(clone); await persist(); return state.conflicts.map(clone);
    }
    async function resolveConflict(conflictId, choice) {
      const body = await call('/api/v1/sync/conflicts/resolve', { method:'POST', body:JSON.stringify({ conflict_id:conflictId, choice:clone(choice || {}) }) });
      const next = body.conflict || body.result;
      state.conflicts = state.conflicts.map(item => String(item.id) === String(conflictId) ? clone(next) : item); await persist();
      try { await pull(); } catch (_) {}
      return clone(next);
    }
    function bytesFrom(value) {
      if (value == null) return new Uint8Array(0);
      if (value instanceof Uint8Array) return value;
      if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
      if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      throw transportError('SYNC_ATTACHMENT_BYTES_INVALID', '附件内容必须是 ArrayBuffer、Uint8Array 或 Blob');
    }
    async function readBytes(value) {
      if (value && typeof value.arrayBuffer === 'function') return new Uint8Array(await value.arrayBuffer());
      return bytesFrom(value);
    }
    async function sha256Bytes(value) {
      const bytes = await readBytes(value);
      if (root && root.crypto && root.crypto.subtle && typeof root.crypto.subtle.digest === 'function') {
        const digest = await root.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), item => item.toString(16).padStart(2, '0')).join('');
      }
      throw transportError('SYNC_ATTACHMENT_HASH_UNAVAILABLE', '当前环境没有可用的 SHA-256 能力');
    }
    async function uploadAttachment(input) {
      const value = input && typeof input === 'object' ? input : {};
      const bytes = await readBytes(value.bytes || value.blob || value.data);
      if (bytes.byteLength > 50 * 1024 * 1024) throw transportError('SYNC_ATTACHMENT_TOO_LARGE', '附件超过 50MB 限制');
      const digest = text(value.sha256) || await sha256Bytes(bytes);
      if (!/^[a-f0-9]{64}$/i.test(digest)) throw transportError('SYNC_ATTACHMENT_HASH_INVALID', '附件 SHA-256 无效');
      const initBody = await call('/api/v1/attachments/init', { method:'POST', body:JSON.stringify({ attachment_id:text(value.attachment_id || value.id), size:bytes.byteLength, sha256:digest.toLowerCase(), name:text(value.name).slice(0, 240), mime_type:text(value.mime_type || value.type).slice(0, 160) }) });
      const upload = initBody.upload || {};
      const uploadId = text(upload.upload_id); if (!uploadId) throw transportError('SYNC_UPLOAD_INVALID', '主机没有返回有效上传任务');
      const chunkSize = Math.max(16 * 1024, Math.min(1024 * 1024, Number(value.chunk_size || upload.chunk_size || 1024 * 1024)));
      let offset = Math.max(0, Number(upload.offset || 0));
      if (offset > bytes.byteLength) throw transportError('SYNC_ATTACHMENT_OFFSET_INVALID', '主机返回的断点偏移超过附件大小');
      while (offset < bytes.byteLength) {
        const end = Math.min(bytes.byteLength, offset + chunkSize);
        const chunk = bytes.slice(offset, end);
        const result = await call(`/api/v1/attachments/chunk?upload_id=${encodeURIComponent(uploadId)}&offset=${offset}`, { method:'PUT', headers:{ 'content-type':'application/octet-stream' }, body:chunk });
        const next = Number(result.upload && result.upload.offset);
        if (!Number.isSafeInteger(next) || next <= offset || next > bytes.byteLength) throw transportError('SYNC_ATTACHMENT_OFFSET_INVALID', '主机返回了无效的上传偏移');
        offset = next;
        if (typeof value.onProgress === 'function') value.onProgress({ uploaded:offset, total:bytes.byteLength, upload_id:uploadId });
      }
      const completed = await call('/api/v1/attachments/complete', { method:'POST', body:JSON.stringify({ upload_id:uploadId }) });
      return clone(completed.attachment || completed);
    }
    async function downloadAttachment(attachmentId, options) {
      const value = options || {};
      const result = await callBinary(`/api/v1/attachments/${encodeURIComponent(text(attachmentId))}`, { method:'GET', headers:{ accept:'application/octet-stream' } });
      return Object.assign(result, { attachment_id:text(attachmentId), name:text(value.name) });
    }
    function status() { return { connected:state.connected, base_url:state.base_url, workspace_id:state.workspace_id, device_id:state.device_id, pairing_request_id:state.pairing_request_id, cursor:state.cursor, queued:state.queue.length, conflicts:state.conflicts.filter(item => item.status === 'open').length, fingerprint:state.fingerprint, last_sync_at:state.last_sync_at, last_error:state.last_error, auto_sync:Boolean(state.auto_sync), auto_sync_interval_ms:Number(state.auto_sync_interval_ms || 0), next_sync_at:text(state.next_sync_at), syncing:Boolean(syncInFlight) }; }
    function snapshot() { return clone({ state:status(), queue:state.queue, conflicts:state.conflicts, has_token:Boolean(token) }); }
    return Object.freeze({ connect, requestPairing, pollPairing, enqueue, pull, flushQueue, syncNow, startAutoSync, stopAutoSync, listConflicts, resolveConflict, uploadAttachment, downloadAttachment, waitPersistence, status, snapshot, setToken(value) { token = text(value); return Boolean(token); } });
  }

  function createStudentFieldCatalog(options) {
    const opts = options || {};
    const state = { fields:list(opts.fields).map(clone), updated_at:now() };
    const types = new Set(['text', 'number', 'date', 'boolean', 'select', 'multiline']);
    function normalize(field) {
      const value = field && typeof field === 'object' ? field : {};
      const name = text(value.name || value.key);
      if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error('STUDENT_FIELD_NAME_INVALID');
      const type = types.has(text(value.type)) ? text(value.type) : 'text';
      const options = list(value.options).map(text).filter(Boolean).slice(0, 200);
      if (type === 'select' && !options.length) throw new Error('STUDENT_FIELD_OPTIONS_REQUIRED');
      return { name, label:text(value.label) || name, type, options, sensitive:Boolean(value.sensitive), importable:value.importable !== false, exportable:value.exportable !== false, required:Boolean(value.required), updated_at:now() };
    }
    function add(field) {
      const value = normalize(field);
      if (state.fields.some(item => item.name === value.name)) throw new Error('STUDENT_FIELD_DUPLICATE');
      state.fields.push(value); state.updated_at = now(); return clone(value);
    }
    function update(name, patch) {
      const index = state.fields.findIndex(item => item.name === text(name));
      if (index < 0) throw new Error('STUDENT_FIELD_NOT_FOUND');
      const value = normalize(Object.assign({}, state.fields[index], patch || {}, { name:state.fields[index].name }));
      state.fields[index] = value; state.updated_at = now(); return clone(value);
    }
    function remove(name) {
      const index = state.fields.findIndex(item => item.name === text(name));
      if (index < 0) return false;
      state.fields.splice(index, 1); state.updated_at = now(); return true;
    }
    function preview(headers, mapping) {
      const source = list(headers).map(text);
      const map = mapping && typeof mapping === 'object' ? mapping : {};
      return source.map(header => ({ header, field: text(map[header] || header), matched:Boolean(map[header] || state.fields.some(item => item.label === header || item.name === header)), sensitive:Boolean(state.fields.find(item => item.name === text(map[header] || header))?.sensitive) }));
    }
    function validate(record) {
      const errors = [];
      state.fields.forEach(field => {
        const value = record && record[field.name];
        if (field.required && (value == null || text(value) === '')) errors.push({ field:field.name, code:'required' });
        if (value == null || value === '') return;
        if (field.type === 'number' && !Number.isFinite(Number(value))) errors.push({ field:field.name, code:'number' });
        if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text(value))) errors.push({ field:field.name, code:'date' });
        if (field.type === 'boolean' && ![true, false, 'true', 'false', 0, 1, '0', '1'].includes(value)) errors.push({ field:field.name, code:'boolean' });
        if (field.type === 'select' && !field.options.includes(text(value))) errors.push({ field:field.name, code:'option', options:clone(field.options) });
      });
      return { valid:errors.length === 0, errors };
    }
    return Object.freeze({ list:() => state.fields.map(clone), add, update, remove, preview, validate, snapshot:() => ({ fields:state.fields.map(clone), updated_at:state.updated_at }) });
  }

  function createContentPushService(options) {
    const opts = options || {};
    const state = { pushes:list(opts.pushes).map(clone), reads:list(opts.reads).map(clone) };
    const audit = typeof opts.audit === 'function' ? opts.audit : () => {};
    function normalizeActor(input) {
      const value = typeof input === 'string' ? { id:input } : (input && typeof input === 'object' ? input : {});
      const idValue = text(value.id || value.actor_id || value.operator_id || (value.role === 'workspace_admin' ? 'local-admin' : 'local-teacher')) || 'local-teacher';
      const requestedRole = text(value.role || value.content_role);
      const role = CONTENT_ROLES.includes(requestedRole)
        ? requestedRole
        : idValue === 'local-admin' ? 'workspace_admin' : idValue === 'local-teacher' ? 'teacher' : text(opts.default_role) && CONTENT_ROLES.includes(text(opts.default_role)) ? text(opts.default_role) : 'teacher';
      return { id:idValue, role, name:text(value.name || value.display_name) || idValue };
    }
    const defaultActor = normalizeActor(opts.actor || opts.operator || { id:'local-admin', role:'workspace_admin' });
    function actor(value) { return normalizeActor(value == null ? defaultActor : value); }
    function auditEvent(action, value, actorValue) {
      try {
        const current = actor(actorValue);
        const result = audit(action, Object.assign({ schema_version:SCHEMA_VERSION, actor_id:current.id, actor_role:current.role }, value || {}));
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (_) {}
    }
    function permissionError(action, current) {
      const error = new Error('CONTENT_PERMISSION_DENIED');
      error.code = 'CONTENT_PERMISSION_DENIED'; error.action = action; error.role = current.role;
      throw error;
    }
    function can(action, actorInput, push) {
      const current = actor(actorInput);
      const permissions = CONTENT_ROLE_PERMISSIONS[current.role] || [];
      if (action === 'retract' && permissions.includes('retract_own')) return Boolean(push && text(push.author_id) === current.id);
      return permissions.includes(action);
    }
    function requirePermission(action, actorInput, push) {
      const current = actor(actorInput); if (!can(action, current, push)) permissionError(action, current); return current;
    }
    function normalizeAudienceRoles(value) {
      return [...new Set(list(Array.isArray(value) ? value : text(value).split(/[,，\s]+/)).map(text).filter(item => CONTENT_ROLES.includes(item)))];
    }
    function scopeMatches(push, context) {
      const scope = push.scope && typeof push.scope === 'object' ? push.scope : {};
      const value = context || {};
      return ['workspace_id', 'college', 'grade', 'class_name'].every(field => !scope[field] || text(scope[field]) === text(value[field]));
    }
    function roleMatches(push, current) {
      const roles = normalizeAudienceRoles(push && (push.audience_roles || push.roles || push.scope && push.scope.roles));
      if (current.role === 'workspace_admin' || current.role === 'content_editor') return true;
      return !roles.length || roles.includes(current.role);
    }
    function publish(input, actorInput) {
      const current = requirePermission('publish', actorInput);
      const value = input && typeof input === 'object' ? input : {};
      if (!text(value.title) || !text(value.body)) throw new Error('CONTENT_PUSH_REQUIRED');
      const scope = clone(value.scope || {}); if (scope && typeof scope === 'object') delete scope.roles;
      const push = Object.assign({}, clone(value), { id:text(value.id) || id('push'), title:text(value.title), body:String(value.body), scope, audience_roles:normalizeAudienceRoles(value.audience_roles || value.roles || value.scope && value.scope.roles), status:'published', published_at:text(value.published_at) || now(), version:Number(value.version || 1), author_id:current.id, author_role:current.role, published_by:current.id, published_by_role:current.role, updated_at:now() });
      state.pushes.push(push); auditEvent('content_push_published', { push_id:push.id, scope:clone(push.scope), audience_roles:clone(push.audience_roles) }, current); return clone(push);
    }
    function listVisible(context, at, actorInput) {
      const current = requirePermission('read', actorInput);
      const timestamp = new Date(at || now()).getTime();
      return state.pushes.filter(push => push.status === 'published' && scopeMatches(push, context) && roleMatches(push, current) && (!push.available_from || new Date(push.available_from).getTime() <= timestamp) && (!push.retract_at || new Date(push.retract_at).getTime() > timestamp)).sort((a, b) => String(b.published_at).localeCompare(String(a.published_at))).map(clone);
    }
    function listAll(actorInput, context, at) {
      const current = actor(actorInput);
      if (!can('export', current) && !can('export_visible', current)) permissionError('list_all', current);
      const all = state.pushes.map(clone).sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')));
      return can('export', current) ? all : listVisible(context || {}, at, current);
    }
    function markRead(pushId, readerId, actorInput, context) {
      const current = requirePermission('read', actorInput == null ? readerId : actorInput);
      const idValue = text(pushId); const reader = text(readerId) || current.id;
      if (!idValue || !reader) throw new Error('CONTENT_READ_ID_REQUIRED');
      if (reader !== current.id) permissionError('read', current);
      const push = state.pushes.find(item => item.id === idValue);
      if (!push) throw new Error('CONTENT_PUSH_NOT_FOUND');
      const timestamp = Date.now();
      const available = !push.available_from || new Date(push.available_from).getTime() <= timestamp;
      const active = !push.retract_at || new Date(push.retract_at).getTime() > timestamp;
      if (push.status !== 'published' || !available || !active || !roleMatches(push, current) || (context !== undefined && !scopeMatches(push, context || {}))) permissionError('read', current);
      const existing = state.reads.find(item => item.push_id === idValue && item.reader_id === reader);
      if (existing) return clone(existing);
      const row = { id:id('read'), push_id:idValue, reader_id:reader, reader_role:current.role, read_at:now() }; state.reads.push(row); auditEvent('content_push_read', { push_id:idValue }, current); return clone(row);
    }
    function retract(pushId, operator) {
      const current = actor(operator);
      const push = state.pushes.find(item => item.id === text(pushId));
      if (!push) throw new Error('CONTENT_PUSH_NOT_FOUND');
      requirePermission('retract', current, push);
      push.status = 'retracted'; push.retracted_by = current.id; push.retracted_by_role = current.role; push.retracted_at = now(); push.updated_at = now(); auditEvent('content_push_retracted', { push_id:push.id, scope:clone(push.scope) }, current); return clone(push);
    }
    function exportPackage(context, options) {
      const value = options || {}; const current = requirePermission('export_visible', value.actor || context && context.actor);
      const visibleContext = context && typeof context === 'object' && !context.actor ? context : null;
      const pushes = can('export', current)
        ? listAll(current, visibleContext || {}, value.at)
        : listVisible(visibleContext || {}, value.at, current);
      const ids = new Set(pushes.map(item => text(item.id)).filter(Boolean));
      const result = {
        format:'cwb-content-package', version:1, exported_at:now(), scope:clone(visibleContext || {}),
        pushes,
        reads:state.reads.filter(item => ids.has(text(item.push_id)) && (can('export', current) || text(item.reader_id) === current.id)).map(clone),
      };
      auditEvent('content_package_exported', { push_count:pushes.length, read_count:result.reads.length, visible_only:!can('export', current) }, current); return result;
    }
    function importPackage(input, options) {
      const opts = options || {};
      const current = requirePermission('import', opts.actor);
      let value = input;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch (_) { throw new Error('CONTENT_PACKAGE_INVALID_JSON'); }
      }
      if (!value || typeof value !== 'object' || value.format !== 'cwb-content-package' || Number(value.version) !== 1 || !Array.isArray(value.pushes)) throw new Error('CONTENT_PACKAGE_INVALID');
      const conflicts = []; const added = []; const updated = [];
      value.pushes.forEach(item => {
        const incoming = clone(item || {}); const key = text(incoming.id);
        if (!key || !text(incoming.title) || !text(incoming.body)) { conflicts.push({ id:key, reason:'missing_required_fields' }); return; }
        const currentIndex = state.pushes.findIndex(row => text(row.id) === key);
        if (currentIndex < 0) { state.pushes.push(incoming); added.push(key); return; }
        const current = state.pushes[currentIndex];
        const incomingTime = new Date(incoming.updated_at || incoming.published_at || 0).getTime();
        const currentTime = new Date(current.updated_at || current.published_at || 0).getTime();
        if (opts.replace === true || incomingTime > currentTime) { state.pushes[currentIndex] = incoming; updated.push(key); }
        else if (JSON.stringify(current) !== JSON.stringify(incoming)) conflicts.push({ id:key, reason:'existing_record_newer_or_different', existing:clone(current), incoming });
      });
      list(value.reads).forEach(item => {
        const row = clone(item || {}); const key = text(row.id);
        if (!key || !text(row.push_id) || !text(row.reader_id)) return;
        if (!state.reads.some(existing => text(existing.id) === key || text(existing.push_id) === text(row.push_id) && text(existing.reader_id) === text(row.reader_id))) state.reads.push(row);
      });
      const result = { added, updated, conflicts, imported_reads:list(value.reads).length, pushes:listAll(current, opts.context || {}) };
      auditEvent('content_package_imported', { added:added.length, updated:updated.length, conflicts:conflicts.length }, current); return result;
    }
    return Object.freeze({ publish, list:listVisible, listAll, markRead, retract, exportPackage, importPackage, can:(action, actorInput, push) => can(action, actorInput, push), roles:CONTENT_ROLES, roleLabels:CONTENT_ROLE_LABELS, pushes:() => state.pushes.map(clone), reads:() => state.reads.map(clone) });
  }

  const DEFAULT_WORK_CATEGORIES = Object.freeze([
    { key:'community', label:'社区管理', source:'system', enabled:true },
    { key:'labor_hygiene', label:'劳动卫生', source:'system', enabled:true },
  ]);
  function normalizeWorkCategory(input) {
    const value = input && typeof input === 'object' ? input : {};
    const key = text(value.key || value.id || value.name).toLowerCase();
    const label = text(value.label || value.name);
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) throw new Error('WORK_CATEGORY_KEY_INVALID');
    if (!label || label.length > 80) throw new Error('WORK_CATEGORY_LABEL_INVALID');
    return { id:text(value.id) || `work_category_${key}`, key, label, source:text(value.source) || 'school', enabled:value.enabled !== false, updated_at:text(value.updated_at) || now() };
  }
  function createWorkCategoryCatalog(options) {
    const opts = options || {};
    const custom = list(opts.categories).map(item => normalizeWorkCategory(item));
    const state = new Map(DEFAULT_WORK_CATEGORIES.map(item => [item.key, Object.assign({ id:`work_category_${item.key}` }, clone(item))]));
    custom.forEach(item => { if (!state.has(item.key) || item.source !== 'system') state.set(item.key, item); });
    function listCategories(includeDisabled) { return [...state.values()].filter(item => includeDisabled || item.enabled !== false).map(clone).sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')); }
    function add(input) { const item = normalizeWorkCategory(Object.assign({}, input, { source:'school' })); if (state.has(item.key)) throw new Error('WORK_CATEGORY_DUPLICATE'); state.set(item.key, item); return clone(item); }
    function update(key, patch) { const current = state.get(text(key)); if (!current) throw new Error('WORK_CATEGORY_NOT_FOUND'); if (current.source === 'system' && text(patch && patch.key) && text(patch.key) !== current.key) throw new Error('WORK_CATEGORY_SYSTEM_KEY_IMMUTABLE'); const next = normalizeWorkCategory(Object.assign({}, current, patch || {}, { key:current.key, source:current.source })); state.set(current.key, next); return clone(next); }
    function remove(key) { const current = state.get(text(key)); if (!current) return false; if (current.source === 'system') throw new Error('WORK_CATEGORY_SYSTEM_PROTECTED'); state.delete(current.key); return true; }
    return Object.freeze({ list:listCategories, add, update, remove, normalize:normalizeWorkCategory });
  }

  function classHistorySort(a, b) {
    const date = text(a && a.effective_date).localeCompare(text(b && b.effective_date));
    if (date) return date;
    const created = text(a && (a.created_at || a.updated_at)).localeCompare(text(b && (b.created_at || b.updated_at)));
    if (created) return created;
    return text(a && a.id).localeCompare(text(b && b.id));
  }
  function classHistoryFrom(item) { return text(item && (item.from_class_name || item.previous_class_name)); }
  function classHistoryTo(item) { return text(item && (item.to_class_name || item.class_name)); }
  function classHistoryRowsForStudent(student, history) {
    const studentId = text(student && (student.id || student.student_id));
    return list(history).filter(item => text(item && item.student_id) === studentId && text(item.effective_date)).slice().sort(classHistorySort);
  }
  function activeClassAtDate(student, history, date) {
    const rows = classHistoryRowsForStudent(student, history);
    const target = text(date) || now().slice(0, 10);
    const effective = rows.filter(item => text(item.effective_date) <= target);
    if (effective.length) return classHistoryTo(effective[effective.length - 1]) || text(student && student.class_name);
    // A current student snapshot is not a valid answer for a date before the
    // first recorded transition. The first transition carries the best known
    // predecessor and keeps historical walk lists from showing today's class.
    return classHistoryFrom(rows[0]) || text(student && student.class_name);
  }
  function classHistoryIntegrity(options) {
    const opts = options || {};
    const students = list(opts.students);
    const history = list(opts.class_history);
    const issues = [];
    const byStudent = new Map();
    history.forEach(item => {
      const studentId = text(item && item.student_id);
      if (!studentId || !text(item && item.effective_date)) return;
      const rows = byStudent.get(studentId) || [];
      rows.push(item); byStudent.set(studentId, rows);
    });
    byStudent.forEach((rows, studentId) => {
      rows.sort(classHistorySort);
      let previousTo = '';
      rows.forEach((item, index) => {
        const from = classHistoryFrom(item); const to = classHistoryTo(item);
        if (index > 0 && previousTo && from && previousTo !== from) issues.push({
          id:text(item.id), student_id:studentId, effective_date:text(item.effective_date),
          expected_class:previousTo, actual_class:from, type:'chain_break', status:'needs_review',
        });
        if (from && to && from === to) issues.push({ id:text(item.id), student_id:studentId, effective_date:text(item.effective_date), type:'no_op', status:'needs_review' });
        previousTo = to || previousTo;
      });
    });
    return { checked_students:students.length, checked_records:history.length, issues, ok:issues.length === 0 };
  }
  function activeDormAtDate(student, assignments, date) {
    const studentId = text(student && (student.id || student.student_id));
    return list(assignments).filter(item => text(item && item.student_id) === studentId && !['checked_out', 'cancelled'].includes(text(item.status)) && text(item.check_in_date || '') <= text(date) && (!text(item.check_out_date) || text(item.check_out_date) >= text(date))).sort((a, b) => text(b.check_in_date).localeCompare(text(a.check_in_date)))[0] || null;
  }
  function jointVisitCandidates(options) {
    const opts = options || {}; const date = text(opts.date) || now().slice(0, 10); const className = text(opts.class_name);
    const schedules = list(opts.schedules); const weekday = new Date(`${date}T00:00:00`).getDay() || 7; const classRows = list(opts.students).map(student => {
      const studentId = text(student && (student.id || student.student_id)); const currentClass = activeClassAtDate(student, opts.class_history, date); const dorm = activeDormAtDate(student, opts.dorm_assignments, date);
      if (className && currentClass !== className) return null;
      const lessons = schedules.filter(item => text(item.class_name) === currentClass && Number(item.weekday) === weekday).sort((a, b) => Number(a.start_section || 0) - Number(b.start_section || 0));
      const occupied = new Set(); lessons.forEach(item => { for (let section = Number(item.start_section || 0); section <= Number(item.end_section || item.start_section || 0); section += 1) if (section > 0) occupied.add(section); });
      const freeSections = lessons.length ? Array.from({ length:12 }, (_, index) => index + 1).filter(section => !occupied.has(section)) : null;
      return { student_id:studentId, student_number:text(student && student.student_number), student_name:text(student && student.full_name), class_name:currentClass, dorm_assignment:clone(dorm), lessons:lessons.map(clone), schedule_recorded:lessons.length > 0, free_sections:freeSections };
    }).filter(Boolean);
    return { date, weekday, class_name:className, rows:classRows, schedule_recorded:classRows.some(item => item.schedule_recorded), generated_at:now() };
  }

  // QR codes carry only short-lived connection data. Tokens, keys, records and
  // attachment identifiers are deliberately not accepted by this contract.
  function normalizePairingQrFields(input) {
    const value = input && typeof input === 'object' ? input : {};
    const rawHost = text(value.host || value.base_url);
    let host;
    try {
      const parsed = new URL(rawHost);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) throw new Error('invalid host');
      host = parsed.toString().replace(/\/$/, '');
    } catch (_) {
      const error = new Error('SYNC_PAIRING_QR_HOST_INVALID'); error.code = 'SYNC_PAIRING_QR_HOST_INVALID'; throw error;
    }
    const workspaceId = text(value.workspace_id);
    const pairingId = text(value.pairing_id);
    const code = text(value.code);
    const fingerprint = text(value.fingerprint).toLowerCase();
    const expiresAt = text(value.expires_at);
    if (!workspaceId || workspaceId.length > 160 || /[\x00-\x1f\x7f]/.test(workspaceId)) throw new Error('SYNC_PAIRING_QR_WORKSPACE_INVALID');
    if (!pairingId || pairingId.length > 160 || /[\x00-\x1f\x7f]/.test(pairingId)) throw new Error('SYNC_PAIRING_QR_ID_INVALID');
    if (!/^\d{8}$/.test(code)) throw new Error('SYNC_PAIRING_QR_CODE_INVALID');
    if (!/^[a-f0-9]{2}(?::[a-f0-9]{2}){3,63}$/.test(fingerprint)) throw new Error('SYNC_PAIRING_QR_FINGERPRINT_INVALID');
    if (!expiresAt || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new Error('SYNC_PAIRING_QR_EXPIRED');
    return { version:1, host, workspace_id:workspaceId, pairing_id:pairingId, code, fingerprint, expires_at:expiresAt };
  }
  function createPairingQrPayload(input) {
    const fields = normalizePairingQrFields(input);
    const query = new URL('cwb://lan-pair');
    query.searchParams.set('v', String(fields.version));
    query.searchParams.set('host', fields.host);
    query.searchParams.set('workspace_id', fields.workspace_id);
    query.searchParams.set('pairing_id', fields.pairing_id);
    query.searchParams.set('code', fields.code);
    query.searchParams.set('fingerprint', fields.fingerprint);
    query.searchParams.set('expires_at', fields.expires_at);
    return Object.freeze({ version:1, payload:query.toString(), fields:Object.freeze(clone(fields)) });
  }
  function parsePairingQrPayload(payload) {
    let parsed;
    try { parsed = new URL(text(payload)); } catch (_) { throw new Error('SYNC_PAIRING_QR_FORMAT_INVALID'); }
    if (parsed.protocol !== 'cwb:' || parsed.hostname !== 'lan-pair' || (parsed.pathname && parsed.pathname !== '/') || parsed.username || parsed.password || parsed.hash) throw new Error('SYNC_PAIRING_QR_FORMAT_INVALID');
    const allowed = new Set(['v', 'host', 'workspace_id', 'pairing_id', 'code', 'fingerprint', 'expires_at']);
    for (const key of parsed.searchParams.keys()) if (!allowed.has(key) || parsed.searchParams.getAll(key).length !== 1) throw new Error('SYNC_PAIRING_QR_FIELD_INVALID');
    if (parsed.searchParams.get('v') !== '1') throw new Error('SYNC_PAIRING_QR_VERSION_UNSUPPORTED');
    return normalizePairingQrFields({
      host:parsed.searchParams.get('host'),
      workspace_id:parsed.searchParams.get('workspace_id'),
      pairing_id:parsed.searchParams.get('pairing_id'),
      code:parsed.searchParams.get('code'),
      fingerprint:parsed.searchParams.get('fingerprint'),
      expires_at:parsed.searchParams.get('expires_at'),
    });
  }

  function createSyncHost(options) {
    const opts = options || {};
    const workspaceId = text(opts.workspace_id) || 'workspace-local';
    const ttl = Math.max(30, Number(opts.pairing_ttl_seconds || 300));
    const hashToken = typeof opts.hashToken === 'function' ? opts.hashToken : value => text(value);
    const allowed = opts.allowedCollections ? new Set(list(opts.allowedCollections).map(text)) : null;
    const initial = opts.initialState && typeof opts.initialState === 'object' ? opts.initialState : {};
    const recordStore = opts.recordStore && typeof opts.recordStore === 'object' ? opts.recordStore : null;
    const audit = typeof opts.audit === 'function' ? opts.audit : () => {};
    let auditQueue = null;
    function dispatchAudit(action, details) {
      try {
        const result = audit(action, details);
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (_) {}
    }
    function auditEvent(action, details) {
      const event = { action, details:clone(Object.assign({ schema_version:SCHEMA_VERSION }, details || {})) };
      if (auditQueue) { auditQueue.push(event); return; }
      dispatchAudit(event.action, event.details);
    }
    const state = { pairings:new Map(list(initial.pairings).map(item => [text(item.id), clone(item)])), requests:new Map(list(initial.requests).map(item => [text(item.id), clone(item)])), devices:new Map(list(initial.devices).map(item => [text(item.id), clone(item)])), operations:list(initial.operations).map(clone), operationKeys:new Set(list(initial.operationKeys).map(text)), revisions:new Map(list(initial.revisions).map(item => [text(item[0]), Number(item[1] || 0)])), fieldRevisions:new Map(list(initial.fieldRevisions).map(item => [text(item[0]), clone(item[1])])), conflicts:list(initial.conflicts).map(clone), uploads:new Map(list(initial.uploads).map(item => [text(item.id), clone(item)])) };
    // The raw device token is delivered only once after host confirmation. It
    // intentionally lives outside the persisted snapshot and is never exposed
    // through health/status responses.
    const pairingTokens = new Map();
    function publicDevice(device) {
      const value = device || {};
      return { id:text(value.id), name:text(value.name), status:text(value.status), paired_at:text(value.paired_at), last_seen_at:text(value.last_seen_at), paused_at:text(value.paused_at), resumed_at:text(value.resumed_at), revoked_at:text(value.revoked_at) };
    }
    function publicRequest(request) {
      const value = request || {};
      return { id:text(value.id), pairing_id:text(value.pairing_id), device_id:text(value.device_id), device_name:text(value.device_name), requested_at:text(value.requested_at), status:text(value.status), confirmed_at:text(value.confirmed_at) };
    }
    const persist = typeof opts.persist === 'function' ? opts.persist : null;
    const snapshot = () => ({ pairings:[...state.pairings.values()].map(clone), requests:[...state.requests.values()].map(clone), devices:[...state.devices.values()].map(clone), operations:state.operations.map(clone), operationKeys:[...state.operationKeys], revisions:[...state.revisions.entries()], fieldRevisions:[...state.fieldRevisions.entries()].map(item => [item[0], clone(item[1])]), conflicts:state.conflicts.map(clone), uploads:[...state.uploads.values()].map(clone) });
    function restoreSnapshot(value) {
      const source = value || {};
      state.pairings.clear(); list(source.pairings).forEach(item => state.pairings.set(text(item.id), clone(item)));
      state.requests.clear(); list(source.requests).forEach(item => state.requests.set(text(item.id), clone(item)));
      state.devices.clear(); list(source.devices).forEach(item => state.devices.set(text(item.id), clone(item)));
      state.operations = list(source.operations).map(clone);
      state.operationKeys = new Set(list(source.operationKeys).map(text));
      state.revisions.clear(); list(source.revisions).forEach(item => state.revisions.set(text(item[0]), Number(item[1] || 0)));
      state.fieldRevisions.clear(); list(source.fieldRevisions).forEach(item => state.fieldRevisions.set(text(item[0]), clone(item[1])));
      state.conflicts = list(source.conflicts).map(clone);
      state.uploads.clear(); list(source.uploads).forEach(item => state.uploads.set(text(item.id), clone(item)));
    }
    const commit = () => { if (persist) persist(snapshot()); };
    function rememberRecord(changes, collection, recordId) {
      if (!recordStore || typeof recordStore.get !== 'function') return;
      const key = `${collection}:${recordId}`;
      if (changes.some(item => item.key === key)) return;
      changes.push({ key, collection, recordId, before:clone(readRecord(collection, recordId)) });
    }
    function rollbackRecords(changes) {
      if (!recordStore || !changes.length) return;
      for (let index = changes.length - 1; index >= 0; index -= 1) {
        const change = changes[index];
        if (change.before == null) {
          if (typeof recordStore.delete === 'function') recordStore.delete(change.collection, change.recordId);
          continue;
        }
        if (typeof recordStore.put === 'function') recordStore.put(change.collection, clone(change.before));
      }
    }
    function transaction(mutator) {
      const before = snapshot();
      const changes = [];
      const previousAuditQueue = auditQueue;
      const pendingAudits = [];
      auditQueue = pendingAudits;
      try {
        const result = mutator(changes);
        commit();
        auditQueue = previousAuditQueue;
        pendingAudits.forEach(event => dispatchAudit(event.action, event.details));
        return result;
      } catch (error) {
        auditQueue = previousAuditQueue;
        restoreSnapshot(before);
        try { rollbackRecords(changes); }
        catch (rollbackError) {
          error.rollback_code = rollbackError.code || 'SYNC_RECORD_ROLLBACK_FAILED';
          error.rollback_cause = rollbackError;
        }
        throw error;
      }
    }
    function ensureCollection(collection) { const value = text(collection); if (!value || (allowed && !allowed.has(value))) throw new Error('SYNC_COLLECTION_NOT_ALLOWED'); return value; }
    function createPairingCode() {
      const code = secureDigits(8);
      const pairingId = secureToken('pairing', 12);
      const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
      return transaction(() => {
        state.pairings.set(pairingId, { id:pairingId, code_hash:hashToken(code), expires_at:expiresAt, used:false, attempts:0, last_attempt_at:'' });
        auditEvent('sync_pairing_code_created', { pairing_id:pairingId, expires_at:expiresAt });
        return { pairing_id:pairingId, code, expires_at:expiresAt };
      });
    }
    function requestPairing(input) {
      const value = input || {}; const pairing = state.pairings.get(text(value.pairing_id));
      if (!pairing || pairing.used || new Date(pairing.expires_at).getTime() <= Date.now()) throw new Error('SYNC_PAIRING_INVALID');
      if (Number(pairing.attempts || 0) >= 5) throw new Error('SYNC_PAIRING_RATE_LIMITED');
      const result = transaction(() => {
        if (!constantTokenEqual(hashToken(value.code), pairing.code_hash)) {
          pairing.attempts = Number(pairing.attempts || 0) + 1;
          pairing.last_attempt_at = now();
          return { error_code:pairing.attempts >= 5 ? 'SYNC_PAIRING_RATE_LIMITED' : 'SYNC_PAIRING_INVALID' };
        }
        const request = { id:secureToken('pair_request', 12), pairing_id:pairing.id, device_id:text(value.device_id), device_name:text(value.device_name) || '未命名设备', requested_at:now(), status:'pending' };
        if (!request.device_id) throw new Error('SYNC_DEVICE_ID_REQUIRED');
        state.requests.set(request.id, request); auditEvent('sync_pairing_requested', { request_id:request.id, device_id:request.device_id, device_name:request.device_name }); return clone(request);
      });
      if (result && result.error_code) { const error = new Error(result.error_code); error.code = result.error_code; throw error; }
      return result;
    }
    function confirmPairing(requestId, approve) {
      const request = state.requests.get(text(requestId));
      if (!request || request.status !== 'pending') throw new Error('SYNC_PAIRING_REQUEST_NOT_FOUND');
      const pairing = state.pairings.get(request.pairing_id);
      const result = transaction(() => {
        if (!approve) { request.status = 'rejected'; auditEvent('sync_pairing_rejected', { request_id:request.id, device_id:request.device_id }); return { request:publicRequest(request), rejected:true }; }
        if (!pairing || new Date(pairing.expires_at).getTime() <= Date.now()) throw new Error('SYNC_PAIRING_EXPIRED');
        const token = secureToken('device_token', 24);
        const device = { id:request.device_id, name:request.device_name, token_hash:hashToken(token), status:'active', paired_at:now(), last_seen_at:now() };
        state.devices.set(device.id, device); pairing.used = true; request.status = 'confirmed'; request.confirmed_at = now();
        auditEvent('sync_pairing_confirmed', { request_id:request.id, device_id:request.device_id, device_name:device.name });
        return { request:publicRequest(request), device:publicDevice(device), token };
      });
      if (result && result.token) pairingTokens.set(text(requestId), { token:result.token, device_id:text(request.device_id), expires_at:new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      return result && result.token ? { request:result.request, device:Object.assign({}, result.device, { token:result.token }) } : result.request;
    }
    function getPairingResult(requestId, deviceId) {
      const request = state.requests.get(text(requestId));
      if (!request || !text(deviceId) || text(deviceId) !== text(request.device_id)) throw new Error('SYNC_PAIRING_REQUEST_NOT_FOUND');
      if (request.status === 'pending') return { status:'pending', request:publicRequest(request) };
      if (request.status === 'rejected') return { status:'rejected', request:publicRequest(request) };
      const delivery = pairingTokens.get(text(requestId));
      if (!delivery) return { status:'confirmed', token_available:false, request:publicRequest(request), device:publicDevice(state.devices.get(request.device_id)) };
      if (new Date(delivery.expires_at).getTime() <= Date.now()) { pairingTokens.delete(text(requestId)); throw new Error('SYNC_PAIRING_TOKEN_EXPIRED'); }
      pairingTokens.delete(text(requestId));
      return { status:'confirmed', token_available:true, token:delivery.token, request:publicRequest(request), device:publicDevice(state.devices.get(request.device_id)) };
    }
    function deviceFor(token, touch) {
      const tokenHash = hashToken(token);
      const device = [...state.devices.values()].find(item => item.status !== 'revoked' && item.token_hash === tokenHash);
      if (!device) throw new Error('SYNC_DEVICE_UNAUTHORIZED');
      if (device.status === 'paused') { const error = new Error('SYNC_DEVICE_PAUSED'); error.code = 'SYNC_DEVICE_PAUSED'; throw error; }
      if (touch !== false) device.last_seen_at = now();
      return device;
    }
    function revokeDevice(deviceId) {
      const device = state.devices.get(text(deviceId)); if (!device) return false;
      return transaction(() => { device.status = 'revoked'; device.revoked_at = now(); [...pairingTokens.entries()].forEach(([requestId, value]) => { if (value.device_id === device.id) pairingTokens.delete(requestId); }); auditEvent('sync_device_revoked', { device_id:device.id }); return true; });
    }
    function pauseDevice(deviceId) {
      const device = state.devices.get(text(deviceId)); if (!device) return false;
      if (device.status === 'revoked') { const error = new Error('SYNC_DEVICE_REVOKED'); error.code = 'SYNC_DEVICE_REVOKED'; throw error; }
      return transaction(() => { device.status = 'paused'; device.paused_at = now(); auditEvent('sync_device_paused', { device_id:device.id }); return true; });
    }
    function resumeDevice(deviceId) {
      const device = state.devices.get(text(deviceId)); if (!device) return false;
      if (device.status === 'revoked') { const error = new Error('SYNC_DEVICE_REVOKED'); error.code = 'SYNC_DEVICE_REVOKED'; throw error; }
      return transaction(() => { device.status = 'active'; device.resumed_at = now(); auditEvent('sync_device_resumed', { device_id:device.id }); return true; });
    }
    function readRecord(collection, recordId) {
      if (!recordStore || typeof recordStore.get !== 'function') return null;
      try { return clone(recordStore.get(collection, recordId)); } catch (error) { const failure = new Error('SYNC_RECORD_READ_FAILED'); failure.code = 'SYNC_RECORD_READ_FAILED'; failure.cause = error; throw failure; }
    }
    function writeRecord(collection, recordId, patch) {
      if (!recordStore || typeof recordStore.put !== 'function') return null;
      const current = readRecord(collection, recordId) || { id:recordId };
      const next = Object.assign({}, current, clone(patch || {}), { id:recordId, updated_at:now() });
      delete next.record_id; delete next.collection;
      try { return clone(recordStore.put(collection, next)); } catch (error) { const failure = new Error('SYNC_RECORD_APPLY_FAILED'); failure.code = 'SYNC_RECORD_APPLY_FAILED'; failure.cause = error; throw failure; }
    }
    function appendRevisionOperation(collection, recordId, patch, baseRevision) {
      const recordKey = `${collection}:${recordId}`;
      const revision = Number(state.revisions.get(recordKey) || 0) + 1;
      const operation = { workspace_id:workspaceId, device_id:'host-conflict-resolver', operation_id:secureToken('sync_op', 12), idempotency_key:secureToken('resolution', 12), collection, record_id:recordId, base_revision:Number(baseRevision || 0), patch:clone(patch || {}), updated_at:now(), schema_version:SCHEMA_VERSION, revision, accepted_at:now(), resolution:true };
      state.operations.push(operation); state.operationKeys.add(operation.idempotency_key); state.revisions.set(recordKey, revision);
      Object.keys(patch || {}).forEach(field => state.fieldRevisions.set(`${recordKey}:${field}`, { revision, device_id:'host-conflict-resolver' }));
      return operation;
    }
    function push(token, operations) {
      const device = deviceFor(token, false); const results = [];
      return transaction(changes => {
        device.last_seen_at = now();
        list(operations).forEach(input => {
        const operation = clone(input || {}); const key = text(operation.idempotency_key);
        if (!key || state.operationKeys.has(key)) { results.push({ status:'duplicate', idempotency_key:key }); return; }
        if (text(operation.device_id) !== device.id || text(operation.workspace_id) !== workspaceId) throw new Error('SYNC_OPERATION_SCOPE_INVALID');
        const collection = ensureCollection(operation.collection); const recordId = text(operation.record_id); if (!recordId) throw new Error('SYNC_RECORD_ID_REQUIRED');
        const recordKey = `${collection}:${recordId}`; const revision = Number(state.revisions.get(recordKey) || 0); const base = Number(operation.base_revision || 0);
        const patch = sanitizeSyncPatch(collection, recordId, operation.patch);
        const currentRecord = readRecord(collection, recordId);
        const conflicts = Object.keys(patch).filter(field => { const fieldRevision = state.fieldRevisions.get(`${recordKey}:${field}`); return base < revision && fieldRevision && fieldRevision.revision > base; });
        if (conflicts.length) {
          const conflict = { id:secureToken('conflict', 12), workspace_id:workspaceId, collection, record_id:recordId, device_id:device.id, base_revision:base, current_revision:revision, fields:conflicts.map(field => ({ field, local:clone(currentRecord && currentRecord[field]), incoming:clone(patch[field]) })), incoming_patch:clone(patch), local_record:clone(currentRecord || {}), status:'open', created_at:now() };
          state.conflicts.push(conflict); state.operationKeys.add(key); auditEvent('sync_conflict_opened', { conflict_id:conflict.id, collection, record_id:recordId, device_id:device.id, fields:conflicts }); results.push({ status:'conflict', idempotency_key:key, conflict:clone(conflict) }); return;
        }
        if (recordStore) { rememberRecord(changes, collection, recordId); writeRecord(collection, recordId, patch); }
        const nextRevision = revision + 1; const accepted = Object.assign(operation, { collection, record_id:recordId, patch, revision:nextRevision, accepted_at:now() });
        state.operations.push(accepted); state.operationKeys.add(key); state.revisions.set(recordKey, nextRevision);
        Object.keys(operation.patch || {}).forEach(field => state.fieldRevisions.set(`${recordKey}:${field}`, { revision:nextRevision, device_id:device.id }));
        auditEvent('sync_operation_accepted', { operation_id:operation.operation_id, idempotency_key:key, collection, record_id:recordId, device_id:device.id, revision:nextRevision, fields:Object.keys(operation.patch || {}) });
        results.push({ status:'accepted', idempotency_key:key, operation:clone(accepted) });
        });
        return { device_id:device.id, results };
      });
    }
    function pull(token, cursor) { deviceFor(token); const after = Number(cursor || 0); const operations = state.operations.filter((item, index) => index + 1 > after).map(clone); return { cursor:after + operations.length, operations }; }
    function resolveConflict(conflictId, choice) {
      const conflict = state.conflicts.find(item => item.id === text(conflictId)); if (!conflict) throw new Error('SYNC_CONFLICT_NOT_FOUND');
      const value = choice || {};
      if (!['local', 'incoming', 'manual'].includes(value.mode)) throw new Error('SYNC_CONFLICT_CHOICE_INVALID');
      if (value.mode === 'manual' && (!value.values || typeof value.values !== 'object')) throw new Error('SYNC_MANUAL_VALUES_REQUIRED');
      return transaction(changes => {
        const patch = {};
        (conflict.fields || []).forEach(field => {
          if (value.mode === 'incoming') patch[field.field] = clone(field.incoming);
          if (value.mode === 'manual' && Object.prototype.hasOwnProperty.call(value.values, field.field)) patch[field.field] = clone(value.values[field.field]);
        });
        if (value.mode !== 'local' && Object.keys(patch).length) {
          if (recordStore) rememberRecord(changes, conflict.collection, conflict.record_id);
          writeRecord(conflict.collection, conflict.record_id, sanitizeSyncPatch(conflict.collection, conflict.record_id, patch));
          appendRevisionOperation(conflict.collection, conflict.record_id, patch, conflict.current_revision);
        }
        conflict.status = 'resolved'; conflict.resolution = clone(value); conflict.resolved_at = now(); conflict.applied_patch = clone(patch);
        auditEvent('sync_conflict_resolved', { conflict_id:conflict.id, collection:conflict.collection, record_id:conflict.record_id, mode:value.mode, fields:(conflict.fields || []).map(field => field.field) }); return clone(conflict);
      });
    }
    function status() { return { workspace_id:workspaceId, devices:[...state.devices.values()].map(publicDevice), pending_pairings:[...state.requests.values()].filter(item => item.status === 'pending').map(publicRequest), queued_operations:state.operations.length, open_conflicts:state.conflicts.filter(item => item.status === 'open').length, uploads:state.uploads.size }; }
    return Object.freeze({ createPairingCode, requestPairing, confirmPairing, getPairingResult, pauseDevice, resumeDevice, revokeDevice, authenticate:token => publicDevice(deviceFor(token)), push, pull, listConflicts:() => state.conflicts.map(clone), resolveConflict, status, snapshot });
  }

  const analysisWithJointVisits = Object.freeze(Object.assign({}, analysis, { jointVisitCandidates }));
  return Object.freeze({ SCHEMA_VERSION, SYNC_PROTOCOL_VERSION, COLLECTIONS, SENSITIVE_STUDENT_FIELDS, CONTENT_ROLES, CONTENT_ROLE_LABELS, CONTENT_ROLE_PERMISSIONS, DEFAULT_WORK_CATEGORIES, studentImport, studentIdentityReview, studentBulk, forms, analysis:analysisWithJointVisits, sensitiveAi, createBackupScheduler, installBackupFacade, createRemoteBackupAdapter, createSyncFacade, createSyncEngine, createSyncClient, createStudentFieldCatalog, createContentPushService, createWorkCategoryCatalog, createPairingQrPayload, parsePairingQrPayload, createSyncHost });
});
