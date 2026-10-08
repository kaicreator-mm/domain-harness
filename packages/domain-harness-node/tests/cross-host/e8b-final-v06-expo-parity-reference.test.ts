/**
 * E8b executable reference — Node/Expo parity for the accepted-message
 * identity collision and processed-command N -> N+1 durable vectors
 * (issue #873; authority #589@5980540397 PACK-E E8b + #719 readiness terminal
 * NODE_EXPO_PARITY=REQUIRED; predecessors T000-MI PR#862 / T000-SR PR#869).
 *
 * The REAL ExpoSqliteRuntimeStore adapter stack (packages/domain-harness-expo
 * sources) executes the SAME logical fixture data as the Node reference
 * vectors through the T-024 logical-parity driver (better-sqlite3 behind the
 * structural ExpoSqliteModuleLike interfaces).
 *
 * Honesty boundary (retained from the T-024 driver convention): this is
 * LOGICAL-parity evidence proving both adapter stacks enforce identical
 * acceptance/rejection ordering, no-write-before-reject, idempotent duplicate
 * behavior and revision progression from identical logical operations. The
 * REAL Expo/Hermes/expo-sqlite host claim for this E8b run is bound
 * separately: emulator-5554 (Android API 36, google_apis x86_64), Hermes
 * release APK (jsEngine=hermes, embedded bundle), expo 55.0.31 /
 * expo-sqlite 55.0.20, core under test = packed candidate tarball
 * d045145cd2dd3eb66006875e7bd082fe5352e9d66548cf31734de0955eb2ff12 —
 * phase 1 DOMAIN_HARNESS_T004_VALIDATION status=RESTART_REQUIRED (23 checks
 * incl. accepted-identity-compatible-replay / -collision-fail-closed /
 * -collision-restart-persistence, 32-way concurrent acceptance, connection
 * reopen persistence) after a real `adb shell am force-stop` +
 * relaunch, phase 2 status=PASS processRestartPersistence=true.
 *
 * SOURCE_MUTATION=NONE (tests-only write set).
 * Fixture identity: E8B_FINAL_V06_COMPAT_V1 (#873 freeze).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ProcessCommandContractError,
  prepareProcessedCommandTurn,
  type CommandOutcomeSnapshot,
  type DurableProcessDataSnapshot,
  type ProcessedCommandTurnCommit,
} from '@kaicreator/domain-harness';
import {
  AcceptedMessageIdentityCollisionError,
  type MessageDispositionSnapshot,
  type MessageAcceptedAck,
  type WorkflowAddress,
  type WorkflowInstanceSnapshot,
} from '@kaicreator/domain-harness/v2';
import { openParityStack } from './operation-script.js';

const NOW = '2026-09-21T10:00:00.000Z';
const target: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'e8b-parity' };
const MESSAGE_ID = 'e8b-parity-cmd-1';

/** Narrow structural surface both adapters expose for this parity matrix. */
interface ParityStore {
  createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void>;
  getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null>;
  acceptMessage(message: {
    messageId: string;
    target: WorkflowAddress;
    type: string;
    payload: unknown;
    correlationId?: string;
    causationId?: string;
    contractVersion?: string;
  }): Promise<MessageAcceptedAck>;
  getMessageDisposition(
    target: WorkflowAddress,
    messageId: string,
  ): Promise<{ readonly messageId: string; readonly targetSequence: number; readonly disposition: string } | null>;
  markMessageProcessing(target: WorkflowAddress, messageId: string, at: string): Promise<boolean>;
  listUnresolvedMessageTargets(): Promise<readonly WorkflowAddress[]>;
  getProcessData(target: WorkflowAddress): Promise<DurableProcessDataSnapshot | null>;
  getCommandOutcome(target: WorkflowAddress, messageId: string): Promise<CommandOutcomeSnapshot | null>;
  commitProcessedCommandTurn(commit: ProcessedCommandTurnCommit): Promise<void>;
}

