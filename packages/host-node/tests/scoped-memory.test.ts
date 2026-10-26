import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryCasStore } from '../src/sqlite-cas.js';
import { createV10ScopedMemory, V10MemoryError, type V10MemoryScope } from '../src/scoped-memory.js';

const scope: V10MemoryScope = {
  deployedAppId: 'd1', tenantId: 't1', appId: 'a1',
  businessPackageId: 'b1', agentId: 'agent1', threadId: 'thread1',
};

test('T03a scoped Memory: tenant/thread isolation, CAS, detached values, bounded search and authorization', async () => {
  const store = new InMemoryCasStore();
  const memory = createV10ScopedMemory({ store, authorize: async ({ scope: s }) => s.tenantId === 't1', now: () => 100 });
  const initial = { nested: { x: 1 } };
  const provenance = { source: 'source', recordedBy: 'agent' };
  assert.deepEqual(await memory.put({ scope, key: 'one', value: initial, provenance, condition: { mustBeAbsent: true } }), { revision: 0 });
  initial.nested.x = 2;
  const read = await memory.get(scope, 'one');
  assert.equal((read!.value as { nested: { x: number } }).nested.x, 1);
  (read!.value as { nested: { x: number } }).nested.x = 3;
  assert.equal(((await memory.get(scope, 'one'))!.value as { nested: { x: number } }).nested.x, 1);
  assert.equal(await memory.get({ ...scope, threadId: 'thread2' }, 'one'), null);
  await assert.rejects(memory.get({ ...scope, tenantId: 't2' }, 'one'), (e: unknown) =>
    e instanceof V10MemoryError && e.code === 'MEMORY_SCOPE_DENIED');
  assert.equal((await memory.search(scope, 'o')).length, 1);
  await assert.rejects(memory.put({ scope, key: 'one', value: 3, provenance, condition: { mustMatchRevision: 9 } }), { code: 'HOST_CAS_CONFLICT' });
  await memory.delete(scope, 'one', 0);
  assert.equal(await memory.get(scope, 'one'), null);
});

test('T03a scoped Memory: fail closed on authorization/TTL/invalid CAS', async () => {
  const store = new InMemoryCasStore();
  assert.throws(() => createV10ScopedMemory({ store, authorize: undefined as never }), { code: 'MEMORY_AUTHORIZATION_REQUIRED' });
  const memory = createV10ScopedMemory({ store, authorize: () => true, now: () => 100 });
  await assert.rejects(memory.put({
    scope, key: 'x', value: 1, provenance: { source: 'src', recordedBy: 'agent' },
    expiresAtMs: 99, condition: { mustBeAbsent: true },
  }), { code: 'MEMORY_TTL_INVALID' });
  await assert.rejects(memory.put({
    scope, key: 'x', value: 1, provenance: { source: 'src', recordedBy: 'agent' },
    condition: {} as never,
  }), { code: 'MEMORY_CAS_REQUIRED' });
  await assert.rejects(memory.search(scope, '', 101), { code: 'MEMORY_SEARCH_INVALID' });
});
