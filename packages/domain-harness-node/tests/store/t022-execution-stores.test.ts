import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  CentralAdmissionError,
  HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION,
  HARNESS_OPERATION_IDENTITY_VERSION,
  SEMANTIC_CACHE_ENTRY_FORMAT_VERSION,
  SEMANTIC_CACHE_IDENTITY_VERSION,
} from '@kaicreator/domain-harness';
import type {
  AdmissionEffectJournalRecord,
  CompiledArtifactIdentity,
  HarnessExecutionOperationIdentity,
  HarnessJournalOutcome,
  SemanticCacheEntry,
  SemanticCacheKey,
} from '@kaicreator/domain-harness';
import type { JsonValue } from '@kaicreator/domain-harness/v2';
import {
  NodeSqliteAdmissionEffectJournal,
  NodeSqliteExactSemanticCacheStore,
  NodeSqliteHarnessExecutionJournalStore,
} from '../../src/store/node-sqlite-execution-stores.js';
import { openAuthorityTestDatabase } from './authority-test-helpers.js';

/* --- semantic cache fixtures ------------------------------------------- */

interface CacheEntryOverrides {
  readonly namespace?: string;
  readonly semanticDigest?: string;
  readonly producerDigest?: string;
  readonly dependencyDigests?: readonly string[];
  readonly createdAtEpochMs?: number;
  readonly expiresAtEpochMs?: number;
  readonly resultMarker?: string;
}

function cacheEntry(overrides: CacheEntryOverrides = {}): SemanticCacheEntry {
  const namespace = overrides.namespace ?? 'ns-a';
  const semanticDigest = overrides.semanticDigest ?? 'sha256:sem-1';
  const dependencies = {
    artifacts: (overrides.dependencyDigests ?? ['sha256:dep-a']).map((contentDigest) => ({
      kind: 'tool' as const,
      artifactId: 'dep-tool',
      contentDigest,
    })),
  };
  return {
    formatVersion: SEMANTIC_CACHE_ENTRY_FORMAT_VERSION,
    identity: {
      material: {
        namespace,
        domainId: 'domain-a',
        decisionId: 'decision-a',
        inputDigest: 'sha256:input-1',
        dependencyDigest: 'sha256:deps-1',
      },
      dependencies,
      key: {
        identityVersion: SEMANTIC_CACHE_IDENTITY_VERSION,
        namespace,
        semanticDigest,
      },
    },
    result: { marker: overrides.resultMarker ?? 'r1' },
    resultDigest: 'sha256:result-1',
    producerIdentity: {
      kind: 'tool',
      artifactId: 'tool-a',
      contentDigest: overrides.producerDigest ?? 'sha256:producer-1',
    },
    observedDependencies: dependencies,
    createdAtEpochMs: overrides.createdAtEpochMs ?? 1000,
    ...(overrides.expiresAtEpochMs === undefined ? {} : { expiresAtEpochMs: overrides.expiresAtEpochMs }),
  };
}

const cacheKey = (semanticDigest: string): SemanticCacheKey => ({
  identityVersion: SEMANTIC_CACHE_IDENTITY_VERSION,
  namespace: 'ns-a',
  semanticDigest,
});
const producerIdentity = (contentDigest: string): CompiledArtifactIdentity => ({
  kind: 'tool',
  artifactId: 'tool-a',
  contentDigest,
});
const dependencyIdentity = (contentDigest: string): CompiledArtifactIdentity => ({
  kind: 'tool',
  artifactId: 'dep-tool',
  contentDigest,
});

/* --- harness execution journal fixtures --------------------------------- */

interface HarnessIdentityOverrides {
  readonly semanticContractDigest?: string;
  readonly operationKind?: 'ai' | 'query';
  readonly operationOrdinal?: number;
  readonly durableControlTurnId?: string;
}

function harnessIdentity(overrides: HarnessIdentityOverrides = {}): HarnessExecutionOperationIdentity {
  return {
    identityVersion: HARNESS_OPERATION_IDENTITY_VERSION,
    slot: {
      target: { workflowId: 'wf-a', instanceKey: 'inst-1' },
      durableControlTurnId: overrides.durableControlTurnId ?? 'turn-1',
      operationKind: overrides.operationKind ?? 'ai',
      operationOrdinal: overrides.operationOrdinal ?? 1,
    },
    semanticContractDigest: overrides.semanticContractDigest ?? 'sha256:contract-1',
  };
}

