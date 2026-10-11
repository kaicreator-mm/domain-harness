/**
 * V08-ABI-C01 — physical CAS Host face (T-E, #1004).
 * ====================================================
 *
 * The Host-side half of C01: the physical document store is a TRUE
 * revision-compare-and-swap store — in-process here, cross-process in
 * v08-host-multiprocess.test.ts. K-owned Effect/Journal semantics are NOT
 * implemented; what is proven is exactly the Host primitive the L2 pins:
 *
 *   - C01-N10: a lost/undefined revision expectation is a typed refusal,
 *     never an unconditional put (both stores; explicit-undefined and
 *     missing-condition and ambiguous forms).
 *   - C01-N2 (in-process face): N concurrent writers racing the SAME
 *     revision — exactly one wins, the rest conflict, no false ACK.
 *   - C01-N9 (in-process face): two trusted workers read R, both attempt
 *     the terminal write — first terminal revision wins, the loser's typed
 *     conflict forces a re-read that observes the winner's value; the
 *     winner's value is never overwritten.
 *   - C01-N7: bootstrap refuses non-CAS storage typed (covered at the
 *     bootstrap seam in v08-host-b01.test.ts N8(pre)); here the probe
 *     itself is exercised directly, including a wrong-resulting probe.
 *   - KPK-06 port: physical fault injection at the durable write — typed
 *     HOST_FAULT_INJECTED, no revision bump, no half write, no false ACK,
 *     and the store keeps working after the fault.
 *   - KPK-07 port (durable, bounded): file+SQLite restart recovery — a
 *     brand-new store object over the SAME database file recovers exact
 *     {value, revision} for every document. (Real crash-mid-write and
 *     power-loss remain explicitly out of scope, as in #994.)
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  HostBoundaryError,
  InMemoryCasStore,
  openSqliteCasStore,
  probeTrueCasStore,
  SqliteCasStore,
  type CasDocumentStore,
  type CasGetResult,
  type CasPutConditions,
} from '../../src/host-v8/index.js';

function expectCode(error: unknown, code: string): boolean {
  assert.ok(error instanceof HostBoundaryError, `expected HostBoundaryError(${code}), got ${String(error)}`);
  assert.equal((error as HostBoundaryError).code, code);
  return true;
}

/** Windows-robust recursive removal: child-process handle release can lag process exit by a moment (EBUSY). */
async function rmWithRetries(dir: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM') && attempt < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
}

const stores: { name: string; make: () => Promise<CasDocumentStore> }[] = [
  { name: 'memory', make: async () => new InMemoryCasStore() },
  {
    name: 'sqlite',
    make: async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'v08-host-c01-'));
      return openSqliteCasStore({ path: path.join(dir, 'cas.db') });
    },
  },
];

