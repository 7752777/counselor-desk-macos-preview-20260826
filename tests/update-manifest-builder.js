const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const license = require('../src/core/cwb-license.js');
const update = require('../src/core/cwb-update.js');
const { buildManifest } = require('../scripts/build-update-manifest.js');
const { signManifest } = require('../scripts/sign-update-manifest.js');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cwb-update-contract-'));
  try {
    const artifact = path.join(temp, 'package.exe'); fs.writeFileSync(artifact, 'verified update package');
    const unsigned = buildManifest({ version:'4.9.1', channel:'stable', key_id:'update-contract', notes:'contract', platforms:[{ platform:'win32', arch:'x64', url:'https://cdn.example.test/cwb-4.9.1.exe', path:artifact, signature:'package-signature' }] });
    assert.equal(unsigned.version, '4.9.1'); assert.equal(unsigned.platforms[0].size, fs.statSync(artifact).size);
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const signed = await signManifest(unsigned, { keyId:'update-contract', sign:async data => crypto.sign(null, data, privateKey) });
    assert.equal(await update.verifyManifestSignature(signed, { 'update-contract':publicKey.export({ type:'spki', format:'der' }).toString('base64') }), true);
    assert.throws(() => buildManifest({ version:'4.9.1', platforms:[{ platform:'win32', arch:'x64', url:'http://unsafe.test/pkg', path:artifact, signature:'sig' }] }), /HTTPS url/);
    assert.throws(() => buildManifest({ version:'4.9.1', platforms:[{ platform:'win32', arch:'x64', url:'https://cdn.example.test/pkg', path:artifact }] }), /signature missing/);
    console.log('PASS update-manifest-builder');
  } finally { fs.rmSync(temp, { recursive:true, force:true }); }
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
