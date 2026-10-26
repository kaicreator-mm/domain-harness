/**
 * v0.10 T10B (#1179) — PHYSICAL explicit multi-target authorized query.
 * =====================================================================
 *
 * Builds on the merged T10 selected two-B App (`v010-t10-selected-app-*`):
 * two REAL Business packages share workflowId+instanceKey over ONE
 * file-backed SQLite K store, and the Host-verified principal/authorization
 * is deployment wiring fixed at activation.
 *
 * The additive `queryMany` is exercised as an explicit list of targets:
 *   T10B-P1  exact visible targets answer independently, correlated by input
 *            index; authorization precedes each target's only read.
 *   T10B-P2  duplicate selectors preserve input order and answer separately.
 *   T10B-P3  mixed visible/denied results are per-entry; hidden, unselected,
 *            foreign and absent targets share one byte-identical denial.
 *   T10B-P4  after a physical close/reopen both targets still answer from
 *            durable per-B state.
 *
 *   T10B-N1  one target's SQLite read fault stays scoped to that entry while
 *            the other targets still answer (no global transaction/abort).
 *   T10B-N2  empty/oversized selector arrays fail typed; one malformed entry
 *            never blocks a valid sibling.
 *   T10B-N3  a cross-tenant principal is denied per entry before any read.
 *   T10B-N4  every queryMany path performs zero puts/removes and dispatches
 *            zero K or external Effect.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { activateV10App, type V10Activation } from '../../../packages/microkernel/src/internal/activation.js';
import type { V10BuiltApp, V10DocStore } from '@kaicreator/domain-harness-contracts';
import { openSqliteCasStore, type SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import {
  T10_ALPHA,
  T10_BETA,
  T10_DEPLOYMENT,
  T10_HOST_PRINCIPAL,
  T10_NOW,
  T10_SHARED_TARGET,
  buildT10TwoBApp,
  refusalCode,
  t10Authority,
  t10CountingStore,
  t10Probe,
  type T10AccessEvent,
  type T10AuthorityProbe,
  type T10PhysicalCounts,
} from './v010-t10-selected-app-fixture.js';

assert.equal(
  Number(process.versions.node.split('.')[0]),
  24,
  `the T10B queryMany physical witness targets Node24 (running ${process.versions.node})`,
);

const counts: T10PhysicalCounts = { gets: 0, puts: 0, removes: 0 };
const events: T10AccessEvent[] = [];
const probe: T10AuthorityProbe = t10Probe();
const visible = new Set<string>([T10_ALPHA, T10_BETA]);

let dir = '';
let kPath = '';
let store: SqliteCasStore | undefined;
let app: V10BuiltApp;
let activation: V10Activation;

function countingStore(): ReturnType<typeof t10CountingStore> {
  return t10CountingStore(store as SqliteCasStore, counts, events);
}

async function activateSelected(options: {
  queryAuthority?: boolean;
  principal?: unknown;
  storeOverride?: V10DocStore;
  visibility?: Set<string>;
} = {}): Promise<V10Activation> {
  const visibility = options.visibility ?? visible;
  const authority = options.queryAuthority === false
    ? undefined
    : t10Authority(visibility, probe, options.principal ?? T10_HOST_PRINCIPAL, events);
  return await activateV10App(app, {
    store: options.storeOverride ?? countingStore(),
    tenantId: T10_DEPLOYMENT.tenantId,
    now: () => T10_NOW,
    deploymentIdentity: T10_DEPLOYMENT,
    ...(authority === undefined ? {} : { queryAuthority: authority }),
  });
}

async function refusal(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    return error as { code: string; message: string };
  }
  assert.fail('expected the query to be refused');
}

function snapshotOf(entry: { snapshot: unknown }): Record<string, any> {
  return entry.snapshot as Record<string, any>;
}

function getEvents(): T10AccessEvent[] {
  return events.filter((event) => event.kind === 'get');
}

function resetEvents(): void {
  events.length = 0;
}

/** A store whose BETA reads can be made to fail while every other key works. */
function faultedStore(base: V10DocStore, fault: { on: boolean }): V10DocStore {
  return {
    get: async (key) => {
      if (fault.on && key.includes(`:${T10_BETA}:`)) {
        throw Object.assign(new Error('injected beta SQLite read fault'), { code: 'INJECTED_READ_FAULT' });
      }
      return await base.get(key);
    },
    put: async (key, value, condition) => await base.put(key, value, condition),
    remove: async (key, condition) => await base.remove(key, condition),
    keys: async () => await base.keys(),
  };
}

