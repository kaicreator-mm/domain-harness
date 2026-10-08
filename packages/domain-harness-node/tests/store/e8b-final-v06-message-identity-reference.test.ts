/**
 * E8b executable reference — accepted-message logical identity collision
 * vector, re-run against the exact current v0.7 integration candidate
 * (issue #873; authority #589@5980540397 PACK-E E8b + #719 readiness terminal
 * + #873 WEB_REFERENCE_FIXTURE_FREEZE; predecessors T000-MI PR#862 accepted,
 * T000 currentness #528@6024748740, T008E #726@6032592242 NO_DELTA_REQUIRED).
 *
 * ENVIRONMENT=LOCAL_AGENT (ZCode kimi-executor, kimi-for-coding).
 * REAL_HOST_POSTURE=REAL_SUPPORTED_NODE_HOST (Node v24.21.0, better-sqlite3
 * 12.11.1, real durable SQLite database files — no mocks).
 * SOURCE_MUTATION=NONE (tests-only write set).
 *
 * Reference-falsification scope under test (PACK-E E8b MESSAGE_IDENTITY_VECTOR):
 *  - the frozen final-v0.6 A8 duplicate-compatibility contract remains
 *    supported on the candidate: a positive exact / canonically-equivalent
 *    (object-key-order permuted) retry of the same target+messageId returns
 *    the original durable duplicate ack (first-acceptance targetSequence and
 *    package binding), never a second acceptance;
 *  - for each materially distinct member of the frozen identity tuple
 *    (type, canonical payload, effective correlationId, causationId,
 *    contractVersion, target package binding) an incompatible same-target
 *    +messageId replay rejects with the stable MESSAGE_IDENTITY_COLLISION
 *    category BEFORE duplicate ACK/result reuse and BEFORE any durable
 *    mutation (no target-sequence advance, no second MESSAGE_ACCEPTED
 *    observation, instance state / disposition / effect journal untouched);
 *  - the protection is durable: it survives connection close/reopen against
 *    the same database file.
 *
 * This suite exercises the real durable duplicate boundary of
 * NodeSqliteRuntimeStore (the guard is invoked by the store itself); it does
 * not call requireAcceptedMessageIdentityCompatible(...) as the proof.
 *
 * Fixture identity: E8B_FINAL_V06_COMPAT_V1 (#873 freeze,
 * MANIFEST_SHA256=10354b6d51962938ed5e9ca56960f9335bbd0a0598665f669a0f4d31bd7b84c4).
 */
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import test from 'node:test';
import {
  RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  type RuntimeObservationIntent,
  type RuntimeObservationRecord,
} from '@kaicreator/domain-harness';
import {
  AcceptedMessageIdentityCollisionError,
  type DomainMessage,
  type WorkflowAddress,
} from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import {
  makeConformanceAddress,
  makeConformanceInstance,
} from '../../../domain-harness/tests/helpers/runtime-store-conformance.ts';
import { makeTestStore } from './test-helpers.js';

const T0 = '2026-09-18T00:00:00.000Z';

// Canonical package identity for observation-intent construction: packageId
// must match the instance binding recorded at acceptance.
const E8B_PACKAGE_IDENTITY = {
  domainId: 'e8b-final-v06-compat',
  version: '1.0.0',
  packageId: 'pkg-conformance',
  contentDigest: 'sha256-e8b-fixture',
  formatVersion: '1',
  runtimeContractMajor: 1,
  executionEngineMajor: 1,
  requiredCapabilities: [],
};

function acceptanceIntent(observedAt: string): RuntimeObservationIntent {
  return { kind: 'MESSAGE_ACCEPTED', packageIdentity: E8B_PACKAGE_IDENTITY, observedAt };
}

function e8bMessage(target: WorkflowAddress, overrides: Partial<DomainMessage> = {}): DomainMessage {
  return {
    messageId: 'e8b-m-1',
    target,
    type: 'RESERVE',
    payload: { b: 2, a: 1 },
    ...overrides,
  };
}

