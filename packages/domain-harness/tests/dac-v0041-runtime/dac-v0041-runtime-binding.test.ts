// Issue #359 / A41-005 — Runtime binding verifier suite (ASSEMBLY_
// LIFECYCLE §12): the positive composition -> compatibility -> binding
// path over genuinely valid upstream A41-002/-003/-004 evidence, plus the
// adversarial negatives for every frozen precedence rung (C108 anti-alias,
// request association, C144 association, C107 precedence ceiling, intake
// propagation, subject/scope/profile exactness, §10/§11 implementation
// exactness, C128 evidence, C100/C113 issuer designation, C148/C149 SoD
// with the C169 legitimate multi-role positive, and §14 binding-time
// currentness).
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041RuntimeBinding } from '../../src/dac-v0041/runtime/index.js';
import {
  buildMaterialArtifact,
  buildRef,
  buildSodFacts,
  buildValidBindingInput,
  buildValidIntakeInput,
  IDENTITY,
  ROLE,
  SCOPE,
} from './helpers.js';

test('a41-005 binding: the canonical abstract composition path verifies (BINDING_VERIFIED)', () => {
  const result = verifyDacV0041RuntimeBinding(buildValidBindingInput());
  assert.ok(result.outcome === 'BINDING_VERIFIED');
  assert.equal(result.requestIdentity, 'request/binding-1');
  assert.equal(result.bindingIdentity, 'binding/record-1');
  assert.equal(result.manifestIdentity, 'manifest/record-1');
  assert.equal(result.manifestContentDigest, 'digest/manifest-1');
  assert.equal(result.bindingIssuerIdentity, IDENTITY.bindingIssuer);
  assert.equal(result.compatibilityResultViewIdentity, 'result/compat-1');
  // C107 / §17 structural markers: a verified binding is not an
  // activation, not a selection and not external Business SoR truth.
  assert.equal(result.impliesRuntimeActivation, false);
  assert.equal(result.impliesApplicationSelection, false);
  assert.equal(result.isExternalBusinessSorTruth, false);
});

test('a41-005 binding: the implementation-specific §11 path verifies with exact implementation/Host Binding evidence', () => {
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a');
  const hostBinding = buildMaterialArtifact('runtime-host-binding', 'host-binding/node-22-a');
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({ implementation, hostBindings: [hostBinding] }),
  );
  assert.ok(result.outcome === 'BINDING_VERIFIED');
  assert.equal(result.bindingIdentity, 'binding/record-1');
});

test('a41-005 binding: a foreign/forged request carrier fails closed as FOREIGN_EVIDENCE', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    bindingRequestRef: { role: 'runtime-binding-request', primaryIdentity: 'request/binding-1' },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'FOREIGN_EVIDENCE');
});

test('a41-005 binding: a wrong-role result carrier fails closed as ROLE_MISMATCH', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    bindingResultRef: buildRef('runtime-activation', 'binding/record-1'),
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('a41-005 binding: C108 — a binding result aliasing its request fails closed as REQUEST_RESULT_ALIAS', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    bindingResultRef: buildRef('runtime-binding', 'request/binding-1'),
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_RESULT_ALIAS');
});

