// Issue #360 / A41-006 — F-01..F-08 complete group mapping plus the two
// baseline-integrity dimensions of the #360 acceptance list:
//
//   - historical v0.0.3 remains separately version-bound (never relabeled
//     as v0.0.4/v0.0.4.1 conformance, never mutated, byte-separate from the
//     successor adapter);
//   - no fabricated intermediate Harness v0.0.4 release (v0.0.4 exists
//     only as a frozen predecessor identity retained for transition/
//     adoption evidence).
//
// Each F row is mapped to its owning executable surface with the audit
// ownership classification preserved (F-02/F-03 are NOT_OWNED; the rest are
// the implemented Harness-owned verifier seams). Per-row C-executable
// evidence lives in the two matrix suites; this file anchors the F-level
// obligations and the boundary inventory.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as foundationModule from '../../src/dac-v0041/index.js';
import {
  DAC_V0041_BASELINE,
  DAC_V0041_PREDECESSOR_BASELINES,
  DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE,
  DacV0041ReferenceError,
  adoptDacV0041RegistryReference,
} from '../../src/dac-v0041/index.js';
import * as authorityModule from '../../src/dac-v0041/authority/index.js';
import {
  DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES,
  DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES,
  verifyDacV0041AuthorityAdoption,
  verifyDacV0041DesignationChain,
} from '../../src/dac-v0041/authority/index.js';
import * as compatibilityModule from '../../src/dac-v0041/compatibility/index.js';
import {
  classifyDacV0041CompatibilityPrecedence,
  verifyDacV0041CompatibilityViewAssociation,
} from '../../src/dac-v0041/compatibility/index.js';
import * as compositionIntakeModule from '../../src/dac-v0041/composition-intake/index.js';
import { verifyDacV0041CompositionIntake } from '../../src/dac-v0041/composition-intake/index.js';
import * as runtimeModule from '../../src/dac-v0041/runtime/index.js';
import {
  classifyDacV0041BusinessSorTruthSource,
  verifyDacV0041RuntimeActivation,
  verifyDacV0041RuntimeBinding,
} from '../../src/dac-v0041/runtime/index.js';
import { DAC_V003_BASELINE } from '../../src/dac-v003/index.js';
import * as authorityFixtures from '../dac-v0041-authority/helpers.js';
import * as compatibilityFixtures from '../dac-v0041-compatibility/helpers.js';
import * as compositionIntakeFixtures from '../dac-v0041-composition-intake/helpers.js';
import * as runtimeFixtures from '../dac-v0041-runtime/helpers.js';

const SUCCESSOR_MODULES = [
  foundationModule,
  authorityModule,
  compatibilityModule,
  compositionIntakeModule,
  runtimeModule,
] as const;

function exportedFunctionNames(
  module: (typeof SUCCESSOR_MODULES)[number],
): string[] {
  return Object.entries(module)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name);
}

// ---------------------------------------------------------------------------
// F-01 — designation delegation / currentness: owner-rooted chain verifier.
// ---------------------------------------------------------------------------

test('F-01 mapping: the designation-chain verifier enforces the owner-rooted attenuation/currentness family and never issues designations', () => {
  const current = verifyDacV0041DesignationChain(
    authorityFixtures.buildDepthOneChainInput(60),
  );
  assert.equal(current.outcome, 'CHAIN_CURRENT');
  const attenuated = verifyDacV0041DesignationChain(
    authorityFixtures.buildPromotionChainInput(60, {
      links: [
        authorityFixtures.buildPromotionLeafLink({
          authorityScope: authorityFixtures.SCOPE.domainB,
        }),
        authorityFixtures.buildRootIssuanceLink(),
      ],
    }),
  );
  assert.ok(attenuated.outcome === 'FAIL_CLOSED');
  assert.equal(attenuated.code, 'SCOPE_NOT_ENVELOPED');
  const functions = exportedFunctionNames(authorityModule);
  assert.deepEqual(
    functions.filter((name) => name.startsWith('mint') || name.startsWith('issue')),
    [],
  );
});

// ---------------------------------------------------------------------------
// F-02 / F-03 — conformance-verdict independence and Domain authoring:
// NOT_OWNED (boundary inventory).
// ---------------------------------------------------------------------------

test('F-02 mapping [NOT_OWNED]: no successor module exports conformance-verdict issuance, review or independence classification', () => {
  for (const module of SUCCESSOR_MODULES) {
    for (const name of exportedFunctionNames(module)) {
      assert.ok(
        !/verdict|independence|conformanceClassif/iu.test(name),
        `unexpected conformance-verdict authority export "${name}"`,
      );
    }
  }
  // Verdict vocabulary stays registry-only and non-adoptable.
  assert.ok(
    (DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES as readonly string[]).includes(
      'conformance-verdict',
    ),
  );
});

