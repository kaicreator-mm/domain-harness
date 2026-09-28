// Issue #399 / A41-006R1 — root-suite anchor for the cumulative DAC v0.0.4 +
// v0.0.4.1 conformance closure. The exhaustive per-row C78–C172 / F-01..F-08
// executable mapping, the connected brownfield boundary journey, adversarial
// closure and NOT_OWNED boundary suites live in the package conformance area.
// This root file binds the closure into the deterministic root corpus with:
//
//   1. the exact successor baseline pin and evidence-only predecessors;
//   2. the SAME shared brownfield journey used by package conformance:
//      historic use -> adoption -> exact successor transition -> intake ->
//      compatibility -> Runtime binding -> Runtime activation -> consequence;
//   3. structural authority ceilings at the resulting boundary decisions.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
} from '../../packages/domain-harness/src/dac-v0041/index.js';
import { DAC_V003_BASELINE } from '../../packages/domain-harness/src/dac-v003/index.js';
import { runDacV0041BrownfieldConnectedJourney } from '../../packages/domain-harness/tests/dac-v0041-conformance/brownfield-connected-journey.js';

test('dac-v0041 cumulative closure: the successor baseline pin is exact and the predecessors stay evidence-only', () => {
  assert.equal(DAC_V0041_BASELINE.version, 'v0.0.4.1');
  assert.equal(
    DAC_V0041_BASELINE.semanticFreezeCommit,
    '75fee75b782ac229720dccd18d2a4ca54b285e51',
  );
  assert.equal(
    DAC_V0041_BASELINE.semanticFreezeTree,
    'c74cf5e3a0e6745da3eda6999836b61ee8103c60',
  );
  assert.equal(DAC_V003_BASELINE.version, 'v0.0.3');
  assert.notEqual(
    DAC_V003_BASELINE.semanticFreezeCommit,
    DAC_V0041_BASELINE.semanticFreezeCommit,
  );
  const versions = DAC_V0041_PREDECESSOR_BASELINES.map((baseline) => baseline.version);
  assert.deepEqual([...versions].sort(), ['v0.0.3', 'v0.0.4']);
  for (const baseline of DAC_V0041_PREDECESSOR_BASELINES) {
    assert.equal(baseline.purpose, DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE);
  }
});

test('dac-v0041 cumulative closure: the connected brownfield successor chain verifies end to end from adoption through consequence', () => {
  const journey = runDacV0041BrownfieldConnectedJourney();
  assert.equal(journey.outcome, 'PASS');
  if (journey.outcome !== 'PASS') {
    assert.fail(`root brownfield journey failed at ${journey.stage}: ${journey.code}`);
  }

  assert.equal(journey.historicUse.outcome, 'ADOPTION_REQUIRED');
  assert.equal(journey.adoption.outcome, 'ADOPTED_PROSPECTIVE');
  assert.equal(
    journey.successorPromotion.primaryIdentity,
    journey.historicArtifact.primaryIdentity,
  );
  assert.equal(
    journey.successorPromotion.authorityScope,
    journey.historicArtifact.authorityScope,
  );
  assert.equal(journey.successorPromotion.predecessorOrigin, undefined);

  const adoptedCoverage = journey.bindingInput.compositionIntake.selectedDomainData[0];
  assert.ok(adoptedCoverage !== undefined);
  assert.equal(adoptedCoverage.promotionCoverageRef, journey.successorPromotion);
  assert.equal(journey.intake.outcome, 'INTAKE_VERIFIED');
  assert.equal(journey.association.outcome, 'VALID_TWO_VIEW');
  assert.equal(journey.compatibilityVerdict.outcome, 'COMPATIBLE_VERDICT');
  assert.equal(journey.binding.outcome, 'BINDING_VERIFIED');
  assert.equal(journey.activation.outcome, 'ACTIVATION_VERIFIED');
  assert.equal(journey.runtimeConsequence.outcome, 'RUNTIME_STATE_NOT_SOR_TRUTH');
  assert.equal(journey.externalConsequence.outcome, 'EXTERNAL_SOR_EVIDENCE_ONLY');
});

test('dac-v0041 cumulative closure: authority ceilings hold at the connected boundary results', () => {
  const journey = runDacV0041BrownfieldConnectedJourney();
  assert.equal(journey.outcome, 'PASS');
  if (journey.outcome !== 'PASS') {
    assert.fail(`root authority-ceiling journey failed at ${journey.stage}: ${journey.code}`);
  }

  assert.equal(journey.compatibilityVerdict.boundedToCompatibility, true);
  assert.equal(journey.compatibilityVerdict.impliesApplicationSelection, false);
  assert.equal(journey.compatibilityVerdict.impliesRuntimeBinding, false);
  assert.equal(journey.compatibilityVerdict.impliesRuntimeActivation, false);

  assert.equal(journey.binding.impliesRuntimeActivation, false);
  assert.equal(journey.binding.impliesApplicationSelection, false);
  assert.equal(journey.binding.isExternalBusinessSorTruth, false);

  assert.equal(journey.activation.manufacturesUpstreamAuthority, false);
  assert.equal(journey.activation.isExternalBusinessSorTruth, false);

  assert.equal(journey.runtimeConsequence.outcome, 'RUNTIME_STATE_NOT_SOR_TRUTH');
  assert.equal(journey.runtimeConsequence.canManufactureBusinessSorTruth, false);
});
