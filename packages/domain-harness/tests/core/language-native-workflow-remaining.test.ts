import assert from 'node:assert/strict';
import test from 'node:test';
import { StandardWorkflowSession } from '../../src/native-workflow-composition.js';
import type { NativeWorkflowContext, WorkflowLimits } from '../../src/native-workflow-composition.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';

const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
const assertRemaining = (context: NativeWorkflowContext, calls: number, steps: number, maxDescendantDepth: number) =>
  assert.deepEqual(context.remaining(), { calls, steps, maxDescendantDepth });

test('余额快照只读且不消耗，反映根启动、调用、Hook 与共享子层', async () => {
  const result = await new StandardWorkflowSession({ maxCalls: 4, maxSteps: 7, maxDepth: 2 }).run(async root => {
    const first = root.remaining();
    assert.throws(() => {
      // @ts-expect-error 公开余额类型必须只读；实际对象也不可写。
      first.calls = 100;
    }, TypeError);
    assert.deepEqual(first, { calls: 4, steps: 6, maxDescendantDepth: 2 });
    assert.ok(Object.isFrozen(first));
    assert.notStrictEqual(first, root.remaining());
    assertRemaining(root, 4, 6, 2);
    assert.deepEqual(await root.invoke(() => 1), ok(1));
    const childResult = await root.child(0, async child => {
      assertRemaining(child, 3, 4, 0);
      assertRemaining(root, 3, 4, 2);
      return child.leaf({
        start: () => assertRemaining(child, 0, 1, 0),
        run: () => ok('leaf'),
        end: () => assertRemaining(root, 0, 1, 2),
      });
    });
    assert.deepEqual(childResult, ok('leaf'));
    assertRemaining(root, 0, 1, 2);
    assert.deepEqual(first, { calls: 4, steps: 6, maxDescendantDepth: 2 });
    let called = false;
    const refused = await root.invoke(() => { called = true; });
    assert.equal(refused.status === 'FAILED' && refused.reason.code, 'WORKFLOW_CALL_BUDGET');
    assert.equal(called, false);
    assertRemaining(root, 0, 1, 2);
    return ok('verified');
  });
  assert.deepEqual(result, ok('verified'));
});

test('祖先与本层深度限制取最小剩余值，拒绝不消耗预算', async () => {
  const result = await new StandardWorkflowSession({ maxCalls: 1, maxSteps: 8, maxDepth: 4 }).run(async root => {
    const nested = await root.child(1, async child => {
      assertRemaining(child, 1, 6, 1);
      return child.child(8, async grand => {
        assertRemaining(grand, 1, 5, 0);
        const before = grand.remaining();
        let entered = false;
        const denied = await grand.child(0, () => { entered = true; return ok(1); });
        assert.equal(denied.status === 'FAILED' && denied.reason.code, 'WORKFLOW_DEPTH_LIMIT');
        assert.equal(entered, false);
        assert.deepEqual(grand.remaining(), before);
        return ok('ancestor');
      });
    });
    assert.deepEqual(nested, ok('ancestor'));
    const wide = await root.child(8, async child => {
      assertRemaining(child, 1, 4, 3);
      return child.child(1, grand => {
        assertRemaining(grand, 1, 3, 1);
        return ok('local');
      });
    });
    assert.deepEqual(wide, ok('local'));
    assertRemaining(root, 1, 3, 4);
    return ok('verified');
  });
  assert.deepEqual(result, ok('verified'));
});

// 仅核对真实原生计费形状，不是 Workshop 专业求解器或完整交互验收。
async function fixedPath(root: NativeWorkflowContext, effects: string[]): Promise<StandardWorkflowOutcome<string>> {
  const budget = root.remaining();
  if (budget.calls < 4 || budget.steps < 7 || budget.maxDescendantDepth < 2) {
    return { status: 'FAILED', reason: { code: 'TEST_PREFLIGHT', message: 'Insufficient remaining budget' } };
  }
  const facts = await root.child(1, async child => {
    const first = await child.invoke(() => 'facts');
    if (first.status !== 'COMPLETE') return first;
    return child.child(0, grand => grand.invoke(() => 'graph'));
  });
  if (facts.status !== 'COMPLETE') return facts;
  const solved = await root.child(0, child => child.invoke(() => { effects.push('solve'); return 'plan'; }));
  if (solved.status !== 'COMPLETE') return solved;
  return root.invoke(() => solved.value);
}

for (const [name, limits, pass] of [
  ['exact', { maxCalls: 7, maxSteps: 11, maxDepth: 2 }, true],
  ['calls-short', { maxCalls: 6, maxSteps: 11, maxDepth: 2 }, false],
  ['steps-short', { maxCalls: 7, maxSteps: 10, maxDepth: 2 }, false],
  ['depth-short', { maxCalls: 7, maxSteps: 11, maxDepth: 1 }, false],
] as const satisfies readonly (readonly [string, WorkflowLimits, boolean])[]) {
  test(`同根已消耗后的固定路径前置门禁：${name}`, async () => {
    const effects: string[] = [];
    const result = await new StandardWorkflowSession(limits).run(async root => {
      for (let i = 0; i < 3; i++) assert.deepEqual(await root.invoke(() => i), ok(i));
      const before = root.remaining();
      assert.deepEqual(before, { calls: limits.maxCalls - 3, steps: limits.maxSteps - 4, maxDescendantDepth: limits.maxDepth });
      const decision = await fixedPath(root, effects);
      if (pass) {
        assert.deepEqual(decision, ok('plan'));
        assertRemaining(root, 0, 0, 2);
      } else {
        assert.equal(decision.status === 'FAILED' && decision.reason.code, 'TEST_PREFLIGHT');
        assert.deepEqual(root.remaining(), before);
      }
      return ok('verified');
    });
    assert.deepEqual(result, ok('verified'));
    assert.deepEqual(effects, pass ? ['solve'] : []);
  });
}

test('同根并发快照不预留，实际扣减拒绝竞争；无关根仍推进', { timeout: 3000 }, async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const effects: string[] = [];
  const result = await new StandardWorkflowSession({ maxCalls: 1, maxSteps: 2, maxDepth: 0 }).run(async root => {
    const snapshot = root.remaining();
    const first = root.invoke(async () => { effects.push('first'); await gate; return 'first'; });
    try {
      assert.deepEqual(snapshot, { calls: 1, steps: 1, maxDescendantDepth: 0 });
      assertRemaining(root, 0, 0, 0);
      const refused = await root.invoke(() => { effects.push('second'); });
      assert.equal(refused.status === 'FAILED' && refused.reason.code, 'WORKFLOW_CALL_BUDGET');
      const other = await new StandardWorkflowSession({ maxCalls: 1, maxSteps: 2, maxDepth: 0 }).run(ctx => {
        assertRemaining(ctx, 1, 1, 0);
        return ctx.invoke(() => { effects.push('other'); return 'other'; });
      });
      assert.deepEqual(other, ok('other'));
      assertRemaining(root, 0, 0, 0);
    } finally { release(); await first; }
    assert.deepEqual(await first, ok('first'));
    return ok('verified');
  });
  assert.deepEqual(result, ok('verified'));
  assert.deepEqual(effects, ['first', 'other']);
});
