// Issue #390 / A41-005R1 — discriminating adversarial closure for the three
// #389 comment 5856435242 P1 gaps. Every negative here COHERENTLY mutates
// the previously passing dimension (both the asserted token/facts AND the
// upstream evidence changed together), so it fails on the failed HEAD
// a42ecbc4… (which verified only token/leaf consistency and primary
// identity) and fails closed on the R1 repair:
//
//   - P1-1 seam-fixed issuer roles (§§12–13/§16; C142/C154): a coherently
//     substituted valid role can never occupy a Runtime issuing seam;
//     same-identity/different-role C169/§16 positives stay valid;
//   - P1-2 full exact request/target closure (CROSS_LAYER_REFERENCES §3.1;
//     ASSEMBLY_CAPABILITY_EXCHANGE §4.1/§10): same primary identity with a
//     foreign scope, target/profile or material set fails closed — never
//     primary identity alone — and the activation request must carry the
//     exact binding + composition/Manifest/currentness subject;
//   - P1-3 activation-time full binding-bundle currentness (§§13–14):
//     material evidence current at binding time but not covering the
//     activation point is STALE, never admitted.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAC_V0041_BASELINE,
  mintRuntimeBindingRequestRef,
  type DacV0041Reference,
} from '../../src/dac-v0041/index.js';
import {
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../src/dac-v0041/runtime/index.js';
import {
  buildChainInput,
  buildMaterialArtifact,
  buildRef,
  buildValidActivationInput,
  buildValidBindingInput,
  IDENTITY,
  PROFILE,
  ROLE,
  SCOPE,
} from './helpers.js';

/** Canonical closed RuntimeBindingRequestRef with one dimension varied. */
function buildClosedBindingRequest(
  overrides: {
    authorityScope?: string;
    contractProfileIdentity?: string;
    bindingTargetRef?: DacV0041Reference;
    materialInputRefs?: readonly DacV0041Reference[];
  } = {},
): DacV0041Reference {
  return mintRuntimeBindingRequestRef({
    baseline: DAC_V0041_BASELINE,
    authorityScope: SCOPE.app,
    primaryIdentity: 'request/binding-1',
    requesterIdentity: 'id/binding-requester',
    providerIdentity: 'id/runtime-provider',
    requestedCapabilityKind: 'runtime-binding',
    materialInputRefs: [
      buildRef('manifest', 'manifest/record-1', { contentDigest: 'digest/manifest-1' }),
    ],
    bindingTargetRef: buildRef('compatibility-target', 'target/host-profile-a', {
      contractProfileIdentity: PROFILE.requirements,
    }),
    contractProfileIdentity: PROFILE.v0041,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// P1-1 — seam-fixed issuer roles
// ---------------------------------------------------------------------------

test('a41-005r1 P1-1: a coherently substituted non-binding issuer role (token AND leaf) fails closed', () => {
  // Both the caller-supplied role token AND the chain-current leaf
  // designation coherently carry the VALID role "compatibility-validation".
  // The failed HEAD accepted this (token/leaf consistency only); the
  // seam-fixed role requirement rejects it independently of the chain.
  const coherent = buildValidBindingInput({
    bindingIssuer: {
      issuerIdentity: IDENTITY.bindingIssuer,
      requiredIssuingRole: ROLE.compatibilityValidation,
      issuerDesignationChain: buildChainInput(
        'link/binding-leaf',
        IDENTITY.bindingIssuer,
        ROLE.compatibilityValidation,
        70,
      ),
    },
  });
  const result = verifyDacV0041RuntimeBinding(coherent);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_BINDING_ISSUER');
  assert.match(result.detail, /seam-fixed issuing role/u);
});

test('a41-005r1 P1-1: a coherently substituted non-activation issuer role (token AND leaf) fails closed', () => {
  // The activation issuer coherently presents the VALID distinct role
  // "compatibility-validation" (distinct from the binding role, so the §16
  // token-equality conflation check does not fire). The failed HEAD accepted
  // it; the seam-fixed activation role requirement rejects it.
  const input = buildValidActivationInput({
    activationIssuer: {
      issuerIdentity: IDENTITY.activationIssuer,
      requiredIssuingRole: ROLE.compatibilityValidation,
      issuerDesignationChain: buildChainInput(
        'link/activation-leaf',
        IDENTITY.activationIssuer,
        ROLE.compatibilityValidation,
        80,
      ),
    },
  });
  const result = verifyDacV0041RuntimeActivation(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'UNAUTHORIZED_ACTIVATION_ISSUER');
  assert.match(result.detail, /seam-fixed issuing role/u);
});

test('a41-005r1 P1-1: C169 — one identity with separate compatibility-validation and runtime-binding designations still verifies as binding issuer', () => {
  // Role separation must never become identity separation: the same
  // identity holds a valid compatibility-validation leaf AND a valid
  // runtime-binding leaf; the binding seam accepts the runtime-binding one.
  const result = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({
      bindingIssuerIdentity: IDENTITY.compatibilityValidator,
      compatibilityValidatorIdentity: IDENTITY.compatibilityValidator,
    }),
  );
  assert.ok(result.outcome === 'BINDING_VERIFIED');
  assert.equal(result.bindingIssuerIdentity, IDENTITY.compatibilityValidator);
});

test('a41-005r1 P1-1: §16 — one identity holding separately valid binding and activation role designations still verifies at both seams', () => {
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
  });
  const result = verifyDacV0041RuntimeActivation(input);
  assert.ok(result.outcome === 'ACTIVATION_VERIFIED');
  assert.equal(result.activationIssuerIdentity, IDENTITY.bindingIssuer);
});

// ---------------------------------------------------------------------------
// P1-2 — full exact request/target closure
// ---------------------------------------------------------------------------

test('a41-005r1 P1-2: same request primary identity with a foreign authority scope fails closed', () => {
  const input = buildValidBindingInput({
    bindingRequestRef: buildClosedBindingRequest({ authorityScope: SCOPE.other }),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SCOPE_MISMATCH');
});

test('a41-005r1 P1-2: same request primary identity with a wrong binding explicit target fails closed', () => {
  const input = buildValidBindingInput({
    bindingRequestRef: buildClosedBindingRequest({
      bindingTargetRef: buildRef('compatibility-target', 'target/other-profile', {
        contractProfileIdentity: PROFILE.requirements,
      }),
    }),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /binding explicit target/u);
});

test('a41-005r1 P1-2: same target identity with a wrong target requirements profile fails closed', () => {
  const input = buildValidBindingInput({
    bindingRequestRef: buildClosedBindingRequest({
      bindingTargetRef: buildRef('compatibility-target', 'target/host-profile-a', {
        contractProfileIdentity: 'profile/other-requirements',
      }),
    }),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'PROFILE_MISMATCH');
});

test('a41-005r1 P1-2: a binding request with a wrong DAC/reference profile fails closed', () => {
  const input = buildValidBindingInput({
    bindingRequestRef: buildClosedBindingRequest({ contractProfileIdentity: PROFILE.other }),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'PROFILE_MISMATCH');
});

test('a41-005r1 P1-2: a manifest material input with the right identity but the wrong digest fails closed', () => {
  const input = buildValidBindingInput({
    bindingRequestRef: buildClosedBindingRequest({
      materialInputRefs: [
        buildRef('manifest', 'manifest/record-1', { contentDigest: 'digest/wrong' }),
      ],
    }),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /content digest/u);
});

test('a41-005r1 P1-2: an implementation-specific claim whose request omits the implementation material input fails closed', () => {
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a');
  const input = buildValidBindingInput({
    implementation,
    bindingRequestRef: buildClosedBindingRequest(),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /runtime-implementation" material input/u);
});

test('a41-005r1 P1-2: an implementation material input with the same identity but different exact material fails closed', () => {
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a');
  const input = buildValidBindingInput({
    implementation,
    bindingRequestRef: buildClosedBindingRequest({
      materialInputRefs: [
        buildRef('manifest', 'manifest/record-1', { contentDigest: 'digest/manifest-1' }),
        buildRef('runtime-implementation', 'impl/node-22-a', {
          contentDigest: 'digest/impl-other-material',
        }),
      ],
    }),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /diverges/u);
});

test('a41-005r1 P1-2: a Host Binding material input with the same identity but a different exact envelope fails closed', () => {
  const hostBinding = buildMaterialArtifact('runtime-host-binding', 'host-binding/node-22-a');
  const input = buildValidBindingInput({
    hostBindings: [hostBinding],
    bindingRequestRef: buildClosedBindingRequest({
      materialInputRefs: [
        buildRef('manifest', 'manifest/record-1', { contentDigest: 'digest/manifest-1' }),
        buildRef('runtime-host-binding', 'host-binding/node-22-a', {
          contractProfileIdentity: PROFILE.other,
        }),
      ],
    }),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /runtime-host-binding material input/u);
});

test('a41-005r1 P1-2: an abstract request carrying a foreign extra material input fails closed', () => {
  const input = buildValidBindingInput({
    bindingRequestRef: buildClosedBindingRequest({
      materialInputRefs: [
        buildRef('manifest', 'manifest/record-1', { contentDigest: 'digest/manifest-1' }),
        buildRef('evidence', 'evidence/foreign-1'),
      ],
    }),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-005r1 P1-2: the exact closed abstract and implementation-specific request paths remain valid', () => {
  assert.ok(
    verifyDacV0041RuntimeBinding(buildValidBindingInput()).outcome === 'BINDING_VERIFIED',
  );
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a');
  const hostBinding = buildMaterialArtifact('runtime-host-binding', 'host-binding/node-22-a');
  const specific = verifyDacV0041RuntimeBinding(
    buildValidBindingInput({ implementation, hostBindings: [hostBinding] }),
  );
  assert.ok(specific.outcome === 'BINDING_VERIFIED');
});

// ---------------------------------------------------------------------------
// P1-2 — activation request §3.1 subject closure
// ---------------------------------------------------------------------------

test('a41-005r1 P1-2: an activation request targeting a different RuntimeBindingRef fails closed', () => {
  const input = buildValidActivationInput({
    activationRequestSubject: {
      targetBindingIdentity: 'binding/other-record',
      targetManifestIdentity: 'manifest/record-1',
      targetManifestContentDigest: 'digest/manifest-1',
      reliedBindingCurrentness: {
        state: 'current',
        establishedAt: 85,
        assertedBy: [IDENTITY.witness],
      },
    },
  });
  const result = verifyDacV0041RuntimeActivation(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_ASSOCIATION_MISMATCH');
});

test('a41-005r1 P1-2: an activation request targeting a different Manifest digest fails closed', () => {
  const input = buildValidActivationInput({
    activationRequestSubject: {
      targetBindingIdentity: 'binding/record-1',
      targetManifestIdentity: 'manifest/record-1',
      targetManifestContentDigest: 'digest/other',
      reliedBindingCurrentness: {
        state: 'current',
        establishedAt: 85,
        assertedBy: [IDENTITY.witness],
      },
    },
  });
  const result = verifyDacV0041RuntimeActivation(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
});

test('a41-005r1 P1-2: an activation request relying on a different currentness determination fails closed', () => {
  const input = buildValidActivationInput({
    activationRequestSubject: {
      targetBindingIdentity: 'binding/record-1',
      targetManifestIdentity: 'manifest/record-1',
      targetManifestContentDigest: 'digest/manifest-1',
      reliedBindingCurrentness: {
        state: 'current',
        establishedAt: 80,
        assertedBy: [IDENTITY.witness],
      },
    },
  });
  const result = verifyDacV0041RuntimeActivation(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_ASSOCIATION_MISMATCH');
  assert.match(result.detail, /currentness/u);
});

test('a41-005r1 P1-2: an activation request envelope with a foreign authority scope fails closed', () => {
  const input = buildValidActivationInput({
    activationRequestRef: buildRef('runtime-activation-request', 'request/activation-1', {
      authorityScope: SCOPE.other,
      contractProfileIdentity: PROFILE.v0041,
    }),
  });
  const result = verifyDacV0041RuntimeActivation(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_ASSOCIATION_MISMATCH');
  assert.match(result.detail, /authority scope/u);
});

test('a41-005r1 P1-2: an activation request envelope with a wrong DAC/reference profile fails closed', () => {
  const input = buildValidActivationInput({
    activationRequestRef: buildRef('runtime-activation-request', 'request/activation-1', {
      contractProfileIdentity: PROFILE.other,
    }),
  });
  const result = verifyDacV0041RuntimeActivation(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_ASSOCIATION_MISMATCH');
  assert.match(result.detail, /DAC\/reference profile/u);
});

// ---------------------------------------------------------------------------
// P1-3 — activation-time re-evaluation of the full binding bundle
// ---------------------------------------------------------------------------

test('a41-005r1 P1-3: material evidence current at binding time but not covering the activation point is STALE at activation', () => {
  // Determination established at 76: covers the binding evaluation point 75
  // (so the binding bundle ALONE still verifies at binding time) but not
  // the activation evaluation point 85. The failed HEAD admitted this
  // (material currentness was only ever asked at binding time); the
  // activation-time re-evaluation of the complete bundle returns STALE.
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a', {
    reuseCurrentness: { state: 'current', establishedAt: 76, assertedBy: [IDENTITY.witness] },
  });
  const hostBinding = buildMaterialArtifact('runtime-host-binding', 'host-binding/node-22-a', {
    reuseCurrentness: { state: 'current', establishedAt: 76, assertedBy: [IDENTITY.witness] },
  });
  const binding = buildValidBindingInput({ implementation, hostBindings: [hostBinding] });
  const bindingAlone = verifyDacV0041RuntimeBinding(binding);
  assert.ok(bindingAlone.outcome === 'BINDING_VERIFIED');
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({ binding }),
  );
  assert.ok(result.outcome === 'STALE');
  assert.equal(result.code, 'BINDING_EVIDENCE_STALE');
  assert.match(result.detail, /does not cover/u);
});

test('a41-005r1 P1-3: the implementation-specific composition -> compatibility -> binding -> activation journey verifies when every determination covers the activation point', () => {
  // One §8.2 determination established at 85 covers BOTH the binding
  // evaluation point 75 and the activation evaluation point 85: the full
  // implementation-specific journey closes at activation-time currentness.
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a', {
    reuseCurrentness: { state: 'current', establishedAt: 85, assertedBy: [IDENTITY.witness] },
  });
  const hostBinding = buildMaterialArtifact('runtime-host-binding', 'host-binding/node-22-a', {
    reuseCurrentness: { state: 'current', establishedAt: 85, assertedBy: [IDENTITY.witness] },
  });
  const binding = buildValidBindingInput({ implementation, hostBindings: [hostBinding] });
  assert.ok(
    verifyDacV0041RuntimeBinding(binding).outcome === 'BINDING_VERIFIED',
  );
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({ binding }),
  );
  assert.ok(result.outcome === 'ACTIVATION_VERIFIED');
  assert.equal(result.boundBindingIdentity, 'binding/record-1');
  assert.equal(result.manifestIdentity, 'manifest/record-1');
});

test('a41-005r1 P1-3: the abstract activation journey stays valid without material artifacts', () => {
  const result = verifyDacV0041RuntimeActivation(buildValidActivationInput());
  assert.ok(result.outcome === 'ACTIVATION_VERIFIED');
});

test('a41-005r1 P1-3: material evidence revoked only after binding time fails closed at activation', () => {
  // A revocation determination established at 80 (after the binding
  // evaluation point 75, before activation 85): the evidence was current at
  // binding time and is explicitly invalidated for the activation-time
  // authoritative use — structural invalidity dominates staleness.
  const implementation = buildMaterialArtifact('runtime-implementation', 'impl/node-22-a', {
    reuseCurrentness: { state: 'revoked', establishedAt: 80, assertedBy: [IDENTITY.witness] },
  });
  const binding = buildValidBindingInput({ implementation });
  const result = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({ binding }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'BINDING_NOT_ESTABLISHED');
  assert.equal(result.bindingCode, 'RELIED_INPUT_INVALIDATED');
});
