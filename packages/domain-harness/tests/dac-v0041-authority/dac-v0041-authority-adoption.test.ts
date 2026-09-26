// Issue #356 / A41-002 — focused AuthorityAdoption verification (F-06 §6;
// C145–C147, C163–C165): direct-use rejection of un-adopted historic
// authority, the prospective same-class positive path with exact
// re-evaluation, and the wrapper/relabel/backdate/non-designated/
// wrong-class fail-closed matrix with the deterministic ladder precedence.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyDacV0041HistoricAuthorityArtifactUse,
  verifyDacV0041AuthorityAdoption,
} from '../../src/dac-v0041/authority/index.js';
import { adoptDacV0041RegistryReference, DAC_V0041_BASELINE } from '../../src/dac-v0041/index.js';
import {
  IDENTITY,
  PROFILE,
  SOD_PERMISSION,
  buildHistoricArtifactRef,
  buildHistoricPromotionArtifactRef,
  buildProfilelessHistoricArtifactRef,
  buildPromotionChainInput,
  buildPromotionLeafLink,
  buildRootIssuanceLink,
  buildValidAdoptionFacts,
} from './helpers.js';

test('a41-002 adoption C145: a pre-v0.0.4 authority artifact without valid designation/adoption evidence fails closed for direct use', () => {
  const result = classifyDacV0041HistoricAuthorityArtifactUse({
    artifactRef: buildHistoricPromotionArtifactRef(),
    historicChainSatisfiesV0041: false,
  });
  assert.equal(result.outcome, 'ADOPTION_REQUIRED');
});

test('a41-002 adoption: a v0.0.4 artifact whose historical chain already satisfies v0.0.4.1 needs no adoption act', () => {
  const result = classifyDacV0041HistoricAuthorityArtifactUse({
    artifactRef: buildHistoricPromotionArtifactRef(),
    historicChainSatisfiesV0041: true,
  });
  assert.equal(result.outcome, 'NO_ADOPTION_REQUIRED');
});

test('a41-002 adoption: a successor-native artifact is not historic and is not this classifier\'s gate', () => {
  const native = adoptDacV0041RegistryReference({
    role: 'promotion-decision',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity: 'artifact/native-promotion-1',
    opaque: {},
  });
  const result = classifyDacV0041HistoricAuthorityArtifactUse({
    artifactRef: native,
    historicChainSatisfiesV0041: false,
  });
  assert.equal(result.outcome, 'NOT_HISTORIC');
});

test('a41-002 adoption: a forged carrier fails closed and an undecided chain fact is malformed', () => {
  const forged = classifyDacV0041HistoricAuthorityArtifactUse({
    artifactRef: { role: 'promotion-decision' },
    historicChainSatisfiesV0041: true,
  });
  assert.equal(forged.outcome, 'FAIL_CLOSED');
  assert.equal(forged.code, 'MALFORMED_SOURCE');
  const undecided = classifyDacV0041HistoricAuthorityArtifactUse({
    artifactRef: buildHistoricPromotionArtifactRef(),
    historicChainSatisfiesV0041: 'unknown' as unknown as boolean,
  });
  assert.equal(undecided.outcome, 'FAIL_CLOSED');
  assert.equal(undecided.code, 'INVALID_FACTS');
});

test('a41-002 adoption C146/C165: a valid same-class adoption under exact current authority is ADOPTED_PROSPECTIVE', () => {
  const result = verifyDacV0041AuthorityAdoption(buildValidAdoptionFacts());
  assert.equal(result.outcome, 'ADOPTED_PROSPECTIVE');
  assert.equal(result.effectiveFrom, 60);
  assert.equal(result.newAuthoritativeIssuancePoint, 60);
});

test('a41-002 adoption C146: authority is effective only from the adoption point, never earlier', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({ effectivePoint: 65 }),
  );
  assert.equal(result.outcome, 'ADOPTED_PROSPECTIVE');
  assert.equal(result.effectiveFrom, 65);
  assert.equal(result.newAuthoritativeIssuancePoint, 60);
});

test('a41-002 adoption C147: a consumer wrapper (forged adopted-artifact carrier) fails closed', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactRef: { role: 'promotion-decision' } as never,
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'MALFORMED_SOURCE');
});

test('a41-002 adoption C145: adopting a successor-native artifact without predecessor-origin binding fails closed', () => {
  const native = adoptDacV0041RegistryReference({
    role: 'promotion-decision',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity: 'artifact/native-promotion-1',
    opaque: {},
  });
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({ adoptedArtifactRef: native }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'MALFORMED_SOURCE');
});

