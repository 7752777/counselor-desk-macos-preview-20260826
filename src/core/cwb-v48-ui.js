/* v4.8 management surfaces. The module only depends on the stable runtime
 * bridge, keeping the main HTML focused on the legacy application shell. */
(function installCwbV48Ui(root) {
  'use strict';
  var runtime = root.CWBV46Runtime || {};
  var v48 = root.CWBV48 || (root.CWB && root.CWB.v48);
  var app = runtime.app; var DB = runtime.DB; var VIEWS = runtime.VIEWS; var ACTS = runtime.ACTS;
  var render = runtime.render; var save = runtime.save; var ui = runtime.ui; var esc = runtime.esc;
  var today = runtime.today; var v4Page = runtime.v4Page; var v4Collection = runtime.v4Collection;
  var persistUiState = runtime.persistUiState; var clone = runtime.cloneData || function (value) { return value == null ? value : JSON.parse(JSON.stringify(value)); };
  var awaitTrackedSave = root.awaitTrackedSave || (async function (promise) { return promise || { ok:true }; });
  if (!v48 || !app || !DB || !VIEWS || !ACTS || typeof v4Collection !== 'function') return;
  root.CWB = root.CWB || {};
  root.CWB.ai = root.CWB.ai || {};
  root.CWB.ai.voice = Object.assign({}, v48.sensitiveAi, root.CWB.ai.voice || {});
  root.CWB.ai.cohortSummary = v48.sensitiveAi.cohortSummary;
  if (typeof v48.createSyncFacade === 'function') {
    /* Keep the long-lived manual phone exchange API while adding LAN methods. */
    var legacySync = root.CWB.sync || {};
    var lanSync = v48.createSyncFacade({
      desktop:root.cwbDesktop,
      client:function () { return syncClient(); },
    });
    root.CWB.sync = Object.assign({}, legacySync, lanSync);
  }

  function state() { app.v48 = app.v48 || {}; return app.v48; }
  function rows(key) { return v4Collection(key); }
  function recordId(prefix) { return (root.crypto && root.crypto.randomUUID ? prefix + '_' + root.crypto.randomUUID().replace(/-/g, '') : prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)); }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function saveCustom() { window.__CWB_LAST_SAVE_PROMISE__ = save('custom'); return awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__); }
  function saveStudentsAndCustom(extraParts) {
    var parts = Array.isArray(extraParts) ? extraParts.filter(Boolean) : [];
    window.__CWB_LAST_SAVE_PROMISE__ = save('students');
    return awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__).then(function () {
      window.__CWB_LAST_SAVE_PROMISE__ = save('custom');
      return awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__);
    }).then(function (result) {
      return parts.reduce(function (promise, part) {
        return promise.then(function () {
          window.__CWB_LAST_SAVE_PROMISE__ = save(part);
          return awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__);
        });
      }, Promise.resolve(result));
    });
  }
  function syncQueuePersistenceBoundary() {
    var desktop = !!root.cwbDesktop && !root.__CWB_EMBED__;
    var indexedDb = root.CWB_V4_IDB_ACTIVE === true;
    if (desktop) return { tag:'桌面工作区队列', className:'tag-green', detail:'队列由桌面工作区仓储保存；仍请使用加密备份保护数据。' };
    if (indexedDb) return { tag:'IndexedDB 队列', className:'tag-blue', detail:'队列保存在浏览器 IndexedDB；浏览器本地存储不是数据库级加密，请使用加密备份并保护设备账户。' };
    return { tag:'兼容离线队列', className:'tag-amber', detail:'当前浏览器未启用 IndexedDB，队列可能使用兼容存储；未使用数据库级加密，请尽快导出加密备份。' };
  }
  async function waitSyncPersistence() { var pending = state().syncPersistPromise; if (!pending) return { ok:true }; var result = await pending; if (result && result.ok === false) throw new Error(result.error || 'SYNC_STATE_SAVE_FAILED'); return result || { ok:true }; }
  async function logAudit(action, details) {
    if (!root.CWB || !root.CWB.audit || typeof root.CWB.audit.log !== 'function') return null;
    try { return await root.CWB.audit.log(action, Object.assign({ source:'v4.8-ui' }, details || {})); } catch (_) { return null; }
  }
  function snapshotCollections(keys) {
    var snapshot = {};
    (keys || []).forEach(function (key) { snapshot[key] = clone(rows(key)); });
    return snapshot;
  }
  function restoreCollections(snapshot) {
    Object.keys(snapshot || {}).forEach(function (key) { var target = rows(key); target.splice.apply(target, [0, target.length].concat(clone(snapshot[key] || []))); });
  }
  async function persistCustomMutation(keys, mutation) {
    var snapshot = snapshotCollections(keys);
    try { var result = await mutation(); await saveCustom(); return result; } catch (error) { restoreCollections(snapshot); try { await saveCustom(); } catch (_) {} throw error; }
  }
  async function persistStudentsAndCustomMutation(mutation, options) {
    var opts = options || {};
    var extraParts = Array.isArray(opts.extraBaseCollections) ? opts.extraBaseCollections.filter(Boolean) : [];
    var studentsSnapshot = clone(DB.students || []);
    var customKeys = ['v4_student_class_history'].concat(Array.isArray(opts.customCollections) ? opts.customCollections : []);
    var customSnapshot = snapshotCollections([...new Set(customKeys)]);
    var baseSnapshots = {};
    extraParts.forEach(function (key) { baseSnapshots[key] = clone(DB[key] || []); });
    var liveLinkSnapshot = opts.liveLinkSnapshot || [];
    try {
      var result = await mutation();
      await saveStudentsAndCustom(extraParts);
      return result;
    } catch (error) {
      DB.students.splice.apply(DB.students, [0, DB.students.length].concat(clone(studentsSnapshot)));
      restoreCollections(customSnapshot);
      Object.keys(baseSnapshots).forEach(function (key) {
        if (!Array.isArray(DB[key])) DB[key] = [];
        DB[key].splice.apply(DB[key], [0, DB[key].length].concat(clone(baseSnapshots[key] || [])));
      });
      if (liveLinkSnapshot.length && root.CWB && root.CWB.students && typeof root.CWB.students.restoreLiveLinkSnapshot === 'function') {
        root.CWB.students.restoreLiveLinkSnapshot(liveLinkSnapshot);
      }
      try { await saveStudentsAndCustom(extraParts); } catch (_) {}
      throw error;
    }
  }
  function upsert(collection, value) {
    var list = rows(collection); var next = Object.assign({}, value || {});
    if (!text(next.id)) next.id = recordId(collection.replace(/^v4_/, ''));
    next.updated_at = new Date().toISOString();
    var index = list.findIndex(function (item) { return String(item.id) === String(next.id); });
    if (index >= 0) list[index] = Object.assign({}, list[index], next); else list.push(next);
    return list[index >= 0 ? index : list.length - 1];
  }
  function remove(collection, id) { var list = rows(collection); var index = list.findIndex(function (item) { return String(item.id) === String(id); }); if (index < 0) return false; list.splice(index, 1); return true; }
  function statStrip(items) { return '<div class="v48-stat-strip">' + items.map(function (item) { return '<div class="v48-stat"><span>' + esc(item.label) + '</span><strong>' + esc(item.value == null ? '—' : item.value) + '</strong>' + (item.note ? '<small>' + esc(item.note) + '</small>' : '') + '</div>'; }).join('') + '</div>'; }
  function empty(title, hint) { return '<div class="v48-empty"><strong>' + esc(title || '暂无记录') + '</strong><span>' + esc(hint || '可以从右上角新增。') + '</span></div>'; }
  function page(title, intro, body, actions) { return '<div class="v48-page" data-v48-page="' + esc(app.view || '') + '">' + v4Page(title, intro, body, actions || '') + '</div>'; }
  function fieldOptions(values, current, emptyLabel) { var head = emptyLabel == null ? '' : '<option value="">' + esc(emptyLabel) + '</option>'; return head + (values || []).map(function (item) { var value = typeof item === 'object' ? item.v : item; var label = typeof item === 'object' ? item.n : item; return '<option value="' + esc(value) + '"' + (String(value) === String(current || '') ? ' selected' : '') + '>' + esc(label) + '</option>'; }).join(''); }
  function formValue(form, key) { var node = form && form.querySelector('[data-v48-field="' + key + '"]'); return node && node.type === 'checkbox' ? node.checked : node && node.value || ''; }
  function formValues(form, keys) { var value = {}; (keys || []).forEach(function (key) { value[key] = formValue(form, key); }); return value; }
  function labelForStudent(id) { var item = (DB.students || []).find(function (student) { return String(student.id || student.student_id) === String(id); }); return item ? (item.full_name || item.student_number || id) : id; }
  function studentOptions(current) { return (DB.students || []).slice().sort(function (a, b) { return text(a.class_name).localeCompare(text(b.class_name), 'zh-CN') || text(a.full_name).localeCompare(text(b.full_name), 'zh-CN'); }).map(function (item) { var id = item.id || item.student_id; return { v:id, n:[item.full_name || '未命名', item.student_number, item.class_name].filter(Boolean).join(' · ') }; }); }
  function openForm(title, fields, initial, onSave) {
    ui.form({ title:title, size:'wide', data:initial || {}, fields:fields, onSave:onSave });
  }

  function syncClient(token, requested) {
    var s = state();
    var requestedValue = requested || {};
    var requestedWorkspace = text(requestedValue.workspace_id || s.syncState && s.syncState.workspace_id || '');
    var requestedDevice = text(requestedValue.device_id || s.syncState && s.syncState.device_id || '');
    var currentStatus = s.syncClient && typeof s.syncClient.status === 'function' ? s.syncClient.status() : null;
    var scopeChanged = currentStatus && ((requestedWorkspace && text(currentStatus.workspace_id) !== requestedWorkspace) || (requestedDevice && text(currentStatus.device_id) !== requestedDevice));
    if (!s.syncClient || scopeChanged || (token && token !== s.syncToken)) {
      if (scopeChanged) s.syncClient = null;
      var durable = loadDurableSyncState();
      s.syncState = Object.assign({}, durable, s.syncState || {}, requestedValue || {});
      s.syncToken = token || s.syncToken || '';
      s.syncClient = v48.createSyncClient({
        base_url:s.syncState && s.syncState.base_url,
        workspace_id:s.syncState && s.syncState.workspace_id,
        device_id:s.syncState && s.syncState.device_id,
        token:s.syncToken,
        load:function () { return loadDurableSyncState(); },
        save:function (snapshot) {
          var nested = snapshot && snapshot.state && typeof snapshot.state === 'object' ? snapshot.state : {};
          var flat = Object.assign({}, nested, snapshot || {});
          delete flat.state;
          s.syncState = Object.assign({}, s.syncState || {}, flat);
          s.syncConflicts = Array.isArray(snapshot && snapshot.conflicts) ? clone(snapshot.conflicts) : (s.syncConflicts || []);
          persistDurableSyncState(snapshot);
        },
        recordStore:{
          get:async function (collection, id) { if (collection === 'students') return (DB.students || []).find(function (item) { return String(item.id || item.student_id) === String(id); }) || null; var list = rows(collection); return list.find(function (item) { return String(item.id) === String(id); }) || null; },
          put:async function (collection, record) { if (collection === 'students') { var list = DB.students || []; var index = list.findIndex(function (item) { return String(item.id || item.student_id) === String(record.id); }); if (index >= 0) list[index] = Object.assign({}, list[index], record); else list.push(record); await save('students'); return record; } upsert(collection, record); await saveCustom(); return record; },
        },
      });
    } else if (token) s.syncClient.setToken(token);
    return s.syncClient;
  }
  function loadDurableSyncState() {
    var current = state().syncState || {};
    var desiredWorkspace = text(current.workspace_id || current.state && current.state.workspace_id || state().syncWorkspaceId || '');
    var desiredDevice = text(current.device_id || current.state && current.state.device_id || state().syncDeviceId || '');
    var revisions = rows('v4_sync_revisions').filter(function (item) { return item && item.kind === 'client_state'; });
    var revisionScope = function (item) {
      var raw = item && item.state && typeof item.state === 'object' ? item.state : {};
      var nested = raw.state && typeof raw.state === 'object' ? raw.state : {};
      return { workspace_id:text(item && item.workspace_id || raw.workspace_id || nested.workspace_id), device_id:text(item && item.device_id || raw.device_id || nested.device_id) };
    };
    var revision = revisions.find(function (item) { var scope = revisionScope(item); return desiredWorkspace && desiredDevice && scope.workspace_id === desiredWorkspace && scope.device_id === desiredDevice; })
      || revisions.find(function (item) { var scope = revisionScope(item); return desiredWorkspace && scope.workspace_id === desiredWorkspace; })
      || (!desiredWorkspace && desiredDevice ? revisions.find(function (item) { var scope = revisionScope(item); return scope.device_id === desiredDevice; }) : null)
      || (!desiredWorkspace && !desiredDevice ? revisions.slice().sort(function (a, b) { return text(a && a.updated_at).localeCompare(text(b && b.updated_at)); }).at(-1) : null);
    var rawState = revision && revision.state && typeof revision.state === 'object' ? clone(revision.state) : {};
    var nestedState = rawState.state && typeof rawState.state === 'object' ? rawState.state : {};
    var stateValue = Object.assign({}, nestedState, rawState);
    delete stateValue.state;
    var scope = revisionScope(revision);
    var workspaceId = scope.workspace_id || text(stateValue.workspace_id || desiredWorkspace);
    var deviceId = scope.device_id || text(stateValue.device_id || desiredDevice);
    var matchesScope = function (item, kind) {
      return item && item.kind === kind && text(item.device_id) === deviceId && (!text(item.workspace_id) || !workspaceId || text(item.workspace_id) === workspaceId);
    };
    var queue = deviceId ? rows('v4_sync_outbox').filter(function (item) { return matchesScope(item, 'client_outbox'); }).map(function (item) { var copy = clone(item); delete copy.id; delete copy.kind; delete copy.device_id; delete copy.workspace_id; return copy; }) : [];
    var conflicts = deviceId ? rows('v4_sync_conflicts').filter(function (item) { return matchesScope(item, 'client_conflict'); }).map(function (item) { var copy = clone(item); copy.id = text(copy.original_conflict_id || copy.id).replace(/^client:[^:]+:/, ''); delete copy.original_conflict_id; delete copy.kind; delete copy.device_id; delete copy.workspace_id; return copy; }) : [];
    if (workspaceId) stateValue.workspace_id = workspaceId;
    if (deviceId) stateValue.device_id = deviceId;
    delete stateValue.token; delete stateValue.syncToken;
    return Object.assign({}, stateValue, deviceId ? { device_id:deviceId } : {}, { queue:queue, conflicts:conflicts });
  }
  function persistDurableSyncState(snapshot) {
    var input = snapshot && typeof snapshot === 'object' ? snapshot : {};
    var nested = input.state && typeof input.state === 'object' ? input.state : {};
    var value = Object.assign({}, nested, input);
    delete value.state;
    var deviceId = text(value.device_id || state().syncState && state().syncState.device_id);
    if (!deviceId) return;
    var workspaceId = text(value.workspace_id || state().syncState && state().syncState.workspace_id || 'workspace-local') || 'workspace-local';
    var revisionRows = rows('v4_sync_revisions');
    var beforeRevisions = clone(revisionRows);
    var revisionId = 'client_state:' + workspaceId + ':' + deviceId;
    var revision = { id:revisionId, kind:'client_state', workspace_id:workspaceId, device_id:deviceId, state:Object.assign({}, clone(value), { queue:undefined, conflicts:undefined, has_token:undefined }), updated_at:new Date().toISOString(), schema_version:11 };
    delete revision.state.queue; delete revision.state.conflicts; delete revision.state.has_token; delete revision.state.token; delete revision.state.syncToken;
    var revisionIndex = revisionRows.findIndex(function (item) { return String(item && item.id) === revisionId; });
    if (revisionIndex >= 0) revisionRows[revisionIndex] = revision; else revisionRows.push(revision);
    var outboxRows = rows('v4_sync_outbox');
    var beforeOutbox = clone(outboxRows);
    var retainedOutbox = outboxRows.filter(function (item) { return !(item && item.kind === 'client_outbox' && text(item.device_id) === deviceId && (!text(item.workspace_id) || text(item.workspace_id) === workspaceId)); });
    (Array.isArray(value.queue) ? value.queue : []).forEach(function (item) { retainedOutbox.push(Object.assign({}, clone(item), { id:'outbox:' + workspaceId + ':' + text(item.idempotency_key), kind:'client_outbox', workspace_id:workspaceId, device_id:deviceId, schema_version:11 })); });
    outboxRows.splice.apply(outboxRows, [0, outboxRows.length].concat(retainedOutbox));
    var conflictRows = rows('v4_sync_conflicts');
    var beforeConflicts = clone(conflictRows);
    var retainedConflicts = conflictRows.filter(function (item) { return !(item && item.kind === 'client_conflict' && text(item.device_id) === deviceId && (!text(item.workspace_id) || text(item.workspace_id) === workspaceId)); });
    (Array.isArray(value.conflicts) ? value.conflicts : []).forEach(function (item) { var originalId = text(item && (item.original_conflict_id || item.id)); retainedConflicts.push(Object.assign({}, clone(item), { id:'client:' + workspaceId + ':' + deviceId + ':' + originalId, original_conflict_id:originalId, kind:'client_conflict', workspace_id:workspaceId, device_id:deviceId, schema_version:11 })); });
    conflictRows.splice.apply(conflictRows, [0, conflictRows.length].concat(retainedConflicts));
    var pending;
    try { pending = saveCustom(); } catch (error) { pending = Promise.reject(error); }
    var durable = Promise.resolve(pending).then(function (result) {
      if (result && result.ok === false) throw new Error(result.error || 'SYNC_STATE_SAVE_FAILED');
      return result || { ok:true };
    }).catch(async function (error) {
      revisionRows.splice.apply(revisionRows, [0, revisionRows.length].concat(clone(beforeRevisions)));
      outboxRows.splice.apply(outboxRows, [0, outboxRows.length].concat(clone(beforeOutbox)));
      conflictRows.splice.apply(conflictRows, [0, conflictRows.length].concat(clone(beforeConflicts)));
      try { await saveCustom(); } catch (_) {}
      throw error;
    });
    durable.catch(function () {});
    state().syncPersistPromise = durable;
    return durable;
  }
  function syncQrErrorMessage(error) {
    var code = text(error && (error.code || error.message)) || 'SYNC_PAIRING_QR_INVALID';
    var labels = { SYNC_PAIRING_QR_FORMAT_INVALID:'二维码内容不是辅导员工作台配对载荷', SYNC_PAIRING_QR_FIELD_INVALID:'二维码包含不支持的字段', SYNC_PAIRING_QR_VERSION_UNSUPPORTED:'二维码版本过旧或不受支持', SYNC_PAIRING_QR_HOST_INVALID:'二维码中的主机地址不是合法 HTTPS 地址', SYNC_PAIRING_QR_EXPIRED:'二维码已过期，请回到主机重新生成', SYNC_PAIRING_QR_CODE_INVALID:'二维码中的配对码格式不正确', SYNC_PAIRING_QR_FINGERPRINT_INVALID:'二维码中的证书指纹格式不正确' };
    return '二维码解析失败（' + code + '）：' + (labels[code] || '请确认内容完整后重试');
  }
  function syncStatusMarkup(status) { var value = status || {}; var syncLabel = value.syncing ? '正在同步' : value.connected ? '已连接主机' : value.last_error ? '同步需要处理' : '尚未连接'; var schedule = value.auto_sync ? '自动同步已开启' + (value.next_sync_at ? ' · 下次检查 ' + value.next_sync_at : '') : '自动同步未开启'; return '<div class="v48-sync-state ' + (value.connected ? 'is-ok' : value.last_error ? 'is-error' : '') + '"><span class="v48-state-dot"></span><div><strong>' + esc(syncLabel) + '</strong><div class="tiny">' + esc(value.base_url || '请填写主机地址') + (value.last_sync_at ? ' · 最近同步 ' + esc(value.last_sync_at) : '') + ' · ' + esc(schedule) + '</div></div><span class="sp"></span><span class="tag">队列 ' + esc(value.queued || 0) + ' · 冲突 ' + esc(value.conflicts || 0) + '</span></div>'; }

  function conflictValue(value) { if (value == null || value === '') return '空'; if (typeof value === 'string') return value; try { return JSON.stringify(value); } catch (_) { return String(value); } }
  function viewSync() {
    var s = state(); var client = s.syncClient; var status = client ? client.status() : Object.assign({}, s.syncState || {}); var conflicts = s.syncConflicts || []; var openConflicts = conflicts.filter(function (item) { return item.status === 'open'; });
    var queue = client ? (client.snapshot().queue || []) : [];
    var persistence = syncQueuePersistenceBoundary();
    var conflictRows = openConflicts.length ? openConflicts.map(function (item) { var fields = (item.fields || []).map(function (field) { return field.field + '：' + conflictValue(field.local) + ' → ' + conflictValue(field.incoming); }).join('；'); return '<div class="v48-conflict-row"><div><strong>' + esc(item.collection + ' / ' + item.record_id) + '</strong><div class="tiny">' + esc(fields || '字段差异待查看') + '</div></div><span class="sp"></span><button class="btn btn-sm" data-act="v48-conflict-choice" data-id="' + esc(item.id) + '" data-choice="local">保留本机</button><button class="btn btn-sm" data-act="v48-conflict-manual" data-id="' + esc(item.id) + '">手动编辑</button><button class="btn btn-sm btn-primary" data-act="v48-conflict-choice" data-id="' + esc(item.id) + '" data-choice="incoming">采用主机</button></div>'; }).join('') : empty('没有待处理冲突', '不同字段会自动合并；同字段冲突需要人工确认。');
    var queueRows = queue.length ? queue.map(function (item) { return '<div class="v48-list-row"><div><strong>' + esc(item.collection + ' / ' + item.record_id) + '</strong><div class="tiny">' + esc(Object.keys(item.patch || {}).join('、')) + ' · ' + esc(item.updated_at || '') + '</div></div><span class="tag tag-amber">待发送</span></div>'; }).join('') : empty('离线队列为空', '本地修改可以在主机恢复后继续提交。');
    var sync = s.syncState || {};
    var pairingId = text(status.pairing_request_id || sync.pairing_request_id);
    var autoSyncLabel = status.auto_sync ? '停止自动同步' : '开启自动同步';
    var draft = s.syncDraft || {};
    var pairingDraft = s.syncPairingDraft || {};
    var uploadState = s.syncUpload || {};
    var attachmentCard = '<section class="card"><div class="card-hd"><h2>附件传输</h2><span class="sp"></span><span class="tiny">HTTPS · 分块 · SHA-256</span></div><div class="card-bd"><form data-v48-attachment-upload class="v48-form-grid"><label>附件 ID（ASCII）<input class="inp" data-v48-field="attachment_id" value="' + esc(uploadState.attachment_id || '') + '" placeholder="例如 photo_20260821_01" required></label><label>选择附件<input class="inp" type="file" data-v48-attachment-file required></label><div class="v48-wide v48-form-actions"><button class="btn btn-primary" type="submit">上传并校验</button><span class="tiny" data-v48-upload-status>' + esc(uploadState.message || '未开始上传') + '</span></div></form><div class="hint">上传过程中断网可重新提交同一附件 ID 和文件，主机会从已收到的偏移继续。附件在主机磁盘上加密保存；业务记录仍只保存附件 ID。不要把密钥或明文学生数据放入外部存储。</div></div></section>';
    var syncGuide = '<section class="card v48-sync-guide"><div class="card-hd"><h2>同步只需三步</h2><span class="sp"></span><span class="tag">本机数据不直接共享 SQLite</span></div><div class="card-bd"><ol><li><strong>启动主机</strong><span>在桌面端打开局域网主机服务。</span></li><li><strong>完成配对</strong><span>扫码或粘贴配对信息，等待主机确认。</span></li><li><strong>开始同步</strong><span>连接成功后点击“立即同步”，离线修改会自动排队。</span></li></ol><div class="hint">同一局域网内使用；主机离线时保留加密队列，恢复连接后再提交。</div></div></section>';
    var qrCard = '<section class="card v48-qr-card"><div class="card-hd"><h2>扫码填充配对信息</h2><span class="sp"></span><span class="tag">不会自动连接</span></div><div class="card-bd"><form data-v48-sync-qr class="v48-form-grid"><label class="v48-wide">二维码文本 / 配对载荷<textarea class="inp" data-v48-field="qr_payload" rows="3" spellcheck="false" placeholder="粘贴 cwb://lan-pair?... 内容"></textarea></label><div class="v48-wide v48-form-actions"><button class="btn" type="button" data-act="v48-sync-qr-paste">从剪贴板读取</button><button class="btn btn-primary" type="submit">解析并填充</button></div></form><div class="hint">解析只会填充主机地址、工作区、一次性配对 ID、配对码和证书指纹；不会自动连接、自动信任证书，也不会保存二维码文本、配对码或设备令牌。请核对地址和指纹后再发送配对请求。</div></div></section>';
    var body = '<section class="v48-sync-grid"><div class="card"><div class="card-hd"><h2>连接数据中枢</h2><span class="sp"></span><span class="tag">证书指纹须核对</span></div><div class="card-bd"><form data-v48-sync-connect class="v48-form-grid"><label>主机 HTTPS 地址<input class="inp" data-v48-field="base_url" value="' + esc(draft.base_url || sync.base_url || '') + '" placeholder="https://192.168.1.10:port" required></label><label>工作区 ID<input class="inp" data-v48-field="workspace_id" value="' + esc(draft.workspace_id || sync.workspace_id || 'workspace-local') + '"></label><label>设备 ID<input class="inp" data-v48-field="device_id" value="' + esc(draft.device_id || sync.device_id || '') + '" placeholder="首次连接自动生成"></label><label>设备令牌<input class="inp" type="password" data-v48-field="token" value="' + esc(draft.token || '') + '" placeholder="只保存在本次会话"></label><label class="v48-wide">已确认的证书指纹<input class="inp" data-v48-field="fingerprint" value="' + esc(draft.fingerprint || sync.fingerprint || '') + '" placeholder="可粘贴主机显示的 SHA-256 指纹"></label><div class="v48-wide v48-form-actions"><button class="btn btn-primary" type="submit">连接并校验</button><button class="btn" type="button" data-act="v48-sync-now">立即同步</button><button class="btn" type="button" data-act="v48-sync-pull">仅拉取</button><button class="btn" type="button" data-act="v48-sync-flush">仅发送队列</button><button class="btn" type="button" data-act="v48-sync-auto-toggle">' + autoSyncLabel + '</button></div></form><div class="hint">客户端不会直接打开主机 SQLite。连接成功后自动检查并提交离线队列；证书指纹不一致时会停止同步。连接失败会保留表单、队列和可重试状态，令牌只留在当前页面会话。</div></div></div><div class="card"><div class="card-hd"><h2>请求配对</h2></div><div class="card-bd"><form data-v48-sync-pair class="v48-form-grid"><label>一次性配对 ID<input class="inp" data-v48-field="pairing_id" value="' + esc(pairingDraft.pairing_id || '') + '" required></label><label>配对码<input class="inp" data-v48-field="code" value="' + esc(pairingDraft.code || '') + '" inputmode="numeric" autocomplete="one-time-code" required></label><div class="v48-wide v48-form-actions"><button class="btn" type="submit">发送配对请求</button><button class="btn" type="button" data-act="v48-sync-pair-status">查询确认结果</button></div></form><div class="tiny">' + (pairingId ? '当前请求：' + esc(pairingId) + ' · 主机确认后点击“查询确认结果”获取一次性令牌。' : '配对请求提交后，必须回到主机端人工确认；确认后再查询结果获取令牌。') + '</div></div></div></section>' + qrCard + '<section class="card"><div class="card-hd"><h2>同步状态</h2><span class="sp"></span><button class="btn btn-sm" data-act="v48-sync-conflicts">刷新冲突</button></div><div class="card-bd">' + syncStatusMarkup(status) + '</div></section><section class="v48-sync-grid"><div class="card"><div class="card-hd"><h2>离线队列（' + esc(queue.length) + '） <span class="tag ' + esc(persistence.className) + '" data-v48-queue-storage="' + esc(persistence.tag) + '">' + esc(persistence.tag) + '</span></h2></div><div class="card-bd"><div class="banner ' + (persistence.className === 'tag-amber' ? 'banner-warn' : 'banner-info') + '" data-v48-queue-boundary><strong>' + esc(persistence.detail) + '</strong></div><form data-v48-sync-enqueue class="v48-form-grid"><label>集合<input class="inp" data-v48-field="collection" value="students" required></label><label>记录 ID<input class="inp" data-v48-field="record_id" required></label><label class="v48-wide">字段变更 JSON<textarea class="inp" data-v48-field="patch" rows="3" placeholder="{&quot;class_name&quot;:&quot;新班级&quot;}"></textarea></label><div class="v48-wide v48-form-actions"><button class="btn" type="submit">加入离线队列</button></div></form><div class="v48-list" style="margin-top:12px">' + queueRows + '</div></div></div><div class="card"><div class="card-hd"><h2>冲突收件箱（' + esc(openConflicts.length) + '）</h2></div><div class="card-bd"><div class="v48-list">' + conflictRows + '</div><div class="hint">“采用主机”“保留本机”或“手动编辑”都会写入冲突解决记录，并通过下一次拉取同步到其他设备；没有自动覆盖事实数据。</div></div></div></section>';
    body += attachmentCard;
    return page('局域网同步', '把手机、网页和其他桌面端接入同一台本地数据中枢；连接、队列和冲突都能在这里核对。', syncGuide + body, '<button class="btn" data-view="recovery">数据修复与恢复</button>');
  }

  function fieldCatalogView() {
    var s = state(); var query = text(s.fieldQuery).toLowerCase(); var fields = rows('v4_student_field_catalog').filter(function (item) { return !query || [item.name, item.label, item.type].join(' ').toLowerCase().includes(query); });
    var body = '<section class="card"><div class="card-hd"><h2>自定义字段</h2><span class="sp"></span><input class="inp v48-inline-search" data-v48-filter="fieldQuery" value="' + esc(s.fieldQuery || '') + '" placeholder="搜索字段名称或标签" aria-label="搜索自定义字段"><button class="btn btn-primary" data-act="v48-field-new">新增字段</button></div><div class="card-bd"><div class="hint">字段名使用英文下划线格式；敏感字段默认不进入 AI 和普通导出。删除字段不会删除学生记录中的历史值，请先确认学校数据迁移方案。</div><div class="v48-table-wrap"><table class="v48-table"><thead><tr><th>标签</th><th>字段名</th><th>类型</th><th>必填</th><th>敏感</th><th>选项</th><th>操作</th></tr></thead><tbody>' + (fields.length ? fields.map(function (item) { return '<tr><td><strong>' + esc(item.label) + '</strong></td><td><code>' + esc(item.name) + '</code></td><td>' + esc(item.type) + '</td><td>' + (item.required ? '是' : '否') + '</td><td>' + (item.sensitive ? '<span class="tag tag-red">敏感</span>' : '否') + '</td><td>' + esc((item.options || []).join('、') || '—') + '</td><td class="v48-actions"><button class="btn btn-sm" data-act="v48-field-edit" data-id="' + esc(item.id || item.name) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v48-field-delete" data-id="' + esc(item.id || item.name) + '">删除</button></td></tr>'; }).join('') : '<tr><td colspan="7">' + empty('还没有自定义字段', '新增字段后可在学生导入和档案编辑中使用。') + '</td></tr>') + '</tbody></table></div></div></section>';
    return page('学生字段中心', '让学校可以自己维护学生台账字段、选项和敏感边界，不再依赖改代码。', body, '<button class="btn" data-view="students">返回学生台账</button>');
  }

  function workCategoryForm(record) {
    var isNew = !record;
    var fields = [
      { key:'key', label:'分类键（英文下划线）', required:true },
      { key:'label', label:'显示名称', required:true },
      { key:'enabled', label:'在工作节点中启用', type:'checkbox' },
    ];
    var initial = Object.assign({ enabled:true }, record || {});
    openForm(isNew ? '新增工作节点分类' : '编辑工作节点分类', fields, initial, async function (value) {
      var catalog = v48.createWorkCategoryCatalog({ categories:rows('v4_work_categories') });
      var next;
      if (isNew) next = catalog.add(value);
      else next = catalog.update(record.key, value);
      next.source = 'school'; next.updated_at = new Date().toISOString();
      await persistCustomMutation(['v4_work_categories'], async function () { upsert('v4_work_categories', next); });
      await logAudit(isNew ? 'work_category_created' : 'work_category_updated', { category_id:next.id, category_key:next.key, label:next.label });
      render(); ui.toast(isNew ? '工作节点分类已添加' : '工作节点分类已更新', 'ok');
    });
  }

  function workCategoriesView() {
    var catalog = v48.createWorkCategoryCatalog({ categories:rows('v4_work_categories') });
    var categories = catalog.list(true);
    var body = '<section class="card"><div class="card-hd"><h2>工作节点分类</h2><span class="sp"></span><button class="btn btn-primary" data-act="v48-work-category-new">新增分类</button></div><div class="card-bd"><div class="hint">系统分类用于保持 43 号令职责口径；学校可以增加社区管理、劳动卫生等专项分类。系统分类不能删除，停用自定义分类不会删除已有节点记录。</div><div class="v48-table-wrap"><table class="v48-table"><thead><tr><th>名称</th><th>分类键</th><th>来源</th><th>状态</th><th>操作</th></tr></thead><tbody>' + (categories.length ? categories.map(function (item) { var custom = item.source !== 'system'; return '<tr><td><strong>' + esc(item.label) + '</strong></td><td><code>' + esc(item.key) + '</code></td><td>' + (custom ? '本校自定义' : '系统基线') + '</td><td>' + (item.enabled === false ? '<span class="tag tag-amber">已停用</span>' : '<span class="tag tag-green">启用</span>') + '</td><td>' + (custom ? '<button class="btn btn-sm" data-act="v48-work-category-edit" data-id="' + esc(item.key) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v48-work-category-delete" data-id="' + esc(item.key) + '">删除</button>' : '<span class="tiny">系统保护</span>') + '</td></tr>'; }).join('') : '<tr><td colspan="5">' + empty('还没有分类', '新增分类后会同时出现在工作节点新建和筛选中。') + '</td></tr>') + '</tbody></table></div></div></section>';
    return page('工作节点分类中心', '把学校的社区管理、劳动卫生和其他专项工作纳入统一节点分类，旧记录不会被重命名。', body, '<button class="btn" data-view="node">返回工作节点</button>');
  }

  function jointVisitModal() {
    var classes = [...new Set((DB.students || []).map(function (item) { return text(item.class_name); }).filter(Boolean))].sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
    var body = '<div class="banner banner-info">名单按所选日期计算学生当时班级、有效住宿安排和当天课表空课时。历史班级只按生效日期切换；没有课表记录显示“未记录”，不会当作全天空闲。</div><div class="v48-form-grid"><label>走访日期<input class="inp" type="date" data-v48-joint-date value="' + esc(today()) + '"></label><label>班级<select class="inp" data-v48-joint-class><option value="">全部班级</option>' + classes.map(function (item) { return '<option value="' + esc(item) + '">' + esc(item) + '</option>'; }).join('') + '</select></label></div><div data-v48-joint-result style="margin-top:14px"></div>';
    ui.modal({ title:'班级 / 宿舍 / 空课时联合走访', size:'wide', body:body, footer:'<button class="btn" data-close>关闭</button><button class="btn btn-primary" data-v48-joint-export>导出走访名单</button>', onOpen:function (mask) {
      function renderResult() {
        var result = v48.analysis.jointVisitCandidates({ date:mask.querySelector('[data-v48-joint-date]').value, class_name:mask.querySelector('[data-v48-joint-class]').value, students:DB.students || [], class_history:rows('v4_student_class_history'), dorm_assignments:rows('v4_dorm_assignments'), schedules:rows('v4_class_schedules') });
        mask._jointVisitResult = result;
        var rowsHtml = result.rows.map(function (item) { var dorm = item.dorm_assignment ? [item.dorm_assignment.building_id, item.dorm_assignment.room_id, item.dorm_assignment.bed_number].filter(Boolean).join(' / ') : '未分配'; var free = item.schedule_recorded ? (item.free_sections || []).join('、') + ' 节' : '未记录'; return '<tr><td><strong>' + esc(item.student_name || '未命名') + '</strong><div class="tiny">' + esc(item.student_number || '无学号') + '</div></td><td>' + esc(item.class_name || '未分班') + '</td><td>' + esc(dorm || '未分配') + '</td><td>' + esc(free || '无') + '</td><td>' + esc((item.lessons || []).map(function (lesson) { return lesson.course || '课程'; }).join('、') || '—') + '</td></tr>'; }).join('');
        mask.querySelector('[data-v48-joint-result]').innerHTML = '<div class="v4-stat-row"><div class="v4-stat"><span class="tiny">名单人数</span><b>' + esc(result.rows.length) + '</b></div><div class="v4-stat"><span class="tiny">有住宿记录</span><b>' + esc(result.rows.filter(function (item) { return item.dorm_assignment; }).length) + '</b></div><div class="v4-stat"><span class="tiny">有课表记录</span><b>' + esc(result.rows.filter(function (item) { return item.schedule_recorded; }).length) + '</b></div></div><div class="v48-table-wrap"><table class="v48-table"><thead><tr><th>学生</th><th>生效班级</th><th>住宿</th><th>空课时</th><th>当天课程</th></tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="5">' + empty('没有匹配学生', '可以更换日期或班级筛选。') + '</td></tr>') + '</tbody></table></div>';
      }
      renderResult();
      mask.querySelector('[data-v48-joint-date]').addEventListener('change', renderResult);
      mask.querySelector('[data-v48-joint-class]').addEventListener('change', renderResult);
      mask.querySelector('[data-v48-joint-export]').onclick = function () {
        var result = mask._jointVisitResult || { rows:[] }; var lines = [['姓名','学号','班级','住宿楼栋','房间','床位','空课时','当天课程']];
        result.rows.forEach(function (item) { var dorm = item.dorm_assignment || {}; lines.push([item.student_name, item.student_number, item.class_name, dorm.building_id || '', dorm.room_id || '', dorm.bed_number || '', item.schedule_recorded ? (item.free_sections || []).join('、') : '未记录', (item.lessons || []).map(function (lesson) { return lesson.course || ''; }).join('、')]); });
        if (typeof runtime.download === 'function') runtime.download('联合走访名单_' + (mask.querySelector('[data-v48-joint-date]').value || today()) + '.csv', runtime.toCSV(lines), 'text/csv', { collection:'v4_student_class_history', kind:'joint_visit_candidates', sensitive:true });
      };
    } });
  }

  function classHistoryView() {
    var allHistory = rows('v4_student_class_history').slice();
    var integrity = v48.analysis && typeof v48.analysis.classHistoryIntegrity === 'function' ? v48.analysis.classHistoryIntegrity({ students:DB.students || [], class_history:allHistory }) : { issues:[] };
    var issueIds = new Set((integrity.issues || []).map(function (item) { return String(item.id); }));
    var history = allHistory.sort(function (a, b) { return String(b.effective_date || '').localeCompare(String(a.effective_date || '')) || String(b.created_at || b.updated_at || '').localeCompare(String(a.created_at || a.updated_at || '')) || String(b.id || '').localeCompare(String(a.id || '')); });
    var integrityBanner = integrity.issues && integrity.issues.length ? '<div class="banner banner-warn">发现 ' + esc(integrity.issues.length) + ' 条班级历史链路需要人工核对。系统不会自动改写后续记录；请按“原班级 / 新班级 / 生效日期”确认后再删除或补录。</div>' : '';
    var body = '<section class="card"><div class="card-hd"><h2>动态分班记录</h2><span class="sp"></span><span class="tiny">当前班级由学生台账和日期历史共同确定；删除历史会同步校正当前班级快照</span><button class="btn" data-act="v48-joint-visit">联合走访名单</button><button class="btn btn-primary" data-act="v48-class-history-new">登记分班变更</button></div><div class="card-bd">' + integrityBanner + '<div class="v48-table-wrap"><table class="v48-table"><thead><tr><th>生效日期</th><th>学生</th><th>原班级</th><th>新班级</th><th>变更原因</th><th>状态</th><th>操作</th></tr></thead><tbody>' + (history.length ? history.map(function (item) { return '<tr><td>' + esc(item.effective_date || '未填') + '</td><td><strong>' + esc(labelForStudent(item.student_id)) + '</strong><div class="tiny">' + esc(item.student_id || '') + '</div></td><td>' + esc(item.from_class_name || item.previous_class_name || '—') + '</td><td>' + esc(item.to_class_name || item.class_name || '—') + '</td><td>' + esc(item.reason || '—') + '</td><td>' + (issueIds.has(String(item.id)) || item.chain_status === 'needs_reconciliation' ? '<span class="tag tag-amber">待核对</span>' : '<span class="tag tag-green">链路正常</span>') + '</td><td><button class="btn btn-sm btn-danger" data-act="v48-class-history-delete" data-id="' + esc(item.id) + '">删除并校正</button></td></tr>'; }).join('') : '<tr><td colspan="7">' + empty('还没有分班变更', '大类招生分流或转专业后，从这里登记学生的班级历史。') + '</td></tr>') + '</tbody></table></div></div></section><section class="card"><div class="card-hd"><h2>当前班级概览</h2></div><div class="card-bd"><div class="v48-class-overview">' + Object.entries((DB.students || []).reduce(function (map, item) { var key = text(item.class_name) || '未分班'; map[key] = (map[key] || 0) + 1; return map; }, {})).sort(function (a, b) { return b[1] - a[1]; }).map(function (item) { return '<div><strong>' + esc(item[0]) + '</strong><span>' + esc(item[1]) + ' 人</span></div>'; }).join('') + '</div></div></section>';
    return page('动态分班', '记录学生从原班级到新班级的生效时间和原因，便于和宿舍、课表、走访名单一起查询。', body, '<button class="btn" data-view="students">打开学生台账</button>');
  }

  function contentContext() {
    var settings = DB.settings || {}; var sync = state().syncState || {};
    return { workspace_id:text(sync.workspace_id || settings.workspace_id || 'workspace-local'), college:text(settings.college_name || settings.college || ''), grade:text(settings.grade_name || settings.grade || ''), class_name:text(settings.class_name || '') };
  }
  function contentActor(overrides) {
    var settings = DB.settings || {}; var value = Object.assign({
      id:text(settings.operator_id || settings.counselor_name || 'local-teacher') || 'local-teacher',
      name:text(settings.counselor_name || '本机辅导员') || '本机辅导员',
      role:text(settings.content_role || settings.workspace_role || 'content_editor') || 'content_editor',
    }, overrides || {});
    if (!v48.CONTENT_ROLES || v48.CONTENT_ROLES.indexOf(value.role) < 0) value.role = 'content_editor';
    return value;
  }
  function contentRoleLabel(role) {
    return v48.CONTENT_ROLE_LABELS && v48.CONTENT_ROLE_LABELS[role] || role || '未设置';
  }
  function contentService(actor) {
    return v48.createContentPushService({ pushes:rows('v4_content_pushes'), reads:rows('v4_content_reads'), actor:actor || contentActor(), audit:function (action, details) { return logAudit(action, details); } });
  }
  function contentScopeLabel(scope) {
    var value = scope && typeof scope === 'object' ? scope : {}; var labels = [['workspace_id', '工作区'], ['college', '学院'], ['grade', '年级'], ['class_name', '班级']];
    var output = labels.filter(function (item) { return text(value[item[0]]); }).map(function (item) { return item[1] + '：' + value[item[0]]; });
    return output.join(' · ') || '当前工作区';
  }
  function contentPushView() {
    var actor = contentActor(); var service = contentService(actor); var currentContext = contentContext(); var pushes;
    try { pushes = service.listAll(actor, currentContext); } catch (_) { pushes = service.list(currentContext, undefined, actor); }
    var reads = rows('v4_content_reads').filter(function (row) { return actor.role === 'workspace_admin' || String(row.reader_id) === String(actor.id); }); var roleState = contentRoleLabel(actor.role);
    var body = '<section class="v48-split"><div class="card"><div class="card-hd"><h2>发布本地内容</h2><span class="sp"></span><span class="tag tag-blue">当前角色：' + esc(roleState) + '</span></div><div class="card-bd"><form data-v48-content-form class="v48-form-grid"><label>标题<input class="inp" data-v48-field="title" required></label><div class="v48-role-note"><span class="tiny">操作身份</span><strong>' + esc(actor.name) + '</strong><small>角色由当前工作区设置提供，不能在发布表单中临时切换。</small></div><label>工作区 ID<input class="inp" data-v48-field="scope_workspace_id" value="' + esc(currentContext.workspace_id) + '" placeholder="默认当前工作区"></label><label>适用学院<input class="inp" data-v48-field="scope_college" placeholder="留空表示全部学院"></label><label>适用年级<input class="inp" data-v48-field="scope_grade" placeholder="如：2026级"></label><label>适用班级<input class="inp" data-v48-field="scope_class_name" placeholder="留空表示全部班级"></label><label>可见角色（逗号分隔）<input class="inp" data-v48-field="audience_roles" placeholder="留空表示所有已授权角色"></label><label class="v48-wide">正文<textarea class="inp" data-v48-field="body" rows="9" required placeholder="政策提醒、模板更新或工作通知"></textarea></label><label>发布时间<input class="inp" type="datetime-local" data-v48-field="available_from"></label><label>撤回时间<input class="inp" type="datetime-local" data-v48-field="retract_at"></label><div class="v48-wide v48-form-actions"><button class="btn btn-primary" type="submit">发布到本地工作区</button><button class="btn" type="button" data-act="v48-content-import">导入内容包</button><button class="btn" type="button" data-act="v48-content-export">导出内容包</button></div></form><div class="hint">内容推送只属于当前工作区，不共享学生明细。范围和角色只决定已授权本地操作者的可见性；当前角色是本地工作区策略标签，不替代系统账号认证。导入、发布、撤回和已读都会保留最小审计记录。</div></div></div><div class="card"><div class="card-hd"><h2>内容列表</h2><span class="sp"></span><span class="tiny">已读 ' + esc(reads.length) + ' 条 · 当前角色：' + esc(roleState) + ' · 范围：' + esc(contentScopeLabel(currentContext)) + '</span></div><div class="card-bd"><div class="v48-list">' + (pushes.length ? pushes.map(function (item) { var read = reads.some(function (row) { return row.push_id === item.id && row.reader_id === actor.id; }); var visible = service.list(currentContext, undefined, actor).some(function (row) { return row.id === item.id; }); var canRetract = service.can('retract', actor, item); return '<div class="v48-list-row"><div><strong>' + esc(item.title) + '</strong><div class="tiny">' + esc(item.published_at || '') + ' · ' + esc(contentScopeLabel(item.scope)) + (item.audience_roles && item.audience_roles.length ? ' · 角色：' + esc(item.audience_roles.map(contentRoleLabel).join('、')) : '') + ' · ' + esc(item.status === 'retracted' ? '已撤回' : read ? '本人已读' : '未读') + (visible ? '' : ' · <span class="tag tag-amber">当前角色或范围不可见</span>') + '</div><p class="v48-clamp">' + esc(item.body) + '</p></div><span class="sp"></span>' + (item.status === 'published' && !read && visible ? '<button class="btn btn-sm" data-act="v48-content-read" data-id="' + esc(item.id) + '">标记已读</button>' : '') + (item.status === 'published' && canRetract ? '<button class="btn btn-sm btn-danger" data-act="v48-content-retract" data-id="' + esc(item.id) + '">撤回</button>' : '') + '</div>'; }).join('') : empty('还没有本地推送', '把政策、模板和阶段提醒集中发给当前工作区。')) + '</div></div></div></section>';
    return page('政策与资料推送', '不等待版本更新即可把本地政策、模板和工作提醒触达给当前工作区。', body, '<button class="btn" data-view="policy">查看政策智库</button>');
  }

  function formCenterView() {
    var templates = rows('v4_form_templates'); var jobs = rows('v4_form_jobs').slice().sort(function (a, b) { return String(b.created_at || '').localeCompare(String(a.created_at || '')); });
    var body = '<section class="v48-split"><div class="card"><div class="card-hd"><h2>模板基线</h2><span class="sp"></span><button class="btn btn-primary" data-act="v48-form-template-new">新增模板</button></div><div class="card-bd"><div class="v48-list">' + (templates.length ? templates.map(function (item) { return '<div class="v48-list-row"><div><strong>' + esc(item.name) + '</strong><div class="tiny">' + esc(item.purpose || '未填写用途') + ' · v' + esc(item.version || 1) + ' · ' + (item.template_attachment_id ? 'DOCX 已关联' : '仅字段清单') + '</div><div class="tiny">支持字段：' + esc((item.fields || []).join('、') || '未配置') + '</div></div><div class="v48-form-actions"><button class="btn btn-sm" data-act="v48-form-template-edit" data-id="' + esc(item.id) + '">编辑</button>' + (item.template_attachment_id ? '<button class="btn btn-sm" data-act="v48-form-reverse" data-id="' + esc(item.id) + '">反向汇总</button>' : '') + '<button class="btn btn-sm btn-primary" data-act="v48-form-job-new" data-id="' + esc(item.id) + '">生成任务</button></div></div>'; }).join('') : empty('还没有模板', '先上传受支持的 DOCX 模板，或建立字段清单。')) + '</div><div class="hint">只处理明确配置的 {{student.xxx}} 占位符或 Word 内容控件。反向汇总只读取内容控件，不会猜测任意 Word 文本，也不会自动覆盖学生事实。</div></div></div><div class="card"><div class="card-hd"><h2>生成任务</h2><span class="sp"></span><span class="tiny">先预览缺失字段，再人工确认导出</span></div><div class="card-bd"><div class="v48-list">' + (jobs.length ? jobs.map(function (item) { var template = templates.find(function (row) { return String(row.id) === String(item.template_id); }); return '<div class="v48-list-row"><div><strong>' + esc(item.template_name || item.template_id) + '</strong><div class="tiny">' + esc(item.created_at || '') + ' · ' + esc(item.scope_label || '当前筛选') + ' · ' + esc(item.status || '草稿') + (item.missing_count ? ' · 缺失 ' + esc(item.missing_count) + ' 人' : '') + '</div></div><div class="v48-form-actions">' + (template && template.template_attachment_id ? '<button class="btn btn-sm btn-primary" data-act="v48-form-job-generate" data-id="' + esc(item.id) + '">预览并生成 Word</button>' : '') + '<button class="btn btn-sm" data-act="v48-form-job-export" data-id="' + esc(item.id) + '">导出字段清单</button></div></div>'; }).join('') : empty('还没有生成任务', '生成任务后可继续接入学校模板和打印工作包。')) + '</div></div></div></section>';
    return page('一生一表与模板中心', '管理版本化模板、字段映射和批量生成任务；每次生成都保留来源和范围。', body, '<button class="btn" data-view="tpl">打开模板库</button>');
  }

  function viewRecovery() {
    var s = state(); var health = s.repositoryHealth || {}; var location = s.dataLocation || {};
    var checks = health.checks ? Object.entries(health.checks).map(function (item) { return '<div class="v48-health-row"><strong>' + esc(item[0]) + '</strong><span class="tag ' + (item[1] && item[1].ok ? 'tag-green' : 'tag-red') + '">' + (item[1] && item[1].ok ? '正常' : '需处理') + '</span><small>' + esc(item[1] && (item[1].code || item[1].message || '') || '') + '</small></div>'; }).join('') : empty('尚未诊断', '诊断不会修改数据。');
    var body = '<section class="v48-split"><div class="card"><div class="card-hd"><h2>仓储健康检查</h2><span class="sp"></span><button class="btn btn-primary" data-act="v48-health">立即诊断</button></div><div class="card-bd"><div class="v48-health-list">' + checks + '</div><div class="hint">密钥损坏、SQLite/WAL 损坏或附件索引异常时，不要删除原数据；先保留错误码并使用恢复包或历史备份。</div></div></div><div class="card"><div class="card-hd"><h2>数据目录</h2><span class="sp"></span><button class="btn" data-act="v48-location">刷新位置</button></div><div class="card-bd"><div class="v48-location"><div><span>程序目录</span><strong>' + esc(location.install_path || '未读取') + '</strong></div><div><span>工作区数据目录</span><strong>' + esc(location.path || '未读取') + '</strong></div></div><div class="v48-form-actions"><button class="btn" data-act="v48-migrate-data">迁移数据目录</button><button class="btn" data-act="v48-recovery-export">导出恢复包</button><button class="btn" data-act="v48-recovery-import">导入恢复包</button></div></div></div></section>';
    return page('数据修复与恢复', '诊断、迁移和恢复都先验证再提交；失败时保留当前有效数据并回滚。', body, '<button class="btn" data-view="bridge">返回平台联动</button>');
  }

  function fieldForm(record) {
    var isNew = !record;
    openForm(isNew ? '新增学生自定义字段' : '编辑学生自定义字段', [
      { key:'name', label:'字段名（英文下划线）', required:true, ph:'如 research_status' },
      { key:'label', label:'显示标签', required:true },
      { key:'type', label:'数据类型', type:'select', options:[{v:'text',n:'文本'},{v:'number',n:'数字'},{v:'date',n:'日期'},{v:'boolean',n:'是/否'},{v:'select',n:'选项'},{v:'multiline',n:'多行文本'}] },
      { key:'options', label:'选项（逗号分隔）', ph:'仅选项类型填写' }, { key:'sensitive', label:'敏感字段', type:'checkbox' }, { key:'required', label:'必填字段', type:'checkbox' },
    ], Object.assign({ type:'text', sensitive:false, required:false }, record || {}), async function (value) {
      var name = text(value.name); if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error('字段名必须以英文字母开头，只能包含字母、数字和下划线');
      var list = rows('v4_student_field_catalog'); var duplicate = list.some(function (item) { return item.name === name && (!record || item.id !== record.id); }); if (duplicate) throw new Error('字段名已经存在');
      var next = Object.assign({}, record || {}, value, { id:record && record.id || recordId('field'), name:name, options:text(value.options).split(/[,，]/).map(text).filter(Boolean), updated_at:new Date().toISOString() });
      if (next.type !== 'select') next.options = [];
      await persistCustomMutation(['v4_student_field_catalog'], async function () { upsert('v4_student_field_catalog', next); }); await logAudit(isNew ? 'student_field_catalog_created' : 'student_field_catalog_updated', { field_id:next.id, field_name:next.name, sensitive:Boolean(next.sensitive) }); render(); ui.toast(isNew ? '自定义字段已添加' : '自定义字段已更新', 'ok');
    });
  }
  function classHistoryForm(record) {
    var isNew = !record;
    openForm(isNew ? '登记分班变更' : '编辑分班变更', [
      { key:'student_id', label:'学生', type:'select', required:true, options:studentOptions(record && record.student_id) },
      { key:'class_name', label:'新班级', required:true }, { key:'effective_date', label:'生效日期', type:'date', required:true }, { key:'reason', label:'变更原因', type:'textarea', rows:3, hint:'历史补录不会自动改写更晚的班级记录；保存前会提示是否需要核对链路。' },
    ], Object.assign({ effective_date:today() }, record || {}), async function (value) {
      var student = (DB.students || []).find(function (item) { return String(item.id || item.student_id) === String(value.student_id); }); if (!student) throw new Error('找不到对应学生');
      var date = text(value.effective_date); var all = rows('v4_student_class_history'); var existing = all.filter(function (item) { return !record || String(item.id) !== String(record.id); });
      var previous = v48.analysis && typeof v48.analysis.activeClassAtDate === 'function' ? v48.analysis.activeClassAtDate(student, existing, date) : text(student.class_name);
      var targetClass = text(value.class_name); if (!targetClass) throw new Error('请填写新班级'); if (previous === targetClass) throw new Error('新班级与该日期已有班级相同，无需重复登记');
      var before = Object.assign({}, student, { class_name:previous }); var after = Object.assign({}, student, { class_name:targetClass });
      var next = v48.studentImport.buildClassHistory(before, after, { effective_date:date, reason:text(value.reason) || '手工补录分班变更', source:'manual', operator:text(DB.settings && DB.settings.counselor_name) || 'local-user' });
      if (!next) throw new Error('无法生成班级历史，请检查学生和班级');
      next.id = record && record.id || recordId('class_history'); next.chain_status = existing.some(function (item) { return text(item.effective_date) > date; }) ? 'needs_reconciliation' : 'ok'; next.updated_at = new Date().toISOString();
      var duplicate = existing.some(function (item) { return String(item.student_id) === String(next.student_id) && text(item.effective_date) === date && text(item.from_class_name || item.previous_class_name) === text(next.from_class_name) && text(item.to_class_name || item.class_name) === text(next.to_class_name); });
      if (duplicate) throw new Error('相同学生、日期和班级变更已经存在，请勿重复登记');
      var hasLater = existing.some(function (item) { return text(item.student_id) === String(next.student_id) && text(item.effective_date) > date; });
      var liveLinkSnapshot = root.CWB && root.CWB.students && typeof root.CWB.students.liveLinkSnapshot === 'function' ? root.CWB.students.liveLinkSnapshot([student]) : [];
      var liveLinkChanges = { changed:0, collections:[] };
      await persistStudentsAndCustomMutation(async function () {
        upsert('v4_student_class_history', next);
        if (!hasLater) {
          student.class_name = targetClass;
          student.updated_at = new Date().toISOString();
          if (root.CWB && root.CWB.students && typeof root.CWB.students.syncLiveLinks === 'function') liveLinkChanges = root.CWB.students.syncLiveLinks(student);
        }
      }, { extraBaseCollections:!hasLater ? ['tasks'] : [], liveLinkSnapshot:liveLinkSnapshot });
      await logAudit(isNew ? 'student_class_history_created' : 'student_class_history_updated', { record_id:next.id, student_id:next.student_id, previous_class_name:next.previous_class_name || '', class_name:next.class_name || '', chain_status:next.chain_status, live_link_updates:liveLinkChanges.changed });
      render();
      var liveText = liveLinkChanges.changed ? '；已同步 ' + liveLinkChanges.changed + ' 条进行中事项' : '';
      ui.toast(hasLater ? '历史分班已保存；存在更晚记录，当前班级未自动改写，请核对链路' : '班级变更已保存，学生台账已同步更新' + liveText, hasLater ? 'warn' : 'ok', 5000);
    });
  }
  async function readDocxXml(value) {
    if (!root.JSZip || typeof root.JSZip.loadAsync !== 'function') throw new Error('ZIP_PARSER_UNAVAILABLE');
    var zip = await root.JSZip.loadAsync(value, { checkCRC32:true });
    var file = zip.file('word/document.xml');
    if (!file) throw new Error('DOCX_DOCUMENT_XML_MISSING');
    return { zip:zip, xml:await file.async('string') };
  }
  async function templateBlob(record) {
    if (!record || !record.template_attachment_id) throw new Error('FORM_TEMPLATE_ATTACHMENT_REQUIRED');
    var attachment = root.CWB && root.CWB.attachments && await root.CWB.attachments.get(record.template_attachment_id);
    var blob = attachment && attachment.blob;
    if (!blob && root.cwbDesktop && root.cwbDesktop.readAttachment) blob = new Blob([await root.cwbDesktop.readAttachment(record.template_attachment_id)], { type:record.mime_type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    if (!blob) throw new Error('FORM_TEMPLATE_ATTACHMENT_UNAVAILABLE');
    return blob;
  }
  function templateDeclaredFields(value) {
    return text(value || '').split(/[,，\n]/).map(text).filter(Boolean).map(function (field) { return field.indexOf('student.') === 0 ? field : 'student.' + field; });
  }
  function formTemplateForm(record) {
    var fields = [
      { key:'name', label:'模板名称', required:true }, { key:'purpose', label:'使用场景' }, { key:'version', label:'版本号', type:'number' },
      { key:'fields', label:'支持字段（逗号分隔）', type:'textarea', rows:3, ph:'student.full_name,student.student_number', hint:'可留空，系统会从 {{student.xxx}} 占位符或 Word 内容控件中提取。' },
      { key:'placeholder_style', label:'模板方式', type:'select', options:[{v:'mustache',n:'{{student.full_name}} 占位符'},{v:'content-control',n:'Word 内容控件（需设置别名或标签）'}] },
      { key:'template_file', label:record && record.template_attachment_id ? '替换 DOCX 模板（可选）' : '上传 DOCX 模板', type:'file', accept:'.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', hint:'只支持 DOCX；占位符必须完整位于同一个 Word 文本片段中。不会尝试猜测任意 Word 表格。' },
    ];
    openForm(record ? '编辑模板' : '新增模板', fields, Object.assign({ version:1, placeholder_style:'mustache', fields:'' }, record || {}, { fields:Array.isArray(record && record.fields) ? record.fields.join(',') : record && record.fields || '' }), async function (value) {
      var nextId = record && record.id || recordId('form_template'); var files = Array.isArray(value.template_file) ? value.template_file : []; delete value.template_file;
      var declared = templateDeclaredFields(value.fields); var inspected = null; var newAttachmentId = '';
      if (files.length) {
        inspected = await readDocxXml(files[0]);
        var validation = v48.forms.validateTemplate({ fields:declared }, inspected.xml);
        if (!validation.valid) throw new Error('模板字段不完整或格式不受支持：' + (validation.invalid || validation.missing_from_declaration || []).join('、'));
        declared = validation.fields;
      }
      if (!declared.length && record && Array.isArray(record.fields)) declared = record.fields.slice();
      if (!declared.length) throw new Error('请填写支持字段或上传包含占位符/内容控件的 DOCX 模板');
      var next = Object.assign({}, record || {}, value, { id:nextId, version:Number(value.version || 1), fields:declared, created_at:record && record.created_at || new Date().toISOString(), updated_at:new Date().toISOString(), schema_version:11 });
      try {
        if (files.length) {
          var ids = await runtime.storeBusinessAttachments([files[0]], nextId, { prefix:'form_template' }); newAttachmentId = ids[0] || '';
          if (!newAttachmentId) throw new Error('ATTACHMENT_REPOSITORY_UNAVAILABLE');
          next.template_attachment_id = newAttachmentId; next.template_attachment_name = files[0].name || '模板.docx'; next.mime_type = files[0].type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; next.source_format = 'docx';
          next.placeholder_style = inspected && inspected.xml.indexOf('<w:sdt') >= 0 && inspected.xml.indexOf('{{student.') < 0 ? 'content-control' : 'mustache';
        }
        await persistCustomMutation(['v4_form_templates'], async function () { upsert('v4_form_templates', next); });
        if (record && record.template_attachment_id && newAttachmentId && record.template_attachment_id !== newAttachmentId && root.CWB && root.CWB.attachments && root.CWB.attachments.delete) await root.CWB.attachments.delete(record.template_attachment_id).catch(function () {});
        await logAudit(record ? 'form_template_updated' : 'form_template_created', { template_id:next.id, version:next.version, fields:next.fields, attachment_id:next.template_attachment_id || '' }); render(); ui.toast(next.template_attachment_id ? 'DOCX 模板已保存并完成字段校验' : '模板字段已保存', 'ok');
      } catch (error) {
        if (newAttachmentId && runtime.removeBusinessAttachments) await runtime.removeBusinessAttachments([newAttachmentId]).catch(function () {});
        throw error;
      }
    });
  }
  function safeFormFileName(value, fallback) { return text(value || fallback || '学生').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 80) || fallback || '学生'; }
  async function renderStudentDocx(blob, template, student) {
    var loaded = await readDocxXml(blob); var validation = v48.forms.validateTemplate(template, loaded.xml); if (!validation.valid) throw new Error('FORM_TEMPLATE_INVALID');
    var rendered = v48.forms.renderXml(loaded.xml, student); loaded.zip.file('word/document.xml', rendered.xml); return { bytes:await loaded.zip.generateAsync({ type:'uint8array', compression:'DEFLATE' }), missing:rendered.missing };
  }
  async function generateFormJobFiles(job, template, students, rowsForPreview) {
    var blob = await templateBlob(template); var outer = students.length > 1 ? new root.JSZip() : null; var missing = [];
    for (var index = 0; index < students.length; index += 1) {
      var student = students[index]; var result = await renderStudentDocx(blob, template, student); if (result.missing.length) missing.push({ student_id:student.id || student.student_id, fields:result.missing });
      var filename = safeFormFileName([student.student_number, student.full_name].filter(Boolean).join('_'), 'student_' + (index + 1)) + '.docx';
      if (outer) outer.file(filename, result.bytes); else runtime.download(filename, result.bytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { collection:'v4_form_jobs', kind:'form_docx_generate', sensitive:true });
    }
    if (outer) runtime.download('一生一表_' + today() + '.zip', await outer.generateAsync({ type:'uint8array', compression:'DEFLATE' }), 'application/zip', { collection:'v4_form_jobs', kind:'form_docx_batch_generate', sensitive:true });
    await persistCustomMutation(['v4_form_jobs'], async function () { var current = rows('v4_form_jobs').find(function (item) { return String(item.id) === String(job.id); }); if (current) Object.assign(current, { status:'已生成', generated_at:new Date().toISOString(), generated_count:students.length, missing_count:missing.length, missing_fields:missing }); });
    await logAudit('form_job_docx_generated', { job_id:job.id, template_id:template.id, student_count:students.length, missing_count:missing.length }); render(); ui.toast(missing.length ? 'Word 已生成，但有字段为空，请核对缺失清单' : 'Word 工作包已生成', missing.length ? 'warn' : 'ok', 4200);
  }
  function formJobPreview(id) {
    var job = rows('v4_form_jobs').find(function (item) { return String(item.id) === String(id); }); var template = job && rows('v4_form_templates').find(function (item) { return String(item.id) === String(job.template_id); }); if (!job || !template) return ui.toast('模板任务不存在', 'warn');
    var students = (job.selected_student_ids || []).map(function (studentId) { return (DB.students || []).find(function (student) { return String(student.id || student.student_id) === String(studentId); }); }).filter(Boolean);
    var merged = v48.forms.mergeRows(template, students); var missing = merged.filter(function (item) { return !item.ready; });
    var missingHtml = missing.length ? '<div class="banner banner-warn">有 ' + missing.length + ' 名学生存在空字段，生成后会保留空白，请在下方确认。</div><div class="v48-table-wrap"><table class="v48-table"><thead><tr><th>学生</th><th>缺失字段</th></tr></thead><tbody>' + missing.slice(0, 30).map(function (item) { return '<tr><td>' + esc([item.full_name, item.student_number].filter(Boolean).join(' · ')) + '</td><td>' + esc(item.missing.join('、')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="banner banner-info">字段完整性检查通过，生成后仍建议人工抽查版式和内容。</div>';
    ui.modal({ title:'生成一生一表 · 预览', size:'wide', body:'<div class="tiny">模板：' + esc(template.name) + ' · 学生：' + students.length + ' 人 · 字段：' + esc((template.fields || []).join('、')) + '</div>' + missingHtml, footer:'<button class="btn" data-close>取消</button><button class="btn btn-primary" data-v48-form-generate>确认生成 Word</button>', onOpen:function (mask, close) { mask.querySelector('[data-v48-form-generate]').onclick = function () { close(); runtime.requireSensitiveExport('一生一表 Word 工作包', { scope:template.name + ' · ' + students.length + ' 名学生', fields:template.fields || [], collection:'v4_form_jobs', kind:'form_docx_generate' }, function () { return generateFormJobFiles(job, template, students, merged); }); }; } });
  }
  function formReverseAction(id) {
    var template = rows('v4_form_templates').find(function (item) { return String(item.id) === String(id); }); if (!template) return;
    var input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'; input.onchange = async function () { var files = Array.from(input.files || []); if (!files.length) return; try {
      var parsed = []; var fieldSet = new Set();
      for (var index = 0; index < files.length; index += 1) { var loaded = await readDocxXml(files[index]); var controls = v48.forms.readContentControls(loaded.xml); var row = { source_file:files[index].name }; controls.forEach(function (item) { row[item.field] = item.value; fieldSet.add(item.field); }); parsed.push(row); }
      var fields = ['source_file'].concat(Array.from(fieldSet).sort()); var lines = [fields].concat(parsed.map(function (row) { return fields.map(function (field) { return row[field] || ''; }); }));
      var conflictCount = parsed.reduce(function (count, row) { var studentId = row['student.student_id'] || ''; var number = row['student.student_number'] || ''; var current = (DB.students || []).find(function (student) { return studentId && String(student.id || student.student_id) === String(studentId) || number && String(student.student_number) === String(number); }); if (!current) return count; var incoming = {}; Object.keys(row).filter(function (key) { return key.indexOf('student.') === 0; }).forEach(function (key) { incoming[key] = row[key]; }); return count + (v48.forms.previewReverse(current, incoming).conflicts.length ? 1 : 0); }, 0);
      ui.modal({ title:'Word 反向汇总预览', size:'wide', body:'<div class="banner ' + (conflictCount ? 'banner-warn' : 'banner-info') + '">已读取 ' + parsed.length + ' 个受支持的 Word 文件，识别到 ' + fieldSet.size + ' 个内容控件字段。' + (conflictCount ? '有 ' + conflictCount + ' 行与现有学生资料存在差异，导出不会自动覆盖。' : '') + '</div><div class="tw" style="max-height:340px;overflow:auto"><table><thead><tr>' + fields.map(function (field) { return '<th>' + esc(field) + '</th>'; }).join('') + '</tr></thead><tbody>' + parsed.slice(0, 30).map(function (row) { return '<tr>' + fields.map(function (field) { return '<td>' + esc(row[field] || '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>', footer:'<button class="btn" data-close>取消</button><button class="btn btn-primary" data-v48-form-reverse-export>导出结构化 CSV</button>', onOpen:function (mask, close) { mask.querySelector('[data-v48-form-reverse-export]').onclick = function () { close(); runtime.requireSensitiveExport('一生一表反向汇总', { scope:template.name + ' · ' + parsed.length + ' 个 Word 文件', fields:fields, collection:'v4_form_jobs', kind:'form_reverse_export' }, function () { runtime.download('一生一表反向汇总_' + today() + '.csv', runtime.toCSV(lines), 'text/csv', { collection:'v4_form_jobs', kind:'form_reverse_export', sensitive:true }); ui.toast('结构化 CSV 已导出；差异字段未自动写回学生事实', 'ok', 3600); }); }; } });
    } catch (error) { ui.toast(error.message || 'Word 反向读取失败：请确认文件使用受支持的内容控件', 'err', 5200); } }; input.click();
  }
  function conflictManualForm(conflict) {
    var fields = (conflict && conflict.fields || []).map(function (item) { return item.field; }).filter(Boolean);
    var values = {}; (conflict && conflict.fields || []).forEach(function (item) { values[item.field] = item.local; });
    var initial = JSON.stringify(values, null, 2);
    ui.modal({ title:'手动处理同步冲突', size:'wide', body:'<div class="banner banner-warn">只编辑下面列出的冲突字段。确认后会生成新的主机修订，其他设备仍需重新拉取；不要把学生事实当作“最后修改自动获胜”。</div><div class="tiny" style="margin-bottom:8px">' + esc(conflict.collection + ' / ' + conflict.record_id) + ' · 冲突字段：' + esc(fields.join('、') || '未识别') + '</div><textarea class="inp" data-v48-conflict-values rows="10" spellcheck="false">' + esc(initial) + '</textarea><div class="hint">请输入合法 JSON 对象；空字符串表示明确清空字段。除冲突字段外的键会被拒绝。</div>', footer:'<button class="btn" data-close>取消</button><button class="btn btn-primary" data-v48-conflict-manual-save>保存手动选择</button>', onOpen:function (mask, close) { var button = mask.querySelector('[data-v48-conflict-manual-save]'); button.onclick = async function () { if (button.disabled) return; var parsed; try { parsed = JSON.parse(mask.querySelector('[data-v48-conflict-values]').value || '{}'); } catch (_) { ui.toast('手动选择必须是合法 JSON 对象', 'warn', 4200); return; } if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { ui.toast('手动选择必须是 JSON 对象', 'warn', 4200); return; } var unknown = Object.keys(parsed).filter(function (key) { return fields.indexOf(key) < 0; }); if (unknown.length) { ui.toast('包含非冲突字段：' + unknown.join('、'), 'warn', 4200); return; } button.disabled = true; button.textContent = '保存中…'; try { var client = syncClient(); if (!client.status().connected) throw new Error('请先连接数据中枢'); await client.resolveConflict(conflict.id, { mode:'manual', values:parsed }); await logAudit('sync_conflict_resolved_ui', { conflict_id:conflict.id, collection:conflict.collection, record_id:conflict.record_id, mode:'manual', fields:fields }); try { state().syncConflicts = await client.listConflicts(); } catch (_) { state().syncConflicts = (state().syncConflicts || []).map(function (item) { return String(item.id) === String(conflict.id) ? Object.assign({}, item, { status:'resolved', resolution:{ mode:'manual' } }) : item; }); close(); render(); ui.toast('手动冲突已提交，但收件箱刷新失败；下次连接会重新核对', 'warn', 5200); return; } close(); render(); ui.toast('手动冲突处理已保存，等待其他设备拉取', 'ok'); } catch (error) { ui.toast(error.message || '手动冲突处理失败，当前选择未提交', 'err', 5200); } finally { if (button.isConnected) { button.disabled = false; button.textContent = '保存手动选择'; } } }; } });
  }
  function contentFormSubmit(form) {
    var value = formValues(form, ['title', 'body', 'audience_roles', 'scope_workspace_id', 'scope_college', 'scope_grade', 'scope_class_name', 'available_from', 'retract_at']); var scope = {};
    [['workspace_id', 'scope_workspace_id'], ['college', 'scope_college'], ['grade', 'scope_grade'], ['class_name', 'scope_class_name']].forEach(function (item) { if (text(value[item[1]])) scope[item[0]] = text(value[item[1]]); });
    var actor = contentActor(); var service = contentService(actor); var next = service.publish({ title:value.title, body:value.body, scope:scope, audience_roles:value.audience_roles, available_from:value.available_from, retract_at:value.retract_at }, actor);
    return persistCustomMutation(['v4_content_pushes'], async function () { rows('v4_content_pushes').push(next); }).then(async function () { DB.settings.content_role = actor.role; await awaitTrackedSave(save('settings')); await logAudit('content_push_published_ui', { push_id:next.id, title:next.title, scope:next.scope || {}, actor_role:actor.role, audience_roles:next.audience_roles || [] }); form.reset(); render(); ui.toast('内容已发布到当前工作区', 'ok'); });
  }
  function exportContentPackage() {
    var actor = contentActor(); var currentContext = contentContext(); var service = contentService(actor); var pkg = service.exportPackage(currentContext, { actor:actor });
    if (typeof runtime.download === 'function') runtime.download('辅导员工作台内容包_' + today() + '.json', JSON.stringify(pkg, null, 2), 'application/json', { collection:'v4_content_pushes', kind:'content_package_export', sensitive:false });
    logAudit('content_package_exported_ui', { push_count:pkg.pushes.length, read_count:pkg.reads.length, actor_role:actor.role }); ui.toast('内容包已导出，不含学生明细', 'ok');
  }
  function importContentPackage() {
    var input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.onchange = function () { var file = input.files && input.files[0]; if (!file) return; var reader = new FileReader(); reader.onload = async function () {
      var snapshot = snapshotCollections(['v4_content_pushes', 'v4_content_reads']);
      try {
        var actor = contentActor(); var service = contentService(actor); var report = service.importPackage(String(reader.result || ''), { actor:actor, context:contentContext() });
        rows('v4_content_pushes').splice.apply(rows('v4_content_pushes'), [0, rows('v4_content_pushes').length].concat(service.pushes())); rows('v4_content_reads').splice.apply(rows('v4_content_reads'), [0, rows('v4_content_reads').length].concat(service.reads())); await saveCustom(); await logAudit('content_package_imported', { added:report.added.length, updated:report.updated.length, conflicts:report.conflicts.length }); render(); ui.toast('内容包已合并：新增 ' + report.added.length + ' 条，冲突 ' + report.conflicts.length + ' 条未覆盖', report.conflicts.length ? 'warn' : 'ok', 4200);
      } catch (error) { restoreCollections(snapshot); try { await saveCustom(); } catch (_) {} ui.toast(error.message || '内容包导入失败，原数据未改变', 'err', 5200); }
    }; reader.readAsText(file, 'utf-8'); }; input.click();
  }
  function installActions() {
    ACTS['v48-field-new'] = function () { fieldForm(null); };
    ACTS['v48-field-edit'] = function (id) { var item = rows('v4_student_field_catalog').find(function (row) { return String(row.id || row.name) === String(id); }); if (item) fieldForm(item); };
    ACTS['v48-field-delete'] = function (id) { var item = rows('v4_student_field_catalog').find(function (row) { return String(row.id || row.name) === String(id); }); if (!item) return; ui.confirm('删除自定义字段', '只删除字段目录，不会删除学生已有值。确定继续吗？', async function () { await persistCustomMutation(['v4_student_field_catalog'], async function () { remove('v4_student_field_catalog', id); }); await logAudit('student_field_catalog_deleted', { field_id:item.id || item.name, field_name:item.name }); render(); ui.toast('字段目录已删除', 'ok'); }, true); };
    ACTS['v48-class-history-new'] = function () { classHistoryForm(null); };
    ACTS['v48-joint-visit'] = function () { jointVisitModal(); };
    ACTS['v48-class-history-delete'] = function (id) { ui.confirm('删除并校正分班变更', '删除后会重新计算该学生今天的有效班级，并同步学生台账当前班级快照。成绩、谈话、住宿轨迹等历史事实不会被删除。确定继续吗？', async function () { var item = rows('v4_student_class_history').find(function (row) { return String(row.id) === String(id); }); if (!item) return; var student = (DB.students || []).find(function (row) { return String(row.id || row.student_id) === String(item.student_id); }); var liveLinkSnapshot = student && root.CWB && root.CWB.students && typeof root.CWB.students.liveLinkSnapshot === 'function' ? root.CWB.students.liveLinkSnapshot([student]) : []; var liveLinkChanges = { changed:0, collections:[] }; await persistStudentsAndCustomMutation(async function () { remove('v4_student_class_history', id); if (student && v48.analysis && typeof v48.analysis.activeClassAtDate === 'function') { var fallback = Object.assign({}, student, { class_name:text(item.from_class_name || item.previous_class_name) }); var nextClass = v48.analysis.activeClassAtDate(fallback, rows('v4_student_class_history'), today()); if (nextClass !== student.class_name) { student.class_name = nextClass; student.updated_at = new Date().toISOString(); if (root.CWB && root.CWB.students && typeof root.CWB.students.syncLiveLinks === 'function') liveLinkChanges = root.CWB.students.syncLiveLinks(student); } } }, { extraBaseCollections:student ? ['tasks'] : [], liveLinkSnapshot:liveLinkSnapshot }); await logAudit('student_class_history_deleted', { record_id:id, student_id:item.student_id || '', recalculated_class:student && student.class_name || '', live_link_updates:liveLinkChanges.changed }); render(); ui.toast(student ? '分班历史已删除，当前班级已重新计算' + (liveLinkChanges.changed ? '，进行中事项已同步' : '') : '分班历史已删除', 'ok'); }, true); };
    ACTS['v48-form-template-new'] = function () { formTemplateForm(null); };
    ACTS['v48-form-job-new'] = function (id) { var item = rows('v4_form_templates').find(function (row) { return String(row.id) === String(id); }); if (!item) return; var selected = (DB.students || []).filter(function (student) { return String(student.enrollment_status || '在读') !== '毕业' && String(student.enrollment_status || '在读') !== '已归档'; }); persistCustomMutation(['v4_form_jobs'], async function () { upsert('v4_form_jobs', { id:recordId('form_job'), template_id:item.id, template_name:item.name, template_attachment_id:item.template_attachment_id || '', scope_label:'当前在读学生', selected_student_ids:selected.map(function (student) { return student.id || student.student_id; }), selected_count:selected.length, status:'草稿', created_at:new Date().toISOString(), source:'manual' }); }).then(function () { render(); ui.toast('一生一表任务已创建为草稿', 'ok'); }).catch(function (error) { ui.toast(error.message || '一生一表任务保存失败，未创建任务', 'err', 5200); }); };
    ACTS['v48-form-job-export'] = function (id) { var job = rows('v4_form_jobs').find(function (row) { return String(row.id) === String(id); }); if (!job) return; var lines = [['模板', '学生ID', '姓名', '学号', '班级']]; (job.selected_student_ids || []).forEach(function (studentId) { var student = (DB.students || []).find(function (item) { return String(item.id || item.student_id) === String(studentId); }); if (student) lines.push([job.template_name, student.id || student.student_id, student.full_name || '', student.student_number || '', student.class_name || '']); }); if (typeof runtime.download === 'function') runtime.download('一生一表字段清单_' + today() + '.csv', typeof runtime.toCSV === 'function' ? runtime.toCSV(lines) : lines.map(function (row) { return row.join(','); }).join('\n'), 'text/csv', { collection:'v4_form_jobs', kind:'form_job_export', sensitive:true }); ui.toast('字段清单已导出', 'ok'); };
    ACTS['v48-form-job-generate'] = function (id) { return formJobPreview(id); };
    ACTS['v48-form-reverse'] = function (id) { return formReverseAction(id); };
    ACTS['v48-content-read'] = function (id) { var actor = contentActor(); var currentContext = contentContext(); return persistCustomMutation(['v4_content_reads'], async function () { var service = contentService(actor); var read = service.markRead(id, actor.id, actor, currentContext); var stored = rows('v4_content_reads'); if (!stored.some(function (row) { return String(row.id) === String(read.id); })) stored.push(read); }).then(async function () { await logAudit('content_push_read_ui', { push_id:id, reader_id:actor.id, reader_role:actor.role, context:currentContext }); render(); }); };
    ACTS['v48-content-retract'] = function (id) { var actor = contentActor(); ui.confirm('撤回本地内容', '撤回后当前工作区不再把它作为有效推送展示，但历史已读记录保留。只有工作区管理员或内容发布者可以撤回。确定继续吗？', async function () { var item = rows('v4_content_pushes').find(function (row) { return String(row.id) === String(id); }); await persistCustomMutation(['v4_content_pushes'], async function () { var service = contentService(actor); var result = service.retract(id, actor); var list = rows('v4_content_pushes'); var index = list.findIndex(function (row) { return String(row.id) === String(id); }); if (index >= 0) list[index] = result; }); await logAudit('content_push_retracted_ui', { push_id:id, title:item && item.title || '', scope:item && item.scope || {}, actor_id:actor.id, actor_role:actor.role }); render(); ui.toast('内容已撤回', 'ok'); }, true); };
    ACTS['v48-content-export'] = function () { exportContentPackage(); };
    ACTS['v48-content-import'] = function () { importContentPackage(); };
    ACTS['v48-work-category-new'] = function () { workCategoryForm(null); };
    ACTS['v48-work-category-edit'] = function (key) { var item = rows('v4_work_categories').find(function (row) { return String(row.key) === String(key); }); if (item) workCategoryForm(item); };
    ACTS['v48-work-category-delete'] = function (key) { var item = rows('v4_work_categories').find(function (row) { return String(row.key) === String(key); }); if (!item) return; ui.confirm('删除自定义分类', '删除只影响之后的新建和筛选，不会改动历史工作节点。确定继续吗？', async function () { await persistCustomMutation(['v4_work_categories'], async function () { remove('v4_work_categories', item.id || key); }); await logAudit('work_category_deleted', { category_id:item.id || key, category_key:key }); render(); ui.toast('自定义分类已删除', 'ok'); }, true); };
    ACTS['v48-sync-qr-paste'] = async function () { var node = document.querySelector('[data-v48-field="qr_payload"]'); if (!node) return; if (!root.navigator || !root.navigator.clipboard || typeof root.navigator.clipboard.readText !== 'function') return ui.toast('当前环境不允许读取剪贴板，请手动粘贴二维码内容', 'warn', 4200); try { node.value = await root.navigator.clipboard.readText(); node.focus(); ui.toast('已读取剪贴板内容，请点击“解析并填充”', 'info', 3200); } catch (_) { ui.toast('读取剪贴板失败，请手动粘贴二维码内容', 'warn', 4200); } };
    ACTS['v48-sync-qr-parse'] = function () { var form = document.querySelector('[data-v48-sync-qr]'); if (!form) return; var raw = text(formValue(form, 'qr_payload')); if (!raw) return ui.toast('请先粘贴二维码文本或配对载荷', 'warn'); try { var parsed = v48.parsePairingQrPayload(raw); var s = state(); s.syncPairingDraft = { pairing_id:parsed.pairing_id, code:parsed.code }; s.syncState = Object.assign({}, s.syncState || {}, { base_url:parsed.host, workspace_id:parsed.workspace_id, fingerprint:parsed.fingerprint, pairing_request_id:'' }); s.syncToken = ''; s.syncClient = null; try { persistUiState(); } catch (_) {} render(); ui.toast('二维码已解析，请核对地址和证书指纹后发送配对请求', 'ok', 4600); return parsed; } catch (error) { ui.toast(syncQrErrorMessage(error), 'err', 5600); return null; } };
    ACTS['v48-sync-pull'] = async function () { var client = syncClient(); if (!client.status().connected) return ui.toast('请先连接数据中枢', 'warn'); var result = await client.pull(); await waitSyncPersistence(); var s = state(); s.syncConflicts = await client.listConflicts().catch(function () { return s.syncConflicts || []; }); render(); ui.toast(result.retry_required ? '部分更新未写入，游标未推进，请修复本地仓储后重试' : '已拉取 ' + result.operations.length + ' 条修订', result.retry_required ? 'warn' : 'ok', 4200); };
    ACTS['v48-sync-flush'] = async function () { var client = syncClient(); if (!client.status().connected) return ui.toast('请先连接数据中枢', 'warn'); var result = await client.flushQueue(); await waitSyncPersistence(); var s = state(); s.syncConflicts = await client.listConflicts().catch(function () { return s.syncConflicts || []; }); render(); ui.toast(result.retry_required ? '部分队列未完成，已保留待重试' : '离线队列已处理，剩余 ' + result.queued + ' 条', result.retry_required ? 'warn' : 'ok', 4200); };
    ACTS['v48-sync-now'] = async function () { var client = syncClient(); if (!client.status().connected) return ui.toast('请先连接数据中枢', 'warn'); var result = await client.syncNow(); await waitSyncPersistence(); var s = state(); s.syncConflicts = await client.listConflicts().catch(function () { return s.syncConflicts || []; }); render(); ui.toast(result.pushed.retry_required || result.pulled.retry_required ? '同步部分完成，未完成内容已保留并等待重试' : '队列和远程更新已同步完成', result.pushed.retry_required || result.pulled.retry_required ? 'warn' : 'ok', 4200); };
    ACTS['v48-sync-auto-toggle'] = async function () { var client = syncClient(); if (!client.status().connected) return ui.toast('请先连接数据中枢', 'warn'); var next = client.status().auto_sync ? client.stopAutoSync() : client.startAutoSync({ interval_ms:60000 }); await waitSyncPersistence(); state().syncState = Object.assign({}, state().syncState || {}, next); persistUiState(); render(); ui.toast(next.auto_sync ? '自动同步已开启' : '自动同步已停止', 'ok'); };
    ACTS['v48-sync-conflicts'] = async function () { var client = syncClient(); if (!client.status().connected) return ui.toast('请先连接数据中枢', 'warn'); state().syncConflicts = await client.listConflicts(); render(); };
    ACTS['v48-conflict-choice'] = async function (id, button) { var client = syncClient(); if (!client.status().connected) return ui.toast('请先连接数据中枢', 'warn'); var conflict = (state().syncConflicts || []).find(function (item) { return String(item.id) === String(id); }); await client.resolveConflict(id, { mode:button.dataset.choice }); await logAudit('sync_conflict_resolved_ui', { conflict_id:id, collection:conflict && conflict.collection || '', record_id:conflict && conflict.record_id || '', mode:button.dataset.choice, fields:(conflict && conflict.fields || []).map(function (item) { return item.field; }) }); try { state().syncConflicts = await client.listConflicts(); } catch (_) { state().syncConflicts = (state().syncConflicts || []).map(function (item) { return String(item.id) === String(id) ? Object.assign({}, item, { status:'resolved', resolution:{ mode:button.dataset.choice } }) : item; }); render(); ui.toast('冲突已提交，但收件箱刷新失败；下次连接会重新核对', 'warn', 5200); return; } render(); ui.toast('冲突处理已提交，等待其他设备拉取', 'ok'); };
    ACTS['v48-conflict-manual'] = function (id) { var conflict = (state().syncConflicts || []).find(function (item) { return String(item.id) === String(id); }); if (!conflict) return ui.toast('冲突记录不存在，请先刷新', 'warn'); conflictManualForm(conflict); };
    ACTS['v48-health'] = async function () { if (!root.cwbDesktop || typeof root.cwbDesktop.repositoryHealth !== 'function') return ui.toast('仓储健康诊断需要桌面端', 'warn'); state().repositoryHealth = await root.cwbDesktop.repositoryHealth(); render(); };
    ACTS['v48-location'] = async function () { if (!root.cwbDesktop || typeof root.cwbDesktop.getDataLocation !== 'function') return ui.toast('数据目录诊断需要桌面端', 'warn'); state().dataLocation = await root.cwbDesktop.getDataLocation(); render(); };
    ACTS['v48-migrate-data'] = async function () { if (!root.cwbDesktop || typeof root.cwbDesktop.chooseDataFolder !== 'function') return ui.toast('数据目录迁移需要桌面端', 'warn'); var folder = await root.cwbDesktop.chooseDataFolder(); if (!folder) return; var result = await root.cwbDesktop.migrateDataFolder(folder); state().dataLocation = result.location || result; render(); ui.toast('数据目录迁移已完成，请重启桌面端确认', 'ok', 4200); };
    ACTS['v48-recovery-export'] = function () { if (!root.cwbDesktop || typeof root.cwbDesktop.exportRecoveryKit !== 'function') return ui.toast('恢复包需要桌面端', 'warn'); ui.modal({ title:'导出恢复包', size:'narrow', body:'<div class="banner banner-warn">恢复口令只显示和使用一次。至少 12 位；遗失口令没有后门解锁，请离线保管。</div><label class="form-row"><span class="lab">恢复口令</span><input class="inp" data-v48-recovery-pass type="password" minlength="12" autocomplete="new-password" placeholder="至少 12 位恢复口令"></label><label class="form-row"><span class="lab">再次输入</span><input class="inp" data-v48-recovery-pass-confirm type="password" minlength="12" autocomplete="new-password" placeholder="再次输入恢复口令"></label>', footer:'<button class="btn" data-close>取消</button><button class="btn btn-primary" data-v48-recovery-go>导出</button>', onOpen:function (mask, close) { mask.querySelector('[data-v48-recovery-go]').onclick = async function () { var button = mask.querySelector('[data-v48-recovery-go]'); var password = mask.querySelector('[data-v48-recovery-pass]').value; var confirmation = mask.querySelector('[data-v48-recovery-pass-confirm]').value; if (password.length < 12) return ui.toast('恢复口令至少需要 12 位，请重新输入', 'warn', 4200); if (password !== confirmation) return ui.toast('两次输入的恢复口令不一致', 'warn', 4200); if (button) { button.disabled = true; button.textContent = '生成中…'; } try { var result = await root.cwbDesktop.exportRecoveryKit(password, ''); if (result && result.saved) { close(); ui.toast('恢复包已保存：' + result.path, 'ok', 5200); } else if (result && result.reason === 'cancelled') ui.toast('已取消保存恢复包', 'info', 3200); } catch (error) { ui.toast(error.message || '恢复包导出失败，当前数据未改变', 'err', 5200); } finally { if (button && button.isConnected) { button.disabled = false; button.textContent = '导出'; } } }; } }); };
    ACTS['v48-recovery-import'] = async function () { if (!root.cwbDesktop || typeof root.cwbDesktop.openRecoveryKit !== 'function') return ui.toast('恢复包需要桌面端', 'warn'); var selected = await root.cwbDesktop.openRecoveryKit(); if (!selected) return; ui.modal({ title:'验证并恢复恢复包', size:'narrow', body:'<div class="banner banner-danger">恢复前会自动保留当前密钥备份；恢复失败会回滚。请确认口令和来源。恢复口令至少 12 位，错误口令不会替换当前数据。</div><input class="inp" data-v48-restore-pass type="password" minlength="12" autocomplete="current-password" placeholder="至少 12 位恢复口令">', footer:'<button class="btn" data-close>取消</button><button class="btn btn-danger" data-v48-restore-go>验证并恢复</button>', onOpen:function (mask, close) { mask.querySelector('[data-v48-restore-go]').onclick = async function () { var button = mask.querySelector('[data-v48-restore-go]'); var password = mask.querySelector('[data-v48-restore-pass]').value; if (password.length < 12) return ui.toast('恢复口令至少需要 12 位，请重新输入', 'warn', 4200); if (button) { button.disabled = true; button.textContent = '验证中…'; } try { var result = await root.cwbDesktop.restoreRecoveryKit(selected.envelope, password); close(); ui.toast(result && result.verified ? '恢复完成，请重启工作台读取新数据' : '恢复已提交', 'ok', 5200); } catch (error) { ui.toast(error.message || '恢复失败，当前数据未替换；可修改口令后重试', 'err', 5200); } finally { if (button && button.isConnected) { button.disabled = false; button.textContent = '验证并恢复'; } } }; } }); };
  ACTS['v48-sync-connect'] = async function () { var form = document.querySelector('[data-v48-sync-connect]'); if (!form) return; var value = formValues(form, ['base_url', 'workspace_id', 'device_id', 'token', 'fingerprint']); var s = state(); s.syncDraft = clone(value); s.syncState = Object.assign({}, s.syncState || {}, { base_url:value.base_url, workspace_id:value.workspace_id || 'workspace-local', device_id:value.device_id || '', fingerprint:value.fingerprint || '' }); var client = syncClient(value.token, value); try { var result = await client.connect({ base_url:value.base_url, workspace_id:value.workspace_id, fingerprint:value.fingerprint }); client.startAutoSync({ interval_ms:60000 }); await waitSyncPersistence(); s.syncState = Object.assign({}, s.syncState, client.status()); s.syncConflicts = await client.listConflicts().catch(function () { return []; }); delete s.syncDraft; render(); ui.toast('已连接数据中枢，自动同步已开启', 'ok'); return result; } catch (error) { s.syncState = Object.assign({}, s.syncState, client.status(), { last_error:error.code || error.message }); render(); throw error; } };
    ACTS['v48-sync-pair'] = async function () { var form = document.querySelector('[data-v48-sync-pair]'); if (!form) return; var value = formValues(form, ['pairing_id', 'code']); var syncForm = document.querySelector('[data-v48-sync-connect]'); var base = syncForm ? formValue(syncForm, 'base_url') : state().syncState && state().syncState.base_url; var s = state(); if (!text(base)) return ui.toast('请先填写或解析主机 HTTPS 地址', 'warn'); if (!/^\d{8}$/.test(text(value.code))) return ui.toast('配对码必须是 8 位数字', 'warn'); s.syncPairingDraft = { pairing_id:text(value.pairing_id), code:'' }; s.syncState = Object.assign({}, s.syncState || {}, { base_url:base }); try { var request = await syncClient().requestPairing({ base_url:base, pairing_id:value.pairing_id, code:value.code, device_name:'辅导员工作台客户端' }); await waitSyncPersistence(); s.syncState = Object.assign({}, s.syncState, syncClient().status()); persistUiState(); render(); ui.toast('配对请求已发送，请回到主机确认后查询结果', 'ok'); return request; } catch (error) { s.syncPairingDraft = { pairing_id:text(value.pairing_id), code:text(value.code) }; render(); throw error; } };
    ACTS['v48-sync-pair-status'] = async function () { var client = syncClient(); try { var result = await client.pollPairing(); await waitSyncPersistence(); var s = state(); s.syncState = Object.assign({}, s.syncState || {}, client.status()); if (result.status === 'pending') { render(); return ui.toast('主机尚未确认该设备，请确认后再次查询', 'info', 3600); } if (result.status === 'rejected') { render(); return ui.toast('主机已拒绝该配对请求，请重新生成配对码', 'warn', 4200); } if (result.token_available && result.token) { s.syncToken = result.token; s.syncDraft = Object.assign({}, s.syncDraft || {}, { token:result.token }); render(); return ui.toast('已取得一次性设备令牌，请核对证书指纹后点击连接并校验', 'ok', 4800); } render(); ui.toast('该请求已确认，但一次性令牌已领取或已过期，请重新配对', 'warn', 4800); } catch (error) { ui.toast(error.message || '查询配对结果失败，请稍后重试', 'err', 5200); } };
    ACTS['v48-form-template-edit'] = function (id) { var item = rows('v4_form_templates').find(function (row) { return String(row.id) === String(id); }); if (item) formTemplateForm(item); };
  }
  function installEvents() {
    document.addEventListener('submit', async function (event) {
      var form = event.target;
      if (form.matches('[data-v48-sync-connect]')) { event.preventDefault(); Promise.resolve(ACTS['v48-sync-connect']()).catch(function (error) { ui.toast(error.message || '同步连接失败', 'err', 5200); }); return; }
      if (form.matches('[data-v48-sync-pair]')) { event.preventDefault(); Promise.resolve(ACTS['v48-sync-pair']()).catch(function (error) { ui.toast(error.message || '配对请求失败', 'err', 5200); }); return; }
      if (form.matches('[data-v48-sync-qr]')) { event.preventDefault(); ACTS['v48-sync-qr-parse'](); return; }
      if (form.matches('[data-v48-sync-enqueue]')) { event.preventDefault(); var value = formValues(form, ['collection', 'record_id', 'patch']); var patch; try { patch = JSON.parse(value.patch || '{}'); } catch (_) { return ui.toast('字段变更必须是合法 JSON', 'warn'); } syncClient().enqueue(value.collection, value.record_id, patch, 0); try { await waitSyncPersistence(); } catch (error) { return ui.toast('离线队列保存失败：' + (error.message || '请重试'), 'err', 5200); } form.reset(); render(); var persistence = syncQueuePersistenceBoundary(); ui.toast(persistence.tag + '已保存', persistence.className === 'tag-amber' ? 'warn' : 'ok'); return; }
      if (form.matches('[data-v48-attachment-upload]')) { event.preventDefault(); var fileInput = form.querySelector('[data-v48-attachment-file]'); var file = fileInput && fileInput.files && fileInput.files[0]; var attachmentId = formValue(form, 'attachment_id'); var statusNode = form.querySelector('[data-v48-upload-status]'); var button = form.querySelector('button[type="submit"]'); if (!file || !attachmentId) return ui.toast('请填写附件 ID 并选择文件', 'warn'); var client = syncClient(); if (!client.status().connected) return ui.toast('请先连接数据中枢', 'warn'); if (button) button.disabled = true; if (statusNode) statusNode.textContent = '正在计算校验值…'; state().syncUpload = { attachment_id:attachmentId, message:'正在准备上传' }; try { var result = await client.uploadAttachment({ attachment_id:attachmentId, bytes:file, name:file.name, mime_type:file.type, onProgress:function (progress) { if (statusNode) statusNode.textContent = '已上传 ' + progress.uploaded + ' / ' + progress.total + ' 字节'; } }); state().syncUpload = { attachment_id:attachmentId, message:'上传完成 · ' + (result.size || file.size) + ' 字节' }; await logAudit('sync_attachment_uploaded', { attachment_id:attachmentId, size:Number(result.size || file.size), sha256:result.sha256 || '' }); if (typeof persistUiState === 'function') persistUiState(); render(); ui.toast('附件已上传并通过哈希校验', 'ok', 3600); } catch (error) { state().syncUpload = { attachment_id:attachmentId, message:'上传失败：' + (error.code || error.message || '请重试') }; if (statusNode) statusNode.textContent = state().syncUpload.message; ui.toast(error.message || '附件上传失败，已保留当前表单', 'err', 5200); } finally { if (button) button.disabled = false; } return; }
      if (form.matches('[data-v48-content-form]')) { event.preventDefault(); contentFormSubmit(form).catch(function (error) { ui.toast(error.message || '内容发布失败', 'err', 5200); }); }
    });
    document.addEventListener('input', function (event) { var node = event.target.closest && event.target.closest('[data-v48-filter]'); if (!node) return; state()[node.dataset.v48Filter] = node.value; clearTimeout(state().filterTimer); state().filterTimer = setTimeout(render, 120); });
  }
  function addNav() {
    var nav = document.querySelector('#nav-modules'); if (!nav || nav.querySelector('[data-view="v48-sync"]')) return;
    var group = document.createElement('div'); group.className = 'nav-group'; group.dataset.group = '数据治理'; group.innerHTML = '数据治理<svg class="nav-fold-ic" data-fold="数据治理"><use href="#i-chev"/></svg>'; nav.appendChild(group);
    [['v48-sync','i-sync','局域网同步'],['student-fields','i-settings','学生字段'],['class-history','i-users','动态分班'],['content-push','i-inbox','政策推送'],['work-categories','i-settings','工作分类'],['form-center','i-doc','一生一表'],['recovery','i-shield','数据修复']].forEach(function (item) { var button = document.createElement('button'); button.type = 'button'; button.className = 'nav-item'; button.dataset.view = item[0]; button.innerHTML = '<svg class="ic"><use href="#' + item[1] + '"/></svg>' + item[2]; nav.appendChild(button); }); if (typeof runtime.applyFold === 'function') runtime.applyFold();
  }
  function installStyles() {
    if (document.querySelector('#cwb-v48-ui-style')) return;
    var style = document.createElement('style'); style.id = 'cwb-v48-ui-style'; style.textContent = '.v48-page{max-width:1500px}.v48-stat-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:0 0 16px}.v48-stat{display:grid;gap:4px;min-width:0;padding:13px 14px;border:1px solid var(--line);border-radius:8px;background:var(--card)}.v48-stat span,.v48-stat small{font-size:12px;color:var(--ink-4)}.v48-stat strong{font-size:22px;color:var(--ink)}.v48-sync-grid,.v48-split{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(330px,.85fr);gap:14px;margin-bottom:14px}.v48-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.v48-form-grid label{display:grid;gap:5px;color:var(--ink-2);font-size:12px;font-weight:650}.v48-form-grid .inp{width:100%}.v48-wide{grid-column:1/-1}.v48-form-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.v48-role-note{display:grid;gap:3px;align-content:start;padding:9px 10px;border:1px solid var(--line-2);border-radius:7px;background:var(--card-2)}.v48-role-note strong{font-size:13px;color:var(--ink)}.v48-role-note small{font-size:11px;color:var(--ink-4);font-weight:400}.v48-sync-state{display:flex;align-items:center;gap:9px;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--card-2)}.v48-sync-state.is-ok{border-color:#b9dcc8;background:#f3fbf6}.v48-sync-state.is-error{border-color:#ebc5c5;background:#fff7f7}.v48-state-dot{width:9px;height:9px;border-radius:50%;background:#94a3b8;flex:0 0 auto}.v48-sync-state.is-ok .v48-state-dot{background:#2d9c67}.v48-sync-state.is-error .v48-state-dot{background:#c84b4b}.v48-table-wrap{overflow:auto}.v48-table{width:100%;border-collapse:collapse;min-width:720px}.v48-table th,.v48-table td{border-bottom:1px solid var(--line-2);padding:10px 9px;text-align:left;vertical-align:top;font-size:13px}.v48-table th{background:var(--card-2);color:var(--ink-4);font-size:12px}.v48-actions{white-space:nowrap}.v48-inline-search{width:190px!important}.v48-list{display:grid;gap:7px}.v48-list-row,.v48-conflict-row{display:flex;align-items:center;gap:10px;min-width:0;padding:10px 11px;border:1px solid var(--line-2);border-radius:7px;background:var(--card)}.v48-list-row>div:first-child,.v48-conflict-row>div:first-child{min-width:0;flex:1}.v48-clamp{margin:6px 0 0;color:var(--ink-3);font-size:12px;line-height:1.55;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}.v48-empty{display:grid;place-items:center;gap:5px;padding:28px 14px;color:var(--ink-3);text-align:center}.v48-empty span{font-size:12px;color:var(--ink-4)}.v48-health-list{display:grid;gap:7px}.v48-health-row{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;padding:9px 10px;border-bottom:1px solid var(--line-2)}.v48-health-row small{grid-column:1/-1;color:var(--ink-4)}.v48-location{display:grid;gap:10px}.v48-location div{display:grid;gap:4px;padding:10px 11px;border:1px solid var(--line-2);border-radius:7px}.v48-location span{font-size:11px;color:var(--ink-4)}.v48-location strong{font-size:13px;overflow-wrap:anywhere}.v48-class-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.v48-class-overview div{display:flex;justify-content:space-between;gap:8px;padding:10px 11px;border:1px solid var(--line-2);border-radius:7px}.v48-class-overview span{color:var(--ink-3)}@media(max-width:900px){.v48-sync-grid,.v48-split{grid-template-columns:1fr}.v48-form-grid{grid-template-columns:1fr}.v48-wide{grid-column:auto}.v48-stat-strip{display:flex;overflow:auto}.v48-stat{flex:0 0 126px}.v48-inline-search{width:100%!important}.v48-class-overview{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(prefers-reduced-motion:reduce){.v48-page *{transition:none!important;animation:none!important}}'; document.head.appendChild(style);
  }
  VIEWS['v48-sync'] = viewSync; VIEWS['student-fields'] = fieldCatalogView; VIEWS['class-history'] = classHistoryView; VIEWS['content-push'] = contentPushView; VIEWS['work-categories'] = workCategoriesView; VIEWS['form-center'] = formCenterView; VIEWS.recovery = viewRecovery;
  function installSyncSimplifyStyles() {
    if (document.querySelector('#cwb-v48-sync-simplify-style')) return;
    var style = document.createElement('style');
    style.id = 'cwb-v48-sync-simplify-style';
    style.textContent = '.v48-sync-guide{margin-bottom:14px;border-color:var(--accent-line);background:var(--accent-soft)}.v48-sync-guide ol{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}.v48-sync-guide li{display:grid;gap:4px;min-width:0;padding:11px 12px;border:1px solid var(--line);border-radius:7px;background:var(--card)}.v48-sync-guide li strong{font-size:13px;color:var(--ink)}.v48-sync-guide li span{font-size:12px;line-height:1.55;color:var(--ink-3)}.v48-sync-grid [data-v48-sync-connect]>label:has([data-v48-field="workspace_id"]),.v48-sync-grid [data-v48-sync-connect]>label:has([data-v48-field="device_id"]),.v48-sync-grid [data-v48-sync-connect]>label:has([data-v48-field="token"]),.v48-sync-grid [data-v48-sync-connect]>label:has([data-v48-field="fingerprint"]),.v48-sync-grid [data-act="v48-sync-pull"],.v48-sync-grid [data-act="v48-sync-flush"],.v48-sync-grid [data-act="v48-sync-auto-toggle"],form[data-v48-sync-enqueue]{display:none!important}@media(max-width:700px){.v48-sync-guide ol{grid-template-columns:1fr}.v48-sync-guide li{grid-template-columns:auto minmax(0,1fr);align-items:start}.v48-sync-guide li strong{grid-column:1}.v48-sync-guide li span{grid-column:2}}';
    document.head.appendChild(style);
  }
  installActions(); installEvents(); installStyles(); installSyncSimplifyStyles(); addNav();
  if (root.CWB && root.CWB.hooks && typeof root.CWB.hooks.on === 'function') root.CWB.hooks.on('view:render', function () { addNav(); });
  root.CWBV48UI = { syncClient:syncClient, refresh:function () { try { render(); } catch (_) {} } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
