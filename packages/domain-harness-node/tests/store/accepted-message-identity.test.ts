import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import test from 'node:test';
import {
  RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
  type RuntimeObservationIntent,
  type RuntimeObservationRecord,
} from '@kaicreator/domain-harness';
import type { DomainMessage, WorkflowAddress } from '@kaicreator/domain-harness/v2';
import { AcceptedMessageIdentityCollisionError } from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import { makeConformanceAddress, makeConformanceInstance } from '../../../domain-harness/tests/helpers/runtime-store-conformance.ts';
import { makeTestStore } from './test-helpers.js';

const T0 = '2026-09-18T00:00:00.000Z';

// Canonical package identity for observation-intent construction: only
// packageId must match the instance binding; the remaining fields just have to
// be stable across the calls of one test.
const CONFORMANCE_PACKAGE_IDENTITY = {
  domainId: 'conformance',
  version: '1.0.0',
  packageId: 'pkg-conformance',
  contentDigest: 'sha256-conformance-fixture',
  formatVersion: '1',
  runtimeContractMajor: 1,
  executionEngineMajor: 1,
  requiredCapabilities: [],
};

function makeAcceptanceIntent(observedAt: string): RuntimeObservationIntent {
  return {
    kind: 'MESSAGE_ACCEPTED',
    packageIdentity: CONFORMANCE_PACKAGE_IDENTITY,
    observedAt,
  };
}

