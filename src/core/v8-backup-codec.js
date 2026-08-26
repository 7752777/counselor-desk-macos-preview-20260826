/* Schema-v8 encrypted backup codec. Storage and migration remain outside this module. */
(function attachV8BackupCodec(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBv8BackupCodec = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV8BackupCodecRuntime(root) {
  'use strict';

  const SCHEMA_VERSION = 8;
  const BACKUP_VERSION = 8;
  const V7_BACKUP_VERSION = 7;
  const CODEC_TAG = '__cwb_v8_backup_codec__';
  const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const V8_HEADER_FIELDS = new Set([
    'format', 'version', 'schemaVersion', 'kdf', 'time', 'memory', 'parallelism',
    'salt', 'iv', 'created_at',
  ]);
  const V8_ENVELOPE_FIELDS = new Set([
    ...V8_HEADER_FIELDS,
    'ciphertext', 'integrity',
  ]);
  const TYPED_ARRAY_TYPES = new Set([
    'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
    'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  ]);

  const TYPED_ARRAY_TAGS = new Set([
    '[object Int8Array]', '[object Uint8Array]', '[object Uint8ClampedArray]',
    '[object Int16Array]', '[object Uint16Array]', '[object Int32Array]',
    '[object Uint32Array]', '[object Float32Array]', '[object Float64Array]',
    '[object BigInt64Array]', '[object BigUint64Array]', '[object DataView]',
  ]);

  function error(code) { return new Error(code); }

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function objectTag(value) {
    return Object.prototype.toString.call(value);
  }

  function isBlob(value) {
    return !!value && objectTag(value) === '[object Blob]';
  }

  function isArrayBuffer(value) {
    return !!value && objectTag(value) === '[object ArrayBuffer]';
  }

  function isArrayBufferView(value) {
    if (!value || typeof value !== 'object') return false;
    const ArrayBufferCtor = root.ArrayBuffer || (typeof ArrayBuffer !== 'undefined' ? ArrayBuffer : null);
    if (ArrayBufferCtor && typeof ArrayBufferCtor.isView === 'function' && ArrayBufferCtor.isView(value)) return true;
    return TYPED_ARRAY_TAGS.has(objectTag(value));
  }

  function isDate(value) {
    return !!value && objectTag(value) === '[object Date]';
  }

  function isMap(value) {
    return !!value && objectTag(value) === '[object Map]';
  }

  function isSet(value) {
    return !!value && objectTag(value) === '[object Set]';
  }

  function realmConstructor(value, name) {
    if (!value || typeof Object.getOwnPropertySymbols !== 'function') return null;
    for (const symbol of Object.getOwnPropertySymbols(value)) {
      if (String(symbol) !== 'Symbol(impl)') continue;
      const implementation = value[symbol];
      const candidate = implementation && implementation._globalObject && implementation._globalObject[name];
      if (typeof candidate === 'function') return candidate;
    }
    return null;
  }

  async function readBlobBytes(value) {
    if (typeof value.arrayBuffer === 'function') return new Uint8Array(await value.arrayBuffer());
    const Reader = root.FileReader || realmConstructor(value, 'FileReader');
    if (typeof Reader !== 'function') throw error('BACKUP_BINARY_UNSUPPORTED');
    return new Promise((resolve, reject) => {
      const reader = new Reader();
      reader.onerror = () => reject(reader.error || error('BACKUP_BINARY_INVALID'));
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.readAsArrayBuffer(value);
    });
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function assertSafeKey(key) {
    if (DANGEROUS_KEYS.has(String(key))) throw error('BACKUP_PAYLOAD_UNSAFE_KEY');
  }

  function assertSafeValue(value, seen) {
    if (!isObject(value)) return;
    const references = seen || new Set();
    if (references.has(value)) return;
    references.add(value);
    if (Array.isArray(value)) {
      value.forEach(item => assertSafeValue(item, references));
      return;
    }
    if (isMap(value)) {
      value.forEach((item, key) => { assertSafeValue(key, references); assertSafeValue(item, references); });
      return;
    }
    if (isSet(value)) {
      value.forEach(item => assertSafeValue(item, references));
      return;
    }
    if (isBinary(value) || isDate(value)) return;
    Object.keys(value).forEach(key => {
      assertSafeKey(key);
      assertSafeValue(value[key], references);
    });
  }

  function isBinary(value) {
    if (!value) return false;
    return isBlob(value) || isArrayBuffer(value) || isArrayBufferView(value);
  }

  function asBytes(value, code) {
    if (objectTag(value) === '[object Uint8Array]') return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (isArrayBuffer(value)) return new Uint8Array(value);
    if (isArrayBufferView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw error(code || 'BACKUP_BINARY_INVALID');
  }

  function defaultEncodeBase64(value) {
    const bytes = asBytes(value);
    if (root.Buffer && typeof root.Buffer.from === 'function') return root.Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    if (typeof root.btoa !== 'function') throw error('BACKUP_BASE64_UNAVAILABLE');
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return root.btoa(binary);
  }

  function isCanonicalBase64(value) {
    return typeof value === 'string'
      && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value);
  }

  function defaultDecodeBase64(value) {
    if (!isCanonicalBase64(value)) throw error('BACKUP_BASE64_INVALID');
    if (root.Buffer && typeof root.Buffer.from === 'function') {
      const decoded = root.Buffer.from(value, 'base64');
      if (decoded.toString('base64') !== value) throw error('BACKUP_BASE64_INVALID');
      return new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength);
    }
    if (typeof root.atob !== 'function') throw error('BACKUP_BASE64_UNAVAILABLE');
    let binary;
    try { binary = root.atob(value); } catch (_) { throw error('BACKUP_BASE64_INVALID'); }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (defaultEncodeBase64(bytes) !== value) throw error('BACKUP_BASE64_INVALID');
    return bytes;
  }

  function stable(value, seen) {
    if (value === null) return 'null';
    const type = typeof value;
    if (type === 'string' || type === 'boolean') return JSON.stringify(value);
    if (type === 'number') {
      if (!Number.isFinite(value)) throw error('BACKUP_HEADER_INVALID');
      return JSON.stringify(value);
    }
    if (type !== 'object') throw error('BACKUP_HEADER_INVALID');
    const references = seen || new Set();
    if (references.has(value)) throw error('BACKUP_HEADER_INVALID');
    references.add(value);
    let output;
    if (Array.isArray(value)) output = `[${value.map(item => stable(item, references)).join(',')}]`;
    else output = `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key], references)}`).join(',')}}`;
    references.delete(value);
    return output;
  }

  function makeTextApi(options) {
    const Encoder = options.TextEncoder || root.TextEncoder;
    const Decoder = options.TextDecoder || root.TextDecoder;
    if (typeof Encoder !== 'function' || typeof Decoder !== 'function') throw error('BACKUP_TEXT_CODEC_UNAVAILABLE');
    return { encoder:new Encoder(), decoder:new Decoder() };
  }

  function makeBase64Api(options) {
    const override = options.base64 || {};
    return {
      encode:typeof override.encode === 'function' ? value => String(override.encode(asBytes(value))) : defaultEncodeBase64,
      decode:typeof override.decode === 'function' ? value => asBytes(override.decode(value), 'BACKUP_BASE64_INVALID') : defaultDecodeBase64,
    };
  }

  function makeHeader(envelope, allowCiphertext) {
    if (!isObject(envelope) || Array.isArray(envelope)) throw error('BACKUP_HEADER_INVALID');
    const allowed = allowCiphertext ? V8_ENVELOPE_FIELDS : V8_HEADER_FIELDS;
    let keys;
    try {
      keys = typeof Reflect !== 'undefined' && typeof Reflect.ownKeys === 'function'
        ? Reflect.ownKeys(envelope)
        : Object.getOwnPropertyNames(envelope).concat(
          typeof Object.getOwnPropertySymbols === 'function' ? Object.getOwnPropertySymbols(envelope) : [],
        );
    } catch (_) {
      throw error('BACKUP_HEADER_INVALID');
    }
    keys.forEach(key => {
      if (typeof key !== 'string' || !allowed.has(key)) throw error('BACKUP_HEADER_INVALID');
    });
    const header = {
      format:envelope && envelope.format,
      version:Number(envelope && envelope.version),
      schemaVersion:Number(envelope && envelope.schemaVersion),
      kdf:envelope && envelope.kdf,
      time:Number(envelope && envelope.time),
      memory:Number(envelope && envelope.memory),
      parallelism:Number(envelope && envelope.parallelism),
      salt:envelope && envelope.salt,
      iv:envelope && envelope.iv,
      created_at:envelope && envelope.created_at,
    };
    if (header.format !== 'cwbk' || header.version !== BACKUP_VERSION || header.schemaVersion !== SCHEMA_VERSION) throw error('BACKUP_FORMAT_UNSUPPORTED');
    if (header.kdf !== 'argon2id') throw error('BACKUP_KDF_UNSUPPORTED');
    if (!Number.isInteger(header.time) || header.time < 1 || header.time > 10
      || !Number.isInteger(header.memory) || header.memory < 8192 || header.memory > 262144
      || !Number.isInteger(header.parallelism) || header.parallelism < 1 || header.parallelism > 8) throw error('BACKUP_KDF_PARAMETERS_INVALID');
    if (!isCanonicalBase64(header.salt) || !isCanonicalBase64(header.iv) || typeof header.created_at !== 'string' || !header.created_at) throw error('BACKUP_HEADER_INVALID');
    return header;
  }

  function sameBytes(left, right) {
    if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.byteLength !== right.byteLength) return false;
    let difference = 0;
    for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
    return difference === 0;
  }

  async function digest(cryptoApi, bytes) {
    return new Uint8Array(await cryptoApi.subtle.digest('SHA-256', asBytes(bytes)));
  }

  async function deriveArgon2Key(cryptoApi, argon2, text, password, salt, parameters, info) {
    if (!argon2 || typeof argon2.hash !== 'function' || !argon2.ArgonType || argon2.ArgonType.Argon2id == null) throw error('ARGON2_UNAVAILABLE');
    const result = await argon2.hash({
      pass:password,
      salt,
      time:parameters.time,
      mem:parameters.memory,
      parallelism:parameters.parallelism,
      hashLen:32,
      type:argon2.ArgonType.Argon2id,
    });
    if (!result || !result.hash) throw error('ARGON2_DERIVATION_FAILED');
    const material = await cryptoApi.subtle.importKey('raw', asBytes(result.hash, 'ARGON2_DERIVATION_FAILED'), 'HKDF', false, ['deriveKey']);
    return cryptoApi.subtle.deriveKey({
      name:'HKDF', hash:'SHA-256', salt,
      info:text.encoder.encode(info),
    }, material, { name:'AES-GCM', length:256 }, false, ['encrypt', 'decrypt']);
  }

  async function derivePbkdf2Key(cryptoApi, text, password, salt, iterations) {
    const material = await cryptoApi.subtle.importKey('raw', text.encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return cryptoApi.subtle.deriveKey({ name:'PBKDF2', salt, iterations, hash:'SHA-256' }, material, { name:'AES-GCM', length:256 }, false, ['encrypt', 'decrypt']);
  }

  function makeTag(type, fields) {
    return Object.assign({ [CODEC_TAG]:type }, fields || {});
  }

  async function encodePortable(value, base64, seen) {
    if (value === undefined) return makeTag('undefined');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return value;
      return makeTag('number', { value:String(value) });
    }
    if (typeof value === 'bigint') return makeTag('bigint', { value:value.toString() });
    if (typeof value === 'function' || typeof value === 'symbol') throw error('BACKUP_PAYLOAD_UNSUPPORTED');
    if (isDate(value)) return makeTag('date', { value:value.toISOString() });
    if (isBlob(value)) {
      return makeTag('blob', { type:String(value.type || ''), data:base64.encode(await readBlobBytes(value)) });
    }
    if (isArrayBuffer(value)) return makeTag('array-buffer', { data:base64.encode(new Uint8Array(value)) });
    if (isArrayBufferView(value)) {
      const type = objectTag(value) === '[object DataView]' ? 'DataView' : String(value.constructor && value.constructor.name || 'Uint8Array');
      return makeTag('typed-array', { type, data:base64.encode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) });
    }
    const references = seen || new Set();
    if (references.has(value)) throw error('BACKUP_PAYLOAD_CYCLIC');
    references.add(value);
    let encoded;
    if (Array.isArray(value)) {
      encoded = [];
      for (const item of value) encoded.push(await encodePortable(item, base64, references));
    } else if (isMap(value)) {
      const entries = [];
      for (const [key, item] of value.entries()) entries.push([await encodePortable(key, base64, references), await encodePortable(item, base64, references)]);
      encoded = makeTag('map', { entries });
    } else if (isSet(value)) {
      const entries = [];
      for (const item of value.values()) entries.push(await encodePortable(item, base64, references));
      encoded = makeTag('set', { entries });
    } else {
      const prototype = Object.getPrototypeOf(value);
      // Backups can cross a browser/desktop realm boundary. A plain object from
      // another realm has a different Object.prototype but still has Object as
      // its constructor; other class instances remain unsupported.
      if (prototype !== Object.prototype && prototype !== null
        && (!prototype.constructor || prototype.constructor.name !== 'Object')) throw error('BACKUP_PAYLOAD_UNSUPPORTED');
      const output = {};
      for (const key of Object.keys(value)) {
        assertSafeKey(key);
        Object.defineProperty(output, key, { value:await encodePortable(value[key], base64, references), enumerable:true, configurable:true, writable:true });
      }
      encoded = own(value, CODEC_TAG) ? makeTag('object', { value:output }) : output;
    }
    references.delete(value);
    return encoded;
  }

  function makeRecord() { return {}; }

  function decodeEscapedObject(value, base64) {
    if (!isObject(value) || Array.isArray(value)) throw error('BACKUP_PAYLOAD_INVALID');
    const output = makeRecord();
    for (const key of Object.keys(value)) {
      assertSafeKey(key);
      Object.defineProperty(output, key, { value:decodePortable(value[key], base64), enumerable:true, configurable:true, writable:true });
    }
    return output;
  }

  function decodePortable(value, base64) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
    if (Array.isArray(value)) return value.map(item => decodePortable(item, base64));
    if (!isObject(value)) throw error('BACKUP_PAYLOAD_INVALID');
    const tag = value[CODEC_TAG];
    if (typeof tag === 'string') {
      if (tag === 'undefined') return undefined;
      if (tag === 'number') {
        if (!['NaN', 'Infinity', '-Infinity'].includes(value.value)) throw error('BACKUP_PAYLOAD_INVALID');
        return Number(value.value);
      }
      if (tag === 'bigint') {
        try { return BigInt(value.value); } catch (_) { throw error('BACKUP_PAYLOAD_INVALID'); }
      }
      if (tag === 'date') {
        const date = new Date(value.value);
        if (Number.isNaN(date.getTime())) throw error('BACKUP_PAYLOAD_INVALID');
        return date;
      }
      if (tag === 'blob') {
        if (typeof root.Blob !== 'function') throw error('BACKUP_BINARY_UNSUPPORTED');
        return new root.Blob([base64.decode(value.data)], { type:String(value.type || '') });
      }
      if (tag === 'array-buffer') {
        const bytes = base64.decode(value.data);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }
      if (tag === 'typed-array') {
        const bytes = base64.decode(value.data);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        if (value.type === 'DataView') return new DataView(buffer);
        if (value.type === 'Buffer' && root.Buffer && typeof root.Buffer.from === 'function') return root.Buffer.from(bytes);
        if (!TYPED_ARRAY_TYPES.has(value.type) || typeof root[value.type] !== 'function') throw error('BACKUP_BINARY_UNSUPPORTED');
        return new root[value.type](buffer);
      }
      if (tag === 'map') {
        if (!Array.isArray(value.entries)) throw error('BACKUP_PAYLOAD_INVALID');
        return new Map(value.entries.map(entry => {
          if (!Array.isArray(entry) || entry.length !== 2) throw error('BACKUP_PAYLOAD_INVALID');
          return [decodePortable(entry[0], base64), decodePortable(entry[1], base64)];
        }));
      }
      if (tag === 'set') {
        if (!Array.isArray(value.entries)) throw error('BACKUP_PAYLOAD_INVALID');
        return new Set(value.entries.map(item => decodePortable(item, base64)));
      }
      if (tag === 'object') return decodeEscapedObject(value.value, base64);
      throw error('BACKUP_PAYLOAD_INVALID');
    }
    return decodeEscapedObject(value, base64);
  }

  function sourceVersion(value) {
    const source = value || {};
    const candidate = source.package_version != null ? source.package_version
      : source.schema_version != null ? source.schema_version
        : source.schemaVersion != null ? source.schemaVersion : source.version;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    const match = String(candidate == null ? '' : candidate).match(/^(\d+(?:\.\d+)?)(?:\.\d+)?(?:[-+].*)?$/);
    return match ? Number(match[1]) : null;
  }

  function assertLegacyVersion(version) {
    if (version == null || version < 1 || version > V7_BACKUP_VERSION) throw error('BACKUP_PLAINTEXT_VERSION_UNSUPPORTED');
    return version;
  }

  function createBackupCodec(options) {
    const config = options || {};
    const cryptoApi = config.crypto || root.crypto;
    if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.getRandomValues !== 'function') throw error('WEB_CRYPTO_UNAVAILABLE');
    const text = makeTextApi(config);
    const base64 = makeBase64Api(config);
    const verifyV8Backup = config.verifyV8Backup;
    const defaultMigrate = config.migrate;
    const now = typeof config.now === 'function' ? config.now : () => new Date().toISOString();
    const argon2 = config.argon2 || root.argon2;
    const argon2Parameters = Object.assign({ time:3, memory:65536, parallelism:1 }, config.argon2Parameters || {});

    if (typeof verifyV8Backup !== 'function') throw error('BACKUP_V8_VERIFIER_REQUIRED');

    async function assertVerifiedV8Backup(backup) {
      if (!isObject(backup) || !isObject(backup.manifest) || !isObject(backup.data)
        || !Array.isArray(backup.history) || !Array.isArray(backup.recoveryPoints)
        || (backup.auxiliary != null && (!isObject(backup.auxiliary) || Array.isArray(backup.auxiliary)))
        || Number(backup.manifest.schemaVersion) !== SCHEMA_VERSION) throw error('BACKUP_V8_INVALID');
      assertSafeValue(backup);
      let result;
      try { result = await verifyV8Backup(backup); }
      catch (_) { throw error('BACKUP_V8_NOT_VERIFIED'); }
      if (!result || result.ok !== true) throw error('BACKUP_V8_NOT_VERIFIED');
      return backup;
    }

    async function migrateLegacy(legacyPackage, version, context, override) {
      const migrate = override && own(override, 'migrate') ? override.migrate : defaultMigrate;
      if (typeof migrate !== 'function') throw error('BACKUP_MIGRATION_REQUIRED');
      const backup = await migrate(legacyPackage, Object.assign({
        sourceVersion:version,
        targetSchemaVersion:SCHEMA_VERSION,
      }, context || {}));
      await assertVerifiedV8Backup(backup);
      return { backup, sourceVersion:version, migrated:true };
    }

    async function encrypt(backup, password) {
      if (typeof password !== 'string' || password.length < 8) throw error('BACKUP_PASSWORD_TOO_SHORT');
      await assertVerifiedV8Backup(backup);
      const header = {
        format:'cwbk',
        version:BACKUP_VERSION,
        schemaVersion:SCHEMA_VERSION,
        kdf:'argon2id',
        time:Number(argon2Parameters.time),
        memory:Number(argon2Parameters.memory),
        parallelism:Number(argon2Parameters.parallelism),
        salt:base64.encode(cryptoApi.getRandomValues(new Uint8Array(16))),
        iv:base64.encode(cryptoApi.getRandomValues(new Uint8Array(12))),
        created_at:String(now()),
      };
      const checkedHeader = makeHeader(header);
      const payload = await encodePortable({
        manifest:backup.manifest,
        data:backup.data,
        history:backup.history,
        recoveryPoints:backup.recoveryPoints,
        attachments:Array.isArray(backup.attachments) ? backup.attachments : [],
        auxiliary:backup.auxiliary || {},
      }, base64);
      const salt = base64.decode(checkedHeader.salt);
      const iv = base64.decode(checkedHeader.iv);
      const key = await deriveArgon2Key(cryptoApi, argon2, text, password, salt, checkedHeader, 'CWB v8 backup AES-256-GCM');
      const ciphertext = new Uint8Array(await cryptoApi.subtle.encrypt({
        name:'AES-GCM', iv, additionalData:text.encoder.encode(stable(checkedHeader)),
      }, key, text.encoder.encode(JSON.stringify(payload))));
      const ciphertextBase64 = base64.encode(ciphertext);
      const integrity = await digest(cryptoApi, text.encoder.encode(stable({ header:checkedHeader, ciphertext:ciphertextBase64 })));
      return Object.assign({}, checkedHeader, { ciphertext:ciphertextBase64, integrity:base64.encode(integrity) });
    }

    async function decryptV8(envelope, password) {
      const header = makeHeader(envelope, true);
      if (!isCanonicalBase64(envelope.ciphertext) || !isCanonicalBase64(envelope.integrity)) throw error('BACKUP_INTEGRITY_FAILED');
      const expected = await digest(cryptoApi, text.encoder.encode(stable({ header, ciphertext:envelope.ciphertext })));
      let supplied;
      try { supplied = base64.decode(envelope.integrity); } catch (_) { throw error('BACKUP_INTEGRITY_FAILED'); }
      if (!sameBytes(expected, supplied)) throw error('BACKUP_INTEGRITY_FAILED');
      let plaintext;
      try {
        const key = await deriveArgon2Key(cryptoApi, argon2, text, password, base64.decode(header.salt), header, 'CWB v8 backup AES-256-GCM');
        plaintext = await cryptoApi.subtle.decrypt({
          name:'AES-GCM', iv:base64.decode(header.iv), additionalData:text.encoder.encode(stable(header)),
        }, key, base64.decode(envelope.ciphertext));
      } catch (cause) {
        if (cause && /^ARGON2_/.test(String(cause.message || cause))) throw cause;
        throw error('BACKUP_PASSWORD_INVALID');
      }
      let encoded;
      try { encoded = JSON.parse(text.decoder.decode(plaintext)); } catch (_) { throw error('BACKUP_PAYLOAD_INVALID'); }
      const backup = decodePortable(encoded, base64);
      await assertVerifiedV8Backup(backup);
      return { backup, sourceVersion:SCHEMA_VERSION, migrated:false };
    }

    async function decryptV7(envelope, password) {
      if (!envelope || envelope.format !== 'cwbk' || Number(envelope.version) !== V7_BACKUP_VERSION) throw error('BACKUP_FORMAT_UNSUPPORTED');
      if (envelope.kdf !== 'argon2id' && !(envelope.kdf === 'pbkdf2-sha256' && envelope.compatibility === true)) throw error('BACKUP_KDF_UNSUPPORTED');
      if (!isCanonicalBase64(envelope.salt) || !isCanonicalBase64(envelope.iv) || !isCanonicalBase64(envelope.ciphertext) || !isCanonicalBase64(envelope.integrity)) throw error('BACKUP_INTEGRITY_FAILED');
      const ciphertext = base64.decode(envelope.ciphertext);
      const expected = await digest(cryptoApi, ciphertext);
      if (!sameBytes(expected, base64.decode(envelope.integrity))) throw error('BACKUP_INTEGRITY_FAILED');
      let key;
      try {
        const salt = base64.decode(envelope.salt);
        if (envelope.kdf === 'argon2id') {
          const parameters = { time:Number(envelope.time) || 3, memory:Number(envelope.memory) || 65536, parallelism:Number(envelope.parallelism) || 1 };
          if (!Number.isInteger(parameters.time) || parameters.time < 1 || parameters.time > 10
            || !Number.isInteger(parameters.memory) || parameters.memory < 8192 || parameters.memory > 262144
            || !Number.isInteger(parameters.parallelism) || parameters.parallelism < 1 || parameters.parallelism > 8) throw error('BACKUP_KDF_PARAMETERS_INVALID');
          key = await deriveArgon2Key(cryptoApi, argon2, text, password, salt, parameters, 'CWB v7 backup AES-256-GCM');
        } else {
          const iterations = Number(envelope.iterations) || 240000;
          if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 1000000) throw error('BACKUP_KDF_PARAMETERS_INVALID');
          key = await derivePbkdf2Key(cryptoApi, text, password, salt, iterations);
        }
        const plaintext = await cryptoApi.subtle.decrypt({ name:'AES-GCM', iv:base64.decode(envelope.iv) }, key, ciphertext);
        return JSON.parse(text.decoder.decode(plaintext));
      } catch (cause) {
        if (cause && /^ARGON2_|^BACKUP_KDF_/.test(String(cause.message || cause))) throw cause;
        throw error('BACKUP_PASSWORD_INVALID');
      }
    }

    async function decrypt(envelope, password) {
      if (!envelope || envelope.format !== 'cwbk') throw error('BACKUP_FORMAT_UNSUPPORTED');
      if (Number(envelope.version) === BACKUP_VERSION) return decryptV8(envelope, password);
      if (Number(envelope.version) !== V7_BACKUP_VERSION) throw error('BACKUP_FORMAT_UNSUPPORTED');
      const legacyPackage = await decryptV7(envelope, password);
      assertSafeValue(legacyPackage);
      const version = sourceVersion(legacyPackage) == null ? V7_BACKUP_VERSION : assertLegacyVersion(sourceVersion(legacyPackage));
      return migrateLegacy(legacyPackage, version, { source:'encrypted-v7', encrypted:true, envelopeVersion:V7_BACKUP_VERSION });
    }

    async function importPlaintext(legacyPackage, override) {
      if (!isObject(legacyPackage)) throw error('BACKUP_PLAINTEXT_VERSION_UNSUPPORTED');
      const version = assertLegacyVersion(sourceVersion(legacyPackage));
      assertSafeValue(legacyPackage);
      return migrateLegacy(legacyPackage, version, { source:'plaintext', encrypted:false }, override);
    }

    return { encrypt, decrypt, importPlaintext };
  }

  return { SCHEMA_VERSION, BACKUP_VERSION, createBackupCodec };
});
