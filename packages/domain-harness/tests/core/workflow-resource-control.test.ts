import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  WorkflowResourceLedger, WorkflowClock, EVENT_SCAN_WORK,
  frameScanWork, knowledgeScanWork, leaseScanWork,
} from '../../src/workflow-resource-control.js';
import type { ResourceLimits, ResourceCharge } from '../../src/workflow-resource-control.js';

const limits = { maxWork: 100, maxEvents: 4, maxActiveScopes: 2,
  model: { maxCalls: 2, maxRetries: 1, maxOutputTokens: 10, maxReservedTokens: 20 } };
const owner = {};
const charge = { calls: 3, steps: 4, work: 100, events: 4, activeScopes: 2,
  modelCalls: 1, modelRetries: 1, outputTokens: 10, reservedTokens: 20, terminalReads: 2 };
const cases: readonly [string, number, number, ResourceLimits, ResourceCharge, string][] = [
  ['calls', 2, 4, limits, charge, 'WORKFLOW_CALL_BUDGET'],
  ['steps', 3, 3, limits, charge, 'WORKFLOW_STEP_BUDGET'],
  ['work', 3, 4, { ...limits, maxWork: 99 }, charge, 'WORKFLOW_WORK_BUDGET'],
  ['events', 3, 4, { ...limits, maxEvents: 3 }, charge, 'WORKFLOW_EVENT_BUDGET'],
  ['active scopes', 3, 4, { ...limits, maxActiveScopes: 1 }, charge, 'WORKFLOW_ACTIVE_SCOPE_LIMIT'],
  ['model calls', 3, 4, { ...limits, model: { ...limits.model, maxCalls: 0 } }, charge, 'WORKFLOW_MODEL_CALL_BUDGET'],
  ['model retries', 3, 4, { ...limits, model: { ...limits.model, maxRetries: 0 } }, charge, 'WORKFLOW_MODEL_RETRY_BUDGET'],
  ['model tokens', 3, 4, { ...limits, model: { ...limits.model, maxReservedTokens: 19 } }, charge, 'WORKFLOW_MODEL_TOKEN_BUDGET'],
  ['output tokens', 3, 4, { ...limits, model: { ...limits.model, maxOutputTokens: 9 } }, charge, 'WORKFLOW_MODEL_TOKEN_BUDGET'],
];

for (const [name, calls, steps, bound, request, code] of cases) {
  test('atomic one-short: ' + name, () => {
    const ledger = new WorkflowResourceLedger(calls, steps, bound);
    const before = ledger.remaining();
    assert.deepEqual(ledger.reserve(owner, request), { ok: false, code });
    assert.deepEqual(ledger.remaining(), before);
  });
}

test('exact reservation, owner-bound terminal/event ticket, no refund except activity on close', () => {
  const ledger = new WorkflowResourceLedger(3, 4, limits);
  const local = ledger.local(100);
  const child = ledger.local(100, local);
  const admitted = ledger.reserve(owner, charge, child);
  assert.equal(admitted.ok, true);
  if (!admitted.ok) return;
  assert.deepEqual(ledger.remaining(), { calls: 0, steps: 0, work: 0, events: 0,
    activeScopes: 0, modelCalls: 1, modelRetries: 0, reservedTokens: 0 });
  assert.equal(ledger.localRemaining(local), 0);
  assert.equal(ledger.localRemaining(child), 0);
  const ticket = admitted.ticket;
  assert.equal(ticket.event({}), false);
  assert.equal(ticket.terminalRead({}), false);
  assert.equal(ticket.close({}), false);
  for (let i = 0; i < 4; i++) assert.equal(ticket.event(owner), true);
  assert.equal(ticket.event(owner), false);
  assert.equal(ticket.terminalRead(owner), true);
  assert.equal(ticket.terminalRead(owner), true);
  assert.equal(ticket.terminalRead(owner), false);
  assert.equal(ticket.close(owner), true);
  assert.equal(ticket.close(owner), false);
  assert.equal(ticket.event(owner), false);
  assert.equal(ledger.remaining().activeScopes, 2);
  assert.equal(ledger.remaining().work, 0);
  assert.equal(ledger.remaining().events, 0);
  assert.equal(ledger.remaining().reservedTokens, 0);
});

