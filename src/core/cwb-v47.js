/* v4.7 local-first business rules. The module contains no storage or DOM code
 * so the same validation applies to browser, portable HTML and Electron. */
(function installCwbV47(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.CWBV47 = api;
    root.CWB = root.CWB || {};
    root.CWB.v47 = api;
    root.CWB.classChecks = api.classChecks;
    root.CWB.rollCall = api.rollCall;
    root.CWB.dorm = Object.assign({}, root.CWB.dorm || {}, api.dorm);
    root.CWB.assessment = api.assessment;
    root.CWB.tools = api.tools;
    root.CWB.employmentSafety = api.employment.safety;
    root.CWB.competitions = api.competitions;
    root.CWB.analysis = Object.assign({}, root.CWB.analysis || {}, { academicSummary:api.academicSummary });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbV47() {
  'use strict';

  const SCHEMA_VERSION = 10;
  const now = () => new Date().toISOString();
  const dateToday = () => now().slice(0, 10);
  const text = value => String(value == null ? '' : value).trim();
  const number = (value, fallback = 0) => {
    if (value === '' || value == null) return fallback;
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };
  const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
  const clone = value => value == null ? value : (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const id = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const unique = values => [...new Set(list(values).map(text).filter(Boolean))];

  const COLLECTIONS = Object.freeze([
    'v4_class_checks', 'v4_roll_call_sessions', 'v4_dorm_inspections', 'v4_dorm_exceptions',
    'v4_assessment_rules', 'v4_assessment_entries', 'v4_tool_links', 'v4_employment_safety',
    'v4_competition_resources', 'v4_competition_entries',
  ]);
  const CLASS_CHECK_STATUSES = Object.freeze(['未查', '已查', '异常', '已处理']);
  const ROLL_CALL_MODES = Object.freeze(['随机点名', '全体点名', '大屏准备']);
  const DORM_INSPECTION_RESULTS = Object.freeze(['合格', '一般问题', '存在异常', '未完成']);
  const DORM_EXCEPTION_LEVELS = Object.freeze(['提示', '一般', '重要', '紧急']);
  const DORM_EXCEPTION_STATUSES = Object.freeze(['待处理', '处理中', '已关闭', '已驳回']);
  const ASSESSMENT_DIMENSIONS = Object.freeze(['道德素养', '专业技能', '文体', '文艺', '社会实践', '志愿服务', '创新创业', '其他']);
  const COMPETITION_STATUSES = Object.freeze(['待报名', '已报名', '进行中', '已获奖', '已结束', '未入选']);

  function base(input, prefix) {
    const value = Object.assign({}, input || {});
    const stamp = now();
    return Object.assign(value, {
      id: text(value.id) || id(prefix),
      schema_version: Math.max(SCHEMA_VERSION, Number(value.schema_version) || 0),
      created_at: text(value.created_at) || stamp,
      updated_at: stamp,
    });
  }

  function studentReference(value, options) {
    const source = value || {};
    const opts = options || {};
    return {
      student_id: text(source.student_id || source.studentId || (opts.studentObject === true ? source.id : '')),
      student_number: text(source.student_number || source.number),
      student_name: text(source.student_name || source.full_name || source.name),
      class_name: text(source.class_name || source.class),
      student_gender: text(source.student_gender || source.gender || source.sex),
    };
  }

  function normalizeClassCheck(input) {
    const value = base(input, 'class_check');
    const status = text(value.status) || '未查';
    return Object.assign(value, {
      schedule_id: text(value.schedule_id || value.scheduleId), class_name: text(value.class_name || value.class),
      course: text(value.course || value.course_name), date: text(value.date || value.check_date) || dateToday(),
      teaching_week: text(value.teaching_week || value.week), weekday: text(value.weekday), start_period: number(value.start_period || value.start, 0),
      end_period: number(value.end_period || value.end, 0), classroom: text(value.classroom || value.room), checker: text(value.checker),
      status: CLASS_CHECK_STATUSES.includes(status) ? status : '未查', present_count: Math.max(0, number(value.present_count, 0)),
      absent_count: Math.max(0, number(value.absent_count || value.missing_count, 0)), late_count: Math.max(0, number(value.late_count, 0)),
      findings: text(value.findings || value.note), measures: text(value.measures || value.action), attachment_ids: unique(value.attachment_ids),
      student_ids: unique(value.student_ids), worklog_draft_id: text(value.worklog_draft_id),
    });
  }

  function normalizeRollCall(input) {
    const value = base(input, 'roll_call');
    const mode = text(value.mode) || '随机点名';
    return Object.assign(value, {
      date: text(value.date) || dateToday(), class_names: unique(value.class_names || value.classes), class_name: text(value.class_name),
      teaching_week: text(value.teaching_week), mode: ROLL_CALL_MODES.includes(mode) ? mode : '随机点名',
      candidate_student_ids: unique(value.candidate_student_ids || value.participant_student_ids), selected_student_ids: unique(value.selected_student_ids || value.result_student_ids),
      selected_count: Math.max(0, number(value.selected_count || value.count, 0)), random_seed: text(value.random_seed || value.seed),
      reviewed: value.reviewed === true, converted_worklog: value.converted_worklog === true, note: text(value.note),
    });
  }

  function normalizeDormInspection(input) {
    const value = base(input, 'dorm_inspection');
    const result = text(value.result) || '未完成';
    return Object.assign(value, {
      batch_id: text(value.batch_id), building_id: text(value.building_id), room_id: text(value.room_id),
      building_name: text(value.building_name), room_number: text(value.room_number || value.room), date: text(value.date || value.inspection_date) || dateToday(),
      inspector: text(value.inspector || value.checker), result: DORM_INSPECTION_RESULTS.includes(result) ? result : '未完成',
      summary: text(value.summary || value.findings), student_ids: unique(value.student_ids), attachment_ids: unique(value.attachment_ids),
      exception_ids: unique(value.exception_ids), worklog_draft_id: text(value.worklog_draft_id),
    });
  }

  function normalizeDormException(input) {
    const value = base(input, 'dorm_exception');
    const level = text(value.level) || '一般'; const status = text(value.status) || '待处理';
    return Object.assign(value, {
      inspection_id: text(value.inspection_id), building_id: text(value.building_id), room_id: text(value.room_id),
      student_id: text(value.student_id), student_number: text(value.student_number), student_name: text(value.student_name),
      category: text(value.category) || '卫生安全', level: DORM_EXCEPTION_LEVELS.includes(level) ? level : '一般',
      description: text(value.description || value.note), due_date: text(value.due_date), status: DORM_EXCEPTION_STATUSES.includes(status) ? status : '待处理',
      result: text(value.result || value.resolution), closed_at: text(value.closed_at), operator: text(value.operator), attachment_ids: unique(value.attachment_ids),
    });
  }

  function normalizeAssessmentRule(input) {
    const value = base(input, 'assessment_rule');
    const dimensions = list(value.dimensions).map(item => typeof item === 'object' ? Object.assign({}, item, { name:text(item.name || item.label), weight:number(item.weight, 1), max:number(item.max, 0), min:number(item.min, 0) }) : { name:text(item), weight:1, max:0, min:0 });
    return Object.assign(value, {
      term: text(value.term), version: text(value.version) || 'v1', dimensions: dimensions.filter(item => item.name),
      base_score: number(value.base_score || value.base, 0), grade_thresholds: clone(value.grade_thresholds || {}), enabled: value.enabled !== false,
      note: text(value.note),
    });
  }

  function normalizeAssessmentEntry(input) {
    const value = base(input, 'assessment_entry'); const ref = studentReference(value);
    return Object.assign(value, ref, {
      term: text(value.term), dimension: text(value.dimension) || '其他', score: number(value.score || value.points, 0),
      direction: text(value.direction) === '扣分' || number(value.score || value.points, 0) < 0 ? '扣分' : '加分', source: text(value.source || value.origin),
      evidence_attachment_ids: unique(value.evidence_attachment_ids || value.attachment_ids), verified: value.verified === true, note: text(value.note),
    });
  }

  function normalizeToolLink(input) {
    const value = base(input, 'tool_link');
    return Object.assign(value, { name:text(value.name || value.title), category:text(value.category) || '日常材料', url:text(value.url), description:text(value.description || value.note), order:number(value.order, 0), favorite:value.favorite === true, verification_status:text(value.verification_status) || '待核验', checked_at:text(value.checked_at) });
  }

  function normalizeEmploymentSafety(input) {
    const value = base(input, 'employment_safety');
    const level = text(value.risk_level) || '提示';
    return Object.assign(value, { organization:text(value.organization || value.name), type:text(value.type) || '用人单位', risk_level:['安全','提示','高风险'].includes(level) ? level : '提示', reason:text(value.reason), source_url:text(value.source_url || value.url), checked_at:text(value.checked_at || value.verified_at), note:text(value.note) });
  }

  function normalizeCompetitionResource(input) {
    const value = base(input, 'competition_resource');
    return Object.assign(value, { category:text(value.category) || '综合类', name:text(value.name || value.title), organizer:text(value.organizer || value.host), official_url:text(value.official_url || value.url), registration_url:text(value.registration_url || value.apply_url), deadline:text(value.deadline), source:text(value.source), verification_status:text(value.verification_status) || '待核验', checked_at:text(value.checked_at), note:text(value.note) });
  }

  function normalizeCompetitionEntry(input) {
    const value = base(input, 'competition_entry'); const ref = studentReference(value); const status = text(value.status) || '待报名';
    return Object.assign(value, ref, { competition_id:text(value.competition_id), project_name:text(value.project_name || value.project), role:text(value.role), division:text(value.division || value.work), status:COMPETITION_STATUSES.includes(status) ? status : '待报名', award_level:text(value.award_level), attachment_ids:unique(value.attachment_ids), note:text(value.note) });
  }

  function normalizeRecord(collection, input) {
    const map = {
      v4_class_checks:normalizeClassCheck, v4_roll_call_sessions:normalizeRollCall, v4_dorm_inspections:normalizeDormInspection,
      v4_dorm_exceptions:normalizeDormException, v4_assessment_rules:normalizeAssessmentRule, v4_assessment_entries:normalizeAssessmentEntry,
      v4_tool_links:normalizeToolLink, v4_employment_safety:normalizeEmploymentSafety, v4_competition_resources:normalizeCompetitionResource, v4_competition_entries:normalizeCompetitionEntry,
    };
    return (map[text(collection)] || (value => base(value, 'v47_record')))(input || {});
  }

  function filterRows(rows, options, dateKey) {
    const opts = options || {}; const from = text(opts.from); const to = text(opts.to); const term = text(opts.term); const className = text(opts.class_name || opts.className);
    return list(rows).filter(item => {
      const date = text(item && (item[dateKey || 'date'] || item.created_at));
      return (!from || date >= from) && (!to || date <= to) && (!term || text(item.term || item.academic_term) === term) && (!className || text(item.class_name || item.class) === className);
    });
  }

  const classChecks = Object.freeze({
    create: normalizeClassCheck,
    list(rows, options) { return filterRows(rows, options, 'date').sort((a, b) => `${a.date}${a.start_period}`.localeCompare(`${b.date}${b.start_period}`)); },
    summary(rows, options) {
      const values = filterRows(rows, options, 'date');
      return { total:values.length, checked:values.filter(item => item.status === '已查').length, pending:values.filter(item => item.status === '未查').length, abnormal:values.filter(item => item.status === '异常').length, resolved:values.filter(item => item.status === '已处理').length, absent:values.reduce((sum, item) => sum + number(item.absent_count, 0), 0), late:values.reduce((sum, item) => sum + number(item.late_count, 0), 0) };
    },
  });

  let seedCounter = 0;
  function seedNumber(seed) { let state = 2166136261; for (const char of text(seed)) { state ^= char.charCodeAt(0); state = Math.imul(state, 16777619); } return state >>> 0 || 1; }
  function randomFor(seed) { if (text(seed)) { let state = seedNumber(seed); return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; } const cryptoApi = typeof globalThis !== 'undefined' && globalThis.crypto; if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') return () => cryptoApi.getRandomValues(new Uint32Array(1))[0] / 4294967296; return Math.random; }
  function shuffle(values, seed) { const result = values.slice(); const random = randomFor(seed); for (let index = result.length - 1; index > 0; index -= 1) { const other = Math.floor(random() * (index + 1)); [result[index], result[other]] = [result[other], result[index]]; } return result; }
  function generatedSeed() { seedCounter += 1; return `roll_${Date.now()}_${seedCounter}_${Math.random().toString(36).slice(2, 8)}`; }
  function rollCandidates(students, options) {
    const opts = options || {}; const classNames = new Set(unique(opts.class_names || opts.classes));
    return list(students).filter(student => { const ref = studentReference(student, { studentObject:true }); return (!classNames.size || classNames.has(ref.class_name)) && (!text(opts.class_name) || ref.class_name === text(opts.class_name)) && (!opts.student_ids || unique(opts.student_ids).includes(ref.student_id)); }).filter(student => { const ref = studentReference(student, { studentObject:true }); return ref.student_id || ref.student_number; });
  }
  const rollCall = Object.freeze({
    prepare(options) {
      const opts = options || {}; const candidates = rollCandidates(opts.students, opts); const seed = text(opts.seed) || generatedSeed(); const count = Math.max(1, Math.min(candidates.length || 1, Math.floor(number(opts.count, 1))));
      return { seed, count, candidates:candidates.map(student => studentReference(student, { studentObject:true })), candidate_student_ids:candidates.map(student => studentReference(student, { studentObject:true }).student_id).filter(Boolean), class_names:unique(opts.class_names || opts.classes), mode:text(opts.mode) || '随机点名', prepared_at:now() };
    },
    run(options) {
      const prepared = options && options.prepared ? options.prepared : this.prepare(options); const count = prepared.candidates.length ? Math.min(prepared.count, prepared.candidates.length) : 0; const picked = shuffle(prepared.candidates, prepared.seed).slice(0, count); return normalizeRollCall(Object.assign({}, prepared, { id:undefined, selected_count:count, selected_student_ids:picked.map(item => item.student_id).filter(Boolean), result:picked, reviewed:false }));
    },
    save(session, options) { return normalizeRollCall(Object.assign({}, session || {}, options || {}, { reviewed:options && options.reviewed === true })); },
  });

  const dorm = Object.freeze({
    inspections:Object.freeze({ create:normalizeDormInspection, list(rows, options) { return filterRows(rows, options, 'date'); }, summary(rows, options) { const values = filterRows(rows, options, 'date'); return { total:values.length, pass:values.filter(item => item.result === '合格').length, issues:values.filter(item => item.result === '一般问题' || item.result === '存在异常').length, unfinished:values.filter(item => item.result === '未完成').length }; } }),
    exceptions:Object.freeze({ create:normalizeDormException, list(rows, options) { const values = list(rows).map(normalizeDormException); const opts = options || {}; return values.filter(item => (!opts.status || item.status === opts.status) && (!opts.level || item.level === opts.level) && (!opts.building_id || item.building_id === opts.building_id)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))); }, resolve(record, options) { const opts = options || {}; return normalizeDormException(Object.assign({}, record || {}, opts, { status:'已关闭', closed_at:opts.closed_at || now(), result:opts.result || opts.resolution || record && record.result })); } }),
  });

  function assessmentTotals(entries, rules, options) {
    const opts = options || {}; const values = list(entries).map(normalizeAssessmentEntry).filter(item => (!opts.term || item.term === opts.term) && (!opts.class_name || item.class_name === opts.class_name) && (!opts.student_id || item.student_id === opts.student_id));
    const rule = list(rules).map(normalizeAssessmentRule).find(item => item.term === text(opts.term) && item.enabled !== false) || list(rules).map(normalizeAssessmentRule).find(item => item.enabled !== false);
    const baseScore = number(rule && rule.base_score, 0); const byStudent = new Map();
    values.forEach(item => { const key = item.student_id || item.student_number || item.student_name; if (!key) return; const row = byStudent.get(key) || { student_id:item.student_id, student_number:item.student_number, student_name:item.student_name, class_name:item.class_name, term:item.term, base_score:baseScore, add_score:0, deduct_score:0, dimensions:{} }; const score = Math.abs(number(item.score, 0)); if (item.direction === '扣分' || number(item.score, 0) < 0) row.deduct_score += score; else row.add_score += score; row.dimensions[item.dimension] = number(row.dimensions[item.dimension], 0) + (item.direction === '扣分' || number(item.score, 0) < 0 ? -score : score); byStudent.set(key, row); });
    const result = [...byStudent.values()].map(row => Object.assign(row, { final_score:row.base_score + row.add_score - row.deduct_score })); result.sort((a, b) => b.final_score - a.final_score || String(a.student_name).localeCompare(String(b.student_name), 'zh-CN')); result.forEach((row, index) => { row.rank = index + 1; }); return { term:text(opts.term), rule:rule || null, rows:result, dimensions:unique(values.map(item => item.dimension)), generated_at:now() };
  }
  const assessment = Object.freeze({ rules:Object.freeze({ create:normalizeAssessmentRule, list:rows => list(rows).map(normalizeAssessmentRule) }), entries:Object.freeze({ create:normalizeAssessmentEntry, list:(rows, options) => filterRows(list(rows).map(normalizeAssessmentEntry), options, 'created_at') }), totals:assessmentTotals });

  function validHttps(url) { try { const parsed = new URL(text(url)); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch (_) { return false; } }
  const tools = Object.freeze({
    links:Object.freeze({ create:normalizeToolLink, list(rows, options) { const opts = options || {}; return list(rows).map(normalizeToolLink).filter(item => (!opts.category || item.category === opts.category) && (!opts.query || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(text(opts.query).toLowerCase()))).sort((a, b) => number(a.order) - number(b.order) || a.name.localeCompare(b.name, 'zh-CN')); }, validateUrl:url => validHttps(url) }),
  });
  const employment = Object.freeze({ safety:Object.freeze({ create:normalizeEmploymentSafety, list:(rows, options) => list(rows).map(normalizeEmploymentSafety).filter(item => !options || !options.risk_level || item.risk_level === options.risk_level).sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at))), validateUrl:validHttps }) });
  const competitions = Object.freeze({ resources:Object.freeze({ create:normalizeCompetitionResource, list:(rows, options) => list(rows).map(normalizeCompetitionResource).filter(item => !options || !options.category || item.category === options.category).sort((a, b) => String(a.deadline).localeCompare(String(b.deadline))) }), entries:Object.freeze({ create:normalizeCompetitionEntry, list:(rows, options) => list(rows).map(normalizeCompetitionEntry).filter(item => !options || !options.student_id || item.student_id === options.student_id) }) });

  function academicSummary(options) {
    const opts = options || {}; const grades = list(opts.grades).filter(item => !opts.term || text(item.term || item.academic_term || item.semester) === text(opts.term)); const rows = new Map();
    grades.forEach(item => { const ref = studentReference(item, { studentObject:true }); const key = ref.student_id || ref.student_number || ref.student_name; if (!key) return; const row = rows.get(key) || Object.assign(ref, { courses:0, failed_courses:0, score_total:0, score_count:0, gpa_total:0, gpa_count:0, warning:false }); const score = number(item.score, NaN); const gpa = number(item.gpa || item.grade_point, NaN); row.courses += 1; if (item.failed === true || item.failed === '是' || Number.isFinite(score) && score < 60) row.failed_courses += 1; if (Number.isFinite(score)) { row.score_total += score; row.score_count += 1; } if (Number.isFinite(gpa)) { row.gpa_total += gpa; row.gpa_count += 1; } row.warning = row.warning || item.warning === true || item.warning === '是'; rows.set(key, row); });
    const result = [...rows.values()].map(row => Object.assign(row, { average_score:row.score_count ? Math.round(row.score_total / row.score_count * 100) / 100 : null, gpa:row.gpa_count ? Math.round(row.gpa_total / row.gpa_count * 100) / 100 : null }));
    return { term:text(opts.term), rows:result, totals:{ student_count:result.length, failed_students:result.filter(item => item.failed_courses > 0).length, warning_students:result.filter(item => item.warning).length }, generated_at:now() };
  }

  return Object.freeze({ SCHEMA_VERSION, COLLECTIONS, CLASS_CHECK_STATUSES, ROLL_CALL_MODES, DORM_INSPECTION_RESULTS, DORM_EXCEPTION_LEVELS, DORM_EXCEPTION_STATUSES, ASSESSMENT_DIMENSIONS, COMPETITION_STATUSES,
    studentReference, normalizeRecord, normalizeClassCheck, normalizeRollCall, normalizeDormInspection, normalizeDormException, normalizeAssessmentRule, normalizeAssessmentEntry, normalizeToolLink, normalizeEmploymentSafety, normalizeCompetitionResource, normalizeCompetitionEntry,
    classChecks, rollCall, dorm, assessment, tools, employment, competitions, academicSummary,
  });
});