async function seedTwoB(target: V10Activation): Promise<void> {
  const alpha = await target.facade.send({
    intentType: 'submitQuoteDecision',
    instanceKey: T10_SHARED_TARGET.instanceKey,
    messageId: 'm-t10b-shared-1',
    input: { amount: 42 },
  });
  assert.equal(alpha.status, 'admitted', `alpha receipt: ${JSON.stringify(alpha).slice(0, 300)}`);
  const beta = await target.facade.send({
    intentType: 'submitQuoteDecisionStrict',
    instanceKey: T10_SHARED_TARGET.instanceKey,
    messageId: 'm-t10b-shared-1',
    input: { amount: 42 },
  });
  assert.equal(beta.status, 'admitted', `beta receipt: ${JSON.stringify(beta).slice(0, 300)}`);
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dh010-t10b-querymany-'));
  kPath = join(dir, 'k.sqlite');
  store = await openSqliteCasStore({ path: kPath });
  app = await buildT10TwoBApp();
  activation = await activateSelected();
  await seedTwoB(activation);
});

after(async () => {
  try {
    activation.dispose();
  } catch {
    // bounded best-effort teardown
  }
  await store?.close();
  for (const suffix of ['', '-wal', '-shm']) {
    await rm(`${kPath}${suffix}`, { force: true });
  }
  await rm(dir, { recursive: true, force: true });
});

test('T10B-P1 exact visible targets answer independently in input order', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);
  resetEvents();

  const answers = await activation.facade.queryManyScopedSnapshots([
    { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
    { ...T10_SHARED_TARGET, businessPackageId: T10_BETA },
  ]);

  assert.equal(answers.length, 2);
  assert.equal(answers[0]?.status, 'answered');
  assert.equal(answers[1]?.status, 'answered');
  const alpha = answers[0]!;
  const beta = answers[1]!;
  assert.equal(alpha.index, 0);
  assert.equal(beta.index, 1);
  assert.equal(alpha.status === 'answered' ? alpha.target.businessPackageId : null, T10_ALPHA);
  assert.equal(beta.status === 'answered' ? beta.target.businessPackageId : null, T10_BETA);
  assert.deepEqual(alpha.status === 'answered' ? alpha.target : null, {
    ...T10_DEPLOYMENT,
    businessPackageId: T10_ALPHA,
    ...T10_SHARED_TARGET,
  });
  assert.equal(snapshotOf(alpha as { snapshot: unknown }).state.stateKey, 'approved');
  assert.equal(snapshotOf(beta as { snapshot: unknown }).state.stateKey, 'approved');
  assert.equal('principal' in alpha, false, 'the public answer carries no principal');
  assert.equal('authorize' in alpha, false, 'the public answer carries no authorization seam');

  // Each target's authorization is the event immediately before its read.
  const getIndexes = events
    .map((event, index) => (event.kind === 'get' ? index : -1))
    .filter((index) => index >= 0);
  assert.equal(getIndexes.length, 2, 'exactly one physical read per answered target');
  assert.equal(events[getIndexes[0]! - 1]?.kind, 'authorize');
  assert.equal(events[getIndexes[0]! - 1]?.key, T10_ALPHA);
  assert.equal(events[getIndexes[1]! - 1]?.kind, 'authorize');
  assert.equal(events[getIndexes[1]! - 1]?.key, T10_BETA);
  for (const event of getEvents()) {
    assert.match(event.key, /v010-k02:/);
    assert.ok(event.key.includes(`:${T10_ALPHA}:`) || event.key.includes(`:${T10_BETA}:`));
  }
});

