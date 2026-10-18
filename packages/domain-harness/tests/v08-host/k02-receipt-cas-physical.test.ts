/**
 * v0.10 K02 #1168 — physical SQLite same-CAS original-receipt carrier.
 * ====================================================================
 *
 * Physical witnesses over the REAL Node Host SqliteCasStore (WAL, IMMEDIATE
 * transactions) and the isolated K02 carrier fragment imported from its
 * EXACT current payload bytes (data-URL installer discipline; blob hash
 * recorded in evidence):
 *
 *   K02-P1  one physical CAS carries state + immutable original receipt
 *           (doc revision == stateRevision); identical retry replays the
 *           EXACT original receipt (original attributedAt/projection, not a
 *           re-derivation from the newest snapshot) with zero new effects;
 *           changed input / changed intentType refuse typed; legacy envelope
 *           shapes fail closed; ring maintenance is archive-gated with
 *           fault-tolerant growth (never blocks, never forgets).
 *   K02-P2  20 distinct turns, then EVERY derived archive record destroyed:
 *           every turn still replays from the same-CAS receipts, new turns
 *           keep admitting (17+ liveness); store closed and reopened
 *           mid-sequence keeps the receipt truth (restart durability).
 *   K02-P3  injected fatal store fault on the receipt-bearing CAS fails
 *           closed typed with zero durable partial state; a fault on the
 *           OPTIONAL archive write never fails the committed ACK.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';

import { openSqliteCasStore, type SqliteCasStore } from '../../src/host-v8/index.js';

const CARRIER_SOURCE = await readFile(
  new URL('../../../domain-harness-compiler/src/qualified-package/payload/durable-receipt-carrier-v1.mjs', import.meta.url),
  'utf8',
);
const CARRIER_SHA256 = createHash('sha256').update(CARRIER_SOURCE, 'utf8').digest('hex');
const carrier: Record<string, any> = await import(`data:text/javascript;base64,${Buffer.from(CARRIER_SOURCE, 'utf8').toString('base64')}`);
const { ReceiptCarryingEngine, canonicalInputDigest, createScopedDocumentStore, deriveCarrierTurnId, scopedDocKey, scopedNamespacePrefix } = carrier;

const sha256 = { digestUtf8: (value: string) => createHash('sha256').update(value, 'utf8').digest('hex') };
const SCOPE = { deployedAppId: 'app-k02', tenantId: 'tenant-1', appId: 'app-1', businessPackageId: 'pkg-quote-1.0.0' };
const WORKFLOW = 'quote';
const ARCHIVE_PREFIX = `${scopedNamespacePrefix(SCOPE)}:receipt-archive:`;

const sqlitePath = join(tmpdir(), `dh010-k02-cas-${String(process.pid)}-${String(Date.now())}.sqlite`);
let store: SqliteCasStore;
const dispatches: unknown[] = [];

const target = (instanceKey: string) => ({ workflowId: WORKFLOW, instanceKey });
const turnIdOf = (instanceKey: string, messageId: string) => deriveCarrierTurnId(target(instanceKey), { kind: 'message', sourceMessageId: messageId });

function makeEngine(options: { ringBound?: number; clock?: () => string; instanceKey: string }) {
  // The carrier engine scopes its own keys through the injective grammar, so
  // it binds the RAW physical store (the scoped ADAPTER is for unscoped
  // consumers like the unmodified kernel, not for the carrier itself).
  return new ReceiptCarryingEngine(store, {
    scope: SCOPE,
    sha256,
    ...(options.ringBound === undefined ? {} : { receiptRingBound: options.ringBound }),
    ...(options.clock === undefined ? {} : { now: options.clock }),
  });
}

/** Deterministic counter workflow: every admitted note increments; `deny` yields a typed denial. */
async function decideCounter(state: { count?: number }, input: Record<string, unknown>) {
  if (input.deny === true) return { status: 'denied' as const, denial: { reason: 'policy' } };
  return {
    status: 'admitted' as const,
    nextState: { stateKey: 'review', count: (state?.count ?? 0) + 1 },
    admitted: { targetState: 'review', transitionKey: 'note' },
    effects: Array.isArray(input.effects) ? input.effects : [],
  };
}

async function dispatchEffect({ effect, turnId, messageId }: { effect: unknown; turnId: string; messageId: string }) {
  const outcome = { executedFor: turnId, messageId, effect };
  dispatches.push(outcome);
  return outcome;
}

