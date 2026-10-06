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
import type {
  MessageAcceptedAck,
  MessageDispositionSnapshot,
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '@kaicreator/domain-harness/v2';
import { openParityStack } from './operation-script.js';

// v0.6 T003 (frozen L2 A9): host parity for the processed-command revision
// guard. The real ExpoSqliteRuntimeStore adapter stack runs under Node through
// the T-024 logical-parity driver (better-sqlite3 behind the structural
// ExpoSqliteModuleLike interfaces). Honesty boundary: this is logical-parity
// evidence — it is NOT real Expo/Hermes device durability; T-009 owns that.

const NOW = '2026-09-21T10:00:00.000Z';
const target: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'inst-t003-expo' };
const MESSAGE_ID = 'cmd-t003-expo-1';

/** Narrow structural surface both adapters expose for this guard matrix. */
interface GuardStore {
  createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void>;
  getInstance(target: WorkflowAddress): Promise<WorkflowInstanceSnapshot | null>;
  acceptMessage(message: {
    messageId: string;
    target: WorkflowAddress;
    type: string;
    payload: unknown;
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
    correlationId: 'corr-t003-expo',
    packageId: 'pkg-t003',
    lifecycle: 'active',
    stateRevision: 0,
    state: { step: 'waiting' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function tempDir(t: test.TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t003-expo-guard-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  return directory;
}

async function openExpoGuardStore(t: test.TestContext): Promise<{ store: GuardStore; close: () => Promise<void> }> {
  const stack = await openParityStack('expo', tempDir(t));
  const store = stack.store as unknown as GuardStore;
  await store.createInstance(instanceSnapshot());
  await store.acceptMessage({
    messageId: MESSAGE_ID,
    target,
    type: 'command',
    payload: { amount: 42 },
  });
  assert.equal(await store.markMessageProcessing(target, MESSAGE_ID, NOW), true);
  return { store, close: stack.close };
}

async function prepareValidCommit(store: GuardStore): Promise<ProcessedCommandTurnCommit> {
  const instance = await store.getInstance(target);
  // Test glue: the Expo adapter returns its structurally identical local
  // mirror of the portable MessageDispositionSnapshot.
  const disposition = (await store.getMessageDisposition(
    target,
    MESSAGE_ID,
  )) as unknown as MessageDispositionSnapshot | null;
  assert.ok(instance !== null && disposition !== null);
  const prepared = prepareProcessedCommandTurn(
    {
      instance,
      disposition,
      existingOutcome: await store.getCommandOutcome(target, MESSAGE_ID),
    },
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
  store: GuardStore,
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

test('T-003 A9: Expo adapter accepts a valid exact N -> N+1 commit', async (t) => {
  const { store, close } = await openExpoGuardStore(t);
  try {
    await store.commitProcessedCommandTurn(await prepareValidCommit(store));
    const instance = await store.getInstance(target);
    assert.equal(instance?.stateRevision, 1, 'state advanced exactly one revision');
    const processData = await store.getProcessData(target);
    assert.equal(processData?.instanceStateRevision, 1);
    assert.deepEqual(processData?.data, { lastQuote: 42 });
    const outcome = await store.getCommandOutcome(target, MESSAGE_ID);
    assert.ok(outcome !== null && outcome.status === 'applied');
    assert.equal((await store.getMessageDisposition(target, MESSAGE_ID))?.disposition, 'processed');
  } finally {
    await close();
  }
});

test('T-003 A9: Expo adapter rejects same-revision, jump, backward and unsafe pairs before any write', async (t) => {
  const { store, close } = await openExpoGuardStore(t);
  try {
    const valid = await prepareValidCommit(store);
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 0));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 2));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 5));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 5, 4));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, -1));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, -1, 0));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 1.5, 2.5));
    await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 2 ** 53, 2 ** 53 + 1));
    await assertRejectedBeforeAnyWrite(
      store,
      withRevisions(valid, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1),
    );

    // The rejections left no residue: the normal path still commits cleanly.
    await store.commitProcessedCommandTurn(valid);
    assert.equal((await store.getInstance(target))?.stateRevision, 1);
  } finally {
    await close();
  }
});

test('T-003 A9: Expo adapter rejected terminal commit emits no terminalization side effect', async (t) => {
  const { store, close } = await openExpoGuardStore(t);
  try {
    await store.acceptMessage({
      messageId: 'cmd-t003-expo-2',
      target,
      type: 'command',
      payload: { amount: 43 },
    });
    const valid = await prepareValidCommit(store);
    await assertRejectedBeforeAnyWrite(store, { ...withRevisions(valid, 0, 0), nextLifecycle: 'completed' });

    const sibling = await store.getMessageDisposition(target, 'cmd-t003-expo-2');
    assert.equal(sibling?.disposition, 'accepted', 'unresolved sibling message was not abandoned');
    const unresolved = await store.listUnresolvedMessageTargets();
    assert.ok(
      unresolved.some(
        (address) => address.workflowId === target.workflowId && address.instanceKey === target.instanceKey,
      ),
      'mailbox enumeration still reports the instance as unresolved',
    );
  } finally {
    await close();
  }
});
