// v0.6 T008-R1 (issue #598): durable DECISION_RECEIPT seam on the Expo SQLite
// runtime store. The real ExpoSqliteRuntimeStore adapter stack runs under Node
// through the T-024 logical-parity driver (better-sqlite3 behind the structural
// ExpoSqliteModuleLike interfaces). Honesty boundary: this is logical-parity
// evidence — it is NOT real Expo/Hermes device durability; T009 owns that.
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
  type RuntimeObservationPage,
  type RuntimeObservationReadRequest,
  type RuntimeObservationRecord,
  type RuntimeObservationStreamRef,
} from '@kaicreator/domain-harness';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '@kaicreator/domain-harness/v2';
import { openParityStack } from './operation-script.js';

const NOW = '2026-10-04T00:00:00.000Z';
const target: WorkflowAddress = { workflowId: 'expo-decision', instanceKey: 'r1' };

const IDENTITY: DomainIntelligencePackageIdentity = {
  domainId: 't006-expo-receipt',
  version: '1.0.0-t006',
  packageId: 'pkg-t006-expo-receipt',
  contentDigest: 'pkg-t006-expo-receipt',
  formatVersion: '0.2',
  runtimeContractMajor: 2,
  executionEngineMajor: 2,
  requiredCapabilities: [],
};

/** Narrow structural surface of the receipt seam under test. */
interface ReceiptCapableStore {
  createInstanceWithObservation(
    snapshot: WorkflowInstanceSnapshot,
    intent: RuntimeObservationIntent,
  ): Promise<readonly RuntimeObservationRecord[]>;
  recordDecisionReceipt(request: DecisionReceiptRecordRequest): Promise<RuntimeObservationRecord>;
  readObservations(request: RuntimeObservationReadRequest): Promise<RuntimeObservationPage>;
}

function streamRef(forTarget: WorkflowAddress): RuntimeObservationStreamRef {
  return { target: forTarget, package: IDENTITY, epochId: RUNTIME_OBSERVATION_INITIAL_EPOCH_ID };
}

function deniedReceipt(turn: string): DecisionResolutionReceipt {
  return {
    decisionId: 'decide-quote',
    declarationDigest: 'sha256:declaration-digest',
    durableControlTurnId: `turn-${turn}`,
    disposition: 'denied',
    source: 'exact-cache',
    freshModelCallCount: 0,
    llmAvoided: true,
    cacheRead: 'hit',
    governanceBindingDigest: 'sha256:governance',
    failure: { kind: 'admission-denied', reason: 'guard' },
  };
}

function receiptRequest(turn: string): DecisionReceiptRecordRequest {
  return {
    target,
    packageIdentity: IDENTITY,
    receipt: deniedReceipt(turn),
    observedAt: NOW,
  };
}

function instanceSnapshot(forTarget: WorkflowAddress): WorkflowInstanceSnapshot {
  return {
    address: forTarget,
    correlationId: 'corr-t006-expo',
    packageId: IDENTITY.packageId,
    lifecycle: 'active',
    stateRevision: 0,
    state: {},
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function tempDir(t: test.TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t006-expo-receipt-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  return directory;
}

async function openReceiptStore(directory: string): Promise<{ store: ReceiptCapableStore; close: () => Promise<void> }> {
  const stack = await openParityStack('expo', directory);
  const store = stack.store as unknown as ReceiptCapableStore;
  return { store, close: stack.close };
}

test('t006 expo: the runtime store is truthfully receipt-capable', async (t) => {
  const { store, close } = await openReceiptStore(tempDir(t));
  try {
    assert.equal(isDecisionReceiptObservationStore(store), true);
  } finally {
    await close();
  }
});

test('t006 expo: receipt appends contiguously, survives close + reopen, cursor resumes', async (t) => {
  const directory = tempDir(t);
  const first = await openReceiptStore(directory);
  let resumeCursor: string;
  try {
    await first.store.createInstanceWithObservation(instanceSnapshot(target), {
      kind: 'INSTANCE_OPENED',
      packageIdentity: IDENTITY,
      observedAt: NOW,
    });
    const record = await first.store.recordDecisionReceipt(receiptRequest('t1'));
    assert.equal(record.kind, 'DECISION_RECEIPT');
    assert.equal(record.sequence, 2);
    assert.deepEqual(record.decisionReceipt, deniedReceipt('t1'));

    const partial = await first.store.readObservations({ stream: streamRef(target), limit: 1 });
    assert.equal(partial.records.length, 1);
    assert.ok(partial.nextCursor !== undefined);
    // The cursor encodes the exact stream identity + sequence, both stable
    // across close/reopen of the same database file.
    resumeCursor = partial.nextCursor;
    assert.equal(partial.highWatermark, 2);
  } finally {
    await first.close();
  }

  // Reopen the SAME database file with a fresh adapter stack.
  const reopened = await openReceiptStore(directory);
  try {
    assert.equal(isDecisionReceiptObservationStore(reopened.store), true);

    // The durable receipt survived the restart; the pre-restart cursor
    // resumes exactly after sequence 1.
    const resumed = await reopened.store.readObservations({
      stream: streamRef(target),
      afterCursor: resumeCursor,
    });
    assert.deepEqual(resumed.records.map((entry) => entry.kind), ['DECISION_RECEIPT']);
    assert.deepEqual(resumed.records[0]?.decisionReceipt, deniedReceipt('t1'));

    // New work continues the same durable sequence contiguously.
    const afterRestart = await reopened.store.recordDecisionReceipt(receiptRequest('t2'));
    assert.equal(afterRestart.sequence, 3);
    const full = await reopened.store.readObservations({ stream: streamRef(target) });
    assert.deepEqual(
      full.records.map((entry) => [entry.kind, entry.sequence]),
      [
        ['INSTANCE_OPENED', 1],
        ['DECISION_RECEIPT', 2],
        ['DECISION_RECEIPT', 3],
      ],
    );
    assert.deepEqual(full.records[1]?.decisionReceipt, deniedReceipt('t1'));
    assert.equal(full.highWatermark, 3);
  } finally {
    await reopened.close();
  }
});

test('t006 expo: invalid receipt fails closed BEFORE any durable state change', async (t) => {
  const { store, close } = await openReceiptStore(tempDir(t));
  try {
    await store.createInstanceWithObservation(instanceSnapshot(target), {
      kind: 'INSTANCE_OPENED',
      packageIdentity: IDENTITY,
      observedAt: NOW,
    });
    const before = await store.readObservations({ stream: streamRef(target) });
    assert.equal(before.highWatermark, 1);

    const invalid: DecisionResolutionReceipt = {
      ...deniedReceipt('t1'),
      failure: { kind: 'admission-denied', reason: 'not-a-denial-reason' },
    } as unknown as DecisionResolutionReceipt;
    await assert.rejects(
      store.recordDecisionReceipt({ ...receiptRequest('t1'), receipt: invalid }),
      (error: unknown) =>
        error instanceof RuntimeObservationError && error.code === 'DECISION_RECEIPT_INVALID',
    );

    // Nothing was durably allocated; the next valid append stays contiguous.
    const after = await store.readObservations({ stream: streamRef(target) });
    assert.equal(after.highWatermark, before.highWatermark);
    const valid = await store.recordDecisionReceipt(receiptRequest('t1'));
    assert.equal(valid.sequence, 2);
  } finally {
    await close();
  }
});
