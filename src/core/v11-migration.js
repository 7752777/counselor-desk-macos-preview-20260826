/* Incremental v10 -> v11 migration. It only adds collections and metadata;
 * existing records, stable student IDs, history, and v8 envelopes remain intact. */
(function installCwbV11Migration(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBv11Migration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbV11Migration() {
  'use strict';

  const SCHEMA_VERSION = 11;
  const SYNC_PROTOCOL_VERSION = 1;
  const text = value => String(value == null ? '' : value).trim();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const now = () => new Date().toISOString();
  const NEW_COLLECTIONS = Object.freeze([
    'v4_sync_devices', 'v4_sync_outbox', 'v4_sync_conflicts', 'v4_sync_revisions', 'v4_backup_runs',
    'v4_student_field_catalog', 'v4_student_identity_conflicts', 'v4_form_templates', 'v4_form_jobs',
    'v4_student_class_history', 'v4_content_pushes', 'v4_content_reads', 'v4_work_categories',
  ]);

  function normalizeStudent(student) {
    if (!student || typeof student !== 'object' || Array.isArray(student)) return student;
    const value = Object.assign({}, student);
    const history = Array.isArray(value.student_number_history)
      ? value.student_number_history.map(text).filter(Boolean)
      : [];
    const current = text(value.student_number);
    value.student_number_history = [...new Set(history.filter(number => number !== current))];
    return value;
  }

  function migrate(state, options) {
    const source = clone(state || {});
    const opts = options || {};
    const custom = source.custom && typeof source.custom === 'object' && !Array.isArray(source.custom) ? source.custom : {};
    source.custom = custom;
    const collections = Array.isArray(opts.collections) ? opts.collections : NEW_COLLECTIONS;
    collections.forEach(key => { if (!Array.isArray(custom[key])) custom[key] = []; });
    if (Array.isArray(source.students)) source.students = source.students.map(normalizeStudent);
    source.data_schema_version = SCHEMA_VERSION;
    const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
    source.settings = Object.assign({}, settings, {
      v48_schema_version: SCHEMA_VERSION,
      sync_protocol_version: SYNC_PROTOCOL_VERSION,
      v48_migrated_at: text(settings.v48_migrated_at) || now(),
    });
    return {
      state:source,
      from_schema_version:Number(opts.from_schema_version || state && state.data_schema_version || 10),
      schema_version:SCHEMA_VERSION,
      sync_protocol_version:SYNC_PROTOCOL_VERSION,
      migrated:true,
      migrated_at:now(),
    };
  }

  function isV11(state, collections) {
    const source = state || {};
    const custom = source.custom && typeof source.custom === 'object' ? source.custom : {};
    const required = Array.isArray(collections) ? collections : NEW_COLLECTIONS;
    return Number(source.data_schema_version || 0) >= SCHEMA_VERSION
      && Number(source.settings && source.settings.v48_schema_version || 0) >= SCHEMA_VERSION
      && Number(source.settings && source.settings.sync_protocol_version || 0) === SYNC_PROTOCOL_VERSION
      && required.every(key => Array.isArray(custom[key]));
  }

  return Object.freeze({ SCHEMA_VERSION, SYNC_PROTOCOL_VERSION, NEW_COLLECTIONS, migrate, isV11 });
});
