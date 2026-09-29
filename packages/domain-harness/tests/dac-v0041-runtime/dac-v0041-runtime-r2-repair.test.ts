// Issue #392 / A41-005R2 — discriminating adversarial closure for the one
// remaining #391 comment 5860346696 P1: the A41-003 verified compatibility
// `materialManifestRefs` closure and the concrete RuntimeImplementationRef /
// RuntimeHostBindingRef evidence Runtime binding binds must be equal on the
// FULL material envelope, never primary identity alone.
//
// Every drift negative here is the coherent substitution the R1 HEAD
// d515146… accepted: compatibility evidence validates the exact
// implementation/Host-Binding envelope A, the RuntimeBindingRequestRef
// material input AND the presented binding evidence coherently carry the
// same-primary envelope B, and the A41-003 subject/closure stays at
// envelope A. R1's request↔evidence full-envelope check passes (both sides
// are B) and the compatibility link compared only primaryIdentity — so the
// drifted bundle verified BINDING_VERIFIED at R1. The R2 bridge locates the
// exact runtime-implementation/runtime-host-binding entries in the
// compatibility subject's verified §8 materialManifestRefs closure and
// requires full material-envelope equality against the concrete evidence,
// so both drift variants fail closed (APPLICATION_MANIFEST §8;
// ASSEMBLY_CAPABILITY_EXCHANGE §10). The abstract path and the legitimate
// implementation-specific positive stay preserved.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../src/dac-v0041/runtime/index.js';
import {
  buildCompatibilityEvidence,
  buildMaterialArtifact,
  buildRef,
  buildValidActivationInput,
  buildValidBindingInput,
  IDENTITY,
  PROFILE,
  SCOPE,
} from './helpers.js';

/** Envelope A: the exact material the compatibility authority validated. */
function implementationEnvelopeA(): ReturnType<typeof buildRef> {
  return buildRef('runtime-implementation', 'impl/material-1', {
    semanticIdentity: 'semantic/impl-a',
    revisionIdentity: 'revision/impl-a',
    contentDigest: 'digest/impl-a',
    contractProfileIdentity: PROFILE.requirements,
  });
}

/** Same-primary envelope B: content-class drift (semantic/revision/digest). */
function implementationEnvelopeB(): ReturnType<typeof buildRef> {
  return buildRef('runtime-implementation', 'impl/material-1', {
    semanticIdentity: 'semantic/impl-b',
    revisionIdentity: 'revision/impl-b',
    contentDigest: 'digest/impl-b',
    contractProfileIdentity: PROFILE.requirements,
  });
}

test('a41-005r2 P1: implementation same-primary envelope A→B drift (content class) fails closed', () => {
  // Compatibility validates envelope A; the binding request material input
  // and the presented implementation evidence coherently carry envelope B
  // with the SAME primary identity. The R1 HEAD verified this bundle; the
  // R2 compatibility-material bridge must fail closed on the divergence.
  const drifted = buildValidBindingInput({
    implementation: buildMaterialArtifact('runtime-implementation', 'impl/material-1', {
      artifactRef: implementationEnvelopeB(),
    }),
    compatibility: buildCompatibilityEvidence({
      implementationRef: implementationEnvelopeA(),
    }),
  });
  const result = verifyDacV0041RuntimeBinding(drifted);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /compatibility-validated material closure/u);
  assert.match(result.detail, /semanticIdentity/u);
  assert.match(result.detail, /never primary identity alone|same-primary envelope drift/u);
});

test('a41-005r2 P1: implementation same-primary envelope A→B drift (authority-scope class) fails closed', () => {
  // Envelope B drifts ONLY the authority scope; every other material slot
  // stays identical. Same coherent request+evidence substitution; the
  // bridge reports the first diverging material-exactness field.
  const envelopeA = implementationEnvelopeA();
  const scopeDriftedB = buildRef('runtime-implementation', 'impl/material-1', {
    authorityScope: SCOPE.other,
    semanticIdentity: 'semantic/impl-a',
    revisionIdentity: 'revision/impl-a',
    contentDigest: 'digest/impl-a',
    contractProfileIdentity: PROFILE.requirements,
  });
  const drifted = buildValidBindingInput({
    implementation: buildMaterialArtifact('runtime-implementation', 'impl/material-1', {
      artifactRef: scopeDriftedB,
    }),
    compatibility: buildCompatibilityEvidence({ implementationRef: envelopeA }),
  });
  const result = verifyDacV0041RuntimeBinding(drifted);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /compatibility-validated material closure/u);
  assert.match(result.detail, /authorityScope/u);
});

