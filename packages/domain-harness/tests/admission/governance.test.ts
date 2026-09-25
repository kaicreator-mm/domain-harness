import assert from 'node:assert/strict';
import test from 'node:test';
import { CentralAdmissionError, admitCentralDecision } from '../../src/admission/index.js';
import {
  GovernanceExecutionBindingError,
  createGovernanceBaselineBody,
} from '../../src/governance/index.js';
import {
  SpiedBaselineStore,
  admissionFixture,
  isAdmissionError,
  makeRequest,
  quoteDecision,
  quoteEvent,
  resolvedFrom,
  sha256,
} from './helpers.js';

test('admission V1: the pinned baseline survives active-baseline movement (no floating lookup)', async () => {
  const spied = new SpiedBaselineStore();
  const fixture = await admissionFixture({ baselines: spied });
  // B1 pins inv:cap-100; the store also holds a moved, lenient B2 (no invariants).
  const outcome = await admitCentralDecision(
    makeRequest({
      event: quoteEvent(500),
      resolved: resolvedFrom('harness-machine', quoteDecision(500)),
    }),
    fixture.ports,
  );
  assert.equal(outcome.status, 'denied');
  if (outcome.status !== 'denied') return;
  assert.equal(outcome.denial.reason, 'hard-invariant');
  assert.equal(outcome.denial.invariantId, 'inv:cap-100');
  assert.equal(
    outcome.denial.governanceBindingDigest,
    fixture.pin.bindingDigest,
    'denial evidence names the exact pin authority actually used',
  );
  assert.ok(spied.getBodyCalls.length > 0);
  assert.ok(
    spied.getBodyCalls.every((identity) => identity.contentDigest === fixture.b1.identity.contentDigest),
    'every baseline read targeted the pinned B1 identity; B2 was never consulted',
  );
  assert.equal(fixture.tools.calls.length, 0);
});

test('admission V2: a missing pinned baseline body fails closed with no substitution', async () => {
  const fixture = await admissionFixture({ registerB1: false });
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_PINNED_BASELINE_UNAVAILABLE'),
  );
  assert.equal(fixture.tools.calls.length, 0);
});

test('admission V2: a corrupt pinned baseline body fails closed', async () => {
  const fixture = await admissionFixture({ registerB1: false });
  // Tamper: the stored semantics no longer match the pinned identity digest
  // (the pin commits to the CAP_INVARIANT semantics, the store serves empty ones).
  await fixture.baselines.putBody({
    identity: fixture.b1.identity,
    semantics: { hardInvariants: [] },
  });
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_PINNED_BASELINE_UNAVAILABLE'),
  );
});

test('admission V2: a baseline body whose identity differs from the pin fails closed', async () => {
  const spied = new SpiedBaselineStore();
  const fixture = await admissionFixture({ baselines: spied });
  spied.fixedBody = fixture.b2;
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_PINNED_BASELINE_UNAVAILABLE'),
  );
});

test('admission: a missing durable GovernanceExecutionPin fails closed before any evaluation', async () => {
  const fixture = await admissionFixture({ pinInstance: false });
  let schemaEvaluated = false;
  await assert.rejects(
    () => admitCentralDecision(
      makeRequest({
        decisionSchema: {
          isValid: (value) => {
            schemaEvaluated = true;
            return typeof value === 'object';
          },
        },
      }),
      fixture.ports,
    ),
    (error: unknown) => error instanceof GovernanceExecutionBindingError
      && error.code === 'GOVERNANCE_EXECUTION_PIN_MISSING',
  );
  assert.equal(schemaEvaluated, false, 'the pin gate runs before any schema/predicate work');
  assert.equal(fixture.tools.calls.length, 0);
});

test('admission: malformed Hard Invariant content in the pinned baseline fails closed', async () => {
  const fixture = await admissionFixture({ b1Invariants: [{ id: 'not-a-predicate' }] });
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => isAdmissionError(error, 'ADMISSION_INVALID_HARD_INVARIANTS'),
  );
});

test('admission: non-array hardInvariants content fails closed', async () => {
  const skewed = await createGovernanceBaselineBody({
    domainId: 'orders',
    governanceId: 'orders-governance',
    schemaVersion: '1',
    version: 'B1',
    semantics: { hardInvariants: 'not-an-array' },
  }, sha256);
  const fixture = await admissionFixture({ b1Override: skewed });
  await assert.rejects(
    () => admitCentralDecision(makeRequest(), fixture.ports),
    (error: unknown) => error instanceof CentralAdmissionError
      && error.code === 'ADMISSION_INVALID_HARD_INVARIANTS',
  );
});
