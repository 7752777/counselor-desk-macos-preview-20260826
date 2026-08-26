const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const v46Ui = fs.readFileSync('src/core/cwb-v46-ui.js', 'utf8');

assert.match(html, /data-v4-employment-category/, 'employment page should expose category filter');
assert.match(html, /data-v4-employment-audience/, 'employment page should expose audience filter');
assert.match(html, /data-v4-employment-status/, 'employment page should expose status filter');
assert.match(html, /data-v4-employment-favorites/, 'employment page should expose favorite-only filter');
assert.match(html, /data-act="v4-employment-favorite"/, 'employment cards should expose favorite action');
assert.match(html, /data-act="v4-employment-edit"/, 'employment cards should expose edit action');
assert.match(html, /data-act="v4-employment-csv-export"/, 'employment page should expose CSV export');
assert.match(html, /data-act="v4-employment-csv-import"/, 'employment page should expose CSV import');

assert.match(html, /data-ai-range-from/, 'AI page should expose summary start date');
assert.match(html, /data-ai-range-to/, 'AI page should expose summary end date');
assert.match(html, /data-act="ai-summary-generate"/, 'AI page should expose date-scoped summary generation');
assert.match(html, /data-act="ai-summary-confirm"/, 'AI page should expose confirmed worklog action');
assert.match(html, /data-act="ai-cancel"/, 'AI page should expose cancellation action');
assert.match(html, /aiRunDraft\([^\n]*signal/, 'AI runner should pass cancellation signal');

assert.match(html, /CWB\.ai\.createCertificateDraft/, 'certificate handler should create governed draft');
assert.match(html, /CWB\.ai\.confirmCertificateDraft/, 'certificate handler should confirm governed draft');
assert.doesNotMatch(html, /DB\.rewards\.push\(/, 'certificate workflow must not write rewards directly from UI handler');
assert.match(html, /const PHONE_SYNC_CUSTOM_KEYS = CWB_COLLECTIONS\.custom/, 'phone sync should derive custom collections from manifest');
assert.match(html, /const workspaceCustomKeys = CWB_COLLECTIONS\.custom\.filter\(key => key !== 'v4_test_snapshots'\)/, 'workspace cleanup should derive custom collections from manifest while preserving snapshots');
for (const mode of ['table', 'cards', 'photo']) assert.match(html, new RegExp(`data-act="students-mode-${mode}"`), `students ledger should expose a dedicated ${mode} mode action`);
assert.match(html, /key:'student_photo'/, 'student profile editor should expose direct photo upload');
assert.match(html, /maskSensitivePhone/, 'student profile should mask sensitive phone values by default');
assert.match(html, /data-student-phone/, 'student profile should expose an audited full-phone action');
assert.match(v46Ui, /data-act=\"v46-analysis-details\"/, 'class analysis should gate personal detail behind an access-lock action');
assert.match(v46Ui, /term:s\.analysisTerm/, 'class analysis drill-down should preserve the selected term');
assert.match(html, /activity_id \|\| item\.id/, 'activity statistics should deduplicate by activity identity');
assert.match(html, /key:'reward_files'/, 'manual reward records should expose certificate attachment upload');
assert.match(html, /removeV4RecordAttachments/, 'reward record deletion should clean up orphaned attachments');
assert.match(v46Ui, /value\.source_hash\s*=\s*v46SourceHash\(currentSource, draft\.source_collection\)/, 'rechecking a changed worklog source should refresh its source hash');
assert.match(v46Ui, /WORKLOG_DRAFT_SOURCE_RECHECK_REQUIRED: '\u6765\u6e90\u8bb0\u5f55\u5df2\u53d8\u5316/, 'stale worklog drafts should use an actionable localized message');
assert.match(v46Ui, /WORKLOG_DRAFT_SOURCE_DELETED: '\u6765\u6e90\u8bb0\u5f55\u5df2\u5220\u9664/, 'deleted worklog sources should use an actionable localized message');

console.log('PASS remaining-optimization-ui');
