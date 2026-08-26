const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateLegacyDesktopData } = require('../desktop/data-migration.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-desktop-migration-'));
const appDataRoot = path.join(root, 'AppData', 'Roaming');
const userDataRoot = path.join(appDataRoot, 'Counselor Desk');
const legacyRoot = path.join(userDataRoot, 'counselor-desk-v4');
const priorProductRoot = path.join(appDataRoot, 'counselor-desk');

try {
  fs.mkdirSync(path.join(legacyRoot, 'attachments'), { recursive:true });
  fs.mkdirSync(path.join(legacyRoot, 'backups'), { recursive:true });
  fs.mkdirSync(path.join(legacyRoot, 'vault'), { recursive:true });
  fs.writeFileSync(path.join(legacyRoot, 'database.sqlite'), 'legacy-db');
  fs.writeFileSync(path.join(legacyRoot, 'database.sqlite-wal'), 'legacy-wal');
  fs.writeFileSync(path.join(legacyRoot, 'attachments', 'legacy.bin'), 'attachment-bytes');
  fs.writeFileSync(path.join(legacyRoot, 'backups', 'legacy.cwbk'), 'backup-bytes');
  fs.writeFileSync(path.join(legacyRoot, 'vault', 'key.bin'), 'legacy-key');

  const first = migrateLegacyDesktopData({ appDataRoot, userDataRoot });
  assert.equal(first.migrated, true, 'a missing v4.4 data root must receive legacy data');
  assert.equal(fs.readFileSync(path.join(userDataRoot, 'counselor-v4.sqlite'), 'utf8'), 'legacy-db');
  assert.equal(fs.readFileSync(path.join(userDataRoot, 'counselor-v4.sqlite-wal'), 'utf8'), 'legacy-wal');
  assert.equal(fs.readFileSync(path.join(userDataRoot, 'vault', 'attachments', 'legacy.bin'), 'utf8'), 'attachment-bytes');
  assert.equal(fs.readFileSync(path.join(userDataRoot, 'backups', 'legacy.cwbk'), 'utf8'), 'backup-bytes');
  assert.equal(fs.readFileSync(path.join(userDataRoot, 'vault', 'key.bin'), 'utf8'), 'legacy-key');

  fs.writeFileSync(path.join(userDataRoot, 'counselor-v4.sqlite'), 'current-db');
  fs.writeFileSync(path.join(userDataRoot, 'vault', 'attachments', 'current.bin'), 'current-attachment');
  const second = migrateLegacyDesktopData({ appDataRoot, userDataRoot });
  assert.equal(second.migrated, false, 'a repeated startup must not overwrite current data');
  assert.equal(fs.readFileSync(path.join(userDataRoot, 'counselor-v4.sqlite'), 'utf8'), 'current-db');
  assert.equal(fs.readFileSync(path.join(userDataRoot, 'vault', 'attachments', 'current.bin'), 'utf8'), 'current-attachment');
  assert.equal(fs.readFileSync(path.join(legacyRoot, 'database.sqlite'), 'utf8'), 'legacy-db', 'migration must preserve the source directory');

  const secondRoot = path.join(root, 'second-profile');
  fs.mkdirSync(path.join(priorProductRoot, 'vault', 'attachments'), { recursive:true });
  fs.writeFileSync(path.join(priorProductRoot, 'counselor-v4.sqlite'), 'prior-product-db');
  fs.writeFileSync(path.join(priorProductRoot, 'vault', 'attachments', 'prior.bin'), 'prior-product-attachment');
  const prior = migrateLegacyDesktopData({ appDataRoot, userDataRoot:secondRoot });
  assert.equal(prior.migrated, true, 'the historical package-name root must migrate too');
  assert.equal(fs.readFileSync(path.join(secondRoot, 'counselor-v4.sqlite'), 'utf8'), 'prior-product-db');
  assert.equal(fs.readFileSync(path.join(secondRoot, 'vault', 'attachments', 'prior.bin'), 'utf8'), 'prior-product-attachment');
  console.log('PASS desktop-data-migration');
} finally {
  fs.rmSync(root, { recursive:true, force:true });
}
