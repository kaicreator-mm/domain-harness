import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphQueryElement, VectorQueryElement } from '../../src/standard-vector-graph.js';
import type { TypedGraphEdge, VectorCandidate } from '../../src/standard-vector-graph.js';

const vector = new VectorQueryElement();
const graph = new GraphQueryElement();
const edges: readonly TypedGraphEdge[] = [
  { from: 'A', to: 'B', type: 'RELATED' },
  { from: 'B', to: 'C', type: 'RELATED' },
  { from: 'C', to: 'A', type: 'RELATED' },
  { from: 'A', to: 'D', type: 'OWNED' },
  { from: 'D', to: 'E', type: 'RELATED' },
];
const limits = { maxDepth: 3, maxVisited: 100, maxReturned: 9 } as const;

test('T03 vector: separate business scopes, finite cosine topK and stable id tie', () => {
  const records: readonly VectorCandidate<{ domain: string }>[] = [
    { id: 'z', vector: [1, 0], item: { domain: 'repair' } },
    { id: 'foreign', vector: [Number.NaN], item: { domain: 'inventory' } },
    { id: 'b', vector: [0, 1], item: { domain: 'repair' } },
    { id: 'a', vector: [1, 0], item: { domain: 'repair' } },
  ];
  const result = vector.search(records, [1, 0], item => item.domain === 'repair',
    { metric: 'COSINE', dimension: 2, topK: 2, maxVisited: 4 });
  assert.deepEqual(result.matches.map(item => item.id), ['a', 'z']);
  assert.equal(result.visited, 4);
  assert.equal(result.complete, true);
  assert.equal(Object.isFrozen(result.matches), true);
});

test('T03 vector: scope false never reads an excluded candidate vector', () => {
  let read = 0;
  const candidate: VectorCandidate<number> = {
    id: 'excluded', item: 1,
    get vector(): readonly number[] { read += 1; throw Error('scope read failure'); },
  };
  const result = vector.search([candidate], [1], () => false,
    { metric: 'L2', dimension: 1, topK: 1, maxVisited: 1 });
  assert.equal(read, 0);
  assert.deepEqual(result.matches, []);
  assert.equal(result.complete, true);
});

test('T03 vector: L2 tie ranking and visit budget do not peek', () => {
  let peeked = 0;
  const source: readonly VectorCandidate<number>[] = [
    { id: 'z', vector: [0], item: 1 },
    { id: 'a', vector: [0], item: 2 },
    { id: 'late', item: 3, get vector(): readonly number[] { peeked += 1; throw Error('peek'); } },
  ];
  const complete = vector.search(source.slice(0, 2), [0], () => true,
    { metric: 'L2', dimension: 1, topK: 1, maxVisited: 2 });
  assert.deepEqual(complete.matches.map(item => item.id), ['a']);
  assert.equal(complete.complete, true);
  const partial = vector.search(source, [0], () => true,
    { metric: 'L2', dimension: 1, topK: 1, maxVisited: 2 });
  assert.equal(partial.truncationReason, 'VISIT_LIMIT');
  assert.equal(partial.complete, false);
  assert.equal(peeked, 0);
});

test('T03 vector: invalid dimension/zero cosine/nonfinite/limits reject', () => {
  const one = [{ id: 'x', vector: [0], item: 1 }];
  assert.throws(() => vector.search(one, [1, 0], () => true,
    { metric: 'L2', dimension: 2, topK: 1, maxVisited: 1 }), /DH_STD_QUERY_VECTOR_DIMENSION/u);
  assert.throws(() => vector.search(one, [1], () => true,
    { metric: 'COSINE', dimension: 1, topK: 1, maxVisited: 1 }), /DH_STD_QUERY_VECTOR_ZERO_NORM/u);
  assert.throws(() => vector.search(one, [Number.POSITIVE_INFINITY], () => true,
    { metric: 'L2', dimension: 1, topK: 1, maxVisited: 1 }), /DH_STD_QUERY_VECTOR_VALUE/u);
  assert.throws(() => vector.search(one, [0], () => true,
    { metric: 'L2', dimension: 1, topK: -1, maxVisited: 1 }), /DH_STD_QUERY_VECTOR_INPUT/u);
});

