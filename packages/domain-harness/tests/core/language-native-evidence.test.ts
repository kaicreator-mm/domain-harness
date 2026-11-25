import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveEvidence, invalidateEvidence } from '../../src/standard-evidence.js';
import type { EvidenceContext, EvidenceDependency, EvidenceObservation, EvidenceRequirement } from '../../src/standard-evidence.js';

const context: EvidenceContext = { scope: 'tenant-a', revisions: new Map([['owner', 'r1'], ['other', 'r1']]), asOf: 10 };
const source = { id: 'owner', scope: 'tenant-a', revision: 'r1' };
const req = <K extends string>(key: K): EvidenceRequirement<K> => ({ key, accepts: ['authority'] });
const known = <K extends string, V>(key: K, value: V, origin: EvidenceObservation<K, V>['origin'] = 'authority'): EvidenceObservation<K, V> => ({ key, state: 'known', value, origin, source });
const equal = { equal: (_key: string, left: unknown, right: unknown) => Object.is(left, right) };
const limits = { maxItems: 32, maxDependencies: 64 };

function items<K extends string, V>(result: ReturnType<typeof resolveEvidence<K, V>>) {
  if (!result.complete) assert.fail(result.reason);
  return result.items;
}

test('明确证据、缺失、未知、不适用、冲突及 false/0 分别表达', () => {
  const result = resolveEvidence(['false', 'zero', 'missing', 'unknown', 'na', 'conflict', 'same', 'mixed'].map(req), [
    known('false', false), known('zero', 0),
    { key: 'unknown', state: 'unknown', origin: 'authority', source },
    { key: 'na', state: 'not-applicable', origin: 'authority', source },
    known('conflict', 1), known('conflict', 2), known('same', 2), known('same', 2),
    known('mixed', true), { key: 'mixed', state: 'unknown', origin: 'authority', source },
  ], context, equal, 16);
  const rows = items(result);
  assert.deepEqual(rows.map(row => row.status), ['resolved', 'resolved', 'missing', 'unknown', 'not-applicable', 'conflict', 'resolved', 'unknown']);
  assert.deepEqual(rows.slice(0, 2).map(row => row.status === 'resolved' && row.value), [false, 0]);
  assert.equal(rows[6]?.evidence.length, 2);
  assert.deepEqual(rows.slice(2, 6).map(row => row.status !== 'resolved' && row.reason), ['NO_OBSERVATION', 'EXPLICIT_UNKNOWN', 'EXPLICIT_NOT_APPLICABLE', 'CONFLICTING_EVIDENCE']);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(rows) && Object.isFrozen(rows[0]) && Object.isFrozen(rows[0]?.evidence));
});

test('来源 scope/revision/时间区间、未知版本和缺时间不冒充有效事实', () => {
  const base = known('x', 1);
  const cases = [
    { ...source, scope: 'tenant-b' }, { ...source, revision: 'r0' }, { ...source, id: 'unverified' },
    { ...source, validity: { from: 0, until: 10 } }, { ...source, validity: { from: 11, until: 12 } },
  ];
  for (const evidenceSource of cases) {
    const [row] = items(resolveEvidence([req('x')], [{ ...base, source: evidenceSource }], context, equal, 8));
    assert.equal(row?.status, 'unknown'); assert.equal(row?.status === 'unknown' && row.reason, 'NO_APPLICABLE_EVIDENCE');
  }
  const timed = { ...base, source: { ...source, validity: { from: 10, until: 11 } } };
  assert.equal(items(resolveEvidence([req('x')], [timed], context, equal, 8))[0]?.status, 'resolved');
  assert.equal(items(resolveEvidence([req('x')], [timed], { scope: context.scope, revisions: context.revisions }, equal, 8))[0]?.status, 'unknown');
});

test('默认值仅显式许可，推荐不能代替权威事实或用户表达', () => {
  const observations = [known('x', 1, 'default'), known('x', 2, 'recommendation')];
  for (const accepts of [['authority'], ['user']] as const) {
    const [row] = items(resolveEvidence([{ key: 'x', accepts }], observations, context, equal, 8));
    assert.equal(row?.status, 'unknown'); assert.equal(row?.status === 'unknown' && row.reason, 'NO_ACCEPTED_ORIGIN');
    assert.equal(row?.proposals.length, 2); assert.equal(row?.evidence.length, 0);
  }
  const [allowed] = items(resolveEvidence([{ key: 'x', accepts: ['default'] }], observations, context, equal, 8));
  assert.equal(allowed?.status === 'resolved' && allowed.value, 1); assert.equal(allowed?.evidence[0]?.origin, 'default');
  const [user] = items(resolveEvidence([{ key: 'x', accepts: ['user'] }], [...observations, known('x', 3, 'user')], context, equal, 8));
  assert.equal(user?.status === 'resolved' && user.value, 3); assert.equal(user?.evidence[0]?.origin, 'user');
});

