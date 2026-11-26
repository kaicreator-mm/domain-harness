import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createWorkflowSlot, resolveEvidence } from '../../src/index.js';
import type { WorkflowSlot, WorkflowSlotReader, WorkflowSlotWriter, StandardWorkflowOutcome, WorkflowKnowledgeFrame } from '../../src/index.js';
import { SlotLeaseScope } from '../../src/workflow-slots.js';

const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });
function complete<T>(r: StandardWorkflowOutcome<T>): T {
  assert.equal(r.status, 'COMPLETE', JSON.stringify(r.status === 'COMPLETE' ? {} : r.reason));
  if (r.status !== 'COMPLETE') throw Error('expected complete');
  return r.value;
}
const count = createWorkflowSlot('count', (v): v is bigint => typeof v === 'bigint');
const date = createWorkflowSlot('date', (v): v is Date => v instanceof Date);
function environment() {
  let epoch = 1, asOf = 1, revision = '1', scope = 'shop';
  const current = (): WorkflowKnowledgeFrame => ({ epoch, context: { scope, revisions: new Map([['authority', revision]]), asOf } });
  const slots = new SlotLeaseScope(current);
  const resolution = (keys: readonly string[]) => resolveEvidence(keys.map(key => ({ key, accepts: ['authority'] as const })),
    keys.map(key => ({ key, state: 'known' as const, origin: 'authority' as const, value: key,
      source: { id: 'authority', scope, revision, validity: { from: 0, until: 5 } } })), current().context, { equal: Object.is }, 16);
  return { slots, current, resolution, epoch: () => { epoch++; }, revision: () => { revision = '2'; },
    expire: () => { asOf = 5; }, foreign: () => { scope = 'other'; } };
}
test('native typed entries preserve bigint and Date identity; leases expire synchronously', () => {
  const e = environment(), when = new Date('2026-11-27T00:00:00Z');
  let writer!: WorkflowSlotWriter, reader!: WorkflowSlotReader;
  const stage = complete(e.slots.write({ count, date }, 2, w => {
    writer = w;
    assert.deepEqual(w.put('count', count, 9007199254740993n), ok(undefined));
    assert.deepEqual(w.put('date', date, when), ok(undefined));
    return ok('staged');
  }));
  assert.notEqual(writer.put('count', count, 1n).status, 'COMPLETE');
  const entries = complete(e.slots.contextEntries(stage, { count: ['quantity'], date: ['when'] }, e.resolution(['quantity', 'when'])));
  assert.equal(entries.get('count')?.evidenceKeys[0], 'quantity');
  assert.equal(entries.get('date')?.sources[0]?.revision, '1');
  assert.equal(complete(e.slots.read({ count, date }, entries, 2, r => {
    reader = r;
    assert.equal(complete(r.read('count', count)), 9007199254740993n);
    return r.read('date', date);
  })), when);
  assert.notEqual(reader.read('date', date).status, 'COMPLETE');
  assert.notEqual(e.slots.contextEntries(stage, { count: ['quantity'], date: ['when'] }, e.resolution(['quantity', 'when'])).status, 'COMPLETE');
});
test('foreign slot token, forged declaration, cross-region record, undeclared name and limit fail closed', () => {
  const e = environment(), other = environment();
  const stage = complete(e.slots.write({ count }, 1, w => w.put('count', count, 1n)));
  const entries = complete(e.slots.contextEntries(stage, { count: ['quantity'] }, e.resolution(['quantity'])));
  const sameName = createWorkflowSlot('count', (v): v is bigint => typeof v === 'bigint');
  const forged: WorkflowSlot<bigint> = { id: count.id, accepts: count.accepts };
  assert.notEqual(e.slots.read({ count: sameName }, entries, 1, r => r.read('count', sameName)).status, 'COMPLETE');
  let entered = 0;
  assert.notEqual(e.slots.read({ count: forged }, entries, 1, () => { entered++; return ok(1); }).status, 'COMPLETE');
  assert.equal(entered, 0);
  assert.notEqual(other.slots.read({ count }, entries, 1, r => r.read('count', count)).status, 'COMPLETE');
  assert.notEqual(e.slots.read({ count }, entries, 1, r => { r.read('missing', count); return ok(1); }).status, 'COMPLETE');
  assert.notEqual(e.slots.read({ count }, entries, 1, r => { r.read('count', count); r.read('count', count); return ok(1); }).status, 'COMPLETE');
  assert.notEqual(e.slots.write({ count }, 1, w => { w.put('count', count, 1n); w.put('count', count, 2n); return ok(1); }).status, 'COMPLETE');
  assert.notEqual(e.slots.write({ count }, 1, w => {
    // @ts-expect-error bigint slot cannot accept number at compile time, nor at runtime.
    w.put('count', count, 1);
    return ok(1);
  }).status, 'COMPLETE');
  e.slots.close();
  assert.notEqual(e.slots.read({ count }, entries, 1, r => r.read('count', count)).status, 'COMPLETE');
});
test('actual source keys and revision/expiry bind atomic candidates; missing, extra or stale provenance rejected', () => {
  for (const mode of ['missing','extra','unknown','stale','foreign','expired','revision','during-read'] as const) {
    const e = environment();
    const stage = complete(e.slots.write({ count }, 1, w => w.put('count', count, 2n)));
    const resolution = e.resolution(['quantity']);
    if (mode === 'missing' || mode === 'extra' || mode === 'unknown') {
      const map: Record<string, readonly string[]> = mode === 'missing' ? {} : mode === 'extra'
        ? { count: ['quantity'], extra: ['quantity'] } : { count: ['not-declared'] };
      assert.notEqual(e.slots.contextEntries(stage, map, resolution).status, 'COMPLETE');
      assert.notEqual(e.slots.contextEntries(stage, { count: ['quantity'] }, resolution).status, 'COMPLETE');
      continue;
    }
    const entries = complete(e.slots.contextEntries(stage, { count: ['quantity'] }, resolution));
    if (mode === 'stale') e.epoch();
    if (mode === 'foreign') e.foreign();
    if (mode === 'expired') e.expire();
    if (mode === 'revision') e.revision();
    assert.notEqual(e.slots.read({ count }, entries, 1, r => {
      const read = r.read('count', count);
      if (mode === 'during-read') e.epoch();
      return read;
    }).status, 'COMPLETE', mode);
  }
});
test('lease rejects declared async, unexpected rejected Promise and guard reentry; no unhandled rejection', async () => {
  const e = environment();
  let entered = 0;
  assert.notEqual(e.slots.write({ count }, 1, (async () => { entered++; return ok(1); }) as never).status, 'COMPLETE');
  assert.equal(entered, 0);
  assert.notEqual(e.slots.write({ count }, 1, (() => Promise.reject(Error('private marker'))) as never).status, 'COMPLETE');
  const bad = createWorkflowSlot<number>('bad', (() => Promise.reject(Error('private guard'))) as never);
  assert.notEqual(e.slots.write({ bad }, 1, w => w.put('bad', bad, 1)).status, 'COMPLETE');
  const reentrant = createWorkflowSlot('reentry', (v): v is number => {
    e.slots.write({ count }, 1, w => w.put('count', count, 1n));
    return typeof v === 'number';
  });
  assert.notEqual(e.slots.write({ reentrant }, 1, w => w.put('reentrant', reentrant, 1)).status, 'COMPLETE');
  await nextTurn();
});
