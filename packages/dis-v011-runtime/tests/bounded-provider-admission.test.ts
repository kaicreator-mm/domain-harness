import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoundedEnvelope } from '../src/bounded/envelope.ts';
import type { BoundedClock, BoundedProviderDescriptor } from '../src/bounded/envelope.ts';

const OK_BUDGET = { maxSteps: 2, maxWorkUnits: 4, wallClockMs: 60000 };
const FIXTURE_PROVIDER = { kind: 'fixture' as const, id: 'fixture-d2' };
const hasCode = (code: string) => (error: unknown) => (error as { code?: string })?.code === code;

test('unregistered providerKind is rejected before execution without budget spend', async () => {
  const envelope = createBoundedEnvelope({ budget: OK_BUDGET, providers: [FIXTURE_PROVIDER] });
  let executorCalls = 0;
  const outcome = await envelope.execute({
    providerKind: 'browser-agent',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () => { executorCalls += 1; return 'never'; }),
  });
  assert.equal(outcome.status, 'PROVIDER_REJECTED');
  assert.equal(outcome.code, 'PROVIDER_KIND_UNREGISTERED');
  assert.equal(outcome.providerKind, 'browser-agent');
  assert.equal(outcome.output, null);
  assert.equal(outcome.attested, false);
  assert.equal(outcome.authority, 'NONE');
  assert.equal(outcome.disposition, 'UNKNOWN');
  assert.equal(executorCalls, 0, 'executor must never start for an unregistered kind');
  assert.deepEqual(envelope.remaining(), { steps: 2, workUnits: 4 }, 'rejection must not consume budget');
  assert.deepEqual(outcome.trace.map((event) => event.type), ['provider-rejected']);
  assert.equal(outcome.trace.some((event) => event.type === 'budget-reserved'), false);
});

test('llm and harness impersonation is rejected as forbidden, not merely unregistered', async () => {
  const envelope = createBoundedEnvelope({ budget: OK_BUDGET, providers: [FIXTURE_PROVIDER] });
  let executorCalls = 0;
  for (const impersonated of ['llm', 'harness']) {
    const outcome = await envelope.execute({
      providerKind: impersonated,
      run: (ctx) => ctx.step({ workUnits: 1 }, async () => { executorCalls += 1; return 'never'; }),
    });
    assert.equal(outcome.status, 'PROVIDER_REJECTED', impersonated);
    assert.equal(outcome.code, 'PROVIDER_KIND_FORBIDDEN', impersonated);
    assert.equal(outcome.providerKind, impersonated);
    assert.equal(outcome.output, null, impersonated);
    assert.equal(outcome.attested, false, impersonated);
    assert.equal(outcome.authority, 'NONE', impersonated);
  }
  assert.equal(executorCalls, 0, 'no impersonated kind may reach the executor');
  assert.deepEqual(envelope.remaining(), { steps: 2, workUnits: 4 }, 'no budget may be consumed by impersonation attempts');
});

test('registry validation rejects reserved kinds, unknown kinds, duplicates, bad budgets and bad clocks', () => {
  assert.throws(
    () => createBoundedEnvelope({
      budget: OK_BUDGET,
      providers: [{ kind: 'llm', id: 'fake-model' } as unknown as BoundedProviderDescriptor],
    }),
    hasCode('PROVIDER_KIND_FORBIDDEN'),
    'registering llm impersonates an authority this envelope cannot hold',
  );
  assert.throws(
    () => createBoundedEnvelope({
      budget: OK_BUDGET,
      providers: [{ kind: 'psychic', id: 'nope' } as unknown as BoundedProviderDescriptor],
    }),
    hasCode('PROVIDER_KIND_UNREGISTERED'),
  );
  assert.throws(
    () => createBoundedEnvelope({
      budget: OK_BUDGET,
      providers: [FIXTURE_PROVIDER, { kind: 'fixture', id: 'fixture-again' }],
    }),
    hasCode('BOUNDED_CONFIGURATION_INVALID'),
  );
  const badBudgets = [
    { maxSteps: 0, maxWorkUnits: 1, wallClockMs: 10 },
    { maxSteps: -1, maxWorkUnits: 1, wallClockMs: 10 },
    { maxSteps: 1.5, maxWorkUnits: 1, wallClockMs: 10 },
    { maxSteps: 1, maxWorkUnits: 0, wallClockMs: 10 },
    { maxSteps: 1, maxWorkUnits: Number.NaN, wallClockMs: 10 },
    { maxSteps: 1, maxWorkUnits: 1, wallClockMs: Number.POSITIVE_INFINITY },
    { maxSteps: 1, maxWorkUnits: 1 },
  ];
  for (const budget of badBudgets) {
    assert.throws(
      () => createBoundedEnvelope({ budget: budget as never, providers: [FIXTURE_PROVIDER] }),
      hasCode('BOUNDED_CONFIGURATION_INVALID'),
      JSON.stringify(budget),
    );
  }
  assert.throws(
    () => createBoundedEnvelope({
      budget: OK_BUDGET,
      providers: [FIXTURE_PROVIDER],
      clock: { now: () => 0 } as unknown as BoundedClock,
    }),
    hasCode('BOUNDED_CONFIGURATION_INVALID'),
  );
});

test('fixture provider output is never wrapped as attested or verified', async () => {
  const envelope = createBoundedEnvelope({ budget: OK_BUDGET, providers: [FIXTURE_PROVIDER] });
  const outcome = await envelope.execute({
    providerKind: 'fixture',
    run: async () => ({ value: 'fixture-result', attested: true, authority: 'KDP', verified: true }),
  });
  assert.equal(outcome.status, 'COMPLETED');
  assert.equal(outcome.attested, false, 'envelope-level attestation must stay false regardless of payload claims');
  assert.equal(outcome.authority, 'NONE', 'envelope-level authority must stay NONE regardless of payload claims');
  assert.equal(outcome.qualified, false);
  assert.equal(outcome.effectDispatched, false);
  assert.deepEqual(outcome.provider, { kind: 'fixture', id: 'fixture-d2', attested: false, verified: false });
  for (const event of outcome.trace) {
    assert.equal(event.attested, false);
    assert.equal(event.authority, 'NONE');
  }
});