async function rawInstanceDocument(instanceKey: string) {
  const envelope = await store.get(scopedDocKey(SCOPE, 'wf-instance', WORKFLOW, instanceKey));
  assert.notEqual(envelope, null, 'the physical instance document exists');
  return envelope as { revision: number; value: Record<string, any> };
}

async function destroyEveryArchiveRecord(): Promise<number> {
  const keys = await store.list(ARCHIVE_PREFIX);
  for (const key of keys) {
    const envelope = await store.get(key);
    assert.notEqual(envelope, null);
    await store.remove(key, { mustMatchRevision: (envelope as { revision: number }).revision });
  }
  return keys.length;
}

before(async () => {
  store = await openSqliteCasStore({ path: sqlitePath });
});

after(async () => {
  await store.close();
  for (const suffix of ['', '-wal', '-shm']) {
    await rm(`${sqlitePath}${suffix}`, { force: true });
  }
});

test('K02-P1 one physical CAS: state revision == doc revision, original receipt rides the same document value', async () => {
  const ik = 'k02:i:p1-cas';
  const engine = makeEngine({ instanceKey: ik });
  await engine.openInstance({ target: target(ik), packageId: 'pkg-quote-1.0.0' });
  const admitted = await engine.admitTurn({
    target: target(ik),
    messageId: 'm-1',
    intentType: 'note',
    input: { amount: 42 },
    decide: decideCounter,
    dispatch: dispatchEffect,
  });
  assert.equal(admitted.status, 'admitted');
  assert.equal(admitted.idempotentReplay, false);
  assert.equal(admitted.stateRevision, 1);
  assert.equal(admitted.committedRevision, 1, 'physical row revision == stateRevision (one CAS)');
  const document = await rawInstanceDocument(ik);
  assert.equal(document.revision, 1);
  assert.equal(document.value.stateRevision, 1);
  const receipts = document.value.durableOriginalReceipts;
  assert.equal(Object.keys(receipts).length, 1);
  const envelope = receipts[turnIdOf(ik, 'm-1')];
  assert.equal(envelope.carrierVersion, 1);
  assert.equal(envelope.receipt.inputDigest, canonicalInputDigest(sha256, { amount: 42 }));
  assert.equal(envelope.receipt.instance.stateRevision, 1, 'the original receipt acknowledges THIS turn\'s projection');
  assert.equal(envelope.receipt.attributedAt, admitted.originalReceipt.attributedAt);
});

test('K02-P1 identical retry replays the EXACT original after later transitions; canonically equivalent input replays, zero new effects', async () => {
  const ik = 'k02:i:p1-replay';
  const ticks = { now: '2026-10-19T00:00:00.000Z' };
  const engine = makeEngine({ instanceKey: ik, clock: () => ticks.now });
  await engine.openInstance({ target: target(ik), correlationId: 'c', packageId: 'pkg' });

  ticks.now = '2026-10-19T00:00:01.000Z';
  await engine.admitTurn({ target: target(ik), messageId: 'm-1', intentType: 'note', input: { amount: 42, nested: { a: 1, b: 2 }, effects: [{ effectType: 'effect:note' }] }, decide: decideCounter, dispatch: dispatchEffect });
  ticks.now = '2026-10-19T00:00:02.000Z';
  await engine.admitTurn({ target: target(ik), messageId: 'm-2', intentType: 'note', input: { amount: 43 }, decide: decideCounter, dispatch: dispatchEffect });
  ticks.now = '2026-10-19T00:00:03.000Z';
  await engine.admitTurn({ target: target(ik), messageId: 'm-3', intentType: 'note', input: { amount: 44 }, decide: decideCounter, dispatch: dispatchEffect });

  const dispatchesBefore = dispatches.length;
  ticks.now = '2026-10-19T09:00:00.000Z'; // a much later retry must not disturb the original truth
  const replay = await engine.admitTurn({
    target: target(ik),
    messageId: 'm-1',
    intentType: 'note',
    // canonically equivalent input: same JSON value, different member order
    input: { nested: { b: 2, a: 1 }, amount: 42, effects: [{ effectType: 'effect:note' }] },
    decide: decideCounter,
    dispatch: dispatchEffect,
  });
  assert.equal(replay.status, 'admitted');
  assert.equal(replay.idempotentReplay, true, 'identical retry is an idempotent replay');
  assert.equal(replay.originalReceipt.attributedAt, '2026-10-19T00:00:01.000Z', 'the EXACT original attribution time');
  assert.equal(replay.originalReceipt.instance.stateRevision, 1, 'the EXACT original post-turn projection — never the newest snapshot');
  assert.equal(dispatches.length, dispatchesBefore, 'zero new effect activity on replay');
  assert.equal((await rawInstanceDocument(ik)).value.stateRevision, 3, 'the replay moved no state');
  assert.ok(engine.counters.originalReceiptReplays >= 1);
});

