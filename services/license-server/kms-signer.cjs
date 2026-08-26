/*
 * Production license signer boundary.
 *
 * The commercial service must receive an Ed25519 signing operation from a
 * KMS/HSM adapter. This module intentionally has no filesystem or private-key
 * loading path. A local private-key signer remains available in service.cjs
 * for contract tests only.
 */
const crypto = require('node:crypto');
const licenseCore = require('../../src/core/cwb-license.js');

function text(value) { return String(value == null ? '' : value).trim(); }
function codedError(code, message, cause) {
  const error = new Error(`${code}: ${message || code}`);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}
function base64url(value) { return Buffer.from(value).toString('base64url'); }
function payloadSegment(payload) { return base64url(JSON.stringify(payload)); }

function createKmsSigner(options) {
  const opts = options || {};
  const kid = text(opts.kid);
  if (!kid || !/^[A-Za-z0-9._-]{1,64}$/.test(kid)) {
    throw codedError('LICENSE_SIGNING_KID_INVALID', '签名密钥版本无效');
  }
  if (typeof opts.sign !== 'function') {
    throw codedError('LICENSE_KMS_ADAPTER_REQUIRED', '生产签名器必须注入 KMS/HSM sign 适配器');
  }
  const publicKeys = opts.publicKeys || {};
  if (!publicKeys[kid] && !publicKeys.default) {
    throw codedError('LICENSE_PUBLIC_KEY_REQUIRED', '生产签名器必须同时配置对应公钥');
  }
  const keyValues = Object.values(publicKeys);
  if (keyValues.some(value => typeof value === 'string' && /PRIVATE KEY|BEGIN EC PRIVATE|BEGIN RSA PRIVATE/i.test(value))) {
    throw codedError('LICENSE_PRIVATE_KEY_FORBIDDEN', '私钥不能注入签名适配器的公钥配置');
  }

  return Object.freeze({
    kid,
    publicKeys,
    publicKey:publicKeys[kid] || publicKeys.default,
    async issue(payload, options) {
      const value = Object.assign({}, payload || {}, { kid });
      const segment = payloadSegment(value);
      let signature;
      try { signature = await opts.sign(Buffer.from(segment, 'utf8'), { algorithm:'Ed25519', kid }); }
      catch (cause) { throw codedError('LICENSE_KMS_SIGN_FAILED', 'KMS/HSM 签名失败', cause); }
      if (typeof signature === 'string') {
        try { signature = Buffer.from(signature, 'base64url'); }
        catch (cause) { throw codedError('LICENSE_SIGNATURE_OUTPUT_INVALID', 'KMS/HSM 返回的签名无效', cause); }
      }
      if (!(signature instanceof Uint8Array) && !Buffer.isBuffer(signature)) {
        throw codedError('LICENSE_SIGNATURE_OUTPUT_INVALID', 'KMS/HSM 必须返回签名字节或 base64url');
      }
      if (signature.length !== 64) throw codedError('LICENSE_SIGNATURE_OUTPUT_INVALID', 'Ed25519 签名必须是 64 字节');
      return `${options && options.prefix || licenseCore.TOKEN_PREFIX}.${segment}.${base64url(signature)}`;
    },
  });
}

function createAwsKmsSigner(options) {
  const opts = options || {};
  if (!opts.client || typeof opts.client.send !== 'function' || !opts.commandFactory) {
    throw codedError('LICENSE_KMS_ADAPTER_REQUIRED', 'AWS KMS 适配器需要 client.send 和 commandFactory');
  }
  return createKmsSigner({
    kid:opts.kid,
    publicKeys:opts.publicKeys,
    sign:async (data, context) => {
      const command = opts.commandFactory({ KeyId:opts.keyId, Message:data, MessageType:'RAW', SigningAlgorithm:'ED25519_SHA_512', kid:context.kid });
      const result = await opts.client.send(command);
      if (!result || !result.Signature) throw codedError('LICENSE_SIGNATURE_OUTPUT_INVALID');
      return Buffer.from(result.Signature);
    },
  });
}

module.exports = { createKmsSigner, createAwsKmsSigner, codedError };