test('默认同级冲突，显式域排序可消歧，未知及不适用不能静默覆盖', () => {
  const observations = [known('x', 1), { ...known('x', 2), source: { ...source, id: 'other' } }];
  for (const order of [observations, [...observations].reverse()]) {
    assert.equal(items(resolveEvidence([req('x')], order, context, equal, 8))[0]?.status, 'conflict');
    const [row] = items(resolveEvidence([req('x')], order, context, { ...equal, rank: item => item.source.id === 'owner' ? 2 : 1 }, 8));
    assert.equal(row?.status === 'resolved' && row.value, 1);
  }
  const mixed: EvidenceObservation<'x', number>[] = [known('x', 1), { key: 'x', origin: 'authority', state: 'not-applicable', source }];
  assert.equal(items(resolveEvidence([req('x')], mixed, context, equal, 8))[0]?.status, 'conflict');
  const [row] = items(resolveEvidence([req('x')], [known('x', 1), { key: 'x', origin: 'authority', state: 'unknown', source }], context, equal, 8));
  assert.equal(row?.status, 'unknown');
});

test('证据快照冻结元数据，值由领域持有，额外凭据不复制', () => {
  const mutable = { ...source, validity: { from: 0, until: 20 }, token: 'PRIVATE' };
  const value = Object.freeze({ revision: 'r1' });
  const observation = { key: 'x', origin: 'authority', state: 'known', value, source: mutable, private: 'PRIVATE' } as const;
  const [row] = items(resolveEvidence([req('x')], [observation], context, { equal: (_key, left, right) => left.revision === right.revision }, 8));
  mutable.revision = 'r2'; mutable.validity.until = 0;
  const retained = row?.evidence[0]; assert.equal(retained?.source.revision, 'r1'); assert.equal(retained?.source.validity?.until, 20);
  assert.ok(Object.isFrozen(retained) && Object.isFrozen(retained?.source) && Object.isFrozen(retained?.source.validity));
  assert.equal(row?.status === 'resolved' && row.value, value); assert.ok(!JSON.stringify(row).includes('PRIVATE'));
});

test('证据限界、非法声明、策略失败不提供可复用部分结果', () => {
  assert.deepEqual(resolveEvidence([req('x')], [known('x', 1)], context, equal, 0), { complete: false, reason: 'LIMIT' });
  assert.deepEqual(resolveEvidence([req('x')], [known('x', 1)], context, equal, 4097), { complete: false, reason: 'LIMIT' });
  for (const result of [resolveEvidence([req('x'), req('x')], [], context, equal, 8),
    resolveEvidence([req('x')], [known('y', 1)], context, equal, 8),
    resolveEvidence([req('x')], [known('x', undefined)], context, equal, 8),
    resolveEvidence([req('x')], [{ ...known('x', 1), source: { ...source, validity: { from: 3, until: 3 } } }], context, equal, 8),
    resolveEvidence([{ key: 'x', accepts: [] }], [], context, equal, 8)]) assert.deepEqual(result, { complete: false, reason: 'INVALID_EVIDENCE' });
  for (const policy of [{ ...equal, rank: () => NaN }, { equal: () => { throw new Error('PRIVATE'); } }]) {
    assert.deepEqual(resolveEvidence([req('x')], [known('x', 1), known('x', 2)], context, policy, 8), { complete: false, reason: 'POLICY_FAILED' });
  }
  assert.deepEqual(resolveEvidence([], [], { scope: 'x', revisions: new Map() }, equal, 0), { complete: true, items: [] });
});

