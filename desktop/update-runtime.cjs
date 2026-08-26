const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const updateCore = require('../src/core/cwb-update.js');
const licenseCore = require('../src/core/cwb-license.js');
if (typeof globalThis.CWBLicense === 'undefined') globalThis.CWBLicense = licenseCore;

function codedError(code, message, cause) {
  const error = new Error(`${code}: ${message || code}`);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function text(value) { return String(value == null ? '' : value).trim(); }

async function sha256File(filePath) {
  if (!filePath) throw codedError('UPDATE_PACKAGE_PATH_MISSING', '更新运行时没有返回已下载文件路径');
  let bytes;
  try { bytes = await fs.readFile(filePath); }
  catch (cause) { throw codedError('UPDATE_PACKAGE_READ_FAILED', '无法读取已下载的更新包', cause); }
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function updatePackagePath(result, info) {
  const values = [];
  if (Array.isArray(result)) values.push(...result);
  else if (typeof result === 'string') values.push(result);
  if (info && typeof info === 'object') values.push(info.downloadedFile, info.path, info.file);
  return values.map(text).find(Boolean) || '';
}

function createElectronUpdateRuntime(options) {
  const opts = options || {};
  let autoUpdater = opts.autoUpdater || null;
  if (!autoUpdater) {
    try { ({ autoUpdater } = require('electron-updater')); } catch (_) { autoUpdater = null; }
  }
  const state = {
    status:'idle', version:String(opts.currentVersion || ''), available:null, manifest:null, manifest_package:null,
    error:'', progress:0, downloaded:false, downloaded_path:'', downloaded_sha256:'', downloaded_info:null,
    recovery_point:null, rollback_required:false, rollback_state:'none', rollback_error:'', rollback_result:null,
    install_started_at:'', expected_version:'', install_error:'', persistence_error:'',
  };
  let cancelRequested = false;
  let manifestPackage = null;
  const listeners = new Set();
  const notify = () => listeners.forEach(listener => { try { listener({ ...state }); } catch (_) {} });
  const setState = next => { Object.assign(state, next || {}); notify(); return { ...state }; };

  if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('checking-for-update', () => setState({ status:'checking', error:'' }));
    autoUpdater.on('update-available', info => setState({ status:'available', available:info || null, error:'' }));
    autoUpdater.on('update-not-available', info => setState({ status:'up-to-date', available:info || null }));
    autoUpdater.on('download-progress', info => setState({ status:'downloading', progress:Math.max(0, Math.min(1, Number(info && info.percent || 0) / 100)) }));
    autoUpdater.on('update-downloaded', info => {
      if (cancelRequested) return;
      /* electron-updater emits this before the caller can verify the package.
         Keep the path as pending evidence; download() marks it usable only
         after the signed manifest hash and optional platform verifier pass. */
      setState({ status:'downloading', progress:1, downloaded_info:info || null, available:info || state.available });
    });
    autoUpdater.on('error', error => setState({ status:'error', error:String(error && error.code || error && error.message || 'UPDATE_RUNTIME_FAILED') }));
  }

  function requireRuntime() {
    if (!autoUpdater) throw codedError('UPDATE_RUNTIME_UNAVAILABLE', '当前桌面包未包含 electron-updater，请使用商业构建配置重新打包');
    return autoUpdater;
  }

  async function persistInstallState(value) {
    if (typeof opts.persistInstallState !== 'function') return null;
    try { return await opts.persistInstallState(value); }
    catch (cause) {
      state.persistence_error = String(cause && cause.code || 'UPDATE_STATE_PERSIST_FAILED');
      throw codedError('UPDATE_STATE_PERSIST_FAILED', '更新状态无法持久化，安装已取消', cause);
    }
  }

  async function performRollback(reason) {
    const cause = reason instanceof Error ? reason : codedError('UPDATE_INSTALL_FAILED', String(reason || 'UPDATE_INSTALL_FAILED'));
    const recovery = state.recovery_point;
    setState({ status:'rolling-back', rollback_required:true, rollback_state:'running', rollback_error:'', install_error:String(cause.code || 'UPDATE_INSTALL_FAILED') });
    if (typeof opts.rollbackRecoveryPoint !== 'function' || !recovery) {
      const failure = codedError('UPDATE_ROLLBACK_UNAVAILABLE', '更新失败，但没有可用的恢复回调或恢复点；请使用恢复向导处理', cause);
      setState({ status:'rollback-failed', rollback_required:true, rollback_state:'failed', rollback_error:failure.code });
      await persistInstallState({ phase:'rollback-failed', reason:failure.code, recovery_point:recovery || null, updated_at:new Date().toISOString() }).catch(error => { state.persistence_error = error.code || 'UPDATE_STATE_PERSIST_FAILED'; });
      throw failure;
    }
    try {
      const result = await opts.rollbackRecoveryPoint(recovery, { reason:cause.code || 'UPDATE_INSTALL_FAILED', error:String(cause.message || cause) });
      if (!result || result.ok !== true) throw codedError('UPDATE_ROLLBACK_FAILED', '恢复点回滚未确认成功');
      setState({ status:'rolled-back', rollback_required:false, rollback_state:'completed', rollback_result:result, rollback_error:'' });
      await persistInstallState({ phase:'rolled-back', reason:cause.code || 'UPDATE_INSTALL_FAILED', recovery_point:recovery, rollback_result:result, updated_at:new Date().toISOString() }).catch(error => { state.persistence_error = error.code || 'UPDATE_STATE_PERSIST_FAILED'; });
      return result;
    } catch (rollbackCause) {
      const failure = rollbackCause && rollbackCause.code ? rollbackCause : codedError('UPDATE_ROLLBACK_FAILED', '恢复点回滚失败，旧数据副本仍已保留', rollbackCause);
      setState({ status:'rollback-failed', rollback_required:true, rollback_state:'failed', rollback_error:String(failure.code || 'UPDATE_ROLLBACK_FAILED') });
      await persistInstallState({ phase:'rollback-failed', reason:cause.code || 'UPDATE_INSTALL_FAILED', rollback_error:String(failure.code || 'UPDATE_ROLLBACK_FAILED'), recovery_point:recovery, updated_at:new Date().toISOString() }).catch(error => { state.persistence_error = error.code || 'UPDATE_STATE_PERSIST_FAILED'; });
      throw failure;
    }
  }

  async function fetchManifest() {
    if (typeof opts.fetchManifest === 'function') return opts.fetchManifest();
    const url = normalizeFeedUrl(opts.manifestUrl);
    if (typeof fetch !== 'function') throw codedError('UPDATE_MANIFEST_FETCH_UNAVAILABLE', '当前桌面运行时不支持更新清单请求');
    let response;
    try { response = await fetch(url, { headers:{ Accept:'application/json' } }); }
    catch (cause) { throw codedError('UPDATE_MANIFEST_FETCH_FAILED', '更新清单请求失败', cause); }
    if (!response || !response.ok) throw codedError('UPDATE_MANIFEST_FETCH_FAILED', `更新清单返回 HTTP ${response && response.status || 'unknown'}`);
    try { return await response.json(); }
    catch (cause) { throw codedError('UPDATE_MANIFEST_INVALID', '更新清单不是有效 JSON', cause); }
  }

  async function prepareManifest() {
    const raw = await fetchManifest();
    const source = raw && raw.manifest ? raw.manifest : raw;
    if (opts.requireManifestSignature === true) {
      /* Verify the exact JSON object emitted by the signing service. Adding
         default fields before verification would change the signed bytes. */
      await updateCore.verifyManifestSignature(source, opts.manifestPublicKeys || opts.publicKeys || {});
    }
    const normalized = updateCore.normalizeManifest(source);
    const selected = updateCore.selectPackage(normalized, opts.platform || process.platform, opts.arch || process.arch);
    if (!selected) throw codedError('UPDATE_PLATFORM_UNSUPPORTED', '更新清单没有当前平台和架构的安装包');
    manifestPackage = selected;
    setState({ manifest:normalized, manifest_package:selected });
    return { manifest:normalized, package:selected };
  }

  async function verifyDownloaded(filePath, info) {
    if (!filePath) {
      if (opts.requirePackageHash === true) throw codedError('UPDATE_PACKAGE_PATH_MISSING', '更新运行时没有返回可校验的更新包');
      return { path:'', sha256:'' };
    }
    const actual = await sha256File(filePath);
    if (manifestPackage && actual.toLowerCase() !== String(manifestPackage.sha256 || '').toLowerCase()) {
      throw codedError('UPDATE_HASH_MISMATCH', '下载包 SHA-256 与签名清单不一致');
    }
    const unsignedPreview = opts.allowUnsignedPreview === true
      && state.manifest && state.manifest.channel === 'preview'
      && manifestPackage && manifestPackage.signature === 'unsigned-preview-v1';
    if (typeof opts.verifyDownloadedPackage === 'function' && !unsignedPreview) {
      const verified = await opts.verifyDownloadedPackage(filePath, { info:info || null, manifest:state.manifest, package:manifestPackage });
      if (verified !== true) throw codedError('UPDATE_PLATFORM_SIGNATURE_INVALID', '更新包平台签名校验失败');
    } else if (opts.requirePlatformSignature === true && !unsignedPreview) {
      throw codedError('UPDATE_PLATFORM_SIGNATURE_UNVERIFIED', '商业更新缺少平台签名校验器');
    }
    return { path:filePath, sha256:actual };
  }

  return {
    status:() => ({ ...state }),
    subscribe(listener) { if (typeof listener === 'function') listeners.add(listener); return () => listeners.delete(listener); },
    async check() {
      const updater = requireRuntime();
      if (typeof opts.requireEntitlement === 'function') await Promise.resolve(opts.requireEntitlement('core_update'));
      try {
        if (opts.requireManifestSignature === true || opts.manifestUrl || typeof opts.fetchManifest === 'function') await prepareManifest();
        if (opts.feedUrl && typeof updater.setFeedURL === 'function') updater.setFeedURL({ provider:'generic', url:normalizeFeedUrl(opts.feedUrl) });
        const result = await updater.checkForUpdates();
        const updateInfo = result && result.updateInfo || null;
        if (updateInfo && state.manifest && updateCore.compareVersions(updateInfo.version, state.manifest.version) !== 0) {
          throw codedError('UPDATE_MANIFEST_VERSION_MISMATCH', '更新服务返回的版本与签名清单不一致');
        }
        setState({ status:updateInfo ? 'available' : state.status, available:updateInfo || state.available });
        return { state:{ ...state }, updateInfo };
      } catch (cause) {
        setState({ status:'error', error:String(cause && cause.code || 'UPDATE_CHECK_FAILED') });
        throw cause && cause.code ? cause : codedError('UPDATE_CHECK_FAILED', '桌面更新检查失败', cause);
      }
    },
    async download() {
      const updater = requireRuntime();
      if (typeof opts.requireEntitlement === 'function') await Promise.resolve(opts.requireEntitlement('core_update'));
      if (!state.available && !state.downloaded) throw codedError('UPDATE_NOT_AVAILABLE', '当前没有可下载的更新');
      cancelRequested = false;
      try {
        setState({ status:'downloading', error:'', downloaded:false, downloaded_path:'', downloaded_sha256:'', downloaded_info:null });
        const result = await updater.downloadUpdate();
        const info = state.downloaded_info || null;
        const filePath = updatePackagePath(result, info);
        const verified = await verifyDownloaded(filePath, info);
        if (cancelRequested) throw codedError('UPDATE_CANCELLED', '更新下载已取消');
        setState({ status:'downloaded', downloaded:true, progress:1, downloaded_path:verified.path, downloaded_sha256:verified.sha256 });
        return { ...state };
      } catch (cause) {
        const cancelled = cancelRequested || String(cause && cause.code || '') === 'UPDATE_CANCELLED';
        setState({ status:cancelled ? 'cancelled' : 'error', error:cancelled ? 'UPDATE_CANCELLED' : String(cause && cause.code || 'UPDATE_DOWNLOAD_FAILED'), downloaded:false });
        throw cause && cause.code ? cause : codedError('UPDATE_DOWNLOAD_FAILED', '桌面更新下载失败', cause);
      }
    },
    cancel() {
      cancelRequested = true;
      try { if (autoUpdater && typeof autoUpdater.cancelDownload === 'function') autoUpdater.cancelDownload(); } catch (_) {}
      setState({ status:'cancelled', error:'', downloaded:false, progress:0, downloaded_path:'', downloaded_sha256:'' });
      return true;
    },
    async install() {
      const updater = requireRuntime();
      if (typeof opts.requireEntitlement === 'function') await Promise.resolve(opts.requireEntitlement('core_update'));
      if (!state.downloaded) throw codedError('UPDATE_NOT_DOWNLOADED', '更新尚未下载完成');
      try {
        if (typeof opts.createRecoveryPoint === 'function') {
          const recovery = await opts.createRecoveryPoint();
          if (opts.requireRecoveryPoint === true && (!recovery || recovery.ok !== true)) throw codedError('UPDATE_RECOVERY_POINT_FAILED', '更新前恢复点未创建，安装已取消');
          setState({ recovery_point:recovery || null });
        }
        const targetVersion = String(state.manifest && state.manifest.version || state.available && (state.available.version || state.available.updateInfo && state.available.updateInfo.version) || '').trim();
        setState({ install_started_at:new Date().toISOString(), expected_version:targetVersion, rollback_required:false, rollback_state:'none', rollback_error:'', install_error:'' });
        await persistInstallState({ phase:'installing', target_version:targetVersion, recovery_point:state.recovery_point || null, started_at:state.install_started_at, updated_at:new Date().toISOString() });
        setState({ status:'installing' });
        updater.quitAndInstall(false, true);
        return { ok:true, status:'installing', recovery_point:state.recovery_point };
      } catch (cause) {
        const installError = cause && cause.code ? cause : codedError('UPDATE_INSTALL_FAILED', '更新安装失败，旧版本仍应保留', cause);
        setState({ status:'rollback-required', rollback_required:true, error:String(installError.code || 'UPDATE_INSTALL_FAILED'), install_error:String(installError.code || 'UPDATE_INSTALL_FAILED') });
        try { await performRollback(installError); } catch (rollbackError) { installError.rollback_error = rollbackError.code || 'UPDATE_ROLLBACK_FAILED'; }
        throw installError;
      }
    },
    async resumeAfterLaunch() {
      if (typeof opts.loadInstallState !== 'function') return null;
      let pending;
      try { pending = await opts.loadInstallState(); }
      catch (cause) { setState({ status:'error', error:'UPDATE_STATE_READ_FAILED', persistence_error:'UPDATE_STATE_READ_FAILED' }); throw codedError('UPDATE_STATE_READ_FAILED', '更新状态无法读取', cause); }
      if (!pending || typeof pending !== 'object') return null;
      const phase = String(pending.phase || '').trim();
      if (['completed', 'rolled-back', 'rollback-failed'].includes(phase)) {
        setState({ status:phase === 'completed' ? 'updated' : phase, rollback_required:phase === 'rollback-failed', rollback_state:phase === 'rolled-back' ? 'completed' : phase === 'rollback-failed' ? 'failed' : 'none', rollback_error:String(pending.rollback_error || ''), rollback_result:pending.rollback_result || null, recovery_point:pending.recovery_point || null, expected_version:String(pending.target_version || '') });
        return { ...state, persisted_phase:phase };
      }
      if (phase !== 'installing' && phase !== 'pending') return null;
      if (pending.recovery_point) setState({ recovery_point:pending.recovery_point });
      setState({ expected_version:String(pending.target_version || ''), install_started_at:String(pending.started_at || ''), status:'resuming' });
      const currentVersion = String(opts.currentVersion || state.version || '').trim();
      const targetVersion = String(pending.target_version || '').trim();
      if (!targetVersion || updateCore.compareVersions(currentVersion, targetVersion) < 0) {
        try { await performRollback(codedError('UPDATE_VERSION_NOT_APPLIED', '更新后仍运行旧版本，开始恢复工作区')); }
        catch (cause) { return { ...state, persisted_phase:'rollback-failed', error:cause.code || 'UPDATE_ROLLBACK_FAILED' }; }
        return { ...state, persisted_phase:'rolled-back' };
      }
      try {
        if (typeof opts.validateAfterUpdate === 'function') {
          const result = await opts.validateAfterUpdate({ target_version:targetVersion, recovery_point:pending.recovery_point || null });
          if (result && result.ok === false) throw codedError('UPDATE_POST_INSTALL_VALIDATION_FAILED', '更新后工作区校验未通过');
        }
        setState({ status:'updated', rollback_required:false, rollback_state:'none', error:'' });
        await persistInstallState({ phase:'completed', target_version:targetVersion, recovery_point:pending.recovery_point || null, completed_at:new Date().toISOString(), updated_at:new Date().toISOString() }).catch(error => { state.persistence_error = error.code || 'UPDATE_STATE_PERSIST_FAILED'; });
        return { ...state, persisted_phase:'completed' };
      } catch (cause) {
        try { await performRollback(cause); }
        catch (rollbackError) { return { ...state, persisted_phase:'rollback-failed', error:rollbackError.code || 'UPDATE_ROLLBACK_FAILED' }; }
        return { ...state, persisted_phase:'rolled-back' };
      }
    },
  };
}

function normalizeFeedUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw codedError('UPDATE_FEED_URL_INVALID', '更新服务地址不能为空');
  let parsed;
  try { parsed = new URL(raw); } catch (cause) { throw codedError('UPDATE_FEED_URL_INVALID', '更新服务地址格式无效', cause); }
  if (parsed.protocol !== 'https:') throw codedError('UPDATE_FEED_URL_INVALID', '商业更新服务必须使用 HTTPS');
  return parsed.toString();
}

module.exports = { createElectronUpdateRuntime, normalizeFeedUrl, sha256File, codedError };
