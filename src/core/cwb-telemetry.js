/* Opt-in anonymous runtime metrics. No business data is accepted here. */
(function installCwbTelemetry(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBTelemetry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbTelemetry(root) {
  'use strict';
  const EVENTS = Object.freeze(['app_started', 'app_updated', 'license_activated', 'license_refresh_failed', 'update_check_failed', 'update_installed', 'backup_completed', 'sync_completed']);
  const PROPERTY_KEYS = Object.freeze(['duration_ms', 'records_count', 'attachments_count', 'error_code', 'channel']);
  const text = value => String(value == null ? '' : value).trim();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const error = (code, message) => { const value = new Error(`${code}: ${message || code}`); value.code = code; return value; };
  const storageFor = options => {
    if (options && options.storage) return options.storage;
    const storage = root && root.localStorage;
    if (!storage) return { get:() => null, set:() => {} };
    const key = 'cwb_telemetry_consent_v1';
    return { get:() => storage.getItem(key) === 'true', set:value => storage.setItem(key, value ? 'true' : 'false') };
  };
  function createManager(options) {
    const opts = options || {};
    const storage = storageFor(opts);
    let enabled = storage.get() === true;
    const transport = typeof opts.transport === 'function' ? opts.transport : null;
    const state = { enabled, pending:0, last_error:'' };
    const sanitize = input => {
      const value = input || {};
      const eventName = text(value.event_name || value.name);
      if (!EVENTS.includes(eventName)) throw error('TELEMETRY_EVENT_INVALID', '指标事件不在允许清单中');
      const properties = {};
      const source = value.properties && typeof value.properties === 'object' && !Array.isArray(value.properties) ? value.properties : {};
      PROPERTY_KEYS.forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(source, key)) return;
        if (key === 'error_code' || key === 'channel') properties[key] = text(source[key]).slice(0, 80);
        else if (Number.isFinite(Number(source[key]))) properties[key] = Math.max(0, Math.min(1000000000, Number(source[key])));
      });
      return { event_name:eventName, installation_id:text(opts.installationId || ''), app_version:text(opts.appVersion || ''), platform:text(opts.platform || ''), arch:text(opts.arch || ''), properties };
    };
    return {
      events:EVENTS,
      state:() => ({ enabled:state.enabled, pending:state.pending, last_error:state.last_error }),
      isEnabled:() => state.enabled,
      setOptIn(value) { state.enabled = value === true; storage.set(state.enabled); if (!state.enabled) state.pending = 0; return state.enabled; },
      async record(input) {
        if (!state.enabled) return { ok:false, skipped:true, reason:'TELEMETRY_OPT_OUT' };
        if (!transport) return { ok:false, skipped:true, reason:'TELEMETRY_TRANSPORT_UNAVAILABLE' };
        const payload = sanitize(input);
        if (!payload.installation_id) throw error('TELEMETRY_INSTALLATION_REQUIRED');
        state.pending += 1; state.last_error = '';
        try { const result = await transport({ ...payload, consent:true }); return { ok:true, result:clone(result) }; }
        catch (cause) { state.last_error = String(cause && cause.code || 'TELEMETRY_SEND_FAILED'); throw cause; }
        finally { state.pending = Math.max(0, state.pending - 1); }
      },
    };
  }
  return Object.freeze({ EVENTS, PROPERTY_KEYS, createManager });
});
