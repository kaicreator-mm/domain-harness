import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoundedEnvelope } from '../src/bounded/envelope.ts';
import type { BoundedClock } from '../src/bounded/envelope.ts';

/**
 * Manual clock: wall-clock exhaustion is verified by advancing fake time
 * synchronously. No test ever sleeps for real.
 */
function makeFakeClock(startNow = 0) {
  let now = startNow;
  let sequence = 0;
  const timers: { at: number; onFire: () => void; order: number }[] = [];
  const clock: BoundedClock = {
    now: () => now,
    schedule: (ms, onFire) => {
      const entry = { at: now + ms, onFire, order: sequence };
      sequence += 1;
      timers.push(entry);
      return () => {
        const index = timers.indexOf(entry);
        if (index >= 0) timers.splice(index, 1);
      };
    },
  };
  const advance = (ms: number): void => {
    now += ms;
    const due = timers.filter((timer) => timer.at <= now).sort((a, b) => a.order - b.order);
    for (const timer of due) {
      timers.splice(timers.indexOf(timer), 1);
      timer.onFire();
    }
  };
  return { clock, advance };
}

test('wall-clock exhaustion via injected clock fails closed and late resolution never upgrades', async () => {
  const { clock, advance } = makeFakeClock();
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 4, maxWorkUnits: 10, wallClockMs: 50 },
    providers: [{ kind: 'fixture', id: 'fixture-d2' }],
    clock,
  });
  let stepStarted = false;
  let executorFinished = false;
  let resolveStep: (value: string) => void = () => {};
  const hung = new Promise<string>((resolve) => { resolveStep = resolve; });
  const pending = envelope.execute({
    providerKind: 'fixture',
    run: async (ctx) => {
      const value = await ctx.step({ workUnits: 2 }, () => { stepStarted = true; return hung; });
      executorFinished = true;
      return value;
    },
  });
  for (let spins = 0; spins < 100 && !stepStarted; spins += 1) await Promise.resolve();
  assert.equal(stepStarted, true, 'executor must reach its first bounded step');
  advance(60);
  const outcome = await pending;
  assert.equal(outcome.status, 'BUDGET_EXHAUSTED');
  assert.equal(outcome.axis, 'wallClockMs');
  assert.equal(outcome.output, null);
  assert.equal(outcome.attested, false);
  assert.equal(outcome.authority, 'NONE');
  assert.equal(outcome.disposition, 'UNKNOWN');
  assert.equal(executorFinished, false, 'the run had not completed when the deadline fired');
  assert.deepEqual(outcome.remaining, { steps: 3, workUnits: 8 }, 'deadline-abandoned reservations stay consumed');
  assert.deepEqual(outcome.trace.map((event) => event.type), [
    'provider-admitted', 'run-started', 'budget-reserved', 'budget-settled', 'budget-exhausted',
  ]);
  const settled = outcome.trace.find((event) => event.type === 'budget-settled') as { status: string };
  assert.equal(settled.status, 'deadline-abandoned');
  const exhausted = outcome.trace.find((event) => event.type === 'budget-exhausted') as { axis: string; cause: string };
  assert.equal(exhausted.axis, 'wallClockMs');
  assert.equal(exhausted.cause, 'deadline-fired');
  // Late resolution of the abandoned step must never upgrade the outcome.
  resolveStep('late-truth');
  for (let spins = 0; spins < 50; spins += 1) await Promise.resolve();
  assert.equal(outcome.status, 'BUDGET_EXHAUSTED', 'recorded outcome is immutable after exhaustion');
  assert.equal(outcome.output, null);
  assert.deepEqual(envelope.remaining(), { steps: 3, workUnits: 8 }, 'no refund after late resolution');
});