test('F-03 mapping [NOT_OWNED]: authoring/evolution producer roles stay external vocabulary with no issuance surface', () => {
  for (const module of SUCCESSOR_MODULES) {
    for (const name of exportedFunctionNames(module)) {
      assert.ok(
        !/^(issue|grant|promote|select|author|publish|approve|decide)/iu.test(name),
        `unexpected issuance-verb export "${name}"`,
      );
    }
  }
  const mintNames = SUCCESSOR_MODULES.flatMap((module) =>
    exportedFunctionNames(module).filter((name) => name.startsWith('mint')),
  ).sort();
  // The only minting constructors are the two Harness-owned REQUEST roles.
  assert.deepEqual(mintNames, [
    'mintCompatibilityValidationRequestRef',
    'mintRuntimeBindingRequestRef',
  ]);
});

// ---------------------------------------------------------------------------
// F-04 — application identity / selection / refusal intake verifier.
// ---------------------------------------------------------------------------

test('F-04 mapping: composition intake verifies the establishment → selection → Manifest → refusal chain without creating any of it', () => {
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput(),
  );
  assert.ok(result.outcome === 'INTAKE_VERIFIED');
  // The verified result exposes evidence identities only: no Composer,
  // selection, promotion or Manifest authority is created by intake.
  assert.deepEqual(Object.keys(result).sort(), [
    'coveredSubjectIdentities',
    'detail',
    'establishmentIdentity',
    'manifestIdentity',
    'outcome',
    'selectionIdentity',
  ]);
  const refused = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({ refusalDisclosureComplete: false }),
  );
  assert.ok(refused.outcome === 'FAIL_CLOSED');
  assert.equal(refused.code, 'MATERIAL_REFUSAL_OMITTED');
});

// ---------------------------------------------------------------------------
// F-05 — compatibility two-view clarification.
// ---------------------------------------------------------------------------

test('F-05 mapping: one validation authority exposes two separately recoverable views and never aliases the request', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    compatibilityFixtures.buildAssociationInput(),
  );
  assert.ok(result.outcome === 'VALID_TWO_VIEW');
  assert.equal(result.singleAuthority, true);
  const verdict = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts(),
  );
  assert.equal(verdict.outcome, 'COMPATIBLE_VERDICT');
});

// ---------------------------------------------------------------------------
// F-06 — predecessor authority adoption.
// ---------------------------------------------------------------------------

test('F-06 mapping: adoption is prospective, same-class-bound and independently evidenced; non-adoptable classes fail closed', () => {
  const adopted = verifyDacV0041AuthorityAdoption(
    authorityFixtures.buildValidAdoptionFacts(),
  );
  assert.ok(adopted.outcome === 'ADOPTED_PROSPECTIVE');
  assert.equal(adopted.effectiveFrom, 60);
  for (const adoptable of DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES) {
    assert.ok(
      !(DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES as readonly string[]).includes(adoptable),
      `class "${adoptable}" is both adoptable and non-adoptable`,
    );
  }
  assert.ok(
    (DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES as readonly string[]).includes(
      'authority-designation',
    ),
  );
});

// ---------------------------------------------------------------------------
// F-07 — decision/producer separation of duties.
// ---------------------------------------------------------------------------

test('F-07 mapping: SoD blocks self-approval and undisclosed co-hosting while preserving legitimate separately designated multi-role authority', () => {
  const selfApproval = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      sod: runtimeFixtures.buildSodFacts({
        subjectContributingIdentities: [runtimeFixtures.IDENTITY.bindingIssuer],
        explicitSodPermissionEstablished: true,
        coLocationDisclosed: true,
      }),
    }),
  );
  assert.ok(selfApproval.outcome === 'FAIL_CLOSED');
  assert.equal(selfApproval.code, 'SELF_APPROVAL');
  const legitimateMultiRole = verifyDacV0041RuntimeBinding(
    runtimeFixtures.buildValidBindingInput({
      compatibilityValidatorIdentity: runtimeFixtures.IDENTITY.bindingIssuer,
    }),
  );
  assert.equal(legitimateMultiRole.outcome, 'BINDING_VERIFIED');
});

// ---------------------------------------------------------------------------
// F-08 — deterministic capability/currentness/request precedence.
// ---------------------------------------------------------------------------