test('a41-005 binding: C108 — a Host Binding aliasing the request fails closed as REQUEST_RESULT_ALIAS', () => {
  const hostBinding = buildMaterialArtifact('runtime-host-binding', 'request/binding-1');
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({ hostBindings: [hostBinding] }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_RESULT_ALIAS');
});

test('a41-005 binding: §12 — a Host Binding aliasing the binding result fails closed as SEAM_IDENTITY_ALIAS', () => {
  // Same identity, but reached only through the host-binding position after
  // the request-alias checks passed: build the bundle so the host binding
  // carries the same identity as the implementation evidence.
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a');
  const hostBinding = buildMaterialArtifact('runtime-host-binding', 'impl/node-22-a');
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({ implementation, hostBindings: [hostBinding] }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SEAM_IDENTITY_ALIAS');
});

test('a41-005 binding: §12 — a compatibility result identity aliasing the binding identity fails closed', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compatibility: {
      ...input.compatibility,
      resultView: {
        ...input.compatibility.resultView,
        resultViewIdentity: 'binding/record-1',
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SEAM_IDENTITY_ALIAS');
});

test('a41-005 binding: a binding answering a different request fails closed as REQUEST_ASSOCIATION_MISMATCH', () => {
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({ boundRequestIdentity: 'request/binding-other' }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_ASSOCIATION_MISMATCH');
});

test('a41-005 binding: an invalid C144 two-view association fails closed and carries the association code', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compatibility: {
      ...input.compatibility,
      validationView: {
        ...input.compatibility.validationView,
        boundRequestIdentity: 'request/compat-other',
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'COMPATIBILITY_ASSOCIATION_INVALID');
  assert.equal(result.associationCode, 'REQUEST_ASSOCIATION_MISMATCH');
});

test('a41-005 binding: C107 — an INCOMPATIBLE precedence verdict cannot back a binding', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compatibility: {
      ...input.compatibility,
      precedenceFacts: {
        ...input.compatibility.precedenceFacts,
        assertedDisposition: 'INCOMPATIBLE',
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'COMPATIBILITY_NOT_ESTABLISHED');
  assert.equal(result.precedenceOutcome, 'FAIL_CLOSED');
});

test('a41-005 binding: C99 — a binding-time Harness check relied as compatibility result cannot back a binding', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compatibility: {
      ...input.compatibility,
      precedenceFacts: {
        ...input.compatibility.precedenceFacts,
        bindingTimeCheckReliedAsCompatibilityResult: true,
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'COMPATIBILITY_NOT_ESTABLISHED');
});

test('a41-005 binding: a non-current compatibility verdict is STALE at binding time', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compatibility: {
      ...input.compatibility,
      precedenceFacts: {
        ...input.compatibility.precedenceFacts,
        authoritativeResults: [
          {
            ...input.compatibility.precedenceFacts.authoritativeResults[0]!,
            currentness: 'stale',
          },
        ],
      },
    },
  });
  assert.ok(result.outcome === 'STALE');
  assert.equal(result.code, 'COMPATIBILITY_STALE');
});

test('a41-005 binding: a favorable verdict does not back an unpresented result view', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compatibility: {
      ...input.compatibility,
      resultView: {
        ...input.compatibility.resultView,
        resultViewIdentity: 'result/compat-other',
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'COMPATIBILITY_NOT_ESTABLISHED');
  assert.match(result.detail, /unbacked result view/u);
});

test('a41-005 binding: an invalid composition-intake bundle propagates fail-closed with the intake code', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compositionIntake: buildValidIntakeInput({
      manifest: {
        ...input.compositionIntake.manifest,
        reuseCurrentness: { state: 'revoked', establishedAt: 75, assertedBy: [IDENTITY.witness] },
      },
    }),
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'COMPOSITION_INTAKE_INVALID');
  assert.equal(result.intakeCode, 'MANIFEST_INVALIDATED');
});

test('a41-005 binding: a stale composition-intake bundle propagates as STALE', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compositionIntake: buildValidIntakeInput({
      manifest: {
        ...input.compositionIntake.manifest,
        reuseCurrentness: { state: 'stale', establishedAt: 75, assertedBy: [IDENTITY.witness] },
      },
    }),
  });
  assert.ok(result.outcome === 'STALE');
  assert.equal(result.code, 'COMPOSITION_INTAKE_STALE');
});

test('a41-005 binding: the binding subject must equal the intake and compatibility subject exactly', () => {
  const wrongManifest = buildValidBindingInput({
    subject: {
      manifestIdentity: 'manifest/other-record',
      manifestContentDigest: 'digest/manifest-1',
      dacProfileIdentity: 'dac-profile/v0041-a',
    },
  });
  const result = verifyDacV0041RuntimeBinding(wrongManifest);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-005 binding: a DAC/reference profile divergence from the compatibility subject fails closed', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    subject: { ...input.subject, dacProfileIdentity: 'dac-profile/other' },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'PROFILE_MISMATCH');
});

