import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCandidates } from '../../src/standard-candidates.js';
import type { CandidateEntry, CandidateSource, CandidateAssessment, CandidateProjection, CandidatePreparation } from '../../src/standard-candidates.js';

const current = { scope: 'tenant-a', revision: 'r2' };
const limits = { maxVisited: 16, maxReturned: 16 };
const entry = <T>(id: string, value: T): CandidateEntry<T> => ({ id, value, ...current });
const source = <T>(entries: readonly CandidateEntry<T>[], status: 'complete' | 'incomplete' = 'complete'): CandidateSource<T> => ({ ...current, status, entries });
const policy = {
  comparisonLabels: ['Value'],
  assess: (item: CandidateEntry<number>): CandidateAssessment => item.value < 0 ? { status: 'excluded', reason: 'HARD_CONSTRAINT' } : item.value === 0 ? { status: 'unknown', reason: 'NOT_VERIFIED' } : { status: 'eligible' },
  project: (item: CandidateEntry<number>): CandidateProjection => ({ label: item.id, priority: item.value, recommended: true, cells: [String(item.value)] }),
};
function result<T>(value: CandidatePreparation<T>) {
  if (value.status === 'failed') assert.fail(value.reason);
  return value;
}
const failure = (reason: string) => ({ status: 'failed', complete: false, reason });

test('硬约束先于投影、稳定排序、比较关联和业务值隔离', () => {
  const entries = [entry('low', 1), entry('bad', -99), entry('high', 3), entry('tie', 3)];
  const projected: string[] = [];
  const res = result(prepareCandidates(source(entries), current, { ...policy, project: item => { projected.push(item.id); return policy.project(item); } }, limits));
  assert.equal(res.status, 'available'); assert.equal(res.complete, true); assert.equal(res.visited, 4);
  assert.deepEqual(projected, ['low', 'high', 'tie']);
  assert.deepEqual(res.options.map(item => item.id), ['high', 'tie', 'low']);
  assert.deepEqual(res.entries.map(item => item.id), ['high', 'tie', 'low']);
  assert.deepEqual(res.comparison, [{ label: 'Value', cells: { high: '3', tie: '3', low: '1' } }]);
  assert.deepEqual(res.issues, [{ id: 'bad', status: 'excluded', reason: 'HARD_CONSTRAINT' }]);
  assert.ok(res.options.every(item => item.recommended && !Object.hasOwn(item, 'value')));
  assert.ok(Object.isFrozen(res) && Object.isFrozen(res.entries) && Object.isFrozen(res.entries[0]) && Object.isFrozen(res.options[0]) && Object.isFrozen(res.comparison[0]?.cells));
  assert.deepEqual(result(prepareCandidates(source([...entries].reverse()), current, policy, limits)).options.map(item => item.id), ['tie', 'high', 'low']);
});

test('来源、访问、返回上限和unknown传播，不标记不完整推荐', () => {
  const entries = [entry('low', 1), entry('unknown', 0), entry('high', 3)];
  const full = result(prepareCandidates(source(entries), current, policy, limits));
  assert.equal(full.complete, false); assert.deepEqual(full.incompleteReasons, ['ASSESSMENT_UNKNOWN']);
  assert.deepEqual(full.options.map(item => item.id), ['high', 'low']);
  assert.ok(full.options.every(item => item.recommended === undefined));
  const visited: string[] = [];
  const bounded = { ...policy, assess: (item: CandidateEntry<number>) => { visited.push(item.id); return policy.assess(item); } };
  const partial = result(prepareCandidates(source(entries, 'incomplete'), current, bounded, { maxVisited: 2, maxReturned: 2 }));
  assert.deepEqual(visited, ['low', 'unknown']); assert.equal(partial.visited, 2);
  assert.deepEqual(partial.incompleteReasons, ['SOURCE_INCOMPLETE', 'QUERY_VISIT_LIMIT', 'ASSESSMENT_UNKNOWN']);
  assert.equal(partial.options[0]?.recommended, undefined);
  visited.length = 0;
  const capped = result(prepareCandidates(source(entries), current, bounded, { maxVisited: 16, maxReturned: 1 }));
  assert.deepEqual(visited, ['low']); assert.deepEqual(capped.incompleteReasons, ['QUERY_RESULT_LIMIT']);
  assert.equal(capped.options[0]?.recommended, undefined);
  const exact = result(prepareCandidates(source([entry('one', 1)]), current, policy, { maxVisited: 1, maxReturned: 1 }));
  assert.equal(exact.complete, true); assert.equal(exact.options[0]?.recommended, true);
});

