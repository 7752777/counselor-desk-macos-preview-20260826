/* Shared collection manifest for browser, portable, desktop, and migration paths. */
(function installCwbCollections(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = { CWBCollections: api };
  if (root) root.CWBCollections = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCwbCollections() {
  'use strict';

  const canonical = Object.freeze([
    'students', 'tasks', 'talks', 'stay', 'leave', 'honor', 'orgs', 'party', 'rewards', 'activities',
    'grades', 'worklogs', 'pleave', 'attend', 'node', 'warn', 'help', 'grant', 'focus', 'psych',
    'graduate', 'policy', 'material', 'comp', 'tpl', 'learning_materials', 'learning_notes', 'learning_sessions',
  ]);
  const custom = Object.freeze([
    'v4_positions', 'v4_party_cases', 'v4_files', 'v4_employment_resources', 'v4_employment_intents',
    'v4_employment_contacts', 'v4_ai_providers', 'v4_ai_audit', 'v4_assessments', 'v4_academic_terms',
    'v4_disciplines', 'v4_aid_records', 'v4_ai_drafts', 'v4_ai_suggestions', 'v4_ai_sources', 'v4_ai_consents',
    'v4_contacts', 'v4_class_schedules', 'v4_activity_participants', 'v4_league_cases', 'v4_photo_queue', 'v4_test_snapshots',
    'v4_dorm_buildings', 'v4_dorm_rooms', 'v4_dorm_batches', 'v4_dorm_assignments', 'v4_dorm_transfers',
    'v4_committee_role_catalog', 'v4_committee_evaluations', 'v4_family_contacts', 'v4_worklog_drafts', 'v4_research_projects',
    'v4_class_checks', 'v4_roll_call_sessions', 'v4_dorm_inspections', 'v4_dorm_exceptions', 'v4_assessment_rules', 'v4_assessment_entries',
    'v4_tool_links', 'v4_employment_safety', 'v4_competition_resources', 'v4_competition_entries',
    'v4_sync_devices', 'v4_sync_outbox', 'v4_sync_conflicts', 'v4_sync_revisions', 'v4_backup_runs',
    'v4_student_field_catalog', 'v4_student_identity_conflicts', 'v4_form_templates', 'v4_form_jobs',
    'v4_student_class_history', 'v4_content_pushes', 'v4_content_reads', 'v4_work_categories',
  ]);
  const logical = Object.freeze([...canonical, ...custom]);
  const phoneSync = Object.freeze([...canonical, ...custom]);
  const auxiliaryDesktop = Object.freeze(['attachments', 'import_jobs', 'audit_log', 'meta', 'records_crisis_cases']);
  const customSet = new Set(custom);

  function isCustom(key) { return customSet.has(String(key || '')); }
  function logicalPath(key) { return isCustom(key) ? `custom.${key}` : String(key || ''); }
  function desktopName(key) {
    const value = String(key || '');
    return isCustom(value) ? `records_custom_${value}` : `records_${value}`;
  }
  function storagePaths() {
    return Object.freeze(Object.fromEntries(logical.map(key => [desktopName(key), logicalPath(key)])));
  }

  return Object.freeze({
    schemaVersion: 11,
    legacySchemaVersion: 8,
    canonical,
    custom,
    logical,
    workspace: logical,
    backup: logical,
    sync: phoneSync,
    phoneSync,
    auxiliaryDesktop,
    desktopCollections: Object.freeze([...logical.map(desktopName), ...auxiliaryDesktop]),
    isCustom,
    logicalPath,
    desktopName,
    storagePaths,
  });
});
