import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type {
  DomainSubscription,
} from '../../src/v2/contracts/subscription.js';
import {
  SubscriptionRegistry,
} from '../../src/subscription/index.js';
import type {
  SubscriptionScheduler,
} from '../../src/subscription/index.js';

class ManualScheduler implements SubscriptionScheduler {
  readonly tasks: Array<() => void> = [];

  schedule(task: () => void): void {
    this.tasks.push(task);
  }

  flushOne(): void {
    this.tasks.shift()?.();
  }

  flushAll(): void {
    while (this.tasks.length > 0) {
      this.flushOne();
    }
  }
}

async function tick(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function subscriptionIdentity(subscription: DomainSubscription): string {
  switch (subscription.kind) {
    case 'instance':
      return `instance:${subscription.target.workflowId}:${subscription.target.instanceKey}`;
    case 'message':
      return `message:${subscription.target.workflowId}:${subscription.target.instanceKey}:${subscription.messageId ?? '*'}`;
    case 'projection':
      return `projection:${subscription.projectionId}:${subscription.key}`;
  }
}

test('G22 delivers instance, message, and projection latest-state signals and unsubscribe is session-local', async () => {
  const scheduler = new ManualScheduler();
  const revisions = new Map<string, string>();
  const registry = new SubscriptionRegistry({
    scheduler,
    observationSource: {
      readRevision: async (subscription) =>
        revisions.get(subscriptionIdentity(subscription)) ?? null,
    },
  });
  const target = { workflowId: 'design', instanceKey: '42' };
  const seen: Array<[string, string]> = [];

  const stopInstance = registry.subscribe(
    { kind: 'instance', target },
    (change) => seen.push(['instance', change.revision]),
  );
  registry.subscribe(
    { kind: 'message', target },
    (change) => seen.push(['message-all', change.revision]),
  );
  registry.subscribe(
    { kind: 'message', target, messageId: 'm-1' },
    (change) => seen.push(['message-one', change.revision]),
  );
  registry.subscribe(
    { kind: 'projection', projectionId: 'dashboard', key: '42' },
    (change) => seen.push(['projection', change.revision]),
  );

  revisions.set('instance:design:42', 'i-1');
  revisions.set('message:design:42:*', 'ma-1');
  revisions.set('message:design:42:m-1', 'm1-1');
  revisions.set('projection:dashboard:42', 'p-1');

  registry.notifyInstanceChanged(target);
  registry.notifyMessageChanged(target, 'm-1');
  registry.notifyProjectionChanged('dashboard', '42');
  scheduler.flushAll();
  await tick();

  assert.deepEqual(seen, [
    ['instance', 'i-1'],
    ['message-all', 'ma-1'],
    ['message-one', 'm1-1'],
    ['projection', 'p-1'],
  ]);

  stopInstance();
  revisions.set('instance:design:42', 'i-2');
  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();

  assert.equal(
    seen.filter(([subject]) => subject === 'instance').length,
    1,
  );
});

test('G23 coalesces same-subject invalidations and resolves the latest revision at flush time', async () => {
  const scheduler = new ManualScheduler();
  let revision = 'p-1';
  let reads = 0;
  const seen: string[] = [];
  const registry = new SubscriptionRegistry({
    scheduler,
    observationSource: {
      readRevision: async () => {
        reads += 1;
        return revision;
      },
    },
  });

  registry.subscribe(
    { kind: 'projection', projectionId: 'summary', key: 'k' },
    (change) => seen.push(change.revision),
  );

  revision = 'p-2';
  registry.notifyProjectionChanged('summary', 'k');
  revision = 'p-3';
  registry.notifyProjectionChanged('summary', 'k');
  revision = 'p-4';
  registry.notifyProjectionChanged('summary', 'k');

  assert.equal(scheduler.tasks.length, 1);
  scheduler.flushAll();
  await tick();

  assert.equal(reads, 1);
  assert.deepEqual(seen, ['p-4']);
});

test('G23 re-reads after a signal races an in-flight observation so connected subscribers converge', async () => {
  const scheduler = new ManualScheduler();
  let revision = 'r-1';
  let releaseFirst!: () => void;
  let first = true;
  const seen: string[] = [];
  const registry = new SubscriptionRegistry({
    scheduler,
    observationSource: {
      readRevision: async () => {
        const captured = revision;
        if (first) {
          first = false;
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        return captured;
      },
    },
  });

  registry.subscribe(
    { kind: 'projection', projectionId: 'summary', key: 'race' },
    (change) => seen.push(change.revision),
  );

  revision = 'r-2';
  registry.notifyProjectionChanged('summary', 'race');
  scheduler.flushOne();
  await tick();

  revision = 'r-3';
  registry.notifyProjectionChanged('summary', 'race');
  releaseFirst();
  await tick();

  assert.equal(scheduler.tasks.length, 1);
  scheduler.flushAll();
  await tick();

  assert.deepEqual(seen, ['r-2', 'r-3']);
});

test('G23 business invalidation refreshes relevant projection observations and coalesces repeated invalidations', async () => {
  const scheduler = new ManualScheduler();
  const revisions = new Map<string, string>([
    ['projection:customer:42', 'c-1'],
    ['projection:inventory:42', 'i-1'],
  ]);
  const seen: Array<[string, string]> = [];
  const registry = new SubscriptionRegistry({
    scheduler,
    observationSource: {
      readRevision: async (subscription) =>
        revisions.get(subscriptionIdentity(subscription)) ?? null,
      isProjectionAffectedByBusinessInvalidation: (
        subscription,
        invalidation,
      ) =>
        subscription.projectionId === 'customer' &&
        invalidation.source === 'crm' &&
        subscription.key === invalidation.key,
    },
  });

  registry.subscribe(
    { kind: 'projection', projectionId: 'customer', key: '42' },
    (change) => seen.push(['customer', change.revision]),
  );
  registry.subscribe(
    { kind: 'projection', projectionId: 'inventory', key: '42' },
    (change) => seen.push(['inventory', change.revision]),
  );

  revisions.set('projection:customer:42', 'c-2');
  registry.invalidateBusinessSnapshot({ source: 'crm', key: '42' });
  revisions.set('projection:customer:42', 'c-3');
  registry.invalidateBusinessSnapshot({ source: 'crm', key: '42' });

  assert.equal(scheduler.tasks.length, 1);
  scheduler.flushAll();
  await tick();

  assert.deepEqual(seen, [['customer', 'c-3']]);
});

test('reconnect contract is Query latest then create a new non-durable subscription session', async () => {
  const scheduler = new ManualScheduler();
  let revision = 'v-1';
  const observationSource = {
    readRevision: async (): Promise<string> => revision,
  };
  const target = { workflowId: 'w', instanceKey: '1' };
  const firstSeen: string[] = [];
  const first = new SubscriptionRegistry({ scheduler, observationSource });
  const stop = first.subscribe(
    { kind: 'instance', target },
    (change) => firstSeen.push(change.revision),
  );

  first.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();
  stop();

  revision = 'v-2';
  first.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();
  assert.deepEqual(firstSeen, ['v-1']);

  const queriedLatest = await observationSource.readRevision();
  assert.equal(queriedLatest, 'v-2');

  const secondSeen: string[] = [];
  const second = new SubscriptionRegistry({ scheduler, observationSource });
  second.subscribe(
    { kind: 'instance', target },
    (change) => secondSeen.push(change.revision),
  );
  assert.deepEqual(secondSeen, []);

  revision = 'v-3';
  second.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();
  assert.deepEqual(secondSeen, ['v-3']);
});

test('portable subscription implementation has no Node EventEmitter or durable-store dependency', async () => {
  const source = await readFile(
    new URL('../../src/subscription/subscription-registry.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /EventEmitter/u);
  assert.doesNotMatch(source, /from ['"]node:/u);
  assert.doesNotMatch(source, /better-sqlite3/u);
  assert.doesNotMatch(source, /RuntimeStore/u);
});

interface RecordedRetry {
  task: () => void;
  delayMs: number;
}

test('G23 a transient observation failure keeps the generation pending and converges on retry', async () => {
  const scheduler = new ManualScheduler();
  const retries: RecordedRetry[] = [];
  let revision: string | null = null;
  let failReads = 1;
  let reads = 0;
  let errors = 0;
  const seen: string[] = [];
  const registry = new SubscriptionRegistry({
    scheduler,
    retryScheduler: (task, delayMs) => {
      retries.push({ task, delayMs });
    },
    observationSource: {
      readRevision: async () => {
        reads += 1;
        if (failReads > 0) {
          failReads -= 1;
          throw new Error('transient observation failure');
        }
        return revision;
      },
    },
    onObservationError: () => {
      errors += 1;
    },
  });
  const target = { workflowId: 'design', instanceKey: '77' };
  registry.subscribe({ kind: 'instance', target }, (change) => seen.push(change.revision));

  revision = 'i-1';
  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();

  assert.deepEqual(seen, [], 'failed observation must not emit');
  assert.equal(errors, 1, 'observation failure must be reported once');
  assert.equal(retries.length, 1, 'failed observation must schedule exactly one retry, not a tight loop');
  const first = retries.shift();
  assert.ok(first !== undefined && first.delayMs > 0, 'retry must be deferred with a positive delay');

  first.task();
  await tick();

  assert.deepEqual(seen, ['i-1'], 'connected subscriber must converge without a new signal');
  assert.equal(reads, 2);
  assert.equal(retries.length, 0, 'successful retry must not schedule further retries');
});

test('G23 repeated observation failures back off exponentially and success resets the delay', async () => {
  const scheduler = new ManualScheduler();
  const retries: RecordedRetry[] = [];
  let revision: string | null = 'i-1';
  let failReads = 2;
  const seen: string[] = [];
  const registry = new SubscriptionRegistry({
    scheduler,
    retryScheduler: (task, delayMs) => {
      retries.push({ task, delayMs });
    },
    observationSource: {
      readRevision: async () => {
        if (failReads > 0) {
          failReads -= 1;
          throw new Error('transient observation failure');
        }
        return revision;
      },
    },
  });
  const target = { workflowId: 'design', instanceKey: '78' };
  registry.subscribe({ kind: 'instance', target }, (change) => seen.push(change.revision));

  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();
  const firstDelay = retries[0]?.delayMs;

  retries.shift()?.task();
  await tick();
  const secondDelay = retries[0]?.delayMs;
  assert.ok(
    firstDelay !== undefined && secondDelay !== undefined && secondDelay > firstDelay,
    'consecutive failures must increase the retry delay',
  );

  retries.shift()?.task();
  await tick();
  assert.deepEqual(seen, ['i-1'], 'third read succeeds and delivers the latest revision');

  failReads = 1;
  revision = 'i-2';
  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();
  assert.equal(retries[0]?.delayMs, firstDelay, 'success must reset the retry backoff');

  retries.shift()?.task();
  await tick();
  assert.deepEqual(seen, ['i-1', 'i-2']);
});

test('G23 unsubscribe before a pending observation retry prevents delivery', async () => {
  const scheduler = new ManualScheduler();
  const retries: RecordedRetry[] = [];
  const seen: string[] = [];
  const registry = new SubscriptionRegistry({
    scheduler,
    retryScheduler: (task, delayMs) => {
      retries.push({ task, delayMs });
    },
    observationSource: {
      readRevision: async () => {
        throw new Error('persistent observation failure');
      },
    },
  });
  const target = { workflowId: 'design', instanceKey: '79' };
  const stop = registry.subscribe(
    { kind: 'instance', target },
    (change) => seen.push(change.revision),
  );

  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();
  assert.equal(retries.length, 1);

  stop();
  retries.shift()?.task();
  await tick();

  assert.deepEqual(seen, [], 'unsubscribed listener must not receive the retried observation');
  assert.equal(retries.length, 0, 'retry chain must stop after unsubscribe');
});

test('G23 signals arriving during a pending observation retry coalesce to the latest revision', async () => {
  const scheduler = new ManualScheduler();
  const retries: RecordedRetry[] = [];
  let revision: string | null = null;
  let failReads = 1;
  let reads = 0;
  const seen: string[] = [];
  const registry = new SubscriptionRegistry({
    scheduler,
    retryScheduler: (task, delayMs) => {
      retries.push({ task, delayMs });
    },
    observationSource: {
      readRevision: async () => {
        reads += 1;
        if (failReads > 0) {
          failReads -= 1;
          throw new Error('transient observation failure');
        }
        return revision;
      },
    },
  });
  const target = { workflowId: 'design', instanceKey: '80' };
  registry.subscribe({ kind: 'instance', target }, (change) => seen.push(change.revision));

  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();
  assert.equal(retries.length, 1);

  revision = 'i-2';
  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await tick();
  assert.equal(retries.length, 1, 'a signal during a pending retry must coalesce, not stack flushes');

  retries.shift()?.task();
  await tick();

  assert.deepEqual(seen, ['i-2'], 'retry must observe the latest revision exactly once');
  assert.equal(reads, 2);
});

test('G23 idle() spans scheduled flushes and resolves after a pending retry succeeds', async () => {
  const scheduler = new ManualScheduler();
  const retries: RecordedRetry[] = [];
  let failReads = 1;
  const registry = new SubscriptionRegistry({
    scheduler,
    retryScheduler: (task, delayMs) => {
      retries.push({ task, delayMs });
    },
    observationSource: {
      readRevision: async () => {
        if (failReads > 0) {
          failReads -= 1;
          throw new Error('transient observation failure');
        }
        return 'i-1';
      },
    },
  });
  const target = { workflowId: 'design', instanceKey: '90' };
  registry.subscribe({ kind: 'instance', target }, () => {});

  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(retries.length, 1);

  // idle() is a point-in-time query: with a failure retry pending it must not
  // resolve until a successful observation consumes the generation.
  let idleResolved = false;
  const idle = registry.idle().then(() => {
    idleResolved = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(idleResolved, false, 'pending failure retry keeps the registry non-idle');

  retries.shift()?.task();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await idle;
  assert.equal(idleResolved, true, 'idle resolves after the retry succeeds');
});

test('G23 dispose stops delivery, resolves idle and neutralizes pending retries', async () => {
  const scheduler = new ManualScheduler();
  const retries: RecordedRetry[] = [];
  const seen: string[] = [];
  const registry = new SubscriptionRegistry({
    scheduler,
    retryScheduler: (task, delayMs) => {
      retries.push({ task, delayMs });
    },
    observationSource: {
      readRevision: async () => {
        throw new Error('persistent observation failure');
      },
    },
  });
  const target = { workflowId: 'design', instanceKey: '91' };
  registry.subscribe({ kind: 'instance', target }, (change) => seen.push(change.revision));

  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(retries.length, 1);

  const idle = registry.idle();
  registry.dispose();
  await idle;

  retries.shift()?.task();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, [], 'pending retry must not deliver after dispose');

  registry.notifyInstanceChanged(target);
  scheduler.flushAll();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, [], 'notify after dispose is a no-op');

  assert.throws(
    () => registry.subscribe({ kind: 'instance', target }, () => {}),
    /disposed/u,
  );
  registry.dispose(); // idempotent
});
