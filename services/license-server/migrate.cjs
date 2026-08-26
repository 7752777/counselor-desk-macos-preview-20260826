/* Explicit schema migration entry point. It is intentionally fail-closed. */
const fs = require('node:fs');
const path = require('node:path');
const { assertProductionEnvironment } = require('./config.cjs');

async function migrate(pool, options) {
  if (!pool || typeof pool.query !== 'function') throw Object.assign(new Error('LICENSE_DB_REQUIRED'), { code:'LICENSE_DB_REQUIRED' });
  const opts = options || {};
  const schemaPath = opts.schemaPath || path.join(__dirname, 'schema.sql');
  const redemptionSchemaPath = opts.redemptionSchemaPath || path.join(__dirname, 'schema-redemptions.sql');
  const managedRelaySchemaPath = opts.managedRelaySchemaPath || path.join(__dirname, 'schema-managed-relay.sql');
  await pool.query('CREATE TABLE IF NOT EXISTS cwb_schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const apply = async (name, filePath) => {
    const existing = await pool.query('SELECT name FROM cwb_schema_migrations WHERE name=$1', [name]);
    if (existing.rows.length) return false;
    const schema = fs.readFileSync(filePath, 'utf8');
    await pool.query('BEGIN');
    try {
      await pool.query(schema);
      await pool.query('INSERT INTO cwb_schema_migrations (name) VALUES ($1)', [name]);
      await pool.query('COMMIT');
      return true;
    } catch (cause) {
      try { await pool.query('ROLLBACK'); } catch (_) {}
      const error = new Error(`LICENSE_SCHEMA_MIGRATION_FAILED: ${cause.message}`); error.code = 'LICENSE_SCHEMA_MIGRATION_FAILED'; error.cause = cause; throw error;
    }
  };
  const commercialApplied = await apply('v4.9.0-commercial', schemaPath);
  const redemptionApplied = await apply('v4.9.0-redemption-campaigns', redemptionSchemaPath);
  // Keep this separate because the redemption migration may already be marked
  // applied on a server that received the managed-relay table later.
  const managedRelayApplied = await apply('v4.9.0-managed-relay', managedRelaySchemaPath);
  return {
    name:'v4.9.0-managed-relay',
    applied:commercialApplied || redemptionApplied || managedRelayApplied,
    applied_migrations:{ commercial:commercialApplied, redemption_campaigns:redemptionApplied, managed_relay:managedRelayApplied },
  };
}

if (require.main === module) {
  let pg;
  try {
    assertProductionEnvironment(process.env);
    pg = require('pg');
  } catch (cause) { console.error(cause.stack || cause.message || 'PostgreSQL migration requires the services/license-server dependencies.'); process.exitCode = 1; }
  if (pg) {
    const pool = new pg.Pool({ connectionString:process.env.CWB_LICENSE_DATABASE_URL, max:5, ssl:process.env.CWB_LICENSE_DATABASE_SSL === 'true' ? { rejectUnauthorized:true } : undefined });
    migrate(pool).then(result => { console.log(JSON.stringify(result)); return pool.end(); }).catch(error => { console.error(error.stack || error.message); return pool.end().then(() => { process.exitCode = 1; }); });
  }
}

module.exports = { migrate };
