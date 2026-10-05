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
  type ProcessCommandRuntimeStore,
  type ProcessedCommandTurnCommit,
} from '@kaicreator/domain-harness';
import type {
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';

// v0.6 T003 (frozen L2 A9): the Node RuntimeStore is a DEFENSIVE_CONTRACT_
// BOUNDARY_NOT_SEMANTIC_OWNER for the processed-command commit seam. Every
// rejection below must fail closed BEFORE any durable mutation: source message
// disposition, instance state/lifecycle/revision, process-data revision,
// command outcome and mailbox/terminalization side effects must all remain
// untouched. Transaction rollback is a safety net, never the validation point.

const NOW = '2026-09-21T10:00:00.000Z';
const target: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'inst-t003-guard' };
const MESSAGE_ID = 'cmd-t003-1';

function instanceSnapshot(): WorkflowInstanceSnapshot {
  return {
    address: target,
    correlationId: 'corr-t003',
    packageId: 'pkg-t003',
    lifecycle: 'active',
    stateRevision: 0,
    state: { step: 'waiting' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function tempDir(t: test.TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t003-guard-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  return directory;
}

async function openStoreWithProcessingMessage(path: string): Promise<NodeSqliteRuntimeStore> {
  const store = new NodeSqliteRuntimeStore({ path });
  await store.createInstance(instanceSnapshot());
  await store.acceptMessage({
    messageId: MESSAGE_ID,
    target,
    type: 'command',
    payload: { amount: 42 },
  });
  assert.equal(await store.markMessageProcessing(target, MESSAGE_ID, NOW), true);
  return store;
}

async function prepareValidCommit(
  store: ProcessCommandRuntimeStore,
): Promise<ProcessedCommandTurnCommit> {
  const instance = await store.getInstance(target);
  const disposition = await store.getMessageDisposition(target, MESSAGE_ID);
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

/** Overrides the revision pair so the commit becomes structurally nonconforming. */
function withRevisions(
  commit: ProcessedCommandTurnCommit,
  expectedStateRevision: number,
  nextStateRevision: number,
): ProcessedCommandTurnCommit {
  return { ...commit, expectedStateRevision, nextStateRevision };
}

async function assertRejectedBeforeAnyWrite(
  store: NodeSqliteRuntimeStore,
  commitAttempt: ProcessedCommandTurnCommit,
): Promise<void> {
  await assert.rejects(
    () => store.commitProcessedCommandTurn(commitAttempt),
    (error: unknown) =>
      error instanceof ProcessCommandContractError && error.code === 'STATE_REVISION_MISMATCH',
  );

  // No partial mutation anywhere on the durable surface:
  const instance = await store.getInstance(target);
  assert.ok(instance !== null);
  assert.equal(instance.stateRevision, 0, 'instance revision unchanged');
  assert.deepEqual(instance.state, { step: 'waiting' }, 'instance state unchanged');
  assert.equal(instance.lifecycle, 'active', 'instance lifecycle unchanged');
  assert.equal(instance.updatedAt, NOW, 'instance updatedAt unchanged');

  const disposition = await store.getMessageDisposition(target, MESSAGE_ID);
  assert.ok(disposition !== null);
  assert.equal(disposition.disposition, 'processing', 'source message disposition unchanged');

  const processData: DurableProcessDataSnapshot | null = await store.getProcessData(target);
  assert.equal(processData, null, 'no process-data revision written');

  const outcome: CommandOutcomeSnapshot | null = await store.getCommandOutcome(target, MESSAGE_ID);
  assert.equal(outcome, null, 'no command outcome written');
}

test('T-003 A9: Node store accepts a valid exact N -> N+1 commit and persists it across restart', async (t) => {
  const path = join(tempDir(t), 'runtime.sqlite');
  const first = await openStoreWithProcessingMessage(path);

  await first.commitProcessedCommandTurn(await prepareValidCommit(first));
  first.close();

  const second = new NodeSqliteRuntimeStore({ path });
  const instance = await second.getInstance(target);
  assert.ok(instance !== null);
  assert.equal(instance.stateRevision, 1, 'state advanced exactly one revision');
  const processData = await second.getProcessData(target);
  assert.equal(processData?.instanceStateRevision, 1);
  assert.deepEqual(processData?.data, { lastQuote: 42 });
  const outcome = await second.getCommandOutcome(target, MESSAGE_ID);
  assert.ok(outcome !== null && outcome.status === 'applied');
  const disposition = await second.getMessageDisposition(target, MESSAGE_ID);
  assert.equal(disposition?.disposition, 'processed');
  second.close();
});

test('T-003 A9: same-revision N -> N commit fails closed before any write', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 0));

  // The rejection left no residue: the normal path still commits cleanly.
  await store.commitProcessedCommandTurn(valid);
  assert.equal((await store.getInstance(target))?.stateRevision, 1);
  store.close();
});

test('T-003 A9: forward jump N -> N+2 or larger fails closed before any write', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 2));
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 5));
  store.close();
});

