const path = require('node:path');

function codedError(code, message, cause) {
  const error = new Error(`${code}: ${message || code}`);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

/**
 * Switches the active store only after the candidate has passed a payload
 * health check. If activation fails, the caller's setter receives a verified
 * store opened from the original directory before the failure is surfaced.
 */
async function activateDataDirectory(options) {
  const opts = options || {};
  if (typeof opts.current !== 'string' || !opts.current.trim() || typeof opts.requested !== 'string' || !opts.requested.trim()) throw codedError('DATA_MIGRATION_CONTEXT_INVALID', '数据目录迁移路径无效');
  const current = path.resolve(opts.current.trim());
  const requested = path.resolve(opts.requested.trim());
  const createStore = typeof opts.createStore === 'function' ? opts.createStore : null;
  const setUserData = typeof opts.setUserData === 'function' ? opts.setUserData : null;
  const setStore = typeof opts.setStore === 'function' ? opts.setStore : null;
  if (!createStore || !setUserData || !setStore) throw codedError('DATA_MIGRATION_CONTEXT_INVALID', '数据目录迁移上下文无效');

  const close = store => { if (store && typeof store.close === 'function') store.close(); };
  const storePath = root => path.join(root, 'counselor-v4.sqlite');
  let candidate;
  try {
    if (opts.oldStore) close(opts.oldStore);
    setStore(null);
    setUserData(requested);
    candidate = createStore(storePath(requested));
    if (!candidate) throw codedError('SQLITE_UNAVAILABLE', '当前运行时不支持 SQLite');
    await candidate.health({ verifyPayloads:true });
    setStore(candidate);
    candidate = null;
    return { ok:true, active_path:requested };
  } catch (activationError) {
    close(candidate);
    setStore(null);
    try {
      setUserData(current);
      const restored = createStore(storePath(current));
      if (!restored) throw codedError('SQLITE_UNAVAILABLE', '当前运行时不支持 SQLite');
      await restored.health({ verifyPayloads:true });
      setStore(restored);
    } catch (rollbackError) {
      setStore(null);
      throw codedError('DATA_MIGRATION_ROLLBACK_FAILED', '新数据目录启用失败，原目录也无法重新打开，请保留恢复副本并停止继续写入', rollbackError);
    }
    throw codedError('DATA_MIGRATION_ACTIVATION_FAILED', '新数据目录启用失败，原目录仍可使用', activationError);
  }
}

module.exports = { activateDataDirectory };
