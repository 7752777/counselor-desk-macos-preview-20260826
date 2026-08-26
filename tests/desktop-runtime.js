const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const snapshot = { data:{ settings:{ counselor_name:'桌面快照老师' }, students:[{ student_number:'snap-1', full_name:'快照学生' }] } };
  let saveCalls = 0;
  let lastSaved = null;
  const dom = new JSDOM(html, { runScripts:'dangerously', url:'https://c.local/', pretendToBeVisual:true, beforeParse(window) { window.desktopAPI = { loadSnapshot:() => Promise.resolve(snapshot), saveSnapshot:data => { saveCalls++; lastSaved = data; return Promise.resolve({ ok:true }); } }; } });
  await new Promise(resolve => setTimeout(resolve, 450));
  if (dom.window.CWB.db.settings.counselor_name !== '桌面快照老师') throw new Error('desktop snapshot settings were not restored');
  if (dom.window.CWB.db.students[0].full_name !== '快照学生') throw new Error('desktop snapshot students were not restored');
  if (!saveCalls) throw new Error('desktop boot did not persist the loaded snapshot');
  const previousCalls = saveCalls;
  dom.window.CWB.db.settings.counselor_name = 'changed';
  dom.window.CWB.save('settings');
  await new Promise(resolve => setTimeout(resolve, 180));
  if (saveCalls <= previousCalls || !lastSaved || lastSaved.settings.counselor_name !== 'changed') throw new Error('desktop edits were not persisted immediately');
  dom.window.close();

  let recoverySaveCalls = 0;
  const recoveryDom = new JSDOM(html, { runScripts:'dangerously', url:'https://c.local/recovery', pretendToBeVisual:true, beforeParse(window) {
    window.desktopAPI = {
      loadSnapshot:() => Promise.resolve({ schemaVersion:7, recoveryRequired:true }),
      saveSnapshot:() => { recoverySaveCalls++; return Promise.resolve({ ok:true }); },
    };
  } });
  await new Promise(resolve => setTimeout(resolve, 450));
  if (!recoveryDom.window.__CWB_DESKTOP_RECOVERY_REQUIRED__) throw new Error('desktop recovery flag was not propagated');
  if (!recoveryDom.window.CWB.db.settings || recoveryDom.window.CWB.db.students.length) throw new Error('recovery guard seeded or loaded unsafe data');
  if (recoverySaveCalls) throw new Error('recovery guard overwrote a damaged snapshot');
  recoveryDom.window.close();
  console.log('PASS desktop-runtime');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
