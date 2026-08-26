/** Student photos must be isolated by student and trimmed with their attachments. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const file = path.join(__dirname, '..', 'output', 'v4-preview.html');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await wait(50);
  }
  throw new Error('timed out waiting for persisted photo review');
}

(async () => {
  const dom = await JSDOM.fromFile(file, {
    runScripts:'dangerously', resources:'usable', url:'https://photo-storage.local/',
    virtualConsole:new VirtualConsole(), pretendToBeVisual:true,
  });
  const w = dom.window;
  await wait(700);
  assert.equal(typeof w.CWB.photos?.uploadForStudent, 'function', 'photo upload should expose a tested student-scoped operation');
  await w.CWB.attachments.clear();
  const first = w.CWB.norm.student({ id:'photo-student-1', student_number:'P-001', full_name:'照片学生一' });
  const second = w.CWB.norm.student({ id:'photo-student-2', student_number:'P-002', full_name:'照片学生二' });
  const fileForBoth = new w.File(['same-photo-content'], 'portrait.jpg', { type:'image/jpeg' });
  const studentPut = w.CWB.repositories.students.put;
  let studentPutCount = 0;
  w.CWB.repositories.students.put = async (...args) => { studentPutCount += 1; return studentPut(...args); };
  await w.CWB.photos.uploadForStudent(fileForBoth, first);
  assert.equal(studentPutCount, 1, 'a successful photo upload should persist the student once');
  w.CWB.repositories.students.put = studentPut;
  await w.CWB.photos.uploadForStudent(fileForBoth, second);
  assert.notEqual(first.photo_assets[0].id, second.photo_assets[0].id, 'same image content for different students must use separate attachment IDs');
  assert.equal((await w.CWB.attachments.findForStudent(first.id)).length, 1);
  assert.equal((await w.CWB.attachments.findForStudent(second.id)).length, 1);

  for (let index = 0; index < 4; index++) {
    await w.CWB.photos.uploadForStudent(new w.File([`photo-${index}`], `portrait-${index}.jpg`, { type:'image/jpeg' }), first);
  }
  assert.equal(first.photo_assets.length, 3, 'student record should retain only the latest three photos');
  assert.equal(first.photo_ids.length, 3, 'photo_ids should match the retained photo assets');
  assert.equal((await w.CWB.attachments.findForStudent(first.id)).length, 3, 'dropped photos must be removed from the attachment store');

  const reviewStudent = w.CWB.db.students[0];
  assert.ok(reviewStudent && reviewStudent.student_number, 'a persisted student should be available for manual photo review');
  w.CWB.go('photos');
  await wait(40);
  const queued = await w.CWB.attachments.add({ id:'queued-photo', name:'queued.jpg', blob:new w.Blob(['queued-photo'], { type:'image/jpeg' }) });
  w.CWB.db.custom.v4_photo_queue = [{ id:'queue-1', attachment_id:queued.id, name:queued.name, reason:'待人工确认', created_at:new Date().toISOString() }];
  w.CWB.save('custom');
  if (w.CWB.workspace && typeof w.CWB.workspace.flush === 'function') await w.CWB.workspace.flush();
  await wait(80);
  w.CWB.render();
  await wait(40);
  const review = w.document.querySelector('[data-act="v4-photo-review"]');
  assert.ok(review, 'queued photos should expose a manual review action');
  review.click();
  await wait(20);
  const reviewSelect = w.document.querySelector('#modal-root [data-k="student_number"]');
  reviewSelect.value = reviewStudent.student_number;
  reviewSelect.dispatchEvent(new w.Event('change', { bubbles:true }));
  w.document.querySelector('#modal-root [data-ok]').click();
  await waitFor(() => w.CWB.db.custom.v4_photo_queue.length === 0);
  if (w.CWB.workspace && typeof w.CWB.workspace.flush === 'function') await w.CWB.workspace.flush();
  const reviewedAttachment = await w.CWB.attachments.get(queued.id);
  const reviewedStudent = w.CWB.db.students.find(item => item.id === reviewStudent.id);
  assert.equal(reviewedAttachment.student_id, reviewStudent.id, 'manual photo review should update the attachment student association');
  assert.equal(w.CWB.db.custom.v4_photo_queue.length, 0, 'manual photo review should remove the queue entry');
  assert.equal(reviewedStudent.photo_assets[0].id, queued.id, 'manual photo review should link the attachment to the student');
  dom.window.close();
  console.log('PASS photo-storage');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