test('a41-002 adoption C145/C147: a claimed origin profile that is not the artifact\'s closed origin profile fails closed (no predecessor profile relabeling)', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      originDacProfileIdentity: 'dac-profile/wrong-origin',
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'MALFORMED_SOURCE');

  // Even an otherwise-real profile token from the local vocabulary cannot
  // relabel the historic artifact's exact closed origin profile.
  const relabeled = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({ originDacProfileIdentity: PROFILE.other }),
  );
  assert.equal(relabeled.outcome, 'FAIL_CLOSED');
  assert.equal(relabeled.code, 'MALFORMED_SOURCE');
});

test('a41-002 adoption C145/C147: a historic artifact closing over no origin contract-profile identity fails closed', () => {
  const profileless = buildProfilelessHistoricArtifactRef('promotion-decision');
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({ adoptedArtifactRef: profileless }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'MALFORMED_SOURCE');
});

test('a41-002 adoption precedence: the exact origin-profile binding dominates incomplete re-evaluation and a broken issuer chain', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      originDacProfileIdentity: 'dac-profile/wrong-origin',
      reEvaluation: {
        sourceAuthenticityEstablished: false,
        sourceProvenanceRecoverable: false,
        subjectExactnessEstablished: false,
        sourceCurrentnessEstablished: false,
        evidenceClosureRecoverable: false,
        classSpecificObligationsSatisfied: false,
      },
      issuerDesignationChain: buildPromotionChainInput(60, {
        links: [
          buildPromotionLeafLink({ authorityRole: 'runtime-activation' }),
          buildRootIssuanceLink(),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'MALFORMED_SOURCE');
});

test('a41-002 adoption: a missing or blank claimed origin profile is malformed facts', () => {
  for (const claimed of [undefined, '', '   '] as (string | undefined)[]) {
    const result = verifyDacV0041AuthorityAdoption(
      buildValidAdoptionFacts({
        originDacProfileIdentity: claimed as never,
      }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'INVALID_FACTS');
  }
});

test('a41-002 adoption C163: an ordinary role holder cannot adopt AuthorityDesignationRef or attestation forms', () => {
  for (const designationClass of [
    'authority-designation',
    'authority-designation-attestation',
  ]) {
    const result = verifyDacV0041AuthorityAdoption(
      buildValidAdoptionFacts({ adoptedArtifactClass: designationClass }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'NON_ADOPTABLE_CLASS');
  }
});

test('a41-002 adoption C147: Manifest, compatibility, binding, activation and verdict classes are non-adoptable', () => {
  for (const nonAdoptable of [
    'manifest',
    'compatibility-validation',
    'compatibility-result',
    'runtime-binding',
    'runtime-activation',
    'conformance-verdict',
  ]) {
    const result = verifyDacV0041AuthorityAdoption(
      buildValidAdoptionFacts({ adoptedArtifactClass: nonAdoptable }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'NON_ADOPTABLE_CLASS');
  }
});

test('a41-002 adoption: an unknown class token is non-adoptable (closed vocabulary)', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({ adoptedArtifactClass: 'promotion' }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'NON_ADOPTABLE_CLASS');
});

test('a41-002 adoption: external-authority adoption requires the not-a-designation-specialization precondition', () => {
  const chainOverride = {
    issuerDesignationChain: buildPromotionChainInput(60, {
      links: [
        buildPromotionLeafLink({ authorityRole: 'external-authority' }),
        buildRootIssuanceLink(),
      ],
    }),
  };
  const rejected = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactClass: 'external-authority',
      adoptedArtifactRef: buildHistoricArtifactRef('external-authority'),
      requiredIssuingRole: 'external-authority',
      ...chainOverride,
      classPreconditions: {},
    }),
  );
  assert.equal(rejected.outcome, 'FAIL_CLOSED');
  assert.equal(rejected.code, 'NON_ADOPTABLE_CLASS');

  const allowed = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactClass: 'external-authority',
      adoptedArtifactRef: buildHistoricArtifactRef('external-authority'),
      requiredIssuingRole: 'external-authority',
      ...chainOverride,
      classPreconditions: { notADesignationSpecialization: true },
    }),
  );
  assert.equal(allowed.outcome, 'ADOPTED_PROSPECTIVE');
});