for (const suite of stores) {
  test(`C01-N10 [${suite.name}] a lost/undefined revision expectation never becomes an unconditional put`, async () => {
    const store = await suite.make();
    try {
      await store.put('c01n10', { v: 1 }, { mustBeAbsent: true });
      // Missing conditions entirely.
      await assert.rejects(
        () => store.put('c01n10', { v: 'stomp' }, undefined as never),
        (error: unknown) => expectCode(error, 'HOST_PUT_CONDITION_REQUIRED'),
      );
      // The #994 degradation vector: an explicitly undefined mustMatchRevision
      // (a lost get() revision on an absent doc) must refuse, not create.
      await assert.rejects(
        () => store.put('c01n10:lost', { v: 'lost' }, { mustMatchRevision: undefined } as unknown as CasPutConditions),
        (error: unknown) => expectCode(error, 'HOST_PUT_CONDITION_REQUIRED'),
      );
      // …and on an EXISTING doc it must refuse, not overwrite.
      await assert.rejects(
        () => store.put('c01n10', { v: 'stomp' }, { mustMatchRevision: undefined } as unknown as CasPutConditions),
        (error: unknown) => expectCode(error, 'HOST_PUT_CONDITION_REQUIRED'),
      );
      // Ambiguous double condition.
      await assert.rejects(
        () => store.put('c01n10', { v: 'x' }, { mustBeAbsent: true, mustMatchRevision: 0 }),
        (error: unknown) => expectCode(error, 'HOST_PUT_CONDITION_AMBIGUOUS'),
      );
      // Malformed revision expectations.
      await assert.rejects(
        () => store.put('c01n10', { v: 'x' }, { mustMatchRevision: -1 }),
        (error: unknown) => expectCode(error, 'HOST_CAS_REVISION_MALFORMED'),
      );
      await assert.rejects(
        () => store.put('c01n10', { v: 'x' }, { mustMatchRevision: 1.5 }),
        (error: unknown) => expectCode(error, 'HOST_CAS_REVISION_MALFORMED'),
      );
      // Authority untouched by every refused write.
      const doc = await store.get('c01n10');
      assert.deepEqual(doc, { value: { v: 1 }, revision: 0 });
      assert.equal(await store.get('c01n10:lost'), null);
      // Unconditional deletes do not exist either.
      await assert.rejects(
        () => store.remove('c01n10', { mustBeAbsent: true }),
        (error: unknown) => expectCode(error, 'HOST_PUT_CONDITION_REQUIRED'),
      );
      await assert.rejects(
        () => store.remove('c01n10:absent', { mustMatchRevision: 0 }),
        (error: unknown) => expectCode(error, 'HOST_CAS_CONFLICT'),
      );
    } finally {
      await store.close();
    }
  });

  test(`C01-N2 [${suite.name}] sixteen concurrent writers on one revision: exactly one wins`, async () => {
    const store = await suite.make();
    try {
      const created = await store.put('c01n2', { winner: 'seed' }, { mustBeAbsent: true });
      assert.equal(created.revision, 0);
      const results = await Promise.allSettled(
        Array.from({ length: 16 }, (_, index) => store.put('c01n2', { winner: `w${String(index)}` }, { mustMatchRevision: 0 })),
      );
      const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ revision: number }>[];
      const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      assert.equal(fulfilled.length, 1, 'exactly one CAS winner per revision');
      assert.equal(rejected.length, 15);
      for (const rejection of rejected) {
        expectCode(rejection.reason, 'HOST_CAS_CONFLICT');
      }
      assert.equal(fulfilled[0]?.value.revision, 1);
      const doc = await store.get('c01n2');
      assert.equal(doc?.revision, 1, 'no lost update: the physical revision advanced exactly once');
      // No false ACK: the winner's stored value is exactly what it wrote.
      assert.ok((doc?.value as { winner: string }).winner.startsWith('w'));
    } finally {
      await store.close();
    }
  });

  test(`C01-N9 [${suite.name}] two trusted workers race the terminal write: first revision wins, loser re-reads`, async () => {
    const store = await suite.make();
    try {
      await store.put('c01n9', { terminal: null }, { mustBeAbsent: true });
      // Both workers observe the same current revision R (their "started"
      // snapshot), then both attempt the completion CAS.
      const snapshotA = await store.get('c01n9');
      const snapshotB = await store.get('c01n9');
      assert.equal(snapshotA?.revision, snapshotB?.revision);
      const attemptA = await store.put('c01n9', { terminal: 'worker-A' }, { mustMatchRevision: 0 });
      assert.equal(attemptA.revision, 1, 'the first terminal write wins');
      await assert.rejects(
        () => store.put('c01n9', { terminal: 'worker-B' }, { mustMatchRevision: 0 }),
        (error: unknown) => expectCode(error, 'HOST_CAS_CONFLICT'),
      );
      // Typed conflict forces the loser to re-read — and the re-read observes
      // the winner's value; the winner is never overwritten.
      const reRead = await store.get('c01n9');
      assert.deepEqual(reRead, { value: { terminal: 'worker-A' }, revision: 1 });
      // The loser retries on the fresh revision and only then advances.
      const loserRetry = await store.put('c01n9', { terminal: 'worker-B' }, { mustMatchRevision: reRead?.revision });
      assert.equal(loserRetry.revision, 2);
    } finally {
      await store.close();
    }
  });

  test(`KPK-06 port [${suite.name}] injected physical fault at the durable write: typed refusal, no half write`, async () => {
    const store = await suite.make();
    try {
      await store.put('kpk06', { n: 0 }, { mustBeAbsent: true });
      const faulting = store as InMemoryCasStore | SqliteCasStore;
      faulting.failNextPutMatching('kpk06');
      await assert.rejects(
        () => store.put('kpk06', { n: 1 }, { mustMatchRevision: 0 }),
        (error: unknown) => expectCode(error, 'HOST_FAULT_INJECTED'),
      );
      // The refused write left no half state: revision and bytes unchanged.
      assert.deepEqual(await store.get('kpk06'), { value: { n: 0 }, revision: 0 });
      // And the store keeps working after the fault (no stuck state).
      const ok = await store.put('kpk06', { n: 1 }, { mustMatchRevision: 0 });
      assert.equal(ok.revision, 1);
      assert.deepEqual(await store.get('kpk06'), { value: { n: 1 }, revision: 1 });
    } finally {
      await store.close();
    }
  });
}