const succeededOutcome = (marker: string): HarnessJournalOutcome => ({
  status: 'succeeded',
  value: { marker },
});

/* --- admission effect journal fixtures ----------------------------------- */

function admissionRecord(
  effectId: string,
  overrides: { readonly input?: JsonValue; readonly attempt?: number } = {},
): AdmissionEffectJournalRecord {
  return {
    effectId,
    target: { workflowId: 'wf-a', instanceKey: 'inst-1' },
    durableControlTurnId: 'turn-1',
    operationOrdinal: 1,
    effectType: 'email.send',
    effectSemantics: 'non-idempotent',
    status: 'started',
    attempt: overrides.attempt ?? 1,
    input: overrides.input ?? { to: 'a@b.c' },
    startedAt: '2026-01-01T00:00:00.000Z',
  };
}

/* --- exact semantic cache ------------------------------------------------ */

test('T-022 exact semantic cache: putIfAbsent first-writer-wins, read hit/miss, durable across reopen', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-semcache-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteExactSemanticCacheStore(first.db);
  const entry = cacheEntry();
  const key = entry.identity.key;

  assert.deepEqual(await store.read(key, 1500), { status: 'miss', reason: 'not-found' });
  assert.deepEqual(await store.putIfAbsent(entry, 1500), { status: 'inserted', entry });
  assert.equal(store.size, 1);
  const hit = await store.read(key, 1500);
  assert.ok(hit.status === 'hit');
  assert.deepEqual(hit.entry, entry);

  // Same storage key, different result: the first writer's entry wins.
  const challenger = cacheEntry({ resultMarker: 'r2' });
  const putAgain = await store.putIfAbsent(challenger, 1600);
  assert.equal(putAgain.status, 'existing');
  assert.deepEqual(putAgain.entry, entry);
  const hitAfter = await store.read(key, 1600);
  assert.ok(hitAfter.status === 'hit');
  assert.deepEqual(hitAfter.entry.result, { marker: 'r1' });
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteExactSemanticCacheStore(second.db);
  assert.equal(reopened.size, 1);
  const persisted = await reopened.read(key, 1600);
  assert.ok(persisted.status === 'hit');
  assert.deepEqual(persisted.entry, JSON.parse(JSON.stringify(entry)));
  assert.deepEqual(reopened.getQuarantineRecords(), []);
  second.close();
});

test('T-022 exact semantic cache: expiresAtEpochMs and maxAgeMs expiry miss + delete, evict report', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-semcache-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteExactSemanticCacheStore(first.db);
  const expiring = cacheEntry({ semanticDigest: 'sha256:sem-exp', expiresAtEpochMs: 2000 });
  await store.putIfAbsent(expiring, 1000);
  const before = await store.read(expiring.identity.key, 1999);
  assert.ok(before.status === 'hit');
  assert.deepEqual(await store.read(expiring.identity.key, 2000), { status: 'miss', reason: 'expired' });
  assert.equal(store.size, 0, 'expired read deletes the row');
  first.close();

  // maxAgeMs retention policy enforced by the store itself.
  const second = openAuthorityTestDatabase(path);
  const aged = new NodeSqliteExactSemanticCacheStore(second.db, { maxAgeMs: 500 });
  const entry = cacheEntry({ semanticDigest: 'sha256:sem-age', createdAtEpochMs: 1000 });
  await aged.putIfAbsent(entry, 1000);
  const stillFresh = await aged.read(entry.identity.key, 1499);
  assert.ok(stillFresh.status === 'hit');
  assert.deepEqual(await aged.read(entry.identity.key, 1500), { status: 'miss', reason: 'expired' });
  assert.equal(aged.size, 0);

  // evict() reports expired and capacity removals.
  await aged.putIfAbsent(cacheEntry({ semanticDigest: 'sha256:sem-e1', createdAtEpochMs: 1000, expiresAtEpochMs: 3000 }), 1000);
  await aged.putIfAbsent(cacheEntry({ semanticDigest: 'sha256:sem-e2', createdAtEpochMs: 1000, expiresAtEpochMs: 3000 }), 1000);
  assert.equal(aged.size, 2);
  assert.deepEqual(await aged.evict(3000), { expired: 2, capacity: 0 });
  assert.equal(aged.size, 0);
  second.close();
});

