// Issue #359 / A41-005 — Runtime activation verifier suite (ASSEMBLY_
// LIFECYCLE §13): binding != activation (C142/§16 seam separation,
// C155 anti-alias, exact request/binding/composition association), the
// full binding-bundle re-verification gate (activation manufactures no
// missing upstream authority), C100/C113 activation-issuer designation,
// C128 evidence, F-07 SoD, and §8.2 binding-reuse currentness at the
// activation point, plus the §16 same-identity/different-role positive.
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041RuntimeActivation } from '../../src/dac-v0041/runtime/index.js';
import {
  buildChainInput,
  buildRef,
  buildSodFacts,
  buildValidActivationInput,
  buildValidBindingInput,
  buildValidIntakeInput,
  IDENTITY,
  ROLE,
} from './helpers.js';

test('a41-005 activation: the canonical path verifies (ACTIVATION_VERIFIED) with bounded markers', () => {
  const result = verifyDacV0041RuntimeActivation(buildValidActivationInput());
  assert.ok(result.outcome === 'ACTIVATION_VERIFIED');
  assert.equal(result.requestIdentity, 'request/activation-1');
  assert.equal(result.activationIdentity, 'activation/record-1');
  assert.equal(result.boundBindingIdentity, 'binding/record-1');
  assert.equal(result.manifestIdentity, 'manifest/record-1');
  assert.equal(result.activationIssuerIdentity, IDENTITY.activationIssuer);
  // §13/§17 structural markers: activation manufactures no upstream
  // authority and owns no external Business SoR truth.
  assert.equal(result.manufacturesUpstreamAuthority, false);
  assert.equal(result.isExternalBusinessSorTruth, false);
});