test('T10B-P2 duplicate selectors preserve input order and answer independently', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);
  const answers = await activation.facade.queryManyScopedSnapshots([
    { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
    { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
    { ...T10_SHARED_TARGET, businessPackageId: T10_BETA },
  ]);
  assert.deepEqual(answers.map((entry) => entry.index), [0, 1, 2]);
  assert.deepEqual(answers.map((entry) => entry.status), ['answered', 'answered', 'answered']);
  assert.deepEqual(
    answers.map((entry) => (entry.status === 'answered' ? entry.target.businessPackageId : null)),
    [T10_ALPHA, T10_ALPHA, T10_BETA],
  );
  assert.equal(snapshotOf(answers[1] as { snapshot: unknown }).stateRevision, 1);
  assert.equal(snapshotOf(answers[2] as { snapshot: unknown }).stateRevision, 1);
});

test('T10B-P3 mixed visible/denied is per-entry and denials never reveal a hidden B', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  resetEvents();
  const answers = await activation.facade.queryManyScopedSnapshots([
    { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
    { ...T10_SHARED_TARGET, businessPackageId: T10_BETA },
  ]);
  assert.equal(answers[0]?.status, 'answered');
  assert.equal(answers[1]?.status, 'refused');
  const hidden = answers[1] as { code: string; message: string };
  assert.equal(hidden.code, 'QUERY_NOT_FOUND');
  assert.ok(
    getEvents().every((event) => event.key.includes(`:${T10_ALPHA}:`)),
    'the hidden B namespace was never physically addressed',
  );

  const absent = await activation.facade.queryManyScopedSnapshots([
    { ...T10_SHARED_TARGET, businessPackageId: 'pkg:not-selected' },
  ]);
  const ghost = await activation.facade.queryManyScopedSnapshots([
    { workflowId: 'ghost-workflow', instanceKey: T10_SHARED_TARGET.instanceKey },
  ]);
  for (const entry of [absent[0], ghost[0]]) {
    assert.equal(entry?.status, 'refused');
    assert.equal((entry as { code: string }).code, hidden.code);
    assert.equal((entry as { message: string }).message, hidden.message, 'denial is byte-identical');
  }
});

test('T10B-N1 one target read fault stays scoped; other targets still answer', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);
  const fault = { on: false };
  const faultActivation = await activateSelected({
    storeOverride: faultedStore(countingStore(), fault),
  });
  try {
    fault.on = true;
    const answers = await faultActivation.facade.queryManyScopedSnapshots([
      { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
      { ...T10_SHARED_TARGET, businessPackageId: T10_BETA },
    ]);
    assert.equal(answers[0]?.status, 'answered');
    assert.equal(snapshotOf(answers[0] as { snapshot: unknown }).state.stateKey, 'approved');
    assert.equal(answers[1]?.status, 'refused');
    assert.equal((answers[1] as { code: string }).code, 'QUERY_READ_FAILED');

    // The reverse order proves the failure of one entry never poisons another.
    const reversed = await faultActivation.facade.queryManyScopedSnapshots([
      { ...T10_SHARED_TARGET, businessPackageId: T10_BETA },
      { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
    ]);
    assert.equal(reversed[0]?.status, 'refused');
    assert.equal((reversed[0] as { code: string }).code, 'QUERY_READ_FAILED');
    assert.equal(reversed[1]?.status, 'answered');
  } finally {
    faultActivation.dispose();
  }
});

test('T10B-N2 empty/oversized arrays fail typed; one malformed entry does not block a valid sibling', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  const getsBefore = counts.gets;
  const checksBefore = probe.checks.length;
  const putsBefore = counts.puts;

  assert.equal(refusalCode(await refusal(activation.facade.queryManyScopedSnapshots([]))), 'QUERY_SELECTORS_INVALID');
  const oversized = Array.from({ length: 33 }, () => ({
    ...T10_SHARED_TARGET,
    businessPackageId: T10_ALPHA,
  }));
  assert.equal(refusalCode(await refusal(activation.facade.queryManyScopedSnapshots(oversized))), 'QUERY_SELECTORS_INVALID');
  assert.equal(counts.gets, getsBefore, 'top-level rejection reads nothing');
  assert.equal(probe.checks.length, checksBefore, 'top-level rejection authorizes nothing');
  assert.equal(counts.puts, putsBefore);

  const mixed = await activation.facade.queryManyScopedSnapshots([
    { workflowId: '', instanceKey: 'x' },
    { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
  ]);
  assert.equal(mixed[0]?.status, 'refused');
  assert.equal((mixed[0] as { code: string }).code, 'QUERY_SELECTOR_INVALID');
  assert.equal(mixed[1]?.status, 'answered');
  assert.equal(
    (mixed[0] as { message: string }).message,
    'query selector is invalid',
    'the malformed refusal does not name the offending field',
  );
});