test('T-022 exact semantic cache: invalidateByProducer/Dependency/Namespace counts + reopen', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-semcache-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteExactSemanticCacheStore(first.db);
  const e1 = cacheEntry({ semanticDigest: 'sha256:sem-1', producerDigest: 'sha256:producer-1', dependencyDigests: ['sha256:dep-1', 'sha256:dep-2'] });
  const e2 = cacheEntry({ semanticDigest: 'sha256:sem-2', producerDigest: 'sha256:producer-1', dependencyDigests: ['sha256:dep-2'] });
  const e3 = cacheEntry({ semanticDigest: 'sha256:sem-3', namespace: 'ns-b', producerDigest: 'sha256:producer-2', dependencyDigests: ['sha256:dep-3'] });
  await store.putIfAbsent(e1, 1000);
  await store.putIfAbsent(e2, 1000);
  await store.putIfAbsent(e3, 1000);
  assert.equal(store.size, 3);

  assert.equal(await store.invalidateByProducer(producerIdentity('sha256:producer-1'), 'producer revoked'), 2);
  assert.equal(store.size, 1);
  assert.equal(await store.invalidateByProducer(producerIdentity('sha256:producer-1'), 'producer revoked'), 0);
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteExactSemanticCacheStore(second.db);
  assert.equal(reopened.size, 1, 'only the other-producer entry survives');
  await reopened.putIfAbsent(e1, 1000);
  await reopened.putIfAbsent(e2, 1000);
  assert.equal(await reopened.invalidateByDependency(dependencyIdentity('sha256:dep-2'), 'dependency changed'), 2);
  assert.equal(reopened.size, 1);
  second.close();

  const third = openAuthorityTestDatabase(path);
  const again = new NodeSqliteExactSemanticCacheStore(third.db);
  assert.equal(again.size, 1);
  assert.equal(await again.invalidateNamespace('ns-b', 'namespace retired'), 1);
  assert.equal(await again.invalidateNamespace('ns-b', 'namespace retired'), 0);
  assert.equal(await again.invalidateNamespace('ns-c', 'namespace retired'), 0);
  assert.equal(again.size, 0);
  third.close();
});

test('T-022 exact semantic cache: quarantine removes entry, records survive reopen, oldest-trim to maxQuarantineRecords', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-semcache-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteExactSemanticCacheStore(first.db);
  const entry = cacheEntry({ semanticDigest: 'sha256:sem-q' });
  await store.putIfAbsent(entry, 1000);
  await store.quarantine(entry.identity.key, 'corrupt-cache-entry', 5000);
  assert.equal(store.size, 0);
  assert.deepEqual(await store.read(entry.identity.key, 5000), { status: 'miss', reason: 'not-found' });
  const records = store.getQuarantineRecords();
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], { key: entry.identity.key, reason: 'corrupt-cache-entry', quarantinedAtEpochMs: 5000 });
  first.close();

  // Trim to maxQuarantineRecords, oldest records first (by ordinal).
  const second = openAuthorityTestDatabase(path);
  const trimmed = new NodeSqliteExactSemanticCacheStore(second.db, { maxQuarantineRecords: 2 });
  await trimmed.quarantine(cacheKey('sha256:sem-q1'), 'one', 6000);
  await trimmed.quarantine(cacheKey('sha256:sem-q2'), 'two', 6001);
  await trimmed.quarantine(cacheKey('sha256:sem-q3'), 'three', 6002);
  const kept = trimmed.getQuarantineRecords();
  assert.equal(kept.length, 2);
  assert.deepEqual(kept[0], { key: cacheKey('sha256:sem-q2'), reason: 'two', quarantinedAtEpochMs: 6001 });
  assert.deepEqual(kept[1], { key: cacheKey('sha256:sem-q3'), reason: 'three', quarantinedAtEpochMs: 6002 });
  second.close();

  const third = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteExactSemanticCacheStore(third.db);
  assert.deepEqual(reopened.getQuarantineRecords(), kept);
  third.close();
});

