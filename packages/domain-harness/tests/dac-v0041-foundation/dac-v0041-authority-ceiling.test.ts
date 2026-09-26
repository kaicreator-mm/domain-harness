// Issue #355 / A41-001 — authority ceiling. The successor foundation owns
// NO issuance/verification authority beyond its declared foundation
// contracts: no AuthorityDesignation/AuthorityAdoption issuance (A41-002),
// no compatibility evaluation (A41-003), no composition-intake/selection/
// Manifest verification (A41-004), no Runtime binding/activation behavior
// (A41-005), no promotion/ApplicationSelection/conformance authority. The
// module's runtime surface is frozen to exactly the foundation inventory,
// every adopting/minting/verifying function is enumerated, and cross-adapter
// forgery (v0.0.2/v0.0.3 carriers) fails closed in both directions.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as foundation from '../../src/dac-v0041/index.js';
import {
  DAC_V0041_BASELINE,
  DAC_V0041_FOUNDATION_REQUEST_ROLES,
  DAC_V0041_ROLE_REGISTRY,
  DacV0041ReferenceError,
  adoptDacV0041RegistryReference,
  isDacV0041Reference,
  mintCompatibilityValidationRequestRef,
} from '../../src/dac-v0041/index.js';
import {
  DAC_V003_BASELINE,
  isDacV003Reference,
  adoptDacV003RegistryReference as adoptV003RegistryReference,
} from '../../src/dac-v003/index.js';
import {
  DAC_REFERENCE_BASELINE,
  adoptApplicationSelectionRef as adoptV002ApplicationSelection,
  isDacReference,
} from '../../src/dac/index.js';
import * as root from '../../src/index.js';
import * as publicV4 from '../../src/public-v4/index.js';

test('a41-001 ceiling: the foundation runtime surface is exactly the declared inventory', () => {
  assert.deepEqual(Object.keys(foundation).sort(), [
    'DAC_V0041_BASELINE',
    'DAC_V0041_CAPABILITY_EXCHANGE_PHASES',
    'DAC_V0041_CAPABILITY_OUTCOME_CLASSES',
    'DAC_V0041_CAPABILITY_OUTCOME_PRODUCES_RESULT',
    'DAC_V0041_CURRENTNESS_USE_STATES',
    'DAC_V0041_FOUNDATION_REQUEST_ROLES',
    'DAC_V0041_PREDECESSOR_BASELINES',
    'DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE',
    'DAC_V0041_REFERENCE_ADAPTER_VERSION',
    'DAC_V0041_REFERENCE_DISPOSITIONS',
    'DAC_V0041_REQUEST_RESULT_ALIAS_CHAINS',
    'DAC_V0041_ROLE_REGISTRY',
    'DacV0041ReferenceError',
    'adoptDacV0041RegistryReference',
    'classifyDacV0041CapabilityExchange',
    'classifyDacV0041CurrentnessUse',
    'dacV0041OutcomeProducesResult',
    'isCompatibilityValidationRequestRef',
    'isDacV0041Reference',
    'isRuntimeBindingRequestRef',
    'mintCompatibilityValidationRequestRef',
    'mintRuntimeBindingRequestRef',
    'verifyDacV0041RequestResultSeparation',
  ]);
});

test('a41-001 ceiling: no designation/adoption/binding/activation/selection/promotion/Manifest issuance or verification function exists', () => {
  // Precise authority-verb patterns. The generic "adopt"/"mint"/"validate"
  // vocabulary itself is the historical identity-adoption pattern and stays
  // legal; what must not exist is any function that ISSUES, GRANTS,
  // REVOKES, BINDS, ACTIVATES, SELECTS, PROMOTES, EVALUATES compatibility or
  // VERIFIES designation/adoption authority.
  const surface = Object.keys(foundation).join(' ');
  for (const forbiddenPattern of [
    /issu/iu,
    /grant/iu,
    /approv/iu,
    /revoke/iu,
    /void/iu,
    /promot/iu,
    /select/iu,
    /manifest/iu,
    /conformance/iu,
    /designation/iu,
    /adoption/iu,
    /activat/iu,
    /bindComposition/iu,
    /bindValidated/iu,
    /validateCompatibility/iu,
    /compatibilityDecision/iu,
    /verifyAuthority/iu,
    /verifyDesignation/iu,
    /verifyAdoption/iu,
  ]) {
    assert.equal(
      forbiddenPattern.test(surface),
      false,
      `foundation surface must not expose authority named /${forbiddenPattern.source}/`,
    );
  }
});

test('a41-001 ceiling: only the two foundation request roles are mintable as nominal requests', () => {
  assert.deepEqual([...DAC_V0041_FOUNDATION_REQUEST_ROLES], [
    'compatibility-validation-request',
    'runtime-binding-request',
  ]);
  // A registry reference for a request-role NAME is vocabulary adoption
  // only: it is not one of the nominal minted request surfaces.
  const named = adoptDacV0041RegistryReference({
    baseline: { ...DAC_V0041_BASELINE },
    role: 'runtime-activation-request',
    authorityScope: 'domain-harness://successor/ceiling-check',
    primaryIdentity: 'ceiling-activation-request-1',
  });
  assert.ok(isDacV0041Reference(named));
  assert.equal(named.role, 'runtime-activation-request');
});