test('a41-005 binding: §10 — implementation evidence over an abstract compatibility subject fails closed', () => {
  // Present implementation evidence ONLY on the binding side (the raw
  // input override bypasses the helper's lockstep coupling), so the
  // compatibility subject stays abstract.
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({
      implementationEvidence: buildMaterialArtifact('runtime-implementation', 'impl/node-22-a'),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /retroactively strengthen/u);
});

test('a41-005 binding: §10 — an implementation-specific compatibility subject requires the exact implementation evidence', () => {
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a');
  const hostBinding = buildMaterialArtifact('runtime-host-binding', 'host-binding/node-22-a');
  const mismatched = buildMaterialArtifact('runtime-implementation', 'impl/node-24-b');
  const input = buildValidBindingInput({ implementation, hostBindings: [hostBinding] });
  // Swap the presented implementation evidence for a different exact
  // implementation than the compatibility subject validated.
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    implementationEvidence: mismatched,
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-005 binding: C128 — a binding act asserted solely by its own issuer fails closed', () => {
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({
      bindingIssuanceEvidence: { point: 70, assertedBy: [IDENTITY.bindingIssuer] },
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'EVIDENCE_UNESTABLISHED');
});

test('a41-005 binding: C100/§2.2 — designation derived from a Composer-role designator is rejected with the chain code', () => {
  // The Composer-role identity appears as the DESIGNATOR of the leaf
  // designation the binding issuer relies on: authority derived from the
  // co-hosted Composer role (not the scope owner) fails closed.
  const input = buildValidBindingInput();
  const links = input.bindingIssuer.issuerDesignationChain.links.map((link) =>
    link.linkIdentity === 'link/binding-leaf'
      ? { ...link, designatorIdentity: IDENTITY.composer }
      : link,
  );
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    bindingIssuer: {
      ...input.bindingIssuer,
      issuerDesignationChain: {
        ...input.bindingIssuer.issuerDesignationChain,
        links,
        composerRoleIdentities: [IDENTITY.composer],
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_BINDING_ISSUER');
  assert.equal(result.chainCode, 'COMPOSER_DESIGNATOR');
});

test('a41-005 binding: a leaf designation that does not carry the asserted issuer/role fails closed', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    bindingIssuer: {
      ...input.bindingIssuer,
      requiredIssuingRole: ROLE.runtimeActivation,
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_BINDING_ISSUER');
  assert.match(result.detail, /leaf designation/u);
});

test('a41-005 binding: an issuer chain lapsed at the binding issuance point is STALE', () => {
  const input = buildValidBindingInput();
  const links = input.bindingIssuer.issuerDesignationChain.links.map((link) =>
    link.linkIdentity === 'link/binding-leaf'
      ? { ...link, declaredEffectiveEnd: 60 }
      : link,
  );
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    bindingIssuer: {
      ...input.bindingIssuer,
      issuerDesignationChain: {
        ...input.bindingIssuer.issuerDesignationChain,
        links,
      },
    },
  });
  assert.ok(result.outcome === 'STALE');
  assert.equal(result.code, 'ISSUER_CHAIN_STALE');
});

test('a41-005 binding: C148 — self-approval by a subject-contributing issuer fails closed and permission cannot cure it', () => {
  const base = buildValidBindingInput();
  const selfApproval = verifyDacV0041RuntimeBinding({
    ...base,
    sod: buildSodFacts({
      subjectContributingIdentities: [IDENTITY.bindingIssuer, IDENTITY.producer],
      explicitSodPermissionEstablished: true,
      coLocationDisclosed: true,
    }),
  });
  assert.ok(selfApproval.outcome === 'FAIL_CLOSED');
  assert.equal(selfApproval.code, 'SELF_APPROVAL');
});

test('a41-005 binding: C149 — a co-hosted subject-contributing arrangement needs BOTH permission and disclosure', () => {
  const base = buildValidBindingInput();
  const coHosted = {
    subjectContributingIdentities: [IDENTITY.producer],
    coHostingGroups: [[IDENTITY.bindingIssuer, IDENTITY.producer]],
  } as const;
  const noPermission = verifyDacV0041RuntimeBinding({
    ...base,
    sod: buildSodFacts({ ...coHosted, explicitSodPermissionEstablished: false, coLocationDisclosed: true }),
  });
  assert.ok(noPermission.outcome === 'FAIL_CLOSED');
  assert.equal(noPermission.code, 'SOD_PERMISSION_MISSING');
  const noDisclosure = verifyDacV0041RuntimeBinding({
    ...base,
    sod: buildSodFacts({ ...coHosted, explicitSodPermissionEstablished: true, coLocationDisclosed: false }),
  });
  assert.ok(noDisclosure.outcome === 'FAIL_CLOSED');
  assert.equal(noDisclosure.code, 'COLOCATION_UNDISCLOSED');
  const withBoth = verifyDacV0041RuntimeBinding({
    ...base,
    sod: buildSodFacts({ ...coHosted, explicitSodPermissionEstablished: true, coLocationDisclosed: true }),
  });
  assert.ok(withBoth.outcome === 'BINDING_VERIFIED');
});

test('a41-005 binding: C169 — a separately designated validator acting as binding issuer consuming its own valid upstream result verifies', () => {
  // One identity independently designated for compatibility validation AND
  // Runtime binding (both leaves under the root envelope), consuming its
  // own valid upstream compatibility result. The upstream
  // authority-bearing result is not subject-contributing (AP §15.1), so
  // the binding verifies without any SoD permission at all.
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({
      bindingIssuerIdentity: IDENTITY.compatibilityValidator,
      compatibilityValidatorIdentity: IDENTITY.compatibilityValidator,
    }),
  );
  assert.ok(result.outcome === 'BINDING_VERIFIED');
  assert.equal(result.bindingIssuerIdentity, IDENTITY.compatibilityValidator);
});

test('a41-005 binding: C148 — a designated issuer that is itself the non-authority subject producer still self-approves', () => {
  // A legitimately designated binding issuer that ALSO non-authoritatively
  // produced the decision subject: the valid designation does not cure the
  // same-identity self-approval rule (ASSEMBLY_PROFILES §15.2).
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({
      bindingIssuerIdentity: IDENTITY.producer,
      sod: buildSodFacts({ subjectContributingIdentities: [IDENTITY.producer] }),
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SELF_APPROVAL');
});

test('a41-005 binding: §14 — a revoked compatibility result view fails closed at binding time', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compatibility: {
      ...input.compatibility,
      resultView: {
        ...input.compatibility.resultView,
        currentness: 'revoked',
      },
      precedenceFacts: {
        ...input.compatibility.precedenceFacts,
        authoritativeResults: [
          {
            ...input.compatibility.precedenceFacts.authoritativeResults[0]!,
            currentness: 'current',
          },
        ],
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'RELIED_INPUT_INVALIDATED');
});

test('a41-005 binding: §14 — a stale compatibility result view is STALE at binding time', () => {
  const input = buildValidBindingInput();
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    compatibility: {
      ...input.compatibility,
      resultView: {
        ...input.compatibility.resultView,
        currentness: 'stale',
      },
      precedenceFacts: {
        ...input.compatibility.precedenceFacts,
        authoritativeResults: [
          {
            ...input.compatibility.precedenceFacts.authoritativeResults[0]!,
            currentness: 'current',
          },
        ],
      },
    },
  });
  assert.ok(result.outcome === 'STALE');
  assert.equal(result.code, 'RELIED_INPUT_NOT_CURRENT');
});

test('a41-005 binding: §14 — revoked implementation evidence fails closed; stale evidence and non-covering determinations are STALE', () => {
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a');
  const hostBinding = buildMaterialArtifact('runtime-host-binding', 'host-binding/node-22-a');
  const revoked = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({
      implementation: {
        ...implementation,
        reuseCurrentness: { state: 'revoked', establishedAt: 75, assertedBy: [IDENTITY.witness] },
      },
      hostBindings: [hostBinding],
    }),
  );
  assert.ok(revoked.outcome === 'FAIL_CLOSED');
  assert.equal(revoked.code, 'RELIED_INPUT_INVALIDATED');
  const stale = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({
      implementation: {
        ...implementation,
        reuseCurrentness: { state: 'stale', establishedAt: 75, assertedBy: [IDENTITY.witness] },
      },
      hostBindings: [hostBinding],
    }),
  );
  assert.ok(stale.outcome === 'STALE');
  assert.equal(stale.code, 'RELIED_INPUT_NOT_CURRENT');
  const notCovering = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({
      implementation,
      hostBindings: [
        {
          ...hostBinding,
          reuseCurrentness: { state: 'current', establishedAt: 60, assertedBy: [IDENTITY.witness] },
        },
      ],
    }),
  );
  assert.ok(notCovering.outcome === 'STALE');
  assert.equal(notCovering.code, 'RELIED_INPUT_NOT_CURRENT');
});

