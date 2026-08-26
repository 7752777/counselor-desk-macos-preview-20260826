const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const { createWorkspacePersistence } = require('../src/core/v8-persistence-protocol.js');

const digest = async bytes => {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

function makeAdapter() {
  const records = new Map();
  const failures = { list: null, put: null, delete: null };
  const operations = [];
  return {
    records,
    failures,
    operations,
    async list() {
      operations.push({ type: 'list' });
      if (failures.list && failures.list()) throw new Error('injected list failure');
      return Array.from(records.values()).map(record => JSON.parse(JSON.stringify(record)));
    },
    async put(record) {
      operations.push({ type: 'put', id: record.id, kind: record.kind, generation: record.generation });
      if (failures.put && failures.put(record)) throw new Error('injected put failure');
      records.set(record.id, JSON.parse(JSON.stringify(record)));
    },
    async delete(id) {
      operations.push({ type: 'delete', id });
      if (failures.delete && failures.delete(id)) throw new Error('injected delete failure');
      records.delete(id);
    },
  };
}

function envelope(title, id = title) {
  return {
    schemaVersion: 8,
    revision: Number(id.replace(/\D/g, '')) || 1,
    data: { settings: { title }, students: [{ id, full_name: title }] },
  };
}

async function run() {
  const adapter = makeAdapter();
  let nowTick = 0;
  const persistence = createWorkspacePersistence({
    adapter,
    digest,
    chunkBytes: 12,
    maxGenerations: 3,
    now: () => `2026-08-13T00:00:0${++nowTick}.000Z`,
  });

  const first = await persistence.commit(envelope('first', 'student-1'));
  assert.equal(first.reused, false);
  assert.equal(first.descriptor.chunkCount > 1, true, 'large envelopes are split into chunks');
  const firstPointerWrite = adapter.operations.findIndex(operation => operation.type === 'put' && operation.id === 'workspace_v8_active');
  const finalFirstChunkWrite = adapter.operations.reduce((latest, operation, index) => (
    operation.type === 'put' && operation.kind === 'workspace_v8_chunk' ? index : latest
  ), -1);
  assert.equal(finalFirstChunkWrite < firstPointerWrite, true, 'all immutable chunks are written before the pointer');
  const firstPointer = adapter.records.get('workspace_v8_active');
  assert.equal(firstPointer.active.generation, first.descriptor.generation);
  for (const record of adapter.records.values()) {
    assert.doesNotThrow(() => JSON.stringify(record), 'adapter records remain JSON-safe');
  }

  let persistenceYields = 0;
  const yieldingAdapter = makeAdapter();
  const yieldingPersistence = createWorkspacePersistence({
    adapter: yieldingAdapter,
    digest,
    chunkBytes: 96 * 1024,
    yield: async () => { persistenceYields += 1; },
    yieldIntervalMs: 0,
  });
  const yieldingEnvelope = {
    schemaVersion: 8,
    revision: 99,
    data: {
      settings: { title: 'yielding' },
      students: Array.from({ length: 1200 }, (_, index) => ({ id: `yielding-${index}`, full_name: `yielding student ${index}` })),
    },
  };
  await yieldingPersistence.commit(yieldingEnvelope);
  assert.ok(persistenceYields > 0, 'large canonical persistence cooperatively yields while retaining every serialized record');
  assert.equal((await yieldingPersistence.read()).envelope.data.students.length, 1200, 'yielding persistence keeps its canonical round-trip intact');

  const second = await persistence.commit(envelope('second', 'student-2'));
  assert.equal(second.reused, false);
  assert.equal(adapter.records.get('workspace_v8_active').previous[0].generation, first.descriptor.generation);
  const retry = await persistence.commit(envelope('second', 'student-2'));
  assert.equal(retry.reused, true, 'retrying the active envelope does not create a generation');
  assert.equal(retry.descriptor.generation, second.descriptor.generation);
  assert.equal(
    Array.from(adapter.records.values()).filter(record => record.kind === 'workspace_v8_chunk').length,
    second.descriptor.chunkCount + first.descriptor.chunkCount,
  );

  const readActive = await persistence.read();
  assert.equal(readActive.recovered, false);
  assert.equal(readActive.envelope.data.settings.title, 'second');

  const oldPointer = JSON.parse(JSON.stringify(adapter.records.get('workspace_v8_active')));
  let failedChunk = false;
  adapter.failures.put = record => {
    if (record.kind === 'workspace_v8_chunk' && record.generation !== second.descriptor.generation) {
      failedChunk = true;
      return true;
    }
    return false;
  };
  await assert.rejects(() => persistence.commit(envelope('third', 'student-3')), /injected put failure/);
  assert.equal(failedChunk, true);
  assert.deepEqual(adapter.records.get('workspace_v8_active'), oldPointer, 'failed chunk writes cannot replace the pointer');
  assert.equal((await persistence.read()).envelope.data.settings.title, 'second');
  adapter.failures.put = null;

  const pointerBeforeFailure = JSON.parse(JSON.stringify(adapter.records.get('workspace_v8_active')));
  adapter.failures.put = record => record.id === 'workspace_v8_active';
  await assert.rejects(() => persistence.commit(envelope('third', 'student-3')), /injected put failure/);
  assert.deepEqual(adapter.records.get('workspace_v8_active'), pointerBeforeFailure, 'failed pointer writes preserve the previous pointer');
  adapter.failures.put = null;

  const third = await persistence.commit(envelope('third', 'student-3'));
  const activePointer = adapter.records.get('workspace_v8_active');
  const activeChunk = adapter.records.get(`workspace_v8_chunk:${activePointer.active.generation}:0`);
  activeChunk.value = activeChunk.value.slice(0, -1) + (activeChunk.value.endsWith('A') ? 'B' : 'A');
  adapter.records.set(activeChunk.id, activeChunk);
  const recovered = await persistence.read();
  assert.equal(recovered.recovered, true, 'a corrupt active generation falls back to a prior generation');
  assert.equal(recovered.envelope.data.settings.title, 'second');

  const missingChunk = adapter.records.get(`workspace_v8_chunk:${activePointer.active.generation}:1`);
  adapter.records.delete(missingChunk.id);
  const recoveredMissing = await persistence.read();
  assert.equal(recoveredMissing.recovered, true, 'a missing active chunk also falls back');
  assert.equal(recoveredMissing.envelope.data.settings.title, 'second');

  adapter.failures.delete = id => id.startsWith('workspace_v8_chunk:') && id.includes(first.descriptor.generation);
  const cleanupResult = await persistence.commit(envelope('fourth', 'student-4'));
  assert.equal(cleanupResult.committed, true, 'cleanup failure does not fail a committed envelope');
  assert.equal(cleanupResult.cleanupErrors.length > 0, true);
  adapter.failures.delete = null;

  const recordsBeforeCleanup = Array.from(adapter.records.values()).filter(record => record.kind === 'workspace_v8_chunk');
  assert.equal(recordsBeforeCleanup.some(record => record.generation === first.descriptor.generation), true, 'failed cleanup leaves old data recoverable');
  const fifth = await persistence.commit(envelope('fifth', 'student-5'));
  assert.equal(fifth.committed, true);
  const retained = new Set([adapter.records.get('workspace_v8_active').active.generation, ...adapter.records.get('workspace_v8_active').previous.map(item => item.generation)]);
  for (const record of adapter.records.values()) {
    if (record.kind === 'workspace_v8_chunk') assert.equal(retained.has(record.generation), true, 'cleanup retains active and prior generations only');
  }

  const outOfOrderAdapter = makeAdapter();
  const outOfOrder = createWorkspacePersistence({ adapter: outOfOrderAdapter, digest, chunkBytes: 10 });
  await outOfOrder.commit(envelope('base', 'student-base'));
  await outOfOrder.commit(envelope('next', 'student-next'));
  const chunks = Array.from(outOfOrderAdapter.records.values()).filter(record => record.kind === 'workspace_v8_chunk');
  const pointer = outOfOrderAdapter.records.get('workspace_v8_active');
  const target = chunks.filter(record => record.generation === pointer.active.generation).reverse();
  for (const record of target) outOfOrderAdapter.records.delete(record.id);
  for (const record of target) outOfOrderAdapter.records.set(record.id, record);
  const orderedRead = await outOfOrder.read();
  assert.equal(orderedRead.envelope.data.settings.title, 'next', 'chunk order is reconstructed by exact index');
  const malformedIdentity = outOfOrderAdapter.records.get(`workspace_v8_chunk:${pointer.active.generation}:0`);
  malformedIdentity.id = 'workspace_v8_chunk:wrong-generation:0';
  const identityRead = await outOfOrder.read();
  assert.equal(identityRead.recovered, true, 'a chunk with a mismatched record identity is rejected');
  assert.equal(identityRead.envelope.data.settings.title, 'base');

  await assert.rejects(
    () => persistence.commit({ schemaVersion: 7, data: {} }),
    /schema v8/,
    'only schema-v8 workspace envelopes are accepted',
  );
  await assert.rejects(
    () => persistence.commit({ schemaVersion: 8, data: { value: BigInt(1) } }),
    /JSON_UNSAFE/,
    'non-JSON values are rejected before any adapter write',
  );
  await assert.rejects(
    () => persistence.commit({ schemaVersion: 8, data: { value: new Date('2026-08-13T00:00:00.000Z') } }),
    /JSON_UNSAFE/,
    'objects that JSON would silently coerce are rejected before any adapter write',
  );

  const foreignDom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const foreignEnvelope = foreignDom.window.JSON.parse(JSON.stringify(envelope('foreign-realm', 'student-foreign')));
  const foreignResult = await persistence.commit(foreignEnvelope);
  assert.equal(foreignResult.committed, true, 'cross-realm ordinary JSON objects are persisted safely');
  assert.equal((await persistence.read()).envelope.data.settings.title, 'foreign-realm');
  foreignDom.window.close();

  const collisionAdapter = makeAdapter();
  const collisionOptions = { adapter: collisionAdapter, digest, chunkBytes: 10, now: () => 'same-millisecond' };
  const collisionFirst = await createWorkspacePersistence(collisionOptions).commit(envelope('collision-one', 'student-collision-1'));
  const collisionSecondPersistence = createWorkspacePersistence(collisionOptions);
  const collisionSecond = await collisionSecondPersistence.commit(envelope('collision-two', 'student-collision-2'));
  assert.notEqual(collisionSecond.descriptor.generation, collisionFirst.descriptor.generation, 'a restarted writer cannot overwrite an existing immutable generation');
  assert.equal((await collisionSecondPersistence.read()).envelope.data.settings.title, 'collision-two');

  const cleanupListAdapter = makeAdapter();
  let listCalls = 0;
  cleanupListAdapter.failures.list = () => ++listCalls === 2;
  const cleanupListPersistence = createWorkspacePersistence({ adapter: cleanupListAdapter, digest, chunkBytes: 10 });
  const cleanupListResult = await cleanupListPersistence.commit(envelope('list-cleanup', 'student-list-cleanup'));
  assert.equal(cleanupListResult.committed, true, 'a cleanup list failure does not negate a committed pointer');
  assert.equal(cleanupListResult.cleanupErrors.length, 1);
  cleanupListAdapter.failures.list = null;
  assert.equal((await cleanupListPersistence.read()).envelope.data.settings.title, 'list-cleanup');

  const corruptPointerAdapter = makeAdapter();
  const corruptPointerPersistence = createWorkspacePersistence({ adapter: corruptPointerAdapter, digest, chunkBytes: 10 });
  const corruptPointerFirst = await corruptPointerPersistence.commit(envelope('pointer-base', 'student-pointer-base'));
  const corruptPointer = corruptPointerAdapter.records.get('workspace_v8_active');
  corruptPointer.kind = 'malformed-pointer';
  corruptPointerAdapter.records.set(corruptPointer.id, corruptPointer);
  await corruptPointerPersistence.commit(envelope('pointer-repair', 'student-pointer-repair'));
  assert.equal(
    Array.from(corruptPointerAdapter.records.values()).some(record => record.kind === 'workspace_v8_chunk' && record.generation === corruptPointerFirst.descriptor.generation),
    true,
    'a repaired corrupt pointer retains unreferenced prior chunks for manual recovery',
  );

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  dom.window.eval(fs.readFileSync('src/core/v8-persistence-protocol.js', 'utf8'));
  assert.equal(typeof dom.window.CWBv8Persistence.createWorkspacePersistence, 'function', 'the UMD browser global is available');
  const browserAdapter = makeAdapter();
  const browserPersistence = dom.window.CWBv8Persistence.createWorkspacePersistence({
    adapter: browserAdapter,
    digest,
    chunkBytes: 700 * 1024,
    yield: async () => { browserYields += 1; },
    // The payload only contains one large scalar. Any yield comes from sliced
    // binary-to-base64 conversion rather than array traversal.
    yieldIntervalMs: 1000000000,
    yieldEvery: 1000000000,
  });
  let browserYields = 0;
  const browserEnvelope = dom.window.JSON.parse(JSON.stringify({
    schemaVersion: 8,
    revision: 100,
    data: { settings: { title:'browser', large_note:'x'.repeat(1024 * 1024) }, students: [] },
  }));
  await browserPersistence.commit(browserEnvelope);
  assert.equal((await browserPersistence.read()).envelope.data.settings.title, 'browser', 'the browser UMD path reads its committed envelope');
  assert.ok(browserYields > 0, 'browser base64 conversion yields between bounded slices');
  dom.window.close();

  console.log('PASS v8-persistence-protocol');
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
