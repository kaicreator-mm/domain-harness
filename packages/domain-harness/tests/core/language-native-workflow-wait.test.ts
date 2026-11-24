import assert from 'node:assert/strict';
import test from 'node:test';
import { KernelLifecycle } from '../../src/kernel-lifecycle.js';
import { StandardWorkflowSession } from '../../src/native-workflow-composition.js';

// Test-only input barrier; not a production Interaction or task scheduler.
function gate<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>(resolve => { release = resolve; });
  return { promise, release };
}

const kdp = { packageMeta: { id: 'kdp', role: 'core', order: 0 } } as const;
const limits = { maxCalls: 2, maxSteps: 4, maxDepth: 1 };

for (const [name, budget, expected] of [
  ['exact', limits, 'COMPLETE'],
  ['calls-short', { ...limits, maxCalls: 1 }, 'WORKFLOW_CALL_BUDGET'],
  ['steps-short', { ...limits, maxSteps: 3 }, 'WORKFLOW_STEP_BUDGET'],
] as const) {
  test(`active wait retains root budget: ${name}`, { timeout: 3000 }, async () => {
    const app = new KernelLifecycle([kdp]);
    await app.start({ appId: 'workflow-wait' });
    const reached = gate<void>();
    const answer = gate<string>();
    const events: string[] = [];
    const session = new StandardWorkflowSession(budget);
    const a = app.execute(() => session.run(async root => {
      const before = await root.invoke(() => { events.push('A:before'); return 1; });
      if (before.status !== 'COMPLETE') return before;
      return root.child(0, async child => {
        events.push('A:waiting');
        reached.release();
        const value = await answer.promise;
        return child.invoke(() => { events.push(`A:effect:${value}`); return value; });
      });
    }));
    try {
      await reached.promise;
      const b = await app.execute(() => new StandardWorkflowSession(limits).run(root =>
        root.invoke(() => { events.push('B:done'); return 'B'; })));
      const c = await app.execute(() => new StandardWorkflowSession(limits).run(root =>
        root.invoke(() => { events.push('C:done'); return 'C'; })));
      assert.deepEqual(b, { status: 'COMPLETE', value: 'B' });
      assert.deepEqual(c, { status: 'COMPLETE', value: 'C' });
      assert.deepEqual(events, ['A:before', 'A:waiting', 'B:done', 'C:done']);
      const rerun = await session.run(root => root.invoke(() => events.push('A:reset')));
      assert.equal(rerun.status === 'FAILED' && rerun.reason.code, 'WORKFLOW_ALREADY_RUN');
      answer.release('chosen');
      const result = await a;
      if (expected === 'COMPLETE') {
        assert.deepEqual(result, { status: 'COMPLETE', value: 'chosen' });
        assert.deepEqual(events.slice(4), ['A:effect:chosen']);
      } else {
        assert.equal(result.status === 'FAILED' && result.reason.code, expected);
        assert.deepEqual(events.slice(4), []);
      }
      const after = await app.execute(() => new StandardWorkflowSession(limits).run(root =>
        root.invoke(() => 'independent')));
      assert.deepEqual(after, { status: 'COMPLETE', value: 'independent' });
    } finally {
      answer.release('cleanup');
      await a;
      await app[Symbol.asyncDispose]();
    }
  });
}

test('cooperative local cancellation and dependent branch do not stop other roots', { timeout: 3000 }, async () => {
  const app = new KernelLifecycle([kdp]);
  await app.start({ appId: 'local-cancel' });
  const reached = gate<void>();
  const choice = gate<'cancel' | 'accept'>();
  const other = gate<void>();
  const otherReached = gate<void>();
  const events: string[] = [];
  const a = app.execute(() => new StandardWorkflowSession({ maxCalls: 3, maxSteps: 4, maxDepth: 0 }).run(root => root.leaf({
    start: () => { events.push('A:start'); },
    run: async () => {
      reached.release();
      if (await choice.promise === 'cancel') {
        return { status: 'REJECT', reason: { code: 'CANCELLED_BY_CALLER', message: 'Cancelled' } };
      }
      events.push('A:effect');
      return { status: 'COMPLETE', value: 'accepted' };
    },
    end: async () => { await Promise.resolve(); events.push('A:end'); },
  })));
  const dependent = app.execute(() => new StandardWorkflowSession(limits).run(async root => {
    const prerequisite = await a;
    if (prerequisite.status !== 'COMPLETE') return prerequisite;
    return root.invoke(() => events.push('dependent:effect'));
  }));
  const b = app.execute(() => new StandardWorkflowSession(limits).run(async root => {
    otherReached.release();
    await other.promise;
    return root.invoke(() => { events.push('B:effect'); return 'B'; });
  }));
  try {
    await Promise.all([reached.promise, otherReached.promise]);
    choice.release('cancel');
    const result = await a;
    assert.equal(result.status === 'REJECT' && result.reason.code, 'CANCELLED_BY_CALLER');
    assert.deepEqual(await dependent, result);
    assert.deepEqual(events, ['A:start', 'A:end']);
    other.release();
    assert.deepEqual(await b, { status: 'COMPLETE', value: 'B' });
    assert.deepEqual(events, ['A:start', 'A:end', 'B:effect']);
  } finally {
    choice.release('cancel'); other.release();
    await Promise.allSettled([a, b, dependent]);
    await app[Symbol.asyncDispose]();
  }
});

