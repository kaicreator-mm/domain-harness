import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEvidence } from '../../src/standard-evidence.js';
import type { EvidenceObservation } from '../../src/standard-evidence.js';
import { selectNextDecision } from '../../src/standard-decision.js';
import type { DecisionCondition, DecisionDescription } from '../../src/standard-decision.js';

const limits = { maxItems: 32, maxDependencies: 64 };
const decision = <K extends string>(key: K, overrides: Partial<Omit<DecisionDescription<K>, 'key'>> = {}): DecisionDescription<K> => ({
  key, dependsOn: [], applicable: 'yes', required: 'yes', satisfied: 'no', priority: 0, ...overrides,
});
function choose<K extends string>(ds: readonly DecisionDescription<K>[]) {
  const result = selectNextDecision(ds, limits);
  if (!result.complete) assert.fail(result.reason);
  return result;
}
function next<K extends string>(ds: readonly DecisionDescription<K>[]) {
  const result = choose(ds);
  assert.equal(result.status, 'next');
  if (result.status !== 'next') assert.fail('expected next');
  return result.key;
}

test('优先必要决策，同级按领域声明顺序，跳过已满足及不适用', () => {
  const ds = [decision('low', { priority: 1 }), decision('high', { priority: 9 }), decision('tie', { priority: 9 }),
    decision('done', { satisfied: 'yes', priority: 100 }), decision('unused', { applicable: 'no', priority: 100 }), decision('optional', { required: 'no', priority: 100 })];
  const result = choose(ds);
  assert.equal(next(ds), 'high');
  assert.deepEqual(result.rows.map(row => row.disposition), ['eligible', 'eligible', 'eligible', 'satisfied', 'skipped', 'skipped']);
  assert.equal(next([ds[2]!, ds[1]!, ds[0]!]), 'tie');
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.rows) && Object.isFrozen(result.rows[0]) && Object.isFrozen(result.rows[0]?.blockedBy));
  assert.equal(choose(ds.slice(3)).status, 'ready');
});

test('依赖必须实际满足，即使下游自身已满足或优先更高', () => {
  type K = 'parent' | 'child' | 'grand';
  const ds: readonly DecisionDescription<K>[] = [decision<K>('grand', { dependsOn: ['child'], priority: 99 }),
    decision<K>('child', { dependsOn: ['parent'], satisfied: 'yes', priority: 98 }), decision<K>('parent')];
  const result = choose(ds);
  assert.equal(next(ds), 'parent');
  assert.deepEqual(result.rows.map(row => row.blockedBy), [['child'], ['parent'], []]);
  const updated = ds.map(d => d.key === 'parent' ? { ...d, satisfied: 'yes' as const } : d);
  assert.equal(next(updated), 'grand');
  assert.equal(choose(updated.map(d => ({ ...d, satisfied: 'yes' }))).status, 'ready');
});

test('跳过不等于满足，实际已满足的可选前置仍可供下游使用', () => {
  type K = 'parent' | 'child';
  const child = decision<K>('child', { dependsOn: ['parent'] });
  for (const parent of [decision<K>('parent', { applicable: 'no', satisfied: 'yes' }), decision<K>('parent', { required: 'no' })]) {
    const result = choose([parent, child]);
    assert.equal(result.status, 'blocked');
    assert.deepEqual(result.rows.map(row => row.disposition), ['skipped', 'blocked']);
  }
  assert.equal(next([decision<K>('parent', { required: 'no', satisfied: 'yes' }), child]), 'child');
});

test('未知适用性、必要性和满足性不能伪造ready；冲突及独立下一项', () => {
  for (const field of ['applicable', 'required', 'satisfied'] as const) {
    assert.equal(choose([decision('x', { [field]: 'unknown' })]).status, 'unresolved');
    assert.equal(choose([decision('x', { [field]: 'conflict' })]).status, 'conflict');
    assert.equal(next([decision('x', { [field]: 'conflict' }), decision('other')]), 'other');
  }
  assert.equal(choose([decision('x', { required: 'unknown', satisfied: 'yes' })]).status, 'unresolved');
  assert.equal(choose([decision('x', { applicable: 'no', required: 'unknown', satisfied: 'conflict' })]).status, 'ready');
});

test('结构错误、循环、重复、非有限优先级和稀疏输入不产生可用结果', () => {
  type K = 'a' | 'b';
  const a = decision<K>('a');
  for (const ds of [[a, a], [decision<K>('a', { priority: Infinity })], [decision<K>('a', { priority: NaN })]]) {
    assert.deepEqual(selectNextDecision(ds, limits), { complete: false, reason: 'INVALID_DECISION' });
  }
  for (const ds of [[decision<K>('a', { dependsOn: ['b'] })], [decision<K>('a', { dependsOn: ['a'] })],
    [decision<K>('a', { dependsOn: ['b'], applicable: 'no' }), decision<K>('b', { dependsOn: ['a'] })],
    [a, decision<K>('b', { dependsOn: ['a', 'a'] })], [a, decision<K>('b', { dependsOn: new Array<K>(1) })]]) {
    assert.deepEqual(selectNextDecision(ds, limits), { complete: false, reason: 'INVALID_DEPENDENCY' });
  }
  const sparse = new Array<DecisionDescription<K>>(2); sparse[0] = a;
  assert.deepEqual(selectNextDecision(sparse, limits), { complete: false, reason: 'INVALID_DECISION' });
  const inherited = new Array<K>(1); Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype) as object, { 0: 'a' }));
  assert.deepEqual(selectNextDecision([a, decision<K>('b', { dependsOn: inherited })], limits), { complete: false, reason: 'INVALID_DEPENDENCY' });
});

