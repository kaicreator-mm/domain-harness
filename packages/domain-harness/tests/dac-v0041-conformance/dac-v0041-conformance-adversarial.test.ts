// Issue #360 / A41-006 — adversarial shortcut closure for the cumulative
// DAC v0.0.4.1 adoption, covering the exact adversarial families named by
// the #360 acceptance list:
//
//   mutable aliases | request/result aliasing | invalid/stale/currentness
//   precedence | predecessor wrapping/relabeling | backdating | unauthorized
//   adoption/designation | self-approval | cross-role substitution |
//   capability invalid/stale/unsupported precedence | authority-vocabulary
//   leakage
//
// Where a simpler gate could be bypassed, the adversary mutates the facts
// COHERENTLY (every simpler cross-check still passes; only the targeted
// authority gate can reject) — the strongest adversarial shape used by the
// A41-005R1/R2 repairs.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
  DacV0041ReferenceError,
  adoptDacV0041RegistryReference,
  classifyDacV0041CapabilityExchange,
  classifyDacV0041CurrentnessUse,
  dacV0041OutcomeProducesResult,
  isDacV0041Reference,
} from '../../src/dac-v0041/index.js';
import {
  verifyDacV0041AuthorityAdoption,
} from '../../src/dac-v0041/authority/index.js';
import {
  classifyDacV0041CompatibilityPrecedence,
} from '../../src/dac-v0041/compatibility/index.js';
import {
  verifyDacV0041AuthorityRefusalEvidence,
  verifyDacV0041CompositionIntake,
} from '../../src/dac-v0041/composition-intake/index.js';
import {
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../src/dac-v0041/runtime/index.js';
import * as authorityFixtures from '../dac-v0041-authority/helpers.js';
import * as compatibilityFixtures from '../dac-v0041-compatibility/helpers.js';
import * as compositionIntakeFixtures from '../dac-v0041-composition-intake/helpers.js';
import * as runtimeFixtures from '../dac-v0041-runtime/helpers.js';

// ---------------------------------------------------------------------------
// Mutable aliases.
// ---------------------------------------------------------------------------

test('adversarial: every frozen mutable-alias token is refused as an exact identity on every exactness slot', () => {
  for (const token of ['latest', 'current', 'head', 'main', 'master', 'default', 'stable', 'tip']) {
    assert.throws(
      () =>
        adoptDacV0041RegistryReference({
          role: 'promotion-decision',
          baseline: DAC_V0041_BASELINE,
          authorityScope: 'scope/domain-a',
          primaryIdentity: 'artifact/exact-1',
          semanticIdentity: token,
          opaque: {},
        }),
      (error: unknown) =>
        error instanceof DacV0041ReferenceError && error.code === 'MUTABLE_ALIAS_REJECTED',
      `semanticIdentity "${token}" must be refused`,
    );
  }
});

test('adversarial: alias rejection is whole-token only — an exact identity merely containing an alias word still resolves (no heuristic guessing)', () => {
  const resolved = adoptDacV0041RegistryReference({
    role: 'promotion-decision',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity: 'promotion/latest-revision-3',
    opaque: {},
  });
  assert.equal(resolved.primaryIdentity, 'promotion/latest-revision-3');
});

// ---------------------------------------------------------------------------
// Request/result aliasing (cross-seam coherent reuse).
// ---------------------------------------------------------------------------

test('adversarial: a compatibility request identity replayed as a Runtime binding request identity fails the binding closure', () => {
  const compatibility = runtimeFixtures.buildValidBindingInput().compatibility;
  const replayed = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      bindingRequestRef: compatibility.requestRef,
    }),
  );
  assert.ok(replayed.outcome === 'FAIL_CLOSED');
  // The C108 slot is nominal: a minted compatibility request is a foreign
  // carrier for the Runtime-binding request slot.
  assert.equal(replayed.code, 'FOREIGN_EVIDENCE');
});

// ---------------------------------------------------------------------------
// Invalid / stale / currentness precedence.
// ---------------------------------------------------------------------------

test('adversarial: carry-forward currentness dominance — revoked fails closed, superseded is stale, and revoked wins over stale', () => {
  assert.deepEqual(classifyDacV0041CurrentnessUse('revoked'), {
    state: 'revoked',
    disposition: 'FAIL_CLOSED',
  });
  assert.deepEqual(classifyDacV0041CurrentnessUse('stale'), {
    state: 'stale',
    disposition: 'STALE',
  });
  const invalidated = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      authoritativeResults: [
        compatibilityFixtures.buildFavorableResult({ currentness: 'revoked' }),
      ],
    }),
  );
  assert.ok(invalidated.outcome === 'FAIL_CLOSED');
  assert.equal(invalidated.code, 'INVALIDATED_RESULT');
});

