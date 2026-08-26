/* Staging-only signer adapter.
 *
 * The private key is read from a deployment secret path and is never part of
 * the repository or license stock exports. Production must replace this with
 * a KMS/HSM adapter before public sales.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const { createKmsSigner } = require('../kms-signer.cjs');

async function createSigner() {
  const keyPath = String(process.env.CWB_LICENSE_STAGING_PRIVATE_KEY || '').trim();
  if (!keyPath) throw new Error('CWB_LICENSE_STAGING_PRIVATE_KEY is required');
  const privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
  const publicKey = crypto.createPublicKey(privateKey).export({ type:'spki', format:'der' }).toString('base64');
  const kid = String(process.env.CWB_LICENSE_SIGNER_KID || 'staging-primary').trim();
  return createKmsSigner({
    kid,
    publicKeys:{ [kid]:publicKey },
    sign:data => crypto.sign(null, data, privateKey),
  });
}

module.exports = { createSigner };
