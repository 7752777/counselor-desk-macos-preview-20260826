const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, requireBrowserExecutable } = require('../scripts/browser-runtime');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(source, /input\.accept = '\.cwbk'/, 'backup restore picker must only advertise encrypted CWBK files');
  const executablePath = requireBrowserExecutable('V40_BACKUP_ATTACHMENTS');
  const browser = await chromium.launch({ headless:true, executablePath });
  const page = await browser.newPage();
  await page.goto(`file://${path.resolve('output/v4-preview.html').replace(/\\/g, '/')}`);
  await page.waitForTimeout(1800);
  const result = await page.evaluate(async () => {
    await window.CWB.repositories.students.put({ id:'backup-student', student_number:'BACKUP-1', full_name:'备份附件测试' });
    const record = await window.CWB.attachments.add({ id:'backup-attachment', student_id:'backup-student', name:'note.txt', blob:new Blob(['backup attachment payload'], { type:'text/plain' }) });
    const envelope = await window.CWB.backup.export('backup-password');
    const listedBefore = await window.CWB.attachments.list();
    await window.CWB.attachments.delete(record.id);
    const removed = !(await window.CWB.attachments.get(record.id));
    await window.CWB.backup.restore(envelope, 'backup-password', 'merge');
    const restored = await window.CWB.attachments.get(record.id);
    let wrongPassword = ''; try { await window.CWB.backup.restore(envelope, 'wrong-password', 'merge'); } catch (error) { wrongPassword = error.message; }
    const corrupted = { ...envelope, ciphertext: envelope.ciphertext.slice(0, -2) + 'AA' };
    let corruptedBackup = ''; try { await window.CWB.backup.restore(corrupted, 'backup-password', 'merge'); } catch (error) { corruptedBackup = error.message; }
    const audit = await window.CWB.audit.list();
    return { version:envelope.version, exportedAttachment: listedBefore.some(item => item.id === record.id), removed, restored:!!restored && restored.size === record.size, wrongPassword, corruptedBackup, auditExport:audit.some(item => item.action === 'backup_export'), auditRestore:audit.some(item => item.action === 'backup_restore') };
  });
  await browser.close();
  assert.deepEqual(result, { version:8, exportedAttachment:true, removed:true, restored:true, wrongPassword:'BACKUP_PASSWORD_INVALID', corruptedBackup:'BACKUP_INTEGRITY_FAILED', auditExport:true, auditRestore:true });
  console.log('PASS v40-backup-attachments');
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
