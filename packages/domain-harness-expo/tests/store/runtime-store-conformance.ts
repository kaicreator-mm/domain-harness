import type { RuntimeStore } from '../../../domain-harness/src/v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../../../domain-harness/src/v2/contracts/workflow.js';
import { ExclusiveTransactionQueue } from '../../src/store/exclusive-transaction.js';
import type { ExpoSqliteDatabaseLike, ExpoSqliteExecutorLike } from '../../src/store/expo-sqlite-types.js';
import { ExpoSqliteRuntimeStore } from '../../src/store/expo-sqlite-runtime-store.js';

/** Compile-time proof that the Expo adapter satisfies the frozen T-001 port. */
export const runtimeStoreStructuralCompatibility: RuntimeStore = null as unknown as ExpoSqliteRuntimeStore;

export interface CloseableRuntimeStore extends RuntimeStore {
  close(): Promise<void>;
}

export interface RuntimeStoreConformanceHarness {
  open(): Promise<CloseableRuntimeStore>;
  reopen(store: CloseableRuntimeStore): Promise<CloseableRuntimeStore>;
}

export interface RuntimeStoreConformanceReport {
  checks: readonly string[];
  concurrentAcceptanceCount: number;
  restartPersistence: true;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`RuntimeStore conformance failed: ${message}`);
  }
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function makeAddress(suffix: string): WorkflowAddress {
  return { workflowId: 'expo-store-conformance', instanceKey: suffix };
}

function makeInstance(suffix: string): WorkflowInstanceSnapshot {
  const now = '2026-09-18T00:00:00.000Z';
  return {
    address: makeAddress(suffix),
    correlationId: `corr-${suffix}`,
    packageId: 'pkg-expo-conformance',
    lifecycle: 'active',
    stateRevision: 0,
    state: { count: 0 },
    createdAt: now,
    updatedAt: now,
  };
}

async function expectReject(action: () => Promise<unknown>, message: string): Promise<void> {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

export async function runExclusiveTransactionQueueUnitCheck(): Promise<void> {
  let active = 0;
  let maxActive = 0;
  const commits: number[] = [];

  const transaction: ExpoSqliteExecutorLike = {
    async execAsync(): Promise<void> {},
    async runAsync() {
      return { lastInsertRowId: 0, changes: 0 };
    },
    async getFirstAsync<T>(): Promise<T | null> {
      return null;
    },
    async getAllAsync<T>(): Promise<T[]> {
      return [];
    },
  };
  const database: ExpoSqliteDatabaseLike = {
    ...transaction,
    async withExclusiveTransactionAsync(work): Promise<void> {
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        await work(transaction);
      } finally {
        active -= 1;
      }
    },
  };

  const queue = new ExclusiveTransactionQueue(database);
  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      queue.run(async () => {
        await Promise.resolve();
        commits.push(index);
      }),
    ),
  );

  assert(maxActive === 1, 'adapter write queue allowed overlapping exclusive transactions');
  assert(jsonEqual(commits, Array.from({ length: 12 }, (_, index) => index)), 'write queue reordered callers');
}

