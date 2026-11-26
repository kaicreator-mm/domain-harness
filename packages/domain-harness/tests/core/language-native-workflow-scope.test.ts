import assert from 'node:assert/strict';
import test from 'node:test';
import { StandardWorkflowSession } from '../../src/native-workflow-composition.js';
import type { NativeWorkflowContext } from '../../src/native-workflow-composition.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';

const limits = { maxCalls: 20, maxSteps: 30, maxDepth: 3 };
const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function assertClosed(context: NativeWorkflowContext) {
  const before = context.remaining();
  let entered = 0;
  const outcomes = await Promise.all([
    context.invoke(() => ++entered),
    context.invokeOutcome(() => ok(++entered)),
    context.child(0, () => ok(++entered)),
    context.leaf({ start: () => { entered++; }, run: () => ok(++entered), end: () => { entered++; } }),
  ]);
  for (const outcome of outcomes) {
    assert.equal(outcome.status, 'FAILED');
    assert.equal(outcome.status === 'FAILED' && outcome.reason.code, 'WORKFLOW_SCOPE_CLOSED');
  }
  assert.equal(entered, 0);
  assert.deepEqual(context.remaining(), before);
}

test('retained child is closed before return, independent live sibling/root unaffected', async () => {
  let retained!: NativeWorkflowContext;
  let retainedRoot!: NativeWorkflowContext;
  const gate = deferred();
  const entered = deferred();
  const result = await new StandardWorkflowSession(limits).run(async root => {
    retainedRoot = root;
    const sibling = root.child(0, async scope => {
      entered.release();
      await gate.promise;
      return scope.invoke(() => 9);
    });
    await entered.promise;
    assert.deepEqual(await root.child(0, scope => { retained = scope; return ok(2); }), ok(2));
    await assertClosed(retained);
    assert.deepEqual(await root.invoke(() => 5), ok(5));
    gate.release();
    assert.deepEqual(await sibling, ok(9));
    return ok(7);
  });
  assert.deepEqual(result, ok(7));
  await assertClosed(retainedRoot);
  await assertClosed(retained);
  assert.deepEqual(await new StandardWorkflowSession(limits).run(root => root.invoke(() => 3)), ok(3));
});

test('root closes admission and actually joins outstanding owned operation before returning UNKNOWN', async () => {
  const gate = deferred();
  const entered = deferred();
  let root!: NativeWorkflowContext;
  let finished = false;
  const flow = new StandardWorkflowSession(limits).run(scope => {
    root = scope;
    void scope.invoke(async () => { entered.release(); await gate.promise; finished = true; });
    return ok(1);
  });
  await entered.promise;
  // The root callback has returned, but its owned operation is still using local resources.
  await Promise.resolve();
  await assertClosed(root);
  let delivered = false;
  void flow.then(() => { delivered = true; });
  await Promise.resolve();
  assert.equal(delivered, false);
  assert.equal(finished, false);
  gate.release();
  const result = await flow;
  assert.equal(finished, true);
  assert.equal(result.status, 'UNKNOWN');
  assert.equal(result.status === 'UNKNOWN' && result.reason.code, 'WORKFLOW_UNJOINED_WORK');
});

test('ancestor stopping fences descendants, prepaid leaf cleanup still runs, original UNKNOWN retained', async () => {
  const gate = deferred();
  const entered = deferred();
  let child!: NativeWorkflowContext;
  let runCount = 0;
  let endCount = 0;
  const pending = new StandardWorkflowSession(limits).run(root => {
    void root.child(0, scope => {
      child = scope;
      return scope.leaf({
        start: async () => { entered.release(); await gate.promise; },
        run: () => ok(++runCount),
        end: () => { endCount++; },
      });
    });
    return { status: 'UNKNOWN', reason: { code: 'REMOTE_UNKNOWN', message: 'actual settlement unknown' } };
  });
  await entered.promise;
  await Promise.resolve();
  await assertClosed(child);
  gate.release();
  const result = await pending;
  assert.equal(runCount, 0);
  assert.equal(endCount, 1);
  assert.equal(result.status === 'UNKNOWN' && result.reason.code, 'REMOTE_UNKNOWN');
});

test('child joins its own outstanding operation and cannot use retained scope after return', async () => {
  const gate = deferred();
  const entered = deferred();
  const result = await new StandardWorkflowSession(limits).run(async root => {
    let retained!: NativeWorkflowContext;
    const pending = root.child(0, child => {
      retained = child;
      void child.invoke(async () => { entered.release(); await gate.promise; });
      return ok('candidate');
    });
    await entered.promise;
    await Promise.resolve();
    await assertClosed(retained);
    assert.deepEqual(await root.invoke(() => 'root active'), ok('root active'));
    gate.release();
    const childResult = await pending;
    assert.equal(childResult.status, 'UNKNOWN');
    await assertClosed(retained);
    return ok('joined');
  });
  assert.deepEqual(result, ok('joined'));
});