test('T-003 A9: backward revision fails closed before any write', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 5, 4));
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, -1));
  // A structurally conforming but stale pair (3 -> 4) is not a guard matter:
  // the existing optimistic CAS still fails closed before any durable write.
  await assert.rejects(() => store.commitProcessedCommandTurn(withRevisions(valid, 3, 4)));
  const disposition = await store.getMessageDisposition(target, MESSAGE_ID);
  assert.equal(disposition?.disposition, 'processing', 'stale CAS left the message untouched');
  assert.equal(await store.getProcessData(target), null);
  store.close();
});

test('T-003 A9: negative or non-safe revision material fails closed at the store boundary', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, -1, 0));
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 1.5, 2.5));
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 0.5));
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 2 ** 53, 2 ** 53 + 1));
  store.close();
});

test('T-003 A9: MAX_SAFE_INTEGER cannot produce an overflowing normal transition', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await assertRejectedBeforeAnyWrite(
    store,
    withRevisions(valid, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1),
  );
  store.close();
});

test('T-003 A9: rejected terminal commit emits no terminalization or mailbox side effect', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  // A second unresolved message must NOT be abandoned by a rejected commit,
  // even when the (nonconforming) commit claims a terminal lifecycle.
  await store.acceptMessage({
    messageId: 'cmd-t003-2',
    target,
    type: 'command',
    payload: { amount: 43 },
  });
  const valid = await prepareValidCommit(store);
  const terminalAttempt: ProcessedCommandTurnCommit = {
    ...withRevisions(valid, 0, 0),
    nextLifecycle: 'completed',
  };
  await assertRejectedBeforeAnyWrite(store, terminalAttempt);

  const second = await store.getMessageDisposition(target, 'cmd-t003-2');
  assert.equal(second?.disposition, 'accepted', 'unresolved sibling message was not abandoned');
  const unresolved = await store.listUnresolvedMessageTargets();
  assert.deepEqual(
    unresolved.filter((address) => address.instanceKey === target.instanceKey),
    [target],
    'mailbox enumeration still reports the instance as unresolved',
  );
  store.close();
});

test('T-003 A9: internal-increment store methods keep their existing behavior', async (t) => {
  const store = new NodeSqliteRuntimeStore({ path: join(tempDir(t), 'runtime.sqlite') });
  await store.createInstance(instanceSnapshot());

  // Legacy processing-commit seam increments internally (no caller-supplied
  // next revision) and still advances the instance by exactly one revision.
  await store.acceptMessage({
    messageId: 'legacy-1',
    target,
    type: 'advance',
    payload: { value: 1 },
  });
  assert.equal(await store.markMessageProcessing(target, 'legacy-1', NOW), true);
  await store.commitProcessedMessage({
    target,
    messageId: 'legacy-1',
    expectedTargetSequence: 1,
    nextState: { step: 'advanced' },
    nextLifecycle: 'active',
    updatedAt: NOW,
  });
  assert.equal((await store.getInstance(target))?.stateRevision, 1);

  // Recovery path keeps its explicit existing contract: internal increment
  // into recovery_required, untouched by the A9 structural guard.
  await store.acceptMessage({
    messageId: 'legacy-2',
    target,
    type: 'poison',
    payload: null,
  });
  assert.equal(await store.markMessageProcessing(target, 'legacy-2', NOW), true);
  await store.failMessageProcessing({
    target,
    messageId: 'legacy-2',
    expectedTargetSequence: 2,
    failure: { code: 'TOOL_FAILED', message: 'poison payload' },
    updatedAt: NOW,
  });
  const recovery = await store.getInstance(target);
  assert.equal(recovery?.lifecycle, 'recovery_required');
  assert.equal(recovery?.stateRevision, 2, 'failure path still increments internally by one');
  store.close();
});

test('T-003 A9: processed-command seam exposes no migration/import revision-jump capability', () => {
  const prototype = NodeSqliteRuntimeStore.prototype as unknown as Record<string, unknown>;
  const names = Object.getOwnPropertyNames(NodeSqliteRuntimeStore.prototype).filter(
    (name) => name !== 'constructor',
  );
  const seam = names
    .filter((name) =>
      ['getProcessData', 'getCommandOutcome', 'commitProcessedCommandTurn'].includes(name),
    )
    .sort();
  assert.deepEqual(
    seam,
    ['commitProcessedCommandTurn', 'getCommandOutcome', 'getProcessData'],
    'the extension seam is exactly the frozen three-method surface',
  );
  assert.equal(
    names.some((name) => /import|migration|restore|jump/i.test(name) && prototype[name] instanceof Function),
    false,
    'no migration/import/restore/revision-jump method exists on the store',
  );
});