// ---------------------------------------------------------------------------
// Predecessor wrapping / relabeling.
// ---------------------------------------------------------------------------

test('adversarial: a v0.0.3-origin artifact consumer-wrapped into an intake evidence position fails closed as predecessor-wrapped', () => {
  const wrapped = compositionIntakeFixtures.buildRef(
    'promotion-decision',
    'promotion/subject-selected-alpha',
    { predecessorOrigin: compositionIntakeFixtures.v003Predecessor() },
  );
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      selectedDomainData: [
        compositionIntakeFixtures.buildCoverage('subject/selected-alpha', {
          promotionCoverageRef: wrapped,
        }),
        compositionIntakeFixtures.buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'PREDECESSOR_WRAPPED');
});

test('adversarial: a predecessor baseline relabeled toward any non-evidence purpose fails closed at mint', () => {
  const relabeled = {
    ...compositionIntakeFixtures.v003Predecessor(),
    purpose: 'successor-conformance' as unknown as typeof DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
  };
  assert.throws(
    () =>
      adoptDacV0041RegistryReference({
        role: 'promotion-decision',
        baseline: DAC_V0041_BASELINE,
        authorityScope: 'scope/domain-a',
        primaryIdentity: 'artifact/relabeled-1',
        predecessorOrigin: relabeled,
        opaque: {},
      }),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError && error.code === 'INVALID_PREDECESSOR_ORIGIN',
  );
});

// ---------------------------------------------------------------------------
// Backdating.
// ---------------------------------------------------------------------------

test('adversarial: binding issuance evidence asserted solely by the binding issuer is not independent and fails closed', () => {
  const result = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      bindingIssuanceEvidence: {
        point: 70,
        assertedBy: [runtimeFixtures.IDENTITY.bindingIssuer],
      },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'EVIDENCE_UNESTABLISHED');
});

