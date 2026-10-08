/**
 * E8b executable reference — processed-command N -> N+1 durable revision
 * vector, re-run against the exact current v0.7 integration candidate
 * (issue #873; authority #589@5980540397 PACK-E E8b + #719 readiness terminal
 * + #873 WEB_REFERENCE_FIXTURE_FREEZE; predecessors T000-SR PR#869 accepted,
 * T000 currentness #528@6024748740, T008E #726@6032592242 NO_DELTA_REQUIRED).
 *
 * ENVIRONMENT=LOCAL_AGENT (ZCode kimi-executor, kimi-for-coding).
 * REAL_HOST_POSTURE=REAL_SUPPORTED_NODE_HOST (Node v24.21.0, better-sqlite3
 * 12.11.1, real durable SQLite database files — no mocks).
 * SOURCE_MUTATION=NONE (tests-only write set).
 *
 * Reference-falsification scope under test (PACK-E E8b STATE_REVISION_VECTOR):
 *  - a normal public Runtime processed-command commit advances the durable
 *    instance state revision exactly once (N -> N+1) and persists across a
 *    real connection close/reopen;
 *  - equal (N -> N), skip (N -> N+k, k>1), regression, negative,
 *    non-integer and unsafe-boundary (2**53 / MAX_SAFE_INTEGER overflow)
 *    commit material rejects with the stable STATE_REVISION_MISMATCH
 *    contract category BEFORE transaction/write — instance state/revision/
 *    lifecycle, source message disposition, process-data revision, command
 *    outcome and mailbox/terminalization side effects all remain untouched;
 *  - re-executing an already-committed turn fails closed (exactly-once): the
 *    durable revision has moved, so the stale commit is a contract violation,
 *    not a retry opportunity;
 *  - the RuntimeStore remains a DEFENSIVE_CONTRACT_BOUNDARY_NOT_SEMANTIC_OWNER:
 *    Runtime/core stays the sole revision authority and no second
 *    revision/journal owner is representable through the public seam.
 *
 * The proof targets the observable store/runtime commit contract behavior
 * (commitProcessedCommandTurn against a real SQLite store), not the private
 * existence or name of any internal assertion helper.
 *
 * Fixture identity: E8B_FINAL_V06_COMPAT_V1 (#873 freeze,
 * MANIFEST_SHA256=10354b6d51962938ed5e9ca56960f9335bbd0a0598665f669a0f4d31bd7b84c4).
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
  type ProcessCommandRuntimeStore,
  type ProcessedCommandTurnCommit,
} from '@kaicreator/domain-harness';
import type {
  WorkflowAddress,
  WorkflowInstanceSnapshot,
} from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';

const NOW = '2026-09-21T10:00:00.000Z';
const target: WorkflowAddress = { workflowId: 'order-quote', instanceKey: 'e8b-sr-guard' };
const MESSAGE_ID = 'e8b-cmd-1';

function instanceSnapshot(): WorkflowInstanceSnapshot {
  return {
    address: target,
    correlationId: 'corr-e8b-sr',
    packageId: 'pkg-e8b-sr',
    lifecycle: 'active',
    stateRevision: 0,
    state: { step: 'waiting' },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function tempDir(t: test.TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-e8b-sr-'));
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
  assert.equal(prepared.commit.expectedStateRevision, 0);
  assert.equal(prepared.commit.nextStateRevision, 1);
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

test('E8b SR positive: valid N -> N+1 commit advances exactly once and persists across restart', async (t) => {
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

test('E8b SR exactly-once: re-executing the committed turn fails closed after the revision moved', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await store.commitProcessedCommandTurn(valid);
  assert.equal((await store.getInstance(target))?.stateRevision, 1);

  // Re-committing the identical prepared turn fails closed: the durable
  // message is no longer in the expected processing state, so the store's
  // v0.6-exact message/sequence gate rejects the replay before any write.
  // (The STATE_REVISION_MISMATCH contract category is reserved for
  // revision-pair violations on a live processing message; a replayed turn
  // never reaches that gate — both paths reject before any durable mutation.)
  await assert.rejects(() => store.commitProcessedCommandTurn(valid));
  const instance = await store.getInstance(target);
  assert.equal(instance?.stateRevision, 1);
  assert.deepEqual(instance?.state, { step: 'quoted' });
  const disposition = await store.getMessageDisposition(target, MESSAGE_ID);
  assert.equal(disposition?.disposition, 'processed');
  store.close();
});

test('E8b SR negative: same-revision N -> N commit fails closed before any write', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 0));

  // The rejection left no residue: the normal path still commits cleanly.
  await store.commitProcessedCommandTurn(valid);
  assert.equal((await store.getInstance(target))?.stateRevision, 1);
  store.close();
});

test('E8b SR negative: forward jump N -> N+2 or larger fails closed before any write', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 2));
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 5));
  store.close();
});

test('E8b SR negative: backward revision fails closed before any write', async (t) => {
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

test('E8b SR negative: non-safe-integer revision material fails closed at the store boundary', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, -1, 0));
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 1.5, 2.5));
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 0, 0.5));
  await assertRejectedBeforeAnyWrite(store, withRevisions(valid, 2 ** 53, 2 ** 53 + 1));
  store.close();
});

test('E8b SR negative: MAX_SAFE_INTEGER cannot produce an overflowing normal transition', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  const valid = await prepareValidCommit(store);
  await assertRejectedBeforeAnyWrite(
    store,
    withRevisions(valid, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1),
  );
  store.close();
});

test('E8b SR no-side-effects: rejected terminal commit emits no terminalization or mailbox side effect', async (t) => {
  const store = await openStoreWithProcessingMessage(join(tempDir(t), 'runtime.sqlite'));
  // A second unresolved message must NOT be abandoned by a rejected commit,
  // even when the (nonconforming) commit claims a terminal lifecycle.
  await store.acceptMessage({
    messageId: 'e8b-cmd-2',
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

  const second = await store.getMessageDisposition(target, 'e8b-cmd-2');
  assert.equal(second?.disposition, 'accepted', 'unresolved sibling message was not abandoned');
  const unresolved = await store.listUnresolvedMessageTargets();
  assert.deepEqual(
    unresolved.filter((address) => address.instanceKey === target.instanceKey),
    [target],
    'mailbox enumeration still reports the instance as unresolved',
  );
  store.close();
});