test('a41-001 ceiling: registry adoption of authority roles records identity only and mints no authority', () => {
  for (const authorityRole of [
    'authority-designation',
    'authority-adoption',
    'runtime-binding',
    'runtime-activation',
    'compatibility-validation',
    'compatibility-result',
    'promotion-decision',
    'application-selection',
    'manifest',
    'conformance-verdict',
  ] as const) {
    const reference = adoptDacV0041RegistryReference({
      baseline: { ...DAC_V0041_BASELINE },
      role: authorityRole,
      authorityScope: 'domain-harness://successor/ceiling-check',
      primaryIdentity: `ceiling-${authorityRole}-1`,
    });
    assert.ok(isDacV0041Reference(reference), `${authorityRole} adopts as identity-only vocabulary`);
    // Identity-only: no request slots, no decision slots — an adopted
    // authority-role reference is a record that the identity exists, never
    // evidence that the authority was issued, verified or is current.
    const keys = Object.keys(reference);
    for (const slot of [
      'requesterIdentity',
      'requestedCapabilityKind',
      'decision',
      'validity',
      'currentness',
    ]) {
      assert.equal(keys.includes(slot), false, `${authorityRole} must not carry "${slot}"`);
    }
  }
});

test('a41-001 ceiling: the successor role registry contains the v0.0.4.1 additive vocabulary', () => {
  const registry = [...DAC_V0041_ROLE_REGISTRY];
  for (const successorRole of [
    'authority-designation-request',
    'domain-authoring-request',
    'domain-authoring-result',
    'application-identity-establishment-request',
    'application-identity-establishment',
    'promotion-request',
    'application-selection-request',
    'manifest-issuance-request',
    'compatibility-validation-request',
    'runtime-binding-request',
    'runtime-activation-request',
    'conformance-request',
    'authority-designation',
    'conformance-verdict',
    'provider-capability-descriptor',
    'domain-application-assembly-plan',
    'authority-refusal',
    'authority-adoption',
  ]) {
    assert.ok(registry.includes(successorRole), `registry must contain ${successorRole}`);
  }
  // Closed vocabulary: unknown roles fail closed.
  let caught: unknown;
  try {
    adoptDacV0041RegistryReference({
      baseline: { ...DAC_V0041_BASELINE },
      role: 'galactic-overlord' as never,
      authorityScope: 'domain-harness://successor/ceiling-check',
      primaryIdentity: 'ceiling-unknown-role-1',
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV0041ReferenceError);
  assert.equal((caught as DacV0041ReferenceError).code, 'ROLE_MISMATCH');
});

test('a41-001 ceiling: cross-adapter carriers fail closed in both directions', () => {
  // A v0.0.3 adopted reference is not a v0.0.4.1 reference…
  const v003Ref = adoptV003RegistryReference('compatibility-validation', {
    baseline: { ...DAC_V003_BASELINE },
    authorityScope: 'domain-harness://historical-check',
    primaryIdentity: 'v003-carrier-1',
  });
  assert.equal(isDacV0041Reference(v003Ref), false);
  let caught: unknown;
  try {
    mintCompatibilityValidationRequestRef({
      baseline: { ...DAC_V0041_BASELINE },
      authorityScope: 'domain-harness://successor/ceiling-check',
      primaryIdentity: 'ceiling-request-1',
      requesterIdentity: 'requester-1',
      providerIdentity: 'provider-1',
      requestedCapabilityKind: 'domain-harness.compatibility-validation/1',
      materialInputRefs: [v003Ref as never],
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV0041ReferenceError);
  assert.equal((caught as DacV0041ReferenceError).code, 'INVALID_REFERENCE');

  // …and a v0.0.4.1 minted request is neither a v0.0.3 nor a v0.0.2
  // reference: historical guards stay closed to successor carriers, so
  // neither adapter's evidence can be relabeled through the other.
  const v0041Request = mintCompatibilityValidationRequestRef({
    baseline: { ...DAC_V0041_BASELINE },
    authorityScope: 'domain-harness://successor/ceiling-check',
    primaryIdentity: 'ceiling-request-2',
    requesterIdentity: 'requester-1',
    providerIdentity: 'provider-1',
    requestedCapabilityKind: 'domain-harness.compatibility-validation/1',
  });
  assert.equal(isDacV003Reference(v0041Request), false);
  assert.equal(isDacReference(v0041Request), false);
  assert.notEqual(
    (v0041Request as { adapter?: string }).adapter,
    'dac-v003-reference-adapter/1',
    'successor carrier is never tagged as v0.0.3',
  );

  // The same separation holds for the v0.0.2 adapter.
  const v002Ref = adoptV002ApplicationSelection({
    baseline: { ...DAC_REFERENCE_BASELINE },
    authorityScope: 'domain-harness://historical-check',
    semanticIdentity: 'v002-carrier-semantic-1',
  });
  assert.equal(isDacV0041Reference(v002Ref), false);
  assert.equal(isDacV003Reference(v002Ref), false);
});

test('a41-001 ceiling: the foundation reaches the package root and ./v4 public surface additively', () => {
  for (const name of [
    'DAC_V0041_BASELINE',
    'DAC_V0041_PREDECESSOR_BASELINES',
    'DacV0041ReferenceError',
    'mintCompatibilityValidationRequestRef',
    'mintRuntimeBindingRequestRef',
    'verifyDacV0041RequestResultSeparation',
    'classifyDacV0041CapabilityExchange',
    'classifyDacV0041CurrentnessUse',
    'dacV0041OutcomeProducesResult',
  ]) {
    assert.ok(name in publicV4, `./v4 surface missing ${name}`);
    assert.ok(name in root, `package root surface missing ${name}`);
  }
  // Historical v0.0.3 surface remains reachable and version-bound next to
  // the successor surface (additive, not replacing).
  assert.ok('DAC_V003_BASELINE' in root, 'historical v0.0.3 surface still exported');
  assert.equal(
    root.DAC_V003_BASELINE.semanticFreezeCommit,
    '3322b2152253b3c60f254c23a4f9ab1a14e063d1',
  );
});
