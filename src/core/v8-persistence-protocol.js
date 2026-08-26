/* Crash-safe, storage-agnostic persistence for schema-v8 workspace envelopes. */
(function attachV8Persistence(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CWBv8Persistence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createV8PersistenceApi(root) {
  'use strict';

  const PROTOCOL_VERSION = 1;
  const SCHEMA_VERSION = 8;
  const POINTER_ID = 'workspace_v8_active';
  const POINTER_KIND = 'workspace_v8_pointer';
  const CHUNK_KIND = 'workspace_v8_chunk';
  const DEFAULT_CHUNK_BYTES = 700 * 1024;
  const DEFAULT_MAX_GENERATIONS = 3;
  const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

  function makeError(code, message) {
    const error = new Error(`${code}: ${message}`);
    error.code = code;
    return error;
  }

  function assertSafeKey(key) {
    if (DANGEROUS_KEYS.has(String(key))) throw makeError('WORKSPACE_PERSISTENCE_JSON_UNSAFE', 'unsafe object key');
  }

  function stableStringify(value, stack, path) {
    const location = path || '$';
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw makeError('WORKSPACE_PERSISTENCE_JSON_UNSAFE', 'non-finite number is not JSON-safe');
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    }
    if (typeof value !== 'object') throw makeError('WORKSPACE_PERSISTENCE_JSON_UNSAFE', `${typeof value} is not JSON-safe`);
    const seen = stack || new Set();
    if (seen.has(value)) throw makeError('WORKSPACE_PERSISTENCE_JSON_UNSAFE', 'cyclic value is not JSON-safe');
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      result = `[${value.map((entry, index) => stableStringify(entry, seen, `${location}[${index}]`)).join(',')}]`;
    } else {
      const prototype = Object.getPrototypeOf(value);
      const plainObject = prototype === null
        || prototype === Object.prototype
        || Boolean(prototype && prototype.constructor && prototype.constructor.name === 'Object');
      if (!plainObject) {
        seen.delete(value);
        const kind = Object.prototype.toString.call(value);
        const name = prototype && prototype.constructor && prototype.constructor.name || 'unknown';
        throw makeError('WORKSPACE_PERSISTENCE_JSON_UNSAFE', `non-plain object ${kind}/${name} at ${location}`);
      }
      const keys = Object.keys(value).sort();
      result = `{${keys.map(key => {
        assertSafeKey(key);
        return `${JSON.stringify(key)}:${stableStringify(value[key], seen, `${location}.${key}`)}`;
      }).join(',')}}`;
    }
    seen.delete(value);
    return result;
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
      checkpoint(force) {
        if (!enabled) return null;
        steps += 1;
        if (!force && steps < every && schedulerNow() - lastYield < interval) return null;
        steps = 0;
        return Promise.resolve().then(() => yieldToHost()).then(() => { lastYield = schedulerNow(); });
      },
    };
  }

  async function stableStringifyCooperatively(value, scheduler, stack, path) {
    const location = path || '$';
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw makeError('WORKSPACE_PERSISTENCE_JSON_UNSAFE', 'non-finite number is not JSON-safe');
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    }
    if (typeof value !== 'object') throw makeError('WORKSPACE_PERSISTENCE_JSON_UNSAFE', `${typeof value} is not JSON-safe`);
    const seen = stack || new Set();
    if (seen.has(value)) throw makeError('WORKSPACE_PERSISTENCE_JSON_UNSAFE', 'cyclic value is not JSON-safe');
    seen.add(value);
    let result;
    if (Array.isArray(value)) {
      const entries = [];
      for (let index = 0; index < value.length; index += 1) {
        entries.push(await stableStringifyCooperatively(value[index], scheduler, seen, `${location}[${index}]`));
        const pending = scheduler && scheduler.checkpoint();
        if (pending) await pending;
      }
      result = `[${entries.join(',')}]`;
    } else {
      const prototype = Object.getPrototypeOf(value);
      const plainObject = prototype === null
        || prototype === Object.prototype
        || Boolean(prototype && prototype.constructor && prototype.constructor.name === 'Object');
      if (!plainObject) {
        seen.delete(value);
        const kind = Object.prototype.toString.call(value);
        const name = prototype && prototype.constructor && prototype.constructor.name || 'unknown';
        throw makeError('WORKSPACE_PERSISTENCE_JSON_UNSAFE', `non-plain object ${kind}/${name} at ${location}`);
      }
      const entries = [];
      for (const key of Object.keys(value).sort()) {
        assertSafeKey(key);
        entries.push(`${JSON.stringify(key)}:${await stableStringifyCooperatively(value[key], scheduler, seen, `${location}.${key}`)}`);
        const pending = scheduler && scheduler.checkpoint();
        if (pending) await pending;
      }
      result = `{${entries.join(',')}}`;
    }
    seen.delete(value);
    return result;
  }

  function utf8Encode(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text);
    if (root && typeof root.TextEncoder === 'function') return new root.TextEncoder().encode(text);
    const bytes = [];
    for (let index = 0; index < text.length; index += 1) {
      let code = text.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
        const next = text.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          code = 0x10000 + ((code - 0xd800) << 10) + next - 0xdc00;
          index += 1;
        }
      }
      if (code < 0x80) bytes.push(code);
      else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
    return Uint8Array.from(bytes);
  }

  async function utf8EncodeCooperatively(text, scheduler) {
    if (!scheduler || !text.length) return utf8Encode(text);
    const parts = [];
    let byteLength = 0;
    for (let start = 0; start < text.length;) {
      let end = Math.min(text.length, start + 96 * 1024);
      // Keep Unicode surrogate pairs within one independently encoded slice.
      if (end < text.length && /[\ud800-\udbff]/.test(text.charAt(end - 1)) && /[\udc00-\udfff]/.test(text.charAt(end))) end -= 1;
      if (end <= start) end = Math.min(text.length, start + 2);
      const bytes = utf8Encode(text.slice(start, end));
      parts.push(bytes);
      byteLength += bytes.byteLength;
      start = end;
      const pending = scheduler.checkpoint(true);
      if (pending) await pending;
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    return bytes;
  }

  function utf8Decode(bytes) {
    const Decoder = typeof TextDecoder === 'function' ? TextDecoder : (root && root.TextDecoder);
    if (Decoder) {
      try { return new Decoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'invalid UTF-8 payload'); }
    }
    let result = '';
    for (let index = 0; index < bytes.length;) {
      const first = bytes[index++];
      if (first < 0x80) result += String.fromCharCode(first);
      else if (first >= 0xc0 && first < 0xe0 && index < bytes.length) {
        const second = bytes[index++];
        if ((second & 0xc0) !== 0x80) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'invalid UTF-8 payload');
        result += String.fromCharCode(((first & 0x1f) << 6) | (second & 0x3f));
      } else if (first >= 0xe0 && first < 0xf0 && index + 1 < bytes.length) {
        const second = bytes[index++];
        const third = bytes[index++];
        if ((second & 0xc0) !== 0x80 || (third & 0xc0) !== 0x80) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'invalid UTF-8 payload');
        result += String.fromCharCode(((first & 0x0f) << 12) | ((second & 0x3f) << 6) | (third & 0x3f));
      } else if (first >= 0xf0 && first < 0xf8 && index + 2 < bytes.length) {
        const second = bytes[index++];
        const third = bytes[index++];
        const fourth = bytes[index++];
        if ((second & 0xc0) !== 0x80 || (third & 0xc0) !== 0x80 || (fourth & 0xc0) !== 0x80) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'invalid UTF-8 payload');
        const code = ((first & 7) << 18) | ((second & 0x3f) << 12) | ((third & 0x3f) << 6) | (fourth & 0x3f);
        result += String.fromCodePoint(code);
      } else throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'invalid UTF-8 payload');
    }
    return result;
  }

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView && ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw makeError('WORKSPACE_PERSISTENCE_DIGEST_INVALID', 'digest must return bytes or a string');
  }

  function hex(bytes) {
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  }

  function fallbackDigest(bytes) {
    // FNV-1a is only a no-crypto fallback; adapters should inject SHA-256 where available.
    let hash = 2166136261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    return hash.toString(16).padStart(8, '0');
  }

  async function defaultDigest(bytes) {
    const crypto = root && root.crypto;
    if (crypto && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      const result = await crypto.subtle.digest('SHA-256', bytes);
      return hex(new Uint8Array(result));
    }
    return fallbackDigest(bytes);
  }

  async function normalizeDigest(result) {
    const value = await result;
    if (typeof value === 'string') {
      if (!/^[0-9a-f]+$/i.test(value)) throw makeError('WORKSPACE_PERSISTENCE_DIGEST_INVALID', 'digest string is not hexadecimal');
      return value.toLowerCase();
    }
    return hex(toBytes(value));
  }

  function base64Encode(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    const binary = Array.from(bytes, value => String.fromCharCode(value)).join('');
    if (root && typeof root.btoa === 'function') return root.btoa(binary);
    throw makeError('WORKSPACE_PERSISTENCE_ENCODING_UNAVAILABLE', 'base64 encoder unavailable');
  }

  async function base64EncodeCooperatively(bytes, scheduler) {
    if (typeof Buffer !== 'undefined') return base64Encode(bytes);
    if (!root || typeof root.btoa !== 'function') throw makeError('WORKSPACE_PERSISTENCE_ENCODING_UNAVAILABLE', 'base64 encoder unavailable');
    // Encode byte-aligned blocks independently. Keeping every block length divisible
    // by three makes concatenation byte-for-byte equivalent to one btoa() call.
    const sliceBytes = 48 * 1024;
    const encoded = [];
    for (let start = 0; start < bytes.length; start += sliceBytes) {
      const end = Math.min(bytes.length, start + sliceBytes);
      const characters = [];
      for (let offset = start; offset < end; offset += 8192) {
        characters.push(String.fromCharCode.apply(null, bytes.subarray(offset, Math.min(end, offset + 8192))));
      }
      encoded.push(root.btoa(characters.join('')));
      const pending = scheduler && scheduler.checkpoint(true);
      if (pending) await pending;
    }
    return encoded.join('');
  }

  function base64Decode(value) {
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
      throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'invalid base64 chunk');
    }
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(value, 'base64'));
    if (root && typeof root.atob === 'function') {
      const binary = root.atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return bytes;
    }
    throw makeError('WORKSPACE_PERSISTENCE_ENCODING_UNAVAILABLE', 'base64 decoder unavailable');
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function validateEnvelope(envelope, scheduler) {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) throw makeError('WORKSPACE_PERSISTENCE_ENVELOPE_INVALID', 'envelope must be an object');
    if (Number(envelope.schemaVersion) !== SCHEMA_VERSION) throw makeError('WORKSPACE_PERSISTENCE_SCHEMA_UNSUPPORTED', 'schema v8 envelope required');
    if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) throw makeError('WORKSPACE_PERSISTENCE_ENVELOPE_INVALID', 'envelope data must be an object');
    const serialized = scheduler ? await stableStringifyCooperatively(envelope, scheduler) : stableStringify(envelope);
    return { envelope: JSON.parse(serialized), serialized, bytes:await utf8EncodeCooperatively(serialized, scheduler) };
  }

  function validateAdapter(adapter) {
    if (!adapter || typeof adapter.list !== 'function' || typeof adapter.put !== 'function' || typeof adapter.delete !== 'function') {
      throw new TypeError('workspace persistence adapter requires list, put, and delete');
    }
  }

  function descriptorKey(descriptor) {
    return `${descriptor.generation}:${descriptor.checksum}:${descriptor.byteLength}:${descriptor.chunkCount}`;
  }

  function validateDescriptor(descriptor) {
    if (!descriptor || typeof descriptor !== 'object') throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'missing generation descriptor');
    if (descriptor.protocolVersion !== PROTOCOL_VERSION || typeof descriptor.generation !== 'string' || !descriptor.generation) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'invalid generation descriptor');
    if (!Number.isInteger(descriptor.chunkCount) || descriptor.chunkCount < 1 || !Number.isInteger(descriptor.byteLength) || descriptor.byteLength < 1 || typeof descriptor.checksum !== 'string' || !descriptor.checksum) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'invalid generation dimensions');
  }

  function pointerIsValid(pointer) {
    if (!pointer || pointer.id !== POINTER_ID || pointer.kind !== POINTER_KIND || pointer.protocolVersion !== PROTOCOL_VERSION || !pointer.active) return false;
    if (!Array.isArray(pointer.previous) || pointer.previous.length > 2) return false;
    try {
      validateDescriptor(pointer.active);
      pointer.previous.forEach(validateDescriptor);
      const generations = [pointer.active.generation, ...pointer.previous.map(item => item.generation)];
      return new Set(generations).size === generations.length;
    } catch (_) { return false; }
  }

  function generationId(nowValue, serial) {
    const text = nowValue instanceof Date ? nowValue.toISOString() : String(nowValue == null ? Date.now() : nowValue);
    const encoded = text.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80) || 'now';
    return `g_${encoded}_${serial.toString(36)}`;
  }

  function createWorkspacePersistence(options) {
    const config = options || {};
    const adapter = config.adapter;
    validateAdapter(adapter);
    const digest = typeof config.digest === 'function' ? config.digest : defaultDigest;
    const chunkBytes = Math.max(1, Math.floor(Number(config.chunkBytes || DEFAULT_CHUNK_BYTES)));
    const maxGenerations = Math.max(1, Math.min(3, Math.floor(Number(config.maxGenerations || DEFAULT_MAX_GENERATIONS))));
    const now = typeof config.now === 'function' ? config.now : () => new Date().toISOString();
    const cooperativeScheduler = createCooperativeScheduler(config);
    let serial = 0;
    let queue = Promise.resolve();

    async function records() {
      const listed = await adapter.list();
      if (!Array.isArray(listed)) throw makeError('WORKSPACE_PERSISTENCE_ADAPTER_INVALID', 'adapter.list() must return an array');
      return listed;
    }

    async function descriptorPayload(descriptor, listed) {
      validateDescriptor(descriptor);
      const generationChunks = listed.filter(record => record && record.kind === CHUNK_KIND && record.generation === descriptor.generation);
      if (generationChunks.length !== descriptor.chunkCount) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'chunk count mismatch');
      const ordered = new Array(descriptor.chunkCount);
      for (const chunk of generationChunks) {
        if (chunk.id !== `workspace_v8_chunk:${descriptor.generation}:${chunk.index}` || chunk.protocolVersion !== PROTOCOL_VERSION || chunk.chunkCount !== descriptor.chunkCount || !Number.isInteger(chunk.index) || chunk.index < 0 || chunk.index >= descriptor.chunkCount || typeof chunk.value !== 'string' || chunk.encoding !== 'base64') throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'chunk index or generation mismatch');
        if (ordered[chunk.index]) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'duplicate chunk index');
        ordered[chunk.index] = chunk;
      }
      if (ordered.some(chunk => !chunk)) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'missing chunk index');
      const byteArrays = ordered.map(chunk => base64Decode(chunk.value));
      const bytes = new Uint8Array(byteArrays.reduce((total, value) => total + value.byteLength, 0));
      let offset = 0;
      for (const value of byteArrays) { bytes.set(value, offset); offset += value.byteLength; }
      if (bytes.byteLength !== descriptor.byteLength) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'payload byte length mismatch');
      const checksum = await normalizeDigest(digest(bytes));
      if (checksum !== descriptor.checksum) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'payload checksum mismatch');
      let envelope;
      try { envelope = JSON.parse(utf8Decode(bytes)); } catch (error) { throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', `payload JSON invalid: ${error.message}`); }
      const normalized = await validateEnvelope(envelope, cooperativeScheduler);
      if (normalized.serialized !== utf8Decode(bytes)) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'payload canonical form mismatch');
      return { envelope: normalized.envelope, descriptor };
    }

    async function readInternal() {
      const listed = await records();
      const pointer = listed.find(record => record && record.id === POINTER_ID);
      if (!pointer) return { envelope: null, recovered: false, empty: true, pointer: null };
      if (!pointerIsValid(pointer)) throw makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'active pointer is invalid');
      const candidates = [pointer.active, ...pointer.previous];
      const failures = [];
      for (let index = 0; index < candidates.length; index += 1) {
        try {
          const valid = await descriptorPayload(candidates[index], listed);
          return { envelope: valid.envelope, recovered: index > 0, descriptor: valid.descriptor, pointer, failures };
        } catch (error) {
          failures.push({ generation: candidates[index].generation, code: error.code || 'WORKSPACE_PERSISTENCE_CORRUPT', message: error.message });
        }
      }
      const error = makeError('WORKSPACE_PERSISTENCE_CORRUPT', 'no verified workspace generation is available');
      error.failures = failures;
      throw error;
    }

    async function cleanup(listed, pointer) {
      const retained = new Set([pointer.active.generation, ...pointer.previous.map(item => item.generation)]);
      const cleanupErrors = [];
      for (const record of listed) {
        if (!record || record.kind !== CHUNK_KIND || retained.has(record.generation)) continue;
        try { await adapter.delete(record.id); } catch (error) { cleanupErrors.push({ id: record.id, message: error.message }); }
      }
      return cleanupErrors;
    }

    async function commitInternal(inputEnvelope) {
      const normalized = await validateEnvelope(inputEnvelope, cooperativeScheduler);
      const checksum = await normalizeDigest(digest(normalized.bytes));
      const listedBefore = await records();
      const existingPointer = listedBefore.find(record => record && record.id === POINTER_ID);
      const existingPointerValid = pointerIsValid(existingPointer);
      if (existingPointerValid) {
        try {
          const active = await descriptorPayload(existingPointer.active, listedBefore);
          if (active.descriptor.checksum === checksum && active.descriptor.byteLength === normalized.bytes.byteLength && active.envelope.schemaVersion === normalized.envelope.schemaVersion && await stableStringifyCooperatively(active.envelope, cooperativeScheduler) === normalized.serialized) {
            return { committed: true, reused: true, descriptor: active.descriptor, cleanupErrors: [] };
          }
        } catch (_) {
          // A corrupt active generation is replaced by a fresh immutable generation.
        }
      }
      const knownGenerations = new Set(listedBefore
        .filter(record => record && typeof record.generation === 'string')
        .map(record => record.generation));
      let generation;
      do {
        generation = generationId(now(), ++serial);
      } while (knownGenerations.has(generation));
      const chunkCount = Math.max(1, Math.ceil(normalized.bytes.byteLength / chunkBytes));
      const descriptor = {
        protocolVersion: PROTOCOL_VERSION,
        generation,
        chunkCount,
        byteLength: normalized.bytes.byteLength,
        checksum,
        schemaVersion: SCHEMA_VERSION,
        createdAt: String(now()),
      };
      const chunks = [];
      try {
        for (let index = 0; index < chunkCount; index += 1) {
          const start = index * chunkBytes;
          const value = await base64EncodeCooperatively(
            normalized.bytes.slice(start, Math.min(normalized.bytes.byteLength, start + chunkBytes)),
            cooperativeScheduler,
          );
          const chunk = { id: `workspace_v8_chunk:${generation}:${index}`, kind: CHUNK_KIND, protocolVersion: PROTOCOL_VERSION, generation, index, chunkCount, encoding: 'base64', value };
          chunks.push(chunk);
          await adapter.put(chunk);
          const pending = cooperativeScheduler.checkpoint();
          if (pending) await pending;
        }
      } catch (error) {
        for (const chunk of chunks) {
          try { await adapter.delete(chunk.id); } catch (_) { /* best effort */ }
        }
        throw error;
      }
      const previous = existingPointer && existingPointerValid
        ? [existingPointer.active, ...existingPointer.previous].slice(0, maxGenerations - 1)
        : [];
      const pointer = { id: POINTER_ID, kind: POINTER_KIND, protocolVersion: PROTOCOL_VERSION, schemaVersion: SCHEMA_VERSION, active: descriptor, previous };
      await adapter.put(pointer);
      let cleanupErrors = [];
      if (existingPointerValid || !existingPointer) {
        try {
          cleanupErrors = await cleanup(await records(), pointer);
        } catch (error) {
          cleanupErrors = [{ id: null, message: error.message }];
        }
      }
      return { committed: true, reused: false, descriptor, pointer, cleanupErrors };
    }

    function commit(inputEnvelope) {
      const run = queue.then(() => commitInternal(inputEnvelope));
      queue = run.catch(() => undefined);
      return run;
    }

    return Object.freeze({ commit, read: () => queue.then(readInternal), constants: Object.freeze({ PROTOCOL_VERSION, SCHEMA_VERSION, POINTER_ID, CHUNK_KIND }) });
  }

  return { PROTOCOL_VERSION, SCHEMA_VERSION, createWorkspacePersistence };
});
