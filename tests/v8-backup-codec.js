const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const { TextEncoder, TextDecoder } = require('node:util');
const { JSDOM } = require('jsdom');
const { createWorkspace, verifyBackup } = require('../src/core/v8-workspace-runtime.js');
const { BACKUP_VERSION, createBackupCodec } = require('../src/core/v8-backup-codec.js');

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const password = 'correct horse battery staple';
const encodeBase64 = bytes => Buffer.from(bytes).toString('base64');

function readBrowserBlobBytes(blob, browserWindow) {
  if (blob && typeof blob.arrayBuffer === 'function') return blob.arrayBuffer().then(buffer => new Uint8Array(buffer));
  return new Promise((resolve, reject) => {
    const reader = new browserWindow.FileReader();
    reader.onerror = () => reject(reader.error || new Error('blob read failed'));
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(blob);
  });
}

function createBrowserRuntime() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  Object.defineProperties(dom.window, {
    crypto: { value: webcrypto },
    TextEncoder: { value: TextEncoder },
    TextDecoder: { value: TextDecoder },
  });
  [
    'vendor/argon2-bundled.min.js',
    'src/core/cwb-collections.js',
    'src/core/v4-runtime.js',
    'src/core/v8-workspace-runtime.js',
    'src/core/v8-backup-codec.js',
  ].forEach(file => dom.window.eval(fs.readFileSync(file, 'utf8')));
  return dom;
}

const argon2 = {
  ArgonType: { Argon2id: 2 },
  async hash({ pass, salt }) {
    return {
      hash: new Uint8Array(await webcrypto.subtle.digest(
        'SHA-256',
        encoder.encode(`${pass}:${Buffer.from(salt).toString('base64')}`),
      )),
    };
  },
};

async function makeV8Backup(studentId) {
  const workspace = createWorkspace({
    initialState: {
      students: [{ id: studentId, student_number: `2026-${studentId}`, full_name: 'Backup Test' }],
      settings: { theme: 'green' },
      attachments: [],
    },
  });
  return workspace.createBackup({ source: 'codec-test' });
}

async function legacyArgon2Envelope(payload) {
  const salt = new Uint8Array(16).fill(7);
  const iv = new Uint8Array(12).fill(9);
  const result = await argon2.hash({ pass: password, salt, type: argon2.ArgonType.Argon2id });
  const material = await webcrypto.subtle.importKey('raw', result.hash, 'HKDF', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({
    name: 'HKDF', hash: 'SHA-256', salt,
    info: encoder.encode('CWB v7 backup AES-256-GCM'),
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(payload)),
  ));
  const integrity = new Uint8Array(await webcrypto.subtle.digest('SHA-256', ciphertext));
  return {
    format: 'cwbk', version: 7, kdf: 'argon2id', time: 3, memory: 65536, parallelism: 1,
    salt: encodeBase64(salt), iv: encodeBase64(iv), ciphertext: encodeBase64(ciphertext), integrity: encodeBase64(integrity),
  };
}

async function legacyPbkdf2Envelope(payload) {
  const salt = new Uint8Array(16).fill(3);
  const iv = new Uint8Array(12).fill(4);
  const material = await webcrypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await webcrypto.subtle.deriveKey({
    name: 'PBKDF2', salt, iterations: 240000, hash: 'SHA-256',
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(payload)),
  ));
  const integrity = new Uint8Array(await webcrypto.subtle.digest('SHA-256', ciphertext));
  return {
    format: 'cwbk', version: 7, kdf: 'pbkdf2-sha256', compatibility: true, iterations: 240000,
    salt: encodeBase64(salt), iv: encodeBase64(iv), ciphertext: encodeBase64(ciphertext), integrity: encodeBase64(integrity),
  };
}