test('ancestor local cap, sibling shares ancestor but unrelated local remains independent', () => {
  const ledger = new WorkflowResourceLedger(10, 10, limits);
  const parent = ledger.local(6);
  const left = ledger.local(10, parent);
  const right = ledger.local(10, parent);
  const other = ledger.local(30);
  assert.equal(ledger.reserve(owner, { calls: 1, steps: 1, work: 4 }, left).ok, true);
  assert.equal(ledger.localRemaining(right), 2);
  const before = ledger.remaining();
  assert.deepEqual(ledger.reserve(owner, { calls: 1, steps: 1, work: 3 }, right),
    { ok: false, code: 'WORKFLOW_LOCAL_WORK_BUDGET' });
  assert.deepEqual(ledger.remaining(), before);
  assert.equal(ledger.localRemaining(right), 2);
  assert.equal(ledger.reserve(owner, { calls: 1, steps: 1, work: 2 }, right).ok, true);
  assert.equal(ledger.localRemaining(parent), 0);
  assert.equal(ledger.localRemaining(other), 30);
});

test('invalid or foreign inputs reject before debit and legacy count not narrowed', () => {
  const ledger = new WorkflowResourceLedger(3, 4, limits);
  const other = new WorkflowResourceLedger(3, 4, limits);
  const before = ledger.remaining();
  for (const invalid of [NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(ledger.reserve(owner, { calls: 0, steps: 0, work: invalid }),
      { ok: false, code: 'WORKFLOW_INVALID_LIMIT' });
  }
  assert.deepEqual(ledger.reserve(owner, { calls: 0, steps: 0 }, other.local(2)),
    { ok: false, code: 'WORKFLOW_INVALID_LIMIT' });
  assert.throws(() => ledger.local(2, other.local(2)), RangeError);
  assert.deepEqual(ledger.reserve(owner, { calls: 1, steps: 1, terminalReads: 2 }),
    { ok: false, code: 'WORKFLOW_INVALID_LIMIT' });
  assert.deepEqual(ledger.remaining(), before);
  const legacy = new WorkflowResourceLedger(Number.MAX_SAFE_INTEGER, 4);
  assert.equal(legacy.reserve(owner, { calls: 1, steps: 1 }).ok, true);
  assert.equal(legacy.remaining().calls, Number.MAX_SAFE_INTEGER - 1);
  assert.equal(legacy.reserve(owner, { calls: 1, steps: 1, work: 1 }).ok, false);
  for (const invalid of [{ ...limits, maxEvents: 65537 }, { ...limits, maxActiveScopes: 4097 },
    { ...limits, maxWork: 2 ** 31 }]) {
    assert.deepEqual(new WorkflowResourceLedger(3, 4, invalid).reserve(owner, { calls: 0, steps: 0 }),
      { ok: false, code: 'WORKFLOW_INVALID_LIMIT' });
  }
});

test('frozen bounded work formula and limits', () => {
  assert.equal(EVENT_SCAN_WORK, 33024);
  assert.equal(frameScanWork(4096), 16385);
  assert.equal(knowledgeScanWork(4096), 65537);
  assert.equal(leaseScanWork(2048), 8193);
  assert.throws(() => frameScanWork(4097));
  assert.throws(() => knowledgeScanWork(-1));
  assert.throws(() => leaseScanWork(2049));
});

test('clock actual abort interrupts active elapsed, no false local completion', async () => {
  const clock = new WorkflowClock(30, 2000, 50);
  try {
    await new Promise<void>(resolve => clock.signal.addEventListener('abort', () => { resolve(); }, { once: true }));
    assert.equal(clock.reason, 'active-timeout');
    assert.equal(clock.check(), false);
    const first = clock.settlementRemaining();
    await sleep(10);
    assert.ok(clock.beginSettlement() < first);
  } finally { clock.finish(); }
});

test('published wait pauses active, active sibling resumes, wall still expires', async () => {
  const clock = new WorkflowClock(1000, 100, 20);
  try {
    assert.equal(clock.activity(0, 1), true);
    const before = clock.remaining().activeMs;
    await sleep(20);
    assert.equal(clock.remaining().activeMs, before);
    assert.equal(clock.activity(1, 1), true);
    await sleep(10);
    assert.ok(clock.remaining().activeMs < before);
    assert.equal(clock.activity(0, 1), true);
    if (!clock.signal.aborted) await new Promise<void>(resolve => {
      clock.signal.addEventListener('abort', () => { resolve(); }, { once: true });
    });
    assert.equal(clock.reason, 'wall-timeout');
  } finally { clock.finish(); }
});

test('external cancellation and zero time, independent root and no reset', () => {
  const abort = new AbortController();
  const first = new WorkflowClock(1000, undefined, 100, abort.signal);
  const other = new WorkflowClock(1000, undefined, 100);
  try {
    abort.abort();
    assert.equal(first.reason, 'cancelled');
    assert.equal(first.check(), false);
    assert.equal(other.check(), true);
    const zero = new WorkflowClock(0, undefined, 0);
    assert.equal(zero.reason, 'active-timeout');
    zero.finish();
  } finally { first.finish(); other.finish(); }
});
