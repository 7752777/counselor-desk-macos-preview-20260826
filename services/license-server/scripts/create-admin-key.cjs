const crypto = require('node:crypto');
const { assertProductionEnvironment } = require('../config.cjs');

function requiredEnv(name) { const value = String(process.env[name] || '').trim(); if (!value) throw new Error(`${name} is required`); return value; }
async function main() {
  const deployment = assertProductionEnvironment(process.env);
  if (!deployment.production) throw Object.assign(new Error('LICENSE_ENV_PRODUCTION_REQUIRED: admin keys must be created in production mode'), { code:'LICENSE_ENV_PRODUCTION_REQUIRED' });
  let pg; try { pg = require('pg'); } catch (cause) { throw new Error(`pg dependency missing: ${cause.message}`); }
  const raw = `cwb_admin_${crypto.randomBytes(32).toString('base64url')}`;
  const keyHash = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  const keyId = `admin_${crypto.randomUUID()}`;
  const label = String(process.env.CWB_ADMIN_KEY_LABEL || 'initial operator').trim();
  const roles = JSON.stringify(String(process.env.CWB_ADMIN_KEY_ROLES || 'operator').split(',').map(value => value.trim()).filter(Boolean));
  const pool = new pg.Pool({ connectionString:requiredEnv('CWB_LICENSE_DATABASE_URL'), ssl:process.env.CWB_LICENSE_DATABASE_SSL === 'true' ? { rejectUnauthorized:true } : undefined });
  try {
    await pool.query('INSERT INTO cwb_admin_api_keys (key_id,label,key_hash,roles,status) VALUES ($1,$2,$3,$4::jsonb,\'active\')', [keyId, label, keyHash, roles]);
    console.log(JSON.stringify({ key_id:keyId, label, api_key:raw, warning:'This value is shown once. Store it in a password manager.' }));
  } finally { await pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { main };
