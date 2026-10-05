// v0.6 T008-R1 (issue #598): durable DECISION_RECEIPT seam on the Node SQLite
// reference adapter. Real better-sqlite3 evidence that the production store is
// truthfully receipt-capable: the T006 capability gate reports true, a receipt
// survives record -> close -> reopen, sequences stay contiguous across the
// restart, cursors resume exactly, and invalid receipts / foreign stream
// identities fail closed BEFORE any durable state changes.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  isDecisionReceiptObservationStore,
  RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  RuntimeObservationError,
  type DecisionReceiptRecordRequest,
  type DecisionResolutionReceipt,
  type DomainIntelligencePackageIdentity,
  type RuntimeObservationIntent,
  type RuntimeObservationStreamRef,
} from '@kaicreator/domain-harness';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import { makeTestStore } from './test-helpers.js';

const NOW = '2026-10-04T00:00:00.000Z';
const target: WorkflowAddress = { workflowId: 'decision', instanceKey: 'r1' };

const IDENTITY: DomainIntelligencePackageIdentity = {
  domainId: 't006-receipt',
  version: '1.0.0-t006',
  packageId: 'pkg-t006-receipt',
  contentDigest: 'pkg-t006-receipt',
  formatVersion: '0.2',
  runtimeContractMajor: 2,
  executionEngineMajor: 2,
  requiredCapabilities: [],
};

function streamRef(forTarget: WorkflowAddress): RuntimeObservationStreamRef {
  return { target: forTarget, package: IDENTITY, epochId: RUNTIME_OBSERVATION_INITIAL_EPOCH_ID };
}

function admittedReceipt(turn: string): DecisionResolutionReceipt {
  return {
    decisionId: 'decide-quote',
    declarationDigest: 'sha256:declaration-digest',
    durableControlTurnId: `turn-${turn}`,
    disposition: 'admitted',
    source: 'rule',
    freshModelCallCount: 0,
    llmAvoided: true,
    cacheRead: 'miss',
    governanceBindingDigest: 'sha256:governance',
  };
}

function receiptRequest(turn: string): DecisionReceiptRecordRequest {
  return {
    target,
    packageIdentity: IDENTITY,
    receipt: admittedReceipt(turn),
    observedAt: NOW,
  };
}