function makeMessage(target: WorkflowAddress, overrides: Partial<DomainMessage> = {}): DomainMessage {
  return {
    messageId: 'm-1',
    target,
    type: 'increment',
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

async function expectIdentityCollision(action: () => Promise<unknown>): Promise<AcceptedMessageIdentityCollisionError> {
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

function readObservationRows(databasePath: string, target: WorkflowAddress): Array<{
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

test('A8 cases 1+2+3+14: identical and logically compatible replay returns the original durable duplicate ack', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('identity');
  await store.createInstance(makeConformanceInstance('identity', T0));

  const first = await store.acceptMessage(
    makeMessage(target, { causationId: 'cause-1', contractVersion: '1' }),
  );
  assert.equal(first.status, 'accepted');
  assert.equal(first.targetSequence, 1);

  // Case 1: exact same logical message.
  const identical = await store.acceptMessage(
    makeMessage(target, { causationId: 'cause-1', contractVersion: '1' }),
  );
  assert.deepEqual(identical, { ...first, status: 'duplicate' });

  // Case 2: object key-order difference alone stays compatible.
  const keyOrderReplay = await store.acceptMessage(
    makeMessage(target, { payload: { a: 1, b: 2 }, causationId: 'cause-1', contractVersion: '1' }),
  );
  assert.deepEqual(keyOrderReplay, { ...first, status: 'duplicate' });

  // Case 3: omitted correlation and explicit instance-equal correlation are
  // compatible after effective-correlation normalization.
  const explicitInstanceCorrelation = await store.acceptMessage(
    makeMessage(target, {
      correlationId: 'corr-identity',
      causationId: 'cause-1',
      contractVersion: '1',
    }),
  );
  assert.deepEqual(explicitInstanceCorrelation, { ...first, status: 'duplicate' });

  // Case 14: duplicate ack preserves the durable acceptance facts, and the
  // next distinct message continues the sequence without gaps.
  assert.equal(identical.acceptedAt, first.acceptedAt);
  assert.equal(identical.targetSequence, first.targetSequence);
  assert.equal(identical.packageId, first.packageId);
  const second = await store.acceptMessage(makeMessage(target, { messageId: 'm-2' }));
  assert.equal(second.targetSequence, first.targetSequence + 1);
});

test('A8 cases 4+5+6+7+8: incompatible identity fails closed with MESSAGE_IDENTITY_COLLISION', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('collision');
  await store.createInstance(makeConformanceInstance('collision', T0));
  await store.acceptMessage(makeMessage(target, { causationId: 'cause-1', contractVersion: '1' }));
  // A second message accepted without optional metadata: present-over-absent
  // metadata replays must collide on the metadata dimension.
  await store.acceptMessage(makeMessage(target, { messageId: 'm-no-meta' }));

  // Case 4: different type.
  await expectIdentityCollision(() =>
    store.acceptMessage(makeMessage(target, { type: 'decrement', causationId: 'cause-1', contractVersion: '1' })),
  );
  // Case 5: different canonical payload.
  await expectIdentityCollision(() =>
    store.acceptMessage(makeMessage(target, { payload: { b: 3, a: 1 }, causationId: 'cause-1', contractVersion: '1' })),
  );
  // Case 6: different effective correlationId.
  await expectIdentityCollision(() =>
    store.acceptMessage(
      makeMessage(target, {
        correlationId: 'other-correlation',
        causationId: 'cause-1',
        contractVersion: '1',
      }),
    ),
  );
  // Case 7: causationId absent-over-present, present-over-absent, different value.
  await expectIdentityCollision(() =>
    store.acceptMessage(makeMessage(target, { contractVersion: '1' })),
  );
  await expectIdentityCollision(() =>
    store.acceptMessage(makeMessage(target, { messageId: 'm-no-meta', causationId: 'cause-1' })),
  );
  await expectIdentityCollision(() =>
    store.acceptMessage(makeMessage(target, { causationId: 'cause-2', contractVersion: '1' })),
  );
  // Case 8: contractVersion absent-over-present, present-over-absent, different value.
  await expectIdentityCollision(() =>
    store.acceptMessage(makeMessage(target, { messageId: 'm-no-meta', contractVersion: '1' })),
  );
  await expectIdentityCollision(() =>
    store.acceptMessage(makeMessage(target, { causationId: 'cause-1' })),
  );
  await expectIdentityCollision(() =>
    store.acceptMessage(makeMessage(target, { causationId: 'cause-1', contractVersion: '2' })),
  );

  // The first accepted message survived every collision attempt untouched, and
  // valid replay of it still returns the original duplicate ack (case 14).
  const disposition = await store.getMessageDisposition(target, 'm-1');
  assert.equal(disposition?.disposition, 'accepted');
  const replay = await store.acceptMessage(
    makeMessage(target, { causationId: 'cause-1', contractVersion: '1' }),
  );
  assert.equal(replay.status, 'duplicate');
});

test('A8 case 9: incompatible target package binding must not reuse the prior duplicate result', async (t) => {
  const { store, databasePath } = makeTestStore(t);
  const target = makeConformanceAddress('binding');
  await store.createInstance(makeConformanceInstance('binding', T0));
  const first = await store.acceptMessage(makeMessage(target));

  // Simulate a durable rebinding of the target instance away from the package
  // recorded at first acceptance (test-only direct mutation emulating an
  // out-of-band rebind; the RuntimeStore surface has no rebinding operation).
  const rebind = new Database(databasePath);
  try {
    rebind
      .prepare("UPDATE dh_v2_instances SET package_id = 'pkg-rebound' WHERE workflow_id = ? AND instance_key = ?")
      .run(target.workflowId, target.instanceKey);
  } finally {
    rebind.close();
  }

  const error = await expectIdentityCollision(() => store.acceptMessage(makeMessage(target)));
  assert.match(error.message, /packageId/);
  assert.equal(first.status, 'accepted');
});

test('A8 cases 10+11: collision path does not advance the target sequence and does not create a second MESSAGE_ACCEPTED observation', async (t) => {
  const { store, databasePath } = makeTestStore(t);
  const target = makeConformanceAddress('observed');
  await store.createInstance(makeConformanceInstance('observed', T0));

  const { records } = await store.acceptMessageWithObservation(
    makeMessage(target),
    makeAcceptanceIntent(T0),
  );
  assert.equal(records.length, 1);
  assert.equal(records[0]?.kind, 'MESSAGE_ACCEPTED');

  // Compatible replay returns the original ack with no new observation.
  const duplicate = await store.acceptMessageWithObservation(
    makeMessage(target),
    makeAcceptanceIntent(T0),
  );
  assert.equal(duplicate.ack.status, 'duplicate');
  assert.equal(duplicate.records.length, 0);

  // Incompatible replay throws instead of emitting a second observation.
  const sequenceBeforeCollision = readNextTargetSequence(databasePath, target);
  await expectIdentityCollision(() =>
    store.acceptMessageWithObservation(
      makeMessage(target, { type: 'decrement' }),
      makeAcceptanceIntent(T0),
    ),
  );
  assert.equal(readNextTargetSequence(databasePath, target), sequenceBeforeCollision);

  const page = await store.readObservations({
    stream: {
      target,
      package: CONFORMANCE_PACKAGE_IDENTITY,
      epochId: RUNTIME_OBSERVATION_INITIAL_EPOCH_ID,
    },
  });
  const acceptedKinds = page.records.filter((record) => record.kind === 'MESSAGE_ACCEPTED');
  assert.equal(acceptedKinds.length, 1);
  assert.deepEqual(readObservationRows(databasePath, target), [
    { kind: 'MESSAGE_ACCEPTED', sequence: 1 },
  ]);

  const next = await store.acceptMessage(makeMessage(target, { messageId: 'm-2' }));
  assert.equal(next.targetSequence, 2);
});

test('A8 case 12: collision path does not mutate workflow state, message disposition or durable effect state', async (t) => {
  const { store, databasePath } = makeTestStore(t);
  const target = makeConformanceAddress('immutable');
  await store.createInstance(makeConformanceInstance('immutable', T0));
  const first = await store.acceptMessage(makeMessage(target));
  assert.ok(await store.markMessageProcessing(target, 'm-1', T0));
  await store.commitProcessedMessage({
    target,
    messageId: 'm-1',
    expectedTargetSequence: first.targetSequence,
    nextState: { count: 1 },
    nextLifecycle: 'active',
    output: { result: 'kept' },
    updatedAt: T0,
  });
  await store.beginEffect({
    effectId: 'effect-1',
    target,
    sourceMessageId: 'm-1',
    effectKind: 'test',
    effectSemantics: 'idempotent',
    status: 'started',
    attempt: 1,
    input: { value: 1 },
    startedAt: T0,
  });
  await store.completeEffect({
    effectId: 'effect-1',
    status: 'completed',
    output: { value: 2 },
    completedAt: T0,
  });

  const snapshotBefore = await store.getInstance(target);
  const dispositionBefore = await store.getMessageDisposition(target, 'm-1');
  const effectBefore = await store.getEffect('effect-1');
  const sequenceBefore = readNextTargetSequence(databasePath, target);

  await expectIdentityCollision(() => store.acceptMessage(makeMessage(target, { type: 'decrement' })));

  assert.deepEqual(await store.getInstance(target), snapshotBefore);
  assert.deepEqual(await store.getMessageDisposition(target, 'm-1'), dispositionBefore);
  assert.deepEqual(await store.getEffect('effect-1'), effectBefore);
  assert.equal(readNextTargetSequence(databasePath, target), sequenceBefore);

  // A command outcome row can only be written by the processed-command commit
  // seam, which an acceptMessage rejection never reaches: the collision throws
  // before the acceptance transaction performs any write at all.
  const next = await store.acceptMessage(makeMessage(target, { messageId: 'm-2' }));
  assert.equal(next.targetSequence, 2);
});

test('A8 cases 13+14: restart/reopen retains collision protection and valid duplicate replay', async (t) => {
  const { store, databasePath } = makeTestStore(t);
  const target = makeConformanceAddress('restart');
  await store.createInstance(makeConformanceInstance('restart', T0));
  const first = await store.acceptMessage(
    makeMessage(target, { causationId: 'cause-1', contractVersion: '1' }),
  );
  store.close();

  const reopened = new NodeSqliteRuntimeStore({ path: databasePath });
  try {
    await expectIdentityCollision(() =>
      reopened.acceptMessage(makeMessage(target, { type: 'decrement', causationId: 'cause-1', contractVersion: '1' })),
    );
    await expectIdentityCollision(() =>
      reopened.acceptMessage(makeMessage(target, { payload: { b: 9, a: 1 }, causationId: 'cause-1', contractVersion: '1' })),
    );

    const replay = await reopened.acceptMessage(
      makeMessage(target, {
        correlationId: 'corr-restart',
        payload: { a: 1, b: 2 },
        causationId: 'cause-1',
        contractVersion: '1',
      }),
    );
    assert.deepEqual(replay, { ...first, status: 'duplicate' });

    const next = await reopened.acceptMessage(makeMessage(target, { messageId: 'm-2' }));
    assert.equal(next.targetSequence, first.targetSequence + 1);
  } finally {
    reopened.close();
  }
});
