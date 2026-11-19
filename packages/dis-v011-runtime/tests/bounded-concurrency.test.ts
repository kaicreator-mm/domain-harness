import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoundedEnvelope } from '../src/bounded/envelope.ts';

const FIXTURE_PROVIDER = { kind: 'fixture' as const, id: 'fixture-d2' };

test('concurrent executions cannot overspend the steps axis (N runs vs M budget)', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 1, maxWorkUnits: 4, wallClockMs: 60000 },
    providers: [FIXTURE_PROVIDER],
  });
  let executorCalls = 0;
  const oneRun = () => envelope.execute({
    providerKind: 'fixture',
    run: (ctx) => ctx.step({ workUnits: 2 }, async () => {
      executorCalls += 1;
      await Promise.resolve();
      return 'ok';
    }),
  });
  const results = await Promise.all([oneRun(), oneRun(), oneRun()]);
  const completed = results.filter((result) => result.status === 'COMPLETED');
  const exhausted = results.filter((result) => result.status === 'BUDGET_EXHAUSTED');
  assert.equal(completed.length, 1, 'exactly one run may win the single budgeted step');
  assert.equal(exhausted.length, 2);
  for (const result of exhausted) {
    assert.equal(result.axis, 'steps');
    assert.equal(result.output, null);
    assert.equal(result.attested, false);
  }
  assert.equal(executorCalls, 1, 'only budgeted work may reach the executor');
  assert.deepEqual(envelope.remaining(), { steps: 0, workUnits: 2 });
});

test('concurrent executions cannot overspend the workUnits axis', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 8, maxWorkUnits: 4, wallClockMs: 60000 },
    providers: [FIXTURE_PROVIDER, { kind: 'local-deterministic', id: 'local-rule-d2' }],
  });
  let executorCalls = 0;
  const oneRun = () => envelope.execute({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 2 }, async () => {
      executorCalls += 1;
      await Promise.resolve();
      return 'ok';
    }),
  });
  const results = await Promise.all([oneRun(), oneRun(), oneRun(), oneRun()]);
  const completed = results.filter((result) => result.status === 'COMPLETED');
  const exhausted = results.filter((result) => result.status === 'BUDGET_EXHAUSTED');
  assert.equal(completed.length, 2, 'two reservations of 2 units fit the 4-unit budget');
  assert.equal(exhausted.length, 2);
  for (const result of exhausted) {
    assert.equal(result.axis, 'workUnits');
    assert.equal(result.output, null);
    assert.equal(result.attested, false);
    assert.equal(result.authority, 'NONE');
  }
  assert.equal(executorCalls, 2);
  assert.deepEqual(envelope.remaining(), { steps: 6, workUnits: 0 });
});