test('a41-005r2 P1: Host Binding same-primary envelope A→B drift (profile class) fails closed', () => {
  // The Host-Binding variant of the same coherent substitution: envelope A
  // carries the requirements profile, the binding request input and
  // presented Host Binding evidence coherently carry envelope B with the
  // same primary identity but a different contract/profile identity.
  const hostEnvelopeA = buildRef('runtime-host-binding', 'host/binding-1', {
    semanticIdentity: 'semantic/host-a',
    revisionIdentity: 'revision/host-a',
    contentDigest: 'digest/host-a',
    contractProfileIdentity: PROFILE.requirements,
  });
  const hostEnvelopeB = buildRef('runtime-host-binding', 'host/binding-1', {
    semanticIdentity: 'semantic/host-a',
    revisionIdentity: 'revision/host-a',
    contentDigest: 'digest/host-a',
    contractProfileIdentity: PROFILE.other,
  });
  const drifted = buildValidBindingInput({
    hostBindings: [
      buildMaterialArtifact('runtime-host-binding', 'host/binding-1', {
        artifactRef: hostEnvelopeB,
      }),
    ],
    compatibility: buildCompatibilityEvidence({ hostBindingRef: hostEnvelopeA }),
  });
  const result = verifyDacV0041RuntimeBinding(drifted);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /compatibility-validated material closure/u);
  assert.match(result.detail, /contractProfileIdentity/u);
});

test('a41-005r2 P1: the drifted implementation material also blocks activation (binding re-verification)', () => {
  // Activation re-verifies the COMPLETE binding bundle at the activation
  // point, so the drifted material cannot enter through the activation
  // seam either: the R2 bridge fails inside the binding re-verification
  // and surfaces as BINDING_NOT_ESTABLISHED with the subject-mismatch
  // binding code. The material currentness determination covers the
  // activation point (85), so at the R1 HEAD this whole drifted journey
  // verified through to ACTIVATION_VERIFIED — only the material-closure
  // bridge rejects it now.
  const drifted = buildValidBindingInput({
    implementation: buildMaterialArtifact('runtime-implementation', 'impl/material-1', {
      artifactRef: implementationEnvelopeB(),
      reuseCurrentness: { state: 'current', establishedAt: 85, assertedBy: [IDENTITY.witness] },
    }),
    compatibility: buildCompatibilityEvidence({
      implementationRef: implementationEnvelopeA(),
    }),
  });
  const input = buildValidActivationInput({ binding: drifted });
  const result = verifyDacV0041RuntimeActivation(input);
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'BINDING_NOT_ESTABLISHED');
  assert.equal(result.bindingCode, 'SUBJECT_MISMATCH');
  assert.match(result.detail, /compatibility-validated material closure/u);
});

test('a41-005r2 positive: the legitimate implementation-specific journey with the exact same envelope still verifies', () => {
  // The same primary identity AND the same full material envelope appear in
  // the compatibility subject closure, the binding request material input
  // and the presented evidence — the bridge's equality holds and the
  // implementation-specific binding verifies exactly as before.
  const exact = buildRef('runtime-implementation', 'impl/material-1', {
    semanticIdentity: 'semantic/impl-a',
    revisionIdentity: 'revision/impl-a',
    contentDigest: 'digest/impl-a',
    contractProfileIdentity: PROFILE.requirements,
  });
  const input = buildValidBindingInput({
    implementation: buildMaterialArtifact('runtime-implementation', 'impl/material-1', {
      artifactRef: exact,
    }),
    compatibility: buildCompatibilityEvidence({ implementationRef: exact }),
  });
  const result = verifyDacV0041RuntimeBinding(input);
  assert.ok(result.outcome === 'BINDING_VERIFIED');
});

test('a41-005r2 positive: the legitimate implementation + Host Binding journey with exact envelopes verifies and activates', () => {
  // Both concrete material slots populated with envelopes identical across
  // the compatibility closure, the binding request and the presented
  // evidence: binding verifies and the activation journey stays intact.
  const implementationEnvelope = implementationEnvelopeA();
  const hostEnvelope = buildRef('runtime-host-binding', 'host/binding-1', {
    semanticIdentity: 'semantic/host-a',
    revisionIdentity: 'revision/host-a',
    contentDigest: 'digest/host-a',
    contractProfileIdentity: PROFILE.requirements,
  });
  const binding = buildValidBindingInput({
    implementation: buildMaterialArtifact('runtime-implementation', 'impl/material-1', {
      artifactRef: implementationEnvelope,
      reuseCurrentness: { state: 'current', establishedAt: 85, assertedBy: [IDENTITY.witness] },
    }),
    hostBindings: [
      buildMaterialArtifact('runtime-host-binding', 'host/binding-1', {
        artifactRef: hostEnvelope,
        reuseCurrentness: { state: 'current', establishedAt: 85, assertedBy: [IDENTITY.witness] },
      }),
    ],
    compatibility: buildCompatibilityEvidence({
      implementationRef: implementationEnvelope,
      hostBindingRef: hostEnvelope,
    }),
  });
  const bindingResult = verifyDacV0041RuntimeBinding(binding);
  assert.ok(bindingResult.outcome === 'BINDING_VERIFIED');
  const activationResult = verifyDacV0041RuntimeActivation(
    buildValidActivationInput({ binding }),
  );
  assert.ok(activationResult.outcome === 'ACTIVATION_VERIFIED');
});
