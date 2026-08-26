const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

(async () => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/Could not load script:.*(?:xlsx\.full\.min\.js|argon2-bundled\.min\.js|jszip\.min\.js|echarts\.min\.js)|Not implemented: HTMLCanvasElement\.prototype\.getContext/.test(error.message)) console.error(error);
  });
  const dom = await JSDOM.fromFile(path.join(__dirname, '..', 'output', 'v4-preview.html'), {
    runScripts:'dangerously', resources:'usable', url:'https://c.local/', pretendToBeVisual:true, virtualConsole,
    beforeParse(window) { window.requestAnimationFrame = callback => window.setTimeout(callback, 0); window.scrollTo = () => {}; },
  });
  await new Promise(resolve => setTimeout(resolve, 900));
  const cwb = dom.window.CWB;
  assert.ok(cwb && cwb.db && Array.isArray(cwb.db.students), 'demo workspace should initialize');
  assert.equal(cwb.db.students.length, 16, 'demo workspace should contain the expanded student set');
  assert.equal(new Set(cwb.db.students.map(row => row.id)).size, 16, 'demo students should have stable unique IDs');
  assert.equal(cwb.db.students.find(row => row.student_number === '2024010103').academic_score, '', 'one demo student should model pre-semester empty scores');
  for (const key of ['party', 'rewards', 'activities', 'grades', 'worklogs', 'learning_sessions']) {
    const rows = cwb.db[key];
    assert.ok(Array.isArray(rows) && rows.length > 0, `${key} should have a high-frequency experience record`);
    assert.ok(rows.every(row => row && row._demo === true), `${key} demo records must be marked as demo data`);
  }
  assert.ok(cwb.db.activities[0].participant_student_ids.every(id => cwb.db.students.some(student => student.id === id)), 'activity demo participants should resolve to stable student IDs');
  assert.ok(cwb.db.grades.every(row => row.student_id && cwb.db.students.some(student => student.id === row.student_id)), 'grade demos should resolve to stable student IDs');

  const expected = [
    'v4_dorm_buildings', 'v4_dorm_rooms', 'v4_dorm_assignments', 'v4_dorm_inspections', 'v4_dorm_exceptions',
    'v4_class_checks', 'v4_roll_call_sessions', 'v4_committee_evaluations', 'v4_family_contacts', 'v4_worklog_drafts',
    'v4_research_projects', 'v4_assessment_rules', 'v4_assessment_entries', 'v4_tool_links', 'v4_employment_safety',
    'v4_competition_resources', 'v4_competition_entries', 'v4_academic_terms', 'v4_aid_records', 'v4_form_templates',
    'v4_content_pushes', 'v4_work_categories', 'v4_contacts', 'v4_files', 'v4_activity_participants',
    'v4_employment_resources', 'v4_employment_intents', 'v4_employment_contacts',
  ];
  for (const key of expected) {
    const rows = cwb.db.custom[key];
    assert.ok(Array.isArray(rows) && rows.length > 0, `${key} should have an experience record`);
    assert.ok(rows.every(row => row && row._demo === true), `${key} demo records must be marked as demo data`);
  }
  for (const key of ['v4_sync_devices', 'v4_sync_outbox', 'v4_sync_conflicts', 'v4_backup_runs', 'v4_ai_providers', 'v4_ai_audit', 'v4_ai_consents']) {
    assert.equal((cwb.db.custom[key] || []).length, 0, `${key} must not be fabricated by demo seeding`);
  }
  const stableAssignment = cwb.db.custom.v4_dorm_assignments[0];
  assert.ok(stableAssignment.student_id && stableAssignment.student_id.startsWith('demo_student_'), 'business demos should use stable student IDs');
  dom.window.close();
  console.log('PASS demo-data-coverage');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
