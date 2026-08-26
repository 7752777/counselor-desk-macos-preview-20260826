/* v4.6 local-first business services.  This module is storage-agnostic so the
 * same validation rules run in the browser, portable HTML, and Electron. */
(function installCwbV46(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.CWBV46 = api;
    root.CWB = root.CWB || {};
    root.CWB.v46 = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbV46() {
  'use strict';

  const SCHEMA_VERSION = 9;
  const now = () => new Date().toISOString();
  const text = value => String(value == null ? '' : value).trim();
  const number = (value, fallback = 0) => {
    if (value === '' || value == null) return fallback;
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };
  const id = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const clone = value => {
    if (value == null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };
  const list = value => Array.isArray(value) ? value : value == null ? [] : [value];

  const COLLECTIONS = Object.freeze([
    'v4_dorm_buildings', 'v4_dorm_rooms', 'v4_dorm_batches', 'v4_dorm_assignments', 'v4_dorm_transfers',
    'v4_committee_role_catalog', 'v4_committee_evaluations', 'v4_family_contacts', 'v4_worklog_drafts',
    'v4_research_projects',
  ]);
  const DORM_ASSIGNMENT_STATUS = Object.freeze(['planned', 'confirmed', 'checked_out', 'cancelled']);
  const COMMITTEE_GRADES = Object.freeze(['优秀', '良好', '合格', '不合格']);
  const RESEARCH_STAGES = Object.freeze([
    { key:'application', label:'申请书准备' }, { key:'submission', label:'申报' },
    { key:'review', label:'评审 / 立项' }, { key:'opening', label:'开题' },
    { key:'researching', label:'研究中' }, { key:'midterm', label:'中期检查' },
    { key:'closing_materials', label:'结题材料' }, { key:'closed', label:'已结题' },
  ]);
  const DEFAULT_COMMITTEE_ROLES = Object.freeze([
    { key:'monitor', name:'班长', enabled:true }, { key:'league_secretary', name:'团支书', enabled:true },
    { key:'study', name:'学习委员', enabled:true }, { key:'life', name:'生活委员', enabled:true },
    { key:'psychology', name:'心理委员', enabled:true }, { key:'rights', name:'权益委员', enabled:true },
    { key:'employment', name:'就业委员', enabled:true }, { key:'research', name:'科研委员', enabled:true },
    { key:'publicity', name:'宣传委员', enabled:true }, { key:'sports', name:'文体委员', enabled:true },
  ]);

  function base(input, prefix) {
    const value = Object.assign({}, input || {});
    const stamp = now();
    return Object.assign(value, {
      id: text(value.id) || id(prefix),
      schema_version: SCHEMA_VERSION,
      created_at: text(value.created_at) || stamp,
      updated_at: stamp,
    });
  }

  function studentReference(value, options) {
    const source = value || {};
    if (typeof source !== 'object') return { student_id:'', student_number:text(source), student_name:'', class_name:'' };
    const opts = options || {};
    // Business records must carry an explicit student_id. Only a student
    // object from the students collection may use its own id as the reference.
    const studentId = text(source.student_id) || (opts.studentObject === true ? text(source.id) : '');
    return {
      student_id:studentId,
      student_number:text(source.student_number || source.number),
      student_name:text(source.student_name || source.full_name || source.name),
      class_name:text(source.class_name || source.class),
      student_gender:text(source.student_gender || source.gender || source.sex),
      gender:text(source.student_gender || source.gender || source.sex),
      grade:text(source.grade || source.student_grade || source.year),
      student_type:text(source.student_type || source.type),
    };
  }

  function normalizeBuilding(input) {
    const value = base(input, 'dorm_building');
    return Object.assign(value, {
      campus:text(value.campus), name:text(value.name), gender_limit:text(value.gender_limit || value.gender || '不限') || '不限',
      enabled:value.enabled !== false, note:text(value.note),
    });
  }
  function normalizeRoom(input) {
    const value = base(input, 'dorm_room');
    const rawBeds = Array.isArray(value.bed_numbers) ? value.bed_numbers : text(value.bed_numbers).split(/[、,，\s]+/).filter(Boolean);
    const capacity = Math.max(1, Math.floor(number(value.capacity || value.bed_count, rawBeds.length || 1)));
    const bedNumbers = [...new Set((rawBeds.length ? rawBeds : Array.from({ length:capacity }, (_, index) => String(index + 1))).map(text).filter(Boolean))].slice(0, capacity);
    while (bedNumbers.length < capacity) bedNumbers.push(String(bedNumbers.length + 1));
    return Object.assign(value, {
      building_id:text(value.building_id), floor:text(value.floor), room_number:text(value.room_number || value.room),
      capacity, bed_numbers:bedNumbers, status:text(value.status) || '可用', note:text(value.note),
    });
  }
  function normalizeBatch(input) {
    const value = base(input, 'dorm_batch');
    return Object.assign(value, {
      academic_year:text(value.academic_year || value.school_year), term:text(value.term),
      batch_type:text(value.batch_type) || '日常调整', status:text(value.status) || '草稿', description:text(value.description || value.note),
    });
  }
  function normalizeAssignment(input) {
    const value = base(input, 'dorm_assignment');
    const ref = studentReference(value);
    return Object.assign(value, ref, {
      batch_id:text(value.batch_id), building_id:text(value.building_id), room_id:text(value.room_id), bed_number:text(value.bed_number),
      check_in_date:text(value.check_in_date || value.move_in_date), check_out_date:text(value.check_out_date || value.move_out_date),
      student_gender:text(value.student_gender || value.gender || value.sex || ref.student_gender),
      status:DORM_ASSIGNMENT_STATUS.includes(text(value.status)) ? text(value.status) : 'planned', note:text(value.note),
    });
  }
  function normalizeTransfer(input) {
    const value = base(input, 'dorm_transfer');
    const ref = studentReference(value);
    return Object.assign(value, ref, {
      batch_id:text(value.batch_id), from_building_id:text(value.from_building_id), from_room_id:text(value.from_room_id), from_bed_number:text(value.from_bed_number),
      to_building_id:text(value.to_building_id), to_room_id:text(value.to_room_id), to_bed_number:text(value.to_bed_number),
      reason:text(value.reason), transfer_date:text(value.transfer_date || value.date), operator:text(value.operator), status:['active','cancelled'].includes(text(value.status)) ? text(value.status) : 'active', cancelled_at:text(value.cancelled_at), attachment_ids:list(value.attachment_ids).map(text).filter(Boolean),
    });
  }
  function normalizeRole(input) {
    const value = base(input, 'committee_role');
    return Object.assign(value, { key:text(value.key) || id('role_key'), name:text(value.name || value.position), enabled:value.enabled !== false, custom:value.custom === true, note:text(value.note) });
  }
  function normalizeEvaluation(input) {
    const value = base(input, 'committee_evaluation');
    const ref = studentReference(value);
    const grade = text(value.grade || value.level);
    return Object.assign(value, ref, {
      role_id:text(value.role_id || value.position_id), role_name:text(value.role_name || value.position), class_name:text(value.class_name || ref.class_name),
      term:text(value.term), evaluation_date:text(value.evaluation_date || value.date), grade:COMMITTEE_GRADES.includes(grade) ? grade : '',
      note:text(value.note), improvement:text(value.improvement || value.improvement_suggestion), operator:text(value.operator),
    });
  }
  function normalizeFamilyContact(input) {
    const value = base(input, 'family_contact');
    const ref = studentReference(value);
    return Object.assign(value, ref, {
      parent_name:text(value.parent_name || value.contact_name), parent_relation:text(value.parent_relation || value.relation),
      parent_phone:text(value.parent_phone || value.phone),
      contact_date:text(value.contact_date || value.date), method:text(value.method || value.channel) || '电话', purpose:text(value.purpose),
      summary:text(value.summary || value.content), outcome:text(value.outcome || value.result), next_action:text(value.next_action),
      attachment_ids:list(value.attachment_ids).map(text).filter(Boolean), sensitive:true,
    });
  }
  function normalizeWorklogDraft(input) {
    const value = base(input, 'worklog_draft');
    const ref = studentReference(value);
    return Object.assign(value, ref, {
      source_id:text(value.source_id || value.source_record_id), source_collection:text(value.source_collection),
      date:text(value.date) || now().slice(0, 10), title:text(value.title || value.subject) || '待确认工作记录',
      category:text(value.category) || '其他', summary:text(value.summary || value.content), result:text(value.result),
      next_action:text(value.next_action), status:['draft','confirmed','dismissed','stale'].includes(text(value.status)) ? text(value.status) : 'draft',
      source_updated_at:text(value.source_updated_at), source_hash:text(value.source_hash),
      source_state:text(value.source_state) || 'active', source_rechecked:value.source_rechecked === true,
      source_rechecked_at:text(value.source_rechecked_at),
    });
  }
  function normalizeResearch(input) {
    const value = base(input, 'research_project');
    const stageKey = text(value.current_stage || value.stage) || RESEARCH_STAGES[0].key;
    const stage = RESEARCH_STAGES.some(item => item.key === stageKey) ? stageKey : RESEARCH_STAGES[0].key;
    const history = list(value.stage_history).filter(item => item && typeof item === 'object').map(item => Object.assign({}, item, { stage:text(item.stage), changed_at:text(item.changed_at) }));
    return Object.assign(value, {
      name:text(value.name || value.title), level:text(value.level) || '校级', principal:text(value.principal || value.leader), participants:text(value.participants),
      organization:text(value.organization || value.unit), application_year:text(value.application_year || value.year), current_stage:stage,
      next_action:text(value.next_action), stage_due_date:text(value.stage_due_date || value.due_date), attachment_ids:list(value.attachment_ids).map(text).filter(Boolean),
      note:text(value.note), stage_history:history, status:text(value.status) || '进行中',
    });
  }

  function parseList(input) {
    if (Array.isArray(input)) return input.flatMap(item => parseList(item));
    return text(input).split(/[\r\n,，、;；]+/).map(item => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  function cleanList(input) {
    const source = parseList(input);
    const seen = new Set(); const result = []; let duplicates = 0;
    source.forEach(item => { const key = item.toLocaleLowerCase(); if (seen.has(key)) duplicates += 1; else { seen.add(key); result.push(item); } });
    Object.defineProperties(result, {
      duplicates:{ value:duplicates, enumerable:false }, sourceCount:{ value:source.length, enumerable:false }, removed:{ value:source.length - result.length, enumerable:false },
    });
    return result;
  }
  function seedNumber(seed) {
    let state = 2166136261;
    for (const char of text(seed)) { state ^= char.charCodeAt(0); state = Math.imul(state, 16777619); }
    return state >>> 0 || 1;
  }
  function createRandom(seed) {
    if (seed != null && text(seed)) {
      let state = seedNumber(seed);
      return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    }
    const cryptoApi = typeof globalThis !== 'undefined' && globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
      return () => cryptoApi.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    }
    return Math.random;
  }
  function shuffle(values, seed) {
    const result = values.slice(); const random = createRandom(seed);
    for (let index = result.length - 1; index > 0; index -= 1) { const other = Math.floor(random() * (index + 1)); [result[index], result[other]] = [result[other], result[index]]; }
    return result;
  }
  function generatedSeed(prefix) {
    const cryptoApi = typeof globalThis !== 'undefined' && globalThis.crypto;
    const values = cryptoApi && typeof cryptoApi.getRandomValues === 'function'
      ? Array.from(cryptoApi.getRandomValues(new Uint32Array(2)), value => value.toString(36)).join('')
      : Math.random().toString(36).slice(2, 12);
    return `${prefix}_${Date.now()}_${values}`;
  }
  function draw(options) {
    const opts = options || {}; const values = cleanList(opts.items || opts.names || opts.list);
    const count = Math.max(1, Math.floor(number(opts.count, 1))); const replace = opts.allowRepeat === true || opts.replace === true;
    if (!values.length) throw new Error('UTILITY_DRAW_LIST_EMPTY');
    if (!replace && count > values.length) throw new Error('UTILITY_DRAW_NOT_ENOUGH');
    const seed = text(opts.seed) || generatedSeed('random');
    const shuffled = shuffle(values, seed); const drawn = [];
    if (replace) { const random = createRandom(seed); for (let index = 0; index < count; index += 1) drawn.push(values[Math.floor(random() * values.length)]); }
    else drawn.push(...shuffled.slice(0, count));
    return { seed, items:drawn, drawn, source_count:values.length, count, allow_repeat:replace, generated_at:now() };
  }
  function group(options) {
    const opts = options || {}; const values = cleanList(opts.items || opts.names || opts.list);
    if (!values.length) throw new Error('UTILITY_GROUP_LIST_EMPTY');
    const requestedGroups = Math.max(1, Math.floor(number(opts.groupCount || opts.groups, 0)));
    const perGroup = Math.max(0, Math.floor(number(opts.perGroup || opts.groupSize, 0)));
    // A requested group size is an explicit capacity, so it takes precedence
    // over a UI default group count and must never discard the remainder.
    const groupCount = perGroup ? Math.max(1, Math.ceil(values.length / perGroup)) : requestedGroups || 1;
    const seed = text(opts.seed) || generatedSeed('group');
    const groups = Array.from({ length:groupCount }, (_, index) => ({ index:index + 1, name:`第 ${index + 1} 组`, items:[] }));
    shuffle(values, seed).forEach((value, index) => groups[index % groupCount].items.push(value));
    return { seed, groups, group_count:groups.length, per_group:perGroup || null, source_count:values.length, generated_at:now() };
  }
  function parseDate(value) {
    const match = text(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return NaN;
    const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return NaN;
    const candidate = new Date(0);
    candidate.setUTCHours(0, 0, 0, 0);
    candidate.setUTCFullYear(year, month - 1, day);
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return NaN;
    const timestamp = candidate.getTime();
    return Number.isFinite(timestamp) ? timestamp : NaN;
  }
  function isoDate(timestamp) { return new Date(timestamp).toISOString().slice(0, 10); }
  function generateRotation(options) {
    const opts = options || {}; const people = cleanList(opts.people || opts.items || opts.names); const start = parseDate(opts.startDate || opts.start_date || now().slice(0, 10));
    const intervalDays = Math.max(1, Math.floor(number(opts.intervalDays || opts.interval_days, 1))); const cycles = Math.max(1, Math.floor(number(opts.cycles, people.length || 1)));
    if (!people.length || Number.isNaN(start)) throw new Error('UTILITY_ROTATION_INPUT_INVALID');
    return { interval_days:intervalDays, start_date:isoDate(start), items:Array.from({ length:cycles }, (_, index) => ({ date:isoDate(start + index * intervalDays * 86400000), person:people[index % people.length], index:index + 1 })), generated_at:now() };
  }
  function dateDiff(options) {
    const opts = options || {}; const from = parseDate(opts.from || opts.start || now().slice(0, 10)); const to = parseDate(opts.to || opts.end || opts.dueDate || now().slice(0, 10));
    if (Number.isNaN(from) || Number.isNaN(to)) throw new Error('UTILITY_DATE_INVALID');
    const days = Math.round((to - from) / 86400000); return { from:isoDate(from), to:isoDate(to), days, overdue:days < 0, today:days === 0, absolute_days:Math.abs(days) };
  }
  const utilities = Object.freeze({ draw, group, generateRotation, dateDiff, cleanList });

  function genderCompatible(limit, gender) {
    const value = text(limit) || '不限'; const current = text(gender);
    return !current || ['不限','混合','男女不限',''].includes(value) || value === current;
  }
  function planDormAssignments(options) {
    const opts = options || {}; const students = list(opts.students).map(item => studentReference(item, { studentObject:true })).filter(item => item.student_id || item.student_number);
    const buildings = list(opts.buildings).map(normalizeBuilding); const rooms = list(opts.rooms).map(normalizeRoom); const assignments = list(opts.existingAssignments).map(normalizeAssignment);
    const batchId = text(opts.batch_id || opts.batchId) || id('dorm_plan'); const includeAssigned = opts.includeAssigned === true; const assignedStudents = new Set(assignments.filter(item => !['cancelled','checked_out'].includes(item.status)).map(item => item.student_id).filter(Boolean));
    const buildingMap = new Map(buildings.filter(item => item.enabled).map(item => [item.id, item])); const roomMap = new Map(rooms.filter(item => item.status === '可用').map(item => [item.id, item]));
    const occupied = new Set(assignments.filter(item => !['cancelled','checked_out'].includes(item.status)).map(item => `${item.room_id}:${item.bed_number}`));
    const candidate = students.filter(student => includeAssigned || !assignedStudents.has(student.student_id));
    const selected = candidate.filter(student => {
      const filter = opts.filters || {}; return (!filter.class_name || student.class_name === filter.class_name) && (!filter.grade || text(student.grade) === text(filter.grade)) && (!filter.gender || text(student.gender) === text(filter.gender)) && (!filter.student_type || text(student.student_type) === text(filter.student_type));
    });
    const proposed = []; const conflicts = []; const usedStudents = new Set();
    const roomSlots = [];
    rooms.forEach(room => { const building = buildingMap.get(room.building_id); if (!building) return; room.bed_numbers.forEach(bed => { roomSlots.push({ room, building, bed }); }); });
    selected.sort((a, b) => `${a.class_name}${a.student_number}${a.student_name}`.localeCompare(`${b.class_name}${b.student_number}${b.student_name}`, 'zh-CN')).forEach(student => {
      if (!student.student_id) { conflicts.push({ type:'missing_student_id', student, message:'学生缺少稳定 student_id，不能写入排宿结果' }); return; }
      if (usedStudents.has(student.student_id)) { conflicts.push({ type:'duplicate_student', student, message:'同一方案中学生重复出现，不能重复分配床位' }); return; }
      const slot = roomSlots.find(item => !occupied.has(`${item.room.id}:${item.bed}`) && genderCompatible(item.building.gender_limit, student.gender));
      if (!slot) { conflicts.push({ type:'no_available_bed', student, message:'没有满足容量或性别限制的可用床位' }); return; }
      const key = `${slot.room.id}:${slot.bed}`; occupied.add(key); usedStudents.add(student.student_id);
      proposed.push(normalizeAssignment({ id:id('dorm_assignment'), batch_id:batchId, student_id:student.student_id, student_number:student.student_number, student_name:student.student_name, student_gender:student.student_gender, class_name:student.class_name, building_id:slot.building.id, room_id:slot.room.id, bed_number:slot.bed, status:'planned', check_in_date:opts.check_in_date || '' }));
    });
    return { batch_id:batchId, assignments:proposed, conflicts, unassigned:selected.filter(student => !usedStudents.has(student.student_id)), selected_count:selected.length, assigned_count:proposed.length, generated_at:now(), valid:conflicts.length === 0 && proposed.length === selected.length };
  }
  function validateDormPlan(plan, options) {
    const value = plan || {}; const opts = options || {}; const assignments = list(value.assignments).map(normalizeAssignment); const buildings = new Map(list(opts.buildings).map(normalizeBuilding).map(item => [item.id, item])); const rooms = new Map(list(opts.rooms).map(normalizeRoom).map(item => [item.id, item]));
    const existing = list(opts.existingAssignments).map(normalizeAssignment).filter(item => !['cancelled','checked_out'].includes(item.status));
    const errors = []; const seenBeds = new Set(); const seenStudents = new Set();
    assignments.forEach(item => {
      const room = rooms.get(item.room_id); const building = buildings.get(item.building_id);
      if (!item.student_id) errors.push({ type:'missing_student_id', id:item.id, message:'排宿记录缺少 student_id' });
      if (seenStudents.has(item.student_id)) errors.push({ type:'duplicate_student', id:item.id, message:'同一方案中学生重复分配' }); else seenStudents.add(item.student_id);
      const bedKey = `${item.room_id}:${item.bed_number}`; if (seenBeds.has(bedKey)) errors.push({ type:'bed_conflict', id:item.id, message:'同一床位重复分配' }); else seenBeds.add(bedKey);
      if (!room) errors.push({ type:'room_missing', id:item.id, message:'房间不存在' });
      if (!building) errors.push({ type:'building_missing', id:item.id, message:'楼栋不存在' });
      if (room && !room.bed_numbers.includes(item.bed_number)) errors.push({ type:'bed_missing', id:item.id, message:'床位编号不在房间容量内' });
      if (room && room.status !== '可用') errors.push({ type:'room_unavailable', id:item.id, message:'目标房间不是可用状态' });
      if (building && !building.enabled) errors.push({ type:'building_disabled', id:item.id, message:'目标楼栋已停用' });
      const studentGender = text(item.student_gender || item.gender || item.student && (item.student.student_gender || item.student.gender));
      if (building && !genderCompatible(building.gender_limit, studentGender)) errors.push({ type:'gender_limit', id:item.id, message:'不符合楼栋性别限制' });
      const currentStudent = existing.find(current => current.student_id && current.student_id === item.student_id && String(current.id) !== String(item.id));
      if (currentStudent) errors.push({ type:'existing_student', id:item.id, message:'学生已有未结束的住宿记录' });
      const currentBed = existing.find(current => String(current.room_id) === String(item.room_id) && String(current.bed_number) === String(item.bed_number) && String(current.id) !== String(item.id));
      if (currentBed) errors.push({ type:'existing_bed', id:item.id, message:'目标床位在确认时已被占用' });
    });
    return { valid:errors.length === 0, errors };
  }
  function applyDormPlan(plan, options) {
    const validation = validateDormPlan(plan, options); if (!validation.valid) { const error = new Error('DORM_PLAN_INVALID'); error.details = validation.errors; throw error; }
    const assignments = list(plan.assignments).map(item => normalizeAssignment(Object.assign({}, item, { status:'confirmed' }))); const patches = assignments.map(item => ({ student_id:item.student_id, patch:{ dorm_building:item.building_id, dorm_room:item.room_id, dorm:item.room_id, residence_type:'校内', dorm_assignment_id:item.id } }));
    return { assignments, studentPatches:patches, confirmed_at:now() };
  }
  const dorm = Object.freeze({ normalizeBuilding, normalizeRoom, normalizeBatch, normalizeAssignment, normalizeTransfer, plan:planDormAssignments, validate:validateDormPlan, apply:applyDormPlan });

  function committeeRoles(input) {
    const values = list(input); return [...DEFAULT_COMMITTEE_ROLES.map(normalizeRole), ...values.map(normalizeRole)].filter((item, index, all) => all.findIndex(other => other.key === item.key || other.name === item.name) === index);
  }
  function normalizeCommitteeCatalog(input) { return committeeRoles(input); }
  function evaluateCommittee(input) { const value = normalizeEvaluation(input); if (!COMMITTEE_GRADES.includes(value.grade)) throw new Error('COMMITTEE_EVALUATION_GRADE_INVALID'); return value; }
  const committee = Object.freeze({ grades:COMMITTEE_GRADES, defaults:DEFAULT_COMMITTEE_ROLES, normalizeRole, normalizeEvaluation, normalizeCatalog:normalizeCommitteeCatalog, evaluate:evaluateCommittee });

  function stableSourceValue(value) {
    if (Array.isArray(value)) return value.map(stableSourceValue);
    if (!value || typeof value !== 'object') return value;
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableSourceValue(value[key]);
      return result;
    }, {});
  }
  function worklogSourceHash(record, collection) {
    const source = record || {};
    if (text(collection) === 'v4_ai_suggestions') {
      /* Suggestion status and updated_at are workflow metadata. Conversion
         changes them by design, while the content snapshot must stay stable
         until a teacher edits the actual suggestion. */
      return JSON.stringify(stableSourceValue([
        collection, source.id, source.kind, source.purpose,
        source.title, source.summary, source.payload,
        source.provider_id, source.model, source.audit_id,
        source.request_id, source.student_id, source.student_number,
        source.target_view, source.target_collection, source.target_record_id,
        source.source_ids, source.citations, source.sensitive_categories,
        source.sensitive_fields, source.risk_level, source.actions,
        source.context_scope,
      ]));
    }
    return JSON.stringify([
      /* updated_at is storage metadata: save(part) may refresh it for every
         row in a collection. Hash only business facts so an unrelated save
         cannot invalidate every draft in that collection. */
      collection, source.id, source.date, source.contact_date, source.completed_at,
      source.done_at, source.follow_date, source.title, source.summary,
      source.content, source.result, source.outcome, source.next_action,
      source.note, source.findings, source.measures, source.inspection_target,
      source.location, source.visit_type, source.way, source.duty,
      source.contact_method, source.status, source.priority, source.due,
      source.term, source.class_name, source.student_id, source.student_number,
      source.attachment_id, source.attachment_ids, source.photo_attachment_ids,
      source.attachments, source.participant_student_ids,
    ]);
  }
  function createWorklogDraft(record, options) {
    const source = record || {}; const opts = options || {}; const ref = studentReference(source); const sourceCollection = text(opts.source_collection || opts.sourceCollection || source.collection || source.kind) || 'unknown';
    return normalizeWorklogDraft({ id:opts.id, source_id:source.id, source_collection:sourceCollection, source_updated_at:source.updated_at, student_id:ref.student_id, student_number:ref.student_number, student_name:ref.student_name, class_name:ref.class_name, date:source.date || source.contact_date || source.completed_at || source.done_at, title:opts.title || source.title || source.subject || source.category || '日常工作记录', category:opts.category || source.category || '其他', summary:opts.summary || source.summary || source.content || source.findings || source.note, result:opts.result || source.result || source.outcome, next_action:opts.next_action || source.next_action || source.follow_up, status:'draft', source_hash:worklogSourceHash(source, sourceCollection) });
  }
  function worklogDraftFromRecord(record, options) { return createWorklogDraft(record, options); }
  function confirmWorklogDraft(draft, options) {
    const value = normalizeWorklogDraft(draft); const opts = options || {};
    if (['stale', 'changed', 'deleted'].includes(value.status) || ['changed', 'deleted'].includes(value.source_state)) {
      if (opts.source_rechecked !== true && value.source_rechecked !== true) throw new Error('WORKLOG_DRAFT_SOURCE_RECHECK_REQUIRED');
      if (value.source_state === 'deleted') throw new Error('WORKLOG_DRAFT_SOURCE_DELETED');
    }
    return normalizeWorklogDraft(Object.assign({}, value, opts, { status:'confirmed', source_rechecked:opts.source_rechecked === true || value.source_rechecked === true, source_rechecked_at:opts.source_rechecked === true ? now() : value.source_rechecked_at }));
  }
  const worklogDrafts = Object.freeze({ createFromRecord:createWorklogDraft, normalize:normalizeWorklogDraft, preview:draft => normalizeWorklogDraft(draft), confirm:confirmWorklogDraft, dismiss:(draft, options) => normalizeWorklogDraft(Object.assign({}, draft, options || {}, { status:'dismissed' })), sourceHash:worklogSourceHash });
  const familyContacts = Object.freeze({ normalize:normalizeFamilyContact, create:normalizeFamilyContact });

  function researchAdvance(project, stage, options) {
    const current = normalizeResearch(project); const nextStage = text(stage); if (!RESEARCH_STAGES.some(item => item.key === nextStage)) throw new Error('RESEARCH_STAGE_INVALID');
    const history = current.stage_history.concat([{ stage:current.current_stage, changed_at:now(), next_stage:nextStage, note:text(options && options.note) }]);
    return normalizeResearch(Object.assign({}, current, { current_stage:nextStage, stage_history:history, stage_due_date:options && options.stage_due_date || current.stage_due_date }));
  }
  function researchTask(project, stage) { const item = normalizeResearch(project); const key = text(stage || item.current_stage); const label = (RESEARCH_STAGES.find(stageItem => stageItem.key === key) || {}).label || key; return { id:`research_stage_${item.id}_${key}`, title:`课题阶段：${item.name || '未命名课题'} · ${label}`, source:'research_project', source_id:item.id, due:item.stage_due_date || '', status:'todo', priority:'P1', note:item.next_action || '' }; }
  const research = Object.freeze({ stages:RESEARCH_STAGES, normalize:normalizeResearch, advance:researchAdvance, task:researchTask });

  function withinDate(value, options) { const date = text(value); const opts = options || {}; return (!opts.from || date >= opts.from) && (!opts.to || date <= opts.to); }
  function withinScope(record, options) {
    const opts = options || {}; const value = record || {};
    if (!withinDate(value.date || value.contact_date || value.evaluation_date || value.issued_at || value.decision_date || value.contacted_at, opts)) return false;
    if (text(opts.term) && text(value.term || value.academic_term || value.semester) !== text(opts.term)) return false;
    return true;
  }
  function related(record, student) { const ref = studentReference(student, { studentObject:true }); const rid = text(record && record.student_id); if (rid && ref.student_id) return rid === ref.student_id; return !!ref.student_number && text(record && record.student_number) === ref.student_number; }
  function matching(rows, student, options) { return list(rows).filter(row => related(row, student) && withinScope(row, options)); }
  function metricCount(rows, student, options) { const values = matching(rows, student, options); return values.length ? values.length : null; }
  function uniqueActivityParticipants(values) {
    const seen = new Set();
    return list(values).filter(item => {
      const key = [text(item && (item.student_id || item.student_number)), text(item && item.term), text(item && (item.activity_id || item.id))].join('|');
      if (!text(item && (item.student_id || item.student_number)) || !text(item && (item.activity_id || item.id)) || seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function classSummary(options) {
    const opts = options || {}; const students = list(opts.students).filter(student => !opts.class_name || text(student.class_name) === text(opts.class_name)).filter(student => !opts.grade || text(student.grade) === text(opts.grade));
    const sources = opts.sources || opts; const rows = students.map(student => {
      const awards = matching([].concat(list(sources.honor), list(sources.rewards)), student, opts);
      const absence = matching(sources.attend, student, opts).filter(item => /旷课|缺勤|迟到|未到/.test(`${item.type || ''}${item.status || ''}`));
      const talks = matching(sources.talks, student, opts); const focus = !!(student.focus_level || student.crisis_level); const grades = matching(sources.grades, student, opts).filter(item => item.failed === true || item.failed === '是' || (item.score !== '' && Number(item.score) < 60));
      const activities = uniqueActivityParticipants(matching(sources.activityParticipants, student, opts)); const grants = matching(sources.grants || sources.aidRecords, student, opts);
      return {
        student_id:text(student.id || student.student_id), student_number:text(student.student_number), student_name:text(student.full_name || student.student_name), class_name:text(student.class_name),
        awards_count:awards.length || null, absence_count:absence.length || null, talks_count:talks.length || null, focus:focus ? 1 : null, academic_warning_count:grades.length || null,
        activity_count:activities.length || null, aid_count:grants.length || null, employment_status:text(student.employment_status || student.graduation_status) || null,
      };
    });
    const aggregate = key => { const values = rows.map(row => row[key]).filter(value => value != null); return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) : null; };
    return { class_name:text(opts.class_name), term:text(opts.term), from:text(opts.from), to:text(opts.to), student_count:rows.length, rows, totals:{ awards_count:aggregate('awards_count'), absence_count:aggregate('absence_count'), talks_count:aggregate('talks_count'), focus:aggregate('focus'), academic_warning_count:aggregate('academic_warning_count'), activity_count:aggregate('activity_count'), aid_count:aggregate('aid_count') }, generated_at:now() };
  }
  function compareClasses(options) {
    const opts = options || {}; const classes = list(opts.classes).map(text).filter(Boolean); return classes.map(className => classSummary(Object.assign({}, opts, { class_name:className })));
  }
  function drillDown(metric, options) { const summary = classSummary(options); const key = text(metric); return summary.rows.filter(row => row[key] != null && (key === 'focus' ? row[key] === 1 : Number(row[key]) > 0)); }
  const analysis = Object.freeze({ classSummary, compareClasses, drillDown });

  function normalizeRecord(collection, input) {
    const key = text(collection); const value = input || {};
    const map = { v4_dorm_buildings:normalizeBuilding, v4_dorm_rooms:normalizeRoom, v4_dorm_batches:normalizeBatch, v4_dorm_assignments:normalizeAssignment, v4_dorm_transfers:normalizeTransfer, v4_committee_role_catalog:normalizeRole, v4_committee_evaluations:normalizeEvaluation, v4_family_contacts:normalizeFamilyContact, v4_worklog_drafts:normalizeWorklogDraft, v4_research_projects:normalizeResearch };
    return (map[key] || (item => base(item, 'v46_record')))(value);
  }

  return Object.freeze({ SCHEMA_VERSION, COLLECTIONS, DORM_ASSIGNMENT_STATUS, COMMITTEE_GRADES, RESEARCH_STAGES, DEFAULT_COMMITTEE_ROLES,
    studentReference, normalizeRecord, normalizeBuilding, normalizeRoom, normalizeBatch, normalizeAssignment, normalizeTransfer,
    normalizeRole, normalizeEvaluation, normalizeFamilyContact, normalizeWorklogDraft, normalizeResearch,
    utilities, dorm, committee, familyContacts, worklogDrafts, research, analysis,
    createWorklogDraft, classSummary, compareClasses, drillDown,
  });
});