test('a41-005 activation: a foreign activation result fails closed as FOREIGN_EVIDENCE', () => {
  const input = buildValidActivationInput();
  const result = verifyDacV0041RuntimeActivation({
    ...input,
    activationResultRef: { role: 'runtime-activation', primaryIdentity: 'activation/record-1' },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'FOREIGN_EVIDENCE');
});

test('a41-005 activation: a wrong-role result carrier fails closed as ROLE_MISMATCH', () => {
  const input = buildValidActivationInput();
  const result = verifyDacV0041RuntimeActivation({
    ...input,
    activationResultRef: buildRef('runtime-binding', 'activation/record-1'),
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('a41-005 activation: C142/§16 — the activation issuer asserting the binding issuing role is a seam conflation', () => {
  const input = buildValidActivationInput();
  const result = verifyDacV0041RuntimeActivation({
    ...input,
    activationIssuer: {
      ...input.activationIssuer,
      requiredIssuingRole: ROLE.runtimeBinding,
      issuerDesignationChain: {
        ...input.activationIssuer.issuerDesignationChain,
        links: input.activationIssuer.issuerDesignationChain.links.map((link) =>
          link.linkIdentity === 'link/activation-leaf'
            ? { ...link, authorityRole: ROLE.runtimeBinding }
            : link,
        ),
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SEAM_CONFLATED');
});

test('a41-005 activation: C155 — an activation result aliasing its request fails closed', () => {
  const input = buildValidActivationInput();
  const result = verifyDacV0041RuntimeActivation({
    ...input,
    activationResultRef: buildRef('runtime-activation', 'request/activation-1'),
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_RESULT_ALIAS');
});

test('a41-005 activation: §13 — an activation identity aliasing the bound binding identity fails closed', () => {
  const input = buildValidActivationInput();
  const result = verifyDacV0041RuntimeActivation({
    ...input,
    activationResultRef: buildRef('runtime-activation', 'binding/record-1'),
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SEAM_IDENTITY_ALIAS');
});

test('a41-005 activation: the activation request identity must stay distinct from the binding request identity', () => {
  const input = buildValidActivationInput();
  const result = verifyDacV0041RuntimeActivation({
    ...input,
    activationRequestRef: buildRef('runtime-activation-request', 'request/binding-1'),
    boundRequestIdentity: 'request/binding-1',
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SEAM_IDENTITY_ALIAS');
});

test('a41-005 activation: a binding/request association mismatch fails closed', () => {
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({ boundRequestIdentity: 'request/activation-other' }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_ASSOCIATION_MISMATCH');
});

test('a41-005 activation: the activation must bind the exact binding identity', () => {
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({ boundBindingIdentity: 'binding/other-record' }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-005 activation: the activation must bind the exact composition/Manifest identity', () => {
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({ boundManifestIdentity: 'manifest/other-record' }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-005 activation: §13 — activation cannot manufacture a binding the bundle did not prove', () => {
  const brokenBinding = buildValidBindingInput();
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({
      binding: {
        ...brokenBinding,
        compatibility: {
          ...brokenBinding.compatibility,
          precedenceFacts: {
            ...brokenBinding.compatibility.precedenceFacts,
            assertedDisposition: 'INCOMPATIBLE',
          },
        },
      },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'BINDING_NOT_ESTABLISHED');
  assert.equal(result.bindingCode, 'COMPATIBILITY_NOT_ESTABLISHED');
});

test('a41-005 activation: §13 — a binding bundle whose upstream intake went stale propagates as STALE', () => {
  const staleBinding = buildValidBindingInput();
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({
      binding: {
        ...staleBinding,
        compositionIntake: buildValidIntakeInput({
          manifest: {
            ...staleBinding.compositionIntake.manifest,
            reuseCurrentness: { state: 'stale', establishedAt: 75, assertedBy: [IDENTITY.witness] },
          },
        }),
      },
    }),
  );
  assert.ok(result.outcome === 'STALE');
  assert.equal(result.code, 'BINDING_EVIDENCE_STALE');
});

test('a41-005 activation: C128 — an activation act asserted solely by its own issuer fails closed', () => {
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({
      activationIssuanceEvidence: { point: 80, assertedBy: [IDENTITY.activationIssuer] },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'EVIDENCE_UNESTABLISHED');
});

test('a41-005 activation: C100/§2.2 — designation derived from a Composer-role designator is rejected with the chain code', () => {
  const input = buildValidActivationInput();
  const links = input.activationIssuer.issuerDesignationChain.links.map((link) =>
    link.linkIdentity === 'link/activation-leaf'
      ? { ...link, designatorIdentity: IDENTITY.composer }
      : link,
  );
  const result = verifyDacV0041RuntimeActivation({
    ...input,
    activationIssuer: {
      ...input.activationIssuer,
      issuerDesignationChain: {
        ...input.activationIssuer.issuerDesignationChain,
        links,
        composerRoleIdentities: [IDENTITY.composer],
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_ACTIVATION_ISSUER');
  assert.equal(result.chainCode, 'COMPOSER_DESIGNATOR');
});

test('a41-005 activation: an activation issuer chain lapsed at the activation issuance point is STALE', () => {
  const input = buildValidActivationInput();
  const links = input.activationIssuer.issuerDesignationChain.links.map((link) =>
    link.linkIdentity === 'link/activation-leaf'
      ? { ...link, declaredEffectiveEnd: 70 }
      : link,
  );
  const result = verifyDacV0041RuntimeActivation({
    ...input,
    activationIssuer: {
      ...input.activationIssuer,
      issuerDesignationChain: {
        ...input.activationIssuer.issuerDesignationChain,
        links,
      },
    },
  });
  assert.ok(result.outcome === 'STALE');
  assert.equal(result.code, 'ISSUER_CHAIN_STALE');
});

test('a41-005 activation: §16 — one identity holding separately valid binding and activation designations verifies', () => {
  // Co-location does not collapse seams: the SAME identity exercises the
  // binding issuer role and the activation issuer role under two separate
  // leaf designations, with the distinct role tokens preserved.
  const input = buildValidActivationInput({
    activationIssuer: {
      issuerIdentity: IDENTITY.bindingIssuer,
      requiredIssuingRole: ROLE.runtimeActivation,
      issuerDesignationChain: buildChainInput(
        'link/activation-leaf',
        IDENTITY.bindingIssuer,
        ROLE.runtimeActivation,
        80,
      ),
    },
    sod: buildSodFacts({
      subjectContributingIdentities: [],
      coHostingGroups: [[IDENTITY.bindingIssuer]],
    }),
  });
  const result = verifyDacV0041RuntimeActivation(input);
  assert.ok(result.outcome === 'ACTIVATION_VERIFIED');
  assert.equal(result.activationIssuerIdentity, IDENTITY.bindingIssuer);
});

test('a41-005 activation: F-07 — self-approval by a subject-contributing activation issuer fails closed', () => {
  const input = buildValidActivationInput();
  const result = verifyDacV0041RuntimeActivation({
    ...input,
    sod: buildSodFacts({ subjectContributingIdentities: [IDENTITY.activationIssuer] }),
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SELF_APPROVAL');
});

test('a41-005 activation: §8.2 — a revoked binding fails closed for activation', () => {
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({
      bindingReuseCurrentness: { state: 'revoked', establishedAt: 85, assertedBy: [IDENTITY.witness] },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'BINDING_INVALIDATED');
});

test('a41-005 activation: §8.2 — a stale or non-covering binding determination is STALE for activation', () => {
  const stale = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({
      bindingReuseCurrentness: { state: 'stale', establishedAt: 85, assertedBy: [IDENTITY.witness] },
    }),
  );
  assert.ok(stale.outcome === 'STALE');
  assert.equal(stale.code, 'BINDING_NOT_CURRENT');
  const notCovering = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({
      bindingReuseCurrentness: { state: 'current', establishedAt: 80, assertedBy: [IDENTITY.witness] },
    }),
  );
  assert.ok(notCovering.outcome === 'STALE');
  assert.equal(notCovering.code, 'BINDING_NOT_CURRENT');
});

test('a41-005 activation: an activation preceding the binding it binds is malformed facts', () => {
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({
      activationIssuanceEvidence: { point: 65, assertedBy: [IDENTITY.witness] },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-005 activation: an evaluation point preceding the activation issuance is malformed facts', () => {
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({ evaluationPoint: 79 }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-005 activation: a malformed input shape fails closed as INVALID_FACTS', () => {
  const result = verifyDacV0041RuntimeActivation({
    activationRequestRef: null,
    activationResultRef: null,
    boundRequestIdentity: '',
    boundBindingIdentity: '',
    boundManifestIdentity: '',
    boundManifestContentDigest: '',
    binding: null,
    activationIssuer: {},
    activationIssuanceEvidence: { point: NaN, assertedBy: [] },
    bindingReuseCurrentness: { state: 'maybe' },
    sod: {},
    evaluationPoint: 85,
  } as unknown as Parameters<typeof verifyDacV0041RuntimeActivation>[0]);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});