export async function runRuntimeStoreConformance(
  harness: RuntimeStoreConformanceHarness,
): Promise<RuntimeStoreConformanceReport> {
  const checks: string[] = [];
  let store = await harness.open();

  try {
    const main = makeInstance('main');
    await store.createInstance(main);
    const loaded = await store.getInstance(main.address);
    assert(loaded !== null, 'created instance was not readable');
    assert(loaded.packageId === main.packageId, 'instance package pin changed');
    assert(jsonEqual(loaded.state, main.state), 'instance state did not round-trip');
    checks.push('instance-create-read-pin');

    const pins = await store.listPinnedPackageIds();
    assert(pins.includes(main.packageId), 'pinned package list omitted live instance package');
    checks.push('pinned-package-list');

    const first = await store.acceptMessage({
      messageId: 'm-1',
      target: main.address,
      type: 'increment',
      payload: { delta: 1 },
    });
    const duplicate = await store.acceptMessage({
      messageId: 'm-1',
      target: main.address,
      type: 'increment',
      payload: { delta: 1 },
    });
    assert(first.status === 'accepted', 'first acceptance did not return accepted');
    assert(duplicate.status === 'duplicate', 'duplicate acceptance did not return duplicate');
    assert(duplicate.targetSequence === first.targetSequence, 'duplicate allocated a new target sequence');
    assert(duplicate.acceptedAt === first.acceptedAt, 'duplicate did not preserve durable acceptance time');

    const second = await store.acceptMessage({
      messageId: 'm-2',
      target: main.address,
      type: 'increment',
      payload: { delta: 1 },
    });
    assert(second.targetSequence === first.targetSequence + 1, 'sequential acceptance was not monotonic');
    const next = await store.getNextAcceptedMessage(main.address);
    assert(next?.message.messageId === 'm-1', 'next accepted message ignored target order');
    checks.push('accept-dedup-order');

    const leapfrog = await store.markMessageProcessing(main.address, 'm-2', '2026-09-18T00:00:01.000Z');
    assert(leapfrog === false, 'later message was allowed to leapfrog the head message');
    assert(await store.markMessageProcessing(main.address, 'm-1', '2026-09-18T00:00:01.000Z'), 'head message did not enter processing');
    await store.commitProcessedMessage({
      target: main.address,
      messageId: 'm-1',
      expectedTargetSequence: first.targetSequence,
      nextState: { count: 1 },
      nextLifecycle: 'active',
      updatedAt: '2026-09-18T00:00:02.000Z',
    });
    const afterCommit = await store.getInstance(main.address);
    assert(afterCommit?.stateRevision === 1, 'processed message did not increment state revision');
    assert(jsonEqual(afterCommit?.state, { count: 1 }), 'processed state did not commit atomically');
    assert((await store.getMessageDisposition(main.address, 'm-1'))?.disposition === 'processed', 'processed disposition missing');
    checks.push('processing-atomic-commit');

    assert(await store.markMessageProcessing(main.address, 'm-2', '2026-09-18T00:00:03.000Z'), 'second message did not enter processing');
    const failure = {
      code: 'TEST_FAILURE',
      message: 'conformance failure',
      sourceMessageId: 'm-2',
    };
    await store.failMessageProcessing({
      target: main.address,
      messageId: 'm-2',
      expectedTargetSequence: second.targetSequence,
      failure,
      updatedAt: '2026-09-18T00:00:04.000Z',
    });
    const recovery = await store.getInstance(main.address);
    assert(recovery?.lifecycle === 'recovery_required', 'processing failure did not enter recovery_required');
    assert((await store.getMessageDisposition(main.address, 'm-2'))?.disposition === 'failed', 'failed message disposition missing');
    await expectReject(
      () =>
        store.acceptMessage({
          messageId: 'blocked-during-recovery',
          target: main.address,
          type: 'increment',
          payload: { delta: 1 },
        }),
      'recovery_required instance accepted a new state-changing message',
    );

    const reset = await store.resetRecovery(main.address, '2026-09-18T00:00:05.000Z');
    assert(reset.lifecycle === 'active', 'recovery reset did not reactivate instance');
    assert((await store.getMessageDisposition(main.address, 'm-2'))?.disposition === 'accepted', 'failed message was not re-queued by recovery reset');
    assert(await store.markMessageProcessing(main.address, 'm-2', '2026-09-18T00:00:06.000Z'), 're-queued message did not enter processing');
    await store.commitProcessedMessage({
      target: main.address,
      messageId: 'm-2',
      expectedTargetSequence: second.targetSequence,
      nextState: { count: 2 },
      nextLifecycle: 'active',
      updatedAt: '2026-09-18T00:00:07.000Z',
    });
    checks.push('failure-recovery-reset');

    await store.acceptMessage({
      messageId: 'm-3',
      target: main.address,
      type: 'queued',
      payload: { ordinal: 3 },
    });
    await store.acceptMessage({
      messageId: 'm-4',
      target: main.address,
      type: 'queued',
      payload: { ordinal: 4 },
    });
    await store.terminalizeInstance({
      target: main.address,
      lifecycle: 'completed',
      output: { result: 'done' },
      updatedAt: '2026-09-18T00:00:08.000Z',
    });
    assert((await store.getMessageDisposition(main.address, 'm-3'))?.disposition === 'abandoned', 'terminalization did not abandon queued message m-3');
    assert((await store.getMessageDisposition(main.address, 'm-4'))?.disposition === 'abandoned', 'terminalization did not abandon queued message m-4');
    await expectReject(
      () =>
        store.acceptMessage({
          messageId: 'after-terminal',
          target: main.address,
          type: 'invalid',
          payload: null,
        }),
      'terminal instance accepted a new message',
    );
    checks.push('terminal-abandon-atomic');

    const effects = makeInstance('effects');
    await store.createInstance(effects);
    const started = await store.beginEffect({
      effectId: 'effect-1',
      target: effects.address,
      sourceMessageId: 'source-1',
      effectKind: 'test',
      effectSemantics: 'idempotent',
      status: 'started',
      attempt: 1,
      input: { value: 1 },
      startedAt: '2026-09-18T00:00:09.000Z',
    });
    const repeatedStart = await store.beginEffect({
      effectId: 'effect-1',
      target: effects.address,
      sourceMessageId: 'source-1',
      effectKind: 'test',
      effectSemantics: 'idempotent',
      status: 'started',
      attempt: 1,
      input: { value: 1 },
      startedAt: '2026-09-18T00:00:09.000Z',
    });
    assert(repeatedStart.status === started.status, 'effect begin was not idempotent');
    const completed = await store.completeEffect({
      effectId: 'effect-1',
      status: 'completed',
      output: { value: 2 },
      completedAt: '2026-09-18T00:00:10.000Z',
    });
    assert(completed.status === 'completed', 'effect completion did not persist');
    assert((await store.getEffect('effect-1'))?.status === 'completed', 'completed effect was not readable');
    checks.push('effect-journal');

    const stress = makeInstance('concurrent');
    await store.createInstance(stress);
    const concurrentAcceptanceCount = 32;
    const acks = await Promise.all(
      Array.from({ length: concurrentAcceptanceCount }, (_, index) =>
        store.acceptMessage({
          messageId: `stress-${index}`,
          target: stress.address,
          type: 'stress',
          payload: { index },
        }),
      ),
    );
    const sequences = acks.map((ack) => ack.targetSequence).sort((a, b) => a - b);
    assert(
      jsonEqual(sequences, Array.from({ length: concurrentAcceptanceCount }, (_, index) => index + 1)),
      'concurrent acceptance did not allocate one contiguous sequence per message',
    );
    const duplicateAcks = await Promise.all(
      Array.from({ length: concurrentAcceptanceCount }, (_, index) =>
        store.acceptMessage({
          messageId: `stress-${index}`,
          target: stress.address,
          type: 'stress',
          payload: { index },
        }),
      ),
    );
    assert(duplicateAcks.every((ack) => ack.status === 'duplicate'), 'concurrent duplicate replay allocated new messages');
    checks.push('concurrent-acceptance-stress');

    store = await harness.reopen(store);
    const persisted = await store.getInstance(stress.address);
    assert(persisted !== null, 'instance disappeared after database close/reopen');
    const persistedMessage = await store.getMessageDisposition(stress.address, 'stress-31');
    assert(persistedMessage?.targetSequence === 32, 'accepted message identity changed after database close/reopen');
    const persistedEffect = await store.getEffect('effect-1');
    assert(persistedEffect?.status === 'completed', 'effect journal disappeared after database close/reopen');
    checks.push('restart-persistence');

    return {
      checks,
      concurrentAcceptanceCount,
      restartPersistence: true,
    };
  } finally {
    await store.close();
  }
}