test('a41-005 binding: an evaluation point predating the binding issuance is malformed facts', () => {
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({ evaluationPoint: 69 }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-005 binding: a malformed input shape fails closed as INVALID_FACTS', () => {
  const result = verifyDacV0041RuntimeBinding({
    bindingRequestRef: null,
    bindingResultRef: null,
    boundRequestIdentity: '',
    subject: {},
    compositionIntake: {},
    compatibility: {},
    bindingIssuer: {},
    bindingIssuanceEvidence: { point: NaN, assertedBy: [] },
    sod: { subjectContributingIdentities: 'no' },
    evaluationPoint: 75,
  } as unknown as Parameters<typeof verifyDacV0041RuntimeBinding>[0]);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'INVALID_FACTS');
});

test('a41-005 binding: an out-of-scope binding issuer designation fails closed', () => {
  const input = buildValidBindingInput();
  const links = input.bindingIssuer.issuerDesignationChain.links.map((link) =>
    link.linkIdentity === 'link/binding-leaf'
      ? { ...link, authorityScope: SCOPE.other }
      : link,
  );
  const result = verifyDacV0041RuntimeBinding({
    ...input,
    bindingIssuer: {
      ...input.bindingIssuer,
      issuerDesignationChain: {
        ...input.bindingIssuer.issuerDesignationChain,
        links,
      },
    },
  });
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_BINDING_ISSUER');
});