test('C01-N7 probeTrueCasStore refuses stores that accept stale or unconditional writes', async () => {
  // A compliant store passes the physical probe.
  const good = new InMemoryCasStore();
  await probeTrueCasStore(good);
  assert.equal(await good.get('v8host:probe:~'), null, 'probe keys are namespaced and cleaned up');

  // A rogue store that accepts stale revisions is refused typed.
  const staleAccepting = {
    async get(key: string): Promise<CasGetResult | null> {
      return this.m.get(key) ?? null;
    },
    async put(key: string, value: unknown): Promise<{ revision: number }> {
      const previous = this.m.get(key);
      const revision = previous === undefined ? 0 : previous.revision + 1;
      this.m.set(key, { value, revision });
      return { revision };
    },
    async remove(): Promise<void> {},
    async list(): Promise<readonly string[]> {
      return [];
    },
    async close(): Promise<void> {},
    m: new Map<string, CasGetResult>(),
  } satisfies CasDocumentStore & { m: Map<string, CasGetResult> };
  await assert.rejects(() => probeTrueCasStore(staleAccepting), (error: unknown) => expectCode(error, 'HOST_STORAGE_UNSUPPORTED'));

  // A store that refuses conditions entirely is ALSO unsupported (typed
  // unsupported must not be faked by rejecting everything).
  const alwaysRefusing: CasDocumentStore = {
    async get() {
      return null;
    },
    async put() {
      throw new HostBoundaryError('HOST_PUT_CONDITION_REQUIRED', 'refuses everything');
    },
    async remove() {},
    async list() {
      return [];
    },
    async close() {},
  };
  await assert.rejects(() => probeTrueCasStore(alwaysRefusing), (error: unknown) => expectCode(error, 'HOST_STORAGE_UNSUPPORTED'));
});

test('KPK-07 port [sqlite only] durable restart: a brand-new store over the same file recovers every {value, revision}', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'v08-host-kpk07-'));
  const dbPath = path.join(dir, 'durable.db');
  let first: SqliteCasStore | null = null;
  try {
    first = await openSqliteCasStore({ path: dbPath });
    await first.put('durable:alpha', { items: [1, 2, 3], label: 'α' }, { mustBeAbsent: true });
    await first.put('durable:beta', { n: 7 }, { mustBeAbsent: true });
    await first.put('durable:beta', { n: 8 }, { mustMatchRevision: 0 });
    await first.put('durable:nested:γ', { deep: { key: 'value' } }, { mustBeAbsent: true });
    const keys = await first.list('durable:');
    assert.deepEqual(keys, ['durable:alpha', 'durable:beta', 'durable:nested:γ']);
    await first.close();
    first = null;

    // The "restart": a physically new store instance over the same file.
    const second = await openSqliteCasStore({ path: dbPath });
    const alpha = await second.get('durable:alpha');
    assert.deepEqual(alpha, { value: { items: [1, 2, 3], label: 'α' }, revision: 0 });
    const beta = await second.get('durable:beta');
    assert.deepEqual(beta, { value: { n: 8 }, revision: 1 });
    const gamma = await second.get('durable:nested:γ');
    assert.deepEqual(gamma, { value: { deep: { key: 'value' } }, revision: 0 });
    assert.deepEqual(await second.list('durable:'), keys);
    // The recovered store continues the CAS sequence at the durable revision.
    const advanced = await second.put('durable:beta', { n: 9 }, { mustMatchRevision: 1 });
    assert.equal(advanced.revision, 2);
    await second.close();
  } finally {
    if (first !== null) await first.close();
    await rmWithRetries(dir);
  }
});
