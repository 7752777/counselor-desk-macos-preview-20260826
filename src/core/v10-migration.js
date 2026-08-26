/* Incremental v9 -> v10 metadata migration. Existing v8 envelope history and
 * v9 collections remain readable; v10 only adds collections and UI metadata. */
(function installCwbV10Migration(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBv10Migration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbV10Migration() {
  'use strict';
  const SCHEMA_VERSION = 10;
  const text = value => String(value == null ? '' : value).trim();
  const now = () => new Date().toISOString();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

  function migrate(state, options) {
    const source = clone(state || {});
    const opts = options || {};
    const custom = source.custom && typeof source.custom === 'object' && !Array.isArray(source.custom) ? source.custom : {};
    source.custom = custom;
    const collections = Array.isArray(opts.collections) ? opts.collections : [];
    collections.forEach(key => { if (!Array.isArray(custom[key])) custom[key] = []; });
    source.data_schema_version = SCHEMA_VERSION;
    const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
    source.settings = Object.assign({}, settings, {
      v47_schema_version: SCHEMA_VERSION,
      v47_migrated_at: text(settings.v47_migrated_at) || now(),
    });
    return {
      state: source,
      from_schema_version: Number(opts.from_schema_version || source.data_schema_version || 9),
      schema_version: SCHEMA_VERSION,
      migrated: true,
      migrated_at: now(),
    };
  }

  function isV10(state, collections) {
    const source = state || {};
    const custom = source.custom && typeof source.custom === 'object' ? source.custom : {};
    const required = Array.isArray(collections) ? collections : [];
    return Number(source.settings && source.settings.v47_schema_version) >= SCHEMA_VERSION
      && Number(source.data_schema_version || 0) >= SCHEMA_VERSION
      && required.every(key => Array.isArray(custom[key]));
  }

  return Object.freeze({ SCHEMA_VERSION, migrate, isV10 });
});
