import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoundedEnvelope } from '../src/bounded/envelope.ts';
import type { BoundedTraceEvent } from '../src/bounded/envelope.ts';

const FIXTURE_PROVIDER = { kind: 'fixture' as const, id: 'fixture-d2' };

test('budget-enveloped execution completes, settles every step, and labels the fixture provider', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 3, maxWorkUnits: 10, wallClockMs: 1000 },
    providers: [FIXTURE_PROVIDER],
  });
  const outcome = await envelope.execute({
    providerKind: 'fixture',
    run: async (ctx) => {
      const alpha = await ctx.step({ workUnits: 1 }, async () => 'alpha');
      const beta = await ctx.step({ workUnits: 2 }, () => 'beta');
      return { parts: [alpha, beta] };
    },
  });
  assert.equal(outcome.status, 'COMPLETED');
  assert.deepEqual(outcome.output, { parts: ['alpha', 'beta'] });
  assert.equal(outcome.disposition, 'OBSERVED');
  assert.equal(outcome.authority, 'NONE');
  assert.equal(outcome.attested, false);
  assert.equal(outcome.qualified, false);
  assert.equal(outcome.effectDispatched, false);
  assert.deepEqual(outcome.provider, { kind: 'fixture', id: 'fixture-d2', attested: false, verified: false });
  assert.deepEqual(outcome.remaining, { steps: 1, workUnits: 7 });
  assert.deepEqual(outcome.trace.map((event) => event.type), [
    'provider-admitted', 'run-started',
    'budget-reserved', 'budget-settled',
    'budget-reserved', 'budget-settled',
    'run-completed',
  ]);
  const settled = outcome.trace.filter((event) => event.type === 'budget-settled');
  assert.equal(settled.length, 2);
  for (const event of settled) {
    assert.equal((event as { status: string }).status, 'completed');
  }
});

test('local-deterministic providerKind is admitted and accounted on the shared ledger', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 2, maxWorkUnits: 5, wallClockMs: 1000 },
    providers: [FIXTURE_PROVIDER, { kind: 'local-deterministic', id: 'local-rule-d2' }],
  });
  assert.deepEqual(envelope.budget, { maxSteps: 2, maxWorkUnits: 5, wallClockMs: 1000 });
  assert.deepEqual(envelope.providerKinds, ['fixture', 'local-deterministic']);
  assert.deepEqual(envelope.remaining(), { steps: 2, workUnits: 5 });
  const outcome = await envelope.execute({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 5 }, async () => ({ ruling: 'deterministic' })),
  });
  assert.equal(outcome.status, 'COMPLETED');
  assert.equal(outcome.provider?.kind, 'local-deterministic');
  assert.equal(outcome.provider?.attested, false);
  assert.equal(outcome.provider?.verified, false);
  assert.deepEqual(outcome.remaining, { steps: 1, workUnits: 0 });
});

test('a caught step failure is settled as failed and the executor may still complete honestly', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 4, maxWorkUnits: 10, wallClockMs: 1000 },
    providers: [FIXTURE_PROVIDER],
  });
  const outcome = await envelope.execute({
    providerKind: 'fixture',
    run: async (ctx) => {
      const log: string[] = [];
      try {
        await ctx.step({ workUnits: 1 }, async () => { throw new Error('step exploded'); });
      } catch {
        log.push('caught');
      }
      const ok = await ctx.step({ workUnits: 1 }, () => 'done');
      return { log, ok };
    },
  });
  assert.equal(outcome.status, 'COMPLETED');
  assert.deepEqual(outcome.output, { log: ['caught'], ok: 'done' });
  const statuses = outcome.trace
    .filter((event): event is Extract<BoundedTraceEvent, { type: 'budget-settled' }> => event.type === 'budget-settled')
    .map((event) => event.status);
  assert.deepEqual(statuses, ['failed', 'completed']);
  assert.deepEqual(outcome.remaining, { steps: 2, workUnits: 8 });
  for (const event of outcome.trace) {
    assert.equal(event.attested, false, 'every bounded trace event is an unattested observation');
    assert.equal(event.authority, 'NONE', 'bounded trace never carries authority');
    assert.equal(typeof event.at, 'number');
  }
});
