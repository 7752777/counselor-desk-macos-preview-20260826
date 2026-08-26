const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const coreSource = fs.readFileSync('src/core/cwb-ai.js', 'utf8');
const source = fs.readFileSync('src/core/cwb-ai-workflow.js', 'utf8');
const sandbox = { console, URL, setTimeout, clearTimeout };
sandbox.globalThis = sandbox;
vm.runInNewContext(coreSource, sandbox, { filename:'cwb-ai-core-for-workflow.js' });
vm.runInNewContext(source, sandbox, { filename:'cwb-ai-workflow.js' });

const workflow = sandbox.CWBAIWorkflow;
assert.ok(workflow, 'CWBAIWorkflow should be exposed');

const provider = {
  id:'provider-1',
  enabled:true,
  allowedPurposes:['work_summary'],
  dailyQuota:1,
};

assert.throws(
  () => workflow.authorize(provider, 'certificate_recognition', [], new Date('2026-08-17T10:00:00')),
  /AI_PURPOSE_NOT_ALLOWED/,
);
assert.throws(
  () => workflow.authorize(provider, 'work_summary', [{ action:'generate', purpose:'work_summary', status:'completed', created_at:'2026-08-17T01:00:00.000Z' }], new Date('2026-08-17T10:00:00')),
  /AI_DAILY_QUOTA_EXCEEDED/,
);
assert.throws(
  () => workflow.authorize({ enabled:false, allowedPurposes:['work_summary'] }, 'work_summary', []),
  /AI_PROVIDER_DISABLED/,
);

const decision = workflow.authorize(provider, 'work_summary', [], new Date('2026-08-17T10:00:00'));
assert.equal(decision.used, 0);
assert.equal(decision.remaining, 1);
const nonGenerationDecision = workflow.authorize(provider, 'work_summary', [
  { action:'consent_authorize', purpose:'work_summary', status:'completed', created_at:'2026-08-17T01:00:00.000Z' },
  { action:'suggestion_convert', purpose:'work_summary', status:'completed', created_at:'2026-08-17T02:00:00.000Z' },
], new Date('2026-08-17T10:00:00'));
assert.equal(nonGenerationDecision.used, 0, 'non-generation audit actions must not consume the model generation quota');
const aliasedDecision = workflow.authorize(provider, 'weekly_summary', [], new Date('2026-08-17T10:00:00'));
assert.equal(aliasedDecision.purpose, 'work_summary');
assert.equal(workflow.canonicalPurpose('risk_review'), 'warning_assist');
assert.equal(workflow.normalizeSuggestion({ purpose:'risk_review' }).risk_level, 'high');
const stableSuggestion = workflow.normalizeSuggestion({ id:'stable-suggestion', purpose:'work_summary', created_at:'2026-08-17T10:00:00.000Z', updated_at:'2026-08-17T11:00:00.000Z' });
assert.equal(stableSuggestion.updated_at, '2026-08-17T11:00:00.000Z', 'normalizing a stored suggestion must not rewrite its update time');
assert.equal(workflow.suggestionHasHumanConfirmation({ status:'accepted' }), false);
assert.equal(workflow.suggestionHasHumanConfirmation({ status:'accepted', human_confirmed_at:'2026-08-17T10:00:00.000Z', confirmation_method:'人工审核后采纳' }), true);
assert.equal(workflow.isPublicWebSourceUrl('https://[::ffff:127.0.0.1]/source'), false);
assert.equal(workflow.isPublicWebSourceUrl('https://[2001:db8::1]/source'), false);
assert.equal(workflow.isPublicWebSourceUrl('https://[2001:4860:4860::8888]/source'), true);
const staleSource = workflow.normalizeSource({ kind:'web', url:'https://example.com/stale', status:'available', verification_status:'verified', last_verified_at:new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() });
assert.equal(workflow.sourceFreshness(staleSource).usable, false, 'old public sources must require revalidation');
assert.equal(workflow.sourceUsable(staleSource), false, 'stale public sources must not enter a new AI request');

const draft = workflow.normalizeDraft({
  id:'draft-1',
  kind:'certificate',
  purpose:'weekly_summary',
  provider_id:'provider-1',
  consent_id:'consent-1',
  student_id:'student-1',
  source_attachment_id:'att-1',
  payload:{ title:'国家奖学金' },
  created_at:'2026-08-17T10:00:00.000Z',
});
assert.equal(draft.schema_version, 8);
assert.equal(draft.status, 'draft');
assert.equal(draft.purpose, 'work_summary');
assert.equal(draft.student_id, 'student-1');
assert.equal(draft.consent_id, 'consent-1');
assert.equal(draft.source_attachment_id, 'att-1');
assert.equal(draft.payload.title, '国家奖学金');

const parsed = workflow.parseCertificateResponse('```json\n{"title":"国家奖学金","level":"一等奖","date":"2026-06-01"}\n```');
assert.equal(parsed.title, '国家奖学金');
assert.equal(parsed.level, '一等奖');
assert.equal(parsed.date, '2026-06-01');

const fallback = workflow.parseCertificateResponse('无法可靠识别颁发单位');
assert.equal(fallback.title, '');
assert.equal(fallback.summary, '无法可靠识别颁发单位');

console.log('PASS cwb-ai-workflow');
