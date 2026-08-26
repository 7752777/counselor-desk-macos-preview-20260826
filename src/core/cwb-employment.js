/* Schema-v8 normalizers for employment intention and contact records. */
(function installEmployment(root) {
  'use strict';
  const SCHEMA_VERSION = 8;
  const text = value => String(value == null ? '' : value).trim();
  const year = value => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 1900 ? Math.floor(parsed) : ''; };
  const now = () => new Date().toISOString();
  const id = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  function normalizeIntent(input) {
    const value = Object.assign({}, input || {});
    const at = now();
    return Object.assign(value, {
      id:text(value.id) || id('employment_intent'),
      schema_version:SCHEMA_VERSION,
      student_id:text(value.student_id),
      student_number:text(value.student_number),
      student_name:text(value.student_name),
      graduation_year:year(value.graduation_year),
      status:text(value.status) || '待填报',
      direction:text(value.direction),
      expected_role:text(value.expected_role),
      preferred_region:text(value.preferred_region),
      preferred_industry:text(value.preferred_industry),
      expected_salary:text(value.expected_salary),
      needs_help:text(value.needs_help),
      note:text(value.note),
      created_at:text(value.created_at) || at,
      updated_at:at,
    });
  }

  function normalizeContact(input) {
    const value = Object.assign({}, input || {});
    const at = now();
    return Object.assign(value, {
      id:text(value.id) || id('employment_contact'),
      schema_version:SCHEMA_VERSION,
      student_id:text(value.student_id),
      student_number:text(value.student_number),
      student_name:text(value.student_name),
      contacted_at:text(value.contacted_at) || at.slice(0, 10),
      channel:text(value.channel) || '面谈',
      contact_type:text(value.contact_type) || '就业指导',
      summary:text(value.summary),
      outcome:text(value.outcome),
      next_action:text(value.next_action),
      next_at:text(value.next_at),
      operator:text(value.operator),
      status:text(value.status) || '已记录',
      created_at:text(value.created_at) || at,
      updated_at:at,
    });
  }

  root.CWBEmployment = { schemaVersion:SCHEMA_VERSION, normalizeIntent, normalizeContact };
})(typeof globalThis !== 'undefined' ? globalThis : window);
