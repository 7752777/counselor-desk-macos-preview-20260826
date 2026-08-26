const fs = require('node:fs');
const path = require('node:path');

function copyMissing(source, target) {
  if (!fs.existsSync(source)) return false;
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    let copied = false;
    fs.mkdirSync(target, { recursive:true });
    for (const entry of fs.readdirSync(source, { withFileTypes:true })) {
      copied = copyMissing(path.join(source, entry.name), path.join(target, entry.name)) || copied;
    }
    return copied;
  }
  if (fs.existsSync(target)) return false;
  fs.mkdirSync(path.dirname(target), { recursive:true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
  return true;
}

/**
 * Copies data from the pre-v4.4 desktop layout without replacing any current
 * record, attachment, vault key, or backup. The source remains untouched so a
 * failed upgrade can always be rolled back by the user.
 */
function migrateLegacyDesktopData({ appDataRoot, userDataRoot }) {
  if (!appDataRoot || !userDataRoot) throw new Error('DESKTOP_MIGRATION_PATH_INVALID');
  const mappings = [
    ['database.sqlite', 'counselor-v4.sqlite'],
    ['database.sqlite-wal', 'counselor-v4.sqlite-wal'],
    ['database.sqlite-shm', 'counselor-v4.sqlite-shm'],
    ['counselor-v4.sqlite', 'counselor-v4.sqlite'],
    ['counselor-v4.sqlite-wal', 'counselor-v4.sqlite-wal'],
    ['counselor-v4.sqlite-shm', 'counselor-v4.sqlite-shm'],
    ['attachments', path.join('vault', 'attachments')],
    [path.join('vault', 'attachments'), path.join('vault', 'attachments')],
    ['backups', 'backups'],
    [path.join('vault', 'key.bin'), path.join('vault', 'key.bin')],
    [path.join('vault', 'backup-secret.bin'), path.join('vault', 'backup-secret.bin')],
  ];
  const legacyRoots = [
    path.join(userDataRoot, 'counselor-desk-v4'),
    path.join(appDataRoot, 'counselor-desk'),
  ].filter((root, index, all) => all.indexOf(root) === index && fs.existsSync(root));
  const copied = [];
  for (const legacyRoot of legacyRoots) {
    for (const [from, to] of mappings) {
      if (copyMissing(path.join(legacyRoot, from), path.join(userDataRoot, to))) copied.push({ source:legacyRoot, path:from });
    }
  }
  return { migrated:copied.length > 0, copied, legacyRoots, appDataRoot };
}

module.exports = { migrateLegacyDesktopData };