test('显式依赖传递失效，缺声明保守失效，无关声明保留', () => {
  const keys = ['source', 'derived', 'candidate', 'independent', 'untracked', 'dependent'] as const;
  const deps = [{ key: 'source', dependsOn: [] }, { key: 'derived', dependsOn: ['source'] }, { key: 'candidate', dependsOn: ['derived'] },
    { key: 'independent', dependsOn: [] }, { key: 'dependent', dependsOn: ['untracked'] }] as const;
  const result = invalidateEvidence(keys, ['source'], deps, limits);
  assert.deepEqual(result, { complete: true, stale: ['source', 'derived', 'candidate', 'untracked', 'dependent'], retained: ['independent'] });
  assert.ok(result.complete && Object.isFrozen(result.stale) && Object.isFrozen(result.retained));
  assert.deepEqual(invalidateEvidence(keys, [], deps, limits), { complete: true, stale: [], retained: keys });
});

test('未知依赖、重复、循环及超限不能返回可用保留项', () => {
  const keys = ['a', 'b'] as const;
  for (const deps of [[{ key: 'a', dependsOn: ['missing'] }], [{ key: 'a', dependsOn: ['b'] }, { key: 'b', dependsOn: ['a'] }],
    [{ key: 'a', dependsOn: ['a'] }], [{ key: 'a', dependsOn: [] }, { key: 'a', dependsOn: [] }], [{ key: 'b', dependsOn: ['a', 'a'] }]]) {
    assert.deepEqual(invalidateEvidence<string>(keys, ['a'], deps, limits), { complete: false, reason: 'INVALID_DEPENDENCY' });
  }
  assert.deepEqual(invalidateEvidence<string>(keys, ['missing'], [], limits), { complete: false, reason: 'INVALID_DEPENDENCY' });
  assert.deepEqual(invalidateEvidence(keys, ['a'], [{ key: 'b', dependsOn: ['a'] }], { ...limits, maxDependencies: 0 }), { complete: false, reason: 'LIMIT' });
  assert.deepEqual(invalidateEvidence(keys, [], [], { ...limits, maxItems: 1 }), { complete: false, reason: 'LIMIT' });
});

// 两个专业域真实数据形状的薄消费探针；不替代真实解码/求解/授权。
test('媒体 Asset/Owner/policy：内容与选择证据分离，变更只保留未受影响政策', () => {
  type Key = 'sourceHash' | 'policyRevision' | 'selection' | 'derivedPlan';
  type Value = string | Readonly<{ original: string; derivative: string; revision: string }>;
  const requirements: readonly EvidenceRequirement<Key>[] = [req('sourceHash'), req('policyRevision'), { key: 'selection', accepts: ['user'] }, { key: 'derivedPlan', accepts: ['derived'] }];
  const mediaContext: EvidenceContext = { scope: 'tenant-a/archive', revisions: new Map([['file', 'hash-new'], ['policy', 'archive-v1'], ['user', 'r2'], ['plan', 'r2']]) };
  const obs = (key: Key, value: Value, origin: EvidenceObservation<Key, Value>['origin'], id: string, revision: string): EvidenceObservation<Key, Value> => ({ key, value, origin, state: 'known', source: { id, scope: mediaContext.scope, revision } });
  const asset = Object.freeze({ original: 'hash-old', derivative: 'access-old', revision: 'archive-v1' });
  const observations = [obs('sourceHash', 'hash-old', 'authority', 'file', 'hash-old'), obs('policyRevision', 'archive-v1', 'authority', 'policy', 'archive-v1'),
    obs('selection', 'photo-b', 'user', 'user', 'r2'), obs('derivedPlan', asset, 'derived', 'plan', 'r2')];
  const previousContext = { ...mediaContext, revisions: new Map(mediaContext.revisions).set('file', 'hash-old') };
  assert.deepEqual(items(resolveEvidence(requirements, observations, previousContext, equal, 16)).map(row => row.status), ['resolved', 'resolved', 'resolved', 'resolved']);
  // 领域在来源变化时先应用失效结果，再重新解析受影响项，不直接复用旧派生计划。
  const changed = invalidateEvidence<Key>(requirements.map(r => r.key), ['sourceHash'], [{ key: 'sourceHash', dependsOn: [] }, { key: 'policyRevision', dependsOn: [] },
    { key: 'selection', dependsOn: ['sourceHash'] }, { key: 'derivedPlan', dependsOn: ['sourceHash', 'selection', 'policyRevision'] }], limits);
  assert.deepEqual(changed, { complete: true, stale: ['sourceHash', 'selection', 'derivedPlan'], retained: ['policyRevision'] });
  if (!changed.complete) assert.fail('invalidation');
  const next = observations.filter(o => changed.retained.includes(o.key));
  next.push(obs('sourceHash', 'hash-new', 'authority', 'file', 'hash-new'), obs('selection', 'photo-c', 'recommendation', 'user', 'r2'));
  assert.deepEqual(items(resolveEvidence(requirements, next, mediaContext, equal, 16)).map(row => row.status), ['resolved', 'resolved', 'unknown', 'missing']);
  next.push(obs('selection', 'photo-c', 'user', 'user', 'r2'));
  assert.deepEqual(items(resolveEvidence(requirements, next, mediaContext, equal, 16)).map(row => row.status), ['resolved', 'resolved', 'resolved', 'missing']);
});

