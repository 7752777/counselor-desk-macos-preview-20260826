/* Sign a manifest with an external platform/KMS adapter. No private-key path
 * or secret fallback is supported here. */
const fs = require('node:fs');
const path = require('node:path');
const update = require('../src/core/cwb-update.js');

function text(value) { return String(value == null ? '' : value).trim(); }
function loadSigner(modulePath) { if (!modulePath) throw new Error('CWB_UPDATE_SIGNER_MODULE is required'); const moduleValue = require(path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath)); return typeof moduleValue.createSigner === 'function' ? moduleValue.createSigner() : moduleValue; }
async function signManifest(manifest, signer) {
  if (!signer || typeof signer.sign !== 'function') throw new Error('update signer must export sign(bytes, context)');
  const value = { ...manifest };
  const keyId = text(signer.keyId || signer.kid || value.key_id); if (!keyId) throw new Error('update signer key id is required');
  value.key_id = keyId; delete value.manifest_signature;
  const signature = await signer.sign(Buffer.from(update.manifestSigningBytes(value)), { key_id:keyId, version:value.version, channel:value.channel });
  const bytes = typeof signature === 'string' ? Buffer.from(signature, 'base64url') : Buffer.from(signature || []);
  if (bytes.length < 32) throw new Error('update signer returned an invalid signature');
  return update.normalizeManifest({ ...value, manifest_signature:bytes.toString('base64url') });
}
async function main(argv) {
  const args = {}; for (let i = 0; i < argv.length; i += 1) { if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
  if (!args.input || !args.output) throw new Error('usage: node scripts/sign-update-manifest.js --input manifest.json --output signed-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(path.resolve(String(args.input)), 'utf8'));
  const signed = await signManifest(manifest, loadSigner(args.signer || process.env.CWB_UPDATE_SIGNER_MODULE));
  fs.writeFileSync(path.resolve(String(args.output)), `${JSON.stringify(signed, null, 2)}\n`, 'utf8');
  return signed;
}
if (require.main === module) { main(process.argv.slice(2)).then(() => console.log('PASS update manifest signing')).catch(error => { console.error(error.stack || error.message); process.exitCode = 1; }); }
module.exports = { signManifest, loadSigner };
