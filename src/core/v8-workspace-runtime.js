/* Shared schema-v8 workspace coordinator. It is intentionally storage-agnostic
 * so browser, portable HTML, and desktop adapters can use the same write rules. */
(function attachV8WorkspaceRuntime(root, factory) {
  const api = factory(root || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.CWBv8 = api;
    if (typeof root.dispatchEvent === 'function' && typeof root.Event === 'function') {
      const ready = () => root.dispatchEvent(new root.Event('cwb:v8-ready'));
      root.queueMicrotask ? root.queueMicrotask(ready) : root.setTimeout(ready, 0);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV8WorkspaceRuntime(root) {
  'use strict';

  const SCHEMA_VERSION = 8;
  const DEFAULT_RECOVERY_POINT_LIMIT = 3;
  const BINARY_OMISSION_KEY = '__cwb_v8_omitted_binary_fields';
  const BINARY_OMISSION_GENERATOR = 'cwb-v8-history';
  const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const TYPED_ARRAY_TAGS = new Set([
    '[object Int8Array]', '[object Uint8Array]', '[object Uint8ClampedArray]',
    '[object Int16Array]', '[object Uint16Array]', '[object Int32Array]',
    '[object Uint32Array]', '[object Float32Array]', '[object Float64Array]',
    '[object BigInt64Array]', '[object BigUint64Array]', '[object DataView]',
  ]);

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
    const ArrayBufferCtor = (root && root.ArrayBuffer) || (typeof ArrayBuffer !== 'undefined' ? ArrayBuffer : null);
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

  function isPlainObject(value) {
    if (!value || objectTag(value) !== '[object Object]') return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) return true;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
    return !!descriptor && typeof descriptor.value === 'function' && descriptor.value.name === 'Object';
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
    const Reader = (root && root.FileReader) || realmConstructor(value, 'FileReader');
    if (typeof Reader !== 'function') throw new Error('BINARY_READ_UNAVAILABLE');
    return new Promise((resolve, reject) => {
      const reader = new Reader();
      reader.onerror = () => reject(reader.error || new Error('BINARY_READ_FAILED'));
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.readAsArrayBuffer(value);
    });
  }

  function assertSafeKey(key, message) {
    if (DANGEROUS_KEYS.has(String(key))) throw new Error(message || '危险数据键');
  }

  function assertSafeValue(value, seen) {
    if (value == null || typeof value !== 'object' || isBinary(value) || isDate(value)) return;
    const references = seen || new Set();
    if (references.has(value)) return;
    references.add(value);
    if (isMap(value)) {
      value.forEach((entryValue, entryKey) => { assertSafeValue(entryKey, references); assertSafeValue(entryValue, references); });
      return;
    }
    if (isSet(value)) {
      value.forEach(entryValue => assertSafeValue(entryValue, references));
      return;
    }
    Object.keys(value).forEach(key => {
      assertSafeKey(key);
      assertSafeValue(value[key], references);
    });
  }

  function isBinary(value) {
    if (!value) return false;
    return isBlob(value) || isArrayBuffer(value) || isArrayBufferView(value);
  }

  function binaryMetadata(value) {
    const size = Number(value && (value.size == null ? value.byteLength : value.size));
    return {
      size: Number.isFinite(size) ? size : undefined,
      type: String(value && (value.type || value.mimeType) || ''),
    };
  }

  function binaryKind(value) {
    if (isBlob(value)) return 'blob';
    if (isArrayBuffer(value)) return 'array-buffer';
    if (isArrayBufferView(value)) return 'typed-array';
    return 'binary';
  }

  function copyArrayBuffer(buffer, byteOffset, byteLength) {
    const start = Number(byteOffset) || 0;
    const end = start + (byteLength == null ? buffer.byteLength - start : Number(byteLength));
    if (typeof buffer.slice === 'function') return buffer.slice(start, end);
    const bytes = new Uint8Array(buffer, start, Math.max(0, end - start));
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    return copy.buffer;
  }

  function cloneBinary(value) {
    // Blob instances are immutable; preserving the original object also keeps
    // the existing attachment repository identity contract intact.
    if (isBlob(value)) return value;
    if (isArrayBuffer(value)) return copyArrayBuffer(value, 0, value.byteLength);
    if (isArrayBufferView(value)) {
      if (typeof Buffer !== 'undefined' && typeof Buffer.isBuffer === 'function' && Buffer.isBuffer(value)) return Buffer.from(value);
      const copied = copyArrayBuffer(value.buffer, value.byteOffset, value.byteLength);
      if (objectTag(value) === '[object DataView]') return new (root.DataView || DataView)(copied);
      return new value.constructor(copied);
    }
    return value;
  }

  function clone(value, seen) {
    if (value == null || typeof value !== 'object') return value;
    if (isBinary(value)) return cloneBinary(value);
    if (isDate(value)) return new Date(value.getTime());
    const references = seen || new Map();
    if (references.has(value)) return references.get(value);
    if (isMap(value)) {
      const copy = new Map();
      references.set(value, copy);
      value.forEach((entryValue, entryKey) => copy.set(clone(entryKey, references), clone(entryValue, references)));
      return copy;
    }
    if (isSet(value)) {
      const copy = new Set();
      references.set(value, copy);
      value.forEach(entryValue => copy.add(clone(entryValue, references)));
      return copy;
    }
    if (Array.isArray(value)) {
      const copy = [];
      references.set(value, copy);
      value.forEach(item => copy.push(clone(item, references)));
      return copy;
    }
    if (!isPlainObject(value)) return value;
    const copy = {};
    references.set(value, copy);
    Object.keys(value).forEach(key => {
      assertSafeKey(key);
      Object.defineProperty(copy, key, { value:clone(value[key], references), enumerable:true, configurable:true, writable:true });
    });
    return copy;
  }

  function schedulerNow() {
    const clock = root && root.performance && typeof root.performance.now === 'function'
      ? root.performance
      : typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance : null;
    return clock ? clock.now() : Date.now();
  }

  function defaultYieldToHost() {
    if (root && typeof root.MessageChannel === 'function') {
      const dispatcher = defaultYieldToHost.dispatcher || (defaultYieldToHost.dispatcher = (() => {
        const callbacks = [];
        const channel = new root.MessageChannel();
        let scheduled = false;
        channel.port1.onmessage = () => {
          scheduled = false;
          const callback = callbacks.shift();
          if (callback) callback();
          if (callbacks.length) {
            scheduled = true;
            channel.port2.postMessage(0);
          }
        };
        return resolve => {
          callbacks.push(resolve);
          if (!scheduled) {
            scheduled = true;
            channel.port2.postMessage(0);
          }
        };
      })());
      return new Promise(resolve => {
        dispatcher(resolve);
      });
    }
    return new Promise(resolve => {
      if (root && typeof root.setTimeout === 'function') root.setTimeout(resolve, 0);
      else if (typeof setImmediate === 'function') setImmediate(resolve);
      else Promise.resolve().then(resolve);
    });
  }

  function createCooperativeScheduler(options) {
    const config = options || {};
    const browserRuntime = !!(root && root.document && typeof root.setTimeout === 'function');
    const enabled = typeof config.yield === 'function' || browserRuntime;
    const yieldToHost = typeof config.yield === 'function' ? config.yield : defaultYieldToHost;
    const interval = Math.max(0, Number.isFinite(Number(config.yieldIntervalMs)) ? Number(config.yieldIntervalMs) : 20);
    const every = Math.max(1, Math.floor(Number(config.yieldEvery) || 2048));
    let lastYield = schedulerNow();
    let steps = 0;
    return {
      enabled,
      checkpoint(force) {
        if (!enabled) return null;
        steps += 1;
        if (!force && steps < every && schedulerNow() - lastYield < interval) return null;
        steps = 0;
        const pending = Promise.resolve().then(() => yieldToHost());
        return pending.then(() => { lastYield = schedulerNow(); });
      },
    };
  }

  async function cloneCooperatively(value, scheduler, references) {
    if (value == null || typeof value !== 'object' || isBinary(value) || isDate(value)) return clone(value);
    if (!scheduler || scheduler.enabled === false) return clone(value);
    const seen = references || new Map();
    if (seen.has(value)) return seen.get(value);
    if (isMap(value) || isSet(value) || !isPlainObject(value) && !Array.isArray(value)) return clone(value);
    if (Array.isArray(value)) {
      const copy = [];
      seen.set(value, copy);
      for (const item of value) {
        copy.push(item && typeof item === 'object' && (Array.isArray(item) || isPlainObject(item))
          ? await cloneCooperatively(item, scheduler, seen)
          : clone(item, seen));
        const pending = scheduler && scheduler.checkpoint();
        if (pending) await pending;
      }
      return copy;
    }
    const copy = {};
    seen.set(value, copy);
    for (const key of Object.keys(value)) {
      assertSafeKey(key);
      const item = value[key];
      Object.defineProperty(copy, key, {
        value:item && typeof item === 'object' && (Array.isArray(item) || isPlainObject(item))
          ? await cloneCooperatively(item, scheduler, seen)
          : clone(item, seen),
        enumerable:true,
        configurable:true,
        writable:true,
      });
      const pending = scheduler && scheduler.checkpoint();
      if (pending) await pending;
    }
    return copy;
  }

  async function assertSafeValueCooperatively(value, scheduler, references) {
    if (value == null || typeof value !== 'object' || isBinary(value) || isDate(value)) return;
    if (!scheduler || scheduler.enabled === false) {
      assertSafeValue(value);
      return;
    }
    const seen = references || new Set();
    if (seen.has(value)) return;
    seen.add(value);
    if (isMap(value) || isSet(value) || !isPlainObject(value) && !Array.isArray(value)) {
      assertSafeValue(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && (Array.isArray(item) || isPlainObject(item))) await assertSafeValueCooperatively(item, scheduler, seen);
        else assertSafeValue(item, seen);
        const pending = scheduler && scheduler.checkpoint();
        if (pending) await pending;
      }
      return;
    }
    for (const key of Object.keys(value)) {
      assertSafeKey(key);
      const item = value[key];
      if (item && typeof item === 'object' && (Array.isArray(item) || isPlainObject(item))) await assertSafeValueCooperatively(item, scheduler, seen);
      else assertSafeValue(item, seen);
      const pending = scheduler && scheduler.checkpoint();
      if (pending) await pending;
    }
  }

  function stable(value) {
    if (value === undefined) return '{"$undefined":true}';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }

  async function digestBytes(bytes) {
    if (typeof require === 'function') {
      try { return require('node:crypto').createHash('sha256').update(bytes).digest('hex'); }
      catch (error) { if (!globalThis.crypto || !globalThis.crypto.subtle) throw error; }
    }
    if (globalThis.crypto && globalThis.crypto.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    throw new Error('当前运行环境不支持 SHA-256 校验');
  }

  async function binaryChecksum(value) {
    let bytes;
    if (isBlob(value)) bytes = await readBlobBytes(value);
    else if (isArrayBuffer(value)) bytes = new Uint8Array(value);
    else if (isArrayBufferView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    else throw new Error('不支持的二进制数据');
    const metadata = binaryMetadata(value);
    return {
      kind:binaryKind(value),
      size:bytes.byteLength,
      type:metadata.type,
      checksum:await digestBytes(bytes),
    };
  }

  async function canonicalizeForChecksum(value, seen) {
    if (value === undefined) return { $undefined:true };
    if (value === null || typeof value !== 'object') return value;
    if (isBinary(value)) return { $binary:await binaryChecksum(value) };
    if (isDate(value)) return { $date:value.toISOString() };
    const references = seen || new Set();
    if (references.has(value)) throw new Error('工作区数据不能包含循环引用');
    references.add(value);
    let output;
    if (Array.isArray(value)) {
      output = [];
      for (const item of value) output.push(await canonicalizeForChecksum(item, references));
    } else if (isMap(value)) {
      const entries = [];
      for (const [key, item] of value.entries()) entries.push([await canonicalizeForChecksum(key, references), await canonicalizeForChecksum(item, references)]);
      entries.sort((left, right) => stable(left[0]).localeCompare(stable(right[0])));
      output = { $map:entries };
    } else if (isSet(value)) {
      const entries = [];
      for (const item of value.values()) entries.push(await canonicalizeForChecksum(item, references));
      entries.sort((left, right) => stable(left).localeCompare(stable(right)));
      output = { $set:entries };
    } else {
      output = {};
      for (const key of Object.keys(value).sort()) output[key] = await canonicalizeForChecksum(value[key], references);
    }
    references.delete(value);
    return output;
  }

  async function sha256(value) {
    const source = typeof value === 'string' ? value : stable(await canonicalizeForChecksum(value));
    return digestBytes(new TextEncoder().encode(source));
  }

  async function verifyBackup(backup) {
    if (!backup || !backup.manifest || !backup.data) return { ok:false, error:'备份缺少清单或数据' };
    if (Number(backup.manifest.schemaVersion) < SCHEMA_VERSION) return { ok:false, error:'备份版本过旧' };
    if (!/^[a-f0-9]{64}$/i.test(String(backup.manifest.checksum || ''))) return { ok:false, error:'备份校验和无效' };
    const manifest = clone(backup.manifest);
    delete manifest.checksum;
    const checksum = await sha256({
      manifest,
      data:backup.data,
      history:backup.history || [],
      recoveryPoints:backup.recoveryPoints || [],
      attachments:Array.isArray(backup.attachments) ? backup.attachments : [],
      auxiliary:backup.auxiliary || {},
    });
    return checksum === backup.manifest.checksum
      ? { ok:true, checksum }
      : { ok:false, error:'备份校验和不匹配', checksum };
  }

  function normaliseText(value) {
    return String(value == null ? '' : value).trim();
  }

  function auditValue(value) {
    if (value == null || typeof value !== 'object') return value;
    if (isBinary(value)) {
      const meta = binaryMetadata(value);
      return { [BINARY_OMISSION_KEY]: { value:{ generator:BINARY_OMISSION_GENERATOR, kind:binaryKind(value), size:meta.size, type:meta.type } } };
    }
    if (Array.isArray(value)) return value.map(auditValue);
    if (isDate(value)) return value.toISOString();
    if (isMap(value)) {
      return {
        __cwb_v8_map_entries: Array.from(value.entries()).map(([entryKey, entryValue]) => [auditValue(entryKey), auditValue(entryValue)]),
      };
    }
    if (isSet(value)) {
      return { __cwb_v8_set_values: Array.from(value.values()).map(auditValue) };
    }
    const output = {};
    const omitted = {};
    Object.keys(value).forEach(key => {
      const item = value[key];
      if (isBinary(item)) {
        const meta = binaryMetadata(item);
        omitted[key] = { generator:BINARY_OMISSION_GENERATOR, kind:binaryKind(item), size:meta.size, type:meta.type };
      } else output[key] = auditValue(item);
    });
    if (Object.keys(omitted).length) output[BINARY_OMISSION_KEY] = omitted;
    return output;
  }

  function containsGeneratedBinaryOmission(value, seen) {
    if (value == null || typeof value !== 'object') return false;
    const references = seen || new Set();
    if (references.has(value)) return false;
    references.add(value);
    const marker = value[BINARY_OMISSION_KEY];
    if (marker && typeof marker === 'object' && Object.keys(marker).length) return true;
    if (Array.isArray(value)) return value.some(item => containsGeneratedBinaryOmission(item, references));
    return Object.keys(value).some(key => containsGeneratedBinaryOmission(value[key], references));
  }

  function countCollection(value) {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === 'object') return Object.keys(value).length;
    return 0;
  }

  function maxRecordRevision(source) {
    let maximum = 0;
    Object.keys(source || {}).forEach(key => {
      const collection = source[key];
      if (!Array.isArray(collection)) return;
      collection.forEach(record => { maximum = Math.max(maximum, Number(record && record.rev) || 0); });
    });
    return maximum;
  }

  function maxHistoryRevision(history) {
    return (history || []).reduce((maximum, entry) => Math.max(maximum, Number(entry && entry.revision) || 0), 0);
  }

  function revisionIndexKey(collection, id) {
    return `${String(collection)}\u0000${String(id)}`;
  }

  function buildRevisionIndex(entries) {
    const index = new Map();
    (entries || []).forEach(entry => {
      if (!entry || entry.collection == null || entry.recordId == null) return;
      const key = revisionIndexKey(entry.collection, entry.recordId);
      index.set(key, Math.max(index.get(key) || 0, Number(entry.revision) || 0));
    });
    return index;
  }

  function createWorkspace(options) {
    const opts = options || {};
    const hydratedEnvelope = opts.envelope && typeof opts.envelope === 'object' ? opts.envelope : {};
    const now = typeof opts.now === 'function' ? opts.now : () => new Date().toISOString();
    const hasPersistenceAdapter = typeof opts.persist === 'function';
    const persist = hasPersistenceAdapter ? opts.persist : async () => ({ ok:true });
    const hasValidator = typeof opts.validate === 'function';
    const validate = hasValidator ? opts.validate : null;
    const onApplied = typeof opts.onApplied === 'function' ? opts.onApplied : null;
    const maxRetries = Math.max(0, Math.floor(Number(opts.maxRetries == null ? 2 : opts.maxRetries) || 0));
    const recoveryPointLimit = Math.max(1, Math.floor(Number(opts.recoveryPointLimit || DEFAULT_RECOVERY_POINT_LIMIT)) || DEFAULT_RECOVERY_POINT_LIMIT);
    const cooperativeScheduler = createCooperativeScheduler(opts);
    let state = clone(opts.initialState !== undefined ? opts.initialState : hydratedEnvelope.data || {});
    const history = clone(opts.history !== undefined ? opts.history : hydratedEnvelope.history || []);
    const latestRecordRevisions = buildRevisionIndex(history);
    const recoveryPoints = clone(opts.recoveryPoints !== undefined ? opts.recoveryPoints : hydratedEnvelope.recoveryPoints || []).slice(-recoveryPointLimit);
    let sequence = 0;
    let workspaceRevision = Math.max(Number(opts.initialRevision !== undefined ? opts.initialRevision : hydratedEnvelope.revision) || 0, maxRecordRevision(state), maxHistoryRevision(history));
    let queue = Promise.resolve();
    let pendingRecovery = null;
    const listeners = new Set();
    let status = { state:'saved', updatedAt:now(), error:null, pending:0 };

    function setStatus(next) {
      status = Object.assign({}, status, next, { pending:pendingRecovery ? 1 : 0 });
      listeners.forEach(listener => {
        try { listener(clone(status)); } catch (_) {}
      });
    }

    function createId(prefix) {
      return `${prefix}_${Date.now()}_${++sequence}`;
    }

    function isSingletonCollection(source, collection, command) {
      return collection === 'settings'
        || command && command.singleton === true
        || !!(source[collection] && !Array.isArray(source[collection]) && typeof source[collection] === 'object');
    }

    function ensureArray(source, collection) {
      if (!Array.isArray(source[collection])) source[collection] = [];
      return source[collection];
    }

    function historyRevision(collection, id, stagedRevisions) {
      const key = revisionIndexKey(collection, id);
      return Math.max(latestRecordRevisions.get(key) || 0, stagedRevisions && stagedRevisions.get(key) || 0);
    }

    function makeHistoryEntry(command, record, action, revision) {
      const source = auditValue(record || {});
      return {
        id:createId('history'),
        collection:String(command.collection || ''),
        recordId:String(source.id || command.id || command.collection || ''),
        revision:Number(revision == null ? source.rev || 0 : revision),
        action:String(action),
        commandType:String(command.type || action),
        actor:String(command.actor || 'local-user'),
        at:now(),
        value:source,
      };
    }

    function normaliseRecord(before, input, command, stagedRevisions) {
      const at = now();
      const next = Object.assign({}, before || {}, clone(input || {}));
      const id = normaliseText(next.id || command.id) || createId(command.collection || 'record');
      const previousRevision = Math.max(Number(before && before.rev) || 0, historyRevision(command.collection, id, stagedRevisions));
      next.id = id;
      next.rev = previousRevision + 1;
      next.schema_version = SCHEMA_VERSION;
      next.created_at = before && before.created_at || next.created_at || at;
      next.updated_at = at;
      next.updated_by = String(command.actor || 'local-user');
      if (command.collection === 'students') {
        const oldNumber = normaliseText(before && before.student_number);
        const newNumber = normaliseText(next.student_number);
        const known = [].concat(before && before.student_number_history || [], next.student_number_history || []);
        if (oldNumber && oldNumber !== newNumber) known.push(oldNumber);
        next.student_number_history = Array.from(new Set(known.map(value => normaliseText(value && typeof value === 'object' ? value.value : value)).filter(number => number && number !== newNumber)));
      }
      return next;
    }

    async function apply(command) {
      if (!command || !command.collection || !command.operation) throw new Error('工作区命令缺少集合或操作类型');
      await assertSafeValueCooperatively(command, cooperativeScheduler);
      const nextState = await cloneCooperatively(state, cooperativeScheduler);
      const collection = String(command.collection);
      if (DANGEROUS_KEYS.has(collection)) throw new Error('非法集合名');
      const operation = String(command.operation);
      const nextRevision = workspaceRevision + 1;
      const stagedHistory = [];
      const stagedRevisions = new Map();
      const stageHistory = (record, action, revision) => {
        const entry = makeHistoryEntry(command, record, action, revision);
        stagedHistory.push(entry);
        const key = revisionIndexKey(entry.collection, entry.recordId);
        stagedRevisions.set(key, Math.max(stagedRevisions.get(key) || 0, Number(entry.revision) || 0));
      };
      let result;

      if (operation === 'replace') {
        // mutate() already gives apply() a private command clone. Re-cloning the
        // replacement array here doubled large-import work without adding an
        // isolation boundary; persistence still clones the committed state.
        const replacement = command.data;
        if (replacement == null) throw new Error('替换操作缺少数据');
        const bulkHistory = command.bulk === true;
        if (isSingletonCollection(nextState, collection, command)) {
          if (!replacement || Array.isArray(replacement) || typeof replacement !== 'object') throw new Error('单例集合必须使用对象数据');
          nextState[collection] = replacement;
          stageHistory(Object.assign({ id:collection }, replacement), 'replace', nextRevision);
          result = { operation:'replace', collection, count:countCollection(replacement) };
        } else {
          if (!Array.isArray(replacement)) throw new Error('记录集合替换必须使用数组数据');
          const beforeList = ensureArray(nextState, collection);
          const beforeById = new Map(beforeList.map(record => [normaliseText(record && record.id), record]).filter(([id]) => id));
          const replacementIds = new Set();
          const nextList = [];
          for (const rawRecord of replacement) {
            if (!rawRecord || Array.isArray(rawRecord) || typeof rawRecord !== 'object') throw new Error('记录集合替换包含无效记录');
            const id = normaliseText(rawRecord.id);
            if (!id) throw new Error('记录集合替换中的记录必须包含 id');
            if (replacementIds.has(id)) throw new Error('记录集合替换包含重复 id');
            replacementIds.add(id);
            const before = beforeById.get(id) || null;
            const record = normaliseRecord(before, rawRecord, command, stagedRevisions);
            if (!bulkHistory) stageHistory(record, before ? 'update' : 'create', record.rev);
            nextList.push(record);
            const pending = cooperativeScheduler.checkpoint();
            if (pending) await pending;
          }
          for (const [id, before] of beforeById) {
            if (replacementIds.has(id)) continue;
            const revision = Math.max(Number(before.rev) || 0, historyRevision(collection, id, stagedRevisions)) + 1;
            if (!bulkHistory) stageHistory(Object.assign({}, before, {
                rev:revision,
                deleted_at:now(),
                deleted_by:String(command.actor || 'local-user'),
              }), 'delete', revision);
            const pending = cooperativeScheduler.checkpoint();
            if (pending) await pending;
          }
          nextState[collection] = nextList;
          if (bulkHistory) {
            stageHistory({
              id:`__cwb_bulk_replace__:${collection}:${nextRevision}`,
              collection,
              count:nextList.length,
              deleted_count:beforeById.size - replacementIds.size,
              history_mode:'summary',
            }, 'replace', nextRevision);
          }
          result = { operation:'replace', collection, count:nextList.length, bulk:bulkHistory };
        }
      } else if (isSingletonCollection(nextState, collection, command)) {
        const before = clone(nextState[collection] || {});
        if (operation === 'delete') {
          nextState[collection] = {};
          stageHistory(Object.assign({ id:collection }, before, { deleted_at:now(), deleted_by:String(command.actor || 'local-user') }), 'delete', nextRevision);
          result = { operation:'delete', collection, before };
        } else if (operation === 'upsert' || operation === 'patch') {
          const patch = operation === 'patch' ? command.patch : command.record;
          if (!patch || Array.isArray(patch) || typeof patch !== 'object') throw new Error('单例集合更新缺少对象数据');
          const record = Object.assign({}, before, clone(patch));
          delete record.id;
          delete record.rev;
          nextState[collection] = record;
          stageHistory(Object.assign({ id:collection }, record), Object.keys(before).length ? 'update' : 'create', nextRevision);
          result = { operation:Object.keys(before).length ? 'update' : 'create', collection, record:clone(record), before };
        } else throw new Error(`不支持的工作区操作：${operation}`);
      } else {
        const list = ensureArray(nextState, collection);
        const requestedId = normaliseText(command.id || command.record && command.record.id);
        const index = list.findIndex(item => normaliseText(item && item.id) === requestedId);
        const before = index >= 0 ? clone(list[index]) : null;
        if (operation === 'upsert' || operation === 'patch') {
          if (operation === 'patch' && !before) throw new Error('无法更新不存在的记录');
          const input = operation === 'patch'
            ? Object.assign({}, before, clone(command.patch || {}), { id:requestedId })
            : command.record;
          const record = normaliseRecord(before, input, command, stagedRevisions);
          if (index >= 0) list[index] = record;
          else list.push(record);
          stageHistory(record, index >= 0 ? 'update' : 'create', record.rev);
          result = { operation:index >= 0 ? 'update' : 'create', collection, record:clone(record), before };
        } else if (operation === 'delete') {
          if (!before) throw new Error('无法删除不存在的记录');
          list.splice(index, 1);
          const deleted = Object.assign({}, before, {
            rev:Math.max(Number(before.rev) || 0, historyRevision(collection, before.id, stagedRevisions)) + 1,
            deleted_at:now(),
            deleted_by:String(command.actor || 'local-user'),
          });
          stageHistory(deleted, 'delete', deleted.rev);
          result = { operation:'delete', collection, record:before };
        } else throw new Error(`不支持的工作区操作：${operation}`);
      }

      if (hasValidator) {
        const verdict = await validate(await cloneCooperatively(nextState, cooperativeScheduler), clone(command), clone(result));
        if (verdict !== true && verdict != null) throw new Error(typeof verdict === 'string' ? verdict : '数据校验失败');
      }
      return { nextState, result, nextRevision, stagedHistory, stagedRevisions };
    }

    async function makeEnvelope(command) {
      return {
        schemaVersion:SCHEMA_VERSION,
        id:createId('workspace'),
        at:now(),
        revision:workspaceRevision,
        command:await cloneCooperatively(command, cooperativeScheduler),
        data:await cloneCooperatively(state, cooperativeScheduler),
        history:await cloneCooperatively(history, cooperativeScheduler),
        recoveryPoints:await cloneCooperatively(recoveryPoints, cooperativeScheduler),
      };
    }

    async function persistWithRetry(envelope) {
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // The envelope has just been assembled from private workspace state and is
          // never exposed to callers. Avoid a second full deep clone before every
          // durable write; it doubled 10k-row import work without adding isolation.
          const output = await persist(envelope);
          if (output === false || output && output.ok === false) throw new Error(output && output.error || '持久化被拒绝');
          return output || { ok:true };
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
      }
      throw lastError;
    }

    function recordPersistenceFailure(envelope, error) {
      if (!pendingRecovery || Number(envelope.revision) >= Number(pendingRecovery.revision)) pendingRecovery = clone(envelope);
      setStatus({ state:'pending_recovery', error:error.message || String(error), updatedAt:now() });
    }

    function recordPersistenceSuccess(envelope) {
      if (pendingRecovery && Number(pendingRecovery.revision) <= Number(envelope.revision)) pendingRecovery = null;
      setStatus({ state:pendingRecovery ? 'pending_recovery' : 'saved', error:pendingRecovery ? status.error : null, updatedAt:now() });
    }

    async function persistCurrent(command) {
      if (!hasPersistenceAdapter) {
        const at = now();
        if (pendingRecovery && Number(pendingRecovery.revision) <= Number(workspaceRevision)) pendingRecovery = null;
        setStatus({ state:'saved', error:null, updatedAt:at });
        return { schemaVersion:SCHEMA_VERSION, id:createId('workspace'), at, revision:workspaceRevision, command:clone(command) };
      }
      const envelope = await makeEnvelope(command);
      setStatus({ state:'saving', error:null, updatedAt:envelope.at });
      try {
        await persistWithRetry(envelope);
        recordPersistenceSuccess(envelope);
        return envelope;
      } catch (error) {
        recordPersistenceFailure(envelope, error);
        throw error;
      }
    }

    async function runMutation(command) {
      const applied = await apply(command);
      state = applied.nextState;
      workspaceRevision = applied.nextRevision;
      // Large imports create one immutable history entry per record. Commit them in
      // bounded slices so the browser can process input and timers between slices.
      for (const entry of applied.stagedHistory) {
        history.push(entry);
        const pending = cooperativeScheduler.checkpoint();
        if (pending) await pending;
      }
      for (const [key, revision] of applied.stagedRevisions) {
        latestRecordRevisions.set(key, Math.max(latestRecordRevisions.get(key) || 0, revision));
        const pending = cooperativeScheduler.checkpoint();
        if (pending) await pending;
      }
      if (onApplied) {
        try {
          onApplied(
            await cloneCooperatively(state, cooperativeScheduler),
            clone(applied.result),
            await cloneCooperatively(command, cooperativeScheduler),
          );
        } catch (error) {
          const envelope = await makeEnvelope(command);
          recordPersistenceFailure(envelope, error instanceof Error ? error : new Error(String(error)));
          throw error;
        }
      }
      await persistCurrent(command);
      return clone(applied.result);
    }

    function addRecoveryPoint(meta) {
      const point = {
        id:createId('recovery'),
        schemaVersion:SCHEMA_VERSION,
        at:now(),
        revision:workspaceRevision,
        meta:clone(meta || {}),
        data:clone(state),
        history:clone(history),
      };
      recoveryPoints.push(point);
      while (recoveryPoints.length > recoveryPointLimit) recoveryPoints.shift();
      return point;
    }

    async function runCheckpoint(meta) {
      const command = Object.assign({ type:'workspace.checkpoint', operation:'checkpoint', actor:'local-user' }, clone(meta || {}));
      const point = addRecoveryPoint(command);
      await persistCurrent(command);
      return { operation:'checkpoint', id:point.id, revision:point.revision };
    }

    async function runFlush(meta) {
      const command = Object.assign({ type:'workspace.flush', operation:'flush', actor:'local-user' }, clone(meta || {}));
      const envelope = await persistCurrent(command);
      return { operation:'flush', id:envelope.id, revision:envelope.revision };
    }

    function enqueue(task) {
      const work = queue.then(task);
      queue = work.catch(() => undefined);
      return work;
    }

    function mutate(command) {
      return enqueue(async () => runMutation(await cloneCooperatively(command, cooperativeScheduler)));
    }

    function checkpoint(meta) {
      return enqueue(() => runCheckpoint(meta));
    }

    function flush(meta) {
      return enqueue(() => runFlush(meta));
    }

    function retryPending() {
      return enqueue(async () => {
        if (!pendingRecovery) return { retried:0, remaining:0 };
        const previous = pendingRecovery;
        const command = {
          type:'workspace.retry',
          operation:'retry',
          actor:'local-user',
          retryOf:previous.id,
        };
        try {
          await persistCurrent(command);
          return { retried:1, remaining:0 };
        } catch (_) {
          return { retried:0, remaining:1 };
        }
      });
    }

    function hydrateBackup(backup, actor) {
      return enqueue(async () => {
        const verification = await verifyBackup(backup);
        if (!verification || verification.ok !== true) {
          throw new Error(verification && verification.error || '备份校验失败');
        }
        const manifest = clone(backup.manifest || {});
        const candidateState = clone(backup.data || {});
        const candidateHistory = clone(Array.isArray(backup.history) ? backup.history : []);
        const candidateRecoveryPoints = clone(Array.isArray(backup.recoveryPoints) ? backup.recoveryPoints : [])
          .slice(-recoveryPointLimit);
        const candidateRevision = Number(manifest.revision);
        const minimumRevision = Math.max(maxRecordRevision(candidateState), maxHistoryRevision(candidateHistory));
        if (!Number.isInteger(candidateRevision) || candidateRevision < minimumRevision) {
          throw new Error('备份工作区版本无效');
        }
        assertSafeValue(candidateState);
        assertSafeValue(candidateHistory);
        assertSafeValue(candidateRecoveryPoints);
        const command = {
          type:'workspace.hydrate_backup',
          operation:'hydrate_backup',
          actor:actor || 'local-user',
          backupRevision:candidateRevision,
        };
        const result = { operation:'hydrate_backup', revision:candidateRevision };
        if (hasValidator) {
          const verdict = await validate(clone(candidateState), clone(command), clone(result));
          if (verdict !== true && verdict != null) throw new Error(typeof verdict === 'string' ? verdict : '数据校验失败');
        }

        state = candidateState;
        workspaceRevision = candidateRevision;
        history.splice(0, history.length, ...candidateHistory);
        recoveryPoints.splice(0, recoveryPoints.length, ...candidateRecoveryPoints);
        latestRecordRevisions.clear();
        buildRevisionIndex(history).forEach((revision, key) => latestRecordRevisions.set(key, revision));

        if (onApplied) {
          try {
            onApplied(clone(state), clone(result), clone(command));
          } catch (error) {
            const envelope = await makeEnvelope(command);
            recordPersistenceFailure(envelope, error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        }
        await persistCurrent(command);
        return clone(result);
      });
    }

    function historyFor(collection, id) {
      return history
        .filter(entry => entry.collection === String(collection) && String(entry.recordId) === String(id))
        .map(entry => clone(entry));
    }

    function stripRecordMetadata(record) {
      const restored = clone(record || {});
      delete restored.deleted_at;
      delete restored.deleted_by;
      delete restored[BINARY_OMISSION_KEY];
      return restored;
    }

    function restoreVersion(collection, id, revision, actor) {
      const version = historyFor(collection, id).find(entry => Number(entry.revision) === Number(revision) && entry.action !== 'delete' && entry.value && !entry.value.deleted_at);
      if (!version) return Promise.reject(new Error('找不到可恢复的历史版本'));
      if (containsGeneratedBinaryOmission(version.value)) return Promise.reject(new Error('附件二进制不在版本历史中，无法从历史记录恢复'));
      const restored = stripRecordMetadata(version.value);
      if (collection === 'settings') {
        delete restored.id;
        return mutate({ type:'settings.restore', collection:'settings', operation:'replace', data:restored, actor:actor || 'local-user' });
      }
      return mutate({ type:'record.restore', collection, id, operation:'upsert', record:restored, actor:actor || 'local-user' });
    }

    function listRecoveryPoints() {
      return recoveryPoints.map(point => clone(point));
    }

    function restoreRecoveryPoint(id, actor) {
      const point = recoveryPoints.find(item => String(item.id) === String(id));
      if (!point) return Promise.reject(new Error('找不到恢复点'));
      return enqueue(async () => {
        const candidateState = clone(point.data);
        const candidateRevision = Math.max(workspaceRevision + 1, Number(point.revision) + 1);
        const command = { type:'workspace.recovery_restore', operation:'restore', actor:actor || 'local-user', recoveryPointId:point.id };
        const candidateResult = { operation:'recovery_restore', id:point.id, revision:candidateRevision };
        if (hasValidator) {
          const verdict = await validate(clone(candidateState), clone(command), clone(candidateResult));
          if (verdict !== true && verdict != null) throw new Error(typeof verdict === 'string' ? verdict : '数据校验失败');
        }
        state = candidateState;
        workspaceRevision = candidateRevision;
        history.push(makeHistoryEntry({ type:'workspace.recovery_restore', collection:'workspace', id:`recovery:${point.id}`, actor:actor || 'local-user' }, {
          id:`recovery:${point.id}`,
          recovery_point_id:point.id,
          recovered_revision:point.revision,
        }, 'recovery_restore', workspaceRevision));
        if (onApplied) {
          try {
            onApplied(clone(state), { operation:'recovery_restore', id:point.id }, clone(command));
          } catch (error) {
            const envelope = await makeEnvelope(command);
            recordPersistenceFailure(envelope, error instanceof Error ? error : new Error(String(error)));
            throw error;
          }
        }
        await persistCurrent(command);
        return { operation:'recovery_restore', id:point.id, revision:workspaceRevision };
      });
    }

    function exportEmergencyBackup() {
      return {
        schemaVersion:SCHEMA_VERSION,
        exportedAt:now(),
        revision:workspaceRevision,
        state:clone(state),
        history:clone(history),
        pendingCommands:pendingRecovery ? [clone(pendingRecovery)] : [],
        recoveryPoints:listRecoveryPoints(),
        status:clone(status),
      };
    }

    async function createBackup(meta) {
      const data = clone(state);
      const backupHistory = clone(history);
      const backupRecoveryPoints = listRecoveryPoints();
      const options = clone(meta || {});
      const attachments = Array.isArray(options.attachments) ? clone(options.attachments) : [];
      const auxiliary = options.auxiliary && typeof options.auxiliary === 'object' && !Array.isArray(options.auxiliary)
        ? clone(options.auxiliary) : {};
      delete options.attachments;
      delete options.auxiliary;
      const manifest = Object.assign({
        schemaVersion:SCHEMA_VERSION,
        app:'counselor-desk',
        createdAt:now(),
        source:'local',
        revision:workspaceRevision,
        collectionCount:Object.keys(data).length,
        attachmentCount:attachments.length || (Array.isArray(data.attachments) ? data.attachments.length : 0),
      }, options);
      const checksumManifest = clone(manifest);
      delete checksumManifest.checksum;
      manifest.checksum = await sha256({
        manifest:checksumManifest,
        data,
        history:backupHistory,
        recoveryPoints:backupRecoveryPoints,
        attachments,
        auxiliary,
      });
      return { manifest, data, history:backupHistory, recoveryPoints:backupRecoveryPoints, attachments, auxiliary };
    }

    function diagnostics() {
      const collections = {};
      Object.keys(state).forEach(key => { collections[key] = countCollection(state[key]); });
      return {
        schemaVersion:SCHEMA_VERSION,
        revision:workspaceRevision,
        status:clone(status),
        collections,
        historyEntries:history.length,
        pendingCommands:pendingRecovery ? 1 : 0,
        recoveryPoints:recoveryPoints.length,
      };
    }

    return {
      schemaVersion:SCHEMA_VERSION,
      mutate,
      checkpoint,
      flush,
      retryPending,
      hydrateBackup,
      getState:() => clone(state),
      status:() => clone(status),
      subscribe(listener) {
        if (typeof listener !== 'function') throw new Error('状态订阅者必须是函数');
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      historyFor,
      restoreVersion,
      listRecoveryPoints,
      restoreRecoveryPoint,
      exportEmergencyBackup,
      createBackup,
      diagnostics,
    };
  }

  return {
    SCHEMA_VERSION,
    DEFAULT_RECOVERY_POINT_LIMIT,
    sha256,
    verifyBackup,
    createWorkspace,
  };
});