async function run() {
  const migrationCalls = [];
  const codec = createBackupCodec({
    crypto: webcrypto,
    argon2,
    now: () => '2026-08-13T00:00:00.000Z',
    verifyV8Backup: verifyBackup,
    migrate: async (legacyPackage, context) => {
      migrationCalls.push({ legacyPackage, context });
      return makeV8Backup(`migrated-${context.sourceVersion}`);
    },
  });

  assert.equal(BACKUP_VERSION, 8, 'the codec publishes cwbk version 8');
  const backup = await makeV8Backup('native-v8');
  const envelope = await codec.encrypt(backup, password);
  assert.equal(envelope.format, 'cwbk');
  assert.equal(envelope.version, 8);
  assert.equal(envelope.kdf, 'argon2id');
  assert.equal(envelope.schemaVersion, 8);
  assert.equal(envelope.created_at, '2026-08-13T00:00:00.000Z');

  const restored = await codec.decrypt(envelope, password);
  assert.equal(restored.sourceVersion, 8);
  assert.equal(restored.migrated, false);
  assert.equal(restored.backup.data.students[0].id, 'native-v8');
  assert.equal((await verifyBackup(restored.backup)).ok, true, 'decoded v8 backup remains independently verified');

  await assert.rejects(() => codec.decrypt(envelope, 'wrong password'), /BACKUP_PASSWORD_INVALID/);
  await assert.rejects(
    () => codec.decrypt({ ...envelope, created_at: '2030-01-01T00:00:00.000Z' }, password),
    /BACKUP_INTEGRITY_FAILED/,
    'public v8 envelope metadata is integrity-protected',
  );
  await assert.rejects(
    () => codec.decrypt({ ...envelope, untrusted_extension: 'not authenticated' }, password),
    /BACKUP_HEADER_INVALID/,
    'v8 envelopes reject unknown top-level fields instead of silently ignoring unauthenticated data',
  );
  const hiddenUnknownFieldEnvelope = { ...envelope };
  Object.defineProperty(hiddenUnknownFieldEnvelope, 'hidden_extension', { value: true, enumerable: false });
  await assert.rejects(
    () => codec.decrypt(hiddenUnknownFieldEnvelope, password),
    /BACKUP_HEADER_INVALID/,
    'non-enumerable unknown v8 envelope fields are rejected as well',
  );
  await assert.rejects(
    () => codec.encrypt({ ...backup, data: { ...backup.data, students: [] } }, password),
    /BACKUP_V8_NOT_VERIFIED/,
    'the encoder refuses a workspace backup whose inner checksum does not verify',
  );
  await assert.rejects(() => codec.decrypt({ ...envelope, version: 9 }, password), /BACKUP_FORMAT_UNSUPPORTED/);

  const argonResult = await codec.decrypt(await legacyArgon2Envelope({ package_version: 7, students: [{ id: 'argon-v7' }] }), password);
  assert.equal(argonResult.sourceVersion, 7);
  assert.equal(argonResult.migrated, true);
  assert.equal(argonResult.backup.manifest.schemaVersion, 8);

  const pbkdf2Result = await codec.decrypt(await legacyPbkdf2Envelope({ package_version: 4, students: [{ id: 'pbkdf2-v4' }] }), password);
  assert.equal(pbkdf2Result.sourceVersion, 4);
  assert.equal(pbkdf2Result.migrated, true);
  assert.deepEqual(migrationCalls.map(call => call.context.sourceVersion), [7, 4]);
  const resourceAbuseEnvelope = await legacyArgon2Envelope({ package_version: 7, students: [] });
  resourceAbuseEnvelope.memory = 999999999;
  await assert.rejects(
    () => codec.decrypt(resourceAbuseEnvelope, password),
    /BACKUP_KDF_PARAMETERS_INVALID/,
    'legacy KDF headers are capped before Argon2 is invoked',
  );
  const unsafeLegacyPayload = JSON.parse('{"package_version":7,"__proto__":{"polluted":true}}');
  const unsafeLegacyEnvelope = await legacyArgon2Envelope(unsafeLegacyPayload);
  await assert.rejects(
    () => codec.decrypt(unsafeLegacyEnvelope, password),
    /BACKUP_PAYLOAD_UNSAFE_KEY/,
    'unsafe legacy payload keys never reach the migration hook',
  );
  assert.equal({}.polluted, undefined, 'decoded backups cannot pollute Object.prototype');

  const directLegacyResult = await codec.importPlaintext({ package_version: 3.9, students: [{ id: 'plain-v39' }] });
  assert.equal(directLegacyResult.sourceVersion, 3.9);
  assert.equal(directLegacyResult.migrated, true);
  await assert.rejects(
    () => codec.importPlaintext({ package_version: 9, students: [] }),
    /BACKUP_PLAINTEXT_VERSION_UNSUPPORTED/,
  );
  await assert.rejects(
    () => codec.importPlaintext({ package_version: 7, students: [] }, { migrate: null }),
    /BACKUP_MIGRATION_REQUIRED/,
  );

  const dom = createBrowserRuntime();
  assert.equal(typeof dom.window.CWBv8BackupCodec.createBackupCodec, 'function', 'the browser UMD global is available');

  // The browser codec creates decoded records in the browser realm. The
  // shared workspace verifier must accept those records directly, without a
  // JSON round-trip that would conceal cross-realm clone defects.
  const browserCodec = dom.window.CWBv8BackupCodec.createBackupCodec({
    crypto: webcrypto,
    argon2: dom.window.argon2,
    verifyV8Backup: verifyBackup,
  });
  const browserEnvelope = await browserCodec.encrypt(backup, password);
  const browserRestored = await browserCodec.decrypt(browserEnvelope, password);
  assert.equal(browserRestored.backup.data.students[0].id, 'native-v8', 'the browser path has no Node-only base64 dependency');
  assert.equal((await verifyBackup(browserRestored.backup)).ok, true, 'cross-realm decoded records remain verifiable without JSON normalization');

  const attachmentBytes = Uint8Array.from([0, 1, 2, 127, 128, 255]);
  const browserAttachment = new dom.window.Blob([attachmentBytes], { type: 'application/octet-stream' });
  assert.equal(typeof browserAttachment.arrayBuffer, 'undefined', 'the JSDOM Blob fixture exercises the FileReader fallback');
  const browserWorkspace = dom.window.CWBv8.createWorkspace({
    initialState: {
      students: [{ id: 'browser-attachment-student', full_name: 'Browser Attachment' }],
      settings: {},
      attachments: [{ id: 'browser-attachment', name: 'proof.bin', blob: browserAttachment, size: browserAttachment.size, mimeType: browserAttachment.type }],
      binary_payload: {
        buffer: attachmentBytes.buffer.slice(0),
        view: new Uint16Array([513, 65535]),
      },
    },
  });
  const browserBackup = await browserWorkspace.createBackup({ source: 'browser-attachment' });
  assert.equal((await dom.window.CWBv8.verifyBackup(browserBackup)).ok, true, 'the browser workspace hashes Blob, ArrayBuffer, and typed-array values');
  const browserAttachmentHash = await dom.window.CWBv8.sha256({ blob: browserAttachment });
  const browserLocalCodec = dom.window.CWBv8BackupCodec.createBackupCodec({
    crypto: webcrypto,
    argon2: dom.window.argon2,
    verifyV8Backup: dom.window.CWBv8.verifyBackup,
  });
  const browserAttachmentEnvelope = await browserLocalCodec.encrypt(browserBackup, password);
  const browserAttachmentRestored = await browserLocalCodec.decrypt(browserAttachmentEnvelope, password);
  const restoredAttachment = browserAttachmentRestored.backup.data.attachments[0].blob;
  assert.deepEqual(
    Array.from(await readBrowserBlobBytes(restoredAttachment, dom.window)),
    Array.from(attachmentBytes),
    'browser Blob bytes survive v8 backup round-trip',
  );
  assert.equal(await dom.window.CWBv8.sha256({ blob: restoredAttachment }), browserAttachmentHash, 'browser Blob hashes survive v8 backup round-trip');
  assert.deepEqual(
    Array.from(new Uint8Array(browserAttachmentRestored.backup.data.binary_payload.buffer)),
    Array.from(attachmentBytes),
    'browser ArrayBuffer bytes survive v8 backup round-trip',
  );
  assert.deepEqual(
    Array.from(browserAttachmentRestored.backup.data.binary_payload.view),
    [513, 65535],
    'browser typed-array values survive v8 backup round-trip',
  );
  assert.equal((await dom.window.CWBv8.verifyBackup(browserAttachmentRestored.backup)).ok, true, 'browser v8 codec round-trip stays independently verifiable without JSON normalization');

  // This uses the shipping v7 runtime and bundled Argon2 implementation,
  // rather than the lightweight test stub used by Node-only fixtures.
  const realV7Envelope = await dom.window.CWB_V4.encryptBackup({
    package_version: 7,
    students: [{ id: 'actual-browser-v7', full_name: 'Actual Argon2' }],
  }, password);
  assert.equal(realV7Envelope.version, 7, 'the browser v7 runtime produced a legacy cwbk envelope');
  const browserMigrationCalls = [];
  const browserV7Codec = dom.window.CWBv8BackupCodec.createBackupCodec({
    crypto: webcrypto,
    argon2: dom.window.argon2,
    verifyV8Backup: dom.window.CWBv8.verifyBackup,
    migrate: async (legacyPackage, context) => {
      browserMigrationCalls.push({ legacyPackage, context });
      const migratedWorkspace = dom.window.CWBv8.createWorkspace({
        initialState: { students: legacyPackage.students, settings: {}, attachments: [] },
      });
      return migratedWorkspace.createBackup({ source: 'actual-browser-v7' });
    },
  });
  const browserV7Result = await browserV7Codec.decrypt(realV7Envelope, password);
  assert.equal(browserV7Result.migrated, true, 'the actual browser v7 envelope runs through the migration hook');
  assert.equal(browserV7Result.backup.data.students[0].id, 'actual-browser-v7');
  assert.deepEqual(browserMigrationCalls.map(call => call.context.sourceVersion), [7], 'the migration hook receives the actual v7 source version');
  dom.window.close();

  // Keep a decode reference so accidental text-decoder removal is caught in the Node contract.
  assert.equal(decoder.decode(encoder.encode('codec')), 'codec');
  console.log('PASS v8-backup-codec');
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