test('完整空集与未知空集、技术失败分别表达', () => {
  assert.equal(result(prepareCandidates(source<number>([]), current, policy, limits)).status, 'empty');
  assert.equal(result(prepareCandidates(source([entry('bad', -1)]), current, policy, limits)).status, 'empty');
  for (const res of [prepareCandidates(source<number>([], 'incomplete'), current, policy, limits), prepareCandidates(source([entry('unknown', 0)]), current, policy, limits),
    prepareCandidates(source([entry('one', 1)]), current, policy, { maxVisited: 0, maxReturned: 1 }),
    prepareCandidates(source([entry('one', 1)]), current, policy, { maxVisited: 1, maxReturned: 0 })]) {
    const actual = result(res); assert.equal(actual.status, 'unknown'); assert.equal(actual.complete, false); assert.deepEqual(actual.options, []);
  }
  assert.deepEqual(prepareCandidates({ ...current, status: 'failed' }, current, policy, limits), failure('SOURCE_FAILED'));
  const entries = [entry('good', 1), entry('bad', 2)];
  let projected = 0;
  const failed = prepareCandidates(source(entries), current, { ...policy, assess: item => item.id === 'bad' ? { status: 'failed', reason: 'PRIVATE' } : { status: 'eligible' }, project: item => { projected++; return policy.project(item); } }, limits);
  assert.deepEqual(failed, failure('ASSESSMENT_FAILED')); assert.equal(projected, 0);
  assert.deepEqual(prepareCandidates(source(entries), current, { ...policy, assess: () => { throw Error('PRIVATE'); } }, limits), failure('ASSESSMENT_FAILED'));
  assert.deepEqual(prepareCandidates(source(entries), current, { ...policy, project: item => { if (item.id === 'bad') throw Error('PRIVATE'); return policy.project(item); } }, limits), failure('PROJECTION_FAILED'));
});

test('版本及范围、ID重复或非法均拒绝，无可选部分', () => {
  const entries = [entry('one', 1)];
  for (const changed of [{ ...current, scope: 'other' }, { ...current, revision: 'r3' }]) {
    assert.deepEqual(prepareCandidates(source(entries), changed, policy, limits), failure('STALE_SOURCE'));
    assert.deepEqual(prepareCandidates(source([...entries, { ...entry('two', 2), ...changed }]), current, policy, limits), failure('STALE_CANDIDATE'));
  }
  for (const values of [[...entries, entry('one', -1)], [entry('constructor', 1)], [entry('bad id', 1)]]) {
    assert.deepEqual(prepareCandidates(source(values), current, policy, limits), failure('INVALID_CANDIDATE'));
  }
  const partial = result(prepareCandidates(source([...entries, entry('one', 2)]), current, policy, { maxVisited: 1, maxReturned: 1 }));
  assert.equal(partial.complete, false); assert.equal(partial.options.length, 1);
});

test('有界数组及投影非法，限制优先且不接受继承索引', () => {
  const entries = [entry('one', 1)];
  const sparse = new Array<CandidateEntry<number>>(2); sparse[0] = entries[0]!;
  assert.deepEqual(prepareCandidates(source(sparse), current, policy, limits), failure('INVALID_CANDIDATE'));
  const inherited = new Array<CandidateEntry<number>>(1); Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype) as object, { 0: entries[0] }));
  assert.deepEqual(prepareCandidates(source(inherited), current, policy, limits), failure('INVALID_CANDIDATE'));
  assert.deepEqual(prepareCandidates(source(new Array<CandidateEntry<number>>(4097)), current, policy, limits), failure('LIMIT'));
  assert.deepEqual(prepareCandidates(source(entries), current, { ...policy, comparisonLabels: new Array<string>(33) }, limits), failure('LIMIT'));
  assert.deepEqual(prepareCandidates(source(entries), current, { ...policy, comparisonLabels: new Array<string>(1) }, limits), failure('INVALID_CANDIDATE'));
  assert.deepEqual(prepareCandidates(source(entries), current, { ...policy, comparisonLabels: ['X', 'X'] }, limits), failure('INVALID_CANDIDATE'));
  for (const patch of [{ priority: Infinity }, { cells: [] }, { cells: new Array<string>(1) }, { cells: ['字'.repeat(400)] }, { label: '' }]) {
    assert.deepEqual(prepareCandidates(source(entries), current, { ...policy, project: item => ({ ...policy.project(item), ...patch }) }, limits), failure('PROJECTION_FAILED'));
  }
  const large = Array.from({ length: 80 }, (_, i) => entry('c' + i, 1));
  assert.deepEqual(prepareCandidates(source(large), current, { ...policy, project: item => ({ ...policy.project(item), label: 'x'.repeat(1024) }) }, { maxVisited: 80, maxReturned: 80 }), failure('LIMIT'));
});

