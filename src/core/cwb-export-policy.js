/* Minimal outbound views for platform exchange and leadership integrations. */
(function installCwbExportPolicy(root) {
  'use strict';

  const HIGH_SENSITIVITY_COLLECTIONS = Object.freeze([
    'focus', 'psych', 'grant', 'v4_disciplines', 'v4_aid_records', 'records_crisis_cases',
  ]);
  const NARRATIVE_KEYS = /(?:note|summary|reason|measure|action|follow|concern|suggestion|judge|description|content|remark|address|hometown|origin|dorm|family|crisis_way|emergency|parent_name|politics|discipline|punish|grant|aid|psych|focus|warning|预警|心理|资助|处分|重点|原因|措施|研判|家长|家庭|住址|备注)/i;
  const SECRET_KEYS = /(?:password|pass_hash|secret|token|api[_-]?key|data_base64|blob|ciphertext|private_key|relay)/i;
  const SAFE_KEYS = new Set([
    'id', 'student_id', 'class_name', 'major_name', 'college_name', 'grade', 'student_level', 'student_type',
    'gender', 'enrollment_status', 'enrollment_date', 'graduation_date', 'academic_score', 'credits', 'class_rank',
    'date', 'due', 'start', 'end', 'term', 'created_at', 'updated_at', 'status', 'duty', 'priority', 'category',
    'type', 'way', 'source', 'title', 'project', 'organizer', 'url', 'tags', 'region', 'audience', 'verified_at',
    'favorite', 'employment_status', 'salary_range', 'position', 'stage', 'count', 'total', 'completed',
  ]);

  const text = value => String(value == null ? '' : value).trim();
  const clone = value => {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
  };
  function maskTail(value, keep = 2) {
    const raw = text(value);
    if (!raw) return '';
    const visible = Math.max(0, Math.min(keep, raw.length));
    return '*'.repeat(Math.max(1, raw.length - visible)) + raw.slice(-visible);
  }
  function maskPhone(value) { return maskTail(value, 4); }
  function maskName(value) {
    const raw = text(value);
    if (!raw) return '';
    const chars = Array.from(raw);
    return chars.length <= 1 ? '*' : chars[0] + '*'.repeat(Math.max(1, chars.length - 1));
  }
  function maskEmail(value) {
    const raw = text(value);
    const at = raw.indexOf('@');
    if (at <= 0) return raw ? maskTail(raw, 2) : '';
    return maskTail(raw.slice(0, at), 1) + raw.slice(at);
  }
  function riskCode(value) {
    const raw = text(value).toLowerCase();
    if (!raw) return '';
    if (/校级|红|一级|严重|重度|高/.test(raw)) return 'C1';
    if (/院级|橙|二级|中度|中/.test(raw)) return 'C2';
    if (/班级|黄|三级|轻度|低/.test(raw)) return 'C3';
    return 'C0';
  }
  function safePrimitive(key, value, output, source) {
    if (value == null || typeof value === 'function') return;
    const name = String(key || '');
    if (SECRET_KEYS.test(name) || NARRATIVE_KEYS.test(name)) return;
    if (name === 'student_id') { output.student_id = text(value); return; }
    if (name === 'student_number' || name === 'student_no') { output.student_number_masked = maskTail(value, 2); return; }
    if (name === 'full_name' || name === 'student_name' || name === 'name') {
      if (source && (source.student_id || source.student_number || name !== 'name')) output[`${name}_masked`] = maskName(value);
      return;
    }
    if (/(?:^|_)(?:phone|mobile|telephone|tel)(?:$|_)/i.test(name)) { output[`${name}_masked`] = maskPhone(value); return; }
    if (name === 'id_card' || /身份证/.test(name)) { output.id_card_masked = maskTail(value, 4); return; }
    if (name === 'email') { output.email_masked = maskEmail(value); return; }
    if (name === 'crisis_level') { output.crisis_code = riskCode(value); return; }
    if (name === 'crisis_relieved') { output.crisis_status = value ? 'closed' : 'active'; return; }
    if (name === 'focus' && Array.isArray(value)) { output.has_focus = value.length > 0; return; }
    if (name === 'focus_level') { output.attention_code = riskCode(value); return; }
    if (Array.isArray(value) || typeof value === 'object') return;
    if (SAFE_KEYS.has(name)) output[name] = typeof value === 'string' ? text(value) : value;
  }
  function sanitizeRecord(record, collection) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    if (HIGH_SENSITIVITY_COLLECTIONS.includes(String(collection || ''))) return null;
    const output = {};
    Object.entries(record).forEach(([key, value]) => safePrimitive(key, value, output, record));
    if (String(collection || '') === 'students' && !output.student_id && record.id) output.student_id = text(record.id);
    if (record.student_id && !output.student_id) output.student_id = text(record.student_id);
    if (record.student_number && !output.student_number_masked) output.student_number_masked = maskTail(record.student_number, 2);
    return Object.keys(output).length ? output : null;
  }
  function sanitizeRows(rows, collection) {
    return (Array.isArray(rows) ? rows : []).map(row => sanitizeRecord(row, collection)).filter(Boolean);
  }
  function sanitizeStats(stats) {
    const input = stats && typeof stats === 'object' ? stats : {};
    const output = {};
    Object.entries(input).forEach(([key, value]) => {
      if (key === 'by_duty' && Array.isArray(value)) {
        output.by_duty = value.map(row => ({
          duty:row && row.duty, duty_name:row && row.duty_name,
          tasks:Number(row && row.tasks) || 0, tasks_done:Number(row && row.tasks_done) || 0,
          talks:Number(row && row.talks) || 0,
        }));
      } else if (typeof value === 'number' && Number.isFinite(value)) output[key] = value;
    });
    return output;
  }
  function redactPackage(pkg, options) {
    const input = pkg && typeof pkg === 'object' ? pkg : {};
    const result = {
      package:'counselor-desk', package_version:Number(input.package_version) || 8,
      schema_version:Number(input.schema_version) || 8, app_version:text(input.app_version),
      exported_at:text(input.exported_at) || new Date().toISOString(), scope:clone(input.scope) || {},
      counselor:{ college_name:text(input.counselor && input.counselor.college_name), org_code:text(input.counselor && input.counselor.org_code) },
      privacy:{ mode:'platform_minimal', redacted:true, stable_student_id:true, raw_identity:false,
        excluded_collections:[...HIGH_SENSITIVITY_COLLECTIONS, 'attachments', 'workspace', 'audit_log', 'v4_ai_providers', 'v4_ai_audit', 'v4_ai_consents', 'v4_ai_drafts', 'v4_ai_suggestions', 'v4_ai_sources'],
        excluded_fields:['姓名','学号','手机号/家长联系方式','身份证号','心理与危机原文','资助与处分原文','谈话正文','附件正文','工作区历史'],
        purpose:text(options && options.purpose) || 'platform_exchange',
      },
      stats:sanitizeStats(input.stats), workspace:null,
    };
    const canonical = ['students','tasks','talks','stay','leave','honor','orgs','party','rewards','activities','grades','worklogs','pleave','attend','node','warn','help','grant','focus','psych','graduate','policy','material','comp','tpl','learning_materials','learning_notes','learning_sessions'];
    canonical.forEach(collection => {
      result[collection] = HIGH_SENSITIVITY_COLLECTIONS.includes(collection) ? [] : sanitizeRows(input[collection], collection);
    });
    const custom = {};
    const customInput = input.custom && typeof input.custom === 'object' ? input.custom : {};
    ['v4_employment_resources','v4_employment_intents','v4_employment_contacts'].forEach(collection => {
      custom[collection] = sanitizeRows(customInput[collection], collection);
    });
    result.custom = custom;
    return result;
  }

  root.CWBExportPolicy = Object.freeze({
    version:1,
    highSensitivityCollections:HIGH_SENSITIVITY_COLLECTIONS,
    maskTail, maskPhone, maskName, maskEmail, riskCode,
    sanitizeRecord, sanitizeRows, redactPackage,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