test('a41-002 adoption: application-selection adoption requires a valid identity establishment', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactClass: 'application-selection',
      requiredIssuingRole: 'selection',
      issuerDesignationChain: buildPromotionChainInput(60, {
        links: [
          buildPromotionLeafLink({ authorityRole: 'selection' }),
          buildRootIssuanceLink(),
        ],
      }),
      classPreconditions: {},
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'CLASS_PRECONDITION_UNSATISFIED');
});

test('a41-002 adoption: application-semantic adoption requires the new establishment-record path', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactClass: 'application-semantic',
      requiredIssuingRole: 'application-identity-establishment',
      issuerDesignationChain: buildPromotionChainInput(60, {
        links: [
          buildPromotionLeafLink({
            authorityRole: 'application-identity-establishment',
          }),
          buildRootIssuanceLink(),
        ],
      }),
      classPreconditions: {},
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'CLASS_PRECONDITION_UNSATISFIED');
});

test('a41-002 adoption C146: incomplete re-evaluation evidence fails closed', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      reEvaluation: {
        sourceAuthenticityEstablished: true,
        sourceProvenanceRecoverable: true,
        subjectExactnessEstablished: true,
        sourceCurrentnessEstablished: false,
        evidenceClosureRecoverable: true,
        classSpecificObligationsSatisfied: true,
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REEVALUATION_INCOMPLETE');
});

test('a41-002 adoption C147: a non-designated issuer (invalid designation chain) fails closed carrying the chain code', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      issuerDesignationChain: buildPromotionChainInput(60, {
        links: [
          buildPromotionLeafLink({ authorityRole: 'runtime-activation' }),
          buildRootIssuanceLink(),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ADOPTION_ISSUER_CHAIN_INVALID');
  assert.equal(result.chainCode, 'ROLE_NOT_ENVELOPED');
});

test('a41-002 adoption C164: an issuer chain not current at the adoption point fails closed', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      issuanceEvidence: { point: 120, assertedBy: [IDENTITY.witness] },
      issuerDesignationChain: buildPromotionChainInput(120, {
        links: [
          buildPromotionLeafLink(),
          buildRootIssuanceLink({ declaredEffectiveEnd: 100 }),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ADOPTION_ISSUER_CHAIN_NOT_CURRENT');
});

test('a41-002 adoption C147: a different-role issuer fails closed (source ownership/labels never substitute)', () => {
  // The issuer holds a chain-current `selection` designation; adopting a
  // promotion-decision requires the exact `promotion` issuing role.
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      issuerDesignationChain: buildPromotionChainInput(60, {
        links: [
          buildPromotionLeafLink({ authorityRole: 'selection' }),
          buildRootIssuanceLink(),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'WRONG_ROLE_ISSUER');
});

test('a41-002 adoption C147: an adoption issuer that is not the chain leaf holder fails closed', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({ adoptionIssuerIdentity: IDENTITY.outsider }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ADOPTION_ISSUER_MISMATCH');
});

test('a41-002 adoption C147: out-of-scope adoption fails closed', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactRef: buildOutOfScopeHistoricArtifact(),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SCOPE_NOT_COVERED');
  // The same out-of-scope artifact without the exact predecessor-origin
  // binding fails one ladder step earlier, at source binding.
  const unbound = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactRef: adoptDacV0041RegistryReference({
        role: 'promotion-decision',
        baseline: DAC_V0041_BASELINE,
        authorityScope: 'scope/other-domain',
        primaryIdentity: 'artifact/historic-promotion-other-scope',
        opaque: {},
      }),
    }),
  );
  assert.equal(unbound.outcome, 'FAIL_CLOSED');
  assert.equal(unbound.code, 'MALFORMED_SOURCE');
});

function buildOutOfScopeHistoricArtifact() {
  return buildHistoricArtifactRef('promotion-decision', 'scope/other-domain');
}

test('a41-002 adoption C164: adopted decisions outside adopter constraints, profile or SoD permissions fail closed without normalization', () => {
  const constraintMiss = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({ subjectConstraintTokens: [] }),
  );
  assert.equal(constraintMiss.outcome, 'FAIL_CLOSED');
  assert.equal(constraintMiss.code, 'CONSTRAINT_NOT_COVERED');

  const profileMiss = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({ adoptionDacProfileIdentity: PROFILE.other }),
  );
  assert.equal(profileMiss.outcome, 'FAIL_CLOSED');
  assert.equal(profileMiss.code, 'PROFILE_NOT_COVERED');

  const sodMiss = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      sodReliedPermissions: [SOD_PERMISSION.admin],
      issuerDesignationChain: buildPromotionChainInput(60, {
        links: [
          buildPromotionLeafLink({
            sodPermissions: [SOD_PERMISSION.cohostComposer],
          }),
          buildRootIssuanceLink(),
        ],
      }),
    }),
  );
  assert.equal(sodMiss.outcome, 'FAIL_CLOSED');
  assert.equal(sodMiss.code, 'SOD_PERMISSION_NOT_PERMITTED');
});