// 普通可信领域数据的双用途薄接线；不是实际解码、求解或授权。
test('媒体候选：真实字段形状、已选排除、未知元数据、显示与文件引用隔离', () => {
  type Media = Readonly<{ original: string; revision: string; mime?: string; size: number; path: string }>;
  const items: CandidateEntry<Media>[] = [entry('photo-a', { original: 'hash-a', revision: 'archive-v1', mime: 'image/png', size: 100, path: 'PRIVATE/a' }),
    entry('video-b', { original: 'hash-b', revision: 'archive-v1', mime: 'video/mp4', size: 200, path: 'PRIVATE/b' }),
    entry('photo-c', { original: 'hash-c', revision: 'archive-v1', size: 120, path: 'PRIVATE/c' })];
  const mediaPolicy = { comparisonLabels: ['Type', 'Bytes'], assess: ({ value }: CandidateEntry<Media>): CandidateAssessment => value.original === 'hash-a' ? { status: 'excluded', reason: 'ALREADY_SELECTED' } : value.mime === undefined ? { status: 'unknown', reason: 'METADATA_UNKNOWN' } : { status: 'eligible' },
    project: ({ id, value }: CandidateEntry<Media>): CandidateProjection => ({ label: id, priority: 1, recommended: true, cells: [value.mime ?? '', String(value.size)] }) };
  const partial = result(prepareCandidates(source(items), current, mediaPolicy, limits));
  assert.equal(partial.complete, false); assert.deepEqual(partial.options.map(item => item.id), ['video-b']);
  assert.equal(partial.options[0]?.recommended, undefined); assert.ok(!JSON.stringify({ options: partial.options, comparison: partial.comparison }).includes('PRIVATE'));
  assert.equal(partial.entries[0]?.value.path, 'PRIVATE/b');
  const nextItems = items.map(item => item.id === 'photo-c' ? { ...item, value: { ...item.value, mime: 'image/png' } } : item);
  assert.equal(result(prepareCandidates(source(nextItems), current, mediaPolicy, limits)).complete, true);
});

test('维修情景：不同政策比较，不把未知结果当不可行，旧候选版本拒绝', () => {
  type Scenario = Readonly<{ revision: string; horizon: number; closed: Readonly<Record<string, readonly number[]>>; slots?: number; applicable: boolean }>;
  const scenarios: CandidateEntry<Scenario>[] = [entry('current', { revision: 'shop-v1', horizon: 12, closed: {}, slots: 7, applicable: true }),
    entry('downtime', { revision: 'shop-v2', horizon: 12, closed: { repair: [3, 4, 5] }, slots: 10, applicable: true }),
    entry('unknown', { revision: 'shop-v3', horizon: 12, closed: {}, applicable: true }),
    entry('wrong', { revision: 'shop-v4', horizon: 12, closed: {}, slots: 1, applicable: false })];
  const scenarioPolicy = { comparisonLabels: ['Policy', 'Slots'], assess: ({ value }: CandidateEntry<Scenario>): CandidateAssessment => !value.applicable ? { status: 'excluded', reason: 'NOT_APPLICABLE' } : value.slots === undefined ? { status: 'unknown', reason: 'SOLVE_UNKNOWN' } : { status: 'eligible' },
    project: ({ id, value }: CandidateEntry<Scenario>): CandidateProjection => ({ label: id, priority: 0, scope: value.revision, cells: [value.revision, String(value.slots)], reason: 'Different policy scenario' }) };
  const res = result(prepareCandidates(source(scenarios), current, scenarioPolicy, limits));
  assert.equal(res.complete, false); assert.deepEqual(res.options.map(item => item.id), ['current', 'downtime']);
  assert.deepEqual(res.comparison[1]?.cells, { current: '7', downtime: '10' });
  assert.deepEqual(prepareCandidates(source(scenarios), { ...current, revision: 'r3' }, scenarioPolicy, limits), failure('STALE_SOURCE'));
});

test('异步领域策略不被启动或接受，拒绝的Promise被观察', async () => {
  const data = source([entry('one', 1)]);
  let called = 0;
  // @ts-expect-error async assess is not a valid synchronous policy
  assert.deepEqual(prepareCandidates(data, current, { ...policy, assess: async () => { called++; return { status: 'eligible' }; } }, limits), failure('ASSESSMENT_FAILED'));
  // @ts-expect-error async project is not a valid synchronous policy
  assert.deepEqual(prepareCandidates(data, current, { ...policy, project: async item => { called++; return policy.project(item); } }, limits), failure('PROJECTION_FAILED'));
  assert.equal(called, 0);
  // @ts-expect-error a sync function returning a Promise is also invalid
  assert.deepEqual(prepareCandidates(data, current, { ...policy, assess: () => Promise.reject(Error('PRIVATE')) }, limits), failure('ASSESSMENT_FAILED'));
  // @ts-expect-error a sync projection returning a Promise is invalid
  assert.deepEqual(prepareCandidates(data, current, { ...policy, project: () => Promise.reject(Error('PRIVATE')) }, limits), failure('PROJECTION_FAILED'));
  await new Promise<void>(resolve => setImmediate(resolve));
});