test('K02-P1 changed input and changed intentType under the same messageId refuse typed before any activity', async () => {
  const ik = 'k02:i:p1-conflict';
  const engine = makeEngine({ instanceKey: ik });
  await engine.openInstance({ target: target(ik), packageId: 'pkg' });
  await engine.admitTurn({ target: target(ik), messageId: 'm-1', intentType: 'note', input: { amount: 42 }, decide: decideCounter, dispatch: dispatchEffect });
  const before = await rawInstanceDocument(ik);
  const dispatchesBefore = dispatches.length;

  await assert.rejects(
    engine.admitTurn({ target: target(ik), messageId: 'm-1', intentType: 'note', input: { amount: 999 }, decide: decideCounter, dispatch: dispatchEffect }),
    (error: unknown) => (error as { code?: string }).code === 'K02_TURN_RECEIPT_INPUT_CONFLICT',
  );
  await assert.rejects(
    engine.admitTurn({ target: target(ik), messageId: 'm-1', intentType: 'reject', input: { amount: 42 }, decide: decideCounter, dispatch: dispatchEffect }),
    (error: unknown) => (error as { code?: string }).code === 'K02_TURN_RECEIPT_INTENT_CONFLICT',
  );
  const after = await rawInstanceDocument(ik);
  assert.deepEqual(after.value.durableOriginalReceipts, before.value.durableOriginalReceipts, 'the original receipt stands untouched');
  assert.equal(after.revision, before.revision, 'no state move');
  assert.equal(dispatches.length, dispatchesBefore, 'zero dispatches on refused resubmission');
});

test('K02-P1 legacy/unknown envelope shapes fail closed typed (no pre-1.0 migration)', async () => {
  const ik = 'k02:i:p1-legacy';
  const engine = makeEngine({ instanceKey: ik });
  await engine.openInstance({ target: target(ik), packageId: 'pkg' });
  await engine.admitTurn({ target: target(ik), messageId: 'm-legacy', intentType: 'note', input: { amount: 1 }, decide: decideCounter, dispatch: dispatchEffect });

  // Corrupt the ring entry into a legacy shape (no carrierVersion), CAS the document back.
  const envelope = await rawInstanceDocument(ik);
  const legacyReceipts = { ...envelope.value.durableOriginalReceipts };
  legacyReceipts[turnIdOf(ik, 'm-legacy')] = { identity: 'opaque-legacy', receipt: { status: 'admitted' } };
  await store.put(
    scopedDocKey(SCOPE, 'wf-instance', WORKFLOW, ik),
    { ...envelope.value, durableOriginalReceipts: legacyReceipts },
    { mustMatchRevision: envelope.revision },
  );
  await assert.rejects(
    engine.readOriginalReceipt({ target: target(ik), messageId: 'm-legacy', input: { amount: 1 }, intentType: 'note' }),
    (error: unknown) => (error as { code?: string }).code === 'K02_TURN_RECEIPT_LEGACY_UNREADABLE',
  );

  // A legacy ARCHIVE record for an otherwise-unknown turn also fails closed.
  await store.put(scopedDocKey(SCOPE, 'receipt-archive', turnIdOf(ik, 'm-old')), { identity: 'opaque-legacy' }, { mustBeAbsent: true });
  await assert.rejects(
    engine.readOriginalReceipt({ target: target(ik), messageId: 'm-old', input: { amount: 2 }, intentType: 'note' }),
    (error: unknown) => (error as { code?: string }).code === 'K02_TURN_RECEIPT_LEGACY_UNREADABLE',
  );
});

