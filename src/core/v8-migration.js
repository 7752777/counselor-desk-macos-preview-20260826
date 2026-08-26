/* Schema-v8 package migration is deliberately storage-agnostic. It upgrades a
 * copy of an exchange/portable package and leaves legacy collections intact. */
(function attachV8Migration(root, factory) {
  const CWBCollections = root && root.CWBCollections || (typeof module === 'object' && module.exports ? require('./cwb-collections.js').CWBCollections : null);
  const api = factory(CWBCollections);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBv8Migration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV8Migration(CWBCollections) {
  'use strict';

  if (!CWBCollections) throw new Error('CWB_COLLECTION_MANIFEST_REQUIRED');
  const SCHEMA_VERSION = 8;
  const DEFAULT_RECOVERY_POINT_LIMIT = 3;
  const CANONICAL_COLLECTIONS = Object.freeze(['orgs', 'party', 'rewards', 'activities', 'grades', 'worklogs']);
  const COPY_MAPPINGS = Object.freeze([
    { from:'custom.v4_positions', to:'orgs' },
    { from:'custom.v4_party_cases', to:'party' },
    { from:'honor', to:'rewards' },
    { from:'node', to:'worklogs' },
  ]);
  const LOGICAL_COLLECTION_PATHS = Object.freeze([...CWBCollections.logical.map(CWBCollections.logicalPath), 'attachments']);
  const STORAGE_COLLECTION_PATHS = CWBCollections.storagePaths();
  // Top-level attachments are already logical package data. Only a decrypted
  // row whose storage collection is literally `attachments` uses this map.
  const STORAGE_ROW_COLLECTION_PATHS = Object.freeze(Object.assign({}, STORAGE_COLLECTION_PATHS, { attachments:'attachments' }));
  const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  function isRecordObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isArrayBuffer(value) {
    return typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer;
  }

  function isArrayBufferView(value) {
    return typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(value);
  }

  function cloneArrayBuffer(value) {
    return value.slice(0);
  }

  function cloneArrayBufferView(value) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const buffer = bytes.slice().buffer;
    if (typeof DataView !== 'undefined' && value instanceof DataView) return new DataView(buffer);
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(value)) return Buffer.from(buffer);
    return new value.constructor(buffer);
  }

  function assertSafeKeys(value, references) {
    if (value == null || typeof value !== 'object') return;
    const seen = references || new Set();
    if (seen.has(value)) return;
    seen.add(value);
    if (isArrayBuffer(value) || isArrayBufferView(value) || (typeof Blob !== 'undefined' && value instanceof Blob) || value instanceof Date) return;
    if (value instanceof Map) {
      value.forEach((item, key) => { assertSafeKeys(key, seen); assertSafeKeys(item, seen); });
      return;
    }
    if (value instanceof Set) {
      value.forEach(item => assertSafeKeys(item, seen));
      return;
    }
    Object.keys(value).forEach(key => {
      if (UNSAFE_KEYS.has(key)) throw new Error('V8_MIGRATION_UNSAFE_KEY');
      assertSafeKeys(value[key], seen);
    });
  }

  function clone(value, references) {
    if (value == null || typeof value !== 'object') return value;
    assertSafeKeys(value);
    const seen = references || new Map();
    if (seen.has(value)) return seen.get(value);
    if (isArrayBuffer(value)) {
      const copy = cloneArrayBuffer(value);
      seen.set(value, copy);
      return copy;
    }
    if (isArrayBufferView(value)) {
      const copy = cloneArrayBufferView(value);
      seen.set(value, copy);
      return copy;
    }
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      const copy = value.slice(0, value.size, value.type);
      seen.set(value, copy);
      return copy;
    }
    if (value instanceof Date) {
      const copy = new Date(value.getTime());
      seen.set(value, copy);
      return copy;
    }
    if (value instanceof Map) {
      const copy = new Map();
      seen.set(value, copy);
      value.forEach((item, key) => copy.set(clone(key, seen), clone(item, seen)));
      return copy;
    }
    if (value instanceof Set) {
      const copy = new Set();
      seen.set(value, copy);
      value.forEach(item => copy.add(clone(item, seen)));
      return copy;
    }
    if (Array.isArray(value)) {
      const copy = [];
      seen.set(value, copy);
      value.forEach(item => copy.push(clone(item, seen)));
      return copy;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    const copy = {};
    seen.set(value, copy);
    Object.keys(value).forEach(key => { copy[key] = clone(value[key], seen); });
    return copy;
  }

  function cleanText(value) {
    return String(value == null ? '' : value).trim();
  }

  function numberOrNull(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : null;
  }

  function semanticMajorVersion(value) {
    const match = String(value == null ? '' : value).match(/^(\d+)(?:\.\d+){0,2}(?:[-+].*)?$/);
    return match ? numberOrNull(match[1]) : null;
  }

  function sourceVersion(source) {
    const value = source || {};
    const candidate = value.package_version != null ? value.package_version : value.schema_version != null ? value.schema_version : value.schemaVersion != null ? value.schemaVersion : semanticMajorVersion(value.version);
    return candidate == null ? null : numberOrNull(candidate);
  }

  function firstSourceVersion(...sources) {
    for (const source of sources) {
      if (typeof source === 'number' && Number.isFinite(source)) return source;
      const version = sourceVersion(source);
      if (version != null) return version;
    }
    return null;
  }

  function nestedRecordSchemaVersion(source) {
    const candidates = [];
    const visit = value => {
      if (!isRecordObject(value) && !Array.isArray(value)) return;
      if (isRecordObject(value) && (value.schema_version != null || value.schemaVersion != null || value.package_version != null)) candidates.push(sourceVersion(value));
      if (Array.isArray(value)) { value.forEach(visit); return; }
      Object.keys(value).forEach(key => {
        if (UNSAFE_KEYS.has(key)) throw new Error('V8_MIGRATION_UNSAFE_KEY');
        if (key === 'custom_fields' || key === 'custom' || key === 'data' || key === 'payload' || key === 'snapshot' || key === 'export' || key === 'storage' || key === 'records' || LOGICAL_COLLECTION_PATHS.includes(key) || key.startsWith('records_')) visit(value[key]);
      });
    };
    visit(source);
    return candidates.filter(value => value != null).sort((a, b) => b - a)[0] || null;
  }

  function portableEmbedPayload(html) {
    const match = String(html).match(/<script\b[^>]*>\s*window\.__CWB_EMBED__\s*=\s*([\s\S]*?)\s*<\/script\s*>/i);
    if (!match) throw new Error('V8_MIGRATION_SOURCE_INVALID');
    const serialized = match[1].trim().replace(/;\s*$/, '');
    if (!serialized) throw new Error('V8_MIGRATION_PORTABLE_PAYLOAD_INVALID');
    try { return JSON.parse(serialized); }
    catch (_) { throw new Error('V8_MIGRATION_PORTABLE_PAYLOAD_INVALID'); }
  }

  function sourceFor(input) {
    assertSafeKeys(input);
    if (typeof input === 'string') {
      const payload = portableEmbedPayload(input);
      if (!isRecordObject(payload)) throw new Error('V8_MIGRATION_PORTABLE_PAYLOAD_INVALID');
      const data = isRecordObject(payload.data) ? payload.data : payload;
      return { data, shape:'portable-html', rawInput:input, sourcePackageVersion:firstSourceVersion(nestedRecordSchemaVersion(data), data, payload) };
    }
    if (!isRecordObject(input)) throw new Error('V8_MIGRATION_SOURCE_INVALID');
    if (isRecordObject(input.__CWB_EMBED__)) {
      const embedded = input.__CWB_EMBED__;
      const data = isRecordObject(embedded.data) ? embedded.data : embedded;
      return {
        data,
        shape:isRecordObject(embedded.data) ? 'portable-embed-data' : 'portable-embed',
        rawInput:input,
        sourcePackageVersion:firstSourceVersion(nestedRecordSchemaVersion(data), data, embedded, input),
      };
    }
    if (isRecordObject(input.data)) {
      return {
        data:input.data,
        shape:input.package === 'counselor-desk' ? 'counselor-package-data' : 'wrapped-data',
        rawInput:input,
        sourcePackageVersion:firstSourceVersion(nestedRecordSchemaVersion(input.data), input.data, input),
      };
    }
    return { data:input, shape:'package', rawInput:input, sourcePackageVersion:firstSourceVersion(nestedRecordSchemaVersion(input), input) };
  }

  function hasSourceCollection(source, path) {
    if (!isRecordObject(source)) return false;
    if (path.startsWith('custom.')) {
      const custom = source.custom;
      const key = path.slice('custom.'.length);
      return isRecordObject(custom) && Array.isArray(custom[key]);
    }
    return Array.isArray(source[path]);
  }

  function stableRecordJson(value) {
    const seen = new Set();
    const encode = item => {
      if (item == null || typeof item !== 'object') return JSON.stringify(item);
      if (seen.has(item)) throw new Error('V8_MIGRATION_COLLECTION_CONFLICT');
      seen.add(item);
      if (Array.isArray(item)) return `[${item.map(encode).join(',')}]`;
      if (isArrayBuffer(item) || isArrayBufferView(item) || (typeof Blob !== 'undefined' && item instanceof Blob) || item instanceof Map || item instanceof Set || item instanceof Date) {
        throw new Error('V8_MIGRATION_COLLECTION_CONFLICT');
      }
      const keys = Object.keys(item).sort();
      return `{${keys.map(key => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
    };
    return encode(value);
  }

  function appendSourceCollection(target, path, records, options) {
    const values = Array.isArray(records) ? records : [];
    const opts = options || {};
    const collection = path.startsWith('custom.')
      ? (() => {
          const key = path.slice('custom.'.length);
          if (!isRecordObject(target.custom)) target.custom = {};
          const existing = Array.isArray(target.custom[key]) ? target.custom[key] : [];
          target.custom[key] = existing;
          return existing;
        })()
      : (() => {
          const existing = Array.isArray(target[path]) ? target[path] : [];
          target[path] = existing;
          return existing;
        })();
    const existingById = new Map(collection.map(record => [recordId(record), record]).filter(([id]) => id));
    values.forEach(item => {
      const incoming = clone(item);
      const id = recordId(incoming);
      const existing = id && existingById.get(id);
      if (!existing) {
        collection.push(incoming);
        if (id) existingById.set(id, incoming);
        return;
      }
      if (stableRecordJson(existing) !== stableRecordJson(incoming)) throw new Error('V8_MIGRATION_COLLECTION_CONFLICT');
      if (opts.storageDuplicates) opts.storageDuplicates.push({ collection:path, id, source:opts.source || 'storage', resolution:'identical_retained_once' });
    });
  }

  function parseStoredValue(value) {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        assertSafeKeys(parsed);
        return parsed;
      } catch (error) {
        if (error && error.message === 'V8_MIGRATION_UNSAFE_KEY') throw error;
        throw new Error('V8_MIGRATION_STORAGE_RECORD_INVALID');
      }
    }
    if (isArrayBuffer(value) || isArrayBufferView(value)) {
      if (isRawEncryptedSqliteBlob(value)) throw new Error('V8_MIGRATION_SQLITE_DECRYPT_REQUIRED');
      throw new Error('V8_MIGRATION_STORAGE_RECORD_INVALID');
    }
    if (isRecordObject(value) || Array.isArray(value)) return value;
    throw new Error('V8_MIGRATION_STORAGE_RECORD_INVALID');
  }

  function recordsFromStoredValue(value) {
    const parsed = parseStoredValue(value);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.records)) return parsed.records;
    return [parsed];
  }

  function binaryBytes(value) {
    if (isArrayBuffer(value)) return new Uint8Array(value.slice(0));
    if (isArrayBufferView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    return null;
  }

  function isRawEncryptedSqliteBlob(value) {
    const bytes = binaryBytes(value);
    if (!bytes || bytes.length < 7) return false;
    const marker = [67, 87, 66, 83, 81, 76, 49]; // CWBSQL1
    return marker.every((byte, index) => bytes[index] === byte);
  }

  function parseBulkStudentJson(value) {
    if (typeof value !== 'string') throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
    let parsed;
    try { parsed = JSON.parse(value); }
    catch (_) { throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID'); }
    if (!Array.isArray(parsed)) throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
    assertSafeKeys(parsed);
    return parsed;
  }

  function parseBulkStudentGzip(value) {
    const bytes = binaryBytes(value);
    if (!bytes) throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
    let zlib;
    try {
      if (typeof require !== 'function') throw new Error('V8_MIGRATION_BULK_GZIP_UNSUPPORTED');
      zlib = require('node:zlib');
    } catch (error) {
      if (error && error.message === 'V8_MIGRATION_BULK_GZIP_UNSUPPORTED') throw error;
      throw new Error('V8_MIGRATION_BULK_GZIP_UNSUPPORTED');
    }
    try {
      const decoded = zlib.gunzipSync(bytes);
      return parseBulkStudentJson(new TextDecoder().decode(decoded));
    } catch (error) {
      if (error && error.message === 'V8_MIGRATION_BULK_STUDENTS_INVALID') throw error;
      throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
    }
  }

  function expandV4BulkStudents(records) {
    const rows = Array.isArray(records) ? records : [];
    const manifests = rows.filter(row => isRecordObject(row) && String(row.id || '') === '__cwb_bulk_students__');
    if (manifests.length !== 1) throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
    const count = Number(manifests[0].chunk_count);
    if (!Number.isInteger(count) || count < 0) throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
    const chunks = new Map();
    let ordinaryRows = 0;
    rows.forEach(row => {
      if (!isRecordObject(row)) throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
      const id = String(row.id || '');
      if (id === '__cwb_bulk_students__') return;
      const match = id.match(/^__cwb_bulk_students__:(\d+)$/);
      if (!match) { ordinaryRows++; return; }
      const index = Number(match[1]);
      if (!Number.isSafeInteger(index) || index < 0 || index >= count || chunks.has(index)) throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
      const hasJson = Object.prototype.hasOwnProperty.call(row, 'records_json');
      const hasGzip = Object.prototype.hasOwnProperty.call(row, 'records_gzip');
      if (hasJson === hasGzip) throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
      chunks.set(index, hasJson ? parseBulkStudentJson(row.records_json) : parseBulkStudentGzip(row.records_gzip));
    });
    if (ordinaryRows || chunks.size !== count) throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
    const output = [];
    for (let index = 0; index < count; index++) {
      const chunk = chunks.get(index);
      if (!chunk) throw new Error('V8_MIGRATION_BULK_STUDENTS_INVALID');
      output.push(...chunk);
    }
    return output;
  }

  function expandStoredRecords(records, options) {
    const rows = Array.isArray(records) ? records : [];
    const opts = options || {};
    const containsBulkMarker = rows.some(row => isRecordObject(row) && /^__cwb_bulk_students__(?::|$)/.test(String(row.id || '')));
    if (containsBulkMarker) {
      if (opts.path !== 'students') throw new Error('V8_MIGRATION_STORAGE_RECORD_INVALID');
      return expandV4BulkStudents(rows);
    }
    return rows.map(record => {
      if (isArrayBuffer(record) || isArrayBufferView(record)) {
        if (isRawEncryptedSqliteBlob(record)) throw new Error('V8_MIGRATION_SQLITE_DECRYPT_REQUIRED');
        throw new Error('V8_MIGRATION_STORAGE_RECORD_INVALID');
      }
      if (isRecordObject(record) && (Object.prototype.hasOwnProperty.call(record, 'records_json') || Object.prototype.hasOwnProperty.call(record, 'records_gzip'))) throw new Error('V8_MIGRATION_STORAGE_RECORD_INVALID');
      return record;
    });
  }

  function storedRowsFor(container) {
    if (!isRecordObject(container)) return [];
    if (Array.isArray(container.records)) return container.records;
    if (isRecordObject(container.records)) {
      return Object.entries(container.records).flatMap(([collection, records]) =>
        Array.isArray(records) ? records.map(record => ({ collection, record })) : []);
    }
    return [];
  }

  function storageContainers(source) {
    const containers = [source];
    ['snapshot', 'export', 'storage'].forEach(key => {
      if (!isRecordObject(source[key])) return;
      containers.push(source[key]);
      ['data', 'payload'].forEach(nestedKey => {
        if (isRecordObject(source[key][nestedKey])) containers.push(source[key][nestedKey]);
      });
    });
    return containers;
  }

  function normaliseStoredSource(source) {
    const output = clone(source);
    const recognised = new Set();
    const storageDuplicates = [];
    LOGICAL_COLLECTION_PATHS.forEach(path => { if (hasSourceCollection(source, path)) recognised.add(path); });
    storageContainers(source).forEach(container => {
      LOGICAL_COLLECTION_PATHS.forEach(path => {
        if (!hasSourceCollection(container, path)) return;
        if (container === source) return;
        appendSourceCollection(output, path, sourceCollection(container, path), { storageDuplicates, source:'nested-logical' });
        recognised.add(path);
      });
      Object.entries(STORAGE_COLLECTION_PATHS).forEach(([storageName, path]) => {
        if (!Array.isArray(container[storageName])) return;
        appendSourceCollection(output, path, expandStoredRecords(container[storageName], { path }), { storageDuplicates, source:storageName });
        recognised.add(path);
      });
      storedRowsFor(container).forEach(row => {
        if (!isRecordObject(row)) return;
        const path = STORAGE_ROW_COLLECTION_PATHS[String(row.collection || '')];
        if (!path) return;
        const stored = hasOwn(row, 'record') ? row.record
          : hasOwn(row, 'payload') ? row.payload
            : hasOwn(row, 'value') ? row.value
              : hasOwn(row, 'data') ? row.data : undefined;
        if (stored === undefined) throw new Error('V8_MIGRATION_STORAGE_RECORD_INVALID');
        appendSourceCollection(output, path, expandStoredRecords(recordsFromStoredValue(stored), { path }), { storageDuplicates, source:'records-row' });
        recognised.add(path);
      });
    });
    if (!recognised.size) throw new Error('V8_MIGRATION_SOURCE_NO_COLLECTIONS');
    return { source:output, storageDuplicates };
  }

  function normaliseStudentNumberHistory(student) {
    const original = student || {};
    const current = cleanText(original.student_number);
    const customFields = isRecordObject(original.custom_fields) ? original.custom_fields : {};
    const topLevel = Array.isArray(original.student_number_history)
      ? original.student_number_history
      : original.student_number_history == null || original.student_number_history === ''
        ? []
        : [original.student_number_history];
    const custom = Array.isArray(customFields.student_number_history)
      ? customFields.student_number_history
      : customFields.student_number_history == null || customFields.student_number_history === ''
        ? []
        : [customFields.student_number_history];
    const raw = topLevel.concat(custom);
    const known = new Set();
    const history = [];
    raw.forEach(value => {
      const candidate = cleanText(value && typeof value === 'object' ? value.value : value);
      if (!candidate || candidate === current || known.has(candidate)) return;
      known.add(candidate);
      history.push(candidate);
    });
    return history;
  }

  function normaliseStudents(students, warnings) {
    const seenNumbers = new Map();
    const records = Array.isArray(students) ? students : [];
    return records.map((record, index) => {
      const output = clone(record || {});
      const current = cleanText(output.student_number);
      output.student_number_history = normaliseStudentNumberHistory(output);
      if (current) {
        const priorIndex = seenNumbers.get(current);
        if (priorIndex != null) warnings.push({
          code:'DUPLICATE_STUDENT_NUMBER_UNCHANGED',
          studentNumber:current,
          recordIds:[String(records[priorIndex] && records[priorIndex].id || ''), String(output.id || '')],
          message:'Duplicate student numbers were retained for review; migration never merges students automatically.',
        });
        else seenNumbers.set(current, index);
      }
      return output;
    });
  }

  function sourceCollection(source, path) {
    if (path.startsWith('custom.')) {
      const key = path.slice('custom.'.length);
      const custom = source && source.custom;
      return custom && !Array.isArray(custom) && typeof custom === 'object' && Array.isArray(custom[key]) ? custom[key] : [];
    }
    return source && Array.isArray(source[path]) ? source[path] : [];
  }

  function recordId(record) {
    return cleanText(record && record.id);
  }

  function copyCollection(source, output, mapping, warnings) {
    const incoming = sourceCollection(source, mapping.from);
    const target = Array.isArray(output[mapping.to]) ? output[mapping.to] : [];
    const existingIds = new Set(target.map(recordId).filter(Boolean));
    let copied = 0;
    let skippedExisting = 0;
    incoming.forEach((record, index) => {
      const id = recordId(record);
      if (!id) {
        warnings.push({
          code:'CANONICAL_COPY_MISSING_ID_RETAINED',
          from:mapping.from,
          to:mapping.to,
          sourceIndex:index,
          message:'A record without an ID was copied unchanged and was not deduplicated automatically.',
        });
        target.push(clone(record));
        copied++;
        return;
      }
      if (existingIds.has(id)) {
        skippedExisting++;
        warnings.push({
          code:'CANONICAL_COPY_CONFLICT_RETAINED',
          from:mapping.from,
          to:mapping.to,
          recordId:id,
          message:'An existing canonical record was retained; the legacy source remains unchanged.',
        });
        return;
      }
      existingIds.add(id);
      target.push(clone(record));
      copied++;
    });
    output[mapping.to] = target;
    return {
      kind:'non_destructive_copy',
      from:mapping.from,
      to:mapping.to,
      copied,
      skippedExisting,
      retainedLegacySource:true,
    };
  }

  function createRecoveryPoint(source, options) {
    const opts = options || {};
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const at = String(now());
    return {
      id:String(opts.id || opts.recoveryPointId || `recovery_v8_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      kind:'pre_schema_v8_migration',
      schema_version:SCHEMA_VERSION,
      source_schema_version:opts.sourceVersion != null ? numberOrNull(opts.sourceVersion) : sourceVersion(source),
      created_at:at,
      data:clone(source),
    };
  }

  function retainRecoveryPoints(points, options) {
    const opts = typeof options === 'number' ? { limit:options } : options || {};
    const limit = Math.max(1, Math.floor(Number(opts.limit || DEFAULT_RECOVERY_POINT_LIMIT)) || DEFAULT_RECOVERY_POINT_LIMIT);
    return (Array.isArray(points) ? points : []).slice(-limit).map(point => clone(point));
  }

  function migrateLegacyPackage(input, options) {
    const opts = options || {};
    const sourceDescriptor = sourceFor(input);
    // This captures the original envelope before storage adaptation or mappings mutate a copy.
    const recoveryPoint = createRecoveryPoint(sourceDescriptor.rawInput, {
      id:opts.recoveryPointId,
      now:opts.now,
      sourceVersion:sourceDescriptor.sourcePackageVersion,
    });
    const adapted = normaliseStoredSource(sourceDescriptor.data);
    const source = adapted.source;
    const sourcePackageVersion = sourceDescriptor.sourcePackageVersion;
    const warnings = [];
    if (sourcePackageVersion == null) warnings.push({
      code:'SOURCE_VERSION_MISSING',
      message:'The source did not declare a package version. Its fields were copied conservatively.',
    });
    else if (sourcePackageVersion > SCHEMA_VERSION) warnings.push({
      code:'SOURCE_VERSION_NEWER_THAN_TARGET',
      sourcePackageVersion,
      message:'The source package is newer than schema v8. Only known non-destructive mappings were applied.',
    });

    const output = clone(source);
    output.package = 'counselor-desk';
    output.package_version = SCHEMA_VERSION;
    output.schema_version = SCHEMA_VERSION;
    output.students = normaliseStudents(source.students, warnings);
    if (!output.custom || typeof output.custom !== 'object' || Array.isArray(output.custom)) output.custom = {};
    CANONICAL_COLLECTIONS.forEach(collection => {
      if (!Array.isArray(output[collection])) output[collection] = [];
    });

    const nonDestructiveCopies = COPY_MAPPINGS.map(mapping => copyCollection(source, output, mapping, warnings));
    const recoveryPoints = retainRecoveryPoints([].concat(opts.recoveryPoints || [], recoveryPoint), opts.recoveryPointLimit);
    const provenance = {
      sourceShape:sourceDescriptor.shape,
      sourcePackageVersion,
      targetSchemaVersion:SCHEMA_VERSION,
      migratedAt:recoveryPoint.created_at,
      recoveryPointId:recoveryPoint.id,
      migration:'schema-v8-conservative-copy',
    };

    return {
      package:output,
      recoveryPoint,
      recoveryPoints,
      report:{ provenance, warnings, nonDestructiveCopies, storageDuplicates:adapted.storageDuplicates },
    };
  }

  return {
    SCHEMA_VERSION,
    DEFAULT_RECOVERY_POINT_LIMIT,
    CANONICAL_COLLECTIONS,
    COPY_MAPPINGS,
    clone,
    normaliseStudentNumberHistory,
    createRecoveryPoint,
    retainRecoveryPoints,
    migrateLegacyPackage,
  };
});
