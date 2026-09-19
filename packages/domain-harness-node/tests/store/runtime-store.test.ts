import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  makeConformanceAddress,
  makeConformanceInstance,
} from '../../../domain-harness/tests/helpers/runtime-store-conformance.ts';
import type { RuntimeFailure } from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import { makeTestStore } from './test-helpers.js';

const T0 = '2026-09-18T00:00:00.000Z';
const T1 = '2026-09-18T00:00:01.000Z';
const T2 = '2026-09-18T00:00:02.000Z';
const T3 = '2026-09-18T00:00:03.000Z';

test('G5 configures WAL, FULL synchronous mode, busy timeout, and foreign keys', (t) => {
  const { store } = makeTestStore(t, 7_500);
  assert.deepEqual(store.inspectPragmas(), {
    journalMode: 'wal',
    synchronous: 2,
    busyTimeoutMs: 7_500,
    foreignKeys: 1,
  });
});

test('G5 creates, reads, and lists only retained package pins', async (t) => {
  const { store } = makeTestStore(t);
  const active = makeConformanceInstance('active', T0);
  const terminal = {
    ...makeConformanceInstance('terminal', T0),
    packageId: 'pkg-terminal',
    lifecycle: 'completed' as const,
  };
  await store.createInstance(active);
  await store.createInstance(terminal);

  assert.deepEqual(await store.getInstance(active.address), active);
  assert.deepEqual(await store.listPinnedPackageIds(), ['pkg-conformance']);
});

test('G5 accepts messages atomically, assigns monotonic target sequence, and deduplicates', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('accept');
  await store.createInstance(makeConformanceInstance('accept', T0));

  const first = await store.acceptMessage({
    messageId: 'm-1',
    target,
    type: 'advance',
    payload: { value: 1 },
  });
  const duplicate = await store.acceptMessage({
    messageId: 'm-1',
    target,
    type: 'advance',
    payload: { value: 1 },
  });
  const second = await store.acceptMessage({
    messageId: 'm-2',
    target,
    type: 'advance',
    payload: { value: 2 },
    correlationId: 'explicit-correlation',
    causationId: 'm-1',
    contractVersion: '1',
  });

  assert.equal(first.status, 'accepted');
  assert.equal(first.targetSequence, 1);
  assert.deepEqual(duplicate, { ...first, status: 'duplicate' });
  assert.equal(second.targetSequence, 2);

  const firstDisposition = await store.getMessageDisposition(target, 'm-1');
  assert.equal(firstDisposition?.correlationId, 'corr-accept');
  assert.equal(firstDisposition?.disposition, 'accepted');

  const secondDisposition = await store.getMessageDisposition(target, 'm-2');
  assert.equal(secondDisposition?.correlationId, 'explicit-correlation');
  assert.equal(secondDisposition?.causationId, 'm-1');
});

test('G5 preserves per-target head ordering through processing and commit', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('ordering');
  await store.createInstance(makeConformanceInstance('ordering', T0));

  await store.acceptMessage({
    messageId: 'm-1',
    target,
    type: 'advance',
    payload: { value: 1 },
  });
  await store.acceptMessage({
    messageId: 'm-2',
    target,
    type: 'advance',
    payload: { value: 2 },
  });

  assert.equal((await store.getNextAcceptedMessage(target))?.message.messageId, 'm-1');
  assert.equal(await store.markMessageProcessing(target, 'm-2', T1), false);
  assert.equal(await store.markMessageProcessing(target, 'm-1', T1), true);
  assert.equal(await store.getNextAcceptedMessage(target), null);

  await store.commitProcessedMessage({
    target,
    messageId: 'm-1',
    expectedTargetSequence: 1,
    nextState: { value: 1 },
    nextLifecycle: 'active',
    updatedAt: T2,
  });

  assert.equal((await store.getNextAcceptedMessage(target))?.message.messageId, 'm-2');
  assert.equal((await store.getInstance(target))?.stateRevision, 1);
  assert.equal((await store.getMessageDisposition(target, 'm-1'))?.disposition, 'processed');
});

