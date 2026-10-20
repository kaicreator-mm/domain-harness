/** T04 — isolated Memory P/N and real physical SQLite CAS, no full version run. */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { InMemoryCasStore } from '../../../packages/domain-harness/src/host-v8/cas.js';
import { openSqliteCasStore } from '../../../packages/domain-harness/src/host-v8/sqlite-cas-store.js';
import { createV10ScopedMemory } from '../../../packages/domain-harness/src/host-v8/v010-scoped-memory.js';

const scope = {
  deployedAppId: 'deploy-a', tenantId: 'tenant-a', appId: 'app-a',
  businessPackageId: 'B:a', agentId: 'agent:1', threadId: 'thread:1',
};
const other = { ...scope, businessPackageId: 'B:b' };
const provenance = { source: 'user-approved', recordedBy: 'trusted-host' };
const code = (expected: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === expected;
const allow = () => true;

test('T04-P1: create/get/modify/delete all require real CAS revisions', async () => {
  const store = new InMemoryCasStore();
  const memory = createV10ScopedMemory({ store, authorize: allow, now: () => 10 });
  const created = await memory.put({ scope, key: 'quote:1', value: { amount: 3 },
    provenance, condition: { mustBeAbsent: true } });
  assert.equal(created.revision, 0);
  assert.deepEqual(await memory.get(scope, 'quote:1'), {
    value: { amount: 3 }, revision: 0, provenance, expiresAtMs: null,
  });
  await assert.rejects(memory.put({ scope, key: 'quote:1', value: { amount: 4 },
    provenance, condition: { mustMatchRevision: 1 } }), code('HOST_CAS_CONFLICT'));
  const updated = await memory.put({ scope, key: 'quote:1', value: { amount: 4 },
    provenance, condition: { mustMatchRevision: 0 } });
  assert.equal(updated.revision, 1);
  await assert.rejects(memory.delete(scope, 'quote:1', 0), code('HOST_CAS_CONFLICT'));
  await memory.delete(scope, 'quote:1', 1);
  assert.equal(await memory.get(scope, 'quote:1'), null);
  await store.close();
});

test('T04-P2/N1: two Businesses with identical logical keys remain physically disjoint', async () => {
  const store = new InMemoryCasStore();
  const memory = createV10ScopedMemory({ store, authorize: allow });
  await memory.put({ scope, key: 'same', value: 'B1', provenance, condition: { mustBeAbsent: true } });
  await memory.put({ scope: other, key: 'same', value: 'B2', provenance, condition: { mustBeAbsent: true } });
  assert.equal((await memory.get(scope, 'same'))?.value, 'B1');
  assert.equal((await memory.get(other, 'same'))?.value, 'B2');
  assert.equal((await memory.search(scope, 'sa')).length, 1);
  assert.equal((await memory.search(other, 'sa')).length, 1);
  await store.close();
});

test('T04-N2: authorization checks precede existence probes and mutations', async () => {
  const store = new InMemoryCasStore();
  const visited: string[] = [];
  const memory = createV10ScopedMemory({ store, authorize: ({ operation, scope: target, key }) => {
    visited.push(operation + ':' + key);
    return target.tenantId === scope.tenantId && target.businessPackageId === scope.businessPackageId
      && key !== 'secret';
  } });
  await memory.put({ scope, key: 'visible', value: 5, provenance, condition: { mustBeAbsent: true } });
  await assert.rejects(memory.get(other, 'visible'), code('MEMORY_SCOPE_DENIED'));
  await assert.rejects(memory.search(other), code('MEMORY_SCOPE_DENIED'));
  await assert.rejects(memory.delete(other, 'visible', 0), code('MEMORY_SCOPE_DENIED'));
  await assert.rejects(memory.put({ scope: other, key: 'new', value: 1,
    provenance, condition: { mustBeAbsent: true } }), code('MEMORY_SCOPE_DENIED'));
  assert.deepEqual((await memory.search(scope)).map(v => v.key), ['visible']);
  await assert.rejects(memory.get(scope, 'secret'), code('MEMORY_SCOPE_DENIED'));
  assert.ok(visited.length >= 6);
  assert.equal((await store.list('v010:memory:')).length, 1, 'denied operations wrote zero docs');
  await store.close();
});

test('T04-P3/N3: controlled TTL hides expired values in get and search', async () => {
  const store = new InMemoryCasStore();
  let tick = 10;
  const memory = createV10ScopedMemory({ store, authorize: allow, now: () => tick });
  await memory.put({ scope, key: 'fresh', value: { x: 1 }, provenance,
    expiresAtMs: 20, condition: { mustBeAbsent: true } });
  assert.equal((await memory.search(scope)).length, 1);
  tick = 20;
  assert.equal(await memory.get(scope, 'fresh'), null);
  assert.deepEqual(await memory.search(scope), []);
  await assert.rejects(memory.put({ scope, key: 'bad', value: {}, provenance,
    expiresAtMs: 20, condition: { mustBeAbsent: true } }), code('MEMORY_TTL_INVALID'));
  await store.close();
});

test('T04-I1218-P: expired key can be recreated with increasing revision; live key refuses create', async () => {
  const store = new InMemoryCasStore();
  let tick = 10;
  const memory = createV10ScopedMemory({ store, authorize: allow, now: () => tick });
  const first = await memory.put({ scope, key: 'ephemeral', value: 1, provenance,
    expiresAtMs: 20, condition: { mustBeAbsent: true } });
  assert.equal(first.revision, 0);
  await assert.rejects(memory.put({ scope, key: 'ephemeral', value: 2, provenance,
    condition: { mustBeAbsent: true } }), code('HOST_KEY_EXISTS'));
  tick = 20;
  assert.equal(await memory.get(scope, 'ephemeral'), null);
  const second = await memory.put({ scope, key: 'ephemeral', value: 3, provenance,
    condition: { mustBeAbsent: true } });
  assert.equal(second.revision, 1);
  assert.equal((await memory.get(scope, 'ephemeral'))?.value, 3);
  await assert.rejects(memory.put({ scope, key: 'ephemeral', value: 4, provenance,
    condition: { mustBeAbsent: true } }), code('HOST_KEY_EXISTS'));
  await store.close();
});

test('T04-I1218-N: competing expired-key creators perform single winning CAS', async () => {
  const store = new InMemoryCasStore();
  let tick = 10;
  const a = createV10ScopedMemory({ store, authorize: allow, now: () => tick });
  const b = createV10ScopedMemory({ store, authorize: allow, now: () => tick });
  await a.put({ scope, key: 'race', value: 'old', provenance,
    expiresAtMs: 20, condition: { mustBeAbsent: true } });
  tick = 20;
  const results = await Promise.allSettled([
    a.put({ scope, key: 'race', value: 'A', provenance, condition: { mustBeAbsent: true } }),
    b.put({ scope, key: 'race', value: 'B', provenance, condition: { mustBeAbsent: true } }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const failure = results.find(result => result.status === 'rejected');
  assert.ok(failure && failure.status === 'rejected');
  assert.equal((failure.reason as { code?: string }).code, 'HOST_CAS_CONFLICT');
  assert.equal((await a.get(scope, 'race'))?.revision, 1);
  await store.close();
});

test('T04-N4: mandatory CAS, complete scope and Host gate reject malformed calls', async () => {
  assert.throws(() => createV10ScopedMemory({
    store: new InMemoryCasStore(), authorize: null as unknown as typeof allow,
  }), code('MEMORY_AUTHORIZATION_REQUIRED'));
  const store = new InMemoryCasStore();
  const memory = createV10ScopedMemory({ store, authorize: allow });
  await assert.rejects(memory.get({ ...scope, appId: '' }, 'k'), code('MEMORY_SCOPE_INVALID'));
  await assert.rejects(memory.put({ scope, key: 'k', value: 1, provenance,
    condition: {} }), code('MEMORY_CAS_REQUIRED'));
  await store.close();
});

test('T04-physical: file-backed SQLite persists after restart and enforces competing CAS', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh010-memory-'));
  const path = join(dir, 'memory.sqlite');
  try {
    const first = await openSqliteCasStore({ path });
    const a = createV10ScopedMemory({ store: first, authorize: allow });
    await a.put({ scope, key: 'durable', value: { item: 1 }, provenance,
      condition: { mustBeAbsent: true } });
    await first.close();

    const second = await openSqliteCasStore({ path });
    const third = await openSqliteCasStore({ path });
    try {
      const b = createV10ScopedMemory({ store: second, authorize: allow });
      const c = createV10ScopedMemory({ store: third, authorize: allow });
      assert.equal((await b.get(scope, 'durable'))?.revision, 0);
      const results = await Promise.allSettled([
        b.put({ scope, key: 'durable', value: { item: 2 }, provenance,
          condition: { mustMatchRevision: 0 } }),
        c.put({ scope, key: 'durable', value: { item: 3 }, provenance,
          condition: { mustMatchRevision: 0 } }),
      ]);
      assert.equal(results.filter(v => v.status === 'fulfilled').length, 1);
      assert.equal(results.filter(v => v.status === 'rejected').length, 1);
      assert.equal((await b.get(scope, 'durable'))?.revision, 1);
    } finally {
      await second.close();
      await third.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
