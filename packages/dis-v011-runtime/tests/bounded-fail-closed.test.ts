import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoundedEnvelope } from '../src/bounded/envelope.ts';
import type { BoundedTraceEvent } from '../src/bounded/envelope.ts';

const FIXTURE_PROVIDER = { kind: 'fixture' as const, id: 'fixture-d2' };
const exhaustedOf = (trace: readonly BoundedTraceEvent[]) =>
  trace.find((event): event is Extract<BoundedTraceEvent, { type: 'budget-exhausted' }> => event.type === 'budget-exhausted');

test('steps exhaustion fails closed with structured BUDGET_EXHAUSTED on the steps axis', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 2, maxWorkUnits: 100, wallClockMs: 60000 },
    providers: [FIXTURE_PROVIDER],
  });
  let executedSteps = 0;
  const outcome = await envelope.execute({
    providerKind: 'fixture',
    run: async (ctx) => {
      const seen: number[] = [];
      for (let index = 0; index < 5; index += 1) {
        const value = await ctx.step({ workUnits: 1 }, async () => {
          executedSteps += 1;
          return index;
        });
        seen.push(value);
      }
      return { seen };
    },
  });
  assert.equal(outcome.status, 'BUDGET_EXHAUSTED');
  assert.equal(outcome.axis, 'steps');
  assert.equal(outcome.output, null);
  assert.equal(outcome.attested, false);
  assert.equal(outcome.authority, 'NONE');
  assert.equal(outcome.disposition, 'UNKNOWN');
  assert.equal(executedSteps, 2, 'no step beyond the budget may execute');
  assert.deepEqual(envelope.remaining(), { steps: 0, workUnits: 98 });
  const exhausted = exhaustedOf(outcome.trace);
  assert.ok(exhausted, 'exhaustion must be traced');
  assert.equal(exhausted.axis, 'steps');
  assert.equal(exhausted.cause, 'reserve-denied');
});

test('workUnits exhaustion fails closed when a step costs more than the remaining units', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 8, maxWorkUnits: 3, wallClockMs: 60000 },
    providers: [FIXTURE_PROVIDER],
  });
  let executedSteps = 0;
  const outcome = await envelope.execute({
    providerKind: 'fixture',
    run: async (ctx) => {
      const first = await ctx.step({ workUnits: 2 }, async () => { executedSteps += 1; return 'first'; });
      const second = await ctx.step({ workUnits: 2 }, async () => { executedSteps += 1; return 'second'; });
      return { first, second };
    },
  });
  assert.equal(outcome.status, 'BUDGET_EXHAUSTED');
  assert.equal(outcome.axis, 'workUnits');
  assert.equal(outcome.output, null);
  assert.equal(executedSteps, 1, 'the under-funded second step must never execute');
  const exhausted = exhaustedOf(outcome.trace);
  assert.ok(exhausted);
  assert.equal(exhausted.axis, 'workUnits');
  assert.equal(exhausted.cause, 'reserve-denied');
});

test('an exhausted envelope rejects the next run before its executor does any work', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 1, maxWorkUnits: 1, wallClockMs: 60000 },
    providers: [FIXTURE_PROVIDER],
  });
  const first = await envelope.execute({
    providerKind: 'fixture',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () => 'drained'),
  });
  assert.equal(first.status, 'COMPLETED');
  assert.deepEqual(envelope.remaining(), { steps: 0, workUnits: 0 });
  let executorCalls = 0;
  const second = await envelope.execute({
    providerKind: 'fixture',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () => { executorCalls += 1; return 'never'; }),
  });
  assert.equal(second.status, 'BUDGET_EXHAUSTED');
  assert.equal(second.axis, 'steps');
  assert.equal(second.output, null);
  assert.equal(executorCalls, 0, 'exhausted ledger must stop the executor before any bounded work');
  assert.deepEqual(second.trace.map((event) => event.type), ['provider-admitted', 'run-started', 'budget-exhausted']);
});

test('exhaustion never yields a silent partial success output', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 2, maxWorkUnits: 10, wallClockMs: 60000 },
    providers: [FIXTURE_PROVIDER],
  });
  const partial: string[] = [];
  const outcome = await envelope.execute({
    providerKind: 'fixture',
    run: async (ctx) => {
      for (const item of ['a', 'b', 'c', 'd']) {
        const value = await ctx.step({ workUnits: 1 }, async () => item);
        partial.push(value);
      }
      return { items: partial };
    },
  });
  assert.equal(outcome.status, 'BUDGET_EXHAUSTED');
  assert.equal(outcome.axis, 'steps');
  assert.equal(outcome.output, null, 'exhausted outcome must not carry partial output');
  assert.equal('output' in outcome && outcome.output === null, true);
  assert.equal(outcome.trace.some((event) => event.type === 'run-completed'), false, 'an exhausted run must not be recorded as completed');
  const settledEvents = outcome.trace
    .filter((event): event is Extract<BoundedTraceEvent, { type: 'budget-settled' }> => event.type === 'budget-settled');
  assert.deepEqual(settledEvents.map((event) => event.status), ['completed', 'completed']);
  assert.deepEqual(partial, ['a', 'b'], 'partial executor-side work stays local and is never emitted by the envelope');
});

test('executor throw surfaces as EXECUTION_FAILED and never falls back to fixture output', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 1, maxWorkUnits: 4, wallClockMs: 60000 },
    providers: [FIXTURE_PROVIDER],
  });
  const outcome = await envelope.execute({
    providerKind: 'fixture',
    run: async () => { throw new Error('boom\nhidden-control'); },
  });
  assert.equal(outcome.status, 'EXECUTION_FAILED');
  assert.equal(outcome.output, null);
  assert.equal(outcome.attested, false);
  assert.equal(outcome.authority, 'NONE');
  assert.equal('provider' in outcome, false, 'no fixture fallback output may appear on failure');
  assert.equal(outcome.trace.some((event) => event.type === 'run-completed'), false);
  const failed = outcome.trace.find((event): event is Extract<BoundedTraceEvent, { type: 'execution-failed' }> => event.type === 'execution-failed');
  assert.ok(failed, 'executor failure must be traced');
  assert.ok(failed.reason.includes('boom'));
  assert.equal(failed.reason.includes('\n'), false, 'reason must be sanitized of control characters');
  assert.deepEqual(envelope.remaining(), { steps: 1, workUnits: 4 }, 'no reservation existed, so no budget is consumed');
});

test('a throwing step settles as failed and propagates as EXECUTION_FAILED without refund', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 1, maxWorkUnits: 4, wallClockMs: 60000 },
    providers: [FIXTURE_PROVIDER],
  });
  const outcome = await envelope.execute({
    providerKind: 'fixture',
    run: (ctx) => ctx.step({ workUnits: 2 }, async () => { throw new Error('step failed'); }),
  });
  assert.equal(outcome.status, 'EXECUTION_FAILED');
  assert.equal(outcome.output, null);
  assert.equal(outcome.attested, false);
  const settledEvents = outcome.trace
    .filter((event): event is Extract<BoundedTraceEvent, { type: 'budget-settled' }> => event.type === 'budget-settled');
  assert.equal(settledEvents.length, 1);
  assert.equal(settledEvents[0].status, 'failed');
  assert.deepEqual(envelope.remaining(), { steps: 0, workUnits: 2 }, 'failed steps stay consumed (fail-closed, no refund)');
});