test('G5 failure enters recovery_required and blocks later messages until explicit reset', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('recovery');
  await store.createInstance(makeConformanceInstance('recovery', T0));

  await store.acceptMessage({
    messageId: 'm-1',
    target,
    type: 'poison',
    payload: null,
  });
  await store.acceptMessage({
    messageId: 'm-2',
    target,
    type: 'later',
    payload: null,
  });
  assert.equal(await store.markMessageProcessing(target, 'm-1', T1), true);

  const failure: RuntimeFailure = {
    code: 'POISON',
    message: 'fixture failure',
    sourceMessageId: 'm-1',
  };
  await store.failMessageProcessing({
    target,
    messageId: 'm-1',
    expectedTargetSequence: 1,
    failure,
    updatedAt: T2,
  });

  assert.equal((await store.getInstance(target))?.lifecycle, 'recovery_required');
  assert.equal((await store.getMessageDisposition(target, 'm-1'))?.disposition, 'failed');
  assert.equal(await store.getNextAcceptedMessage(target), null);
  await assert.rejects(
    store.acceptMessage({
      messageId: 'm-3',
      target,
      type: 'blocked',
      payload: null,
    }),
    /does not accept new messages/,
  );

  const reset = await store.resetRecovery(target, T3);
  assert.equal(reset.lifecycle, 'active');
  assert.equal(reset.failure, undefined);
  assert.equal((await store.getNextAcceptedMessage(target))?.message.messageId, 'm-1');
});

test('G5 head-of-queue blocking: a processing head hides later accepted messages', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('head-blocking');
  await store.createInstance(makeConformanceInstance('head-blocking', T0));

  await store.acceptMessage({ messageId: 'm-1', target, type: 'advance', payload: null });
  await store.acceptMessage({ messageId: 'm-2', target, type: 'advance', payload: null });
  assert.equal(await store.markMessageProcessing(target, 'm-1', T1), true);

  assert.equal(await store.getNextAcceptedMessage(target), null);
  assert.equal(await store.markMessageProcessing(target, 'm-2', T2), false);
});

test('G5 reclaimInterruptedProcessing returns an interrupted head to accepted with identity intact', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('reclaim');
  await store.createInstance(makeConformanceInstance('reclaim', T0));

  const first = await store.acceptMessage({ messageId: 'm-1', target, type: 'advance', payload: { value: 1 } });
  await store.acceptMessage({ messageId: 'm-2', target, type: 'advance', payload: { value: 2 } });
  assert.equal(await store.markMessageProcessing(target, 'm-1', T1), true);
  assert.equal(await store.getNextAcceptedMessage(target), null);

  const reclaimed = await store.reclaimInterruptedProcessing(target);
  assert.deepEqual(reclaimed, ['m-1']);

  const disposition = await store.getMessageDisposition(target, 'm-1');
  assert.equal(disposition?.disposition, 'accepted');
  assert.equal(disposition?.processingAt, undefined);
  assert.equal(disposition?.targetSequence, first.targetSequence);

  assert.equal((await store.getNextAcceptedMessage(target))?.message.messageId, 'm-1');
  assert.equal(await store.markMessageProcessing(target, 'm-1', T2), true);
  await store.commitProcessedMessage({
    target,
    messageId: 'm-1',
    expectedTargetSequence: first.targetSequence,
    nextState: { value: 1 },
    nextLifecycle: 'active',
    updatedAt: T3,
  });
  assert.equal((await store.getMessageDisposition(target, 'm-1'))?.disposition, 'processed');

  assert.deepEqual(await store.reclaimInterruptedProcessing(target), []);
  assert.equal((await store.getNextAcceptedMessage(target))?.message.messageId, 'm-2');
});

test('G5 listUnresolvedMessageTargets enumerates accepted and processing mailboxes only', async (t) => {
  const { store } = makeTestStore(t);
  const pending = makeConformanceAddress('pending');
  const interrupted = makeConformanceAddress('interrupted');
  const settled = makeConformanceAddress('settled');
  await store.createInstance(makeConformanceInstance('pending', T0));
  await store.createInstance(makeConformanceInstance('interrupted', T0));
  await store.createInstance(makeConformanceInstance('settled', T0));

  await store.acceptMessage({ messageId: 'm-pending', target: pending, type: 'advance', payload: null });
  await store.acceptMessage({ messageId: 'm-interrupted', target: interrupted, type: 'advance', payload: null });
  assert.equal(await store.markMessageProcessing(interrupted, 'm-interrupted', T1), true);
  await store.acceptMessage({ messageId: 'm-settled', target: settled, type: 'advance', payload: null });
  assert.equal(await store.markMessageProcessing(settled, 'm-settled', T1), true);
  await store.commitProcessedMessage({
    target: settled,
    messageId: 'm-settled',
    expectedTargetSequence: 1,
    nextState: { done: true },
    nextLifecycle: 'active',
    updatedAt: T2,
  });

  assert.deepEqual(await store.listUnresolvedMessageTargets(), [interrupted, pending]);

  assert.deepEqual(await store.reclaimInterruptedProcessing(interrupted), ['m-interrupted']);
  assert.deepEqual(await store.listUnresolvedMessageTargets(), [interrupted, pending]);
});

test('G5 reclaimInterruptedProcessing on an unknown or settled target is a no-op', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('reclaim-noop');
  await store.createInstance(makeConformanceInstance('reclaim-noop', T0));

  assert.deepEqual(await store.reclaimInterruptedProcessing(target), []);
  assert.deepEqual(
    await store.reclaimInterruptedProcessing(makeConformanceAddress('missing')),
    [],
  );
  assert.deepEqual(await store.listUnresolvedMessageTargets(), []);
});

