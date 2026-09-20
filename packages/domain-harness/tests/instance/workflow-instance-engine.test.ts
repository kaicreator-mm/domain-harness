import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PerInstanceSerializedLane } from '../../src/engine/per-instance-serialized-lane.js';
import { WorkflowInstanceEngine } from '../../src/engine/workflow-instance-engine.js';
import { workflowAddressKey } from '../../src/instance/workflow-address.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';
import { FakeInstanceRuntimeStore } from './fake-runtime-store.js';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function counter(snapshot: WorkflowInstanceSnapshot): number {
  const state = snapshot.state;
  assert.equal(typeof state, 'object');
  assert.notEqual(state, null);
  assert.equal(Array.isArray(state), false);
  const value = (state as Record<string, unknown>).count;
  assert.equal(typeof value, 'number');
  return value as number;
}

function clock(): () => string {
  let tick = 0;
  return () => `2026-09-18T03:00:${String(tick++).padStart(2, '0')}.000Z`;
}

const addressA: WorkflowAddress = { workflowId: 'review', instanceKey: 'order-100' };
const addressB: WorkflowAddress = { workflowId: 'review', instanceKey: 'order-200' };

test('WorkflowAddress key is stable and collision-safe for workflowId + instanceKey', () => {
  assert.equal(workflowAddressKey(addressA), workflowAddressKey({ ...addressA }));
  assert.notEqual(
    workflowAddressKey({ workflowId: 'a|b', instanceKey: 'c' }),
    workflowAddressKey({ workflowId: 'a', instanceKey: 'b|c' }),
  );
});

test('persistent Workflow Instance identity and committed state survive engine restart', async () => {
  const fake = new FakeInstanceRuntimeStore();
  const firstRuntime = new WorkflowInstanceEngine(fake.store, { now: clock() });

  const created = await firstRuntime.createInstance({
    address: addressA,
    correlationId: 'customer-42',
    packageId: 'pkg-A',
    initialState: { count: 0 },
  });
  assert.equal(created.stateRevision, 0);

  fake.seedAcceptedTurn(addressA, 'm-1', 1);
  const committed = await firstRuntime.processAcceptedTransition({
    target: addressA,
    messageId: 'm-1',
    expectedTargetSequence: 1,
    transition: (current) => ({ nextState: { count: counter(current) + 1 }, nextLifecycle: 'waiting' }),
  });
  assert.equal(committed.stateRevision, 1);
  assert.equal(counter(committed), 1);

  const restartedRuntime = new WorkflowInstanceEngine(fake.store, { now: clock() });
  const restored = await restartedRuntime.getInstance(addressA);
  assert.notEqual(restored, null);
  assert.deepEqual(restored?.address, addressA);
  assert.equal(restored?.correlationId, 'customer-42');
  assert.equal(restored?.packageId, 'pkg-A');
  assert.equal(restored?.lifecycle, 'waiting');
  assert.equal(restored?.stateRevision, 1);
  assert.equal(restored === null ? -1 : counter(restored), 1);
});

test('same instance transitions are strictly serialized and observe prior committed revision', async () => {
  const fake = new FakeInstanceRuntimeStore();
  const engine = new WorkflowInstanceEngine(fake.store, { now: clock() });
  await engine.createInstance({
    address: addressA,
    correlationId: 'corr-A',
    packageId: 'pkg-A',
    initialState: { count: 0 },
  });
  fake.seedAcceptedTurn(addressA, 'm-1', 1);
  fake.seedAcceptedTurn(addressA, 'm-2', 2);

  const firstEntered = deferred();
  const releaseFirst = deferred();
  let secondEntered = false;
  const observedRevisions: number[] = [];

  const first = engine.processAcceptedTransition({
    target: addressA,
    messageId: 'm-1',
    expectedTargetSequence: 1,
    transition: async (current) => {
      observedRevisions.push(current.stateRevision);
      firstEntered.resolve();
      await releaseFirst.promise;
      return { nextState: { count: counter(current) + 1 } };
    },
  });
  const second = engine.processAcceptedTransition({
    target: addressA,
    messageId: 'm-2',
    expectedTargetSequence: 2,
    transition: (current) => {
      secondEntered = true;
      observedRevisions.push(current.stateRevision);
      return { nextState: { count: counter(current) + 1 } };
    },
  });

  await firstEntered.promise;
  await Promise.resolve();
  assert.equal(secondEntered, false);
  releaseFirst.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(observedRevisions, [0, 1]);
  const final = await engine.getInstance(addressA);
  assert.equal(final?.stateRevision, 2);
  assert.equal(final === null ? -1 : counter(final), 2);
});

test('different instances progress concurrently without a global scheduler lock', async () => {
  const fake = new FakeInstanceRuntimeStore();
  const engine = new WorkflowInstanceEngine(fake.store, { now: clock() });
  for (const [address, correlationId] of [[addressA, 'corr-A'], [addressB, 'corr-B']] as const) {
    await engine.createInstance({ address, correlationId, packageId: 'pkg-A', initialState: { count: 0 } });
    fake.seedAcceptedTurn(address, 'm-1', 1);
  }

  const enteredA = deferred();
  const enteredB = deferred();
  const release = deferred();
  const run = (target: WorkflowAddress, entered: ReturnType<typeof deferred>) =>
    engine.processAcceptedTransition({
      target,
      messageId: 'm-1',
      expectedTargetSequence: 1,
      transition: async (current) => {
        entered.resolve();
        await release.promise;
        return { nextState: { count: counter(current) + 1 } };
      },
    });

  const workA = run(addressA, enteredA);
  const workB = run(addressB, enteredB);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('cross-instance work was globally serialized')), 500),
  );
  await Promise.race([Promise.all([enteredA.promise, enteredB.promise]), timeout]);
  release.resolve();
  await Promise.all([workA, workB]);

  assert.equal((await engine.getInstance(addressA))?.stateRevision, 1);
  assert.equal((await engine.getInstance(addressB))?.stateRevision, 1);
});

test('stateRevision changes only when RuntimeStore commits and lane rejection does not poison later work', async () => {
  const fake = new FakeInstanceRuntimeStore();
  const engine = new WorkflowInstanceEngine(fake.store, { now: clock() });
  await engine.createInstance({
    address: addressA,
    correlationId: 'corr-A',
    packageId: 'pkg-A',
    initialState: { count: 0 },
  });

  fake.seedAcceptedTurn(addressA, 'm-1', 1);
  fake.failNextCommit();
  await assert.rejects(
    engine.processAcceptedTransition({
      target: addressA,
      messageId: 'm-1',
      expectedTargetSequence: 1,
      transition: (current) => ({ nextState: { count: counter(current) + 1 } }),
    }),
    /injected commit failure/,
  );
  assert.equal((await engine.getInstance(addressA))?.stateRevision, 0);

  const lane = new PerInstanceSerializedLane();
  await assert.rejects(lane.run(addressA, async () => { throw new Error('first failed'); }), /first failed/);
  assert.equal(await lane.run(addressA, async () => 42), 42);
});

test('T-010 instance/engine implementation does not import or persist XState internals', () => {
  const files = [
    '../../src/instance/workflow-address.ts',
    '../../src/instance/persistent-workflow-instance.ts',
    '../../src/engine/per-instance-serialized-lane.ts',
    '../../src/engine/workflow-instance-engine.ts',
  ];
  for (const relative of files) {
    const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
    assert.doesNotMatch(source, /from\s+['"]xstate['"]/);
    assert.doesNotMatch(source, /xstate/i);
  }
});
