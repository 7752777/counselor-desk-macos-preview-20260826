/**
 * 谈话回访闭环的真实 DOM 路径测试。
 * 覆盖：首次保存建任务、完成后续建任务、链式任务保留回访动作、
 * 「记一次新谈话」关闭父回访任务，以及稳定 student_id 关联。
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'index.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', error => {
    if (!/scrollTo|Not implemented|Could not load|getaddrinfo/i.test(String(error && error.message))) errors.push(String(error && error.message));
  });
  vc.on('error', (...args) => errors.push(args.join(' ')));
  const dom = await JSDOM.fromFile(file, {
    runScripts:'dangerously', resources:'usable', url:'https://talk-follow-up.local/',
    virtualConsole:vc, pretendToBeVisual:true,
  });
  const w = dom.window;
  const d = w.document;
  const cwb = w.CWB;
  await wait(700);

  cwb.db.students = [cwb.norm.student({ id:'talk-follow-student', student_number:'T-001', full_name:'回访测试学生', class_name:'测试班' })];
  cwb.db.tasks = [];
  cwb.db.talks = [];
  cwb.render();

  const click = element => {
    assert.ok(element, 'expected clickable element');
    element.dispatchEvent(new w.MouseEvent('click', { bubbles:true, cancelable:true }));
  };
  const findAction = (action, id) => [...d.querySelectorAll(`[data-act="${action}"]`)].find(element => !id || element.dataset.id === id);
  const setField = (key, value) => {
    const field = d.querySelector(`#modal-root [data-k="${key}"]`);
    assert.ok(field, `field ${key} should exist`);
    field.value = value;
    field.dispatchEvent(new w.Event('change', { bubbles:true }));
  };
  const saveNewTalk = async (summary, followDate) => {
    cwb.go('talks');
    await wait(30);
    click(findAction('talk-new'));
    await wait(20);
    setField('student_name', '回访测试学生');
    setField('start_date', '2026-08-18');
    setField('summary', summary);
    setField('follow_date', followDate);
    click(d.querySelector('#modal-root [data-ok]'));
    await wait(160);
    return cwb.db.talks.at(-1);
  };
  const completeTalkFollowUp = async (talk, nextDate) => {
    cwb.go('talks');
    await wait(30);
    click(findAction('talk-view', talk.id));
    await wait(20);
    click(d.querySelector('#modal-root [data-talk-follow]'));
    await wait(20);
    setField('result', '已完成回访并核验后续安排');
    if (nextDate) setField('next_date', nextDate);
    else {
      const closeCase = d.querySelector('#modal-root [data-k="close_case"]');
      assert.ok(closeCase, 'close_case should be visible when completing a follow-up');
      closeCase.checked = true;
    }
    click(d.querySelector('#modal-root [data-ok]'));
    await wait(160);
  };

  const first = await saveNewTalk('首次谈话，安排后续回访', '2026-08-19');
  assert.ok(first && first.id, 'saving a talk should create a record');
  assert.equal(first.student_id, 'talk-follow-student', 'talk should keep stable student_id');
  const firstTask = cwb.db.tasks.find(task => task.source_talk_id === first.id);
  assert.ok(firstTask, 'saving a talk with follow-up should create a task');
  assert.equal(firstTask.student_id, 'talk-follow-student', 'follow-up task should keep stable student_id');

  await completeTalkFollowUp(first, '2026-08-20');
  assert.equal(first.done_follow, true, 'completing a follow-up should close the current talk cycle');
  assert.equal(firstTask.status, 'done', 'completing a follow-up should close the original task');
  const firstNextTask = cwb.db.tasks.find(task => task.id === first.follow_up_next_task_id);
  assert.ok(firstNextTask, 'next follow-up date should create a linked task');
  assert.equal(firstNextTask.status, 'todo');

  cwb.go('home');
  await wait(40);
  assert.ok(findAction('talk-followed', first.id), 'a linked next follow-up must keep the follow-up action on the home page');
  await completeTalkFollowUp(first, '');
  assert.equal(firstNextTask.status, 'done', 'completing a linked next follow-up should close the linked task');
  assert.equal(first.follow_up_status, 'completed');

  const second = await saveNewTalk('第二次谈话，验证子谈话闭环', '2026-08-19');
  await completeTalkFollowUp(second, '2026-08-20');
  const secondNextTask = cwb.db.tasks.find(task => task.id === second.follow_up_next_task_id);
  assert.ok(secondNextTask && secondNextTask.status === 'todo');
  cwb.go('home');
  await wait(40);
  click(findAction('talk-new-for', second.id));
  await wait(25);
  setField('start_date', '2026-08-20');
  setField('summary', '通过新谈话记录完成上一条回访');
  click(d.querySelector('#modal-root [data-ok]'));
  await wait(180);
  const child = cwb.db.talks.find(talk => talk.follow_up_parent_id === second.id);
  assert.ok(child, 'recording a new talk from a follow-up should link the child to its parent');
  assert.equal(child.student_id, 'talk-follow-student');
  assert.equal(secondNextTask.status, 'done', 'a child talk should close the parent pending follow-up task');

  assert.deepEqual(errors, []);
  dom.window.close();
  console.log('PASS talk-follow-up');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