test('T10B-N3 cross-tenant principal is denied per entry before any physical read', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);
  const crossTenant = await activateSelected({
    principal: { source: 'host-authenticated', subject: 'user:foreign', tenantId: 'tenant-other' },
    storeOverride: countingStore(),
  });
  try {
    const getsBefore = counts.gets;
    resetEvents();
    const answers = await crossTenant.facade.queryManyScopedSnapshots([
      { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
      { ...T10_SHARED_TARGET, businessPackageId: T10_BETA },
    ]);
    assert.deepEqual(answers.map((entry) => entry.status), ['refused', 'refused']);
    for (const entry of answers) {
      assert.equal((entry as { code: string }).code, 'QUERY_NOT_FOUND');
    }
    assert.equal(counts.gets, getsBefore, 'tenant denial happened before any physical existence read');
    assert.equal(getEvents().length, 0);
    assert.ok(
      probe.observedPrincipals.slice(-2).every((principal) => (principal as { tenantId?: string }).tenantId === 'tenant-other'),
      'the cross-tenant principal reached authorization and was refused there',
    );
  } finally {
    crossTenant.dispose();
  }
});

test('T10B-N4 queryMany never writes K state or dispatches an Effect', async () => {
  visible.clear();
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);
  const putsBefore = counts.puts;
  const removesBefore = counts.removes;
  const alphaEffects = activation.facade.kCounters(T10_ALPHA).effectDispatches;
  const betaEffects = activation.facade.kCounters(T10_BETA).effectDispatches;
  const externalBefore = activation.counters.externalEffectDispatches;
  await activation.facade.queryManyScopedSnapshots([
    { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
    { ...T10_SHARED_TARGET, businessPackageId: T10_BETA },
    { ...T10_SHARED_TARGET, businessPackageId: 'pkg:not-selected' },
  ]);
  await refusal(activation.facade.queryManyScopedSnapshots([]));
  assert.equal(counts.puts, putsBefore, 'queries perform zero physical writes');
  assert.equal(counts.removes, removesBefore);
  assert.equal(activation.facade.kCounters(T10_ALPHA).effectDispatches, alphaEffects);
  assert.equal(activation.facade.kCounters(T10_BETA).effectDispatches, betaEffects);
  assert.equal(activation.counters.externalEffectDispatches, externalBefore);
});

test('T10B-P4 after a physical close/reopen queryMany answers durable per-B state', async () => {
  activation.dispose();
  await (store as SqliteCasStore).close();
  store = await openSqliteCasStore({ path: kPath });
  activation = await activateSelected();
  visible.clear();
  visible.add(T10_ALPHA);
  visible.add(T10_BETA);

  const answers = await activation.facade.queryManyScopedSnapshots([
    { ...T10_SHARED_TARGET, businessPackageId: T10_ALPHA },
    { ...T10_SHARED_TARGET, businessPackageId: T10_BETA },
  ]);
  assert.deepEqual(answers.map((entry) => entry.status), ['answered', 'answered']);
  assert.equal(snapshotOf(answers[0] as { snapshot: unknown }).state.stateKey, 'approved');
  assert.equal(snapshotOf(answers[0] as { snapshot: unknown }).stateRevision, 1);
  assert.equal(snapshotOf(answers[1] as { snapshot: unknown }).state.stateKey, 'approved');
  assert.equal(snapshotOf(answers[1] as { snapshot: unknown }).stateRevision, 1);
});