test('a41-002 adoption C164: an in-envelope SoD permission carried by the issuer designation passes', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      sodReliedPermissions: [SOD_PERMISSION.cohostComposer],
      issuerDesignationChain: buildPromotionChainInput(60, {
        links: [
          buildPromotionLeafLink({
            sodPermissions: [SOD_PERMISSION.cohostComposer],
          }),
          buildRootIssuanceLink(),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'ADOPTED_PROSPECTIVE');
});

test('a41-002 adoption C147: backdated adoption effect fails closed', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({ effectivePoint: 50 }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'BACKDATED_ADOPTION');
});

test('a41-002 adoption C128: adoption evidence asserted solely by the adoption issuer fails closed', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      issuanceEvidence: { point: 60, assertedBy: [IDENTITY.promoter] },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'ISSUANCE_EVIDENCE_UNESTABLISHED');
});

test('a41-002 adoption precedence: malformed facts dominate a non-adoptable class', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactClass: 'authority-designation',
      requiredIssuingRole: '' as never,
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-002 adoption precedence: the non-adoptable class dominates a forged source and a broken chain', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactClass: 'authority-designation',
      adoptedArtifactRef: { role: 'authority-designation' } as never,
      issuerDesignationChain: buildPromotionChainInput(60, {
        links: [
          buildPromotionLeafLink({ authorityRole: 'runtime-activation' }),
          buildRootIssuanceLink(),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'NON_ADOPTABLE_CLASS');
});

test('a41-002 adoption precedence: a malformed source dominates incomplete re-evaluation', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      adoptedArtifactRef: { role: 'promotion-decision' } as never,
      reEvaluation: {
        sourceAuthenticityEstablished: false,
        sourceProvenanceRecoverable: false,
        subjectExactnessEstablished: false,
        sourceCurrentnessEstablished: false,
        evidenceClosureRecoverable: false,
        classSpecificObligationsSatisfied: false,
      },
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'MALFORMED_SOURCE');
});

test('a41-002 adoption precedence: incomplete re-evaluation dominates a broken issuer chain', () => {
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      reEvaluation: {
        sourceAuthenticityEstablished: true,
        sourceProvenanceRecoverable: true,
        subjectExactnessEstablished: false,
        sourceCurrentnessEstablished: true,
        evidenceClosureRecoverable: true,
        classSpecificObligationsSatisfied: true,
      },
      issuerDesignationChain: buildPromotionChainInput(60, {
        links: [
          buildPromotionLeafLink({ authorityRole: 'runtime-activation' }),
          buildRootIssuanceLink(),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REEVALUATION_INCOMPLETE');
});

test('a41-002 adoption: verification is pure and hostile inputs fail closed instead of throwing', () => {
  const first = verifyDacV0041AuthorityAdoption(buildValidAdoptionFacts());
  const second = verifyDacV0041AuthorityAdoption(buildValidAdoptionFacts());
  assert.deepEqual(first, second);
  for (const hostile of [
    null,
    undefined,
    'adoption',
    {},
  ] as unknown as Parameters<typeof verifyDacV0041AuthorityAdoption>[0][]) {
    const result = verifyDacV0041AuthorityAdoption(hostile);
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'INVALID_FACTS');
  }
});

test('a41-002 adoption: the issuer chain is evaluated at the adoption point regardless of the chain input evaluation point', () => {
  // The supplied chain input point (200) lies after the chain lapsed; the
  // adoption act (60) lies inside the validity window: the verifier MUST
  // evaluate chain-currentness at the ADOPTION point, not at the supplied
  // point, and the adoption passes.
  const result = verifyDacV0041AuthorityAdoption(
    buildValidAdoptionFacts({
      issuerDesignationChain: buildPromotionChainInput(200, {
        links: [
          buildPromotionLeafLink(),
          buildRootIssuanceLink({ declaredEffectiveEnd: 100 }),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'ADOPTED_PROSPECTIVE');
});
