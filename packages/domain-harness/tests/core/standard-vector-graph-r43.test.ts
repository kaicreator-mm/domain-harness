import assert from 'node:assert/strict';
import test from 'node:test';
import { VectorQueryElement, GraphQueryElement } from '../../src/standard-vector-graph.js';
import type { VectorCandidate } from '../../src/standard-vector-graph.js';
const vector = new VectorQueryElement();
const graph = new GraphQueryElement();
const options = { metric: 'L2', dimension: 2, topK: 1, maxVisited: 2 } as const;
test('R43 scope identity: getter and mutable alias', () => {
  const repair = { domain: 'repair' }; const inventory = { domain: 'inventory' };
  let reads = 0;
  const candidate = { id: 'x', vector: [1, 0], get item() { reads += 1; return reads === 1 ? repair : inventory; } };
  assert.equal(vector.search([candidate], [1, 0], item => item.domain === 'repair', options).matches[0]?.item, repair);
  assert.equal(reads, 1);
  const alias = { id: 'x', vector: [1, 0], item: repair };
  assert.equal(vector.search([alias], [1, 0], item => { alias.item = inventory; return item.domain === 'repair'; }, options).matches[0]?.item, repair);
});
test('R43 fixed query, admitted id and vector values read once', () => {
  const query = [1, 0]; let reads = 0; let ids = 0; let vectors = 0;
  const values = [1, 0];
  Object.defineProperty(values, '0', { get: () => { reads += 1; return reads === 1 ? 1 : 0; } });
  const source = [{ get id() { ids += 1; return ids === 1 ? 'z' : 'bad'; }, item: 1,
    get vector() { vectors += 1; return vectors === 1 ? values : [0, 1]; } }, { id: 'a', item: 2, vector: [0, 1] }];
  const result = vector.search(source, query, item => { if (item === 2) query.splice(0, 2, 0, 1); return true; }, options);
  assert.equal(result.matches[0]?.id, 'z'); assert.equal(result.matches[0]?.distance, 0);
  assert.deepEqual([reads, ids, vectors], [1, 1, 1]);
});
test('R43 source size mutation on admitted or excluded last item fails closed', () => {
  for (const accept of [true, false]) {
    const source = [{ id: 'x', vector: [1, 0], item: 1 }];
    assert.throws(() => vector.search(source, [1, 0], () => { source.push({ id: 'y', vector: [0, 1], item: 2 }); return accept; }, options), /DH_STD_QUERY_VECTOR_SOURCE_CHANGED/u);
  }
  const source = [{ id: 'x', vector: [1, 0], item: 1 }, { id: 'y', vector: [0, 1], item: 2 }];
  assert.throws(() => vector.search(source, [1, 0], () => { source.pop(); return true; }, options), /DH_STD_QUERY_VECTOR_SOURCE_CHANGED/u);
});
test('R43 cosine scales subnormal and huge finite vectors; L2 only rejects actual overflow', () => {
  for (const m of [Number.MIN_VALUE, 1, Number.MAX_VALUE]) {
    const source = [{ id: 'a', item: 'axis', vector: [m, 0] }, { id: 'z', item: 'exact', vector: [m, m] }];
    const result = vector.search(source, [m, m], () => true, { ...options, metric: 'COSINE', topK: 2 });
    assert.deepEqual(result.matches.map(match => match.id), ['z', 'a']);
    assert.ok(Math.abs((result.matches[1]?.distance ?? NaN) - (1 - Math.SQRT1_2)) < 1e-14);
    assert.ok((result.matches[0]?.distance ?? 1) < 1e-14);
    const orthogonal = vector.search([{ id: 'o', item: 1, vector: [m, -m] }], [m, m], () => true, { ...options, metric: 'COSINE' });
    assert.equal(orthogonal.matches[0]?.distance, 1);
    assert.equal(vector.search([source[1]!], [m, m], () => true, options).matches[0]?.distance, 0);
  }
  assert.throws(() => vector.search([{ id: 'x', item: 1, vector: [-Number.MAX_VALUE, 0] }], [Number.MAX_VALUE, 0], () => true, options), /DH_STD_QUERY_VECTOR_OVERFLOW/u);
});
test('R43 excluded id/vector untouched; duplicate id tie keeps original position', () => {
  const excluded: VectorCandidate<number> = { item: 0, get id(): string { throw Error('id peek'); }, get vector(): readonly number[] { throw Error('vector peek'); } };
  const result = vector.search([excluded, { id: 'x', vector: [1, 0], item: 1 }, { id: 'x', vector: [1, 0], item: 2 }], [1, 0], item => item !== 0, { ...options, maxVisited: 3 });
  assert.equal(result.matches[0]?.item, 1); assert.equal(result.visited, 3); assert.equal(result.complete, true);
});
test('R43 synchronous rejected scope Promise is handled', async () => {
  const scope = (() => Promise.reject(Error('scope'))) as unknown as (item: number) => boolean;
  assert.throws(() => vector.search([{ id: 'x', item: 1, vector: [1, 0] }], [1, 0], scope, options), /DH_STD_QUERY_SCOPE_RESULT/u);
  await new Promise<void>(resolve => setImmediate(resolve));
});
test('R43 graph BOTH, zero-hop and visit budget', () => {
  const edges = [{ from: 'B', to: 'A', type: 'R' }, { from: 'B', to: 'C', type: 'R' }, { from: 'A', to: 'C', type: 'X' }];
  const limits = { maxDepth: 2, maxVisited: 5, maxReturned: 1 };
  const found = graph.search(edges, { start: 'A', target: 'C', direction: 'BOTH', relationTypes: ['R'], limits });
  assert.deepEqual(found.paths[0]?.nodes, ['A', 'B', 'C']); assert.equal(found.visited, 5); assert.equal(found.complete, true);
  const zero = graph.search(edges, { start: 'A', target: 'A', direction: 'BOTH', limits: { ...limits, maxDepth: 0, maxVisited: 0 } });
  assert.deepEqual(zero.paths[0]?.nodes, ['A']); assert.equal(zero.visited, 0);
  assert.equal(graph.search(edges, { start: 'A', target: 'A', direction: 'BOTH', limits: { ...limits, maxReturned: 0 } }).truncationReason, 'RESULT_LIMIT');
  assert.equal(graph.search(edges, { start: 'A', target: 'C', direction: 'BOTH', limits: { ...limits, maxVisited: 0 } }).truncationReason, 'VISIT_LIMIT');
});
