import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundedQueryElement, StandardWorkflowSession } from '../../src/index.js';

const query = new BoundedQueryElement();

// 两个互不相关的 Business 领域使用同一 Standard Query 实现。
const qualificationKnowledge = Object.freeze({ minimumTotal: 10 });
const orders = [
  { id: 'o1', total: 12 }, { id: 'o2', total: 4 }, { id: 'o3', total: 14 },
] as const;
const inventory = [
  { sku: 'B', available: 0 }, { sku: 'A', available: 5 },
] as const;

test('T01: qualification business retains source order and exact complete result', () => {
  const result = query.select(orders, item => item.total >= qualificationKnowledge.minimumTotal,
    { maxVisited: 3, maxReturned: 2 });
  assert.deepEqual(result, {
    items: [orders[0], orders[2]], visited: 3, complete: true, truncated: false,
  });
  assert.ok(Object.isFrozen(result.items));
  assert.deepEqual(orders.map(item => item.id), ['o1', 'o2', 'o3']);
});

test('T01: independent inventory domain uses same Standard Element', () => {
  const result = query.select(inventory, item => item.available > 0,
    { maxVisited: 2, maxReturned: 2 });
  assert.deepEqual(result.items.map(item => item.sku), ['A']);
  assert.equal(result.complete, true);
});

test('T01: early result limit does not peek ahead or claim complete', () => {
  const seen: string[] = [];
  const result = query.select(orders, item => { seen.push(item.id); return true; },
    { maxVisited: 3, maxReturned: 1 });
  assert.deepEqual(seen, ['o1']);
  assert.deepEqual(result, {
    items: [orders[0]], visited: 1, complete: false,
    truncated: true, truncationReason: 'RESULT_LIMIT',
  });
});

test('T01: visit limit never invokes the next predicate', () => {
  let calls = 0;
  const result = query.select(orders, () => { calls += 1; return false; },
    { maxVisited: 1, maxReturned: 2 });
  assert.equal(calls, 1);
  assert.equal(result.visited, 1);
  assert.equal(result.complete, false);
  assert.equal(result.truncationReason, 'VISIT_LIMIT');
});

test('T01: zero-limit and empty-source boundary matrix', () => {
  assert.deepEqual(query.select([], () => true, { maxVisited: 0, maxReturned: 0 }),
    { items: [], visited: 0, complete: true, truncated: false });
  for (const [limits, reason] of [
    [{ maxVisited: 0, maxReturned: 0 }, 'RESULT_LIMIT'],
    [{ maxVisited: 1, maxReturned: 0 }, 'RESULT_LIMIT'],
    [{ maxVisited: 0, maxReturned: 1 }, 'VISIT_LIMIT'],
  ] as const) {
    const result = query.select(orders, () => { throw new Error('must not reach predicate'); }, limits);
    assert.equal(result.visited, 0);
    assert.equal(result.complete, false);
    assert.equal(result.truncationReason, reason);
  }
});

test('T01: last item exactly fills result budget and remains complete', () => {
  const result = query.select(inventory, item => item.available > 0,
    { maxVisited: 2, maxReturned: 1 });
  assert.deepEqual(result, {
    items: [inventory[1]], visited: 2, complete: true, truncated: false,
  });
});

test('T01: a partial business query does not prove absence', () => {
  const result = query.select(orders, item => item.id === 'o3',
    { maxVisited: 1, maxReturned: 1 });
  const businessOutcome = result.complete ? 'NOT_FOUND' : 'UNKNOWN';
  assert.equal(result.items.length, 0);
  assert.equal(businessOutcome, 'UNKNOWN');
});

test('T01: invalid budgets and invalid JS callback cannot return partial success', () => {
  for (const limit of [-1, 1.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => query.select(orders, () => true,
      { maxVisited: limit, maxReturned: 1 }), /DH_STD_QUERY_INVALID_INPUT/u);
    assert.throws(() => query.select(orders, () => true,
      { maxVisited: 1, maxReturned: limit }), /DH_STD_QUERY_INVALID_INPUT/u);
  }
  assert.throws(() => query.select(orders, () => { throw new Error('domain predicate failed'); },
    { maxVisited: 3, maxReturned: 3 }), /domain predicate failed/u);
  const invalid = (() => Promise.resolve(true)) as unknown as (item: typeof orders[number]) => boolean;
  assert.throws(() => query.select(orders, invalid, { maxVisited: 3, maxReturned: 3 }),
    /DH_STD_QUERY_INVALID_PREDICATE_RESULT/u);
});

test('T01: existing Standard Workflow runs the same Query without new runtime', async () => {
  const session = new StandardWorkflowSession({ maxCalls: 1, maxSteps: 2, maxDepth: 0 });
  const outcome = await session.run(ctx => ctx.invoke(() => query.select(inventory,
    item => item.available > 0, { maxVisited: 2, maxReturned: 2 })));
  assert.equal(outcome.status, 'COMPLETE');
  if (outcome.status === 'COMPLETE') {
    assert.deepEqual(outcome.value.items.map(item => item.sku), ['A']);
    assert.equal(outcome.value.complete, true);
  }
  const denied = await new StandardWorkflowSession({ maxCalls: 0, maxSteps: 1, maxDepth: 0 })
    .run(ctx => ctx.invoke(() => query.select(orders, () => { throw Error('MUST_NOT_RUN'); },
      { maxVisited: 3, maxReturned: 2 })));
  assert.equal(denied.status, 'FAILED');
  if (denied.status === 'FAILED') assert.equal(denied.reason.code, 'WORKFLOW_CALL_BUDGET');
});