test('T-022 exact semantic cache: capacity eviction removes oldest by createdAt then storage key', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-semcache-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteExactSemanticCacheStore(first.db, { maxEntries: 2 });
  await store.putIfAbsent(cacheEntry({ semanticDigest: 'sha256:sem-c3', createdAtEpochMs: 3000 }), 3000);
  await store.putIfAbsent(cacheEntry({ semanticDigest: 'sha256:sem-c1', createdAtEpochMs: 1000 }), 1000);
  const putSecond = await store.putIfAbsent(cacheEntry({ semanticDigest: 'sha256:sem-c2', createdAtEpochMs: 2000 }), 2000);
  assert.equal(putSecond.status, 'inserted');
  assert.equal(store.size, 2, 'incoming put made room before inserting');
  assert.deepEqual(await store.read(cacheKey('sha256:sem-c1'), 3000), { status: 'miss', reason: 'not-found' });
  assert.ok((await store.read(cacheKey('sha256:sem-c2'), 3000)).status === 'hit');
  assert.ok((await store.read(cacheKey('sha256:sem-c3'), 3000)).status === 'hit');

  // Re-putting an existing key never evicts.
  const again = await store.putIfAbsent(cacheEntry({ semanticDigest: 'sha256:sem-c2', createdAtEpochMs: 2000, resultMarker: 'other' }), 2500);
  assert.equal(again.status, 'existing');
  assert.equal(store.size, 2);
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteExactSemanticCacheStore(second.db, { maxEntries: 2 });
  assert.equal(reopened.size, 2);
  assert.deepEqual(await reopened.read(cacheKey('sha256:sem-c1'), 3000), { status: 'miss', reason: 'not-found' });
  second.close();
});

/* --- harness execution journal ------------------------------------------- */

test('T-022 harness execution journal: begin created/existing + started record durable across reopen', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-harness-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteHarnessExecutionJournalStore(first.db);
  const identity = harnessIdentity();
  const begun = await store.begin(identity);
  assert.equal(begun.disposition, 'created');
  assert.equal(begun.record.state, 'started');
  assert.equal(begun.record.formatVersion, HARNESS_EXECUTION_JOURNAL_FORMAT_VERSION);
  assert.deepEqual(begun.record.identity, identity);
  assert.deepEqual(await store.read(identity.slot), begun.record);

  const rebegun = await store.begin(harnessIdentity());
  assert.equal(rebegun.disposition, 'existing');
  assert.deepEqual(rebegun.record, begun.record);
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteHarnessExecutionJournalStore(second.db);
  assert.deepEqual(await reopened.read(identity.slot), begun.record);
  second.close();
});

test('T-022 harness execution journal: commit lifecycle, never-begun, identity conflict, idempotent double commit', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-harness-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteHarnessExecutionJournalStore(first.db);
  const identity = harnessIdentity();

  await assert.rejects(
    () => store.commit(identity, succeededOutcome('ok')),
    (error: unknown) => error instanceof Error && error.message === 'cannot commit a Harness operation that was never begun',
  );

  await store.begin(identity);
  const conflicting = harnessIdentity({ semanticContractDigest: 'sha256:contract-2' });
  await assert.rejects(
    () => store.commit(conflicting, succeededOutcome('ok')),
    (error: unknown) => error instanceof Error && error.message === 'cannot commit a Harness operation under a conflicting semantic identity',
  );

  const committed = await store.commit(identity, succeededOutcome('ok'));
  assert.equal(committed.state, 'committed');
  assert.deepEqual(committed.identity, identity);
  assert.deepEqual(committed.outcome, { status: 'succeeded', value: { marker: 'ok' } });

  const recommitted = await store.commit(identity, succeededOutcome('ok'));
  assert.deepEqual(recommitted, committed);

  await assert.rejects(
    () => store.commit(identity, succeededOutcome('other')),
    (error: unknown) => error instanceof Error && error.message === 'Harness operation slot already has a different committed outcome',
  );
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteHarnessExecutionJournalStore(second.db);
  const record = await reopened.read(identity.slot);
  assert.ok(record !== null && record.state === 'committed');
  assert.deepEqual(record.outcome, { status: 'succeeded', value: { marker: 'ok' } });
  second.close();
});

