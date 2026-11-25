import assert from 'node:assert/strict';
import test from 'node:test';
import { dense, validLimit, opaqueId, dependencyOrder } from '../../src/semantic-data.js';
import { invalidateEvidence } from '../../src/standard-evidence.js';
import { selectNextDecision } from '../../src/standard-decision.js';
import type { DecisionDescription } from '../../src/standard-decision.js';
import { InteractionElement } from '../../src/standard-interaction.js';
import { runInteractiveRecognitionHandling } from '../../src/standard-interactive-recognition.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';
import type { InteractionDecision } from '../../src/standard-interaction.js';

const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
const ready = (n: number): StandardWorkflowOutcome<InteractionDecision<number, number>> => ok({ kind: 'ready', intent: n });
const limits = { maxCalls: 4, maxSteps: 5, maxDepth: 0 };

test('内部数据检查保留空数组、稀疏及继承索引拒绝、边界和opaque id', () => {
  assert.equal(dense([]), true);
  assert.equal(dense([undefined]), true);
  assert.equal(dense(new Array<string>(1)), false);
  const inherited = new Array<string>(1);
  Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype) as object, { 0: 'x' }));
  assert.equal(dense(inherited), false);
  for (const n of [-1, 1.5, Infinity, NaN, 4097]) assert.equal(validLimit(n, 4096), false);
  assert.equal(validLimit(0, 4096), true);
  assert.equal(validLimit(4096, 4096), true);
  for (const id of ['constructor', 'prototype', '', 'a/b', 'a'.repeat(129)]) assert.equal(opaqueId(id), false);
  assert.equal(opaqueId('a-0.b:c_d'), true);
});

test('共享拓扑排序保留原输入与稳定顺序；B/C长链、循环及有界行为', () => {
  const keys = ['b', 'c', 'a'];
  const children = new Map<string, readonly string[]>([['a', ['b']], ['b', []], ['c', []]]);
  const indegree = new Map([['a', 0], ['b', 1], ['c', 0]]);
  assert.deepEqual(dependencyOrder(keys, children, indegree), ['c', 'a', 'b']);
  assert.equal(indegree.get('b'), 1);
  const chain = Array.from({ length: 4096 }, (_, i) => `k${i}`);
  const declarations = chain.map((key, i) => ({ key, dependsOn: i === 0 ? [] : [chain[i - 1]!] }));
  const bounds = { maxItems: 4096, maxDependencies: 4095 };
  const invalidated = invalidateEvidence(chain, [chain[0]!], declarations, bounds);
  assert.deepEqual(invalidated, { complete: true, stale: chain, retained: [] });
  const decisions: readonly DecisionDescription<string>[] = declarations.map((d, i) => ({ ...d, applicable: 'yes', required: 'yes', satisfied: i === 0 ? 'no' : 'yes', priority: i }));
  const selected = selectNextDecision(decisions, bounds);
  assert.equal(selected.complete && selected.status === 'next' && selected.key, 'k0');
  const cyclic = declarations.map((d, i) => i === 0 ? { ...d, dependsOn: [chain.at(-1)!] } : d);
  assert.deepEqual(invalidateEvidence(chain, [], cyclic, { ...bounds, maxDependencies: 4096 }), { complete: false, reason: 'INVALID_DEPENDENCY' });
  assert.deepEqual(selectNextDecision(decisions.map((d, i) => ({ ...d, dependsOn: cyclic[i]!.dependsOn })), { ...bounds, maxDependencies: 4096 }), { complete: false, reason: 'INVALID_DEPENDENCY' });
  assert.deepEqual(invalidateEvidence(chain, [], declarations, { ...bounds, maxDependencies: 4094 }), { complete: false, reason: 'LIMIT' });
});

test('F分析取得同一个signal；再次resolve仍同根，旧三参callback兼容', async () => {
  let signal: AbortSignal | undefined;
  const result = await runInteractiveRecognitionHandling(new InteractionElement(), limits, 2, (n, _event, root, s) => {
    signal = s;
    assert.equal(root.remaining().calls, 3);
    assert.equal(s.aborted, false);
    return ready(n);
  }, async (n, scope) => {
    assert.equal(signal, scope.signal);
    const again = await scope.resolve(n, (value, _event, root, s) => {
      assert.equal(s, signal); assert.equal(root, scope.root); return ready(value + 1);
    });
    if (again.status !== 'COMPLETE') return again;
    return scope.step(() => { assert.equal(scope.root.remaining().calls, 0); return ok(again.value); });
  });
  assert.deepEqual(result, ok(3));
  assert.deepEqual(await runInteractiveRecognitionHandling(new InteractionElement(), { maxCalls: 2, maxSteps: 3, maxDepth: 0 }, 2,
    (n, _event, root) => { assert.equal(root.depth, 0); return ready(n); }, n => ok(n)), ok(2));
});

test('取消异步取证时已进入步骤收敛，不启动下一步或Handling，独立根不串扰', async () => {
  const interaction = new InteractionElement();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let ended = false, later = 0, handled = 0;
  const active = runInteractiveRecognitionHandling(interaction, limits, 0, async (_n, _event, root, signal) => {
    const first = await root.invoke(async () => { entered(); await gate; ended = true; return 1; });
    assert.equal(first.status, 'COMPLETE');
    assert.equal(signal.aborted, true);
    if (!signal.aborted) await root.invoke(() => { later++; });
    return ready(1);
  }, () => { handled++; return ok(0); });
  await started; interaction.cancel();
  assert.equal(ended, false);
  assert.deepEqual(await runInteractiveRecognitionHandling(new InteractionElement(), { maxCalls: 2, maxSteps: 3, maxDepth: 0 }, 9,
    (n, _event, _root, signal) => { assert.equal(signal.aborted, false); return ready(n); }, n => ok(n)), ok(9));
  release();
  const result = await active;
  assert.equal(result.status !== 'COMPLETE' && result.reason.code, 'CANCELLED');
  assert.equal(ended, true); assert.equal(later, 0); assert.equal(handled, 0);
});