test('application close waits for active roots and rejects new execution', { timeout: 3000 }, async () => {
  const events: string[] = [];
  const app = new KernelLifecycle([{ ...kdp, Init: class {
    start() { events.push('init'); }
    [Symbol.asyncDispose]() { events.push('exit'); }
  } }]);
  await app.start({ appId: 'close-wait' });
  const waitA = gate<void>();
  const waitB = gate<void>();
  const a = app.execute(() => new StandardWorkflowSession(limits).run(root => root.invoke(async () => {
    await waitA.promise; events.push('A:done'); return 'A';
  })));
  const b = app.execute(() => new StandardWorkflowSession(limits).run(root => root.invoke(async () => {
    await waitB.promise; events.push('B:done'); return 'B';
  })));
  const closing = app[Symbol.asyncDispose]();
  try {
    await assert.rejects(app.execute(() => events.push('late')), /closing/u);
    await Promise.resolve();
    assert.deepEqual(events, ['init']);
    waitA.release();
    assert.deepEqual(await a, { status: 'COMPLETE', value: 'A' });
    assert.deepEqual(events, ['init', 'A:done']);
    waitB.release();
    assert.deepEqual(await b, { status: 'COMPLETE', value: 'B' });
    await closing;
    assert.deepEqual(events, ['init', 'A:done', 'B:done', 'exit']);
    await assert.rejects(app.execute(() => events.push('late')), /closing/u);
    await app[Symbol.asyncDispose]();
    assert.equal(events.filter(x => x === 'exit').length, 1);
  } finally {
    waitA.release(); waitB.release();
    await Promise.allSettled([a, b, closing]);
  }
});

test('two sequential input waits retain one root and one dependent budget', { timeout: 3000 }, async () => {
  const app = new KernelLifecycle([kdp]);
  await app.start({ appId: 'two-waits' });
  const reached1 = gate<void>(), reached2 = gate<void>();
  const answer1 = gate<string>(), answer2 = gate<string>();
  const events: string[] = [];
  const a = app.execute(() => new StandardWorkflowSession({ maxCalls: 3, maxSteps: 6, maxDepth: 1 }).run(async root => {
    const first = await root.invoke(() => { events.push('A:initial'); return 'initial'; });
    if (first.status !== 'COMPLETE') return first;
    const next = await root.child(0, async child => {
      reached1.release();
      const selection = await answer1.promise;
      return child.invoke(() => { events.push(`A:choice:${selection}`); return selection; });
    });
    if (next.status !== 'COMPLETE') return next;
    const final = await root.child(0, async child => {
      reached2.release();
      const selection = await answer2.promise;
      return child.invoke(() => { events.push(`A:choice:${selection}`); return selection; });
    });
    if (final.status !== 'COMPLETE') return final;
    const refused = await root.invoke(() => { events.push('A:over-budget'); return 'over-budget'; });
    if (refused.status !== 'FAILED' || refused.reason.code !== 'WORKFLOW_CALL_BUDGET') return refused;
    return final;
  }));
  try {
    await reached1.promise;
    assert.deepEqual(await app.execute(() => new StandardWorkflowSession(limits).run(root => root.invoke(() => 'B'))),
      { status: 'COMPLETE', value: 'B' });
    answer1.release('one');
    await reached2.promise;
    assert.deepEqual(events, ['A:initial', 'A:choice:one']);
    assert.deepEqual(await app.execute(() => new StandardWorkflowSession(limits).run(root => root.invoke(() => 'C'))),
      { status: 'COMPLETE', value: 'C' });
    answer2.release('two');
    assert.deepEqual(await a, { status: 'COMPLETE', value: 'two' });
    assert.deepEqual(events, ['A:initial', 'A:choice:one', 'A:choice:two']);
  } finally {
    answer1.release('cleanup'); answer2.release('cleanup');
    await a;
    await app[Symbol.asyncDispose]();
  }
});
