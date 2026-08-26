const path = require('node:path');

/* SQLite is bundled as an external resource in packaged Electron builds because
 * native .node binaries cannot be loaded from app.asar. JSON remains the
 * portable recovery fallback if the optional native dependency is unavailable
 * during development. */
function loadDatabaseDriver() {
  try { return require('better-sqlite3'); }
  catch (_) {
    if (!process.resourcesPath) return null;
    try { return require(path.join(process.resourcesPath, 'native', 'node_modules', 'better-sqlite3')); }
    catch (_) { return null; }
  }
}

function openStructuredDatabase(file) {
  const Database = loadDatabaseDriver();
  if (!Database) return null;
  let db;
  try { db = new Database(file); } catch (_) { return null; }
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, saved_at TEXT NOT NULL, schema_version INTEGER NOT NULL, reason TEXT NOT NULL, payload TEXT NOT NULL);
           CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, reason TEXT NOT NULL, schema_version INTEGER NOT NULL);
           CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, relative_path TEXT, content_hash TEXT, created_at TEXT NOT NULL);`);
  return {
    writeSnapshot(snapshot) { db.prepare('INSERT INTO snapshots(saved_at,schema_version,reason,payload) VALUES (?,?,?,?)').run(snapshot.savedAt, snapshot.schemaVersion, snapshot.reason, JSON.stringify(snapshot)); },
    readSnapshot() { const row = db.prepare('SELECT payload FROM snapshots ORDER BY id DESC LIMIT 1').get(); return row ? JSON.parse(row.payload) : null; },
    appendTransaction(entry) { db.prepare('INSERT INTO transactions(at,reason,schema_version) VALUES (?,?,?)').run(entry.at, entry.reason, entry.schemaVersion); },
    upsertAttachment(item) { db.prepare('INSERT OR REPLACE INTO attachments(id,record_id,name,mime,size,relative_path,content_hash,created_at) VALUES (?,?,?,?,?,?,?,?)').run(item.id, item.recordId, item.name, item.type || 'application/octet-stream', Number(item.size) || 0, item.relativePath || '', item.contentHash || '', item.createdAt || new Date().toISOString()); },
    findAttachment(recordId, contentHash) { return db.prepare('SELECT * FROM attachments WHERE record_id = ? AND content_hash = ? LIMIT 1').get(String(recordId), String(contentHash || '')) || null; },
    listAttachments() { return db.prepare('SELECT id,record_id AS recordId,name,mime AS type,size,relative_path AS relativePath,content_hash AS contentHash,created_at AS createdAt FROM attachments ORDER BY id').all(); },
    clearAttachments() { db.prepare('DELETE FROM attachments').run(); },
    removeAttachments(recordId) { db.prepare('DELETE FROM attachments WHERE record_id = ?').run(String(recordId)); },
    close() { db.close(); },
  };
}
module.exports = { openStructuredDatabase };