test('先限界再扫描，累计边上限，真正空集合可以ready', () => {
  assert.deepEqual(selectNextDecision(new Array<DecisionDescription<'a'>>(33), limits), { complete: false, reason: 'LIMIT' });
  assert.deepEqual(selectNextDecision([decision('a', { dependsOn: new Array<'a'>(65) })], limits), { complete: false, reason: 'LIMIT' });
  assert.deepEqual(selectNextDecision<string>([decision('a'), decision('b', { dependsOn: ['a'] }), decision('c', { dependsOn: ['b'] })], { ...limits, maxDependencies: 1 }), { complete: false, reason: 'LIMIT' });
  assert.deepEqual(selectNextDecision([], { maxItems: 0, maxDependencies: 0 }), { complete: true, status: 'ready', rows: [] });
});

// 实际领域字段形状的薄接线，证据判断由域提供；不执行文件、Host 或专业求解。
test('媒体配对：scope未确定阻止询问；一次明确配对满足两项，修订后再问', () => {
  type K = 'scope' | 'pair' | 'second' | 'policy';
  const plan = (scope: DecisionCondition, selection: readonly string[], revision: string) => [
    decision<K>('scope', { satisfied: scope, priority: 20 }),
    decision<K>('pair', { dependsOn: ['scope'], satisfied: selection.length === 2 ? 'yes' : 'no', priority: 10 }),
    decision<K>('second', { dependsOn: ['pair'], satisfied: selection.length === 2 ? 'yes' : 'no', priority: 5 }),
    decision<K>('policy', { satisfied: revision === 'archive-v1' ? 'yes' : 'unknown' }),
  ];
  assert.equal(choose(plan('unknown', ['photo-a'], 'archive-v1')).status, 'unresolved');
  assert.equal(choose(plan('conflict', ['photo-a'], 'archive-v1')).status, 'conflict');
  assert.equal(next(plan('yes', ['photo-a'], 'archive-v1')), 'pair');
  assert.equal(choose(plan('yes', ['photo-a', 'video-b'], 'archive-v1')).status, 'ready');
  assert.equal(next(plan('yes', ['photo-a'], 'archive-v1')), 'pair');
});

test('维修目标：当前与what-if分支、真实日历缺失及一次选择跳过无关事项', () => {
  type K = 'goal' | 'calendar' | 'scenario';
  type Policy = Readonly<{ revision: string; horizon: number; closed: Readonly<Record<string, readonly number[]>> }>;
  const baseline: Policy = { revision: 'shop-v1', horizon: 12, closed: {} };
  const downtime: Policy = { revision: 'shop-v2', horizon: 12, closed: { repair: [3, 4, 5] } };
  const plan = (goal: 'current' | 'what-if' | undefined, actual: Policy | undefined, scenario: Policy | undefined, recommendation: Policy) => {
    const source = { id: 'calendar', scope: 'workshop/current', revision: 'shop-v2' };
    const evidence: EvidenceObservation<'calendar', Policy>[] = [{ key: 'calendar', state: 'known', origin: 'recommendation', source, value: recommendation }];
    if (actual) evidence.push({ key: 'calendar', state: 'known', origin: 'authority', source, value: actual });
    const resolved = resolveEvidence([{ key: 'calendar', accepts: ['authority'] }], evidence,
      { scope: source.scope, revisions: new Map([[source.id, source.revision]]) }, { equal: (_key, a, b) => a === b }, 8);
    if (!resolved.complete) assert.fail(resolved.reason);
    const calendar = resolved.items[0];
    const knownCalendar = calendar?.status === 'resolved' ? 'yes' : calendar?.status === 'conflict' ? 'conflict' : 'unknown';
    return [decision<K>('goal', { priority: 20, satisfied: goal ? 'yes' : 'no' }),
      decision<K>('calendar', { dependsOn: ['goal'], applicable: goal === undefined ? 'unknown' : goal === 'current' ? 'yes' : 'no', satisfied: knownCalendar }),
      decision<K>('scenario', { dependsOn: ['goal'], applicable: goal === undefined ? 'unknown' : goal === 'what-if' ? 'yes' : 'no', satisfied: scenario ? 'yes' : 'no', priority: 10 })];
  };
  assert.equal(next(plan(undefined, undefined, undefined, baseline)), 'goal');
  assert.equal(choose(plan('current', undefined, undefined, baseline)).status, 'unresolved');
  assert.equal(choose(plan('current', downtime, undefined, baseline)).status, 'ready');
  assert.equal(next(plan('what-if', downtime, undefined, baseline)), 'scenario');
  assert.equal(choose(plan('what-if', downtime, baseline, baseline)).status, 'ready');
  assert.equal(choose(plan('current', downtime, undefined, baseline)).status, 'ready');
});
