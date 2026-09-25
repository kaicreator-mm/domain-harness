// Issue #323 / DAC v0.0.3 V3-001 — reference/compatibility disposition
// vocabulary and the repaired required-target rule (CROSS_LAYER_REFERENCES
// §8/§11; conformance C43/C44): missing required target => FAIL_CLOSED,
// explicit unsupported target => INCOMPATIBLE, namespaces never conflated,
// and no path in this foundation can produce COMPATIBLE (compatibility
// evaluation authority belongs to V3-002). The withdrawn #34-base
// missing-target/unknown hybrid disposition is neither representable nor
// producible.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V003_DISPOSITION_NAMESPACE,
  DAC_V003_REFERENCE_DISPOSITIONS,
  DacV003ReferenceError,
  classifyDacV003RequiredTargetState,
  dacV003ReferenceDisposition,
  isDacV003ReferenceDisposition,
} from '../../src/dac-v003/index.js';

test('v3-001 disposition vocabulary is exactly the reference/compatibility namespace', () => {
  assert.deepEqual([...DAC_V003_REFERENCE_DISPOSITIONS], [
    'FAIL_CLOSED',
    'STALE',
    'INCOMPATIBLE',
    'REQUIRES_RECONCILIATION',
    'REQUIRES_EXPLICIT_RESELECTION',
    'COMPATIBLE',
  ]);
  for (const value of DAC_V003_REFERENCE_DISPOSITIONS) {
    const disposition = dacV003ReferenceDisposition(value);
    assert.ok(isDacV003ReferenceDisposition(disposition));
    assert.equal(disposition.namespace, DAC_V003_DISPOSITION_NAMESPACE);
    assert.ok(Object.isFrozen(disposition));
  }
});

test('v3-001 namespace anti-conflation: foreign outcome values never become reference dispositions', () => {
  // External Operation Outcome / Observation namespace (§11):
  const externalOutcomes = [
    'UNKNOWN',
    'AMBIGUOUS',
    'REQUEST_DISPATCHED',
    'ACCEPTED_FOR_PROCESSING',
    'AUTHORITATIVE_COMMITTED',
    'RECONCILED_COMMITTED',
    'TERMINAL_ABANDONMENT',
  ];
  // Authoring / Capability Exchange Outcome namespace (§11):
  const authoringOutcomes = [
    'accepted-for-evaluation',
    'produced-result',
    'blocked-missing-capability',
    'unknown-ambiguous-production',
  ];
  for (const foreign of [...externalOutcomes, ...authoringOutcomes]) {
    let caught: unknown;
    try {
      dacV003ReferenceDisposition(foreign as never);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof DacV003ReferenceError, `${foreign}: rejected`);
    assert.equal((caught as DacV003ReferenceError).code, 'INVALID_DISPOSITION');
    assert.equal(isDacV003ReferenceDisposition({ value: foreign }), false);
    assert.equal(
      isDacV003ReferenceDisposition({ namespace: 'external-operation-outcome', value: 'STALE' }),
      false,
      'external-operation namespace carrying STALE is not a reference disposition',
    );
  }
  // A bare string can never smuggle itself in as a disposition.
  assert.equal(isDacV003ReferenceDisposition('FAIL_CLOSED'), false);
});

test('v3-001 repaired target-state rule: missing => FAIL_CLOSED, explicit unsupported => INCOMPATIBLE', () => {
  const missing = classifyDacV003RequiredTargetState({ presence: 'missing' });
  assert.equal(missing.value, 'FAIL_CLOSED');
  assert.equal(missing.namespace, DAC_V003_DISPOSITION_NAMESPACE);
  const unsupported = classifyDacV003RequiredTargetState({
    presence: 'explicit',
    declaredSupport: 'unsupported',
  });
  assert.equal(unsupported.value, 'INCOMPATIBLE');
  assert.equal(unsupported.namespace, DAC_V003_DISPOSITION_NAMESPACE);
  // The two dispositions stay distinct exactly as the rule requires.
  assert.notEqual(missing.value, unsupported.value);
});

test('v3-001 no hybrid missing-target disposition and no COMPATIBLE production path exists here', () => {
  // The input union has exactly two shapes; 'missing' always maps to
  // FAIL_CLOSED. The withdrawn #34-base hybrid (missing => some unknown
  // disposition) has no representation: exhaustive runtime check.
  for (const state of [
    { presence: 'missing' },
    { presence: 'explicit', declaredSupport: 'unsupported' },
  ] as const) {
    const disposition = classifyDacV003RequiredTargetState(state);
    assert.ok(
      disposition.value === 'FAIL_CLOSED' || disposition.value === 'INCOMPATIBLE',
      'target-state classification can only produce the two repaired dispositions',
    );
  }
  // COMPATIBLE is vocabulary only: the required-target classifier can never
  // emit it (support of an explicit target is V3-002 evaluation authority).
  // Pin the invariant both ways over the whole legal input space.
  const classified = new Set([
    classifyDacV003RequiredTargetState({ presence: 'missing' }).value,
    classifyDacV003RequiredTargetState({
      presence: 'explicit',
      declaredSupport: 'unsupported',
    }).value,
  ]);
  assert.equal(classified.has('COMPATIBLE'), false);
  assert.equal(classified.has('STALE'), false);
  assert.equal(classified.size, 2);
});
