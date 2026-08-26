/* Schema-v8 normalizers and student-profile aggregation for upgraded business records. */
(function installCwbBusiness(root) {
  'use strict';

  const SCHEMA_VERSION = 8;
  const text = value => String(value == null ? '' : value).trim();
  const number = (value, fallback = '') => {
    if (value === '' || value == null) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const nonNegative = value => Math.max(0, number(value, 0));
  const now = () => new Date().toISOString();
  const id = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  function base(input, prefix) {
    const value = Object.assign({}, input || {});
    const at = now();
    return Object.assign(value, {
      id:text(value.id) || id(prefix),
      schema_version:SCHEMA_VERSION,
      student_id:text(value.student_id),
      student_number:text(value.student_number),
      student_name:text(value.student_name),
      class_name:text(value.class_name),
      created_at:text(value.created_at) || at,
      updated_at:at,
    });
  }

  function normalizeAssessment(input) {
    const value = base(input, 'assessment');
    return Object.assign(value, {
      term:text(value.term),
      score:number(value.score, ''),
      rank:Math.max(0, Math.floor(number(value.rank, 0))) || '',
      level:text(value.level),
      awards:text(value.awards),
      activities:text(value.activities),
      status:text(value.status) || '已登记',
      note:text(value.note),
    });
  }

  function normalizeAcademicTerm(input) {
    const value = base(input, 'academic_term');
    return Object.assign(value, {
      term:text(value.term),
      failed_count:Math.floor(nonNegative(value.failed_count)),
      warning_level:text(value.warning_level) || '无',
      average_score:number(value.average_score, ''),
      earned_credits:nonNegative(value.earned_credits),
      status:text(value.status) || '已登记',
      source:text(value.source) || '人工登记',
      note:text(value.note),
    });
  }

  function normalizeDiscipline(input) {
    const value = base(input, 'discipline');
    const relieved = value.relieved === true || ['true', '1', 'yes', '是', '已解除', '解除'].includes(text(value.relieved).toLowerCase());
    return Object.assign(value, {
      category:text(value.category) || '处分',
      level:text(value.level),
      decision_date:text(value.decision_date || value.date),
      relieved,
      relief_date:text(value.relief_date),
      status:text(value.status) || (relieved ? '已解除' : '生效中'),
      document_attachment_id:text(value.document_attachment_id),
      document_name:text(value.document_name),
      summary:text(value.summary),
      note:text(value.note),
    });
  }

  function normalizeAid(input) {
    const value = base(input, 'aid');
    return Object.assign(value, {
      term:text(value.term),
      aid_type:text(value.aid_type) || '困难认定',
      difficulty_level:text(value.difficulty_level),
      amount:nonNegative(value.amount),
      status:text(value.status) || '待落实',
      issued_at:text(value.issued_at || value.date),
      source:text(value.source),
      note:text(value.note),
    });
  }

  function studentReference(value) {
    if (value && typeof value === 'object') return { id:text(value.id || value.student_id), number:text(value.student_number || value.number) };
    return { id:'', number:text(value) };
  }

  function byStudent(rows, student) {
    const reference = studentReference(student);
    return (Array.isArray(rows) ? rows : []).filter(item => {
      const recordId = text(item && item.student_id);
      if (recordId && reference.id) return recordId === reference.id;
      return !!reference.number && text(item && item.student_number) === reference.number;
    });
  }

  function buildStudentProfile(student, sources) {
    const reference = studentReference(student);
    const input = sources || {};
    const assessments = byStudent(input.assessments, reference);
    const academicTerms = byStudent(input.academicTerms, reference);
    const disciplines = byStudent(input.disciplines, reference);
    const aids = byStudent(input.aids, reference);
    const intents = byStudent(input.employmentIntents, reference);
    const contacts = byStudent(input.employmentContacts, reference);
    const events = [
      assessments.map(item => ({ date:item.term, type:'综测', title:item.level || '综合测评', detail:item.score === '' ? item.note : `成绩 ${item.score}` })),
      academicTerms.map(item => ({ date:item.term, type:'学业', title:`${item.warning_level}预警`, detail:`不及格 ${item.failed_count} 门` })),
      disciplines.map(item => ({ date:item.decision_date, type:'处分', title:item.category, detail:item.relieved ? '已解除' : (item.status || '生效中') })),
      aids.map(item => ({ date:item.issued_at || item.term, type:'资助', title:item.aid_type, detail:item.amount ? `金额 ${item.amount}` : (item.status || '') })),
    ].flat().filter(item => item.date || item.title).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return {
      student_id:reference.id,
      student_number:reference.number,
      assessment_count:assessments.length,
      academic_term_count:academicTerms.length,
      active_discipline_count:disciplines.filter(item => !item.relieved).length,
      aid_count:aids.length,
      employment_intent_count:intents.length,
      employment_contact_count:contacts.length,
      latest_assessment:assessments.slice().sort((a, b) => String(b.term || '').localeCompare(String(a.term || '')))[0] || null,
      latest_academic_term:academicTerms.slice().sort((a, b) => String(b.term || '').localeCompare(String(a.term || '')))[0] || null,
      events,
    };
  }

  root.CWBBusiness = {
    schemaVersion:SCHEMA_VERSION,
    normalizeAssessment,
    normalizeAcademicTerm,
    normalizeDiscipline,
    normalizeAid,
    buildStudentProfile,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
