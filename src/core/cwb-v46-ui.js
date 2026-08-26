(function installCwbV46Ui(root) {
  'use strict';

  var runtime = root.CWBV46Runtime || {};
  var app = runtime.app;
  var DB = runtime.DB;
  var VIEWS = runtime.VIEWS;
  var ACTS = runtime.ACTS;
  var render = runtime.render;
  var go = runtime.go;
  var save = runtime.save;
  var ui = runtime.ui;
  var security = runtime.security;
  var v4Collection = runtime.v4Collection;
  var esc = runtime.esc;
  var today = runtime.today;
  var daysFromToday = runtime.daysFromToday;
  var uid = runtime.uid;
  var resolveStudent = runtime.student;
  var classList = runtime.classList;
  var termRange = runtime.termRange;
  var normV4Record = runtime.normV4Record;
  var normTask = runtime.normTask;
  var readFeedbackRows = runtime.readFeedbackRows;
  var storeBusinessAttachments = runtime.storeBusinessAttachments;
  var removeBusinessAttachments = runtime.removeBusinessAttachments;
  var mergeBusinessAttachmentIds = runtime.mergeBusinessAttachmentIds || function () { return []; };
  var removeV4RecordAttachments = runtime.removeV4RecordAttachments;
  var attachmentIdsFromRecord = runtime.attachmentIdsFromRecord;
  var restoreBusinessAttachmentRecords = runtime.restoreBusinessAttachmentRecords;
  var requireSensitiveExport = runtime.requireSensitiveExport;
  var download = runtime.download;
  var toCSV = runtime.toCSV;
  var persistUiState = runtime.persistUiState;
  var openStudent = runtime.openStudent;
  var applyFold = runtime.applyFold;
  var renderPinned = runtime.renderPinned;
  var updatePinStates = runtime.updatePinStates;
  var cloneData = runtime.cloneData || function (value) { return value == null ? value : JSON.parse(JSON.stringify(value)); };
  var v4Page = runtime.v4Page;
  var v46 = root.CWBV46 || (root.CWB && root.CWB.v46);
  if (!v46 || !app || !VIEWS || !ACTS || typeof v4Collection !== 'function') return;

  // Keep the UI runtime usable in Electron/portable harnesses where the page
  // level helper may not have been installed yet.
  var awaitTrackedSave = typeof root.awaitTrackedSave === 'function' ? root.awaitTrackedSave : async function (promise) {
    if (!promise) return { ok:true };
    var result = await promise;
    if (result && result.ok === false) {
      var error = new Error(result.error || '保存失败，请重试');
      error.save_result = result;
      throw error;
    }
    return result;
  };

  var V46_KEYS = Array.isArray(v46.COLLECTIONS) ? v46.COLLECTIONS.slice() : [];
  var STAGES = v46.research && v46.research.stages || [];
  var GRADES = v46.committee && v46.committee.grades || ['优秀', '良好', '合格', '不合格'];
  var formRecordIds = root.__CWB_FORM_RECORD_IDS__ || (root.__CWB_FORM_RECORD_IDS__ = {});

  function state() {
    app.v46 = app.v46 || {};
    return app.v46;
  }
  function rows(key) {
    return v4Collection(key);
  }
  function normalize(key, value) {
    return typeof v46.normalizeRecord === 'function' ? v46.normalizeRecord(key, value || {}) : Object.assign({ id:uid(), schema_version:9 }, value || {});
  }
  function restoreUpsertMutation(key, recordId, existed, previous) {
    var list = rows(key);
    var index = list.findIndex(function (item) { return String(item.id) === String(recordId); });
    if (existed) {
      if (index >= 0 && previous) list[index] = previous;
    } else if (index >= 0) list.splice(index, 1);
  }
  function trackUpsertSave(key, recordId, existed, previous, promise) {
    if (!promise || typeof promise.then !== 'function') return promise;
    var guarded = Promise.resolve(promise).then(function (result) {
      if (result && result.ok === false) {
        restoreUpsertMutation(key, recordId, existed, previous);
        var error = new Error(result.error || '保存失败，请重试'); error.save_result = result; throw error;
      }
      return result;
    });
    guarded.catch(function () {});
    if (root.__CWB_LAST_SAVE_PROMISE__ === promise) root.__CWB_LAST_SAVE_PROMISE__ = guarded;
    return guarded;
  }
  function trackCollectionSave(key, previousRows, previousDrafts, promise) {
    if (!promise || typeof promise.then !== 'function') return promise;
    var guarded = Promise.resolve(promise).then(function (result) {
      if (result && result.ok === false) {
        DB.custom[key] = previousRows;
        if (previousDrafts) DB.custom.v4_worklog_drafts = previousDrafts;
        var error = new Error(result.error || '保存失败，请重试'); error.save_result = result; throw error;
      }
      return result;
    });
    guarded.catch(function () {});
    if (root.__CWB_LAST_SAVE_PROMISE__ === promise) root.__CWB_LAST_SAVE_PROMISE__ = guarded;
    return guarded;
  }
  function upsert(key, value, options) {
    var persist = !(options && options.persist === false);
    var source = Object.assign({}, value || {});
    var formToken = root.__CWB_ACTIVE_FORM_TOKEN__;
    var formKey = formToken && !source.id ? String(formToken) + '|' + String(key) : '';
    if (formKey && formRecordIds[formKey]) source.id = formRecordIds[formKey];
    var next = normalize(key, source);
    if (formKey) formRecordIds[formKey] = next.id;
    var list = rows(key);
    var index = list.findIndex(function (item) { return String(item.id) === String(next.id); });
    var previous = index >= 0 ? cloneData(list[index]) : null;
    if (index >= 0) list[index] = next; else list.push(next);
    if (persist) {
      var savePromise = trackUpsertSave(key, next.id, index >= 0, previous, save('custom'));
      if (savePromise && typeof savePromise.then === 'function') Object.defineProperty(next, '__cwbSavePromise', { value:savePromise, enumerable:false, configurable:true });
    }
    return next;
  }
  function savePromiseOf(record) { return record && record.__cwbSavePromise || root.__CWB_LAST_SAVE_PROMISE__; }
  function snapshotCustomCollections(keys) {
    var snapshot = {};
    (keys || []).forEach(function (key) { snapshot[key] = cloneData(rows(key)); });
    return snapshot;
  }
  function restoreCustomCollections(snapshot) {
    Object.keys(snapshot || {}).forEach(function (key) { DB.custom[key] = snapshot[key]; });
  }
  async function persistCustomChanges() {
    root.__CWB_LAST_SAVE_PROMISE__ = null;
    await awaitTrackedSave(save('custom'));
  }
  async function restoreCustomState(snapshot, error) {
    restoreCustomCollections(snapshot);
    try { await persistCustomChanges(); } catch (restoreError) { if (error) error.record_restore_error = String(restoreError && restoreError.message || restoreError); }
  }
  function removeRow(key, id, options) {
    var list = rows(key);
    var next = list.filter(function (item) { return String(item.id) !== String(id); });
    if (next.length === list.length) return false;
    var previousRows = cloneData(list);
    var previousDrafts = cloneData(rows('v4_worklog_drafts'));
    if (!(options && options.markSource === false)) markSourceDraftStale(key, id, 'deleted', { persist:false });
    DB.custom[key] = next;
    if (!(options && options.persist === false)) trackCollectionSave(key, previousRows, previousDrafts, save('custom'));
    return true;
  }
  async function removeRowAndWait(key, id, options) {
    var removed = removeRow(key, id, options);
    if (!removed || (options && options.persist === false)) return removed;
    await awaitTrackedSave(root.__CWB_LAST_SAVE_PROMISE__);
    return removed;
  }
  function student(id, number) {
    return resolveStudent(String(id || ''), String(number || '')) || (DB.students || []).find(function (item) {
      return String(item.id) === String(id || '') || String(item.student_number || '') === String(number || '');
    }) || null;
  }
  function studentOptions(includeEmpty) {
    var options = includeEmpty ? [{ v:'', n:'未关联学生' }] : [];
    return options.concat((DB.students || []).slice().sort(function (a, b) {
      return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'zh-CN');
    }).map(function (item) {
      return { v:item.id || '', n:(item.full_name || '未命名') + ' · ' + (item.student_number || '无学号') + ' · ' + (item.class_name || '未分班') };
    }));
  }
  function selectOptions(values, current, label) {
    var list = values || [];
    var html = label === false ? '' : '<option value="">' + esc(label || '请选择') + '</option>';
    return html + list.map(function (item) {
      var value = typeof item === 'string' ? item : item.v;
      var text = typeof item === 'string' ? item : item.n;
      return '<option value="' + esc(value) + '"' + (String(value) === String(current || '') ? ' selected' : '') + '>' + esc(text) + '</option>';
    }).join('');
  }
  function page(title, intro, body, actions) {
    return v4Page(title, intro, body, actions);
  }
  function phone(value) {
    var text = String(value || '');
    if (!text) return '—';
    if (security && security.isLocked && security.isLocked()) return '已保护';
    if (text.length < 7) return '已记录';
    return text.slice(0, 3) + '****' + text.slice(-4);
  }
  async function releaseRecordAttachments(key, record) {
    if (!record) return { snapshots:[], result:null };
    var snapshots = [];
    var ids = typeof attachmentIdsFromRecord === 'function' ? attachmentIdsFromRecord(record) : Array.isArray(record.attachment_ids) ? record.attachment_ids : [];
    for (const attachmentId of ids) {
      try { var attachment = root.CWB && root.CWB.attachments && await root.CWB.attachments.get(attachmentId); if (attachment) snapshots.push(attachment); } catch (_) {}
    }
    try {
      var result = typeof removeV4RecordAttachments === 'function'
        ? await removeV4RecordAttachments(key, record)
        : typeof removeBusinessAttachments === 'function' ? await removeBusinessAttachments(ids) : null;
      return { snapshots:snapshots, result:result };
    } catch (error) {
      try { if (typeof restoreBusinessAttachmentRecords === 'function') await restoreBusinessAttachmentRecords(snapshots); } catch (restoreError) { error.attachment_restore_error = String(restoreError && restoreError.message || restoreError); }
      throw error;
    }
  }
  async function restoreReleasedAttachments(released) {
    if (!released || !released.snapshots || !released.snapshots.length) return;
    if (typeof restoreBusinessAttachmentRecords === 'function') return restoreBusinessAttachmentRecords(released.snapshots);
  }
  function v46Persist() {
    save('custom');
    try { persistUiState(); } catch (_) {}
  }
  function v46Error(error, fallback) {
    var code = error && error.message ? error.message : '';
    var messages = {
      WORKLOG_DRAFT_SOURCE_RECHECK_REQUIRED: '来源记录已变化，请先编辑草稿并重新核对来源后再归档',
      WORKLOG_DRAFT_SOURCE_DELETED: '来源记录已删除，该草稿不能归档；如仍需留痕，请重新创建记录',
    };
    return messages[code] || code || fallback;
  }
  function v46SourceHash(record, collection) {
    if (v46.worklogDrafts && typeof v46.worklogDrafts.sourceHash === 'function') return v46.worklogDrafts.sourceHash(record, collection);
    return JSON.stringify([collection, record && record.id, record && record.updated_at, record && record.date, record && record.title, record && record.summary, record && record.content, record && record.result, record && record.outcome, record && record.next_action, record && record.status, record && record.visit_type]);
  }
  function sourceRecord(collection, sourceId) {
    if (!collection || sourceId == null || sourceId === '') return null;
    var list = Array.isArray(DB[collection]) ? DB[collection] : rows(collection);
    return list.find(function (item) { return String(item && item.id) === String(sourceId); }) || null;
  }
  function markSourceDraftStale(collection, sourceId, reason, options) {
    var changed = false;
    rows('v4_worklog_drafts').forEach(function (item) {
      if (item.source_collection !== collection || String(item.source_id) !== String(sourceId)) return;
      if (!['draft', 'confirmed'].includes(item.status)) return;
      item.status = 'stale';
      item.source_state = reason || 'changed';
      item.source_changed_at = new Date().toISOString();
      item.updated_at = item.source_changed_at;
      changed = true;
    });
    if (changed && !(options && options.persist === false)) v46Persist();
    return changed;
  }
  function createDraft(record, collection, options) {
    if (!record || !record.id) return null;
    var persist = !(options && options.persist === false);
    var list = rows('v4_worklog_drafts');
    var sourceHash = v46SourceHash(record, collection);
    var matches = list.filter(function (item) {
      return item.source_collection === collection && String(item.source_id) === String(record.id) && ['draft', 'confirmed', 'stale'].includes(item.status);
    }).sort(function (a, b) { return String(a.updated_at || '').localeCompare(String(b.updated_at || '')); });
    var current = matches.length ? matches[matches.length - 1] : null;
    if (current && current.source_hash === sourceHash && ['draft', 'confirmed'].includes(current.status)) return current;
    if (current && ['draft', 'confirmed'].includes(current.status)) {
      current.status = 'stale';
      current.source_state = 'changed';
      current.source_changed_at = new Date().toISOString();
      current.updated_at = current.source_changed_at;
      if (persist) v46Persist();
    }
    var draftOptions = Object.assign({}, options || {});
    delete draftOptions.persist;
    var draft = v46.worklogDrafts.createFromRecord(record, Object.assign({ source_collection:collection }, draftOptions));
    draft.source_hash = sourceHash;
    draft.source_state = 'active';
    upsert('v4_worklog_drafts', draft, { persist:persist });
    return draft;
  }
  function prepareDraftConfirmation(id, values) {
    var list = rows('v4_worklog_drafts');
    var draft = list.find(function (item) { return String(item.id) === String(id); });
    if (!draft) throw new Error('WORKLOG_DRAFT_NOT_FOUND');
    var source = sourceRecord(draft.source_collection, draft.source_id);
    if (draft.source_collection && draft.source_id) {
      if (!source) {
        draft.status = 'stale'; draft.source_state = 'deleted'; draft.source_changed_at = new Date().toISOString(); draft.updated_at = draft.source_changed_at; v46Persist();
        throw new Error('WORKLOG_DRAFT_SOURCE_DELETED');
      }
      if (draft.source_hash && v46SourceHash(source, draft.source_collection) !== draft.source_hash) {
        draft.status = 'stale'; draft.source_state = 'changed'; draft.source_changed_at = new Date().toISOString(); draft.updated_at = draft.source_changed_at; v46Persist();
        throw new Error('WORKLOG_DRAFT_SOURCE_RECHECK_REQUIRED');
      }
    }
    var draftIndex = list.findIndex(function (item) { return item === draft || String(item.id) === String(draft.id); });
    var previousDraft = cloneData(draft);
    var previousWorklogs = cloneData(DB.worklogs);
    var next = v46.worklogDrafts.confirm(Object.assign({}, draft, values || {}));
    Object.assign(draft, next, { status:'confirmed', source_state:'confirmed', confirmed_at:new Date().toISOString() });
    var existing = DB.worklogs.find(function (item) { return String(item.source_draft_id || item.extra && item.extra.source_draft_id || '') === String(draft.id); });
    var worklog = Object.assign({}, draft, {
      id: existing ? existing.id : uid(),
      source_draft_id:draft.id,
      source_collection:draft.source_collection,
      source_id:draft.source_id,
      status:'已归档',
      category:draft.category || '其他',
      title:draft.title || '日常工作记录',
      summary:draft.summary || '',
      note:[draft.result, draft.next_action].filter(Boolean).join('；'),
      schema_version:8,
      updated_at:new Date().toISOString(),
    });
    if (existing) Object.assign(existing, normV4Record(worklog, 'worklogs'));
    else DB.worklogs.push(normV4Record(worklog, 'worklogs'));
    return { list:list, draft:draft, draftIndex:draftIndex, previousDraft:previousDraft, previousWorklogs:previousWorklogs, worklog:worklog };
  }
  function persistPreparedDraftConfirmation() {
    root.__CWB_LAST_SAVE_PROMISE__ = null;
    save('worklogs');
    save('custom');
    return root.__CWB_LAST_SAVE_PROMISE__;
  }
  function restoreDraftConfirmation(prepared) {
    if (!prepared) return;
    if (prepared.draftIndex >= 0) prepared.list[prepared.draftIndex] = prepared.previousDraft;
    DB.worklogs = prepared.previousWorklogs;
  }
  function confirmDraftCompat(id, values) {
    var prepared = prepareDraftConfirmation(id, values);
    // This is the historical synchronous API. It preserves its immediate
    // in-memory return value while exposing the durable variant below for UI
    // actions that must wait for the actual save result.
    persistPreparedDraftConfirmation();
    return prepared.worklog;
  }
  async function confirmDraft(id, values) {
    var prepared = prepareDraftConfirmation(id, values);
    try {
      var pending = persistPreparedDraftConfirmation();
      await awaitTrackedSave(pending);
      return prepared.worklog;
    } catch (error) {
      restoreDraftConfirmation(prepared);
      throw error;
    }
  }
  function dismissDraftCompat(id) {
    var draft = rows('v4_worklog_drafts').find(function (item) { return String(item.id) === String(id); });
    if (!draft) return false;
    draft.status = 'dismissed';
    draft.dismissed_at = new Date().toISOString();
    draft.updated_at = draft.dismissed_at;
    v46Persist();
    return true;
  }
  async function dismissDraft(id) {
    var draft = rows('v4_worklog_drafts').find(function (item) { return String(item.id) === String(id); });
    if (!draft) return false;
    var list = rows('v4_worklog_drafts');
    var index = list.indexOf(draft);
    var previous = cloneData(draft);
    draft.status = 'dismissed';
    draft.dismissed_at = new Date().toISOString();
    draft.updated_at = draft.dismissed_at;
    try {
      root.__CWB_LAST_SAVE_PROMISE__ = null;
      var pending = root.__CWB_LAST_SAVE_PROMISE__ = save('custom');
      if (typeof root.awaitTrackedSave === 'function') await root.awaitTrackedSave(pending);
      else if (pending && typeof pending.then === 'function') await pending;
      return true;
    } catch (error) {
      if (index >= 0) list[index] = previous;
      throw error;
    }
  }
  function draftFromRecord(record, collection, options) {
    return createDraft(record, collection, options);
  }

  function utilityResultMarkup() {
    var result = state().utilityResult;
    if (!result) return '<div class="empty">填写名单或日期后运行工具，结果默认只保留在当前页面。</div>';
    if (result.kind === 'draw') return '<div class="v46-result-head"><strong>抽签结果</strong><span class="tag tag-blue">种子 ' + esc(result.data.seed) + '</span></div><ol class="v46-result-list">' + result.data.items.map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') + '</ol><div class="tiny">共 ' + result.data.count + ' 人 · ' + (result.data.allow_repeat ? '允许重复' : '不重复') + '</div>';
    if (result.kind === 'group') return '<div class="v46-result-head"><strong>分组结果</strong><span class="tiny">' + result.data.group_count + ' 组 · ' + result.data.source_count + ' 人</span></div><div class="v46-group-grid">' + result.data.groups.map(function (group) { return '<div class="panel"><strong>' + esc(group.name) + '</strong><div class="tiny">' + group.items.map(esc).join('、') + '</div></div>'; }).join('') + '</div>';
    if (result.kind === 'rotation') return '<div class="v46-result-head"><strong>轮值安排</strong><span class="tiny">每 ' + result.data.interval_days + ' 天</span></div><div class="tw"><table><thead><tr><th>日期</th><th>人员</th></tr></thead><tbody>' + result.data.items.map(function (item) { return '<tr><td>' + esc(item.date) + '</td><td>' + esc(item.person) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    if (result.kind === 'date') return '<div class="v46-date-result"><strong>' + esc(String(result.data.days)) + ' 天</strong><span>' + esc(result.data.from) + ' 至 ' + esc(result.data.to) + '</span><span class="tag ' + (result.data.overdue ? 'tag-red' : result.data.today ? 'tag-amber' : 'tag-green') + '">' + (result.data.overdue ? '已逾期' : result.data.today ? '今天' : '剩余 / 已过') + '</span></div>';
    if (result.kind === 'clean') return '<div class="v46-date-result"><strong>' + result.data.length + ' 条</strong><span>原始 ' + result.data.sourceCount + ' 条 · 去重 ' + result.data.duplicates + ' 条</span></div><pre class="v46-output">' + esc(result.data.join('\n')) + '</pre>';
    return '';
  }
  function viewUtilities() {
    var s = state();
    var tab = s.utilityTab || 'draw';
    var tabs = [{ k:'draw', n:'随机抽签' }, { k:'group', n:'随机分组' }, { k:'rotation', n:'轮值安排' }, { k:'date', n:'日期计算' }, { k:'clean', n:'名单清理' }];
    var controls = '';
    if (tab === 'draw') controls = '<div class="grid2"><div class="form-row span2"><label class="lab">名单</label><textarea class="inp" data-v46-utility-list rows="8" placeholder="每行一个姓名，也可用逗号分隔"></textarea></div><div class="form-row"><label class="lab">抽取人数</label><input class="inp" type="number" min="1" value="1" data-v46-utility-count></div><div class="form-row"><label class="lab">复核种子（可选）</label><input class="inp" data-v46-utility-seed placeholder="留空使用本地随机源"></div><label class="chk span2"><input type="checkbox" data-v46-utility-repeat><span>允许重复抽取</span></label></div>';
    if (tab === 'group') controls = '<div class="grid2"><div class="form-row span2"><label class="lab">名单</label><textarea class="inp" data-v46-utility-list rows="8" placeholder="每行一个姓名"></textarea></div><div class="form-row"><label class="lab">组数</label><input class="inp" type="number" min="1" value="2" data-v46-utility-groups></div><div class="form-row"><label class="lab">每组人数（填此项可自动算组数）</label><input class="inp" type="number" min="0" value="0" data-v46-utility-per-group></div><div class="form-row span2"><label class="lab">复核种子（可选）</label><input class="inp" data-v46-utility-seed placeholder="同一名单和种子可复现分组"></div></div>';
    if (tab === 'rotation') controls = '<div class="grid2"><div class="form-row span2"><label class="lab">轮值人员</label><textarea class="inp" data-v46-utility-list rows="6" placeholder="每行一个人"></textarea></div><div class="form-row"><label class="lab">开始日期</label><input class="inp" type="date" data-v46-utility-start value="' + esc(today()) + '"></div><div class="form-row"><label class="lab">间隔天数</label><input class="inp" type="number" min="1" value="1" data-v46-utility-interval></div><div class="form-row"><label class="lab">生成次数</label><input class="inp" type="number" min="1" value="7" data-v46-utility-cycles></div></div>';
    if (tab === 'date') controls = '<div class="grid2"><div class="form-row"><label class="lab">开始日期</label><input class="inp" type="date" data-v46-utility-from value="' + esc(today()) + '"></div><div class="form-row"><label class="lab">结束 / 截止日期</label><input class="inp" type="date" data-v46-utility-to value="' + esc(today()) + '"></div></div>';
    if (tab === 'clean') controls = '<div class="form-row"><label class="lab">名单文本</label><textarea class="inp" data-v46-utility-list rows="10" placeholder="可混用换行、逗号、分号，系统会去重并统一空白"></textarea></div>';
    var actions = tab === 'clean' ? '<button class="btn btn-primary" data-act="v46-utility-run">清理名单</button>' : '<button class="btn btn-primary" data-act="v46-utility-run">生成结果</button>';
    var utilityResult = state().utilityResult;
    var result = utilityResult ? '<div class="card v46-result-card"><div class="card-hd"><h2>当前结果</h2><span class="sp"></span><button class="btn btn-sm" type="button" data-act="v46-utility-clear">清空</button><button class="btn btn-sm" type="button" data-act="v46-utility-save-task"' + (utilityResult.saved_task_id ? ' disabled aria-disabled="true"' : '') + '>' + (utilityResult.saved_task_id ? '已保存为任务' : '保存为任务') + '</button><button class="btn btn-sm" type="button" data-act="v46-utility-save-worklog"' + (utilityResult.saved_worklog_id ? ' disabled aria-disabled="true"' : '') + '>' + (utilityResult.saved_worklog_id ? '已保存为留痕' : '保存为留痕') + '</button></div><div class="card-bd">' + utilityResultMarkup() + '</div></div>' : '';
    return page('实用工具', '把抽签、分组、轮值、日期和名单整理集中在一个本地页面。工具结果不会自动写入业务台账。', '<section class="card"><div class="card-hd"><h2><svg class="ic"><use href="#i-sparkles"/></svg>日常工具</h2><span class="sp"></span><span class="tiny">本地运行 · 可复核</span></div><div class="card-bd"><div class="segmented v46-tabs">' + tabs.map(function (item) { return '<button class="btn btn-sm' + (item.k === tab ? ' btn-primary' : '') + '" data-act="v46-utility-tab" data-tab="' + item.k + '">' + item.n + '</button>'; }).join('') + '</div><div class="v46-utility-controls">' + controls + '</div><div class="v4-toolbar" style="padding-left:0;padding-right:0;border-bottom:0">' + actions + '<span class="tiny">随机数由本机随机源决定，AI 不参与抽取</span></div></div></section>' + result, '');
  }

  function dormMaps() {
    var buildings = rows('v4_dorm_buildings');
    var rooms = rows('v4_dorm_rooms');
    return {
      buildings:buildings,
      rooms:rooms,
      buildingMap:new Map(buildings.map(function (item) { return [String(item.id), item]; })),
      roomMap:new Map(rooms.map(function (item) { return [String(item.id), item]; })),
    };
  }
  function dormLocation(assignment, maps) {
    var building = maps.buildingMap.get(String(assignment.building_id || ''));
    var room = maps.roomMap.get(String(assignment.room_id || ''));
    return [building && building.name || assignment.building_id, room && room.room_number || assignment.room_id, assignment.bed_number && ('床位 ' + assignment.bed_number)].filter(Boolean).join(' · ');
  }
  function dormAssignmentAiAction(item) {
    return '<button class="btn btn-sm ai-record-action" data-ai-record-action="v4_dorm_assignments:' + esc(item.id) + '" data-act="ai-inline" data-ai-purpose="dorm_conflict" data-ai-target-view="dorm" data-ai-target-collection="v4_dorm_assignments" data-ai-target-record-id="' + esc(item.id) + '" data-ai-student-id="' + esc(item.student_id || '') + '" title="AI 住宿检查">AI 住宿检查</button>';
  }
  function dormPlanMarkup(plan, maps) {
    if (!plan) return '';
    var conflicts = plan.conflicts || [];
    return '<section class="card v46-plan-preview"><div class="card-hd"><h2>排宿方案预览</h2><span class="sp"></span><span class="tag ' + (plan.valid ? 'tag-green' : 'tag-red') + '">' + (plan.valid ? '可确认' : '存在冲突') + '</span><button class="btn btn-sm" data-act="v46-dorm-clear-plan">放弃方案</button>' + (plan.valid && Number(plan.selected_count || 0) > 0 ? '<button class="btn btn-primary btn-sm" data-act="v46-dorm-confirm-plan">人工确认写入</button>' : '') + '</div><div class="card-bd"><div class="v4-stat-row"><div class="v4-stat"><span class="tiny">待分学生</span><b>' + plan.selected_count + '</b></div><div class="v4-stat"><span class="tiny">已安排</span><b>' + plan.assigned_count + '</b></div><div class="v4-stat"><span class="tiny">冲突</span><b>' + conflicts.length + '</b></div><div class="v4-stat"><span class="tiny">未分配</span><b>' + (plan.unassigned || []).length + '</b></div></div>' + (conflicts.length ? '<div class="banner banner-warn">' + conflicts.map(function (item) { return esc(item.message || '存在冲突') + (item.student && item.student.student_name ? ' · ' + esc(item.student.student_name) : ''); }).join('<br>') + '</div>' : '') + '<div class="tw"><table><thead><tr><th>学生</th><th>班级</th><th>位置</th><th>状态</th></tr></thead><tbody>' + (plan.assignments || []).map(function (item) { return '<tr><td>' + esc(item.student_name || item.student_number) + '</td><td>' + esc(item.class_name || '—') + '</td><td>' + esc(dormLocation(item, maps)) + '</td><td>' + esc(item.status) + '</td></tr>'; }).join('') + '</tbody></table></div></div></section>';
  }
  function dormBuildingForm(record) {
    var isNew = !record;
    ui.form({ title:isNew ? '新增住宿楼栋' : '编辑住宿楼栋', data:record || { enabled:true, gender_limit:'不限' }, fields:[
      { key:'campus', label:'校区' }, { key:'name', label:'楼栋名称', required:true }, { key:'gender_limit', label:'性别限制', type:'select', options:['不限','男','女','混合'] }, { key:'enabled', label:'启用楼栋', type:'checkbox' }, { key:'note', label:'备注', type:'textarea', rows:2 },
    ], onSave:async function (value) { var saved = upsert('v4_dorm_buildings', Object.assign({}, record || {}, value)); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast(isNew ? '楼栋已添加' : '楼栋已保存', 'ok'); }});
  }
  function dormRoomForm(record) {
    var maps = dormMaps();
    var isNew = !record;
    ui.form({ title:isNew ? '新增宿舍房间' : '编辑宿舍房间', size:'wide', data:record || { capacity:4, status:'可用' }, fields:[
      { key:'building_id', label:'所属楼栋', type:'select', required:true, options:maps.buildings.map(function (item) { return { v:item.id, n:item.name }; }) }, { key:'floor', label:'楼层' }, { key:'room_number', label:'房间号', required:true }, { key:'capacity', label:'床位数', type:'number', required:true }, { key:'bed_numbers', label:'床位编号', hint:'用逗号或空格分隔；留空自动生成 1、2、3…' }, { key:'status', label:'房间状态', type:'select', options:['可用','维修','停用'] }, { key:'note', label:'备注', type:'textarea', rows:2 },
    ], onSave:async function (value) { var saved = upsert('v4_dorm_rooms', Object.assign({}, record || {}, value)); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast(isNew ? '房间已添加' : '房间已保存', 'ok'); }});
  }
  function dormBatchForm(record) {
    var isNew = !record;
    ui.form({ title:isNew ? '新增住宿批次' : '编辑住宿批次', data:record || { academic_year:'', term:termRange().name, batch_type:'新生入学', status:'草稿' }, fields:[
      { key:'academic_year', label:'学年', required:true }, { key:'term', label:'学期', required:true }, { key:'batch_type', label:'批次类型', type:'select', options:['新生入学','毕业退宿','年级分流','日常调整'] }, { key:'status', label:'状态', type:'select', options:['草稿','待确认','已确认','已关闭'] }, { key:'description', label:'说明', type:'textarea', rows:3 },
    ], onSave:async function (value) { var saved = upsert('v4_dorm_batches', Object.assign({}, record || {}, value)); await awaitTrackedSave(savePromiseOf(saved)); state().dormBatchId = saved.id; persistUiState(); render(); ui.toast(isNew ? '住宿批次已添加' : '住宿批次已保存', 'ok'); }});
  }
  function transferForm() {
    var maps = dormMaps();
    var assignments = rows('v4_dorm_assignments').filter(function (item) { return !['cancelled','checked_out'].includes(item.status); });
    var targetRooms = maps.rooms.filter(function (item) {
      var building = maps.buildingMap.get(String(item.building_id));
      return building && building.enabled !== false && item.status === '可用';
    }).map(function (item) { return { v:item.id, n:(maps.buildingMap.get(String(item.building_id)) || {}).name + ' · ' + item.room_number }; });
    ui.form({ title:'办理调宿', size:'wide', data:{ transfer_date:today(), operator:DB.settings.counselor_name || '' }, fields:[
      { key:'assignment_id', label:'原住宿记录', type:'select', required:true, options:assignments.map(function (item) { return { v:item.id, n:(item.student_name || item.student_number) + ' · ' + dormLocation(item, maps) }; }) }, { key:'to_room_id', label:'新房间', type:'select', required:true, options:targetRooms }, { key:'to_bed_number', label:'新床位编号', required:true }, { key:'transfer_date', label:'办理日期', type:'date', required:true }, { key:'reason', label:'调宿原因', required:true, type:'textarea', rows:2 }, { key:'operator', label:'操作人' }, { key:'transfer_files', label:'附件', type:'file', multiple:true, accept:'.pdf,.doc,.docx,.png,.jpg,.jpeg' },
    ], onSave:async function (value) {
      // Resolve the source assignment from the live collection on every submit.
      // A failed attempt restores collection rows with cloned snapshots; keeping
      // the form's original object reference would update a detached row on retry.
      var liveAssignments = rows('v4_dorm_assignments').filter(function (item) { return !['cancelled', 'checked_out'].includes(item.status); });
      var source = liveAssignments.find(function (item) { return String(item.id) === String(value.assignment_id); });
      var room = maps.roomMap.get(String(value.to_room_id));
      if (!source || !room) { ui.toast('原住宿或新房间不存在', 'warn'); return false; }
      var building = maps.buildingMap.get(String(room.building_id));
      var bed = String(value.to_bed_number || '').trim();
      if (!source.student_id) { ui.toast('原住宿记录缺少稳定学生 ID，不能办理调宿', 'warn'); return false; }
      if (!building || building.enabled === false) { ui.toast('目标楼栋已停用，不能办理调宿', 'warn'); return false; }
      if (room.status !== '可用') { ui.toast('目标房间不是可用状态，不能办理调宿', 'warn'); return false; }
      if (!bed || !Array.isArray(room.bed_numbers) || !room.bed_numbers.map(String).includes(bed)) { ui.toast('目标床位编号不属于该房间', 'warn'); return false; }
      if (String(source.room_id) === String(room.id) && String(source.bed_number) === bed) { ui.toast('新旧住宿位置相同，无需办理调宿', 'warn'); return false; }
      var conflict = liveAssignments.some(function (item) { return String(item.room_id) === String(room.id) && String(item.bed_number) === bed; });
      if (conflict) { ui.toast('新床位已有在住学生', 'warn'); return false; }
      var transferId = uid();
      var ids = await storeBusinessAttachments(value.transfer_files || [], transferId, { prefix:'dorm_transfer_attachment' });
      var transfer = normalize('v4_dorm_transfers', { id:transferId, student_id:source.student_id, student_number:source.student_number, student_name:source.student_name, from_building_id:source.building_id, from_room_id:source.room_id, from_bed_number:source.bed_number, to_building_id:building.id || room.building_id, to_room_id:room.id, to_bed_number:bed, reason:value.reason, transfer_date:value.transfer_date, operator:value.operator, attachment_ids:ids });
      var next = normalize('v4_dorm_assignments', { batch_id:source.batch_id, student_id:source.student_id, student_number:source.student_number, student_name:source.student_name, class_name:source.class_name, building_id:room.building_id, room_id:room.id, bed_number:bed, status:'confirmed', check_in_date:value.transfer_date });
      var assignmentRows = rows('v4_dorm_assignments');
      var transferRows = rows('v4_dorm_transfers');
      var previousAssignments = cloneData(assignmentRows);
      var previousTransfers = cloneData(transferRows);
      var previousDrafts = cloneData(rows('v4_worklog_drafts'));
      var previousStudents = cloneData(DB.students);
      var sourceBefore = { status:source.status, check_out_date:source.check_out_date, updated_at:source.updated_at };
      var current = student(source.student_id, source.student_number);
      var currentBefore = current ? { dorm_building:current.dorm_building, dorm_room:current.dorm_room, dorm:current.dorm, residence_type:current.residence_type } : null;
      try {
        transferRows.push(transfer);
        source.status = 'checked_out'; source.check_out_date = value.transfer_date; source.updated_at = new Date().toISOString();
        assignmentRows.push(next);
        if (current) { current.dorm_building = building && building.name || room.building_id; current.dorm_room = room.room_number || room.id; current.dorm = [current.dorm_building, current.dorm_room].filter(Boolean).join(' '); current.residence_type = '校内'; }
        window.__CWB_LAST_SAVE_PROMISE__ = null;
        var customSave = save('custom');
        var studentSave = current ? save('students') : null;
        await Promise.all([awaitTrackedSave(customSave), studentSave ? awaitTrackedSave(studentSave) : Promise.resolve({ ok:true })]);
      } catch (error) {
        assignmentRows.splice(0, assignmentRows.length); assignmentRows.push.apply(assignmentRows, previousAssignments);
        transferRows.splice(0, transferRows.length); transferRows.push.apply(transferRows, previousTransfers);
        var draftRows = rows('v4_worklog_drafts'); draftRows.splice(0, draftRows.length); draftRows.push.apply(draftRows, previousDrafts);
        DB.students.splice(0, DB.students.length); DB.students.push.apply(DB.students, previousStudents);
        Object.assign(source, sourceBefore);
        if (current && currentBefore) Object.assign(current, currentBefore);
        if (ids.length && typeof removeBusinessAttachments === 'function') await removeBusinessAttachments(ids);
        try {
          window.__CWB_LAST_SAVE_PROMISE__ = null;
          var restoreCustomSave = save('custom');
          var restoreStudentSave = current ? save('students') : null;
          await Promise.all([awaitTrackedSave(restoreCustomSave), restoreStudentSave ? awaitTrackedSave(restoreStudentSave) : Promise.resolve({ ok:true })]);
        } catch (restoreError) { error.record_restore_error = String(restoreError && restoreError.message || restoreError); }
        throw error;
      }
      render(); ui.toast('调宿已办理，历史位置已保留', 'ok');
    }});
  }
  function viewDorm() {
    var s = state();
    var active = s.dormTab || 'overview';
    var maps = dormMaps();
    var buildings = maps.buildings;
    var roomsList = maps.rooms;
    var batches = rows('v4_dorm_batches').slice().sort(function (a, b) { return String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')); });
    var selectedBatch = batches.find(function (item) { return String(item.id) === String(s.dormBatchId || ''); }) || batches.find(function (item) { return item.status !== '已关闭'; }) || batches[0] || null;
    var selectedBatchId = selectedBatch && selectedBatch.id || '';
    var batchOptions = '<option value="">选择住宿批次</option>' + batches.map(function (item) { return '<option value="' + esc(item.id) + '"' + (String(item.id) === String(selectedBatchId) ? ' selected' : '') + '>' + esc([item.academic_year, item.term, item.batch_type].filter(Boolean).join(' · ') || item.id) + ' · ' + esc(item.status || '草稿') + '</option>'; }).join('');
    var batchList = batches.map(function (item) { var count = rows('v4_dorm_assignments').filter(function (assignment) { return String(assignment.batch_id) === String(item.id) && !['cancelled', 'checked_out'].includes(assignment.status); }).length; return '<div class="v4-list-item"><div><strong>' + esc([item.academic_year, item.term, item.batch_type].filter(Boolean).join(' · ') || item.id) + '</strong><div class="tiny">' + count + ' 条当前住宿记录' + (item.description ? ' · ' + esc(item.description) : '') + '</div></div><span class="sp"></span><span class="tag ' + (item.status === '已确认' ? 'tag-green' : item.status === '已关闭' ? 'tag-amber' : 'tag-blue') + '">' + esc(item.status || '草稿') + '</span><button class="btn btn-sm' + (String(item.id) === String(selectedBatchId) ? ' btn-primary' : '') + '" data-act="v46-dorm-select-batch" data-id="' + esc(item.id) + '">' + (String(item.id) === String(selectedBatchId) ? '当前批次' : '设为当前') + '</button><button class="btn btn-sm" data-act="v46-dorm-batch-edit" data-id="' + esc(item.id) + '">编辑</button></div>'; }).join('') || '<div class="empty">还没有住宿批次，请先新增批次</div>';
    var assignments = rows('v4_dorm_assignments');
    var transfers = rows('v4_dorm_transfers').slice().sort(function (a, b) { return String(b.transfer_date || '').localeCompare(String(a.transfer_date || '')); });
    var activeAssignments = assignments.filter(function (item) { return !['cancelled','checked_out'].includes(item.status); });
    var body = '';
    if (active === 'transfers') {
      body = '<section class="card"><div class="card-hd"><h2>调宿历史</h2><span class="sp"></span><span class="tiny">' + transfers.length + ' 条</span></div><div class="card-bd"><div class="v4-list">' + (transfers.map(function (item) { var cancelled = item.status === 'cancelled'; var aiAction = '<button class="btn btn-sm ai-record-action" data-ai-record-action="v4_dorm_transfers:' + esc(item.id) + '" data-act="ai-inline" data-ai-purpose="dorm_conflict" data-ai-target-view="dorm" data-ai-target-collection="v4_dorm_transfers" data-ai-target-record-id="' + esc(item.id) + '" data-ai-student-id="' + esc(item.student_id || '') + '">AI 调宿检查</button>'; return '<div class="v4-list-item"><div><strong>' + esc(item.student_name || item.student_number || '未关联学生') + '</strong><div class="tiny">' + esc(item.transfer_date || '未填日期') + ' · ' + esc(item.reason || '未填原因') + '</div></div><span class="sp"></span><span class="tiny">' + esc(item.from_room_id || '') + ' → ' + esc(item.to_room_id || '') + '</span><span class="tag ' + (cancelled ? 'tag-amber' : 'tag-green') + '">' + (cancelled ? '已作废' : '有效') + '</span>' + aiAction + (cancelled ? '' : '<button class="btn btn-sm btn-danger" data-act="v46-dorm-cancel-transfer" data-id="' + esc(item.id) + '">作废</button>') + '</div>'; }).join('') || '<div class="empty">暂无调宿历史</div>') + '</div></div></section>';
    } else {
      var buildingMarkup = buildings.map(function (item) {
        return '<div class="v4-list-item"><div><strong>' + esc(item.name) + '</strong><div class="tiny">' + esc(item.campus || '未填校区') + ' · ' + esc(item.gender_limit) + '</div></div><span class="sp"></span><span class="tag ' + (item.enabled ? 'tag-green' : 'tag-amber') + '">' + (item.enabled ? '启用' : '停用') + '</span><button class="btn btn-sm" data-act="v46-dorm-building-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v46-dorm-building-delete" data-id="' + esc(item.id) + '">删除</button></div>';
      }).join('') || '<div class="empty">先建立楼栋和性别限制</div>';
      var roomMarkup = roomsList.map(function (item) {
        var building = maps.buildingMap.get(String(item.building_id));
        var used = activeAssignments.filter(function (assignment) { return String(assignment.room_id) === String(item.id); }).length;
        return '<div class="v4-list-item"><div><strong>' + esc(building && building.name || '未关联楼栋') + ' · ' + esc(item.room_number) + '</strong><div class="tiny">' + esc((item.bed_numbers || []).join('、')) + ' · ' + used + '/' + item.capacity + ' 已占用</div></div><span class="sp"></span><span class="tag tag-blue">' + esc(item.status) + '</span><button class="btn btn-sm" data-act="v46-dorm-room-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v46-dorm-room-delete" data-id="' + esc(item.id) + '">删除</button></div>';
      }).join('') || '<div class="empty">先建立房间和床位</div>';
      var currentAssignmentMarkup = activeAssignments.map(function (item) {
        return '<tr><td>' + esc(item.student_name || item.student_number || '未关联学生') + '</td><td>' + esc(item.class_name || '—') + '</td><td>' + esc(dormLocation(item, maps)) + '</td><td>' + esc(item.check_in_date || '—') + '</td><td>' + esc(item.status) + '</td><td class="td-acts">' + dormAssignmentAiAction(item) + '</td></tr>';
      }).join('') || '<tr><td colspan="6" class="muted">暂无当前住宿记录</td></tr>';
      body = '<section class="card"><div class="card-hd"><h2>排宿工作区</h2><span class="sp"></span><button class="btn btn-sm" data-act="v46-dorm-generate">生成排宿预览</button><button class="btn btn-sm" data-act="v46-dorm-import">导入数据</button><button class="btn btn-sm" data-act="v46-dorm-export">导出住宿清单</button></div><div class="card-bd"><div class="v4-toolbar"><select class="inp" data-v46-dorm-filter="class_name"><option value="">全部班级</option>' + classList().map(function (value) { return '<option value="' + esc(value) + '"' + (s.dormClass === value ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join('') + '</select><input class="inp" data-v46-dorm-filter="grade" placeholder="年级" value="' + esc(s.dormGrade || '') + '"><select class="inp" data-v46-dorm-filter="gender"><option value="">全部性别</option><option value="男"' + (s.dormGender === '男' ? ' selected' : '') + '>男</option><option value="女"' + (s.dormGender === '女' ? ' selected' : '') + '>女</option></select><button class="btn btn-sm" data-act="v46-dorm-clear-filter">清除筛选</button></div><p class="muted">排宿只生成预览，检查容量、性别限制、重复入住和未分配学生；点击人工确认后才会更新学生当前住宿快照。</p>' + dormPlanMarkup(s.dormPlan, maps) + '</div></section><div class="grid2"><section class="card"><div class="card-hd"><h2>楼栋</h2><span class="sp"></span><button class="btn btn-sm btn-primary" data-act="v46-dorm-building-new">新增</button></div><div class="card-bd"><div class="v4-list">' + buildingMarkup + '</div></div></section><section class="card"><div class="card-hd"><h2>房间与床位</h2><span class="sp"></span><button class="btn btn-sm btn-primary" data-act="v46-dorm-room-new">新增</button></div><div class="card-bd"><div class="v4-list">' + roomMarkup + '</div></div></section></div><section class="card"><div class="card-hd"><h2>当前住宿</h2><span class="sp"></span><button class="btn btn-sm" data-act="v46-dorm-batch-new">新增批次</button><button class="btn btn-primary btn-sm" data-act="v46-dorm-transfer-new">办理调宿</button></div><div class="card-bd"><div class="tw"><table><thead><tr><th>学生</th><th>班级</th><th>位置</th><th>入住</th><th>状态</th><th class="td-acts">AI 操作</th></tr></thead><tbody>' + currentAssignmentMarkup + '</tbody></table></div></div></section>';
    }
    if (active !== 'transfers') {
      body = body.replace('<div class="v4-toolbar"><select class="inp" data-v46-dorm-filter="class_name">', '<div class="v4-toolbar"><select class="inp" data-v46-dorm-batch>' + batchOptions + '</select><select class="inp" data-v46-dorm-filter="class_name">');
      body = body.replace('<p class="muted">排宿只生成预览，检查容量、性别限制、重复入住和未分配学生；点击人工确认后才会更新学生当前住宿快照。</p>', '<p class="muted">排宿只生成预览，检查容量、性别限制、重复入住和未分配学生；点击人工确认后才会更新学生当前住宿快照。当前批次：' + esc(selectedBatch ? [selectedBatch.academic_year, selectedBatch.term, selectedBatch.batch_type].filter(Boolean).join(' · ') : '未选择') + '</p>');
      body = body.replace('<section class="card"><div class="card-hd"><h2>当前住宿</h2>', '<section class="card"><div class="card-hd"><h2>住宿批次</h2><span class="sp"></span><span class="tiny">' + batches.length + ' 个</span><button class="btn btn-sm btn-primary" data-act="v46-dorm-batch-new">新增批次</button></div><div class="card-bd"><div class="v4-list">' + batchList + '</div></div></section><section class="card"><div class="card-hd"><h2>当前住宿</h2>');
    }
    return page('住宿专项', '维护住宿楼栋、房间、批次、排宿预览和调宿历史；与校外住宿台账分开管理。', '<div class="v4-stat-row"><div class="v4-stat"><span class="tiny">启用楼栋</span><b>' + buildings.filter(function (item) { return item.enabled; }).length + '</b></div><div class="v4-stat"><span class="tiny">房间</span><b>' + roomsList.length + '</b></div><div class="v4-stat"><span class="tiny">当前入住</span><b>' + activeAssignments.length + '</b></div><div class="v4-stat"><span class="tiny">调宿历史</span><b>' + transfers.length + '</b></div></div><div class="segmented v46-tabs"><button class="btn btn-sm' + (active === 'overview' ? ' btn-primary' : '') + '" data-act="v46-dorm-tab" data-tab="overview">排宿与住宿</button><button class="btn btn-sm' + (active === 'transfers' ? ' btn-primary' : '') + '" data-act="v46-dorm-tab" data-tab="transfers">调宿历史</button></div>' + body, '<button class="btn" data-act="v46-dorm-batch-new">住宿批次</button><button class="btn btn-primary" data-act="v46-dorm-building-new">新增楼栋</button>');
  }

  function roleRows() {
    var custom = rows('v4_committee_role_catalog');
    var defaults = v46.committee && v46.committee.defaults || [];
    var all = (defaults || []).concat(custom || []);
    return all.filter(function (item, index, list) { return list.findIndex(function (other) { return String(other.key || other.name) === String(item.key || item.name); }) === index; });
  }
  function committeePositionForm(record) {
    var isNew = !record;
    var roles = roleRows();
    ui.form({ title:isNew ? '新增班委任职' : '编辑班委任职', size:'wide', data:record || { status:'在任', term:termRange().name }, fields:[
      { key:'name', label:'班委角色', type:'select', required:true, options:roles.map(function (item) { return { v:item.name, n:item.name }; }) }, { key:'student_id', label:'任职学生', type:'select', options:studentOptions(true), hint:'状态选择“空缺”时可以不关联学生' }, { key:'class_name', label:'班级', list:'v4-class-list' }, { key:'term', label:'任期 / 学期' }, { key:'term_start', label:'任期开始', type:'date' }, { key:'term_end', label:'任期结束', type:'date' }, { key:'status', label:'状态', type:'select', options:['在任','代理','已卸任','待换届','空缺'] }, { key:'duty', label:'职责说明', type:'textarea', rows:2 }, { key:'note', label:'备注', type:'textarea', rows:2 },
    ], extra:'<datalist id="v4-class-list">' + classList().map(function (value) { return '<option value="' + esc(value) + '">'; }).join('') + '</datalist>', onSave:async function (value) {
      var s = student(value.student_id, value.student_number);
      if (value.status !== '空缺' && !s) { ui.toast('在任或代理班委必须关联学生；如暂缺请将状态改为“空缺”', 'warn'); return false; }
      var duplicate = rows('v4_positions').some(function (item) {
        if (record && String(item.id) === String(record.id)) return false;
        var sameStudent = s ? String(item.student_id || '') === String(s.id) : false;
        var sameRole = String(item.name || item.position || item.role_name || '') === String(value.name || '');
        if (!sameStudent || !sameRole || item.status === '已卸任' || item.status === '空缺') return false;
        if (value.term && item.term && String(value.term) !== String(item.term)) return false;
        var start = String(value.term_start || '0000-00-00'); var end = String(value.term_end || '9999-12-31');
        var itemStart = String(item.term_start || '0000-00-00'); var itemEnd = String(item.term_end || '9999-12-31');
        return start <= itemEnd && itemStart <= end;
      });
      if (duplicate) { ui.toast('同一学生在重叠任期内不能重复担任同一班委角色', 'warn'); return false; }
      var next = Object.assign({}, record || {}, value, { position:value.name, role_name:value.name, student_id:s && s.id || value.student_id, student_name:s && s.full_name || '', student_number:s && s.student_number || '', schema_version:8 });
      var saved = upsert('v4_positions', next);
      await awaitTrackedSave(savePromiseOf(saved));
      render(); ui.toast(isNew ? '班委任职已保存' : '班委任职已更新', 'ok');
    }});
  }
  function committeeRoleForm() {
    ui.form({ title:'新增班委角色', data:{ enabled:true, custom:true }, fields:[
      { key:'name', label:'角色名称', required:true, ph:'例如：权益委员、创新创业委员' }, { key:'key', label:'角色标识', ph:'可留空自动生成' }, { key:'note', label:'职责备注', type:'textarea', rows:2 }, { key:'enabled', label:'启用角色', type:'checkbox' },
    ], onSave:async function (value) {
      var duplicate = roleRows().some(function (item) { return String(item.name || '').trim() === String(value.name || '').trim(); });
      if (duplicate) { ui.toast('这个班委角色已经存在，请直接使用已有角色或修改名称', 'warn'); return false; }
       var saved = upsert('v4_committee_role_catalog', Object.assign({}, value, { custom:true, key:value.key || ('custom_' + Date.now()) })); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast('班委角色已添加', 'ok');
    }});
  }
  function committeeEvaluationForm(record) {
    var isNew = !record;
    var roles = roleRows();
    ui.form({ title:isNew ? '新增班委考核' : '编辑班委考核', size:'wide', data:record || { term:termRange().name, evaluation_date:today(), grade:'合格' }, fields:[
      { key:'student_id', label:'学生', type:'select', required:true, options:studentOptions(false) }, { key:'role_name', label:'班委角色', type:'select', required:true, options:roles.map(function (item) { return { v:item.name, n:item.name }; }) }, { key:'class_name', label:'班级' }, { key:'term', label:'考核周期', required:true }, { key:'evaluation_date', label:'考核日期', type:'date', required:true }, { key:'grade', label:'考核等级', type:'select', required:true, options:GRADES }, { key:'note', label:'考核备注', type:'textarea', rows:3 }, { key:'improvement', label:'改进建议', type:'textarea', rows:2 },
    ], onSave:async function (value) {
      var s = student(value.student_id, value.student_number);
      if (!s) { ui.toast('请选择有效学生', 'warn'); return false; }
      var roleName = String(value.role_name || '').trim();
      var term = String(value.term || '').trim();
      var duplicate = rows('v4_committee_evaluations').some(function (item) {
        if (record && String(item.id) === String(record.id)) return false;
        return String(item.student_id || '') === String(s.id) && String(item.role_name || item.position || '') === roleName && String(item.term || '').trim() === term;
      });
      if (duplicate) { ui.toast('同一学生、同一班委角色和考核周期已经有记录，未重复保存', 'warn'); return false; }
      var next = v46.committee.evaluate(Object.assign({}, record || {}, value, { student_id:s.id, student_name:s.full_name || '', student_number:s.student_number || '', class_name:value.class_name || s.class_name || '' }));
       var saved = upsert('v4_committee_evaluations', next); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast(isNew ? '班委考核已保存' : '班委考核已更新', 'ok');
    }});
  }
  function viewCommittee() {
    var s = state();
    var positions = rows('v4_positions').map(function (item) {
      var hit = student(item.student_id, item.student_number);
      if (hit && !item.student_id) { item.student_id = hit.id; item.student_name = hit.full_name; item.student_number = hit.student_number; }
      return item;
    });
    var evaluations = rows('v4_committee_evaluations');
    var className = s.committeeClass || '';
    var grade = s.committeeGrade || '';
    var evalRows = evaluations.filter(function (item) { return (!className || item.class_name === className) && (!grade || item.grade === grade); });
    var positionRows = positions.filter(function (item) { return !className || item.class_name === className; });
    var classes = [...new Set(positions.concat(evaluations).map(function (item) { return item.class_name; }).filter(Boolean))].sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
    return page('班委与考核', '支持默认角色、学校自定义角色、一人多职和按学期录入班委考核等级。AI 只可生成评价草稿，不会自动写入等级。', '<section class="card"><div class="card-hd"><h2>任职关系</h2><span class="sp"></span><span class="tiny">' + positionRows.length + ' 条</span><button class="btn btn-primary btn-sm" data-act="v46-committee-position-new">新增任职</button></div><div class="card-bd"><div class="v4-list">' + (positionRows.map(function (item) { return '<div class="v4-list-item"><div><strong>' + esc(item.name || item.position || '未命名角色') + '</strong><div class="tiny">' + esc(item.student_name || '空缺') + ' · ' + esc(item.class_name || '未分班') + ' · ' + esc(item.term || '') + '</div></div><span class="sp"></span><span class="tag ' + (item.status === '在任' ? 'tag-green' : 'tag-blue') + '">' + esc(item.status || '未填写') + '</span><button class="btn btn-sm" data-act="v46-committee-position-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v46-committee-position-delete" data-id="' + esc(item.id) + '">删除</button></div>'; }).join('') || '<div class="empty">暂无班委任职</div>') + '</div></div></section><section class="card"><div class="card-hd"><h2>班委角色与考核</h2><span class="sp"></span><button class="btn btn-sm" data-act="v46-committee-role-new">新增角色</button><button class="btn btn-primary btn-sm" data-act="v46-committee-evaluation-new">新增考核</button></div><div class="card-bd"><div class="v4-toolbar"><select class="inp" data-v46-committee-filter="class_name"><option value="">全部班级</option>' + selectOptions(classes, className, false) + '</select><select class="inp" data-v46-committee-filter="grade"><option value="">全部等级</option>' + selectOptions(GRADES, grade, false) + '</select><button class="btn btn-sm" data-act="v46-committee-clear-filter">清除筛选</button></div><div class="grid2"><div class="panel"><h3>可用角色</h3><div class="tiny">' + roleRows().map(function (item) { return '<span class="tag tag-blue" style="margin:2px">' + esc(item.name) + '</span>'; }).join('') + '</div></div><div class="panel"><h3>考核记录</h3><div class="v4-list">' + (evalRows.map(function (item) { return '<div class="v4-list-item"><div><strong>' + esc(item.student_name || item.student_number) + '</strong><div class="tiny">' + esc(item.role_name) + ' · ' + esc(item.term) + ' · ' + esc(item.evaluation_date) + '</div></div><span class="sp"></span><span class="tag ' + (item.grade === '优秀' ? 'tag-green' : item.grade === '不合格' ? 'tag-red' : 'tag-blue') + '">' + esc(item.grade) + '</span><button class="btn btn-sm" data-act="v46-committee-evaluation-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v46-committee-evaluation-delete" data-id="' + esc(item.id) + '">删除</button></div>'; }).join('') || '<div class="empty">暂无考核记录</div>') + '</div></div></div></div></section>', '');
  }

  function familyForm(record) {
    var isNew = !record;
    var current = record || { contact_date:today(), method:'电话' };
    ui.form({ title:isNew ? '新增家校联系记录' : '编辑家校联系记录', size:'wide', data:current, fields:[
     { key:'student_id', label:'学生', type:'select', required:true, options:studentOptions(false) }, { key:'parent_name', label:'家长姓名' }, { key:'parent_relation', label:'家长关系' }, { key:'parent_phone', label:'家长电话', hint:'列表默认脱敏；完整号码需通过访问锁确认' }, { key:'contact_date', label:'联系日期', type:'date', required:true }, { key:'method', label:'联系方式', type:'select', options:['电话','微信','短信','家访','家长会','其他'] }, { key:'purpose', label:'联系目的', required:true }, { key:'summary', label:'沟通摘要', type:'textarea', rows:3, required:true }, { key:'outcome', label:'沟通结果', type:'textarea', rows:2 }, { key:'next_action', label:'下一步', type:'textarea', rows:2 }, { key:'family_files', label:'附件', type:'file', multiple:true, accept:'.pdf,.doc,.docx,.png,.jpg,.jpeg' },
    ], onSave:async function (value) {
      var s = student(value.student_id);
      if (!s) { ui.toast('请选择有效学生', 'warn'); return false; }
      var liveRecord = record && rows('v4_family_contacts').find(function (item) { return String(item.id) === String(record.id); }) || record;
      var previousRows = snapshotCustomCollections(['v4_family_contacts', 'v4_worklog_drafts']);
      var nextValue = Object.assign({}, liveRecord || {}, value);
      if (!nextValue.id) nextValue.id = uid();
      var ids = await storeBusinessAttachments(value.family_files || [], nextValue.id, { prefix:'family_contact_attachment' });
      delete nextValue.family_files;
      nextValue.attachment_ids = mergeBusinessAttachmentIds(liveRecord && liveRecord.attachment_ids, liveRecord && liveRecord.attachments, ids);
      var next = normalize('v4_family_contacts', Object.assign({}, nextValue, { student_id:s.id, student_number:s.student_number, student_name:s.full_name, class_name:s.class_name, parent_name:value.parent_name || s.parent_name, parent_relation:value.parent_relation || s.parent_relation, parent_phone:value.parent_phone || s.parent_phone }));
      try {
        var saved = upsert('v4_family_contacts', next, { persist:false });
        createDraft(saved, 'v4_family_contacts', { title:'家校联系 · ' + (s.full_name || '学生'), category:'家校沟通', persist:false });
        await persistCustomChanges();
      } catch (error) {
        await restoreCustomState(previousRows, error);
        if (ids.length && typeof removeBusinessAttachments === 'function') await removeBusinessAttachments(ids);
        throw error;
      }
      render(); ui.toast(isNew ? '家校联系已保存，已生成待确认留痕草稿' : '家校联系已更新', 'ok', 3200);
    }});
  }
  function viewFamilyContacts() {
    var s = state();
    var q = String(s.familyQ || '').toLowerCase();
    var rowsList = rows('v4_family_contacts').filter(function (item) {
      return !q || [item.student_name, item.student_number, item.parent_name, item.parent_relation, item.method, item.purpose, item.summary].join(' ').toLowerCase().includes(q);
    }).sort(function (a, b) { return String(b.contact_date || '').localeCompare(String(a.contact_date || '')); });
     return page('家校联系', '把家长联系单独留痕，记录沟通目的、结果、下一步和附件，并可转为待确认工作记录。', '<section class="card"><div class="card-hd"><h2>家校联系台账</h2><span class="sp"></span><span class="tiny">显示 ' + rowsList.length + ' / ' + rows('v4_family_contacts').length + ' 条</span><button class="btn btn-primary btn-sm" data-act="v46-family-new">新增联系</button></div><div class="card-bd"><div class="v4-toolbar"><input class="inp" data-v46-family-search value="' + esc(s.familyQ || '') + '" placeholder="搜索学生、家长、目的或摘要"><button class="btn btn-sm" data-act="v46-family-clear-filter">清除筛选</button></div><div class="tw"><table><thead><tr><th>日期</th><th>学生</th><th>家长关系</th><th>方式</th><th>目的</th><th>结果 / 下一步</th><th>操作</th></tr></thead><tbody>' + (rowsList.map(function (item) { return '<tr><td>' + esc(item.contact_date) + '</td><td><strong>' + esc(item.student_name || item.student_number) + '</strong><div class="tiny">' + esc(item.class_name || '') + '</div></td><td>' + esc(item.parent_relation || '—') + '<div class="tiny">' + phone(item.parent_phone) + (item.parent_phone ? ' <button class="link-btn" data-act="v46-family-phone" data-id="' + esc(item.id) + '">查看</button>' : '') + '</div></td><td>' + esc(item.method) + '</td><td>' + esc(item.purpose) + '</td><td>' + esc([item.outcome, item.next_action].filter(Boolean).join(' · ') || '—') + '</td><td class="td-acts"><button class="link-btn" data-act="v46-family-edit" data-id="' + esc(item.id) + '">编辑</button><button class="link-btn danger" data-act="v46-family-delete" data-id="' + esc(item.id) + '">删除</button></td></tr>'; }).join('') || '<tr><td colspan="7">暂无家校联系记录</td></tr>') + '</tbody></table></div></div></section>', '<button class="btn" data-act="v46-family-export">导出联系记录</button><button class="btn btn-primary" data-act="v46-family-new">新增联系</button>');
  }

  function researchForm(record) {
    var isNew = !record;
    var stageOptions = STAGES.map(function (item) { return { v:item.key, n:item.label }; });
    ui.form({ title:isNew ? '新增科研课题' : '编辑科研课题', size:'wide', data:record || { level:'校级', current_stage:'application', status:'进行中', application_year:new Date().getFullYear() }, fields:[
      { key:'name', label:'课题名称', required:true, span:2 }, { key:'level', label:'级别', type:'select', options:['校级','市级','省级','国家级','其他'] }, { key:'principal', label:'负责人' }, { key:'participants', label:'参与人员' }, { key:'organization', label:'单位 / 学院' }, { key:'application_year', label:'申报年度' }, { key:'current_stage', label:'当前阶段', type:'select', options:stageOptions }, { key:'stage_due_date', label:'阶段截止日期', type:'date' }, { key:'next_action', label:'下一步动作', type:'textarea', rows:2 }, { key:'status', label:'项目状态', type:'select', options:['进行中','已结题','暂停','未立项'] }, { key:'research_files', label:'申报书 / 过程材料', type:'file', multiple:true, accept:'.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg' }, { key:'note', label:'备注', type:'textarea', rows:2 },
     ], onSave:async function (value) {
      var liveRecord = record && rows('v4_research_projects').find(function (item) { return String(item.id) === String(record.id); }) || record;
      var previousRows = snapshotCustomCollections(['v4_research_projects']);
      var nextValue = Object.assign({}, liveRecord || {}, value);
      if (!nextValue.id) nextValue.id = uid();
      if (liveRecord && liveRecord.current_stage && liveRecord.current_stage !== value.current_stage) nextValue = v46.research.advance(liveRecord, value.current_stage, { note:value.next_action, stage_due_date:value.stage_due_date });
      if (!nextValue.id) nextValue.id = liveRecord && liveRecord.id || uid();
      var ids = await storeBusinessAttachments(value.research_files || [], nextValue.id, { prefix:'research_attachment' });
      delete nextValue.research_files;
      nextValue.attachment_ids = mergeBusinessAttachmentIds(liveRecord && liveRecord.attachment_ids, liveRecord && liveRecord.attachments, ids);
      var next = normalize('v4_research_projects', nextValue);
      try { upsert('v4_research_projects', next, { persist:false }); await persistCustomChanges(); }
      catch (error) { await restoreCustomState(previousRows, error); if (ids.length && typeof removeBusinessAttachments === 'function') await removeBusinessAttachments(ids); throw error; }
      render(); ui.toast(isNew ? '科研课题已建立' : '科研课题已更新', 'ok');
    }});
  }
  function viewResearch() {
    var s = state();
    var q = String(s.researchQ || '').toLowerCase();
    var list = rows('v4_research_projects').filter(function (item) { return !q || [item.name, item.level, item.principal, item.organization, item.current_stage, item.next_action].join(' ').toLowerCase().includes(q); }).sort(function (a, b) { return String(a.stage_due_date || '9999').localeCompare(String(b.stage_due_date || '9999')); });
    var stageCards = STAGES.map(function (stage) {
      var items = list.filter(function (item) { return item.current_stage === stage.key; });
      return '<section class="panel v46-research-stage"><div class="panel-hd"><strong>' + esc(stage.label) + '</strong><span class="tag tag-blue">' + items.length + '</span></div>' + items.slice(0, 8).map(function (item) { return '<div class="v46-research-card"><strong>' + esc(item.name) + '</strong><span>' + esc(item.level) + ' · ' + esc(item.stage_due_date || '未设截止') + '</span><button class="btn btn-sm" data-act="v46-research-edit" data-id="' + esc(item.id) + '">打开</button></div>'; }).join('') + '</section>';
    }).join('');
    var rowsHtml = list.map(function (item) { return '<tr><td><strong>' + esc(item.name) + '</strong><div class="tiny">' + esc(item.principal || '未填写负责人') + ' · ' + esc(item.organization || '') + '</div></td><td>' + esc(item.level) + '</td><td>' + esc((STAGES.find(function (stage) { return stage.key === item.current_stage; }) || {}).label || item.current_stage) + '</td><td>' + esc(item.stage_due_date || '—') + '</td><td>' + esc(item.next_action || '—') + '</td><td class="td-acts"><button class="link-btn" data-act="v46-research-task" data-id="' + esc(item.id) + '">生成阶段任务</button><button class="link-btn" data-act="v46-research-edit" data-id="' + esc(item.id) + '">编辑</button><button class="link-btn danger" data-act="v46-research-delete" data-id="' + esc(item.id) + '">删除</button></td></tr>'; }).join('');
    return page('科研课题', '把申请、申报、立项、开题、中期、结题材料按阶段留在日程中，阶段变化保留历史。', '<section class="card"><div class="card-hd"><h2>课题阶段看板</h2><span class="sp"></span><span class="tiny">' + list.length + ' 个课题</span><button class="btn btn-primary btn-sm" data-act="v46-research-new">新增课题</button></div><div class="card-bd"><div class="v4-toolbar"><input class="inp" data-v46-research-search value="' + esc(s.researchQ || '') + '" placeholder="搜索课题、负责人、级别或下一步"><button class="btn btn-sm" data-act="v46-research-clear-filter">清除筛选</button></div><div class="v46-research-board">' + stageCards + '</div></div></section><section class="card"><div class="card-hd"><h2>课题清单</h2><span class="sp"></span><button class="btn btn-sm" data-act="v46-research-export">导出清单</button></div><div class="card-bd"><div class="tw"><table><thead><tr><th>课题</th><th>级别</th><th>阶段</th><th>截止</th><th>下一步</th><th>操作</th></tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="6">暂无科研课题</td></tr>') + '</tbody></table></div></div></section>', '<button class="btn btn-primary" data-act="v46-research-new">新增课题</button>');
  }

  function classSources() {
    return { honor:DB.honor, rewards:DB.rewards, attend:DB.attend, talks:DB.talks, grades:DB.grades, activityParticipants:rows('v4_activity_participants'), grants:DB.grant, aidRecords:rows('v4_aid_records') };
  }
  function metricLabel(key) {
    return { awards_count:'获奖 / 荣誉', absence_count:'旷课 / 缺勤', talks_count:'谈话次数', focus:'重点关注', academic_warning_count:'学业预警', activity_count:'活动次数', aid_count:'资助记录' }[key] || key;
  }
  function displayMetric(value) {
    return value == null ? '<span class="muted">未记录</span>' : String(value);
  }
  function viewClassAnalysis() {
    var s = state();
    var className = s.analysisClass || '';
    var term = s.analysisTerm || '';
    var from = s.analysisFrom || '';
    var to = s.analysisTo || '';
    var classes = classList();
    var summary = v46.analysis.classSummary({ class_name:className, term:term, from:from, to:to, students:DB.students, sources:classSources() });
    var metrics = ['awards_count','absence_count','talks_count','focus','academic_warning_count','activity_count','aid_count'];
    var cards = metrics.map(function (key) { return '<button class="v4-stat v46-analysis-stat" data-act="v46-analysis-drill" data-metric="' + key + '"><span class="tiny">' + metricLabel(key) + '</span><b>' + displayMetric(summary.totals[key]) + '</b></button>'; }).join('');
    var comparison = s.analysisCompare && s.analysisCompare.length ? v46.analysis.compareClasses({ classes:s.analysisCompare, term:term, from:from, to:to, students:DB.students, sources:classSources() }) : [];
    var compareHtml = comparison.length ? '<div class="tw" style="margin-top:12px"><table><thead><tr><th>班级</th><th>人数</th>' + metrics.map(function (key) { return '<th>' + metricLabel(key) + '</th>'; }).join('') + '</tr></thead><tbody>' + comparison.map(function (item) { return '<tr><td>' + esc(item.class_name) + '</td><td>' + item.student_count + '</td>' + metrics.map(function (key) { return '<td>' + displayMetric(item.totals[key]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>' : '';
    var detailAllowed = !!(s.analysisDetailUnlocked && security && security.isEnabled && security.isEnabled() && !security.isLocked());
    var rowsHtml = summary.rows.map(function (item) { return '<tr><td>' + esc(item.student_name || item.student_number) + '</td><td>' + esc(item.student_number || '—') + '</td><td>' + displayMetric(item.awards_count) + '</td><td>' + displayMetric(item.absence_count) + '</td><td>' + displayMetric(item.talks_count) + '</td><td>' + displayMetric(item.focus) + '</td><td>' + displayMetric(item.academic_warning_count) + '</td><td><button class="link-btn" data-act="v46-analysis-student" data-id="' + esc(item.student_id) + '">查看台账</button></td></tr>'; }).join('');
    var detailPanel = detailAllowed ? '<div class="tw"><table><thead><tr><th>学生</th><th>学号</th><th>获奖</th><th>缺勤</th><th>谈话</th><th>重点关注</th><th>学业预警</th><th>操作</th></tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="8">暂无学生数据</td></tr>') + '</tbody></table></div>' : '<div class="panel"><p class="muted" style="margin-top:0">默认只显示班级聚合结果，不在此页直接展开姓名、学号或敏感指标明细。</p><button class="btn btn-primary btn-sm" data-act="v46-analysis-details">访问锁验证后查看个人明细</button></div>';
    var compareOptions = selectOptions(classes, '', false);
    return page('班级综合分析', '按班级、学期和时间范围汇总工作记录；默认只显示聚合数量，个人明细需要访问锁验证。', '<section class="card"><div class="card-hd"><h2>筛选与对比</h2><span class="sp"></span><button class="btn btn-sm" data-act="ai-inline" data-ai-purpose="class_summary" data-ai-target-view="class-analysis" data-ai-target-collection="students">生成班级分析草稿</button><button class="btn btn-primary btn-sm" data-act="v46-analysis-export">导出聚合结果</button></div><div class="card-bd"><div class="v4-toolbar"><select class="inp" data-v46-analysis-filter="class"><option value="">全部班级</option>' + selectOptions(classes, className, false) + '</select><input class="inp" data-v46-analysis-filter="term" placeholder="学期" value="' + esc(term) + '"><input class="inp" type="date" data-v46-analysis-filter="from" value="' + esc(from) + '"><input class="inp" type="date" data-v46-analysis-filter="to" value="' + esc(to) + '"><button class="btn btn-sm" data-act="v46-analysis-clear">清除筛选</button></div><div class="grid2"><div class="form-row"><label class="lab">班级对比（可多选）</label><select class="inp" multiple size="5" data-v46-analysis-compare>' + compareOptions + '</select></div><div class="panel"><strong>当前范围</strong><div class="tiny">' + esc(className || '全部班级') + ' · ' + esc(term || '全部学期') + ' · 学生 ' + summary.student_count + ' 人</div><p class="muted">没有记录显示“未记录”，不会把缺失数据当成零。</p></div></div><div class="v4-stat-row">' + cards + '</div>' + compareHtml + '</div></section><section class="card"><div class="card-hd"><h2>学生指标明细</h2><span class="sp"></span><span class="tiny">' + summary.rows.length + ' 人</span></div><div class="card-bd">' + detailPanel + '</div></section>', '');
  }

  function openDraftSource(id) {
    var draft = rows('v4_worklog_drafts').find(function (item) { return String(item.id) === String(id); });
    if (!draft) return;
    var source = sourceRecord(draft.source_collection, draft.source_id);
    if (!source) return ui.toast('来源记录已删除，无法打开原记录；请重新创建留痕', 'warn', 4200);
    var routes = {
      students:{ view:'students', action:'student-view' }, tasks:{ view:'tasks', action:'task-edit' }, talks:{ view:'talks', action:'talk-edit' },
      worklogs:{ view:'worklogs', action:'worklog-edit' }, activities:{ view:'activities', action:'activity-edit' },
      v4_family_contacts:{ view:'family', action:'v46-family-edit' }, v4_research_projects:{ view:'research', action:'v46-research-edit' },
      v4_class_checks:{ view:'class-checks', action:'v47-class-edit' }, v4_dorm_inspections:{ view:'dorm-inspections', action:'v47-dorm-inspection-edit' },
      v4_dorm_exceptions:{ view:'dorm-inspections', action:'v47-dorm-exception-edit' }, v4_assessment_entries:{ view:'assessment', action:'v47-assessment-edit' },
    };
    var route = routes[draft.source_collection];
    if (!route) {
      if (draft.source_collection === 'v4_ai_suggestions') { state().aiSuggestionQuery = source.title || ''; go('ai'); return; }
      if (draft.source_collection === 'v4_roll_call_sessions') { state().rollResult = source; go('roll-call'); return; }
      return ui.toast('该来源类型暂不支持直接打开，请按来源分类进入对应模块', 'warn', 3600);
    }
    go(route.view);
    if (typeof ACTS[route.action] === 'function') ACTS[route.action](source.id);
  }

  function viewWorklogDrafts() {
    var s = state();
    var q = String(s.worklogDraftQ || '').trim().toLowerCase();
    var all = rows('v4_worklog_drafts').filter(function (item) { return ['draft','stale'].includes(item.status); });
    var list = all.filter(function (item) { return !q || [item.title, item.student_name, item.student_number, item.source_collection, item.summary, item.result, item.next_action].join(' ').toLowerCase().includes(q); }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var html = list.map(function (item) {
      var source = sourceRecord(item.source_collection, item.source_id);
      var sourceAction = source ? '<button class="btn btn-sm" data-act="v46-draft-source" data-id="' + esc(item.id) + '">查看来源</button>' : '<span class="tiny tag tag-amber">来源已删除</span>';
      return '<div class="v4-list-item v46-draft-row"><div><strong>' + esc(item.title) + '</strong><div class="tiny">' + esc(item.date) + ' · ' + esc(item.student_name || '跨模块') + ' · 来源 ' + esc(item.source_collection || '未知') + '</div><p class="muted">' + esc(item.summary || '暂无摘要') + '</p></div><span class="sp"></span><span class="tag ' + (item.status === 'stale' ? 'tag-amber' : 'tag-blue') + '">' + (item.status === 'stale' ? '来源已变化' : '待确认') + '</span>' + sourceAction + '<button class="btn btn-sm btn-primary" data-act="v46-draft-confirm" data-id="' + esc(item.id) + '">' + (item.status === 'stale' ? '先核对来源' : '确认归档') + '</button><button class="btn btn-sm" data-act="v46-draft-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v46-draft-dismiss" data-id="' + esc(item.id) + '">驳回</button></div>';
    }).join('');
    var filter = '<div class="v4-toolbar"><input class="inp" data-v46-draft-search value="' + esc(s.worklogDraftQ || '') + '" placeholder="搜索事项、学生、来源或摘要" aria-label="搜索待确认工作记录"><button class="btn btn-sm" data-act="v46-draft-clear-filter">清除筛选</button><span class="tiny">显示 ' + list.length + ' / ' + all.length + ' 条</span></div>';
    return page('待确认工作记录', '谈话、家校联系、任务完成等行为只生成草稿；人工确认后才进入正式工作留痕，避免自动制造事实。', '<section class="card"><div class="card-hd"><h2>待确认草稿</h2><span class="sp"></span><span class="tag tag-blue">' + all.length + ' 条</span></div><div class="card-bd">' + filter + '<div class="v4-list">' + (html || '<div class="empty">暂无匹配的待确认工作记录</div>') + '</div></div></section>', '<button class="btn" data-act="v46-draft-refresh">刷新</button>');
  }

  function homeSummary() {
    var open = DB.tasks.filter(function (item) { return item.status !== 'done'; });
    var overdue = open.filter(function (item) { return daysFromToday(item.due) < 0; });
    var dueToday = open.filter(function (item) { return item.due === today(); });
    var follow = DB.talks.filter(function (item) { var d = daysFromToday(item.follow_date); return item.need_follow && !item.done_follow && d != null && d <= 0; });
    var drafts = rows('v4_worklog_drafts').filter(function (item) { return item.status === 'draft' || item.status === 'stale'; });
    var researchDue = rows('v4_research_projects').filter(function (item) { return item.status === '进行中' && item.stage_due_date && daysFromToday(item.stage_due_date) <= 7; });
    var items = overdue.slice(0, 2).map(function (item) { return { label:'逾期任务 · ' + item.title, view:'tasks' }; }).concat(follow.slice(0, 2).map(function (item) { return { label:'待回访 · ' + (item.student_name || item.student_number), view:'talks' }; })).concat(drafts.slice(0, 2).map(function (item) { return { label:'待确认留痕 · ' + item.title, view:'worklog-drafts' }; })).concat(researchDue.slice(0, 1).map(function (item) { return { label:'课题节点 · ' + item.name, view:'research' }; })).slice(0, 5);
    return '<section class="card v46-home-summary"><div class="card-hd"><h2><svg class="ic"><use href="#i-flag"/></svg>工作摘要</h2><span class="sp"></span><span class="tiny">首屏只显示最紧急的 5 条</span></div><div class="card-bd"><div class="v46-summary-strip"><button class="v4-stat" data-view="tasks"><span class="tiny">未完成任务</span><b>' + open.length + '</b></button><button class="v4-stat" data-view="tasks"><span class="tiny">今日到期</span><b>' + dueToday.length + '</b></button><button class="v4-stat" data-view="tasks"><span class="tiny">逾期事项</span><b>' + overdue.length + '</b></button><button class="v4-stat" data-view="talks"><span class="tiny">待回访</span><b>' + follow.length + '</b></button><button class="v4-stat" data-view="worklog-drafts"><span class="tiny">待确认留痕</span><b>' + drafts.length + '</b></button><button class="v4-stat" data-view="research"><span class="tiny">近 7 天课题节点</span><b>' + researchDue.length + '</b></button></div><details class="v46-summary-details"><summary>展开最紧急事项</summary><div class="v4-list">' + (items.map(function (item) { return '<button class="v4-list-item v46-summary-item" data-view="' + item.view + '">' + esc(item.label) + '<span class="sp"></span><svg class="ic"><use href="#i-arrow"/></svg></button>'; }).join('') || '<div class="empty">当前没有需要优先处理的事项</div>') + '</div></details></div></section>';
  }

  var legacyHome = VIEWS.home;
  VIEWS.home = function () { return legacyHome(); };
  VIEWS.utilities = viewUtilities;
  VIEWS.dorm = viewDorm;
  VIEWS.committee = viewCommittee;
  VIEWS.family = viewFamilyContacts;
  VIEWS.research = viewResearch;
  VIEWS['class-analysis'] = viewClassAnalysis;
  VIEWS['worklog-drafts'] = viewWorklogDrafts;

  root.CWB = root.CWB || {};
  root.CWB.v46 = v46;
  root.CWB.utilities = v46.utilities;
  root.CWB.dorm = v46.dorm;
  root.CWB.committee = v46.committee;
  root.CWB.familyContacts = v46.familyContacts;
  root.CWB.worklogDrafts = Object.assign({}, v46.worklogDrafts, {
    createFromRecord:createDraft,
    // Keep the pre-v4.7 synchronous public contract for integrations that
    // consume the returned record immediately. UI actions use the awaited
    // variants so a success toast means the save actually completed.
    confirm:confirmDraftCompat,
    dismiss:dismissDraftCompat,
    confirmAsync:confirmDraft,
    dismissAsync:dismissDraft,
  });
  root.CWB.research = v46.research;
  root.CWB.analysis = v46.analysis;
  root.CWBV46UI = { createWorklogDraft:draftFromRecord, confirmWorklogDraft:confirmDraft, dismissWorklogDraft:dismissDraft, markSourceDraftStale:markSourceDraftStale, sourceHash:v46SourceHash };

  function addNav() {
    var nav = document.querySelector('#nav-modules');
    if (!nav || nav.querySelector('[data-view="utilities"]')) return;
    var group = document.createElement('div');
    group.className = 'nav-group';
    group.dataset.group = '业务协同';
    group.innerHTML = '业务协同<svg class="nav-fold-ic" data-fold="业务协同"><use href="#i-chev"/></svg>';
    nav.appendChild(group);
    var items = [
      ['utilities', 'i-sparkles', '实用工具'], ['dorm', 'i-bed', '住宿专项'], ['committee', 'i-users', '班委与考核'],
      ['family', 'i-talk', '家校联系'], ['research', 'i-book', '科研课题'], ['class-analysis', 'i-chart', '班级综合分析'],
      ['worklog-drafts', 'i-flag', '待确认工作记录'],
    ];
    items.forEach(function (item) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'nav-item';
      button.dataset.view = item[0];
      button.innerHTML = '<svg class="ic"><use href="#' + item[1] + '"/></svg>' + item[2];
      nav.appendChild(button);
    });
    applyFold();
    renderPinned();
    updatePinStates();
  }

  function runUtility() {
    var s = state();
    var tab = s.utilityTab || 'draw';
    try {
      var list = document.querySelector('[data-v46-utility-list]');
      var input = list && list.value || '';
      var data;
      if (tab === 'draw') data = v46.utilities.draw({ items:input, count:Number((document.querySelector('[data-v46-utility-count]') || {}).value) || 1, seed:(document.querySelector('[data-v46-utility-seed]') || {}).value || '', allowRepeat:!!(document.querySelector('[data-v46-utility-repeat]') || {}).checked });
      if (tab === 'group') data = v46.utilities.group({ items:input, groupCount:Number((document.querySelector('[data-v46-utility-groups]') || {}).value) || 0, perGroup:Number((document.querySelector('[data-v46-utility-per-group]') || {}).value) || 0, seed:(document.querySelector('[data-v46-utility-seed]') || {}).value || '' });
      if (tab === 'rotation') data = v46.utilities.generateRotation({ people:input, startDate:(document.querySelector('[data-v46-utility-start]') || {}).value, intervalDays:Number((document.querySelector('[data-v46-utility-interval]') || {}).value) || 1, cycles:Number((document.querySelector('[data-v46-utility-cycles]') || {}).value) || 7 });
      if (tab === 'date') data = v46.utilities.dateDiff({ from:(document.querySelector('[data-v46-utility-from]') || {}).value, to:(document.querySelector('[data-v46-utility-to]') || {}).value });
      if (tab === 'clean') data = v46.utilities.cleanList(input);
      s.utilityResult = { kind:tab, data:data, result_id:'utility_' + uid(), saved_task_id:'', saved_worklog_id:'', generated_at:new Date().toISOString() };
      render();
    } catch (error) { ui.toast(v46Error(error, '工具输入不完整'), 'err', 3600); }
  }
  function utilityResultId(result) {
    if (!result.result_id) result.result_id = 'utility_' + uid();
    return result.result_id;
  }
  function utilityResultText(result, prefix) {
    var text = result.kind === 'draw' ? result.data.items.join('、') : result.kind === 'group' ? result.data.groups.map(function (item) { return item.name + '：' + item.items.join('、'); }).join('\n') : result.kind === 'rotation' ? result.data.items.map(function (item) { return item.date + ' ' + item.person; }).join('\n') : JSON.stringify(result.data);
    return prefix ? prefix + text : text;
  }
  async function saveUtilityTask() {
    var result = state().utilityResult;
    if (!result) return ui.toast('请先生成工具结果', 'warn');
    var previousTasks = cloneData(DB.tasks || []);
    var previousResult = cloneData(result);
    try {
      var sourceId = utilityResultId(result);
      var existing = DB.tasks.find(function (item) { return String(item.source_id || '') === String(sourceId) && item.source_type === 'utility_result'; });
      if (existing) { result.saved_task_id = existing.id; render(); return ui.toast('这份工具结果已经保存为任务，不会重复创建', 'ok', 2800); }
      var text = utilityResultText(result);
      var saved = normTask({ title:'实用工具结果 · ' + result.kind, source:'实用工具', source_type:'utility_result', source_id:sourceId, duty:'daily', priority:'P2', due:today(), note:text });
      DB.tasks.push(saved); result.saved_task_id = saved.id;
      window.__CWB_LAST_SAVE_PROMISE__ = null;
      await awaitTrackedSave(save('tasks'));
      render(); ui.toast('已保存为任务', 'ok');
    } catch (error) {
      DB.tasks.splice(0, DB.tasks.length); DB.tasks.push.apply(DB.tasks, previousTasks);
      Object.assign(result, previousResult);
      try { await awaitTrackedSave(save('tasks')); } catch (restoreError) { error.record_restore_error = String(restoreError && restoreError.message || restoreError); }
      ui.toast(v46Error(error, '任务保存失败'), 'err', 5200, { label:'重试', onClick:function () { saveUtilityTask(); } });
    }
  }
  async function saveUtilityWorklog() {
    var result = state().utilityResult;
    if (!result) return ui.toast('请先生成工具结果', 'warn');
    var previousWorklogs = cloneData(DB.worklogs || []);
    var previousResult = cloneData(result);
    try {
      var sourceId = utilityResultId(result);
      var existing = DB.worklogs.find(function (item) { return String(item.source_id || '') === String(sourceId) && item.source_collection === 'utility_result'; });
      if (existing) { result.saved_worklog_id = existing.id; render(); return ui.toast('这份工具结果已经保存为工作留痕，不会重复创建', 'ok', 2800); }
      var text = utilityResultText(result, result.kind === 'draw' ? '抽签：' : '');
      var saved = normV4Record({ date:today(), title:'实用工具结果 · ' + result.kind, category:'其他', status:'已归档', summary:text, source:'实用工具', source_collection:'utility_result', source_id:sourceId }, 'worklogs');
      DB.worklogs.push(saved); result.saved_worklog_id = saved.id;
      window.__CWB_LAST_SAVE_PROMISE__ = null;
      await awaitTrackedSave(save('worklogs'));
      render(); ui.toast('已保存为工作留痕', 'ok');
    } catch (error) {
      DB.worklogs.splice(0, DB.worklogs.length); DB.worklogs.push.apply(DB.worklogs, previousWorklogs);
      Object.assign(result, previousResult);
      try { await awaitTrackedSave(save('worklogs')); } catch (restoreError) { error.record_restore_error = String(restoreError && restoreError.message || restoreError); }
      ui.toast(v46Error(error, '工作留痕保存失败'), 'err', 5200, { label:'重试', onClick:function () { saveUtilityWorklog(); } });
    }
  }
  function dormGenerate() {
    var s = state();
    var batches = rows('v4_dorm_batches');
    var batch = batches.find(function (item) { return String(item.id) === String(s.dormBatchId || ''); }) || batches.find(function (item) { return item.status !== '已关闭'; });
    if (!batch) return ui.toast('请先新增一个住宿批次，再生成排宿预览', 'warn');
    if (batch.status === '已关闭') return ui.toast('当前住宿批次已关闭，不能继续排宿', 'warn');
    s.dormBatchId = batch.id;
    var plan = v46.dorm.plan({ batch_id:batch.id, students:DB.students, buildings:rows('v4_dorm_buildings'), rooms:rows('v4_dorm_rooms'), existingAssignments:rows('v4_dorm_assignments'), filters:{ class_name:s.dormClass || '', grade:s.dormGrade || '', gender:s.dormGender || '' }, check_in_date:today() });
    s.dormPlan = plan;
    persistUiState();
    render();
  }
  async function dormConfirm() {
    var s = state();
    var plan = s.dormPlan;
    if (!plan || !plan.valid) return ui.toast('当前排宿方案存在冲突，不能确认', 'warn');
    var assignmentRows = rows('v4_dorm_assignments');
    var batchRows = rows('v4_dorm_batches');
    var previousAssignments = cloneData(assignmentRows);
    var previousBatches = cloneData(batchRows);
    var previousStudents = cloneData(DB.students);
    var previousDrafts = cloneData(rows('v4_worklog_drafts'));
    try {
      var maps = dormMaps();
      var applied = v46.dorm.apply(plan, { buildings:maps.buildings, rooms:maps.rooms, existingAssignments:rows('v4_dorm_assignments') });
      applied.assignments.forEach(function (item) {
        var next = normalize('v4_dorm_assignments', item);
        var index = assignmentRows.findIndex(function (current) { return String(current.id) === String(next.id); });
        if (index >= 0) assignmentRows[index] = next; else assignmentRows.push(next);
        var building = maps.buildingMap.get(String(next.building_id));
        var room = maps.roomMap.get(String(next.room_id));
        var current = student(next.student_id, next.student_number);
        if (current) {
          current.dorm_building = building && building.name || next.building_id;
          current.dorm_room = room && room.room_number || next.room_id;
          current.dorm = [current.dorm_building, current.dorm_room].filter(Boolean).join(' ');
          current.residence_type = '校内';
          current.dorm_assignment_id = next.id;
        }
      });
      var batch = rows('v4_dorm_batches').find(function (item) { return String(item.id) === String(plan.batch_id || ''); });
      if (batch) { batch.status = '已确认'; batch.confirmed_at = new Date().toISOString(); }
      // Persist the complete plan once. Per-record workspace writes can race and
      // cause a later legacy snapshot to overwrite earlier assignments. Keep the
      // preview in memory until both writes are durable so a failed save can be
      // retried without regenerating a different assignment plan.
      window.__CWB_LAST_SAVE_PROMISE__ = null;
      var studentSave = save('students');
      var customSave = save('custom');
      await Promise.all([awaitTrackedSave(studentSave), awaitTrackedSave(customSave)]);
      s.dormPlan = null; render(); ui.toast('排宿方案已确认，学生住宿快照已更新', 'ok', 3600);
    } catch (error) {
      assignmentRows.splice(0, assignmentRows.length); assignmentRows.push.apply(assignmentRows, previousAssignments);
      batchRows.splice(0, batchRows.length); batchRows.push.apply(batchRows, previousBatches);
      DB.students.splice(0, DB.students.length); DB.students.push.apply(DB.students, previousStudents);
      var draftRows = rows('v4_worklog_drafts'); draftRows.splice(0, draftRows.length); draftRows.push.apply(draftRows, previousDrafts);
      try {
        window.__CWB_LAST_SAVE_PROMISE__ = null;
        var restoreStudentSave = save('students');
        var restoreCustomSave = save('custom');
        await Promise.all([awaitTrackedSave(restoreStudentSave), awaitTrackedSave(restoreCustomSave)]);
      } catch (restoreError) { error.record_restore_error = String(restoreError && restoreError.message || restoreError); }
      ui.toast(v46Error(error, '排宿方案验证失败'), 'err', 5200, { label:'重试', onClick:function () { dormConfirm(); } });
    }
  }

  function dormImport() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.csv,.xlsx,.xls,text/csv';
    input.onchange = async function () {
      var file = input.files && input.files[0]; if (!file) return;
      var run = async function () {
        var previous = snapshotCustomCollections(['v4_dorm_assignments', 'v4_dorm_rooms', 'v4_dorm_buildings']);
      try {
        var importRows = await readFeedbackRows(file, { id:['id','记录编号'], campus:['校区'], name:['楼栋','楼栋名称','building'], gender_limit:['性别限制','性别'], building_id:['楼栋ID','building_id'], floor:['楼层'], room_number:['房间号','宿舍号','room'], capacity:['床位数','容量','capacity'], bed_numbers:['床位编号','beds'], student_number:['学号'], student_id:['学生ID','student_id'], student_name:['学生姓名','姓名'], bed_number:['床位'], check_in_date:['入住日期'] });
        var added = 0;
        var grouped = { v4_dorm_assignments:[], v4_dorm_rooms:[], v4_dorm_buildings:[] };
        importRows.forEach(function (item) {
          var key = item.student_id || item.student_number ? 'v4_dorm_assignments' : item.room_number || item.room ? 'v4_dorm_rooms' : item.name ? 'v4_dorm_buildings' : '';
          if (!key) return;
          var value = Object.assign({}, item);
          if (key === 'v4_dorm_assignments') {
            var linked = student(value.student_id, value.student_number);
            if (linked) Object.assign(value, { student_id:linked.id, student_number:linked.student_number, student_name:linked.full_name, class_name:linked.class_name });
          }
          grouped[key].push(normalize(key, value));
          added++;
        });
        Object.keys(grouped).forEach(function (key) {
          grouped[key].forEach(function (next) {
            var list = rows(key); var index = list.findIndex(function (item) { return String(item.id) === String(next.id); });
            if (index >= 0) list[index] = next; else list.push(next);
          });
        });
        if (added) await persistCustomChanges();
        render(); ui.toast('住宿数据已导入：' + added + ' 条', 'ok');
      } catch (error) {
        await restoreCustomState(previous, error);
        ui.toast('住宿导入失败：' + v46Error(error, '格式不正确'), 'err', 5200, { label:'重试', onClick:function () { run(); } });
      }
      };
      await run();
    };
    input.click();
  }
  function dormExport() {
    var maps = dormMaps();
    var rowsOut = [['学生ID','姓名','学号','班级','楼栋','房间','床位','入住日期','退宿日期','状态']].concat(rows('v4_dorm_assignments').map(function (item) { return [item.student_id, item.student_name, item.student_number, item.class_name, maps.buildingMap.get(String(item.building_id)) && maps.buildingMap.get(String(item.building_id)).name || item.building_id, maps.roomMap.get(String(item.room_id)) && maps.roomMap.get(String(item.room_id)).room_number || item.room_id, item.bed_number, item.check_in_date, item.check_out_date, item.status]; }));
    requireSensitiveExport('住宿专项导出', { scope:'住宿安排与历史', fields:['学生','楼栋','房间','床位','日期'], collection:'v4_dorm_assignments' }, function () { download('住宿专项_' + today() + '.csv', toCSV(rowsOut), 'text/csv;charset=utf-8', { collection:'v4_dorm_assignments', kind:'dorm_export', sensitive:true }); ui.toast('住宿清单已导出', 'ok'); });
  }
  function committeeExport() {
    var rowsOut = [['学生ID','姓名','学号','班级','角色','周期','日期','等级','备注']].concat(rows('v4_committee_evaluations').map(function (item) { return [item.student_id, item.student_name, item.student_number, item.class_name, item.role_name, item.term, item.evaluation_date, item.grade, item.note]; }));
    requireSensitiveExport('班委考核导出', { scope:'班委考核', fields:['学生','角色','等级','备注'], collection:'v4_committee_evaluations' }, function () { download('班委考核_' + today() + '.csv', toCSV(rowsOut), 'text/csv;charset=utf-8', { collection:'v4_committee_evaluations', kind:'committee_evaluation_export', sensitive:true }); ui.toast('班委考核已导出', 'ok'); });
  }
  function familyExport() {
    var rowsOut = [['日期','学生','学号','家长关系','联系方式','目的','沟通摘要','结果','下一步']].concat(rows('v4_family_contacts').map(function (item) { return [item.contact_date, item.student_name, item.student_number, item.parent_relation, item.method, item.purpose, item.summary, item.outcome, item.next_action]; }));
    requireSensitiveExport('家校联系导出', { scope:'家校联系记录', fields:['学生','家长关系','沟通摘要','结果'], collection:'v4_family_contacts' }, function () { download('家校联系_' + today() + '.csv', toCSV(rowsOut), 'text/csv;charset=utf-8', { collection:'v4_family_contacts', kind:'family_contact_export', sensitive:true }); ui.toast('家校联系已导出', 'ok'); });
  }
  async function researchTask(id) {
    var project = rows('v4_research_projects').find(function (item) { return String(item.id) === String(id); });
    if (!project) return;
    var task = v46.research.task(project);
    var previousTasks = cloneData(DB.tasks || []);
    try {
      var existing = DB.tasks.find(function (item) { return String(item.id) === String(task.id) || (String(item.source_id || '') === String(project.id) && String(item.source_stage || '') === String(project.current_stage)); });
      if (existing) { render(); return ui.toast('当前阶段已有任务，不重复生成', 'warn'); }
      task.source_stage = project.current_stage;
      task.source_type = 'research_stage';
      task.source_collection = 'v4_research_projects';
      DB.tasks.push(normTask(task));
      window.__CWB_LAST_SAVE_PROMISE__ = null;
      await awaitTrackedSave(save('tasks'));
      render(); ui.toast('课题阶段任务已生成', 'ok');
    } catch (error) {
      DB.tasks.splice(0, DB.tasks.length); DB.tasks.push.apply(DB.tasks, previousTasks);
      try { await awaitTrackedSave(save('tasks')); } catch (restoreError) { error.record_restore_error = String(restoreError && restoreError.message || restoreError); }
      ui.toast(v46Error(error, '课题阶段任务保存失败'), 'err', 5200, { label:'重试', onClick:function () { researchTask(id); } });
    }
  }
  function researchExport() {
    var rowsOut = [['课题名称','级别','负责人','参与人员','当前阶段','截止日期','下一步','状态']].concat(rows('v4_research_projects').map(function (item) { return [item.name, item.level, item.principal, item.participants, item.current_stage, item.stage_due_date, item.next_action, item.status]; }));
    download('科研课题_' + today() + '.csv', toCSV(rowsOut), 'text/csv;charset=utf-8'); ui.toast('科研课题清单已导出', 'ok');
  }
  function analysisExport() {
    var s = state();
    var summary = v46.analysis.classSummary({ class_name:s.analysisClass || '', term:s.analysisTerm || '', from:s.analysisFrom || '', to:s.analysisTo || '', students:DB.students, sources:classSources() });
    var metrics = ['awards_count','absence_count','talks_count','focus','academic_warning_count','activity_count','aid_count'];
    var rowsOut = [['班级','学生人数'].concat(metrics.map(metricLabel))].concat([[summary.class_name || '全部班级', summary.student_count].concat(metrics.map(function (key) { return summary.totals[key] == null ? '未记录' : summary.totals[key]; }))]);
    requireSensitiveExport('班级聚合分析导出', { scope:'班级聚合结果', fields:metrics.map(metricLabel), collection:'analysis', kind:'class_summary_export', sensitive:false }, function () { download('班级综合分析_' + today() + '.csv', toCSV(rowsOut), 'text/csv;charset=utf-8', { collection:'analysis', kind:'class_summary_export', sensitive:false }); ui.toast('班级聚合结果已导出', 'ok'); });
  }
  function openDraftEditor(id) {
    var draft = rows('v4_worklog_drafts').find(function (item) { return String(item.id) === String(id); });
    if (!draft) return;
    ui.form({ title:'编辑待确认工作记录', size:'wide', data:draft, fields:[
      { key:'date', label:'日期', type:'date', required:true }, { key:'title', label:'事项标题', required:true }, { key:'category', label:'记录类型', type:'select', options:['班会','查寝','查课','个别谈话','家校沟通','科研课题','其他'] }, { key:'summary', label:'工作内容', type:'textarea', rows:4, required:true }, { key:'result', label:'结果', type:'textarea', rows:2 }, { key:'next_action', label:'下一步', type:'textarea', rows:2 },
      { key:'source_rechecked', label:'我已重新核对来源记录', type:'checkbox', hint:draft.status === 'stale' ? '来源发生变化后，必须重新检查原始记录并勾选此项，才可以归档。' : '确认前建议回看来源记录，避免把草稿误当成事实。' },
    ], onSave:function (value) {
      var rechecked = value.source_rechecked === true;
      var currentSource = sourceRecord(draft.source_collection, draft.source_id);
      if (draft.status === 'stale' && rechecked && currentSource) {
        value.status = 'draft';
        value.source_state = 'active';
        value.source_hash = v46SourceHash(currentSource, draft.source_collection);
        value.source_updated_at = currentSource.updated_at || '';
        value.source_rechecked_at = new Date().toISOString();
      } else if (draft.status === 'stale' && draft.source_state === 'deleted' && !currentSource) {
        value.status = 'stale';
        value.source_state = 'deleted';
        value.source_rechecked = false;
      }
      Object.assign(draft, v46.worklogDrafts.preview(Object.assign({}, draft, value)));
      v46Persist(); render();
      ui.toast(draft.status === 'draft' && rechecked && currentSource ? '来源已核对，草稿可继续确认' : '草稿已更新', 'ok');
    }});
  }

  Object.assign(ACTS, {
    'v46-utility-tab': function (id, button) { state().utilityTab = button.dataset.tab || 'draw'; state().utilityResult = null; render(); },
    'v46-utility-run': runUtility,
    'v46-utility-clear': function () { state().utilityResult = null; render(); },
    'v46-utility-save-task': saveUtilityTask,
    'v46-utility-save-worklog': saveUtilityWorklog,
    'v46-dorm-tab': function (id, button) { state().dormTab = button.dataset.tab || 'overview'; render(); },
    'v46-dorm-building-new': function () { dormBuildingForm(null); },
    'v46-dorm-building-edit': function (id) { dormBuildingForm(rows('v4_dorm_buildings').find(function (item) { return String(item.id) === String(id); })); },
    'v46-dorm-building-delete': function (id) { var hasRooms = rows('v4_dorm_rooms').some(function (room) { return String(room.building_id) === String(id); }); var hasActive = rows('v4_dorm_assignments').some(function (assignment) { return String(assignment.building_id) === String(id) && !['cancelled', 'checked_out'].includes(assignment.status); }); if (hasRooms || hasActive) return ui.toast('楼栋仍有关联房间或在住学生，不能删除', 'warn'); ui.confirm('删除楼栋', '删除楼栋不会自动删除历史住宿记录，确定继续吗？', async function () { await removeRowAndWait('v4_dorm_buildings', id); render(); ui.toast('楼栋已删除', 'ok'); }, true); },
    'v46-dorm-room-new': function () { dormRoomForm(null); },
    'v46-dorm-room-edit': function (id) { dormRoomForm(rows('v4_dorm_rooms').find(function (item) { return String(item.id) === String(id); })); },
    'v46-dorm-room-delete': function (id) { var hasActive = rows('v4_dorm_assignments').some(function (assignment) { return String(assignment.room_id) === String(id) && !['cancelled', 'checked_out'].includes(assignment.status); }); if (hasActive) return ui.toast('房间仍有在住学生，不能删除', 'warn'); ui.confirm('删除房间', '删除房间不会自动删除历史住宿记录，确定继续吗？', async function () { await removeRowAndWait('v4_dorm_rooms', id); render(); ui.toast('房间已删除', 'ok'); }, true); },
    'v46-dorm-batch-new': function () { dormBatchForm(null); },
    'v46-dorm-batch-edit': function (id) { dormBatchForm(rows('v4_dorm_batches').find(function (item) { return String(item.id) === String(id); })); },
    'v46-dorm-select-batch': function (id) { var batch = rows('v4_dorm_batches').find(function (item) { return String(item.id) === String(id); }); if (!batch) return; state().dormBatchId = batch.id; state().dormPlan = null; persistUiState(); render(); },
    'v46-dorm-generate': dormGenerate,
    'v46-dorm-confirm-plan': dormConfirm,
    'v46-dorm-clear-plan': function () { state().dormPlan = null; render(); },
    'v46-dorm-clear-filter': function () { state().dormClass = ''; state().dormGrade = ''; state().dormGender = ''; render(); },
    'v46-dorm-cancel-transfer': function (id) { var record = rows('v4_dorm_transfers').find(function (item) { return String(item.id) === String(id); }); if (!record || record.status === 'cancelled') return; ui.confirm('作废调宿记录', '作废只保留历史并标记为无效，不会删除轨迹，也不会自动回滚学生当前位置。确定继续吗？', async function () { var previous = cloneData(record); try { record.status = 'cancelled'; record.cancelled_at = new Date().toISOString(); record.updated_at = record.cancelled_at; window.__CWB_LAST_SAVE_PROMISE__ = null; await awaitTrackedSave(save('custom')); if (root.CWB && root.CWB.audit && root.CWB.audit.log) await root.CWB.audit.log('dorm_transfer_cancel', { transfer_id:record.id, student_id:record.student_id }); render(); ui.toast('调宿记录已作废，历史轨迹已保留', 'ok'); } catch (error) { Object.assign(record, previous); try { window.__CWB_LAST_SAVE_PROMISE__ = null; await awaitTrackedSave(save('custom')); } catch (restoreError) { error.record_restore_error = String(restoreError && restoreError.message || restoreError); } throw error; } }, true); },
    'v46-dorm-delete-transfer': function (id) { ACTS['v46-dorm-cancel-transfer'](id); },
    'v46-dorm-transfer-new': transferForm,
    'v46-dorm-import': dormImport,
    'v46-dorm-export': dormExport,
    'v46-committee-position-new': function () { committeePositionForm(null); },
    'v46-committee-position-edit': function (id) { committeePositionForm(rows('v4_positions').find(function (item) { return String(item.id) === String(id); })); },
    'v46-committee-position-delete': function (id) { ui.confirm('删除班委任职', '只删除当前任职关系，不删除学生档案。确定继续吗？', async function () { await removeRowAndWait('v4_positions', id); render(); ui.toast('班委任职已删除', 'ok'); }, true); },
    'v46-committee-role-new': committeeRoleForm,
    'v46-committee-evaluation-new': function () { committeeEvaluationForm(null); },
    'v46-committee-evaluation-edit': function (id) { committeeEvaluationForm(rows('v4_committee_evaluations').find(function (item) { return String(item.id) === String(id); })); },
    'v46-committee-evaluation-delete': function (id) { ui.confirm('删除班委考核', '确定删除这条考核记录吗？', async function () { await removeRowAndWait('v4_committee_evaluations', id); render(); ui.toast('班委考核已删除', 'ok'); }, true); },
    'v46-committee-clear-filter': function () { state().committeeClass = ''; state().committeeGrade = ''; render(); },
    'v46-committee-export': committeeExport,
    'v46-family-new': function () { familyForm(null); },
    'v46-family-edit': function (id) { familyForm(rows('v4_family_contacts').find(function (item) { return String(item.id) === String(id); })); },
     'v46-family-delete': function (id) { var item = rows('v4_family_contacts').find(function (value) { return String(value.id) === String(id); }); if (!item) return; ui.confirm('删除家校联系', '确定删除这条家校联系记录吗？关联草稿会标记为来源已删除，未被其他记录引用的附件会清理。', async function () { var released = await releaseRecordAttachments('v4_family_contacts', item); try { await removeRowAndWait('v4_family_contacts', id); } catch (error) { try { await restoreReleasedAttachments(released); } catch (restoreError) { error.attachment_restore_error = String(restoreError && restoreError.message || restoreError); } throw error; } render(); ui.toast('家校联系已删除', 'ok'); }, true); },
     'v46-family-phone': function (id) { var item = rows('v4_family_contacts').find(function (value) { return String(value.id) === String(id); }); if (!item) return; var show = function () { ui.modal({ title:'家长联系方式', size:'narrow', body:'<div class="v46-sensitive-phone"><div class="tiny">' + esc(item.student_name || '关联学生') + ' · ' + esc(item.parent_relation || '家长') + '</div><strong>' + esc(item.parent_phone || '未填写') + '</strong></div>', footer:'<button class="btn" data-close>关闭</button>' }); }; if (root.requireSensitiveView) root.requireSensitiveView('查看家长完整电话', show, { student_id:item.student_id || '', scope:'家校联系记录' }); else security.require('查看家长完整电话', show); },
    'v46-family-clear-filter': function () { state().familyQ = ''; render(); },
    'v46-family-export': familyExport,
    'v46-research-new': function () { researchForm(null); },
    'v46-research-edit': function (id) { researchForm(rows('v4_research_projects').find(function (item) { return String(item.id) === String(id); })); },
    'v46-research-delete': function (id) { var item = rows('v4_research_projects').find(function (value) { return String(value.id) === String(id); }); if (!item) return; ui.confirm('删除科研课题', '删除课题不会删除已生成的历史任务；关联草稿会标记为来源已删除，未被其他记录引用的附件会清理。确定继续吗？', async function () { var released = await releaseRecordAttachments('v4_research_projects', item); try { await removeRowAndWait('v4_research_projects', id); } catch (error) { try { await restoreReleasedAttachments(released); } catch (restoreError) { error.attachment_restore_error = String(restoreError && restoreError.message || restoreError); } throw error; } render(); ui.toast('科研课题已删除', 'ok'); }, true); },
    'v46-research-task': researchTask,
    'v46-research-clear-filter': function () { state().researchQ = ''; render(); },
    'v46-research-export': researchExport,
    'v46-analysis-clear': function () { state().analysisClass = ''; state().analysisTerm = ''; state().analysisFrom = ''; state().analysisTo = ''; state().analysisCompare = []; render(); },
    'v46-analysis-export': analysisExport,
    'v46-analysis-details': function () { var s = state(); var allow = function () { s.analysisDetailUnlocked = true; render(); }; if (root.requireSensitiveView) root.requireSensitiveView('查看班级学生明细', allow, { scope:'班级综合分析个人明细' }); else security.require('查看班级学生明细', allow); },
    'v46-analysis-drill': function (id, button) { var proceed = function () { var s = state(); var rowsDown = v46.analysis.drillDown(button.dataset.metric, { class_name:s.analysisClass || '', term:s.analysisTerm || '', students:DB.students, sources:classSources(), from:s.analysisFrom || '', to:s.analysisTo || '' }); ui.toast('已找到 ' + rowsDown.length + ' 名相关学生，请在学生台账中继续筛选', 'ok', 2600); if (rowsDown.length) { app.filters.students = Object.assign({}, app.filters.students, { ids:rowsDown.map(function (item) { return String(item.student_id || ''); }).filter(Boolean), q:'', cls:s.analysisClass || '' }); go('students'); } }; if (root.requireSensitiveView) root.requireSensitiveView('查看班级指标下钻', proceed, { scope:'班级综合分析指标下钻', metric:button.dataset.metric || '' }); else security.require('查看班级指标下钻', proceed); },
    'v46-analysis-student': function (id) { var proceed = function () { var hit = student(id); if (hit) openStudent(hit); }; if (root.requireSensitiveView) root.requireSensitiveView('查看班级学生明细', proceed, { student_id:id, scope:'班级综合分析个人明细' }); else security.require('查看班级学生明细', proceed); },
    'v46-draft-confirm': async function (id) { var item = rows('v4_worklog_drafts').find(function (value) { return String(value.id) === String(id); }); if (item && item.status === 'stale') return openDraftEditor(id); try { await confirmDraft(id); render(); ui.toast('已确认并写入正式工作留痕', 'ok', 3200); } catch (error) { var failure = new Error(v46Error(error, '草稿确认失败')); failure.cause = error; throw failure; } },
    'v46-draft-edit': function (id) { openDraftEditor(id); },
    'v46-draft-source': openDraftSource,
    'v46-draft-dismiss': function (id) { ui.confirm('驳回工作记录草稿', '驳回后不会写入正式工作留痕，确定继续吗？', async function () { await dismissDraft(id); render(); ui.toast('草稿已驳回', 'ok'); }, true); },
    'v46-draft-refresh': function () { render(); },
    'v46-draft-clear-filter': function () { state().worklogDraftQ = ''; persistUiState(); render(); },
  });

  document.addEventListener('change', function (event) {
    var target = event.target.closest && event.target.closest('[data-v46-dorm-batch],[data-v46-dorm-filter],[data-v46-committee-filter],[data-v46-analysis-filter],[data-v46-analysis-compare]');
    if (target) {
      var s = state();
      if (target.dataset.v46DormBatch != null) { s.dormBatchId = target.value; s.dormPlan = null; persistUiState(); render(); return; }
      if (target.dataset.v46DormFilter) { s[target.dataset.v46DormFilter === 'class_name' ? 'dormClass' : target.dataset.v46DormFilter === 'grade' ? 'dormGrade' : 'dormGender'] = target.value; render(); return; }
      if (target.dataset.v46CommitteeFilter) { s[target.dataset.v46CommitteeFilter === 'class_name' ? 'committeeClass' : 'committeeGrade'] = target.value; render(); return; }
      if (target.dataset.v46AnalysisFilter) { var key = target.dataset.v46AnalysisFilter; s[key === 'class' ? 'analysisClass' : key === 'term' ? 'analysisTerm' : key === 'from' ? 'analysisFrom' : 'analysisTo'] = target.value; render(); return; }
      if (target.dataset.v46AnalysisCompare) { s.analysisCompare = [...target.selectedOptions].map(function (item) { return item.value; }).filter(Boolean); render(); }
    }
  });
  document.addEventListener('input', function (event) {
    var target = event.target.closest && event.target.closest('[data-v46-family-search],[data-v46-research-search],[data-v46-draft-search]');
    if (!target) return;
    var s = state();
    if (target.dataset.v46FamilySearch != null) s.familyQ = target.value;
    if (target.dataset.v46ResearchSearch != null) s.researchQ = target.value;
    if (target.dataset.v46DraftSearch != null) s.worklogDraftQ = target.value;
    clearTimeout(s._v46SearchTimer);
    s._v46SearchTimer = setTimeout(function () { render(); }, 180);
  });

  addNav();
  renderPinned();
  updatePinStates();
  if (root.CWB && root.CWB.ai) {
    var oldPurpose = window.aiInlinePurposeForView;
    if (oldPurpose && !oldPurpose.__v46) {
      var originalPurpose = oldPurpose;
      window.aiInlinePurposeForView = function (view) {
        var map = { utilities:'workday_actions', dorm:'dorm_conflict', committee:'committee_evaluation_draft', family:'worklog_draft', research:'research_checklist', 'class-analysis':'class_summary', 'worklog-drafts':'work_summary' };
        return map[view] || originalPurpose(view);
      };
      window.aiInlinePurposeForView.__v46 = true;
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
