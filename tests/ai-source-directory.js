const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = path.join(__dirname, '..');
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => {
    if (!/scrollTo|Could not load|Not implemented|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('<script defer src="src/core/cwb-ai.js" data-cwb-ai></script>', `<script>${fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai.js'), 'utf8')}</script>`)
    .replace('<script defer src="src/core/cwb-ai-workflow.js" data-cwb-ai-workflow></script>', `<script>${fs.readFileSync(path.join(root, 'src', 'core', 'cwb-ai-workflow.js'), 'utf8')}</script>`);
  const dom = new JSDOM(html, { runScripts:'dangerously', resources:'usable', url:'https://ai-source-directory.local/', pretendToBeVisual:true, virtualConsole });
  await wait(800);
  const { window: w } = dom;

  w.CWB.db.custom.v4_tool_links = [{ id:'source-directory-tool', name:'校内工具入口', category:'日常材料', description:'用于来源目录回归', url:'https://example.edu/tool' }];
  w.CWB.db.custom.v4_employment_safety = [{ id:'source-directory-safety', unit_name:'示例单位', risk_level:'提示', reason:'用于来源目录回归', source_url:'https://example.edu/safety', checked_at:'2026-08-19' }];
  w.CWB.db.custom.v4_competition_resources = [{ id:'source-directory-competition', name:'示例竞赛资源', category:'科创', organizer:'示例主办方', official_url:'https://example.edu/competition', deadline:'2026-09-01' }];
  w.CWB.db.custom.v4_research_projects = [{ id:'source-directory-research', title:'示例科研课题', current_stage:'开题', stage_due_date:'2026-10-01', next_action:'准备开题材料' }];

  const cases = [
    ['校内工具入口', 'v4_tool_links', 'source-directory-tool'],
    ['示例单位', 'v4_employment_safety', 'source-directory-safety'],
    ['示例竞赛资源', 'v4_competition_resources', 'source-directory-competition'],
    ['示例科研课题', 'v4_research_projects', 'source-directory-research'],
  ];
  for (const [query, collection, recordId] of cases) {
    const rows = w.CWB.ai.sources.search({ query, limit:10 });
    const source = rows.find(item => item.collection === collection && item.record_id === recordId);
    assert.ok(source, `${collection} should be searchable through the AI source directory`);
    assert.equal(source.kind, 'local');
    assert.equal(source.verification_status, 'not_applicable');
    assert.equal(source.record_id, recordId);
    assert.ok(source.source_fingerprint, `${collection} should retain a business-data fingerprint`);
  }
  assert.equal(w.CWB.ai.sources.search({ query:'示例单位', limit:10 }).find(item => item.collection === 'v4_employment_safety').url, 'https://example.edu/safety');

  const toolSource = w.CWB.ai.sources.search({ query:'校内工具入口', limit:10 })
    .find(item => item.collection === 'v4_tool_links' && item.record_id === 'source-directory-tool');
  const suggestion = w.CWB.ai.suggestions.create({
    purpose:'knowledge_search', title:'本地来源新鲜度回归', summary:'只允许基于未变化的本地资料转化',
    status:'review', sources:[toolSource], source_ids:[toolSource.id], payload:{ text:'来源资料' },
  });
  w.CWB.ai.suggestions.accept(suggestion.id);
  w.CWB.db.custom.v4_tool_links[0].description = '来源内容已经修改';
  const sourceState = w.CWB.ai.suggestions.sourceState(suggestion.id);
  assert.equal(sourceState.changed.includes(toolSource.id), true, 'changed local sources should be marked stale');
  assert.throws(() => w.CWB.ai.suggestions.convert(suggestion.id, 'task'), /AI_SUGGESTION_SOURCE_REVIEW_REQUIRED/);

  const empty = w.CWB.ai.sources.search({ query:'definitely-not-a-local-source', limit:10 });
  assert.equal(empty.length, 0, 'source directory search should not invent external results');
  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS ai-source-directory');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