test('维修 Policy：真实日历未知不能用默认正常替代，变更重算且不影响工序依赖', () => {
  type Key = 'calendar' | 'goal' | 'plan' | 'precedence';
  type Policy = Readonly<{ revision: string; horizon: number; closed: Readonly<Record<string, readonly number[]>> }>;
  type Value = Policy | string;
  const baseline: Policy = Object.freeze({ revision: 'shop-v1', horizon: 12, closed: Object.freeze({}) });
  const downtime: Policy = Object.freeze({ revision: 'shop-v2', horizon: 12, closed: Object.freeze({ repair: Object.freeze([3, 4, 5]) }) });
  const current: EvidenceContext = { scope: 'workshop/current', revisions: new Map([['calendar', 'shop-v2'], ['goal', 'g1'], ['precedence', 't1']]) };
  const requirements: readonly EvidenceRequirement<Key>[] = [req('calendar'), { key: 'goal', accepts: ['user'] }, { key: 'plan', accepts: ['derived'] }, req('precedence')];
  const obs = (key: Key, value: Value, origin: EvidenceObservation<Key, Value>['origin'], id: string, revision: string): EvidenceObservation<Key, Value> => ({ key, value, origin, state: 'known', source: { id, scope: current.scope, revision } });
  const proposed = [obs('calendar', baseline, 'default', 'calendar', 'shop-v2'), obs('goal', 'current', 'user', 'goal', 'g1'), obs('precedence', 'inspect-repair-qc', 'authority', 'precedence', 't1')];
  const policy = { equal: (_key: Key, left: Value, right: Value) => JSON.stringify(left) === JSON.stringify(right) };
  assert.deepEqual(items(resolveEvidence(requirements, proposed, current, policy, 16)).map(row => row.status), ['unknown', 'resolved', 'missing', 'resolved']);
  const actual = [...proposed, obs('calendar', downtime, 'authority', 'calendar', 'shop-v2')];
  const [calendar] = items(resolveEvidence(requirements, actual, current, policy, 16));
  assert.equal(calendar?.status === 'resolved' && calendar.value, downtime);
  const conflict = [...actual, obs('calendar', { ...downtime, closed: {} }, 'authority', 'calendar', 'shop-v2')];
  assert.equal(items(resolveEvidence(requirements, conflict, current, policy, 16))[0]?.status, 'conflict');
  assert.deepEqual(invalidateEvidence<Key>(requirements.map(r => r.key), ['calendar'], [{ key: 'calendar', dependsOn: [] }, { key: 'goal', dependsOn: [] },
    { key: 'plan', dependsOn: ['calendar', 'goal', 'precedence'] }, { key: 'precedence', dependsOn: [] }], limits),
    { complete: true, stale: ['calendar', 'plan'], retained: ['goal', 'precedence'] });
  const hypothetical = { ...current, scope: 'workshop/what-if' };
  assert.equal(items(resolveEvidence(requirements, actual, hypothetical, policy, 16))[0]?.status, 'unknown');
});

test('稀疏证据数组及来源声明拒绝，不产生部分确定结果', () => {
  const badRequirements = new Array<EvidenceRequirement<'x'>>(2);
  badRequirements[0] = req('x');
  const badObservations = new Array<EvidenceObservation<'x', number>>(2);
  badObservations[1] = known('x', 1);
  const badOrigins = new Array<'authority' | 'user'>(2);
  badOrigins[0] = 'authority';
  const invalid = { complete: false, reason: 'INVALID_EVIDENCE' };
  assert.deepEqual(resolveEvidence(badRequirements, [known('x', 1)], context, equal, 8), invalid);
  assert.deepEqual(resolveEvidence([req('x')], badObservations, context, equal, 8), invalid);
  assert.deepEqual(resolveEvidence([{ key: 'x', accepts: badOrigins }], [known('x', 1)], context, equal, 8), invalid);
  assert.deepEqual(resolveEvidence(new Array<EvidenceRequirement<'x'>>(4097), [], context, equal, 4096), { complete: false, reason: 'LIMIT' });
  const [row] = items(resolveEvidence([{ key: 'x', accepts: ['authority'] }], [known('x', 1)], context, equal, 8));
  assert.equal(row?.status === 'resolved' && row.value, 1);
});

