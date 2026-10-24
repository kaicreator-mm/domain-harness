import test from 'node:test';
import assert from 'node:assert/strict';
import { HostBoundaryError, InMemoryCasStore, probeTrueCasStore, validateWriteCondition } from '../src/sqlite-cas.js';

test('T03a CAS: create, revision monotonic despite value ABA, stale refusal and detached snapshots', async () => {
  const store = new InMemoryCasStore();
  const input = { value: 'A', nested: { n: 1 } };
  assert.deepEqual(await store.put('doc', input, { mustBeAbsent: true }), { revision: 0 });
  input.nested.n = 9;
  const first = await store.get('doc');
  assert.deepEqual(first, { value: { value: 'A', nested: { n: 1 } }, revision: 0 });
  const snapshot = first!.value as { nested: { n: number } };
  snapshot.nested.n = 99;
  assert.equal(((await store.get('doc'))!.value as { nested: { n: number } }).nested.n, 1);
  await store.put('doc', { value: 'B' }, { mustMatchRevision: 0 });
  await store.put('doc', { value: 'A' }, { mustMatchRevision: 1 });
  await assert.rejects(store.put('doc', { value: 'forged' }, { mustMatchRevision: 0 }), (e: unknown) =>
    e instanceof HostBoundaryError && e.code === 'HOST_CAS_CONFLICT');
  assert.deepEqual(await store.get('doc'), { value: { value: 'A' }, revision: 2 });
  await store.close();
});

test('T03a CAS: strict required conditions, missing keys, fault paths and physical probe', async () => {
  const store = new InMemoryCasStore();
  assert.throws(() => validateWriteCondition('x', undefined as never), { code: 'HOST_PUT_CONDITION_REQUIRED' });
  assert.throws(() => validateWriteCondition('x', { mustBeAbsent: true, mustMatchRevision: 0 }), { code: 'HOST_PUT_CONDITION_AMBIGUOUS' });
  assert.throws(() => validateWriteCondition('x', { mustMatchRevision: -1 }), { code: 'HOST_CAS_REVISION_MALFORMED' });
  await assert.rejects(store.put('x', 1, undefined as never), { code: 'HOST_PUT_CONDITION_REQUIRED' });
  await assert.rejects(store.remove('x', {}), { code: 'HOST_PUT_CONDITION_REQUIRED' });
  await assert.rejects(store.put('x', 1, { mustMatchRevision: 0 }), { code: 'HOST_CAS_CONFLICT' });
  store.failNextPutMatching('x');
  await assert.rejects(store.put('x', 1, { mustBeAbsent: true }), { code: 'HOST_FAULT_INJECTED' });
  store.failNextGetMatching('x');
  await assert.rejects(store.get('x'), { code: 'HOST_FAULT_INJECTED' });
  await probeTrueCasStore(store);
  await store.close();
});