function assertCollision(error: unknown): AcceptedMessageIdentityCollisionError {
  assert.ok(error instanceof Error, 'expected a rejection, got a result');
  assert.ok(
    error instanceof AcceptedMessageIdentityCollisionError,
    `expected MESSAGE_IDENTITY_COLLISION, got ${error.name}: ${error.message}`,
  );
  assert.equal(error.code, 'MESSAGE_IDENTITY_COLLISION');
  return error;
}

async function expectCollision(action: () => Promise<unknown>): Promise<AcceptedMessageIdentityCollisionError> {
  try {
    await action();
  } catch (error) {
    return assertCollision(error);
  }
  throw new Error('expected MESSAGE_IDENTITY_COLLISION rejection, but the replay was accepted');
}

function readNextTargetSequence(databasePath: string, target: WorkflowAddress): number {
  const reader = new Database(databasePath);
  try {
    const row = reader
      .prepare('SELECT next_target_sequence FROM dh_v2_instances WHERE workflow_id = ? AND instance_key = ?')
      .get(target.workflowId, target.instanceKey) as { next_target_sequence: number };
    return row.next_target_sequence;
  } finally {
    reader.close();
  }
}

function readAcceptedObservationRows(databasePath: string, target: WorkflowAddress): Array<{
  kind: string;
  sequence: number;
}> {
  const reader = new Database(databasePath);
  try {
    const rows = reader
      .prepare(
        `SELECT record_json, sequence FROM dh_v3_observation_records
          WHERE workflow_id = ? AND instance_key = ? AND epoch_id = ?
          ORDER BY sequence`,
      )
      .all(target.workflowId, target.instanceKey, RUNTIME_OBSERVATION_INITIAL_EPOCH_ID) as Array<{
      record_json: string;
      sequence: number;
    }>;
    return rows.map((row) => {
      const record = JSON.parse(row.record_json) as Pick<RuntimeObservationRecord, 'kind'>;
      return { kind: record.kind, sequence: row.sequence };
    });
  } finally {
    reader.close();
  }
}

test('E8b MI positive: exact and canonically-equivalent retry returns the original durable duplicate ack', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('e8b-mi-positive');
  await store.createInstance(makeConformanceInstance('e8b-mi-positive', T0));

  const first = await store.acceptMessage(
    e8bMessage(target, { causationId: 'cause-1', contractVersion: '1' }),
  );
  assert.equal(first.status, 'accepted');
  assert.equal(first.targetSequence, 1);

  // Exact logical replay: same durable ack facts, marked duplicate.
  const identical = await store.acceptMessage(
    e8bMessage(target, { causationId: 'cause-1', contractVersion: '1' }),
  );
  assert.deepEqual(identical, { ...first, status: 'duplicate' });

  // Canonically-equivalent replay: object key serialization order permuted,
  // correlation explicitly equal to the instance default — still one identity.
  const permuted = await store.acceptMessage(
    e8bMessage(target, {
      payload: { a: 1, b: 2 },
      correlationId: 'corr-e8b-mi-positive',
      causationId: 'cause-1',
      contractVersion: '1',
    }),
  );
  assert.deepEqual(permuted, { ...first, status: 'duplicate' });
  assert.equal(permuted.packageId, first.packageId);

  // Array order is NOT canonicalized: a permuted array is a different payload.
  await expectCollision(() =>
    store.acceptMessage(
      e8bMessage(target, { payload: { a: 1, list: [2, 1] }, causationId: 'cause-1', contractVersion: '1' }),
    ),
  );
});