test('稀疏依赖输入拒绝，旧计划不得进入可复用集合', () => {
  type Key = 'sourceHash' | 'derivedPlan' | 'policyRevision';
  const keys: readonly Key[] = ['sourceHash', 'derivedPlan', 'policyRevision'];
  const deps: readonly EvidenceDependency<Key>[] = [{ key: 'sourceHash', dependsOn: [] },
    { key: 'derivedPlan', dependsOn: ['sourceHash'] }, { key: 'policyRevision', dependsOn: [] }];
  const badKeys = new Array<Key>(2);
  badKeys[0] = 'sourceHash';
  const badChanged = new Array<Key>(1);
  const badDeclarations = new Array<EvidenceDependency<Key>>(2);
  badDeclarations[0] = deps[0]!;
  const badParents = new Array<Key>(2);
  badParents[1] = 'sourceHash';
  const invalid = { complete: false, reason: 'INVALID_DEPENDENCY' };
  assert.deepEqual(invalidateEvidence(badKeys, [], deps, limits), invalid);
  const denied = invalidateEvidence(keys, badChanged, deps, limits);
  assert.deepEqual(denied, invalid);
  assert.equal(Object.hasOwn(denied, 'retained'), false);
  assert.equal(Object.hasOwn(denied, 'stale'), false);
  assert.deepEqual(invalidateEvidence(keys, ['sourceHash'], badDeclarations, limits), invalid);
  assert.deepEqual(invalidateEvidence(keys, ['sourceHash'], [{ key: 'derivedPlan', dependsOn: badParents }], limits), invalid);
  assert.deepEqual(invalidateEvidence(keys, ['sourceHash'], [{ key: 'derivedPlan', dependsOn: new Array<Key>(65) }], limits), { complete: false, reason: 'LIMIT' });
  assert.deepEqual(invalidateEvidence(keys, new Array<Key>(33), deps, limits), { complete: false, reason: 'LIMIT' });
  const changed = invalidateEvidence(keys, ['sourceHash'], deps, limits);
  assert.deepEqual(changed, { complete: true, stale: ['sourceHash', 'derivedPlan'], retained: ['policyRevision'] });
  assert.deepEqual(invalidateEvidence(keys, [], deps, limits), { complete: true, stale: [], retained: keys });
  if (!changed.complete) assert.fail('dense input');
  const previous = [known<Key, string>('derivedPlan', 'plan-old', 'derived'), known<Key, string>('policyRevision', 'archive-v1')];
  const rows = items(resolveEvidence<Key, string>([{ key: 'derivedPlan', accepts: ['derived'] }, req('policyRevision')],
    previous.filter(item => changed.retained.includes(item.key)), context, equal, 8));
  assert.equal(rows[0]?.status, 'missing');
  assert.equal(rows[1]?.status === 'resolved' && rows[1].value, 'archive-v1');
});

test('同步证据策略拒绝 async 声明和真实 Promise 返回，不泄漏拒绝或部分证据', async () => {
  const observations = [known('x', 1), known('x', 2)];
  const expected = { complete: false, reason: 'POLICY_FAILED' };
  let invoked = 0;
  const asyncEqual = async () => { invoked++; throw Error('PRIVATE_EVIDENCE_MARKER'); };
  const asyncRank = async () => { invoked++; return 1; };
  for (const policy of [
    { equal: asyncEqual as unknown as () => boolean },
    { ...equal, rank: asyncRank as unknown as () => number },
  ]) assert.deepEqual(resolveEvidence([req('x')], observations, context, policy, 8), expected);
  assert.equal(invoked, 0);
  for (const reject of [false, true]) {
    const promise = () => reject ? Promise.reject(Error('PRIVATE_EVIDENCE_MARKER')) : Promise.resolve(1);
    assert.deepEqual(resolveEvidence([req('x')], observations, context,
      { equal: promise as unknown as () => boolean }, 8), expected);
    assert.deepEqual(resolveEvidence([req('x')], observations, context,
      { ...equal, rank: promise as unknown as () => number }, 8), expected);
  }
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(items(resolveEvidence([req('x')], observations, context, equal, 8))[0]?.status, 'conflict');
});
