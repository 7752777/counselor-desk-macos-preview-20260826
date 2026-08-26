/* Signed update manifest and download state machine. The Electron main
 * process remains responsible for applying a verified installer package. */
(function installCwbUpdate(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBUpdate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbUpdate(root) {
  'use strict';

  const MANIFEST_FORMAT = 'cwb-update-manifest-1';
  const text = value => String(value == null ? '' : value).trim();
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const base64Url = value => String(value || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  function error(code, message, cause) { const value = new Error(`${code}: ${message || code}`); value.code = code; if (cause) value.cause = cause; return value; }

  function stableJson(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }

  function versionParts(value) {
    const match = text(value).replace(/^v/i, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
    if (!match) throw error('UPDATE_VERSION_INVALID', '版本号无效');
    return [Number(match[1]), Number(match[2] || 0), Number(match[3] || 0), match[4] || ''];
  }
  function compareVersions(left, right) {
    const a = versionParts(left); const b = versionParts(right);
    for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    if (!a[3] && b[3]) return 1; if (a[3] && !b[3]) return -1; return a[3].localeCompare(b[3]);
  }
  function validateSha(value) { const hash = text(value).toLowerCase(); if (!/^[a-f0-9]{64}$/.test(hash)) throw error('UPDATE_HASH_INVALID'); return hash; }
  function normalizeManifest(input) {
    const value = input && input.manifest ? input.manifest : input;
    if (!value || value.format !== MANIFEST_FORMAT || !text(value.version)) throw error('UPDATE_MANIFEST_INVALID');
    const platforms = Array.isArray(value.platforms) ? value.platforms : [];
    if (!platforms.length) throw error('UPDATE_MANIFEST_INVALID', '更新清单缺少平台包');
    const normalized = platforms.map(item => {
      const row = item || {};
      const sha256 = validateSha(row.sha256);
      if (!/^https:\/\//i.test(text(row.url))) throw error('UPDATE_URL_INVALID');
      if (!text(row.signature)) throw error('UPDATE_SIGNATURE_MISSING');
      return Object.freeze({ platform:text(row.platform), arch:text(row.arch), url:text(row.url), sha256, signature:base64Url(row.signature), size:Number(row.size || 0), required_entitlement:text(row.required_entitlement || 'core_update'), min_version:text(row.min_version || ''), installer:text(row.installer || 'electron-updater') });
    });
    return Object.freeze({ format:MANIFEST_FORMAT, version:text(value.version).replace(/^v/i, ''), channel:text(value.channel || 'stable'), published_at:text(value.published_at || ''), notes:text(value.notes || ''), mandatory:value.mandatory === true, min_compatible_version:text(value.min_compatible_version || ''), platforms:normalized, manifest_signature:base64Url(value.manifest_signature), key_id:text(value.key_id || '') });
  }
  function manifestSigningBytes(input) {
    const value = input && input.manifest ? input.manifest : input;
    const copy = clone(value || {});
    delete copy.manifest_signature;
    return typeof TextEncoder === 'function' ? new TextEncoder().encode(stableJson(copy)) : Buffer.from(stableJson(copy), 'utf8');
  }
  async function verifyManifestSignature(input, publicKeys) {
    const value = input && input.manifest ? input.manifest : input;
    const keyId = text(value && (value.key_id || value.kid) || '');
    const keys = publicKeys || {};
    const publicKey = keys[keyId] || keys.default || (typeof keys === 'string' ? keys : '');
    if (!text(value && value.manifest_signature)) throw error('UPDATE_SIGNATURE_MISSING');
    if (!publicKey) throw error('UPDATE_PUBLIC_KEY_MISSING');
    if (!root || !root.CWBLicense || typeof root.CWBLicense.verifyBytes !== 'function') throw error('UPDATE_SIGNATURE_UNSUPPORTED');
    try { await root.CWBLicense.verifyBytes(manifestSigningBytes(value), value.manifest_signature, publicKey); return true; }
    catch (cause) { throw error('UPDATE_MANIFEST_SIGNATURE_INVALID', undefined, cause); }
  }
  function selectPackage(manifest, platform, arch) {
    const value = normalizeManifest(manifest); const p = text(platform || (root && root.process && root.process.platform) || ''); const a = text(arch || (root && root.process && root.process.arch) || '');
    return value.platforms.find(item => item.platform === p && (!a || !item.arch || item.arch === a)) || null;
  }
  function sha256(bytes) {
    if (typeof require === 'function') { try { const crypto = require('node:crypto'); return crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'); } catch (_) {} }
    const subtle = root && root.crypto && root.crypto.subtle;
    if (!subtle) return Promise.reject(error('UPDATE_HASH_UNSUPPORTED'));
    return subtle.digest('SHA-256', bytes).then(output => Array.from(new Uint8Array(output), byte => byte.toString(16).padStart(2, '0')).join(''));
  }

  function createManager(options) {
    const opts = options || {};
    const state = { status:'idle', current_version:text(opts.currentVersion || '4.9.1'), available:null, progress:0, error:'', downloaded:false, cancelled:false, rollback_required:false, checked_at:'' };
    let controller = null;
    const emit = () => { if (root && typeof root.dispatchEvent === 'function') { try { root.dispatchEvent(new CustomEvent('cwb:update-state', { detail:clone(state) })); } catch (_) {} } };
    const api = {
      compare:compareVersions,
      normalizeManifest,
      selectPackage,
      status:() => clone(state),
      async check(input) {
        state.status = 'checking'; state.error = ''; state.cancelled = false; state.checked_at = new Date().toISOString(); emit();
        try {
          if (typeof opts.requireEntitlement === 'function') await Promise.resolve(opts.requireEntitlement('core_update'));
          const manifest = input || (opts.transport && opts.transport.fetchManifest ? await opts.transport.fetchManifest() : null);
          if (!manifest) throw error('UPDATE_SERVICE_UNAVAILABLE');
          const normalized = normalizeManifest(manifest);
          if (opts.requireSignature === true) await verifyManifestSignature(manifest, opts.publicKeys || (root && root.CWB_LICENSE_PUBLIC_KEYS) || {});
          if (compareVersions(normalized.version, state.current_version) <= 0) { state.status = 'up-to-date'; state.available = null; emit(); return null; }
          if (normalized.min_compatible_version && compareVersions(state.current_version, normalized.min_compatible_version) < 0) throw error('UPDATE_MIN_VERSION_UNSUPPORTED');
          const pkg = selectPackage(normalized, opts.platform, opts.arch);
          if (!pkg) throw error('UPDATE_PLATFORM_UNSUPPORTED');
          state.status = 'available'; state.available = { manifest:normalized, package:pkg }; emit(); return clone(state.available);
        } catch (cause) { state.status = 'error'; state.error = cause.code || 'UPDATE_CHECK_FAILED'; emit(); throw cause.code ? cause : error('UPDATE_CHECK_FAILED', undefined, cause); }
      },
      cancel() { if (controller) controller.abort(); state.cancelled = true; state.status = 'cancelled'; emit(); return true; },
      async download(input) {
        const available = input && input.package ? input : state.available;
        if (!available || !available.package) throw error('UPDATE_NOT_AVAILABLE');
        if (typeof opts.requireEntitlement === 'function') await Promise.resolve(opts.requireEntitlement('core_update'));
        const transport = opts.transport;
        if (!transport || typeof transport.download !== 'function') throw error('UPDATE_SERVICE_UNAVAILABLE');
        controller = new AbortController(); state.status = 'downloading'; state.progress = 0; state.error = ''; state.downloaded = false; emit();
        try {
          const result = await transport.download(available.package, { signal:controller.signal, onProgress:progress => { state.progress = Math.max(0, Math.min(1, Number(progress) || 0)); emit(); } });
          if (!result || result.bytes == null) throw error('UPDATE_DOWNLOAD_INVALID');
          const actual = await Promise.resolve(sha256(result.bytes));
          if (actual.toLowerCase() !== available.package.sha256) throw error('UPDATE_HASH_MISMATCH');
          state.status = 'downloaded'; state.progress = 1; state.downloaded = true; state.package = { ...available.package, path:result.path || '', bytes:undefined }; emit();
          return clone({ package:state.package, path:result.path || '' });
        } catch (cause) { state.status = controller.signal.aborted ? 'cancelled' : 'error'; state.error = controller.signal.aborted ? 'UPDATE_CANCELLED' : (cause.code || 'UPDATE_DOWNLOAD_FAILED'); emit(); throw cause.code ? cause : error('UPDATE_DOWNLOAD_FAILED', undefined, cause); }
        finally { controller = null; }
      },
      async install(input) {
        const value = input || state.package;
        if (!value || !state.downloaded) throw error('UPDATE_NOT_DOWNLOADED');
        if (typeof opts.requireEntitlement === 'function') opts.requireEntitlement(value.required_entitlement || 'core_update');
        if (!opts.transport || typeof opts.transport.install !== 'function') throw error('UPDATE_INSTALL_UNAVAILABLE');
        state.status = 'installing'; state.error = ''; emit();
        try { const result = await opts.transport.install(value, { createRecoveryPoint:opts.createRecoveryPoint }); state.status = 'installed'; emit(); return result; }
        catch (cause) { state.status = 'rollback-required'; state.rollback_required = true; state.error = cause.code || 'UPDATE_INSTALL_FAILED'; emit(); throw cause.code ? cause : error('UPDATE_INSTALL_FAILED', undefined, cause); }
      },
    };
    return api;
  }
  return Object.freeze({ MANIFEST_FORMAT, compareVersions, normalizeManifest, manifestSigningBytes, verifyManifestSignature, selectPackage, sha256, createManager });
});