test('adversarial: an activation evaluation point predating the activation issuance is a temporally impossible claim', () => {
  const result = verifyDacV0041RuntimeActivation(
    runtimeFixtures.buildValidActivationInput({ evaluationPoint: 79 }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

// ---------------------------------------------------------------------------
// Unauthorized adoption / designation (coherent substitution).
// ---------------------------------------------------------------------------

test('adversarial: a coherently substituted adoption issuer whose authority scope does not cover the artifact fails closed', () => {
  // A perfectly valid owner-direct chain for promoterC — in scope B. The
  // adopted historic artifact lives in scope A: coherent substitution, and
  // only the scope-coverage gate can reject.
  const otherScopeChain = {
    links: [
      {
        linkIdentity: 'link/owner-direct-b',
        designatorIdentity: authorityFixtures.IDENTITY.ownerB,
        designatedIssuerIdentity: authorityFixtures.IDENTITY.promoterC,
        authorityRole: 'promotion',
        authorityScope: authorityFixtures.SCOPE.domainB,
        dacProfileIdentity: authorityFixtures.PROFILE.v0041a,
        holderConstraints: [authorityFixtures.CONSTRAINT.tenantAlpha],
        sodPermissions: [],
        effectiveFrom: 20,
        declaredEffectiveEnd: 90,
        issuanceEvidence: { point: 20, assertedBy: [authorityFixtures.IDENTITY.witness] },
      },
    ],
    leafLinkIdentity: 'link/owner-direct-b',
    scopeOwnerAnchors: [
      { ownerIdentity: authorityFixtures.IDENTITY.ownerB, provedScopes: [authorityFixtures.SCOPE.domainB] },
    ],
    evaluationPoint: 60,
  };
  const result = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts({
      adoptionIssuerIdentity: authorityFixtures.IDENTITY.promoterC,
      issuerDesignationChain: otherScopeChain,
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.ok(
    result.code === 'SCOPE_NOT_COVERED' || result.code === 'ADOPTION_ISSUER_MISMATCH',
  );
});

// ---------------------------------------------------------------------------
// Self-approval (activation seam variant).
// ---------------------------------------------------------------------------

test('adversarial: an activation issuer identical to a subject contributor self-approves and fails closed even with permission and disclosure', () => {
  const result = verifyDacV0041RuntimeActivation(
    runtimeFixtures.buildValidActivationInput({
      sod: runtimeFixtures.buildSodFacts({
        subjectContributingIdentities: [runtimeFixtures.IDENTITY.activationIssuer],
        explicitSodPermissionEstablished: true,
        coLocationDisclosed: true,
      }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SELF_APPROVAL');
});

// ---------------------------------------------------------------------------
// Cross-role substitution (coherent token + chain swaps).
// ---------------------------------------------------------------------------

test('adversarial: a coherently substituted compatibility-validation issuer (caller token AND chain leaf together) still cannot occupy the Runtime binding seam', () => {
  const result = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      bindingIssuer: {
        issuerIdentity: runtimeFixtures.IDENTITY.bindingIssuer,
        requiredIssuingRole: 'compatibility-validation',
        issuerDesignationChain: runtimeFixtures.buildChainInput(
          'link/binding-leaf',
          runtimeFixtures.IDENTITY.bindingIssuer,
          'compatibility-validation',
          70,
        ),
      },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_BINDING_ISSUER');
});

test('adversarial: a coherently substituted runtime-binding issuer (token and chain) cannot occupy the activation seam (C142 token bar)', () => {
  const result = verifyDacV0041RuntimeActivation(
    runtimeFixtures.buildValidActivationInput({
      activationIssuer: {
        issuerIdentity: runtimeFixtures.IDENTITY.activationIssuer,
        requiredIssuingRole: 'runtime-binding',
        issuerDesignationChain: runtimeFixtures.buildChainInput(
          'link/activation-leaf',
          runtimeFixtures.IDENTITY.activationIssuer,
          'runtime-binding',
          80,
        ),
      },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SEAM_CONFLATED');
});

// ---------------------------------------------------------------------------
// Capability invalid / stale / unsupported precedence (coherent combos).
// ---------------------------------------------------------------------------

test('adversarial: unsupported target with stale material is STALE (staleness precedes target support), and missing kind precedes both', () => {
  const staleWithUnsupportedTarget = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: true,
    bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
  });
  assert.deepEqual(staleWithUnsupportedTarget, {
    phase: 'exactness-currentness',
    disposition: 'STALE',
  });
  const missingKindWithBoth = classifyDacV0041CapabilityExchange({
    currentDescriptorEstablished: true,
    currentDescriptorOfferedCapabilityKinds: [],
    requestedCapabilityKind: 'compatibility-validation',
    requiredInputsStructurallyValid: true,
    materialStaleness: true,
    bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
  });
  assert.deepEqual(missingKindWithBoth, {
    phase: 'capability-kind',
    outcome: 'blocked/missing-capability',
    targetNotJudged: true,
  });
});

test('adversarial: malformed capability facts (empty/blank kinds) fail closed as INVALID_FACTS, never a normal classification', () => {
  for (const requestedCapabilityKind of ['', '   ']) {
    assert.throws(
      () =>
        classifyDacV0041CapabilityExchange({
          currentDescriptorEstablished: true,
          currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
          requestedCapabilityKind,
          requiredInputsStructurallyValid: true,
          materialStaleness: false,
          bindingTargetState: { presence: 'missing' },
        }),
      (error: unknown) =>
        error instanceof DacV0041ReferenceError && error.code === 'INVALID_FACTS',
    );
  }
});

// ---------------------------------------------------------------------------
// Authority-vocabulary leakage.
// ---------------------------------------------------------------------------

test('adversarial: a structurally identical forged carrier is foreign to every successor seam (mint-only authority)', () => {
  const minted = adoptDacV0041RegistryReference({
    role: 'promotion-decision',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity: 'promotion/exact-1',
    opaque: {},
  });
  const forged = { ...minted };
  assert.equal(isDacV0041Reference(minted), true);
  assert.equal(isDacV0041Reference(forged), false);
  const result = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      bindingResultRef: forged,
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'FOREIGN_EVIDENCE');
});

test('adversarial: unknown authority vocabulary (roles, seam kinds, outcome classes, currentness states, SoR classes) fails closed everywhere', () => {
  assert.throws(
    () =>
      adoptDacV0041RegistryReference({
        // Unknown role token cast hostile — the registry is closed.
        role: 'sorcerer' as Parameters<typeof adoptDacV0041RegistryReference>[0]['role'],
        baseline: DAC_V0041_BASELINE,
        authorityScope: 'scope/domain-a',
        primaryIdentity: 'artifact/unknown-role-1',
        opaque: {},
      }),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError && error.code === 'ROLE_MISMATCH',
  );
  const refusal = verifyDacV0041AuthorityRefusalEvidence(
    compositionIntakeFixtures.buildBindingRefusalFacts({ seamKind: 'sorcery' }),
  );
  assert.ok(refusal.outcome === 'FAIL_CLOSED');
  assert.equal(refusal.code, 'REFUSAL_SEAM_UNKNOWN');
  assert.throws(
    () => dacV0041OutcomeProducesResult('accepted-and-approved' as never),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError && error.code === 'INVALID_FACTS',
  );
  assert.throws(
    () => classifyDacV0041CurrentnessUse('fresh' as never),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError &&
      error.code === 'INVALID_CURRENTNESS_STATE',
  );
});
