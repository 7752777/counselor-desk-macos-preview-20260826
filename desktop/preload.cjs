const { contextBridge, ipcRenderer } = require('electron');
const desktopConfig = (() => {
  try { return require('./runtime-config.cjs'); } catch (_) { return {}; }
})();

function diagnosticInvoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).catch(error => {
    const message = String(error && error.message || error || '桌面操作失败');
    const matches = [...message.matchAll(/\b([A-Z][A-Z0-9_]{2,})\s*:/g)];
    const wrapped = new Error(message);
    wrapped.name = 'CWBDesktopError';
    wrapped.code = error && error.code || (matches.length ? matches[matches.length - 1][1] : 'DESKTOP_IPC_FAILED');
    wrapped.cause = error;
    throw wrapped;
  });
}

function licenseConfig() {
  return Object.freeze({
    mode: String(desktopConfig.mode || 'development').trim().toLowerCase(),
    serviceUrl: String(desktopConfig.serviceUrl || '').trim(),
    publicKeys:desktopConfig.publicKeys && typeof desktopConfig.publicKeys === 'object' ? desktopConfig.publicKeys : {},
    paymentReady: desktopConfig.paymentReady === true,
    purchaseUrl: String(desktopConfig.purchaseUrl || '').trim(),
    managedRelayUrl: String(desktopConfig.managedRelayUrl || '').trim(),
    managedRelayBaseUrl: String(desktopConfig.managedRelayBaseUrl || '').trim(),
    managedRelayModel: String(desktopConfig.managedRelayModel || '').trim(),
  });
}

contextBridge.exposeInMainWorld('cwbDesktop', Object.freeze({
  licenseConfig: licenseConfig(),
  chooseBackupFolder: () => diagnosticInvoke('desktop:choose-backup-folder'),
  saveBackup: (envelope, folder) => diagnosticInvoke('desktop:save-backup', envelope, folder),
  openBackup: () => diagnosticInvoke('desktop:open-backup'),
  openDataFolder: () => diagnosticInvoke('desktop:open-data-folder'),
  getDataLocation: () => diagnosticInvoke('desktop:get-data-location'),
  chooseDataFolder: () => diagnosticInvoke('desktop:choose-data-folder'),
  migrateDataFolder: (target) => diagnosticInvoke('desktop:migrate-data-folder', target),
  getVaultStatus: () => diagnosticInvoke('desktop:get-vault-status'),
  exportRecoveryKit: (password, folder) => diagnosticInvoke('desktop:export-recovery-kit', password, folder),
  openRecoveryKit: () => diagnosticInvoke('desktop:open-recovery-kit'),
  restoreRecoveryKit: (envelope, password) => diagnosticInvoke('desktop:restore-recovery-kit', envelope, password),
  lanSyncStart: (options) => diagnosticInvoke('desktop:lan-sync-start', options),
  lanSyncStop: () => diagnosticInvoke('desktop:lan-sync-stop'),
  lanSyncStatus: () => diagnosticInvoke('desktop:lan-sync-status'),
  lanSyncPairingCode: () => diagnosticInvoke('desktop:lan-sync-pairing-code'),
  lanSyncPairingQr: () => diagnosticInvoke('desktop:lan-sync-pairing-qr'),
  lanSyncConfirmPairing: (requestId, approve) => diagnosticInvoke('desktop:lan-sync-confirm-pairing', requestId, approve),
  lanSyncPauseDevice: (deviceId) => diagnosticInvoke('desktop:lan-sync-pause-device', deviceId),
  lanSyncResumeDevice: (deviceId) => diagnosticInvoke('desktop:lan-sync-resume-device', deviceId),
  lanSyncRevokeDevice: (deviceId) => diagnosticInvoke('desktop:lan-sync-revoke-device', deviceId),
  repositoryHealth: () => diagnosticInvoke('desktop:repository-health'),
  setBackupSecret: (secret) => diagnosticInvoke('desktop:set-backup-secret', secret),
  getBackupSecret: () => diagnosticInvoke('desktop:get-backup-secret'),
  setAiSecret: (id, secret) => diagnosticInvoke('desktop:set-ai-secret', id, secret),
  getAiSecret: (id) => diagnosticInvoke('desktop:get-ai-secret', id),
  deleteAiSecret: (id) => diagnosticInvoke('desktop:delete-ai-secret', id),
  getLicenseState: () => diagnosticInvoke('desktop:get-license-state'),
  setLicenseState: (state) => diagnosticInvoke('desktop:set-license-state', state),
  deleteLicenseState: () => diagnosticInvoke('desktop:delete-license-state'),
  licenseRequest: (input) => diagnosticInvoke('desktop:license-request', input),
  updateStatus: () => diagnosticInvoke('desktop:update-status'),
  updateCheck: () => diagnosticInvoke('desktop:update-check'),
  updateDownload: () => diagnosticInvoke('desktop:update-download'),
  updateInstall: () => diagnosticInvoke('desktop:update-install'),
  updateCancel: () => diagnosticInvoke('desktop:update-cancel'),
  onUpdateState: handler => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, state) => {
      try { handler(state && typeof state === 'object' ? JSON.parse(JSON.stringify(state)) : {}); } catch (_) {}
    };
    ipcRenderer.on('cwb:update-state', listener);
    return () => ipcRenderer.removeListener('cwb:update-state', listener);
  },
  pruneBackups: (folder, retain) => diagnosticInvoke('desktop:prune-backups', folder, retain),
  repositoryList: (collection) => diagnosticInvoke('desktop:repository-list', collection),
  repositoryGet: (collection, id) => diagnosticInvoke('desktop:repository-get', collection, id),
  repositoryPut: (collection, record) => diagnosticInvoke('desktop:repository-put', collection, record),
  repositoryPutMany: (collection, records) => diagnosticInvoke('desktop:repository-put-many', collection, records),
  repositoryReplaceManyAtomic: (collection, records) => diagnosticInvoke('desktop:repository-replace-many-atomic', collection, records),
  repositoryDelete: (collection, id) => diagnosticInvoke('desktop:repository-delete', collection, id),
  repositoryCount: (collection) => diagnosticInvoke('desktop:repository-count', collection),
  writeAttachment: (input) => diagnosticInvoke('desktop:write-attachment', input),
  readAttachment: (id) => diagnosticInvoke('desktop:read-attachment', id),
  deleteAttachment: (id) => diagnosticInvoke('desktop:delete-attachment', id),
  printHtmlToPdf: (html) => diagnosticInvoke('desktop:print-html-to-pdf', html),
  openExternal: (url) => diagnosticInvoke('desktop:open-external', url),
}));
