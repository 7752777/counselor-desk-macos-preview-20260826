/* Incremental v8 -> v9 metadata migration.  Existing v8 envelope history is
 * intentionally retained; v9 only adds new collections and record fields. */
(function installCwbV9Migration(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBv9Migration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbV9Migration() {
  'use strict';
  const SCHEMA_VERSION = 9;
  const text = value => String(value == null ? '' : value).trim();
  const now = () => new Date().toISOString();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  function migrate(state, options) {
    const source = clone(state || {}); const opts = options || {}; const custom = source.custom && typeof source.custom === 'object' ? source.custom : {};
    source.custom = custom;
    const collections = Array.isArray(opts.collections) ? opts.collections : [];
    collections.forEach(key => { if (!Array.isArray(custom[key])) custom[key] = []; });
    source.data_schema_version = SCHEMA_VERSION;
    const settings = source.settings && typeof source.settings === 'object' ? source.settings : {};
    source.settings = Object.assign({}, settings, { v46_schema_version:SCHEMA_VERSION, v46_migrated_at:text(settings.v46_migrated_at) || now() });
    return { state:source, from_schema_version:Number(opts.from_schema_version || 8), schema_version:SCHEMA_VERSION, migrated:true, migrated_at:now() };
  }
  function isV9(state) {
    return !!state && Number(state.settings && state.settings.v46_schema_version) >= SCHEMA_VERSION
      && Number(state.data_schema_version || SCHEMA_VERSION) >= SCHEMA_VERSION;
  }
  return Object.freeze({ SCHEMA_VERSION, migrate, isV9 });
});