test('E8b MI negatives: every materially distinct tuple member fails closed on same target+messageId reuse', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('e8b-mi-negatives');
  await store.createInstance(makeConformanceInstance('e8b-mi-negatives', T0));
  await store.acceptMessage(
    e8bMessage(target, { causationId: 'cause-1', contractVersion: '1' }),
  );
  // A second accepted message without optional metadata gives the
  // absent-over-present negatives a durable counterpart.
  await store.acceptMessage(e8bMessage(target, { messageId: 'e8b-m-no-meta' }));

  // type
  await expectCollision(() =>
    store.acceptMessage(
      e8bMessage(target, { type: 'RELEASE', causationId: 'cause-1', contractVersion: '1' }),
    ),
  );
  // canonical payload (value change; array order preserved as identity)
  await expectCollision(() =>
    store.acceptMessage(
      e8bMessage(target, { payload: { b: 3, a: 1 }, causationId: 'cause-1', contractVersion: '1' }),
    ),
  );
  await expectCollision(() =>
    store.acceptMessage(
      e8bMessage(target, { payload: { a: 1, list: [2, 1] }, causationId: 'cause-1', contractVersion: '1' }),
    ),
  );
  // effective correlationId
  await expectCollision(() =>
    store.acceptMessage(
      e8bMessage(target, {
        correlationId: 'other-correlation',
        causationId: 'cause-1',
        contractVersion: '1',
      }),
    ),
  );
  // causationId: absent-over-present, present-over-absent, different value
  await expectCollision(() => store.acceptMessage(e8bMessage(target, { contractVersion: '1' })));
  await expectCollision(() =>
    store.acceptMessage(e8bMessage(target, { messageId: 'e8b-m-no-meta', causationId: 'cause-1' })),
  );
  await expectCollision(() =>
    store.acceptMessage(e8bMessage(target, { causationId: 'cause-2', contractVersion: '1' })),
  );
  // contractVersion: absent-over-present, present-over-absent, different value
  await expectCollision(() =>
    store.acceptMessage(e8bMessage(target, { messageId: 'e8b-m-no-meta', contractVersion: '1' })),
  );
  await expectCollision(() => store.acceptMessage(e8bMessage(target, { causationId: 'cause-1' })));
  await expectCollision(() =>
    store.acceptMessage(e8bMessage(target, { causationId: 'cause-1', contractVersion: '2' })),
  );
  // (target package binding has its own dedicated matrix test below)

  // The first accepted message survived every collision attempt untouched.
  const disposition = await store.getMessageDisposition(target, 'e8b-m-1');
  assert.equal(disposition?.disposition, 'accepted');
  const replay = await store.acceptMessage(
    e8bMessage(target, { causationId: 'cause-1', contractVersion: '1' }),
  );
  assert.equal(replay.status, 'duplicate');
});

test('E8b MI package binding: rebound target package fails closed with the packageId conflict named', async (t) => {
  const { store, databasePath } = makeTestStore(t);
  const target = makeConformanceAddress('e8b-mi-binding');
  await store.createInstance(makeConformanceInstance('e8b-mi-binding', T0));
  const first = await store.acceptMessage(e8bMessage(target));

  const rebind = new Database(databasePath);
  try {
    rebind
      .prepare(
        "UPDATE dh_v2_instances SET package_id = 'pkg-rebound' WHERE workflow_id = ? AND instance_key = ?",
      )
      .run(target.workflowId, target.instanceKey);
  } finally {
    rebind.close();
  }

  const error = await expectCollision(() => store.acceptMessage(e8bMessage(target)));
  assert.match(error.message, /packageId/);
  assert.equal(first.status, 'accepted');
});

test('E8b MI no-mutation: collision path advances nothing and emits no second MESSAGE_ACCEPTED observation', async (t) => {
  const { store, databasePath } = makeTestStore(t);
  const target = makeConformanceAddress('e8b-mi-observed');
  await store.createInstance(makeConformanceInstance('e8b-mi-observed', T0));

  const { records } = await store.acceptMessageWithObservation(e8bMessage(target), acceptanceIntent(T0));
  assert.equal(records.length, 1);
  assert.equal(records[0]?.kind, 'MESSAGE_ACCEPTED');

  // Compatible replay: original ack, zero new observations.
  const duplicate = await store.acceptMessageWithObservation(e8bMessage(target), acceptanceIntent(T0));
  assert.equal(duplicate.ack.status, 'duplicate');
  assert.equal(duplicate.records.length, 0);

  // Incompatible replay: rejection before any new durable write.
  const sequenceBefore = readNextTargetSequence(databasePath, target);
  await expectCollision(() =>
    store.acceptMessageWithObservation(
      e8bMessage(target, { type: 'RELEASE' }),
      acceptanceIntent(T0),
    ),
  );
  assert.equal(readNextTargetSequence(databasePath, target), sequenceBefore);
  assert.deepEqual(readAcceptedObservationRows(databasePath, target), [
    { kind: 'MESSAGE_ACCEPTED', sequence: 1 },
  ]);

  const page = await store.readObservations({
    stream: {
      target,
      package: E8B_PACKAGE_IDENTITY,
      epochId: RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
    },
  });
  assert.equal(
    page.records.filter((record) => record.kind === 'MESSAGE_ACCEPTED').length,
    1,
    'no second acceptance observation was recorded',
  );

  // The mailbox still advances normally after the collision.
  const next = await store.acceptMessage(e8bMessage(target, { messageId: 'e8b-m-2' }));
  assert.equal(next.targetSequence, 2);
});