function instanceSnapshot(forTarget: WorkflowAddress): WorkflowInstanceSnapshot {
  return {
    address: forTarget,
    correlationId: 'corr-t006',
    packageId: IDENTITY.packageId,
    lifecycle: 'active',
    stateRevision: 0,
    state: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function openedIntent(): RuntimeObservationIntent {
  return { kind: 'INSTANCE_OPENED', packageIdentity: IDENTITY, observedAt: NOW };
}

test('t006 node: the production SQLite store is truthfully receipt-capable', (t) => {
  const { store } = makeTestStore(t);
  assert.equal(isDecisionReceiptObservationStore(store), true);
});

test('t006 node: receipt appends into the existing stream contiguously and reads back', async (t) => {
  const { store } = makeTestStore(t);
  await store.createInstanceWithObservation(instanceSnapshot(target), openedIntent());

  const record = await store.recordDecisionReceipt(receiptRequest('t1'));
  assert.equal(record.kind, 'DECISION_RECEIPT');
  assert.equal(record.sequence, 2, 'receipt takes the next contiguous sequence');
  assert.equal(record.stream.epochId, RUNTIME_OBSERVATION_INITIAL_EPOCH_ID);
  assert.deepEqual(record.decisionReceipt, admittedReceipt('t1'));

  const page = await store.readObservations({ stream: streamRef(target) });
  assert.deepEqual(page.records.map((entry) => entry.kind), ['INSTANCE_OPENED', 'DECISION_RECEIPT']);
  assert.equal(page.highWatermark, 2);
  assert.equal(page.gap, undefined);
});

test('t006 node: receipt survives close + reopen and the sequence stays contiguous', async (t) => {
  // Own temp-dir lifecycle (retrying rmSync) so the restart with two
  // sequential WAL connections cannot race the cleanup on Windows.
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t006-receipt-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  const databasePath = join(directory, 'runtime.sqlite');

  const first = new NodeSqliteRuntimeStore({ path: databasePath });
  await first.createInstanceWithObservation(instanceSnapshot(target), openedIntent());
  await first.recordDecisionReceipt(receiptRequest('t1'));
  // Paginate to prove the cursor mechanism over a receipt-bearing stream.
  const partial = await first.readObservations({ stream: streamRef(target), limit: 1 });
  assert.equal(partial.records.length, 1);
  const resumeCursor = partial.nextCursor;
  assert.ok(resumeCursor !== undefined);
  first.close();

  // Reopen the SAME SQLite file with a fresh adapter instance.
  const reopened = new NodeSqliteRuntimeStore({ path: databasePath });
  assert.equal(isDecisionReceiptObservationStore(reopened), true);

  // The durable receipt survived the restart byte-for-byte.
  const resumed = await reopened.readObservations({ stream: streamRef(target), afterCursor: resumeCursor });
  assert.deepEqual(resumed.records.map((entry) => entry.kind), ['DECISION_RECEIPT']);
  assert.deepEqual(resumed.records[0]?.decisionReceipt, admittedReceipt('t1'));

  // New work after the restart continues the SAME durable sequence.
  const afterRestart = await reopened.recordDecisionReceipt(receiptRequest('t2'));
  assert.equal(afterRestart.sequence, 3, 'sequence continues contiguously across reopen');

  const full = await reopened.readObservations({ stream: streamRef(target) });
  assert.deepEqual(
    full.records.map((entry) => [entry.kind, entry.sequence]),
    [
      ['INSTANCE_OPENED', 1],
      ['DECISION_RECEIPT', 2],
      ['DECISION_RECEIPT', 3],
    ],
  );
  assert.deepEqual(full.records[1]?.decisionReceipt, admittedReceipt('t1'));
  assert.equal(full.highWatermark, 3);
  reopened.close();
});

test('t006 node: invalid receipt fails closed BEFORE any durable state change', async (t) => {
  const { store } = makeTestStore(t);
  await store.createInstanceWithObservation(instanceSnapshot(target), openedIntent());
  await store.recordDecisionReceipt(receiptRequest('t1'));
  const before = await store.readObservations({ stream: streamRef(target) });
  assert.equal(before.highWatermark, 2);

  // Unknown field + undeclared disposition: both violate the closed shape.
  const invalid: DecisionResolutionReceipt = {
    ...admittedReceipt('t2'),
    disposition: 'bogus-disposition',
    smuggledPayload: 'no',
  } as unknown as DecisionResolutionReceipt;
  await assert.rejects(
    store.recordDecisionReceipt({ ...receiptRequest('t2'), receipt: invalid }),
    (error: unknown) =>
      error instanceof RuntimeObservationError && error.code === 'DECISION_RECEIPT_INVALID',
  );

  // Nothing was durably allocated: the stream is unchanged and the next valid
  // append takes the same next sequence (a failed append allocates no sequence).
  const after = await store.readObservations({ stream: streamRef(target) });
  assert.equal(after.highWatermark, before.highWatermark);
  assert.deepEqual(
    after.records.map((entry) => entry.sequence),
    before.records.map((entry) => entry.sequence),
  );
  const valid = await store.recordDecisionReceipt(receiptRequest('t2'));
  assert.equal(valid.sequence, 3);
});

test('t006 node: receipt append against a foreign stream identity fails closed', async (t) => {
  const { store } = makeTestStore(t);
  await store.createInstanceWithObservation(instanceSnapshot(target), openedIntent());

  const foreignIdentity: DomainIntelligencePackageIdentity = {
    ...IDENTITY,
    contentDigest: 'tampered-digest',
  };
  await assert.rejects(
    store.recordDecisionReceipt({ ...receiptRequest('t1'), packageIdentity: foreignIdentity }),
    (error: unknown) =>
      error instanceof RuntimeObservationError && error.code === 'STREAM_IDENTITY_MISMATCH',
  );

  // The mismatch left the durable stream untouched and bound to the exact
  // original identity: a correct identity still appends contiguously.
  const valid = await store.recordDecisionReceipt(receiptRequest('t1'));
  assert.equal(valid.sequence, 2);
  assert.deepEqual(valid.stream.package, IDENTITY);
});
