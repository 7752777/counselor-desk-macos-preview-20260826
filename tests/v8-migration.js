const assert = require('node:assert/strict');
const zlib = require('node:zlib');

const migration = require('../src/core/v8-migration.js');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function run() {
  assert.equal(migration.SCHEMA_VERSION, 8, 'schema v8 is published');
  assert.equal(globalThis.CWBv8Migration, migration, 'the browser global exposes the same API');

  const legacy = {
    package: 'counselor-desk',
    package_version: 7,
    settings: { college_name: 'Example College' },
    students: [
      {
        id: 'student-internal-1',
        student_number: 'CURRENT-001',
        student_number_history: [' OLD-001 ', 'OLD-001', 'OLD-002', '', 'OLD-002'],
        attachment_ids: ['attachment-1'],
        custom_fields: { legacy_column: 'keep-me' },
        unknown_nested: { preserve: true },
      },
      {
        id: 'student-internal-2',
        student_number: 'CURRENT-001',
        custom_fields: { second: true },
      },
    ],
    attachments: [
      { id: 'attachment-1', student_id: 'student-internal-1', name: 'proof.txt' },
      { id: 'attachment-2', record_id: 'honor-1', name: 'award.pdf' },
    ],
    honor: [{ id: 'honor-1', student_id: 'student-internal-1', attachment_ids: ['attachment-2'], title: 'Award' }],
    node: [{ id: 'node-1', student_id: 'student-internal-1', attachment_ids: ['attachment-1'], title: 'Log entry' }],
    leave: [{ id: 'leave-1', student_id: 'student-internal-1', title: 'Leave' }],
    custom: {
      v4_positions: [{ id: 'position-1', student_id: 'student-internal-1', name: 'Monitor', custom_column: 'keep' }],
      v4_party_cases: [{ id: 'party-1', student_id: 'student-internal-1', steps: [{ key: 'apply' }] }],
      unrelated_legacy_records: [{ id: 'legacy-custom-1', value: 'untouched' }],
    },
  };
  const before = clone(legacy);

  const result = migration.migrateLegacyPackage(legacy, {
    now: () => '2026-08-12T01:02:03.000Z',
    recoveryPointId: 'recovery-before-v8',
  });
  const output = result.package;

  assert.equal(output.package, 'counselor-desk');
  assert.equal(output.package_version, 8);
  assert.equal(output.schema_version, 8);
  assert.equal(output.students.length, 2, 'duplicate student numbers are never merged by migration');
  assert.equal(output.students[0].id, 'student-internal-1', 'internal student IDs are preserved');
  assert.equal(output.students[0].student_number, 'CURRENT-001', 'the current student number is unchanged');
  assert.deepEqual(output.students[0].student_number_history, ['OLD-001', 'OLD-002']);
  assert.deepEqual(output.students[0].custom_fields, { legacy_column: 'keep-me' });
  assert.deepEqual(output.students[0].unknown_nested, { preserve: true });
  assert.deepEqual(output.attachments, legacy.attachments, 'attachment IDs and links are untouched');
  assert.deepEqual(output.custom, legacy.custom, 'legacy custom collections remain available after a copy');

  assert.deepEqual(output.orgs.map(item => item.id), ['position-1']);
  assert.deepEqual(output.party.map(item => item.id), ['party-1']);
  assert.deepEqual(output.rewards.map(item => item.id), ['honor-1']);
  assert.deepEqual(output.worklogs.map(item => item.id), ['node-1']);
  assert.deepEqual(output.activities, [], 'no guessed legacy collection becomes an activity');
  assert.deepEqual(output.grades, [], 'no guessed legacy collection becomes a grade');
  assert.equal(Object.prototype.hasOwnProperty.call(output, 'crisis_cases'), false, 'student crisis fields remain the canonical crisis workflow until a durable case collection is introduced');
  assert.equal(result.report.nonDestructiveCopies.length, 4);
  assert.ok(result.report.warnings.some(item => item.code === 'DUPLICATE_STUDENT_NUMBER_UNCHANGED'));
  assert.equal(result.report.provenance.sourcePackageVersion, 7);
  assert.equal(result.recoveryPoint.id, 'recovery-before-v8');
  assert.deepEqual(result.recoveryPoint.data, before, 'the recovery point retains the original package');
  assert.deepEqual(legacy, before, 'migration never mutates the source package');

  const wrappedV39 = migration.migrateLegacyPackage({
    data: {
      package_version: 3.9,
      students: [{ id: 'wrapped-student', student_number: 'V39-001' }],
      custom: { v4_positions: [{ id: 'wrapped-position' }] },
    },
  }, { now: () => '2026-08-12T02:00:00.000Z' });
  assert.equal(wrappedV39.report.provenance.sourceShape, 'wrapped-data');
  assert.equal(wrappedV39.package.students[0].id, 'wrapped-student');
  assert.equal(wrappedV39.package.orgs[0].id, 'wrapped-position');

  const portable = migration.migrateLegacyPackage({
    __CWB_EMBED__: {
      package_version: 4,
      students: [{ id: 'portable-student', student_number: 'P-001', student_number_history: ['P-000', 'P-000'] }],
      attachments: [{ id: 'portable-attachment', student_id: 'portable-student' }],
    },
  }, { now: () => '2026-08-12T03:00:00.000Z' });
  assert.equal(portable.report.provenance.sourceShape, 'portable-embed');
  assert.deepEqual(portable.package.students[0].student_number_history, ['P-000']);
  assert.equal(portable.package.attachments[0].id, 'portable-attachment');

  const portableHtml = '<!doctype html><html><head><script>window.__CWB_EMBED__=' + JSON.stringify({
    data: {
      package_version: 4,
      students: [{ id: 'portable-html-student', student_number: 'HTML-001' }],
    },
  }) + '</script></head><body></body></html>';
  const fromPortableHtml = migration.migrateLegacyPackage(portableHtml, { now: () => '2026-08-12T03:10:00.000Z' });
  assert.equal(fromPortableHtml.report.provenance.sourceShape, 'portable-html');
  assert.equal(fromPortableHtml.package.students[0].id, 'portable-html-student', 'portable HTML payloads are parsed without evaluating HTML');
  assert.equal(fromPortableHtml.recoveryPoint.data, portableHtml, 'portable recovery retains the original HTML payload for restoration');

  const nestedPortable = migration.migrateLegacyPackage({
    __CWB_EMBED__: {
      data: {
        package_version: 4,
        students: [{ id: 'nested-portable-student', student_number: 'NESTED-001' }],
      },
    },
  }, { now: () => '2026-08-12T03:20:00.000Z' });
  assert.equal(nestedPortable.report.provenance.sourceShape, 'portable-embed-data');
  assert.equal(nestedPortable.package.students[0].id, 'nested-portable-student');

  const packageData = migration.migrateLegacyPackage({
    package: 'counselor-desk',
    package_version: 7,
    data: {
      package_version: 7,
      students: [{ id: 'package-data-student', student_number: 'PACKAGE-001' }],
    },
  }, { now: () => '2026-08-12T03:30:00.000Z' });
  assert.equal(packageData.report.provenance.sourceShape, 'counselor-package-data');
  assert.equal(packageData.package.students[0].id, 'package-data-student');

  const storedCollections = migration.migrateLegacyPackage({
    package_version: 7,
    records_students: [{ id: 'stored-student', student_number: 'STORE-001' }],
    records_custom_v4_positions: [{ id: 'stored-position', student_id: 'stored-student', name: 'Monitor' }],
  }, { now: () => '2026-08-12T03:40:00.000Z' });
  assert.equal(storedCollections.package.students[0].id, 'stored-student', 'record-store collections become source collections');
  assert.equal(storedCollections.package.orgs[0].id, 'stored-position');

  const sqliteSnapshot = migration.migrateLegacyPackage({
    package_version: 7,
    records: [
      { collection: 'records_students', record_id: 'sqlite-student', payload: JSON.stringify({ id: 'sqlite-student', student_number: 'SQLITE-001' }) },
      { collection: 'records_custom_v4_party_cases', record_id: 'sqlite-party', record: { id: 'sqlite-party', student_id: 'sqlite-student' } },
    ],
  }, { now: () => '2026-08-12T03:50:00.000Z' });
  assert.equal(sqliteSnapshot.package.students[0].id, 'sqlite-student', 'SQLite/export rows are adapted without database-specific migration code');
  assert.equal(sqliteSnapshot.package.party[0].id, 'sqlite-party');

  const persistedSnapshot = migration.migrateLegacyPackage({
    schemaVersion: 7,
    snapshot: {
      schemaVersion: 7,
      data: {
        talks: [{ id: 'snapshot-talk', student_id: 'snapshot-student', content: 'nested logical collection' }],
        records_students: [{ id: 'snapshot-student', student_number: 'SNAPSHOT-001' }],
        records_custom_v4_positions: [{ id: 'snapshot-position', student_id: 'snapshot-student' }],
      },
    },
  }, { now: () => '2026-08-12T03:55:00.000Z' });
  assert.equal(persistedSnapshot.package.students[0].id, 'snapshot-student', 'snapshot payload storage is adapted');
  assert.equal(persistedSnapshot.package.orgs[0].id, 'snapshot-position');
  assert.equal(persistedSnapshot.package.talks[0].id, 'snapshot-talk', 'logical collections inside a snapshot data envelope are retained');
  assert.equal(persistedSnapshot.recoveryPoint.source_schema_version, 7, 'snapshot metadata resolves the source version before migration');

  assert.throws(
    () => migration.migrateLegacyPackage('<html><script>window.__CWB_EMBED__={not-json}</script></html>'),
    /V8_MIGRATION_PORTABLE_PAYLOAD_INVALID/,
    'malformed portable HTML fails closed',
  );
  assert.throws(
    () => migration.migrateLegacyPackage({ package: 'counselor-desk', data: { settings: { college_name: 'Only settings' } } }),
    /V8_MIGRATION_SOURCE_NO_COLLECTIONS/,
    'an unrecognized payload can never become an empty v8 package',
  );
  assert.throws(
    () => migration.migrateLegacyPackage({ package_version: 7, records: [{ collection: 'other', payload: { id: 'unknown' } }] }),
    /V8_MIGRATION_SOURCE_NO_COLLECTIONS/,
    'unknown record stores are not silently accepted as an empty workspace',
  );

  const originalBytes = new Uint8Array([7, 8, 9]);
  const originalBuffer = originalBytes.buffer;
  const originalMapKey = { code: 'map-key' };
  const originalMapValue = new Set([{ code: 'map-value' }]);
  const binarySource = {
    package: 'counselor-desk',
    package_version: 7,
    students: [],
    binary: originalBuffer,
    bytes: new Uint8Array(originalBuffer),
    lookup: new Map([[originalMapKey, originalMapValue]]),
    custom: { v4_positions: [{ id: 'binary-position', label: 'pre-copy only' }] },
  };
  const binaryResult = migration.migrateLegacyPackage(binarySource, {
    now: () => '2026-08-12T04:00:00.000Z',
    recoveryPointId: 'binary-recovery',
  });
  assert.notStrictEqual(binaryResult.package.binary, originalBuffer, 'output binary storage is copied');
  assert.notStrictEqual(binaryResult.recoveryPoint.data.binary, originalBuffer, 'recovery point binary storage is copied');
  assert.notStrictEqual(binaryResult.recoveryPoint.data.binary, binaryResult.package.binary, 'recovery and output binary storage never alias one another');
  assert.notStrictEqual(binaryResult.package.bytes, binarySource.bytes, 'typed-array views are copied');
  assert.notStrictEqual(binaryResult.recoveryPoint.data.lookup, binarySource.lookup, 'Map values are copied for recovery');
  assert.notStrictEqual([...binaryResult.package.lookup.values()][0], originalMapValue, 'Set values are copied for output');
  originalBytes[0] = 99;
  assert.deepEqual([...new Uint8Array(binaryResult.package.binary)], [7, 8, 9], 'source writes cannot change migrated binary data');
  assert.deepEqual([...new Uint8Array(binaryResult.recoveryPoint.data.binary)], [7, 8, 9], 'source writes cannot change recovery binary data');
  new Uint8Array(binaryResult.package.binary)[1] = 66;
  assert.deepEqual([...new Uint8Array(originalBuffer)], [99, 8, 9], 'migrated binary writes cannot change the source');
  assert.deepEqual([...new Uint8Array(binaryResult.recoveryPoint.data.binary)], [7, 8, 9], 'migrated binary writes cannot change the recovery point');
  assert.equal(binaryResult.recoveryPoint.source_schema_version, 7, 'recovery point records the resolved source version');
  assert.equal(binaryResult.recoveryPoint.data.orgs, undefined, 'recovery point is made before canonical copies are added');
  assert.deepEqual(binaryResult.package.orgs.map(row => row.id), ['binary-position']);

  const missingIds = migration.migrateLegacyPackage({
    package_version: 7,
    students: [],
    custom: { v4_positions: [{ label: 'first without ID' }, { label: 'second without ID' }] },
  }, { now: () => '2026-08-12T04:10:00.000Z' });
  assert.deepEqual(missingIds.package.orgs.map(row => row.label), ['first without ID', 'second without ID'], 'two distinct records without IDs are both retained');
  assert.equal(missingIds.report.warnings.filter(item => item.code === 'CANONICAL_COPY_MISSING_ID_RETAINED').length, 2, 'missing IDs produce review warnings instead of synthetic deduplication');

  for (const unsafeKey of ['__proto__', 'prototype', 'constructor']) {
    const unsafe = JSON.parse(`{"package_version":7,"students":[],"custom":{"v4_positions":[]},"nested":{"${unsafeKey}":{"polluted":true}}}`);
    assert.throws(
      () => migration.migrateLegacyPackage(unsafe),
      /V8_MIGRATION_UNSAFE_KEY/,
      `unsafe ${unsafeKey} keys are rejected at any depth before cloning`,
    );
    assert.equal({}.polluted, undefined, `unsafe ${unsafeKey} input cannot mutate Object.prototype`);
  }
  assert.throws(
    () => migration.clone(JSON.parse('{"nested":{"__proto__":{"polluted":true}}}')),
    /V8_MIGRATION_UNSAFE_KEY/,
    'the exported clone helper is safe for callers too',
  );
  assert.throws(
    () => migration.migrateLegacyPackage({ package_version: 7, records: [{ collection: 'records_students', payload: '{"id":"unsafe-row","nested":{"constructor":{"polluted":true}}}' }] }),
    /V8_MIGRATION_UNSAFE_KEY/,
    'unsafe keys inside serialized storage rows retain their security diagnostic',
  );

  const mergedHistory = migration.migrateLegacyPackage({
    package_version: 7,
    students: [{
      id: 'history-student', student_number: 'CURRENT-HISTORY', student_number_history: ['TOP-001', 'TOP-001'],
      custom_fields: { student_number_history: ['CUSTOM-001', 'TOP-001', 'CURRENT-HISTORY'], keep: 'unchanged' },
    }],
  }, { now: () => '2026-08-12T04:20:00.000Z' });
  assert.deepEqual(mergedHistory.package.students[0].student_number_history, ['TOP-001', 'CUSTOM-001'], 'top-level and custom-field history are combined without changing the current number');
  assert.deepEqual(mergedHistory.package.students[0].custom_fields, { student_number_history: ['CUSTOM-001', 'TOP-001', 'CURRENT-HISTORY'], keep: 'unchanged' }, 'legacy custom-field history remains available verbatim');

  const realExportJson = migration.migrateLegacyPackage({
    app: 'counselor-desk', type: 'backup', version: '4.0.0', exported_at: '2026-08-12T04:30:00.000Z',
    data: {
      students: [{ id: 'export-student', student_number: 'EXPORT-001', schema_version: 7 }],
    },
  }, { now: () => '2026-08-12T04:30:01.000Z' });
  assert.equal(realExportJson.report.provenance.sourcePackageVersion, 7, 'nested record schemas take precedence over exportJSON app version');
  const exportVersionOnly = migration.migrateLegacyPackage({
    app: 'counselor-desk', type: 'backup', version: '4.3.2', data: { students: [{ id: 'export-version-student', student_number: 'EXPORT-002' }] },
  }, { now: () => '2026-08-12T04:30:02.000Z' });
  assert.equal(exportVersionOnly.report.provenance.sourcePackageVersion, 4, 'exportJSON semantic version supplies a source version when schemas are absent');

  const v4BulkRows = migration.migrateLegacyPackage({
    package_version: 7,
    records_students: [
      { id: '__cwb_bulk_students__', schema_version: 7, chunk_count: 2 },
      { id: '__cwb_bulk_students__:0', schema_version: 7, records_json: JSON.stringify([{ id: 'bulk-json', student_number: 'BULK-JSON' }]) },
      { id: '__cwb_bulk_students__:1', schema_version: 7, records_gzip: zlib.gzipSync(Buffer.from(JSON.stringify([{ id: 'bulk-gzip', student_number: 'BULK-GZIP' }]), 'utf8')) },
    ],
  }, { now: () => '2026-08-12T04:40:00.000Z' });
  assert.deepEqual(v4BulkRows.package.students.map(row => row.id), ['bulk-json', 'bulk-gzip'], 'master V4 JSON and gzip bulk chunks are reassembled in their declared order');
  assert.throws(
    () => migration.migrateLegacyPackage({ package_version: 7, records_students: [
      { id: '__cwb_bulk_students__', chunk_count: 2 },
      { id: '__cwb_bulk_students__:0', records_json: JSON.stringify([{ id: 'only-one', student_number: 'ONLY-ONE' }]) },
    ] }),
    /V8_MIGRATION_BULK_STUDENTS_INVALID/,
    'incomplete master V4 bulk chunks fail closed',
  );
  assert.throws(
    () => migration.migrateLegacyPackage({ package_version: 7, records_students: [
      { id: '__cwb_bulk_students__', chunk_count: 1 },
      { id: '__cwb_bulk_students__:0', records_json: JSON.stringify([{ id: 'first', student_number: 'FIRST' }]) },
      { id: '__cwb_bulk_students__:0', records_json: JSON.stringify([{ id: 'second', student_number: 'SECOND' }]) },
    ] }),
    /V8_MIGRATION_BULK_STUDENTS_INVALID/,
    'duplicate master V4 bulk chunks fail closed',
  );
  assert.throws(
    () => migration.migrateLegacyPackage({ package_version: 7, records_students: [
      { id: '__cwb_bulk_students__', chunk_count: 1 },
      { id: '__cwb_bulk_students__:0', records_json: '{"id":"not-an-array"}' },
    ] }),
    /V8_MIGRATION_BULK_STUDENTS_INVALID/,
    'malformed master V4 bulk records_json fails closed',
  );

  const attachmentRows = migration.migrateLegacyPackage({
    package_version: 7,
    records: [
      { collection: 'records_students', record: { id: 'attachment-student', student_number: 'ATTACH-001' } },
      { collection: 'attachments', record: {
        id: 'attachment-logical', student_id: 'attachment-student', record_id: 'attachment-student', name: 'evidence.pdf',
        mimeType: 'application/pdf', size: 42, content_hash: 'sha256:example', thumbnail_id: 'attachment-thumb', data_base64: 'ZGF0YQ==',
      } },
    ],
  }, { now: () => '2026-08-12T04:41:00.000Z' });
  assert.deepEqual(attachmentRows.package.attachments, [{
    id: 'attachment-logical', student_id: 'attachment-student', record_id: 'attachment-student', name: 'evidence.pdf',
    mimeType: 'application/pdf', size: 42, content_hash: 'sha256:example', thumbnail_id: 'attachment-thumb', data_base64: 'ZGF0YQ==',
  }], 'decrypted logical attachment rows retain IDs, links, metadata, and encoded content');
  assert.throws(
    () => migration.migrateLegacyPackage({ package_version: 7, records: [{ collection: 'records_students', payload: Buffer.from('CWBSQL1\x00\x01\x02', 'binary') }] }),
    /V8_MIGRATION_SQLITE_DECRYPT_REQUIRED/,
    'raw encrypted SQLite BLOB rows are rejected until a desktop adapter decrypts them',
  );
  assert.throws(
    () => migration.migrateLegacyPackage({ package_version: 7, records_students: [Buffer.from('CWBSQL1\x00\x01\x02', 'binary')] }),
    /V8_MIGRATION_SQLITE_DECRYPT_REQUIRED/,
    'raw encrypted SQLite bytes cannot be mistaken for a direct record-store row',
  );

  const matchingOverlap = migration.migrateLegacyPackage({
    package_version: 7,
    students: [{ id: 'shared-student', student_number: 'SHARED-001', full_name: 'Same source' }],
    records_students: [{ id: 'shared-student', student_number: 'SHARED-001', full_name: 'Same source' }],
  }, { now: () => '2026-08-12T04:42:00.000Z' });
  assert.equal(matchingOverlap.package.students.length, 1, 'identical logical and records_* rows with the same ID are retained once');
  assert.ok(matchingOverlap.report.storageDuplicates.some(row => row.collection === 'students' && row.id === 'shared-student'), 'identical source overlap is reported for diagnostics');
  assert.throws(
    () => migration.migrateLegacyPackage({
      package_version: 7,
      students: [{ id: 'conflicting-student', student_number: 'CONFLICT-001', full_name: 'Logical' }],
      records_students: [{ id: 'conflicting-student', student_number: 'CONFLICT-001', full_name: 'Stored mismatch' }],
    }),
    /V8_MIGRATION_COLLECTION_CONFLICT/,
    'same-ID rows that disagree between logical and records_* sources are rejected',
  );

  const points = [
    migration.createRecoveryPoint({ package_version: 3.9 }, { id: 'point-1', now: () => '2026-08-12T01:00:00.000Z' }),
    migration.createRecoveryPoint({ package_version: 4 }, { id: 'point-2', now: () => '2026-08-12T02:00:00.000Z' }),
    migration.createRecoveryPoint({ package_version: 7 }, { id: 'point-3', now: () => '2026-08-12T03:00:00.000Z' }),
    migration.createRecoveryPoint({ package_version: 7 }, { id: 'point-4', now: () => '2026-08-12T04:00:00.000Z' }),
  ];
  const retained = migration.retainRecoveryPoints(points);
  assert.deepEqual(retained.map(point => point.id), ['point-2', 'point-3', 'point-4']);
  assert.equal(points.length, 4, 'retention is non-mutating');

  console.log('PASS v8-migration');
}

try {
  run();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
