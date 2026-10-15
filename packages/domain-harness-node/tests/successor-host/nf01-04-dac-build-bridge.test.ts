// v0.8 T-G #1006 targeted gap batch 3 — NEW-FUNCTION-01..04 "current BUILD
// <-> DAC v0.0.4.1 bridge" selected observables.
//
// The frozen candidate b151320 already executes the DAC v0.0.4.1 verifiers
// green over hand-built fixtures (the 84 legacy dac lines). What no executed
// test anywhere does is carry REAL current v0.8 BUILD output into those
// verifiers. This file mints every manifest/subject identity and digest
// slot from the PUBLIC compiler entry output (real packageId, real
// domain-data descriptor digests, real target profile) and asserts, per
// retained row, that the verifier accepts the faithful bridge and fails
// closed on a drifted/unfaithful one:
//   NF01 compatibility request<->validation<->result TWO-VIEW +
//        contradictory-evidence precedence;
//   NF02 ApplicationSelection->Manifest chosen subject/coverage +
//        truthful material-refusal intake;
//   NF03 Runtime Binding fact verification with Binding != Activation;
//   NF04 Runtime Activation distinct from Binding, external-issuer
//        currentness and SoD.
// The bridge is test-side only: no production adapter exists or is claimed.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DAC_V0041_BASELINE,
  mintCompatibilityValidationRequestRef,
  mintRuntimeBindingRequestRef,
} from '../../../../packages/domain-harness/src/dac-v0041/index.js';
import {
  classifyDacV0041CompatibilityPrecedence,
  verifyDacV0041CompatibilityViewAssociation,
} from '../../../../packages/domain-harness/src/dac-v0041/compatibility/index.js';
import { verifyDacV0041CompositionIntake } from '../../../../packages/domain-harness/src/dac-v0041/composition-intake/index.js';
import {
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../../../packages/domain-harness/src/dac-v0041/runtime/index.js';
import type {
  DacV0041CompositionIntakeInput,
} from '../../../../packages/domain-harness/src/dac-v0041/composition-intake/index.js';
import type {
  DacV0041RuntimeActivationVerificationInput,
  DacV0041RuntimeBindingVerificationInput,
  DacV0041RuntimeCompatibilityEvidenceFacts,
} from '../../../../packages/domain-harness/src/dac-v0041/runtime/index.js';
import {
  SUBJECT as COMPAT_SUBJECT,
  buildAssociationInput,
  buildFavorableResult,
  buildManifestRef,
  buildPrecedenceFacts,
  buildRequestRef,
  buildResultView,
  buildSubject,
  buildTargetRef,
  buildValidationView,
} from '../../../../packages/domain-harness/tests/dac-v0041-compatibility/helpers.js';
import {
  buildBindingRefusalFacts,
  buildCoverage,
  buildManifestFacts,
  buildSelectionFacts,
  buildValidIntakeInput,
} from '../../../../packages/domain-harness/tests/dac-v0041-composition-intake/helpers.js';
import * as rt from '../../../../packages/domain-harness/tests/dac-v0041-runtime/helpers.js';
import { compileSuccessor } from './helper.ts';

// ---------------------------------------------------------------------------
// Real BUILD material: everything below is derived from PUBLIC compiler
// output. DRIFTED is a genuinely valid second compilation (different bundled
// tier value => different real packageId and different real tier digest) —
// the drift negatives use ITS real digests, not invented strings.
// ---------------------------------------------------------------------------
const CURRENT = compileSuccessor();
const DRIFTED = compileSuccessor({ domainData: [{ key: 'tier', value: { level: 42 } }] });

interface BridgeMaterial {
  readonly manifestIdentity: string;
  readonly manifestDigest: string;
  readonly driftedManifestDigest: string;
  readonly targetIdentity: string;
  readonly tierDigest: string;
  readonly driftedTierDigest: string;
}

function bridgeMaterial(): BridgeMaterial {
  const manifest = CURRENT.manifest;
  const tier = manifest.domainData?.find((entry) => entry.key === 'tier');
  const driftedTier = DRIFTED.manifest.domainData?.find((entry) => entry.key === 'tier');
  assert.ok(tier, 'current build carries the tier descriptor');
  assert.ok(driftedTier, 'drifted build carries the tier descriptor');
  assert.notEqual(tier.contentDigest, driftedTier.contentDigest);
  assert.notEqual(manifest.packageId, DRIFTED.manifest.packageId);
  return {
    manifestIdentity: `domain-package/${manifest.domainId}@${manifest.domainVersion}`,
    manifestDigest: manifest.packageId,
    driftedManifestDigest: DRIFTED.manifest.packageId,
    targetIdentity: `target/${manifest.targetProfileId}`,
    tierDigest: tier.contentDigest,
    driftedTierDigest: driftedTier.contentDigest,
  };
}

const REAL = bridgeMaterial();

function manifestMaterialRef(real: BridgeMaterial): rt.DacV0041Reference {
  return rt.buildRef('manifest', real.manifestIdentity, { contentDigest: real.manifestDigest });
}

// ---------------------------------------------------------------------------
// NF01 — compatibility TWO-VIEW association + contradictory-evidence
// precedence over real compiled identity/digest material.
// ---------------------------------------------------------------------------
test('NF01 BUILD bridge: real package identity/digest verify as the TWO-VIEW subject; drifted BUILD digest fails closed', () => {
  const subject = buildSubject({
    manifestIdentity: REAL.manifestIdentity,
    manifestContentDigest: REAL.manifestDigest,
    targetIdentities: [REAL.targetIdentity],
    materialManifestRefs: [{
      role: 'manifest',
      authorityScope: 'scope/domain-a',
      primaryIdentity: REAL.manifestIdentity,
      contentDigest: REAL.manifestDigest,
    }],
  });
  const requestRef = buildRequestRef({
    materialInputRefs: [buildManifestRef(REAL.manifestIdentity, REAL.manifestDigest)],
    bindingTargetRef: buildTargetRef(REAL.targetIdentity, COMPAT_SUBJECT.requirements),
  });

  const positive = verifyDacV0041CompatibilityViewAssociation(buildAssociationInput({
    requestRef,
    validationView: buildValidationView({ subject }),
    resultView: buildResultView({ subject }),
  }));
  assert.equal(positive.outcome, 'VALID_TWO_VIEW');

  // The OTHER compilation's digest is genuinely valid BUILD material — for
  // a different package; bridging it against this manifest identity is a
  // drifted subject and must fail closed before any verdict.
  const driftedSubject = buildSubject({
    manifestIdentity: REAL.manifestIdentity,
    manifestContentDigest: REAL.driftedManifestDigest,
    targetIdentities: [REAL.targetIdentity],
    materialManifestRefs: [{
      role: 'manifest',
      authorityScope: 'scope/domain-a',
      primaryIdentity: REAL.manifestIdentity,
      contentDigest: REAL.driftedManifestDigest,
    }],
  });
  const negative = verifyDacV0041CompatibilityViewAssociation(buildAssociationInput({
    requestRef,
    validationView: buildValidationView({ subject: driftedSubject }),
    resultView: buildResultView({ subject: driftedSubject }),
  }));
  assert.equal(negative.outcome, 'FAIL_CLOSED');
  assert.equal(negative.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

test('NF01 BUILD bridge: precedence over the bridged result — favorable current verdict vs contradictory evidence', () => {
  const bridgedResult = `result/compat-bridge-${REAL.manifestDigest.slice(0, 16)}`;
  const favorable = classifyDacV0041CompatibilityPrecedence(buildPrecedenceFacts({
    authoritativeResults: [buildFavorableResult({ resultViewIdentity: bridgedResult })],
    refusalEvidence: [],
  }));
  assert.equal(favorable.outcome, 'COMPATIBLE_VERDICT');

  // C98: a second authoritative result for the same bridged subject with the
  // contradictory disposition fails closed even with the favorable one present.
  const contradicted = classifyDacV0041CompatibilityPrecedence(buildPrecedenceFacts({
    authoritativeResults: [
      buildFavorableResult({ resultViewIdentity: bridgedResult }),
      buildFavorableResult({
        resultViewIdentity: `${bridgedResult}-neg`,
        disposition: 'INCOMPATIBLE',
      }),
    ],
  }));
  assert.equal(contradicted.outcome, 'FAIL_CLOSED');
});

// ---------------------------------------------------------------------------
// NF02 — composition intake (ApplicationSelection -> Manifest chosen
// subject/coverage + truthful material-refusal intake) with the selected
// subject tuples carried by real compiled domain-data descriptors.
// ---------------------------------------------------------------------------
function bridgedTierRef(real: BridgeMaterial, digest: string): rt.DacV0041Reference {
  return rt.buildRef('selected-domain-data', 'domain-data/tier', {
    semanticIdentity: 'semantic/domain-data/tier',
    revisionIdentity: real.manifestDigest,
    contentDigest: digest,
  });
}

function bridgedIntake(real: BridgeMaterial, tierDigest: string): DacV0041CompositionIntakeInput {
  const tierRef = bridgedTierRef(real, tierDigest);
  return buildValidIntakeInput({
    applicationSelection: buildSelectionFacts({ selectedDomainDataRefs: [tierRef] }),
    manifest: buildManifestFacts({
      manifestRef: rt.buildRef('manifest', real.manifestIdentity),
      manifestContentDigestRef: rt.buildRef('manifest-content-digest', real.manifestDigest),
      selectedDomainDataRefs: [tierRef],
    }),
    selectedDomainData: [buildCoverage('subject/selected-alpha', { subjectRef: tierRef })],
  });
}

test('NF02 BUILD bridge: real domain-data descriptors flow selection->manifest->coverage; truthful refusal intake verifies', () => {
  const positive = verifyDacV0041CompositionIntake(bridgedIntake(REAL, REAL.tierDigest));
  assert.equal(positive.outcome, 'INTAKE_VERIFIED');

  // Truthful material-refusal intake: a seam-correct refusal that is fully
  // disclosed keeps the intake verified — refusal is intake, not failure.
  const truthful = verifyDacV0041CompositionIntake({
    ...bridgedIntake(REAL, REAL.tierDigest),
    materialRefusals: [buildBindingRefusalFacts()],
    refusalDisclosureComplete: true,
  });
  assert.equal(truthful.outcome, 'INTAKE_VERIFIED');

  // Hiding the same refusal is not truthful intake.
  const hidden = verifyDacV0041CompositionIntake({
    ...bridgedIntake(REAL, REAL.tierDigest),
    materialRefusals: [buildBindingRefusalFacts()],
    refusalDisclosureComplete: false,
  });
  assert.equal(hidden.outcome, 'FAIL_CLOSED');
  assert.equal((hidden as { code?: string }).code, 'MATERIAL_REFUSAL_OMITTED');

  // A coherently bridged SECOND compilation is genuine BUILD material and
  // verifies as its own intake — the verifier follows the material.
  const secondVariant = verifyDacV0041CompositionIntake(bridgedIntake(REAL, REAL.driftedTierDigest));
  assert.equal(secondVariant.outcome, 'INTAKE_VERIFIED');

  // The unfaithful mixture does not: selection/manifest choose the current
  // subject tuple while the coverage record claims the OTHER variant's
  // tuple — a different BUILD revision posing as the chosen subject.
  const selectedRef = bridgedTierRef(REAL, REAL.tierDigest);
  const mixed = verifyDacV0041CompositionIntake(buildValidIntakeInput({
    applicationSelection: buildSelectionFacts({ selectedDomainDataRefs: [selectedRef] }),
    manifest: buildManifestFacts({
      manifestRef: rt.buildRef('manifest', REAL.manifestIdentity),
      manifestContentDigestRef: rt.buildRef('manifest-content-digest', REAL.manifestDigest),
      selectedDomainDataRefs: [selectedRef],
    }),
    selectedDomainData: [
      buildCoverage('subject/selected-alpha', { subjectRef: bridgedTierRef(REAL, REAL.driftedTierDigest) }),
    ],
  }));
  assert.equal(mixed.outcome, 'FAIL_CLOSED');
});

// ---------------------------------------------------------------------------
// NF03 / NF04 — runtime binding then activation over a coherent chain whose
// manifest identity/digest, compatibility subject and intake material all
// carry the real compiled output (mirrors the legacy
// dac-v0041-runtime helpers with MANIFEST_MATERIAL bridged to REAL).
// ---------------------------------------------------------------------------
function bridgedCompatibility(real: BridgeMaterial): DacV0041RuntimeCompatibilityEvidenceFacts {
  const materialRefs = [manifestMaterialRef(real)];
  const subject = {
    manifestIdentity: real.manifestIdentity,
    manifestContentDigest: real.manifestDigest,
    targetIdentities: [real.targetIdentity],
    requirementsProfileIdentity: rt.PROFILE.requirements,
    dacProfileIdentity: rt.PROFILE.v0041,
    materialManifestRefs: [{
      role: 'manifest' as const,
      authorityScope: rt.SCOPE.app,
      primaryIdentity: real.manifestIdentity,
      contentDigest: real.manifestDigest,
    }],
  };
  const requestRef = mintCompatibilityValidationRequestRef({
    baseline: DAC_V0041_BASELINE,
    authorityScope: rt.SCOPE.app,
    primaryIdentity: 'request/compat-bridge-1',
    requesterIdentity: rt.IDENTITY.composer,
    providerIdentity: rt.IDENTITY.compatibilityValidator,
    requestedCapabilityKind: 'compatibility-validation',
    materialInputRefs: materialRefs,
    bindingTargetRef: rt.buildRef('compatibility-target', real.targetIdentity, {
      contractProfileIdentity: rt.PROFILE.requirements,
    }),
    contractProfileIdentity: rt.PROFILE.v0041,
  });
  return {
    requestRef,
    validationView: {
      validationViewIdentity: 'validation/compat-bridge-1',
      boundRequestIdentity: 'request/compat-bridge-1',
      validatorIdentity: rt.IDENTITY.compatibilityValidator,
      validatorDesignated: true,
      subject,
    },
    resultView: {
      resultViewIdentity: `result/compat-bridge-${real.manifestDigest.slice(0, 16)}`,
      boundValidationViewIdentity: 'validation/compat-bridge-1',
      validatorIdentity: rt.IDENTITY.compatibilityValidator,
      subject,
      disposition: 'COMPATIBLE',
      currentness: 'current',
    },
    precedenceFacts: {
      capabilityExchange: {
        currentDescriptorEstablished: true,
        currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
        requestedCapabilityKind: 'compatibility-validation',
        requiredInputsStructurallyValid: true,
        materialStaleness: false,
        bindingTargetState: { presence: 'missing' },
      },
      bindingTimeCheckReliedAsCompatibilityResult: false,
      authoritativeResults: [{
        resultViewIdentity: `result/compat-bridge-${real.manifestDigest.slice(0, 16)}`,
        validatorIdentity: rt.IDENTITY.compatibilityValidator,
        validatorDesignated: true,
        disposition: 'COMPATIBLE',
        currentness: 'current',
      }],
      refusalEvidence: [],
      assertedDisposition: 'COMPATIBLE',
    },
  };
}

function bridgedBindingInput(
  real: BridgeMaterial,
  overrides: Partial<DacV0041RuntimeBindingVerificationInput> = {},
): DacV0041RuntimeBindingVerificationInput {
  return {
    bindingRequestRef: mintRuntimeBindingRequestRef({
      baseline: DAC_V0041_BASELINE,
      authorityScope: rt.SCOPE.app,
      primaryIdentity: 'request/binding-bridge-1',
      requesterIdentity: rt.IDENTITY.composer,
      providerIdentity: rt.IDENTITY.producer,
      requestedCapabilityKind: 'runtime-binding',
      materialInputRefs: [manifestMaterialRef(real)],
      bindingTargetRef: rt.buildRef('compatibility-target', real.targetIdentity, {
        contractProfileIdentity: rt.PROFILE.requirements,
      }),
      contractProfileIdentity: rt.PROFILE.v0041,
    }),
    bindingResultRef: rt.buildRef('runtime-binding', 'binding/bridge-record-1'),
    boundRequestIdentity: 'request/binding-bridge-1',
    subject: {
      manifestIdentity: real.manifestIdentity,
      manifestContentDigest: real.manifestDigest,
      dacProfileIdentity: rt.PROFILE.v0041,
    },
    compositionIntake: bridgedIntake(real, real.tierDigest),
    compatibility: bridgedCompatibility(real),
    bindingIssuer: {
      issuerIdentity: rt.IDENTITY.bindingIssuer,
      requiredIssuingRole: rt.ROLE.runtimeBinding,
      issuerDesignationChain: rt.buildChainInput(
        'link/binding-bridge-leaf',
        rt.IDENTITY.bindingIssuer,
        rt.ROLE.runtimeBinding,
        70,
      ),
    },
    bindingIssuanceEvidence: { point: 70, assertedBy: [rt.IDENTITY.witness] },
    sod: rt.buildSodFacts(),
    evaluationPoint: 75,
    ...overrides,
  };
}

function bridgedActivationInput(
  real: BridgeMaterial,
  binding: DacV0041RuntimeBindingVerificationInput,
  overrides: Partial<DacV0041RuntimeActivationVerificationInput> = {},
): DacV0041RuntimeActivationVerificationInput {
  const currentness = { state: 'current', establishedAt: 85, assertedBy: [rt.IDENTITY.witness] };
  return {
    activationRequestRef: rt.buildRef('runtime-activation-request', 'request/activation-bridge-1', {
      contractProfileIdentity: rt.PROFILE.v0041,
    }),
    activationResultRef: rt.buildRef('runtime-activation', 'activation/bridge-record-1'),
    boundRequestIdentity: 'request/activation-bridge-1',
    boundBindingIdentity: 'binding/bridge-record-1',
    boundManifestIdentity: real.manifestIdentity,
    boundManifestContentDigest: real.manifestDigest,
    activationRequestSubject: {
      targetBindingIdentity: 'binding/bridge-record-1',
      targetManifestIdentity: real.manifestIdentity,
      targetManifestContentDigest: real.manifestDigest,
      reliedBindingCurrentness: currentness,
    },
    binding,
    activationIssuer: {
      issuerIdentity: rt.IDENTITY.activationIssuer,
      requiredIssuingRole: rt.ROLE.runtimeActivation,
      issuerDesignationChain: rt.buildChainInput(
        'link/activation-bridge-leaf',
        rt.IDENTITY.activationIssuer,
        rt.ROLE.runtimeActivation,
        80,
      ),
    },
    activationIssuanceEvidence: { point: 80, assertedBy: [rt.IDENTITY.witness] },
    bindingReuseCurrentness: currentness,
    sod: rt.buildSodFacts(),
    evaluationPoint: 85,
    ...overrides,
  };
}

test('NF03 BUILD bridge: runtime binding verifies over real compiled material; an activation record cannot pose as the binding fact', () => {
  const positive = verifyDacV0041RuntimeBinding(bridgedBindingInput(REAL));
  assert.equal(positive.outcome, 'BINDING_VERIFIED');

  // Binding != Activation/load: a minted runtime-ACTIVATION record submitted
  // in the binding-result slot is refused — activation is downstream of and
  // can never substitute for a binding fact.
  const negative = verifyDacV0041RuntimeBinding(bridgedBindingInput(REAL, {
    bindingResultRef: rt.buildRef('runtime-activation', 'activation/poses-as-binding-1'),
  }));
  assert.equal(negative.outcome, 'FAIL_CLOSED');
});

test('NF04 BUILD bridge: activation verifies as a fact distinct from binding; stale external currentness and un-permitted SoD co-hosting are refused', () => {
  const binding = bridgedBindingInput(REAL);
  const positive = verifyDacV0041RuntimeActivation(bridgedActivationInput(REAL, binding));
  assert.equal(positive.outcome, 'ACTIVATION_VERIFIED');

  // External-issuer currentness: a stale binding-reuse determination at the
  // activation point is STALE, never a verified activation.
  const staleCurrentness = { state: 'stale', establishedAt: 85, assertedBy: [rt.IDENTITY.witness] };
  const stale = verifyDacV0041RuntimeActivation(bridgedActivationInput(REAL, binding, {
    bindingReuseCurrentness: staleCurrentness,
    activationRequestSubject: {
      targetBindingIdentity: 'binding/bridge-record-1',
      targetManifestIdentity: REAL.manifestIdentity,
      targetManifestContentDigest: REAL.manifestDigest,
      reliedBindingCurrentness: staleCurrentness,
    },
  }));
  assert.equal(stale.outcome, 'STALE');

  // SoD: co-hosted subject contributor + activation issuer without an
  // explicit SoD permission fails closed.
  const sod = verifyDacV0041RuntimeActivation(bridgedActivationInput(REAL, binding, {
    sod: rt.buildSodFacts({
      subjectContributingIdentities: [rt.IDENTITY.composer],
      coHostingGroups: [[rt.IDENTITY.composer, rt.IDENTITY.activationIssuer]],
      explicitSodPermissionEstablished: false,
      coLocationDisclosed: true,
    }),
  }));
  assert.equal(sod.outcome, 'FAIL_CLOSED');
  assert.equal((sod as { code?: string }).code, 'SOD_PERMISSION_MISSING');
});
