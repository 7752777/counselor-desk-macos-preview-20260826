/* v4.7 reference-workbench UI. It extends the existing view/action registry so
 * old routes and old data remain untouched. */
(function installCwbV47Ui(root) {
  'use strict';
  var runtime = root.CWBV46Runtime || {};
  var v47 = root.CWBV47 || (root.CWB && root.CWB.v47);
  var app = runtime.app; var DB = runtime.DB; var VIEWS = runtime.VIEWS; var ACTS = runtime.ACTS;
  var render = runtime.render; var go = runtime.go; var save = runtime.save; var ui = runtime.ui; var persistUiState = runtime.persistUiState;
  var v4Collection = runtime.v4Collection; var esc = runtime.esc; var today = runtime.today; var v4Page = runtime.v4Page;
  var cloneData = runtime.cloneData || function (value) { return value == null ? value : JSON.parse(JSON.stringify(value)); };
  var storeBusinessAttachments = runtime.storeBusinessAttachments;
  var removeBusinessAttachments = runtime.removeBusinessAttachments;
  var removeV4RecordAttachments = runtime.removeV4RecordAttachments;
  var attachmentIdsFromRecord = runtime.attachmentIdsFromRecord;
  var restoreBusinessAttachmentRecords = runtime.restoreBusinessAttachmentRecords;
  var mergeBusinessAttachmentIds = runtime.mergeBusinessAttachmentIds || function () { return []; };
  if (!v47 || !app || !DB || !VIEWS || !ACTS || typeof v4Collection !== 'function') return;
  // Match the main page save contract while keeping this deferred UI bundle
  // safe when loaded by a desktop or isolated test harness first.
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
  var formRecordIds = root.__CWB_FORM_RECORD_IDS__ || (root.__CWB_FORM_RECORD_IDS__ = {});

  function state() {
    app.v47 = app.v47 || {};
    if (!app.v47._contextHydrated) {
      var stored = app.v4 && app.v4.v47Context || {};
      app.v47.contextCollapsed = stored.collapsed === true;
      app.v47.contextOpen = stored.open === true;
      app.v47._contextHydrated = true;
    }
    return app.v47;
  }
  var contextReturnFocus = null;
  function persistContextState() {
    var s = state();
    app.v4 = app.v4 || {};
    app.v4.v47Context = { collapsed:s.contextCollapsed === true, open:s.contextOpen === true };
    if (typeof persistUiState === 'function') { try { persistUiState(); } catch (_) {} }
  }
  function rows(key) { return v4Collection(key); }
  function normalize(key, value) { return v47.normalizeRecord(key, value || {}); }
  function restoreRowsInPlace(key, snapshot) {
    var list = rows(key);
    var currentById = new Map(list.map(function (item) { return [String(item && item.id || ''), item]; }));
    var restored = (snapshot || []).map(function (item) {
      var existing = item && item.id != null ? currentById.get(String(item.id)) : null;
      if (!existing || !item || typeof item !== 'object') return cloneData(item);
      Object.keys(existing).forEach(function (field) { if (!Object.prototype.hasOwnProperty.call(item, field)) delete existing[field]; });
      Object.assign(existing, cloneData(item));
      return existing;
    });
    list.splice.apply(list, [0, list.length].concat(restored));
    return list;
  }
  function restoreUpsertMutation(key, recordId, existed, previous) {
    var list = rows(key);
    var index = list.findIndex(function (item) { return String(item.id) === String(recordId); });
    if (existed) {
      if (index >= 0 && previous) restoreRowsInPlace(key, list.map(function (item, itemIndex) { return itemIndex === index ? previous : item; }));
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
        restoreRowsInPlace(key, previousRows);
        if (previousDrafts) restoreRowsInPlace('v4_worklog_drafts', previousDrafts);
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
    var next = normalize(key, source); if (formKey) formRecordIds[formKey] = next.id; var list = rows(key); var index = list.findIndex(function (item) { return String(item.id) === String(next.id); }); var previous = index >= 0 ? cloneData(list[index]) : null;
    if (index >= 0) {
      var current = list[index];
      Object.keys(current).forEach(function (field) { if (!Object.prototype.hasOwnProperty.call(next, field)) delete current[field]; });
      Object.assign(current, next);
      next = current;
    } else list.push(next);
    if (persist) { var savePromise = trackUpsertSave(key, next.id, index >= 0, previous, save('custom')); if (savePromise && typeof savePromise.then === 'function') Object.defineProperty(next, '__cwbSavePromise', { value:savePromise, enumerable:false, configurable:true }); } return next;
  }
  function savePromiseOf(record) { return record && record.__cwbSavePromise || root.__CWB_LAST_SAVE_PROMISE__; }
  function removeRow(key, id, options) {
    var list = rows(key); var next = list.filter(function (item) { return String(item.id) !== String(id); });
    if (next.length === list.length) return false;
    var previousRows = cloneData(list); var previousDrafts = cloneData(rows('v4_worklog_drafts'));
    if (!(options && options.markSource === false)) markSourceDraftStale(key, id, 'deleted', { persist:false });
    list.splice.apply(list, [0, list.length].concat(next));
    if (!(options && options.persist === false)) trackCollectionSave(key, previousRows, previousDrafts, save('custom'));
    return true;
  }
  async function removeRowAndWait(key, id, options) {
    var removed = removeRow(key, id, options);
    if (!removed || (options && options.persist === false)) return removed;
    await (root.awaitTrackedSave ? root.awaitTrackedSave(root.__CWB_LAST_SAVE_PROMISE__) : Promise.resolve(root.__CWB_LAST_SAVE_PROMISE__));
    return removed;
  }
  async function removeRowWithAttachmentsAndWait(key, id, record) {
    var released = await releaseRecordAttachments(key, record);
    try {
      await removeRowAndWait(key, id);
      return released;
    } catch (error) {
      try { await restoreReleasedAttachments(released); }
      catch (restoreError) { error.attachment_restore_error = String(restoreError && restoreError.message || restoreError); }
      throw error;
    }
  }
  function markSourceDraftStale(key, id, reason, options) { if (root.CWBV46UI && typeof root.CWBV46UI.markSourceDraftStale === 'function') { try { return root.CWBV46UI.markSourceDraftStale(key, id, reason || 'deleted', options); } catch (_) {} } return false; }
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
  async function cleanupNewAttachments(ids, error) {
    if (!Array.isArray(ids) || !ids.length || typeof removeBusinessAttachments !== 'function') return;
    try {
      var failed = await removeBusinessAttachments(ids);
      if (Array.isArray(failed) && failed.length) error.attachment_cleanup_ids = failed;
    } catch (cleanupError) {
      error.attachment_cleanup_error = String(cleanupError && cleanupError.message || cleanupError);
    }
  }
  function snapshotCustomCollections(keys) {
    var snapshot = {};
    (keys || []).forEach(function (key) { snapshot[key] = cloneData(rows(key)); });
    return snapshot;
  }
  function restoreCustomCollections(snapshot) {
    Object.keys(snapshot || {}).forEach(function (key) { restoreRowsInPlace(key, snapshot[key]); });
  }
  async function persistCustomChanges() {
    root.__CWB_LAST_SAVE_PROMISE__ = null;
    await awaitTrackedSave(save('custom'));
  }
  async function restoreCustomState(snapshot, error) {
    restoreCustomCollections(snapshot);
    try { await persistCustomChanges(); } catch (restoreError) { if (error) error.record_restore_error = String(restoreError && restoreError.message || restoreError); }
  }
  function student(id) { return (DB.students || []).find(function (item) { return String(item.id) === String(id); }) || null; }
  function studentOptions(empty) {
    var output = empty ? [{ v:'', n:'未关联学生' }] : [];
    return output.concat((DB.students || []).slice().sort(function (a, b) { return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'zh-CN'); }).map(function (item) { return { v:item.id || '', n:[item.full_name || '未命名', item.student_number || '无学号', item.class_name || '未分班'].join(' · ') }; }));
  }
  function classOptions(empty) {
    var values = [...new Set((DB.students || []).map(function (item) { return String(item.class_name || '').trim(); }).filter(Boolean))].sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); });
    return (empty ? '<option value="">全部班级</option>' : '') + values.map(function (item) { return '<option value="' + esc(item) + '">' + esc(item) + '</option>'; }).join('');
  }
  function weekdayLabel(value) { return ({ 1:'星期一', 2:'星期二', 3:'星期三', 4:'星期四', 5:'星期五', 6:'星期六', 7:'星期日' })[Number(value)] || ''; }
  function todayWeekday() { var day = new Date().getDay(); return day === 0 ? 7 : day; }
  function todaySchedules() {
    var weekday = todayWeekday();
    return rows('v4_class_schedules').filter(function (item) { return Number(item.weekday) === weekday; }).sort(function (a, b) { return Number(a.start_section || 0) - Number(b.start_section || 0); });
  }
  function dormBuildingOptions(current) { return optionList(v4Collection('v4_dorm_buildings').map(function (item) { return { value:item.id, label:item.name || item.building_name || item.id }; }), current, '全部楼栋'); }
  function optionList(values, current, emptyLabel) { return (emptyLabel == null ? '' : '<option value="">' + esc(emptyLabel) + '</option>') + (values || []).map(function (item) { var value = typeof item === 'object' ? item.value : item; var label = typeof item === 'object' ? item.label : item; return '<option value="' + esc(value) + '"' + (String(value) === String(current || '') ? ' selected' : '') + '>' + esc(label) + '</option>'; }).join(''); }
  function statStrip(items) { return '<div class="v47-stat-strip">' + items.map(function (item) { var interactive = Boolean(item.act || item.view); var tag = interactive ? 'button' : 'div'; var target = item.act ? ' data-act="' + esc(item.act) + '"' : item.view ? ' data-view="' + esc(item.view) + '"' : ''; var attrs = interactive ? ' type="button"' : ' role="status"'; if (item.label) attrs += ' aria-label="' + esc(item.label + '：' + (item.value == null ? '—' : item.value)) + '"'; return '<' + tag + attrs + ' class="v47-stat"' + target + '><span>' + esc(item.label) + '</span><strong>' + esc(item.value == null ? '—' : item.value) + '</strong>' + (item.note ? '<small>' + esc(item.note) + '</small>' : '') + '</' + tag + '>'; }).join('') + '</div>'; }
  function empty(label) { return '<div class="v47-empty"><strong>' + esc(label || '暂无记录') + '</strong><span>可以从右上角新增，或导入已有表格。</span></div>'; }
  function page(title, intro, body, actions) {
    return '<div class="v47-page-view" data-v47-page="' + esc(app.view || '') + '">' + v4Page(title, intro, body, actions || '') + '</div>';
  }
  function persistDraft(record, collection, options) { if (root.CWBV46UI && typeof root.CWBV46UI.createWorklogDraft === 'function') { try { return root.CWBV46UI.createWorklogDraft(record, collection, options || {}); } catch (_) {} } return null; }
  function safeUrl(value) { return v47.tools.links.validateUrl(String(value || '')); }
  function fileIds(value) { return Array.isArray(value) ? value : value ? [value] : []; }
  function assessmentEntryKey(value) {
    var item = value || {};
    return [item.student_id || item.student_number || item.student_name || '', item.term || '', item.dimension || '', item.score == null ? '' : item.score, item.direction || '', item.source || ''].map(function (part) { return String(part).trim().toLowerCase(); }).join('|');
  }
  function assessmentMergeKey(value) {
    var item = value || {};
    return [item.student_id || '', item.term || '', item.dimension || '', item.direction || '', item.source || ''].map(function (part) { return String(part).trim().toLowerCase(); }).join('|');
  }
  function importedStudent(value) {
    var item = value || {}; var explicitId = String(item.student_id || '').trim();
    if (explicitId) {
      var byId = (DB.students || []).filter(function (student) { return String(student.id || student.student_id || '') === explicitId; });
      return byId.length === 1 ? { student:byId[0] } : { ambiguous:true };
    }
    var number = String(item.student_number || '').trim();
    if (!number) return { ambiguous:true };
    var current = (DB.students || []).filter(function (student) { return String(student.student_number || '').trim() === number; });
    if (current.length === 1) return { student:current[0] };
    if (current.length > 1) return { ambiguous:true };
    var history = (DB.students || []).filter(function (student) { return (student.student_number_history || []).some(function (entry) { return String(entry && typeof entry === 'object' ? entry.value : entry || '').trim() === number; }); });
    return history.length === 1 ? { student:history[0] } : { ambiguous:true };
  }
  function mergeNonEmpty(base, incoming) {
    var next = Object.assign({}, base || {});
    Object.keys(incoming || {}).forEach(function (key) { var value = incoming[key]; if (value == null || (typeof value === 'string' && value.trim() === '')) return; next[key] = value; });
    return next;
  }
  function competitionEntryKey(value) {
    var item = value || {};
    return [item.competition_id || '', item.student_id || item.student_number || item.student_name || '', item.project_name || ''].map(function (part) { return String(part).trim().toLowerCase(); }).join('|');
  }

  function classCheckForm(record, options) {
    var opts = options || {}; var isNew = !record || opts.isNew === true;
    ui.form({ title:isNew ? '新增查课记录' : '编辑查课记录', size:'wide', data:record || { date:today(), status:'已查' }, fields:[
      { key:'schedule_id', label:'课表记录 ID' }, { key:'class_name', label:'班级', required:true, list:'v47-class-list' }, { key:'course', label:'课程', required:true }, { key:'date', label:'查课日期', type:'date', required:true }, { key:'teaching_week', label:'教学周' }, { key:'weekday', label:'星期' }, { key:'start_period', label:'开始节次', type:'number' }, { key:'end_period', label:'结束节次', type:'number' }, { key:'classroom', label:'教室' }, { key:'checker', label:'查课人' }, { key:'status', label:'查课状态', type:'select', options:v47.CLASS_CHECK_STATUSES }, { key:'present_count', label:'到课人数', type:'number' }, { key:'absent_count', label:'未到人数', type:'number' }, { key:'late_count', label:'迟到人数', type:'number' }, { key:'findings', label:'发现情况', type:'textarea', rows:2 }, { key:'measures', label:'处理措施', type:'textarea', rows:2 }, { key:'check_files', label:'照片 / 附件', type:'file', multiple:true, accept:'.png,.jpg,.jpeg,.webp,.pdf,.doc,.docx' },
    ], extra:'<datalist id="v47-class-list">' + classOptions(false).replace(/<option value="/g, '<option value="').replace(/<\/option>/g, '') + '</datalist>', onSave:async function (value) {
      var next = Object.assign({}, record || {}, value);
      if (opts.isNew === true) delete next.id;
      next = normalize('v4_class_checks', next);
      var duplicate = rows('v4_class_checks').some(function (item) {
        if (String(item.id) === String(next.id)) return false;
        if (next.schedule_id) return String(item.schedule_id || '') === String(next.schedule_id) && String(item.date || '') === String(next.date || '');
        return !item.schedule_id && String(item.class_name || '') === String(next.class_name || '') && String(item.course || '') === String(next.course || '') && String(item.date || '') === String(next.date || '') && Number(item.start_period || 0) === Number(next.start_period || 0) && Number(item.end_period || 0) === Number(next.end_period || 0);
      });
      if (duplicate) { ui.toast('同一课表在同一天已经登记过查课记录，未重复保存', 'warn'); return false; }
      var files = fileIds(value.check_files); var newIds = [];
      var previousRows = snapshotCustomCollections(['v4_class_checks', 'v4_worklog_drafts']);
      try {
        if (files.length && typeof storeBusinessAttachments === 'function') newIds = await storeBusinessAttachments(files, next.id, { prefix:'class_check_attachment' });
        next.attachment_ids = mergeBusinessAttachmentIds(record && record.attachment_ids, record && record.attachments, newIds); delete next.check_files;
        var saved = upsert('v4_class_checks', next, { persist:false });
        persistDraft(saved, 'v4_class_checks', { title:'查课 · ' + (saved.class_name || '未命名班级'), category:'查课', persist:false });
        await persistCustomChanges();
        render(); ui.toast(isNew ? '查课记录已保存' : '查课记录已更新', 'ok');
      } catch (error) { await restoreCustomState(previousRows, error); await cleanupNewAttachments(newIds, error); throw error; }
    }});
  }
  function viewClassChecks() {
    var s = state(); var values = v47.classChecks.list(rows('v4_class_checks'), { from:s.classFrom || '', to:s.classTo || '', class_name:s.className || '' }); var summary = v47.classChecks.summary(values, {});
    var body = '<section class="v47-workspace"><div class="v47-filter-bar"><input class="inp" type="date" data-v47-filter="classFrom" value="' + esc(s.classFrom || '') + '" aria-label="开始日期"><span class="tiny">至</span><input class="inp" type="date" data-v47-filter="classTo" value="' + esc(s.classTo || '') + '" aria-label="结束日期"><select class="inp" data-v47-filter="className">' + classOptions(true).replace('全部班级', '全部班级') + '</select><select class="inp" data-v47-filter="classStatus"><option value="">全部状态</option>' + optionList(v47.CLASS_CHECK_STATUSES, s.classStatus, '').replace('<option value=""></option>', '') + '</select><button class="btn btn-sm" data-act="v47-class-clear">清除筛选</button></div><div class="v47-table-wrap"><table class="v47-table"><thead><tr><th>日期</th><th>班级 / 课程</th><th>时间地点</th><th>状态</th><th>到课</th><th>未到 / 迟到</th><th>操作</th></tr></thead><tbody>' + values.filter(function (item) { return !s.classStatus || item.status === s.classStatus; }).map(function (item) { return '<tr><td>' + esc(item.date) + '<div class="tiny">第 ' + esc(item.teaching_week || '—') + ' 周</div></td><td><strong>' + esc(item.class_name || '—') + '</strong><div class="tiny">' + esc(item.course || '—') + '</div></td><td>' + esc([item.weekday, item.start_period && item.start_period + ' - ' + item.end_period + ' 节', item.classroom].filter(Boolean).join(' · ') || '—') + '</td><td><span class="tag ' + (item.status === '已处理' ? 'tag-green' : item.status === '异常' ? 'tag-red' : item.status === '已查' ? 'tag-blue' : 'tag-amber') + '">' + esc(item.status) + '</span></td><td>' + esc(item.present_count) + '</td><td>' + esc(item.absent_count) + ' / ' + esc(item.late_count) + '</td><td class="v47-actions"><button class="btn btn-sm" data-act="v47-class-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v47-class-delete" data-id="' + esc(item.id) + '">删除</button></td></tr>'; }).join('') || '<tr><td colspan="7">' + empty('还没有查课记录') + '</td></tr>' + '</tbody></table></div></section>';
    return page('查课看板', '把今日课程、查课打卡和异常处理放在同一张可回溯的工作表里。', statStrip([{ label:'查课总数', value:summary.total }, { label:'已查', value:summary.checked }, { label:'未查', value:summary.pending }, { label:'异常', value:summary.abnormal }, { label:'未到', value:summary.absent }, { label:'迟到', value:summary.late }]) + body, '<button class="btn btn-primary" data-act="v47-class-new">新增查课</button>');
  }

  function viewClassChecksFixed() {
    var s = state();
    var values = v47.classChecks.list(rows('v4_class_checks'), { from:s.classFrom || '', to:s.classTo || '', class_name:s.className || '' }).filter(function (item) { return !s.classStatus || item.status === s.classStatus; });
    var summary = v47.classChecks.summary(values, {});
    var schedules = todaySchedules();
    var todayCheckIds = new Set(rows('v4_class_checks').filter(function (item) { return item.date === today() && item.schedule_id; }).map(function (item) { return String(item.schedule_id); }));
    var scheduleRows = schedules.map(function (item) { var checked = todayCheckIds.has(String(item.id)); return '<div class="v47-schedule-row"><div><strong>' + esc(item.course || '未命名课程') + '</strong><div class="tiny">' + esc([item.class_name, weekdayLabel(item.weekday), item.start_section && item.start_section + (item.end_section ? '-' + item.end_section : '') + ' 节', item.room].filter(Boolean).join(' · ')) + '</div></div><span class="tag ' + (checked ? 'tag-green' : 'tag-amber') + '">' + (checked ? '已登记' : '待查课') + '</span>' + (checked ? '' : '<button class="btn btn-sm btn-primary" data-act="v47-class-from-schedule" data-id="' + esc(item.id) + '">登记查课</button>') + '</div>'; }).join('');
    var schedulePanel = '<section class="v47-today-schedules"><div class="v47-section-title"><strong>今日课程</strong><span class="tiny">' + esc(weekdayLabel(todayWeekday())) + ' · 共 ' + esc(schedules.length) + ' 节</span><span class="sp"></span><button class="btn btn-sm" data-view="schedules">打开班级课表</button></div>' + (scheduleRows || '<div class="v47-schedule-empty">今天没有已导入的课程安排。<button class="btn btn-sm" data-view="schedules">去导入课表</button></div>') + '</section>';
    var tableRows = values.map(function (item) { return '<tr><td>' + esc(item.date) + '<div class="tiny">第 ' + esc(item.teaching_week || '—') + ' 周</div></td><td><strong>' + esc(item.class_name || '—') + '</strong><div class="tiny">' + esc(item.course || '—') + '</div></td><td>' + esc([item.weekday, item.start_period && item.start_period + ' - ' + item.end_period + ' 节', item.classroom].filter(Boolean).join(' · ') || '—') + '</td><td><span class="tag ' + (item.status === '已处理' ? 'tag-green' : item.status === '异常' ? 'tag-red' : item.status === '已查' ? 'tag-blue' : 'tag-amber') + '">' + esc(item.status) + '</span></td><td>' + esc(item.present_count) + '</td><td>' + esc(item.absent_count) + ' / ' + esc(item.late_count) + '</td><td class="v47-actions"><button class="btn btn-sm" data-act="v47-class-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v47-class-delete" data-id="' + esc(item.id) + '">删除</button></td></tr>'; }).join('') || '<tr><td colspan="7">' + empty('还没有查课记录') + '</td></tr>';
    var body = '<section class="v47-workspace">' + schedulePanel + '<div class="v47-filter-bar"><input class="inp" type="date" data-v47-filter="classFrom" value="' + esc(s.classFrom || '') + '" aria-label="开始日期"><span class="tiny">至</span><input class="inp" type="date" data-v47-filter="classTo" value="' + esc(s.classTo || '') + '" aria-label="结束日期"><select class="inp" data-v47-filter="className">' + classOptions(true) + '</select><select class="inp" data-v47-filter="classStatus"><option value="">全部状态</option>' + optionList(v47.CLASS_CHECK_STATUSES, s.classStatus, '').replace('<option value=""></option>', '') + '</select><button class="btn btn-sm" data-act="v47-class-clear">清除筛选</button></div><div class="v47-table-wrap"><table class="v47-table"><thead><tr><th>日期</th><th>班级 / 课程</th><th>时间地点</th><th>状态</th><th>到课</th><th>未到 / 迟到</th><th>操作</th></tr></thead><tbody>' + tableRows + '</tbody></table></div></section>';
    return page('查课看板', '把今日课程、查课打卡和异常处理放在同一张可回溯的工作表里。', statStrip([{ label:'查课总数', value:summary.total }, { label:'已查', value:summary.checked }, { label:'未查', value:summary.pending }, { label:'异常', value:summary.abnormal }, { label:'未到', value:summary.absent }, { label:'迟到', value:summary.late }]) + body, '<button class="btn btn-primary" data-act="v47-class-new">新增查课</button>');
  }
  function readRollClasses() { return [...document.querySelectorAll('[data-v47-roll-class]:checked')].map(function (item) { return item.value; }); }
  function rollCallHistoryMarkup() {
    var history = rows('v4_roll_call_sessions').slice().sort(function (a, b) { return String(b.date || b.created_at || '').localeCompare(String(a.date || a.created_at || '')); }).slice(0, 60);
    if (!history.length) return '';
    var items = history.map(function (item) {
      var id = String(item.id || '');
      var classes = (item.class_names || []).join('、') || item.class_name || '未指定班级';
      var aiAction = '<button class="btn btn-sm ai-record-action" data-ai-record-action="v4_roll_call_sessions:' + esc(id) + '" data-act="ai-inline" data-ai-purpose="worklog_draft" data-ai-target-view="roll-call" data-ai-target-collection="v4_roll_call_sessions" data-ai-target-record-id="' + esc(id) + '" title="AI 点名留痕">AI 点名留痕</button>';
      return '<div class="v47-list-row"><div><strong>' + esc(item.date || '未填日期') + ' · ' + esc(classes) + '</strong><div class="tiny">' + esc(item.mode || '随机点名') + ' · 抽取 ' + esc(item.selected_count || 0) + ' 人 · 种子 ' + esc(item.random_seed || '未记录') + '</div></div><span class="tag ' + (item.reviewed ? 'tag-green' : 'tag-amber') + '">' + (item.reviewed ? '已复核' : '待复核') + '</span>' + aiAction + '</div>';
    }).join('');
    return '<section class="card"><div class="card-hd"><h2>已保存点名结果</h2><span class="sp"></span><span class="tiny">最近 ' + history.length + ' 条</span></div><div class="card-bd"><div class="v47-list">' + items + '</div></div></section>';
  }
  function viewRollCall() {
    var s = state(); var classes = [...new Set((DB.students || []).map(function (item) { return String(item.class_name || '').trim(); }).filter(Boolean))].sort(function (a, b) { return a.localeCompare(b, 'zh-CN'); }); var result = s.rollResult;
    var checks = classes.map(function (item) { return '<label class="chk v47-class-check"><input type="checkbox" value="' + esc(item) + '" data-v47-roll-class' + ((s.rollClasses || []).includes(item) ? ' checked' : '') + '><span>' + esc(item) + '</span></label>'; }).join('') || '<span class="tiny">请先导入学生班级</span>';
    var resultHtml = result ? '<section class="v47-result"><div class="v47-section-title"><strong>本次结果</strong><span class="tag tag-blue">种子 ' + esc(result.random_seed || '') + '</span><span class="sp"></span><button class="btn btn-sm" data-act="v47-roll-save">保存结果</button></div><ol>' + (result.selected_student_ids || []).map(function (id) { var item = student(id); return '<li><strong>' + esc(item && item.full_name || id) + '</strong><span class="tiny">' + esc(item && [item.student_number, item.class_name].filter(Boolean).join(' · ') || '') + '</span></li>'; }).join('') + '</ol><div class="tiny">共抽取 ' + esc(result.selected_count) + ' 人 · 未参与 AI 决策 · 可在保存前复核</div></section>' : '';
    return page('课堂随机点名', '多班级选择、不重复抽取、可复核随机种子；随机数由本机决定，AI 不参与点名。', '<section class="v47-two-col"><div class="card"><div class="card-hd"><h2>点名准备</h2><span class="sp"></span><button class="btn btn-sm" data-act="v47-roll-all">全选班级</button><button class="btn btn-sm" data-act="v47-roll-clear">清空</button></div><div class="card-bd"><div class="v47-class-grid">' + checks + '</div><div class="v47-form-line"><label class="lab">抽取人数</label><input class="inp" type="number" min="1" value="' + esc(s.rollCount || 1) + '" data-v47-roll-count><label class="lab">复核种子</label><input class="inp" value="' + esc(s.rollSeed || '') + '" data-v47-roll-seed placeholder="留空生成随机种子"></div><button class="btn btn-primary" data-act="v47-roll-run">生成点名结果</button></div></div><div class="card"><div class="card-hd"><h2>结果复核</h2><span class="sp"></span><span class="tiny">保存后才进入记录</span></div><div class="card-bd">' + (resultHtml || empty('还没有点名结果')) + '</div></div></section>' + rollCallHistoryMarkup(), '<button class="btn" data-act="v47-roll-open-screen">大屏准备</button>');
  }

  function dormInspectionForm(record) {
    var isNew = !record; var buildings = v4Collection('v4_dorm_buildings'); var rooms = v4Collection('v4_dorm_rooms');
    ui.form({ title:isNew ? '新增查寝记录' : '编辑查寝记录', size:'wide', data:record || { date:today(), result:'合格' }, fields:[
      { key:'batch_id', label:'住宿批次' }, { key:'building_id', label:'楼栋', type:'select', options:buildings.map(function (item) { return { v:item.id, n:item.name }; }) }, { key:'room_id', label:'房间', type:'select', options:rooms.map(function (item) { return { v:item.id, n:item.room_number }; }) }, { key:'building_name', label:'楼栋名称快照' }, { key:'room_number', label:'房间号快照' }, { key:'date', label:'检查日期', type:'date', required:true }, { key:'inspector', label:'检查人' }, { key:'result', label:'检查结果', type:'select', options:v47.DORM_INSPECTION_RESULTS }, { key:'summary', label:'检查摘要', type:'textarea', rows:4 }, { key:'inspection_files', label:'照片 / 附件', type:'file', multiple:true, accept:'.png,.jpg,.jpeg,.webp,.pdf,.doc,.docx' },
    ], onSave:async function (value) {
      var next = normalize('v4_dorm_inspections', Object.assign({}, record || {}, value)); var files = fileIds(value.inspection_files); var newIds = [];
      var previousRows = snapshotCustomCollections(['v4_dorm_inspections', 'v4_worklog_drafts']);
      try {
        if (files.length && typeof storeBusinessAttachments === 'function') newIds = await storeBusinessAttachments(files, next.id, { prefix:'dorm_inspection_attachment' });
        next.attachment_ids = mergeBusinessAttachmentIds(record && record.attachment_ids, record && record.attachments, newIds); delete next.inspection_files;
        var saved = upsert('v4_dorm_inspections', next, { persist:false });
        persistDraft(saved, 'v4_dorm_inspections', { title:'查寝 · ' + (saved.building_name || saved.room_number || '住宿检查'), category:'查寝', persist:false });
        await persistCustomChanges();
        render(); ui.toast(isNew ? '查寝记录已保存' : '查寝记录已更新', 'ok');
      } catch (error) { await restoreCustomState(previousRows, error); await cleanupNewAttachments(newIds, error); throw error; }
    }});
  }
  function dormExceptionForm(record, inspectionId) {
    var isNew = !record;
    ui.form({ title:isNew ? '登记查寝异常' : '处理查寝异常', size:'wide', data:record || { inspection_id:inspectionId || '', level:'一般', status:'待处理' }, fields:[
      { key:'inspection_id', label:'关联查寝记录' }, { key:'building_id', label:'楼栋 ID' }, { key:'room_id', label:'房间 ID' }, { key:'student_id', label:'关联学生', type:'select', options:studentOptions(true) }, { key:'category', label:'异常类别', required:true, ph:'卫生、安全、晚归、设备等' }, { key:'level', label:'等级', type:'select', options:v47.DORM_EXCEPTION_LEVELS }, { key:'description', label:'异常描述', type:'textarea', rows:3, required:true }, { key:'due_date', label:'处理期限', type:'date' }, { key:'status', label:'状态', type:'select', options:v47.DORM_EXCEPTION_STATUSES }, { key:'result', label:'处理结果', type:'textarea', rows:2 }, { key:'operator', label:'处理人' },
    ], onSave:async function (value) { var s = student(value.student_id); var saved = upsert('v4_dorm_exceptions', Object.assign({}, record || {}, value, { student_name:s && s.full_name || value.student_name || '', student_number:s && s.student_number || value.student_number || '' })); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast(isNew ? '异常已登记' : '异常已更新', 'ok'); }});
  }
  function viewDormInspections() {
    var s = state(); var inspections = v47.dorm.inspections.list(rows('v4_dorm_inspections'), { from:s.dormFrom || '', to:s.dormTo || '', building_id:s.dormBuilding || '' }); var exceptions = v47.dorm.exceptions.list(rows('v4_dorm_exceptions'), { status:s.exceptionStatus || '' }); var summary = v47.dorm.inspections.summary(inspections, {});
    var inspectionRows = inspections.map(function (item) { return '<tr><td>' + esc(item.date) + '</td><td><strong>' + esc(item.building_name || '—') + ' · ' + esc(item.room_number || '整栋') + '</strong><div class="tiny">' + esc(item.inspector || '未填检查人') + '</div></td><td><span class="tag ' + (item.result === '合格' ? 'tag-green' : item.result === '存在异常' ? 'tag-red' : 'tag-amber') + '">' + esc(item.result) + '</span></td><td>' + esc(item.summary || '—') + '</td><td class="v47-actions"><button class="btn btn-sm" data-act="v47-dorm-inspection-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm" data-act="v47-dorm-exception-new" data-id="' + esc(item.id) + '">登记异常</button><button class="btn btn-sm btn-danger" data-act="v47-dorm-inspection-delete" data-id="' + esc(item.id) + '">删除</button></td></tr>'; }).join('');
    var exceptionRows = exceptions.map(function (item) { return '<div class="v47-list-row"><div class="v47-list-row-main"><strong>' + esc(item.category) + ' · ' + esc(item.description) + '</strong><div class="tiny">' + esc(item.student_name || item.room_id || '房间未指定') + ' · ' + esc(item.due_date || '未设期限') + '</div></div><div class="v47-list-row-tools"><span class="tag ' + (item.status === '已关闭' ? 'tag-green' : item.level === '紧急' ? 'tag-red' : 'tag-amber') + '">' + esc(item.status) + '</span><button class="btn btn-sm" data-act="v47-dorm-exception-edit" data-id="' + esc(item.id) + '">处理</button></div></div>'; }).join('');
    return page('宿舍查寝', '查寝事实、异常处理和照片附件分开保存；关闭异常不会覆盖原始检查记录。', statStrip([{ label:'检查记录', value:summary.total }, { label:'合格', value:summary.pass }, { label:'存在问题', value:summary.issues }, { label:'未完成', value:summary.unfinished }, { label:'待处理异常', value:exceptions.filter(function (item) { return item.status !== '已关闭'; }).length }]) + '<section class="v47-filter-bar"><input class="inp" type="date" data-v47-filter="dormFrom" value="' + esc(s.dormFrom || '') + '"><span class="tiny">至</span><input class="inp" type="date" data-v47-filter="dormTo" value="' + esc(s.dormTo || '') + '"><select class="inp" data-v47-filter="dormBuilding">' + dormBuildingOptions(s.dormBuilding || '') + '</select><select class="inp" data-v47-filter="exceptionStatus">' + optionList(v47.DORM_EXCEPTION_STATUSES, s.exceptionStatus, '异常状态') + '</select><button class="btn btn-sm" data-act="v47-dorm-clear">清除筛选</button></section><section class="v47-two-col"><div class="card"><div class="card-hd"><h2>检查记录</h2><span class="sp"></span><button class="btn btn-primary btn-sm" data-act="v47-dorm-inspection-new">新增查寝</button></div><div class="card-bd"><div class="v47-table-wrap"><table class="v47-table"><thead><tr><th>日期</th><th>位置</th><th>结果</th><th>摘要</th><th>操作</th></tr></thead><tbody>' + (inspectionRows || '<tr><td colspan="5">' + empty('还没有查寝记录') + '</td></tr>') + '</tbody></table></div></div></div><div class="card"><div class="card-hd"><h2>异常处理</h2><span class="sp"></span><button class="btn btn-sm" data-act="v47-dorm-exception-new">登记异常</button></div><div class="card-bd"><div class="v47-list">' + (exceptionRows || empty('暂无异常记录')) + '</div></div></div></section>');
  }

  function assessmentRuleForm(record) {
    var isNew = !record; ui.form({ title:isNew ? '新增量化规则' : '编辑量化规则', size:'wide', data:record || { term:'', version:'v1', base_score:100, enabled:true }, fields:[{ key:'term', label:'学期', required:true }, { key:'version', label:'规则版本', required:true }, { key:'base_score', label:'基础分', type:'number' }, { key:'dimensions_text', label:'评价维度', ph:'用逗号分隔，例如：道德素养,专业技能,社会实践' }, { key:'note', label:'规则说明', type:'textarea', rows:2 }, { key:'enabled', label:'启用规则', type:'checkbox' }], onSave:async function (value) { var dimensions = String(value.dimensions_text || '').split(/[,，、]/).map(function (item) { return { name:item.trim(), weight:1, max:0, min:0 }; }).filter(function (item) { return item.name; }); delete value.dimensions_text; var saved = upsert('v4_assessment_rules', Object.assign({}, record || {}, value, { dimensions:dimensions.length ? dimensions : (record && record.dimensions || []) })); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast(isNew ? '量化规则已保存' : '量化规则已更新', 'ok'); }});
  }
  function assessmentEntryForm(record) {
    var isNew = !record; ui.form({ title:isNew ? '新增量化积分' : '编辑量化积分', size:'wide', data:record || { term:'', direction:'加分', dimension:'社会实践', score:1 }, fields:[{ key:'student_id', label:'学生', type:'select', required:true, options:studentOptions(false) }, { key:'term', label:'学期', required:true }, { key:'dimension', label:'评价维度', type:'select', options:v47.ASSESSMENT_DIMENSIONS }, { key:'score', label:'分值', type:'number', required:true }, { key:'direction', label:'方向', type:'select', options:['加分','扣分'] }, { key:'source', label:'来源' }, { key:'note', label:'说明', type:'textarea', rows:2 }, { key:'assessment_files', label:'证据附件', type:'file', multiple:true, accept:'.png,.jpg,.jpeg,.pdf,.doc,.docx' }], onSave:async function (value) { var s = student(value.student_id); if (!s) { ui.toast('请选择有效学生', 'warn'); return false; } var next = normalize('v4_assessment_entries', Object.assign({}, record || {}, value, { student_name:s && s.full_name || '', student_number:s && s.student_number || '', class_name:s && s.class_name || '' })); var duplicate = rows('v4_assessment_entries').some(function (item) { return String(item.id) !== String(next.id) && assessmentEntryKey(item) === assessmentEntryKey(next); }); if (duplicate) { ui.toast('相同学生、学期、维度、分值和来源的积分已经存在，未重复保存', 'warn'); return false; } var files = fileIds(value.assessment_files); var newIds = []; try { if (files.length && typeof storeBusinessAttachments === 'function') newIds = await storeBusinessAttachments(files, next.id, { prefix:'assessment_evidence' }); next.evidence_attachment_ids = mergeBusinessAttachmentIds(record && record.evidence_attachment_ids, record && record.attachment_ids, newIds); delete next.assessment_files; var saved = upsert('v4_assessment_entries', next); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast(isNew ? '量化积分已保存' : '量化积分已更新', 'ok'); } catch (error) { await cleanupNewAttachments(newIds, error); throw error; } }});
  }
  function viewAssessment() {
    var s = state(); var term = s.assessmentTerm || ''; var totals = v47.assessment.totals(rows('v4_assessment_entries'), rows('v4_assessment_rules'), { term:term }); var entries = rows('v4_assessment_entries').filter(function (item) { return !term || item.term === term; }).slice(-40).reverse(); var terms = [...new Set(rows('v4_assessment_entries').concat(rows('v4_assessment_rules')).map(function (item) { return item.term; }).filter(Boolean))];
    var resultRows = totals.rows.slice(0, 60).map(function (item) { return '<tr><td>' + esc(item.rank) + '</td><td><strong>' + esc(item.student_name || item.student_number) + '</strong><div class="tiny">' + esc(item.class_name || '') + '</div></td><td>' + esc(item.base_score) + '</td><td class="score-positive">+' + esc(item.add_score) + '</td><td class="score-negative">-' + esc(item.deduct_score) + '</td><td><strong>' + esc(item.final_score) + '</strong></td><td><button class="btn btn-sm" data-act="v47-assessment-student" data-id="' + esc(item.student_id) + '">学生档案</button></td></tr>'; }).join('');
    var entryRows = entries.map(function (item) { return '<div class="v47-list-row"><div class="v47-list-row-main"><strong>' + esc(item.student_name || item.student_number) + '</strong><div class="tiny">' + esc([item.term, item.dimension, item.source].filter(Boolean).join(' · ')) + '</div></div><div class="v47-list-row-tools"><span class="tag ' + (item.direction === '扣分' ? 'tag-red' : 'tag-green') + '">' + (item.direction === '扣分' ? '-' : '+') + esc(Math.abs(Number(item.score || 0))) + '</span><button class="btn btn-sm" data-act="v47-assessment-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v47-assessment-delete" data-id="' + esc(item.id) + '">删除</button></div></div>'; }).join('');
    return page('量化考评', '积分明细是事实来源，综合分数和排名由规则版本派生；AI 只可生成说明草稿，不能自动确认等级。', statStrip([{ label:'参与学生', value:totals.rows.length }, { label:'积分记录', value:entries.length }, { label:'规则版本', value:totals.rule && totals.rule.version || '—' }, { label:'最高分', value:totals.rows[0] && totals.rows[0].final_score || '—' }]) + '<section class="v47-filter-bar"><select class="inp" data-v47-filter="assessmentTerm">' + optionList(terms, term, '选择学期') + '</select><button class="btn btn-sm" data-act="v47-assessment-clear">清除筛选</button><span class="sp"></span><button class="btn btn-sm" data-act="v47-assessment-import">导入积分表</button></section><section class="v47-two-col"><div class="card"><div class="card-hd"><h2>综合排名</h2><span class="sp"></span><button class="btn btn-sm" data-act="v47-assessment-entry-new">新增积分</button></div><div class="card-bd"><div class="v47-table-wrap"><table class="v47-table"><thead><tr><th>排名</th><th>学生</th><th>基础分</th><th>加分</th><th>扣分</th><th>最终分</th><th>操作</th></tr></thead><tbody>' + (resultRows || '<tr><td colspan="7">' + empty('当前学期暂无积分') + '</td></tr>') + '</tbody></table></div></div></div><div class="card"><div class="card-hd"><h2>规则与明细</h2><span class="sp"></span><button class="btn btn-sm" data-act="v47-assessment-rule-new">规则中心</button></div><div class="card-bd"><div class="v47-list">' + (entryRows || empty('暂无积分明细')) + '</div></div></div></section>');
  }

  function toolLinkForm(record) { var isNew = !record; ui.form({ title:isNew ? '新增工具链接' : '编辑工具链接', data:record || { category:'日常材料', verification_status:'待核验' }, fields:[{ key:'name', label:'名称', required:true }, { key:'category', label:'分类', type:'select', options:['学工系统','日常材料','就业服务','竞赛入口','自定义'] }, { key:'url', label:'HTTPS 地址', required:true }, { key:'description', label:'用途说明', type:'textarea', rows:2 }, { key:'favorite', label:'收藏到工具箱', type:'checkbox' }], onSave:async function (value) { if (!safeUrl(value.url)) { ui.toast('只允许公开 HTTPS 地址，不能保存包含账号密码的链接', 'warn'); return false; } var saved = upsert('v4_tool_links', Object.assign({}, record || {}, value, { verification_status:'待核验' })); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast(isNew ? '工具链接已添加' : '工具链接已更新', 'ok'); }}); }
  function viewToolbox() { var s = state(); var links = v47.tools.links.list(rows('v4_tool_links'), { category:s.toolCategory || '', query:s.toolQuery || '' }); var cats = [...new Set(rows('v4_tool_links').map(function (item) { return item.category; }).filter(Boolean))]; var listHtml = links.map(function (item) { var link = safeUrl(item.url) ? '<a class="btn btn-sm" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">打开</a>' : '<span class="tag tag-amber">网址待核验</span>'; return '<div class="v47-list-row"><div><strong>' + esc(item.name) + '</strong><div class="tiny">' + esc(item.category) + ' · ' + esc(item.description || item.url) + '</div></div><span class="tag ' + (item.verification_status === '已核验' ? 'tag-green' : 'tag-amber') + '">' + esc(item.verification_status) + '</span>' + link + '<button class="btn btn-sm" data-act="v47-tool-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v47-tool-delete" data-id="' + esc(item.id) + '">删除</button></div>'; }).join(''); return page('工具入口', '集中维护学工系统、日常材料、就业和竞赛网站；实用工具中的抽签、分组和日期计算仍保持独立。', '<section class="v47-filter-bar"><input class="inp" placeholder="搜索工具" value="' + esc(s.toolQuery || '') + '" data-v47-filter="toolQuery"><select class="inp" data-v47-filter="toolCategory">' + optionList(cats, s.toolCategory, '全部分类') + '</select><button class="btn btn-sm" data-act="v47-tool-clear">清除筛选</button></section><section class="card"><div class="card-hd"><h2>常用入口</h2><span class="sp"></span><span class="tiny">仅允许 HTTPS 外链</span><button class="btn btn-primary btn-sm" data-act="v47-tool-new">新增链接</button></div><div class="card-bd"><div class="v47-list">' + (listHtml || empty('还没有工具链接')) + '</div></div></section>'); }

  function safetyForm(record) { var isNew = !record; ui.form({ title:isNew ? '新增就业风险提示' : '编辑就业风险提示', size:'wide', data:record || { risk_level:'提示', type:'用人单位' }, fields:[{ key:'organization', label:'单位名称', required:true }, { key:'type', label:'类型' }, { key:'risk_level', label:'风险等级', type:'select', options:['安全','提示','高风险'] }, { key:'reason', label:'判断理由', type:'textarea', rows:3, required:true }, { key:'source_url', label:'来源 HTTPS 地址' }, { key:'checked_at', label:'最近核验日期', type:'date' }, { key:'note', label:'备注', type:'textarea', rows:2 }], onSave:async function (value) { if (value.source_url && !safeUrl(value.source_url)) { ui.toast('来源只允许公开 HTTPS 地址', 'warn'); return false; } var saved = upsert('v4_employment_safety', value); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast(isNew ? '防骗提示已添加' : '防骗提示已更新', 'ok'); }}); }
  function viewSafety() { var s = state(); var values = v47.employment.safety.list(rows('v4_employment_safety'), { risk_level:s.safetyLevel || '' }); var listHtml = values.map(function (item) { return '<div class="v47-list-row"><div><strong>' + esc(item.organization) + '</strong><div class="tiny">' + esc(item.type) + ' · ' + esc(item.reason) + '</div><div class="tiny">核验：' + esc(item.checked_at || '未填写') + '</div></div><span class="tag ' + (item.risk_level === '高风险' ? 'tag-red' : item.risk_level === '安全' ? 'tag-green' : 'tag-amber') + '">' + esc(item.risk_level) + '</span><button class="btn btn-sm" data-act="v47-safety-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v47-safety-delete" data-id="' + esc(item.id) + '">删除</button></div>'; }).join(''); return page('就业防骗台账', '记录风险等级、理由、来源和最近核验时间；不把提醒当成事实结论。', '<section class="v47-filter-bar"><select class="inp" data-v47-filter="safetyLevel">' + optionList(['安全','提示','高风险'], s.safetyLevel, '全部风险') + '</select><button class="btn btn-sm" data-act="v47-safety-clear">清除筛选</button></section><section class="card"><div class="card-hd"><h2>风险提示</h2><span class="sp"></span><button class="btn btn-primary btn-sm" data-act="v47-safety-new">新增提示</button></div><div class="card-bd"><div class="v47-list">' + (listHtml || empty('还没有就业风险提示')) + '</div></div></section>'); }

  function competitionResourceForm(record) { var isNew = !record; ui.form({ title:isNew ? '新增竞赛资源' : '编辑竞赛资源', size:'wide', data:record || { category:'综合类', verification_status:'待核验' }, fields:[{ key:'name', label:'竞赛名称', required:true }, { key:'category', label:'分类' }, { key:'organizer', label:'主办方' }, { key:'official_url', label:'官网 HTTPS 地址' }, { key:'registration_url', label:'报名 HTTPS 地址' }, { key:'deadline', label:'报名截止', type:'date' }, { key:'source', label:'来源' }, { key:'note', label:'备注', type:'textarea', rows:2 }], onSave:async function (value) { if (value.official_url && !safeUrl(value.official_url) || value.registration_url && !safeUrl(value.registration_url)) { ui.toast('官网和报名地址只允许公开 HTTPS 地址', 'warn'); return false; } var saved = upsert('v4_competition_resources', value); await awaitTrackedSave(savePromiseOf(saved)); render(); ui.toast(isNew ? '竞赛资源已保存' : '竞赛资源已更新', 'ok'); }}); }
  function competitionEntryForm(record) {
    var isNew = !record;
    var resources = rows('v4_competition_resources');
    var liveRecord = record && rows('v4_competition_entries').find(function (item) { return String(item.id) === String(record.id); }) || record;
    ui.form({ title:isNew ? '登记竞赛报名' : '编辑竞赛报名', size:'wide', data:liveRecord || { status:'待报名' }, fields:[
      { key:'competition_id', label:'竞赛资源', type:'select', required:true, options:resources.map(function (item) { return { v:item.id, n:[item.name || '未命名竞赛', item.deadline ? '截止 ' + item.deadline : '未设截止'].join(' · ') }; }) }, { key:'student_id', label:'学生', type:'select', required:true, options:studentOptions(false) }, { key:'project_name', label:'项目名称' }, { key:'role', label:'项目角色' }, { key:'division', label:'分工', type:'textarea', rows:2 }, { key:'status', label:'报名状态', type:'select', options:v47.COMPETITION_STATUSES }, { key:'award_level', label:'获奖等级' }, { key:'competition_files', label:'材料附件', type:'file', multiple:true, accept:'.png,.jpg,.jpeg,.pdf,.doc,.docx' }, { key:'note', label:'备注', type:'textarea', rows:2 }
    ], onSave:async function (value) {
      var s = student(value.student_id);
      if (!s) { ui.toast('请选择有效学生', 'warn'); return false; }
      var resource = resources.find(function (item) { return String(item.id) === String(value.competition_id || ''); });
      if (!resource) { ui.toast('请选择有效竞赛资源；如尚未建立，请先新增竞赛资源', 'warn'); return false; }
      var previousRows = snapshotCustomCollections(['v4_competition_entries']);
      var next = normalize('v4_competition_entries', Object.assign({}, liveRecord || {}, value, { student_id:s.id, student_name:s.full_name || '', student_number:s.student_number || '', class_name:s.class_name || '' }));
      var duplicate = rows('v4_competition_entries').some(function (item) { return String(item.id) !== String(next.id) && competitionEntryKey(item) === competitionEntryKey(next); });
      if (duplicate) { ui.toast('同一竞赛中该学生和项目已经登记过报名，未重复保存', 'warn'); return false; }
      var files = fileIds(value.competition_files); var newIds = [];
      try {
        if (files.length && typeof storeBusinessAttachments === 'function') newIds = await storeBusinessAttachments(files, next.id, { prefix:'competition_attachment' });
        next.attachment_ids = mergeBusinessAttachmentIds(liveRecord && liveRecord.attachment_ids, liveRecord && liveRecord.attachments, newIds);
        delete next.competition_files;
        upsert('v4_competition_entries', next, { persist:false });
        await persistCustomChanges();
        render(); ui.toast(isNew ? '竞赛报名已保存' : '竞赛报名已更新', 'ok');
      } catch (error) {
        await restoreCustomState(previousRows, error);
        await cleanupNewAttachments(newIds, error);
        throw error;
      }
    }});
  }
  function viewCompetitions() { var s = state(); var resources = v47.competitions.resources.list(rows('v4_competition_resources'), { category:s.competitionCategory || '' }); var entries = v47.competitions.entries.list(rows('v4_competition_entries'), {}); var resourcesHtml = resources.map(function (item) { var official = safeUrl(item.official_url) ? '<a class="btn btn-sm" href="' + esc(item.official_url) + '" target="_blank" rel="noopener noreferrer">官网</a>' : ''; var registration = safeUrl(item.registration_url) ? '<a class="btn btn-sm" href="' + esc(item.registration_url) + '" target="_blank" rel="noopener noreferrer">报名</a>' : ''; var deadlineTag = item.deadline && item.deadline < today() ? '<span class="tag tag-red">已截止</span>' : '<span class="tag tag-blue">' + esc(item.verification_status) + '</span>'; return '<div class="v47-list-row"><div class="v47-list-row-main"><strong>' + esc(item.name) + '</strong><div class="tiny">' + esc([item.category, item.organizer, item.deadline && '截止 ' + item.deadline].filter(Boolean).join(' · ')) + '</div></div><div class="v47-list-row-tools">' + deadlineTag + official + registration + '<button class="btn btn-sm" data-act="v47-competition-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v47-competition-delete" data-id="' + esc(item.id) + '">删除</button></div></div>'; }).join(''); var entriesHtml = entries.slice(-40).reverse().map(function (item) { return '<div class="v47-list-row"><div class="v47-list-row-main"><strong>' + esc(item.student_name || item.student_number) + '</strong><div class="tiny">' + esc([item.project_name, item.role, item.division].filter(Boolean).join(' · ')) + '</div></div><div class="v47-list-row-tools"><span class="tag ' + (item.status === '已获奖' ? 'tag-green' : item.status === '未入选' ? 'tag-red' : 'tag-blue') + '">' + esc(item.status) + '</span><button class="btn btn-sm" data-act="v47-competition-entry-edit" data-id="' + esc(item.id) + '">编辑</button><button class="btn btn-sm btn-danger" data-act="v47-competition-entry-delete" data-id="' + esc(item.id) + '">删除</button></div></div>'; }).join(''); return page('就业与竞赛资源', '把资源导航、报名项目、学生分工和材料附件放在同一条工作链上。', '<section class="v47-filter-bar"><select class="inp" data-v47-filter="competitionCategory">' + optionList([...new Set(rows('v4_competition_resources').map(function (item) { return item.category; }).filter(Boolean))], s.competitionCategory, '全部分类') + '</select><button class="btn btn-sm" data-act="v47-competition-clear">清除筛选</button></section><section class="v47-two-col"><div class="card"><div class="card-hd"><h2>竞赛资源</h2><span class="sp"></span><button class="btn btn-primary btn-sm" data-act="v47-competition-new">新增资源</button></div><div class="card-bd"><div class="v47-list">' + (resourcesHtml || empty('暂无竞赛资源')) + '</div></div></div><div class="card"><div class="card-hd"><h2>学生报名与分工</h2><span class="sp"></span><button class="btn btn-primary btn-sm" data-act="v47-competition-entry-new">新增报名</button></div><div class="card-bd"><div class="v47-list">' + (entriesHtml || empty('暂无报名项目')) + '</div></div></div></section>'); }

  function viewAcademic() { var s = state(); var summary = v47.academicSummary({ grades:DB.grades || [], term:s.academicTerm || '' }); var terms = [...new Set((DB.grades || []).map(function (item) { return item.term || item.academic_term || item.semester; }).filter(Boolean))]; var rowsHtml = summary.rows.slice(0, 80).map(function (item) { var aiButton = item.student_id ? '<button class="btn btn-sm" data-act="ai-inline" data-ai-purpose="academic_support" data-ai-target-view="academic-analysis" data-ai-target-collection="grades" data-ai-student-id="' + esc(item.student_id) + '">AI 帮扶草稿</button>' : ''; return '<tr><td><strong>' + esc(item.student_name || item.student_number) + '</strong><div class="tiny">' + esc(item.class_name || '') + '</div></td><td>' + esc(item.courses) + '</td><td>' + esc(item.gpa == null ? '未记录' : item.gpa) + '</td><td>' + esc(item.failed_courses) + '</td><td>' + esc(item.average_score == null ? '未记录' : item.average_score) + '</td><td><span class="tag ' + (item.warning ? 'tag-red' : item.failed_courses ? 'tag-amber' : 'tag-green') + '">' + (item.warning ? '预警' : item.failed_courses ? '有挂科' : '正常') + '</span> ' + aiButton + '</td></tr>'; }).join(''); return page('学业分析', '用 GPA、挂科课程、班级和学期维度查看学业事实；缺失数据显示“未记录”，不把空白当作零。', statStrip([{ label:'学生数', value:summary.totals.student_count }, { label:'有挂科', value:summary.totals.failed_students }, { label:'预警', value:summary.totals.warning_students }, { label:'当前学期', value:s.academicTerm || '全部' }]) + '<section class="v47-filter-bar"><select class="inp" data-v47-filter="academicTerm">' + optionList(terms, s.academicTerm, '全部学期') + '</select><button class="btn btn-sm" data-act="v47-academic-clear">清除筛选</button></section><section class="card"><div class="card-hd"><h2>学生学业概览</h2><span class="sp"></span><button class="btn btn-sm btn-primary" data-act="ai-inline" data-ai-purpose="academic_support" data-ai-target-view="academic-analysis" data-ai-target-collection="grades">生成帮扶草稿</button></div><div class="card-bd"><div class="v47-table-wrap"><table class="v47-table"><thead><tr><th>学生</th><th>课程数</th><th>GPA</th><th>挂科门数</th><th>平均成绩</th><th>状态</th></tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="6">' + empty('当前没有成绩记录') + '</td></tr>') + '</tbody></table></div></div></section>'); }

  function noticeText() { var input = document.querySelector('[data-v47-notice-text]'); return input ? input.value : String(state().noticeRaw || ''); }
  function noticeLines(selector) { var input = document.querySelector(selector); return input ? input.value.split(/\r?\n/).map(function (item) { return item.trim(); }).filter(Boolean) : []; }
  function syncNoticeEditor() {
    var s = state(); var result = s.noticeResult; var notice = result && (result.notice || result); if (!notice) return;
    var next = Object.assign({}, notice, { title:String((document.querySelector('[data-v47-notice-title]') || {}).value || notice.title || '').trim(), audience:String((document.querySelector('[data-v47-notice-audience]') || {}).value || notice.audience || '').trim(), key_points:noticeLines('[data-v47-notice-key-points]'), todos:noticeLines('[data-v47-notice-todos]'), deadlines:noticeLines('[data-v47-notice-deadlines]').map(function (item) { return { date:item, label:'待核验', evidence:item }; }), needs_verification:noticeLines('[data-v47-notice-verify]'), evidence:noticeLines('[data-v47-notice-evidence]') });
    s.noticeResult = result.notice ? Object.assign({}, result, { notice:next }) : next;
  }
  function noticeMarkup(result) {
    var notice = result && (result.notice || result); if (!notice) return empty('粘贴通知后生成结果');
    var meta = result.source ? '<div class="tiny v47-notice-meta">来源：' + esc(result.source.source || notice.source || '未填写') + ' · 接收：' + esc(result.source.received_at || notice.received_at || '未填写') + (notice.confidence != null ? ' · 置信度 ' + Math.round(Number(notice.confidence) * 100) + '%' : '') + '</div>' : '';
    var status = result && result.suggestion && result.suggestion.status || '';
    var confirmed = state().noticeConfirmed === true || ['accepted', 'converted_task', 'converted_worklog', 'converted_talk'].includes(status);
    var targetLabel = state().noticeConfirmedTarget === 'task' ? '已转任务草稿' : state().noticeConfirmedTarget === 'worklog' ? '已转留痕草稿' : '建议已确认保存';
    var actions = confirmed
      ? '<div class="v47-notice-actions"><span class="tag tag-green">' + esc(targetLabel) + '</span><button type="button" class="btn btn-sm" data-act="ai-go-center">查看建议中心</button><button type="button" class="btn btn-sm" data-act="v47-notice-preview">重新识别</button></div>'
      : '<div class="v47-notice-actions"><button type="button" class="btn btn-sm btn-primary" data-act="v47-notice-confirm">确认保存建议</button><button type="button" class="btn btn-sm" data-act="v47-notice-task">确认并转任务草稿</button><button type="button" class="btn btn-sm" data-act="v47-notice-worklog">确认并转留痕草稿</button></div>';
    return '<div class="v47-notice-result"><div class="v47-section-title"><strong>' + (confirmed ? '已确认的通知建议' : '请核对并编辑识别结果') + '</strong><span class="tag ' + (confirmed ? 'tag-green' : 'tag-amber') + '">' + (confirmed ? '已进入建议链' : '需人工核验') + '</span></div>' + meta + '<div class="v47-notice-edit-grid"><label class="form-row"><span class="lab">标题</span><input class="inp" data-v47-notice-title value="' + esc(notice.title || '') + '"></label><label class="form-row"><span class="lab">适用对象</span><input class="inp" data-v47-notice-audience value="' + esc(notice.audience || '') + '"></label><label class="form-row v47-notice-edit-wide"><span class="lab">重点内容（每行一条）</span><textarea class="inp" data-v47-notice-key-points rows="4">' + esc((notice.key_points || []).join('\n')) + '</textarea></label><label class="form-row"><span class="lab">待办事项（每行一条）</span><textarea class="inp" data-v47-notice-todos rows="4">' + esc((notice.todos || []).join('\n')) + '</textarea></label><label class="form-row"><span class="lab">截止时间（每行一条）</span><textarea class="inp" data-v47-notice-deadlines rows="4">' + esc((notice.deadlines || []).map(function (item) { return item.date || item; }).join('\n')) + '</textarea></label><label class="form-row"><span class="lab">需要核验（每行一条）</span><textarea class="inp" data-v47-notice-verify rows="3">' + esc((notice.needs_verification || []).join('\n')) + '</textarea></label><label class="form-row v47-notice-edit-wide"><span class="lab">原文证据片段（每行一条）</span><textarea class="inp" data-v47-notice-evidence rows="3">' + esc((notice.evidence || []).join('\n')) + '</textarea></label></div>' + actions + '</div>';
  }
  function viewNotice() { var s = state(); return page('通知 AI 工作区', '只处理老师主动粘贴或导入的通知；左侧保留原文，右侧生成可审核重点，确认前不写入任务或工作留痕。', '<section class="v47-notice-grid"><div class="card"><div class="card-hd"><h2>原文输入</h2><span class="sp"></span><span class="tiny">不会后台读取其他系统</span></div><div class="card-bd"><div class="grid2"><div class="form-row"><label class="lab">来源</label><input class="inp" data-v47-notice-source value="' + esc(s.noticeSource || '') + '"></div><div class="form-row"><label class="lab">接收时间</label><input class="inp" type="datetime-local" data-v47-notice-received value="' + esc(s.noticeReceived || '') + '"></div></div><textarea class="inp v47-notice-input" data-v47-notice-text rows="18" placeholder="粘贴通知全文或导入文本文件">' + esc(s.noticeRaw || '') + '</textarea><input type="file" hidden data-v47-notice-file accept=".txt,.md,.csv,text/plain"><div class="v4-toolbar"><button class="btn btn-sm" data-act="v47-notice-file">导入文本</button><button class="btn btn-sm" data-act="v47-notice-preview">本地预览重点</button><button class="btn btn-primary btn-sm" data-act="v47-notice-ai">AI 识别重点</button></div></div></div><div class="card"><div class="card-hd"><h2>AI 结果</h2><span class="sp"></span><span class="tag tag-blue">可编辑草稿</span></div><div class="card-bd">' + noticeMarkup(s.noticeResult) + '</div></div></section>'); }

  function contextPageLabel(view) {
    var activeView = view;
    if (activeView === 'bridge' && app.bridgeTab === 'backup') activeView = 'backup';
    return ({ home:'今日概览', students:'学生台账', talks:'谈心谈话', tasks:'工作任务', report:'工作留痕', worklogs:'工作留痕记录', stay:'校外住宿', schedules:'班级课表', orgs:'班团组织', party:'党员发展', league:'团员发展', rewards:'奖惩管理', activities:'活动开展', grades:'成绩管理', grant:'奖助勤补', focus:'重点学生档案', psych:'心理摸排', graduate:'毕业生就业', policy:'政策智库', material:'素材收藏', comp:'科创竞赛', tpl:'模板库', learning:'学习助手', contacts:'工作通讯录', bridge:'平台联动', backup:'备份与迁移', audit:'访问审计', ai:'AI 智能工作台', 'class-checks':'查课看板', 'roll-call':'随机点名', 'dorm-inspections':'宿舍查寝', assessment:'量化考评', toolbox:'工具入口', 'employment-safety':'就业防骗', competitions:'竞赛资源', 'academic-analysis':'学业分析', 'notice-ai':'通知 AI', dorm:'住宿专项', committee:'班委与考核', family:'家校联系', research:'科研课题', 'class-analysis':'班级综合分析', 'worklog-drafts':'待确认工作记录' }[activeView] || activeView || '今日概览');
  }
  function contextStudent() { var s = app.v4 || {}; var v = state(); var id = String(s.aiStudentId || v.aiStudentId || '').trim(); return id ? student(id) : null; }
  function contextHtml() {
    var open = (DB.tasks || []).filter(function (item) { return item.status !== 'done'; }).sort(function (a, b) { return String(a.due || '').localeCompare(String(b.due || '')); }).slice(0, 4);
    var drafts = v4Collection('v4_worklog_drafts').filter(function (item) { return item.status === 'draft' || item.status === 'stale'; }).length;
    var selected = contextStudent();
    var selectedHtml = selected ? '<div class="v47-context-person"><div class="v47-context-person-name">' + esc(selected.full_name || '未命名学生') + '</div><div class="tiny">' + esc([selected.class_name, selected.student_number].filter(Boolean).join(' · ') || '未填写班级') + '</div><div class="tiny">' + esc([selected.advisor_name && '导师 ' + selected.advisor_name, selected.homeroom_teacher_name && '班主任 ' + selected.homeroom_teacher_name].filter(Boolean).join(' · ') || '暂无导师 / 班主任信息') + '</div></div><div class="v47-context-person-actions"><button class="btn btn-sm" data-act="student-view" data-id="' + esc(selected.id) + '">打开学生档案</button><button class="btn btn-sm" data-act="v47-context-clear-student" aria-label="清除当前学生上下文">清除当前学生</button></div>' : '<div class="v47-context-person v47-context-person-empty"><strong>尚未选择具体学生</strong><span class="tiny">在当前页面选择学生后，这里会显示摘要和下一步动作。</span></div>';
    var studentAction = selected ? ' data-student-id="' + esc(selected.id) + '"' : '';
    return '<aside id="cwb-v47-context" class="v47-context" aria-label="当前上下文"><div class="v47-context-head"><strong>当前上下文</strong><button type="button" class="btn btn-icon btn-sm" data-act="v47-context-toggle" aria-label="收起上下文" title="收起上下文"><svg class="ic ic-sm" aria-hidden="true"><use href="#i-x"/></svg></button></div><div class="v47-context-block"><span class="tiny">当前页面</span><strong>' + esc(contextPageLabel(app.view)) + '</strong><span class="tiny">' + esc(app.view === 'bridge' && app.bridgeTab === 'backup' ? 'bridge / backup' : (app.view || 'home')) + '</span></div><div class="v47-context-block"><span class="tiny">当前学生 / 事项</span>' + selectedHtml + '</div><div class="v47-context-block"><span class="tiny">待办与草稿</span><div class="v47-context-number">' + esc(open.length) + '</div><span class="tiny">待确认工作记录 ' + esc(drafts) + ' 条</span></div><div class="v47-context-list">' + (open.map(function (item) { return '<button type="button" data-act="task-edit" data-id="' + esc(item.id) + '" aria-label="打开任务：' + esc(item.title || '未命名任务') + '"><strong>' + esc(item.title || '未命名任务') + '</strong><span>' + esc(item.due || '未设截止') + '</span></button>'; }).join('') || '<span class="tiny">当前没有未完成任务</span>') + '</div><div class="v47-context-actions"><button type="button" class="btn btn-primary btn-sm" data-act="task-new"' + studentAction + '>新建任务</button><button type="button" class="btn btn-sm" data-act="talk-new"' + studentAction + '>记一次谈话</button><button type="button" class="btn btn-sm" data-act="worklog-new"' + studentAction + '>记工作留痕</button><button type="button" class="btn btn-sm" data-act="v47-open-notice">识别通知</button></div><div class="v47-context-note">AI 结果默认进入建议或草稿，人工确认后才会写入正式业务记录。</div></aside>';
  }
  function contextIsNarrow() { return typeof window !== 'undefined' && window.innerWidth <= 1279; }
  function contextFocusable(panel) { return panel && panel.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'); }
  function focusContextPanel() { var target = contextFocusable(document.querySelector('#cwb-v47-context')); if (target && typeof target.focus === 'function') target.focus(); }
  function restoreContextFocus() {
    var target = contextIsNarrow() ? document.querySelector('.v47-context-toggle') : document.querySelector('#cwb-v47-context [data-act="v47-context-toggle"]');
    if (!target && contextReturnFocus && contextReturnFocus.isConnected) target = contextReturnFocus;
    if (target && typeof target.focus === 'function') target.focus();
    contextReturnFocus = null;
  }
  function applyContextState(panel) {
    if (!panel) return;
    var s = state(); var narrow = contextIsNarrow(); var open = s.contextOpen === true; var visible = narrow ? open : s.contextCollapsed !== true;
    panel.classList.toggle('is-collapsed', s.contextCollapsed === true);
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', String(!visible));
    var scrim = document.querySelector('#cwb-v47-context-scrim');
    if (scrim) { scrim.classList.toggle('is-open', narrow && open); scrim.setAttribute('aria-hidden', String(!(narrow && open))); }
    var toggle = document.querySelector('[data-act="v47-context-toggle"].v47-context-toggle');
    if (toggle) { toggle.setAttribute('aria-expanded', String(visible)); toggle.setAttribute('aria-label', visible ? '收起上下文面板' : '打开上下文面板'); toggle.title = visible ? '收起上下文面板' : '打开上下文面板'; }
  }
  function installContext() { var layout = document.querySelector('.layout'); if (!layout) return; layout.classList.add('cwb-v47-layout'); if (document.querySelector('#cwb-v47-context')) return; layout.insertAdjacentHTML('beforeend', '<button type="button" id="cwb-v47-context-scrim" class="v47-context-scrim" data-act="v47-context-toggle" aria-label="关闭上下文面板" aria-hidden="true"></button>' + contextHtml()); applyContextState(document.querySelector('#cwb-v47-context')); }
  function refreshContext() { var panel = document.querySelector('#cwb-v47-context'); if (!panel) return; var active = document.activeElement; var activeInside = active && panel.contains(active); var activeAct = activeInside && active.dataset && active.dataset.act; var activeId = activeInside && active.dataset && active.dataset.id; panel.outerHTML = contextHtml(); var next = document.querySelector('#cwb-v47-context'); applyContextState(next); if (activeInside && (state().contextOpen === true || !contextIsNarrow())) { var replacement = next && next.querySelector('[data-act="' + activeAct + '"][data-id="' + activeId + '"]'); if (replacement && typeof replacement.focus === 'function') replacement.focus(); else focusContextPanel(); } }
  function installContextToggle() { var host = document.querySelector('.topbar-acts'); if (!host || host.querySelector('.v47-context-toggle')) return; var button = document.createElement('button'); button.className = 'btn btn-sm btn-icon v47-context-toggle'; button.type = 'button'; button.dataset.act = 'v47-context-toggle'; button.setAttribute('aria-controls', 'cwb-v47-context'); button.setAttribute('aria-label', '打开上下文面板'); button.title = '打开上下文面板'; button.innerHTML = '<svg class="ic ic-sm"><use href="#i-menu"/></svg>'; host.insertBefore(button, host.firstChild); applyContextState(document.querySelector('#cwb-v47-context')); }
  function installContextToggleStyles() { if (document.querySelector('#cwb-v47-context-toggle-style')) return; var style = document.createElement('style'); style.id = 'cwb-v47-context-toggle-style'; style.textContent = '.v47-context-toggle{display:none}@media (min-width:901px) and (max-width:1279px){.v47-context-toggle{display:inline-flex}}'; document.head.appendChild(style); }
  function installReferenceSurface() { document.body.classList.add('cwb-v47-surface'); if (document.querySelector('#cwb-v47-surface-style')) return; var style = document.createElement('style'); style.id = 'cwb-v47-surface-style'; style.textContent = '.cwb-v47-surface{background-image:none}.cwb-v47-surface .nav-item.on{background:var(--accent-soft);color:var(--accent);box-shadow:none}.cwb-v47-surface .nav-item.on .ic{color:var(--accent)}'; document.head.appendChild(style); }
  function installPolishedSurface() {
    if (document.querySelector('#cwb-v48-polished-style')) return;
    var style = document.createElement('style');
    style.id = 'cwb-v48-polished-style';
    style.textContent = `
:root {
  --nav-w: 240px;
  --fs-body: 14px;
  --fs-h1: 24px;
  --fs-h2: 17px;
  --fs-h3: 15px;
  --fs-sm: 13px;
  --fs-xs: 12px;
  --lh-body: 1.68;
  --r-lg: 12px;
  --r: 8px;
  --r-sm: 7px;
  --r-xs: 5px;
  --sh: 0 1px 2px rgba(15, 23, 42, .035);
  --sh-xs: 0 1px 2px rgba(15, 23, 42, .035);
  --sh-sm: 0 4px 14px rgba(15, 23, 42, .07);
  --sh-md: 0 10px 28px rgba(15, 23, 42, .10);
  --sh-lg: 0 18px 46px rgba(15, 23, 42, .16);
  --sh-kpi: 0 1px 2px rgba(15, 23, 42, .04);
  --track-tight: 0;
  --track-wide: 0;
}
body.cwb-v47-surface {
  background: #f4f6f9 !important;
  color: #172033;
  font-size: var(--fs-body);
  line-height: var(--lh-body);
}
body.cwb-v47-surface *,
body.cwb-v47-surface *::before,
body.cwb-v47-surface *::after { letter-spacing: 0 !important; }
body.cwb-v47-surface .topbar {
  height: 64px;
  padding: 0 22px;
  border-bottom: 1px solid #dfe5ed;
  box-shadow: 0 1px 0 rgba(15, 23, 42, .02);
}
body.cwb-v47-surface .topbar::after { display: none; }
body.cwb-v47-surface .brand { font-size: 16px; gap: 9px; }
body.cwb-v47-surface .brand-mark { width: 32px; height: 32px; border-radius: 8px; }
body.cwb-v47-surface .brand-sub { border-radius: 6px; padding: 3px 8px; font-size: 10px; }
body.cwb-v47-surface .topbar-search { height: 38px; border-radius: 7px; background: #f7f9fb; }
body.cwb-v47-surface .topbar .btn { border-radius: 7px; }
body.cwb-v47-surface .layout.cwb-v47-layout {
  grid-template-columns: minmax(0, 1fr) 304px;
  gap: 22px;
  padding-right: 24px;
}
body.cwb-v47-surface .sidenav {
  top: 64px;
  padding: 14px 12px;
  background: #fff;
  border-right-color: #e1e6ed;
}
body.cwb-v47-surface .nav-search { height: 36px; border-radius: 7px; background: #f7f9fb; }
body.cwb-v47-surface .nav-tools { gap: 4px; margin-bottom: 5px; }
body.cwb-v47-surface .nav-tools .btn { min-height: 28px; border-radius: 6px; }
body.cwb-v47-surface .nav-group { padding: 13px 10px 6px; font-size: 11px; }
body.cwb-v47-surface .nav-group:first-child { padding-top: 4px; }
body.cwb-v47-surface .nav-item {
  min-height: 38px;
  margin-bottom: 2px;
  padding: 0 10px;
  border-radius: 6px;
  color: #44536a;
  font-size: 13.5px;
}
body.cwb-v47-surface .nav-item:hover { background: #f1f5fa; color: #1c3557; }
body.cwb-v47-surface .nav-item.on {
  background: #e9f1ff !important;
  color: #1559b7 !important;
  font-weight: 650;
  box-shadow: none !important;
}
body.cwb-v47-surface .nav-item.on::before { width: 3px; top: 7px; bottom: 7px; border-radius: 0 3px 3px 0; background: #2d6dcc; }
body.cwb-v47-surface .nav-item.on .ic { color: #2d6dcc !important; }
body.cwb-v47-surface .nav-item .ic { width: 16px; height: 16px; }
body.cwb-v47-surface .nav-foot {
  margin-top: 10px;
  padding: 10px 8px;
  border: 0;
  border-top: 1px solid #edf0f4;
  border-radius: 0;
  background: transparent;
}
body.cwb-v47-surface .main { padding: 26px 28px 60px; }
body.cwb-v47-surface .v47-page-view { min-width: 0; }
body.cwb-v47-surface .v47-page-view .v4-head {
  position: relative;
  align-items: center;
  min-height: 66px;
  margin-bottom: 18px;
  padding: 0 0 17px 15px;
  border-bottom: 1px solid #dfe6ee;
}
body.cwb-v47-surface .v47-page-view .v4-head::before {
  content: '';
  position: absolute;
  left: 0;
  top: 3px;
  bottom: 18px;
  width: 3px;
  border-radius: 3px;
  background: #2d6dcc;
}
body.cwb-v47-surface .v47-page-view .v4-head h1 { font-size: 23px; font-weight: 750; letter-spacing: 0; }
body.cwb-v47-surface .v47-page-view .v4-head p { max-width: 760px; line-height: 1.6; }
body.cwb-v47-surface .v47-page-view .v4-actions { align-self: flex-start; padding-top: 2px; }
body.cwb-v47-surface :where(button, a, input, select, textarea):focus-visible { outline: 3px solid rgba(45, 109, 204, .24); outline-offset: 2px; }
body.cwb-v47-surface .card,
body.cwb-v47-surface .today {
  margin-bottom: 16px;
  border: 1px solid #e0e6ee;
  border-radius: 8px;
  box-shadow: none;
}
body.cwb-v47-surface .card:hover { border-color: #d3dce8; box-shadow: none; }
body.cwb-v47-surface .card-hd {
  min-height: 50px;
  padding: 13px 18px;
  background: #fff;
  border-bottom-color: #edf0f4;
}
body.cwb-v47-surface .card-hd h2 { font-size: 16px; }
body.cwb-v47-surface .card-bd { padding: 17px 18px; }
body.cwb-v47-surface .btn {
  min-height: 34px;
  border-radius: 7px;
  box-shadow: none;
  font-size: 13px;
}
body.cwb-v47-surface .btn-primary {
  background: #175dbb;
  border-color: #175dbb;
  box-shadow: none;
}
body.cwb-v47-surface .btn-primary:hover { background: #124d9c; border-color: #124d9c; transform: none; box-shadow: none; }
body.cwb-v47-surface .btn-sm { min-height: 30px; border-radius: 6px; padding: 0 10px; }
body.cwb-v47-surface .inp,
body.cwb-v47-surface select.inp,
body.cwb-v47-surface textarea.inp {
  min-height: 34px;
  border-radius: 6px;
  border-color: #d7dee8;
  background: #fff;
  font-size: 13px;
}
body.cwb-v47-surface .inp:focus,
body.cwb-v47-surface select.inp:focus,
body.cwb-v47-surface textarea.inp:focus { border-color: #6d9cda; box-shadow: 0 0 0 3px rgba(45, 109, 204, .12); }
body.cwb-v47-surface .tag { border-radius: 5px; font-size: 11px; padding: 3px 7px; }
body.cwb-v47-surface .tw { border-color: #e2e7ee; border-radius: 7px; }
body.cwb-v47-surface table th { background: #f8fafc; color: #64748b; font-size: 11px; }
body.cwb-v47-surface table th,
body.cwb-v47-surface table td { padding: 10px 11px; }
body.cwb-v47-surface .v4-head { margin: 0 0 19px; padding: 0 0 2px; }
body.cwb-v47-surface .v4-head h1 { font-size: 24px; line-height: 1.3; color: #172033; }
body.cwb-v47-surface .v4-head p { margin-top: 6px; color: #718096; font-size: 13px; }
body.cwb-v47-surface .v4-actions { gap: 7px; }
body.cwb-v47-surface .ai-inline-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  margin-bottom: 14px;
  padding: 9px 12px;
  border: 1px solid #d9e5f5;
  border-radius: 8px;
  background: #f7faff;
}
body.cwb-v47-surface .ai-inline-bar.is-blocked { border-color: #e1e7ef; background: #fbfcfe; }
body.cwb-v47-surface .ai-inline-copy { display: grid; gap: 1px; min-width: 150px; margin-right: auto; }
body.cwb-v47-surface .ai-inline-copy strong { color: #1d4f91; font-size: 13px; }
body.cwb-v47-surface .ai-inline-copy .tiny { font-size: 11px; }
body.cwb-v47-surface .ai-inline-state { color: #748198; }
body.cwb-v47-surface .ai-inline-binding { color: #8a97a8; }
body.cwb-v47-surface .ai-provider-readiness.is-blocked { padding: 0; border: 0; background: transparent; }
body.cwb-v47-surface .ai-provider-readiness.is-blocked .btn { min-height: 30px; }
body.cwb-v47-surface .ai-inline-bar > .inp { width: 170px; }
body.cwb-v47-surface .v47-context {
  top: 84px;
  max-height: calc(100vh - 104px);
  padding: 0 15px 15px;
  border: 1px solid #dfe5ed;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 5px 18px rgba(15, 23, 42, .06);
}
body.cwb-v47-surface .v47-context-head { min-height: 52px; padding: 0; border-bottom-color: #edf0f4; }
body.cwb-v47-surface .v47-context-head strong { font-size: 15px; }
body.cwb-v47-surface .v47-context-block { padding: 13px 0; }
body.cwb-v47-surface .v47-context-number { font-size: 26px; color: #175dbb; }
body.cwb-v47-surface .v47-context-person { display: grid; gap: 4px; padding: 9px 10px; border: 1px solid #e1e8f1; border-radius: 7px; background: #f7f9fc; }
body.cwb-v47-surface .v47-context-person-name { color: #1d4f91; font-size: 16px; font-weight: 700; }
body.cwb-v47-surface .v47-context-person-empty { background: #fafbfc; }
body.cwb-v47-surface .v47-context-person + .btn { justify-self: start; margin-top: 7px; }
body.cwb-v47-surface .v47-context-list button { border-radius: 6px; background: #f5f8fc; padding: 9px; }
body.cwb-v47-surface .v47-context-actions { gap: 6px; }
body.cwb-v47-surface .v47-context-note { padding-top: 2px; }
body.cwb-v47-surface .v47-stat-strip { gap: 8px; margin-bottom: 16px; }
body.cwb-v47-surface .v47-stat {
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  padding: 13px 12px 12px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, .025);
  transition: border-color .16s ease, background .16s ease, transform .16s ease;
}
body.cwb-v47-surface .v47-stat::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: #cfe0f7; }
body.cwb-v47-surface .v47-stat:nth-child(2)::before { background: #b9d8ca; }
body.cwb-v47-surface .v47-stat:nth-child(3)::before { background: #efd29a; }
body.cwb-v47-surface .v47-stat:nth-child(4)::before { background: #e9b6b6; }
body.cwb-v47-surface .v47-stat:hover { transform: translateY(-1px); }
body.cwb-v47-surface .v47-stat strong { font-size: 22px; }
body.cwb-v47-surface .v47-filter-bar {
  margin-bottom: 13px;
  padding: 11px 12px;
  border: 1px solid #e1e8f1;
  border-radius: 8px;
  background: #fbfcfe;
}
body.cwb-v47-surface .v47-page-view > .card { box-shadow: 0 1px 2px rgba(15, 23, 42, .025); }
body.cwb-v47-surface .v47-page-view > .card .card-hd { background: #fbfcfe; }
body.cwb-v47-surface .v47-page-view .v47-two-col > .card { height: 100%; }
body.cwb-v47-surface .v47-today-schedules {
  padding: 14px;
  border: 1px solid #e1e8f1;
  border-radius: 8px;
  background: #fbfdff;
}
body.cwb-v47-surface .v47-today-schedules .v47-section-title { margin-bottom: 2px; }
body.cwb-v47-surface .v47-two-col,
body.cwb-v47-surface .v47-notice-grid { gap: 16px; }
body.cwb-v47-surface .v47-list-row { border-color: #e4e9ef; border-radius: 7px; background: #fff; }
body.cwb-v47-surface .v47-result { border-radius: 7px; }
body.cwb-v47-surface .student-ledger-header { align-items: flex-start; }
body.cwb-v47-surface .student-ledger-toolbar {
  display: block;
  padding: 14px 18px 12px;
  border-top: 1px solid #f0f2f5;
  border-bottom: 1px solid #eef1f5;
}
body.cwb-v47-surface .student-filter-primary {
  display: grid;
  grid-template-columns: minmax(180px, 1.35fr) minmax(120px, .8fr) minmax(130px, .8fr) auto;
  align-items: center;
  gap: 8px;
}
body.cwb-v47-surface .student-filter-primary .search { min-width: 0; }
body.cwb-v47-surface .student-filter-mode { display: inline-flex; gap: 4px; }
body.cwb-v47-surface .student-filter-mode .btn { min-width: 46px; padding: 0 9px; }
body.cwb-v47-surface .student-filter-primary > [data-student-summary] { grid-column: 1 / -1; margin-left: 0 !important; padding-top: 1px; }
body.cwb-v47-surface .student-filter-advanced {
  margin-top: 11px;
  border-top: 1px solid #edf0f4;
}
body.cwb-v47-surface .student-filter-advanced > summary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 0 4px;
  color: #526783;
  cursor: pointer;
  font-size: 12px;
  font-weight: 650;
  list-style: none;
}
body.cwb-v47-surface .student-filter-advanced > summary::-webkit-details-marker { display: none; }
body.cwb-v47-surface .student-filter-advanced > summary::before { content: '+'; display: inline-grid; place-items: center; width: 16px; height: 16px; border: 1px solid #b8c6d8; border-radius: 4px; font-size: 14px; line-height: 1; }
body.cwb-v47-surface .student-filter-advanced[open] > summary::before { content: '−'; }
body.cwb-v47-surface .student-filter-advanced-body { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 0 2px; }
body.cwb-v47-surface .student-filter-advanced-body .inp { width: auto !important; min-width: 132px; }
body.cwb-v47-surface .student-filter-help { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px 18px; border-bottom: 1px solid #eef1f5; color: #748198; font-size: 12px; }
body.cwb-v47-surface .student-filter-help-copy { min-width: 0; line-height: 1.55; }
body.cwb-v47-surface .student-filter-help strong { color: #526783; }
body.cwb-v47-surface .student-view-tools { display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex-wrap: wrap; min-width: 0; }
body.cwb-v47-surface .student-view-tools label { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
body.cwb-v47-surface .student-view-tools .inp { min-height: 30px; }
body.cwb-v47-surface .mcard { border: 1px solid #e0e6ee; border-radius: 8px; box-shadow: none; background: #fff; }
body.cwb-v47-surface .mcard:hover { border-color: #b9cbe3; box-shadow: 0 4px 14px rgba(15, 23, 42, .06); }
body.cwb-v47-surface .mcard-hd { padding-bottom: 9px; }
body.cwb-v47-surface .student-dynamic-table { border: 0; }
  body.cwb-v47-surface .student-dynamic-table table { min-width: 920px; }
  body.cwb-v47-surface .student-action-col { width: 120px; }
  body.cwb-v47-surface .student-dynamic-table { border-radius: 0; }
  body.cwb-v47-surface .student-filter-help { background: #fbfcfe; }
  body.cwb-v47-surface .mcard { padding: 14px 16px; }
  body.cwb-v47-surface .mcard-acts { gap: 6px; }
  body.cwb-v47-surface .home-workflow-legacy,
  body.cwb-v47-surface .today,
  body.cwb-v47-surface .kpis,
  body.cwb-v47-surface .home-command-center ~ .home-workflow-legacy { display: none; }
  body.cwb-v47-surface .v47-today-schedules { padding: 14px 0 4px; border-bottom: 1px solid #edf0f4; }
  body.cwb-v47-surface .v47-schedule-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 7px; background: #fff; margin-top: 7px; }
  body.cwb-v47-surface .v47-schedule-row > div:first-child { flex: 1; min-width: 0; }
  body.cwb-v47-surface .v47-schedule-empty { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: #748198; padding: 11px 0; }
  body.cwb-v47-surface .v47-notice-edit-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  body.cwb-v47-surface .v47-notice-edit-grid .form-row { display: grid; gap: 5px; }
  body.cwb-v47-surface .v47-notice-edit-wide { grid-column: 1 / -1; }
  body.cwb-v47-surface .v47-notice-meta { display: block; margin: -4px 0 12px; }
body.cwb-v47-surface .home-command-center { display: grid; gap: 12px; margin-bottom: 14px; }
body.cwb-v47-surface .onboarding {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.4fr) minmax(128px, .55fr);
  gap: 10px;
  align-items: start;
  padding: 15px 17px;
  border: 1px solid #dfe6ee;
  border-radius: 8px;
  background: #fff;
  box-shadow: none;
}
body.cwb-v47-surface .onboarding-copy,
body.cwb-v47-surface .onboarding-steps,
body.cwb-v47-surface .onboarding-actions { min-width: 0; }
body.cwb-v47-surface .onboarding-copy h2 { margin: 3px 0 4px; font-size: 18px; line-height: 1.35; }
body.cwb-v47-surface .onboarding-copy p { max-width: 680px; margin: 0; color: #718096; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
body.cwb-v47-surface .onboarding-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; align-content: center; color: #61738d; font-size: 12px; white-space: normal; }
body.cwb-v47-surface .onboarding-step { min-width: 0; overflow: hidden; }
body.cwb-v47-surface .onboarding-step strong,
body.cwb-v47-surface .onboarding-step small,
body.cwb-v47-surface .onboarding-step-action { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
body.cwb-v47-surface .onboarding-step-action { line-height: 1.35; text-align: left; white-space: normal; }
body.cwb-v47-surface .onboarding-actions { display: flex; flex-wrap: wrap; gap: 7px; justify-content: flex-end; align-content: center; max-width: 100%; }
body.cwb-v47-surface .onboarding-actions .btn { white-space: normal; overflow-wrap: anywhere; }
body.cwb-v47-surface .home-hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 20px; border: 1px solid #dfe6ee; border-radius: 8px; background: #fff; box-shadow: none; }
body.cwb-v47-surface .home-hero-copy { display: flex; align-items: center; gap: 13px; min-width: 0; }
body.cwb-v47-surface .home-hero-mark { display: grid; place-items: center; width: 38px; height: 38px; flex: 0 0 auto; border: 1px solid #cfe0f7; border-radius: 9px; background: #eef5ff; color: #2d6dcc; }
body.cwb-v47-surface .home-hero-mark .ic { width: 21px; height: 21px; }
body.cwb-v47-surface .home-hero .eyebrow { color: #53729d; font-size: 12px; font-weight: 650; }
body.cwb-v47-surface .home-hero h1 { margin: 4px 0 3px; font-size: 23px; line-height: 1.3; color: #172033; }
body.cwb-v47-surface .home-hero p { margin: 0; color: #748198; font-size: 13px; }
body.cwb-v47-surface .home-hero-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
body.cwb-v47-surface .home-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
body.cwb-v47-surface .home-summary { scrollbar-width: none; }
body.cwb-v47-surface .home-summary::-webkit-scrollbar { display: none; }
body.cwb-v47-surface .home-summary-item { display: grid; gap: 4px; min-width: 0; padding: 11px 12px; border: 1px solid #e0e6ee; border-radius: 8px; background: #fff; text-align: left; }
body.cwb-v47-surface .home-summary-item:hover { border-color: #a9c5e7; background: #f8fbff; }
body.cwb-v47-surface .home-summary-item span { color: #718096; font-size: 12px; }
body.cwb-v47-surface .home-summary-item strong { color: #172033; font-size: 22px; line-height: 1.1; }
body.cwb-v47-surface .home-summary-item { position: relative; overflow: hidden; }
body.cwb-v47-surface .home-summary-item::before { content: ''; position: absolute; inset: 0 0 auto; height: 3px; background: #cfe0f7; }
body.cwb-v47-surface .home-summary-item:nth-child(2)::before { background: #b9d8ca; }
body.cwb-v47-surface .home-summary-item:nth-child(3)::before { background: #efd29a; }
body.cwb-v47-surface .home-summary-item:nth-child(4)::before { background: #d6c9f0; }
body.cwb-v47-surface .home-summary-item:nth-child(5)::before { background: #bcd8e8; }
body.cwb-v47-surface .home-summary-item.is-danger strong { color: #c33d3a; }
body.cwb-v47-surface .home-summary-item.is-warn strong { color: #ad7410; }
body.cwb-v47-surface .home-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(260px, .65fr); gap: 16px; }
body.cwb-v47-surface .home-panel { min-width: 0; border: 1px solid #dfe6ee; border-radius: 8px; background: #fff; }
body.cwb-v47-surface .home-panel-head { display: flex; align-items: center; gap: 9px; min-height: 50px; padding: 13px 17px; border-bottom: 1px solid #edf0f4; }
body.cwb-v47-surface .home-panel-head h2 { margin: 0; font-size: 16px; }
body.cwb-v47-surface .home-panel-head .tiny { margin-left: auto; }
body.cwb-v47-surface .home-todo-list { padding: 2px 0; }
body.cwb-v47-surface .home-todo-list .todo-row { padding: 12px 16px; }
body.cwb-v47-surface .home-todo-list .todo-t { font-size: 14px; }
body.cwb-v47-surface .home-todo-list .todo-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
body.cwb-v47-surface .home-rail { display: grid; gap: 10px; padding: 13px 15px 15px; }
body.cwb-v47-surface .home-rail-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #edf0f4; }
body.cwb-v47-surface .home-rail-row:last-child { border-bottom: 0; }
body.cwb-v47-surface .home-rail-row strong { display: block; color: #24344c; font-size: 13px; }
body.cwb-v47-surface .home-rail-row .tiny { display: block; margin-top: 2px; }
body.cwb-v47-surface .home-rail-number { min-width: 30px; color: #175dbb; font-size: 22px; font-weight: 700; text-align: center; }
body.cwb-v47-surface .home-rail-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; padding-top: 4px; }
body.cwb-v47-surface .home-rail-actions .btn:last-child { grid-column: 1 / -1; }
body.cwb-v47-surface .home-more { padding: 9px 16px 12px; text-align: right; }
body.cwb-v47-surface .home-system-strip {
  display: grid;
  gap: 9px;
  padding: 10px 12px 11px;
  border: 1px solid #dfe6ee;
  border-radius: 8px;
  background: #fbfcfe;
}
body.cwb-v47-surface .home-system-title { display: flex; align-items: center; gap: 7px; color: #526783; font-size: 12px; }
body.cwb-v47-surface .home-system-title .tiny { margin-left: 2px; }
body.cwb-v47-surface .home-system-dot { width: 7px; height: 7px; border-radius: 50%; background: #37a274; box-shadow: 0 0 0 3px #e3f4eb; }
body.cwb-v47-surface .home-system-dot.is-warn { background: #d59121; box-shadow: 0 0 0 3px #fff1d6; }
body.cwb-v47-surface .home-system-items { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
body.cwb-v47-surface .home-system-item { display: grid; grid-template-columns: auto 1fr; gap: 1px 8px; min-width: 0; padding: 8px 10px; border: 1px solid #e3e9f0; border-radius: 6px; background: #fff; text-align: left; }
body.cwb-v47-surface .home-system-item:hover { border-color: #b9cbe3; background: #f7faff; }
body.cwb-v47-surface .home-system-item span { grid-column: 1 / -1; color: #6d7c91; font-size: 11px; }
body.cwb-v47-surface .home-system-item strong { color: #24344c; font-size: 13px; }
body.cwb-v47-surface .home-system-item strong.is-ok { color: #277b58; }
body.cwb-v47-surface .home-system-item strong.is-warn { color: #a56d11; }
body.cwb-v47-surface .home-system-item small { min-width: 0; overflow: hidden; color: #8995a5; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
body.cwb-v47-surface .home-system-details { margin-top: 1px; border-top: 1px solid #e7edf3; }
body.cwb-v47-surface .home-system-details > summary { display: flex; align-items: center; gap: 8px; padding: 10px 2px 1px; color: #526783; cursor: pointer; list-style: none; user-select: none; }
body.cwb-v47-surface .home-system-details > summary::-webkit-details-marker { display: none; }
body.cwb-v47-surface .home-system-details > summary::before { content: '+'; display: inline-grid; place-items: center; width: 17px; height: 17px; border: 1px solid #b8c6d8; border-radius: 4px; color: #5b7393; font-size: 14px; line-height: 1; }
body.cwb-v47-surface .home-system-details[open] > summary::before { content: '−'; }
body.cwb-v47-surface .home-system-details > summary span:first-child { color: #2d6dcc; font-size: 12px; font-weight: 650; }
body.cwb-v47-surface .home-system-detail-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding-top: 10px; }
body.cwb-v47-surface .home-system-detail { display: grid; align-content: start; gap: 5px; min-width: 0; padding: 10px 11px; border: 1px solid #e3e9f0; border-radius: 6px; background: #fff; }
body.cwb-v47-surface .home-system-detail > span { color: #6d7c91; font-size: 11px; }
body.cwb-v47-surface .home-system-detail > strong { min-width: 0; overflow-wrap: anywhere; color: #24344c; font-size: 13px; line-height: 1.4; }
body.cwb-v47-surface .home-system-detail > small { min-height: 34px; color: #8995a5; font-size: 11px; line-height: 1.5; }
body.cwb-v47-surface .home-system-detail .btn { justify-self: start; margin-top: 2px; }
body.cwb-v47-surface .home-system-detail-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 2px; }
body.cwb-v47-surface .home-analytics { margin-top: 2px; border-top: 1px solid #dfe6ee; }
body.cwb-v47-surface .home-analytics > summary { display: flex; align-items: center; gap: 9px; padding: 14px 2px 12px; color: #526783; cursor: pointer; list-style: none; user-select: none; }
body.cwb-v47-surface .home-analytics > summary::-webkit-details-marker { display: none; }
body.cwb-v47-surface .home-analytics > summary::before { content: '+'; display: inline-grid; place-items: center; width: 18px; height: 18px; border: 1px solid #b8c6d8; border-radius: 4px; color: #5b7393; font-size: 15px; line-height: 1; }
body.cwb-v47-surface .home-analytics[open] > summary::before { content: '−'; }
body.cwb-v47-surface .home-analytics-title { display: inline-flex; align-items: center; gap: 6px; color: #24344c; font-size: 14px; font-weight: 700; }
body.cwb-v47-surface .home-analytics-title .ic { width: 16px; height: 16px; color: #2d6dcc; }
body.cwb-v47-surface .home-analytics-toggle { color: #2d6dcc; font-size: 12px; font-weight: 650; }
body.cwb-v47-surface .home-analytics-body { display: grid; gap: 16px; padding-bottom: 16px; }
body.cwb-v47-surface .home-analytics-body > .card { margin-bottom: 0; }
body.cwb-v47-surface .home-analytics .v4-stat.kpi { padding: 13px 12px; border: 1px solid #e0e6ee; border-top: 1px solid #cfe0f7; border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, .025); }
body.cwb-v47-surface .home-analytics .v4-stat.kpi::after { display: none; }
body.cwb-v47-surface .home-analytics .v4-stat.kpi b { font-size: 22px; margin-top: 3px; }
body.cwb-v47-surface .home-analytics-columns { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr); gap: 16px; }
body.cwb-v47-surface .home-analytics-columns > .card { height: 100%; margin-bottom: 0; }
body.cwb-v47-surface .home-command-center ~ .home-workflow-legacy,
body.cwb-v47-surface .home-command-center ~ .today,
body.cwb-v47-surface .home-command-center ~ .kpis { display: none; }
body.cwb-v47-surface .kpis { gap: 8px; }
body.cwb-v47-surface .kpi { border-radius: 8px; box-shadow: none; }
body.cwb-v47-surface .today { box-shadow: none; }
body.cwb-v47-surface .today-hd { padding: 13px 17px; }
body.cwb-v47-surface .todo-row { padding: 12px 16px; }
body.cwb-v47-surface .scrim { background: rgba(15, 23, 42, .28); }
@media (max-width: 1279px) {
  body.cwb-v47-surface .layout.cwb-v47-layout { display: block; padding-right: 0; }
  body.cwb-v47-surface .main { padding-right: 24px; }
  body.cwb-v47-surface .v47-context { top: 80px; }
}
@media (min-width: 901px) and (max-width: 1350px) {
  body.cwb-v47-surface .topbar { padding-left: 14px; padding-right: 14px; gap: 8px; }
  body.cwb-v47-surface .topbar-search-wrap { flex-basis: 180px; max-width: 240px; }
  body.cwb-v47-surface .who { display: none; }
  body.cwb-v47-surface .topbar-acts { gap: 5px; }
  body.cwb-v47-surface .topbar-acts #btn-export,
  body.cwb-v47-surface .topbar-acts #btn-import { min-width: 36px; padding-left: 8px; padding-right: 8px; }
  body.cwb-v47-surface .topbar-acts #btn-export span,
  body.cwb-v47-surface .topbar-acts #btn-import span { display: none; }
}
@media (min-width: 1280px) and (max-width: 1350px) {
  :root { --nav-w: 224px; }
  body.cwb-v47-surface .layout.cwb-v47-layout { grid-template-columns: minmax(0, 1fr) 264px; gap: 14px; padding-right: 16px; }
  body.cwb-v47-surface .main { padding-left: 22px; padding-right: 22px; }
  body.cwb-v47-surface .v47-context { padding-left: 13px; padding-right: 13px; }
  body.cwb-v47-surface .tw { overflow-x: auto; }
  body.cwb-v47-surface .tw table { min-width: 780px; }
}
@media (max-width: 1100px) {
  body.cwb-v47-surface .onboarding { grid-template-columns: 1fr; }
  body.cwb-v47-surface .onboarding-actions { justify-content: flex-start; }
}
@media (max-width: 1280px) {
  body.cwb-v47-surface .onboarding { grid-template-columns: 1fr; }
  body.cwb-v47-surface .onboarding-actions { justify-content: flex-start; }
}
@media (max-width: 900px) {
  :root { --nav-w: 0px; }
  body.cwb-v47-surface .layout.cwb-v47-layout { padding-left: 0; }
  body.cwb-v47-surface .sidenav { top: 0; }
  body.cwb-v47-surface .topbar { height: 56px; padding: 0 12px; gap: 8px; }
  body.cwb-v47-surface .topbar-sp { display: none; }
  body.cwb-v47-surface .brand { flex: 1 1 auto; min-width: 0; overflow: hidden; }
  body.cwb-v47-surface .brand > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  body.cwb-v47-surface .topbar-search-wrap { order: 3; flex-basis: 100%; max-width: none; position: absolute; left: 12px; right: 12px; top: 62px; display: none; }
  body.cwb-v47-surface .topbar-search-wrap:focus-within { display: block; }
  body.cwb-v47-surface .brand { font-size: 14px; }
  body.cwb-v47-surface .brand-sub { display: none; }
  body.cwb-v47-surface .main { padding: 16px 12px 76px; }
  body.cwb-v47-surface .btn { min-height: 44px; }
  body.cwb-v47-surface .btn-sm { min-height: 38px; }
  body.cwb-v47-surface .topbar .btn,
  body.cwb-v47-surface .topbar .btn-sm,
  body.cwb-v47-surface .topbar .btn-icon { min-height: 36px; }
  body.cwb-v47-surface .ai-inline-bar { align-items: stretch; flex-wrap: wrap; padding: 9px; }
  body.cwb-v47-surface .ai-inline-copy { flex: 1 1 100%; }
  body.cwb-v47-surface .ai-inline-bar > .inp { flex: 1 1 100%; width: 100%; }
  body.cwb-v47-surface .ai-inline-bar > .btn { flex: 1 1 auto; min-width: 0; }
  body.cwb-v47-surface .ai-inline-bar.is-blocked > .ai-inline-context { flex: 1 1 auto; }
  body.cwb-v47-surface .banner { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 8px 9px; }
  body.cwb-v47-surface .banner .sp { min-width: 0; grid-column: 2; line-height: 1.58; }
  body.cwb-v47-surface .banner > .btn { grid-column: 2; justify-self: start; max-width: 100%; }
  body.cwb-v47-surface .home-hero { align-items: flex-start; flex-direction: column; padding: 18px; }
  body.cwb-v47-surface .home-hero-actions { width: 100%; justify-content: flex-start; }
  body.cwb-v47-surface .v47-page-view .v4-head { display: block; min-height: 0; padding-bottom: 13px; }
  body.cwb-v47-surface .v47-page-view .v4-actions { margin-top: 12px; padding-top: 0; }
  body.cwb-v47-surface .onboarding { grid-template-columns: 1fr; }
  body.cwb-v47-surface .onboarding-steps { grid-template-columns: 1fr; white-space: normal; }
  body.cwb-v47-surface .onboarding-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; justify-content: stretch; max-width: none; }
  body.cwb-v47-surface .onboarding-actions .btn { width: 100%; min-width: 0; min-height: 40px; flex: none; white-space: normal; overflow-wrap: anywhere; }
  body.cwb-v47-surface .onboarding-actions .btn:last-child { grid-column: 1 / -1; }
  body.cwb-v47-surface .v47-notice-edit-grid { grid-template-columns: 1fr; }
  body.cwb-v47-surface .v47-notice-edit-wide { grid-column: auto; }
  body.cwb-v47-surface .v47-schedule-row { align-items: flex-start; flex-wrap: wrap; }
  body.cwb-v47-surface .v47-schedule-row > .tag { margin-left: auto; }
  body.cwb-v47-surface .v47-schedule-row > .btn { margin-left: auto; }
  body.cwb-v47-surface .v47-schedule-empty { align-items: flex-start; flex-direction: column; }
  body.cwb-v47-surface .home-summary { display: flex; overflow-x: auto; gap: 7px; padding-bottom: 2px; }
  body.cwb-v47-surface .home-summary-item { flex: 0 0 118px; padding: 11px; }
  body.cwb-v47-surface .home-summary-item strong { font-size: 22px; }
  body.cwb-v47-surface .home-grid { grid-template-columns: 1fr; }
  body.cwb-v47-surface .home-system-items { grid-template-columns: 1fr 1fr; }
  body.cwb-v47-surface .home-system-item small { white-space: normal; }
  body.cwb-v47-surface .home-system-detail-grid { grid-template-columns: 1fr 1fr; }
  body.cwb-v47-surface .home-analytics-columns { grid-template-columns: 1fr; }
  body.cwb-v47-surface .student-filter-primary { grid-template-columns: 1fr 1fr; }
  body.cwb-v47-surface .student-filter-primary .search { grid-column: 1 / -1; }
  body.cwb-v47-surface .student-filter-mode { grid-column: 1 / -1; }
  body.cwb-v47-surface .student-filter-primary > [data-student-summary] { grid-column: 1 / -1; margin-left: 0 !important; }
  body.cwb-v47-surface .student-filter-help { grid-template-columns: 1fr; align-items: flex-start; padding: 9px 14px; }
  body.cwb-v47-surface .student-filter-help .sp { display: none; }
  body.cwb-v47-surface .student-view-tools { width: 100%; justify-content: flex-start; }
  body.cwb-v47-surface .v47-stat-strip { gap: 7px; }
  body.cwb-v47-surface .v47-stat { flex-basis: 122px; }
  body.cwb-v47-surface .v47-two-col,
  body.cwb-v47-surface .v47-notice-grid { grid-template-columns: 1fr; }
}
@media (max-width: 380px) {
  body.cwb-v47-surface .topbar-acts [data-act="export-diagnostics"] { display: none; }
  body.cwb-v47-surface .save-status { width: 30px; min-width: 30px; padding: 0; justify-content: center; font-size: 0; }
  body.cwb-v47-surface .save-status::before { content: '✓'; font-size: 12px; font-weight: 700; }
}
@media (prefers-reduced-motion: reduce) {
  body.cwb-v47-surface *, body.cwb-v47-surface *::before, body.cwb-v47-surface *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
}
html[data-theme="dark"] body.cwb-v47-surface { background: #171a1f !important; color: #e8edf2; }
html[data-theme="dark"] body.cwb-v47-surface .home-hero,
html[data-theme="dark"] body.cwb-v47-surface .home-panel,
html[data-theme="dark"] body.cwb-v47-surface .home-summary-item,
html[data-theme="dark"] body.cwb-v47-surface .card,
html[data-theme="dark"] body.cwb-v47-surface .today,
html[data-theme="dark"] body.cwb-v47-surface .v47-context { background: #20242a; border-color: #363e48; }
html[data-theme="dark"] body.cwb-v47-surface .home-hero h1,
html[data-theme="dark"] body.cwb-v47-surface .home-summary-item strong,
html[data-theme="dark"] body.cwb-v47-surface .home-panel-head h2 { color: #edf1f5; }
html[data-theme="dark"] body.cwb-v47-surface .home-summary-item span,
html[data-theme="dark"] body.cwb-v47-surface .home-hero p { color: #9aa6b3; }
html[data-theme="dark"] body.cwb-v47-surface .home-system-strip,
html[data-theme="dark"] body.cwb-v47-surface .home-system-item { background: #252a31; border-color: #3a434e; }
html[data-theme="dark"] body.cwb-v47-surface .home-system-detail { background: #252a31; border-color: #3a434e; }
html[data-theme="dark"] body.cwb-v47-surface .home-system-item strong,
html[data-theme="dark"] body.cwb-v47-surface .home-analytics-title { color: #edf1f5; }
`;
    document.head.appendChild(style);
  }

  VIEWS['class-checks'] = viewClassChecks; VIEWS['roll-call'] = viewRollCall; VIEWS['dorm-inspections'] = viewDormInspections; VIEWS.assessment = viewAssessment; VIEWS.toolbox = viewToolbox; VIEWS['employment-safety'] = viewSafety; VIEWS.competitions = viewCompetitions; VIEWS['academic-analysis'] = viewAcademic; VIEWS['notice-ai'] = viewNotice;
  VIEWS['class-checks'] = viewClassChecksFixed;
  if (root.CWB) { root.CWB.v47 = v47; root.CWB.classChecks = v47.classChecks; root.CWB.rollCall = v47.rollCall; root.CWB.dorm = Object.assign({}, root.CWB.dorm || {}, { inspections:v47.dorm.inspections, exceptions:v47.dorm.exceptions }); root.CWB.assessment = v47.assessment; root.CWB.tools = v47.tools; root.CWB.employmentSafety = v47.employment.safety; root.CWB.competitions = v47.competitions; root.CWB.analysis = Object.assign({}, root.CWB.analysis || {}, { academicSummary:v47.academicSummary }); }

  Object.assign(ACTS, {
    'v47-class-new':function () { classCheckForm(null); }, 'v47-class-from-schedule':function (id) { var item = rows('v4_class_schedules').find(function (value) { return String(value.id) === String(id); }); if (!item) return; classCheckForm({ schedule_id:item.id, class_name:item.class_name, course:item.course, weekday:weekdayLabel(item.weekday), start_period:item.start_section, end_period:item.end_section, classroom:item.room, date:today(), status:'已查' }, { isNew:true }); }, 'v47-class-edit':function (id) { classCheckForm(rows('v4_class_checks').find(function (item) { return String(item.id) === String(id); })); }, 'v47-class-delete':function (id) { var item = rows('v4_class_checks').find(function (value) { return String(value.id) === String(id); }); if (!item) return; ui.confirm('删除查课记录', '删除后不会影响课表原始记录；关联的待确认留痕会标记为来源已删除，照片和附件会清理。确定继续吗？', async function () { await removeRowWithAttachmentsAndWait('v4_class_checks', id, item); render(); ui.toast('查课记录已删除', 'ok'); }, true); }, 'v47-class-clear':function () { var s = state(); s.classFrom = ''; s.classTo = ''; s.className = ''; s.classStatus = ''; render(); },
    'v47-roll-all':function () { state().rollClasses = [...new Set((DB.students || []).map(function (item) { return item.class_name; }).filter(Boolean))]; render(); }, 'v47-roll-clear':function () { state().rollClasses = []; render(); }, 'v47-roll-run':function () { var s = state(); s.rollClasses = readRollClasses(); s.rollCount = Number((document.querySelector('[data-v47-roll-count]') || {}).value || 1); s.rollSeed = String((document.querySelector('[data-v47-roll-seed]') || {}).value || ''); try { s.rollResult = v47.rollCall.run({ students:DB.students || [], class_names:s.rollClasses, count:s.rollCount, seed:s.rollSeed }); s.rollSavedId = ''; render(); } catch (error) { ui.toast(error.message || '点名失败', 'err'); } }, 'v47-roll-save':async function () { var s = state(); if (!s.rollResult) return ui.toast('请先生成点名结果', 'warn'); window.__CWB_LAST_SAVE_PROMISE__ = null; var existing = rows('v4_roll_call_sessions').find(function (item) { return String(item.id) === String(s.rollResult.id); }); if (existing && existing.reviewed === true) { s.rollResult = existing; s.rollSavedId = existing.id; save('custom'); await awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__); render(); ui.toast('这次点名结果已经保存，不会重复生成留痕草稿', 'ok', 2400); return; } var saved = upsert('v4_roll_call_sessions', Object.assign({}, s.rollResult, { reviewed:true, note:'点名结果已由辅导员复核' })); persistDraft(saved, 'v4_roll_call_sessions', { title:'课堂随机点名', category:'查课' }); s.rollResult = saved; s.rollSavedId = saved.id; await awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__); ui.toast('点名结果已保存，并生成待确认留痕草稿', 'ok'); render(); }, 'v47-roll-open-screen':function () { var s = state(); if (!s.rollResult) return ui.toast('请先生成点名结果', 'warn'); ui.modal({ title:'点名大屏准备', size:'wide', body:'<div class="v47-screen-result"><div class="tiny">请在投屏前确认教室、班级和隐私环境</div><ol>' + (s.rollResult.selected_student_ids || []).map(function (id) { var item = student(id); return '<li>' + esc(item && item.full_name || id) + '</li>'; }).join('') + '</ol></div>', footer:'<button class="btn" data-close>关闭</button>' }); },
    'v47-dorm-inspection-new':function () { dormInspectionForm(null); }, 'v47-dorm-inspection-edit':function (id) { dormInspectionForm(rows('v4_dorm_inspections').find(function (item) { return String(item.id) === String(id); })); }, 'v47-dorm-inspection-delete':function (id) { var item = rows('v4_dorm_inspections').find(function (value) { return String(value.id) === String(id); }); if (!item) return; ui.confirm('删除查寝记录', '关联的待确认留痕会标记为来源已删除，照片和附件会清理；已有异常记录会保留历史。确定继续吗？', async function () { await removeRowWithAttachmentsAndWait('v4_dorm_inspections', id, item); render(); ui.toast('查寝记录已删除', 'ok'); }, true); }, 'v47-dorm-exception-new':function (id) { dormExceptionForm(null, id); }, 'v47-dorm-exception-edit':function (id) { dormExceptionForm(rows('v4_dorm_exceptions').find(function (item) { return String(item.id) === String(id); })); }, 'v47-dorm-clear':function () { var s = state(); s.dormFrom = ''; s.dormTo = ''; s.exceptionStatus = ''; render(); },
    'v47-assessment-rule-new':function () { assessmentRuleForm(null); }, 'v47-assessment-entry-new':function () { assessmentEntryForm(null); }, 'v47-assessment-edit':function (id) { assessmentEntryForm(rows('v4_assessment_entries').find(function (item) { return String(item.id) === String(id); })); }, 'v47-assessment-delete':function (id) { var item = rows('v4_assessment_entries').find(function (value) { return String(value.id) === String(id); }); if (!item) return; ui.confirm('删除量化积分', '删除后会从当前学期汇总和排名中移除，证据附件会清理。', async function () { await removeRowWithAttachmentsAndWait('v4_assessment_entries', id, item); render(); ui.toast('量化积分已删除', 'ok'); }, true); }, 'v47-assessment-clear':function () { state().assessmentTerm = ''; render(); }, 'v47-assessment-student':function (id) { var item = student(id); if (item && runtime.openStudent) runtime.openStudent(item); else go('students'); }, 'v47-assessment-import':function () { var input = document.createElement('input'); input.type = 'file'; input.accept = '.csv,.xlsx,.xls,text/csv'; input.onchange = async function () { var file = input.files && input.files[0]; if (!file || typeof runtime.readFeedbackRows !== 'function') return; var run = async function () { try { window.__CWB_LAST_SAVE_PROMISE__ = null; var incoming = await runtime.readFeedbackRows(file, { student_id:['学生ID','student_id'], student_number:['学号'], student_name:['姓名'], class_name:['班级'], term:['学期'], dimension:['维度','评价维度'], score:['分值','积分'], direction:['方向'], source:['来源'], note:['说明','备注'] }); var added = 0; var skipped = 0; incoming.forEach(function (item) { var candidate = normalize('v4_assessment_entries', item); if (rows('v4_assessment_entries').some(function (existing) { return assessmentEntryKey(existing) === assessmentEntryKey(candidate); })) { skipped += 1; return; } upsert('v4_assessment_entries', candidate); added += 1; }); if (incoming.length) { save('custom'); await awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__); } render(); ui.toast('量化积分导入完成：新增 ' + added + ' 行，跳过重复 ' + skipped + ' 行', 'ok'); } catch (error) { ui.toast('导入失败：' + (error.message || '格式不正确'), 'err', 5200, { label:'重试', onClick:run }); } }; await run(); }; input.click(); },
    'v47-tool-new':function () { toolLinkForm(null); }, 'v47-tool-edit':function (id) { toolLinkForm(rows('v4_tool_links').find(function (item) { return String(item.id) === String(id); })); }, 'v47-tool-delete':function (id) { ui.confirm('删除工具链接', '确定删除这条本地工具入口吗？', async function () { await removeRowAndWait('v4_tool_links', id); render(); ui.toast('工具链接已删除', 'ok'); }, true); }, 'v47-tool-clear':function () { var s = state(); s.toolQuery = ''; s.toolCategory = ''; render(); },
    'v47-safety-new':function () { safetyForm(null); }, 'v47-safety-edit':function (id) { safetyForm(rows('v4_employment_safety').find(function (item) { return String(item.id) === String(id); })); }, 'v47-safety-delete':function (id) { ui.confirm('删除风险提示', '确定删除这条本地就业风险提示吗？', async function () { await removeRowAndWait('v4_employment_safety', id); render(); ui.toast('风险提示已删除', 'ok'); }, true); }, 'v47-safety-clear':function () { state().safetyLevel = ''; render(); },
    'v47-competition-new':function () { competitionResourceForm(null); }, 'v47-competition-edit':function (id) { competitionResourceForm(rows('v4_competition_resources').find(function (item) { return String(item.id) === String(id); })); }, 'v47-competition-delete':function (id) { ui.confirm('删除竞赛资源', '已有报名记录会保留，但会显示为未关联资源。确定继续吗？', async function () { await removeRowAndWait('v4_competition_resources', id); render(); ui.toast('竞赛资源已删除', 'ok'); }, true); }, 'v47-competition-entry-new':function () { competitionEntryForm(null); }, 'v47-competition-entry-edit':function (id) { competitionEntryForm(rows('v4_competition_entries').find(function (item) { return String(item.id) === String(id); })); }, 'v47-competition-entry-delete':function (id) { var item = rows('v4_competition_entries').find(function (value) { return String(value.id) === String(id); }); if (!item) return; ui.confirm('删除竞赛报名', '关联的学生报名事实和材料附件会被删除，确定继续吗？', async function () { await removeRowWithAttachmentsAndWait('v4_competition_entries', id, item); render(); ui.toast('竞赛报名已删除', 'ok'); }, true); }, 'v47-competition-clear':function () { state().competitionCategory = ''; render(); },
     'v47-academic-clear':function () { state().academicTerm = ''; render(); }, 'v47-open-notice':function () { if (typeof root.openNoticeCapture === 'function') root.openNoticeCapture(); else go('notice-ai'); }, 'v47-notice-file':function () { var input = document.querySelector('[data-v47-notice-file]'); if (input) { input.onchange = async function () { var file = input.files && input.files[0]; if (!file) return; var run = async function () { try { state().noticeRaw = await file.text(); state().noticeConfirmed = false; state().noticeConfirmedTarget = ''; if (typeof persistUiState === 'function') persistUiState(); render(); } catch (error) { ui.toast('通知文件读取失败：' + (error.message || '请重试'), 'err', 5200, { label:'重试', onClick:run }); } }; await run(); }; input.click(); } }, 'v47-notice-preview':function () { var input = noticeText(); if (!input.trim()) return ui.toast('请先粘贴通知原文', 'warn'); state().noticeRaw = input; state().noticeConfirmed = false; state().noticeConfirmedTarget = ''; try { state().noticeResult = root.CWB.ai.notice.preview({ text:input, source:(document.querySelector('[data-v47-notice-source]') || {}).value || '', received_at:(document.querySelector('[data-v47-notice-received]') || {}).value || '' }); render(); } catch (error) { ui.toast(error.message || '通知预览失败', 'err', 5200, { label:'重试', onClick:function () { ACTS['v47-notice-preview'](); } }); } }, 'v47-notice-ai':async function () { var run = async function () { var input = noticeText(); if (!input.trim()) return ui.toast('请先粘贴通知原文', 'warn'); var button = document.querySelector('[data-act="v47-notice-ai"]'); if (button) button.disabled = true; try { window.__CWB_LAST_SAVE_PROMISE__ = null; state().noticeRaw = input; state().noticeConfirmed = false; state().noticeConfirmedTarget = ''; state().noticeResult = await root.CWB.ai.notice.parse({ text:input, source:(document.querySelector('[data-v47-notice-source]') || {}).value || '', received_at:(document.querySelector('[data-v47-notice-received]') || {}).value || '' }); await awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__); render(); ui.toast('AI 重点已生成，请人工核对', 'ok'); } catch (error) { ui.toast((root.aiRequestErrorLabel && root.aiRequestErrorLabel(error)) || error.message || 'AI 识别失败', 'err', 5200, { label:'重试', onClick:run }); } finally { if (button && button.isConnected) button.disabled = false; } }; await run(); }, 'v47-notice-confirm':function () { syncNoticeEditor(); return noticeConfirm(''); }, 'v47-notice-task':function () { syncNoticeEditor(); return noticeConfirm('task'); }, 'v47-notice-worklog':function () { syncNoticeEditor(); return noticeConfirm('worklog'); }, 'v47-context-toggle':function () { var panel = document.querySelector('#cwb-v47-context'); if (panel) panel.classList.toggle('is-collapsed'); },
  });
  /* Local notice preview now records its audit before returning. Keep this
     page action asynchronous so the result pane never renders a Promise or
     lets confirmation race the source save. */
  ACTS['v47-notice-preview'] = async function () {
    var run = async function () {
      var input = noticeText();
      if (!input.trim()) return ui.toast('请先粘贴通知原文', 'warn');
      var button = document.querySelector('[data-act="v47-notice-preview"]');
      if (button) button.disabled = true;
      try {
        window.__CWB_LAST_SAVE_PROMISE__ = null;
        var current = state();
        current.noticeRaw = input;
        current.noticeConfirmed = false;
        current.noticeConfirmedTarget = '';
        current.noticeResult = await root.CWB.ai.notice.preview({
          text:input,
          source:(document.querySelector('[data-v47-notice-source]') || {}).value || '',
          received_at:(document.querySelector('[data-v47-notice-received]') || {}).value || '',
        });
        await awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__);
        render();
      } catch (error) {
        ui.toast(error.message || '通知预览失败', 'err', 5200, { label:'重试', onClick:run });
      } finally {
        if (button && button.isConnected) button.disabled = false;
      }
    };
    await run();
  };
  ACTS['v47-context-toggle'] = function (id, button) {
    var s = state(); var narrow = contextIsNarrow(); var visible = narrow ? s.contextOpen === true : s.contextCollapsed !== true;
    if (!visible && button && button.classList && button.classList.contains('v47-context-toggle')) contextReturnFocus = button;
    if (narrow) s.contextOpen = !s.contextOpen; else s.contextCollapsed = !s.contextCollapsed;
    persistContextState(); applyContextState(document.querySelector('#cwb-v47-context'));
    var nextVisible = narrow ? s.contextOpen === true : s.contextCollapsed !== true;
    if (nextVisible) { focusContextPanel(); setTimeout(focusContextPanel, 0); } else restoreContextFocus();
  };
  ACTS['v47-context-clear-student'] = function () {
    var v4 = app.v4 || (app.v4 = {});
    v4.aiStudentId = '';
    v4.aiClassName = '';
    v4.aiTargetRecordId = '';
    v4.aiTargetView = '';
    state().aiStudentId = '';
    document.querySelectorAll('[data-ai-student]').forEach(function (element) { element.value = ''; });
    if (typeof persistUiState === 'function') persistUiState();
    refreshContext();
    ui.toast('已清除当前学生上下文，后续新建记录不会自动关联', 'ok', 2600);
  };
  /* Keep destructive actions on the same awaited save path as form submits.
     The registry above is intentionally compact, so these overrides make the
     failure/retry behavior explicit without duplicating the whole registry. */
  function installTransactionalDeleteActions() {
    ACTS['v47-assessment-import'] = function () {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = '.csv,.xlsx,.xls,text/csv';
      input.onchange = async function () {
        var file = input.files && input.files[0];
        if (!file || typeof runtime.readFeedbackRows !== 'function') return;
        var run = async function () {
          var previous = snapshotCustomCollections(['v4_assessment_entries']);
          try {
            var incoming = await runtime.readFeedbackRows(file, { id:['id','记录编号'], student_id:['学生ID','student_id'], student_number:['学号'], student_name:['姓名'], class_name:['班级'], term:['学期'], dimension:['维度','评价维度'], score:['分值','积分'], direction:['方向'], source:['来源'], note:['说明','备注'] });
            var added = 0; var updated = 0; var unchanged = 0; var skipped = 0; var seen = new Set();
            incoming.forEach(function (item) {
              var reference = importedStudent(item); if (reference.ambiguous || !reference.student) { skipped += 1; return; }
              var student = reference.student; if (!String(item.term || '').trim() || (!Object.prototype.hasOwnProperty.call(item, 'score') && !Object.prototype.hasOwnProperty.call(item, '积分'))) { skipped += 1; return; }
              var sourceId = String(item.id || '').trim();
              var identity = sourceId ? 'id:' + sourceId : 'key:' + assessmentMergeKey({ student_id:student.id, term:item.term, dimension:item.dimension || '其他', direction:item.direction || '加分', source:item.source || '' });
              if (seen.has(identity)) { skipped += 1; return; } seen.add(identity);
              var list = rows('v4_assessment_entries');
              var index = list.findIndex(function (existing) { return sourceId ? String(existing.id) === sourceId : assessmentMergeKey(existing) === identity.slice(4); });
              if (sourceId && index < 0) { skipped += 1; return; }
              if (!sourceId) {
                var matches = list.filter(function (existing) { return assessmentMergeKey(existing) === identity.slice(4); });
                if (matches.length > 1) { skipped += 1; return; }
                index = matches.length === 1 ? list.findIndex(function (existing) { return String(existing.id) === String(matches[0].id); }) : -1;
              }
              var source = mergeNonEmpty(index >= 0 ? list[index] : {}, item);
              source.student_id = String(student.id || student.student_id || ''); source.student_number = String(student.student_number || item.student_number || ''); source.student_name = String(student.full_name || item.student_name || ''); source.class_name = String(student.class_name || item.class_name || '');
              if (index >= 0) { source.id = list[index].id; source.created_at = list[index].created_at; }
              var candidate = normalize('v4_assessment_entries', source); candidate._demo = false;
              if (index >= 0) { if (assessmentEntryKey(list[index]) === assessmentEntryKey(candidate)) unchanged += 1; else { list[index] = candidate; updated += 1; } }
              else { list.push(candidate); added += 1; }
            });
            if (added || updated) await persistCustomChanges();
            render(); ui.toast('量化积分导入完成：新增 ' + added + '，更新 ' + updated + '，未变化 ' + unchanged + '，跳过 ' + skipped, 'ok');
          } catch (error) {
            await restoreCustomState(previous, error);
            ui.toast('导入失败：' + (error.message || '格式不正确'), 'err', 5200, { label:'重试', onClick:function () { run(); } });
          }
        };
        await run();
      };
      input.click();
    };
    ACTS['v47-roll-save'] = async function () {
      var s = state();
      if (!s.rollResult) return ui.toast('请先生成点名结果', 'warn');
      var previous = snapshotCustomCollections(['v4_roll_call_sessions', 'v4_worklog_drafts']);
      var originalResult = s.rollResult;
      var originalSavedId = s.rollSavedId;
      try {
        var existing = rows('v4_roll_call_sessions').find(function (item) { return String(item.id) === String(s.rollResult.id); });
        if (existing && existing.reviewed === true) {
          s.rollResult = existing; s.rollSavedId = existing.id;
          render(); ui.toast('这次点名结果已经保存，不会重复生成留痕草稿', 'ok', 2400);
          return;
        }
        var saved = upsert('v4_roll_call_sessions', Object.assign({}, s.rollResult, { reviewed:true, note:'点名结果已由辅导员复核' }), { persist:false });
        persistDraft(saved, 'v4_roll_call_sessions', { title:'课堂随机点名', category:'查课', persist:false });
        await persistCustomChanges();
        s.rollResult = saved; s.rollSavedId = saved.id;
        ui.toast('点名结果已保存，并生成待确认留痕草稿', 'ok', 2400);
        render();
      } catch (error) {
        s.rollResult = originalResult; s.rollSavedId = originalSavedId;
        await restoreCustomState(previous, error);
        throw error;
      }
    };
    var simple = {
      'v47-tool-delete':['v4_tool_links', '工具链接'],
      'v47-safety-delete':['v4_employment_safety', '风险提示'],
      'v47-competition-delete':['v4_competition_resources', '竞赛资源'],
    };
    Object.keys(simple).forEach(function (action) {
      var pair = simple[action];
      ACTS[action] = function (id) { ui.confirm('删除' + pair[1], '删除后不会影响其他模块的历史记录，确定继续吗？', async function () { await removeRowAndWait(pair[0], id); render(); ui.toast(pair[1] + '已删除', 'ok'); }, true); };
    });
    ACTS['v47-class-delete'] = function (id) {
      var item = rows('v4_class_checks').find(function (value) { return String(value.id) === String(id); }); if (!item) return;
      ui.confirm('删除查课记录', '删除后不会影响课表原始记录；关联的待确认留痕会标记为来源已删除，照片和附件会清理。', async function () { var released = await releaseRecordAttachments('v4_class_checks', item); try { await removeRowAndWait('v4_class_checks', id); } catch (error) { try { await restoreReleasedAttachments(released); } catch (restoreError) { error.attachment_restore_error = String(restoreError && restoreError.message || restoreError); } throw error; } render(); ui.toast('查课记录已删除', 'ok'); }, true);
    };
    ACTS['v47-dorm-inspection-delete'] = function (id) {
      var item = rows('v4_dorm_inspections').find(function (value) { return String(value.id) === String(id); }); if (!item) return;
      ui.confirm('删除查寝记录', '关联的待确认留痕会标记为来源已删除，照片和附件会清理；已有异常记录会保留历史。确定继续吗？', async function () { var released = await releaseRecordAttachments('v4_dorm_inspections', item); try { await removeRowAndWait('v4_dorm_inspections', id); } catch (error) { try { await restoreReleasedAttachments(released); } catch (restoreError) { error.attachment_restore_error = String(restoreError && restoreError.message || restoreError); } throw error; } render(); ui.toast('查寝记录已删除', 'ok'); }, true);
    };
    ACTS['v47-assessment-delete'] = function (id) {
      var item = rows('v4_assessment_entries').find(function (value) { return String(value.id) === String(id); }); if (!item) return;
      ui.confirm('删除量化积分', '删除后会从当前学期汇总和排名中移除，证据附件会清理。', async function () { var released = await releaseRecordAttachments('v4_assessment_entries', item); try { await removeRowAndWait('v4_assessment_entries', id); } catch (error) { try { await restoreReleasedAttachments(released); } catch (restoreError) { error.attachment_restore_error = String(restoreError && restoreError.message || restoreError); } throw error; } render(); ui.toast('量化积分已删除', 'ok'); }, true);
    };
    ACTS['v47-competition-entry-delete'] = function (id) {
      var item = rows('v4_competition_entries').find(function (value) { return String(value.id) === String(id); }); if (!item) return;
      ui.confirm('删除竞赛报名', '关联的学生报名事实和材料附件会被删除，确定继续吗？', async function () { var released = await releaseRecordAttachments('v4_competition_entries', item); try { await removeRowAndWait('v4_competition_entries', id); } catch (error) { try { await restoreReleasedAttachments(released); } catch (restoreError) { error.attachment_restore_error = String(restoreError && restoreError.message || restoreError); } throw error; } render(); ui.toast('竞赛报名已删除', 'ok'); }, true);
    };
  }
  installTransactionalDeleteActions();
  var contextResizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(contextResizeTimer);
    contextResizeTimer = setTimeout(function () {
      applyContextState(document.querySelector('#cwb-v47-context'));
    }, 80);
  }, { passive:true });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var panel = document.querySelector('#cwb-v47-context'); var s = state(); var narrow = contextIsNarrow();
    var visible = narrow ? s.contextOpen === true : s.contextCollapsed !== true;
    if (!panel || !visible) return;
    if (!narrow && document.activeElement && !panel.contains(document.activeElement)) return;
    event.preventDefault();
    if (narrow) s.contextOpen = false; else s.contextCollapsed = true;
    persistContextState(); applyContextState(panel); restoreContextFocus();
  });
  async function noticeConfirm(target) { var s = state(); if (!s.noticeResult) return ui.toast('请先生成通知重点', 'warn'); var run = async function () { window.__CWB_LAST_SAVE_PROMISE__ = null; try { var notice = s.noticeResult.notice || s.noticeResult; var linked = s.noticeResult.suggestion && s.noticeResult.suggestion.id && typeof root.aiSuggestionById === 'function' ? root.aiSuggestionById(s.noticeResult.suggestion.id) : null; if (linked && typeof root.aiReplaceSuggestion === 'function') { linked.payload = Object.assign({}, linked.payload || {}, notice); linked.summary = [notice.title, ...(notice.key_points || []).slice(0, 4), ...(notice.todos || []).slice(0, 3)].filter(Boolean).join('；').slice(0, 800); root.aiReplaceSuggestion(linked, { persist:false }); } var result = root.CWB.ai.notice.confirm(s.noticeResult, { confirmed:true, original_text:s.noticeRaw || '', convertTo:target }); s.noticeResult = result; s.noticeConfirmed = true; s.noticeConfirmedTarget = target || ''; await (root.CWB.ai.awaitMutation ? root.CWB.ai.awaitMutation(result) : awaitTrackedSave(window.__CWB_LAST_SAVE_PROMISE__)); render(); ui.toast(target ? '通知已确认并生成草稿' : '通知建议已保存', 'ok'); } catch (error) { ui.toast(error.message || '通知确认失败', 'err', 5200, { label:'重试', onClick:run }); } }; await run(); }

  document.addEventListener('change', function (event) { var target = event.target && event.target.closest && event.target.closest('[data-v47-filter]'); if (!target) return; state()[target.dataset.v47Filter] = target.value; render(); });
  document.addEventListener('change', function (event) { var target = event.target && event.target.closest && event.target.closest('[data-ai-student]'); if (!target) return; state().aiStudentId = target.value || ''; if (app.v4) app.v4.aiStudentId = target.value || ''; refreshContext(); });
  document.addEventListener('input', function (event) { var target = event.target && event.target.closest && event.target.closest('[data-v47-filter]'); if (!target) return; var s = state(); s[target.dataset.v47Filter] = target.value; clearTimeout(s._filterTimer); s._filterTimer = setTimeout(function () { render(); }, 160); });
  function addNav() { var nav = document.querySelector('#nav-modules'); if (!nav || nav.querySelector('[data-view="class-checks"]')) return; var group = document.createElement('div'); group.className = 'nav-group'; group.dataset.group = '参考工作台'; group.innerHTML = '参考工作台<svg class="nav-fold-ic" data-fold="参考工作台"><use href="#i-chev"/></svg>'; nav.appendChild(group); [['class-checks','i-check','查课看板'],['roll-call','i-users','随机点名'],['dorm-inspections','i-bed','宿舍查寝'],['assessment','i-chart','量化考评'],['toolbox','i-sparkles','工具入口'],['employment-safety','i-alert','就业防骗'],['competitions','i-trophy','竞赛资源'],['academic-analysis','i-chart','学业分析'],['notice-ai','i-mind','通知 AI']].forEach(function (item) { var button = document.createElement('button'); button.type = 'button'; button.className = 'nav-item'; button.dataset.view = item[0]; button.innerHTML = '<svg class="ic"><use href="#' + item[1] + '"/></svg>' + item[2]; nav.appendChild(button); }); if (typeof runtime.applyFold === 'function') runtime.applyFold(); }
  function installStyles() { if (document.querySelector('#cwb-v47-ui-style')) return; var style = document.createElement('style'); style.id = 'cwb-v47-ui-style'; style.textContent = '.cwb-v47-layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;padding-right:24px}.cwb-v47-layout .main{min-width:0}.v47-context-scrim{display:none}.v47-context{position:sticky;top:78px;align-self:start;max-height:calc(100vh - 96px);overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:8px;box-shadow:var(--sh-sm);padding:14px}.v47-context-head,.v47-section-title{display:flex;align-items:center;gap:8px}.v47-context-head{padding-bottom:11px;border-bottom:1px solid var(--line-2)}.v47-context-head .btn{margin-left:auto}.v47-context-block{display:grid;gap:4px;padding:14px 0;border-bottom:1px solid var(--line-2)}.v47-context-number{font-size:28px;font-weight:750;color:var(--accent)}.v47-context-person-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.v47-context-list{display:grid;gap:5px;padding:12px 0}.v47-context-list button{display:grid;gap:2px;text-align:left;border:0;background:var(--accent-soft);border-radius:6px;padding:8px;color:var(--ink)}.v47-context-list span{font-size:11px;color:var(--ink-4)}.v47-context-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.v47-context-actions .btn:last-child{grid-column:auto}.v47-context-note{font-size:11px;line-height:1.55;color:var(--ink-4);margin-top:14px}.v47-context.is-collapsed{width:52px;padding:8px;overflow:hidden}.v47-context.is-collapsed>*:not(.v47-context-head){display:none}.v47-context.is-collapsed .v47-context-head strong{display:none}.v47-stat-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:14px}.v47-stat{display:grid;gap:4px;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:11px 12px;min-width:0}.v47-stat:hover{border-color:var(--accent-line);background:var(--accent-soft)}.v47-stat span,.v47-stat small{font-size:11px;color:var(--ink-4)}.v47-stat strong{font-size:22px;color:var(--ink);overflow:hidden;text-overflow:ellipsis}.v47-filter-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 0 14px}.v47-filter-bar .inp{width:auto;min-width:130px}.v47-workspace,.v47-two-col,.v47-notice-grid{display:grid;gap:14px}.v47-two-col{grid-template-columns:minmax(0,1.35fr) minmax(300px,.85fr)}.v47-notice-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.v47-table-wrap{overflow:auto}.v47-table{width:100%;border-collapse:collapse;min-width:680px}.v47-table th,.v47-table td{border-bottom:1px solid var(--line-2);padding:10px 9px;text-align:left;vertical-align:top;font-size:13px}.v47-table th{font-size:12px;color:var(--ink-4);font-weight:700;background:var(--card-2)}.v47-actions{white-space:nowrap}.v47-list{display:grid;gap:7px}.v47-list-row{display:flex;align-items:center;gap:10px;border:1px solid var(--line-2);border-radius:7px;padding:10px 11px;min-width:0}.v47-list-row>div:first-child{min-width:0;flex:1}.v47-list-row strong{overflow-wrap:anywhere}.v47-empty{display:grid;gap:4px;place-items:center;text-align:center;padding:30px 14px;color:var(--ink-3);font-size:13px}.v47-empty span{font-size:12px;color:var(--ink-4)}.v47-section-title{margin-bottom:10px}.v47-class-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:300px;overflow:auto;margin-bottom:16px}.v47-class-check{padding:8px;border:1px solid var(--line);border-radius:6px}.v47-form-line{display:grid;grid-template-columns:auto minmax(80px,1fr) auto minmax(120px,1fr);gap:8px;align-items:center;margin:12px 0}.v47-result{border:1px solid var(--accent-line);background:var(--accent-soft);border-radius:8px;padding:14px}.v47-result ol{margin:12px 0;padding-left:24px;display:grid;gap:7px}.v47-result li{display:flex;justify-content:space-between;gap:8px}.v47-notice-input{min-height:360px;line-height:1.7;resize:vertical}.v47-notice-result{min-height:360px;border:1px solid var(--line-2);border-radius:7px;padding:14px;line-height:1.7}.v47-notice-result p{margin:10px 0}.v47-notice-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:18px}.score-positive{color:var(--ok)}.score-negative{color:var(--danger)}.v47-screen-result{font-size:28px;text-align:center}.v47-screen-result ol{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;text-align:left}.v47-screen-result li{padding:16px;background:var(--accent-soft);border-radius:8px}@media(max-width:1279px){.cwb-v47-layout{grid-template-columns:minmax(0,1fr);padding-right:0}.v47-context-scrim.is-open{display:block;position:fixed;inset:0;z-index:69;border:0;background:rgba(15,23,42,.24);cursor:pointer}.v47-context{position:fixed;right:16px;top:76px;width:320px;z-index:70;display:none}.v47-context.is-open{display:block}}@media(max-width:900px){.cwb-v47-layout{display:block}.v47-context,.v47-context-scrim{display:none!important}.v47-stat-strip{display:flex;overflow-x:auto;padding-bottom:3px}.v47-stat{flex:0 0 126px}.v47-two-col,.v47-notice-grid{grid-template-columns:1fr}.v47-form-line{grid-template-columns:1fr 1fr}.v47-form-line .lab{font-size:12px}.v47-table{min-width:620px}}@media(prefers-reduced-motion:reduce){.v47-context,.v47-list-row{transition:none!important}}'; document.head.appendChild(style); }
  function installLayoutPatchStyles() {
    if (document.querySelector('#cwb-v47-layout-fix-style')) return;
    var style = document.createElement('style');
    style.id = 'cwb-v47-layout-fix-style';
    style.textContent = '.v47-list-row{align-items:flex-start}.v47-list-row-main{min-width:0;flex:1 1 auto;line-height:1.55}.v47-list-row-main strong{display:block;overflow-wrap:anywhere;word-break:break-word;line-height:1.5}.v47-list-row-main .tiny{white-space:normal;overflow-wrap:anywhere;word-break:break-word}.v47-list-row-tools{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex:0 0 auto;flex-wrap:wrap;max-width:48%}.v47-list-row-tools .btn{flex:0 0 auto}.v47-list-row>div:first-child:not(.v47-list-row-main){min-width:0;flex:1 1 auto}@media(max-width:700px){.v47-list-row{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.v47-list-row-tools{justify-content:flex-start;max-width:none;width:100%}}';
    document.head.appendChild(style);
  }
  installStyles(); installLayoutPatchStyles(); installContextToggleStyles(); installReferenceSurface(); installPolishedSurface(); installContext(); installContextToggle(); addNav();
  if (root.CWB && root.CWB.hooks && typeof root.CWB.hooks.on === 'function') root.CWB.hooks.on('view:render', function () { installContext(); refreshContext(); });
  setTimeout(function () { try { refreshContext(); } catch (_) {} }, 0);
  root.CWBV47UI = { refreshContext:refreshContext, renderNotice:viewNotice };
})(typeof globalThis !== 'undefined' ? globalThis : this);