test('F-08 mapping: the precedence ladder is deterministic — kind absence precedes everything, structural invalidity dominates staleness', () => {
  const structuralDominatesStaleness = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      capabilityExchange: {
        currentDescriptorEstablished: true,
        currentDescriptorOfferedCapabilityKinds: ['compatibility-validation'],
        requestedCapabilityKind: 'compatibility-validation',
        requiredInputsStructurallyValid: false,
        materialStaleness: true,
        bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
      },
    }),
  );
  assert.ok(structuralDominatesStaleness.outcome === 'FAIL_CLOSED');
  assert.equal(structuralDominatesStaleness.code, 'STRUCTURALLY_INVALID_INPUT');
  const kindAbsencePrecedesTarget = classifyDacV0041CompatibilityPrecedence(
    compatibilityFixtures.buildPrecedenceFacts({
      capabilityExchange: {
        currentDescriptorEstablished: true,
        currentDescriptorOfferedCapabilityKinds: [],
        requestedCapabilityKind: 'compatibility-validation',
        requiredInputsStructurallyValid: false,
        materialStaleness: true,
        bindingTargetState: { presence: 'explicit', declaredSupport: 'unsupported' },
      },
    }),
  );
  assert.equal(kindAbsencePrecedesTarget.outcome, 'BLOCKED_MISSING_CAPABILITY');
});

// ---------------------------------------------------------------------------
// Baseline integrity: historical v0.0.3 and the non-fabricated v0.0.4.
// ---------------------------------------------------------------------------

test('historical v0.0.3 stays separately version-bound and byte-separate from the successor adapter', () => {
  assert.equal(DAC_V003_BASELINE.version, 'v0.0.3');
  assert.equal(DAC_V003_BASELINE.semanticFreezeCommit, '3322b2152253b3c60f254c23a4f9ab1a14e063d1');
  assert.notEqual(DAC_V003_BASELINE.semanticFreezeCommit, DAC_V0041_BASELINE.semanticFreezeCommit);
  assert.equal(DAC_V0041_BASELINE.version, 'v0.0.4.1');
  assert.equal(DAC_V0041_BASELINE.semanticFreezeCommit, '75fee75b782ac229720dccd18d2a4ca54b285e51');
  assert.equal(DAC_V0041_BASELINE.semanticFreezeTree, 'c74cf5e3a0e6745da3eda6999836b61ee8103c60');
  // A v0.0.3 baseline can never satisfy the successor pin.
  assert.throws(
    () =>
      adoptDacV0041RegistryReference({
        role: 'promotion-decision',
        baseline: DAC_V003_BASELINE,
        authorityScope: 'scope/domain-a',
        primaryIdentity: 'artifact/v003-direct-1',
        opaque: {},
      }),
    (error: unknown) =>
      error instanceof DacV0041ReferenceError && error.code === 'UNSUPPORTED_DAC_BASELINE',
  );
});

test('no fabricated intermediate Harness v0.0.4 release: v0.0.4 exists only as frozen predecessor transition/adoption evidence', () => {
  const v004 = DAC_V0041_PREDECESSOR_BASELINES.find(
    (baseline) => baseline.version === 'v0.0.4',
  );
  assert.ok(v004 !== undefined);
  assert.equal(v004.semanticFreezeCommit, '0d31feec751cf21d2ae29de16315d35f73b0b8c8');
  assert.equal(v004.purpose, DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE);
  for (const baseline of DAC_V0041_PREDECESSOR_BASELINES) {
    assert.equal(baseline.purpose, DAC_V0041_PREDECESSOR_EVIDENCE_PURPOSE);
    assert.notEqual(baseline.semanticFreezeCommit, DAC_V0041_BASELINE.semanticFreezeCommit);
  }
  // The successor surface pins exactly one successor baseline identity.
  assert.equal(DAC_V0041_BASELINE.version, 'v0.0.4.1');
});

// ---------------------------------------------------------------------------
// Runtime consequence boundary (§17) closes the F-map to the Runtime seam.
// ---------------------------------------------------------------------------

test('runtime consequence stays on the evidence side of the external Business SoR boundary', () => {
  const runtimeState = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: 'activation-state',
  });
  assert.ok(runtimeState.outcome === 'RUNTIME_STATE_NOT_SOR_TRUTH');
  assert.equal(runtimeState.canManufactureBusinessSorTruth, false);
  const externalEvidence = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: 'external-sor-observation',
  });
  assert.ok(externalEvidence.outcome === 'EXTERNAL_SOR_EVIDENCE_ONLY');
  assert.equal(externalEvidence.governedByExternalAuthoritySemantics, true);
  const unknown = classifyDacV0041BusinessSorTruthSource({
    presentedStateClass: 'sor-truth-mystery',
  });
  assert.ok(unknown.outcome === 'FAIL_CLOSED');
  assert.equal(unknown.code, 'UNKNOWN_STATE_CLASS');
  const activation = verifyDacV0041RuntimeActivation(
    runtimeFixtures.buildValidActivationInput(),
  );
  assert.equal(activation.outcome, 'ACTIVATION_VERIFIED');
  assert.equal(activation.manufacturesUpstreamAuthority, false);
  assert.equal(activation.isExternalBusinessSorTruth, false);
});
