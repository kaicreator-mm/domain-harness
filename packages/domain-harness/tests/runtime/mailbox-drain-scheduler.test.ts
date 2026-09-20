import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MailboxDrainScheduler,
  addressKey,
} from '../../src/runtime/mailbox-drain-scheduler.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';

const TARGET: WorkflowAddress = { workflowId: 'wf', instanceKey: 'a' };
const OTHER: WorkflowAddress = { workflowId: 'wf', instanceKey: 'b' };

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test('drain scheduler keeps one active drain per target and preserves wake-ups', async () => {
  const started: string[] = [];
  const gate = deferred();
  let release = true;
  const scheduler = new MailboxDrainScheduler({
    drain: async (target) => {
      started.push(addressKey(target));
      if (!release) await gate.promise;
    },
    reportError() {
      assert.fail('no drain error expected');
    },
  });

  release = false;
  scheduler.schedule(TARGET);
  scheduler.schedule(TARGET);
  scheduler.schedule(TARGET);
  await Promise.resolve();
  assert.equal(started.length, 1, 'one active drain per target');
  assert.equal(scheduler.activeDrainCount, 1);

  release = true;
  gate.resolve();
  await scheduler.awaitIdle();
  assert.equal(started.length, 2, 'coalesced wake-ups re-drain exactly once');
  assert.equal(scheduler.activeDrainCount, 0);
});

test('drain scheduler runs distinct targets concurrently and awaitIdle follows redrain chains', async () => {
  const active = new Set<string>();
  const runsPerTarget = new Map<string, number>();
  let maxActive = 0;
  const scheduler = new MailboxDrainScheduler({
    drain: async (target) => {
      const key = addressKey(target);
      const run = (runsPerTarget.get(key) ?? 0) + 1;
      runsPerTarget.set(key, run);
      active.add(key);
      maxActive = Math.max(maxActive, active.size);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active.delete(key);
      if (run === 1) {
        scheduler.schedule(target); // exactly one redrain hop per target
      }
    },
    reportError() {
      assert.fail('no drain error expected');
    },
  });

  scheduler.schedule(TARGET);
  scheduler.schedule(OTHER);
  await scheduler.awaitIdle();
  assert.equal(maxActive, 2, 'distinct targets drain concurrently');
  assert.equal(runsPerTarget.get(addressKey(TARGET)), 2, 'redrain hop executed');
  assert.equal(runsPerTarget.get(addressKey(OTHER)), 2, 'redrain hop executed');
  assert.equal(scheduler.activeDrainCount, 0);
});

test('disposed scheduler never schedules or resurrects redrains', async () => {
  const started: string[] = [];
  const gate = deferred();
  let release = true;
  const scheduler = new MailboxDrainScheduler({
    drain: async (target) => {
      started.push(addressKey(target));
      if (!release) await gate.promise;
    },
    reportError() {
      assert.fail('no drain error expected');
    },
  });

  release = false;
  scheduler.schedule(TARGET);
  scheduler.schedule(TARGET); // queued wake-up
  await Promise.resolve();
  assert.equal(started.length, 1);

  scheduler.dispose();
  assert.equal(scheduler.disposed, true);
  release = true;
  gate.resolve();
  await scheduler.awaitIdle();
  assert.equal(started.length, 1, 'queued wake-up must not resurrect after dispose');

  scheduler.schedule(TARGET);
  await scheduler.awaitIdle();
  assert.equal(started.length, 1, 'schedule after dispose is a no-op');
});

test('suppressed drain errors are not reported; reporting a throwing handler cannot reject the chain', async () => {
  const suppressed = new Error('durable poison fact already recorded');
  const reported: unknown[] = [];
  let first = true;
  const scheduler = new MailboxDrainScheduler({
    drain: async () => {
      if (first) {
        first = false;
        throw suppressed;
      }
    },
    isDrainSuppressed: (error) => error === suppressed,
    reportError(error) {
      reported.push(error);
      throw new Error('host handler misbehaving');
    },
  });

  scheduler.schedule(TARGET);
  await scheduler.awaitIdle();
  // Length check instead of deepEqual([]): assert.deepEqual's `asserts`
  // signature would narrow `reported` to never[] for the rest of the test.
  assert.equal(reported.length, 0, 'suppressed error must not be reported');

  first = false;
  const unexpected = new Error('store exploded');
  const failing = new MailboxDrainScheduler({
    drain: async () => {
      throw unexpected;
    },
    reportError(error) {
      reported.push(error);
      throw new Error('host handler misbehaving');
    },
  });
  failing.schedule(TARGET);
  await failing.awaitIdle();
  assert.deepEqual(reported, [unexpected] as unknown[], 'non-suppressed error is reported once');
  // The throwing handler was contained: awaitIdle resolved, no unhandled
  // rejection escaped the floating drain chain.
});