test('K02-P2 20 turns, every derived archive record destroyed: replays keep answering from the same-CAS receipts and new turns keep admitting (17+ liveness)', async () => {
  const ik = 'k02:i:p2-seq';
  const engine = makeEngine({ instanceKey: ik });
  await engine.openInstance({ target: target(ik), packageId: 'pkg' });
  for (let index = 1; index <= 20; index += 1) {
    const outcome = await engine.admitTurn({
      target: target(ik),
      messageId: `seq-${String(index)}`,
      intentType: 'note',
      input: { seq: index, effects: [{ effectType: 'effect:note' }] },
      decide: decideCounter,
      dispatch: dispatchEffect,
    });
    assert.equal(outcome.status, 'admitted');
    assert.equal(outcome.idempotentReplay, false);
  }
  assert.equal((await rawInstanceDocument(ik)).value.stateRevision, 20);

  const destroyed = await destroyEveryArchiveRecord();
  assert.ok(destroyed >= 20, `destroyed ${String(destroyed)} derived archive records`);
  const dispatchesBefore = dispatches.length;

  // Every one of the 20 admitted turns still replays the exact original receipt.
  for (let index = 1; index <= 20; index += 1) {
    const replay = await engine.admitTurn({
      target: target(ik),
      messageId: `seq-${String(index)}`,
      intentType: 'note',
      input: { seq: index, effects: [{ effectType: 'effect:note' }] },
      decide: decideCounter,
      dispatch: dispatchEffect,
    });
    assert.equal(replay.status, 'admitted');
    assert.equal(replay.idempotentReplay, true, `seq-${String(index)} replays from the same-CAS receipt after total archive loss`);
    assert.equal(replay.originalReceipt.instance.stateRevision, index, 'the original projection, not the newest snapshot');
  }
  assert.equal(dispatches.length, dispatchesBefore, 'zero new effect activity across all 20 replays');
  assert.equal((await rawInstanceDocument(ik)).value.stateRevision, 20, 'replays moved no state');

  // NEW turns keep admitting: the 17+ liveness — no global block exists.
  const twentyFirst = await engine.admitTurn({ target: target(ik), messageId: 'seq-21', intentType: 'note', input: { seq: 21, effects: [{ effectType: 'effect:note' }] }, decide: decideCounter, dispatch: dispatchEffect });
  assert.equal(twentyFirst.status, 'admitted');
  assert.equal(twentyFirst.stateRevision, 21);
});

test('K02-P2 restart durability: store closed and reopened keeps the receipt truth and keeps replaying/admitting', async () => {
  const ik = 'k02:i:p2-restart';
  {
    const engine = makeEngine({ instanceKey: ik });
    await engine.openInstance({ target: target(ik), packageId: 'pkg' });
    await engine.admitTurn({ target: target(ik), messageId: 'before-restart', intentType: 'note', input: { amount: 7 }, decide: decideCounter, dispatch: dispatchEffect });
    await store.close();
  }
  store = await openSqliteCasStore({ path: sqlitePath });
  {
    const engine = makeEngine({ instanceKey: ik });
    const document = await rawInstanceDocument(ik);
    assert.equal(document.value.stateRevision, 1, 'the committed state survived the restart');
    assert.ok(document.value.durableOriginalReceipts[turnIdOf(ik, 'before-restart')], 'the same-CAS original receipt survived the restart');
    const replay = await engine.admitTurn({ target: target(ik), messageId: 'before-restart', intentType: 'note', input: { amount: 7 }, decide: decideCounter, dispatch: dispatchEffect });
    assert.equal(replay.idempotentReplay, true, 'post-restart replay answers the durable original');
    const next = await engine.admitTurn({ target: target(ik), messageId: 'after-restart', intentType: 'note', input: { amount: 8 }, decide: decideCounter, dispatch: dispatchEffect });
    assert.equal(next.status, 'admitted');
    assert.equal(next.stateRevision, 2);
  }
});

test('K02-P3 fatal store fault on the receipt-bearing CAS fails closed typed with zero durable partial state', async () => {
  const ik = 'k02:i:p3-fault';
  const engine = makeEngine({ instanceKey: ik });
  await engine.openInstance({ target: target(ik), packageId: 'pkg' });
  await engine.admitTurn({ target: target(ik), messageId: 'fault-base', intentType: 'note', input: { amount: 1 }, decide: decideCounter, dispatch: dispatchEffect });
  const before = await rawInstanceDocument(ik);
  const dispatchesBefore = dispatches.length;

  store.failNextPutMatching('wf-instance');
  await assert.rejects(
    engine.admitTurn({ target: target(ik), messageId: 'faulted', intentType: 'note', input: { amount: 2 }, decide: decideCounter, dispatch: dispatchEffect }),
    (error: unknown) => (error as { code?: string }).code === 'K02_TURN_RECEIPT_STORE_FAULT',
  );
  const after = await rawInstanceDocument(ik);
  assert.equal(after.revision, before.revision, 'no state move');
  assert.equal(after.value.stateRevision, before.value.stateRevision);
  assert.ok(after.value.durableOriginalReceipts[turnIdOf(ik, 'faulted')] === undefined, 'no receipt for the faulted turn');
  assert.equal(dispatches.length, dispatchesBefore, 'zero dispatches for the faulted turn');

  // The store stays truthful afterwards: the same turn can be re-submitted and admits cleanly.
  const retried = await engine.admitTurn({ target: target(ik), messageId: 'faulted', intentType: 'note', input: { amount: 2 }, decide: decideCounter, dispatch: dispatchEffect });
  assert.equal(retried.status, 'admitted');
});