test('T03 vector: zero budgets / empty source / async scope fail closed', () => {
  const options = { metric: 'L2', dimension: 1, topK: 0, maxVisited: 0 } as const;
  assert.equal(vector.search([], [1], () => true, options).complete, true);
  assert.equal(vector.search([{ id: 'x', vector: [1], item: 1 }], [1], () => true, options).truncationReason, 'RESULT_LIMIT');
  let entered = 0;
  const invalidScope = (async () => { entered += 1; return true; }) as unknown as (item: number) => boolean;
  assert.throws(() => vector.search([{ id: 'x', vector: [1], item: 1 }], [1], invalidScope,
    { ...options, topK: 1, maxVisited: 1 }), /DH_STD_QUERY_VECTOR_INPUT/u);
  assert.equal(entered, 0);
});

test('T03 graph: directed BFS, cycle suppression and deterministic shortest paths', () => {
  const result = graph.search(edges, { start: 'A', direction: 'OUT', limits });
  assert.deepEqual(result.paths.map(path => path.nodes.join('>')),
    ['A>B', 'A>D', 'A>B>C', 'A>D>E']);
  assert.equal(result.complete, true);
  assert.equal(result.truncated, false);
});

test('T03 graph: relationship types and reverse direction', () => {
  const incoming = graph.search(edges, { start: 'A', direction: 'IN', limits: { ...limits, maxDepth: 1 } });
  assert.deepEqual(incoming.paths.map(path => path.nodes.join('>')), ['A>C']);
  const related = graph.search(edges, { start: 'A', direction: 'OUT', relationTypes: ['OWNED'], limits });
  assert.deepEqual(related.paths.map(path => path.nodes.join('>')), ['A>D']);
});

test('T03 graph: target found and target absent are distinguishable from truncated', () => {
  const found = graph.search(edges, { start: 'A', target: 'E', direction: 'OUT', limits });
  assert.deepEqual(found.paths[0]?.nodes, ['A', 'D', 'E']);
  assert.equal(found.complete, true);
  const absent = graph.search(edges, { start: 'A', target: 'Z', direction: 'OUT', limits });
  assert.deepEqual(absent.paths, []);
  assert.equal(absent.complete, true);
  const partial = graph.search(edges, { start: 'A', target: 'E', direction: 'OUT',
    limits: { maxDepth: 3, maxVisited: 2, maxReturned: 1 } });
  assert.equal(partial.complete, false);
  assert.equal(partial.truncationReason, 'VISIT_LIMIT');
});

test('T03 graph: result/visit/depth/empty source budgets', () => {
  const overflow = graph.search(edges, { start: 'A', direction: 'OUT',
    limits: { maxDepth: 1, maxVisited: 5, maxReturned: 1 } });
  assert.equal(overflow.truncationReason, 'RESULT_LIMIT');
  assert.deepEqual(overflow.paths.map(path => path.nodes), [['A', 'B']]);
  const exact = graph.search(edges.slice(0, 1), { start: 'A', direction: 'OUT',
    limits: { maxDepth: 1, maxVisited: 1, maxReturned: 1 } });
  assert.equal(exact.complete, true);
  assert.equal(graph.search(edges, { start: 'A', direction: 'OUT',
    limits: { maxDepth: 0, maxVisited: 0, maxReturned: 0 } }).complete, true);
  assert.equal(graph.search([], { start: 'A', direction: 'OUT', limits }).complete, true);
});

test('T03 graph: invalid edge and negative budgets fail closed', () => {
  assert.throws(() => graph.search([{ from: 'A', to: 'B', type: '' }],
    { start: 'A', direction: 'OUT', limits }), /DH_STD_QUERY_GRAPH_EDGE/u);
  assert.throws(() => graph.search(edges, { start: 'A', direction: 'OUT',
    limits: { maxDepth: 1, maxVisited: -1, maxReturned: 1 } }), /DH_STD_QUERY_GRAPH_INPUT/u);
});
