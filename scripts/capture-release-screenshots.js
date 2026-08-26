'use strict';

/*
 * Creates the release screenshots from isolated browser contexts.
 * Every record below is explicitly fictional and is discarded when the browser
 * context closes; the script never opens or mutates a user's normal workspace.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, requireBrowserExecutable } = require('./browser-runtime');

const ROOT = path.resolve(__dirname, '..');
const DESTINATION = process.env.CWB_SCREENSHOT_DIR
  ? path.resolve(ROOT, process.env.CWB_SCREENSHOT_DIR)
  : path.join(ROOT, 'assets', 'screenshots', 'v4.9.0');
const IMPORT_SAMPLE = path.join(ROOT, 'samples', 'import-compat', '12-Excel-多工作表合并标题.xlsx');
// Capture at a practical desktop CSS layout and double the pixel density so the
// public files remain 2560x1440 without a sparsely populated ultra-wide canvas.
const VIEWPORT = { width:1280, height:720 };
const DEVICE_SCALE_FACTOR = 2;
const OUTPUT_SIZE = {
  width:VIEWPORT.width * DEVICE_SCALE_FACTOR,
  height:VIEWPORT.height * DEVICE_SCALE_FACTOR,
};
const TARGET_ID = 'release-demo-student-01';
const TARGET_NUMBER = 'D440260001';
const TARGET_NAME = '演示学生01';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pad(value) {
  return String(value).padStart(2, '0');
}

function day(offset) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function timestamp(offset) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return value.toISOString();
}

function contentType(file) {
  if (file.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'text/html; charset=utf-8';
}

function createServer() {
  return http.createServer((request, response) => {
    const requestPath = decodeURIComponent(String(request.url || '/').split('?')[0]);
    const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
    const file = path.resolve(ROOT, relative);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type':contentType(file), 'cache-control':'no-store' });
    fs.createReadStream(file).pipe(response);
  });
}

function releaseSettings() {
  return {
    id:'settings',
    schema_version:8,
    counselor_name:'演示辅导员',
    college_name:'示例学院',
    classes:'2024级智能制造1班,2024级智能制造2班,2024级智能制造3班',
    seeded:false,
    backup_notified_at:'',
    onboarding:{ version:1, completed:true, skipped:true, currentStep:0, checklist:{} },
    welcome_experience:{ version:1, completed:true, skipped:true, addressed_as:'', greeting_enabled:false, quote_enabled:false, last_open_date:'' },
    ui:{ preset:'blueprint', accent:'', background:{ dataUrl:'', opacity:0.16 }, density:'comfortable', hiddenModules:[], homeWidgets:{ order:[], hidden:[] } },
    security:{ enabled:false, pass_hash:'', timeout_minutes:30, last_unlock:0 },
    backup_schedule:{ frequency:'weekly', enabled:true, folder:'演示备份目录', retain:8, last_run_at:`${day(-1)} 18:30` },
  };
}

function demoStudents() {
  const majors = ['智能制造工程', '机器人工程', '工业工程'];
  return Array.from({ length:36 }, (_, index) => {
    const number = `D440260${pad(index + 1)}`;
    const className = `2024级智能制造${index % 3 + 1}班`;
    const isTarget = index === 0;
    return {
      id:isTarget ? TARGET_ID : `release-demo-student-${pad(index + 1)}`,
      student_number:isTarget ? TARGET_NUMBER : number,
      full_name:isTarget ? TARGET_NAME : `演示学生${pad(index + 1)}`,
      gender:index % 2 ? '女' : '男',
      class_name:className,
      major_name:majors[index % majors.length],
      grade:'2024级',
      student_level:'undergraduate',
      student_type:index % 6 === 0 ? '专科生' : '本科生',
      college_name:'示例学院',
      community:index % 2 ? '启明书院' : '致远社区',
      counselor_name:'演示辅导员',
      enrollment_status:index % 11 === 0 ? '休学' : '在读',
      politics:isTarget ? '入党积极分子' : '共青团员',
      dorm:`${index % 6 + 1}号楼${301 + index}`,
      dorm_building:`${index % 6 + 1}号楼`,
      dorm_room:String(301 + index),
      academic_score:index % 5 === 0 ? 58 : 76 + index % 18,
      credits:18 + index % 8,
      class_rank:index + 1,
      focus:isTarget ? ['psych'] : index % 7 === 0 ? ['study'] : index % 9 === 0 ? ['econ'] : [],
      focus_type:isTarget ? 'psych' : index % 7 === 0 ? 'study' : index % 9 === 0 ? 'econ' : '',
      focus_level:isTarget ? 'L1' : index % 7 === 0 ? 'L2' : index % 9 === 0 ? 'L3' : '',
      crisis_level:isTarget ? '校级' : index === 14 ? '院级' : '',
      crisis_way:isTarget ? '主动求助' : index === 14 ? '日常排查' : '',
      crisis_relieved:false,
      note:isTarget ? '发布截图使用的虚构演示记录，展示统一时间线与危机跟进。' : '发布截图使用的虚构演示记录。',
      created_at:timestamp(-45 + index),
      updated_at:timestamp(-1),
      schema_version:8,
    };
  });
}

function demoFixture() {
  const students = demoStudents();
  const target = students[0];
  const sameStudent = { student_name:target.full_name, student_number:target.student_number, class_name:target.class_name };
  const gradeRows = [
    ['2025-2026-1','高等数学',56,true],
    ['2025-2026-1','大学英语',78,false],
    ['2025-2026-1','工程制图',73,false],
    ['2024-2025-2','程序设计基础',62,false],
    ['2024-2025-2','线性代数',58,true],
    ['2024-2025-2','大学物理',72,false],
    ['2024-2025-2','机械原理',83,false],
    ['2024-2025-2','思想道德与法治',88,false],
  ].map(([term, course, score, failed], index) => ({
    id:`release-grade-${index + 1}`,
    ...sameStudent,
    term,
    course,
    score,
    failed,
    gpa:score < 60 ? 0 : Number(((score - 50) / 10).toFixed(1)),
    status:failed ? '挂科' : '已归档',
    summary:failed ? '已建立学业帮扶跟进。' : '发布截图使用的虚构成绩记录。',
    date:day(-20 - index),
    created_at:timestamp(-20 - index),
    updated_at:timestamp(-20 - index),
    schema_version:8,
  }));

  const moreGrades = students.slice(1, 13).map((student, index) => ({
    id:`release-grade-extra-${index + 1}`,
    student_name:student.full_name,
    student_number:student.student_number,
    class_name:student.class_name,
    term:index % 2 ? '2025-2026-1' : '2024-2025-2',
    course:['高等数学', '大学英语', '工程制图'][index % 3],
    score:index % 6 === 0 ? 55 : 68 + index % 20,
    failed:index % 6 === 0,
    gpa:index % 6 === 0 ? 0 : 2.1,
    status:index % 6 === 0 ? '挂科' : '已归档',
    summary:'发布截图使用的虚构成绩记录。',
    date:day(-12 - index),
    created_at:timestamp(-12 - index),
    updated_at:timestamp(-12 - index),
    schema_version:8,
  }));

  return {
    settings:releaseSettings(),
    collections:{
      students,
      tasks:[
        { id:'release-task-01', title:'核对学业预警学生帮扶计划', duty:'study', source:'学院安排', classes:'全体', due:day(-2), priority:'P0', status:'todo', note:'发布截图使用的虚构待办。', created_at:timestamp(-8), schema_version:8 },
        { id:'release-task-02', title:'完成重点学生本周联系记录', duty:'psych', source:'自主计划', classes:target.class_name, due:day(0), priority:'P1', status:'doing', note:'发布截图使用的虚构待办。', created_at:timestamp(-4), schema_version:8 },
        { id:'release-task-03', title:'整理党员发展材料清单', duty:'party', source:'学院安排', classes:'全体', due:day(3), priority:'P1', status:'todo', note:'发布截图使用的虚构待办。', created_at:timestamp(-2), schema_version:8 },
        { id:'release-task-04', title:'完成宿舍安全走访汇总', duty:'daily', source:'自主计划', classes:'全体', due:day(5), priority:'P2', status:'todo', note:'发布截图使用的虚构待办。', created_at:timestamp(-1), schema_version:8 },
      ],
      talks:[
        { id:'release-talk-01', ...sameStudent, date:day(-11), way:'面谈', duty:'psych', summary:'围绕适应压力与睡眠情况进行评估，确认持续跟进安排。', judge:'需保持校级危机联系频率。', action:'已约定复谈并记录转介建议。', need_follow:true, follow_date:day(-4), done_follow:false, created_at:timestamp(-11), schema_version:8 },
        { id:'release-talk-02', student_name:'演示学生08', student_number:'D44026008', class_name:'2024级智能制造2班', date:day(-5), way:'电话', duty:'study', summary:'核对课程预警后的作业完成进度。', judge:'需要持续学业帮扶。', action:'安排学习委员结对。', need_follow:true, follow_date:day(-1), done_follow:false, created_at:timestamp(-5), schema_version:8 },
        { id:'release-talk-03', student_name:'演示学生15', student_number:'D44026015', class_name:'2024级智能制造3班', date:day(-18), way:'面谈', duty:'daily', summary:'完成日常情况了解与住宿反馈。', judge:'暂无新增风险。', action:'继续观察。', need_follow:false, follow_date:'', done_follow:false, created_at:timestamp(-18), schema_version:8 },
        { id:'release-talk-04', student_name:'演示学生22', student_number:'D44026022', class_name:'2024级智能制造1班', date:day(-3), way:'面谈', duty:'career', summary:'沟通职业规划与课程选择。', judge:'目标清晰。', action:'提供资料库参考。', need_follow:true, follow_date:day(7), done_follow:false, created_at:timestamp(-3), schema_version:8 },
      ],
      stay:[
        { id:'release-stay-01', ...sameStudent, grade_major:'2024级智能制造工程', stu_type:'本科生', housing_status:'校内住宿', reason:'宿舍安全走访后完成情况记录。', start:day(-9), end:day(120), approval:'审批通过', note:'发布截图使用的虚构住宿记录。', created_at:timestamp(-9), schema_version:8 },
      ],
      honor:[
        { id:'release-honor-01', name:target.full_name, student_number:target.student_number, class_name:target.class_name, major_name:target.major_name, apply_type:'德育', others:'完成志愿服务与班团组织工作记录。', created_at:timestamp(-10), updated_at:timestamp(-10), schema_version:8 },
      ],
      orgs:[
        { id:'release-org-01', ...sameStudent, position:'心理委员', term:'2025-2026 学年', status:'在任', summary:'负责班级心理健康联络与反馈。', date:day(-6), created_at:timestamp(-6), updated_at:timestamp(-6), schema_version:8 },
        { id:'release-org-02', student_name:'演示学生05', student_number:'D44026005', class_name:'2024级智能制造2班', position:'班长', term:'2025-2026 学年', status:'在任', summary:'班级日常组织协调。', date:day(-30), created_at:timestamp(-30), updated_at:timestamp(-30), schema_version:8 },
        { id:'release-org-03', student_name:'', student_number:'', class_name:'2024级智能制造3班', position:'学习委员', term:'2025-2026 学年', status:'空缺', summary:'待换届补充。', date:day(-25), created_at:timestamp(-25), updated_at:timestamp(-25), schema_version:8 },
      ],
      party:[
        { id:'release-party-01', ...sameStudent, title:'演示学生01党员发展档案', status:'发展对象', join_date:day(-5), recommendation:'培养考察材料齐备。', public_notice:'公示材料待归档。', objection:'无。', handling:'按支部流程持续办理。', result:'等待支部会议。', summary:'发布截图使用的虚构党员发展记录。', created_at:timestamp(-5), updated_at:timestamp(-5), schema_version:8 },
        { id:'release-party-02', student_name:'演示学生04', student_number:'D44026004', class_name:'2024级智能制造1班', title:'演示学生04党员发展档案', status:'积极分子', join_date:day(-40), recommendation:'完成阶段培养。', public_notice:'', objection:'', handling:'', result:'按计划跟进。', summary:'发布截图使用的虚构党员发展记录。', created_at:timestamp(-40), updated_at:timestamp(-40), schema_version:8 },
        { id:'release-party-03', student_name:'演示学生09', student_number:'D44026009', class_name:'2024级智能制造2班', title:'演示学生09党员发展档案', status:'公示', join_date:day(-16), recommendation:'支部讨论通过。', public_notice:'正在公示。', objection:'无。', handling:'按期收集意见。', result:'公示期内。', summary:'发布截图使用的虚构党员发展记录。', created_at:timestamp(-16), updated_at:timestamp(-16), schema_version:8 },
        { id:'release-party-04', student_name:'演示学生17', student_number:'D44026017', class_name:'2024级智能制造3班', title:'演示学生17党员发展档案', status:'预备党员', join_date:day(-90), recommendation:'完成预备期教育。', public_notice:'', objection:'无。', handling:'准备转正材料。', result:'待转正。', summary:'发布截图使用的虚构党员发展记录。', created_at:timestamp(-90), updated_at:timestamp(-90), schema_version:8 },
        { id:'release-party-05', student_name:'演示学生21', student_number:'D44026021', class_name:'2024级智能制造1班', title:'演示学生21党员发展档案', status:'转正', join_date:day(-120), recommendation:'材料已审核。', public_notice:'', objection:'无。', handling:'转正手续完成。', result:'已转正。', summary:'发布截图使用的虚构党员发展记录。', created_at:timestamp(-120), updated_at:timestamp(-120), schema_version:8 },
      ].concat(students.slice(5, 18).map((student, index) => {
        const stages = ['申请入党', '积极分子', '发展对象', '公示', '预备党员', '转正'];
        const status = stages[index % stages.length];
        const offset = 24 + index * 9;
        return {
          id:`release-party-extra-${index + 1}`,
          student_name:student.full_name,
          student_number:student.student_number,
          class_name:student.class_name,
          title:`${student.full_name}党员发展档案`,
          status,
          join_date:day(-offset),
          recommendation:'按培养计划完成阶段记录。',
          public_notice:status === '公示' ? '公示期内。' : '',
          objection:'无。',
          handling:'按支部流程持续办理。',
          result:status === '转正' ? '已转正。' : '持续跟进。',
          summary:'发布截图使用的虚构党员发展记录。',
          created_at:timestamp(-offset),
          updated_at:timestamp(-offset),
          schema_version:8,
        };
      })),
      rewards:[
        { id:'release-reward-01', ...sameStudent, title:'志愿服务表彰', category:'奖励', date:day(-7), status:'已归档', result:'完成材料归档。', summary:'发布截图使用的虚构奖惩记录。', created_at:timestamp(-7), updated_at:timestamp(-7), schema_version:8 },
      ],
      activities:[
        { id:'release-activity-01', ...sameStudent, title:'新生适应主题班会', category:'主题教育', date:day(-8), status:'已完成', organizer:'示例学院', participants:'2024级智能制造1班', summary:'完成适应教育与意见收集。', created_at:timestamp(-8), updated_at:timestamp(-8), schema_version:8 },
      ],
      grades:gradeRows.concat(moreGrades),
      worklogs:[
        { id:'release-worklog-01', ...sameStudent, title:'重点学生宿舍走访', category:'查寝', date:day(-4), status:'已归档', summary:'完成宿舍走访并更新跟进记录。', attachment_note:'走访记录附件已归档。', created_at:timestamp(-4), updated_at:timestamp(-4), schema_version:8 },
      ],
      warn:[
        { id:'release-warn-01', name:target.full_name, student_number:target.student_number, class_name:target.class_name, type:'学业预警', level:'二级', course:'高等数学', measure:'已转入学业帮扶。', follow:'本周复核。', resolved:false, created_at:timestamp(-2), schema_version:8 },
      ],
      help:[
        { id:'release-help-01', name:target.full_name, student_number:target.student_number, class_name:target.class_name, type:'课程帮扶', helper:'学习委员', cycle:'四周', measure:'每周一次学习计划复盘。', effect:'正在跟进。', status:'进行中', created_at:timestamp(-2), schema_version:8 },
      ],
    },
  };
}

async function waitForReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.v4Ready === 'true' && document.documentElement.dataset.v8Ready === 'true' && window.CWB && window.CWB.workspace && window.CWBV46Runtime, null, { timeout:60000 });
}

async function seedDemoData(page, fixture) {
  await page.evaluate(async input => {
    const cwb = window.CWB;
    const currentSettings = cwb.workspace.getState().settings || {};
    await cwb.workspace.mutate({
      type:'release-screenshot.settings',
      collection:'settings',
      operation:'replace',
      singleton:true,
      data:Object.assign({}, currentSettings, input.settings),
      actor:'release-screenshot',
    });
    for (const [collection, rows] of Object.entries(input.collections)) {
      const repository = cwb.repositories && cwb.repositories[collection];
      if (!repository) throw new Error(`missing repository: ${collection}`);
      await repository.putMany(rows, { atomic:true, render:false });
    }
    await cwb.workspace.flush({ type:'release-screenshot.seed', actor:'release-screenshot' });
    // Merge the application's own complete fictional fixture as well. This
    // keeps the guide representative of the real first-run experience across
    // legacy, v4.6, v4.7 and v4.8 pages without touching a user's workspace.
    if (typeof cwb.restoreDemo === 'function') await cwb.restoreDemo();
    if (cwb.audit && typeof cwb.audit.log === 'function') {
      await cwb.audit.log('sensitive_view', { student_id:'release-demo-student-01', scope:'虚构学生档案' });
      await cwb.audit.log('backup_export', { scope:'虚构演示工作区', record_count:52 });
    }
    window.CWBV46Runtime.go('home');
    await new Promise(resolve => setTimeout(resolve, 60));
    await cwb.workspace.flush({ type:'release-screenshot.ui-ready', actor:'release-screenshot' });
  }, fixture);
  await page.waitForSelector('.home-summary', { state:'visible', timeout:20000 });
}

async function waitForRouteContent(page, route) {
  const selectors = {
    home: '.today',
    students: '#main',
    party: '[data-v4-module="party"]',
    talks: '[data-talk-schedule]',
    grades: '[data-grade-trend]',
    backup: '.v4-head',
    stay: '#main',
    toolbox: '#main',
    'notice-ai': '#main',
    ai: '#main',
    bridge: '#main',
  };
  const selector = route === 'home' && await page.locator('.today').count() === 0
    ? '.home-summary'
    : selectors[route] || '#main';
  if (!selector) return;
  await page.waitForSelector(selector, { state:'visible', timeout:20000 });
  await page.waitForFunction(({ target, minimum }) => {
    const node = document.querySelector(target);
    return Boolean(node && node.textContent && node.textContent.trim().length > minimum);
  }, { target:selector, minimum:route === 'home' ? 5 : 20 }, { timeout:20000 });
}

async function createPage(browser, url, fixture) {
  const context = await browser.newContext({
    viewport:VIEWPORT,
    deviceScaleFactor:DEVICE_SCALE_FACTOR,
    locale:'zh-CN',
    timezoneId:'Asia/Shanghai',
    colorScheme:'light',
  });
  await context.addInitScript(settings => {
    localStorage.setItem('cwb_v1_settings', JSON.stringify(settings));
    localStorage.removeItem('cwb_v1_ui_state');
  }, releaseSettings());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await waitForReady(page);
  await seedDemoData(page, fixture);
  await page.addStyleTag({ content:'#toast-root{display:none!important}' });
  return { context, page, errors };
}

function assertPngSize(file) {
  const source = fs.readFileSync(file);
  assert.ok(source.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), `${file} is not a PNG`);
  assert.equal(source.toString('ascii', 12, 16), 'IHDR', `${file} has no IHDR header`);
  assert.equal(source.readUInt32BE(16), OUTPUT_SIZE.width, `${file} has an unexpected width`);
  assert.equal(source.readUInt32BE(20), OUTPUT_SIZE.height, `${file} has an unexpected height`);
}

async function capture(browser, url, fixture, filename, route, prepare) {
  const { context, page, errors } = await createPage(browser, url, fixture);
  try {
    await page.evaluate(view => window.CWBV46Runtime.go(view), route);
    await waitForRouteContent(page, route);
    if (prepare) await prepare(page);
    await waitForRouteContent(page, route);
    await page.evaluate(async () => { if (document.fonts && document.fonts.ready) await document.fonts.ready; });
    const file = path.join(DESTINATION, filename);
    await page.screenshot({ path:file, fullPage:false });
    assertPngSize(file);
    assert.deepEqual(errors, [], `${filename} triggered page errors`);
    console.log(`captured ${path.relative(ROOT, file)}`);
  } finally {
    await context.close();
  }
}

async function captureAll() {
  const executablePath = requireBrowserExecutable('RELEASE_SCREENSHOTS');
  assert.ok(executablePath, 'A Chromium browser is required to capture release screenshots.');
  assert.ok(fs.existsSync(IMPORT_SAMPLE), `Missing import sample: ${IMPORT_SAMPLE}`);
  fs.mkdirSync(DESTINATION, { recursive:true });

  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless:true, executablePath });
  const fixture = demoFixture();
  try {
    await capture(browser, url, fixture, '01-overview.png', 'home', async page => {
      await page.addStyleTag({ content:' #main > .banner, #main > .card:first-of-type { display:none !important; } .today-list { max-height:330px; overflow:hidden; } ' });
      await page.locator('.home-summary').waitFor({ state:'visible', timeout:10000 });
      await page.locator('.home-summary').evaluate(node => node.scrollIntoView({ block:'start' }));
      await page.waitForTimeout(80);
    });
    await capture(browser, url, fixture, '02-students-pagination-bulk.png', 'students', async page => {
      await page.locator('[data-student-page-size]').selectOption('10');
      await page.locator('button[data-act="student-page"][data-dir="next"]').first().click();
      await page.waitForFunction(() => document.querySelector('[data-student-page-current]') && document.querySelector('[data-student-page-current]').textContent.trim() === '2');
      await page.locator('button[data-act="student-bulk-toggle"]').first().click();
      await page.locator('button[data-act="student-bulk-select-page"]').first().click();
      await page.waitForSelector('.student-bulk-bar', { state:'visible' });
    });
    await capture(browser, url, fixture, '03-import-preview.png', 'students', async page => {
      await page.locator('#file-csv').setInputFiles(IMPORT_SAMPLE);
      await page.locator('[data-import-map]').first().waitFor({ state:'attached', timeout:30000 });
      await page.locator('details.adv summary').click();
    });
    await capture(browser, url, fixture, '04-student-timeline.png', 'students', async page => {
      await page.locator('input[data-filter="students.q"]').fill(TARGET_NUMBER);
      await page.waitForTimeout(360);
      const trigger = page.locator(`button[data-act="student-view"][data-id="${TARGET_ID}"]`).first();
      await trigger.waitFor({ state:'visible', timeout:20000 });
      await trigger.click();
      await page.locator('[data-student-timeline]').waitFor({ state:'visible', timeout:10000 });
    });
    const extraCaptures = [
      ['08-talks.png', 'talks', async page => page.locator('[data-talk-schedule]').waitFor({ state:'visible', timeout:20000 })],
      ['09-worklog-drafts.png', 'worklog-drafts'],
      ['10-tasks.png', 'tasks'],
      ['11-leave-attendance.png', 'leave'],
      ['12-approvals-attendance.png', 'pleave'],
      ['13-class-organizations.png', 'orgs'],
      ['14-party-development.png', 'party', async page => page.locator('[data-v4-module="party"]').waitFor({ state:'visible', timeout:20000 })],
      ['15-league-development.png', 'league'],
      ['16-rewards-grants.png', 'rewards'],
      ['17-activities-worklogs.png', 'activities'],
      ['18-academic-warning.png', 'warn'],
      ['19-academic-support.png', 'help'],
      ['20-grades-analysis.png', 'grades', async page => page.locator('[data-grade-trend]').waitFor({ state:'visible', timeout:20000 })],
      ['21-grants-and-assistance.png', 'grant'],
      ['22-focus-students.png', 'focus'],
      ['23-psych-screening.png', 'psych'],
      ['24-employment.png', 'graduate'],
      ['25-policy-library.png', 'policy'],
      ['26-material-library.png', 'material'],
      ['27-templates-learning.png', 'tpl'],
      ['28-learning-assistant.png', 'learning'],
      ['29-contacts-schedules.png', 'contacts'],
      ['30-class-schedule.png', 'schedules'],
      ['31-class-checks.png', 'class-checks'],
      ['32-roll-call.png', 'roll-call'],
      ['33-dorm-inspections.png', 'dorm-inspections'],
      ['34-dorm-committee.png', 'committee'],
      ['35-family-research.png', 'family'],
      ['36-research-projects.png', 'research'],
      ['37-assessment.png', 'assessment'],
      ['38-employment-competition.png', 'competitions'],
      ['39-employment-safety.png', 'employment-safety'],
      ['40-tools-utilities.png', 'toolbox'],
      ['41-utilities-draw.png', 'utilities', async page => {
        const input = page.locator('[data-v46-utility-list]');
        if (await input.count()) {
          await input.fill('张明\n李思颖\n王浩然\n刘子豪\n钱思远');
          const run = page.locator('[data-act="v46-utility-run"]');
          if (await run.count()) await run.click();
        }
      }],
      ['42-academic-class-analysis.png', 'academic-analysis'],
      ['43-class-summary.png', 'class-analysis'],
      ['44-notice-ai.png', 'notice-ai'],
      ['45-ai-workbench.png', 'ai'],
      ['46-backup.png', 'backup', async page => page.getByRole('heading', { name:'备份与迁移' }).waitFor({ state:'visible', timeout:20000 })],
      ['47-lan-sync.png', 'v48-sync'],
      ['48-platform-bridge.png', 'bridge'],
      ['49-content-and-forms.png', 'content-push'],
      ['50-student-fields-and-history.png', 'student-fields'],
      ['51-audit-and-recovery.png', 'audit'],
    ];
    for (const [filename, route, prepare] of extraCaptures) {
      await capture(browser, url, fixture, filename, route, async page => {
        if (prepare) await prepare(page);
        await page.waitForTimeout(120);
      });
    }
    await capture(browser, url, fixture, '05-students-cards.png', 'students', async page => {
      await page.locator('[data-act="students-mode-cards"]').click();
      await page.locator('[data-student-layout="cards"]').waitFor({ state:'visible', timeout:10000 });
      await page.locator('[data-student-layout="cards"]').evaluate(node => node.scrollIntoView({ block:'center' }));
      await page.waitForTimeout(120);
    });
    await capture(browser, url, fixture, '06-students-photos.png', 'photos', async page => {
      // Use the dedicated photo-management workspace for the guide. The
      // ledger's photo display is useful in the app, but its virtualized
      // content can be below the fold while a screenshot is taken.
      await page.locator('.v4-photo-grid .v4-photo-card').first().waitFor({ state:'visible', timeout:10000 });
      await page.locator('.v4-photo-grid').evaluate(node => node.scrollIntoView({ block:'start' }));
      await page.waitForTimeout(120);
    });
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

captureAll().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