test('K02-P3 a fault on the OPTIONAL archive write never fails the committed ACK', async () => {
  const ik = 'k02:i:p3-archfault';
  const engine = makeEngine({ instanceKey: ik });
  await engine.openInstance({ target: target(ik), packageId: 'pkg' });
  store.failNextPutMatching('receipt-archive');
  const admitted = await engine.admitTurn({ target: target(ik), messageId: 'archive-faulted', intentType: 'note', input: { amount: 3 }, decide: decideCounter, dispatch: dispatchEffect });
  assert.equal(admitted.status, 'admitted', 'the ACK stands');
  assert.equal(admitted.idempotentReplay, false);
  assert.equal(admitted.archive.status, 'not_recorded', 'the archive failure is an honest independent observation');
  const document = await rawInstanceDocument(ik);
  assert.ok(document.value.durableOriginalReceipts[turnIdOf(ik, 'archive-faulted')], 'the original receipt is durable in the same CAS regardless');
  const replay = await engine.admitTurn({ target: target(ik), messageId: 'archive-faulted', intentType: 'note', input: { amount: 3 }, decide: decideCounter, dispatch: dispatchEffect });
  assert.equal(replay.idempotentReplay, true, 'replay answers from the same-CAS receipt, not the lost archive');
});

test('K02-P1 ring maintenance: archive-gated eviction with fault-tolerant growth — admission never blocks, nothing is forgotten', async () => {
  const ik = 'k02:i:p1-ring';
  const engine = makeEngine({ instanceKey: ik, ringBound: 17 });
  await engine.openInstance({ target: target(ik), packageId: 'pkg' });
  for (let index = 1; index <= 17; index += 1) {
    await engine.admitTurn({ target: target(ik), messageId: `ring-${String(index)}`, intentType: 'note', input: { seq: index }, decide: decideCounter, dispatch: dispatchEffect });
  }
  assert.equal(Object.keys((await rawInstanceDocument(ik)).value.durableOriginalReceipts).length, 17);

  // The 18th admission with a FAULTING archive write: the oldest stays past the bound (growth), admission proceeds.
  store.failNextPutMatching('receipt-archive');
  const eighteenth = await engine.admitTurn({ target: target(ik), messageId: 'ring-18', intentType: 'note', input: { seq: 18 }, decide: decideCounter, dispatch: dispatchEffect });
  assert.equal(eighteenth.status, 'admitted', 'admission is never blocked by a derived-record failure');
  let receipts = (await rawInstanceDocument(ik)).value.durableOriginalReceipts;
  assert.equal(Object.keys(receipts).length, 18, 'fault-tolerant ring growth: the oldest stays until durably archived');
  assert.ok(receipts[turnIdOf(ik, 'ring-1')], 'nothing is silently forgotten');

  // With the store healthy again, the next admission archives the pending oldest and evicts.
  const nineteenth = await engine.admitTurn({ target: target(ik), messageId: 'ring-19', intentType: 'note', input: { seq: 19 }, decide: decideCounter, dispatch: dispatchEffect });
  assert.equal(nineteenth.status, 'admitted');
  receipts = (await rawInstanceDocument(ik)).value.durableOriginalReceipts;
  assert.ok(Object.keys(receipts).length <= 18, 'the ring returns toward its bound once the archive is durable');
  const evictedReplay = await engine.admitTurn({ target: target(ik), messageId: 'ring-1', intentType: 'note', input: { seq: 1 }, decide: decideCounter, dispatch: dispatchEffect });
  assert.equal(evictedReplay.idempotentReplay, true, 'a ring-evicted turn replays from its durable archive');
});
