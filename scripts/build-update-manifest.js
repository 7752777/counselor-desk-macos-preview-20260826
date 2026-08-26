/* Build an unsigned update manifest. Package signing is intentionally a
 * separate step owned by the platform signing pipeline. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const update = require('../src/core/cwb-update.js');

function text(value) { return String(value == null ? '' : value).trim(); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function parseArgs(argv) { const args = {}; for (let i = 0; i < argv.length; i += 1) { const item = argv[i]; if (!item.startsWith('--')) continue; const key = item.slice(2); args[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; } return args; }
function stablePackage(value) {
  const row = value || {};
  const file = text(row.path || row.file);
  if (!text(row.platform) || !text(row.arch) || !/^https:\/\//i.test(text(row.url))) throw new Error('update package requires platform, arch and HTTPS url');
  const sha256 = text(row.sha256).toLowerCase() || (file ? sha256File(path.resolve(file)) : '');
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`update package hash missing: ${row.platform}/${row.arch}`);
  if (!text(row.signature)) throw new Error(`update package signature missing: ${row.platform}/${row.arch}`);
  return { platform:text(row.platform), arch:text(row.arch), url:text(row.url), sha256, signature:text(row.signature), size:Number(row.size || (file ? fs.statSync(path.resolve(file)).size : 0)), required_entitlement:text(row.required_entitlement || 'core_update'), min_version:text(row.min_version || ''), installer:text(row.installer || 'electron-updater') };
}
function buildManifest(options) {
  const opts = options || {};
  const packages = Array.isArray(opts.platforms) ? opts.platforms.map(stablePackage) : [];
  if (!packages.length) throw new Error('at least one update package is required');
  return update.normalizeManifest({ format:update.MANIFEST_FORMAT, version:text(opts.version).replace(/^v/i, ''), channel:text(opts.channel || 'stable'), published_at:text(opts.published_at || new Date().toISOString()), mandatory:opts.mandatory === true, min_compatible_version:text(opts.min_compatible_version || ''), notes:text(opts.notes || ''), key_id:text(opts.key_id || ''), manifest_signature:'', platforms:packages });
}
function main(argv) {
  const args = parseArgs(argv || process.argv.slice(2));
  if (!args.input || !args.output) throw new Error('usage: node scripts/build-update-manifest.js --input packages.json --output manifest.json --version 4.9.1');
  const input = JSON.parse(fs.readFileSync(path.resolve(String(args.input)), 'utf8'));
  const manifest = buildManifest(Object.assign({}, input, { version:args.version || input.version, channel:args.channel || input.channel, key_id:args.key_id || input.key_id }));
  fs.mkdirSync(path.dirname(path.resolve(String(args.output))), { recursive:true });
  fs.writeFileSync(path.resolve(String(args.output)), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
if (require.main === module) { try { main(); console.log('PASS update manifest build'); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; } }
module.exports = { buildManifest, stablePackage, sha256File, parseArgs };