test('E8b MI no-mutation: collision path leaves instance state, disposition and effect journal byte-identical', async (t) => {
  const { store, databasePath } = makeTestStore(t);
  const target = makeConformanceAddress('e8b-mi-immutable');
  await store.createInstance(makeConformanceInstance('e8b-mi-immutable', T0));
  const first = await store.acceptMessage(e8bMessage(target));
  assert.ok(await store.markMessageProcessing(target, 'e8b-m-1', T0));
  await store.commitProcessedMessage({
    target,
    messageId: 'e8b-m-1',
    expectedTargetSequence: first.targetSequence,
    nextState: { count: 1 },
    nextLifecycle: 'active',
    output: { result: 'kept' },
    updatedAt: T0,
  });
  await store.beginEffect({
    effectId: 'e8b-effect-1',
    target,
    sourceMessageId: 'e8b-m-1',
    effectKind: 'test',
    effectSemantics: 'idempotent',
    status: 'started',
    attempt: 1,
    input: { value: 1 },
    startedAt: T0,
  });
  await store.completeEffect({
    effectId: 'e8b-effect-1',
    status: 'completed',
    output: { value: 2 },
    completedAt: T0,
  });

  const instanceBefore = await store.getInstance(target);
  const dispositionBefore = await store.getMessageDisposition(target, 'e8b-m-1');
  const effectBefore = await store.getEffect('e8b-effect-1');
  const sequenceBefore = readNextTargetSequence(databasePath, target);

  await expectCollision(() => store.acceptMessage(e8bMessage(target, { type: 'RELEASE' })));

  assert.deepEqual(await store.getInstance(target), instanceBefore);
  assert.deepEqual(await store.getMessageDisposition(target, 'e8b-m-1'), dispositionBefore);
  assert.deepEqual(await store.getEffect('e8b-effect-1'), effectBefore);
  assert.equal(readNextTargetSequence(databasePath, target), sequenceBefore);

  // A command outcome row can only be written by the processed-command commit
  // seam, which an acceptMessage rejection never reaches.
  const next = await store.acceptMessage(e8bMessage(target, { messageId: 'e8b-m-2' }));
  assert.equal(next.targetSequence, 2);
});

test('E8b MI persistence: collision protection and valid duplicate replay survive connection close/reopen', async (t) => {
  const { store, databasePath } = makeTestStore(t);
  const target = makeConformanceAddress('e8b-mi-restart');
  await store.createInstance(makeConformanceInstance('e8b-mi-restart', T0));
  const first = await store.acceptMessage(
    e8bMessage(target, { causationId: 'cause-1', contractVersion: '1' }),
  );
  store.close();

  const reopened = new NodeSqliteRuntimeStore({ path: databasePath });
  try {
    await expectCollision(() =>
      reopened.acceptMessage(
        e8bMessage(target, { type: 'RELEASE', causationId: 'cause-1', contractVersion: '1' }),
      ),
    );
    await expectCollision(() =>
      reopened.acceptMessage(
        e8bMessage(target, { payload: { b: 9, a: 1 }, causationId: 'cause-1', contractVersion: '1' }),
      ),
    );

    const replay = await reopened.acceptMessage(
      e8bMessage(target, {
        correlationId: 'corr-e8b-mi-restart',
        payload: { a: 1, b: 2 },
        causationId: 'cause-1',
        contractVersion: '1',
      }),
    );
    assert.deepEqual(replay, { ...first, status: 'duplicate' });

    const next = await reopened.acceptMessage(e8bMessage(target, { messageId: 'e8b-m-2' }));
    assert.equal(next.targetSequence, first.targetSequence + 1);
  } finally {
    reopened.close();
  }
});