function instanceSnapshot(): WorkflowInstanceSnapshot {
  return {
    address: target,
    correlationId: 'corr-e8b-parity',
    packageId: 'pkg-e8b-parity',
    lifecycle: 'active',
    stateRevision: 0,
    state: { step: 'waiting' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function tempDir(t: test.TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-e8b-parity-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  return directory;
}

async function openExpoParityStore(
  t: test.TestContext,
  directory?: string,
): Promise<{ store: ParityStore; close: () => Promise<void> }> {
  const stack = await openParityStack('expo', directory ?? tempDir(t));
  const store = stack.store as unknown as ParityStore;
  return { store, close: stack.close };
}

async function seedProcessingMessage(store: ParityStore): Promise<void> {
  await store.createInstance(instanceSnapshot());
  await store.acceptMessage({
    messageId: MESSAGE_ID,
    target,
    type: 'command',
    payload: { amount: 42 },
  });
  assert.equal(await store.markMessageProcessing(target, MESSAGE_ID, NOW), true);
}

async function expectCollision(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof AcceptedMessageIdentityCollisionError, `unexpected rejection: ${String(error)}`);
    assert.equal(error.code, 'MESSAGE_IDENTITY_COLLISION');
    return;
  }
  throw new Error('expected MESSAGE_IDENTITY_COLLISION rejection, but the replay was accepted');
}

async function prepareValidCommit(store: ParityStore): Promise<ProcessedCommandTurnCommit> {
  const instance = await store.getInstance(target);
  // Test glue: the Expo adapter returns its structurally identical local
  // mirror of the portable MessageDispositionSnapshot.
  const disposition = (await store.getMessageDisposition(
    target,
    MESSAGE_ID,
  )) as unknown as MessageDispositionSnapshot | null;
  assert.ok(instance !== null && disposition !== null);
  const prepared = prepareProcessedCommandTurn(
    { instance, disposition, existingOutcome: await store.getCommandOutcome(target, MESSAGE_ID) },
    {
      target,
      messageId: MESSAGE_ID,
      expectedTargetSequence: disposition.targetSequence,
      expectedStateRevision: instance.stateRevision,
      nextState: { step: 'quoted' },
      nextProcessData: { lastQuote: 42 },
      nextLifecycle: 'active',
      resolution: { status: 'applied', result: { quoted: 42 } },
      updatedAt: '2026-09-21T10:01:00.000Z',
    },
  );
  if (prepared.kind !== 'commit') assert.fail('expected a commit preparation');
  return prepared.commit;
}

function withRevisions(
  commit: ProcessedCommandTurnCommit,
  expectedStateRevision: number,
  nextStateRevision: number,
): ProcessedCommandTurnCommit {
  return { ...commit, expectedStateRevision, nextStateRevision };
}

async function assertRejectedBeforeAnyWrite(
  store: ParityStore,
  commitAttempt: ProcessedCommandTurnCommit,
): Promise<void> {
  await assert.rejects(
    () => store.commitProcessedCommandTurn(commitAttempt),
    (error: unknown) =>
      error instanceof ProcessCommandContractError && error.code === 'STATE_REVISION_MISMATCH',
  );
  const instance = await store.getInstance(target);
  assert.ok(instance !== null);
  assert.equal(instance.stateRevision, 0, 'instance revision unchanged');
  assert.deepEqual(instance.state, { step: 'waiting' }, 'instance state unchanged');
  assert.equal(instance.lifecycle, 'active', 'instance lifecycle unchanged');
  assert.equal(instance.updatedAt, NOW, 'instance updatedAt unchanged');
  const disposition = await store.getMessageDisposition(target, MESSAGE_ID);
  assert.ok(disposition !== null);
  assert.equal(disposition.disposition, 'processing', 'source message disposition unchanged');
  assert.equal(await store.getProcessData(target), null, 'no process-data revision written');
  assert.equal(await store.getCommandOutcome(target, MESSAGE_ID), null, 'no command outcome written');
}

test('E8b parity MI: Expo adapter duplicate replay is idempotent and per-member collisions fail closed', async (t) => {
  const { store, close } = await openExpoParityStore(t);
  try {
    await store.createInstance(instanceSnapshot());
    const first = await store.acceptMessage({
      messageId: 'e8b-parity-m-1',
      target,
      type: 'RESERVE',
      payload: { b: 2, a: 1 },
      causationId: 'cause-1',
      contractVersion: '1',
    });
    assert.equal(first.status, 'accepted');

    // Exact logical replay: original ack facts, duplicate status.
    const identical = await store.acceptMessage({
      messageId: 'e8b-parity-m-1',
      target,
      type: 'RESERVE',
      payload: { b: 2, a: 1 },
      causationId: 'cause-1',
      contractVersion: '1',
    });
    assert.equal(identical.status, 'duplicate');
    assert.equal(identical.targetSequence, first.targetSequence);
    assert.equal(identical.packageId, first.packageId);

    // Canonically-equivalent replay (object key order permuted): idempotent.
    const permuted = await store.acceptMessage({
      messageId: 'e8b-parity-m-1',
      target,
      type: 'RESERVE',
      payload: { a: 1, b: 2 },
      causationId: 'cause-1',
      contractVersion: '1',
    });
    assert.equal(permuted.status, 'duplicate');

    // Per-member collisions: same target + messageId, materially distinct.
    await expectCollision(() =>
      store.acceptMessage({
        messageId: 'e8b-parity-m-1',
        target,
        type: 'RELEASE',
        payload: { b: 2, a: 1 },
        causationId: 'cause-1',
        contractVersion: '1',
      }),
    );
    await expectCollision(() =>
      store.acceptMessage({
        messageId: 'e8b-parity-m-1',
        target,
        type: 'RESERVE',
        payload: { b: 3, a: 1 },
        causationId: 'cause-1',
        contractVersion: '1',
      }),
    );
    await expectCollision(() =>
      store.acceptMessage({
        messageId: 'e8b-parity-m-1',
        target,
        type: 'RESERVE',
        payload: { b: 2, a: 1 },
        causationId: 'cause-2',
        contractVersion: '1',
      }),
    );
    await expectCollision(() =>
      store.acceptMessage({
        messageId: 'e8b-parity-m-1',
        target,
        type: 'RESERVE',
        payload: { b: 2, a: 1 },
        causationId: 'cause-1',
        contractVersion: '2',
      }),
    );

    // The durable duplicate boundary is untouched by the collisions.
    const disposition = await store.getMessageDisposition(target, 'e8b-parity-m-1');
    assert.equal(disposition?.disposition, 'accepted');
    const replay = await store.acceptMessage({
      messageId: 'e8b-parity-m-1',
      target,
      type: 'RESERVE',
      payload: { a: 1, b: 2 },
      causationId: 'cause-1',
      contractVersion: '1',
    });
    assert.equal(replay.status, 'duplicate');
  } finally {
    await close();
  }
});

test('E8b parity MI persistence: Expo adapter collision protection survives connection close/reopen', async (t) => {
  const directory = tempDir(t);
  const first = await openExpoParityStore(t, directory);
  try {
    await first.store.createInstance(instanceSnapshot());
    await first.store.acceptMessage({
      messageId: 'e8b-parity-m-1',
      target,
      type: 'RESERVE',
      payload: { a: 1 },
      causationId: 'cause-1',
    });
  } finally {
    await first.close();
  }

  const reopened = await openExpoParityStore(t, directory);
  try {
    await expectCollision(() =>
      reopened.store.acceptMessage({
        messageId: 'e8b-parity-m-1',
        target,
        type: 'RELEASE',
        payload: { a: 1 },
        causationId: 'cause-1',
      }),
    );
    const replay = await reopened.store.acceptMessage({
      messageId: 'e8b-parity-m-1',
      target,
      type: 'RESERVE',
      payload: { a: 1 },
      causationId: 'cause-1',
    });
    assert.equal(replay.status, 'duplicate');
  } finally {
    await reopened.close();
  }
});

test('E8b parity SR: Expo adapter accepts valid N -> N+1 exactly once and persists across reopen', async (t) => {
  const directory = tempDir(t);
  const first = await openExpoParityStore(t, directory);
  try {
    await seedProcessingMessage(first.store);
    await first.store.commitProcessedCommandTurn(await prepareValidCommit(first.store));
    assert.equal((await first.store.getInstance(target))?.stateRevision, 1);
  } finally {
    await first.close();
  }

  const reopened = await openExpoParityStore(t, directory);
  try {
    const instance = await reopened.store.getInstance(target);
    assert.equal(instance?.stateRevision, 1, 'revision persisted across adapter reopen');
    const processData = await reopened.store.getProcessData(target);
    assert.equal(processData?.instanceStateRevision, 1);
    const outcome = await reopened.store.getCommandOutcome(target, MESSAGE_ID);
    assert.ok(outcome !== null && outcome.status === 'applied');
    assert.equal((await reopened.store.getMessageDisposition(target, MESSAGE_ID))?.disposition, 'processed');
  } finally {
    await reopened.close();
  }
});

test('E8b parity SR negatives: Expo adapter rejects equal/jump/backward/unsafe pairs before any write', async (t) => {
  const { store, close } = await openExpoParityStore(t);
  try {
    await seedProcessingMessage(store);
    const valid = await prepareValidCommit(store);
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 0));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 2));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 5, 4));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, -1));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, -1, 0));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 1.5, 2.5));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 2 ** 53, 2 ** 53 + 1));
    await assertRejectedBeforeAnyWrite(
      store,
      withRevisions(valid, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1),
    );

    // No residue: the normal path still commits cleanly afterwards.
    await store.commitProcessedCommandTurn(valid);
    assert.equal((await store.getInstance(target))?.stateRevision, 1);
  } finally {
    await close();
  }
});

test('E8b parity SR no-side-effects: Expo adapter rejected terminal commit leaves the mailbox untouched', async (t) => {
  const { store, close } = await openExpoParityStore(t);
  try {
    await seedProcessingMessage(store);
    await store.acceptMessage({
      messageId: 'e8b-parity-cmd-2',
      target,
      type: 'command',
      payload: { amount: 43 },
    });
    const valid = await prepareValidCommit(store);
    await assertRejectedBeforeAnyWrite(store, {
      ...withRevisions(valid, 0, 0),
      nextLifecycle: 'completed',
    });
    const second = await store.getMessageDisposition(target, 'e8b-parity-cmd-2');
    assert.equal(second?.disposition, 'accepted', 'unresolved sibling message was not abandoned');
    const unresolved = await store.listUnresolvedMessageTargets();
    assert.deepEqual(
      unresolved.filter((address) => address.instanceKey === target.instanceKey),
      [target],
    );
  } finally {
    await close();
  }
});