test('G5 terminalization atomically abandons every unresolved accepted message', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('terminalize');
  await store.createInstance(makeConformanceInstance('terminalize', T0));

  await store.acceptMessage({ messageId: 'm-1', target, type: 'one', payload: null });
  await store.acceptMessage({ messageId: 'm-2', target, type: 'two', payload: null });
  assert.equal(await store.markMessageProcessing(target, 'm-1', T1), true);

  await store.terminalizeInstance({
    target,
    lifecycle: 'terminated',
    reason: { code: 'STOPPED', message: 'operator stop' },
    updatedAt: T2,
  });

  assert.equal((await store.getInstance(target))?.lifecycle, 'terminated');
  assert.equal((await store.getMessageDisposition(target, 'm-1'))?.disposition, 'abandoned');
  assert.equal((await store.getMessageDisposition(target, 'm-2'))?.disposition, 'abandoned');
  const duplicateAfterTerminal = await store.acceptMessage({
    messageId: 'm-1',
    target,
    type: 'one',
    payload: null,
  });
  assert.equal(duplicateAfterTerminal.status, 'duplicate');
  assert.equal(duplicateAfterTerminal.targetSequence, 1);

  await assert.rejects(
    store.acceptMessage({
      messageId: 'm-3',
      target,
      type: 'blocked',
      payload: null,
    }),
    /does not accept new messages/,
  );
});

test('G5 normal processing that reaches terminal lifecycle abandons pending messages', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('normal-terminal');
  await store.createInstance(makeConformanceInstance('normal-terminal', T0));

  await store.acceptMessage({ messageId: 'm-1', target, type: 'finish', payload: null });
  await store.acceptMessage({ messageId: 'm-2', target, type: 'pending', payload: null });
  await store.markMessageProcessing(target, 'm-1', T1);
  await store.commitProcessedMessage({
    target,
    messageId: 'm-1',
    expectedTargetSequence: 1,
    nextState: { done: true },
    nextLifecycle: 'completed',
    output: { ok: true },
    updatedAt: T2,
  });

  assert.equal((await store.getMessageDisposition(target, 'm-1'))?.disposition, 'processed');
  assert.equal((await store.getMessageDisposition(target, 'm-2'))?.disposition, 'abandoned');
  assert.equal((await store.getInstance(target))?.lifecycle, 'completed');
});

test('G5 effect journal is durable, idempotent by effectId, and immutable after completion', async (t) => {
  const { store } = makeTestStore(t);
  const target = makeConformanceAddress('effect');
  await store.createInstance(makeConformanceInstance('effect', T0));
  await store.acceptMessage({
    messageId: 'm-1',
    target,
    type: 'effect',
    payload: null,
  });

  const started = await store.beginEffect({
    effectId: 'effect-1',
    target,
    sourceMessageId: 'm-1',
    effectKind: 'tool',
    effectSemantics: 'idempotent',
    status: 'started',
    attempt: 1,
    input: { value: 1 },
    startedAt: T1,
  });
  assert.equal(started.status, 'started');
  assert.deepEqual(
    await store.beginEffect({
      effectId: 'effect-1',
      target,
      sourceMessageId: 'm-1',
      effectKind: 'tool',
      effectSemantics: 'idempotent',
      status: 'started',
      attempt: 2,
      input: { value: 1 },
      startedAt: T2,
    }),
    started,
  );

  const completed = await store.completeEffect({
    effectId: 'effect-1',
    status: 'completed',
    output: { value: 2 },
    completedAt: T2,
  });
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.output, { value: 2 });

  await assert.rejects(
    store.completeEffect({
      effectId: 'effect-1',
      status: 'failed',
      error: { shouldNotOverwrite: true },
      completedAt: T3,
    }),
    /already completed/,
    'conflicting completion status must fail closed',
  );

  const repeated = await store.completeEffect({
    effectId: 'effect-1',
    status: 'completed',
    output: { value: 999 },
    completedAt: T3,
  });
  assert.deepEqual(repeated, completed);
});

test('G5 public declaration does not expose the better-sqlite3 driver type', () => {
  const declaration = readFileSync(
    new URL('../../dist/store/node-sqlite-runtime-store.d.ts', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(declaration, /better-sqlite3/);
  assert.doesNotMatch(declaration, /\bDatabase\b/);
  assert.match(declaration, /implements RuntimeStore/);
});

test('store source can be instantiated without central package export wiring', async (t) => {
  const { databasePath } = makeTestStore(t);
  const second = new NodeSqliteRuntimeStore({ path: databasePath });
  second.close();
});
