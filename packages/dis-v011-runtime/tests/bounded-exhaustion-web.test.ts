import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BoundedBudgetExhaustedError,
  createBoundedEnvelope,
} from '../src/bounded/envelope.ts';

const makeEnvelope = (maxSteps: number, maxWorkUnits: number) =>
  createBoundedEnvelope({
    budget: { maxSteps, maxWorkUnits, wallClockMs: 10_000 },
    providers: [{ kind: 'local-deterministic', id: 'budget-truth-test' }],
  });

test('step exhaustion cannot be swallowed into a successful outcome', async () => {
  const envelope = makeEnvelope(1, 2);
  const outcome = await envelope.execute({
    providerKind: 'local-deterministic',
    run: async (ctx) => {
      await ctx.step({ workUnits: 1 }, async () => 'first');
      try {
        await ctx.step({ workUnits: 1 }, async () => 'never');
        assert.fail('the budget must reject the second reservation');
      } catch (error) {
        assert.ok(error instanceof BoundedBudgetExhaustedError);
        assert.equal(error.axis, 'steps');
      }
      return { falseSuccess: true };
    },
  });
  assert.equal(outcome.status, 'BUDGET_EXHAUSTED');
  if (outcome.status !== 'BUDGET_EXHAUSTED') return;
  assert.equal(outcome.axis, 'steps');
  assert.equal(outcome.output, null);
  assert.equal(outcome.disposition, 'UNKNOWN');
  assert.equal(outcome.attested, false);
  assert.equal(outcome.authority, 'NONE');
  assert.equal(outcome.effectDispatched, false);
  assert.equal(outcome.trace.filter((event) => event.type === 'budget-exhausted').length, 1);
  assert.equal(outcome.trace.some((event) => event.type === 'run-completed'), false);
});

test('work-unit exhaustion cannot be swallowed into a successful outcome', async () => {
  const envelope = makeEnvelope(2, 1);
  const outcome = await envelope.execute({
    providerKind: 'local-deterministic',
    run: async (ctx) => {
      try {
        await ctx.step({ workUnits: 2 }, async () => 'never');
      } catch (error) {
        assert.ok(error instanceof BoundedBudgetExhaustedError);
        assert.equal(error.axis, 'workUnits');
      }
      return 'wrongly-completed';
    },
  });
  assert.equal(outcome.status, 'BUDGET_EXHAUSTED');
  if (outcome.status !== 'BUDGET_EXHAUSTED') return;
  assert.equal(outcome.axis, 'workUnits');
  assert.equal(outcome.output, null);
  assert.equal(outcome.trace.some((event) => event.type === 'run-completed'), false);
});

test('successful within-budget runs still produce their original value', async () => {
  const envelope = makeEnvelope(1, 1);
  const outcome = await envelope.execute({
    providerKind: 'local-deterministic',
    run: async (ctx) => ctx.step({ workUnits: 1 }, async () => ({ observed: 42 })),
  });
  assert.equal(outcome.status, 'COMPLETED');
  if (outcome.status !== 'COMPLETED') return;
  assert.deepEqual(outcome.output, { observed: 42 });
  assert.equal(outcome.attested, false);
  assert.equal(outcome.provider.verified, false);
  assert.equal(outcome.trace.some((event) => event.type === 'budget-exhausted'), false);
});

test('ordinary unhandled executor errors remain failed, not exhausted', async () => {
  const envelope = makeEnvelope(1, 1);
  const outcome = await envelope.execute({
    providerKind: 'local-deterministic',
    run: async () => { throw new Error('expected failure'); },
  });
  assert.equal(outcome.status, 'EXECUTION_FAILED');
  if (outcome.status !== 'EXECUTION_FAILED') return;
  assert.equal(outcome.output, null);
  assert.equal(outcome.reason, 'expected failure');
});