/* --- admission effect journal --------------------------------------------- */

test('T-022 admission effect journal: beginEffect created/existing, incompatible identity, started-only', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-admission-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const journal = new NodeSqliteAdmissionEffectJournal(first.db);
  const record = admissionRecord('ef-1');
  const begun = await journal.beginEffect(record);
  assert.equal(begun.disposition, 'created');
  assert.deepEqual(begun.record, record);

  // Re-begin differs only in attempt/startedAt (volatile detail): compatible.
  const rebegun = await journal.beginEffect(admissionRecord('ef-1', { attempt: 2 }));
  assert.equal(rebegun.disposition, 'existing');
  assert.equal(rebegun.record.attempt, 1);
  assert.deepEqual(rebegun.record, record);

  // Different canonical input under the same effectId is incompatible.
  await assert.rejects(
    () => journal.beginEffect(admissionRecord('ef-1', { input: { to: 'other@b.c' } })),
    (error: unknown) =>
      error instanceof CentralAdmissionError
      && error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT'
      && error.message === 'effect ef-1 already exists with an incompatible identity',
  );

  // beginEffect requires a started record.
  const settled: AdmissionEffectJournalRecord = {
    ...admissionRecord('ef-2'),
    status: 'completed',
    output: { id: 1 },
    completedAt: '2026-01-02T00:00:00.000Z',
  };
  await assert.rejects(
    () => journal.beginEffect(settled),
    (error: unknown) =>
      error instanceof CentralAdmissionError
      && error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT'
      && error.message === 'beginEffect requires a started record',
  );
  assert.equal(await journal.getEffect('ef-2'), null);
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteAdmissionEffectJournal(second.db);
  assert.deepEqual(await reopened.getEffect('ef-1'), JSON.parse(JSON.stringify(record)));
  second.close();
});

test('T-022 admission effect journal: completeEffect completed/failed, reopen, never-begun, idempotent settle, conflict', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-admission-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const journal = new NodeSqliteAdmissionEffectJournal(first.db);
  await journal.beginEffect(admissionRecord('ef-1'));

  await assert.rejects(
    () => journal.completeEffect('ef-none', { status: 'completed', output: { id: 1 }, completedAt: '2026-01-02T00:00:00.000Z' }),
    (error: unknown) =>
      error instanceof CentralAdmissionError
      && error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT'
      && error.message === 'cannot complete effect ef-none that was never begun',
  );

  const completed = await journal.completeEffect('ef-1', { status: 'completed', output: { id: 42 }, completedAt: '2026-01-02T00:00:00.000Z' });
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.output, { id: 42 });
  assert.equal(completed.completedAt, '2026-01-02T00:00:00.000Z');

  // Re-settle with the same canonical outcome is idempotent (completedAt is
  // not part of the outcome key).
  const resettle = await journal.completeEffect('ef-1', { status: 'completed', output: { id: 42 }, completedAt: '2026-01-03T00:00:00.000Z' });
  assert.deepEqual(resettle, completed);

  // Conflicting outcome fails closed; the stored record is untouched.
  await assert.rejects(
    () => journal.completeEffect('ef-1', { status: 'completed', output: { id: 43 }, completedAt: '2026-01-02T00:00:00.000Z' }),
    (error: unknown) =>
      error instanceof CentralAdmissionError
      && error.code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT'
      && error.message === 'effect ef-1 is already settled with a conflicting outcome',
  );
  assert.deepEqual(await journal.getEffect('ef-1'), JSON.parse(JSON.stringify(completed)));

  // Failed terminal state.
  await journal.beginEffect(admissionRecord('ef-2'));
  const failed = await journal.completeEffect('ef-2', { status: 'failed', error: { message: 'boom' }, completedAt: '2026-01-02T01:00:00.000Z' });
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.error, { message: 'boom' });
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteAdmissionEffectJournal(second.db);
  const persisted = await reopened.getEffect('ef-1');
  assert.ok(persisted !== null && persisted.status === 'completed' && persisted.attempt === 1);
  const persistedFailed = await reopened.getEffect('ef-2');
  assert.ok(persistedFailed !== null && persistedFailed.status === 'failed');
  assert.deepEqual(persistedFailed.error, { message: 'boom' });
  second.close();
});
