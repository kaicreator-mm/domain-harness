// Issue #360 / A41-006 — NOT_OWNED authority boundary closure: prove the
// surfaces the #348 audit classified NOT_OWNED remain external even while
// Harness consumes their evidence:
//
//   Domain authoring/evolution (F-03) | promotion issuance |
//   ApplicationSelection issuance | application-identity establishment
//   issuance | Manifest issuance | AuthorityDesignation issuance /
//   root-scope ownership | DAC conformance-verdict issuance (F-02) |
//   Domain UX semantic authority | external Business SoR truth
//
// Three boundary instruments per concern as applicable:
//   1. registry containment — the role is shared vocabulary only;
//   2. no issuance surface — no successor module exports an issuance verb
//      for it (closed function-name discipline over all five modules);
//   3. fail-closed consumption — presenting a forged/relabeled/authority-
//      shaped carrier of that role to a Harness-owned seam fails closed,
//      and every verified consumption outcome structurally carries
//      evidence-only markers (no authority field a consumer could read).
import assert from 'node:assert/strict';
import test from 'node:test';

import * as foundationModule from '../../src/dac-v0041/index.js';
import {
  DAC_V0041_BASELINE,
  DAC_V0041_ROLE_REGISTRY,
  adoptDacV0041RegistryReference,
} from '../../src/dac-v0041/index.js';
import * as authorityModule from '../../src/dac-v0041/authority/index.js';
import * as compatibilityModule from '../../src/dac-v0041/compatibility/index.js';
import * as compositionIntakeModule from '../../src/dac-v0041/composition-intake/index.js';
import * as runtimeModule from '../../src/dac-v0041/runtime/index.js';
import { verifyDacV0041CompositionIntake } from '../../src/dac-v0041/composition-intake/index.js';
import {
  classifyDacV0041BusinessSorTruthSource,
  verifyDacV0041RuntimeBinding,
} from '../../src/dac-v0041/runtime/index.js';
import * as compositionIntakeFixtures from '../dac-v0041-composition-intake/helpers.js';
import * as runtimeFixtures from '../dac-v0041-runtime/helpers.js';

const SUCCESSOR_MODULES = [
  ['foundation', foundationModule],
  ['authority', authorityModule],
  ['compatibility', compatibilityModule],
  ['composition-intake', compositionIntakeModule],
  ['runtime', runtimeModule],
] as const;

/**
 * Issuance-verb discipline: every exported function name must START with a
 * consumer verb (adopt/mint/is/verify/classify/dac…). Substring matching is
 * deliberately not used — "AuthorityArtifact", "ViewAssociation" etc. are
 * legitimate verifier vocabulary, only an issuance PREFIX would create the
 * NOT_OWNED authority.
 */
const ISSUANCE_VERB_PREFIX =
  /^(issue|grant|promote|select|author|publish|draft|compose|establish|designate|render|approve|decide|sign|verdict|conformance)/iu;

function assertNoIssuanceExports(concern: string): void {
  for (const [label, module] of SUCCESSOR_MODULES) {
    for (const [name, value] of Object.entries(module)) {
      if (typeof value !== 'function') continue;
      assert.ok(
        !ISSUANCE_VERB_PREFIX.test(name),
        `${concern}: module "${label}" exports issuance-shaped function "${name}"`,
      );
    }
  }
}

function registryContains(role: string): void {
  assert.ok(
    (DAC_V0041_ROLE_REGISTRY as readonly string[]).includes(role),
    `registry vocabulary must contain the NOT_OWNED role "${role}"`,
  );
}

test('NOT_OWNED registry containment: every externally owned authority role exists as vocabulary only', () => {
  for (const role of [
    'authored-candidate',
    'evolution-operation',
    'evolution-request',
    'evolved-candidate',
    'domain-authoring-request',
    'domain-authoring-result',
    'authoring-capability-request',
    'authoring-capability-result',
    'promotion-request',
    'promotion-decision',
    'application-selection-request',
    'application-selection',
    'application-identity-establishment-request',
    'application-identity-establishment',
    'manifest-issuance-request',
    'manifest',
    'authority-designation-request',
    'authority-designation',
    'conformance-request',
    'conformance-verdict',
    'domain-ux-definition',
    'domain-application-assembly-plan',
  ]) {
    registryContains(role);
  }
});

test('NOT_OWNED Domain authoring/evolution (F-03): no issuance surface, identity-only adoption, fail-closed promotion claim', () => {
  assertNoIssuanceExports('Domain authoring/evolution');
  const authored = adoptDacV0041RegistryReference({
    role: 'authored-candidate',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/app-alpha',
    primaryIdentity: 'authored/candidate-1',
    opaque: {},
  });
  // Identity-only: adoption creates no decision/evaluation fields.
  assert.deepEqual(
    Object.keys(authored)
      .filter((key) => !['adapter', 'baseline', 'opaque', 'locatorHints'].includes(key))
      .sort(),
    ['authorityScope', 'primaryIdentity', 'role'],
  );
  const result = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput({
      selectedDomainData: [
        compositionIntakeFixtures.buildCoverage('subject/selected-alpha', {
          promotionCoverageRef: authored,
        }),
        compositionIntakeFixtures.buildCoverage('subject/selected-beta'),
      ],
    }),
  );
  assert.ok(result.outcome === 'FAIL_CLOSED');
  assert.equal(result.code, 'ROLE_MISMATCH');
});

test('NOT_OWNED promotion/selection/establishment/Manifest issuance: intake verifies external evidence and returns identity-only evidence markers', () => {
  assertNoIssuanceExports('promotion/selection/establishment/Manifest issuance');
  const intake = verifyDacV0041CompositionIntake(
    compositionIntakeFixtures.buildValidIntakeInput(),
  );
  assert.equal(intake.outcome, 'INTAKE_VERIFIED');
  // The result exposes ONLY recovered evidence identities: no field a
  // consumer could read as created selection/promotion/Manifest authority.
  assert.deepEqual(Object.keys(intake).sort(), [
    'coveredSubjectIdentities',
    'detail',
    'establishmentIdentity',
    'manifestIdentity',
    'outcome',
    'selectionIdentity',
  ]);
});

test('NOT_OWNED AuthorityDesignation issuance/root-scope ownership: the verifier never designates and designation artifacts are non-adoptable', () => {
  assertNoIssuanceExports('AuthorityDesignation issuance');
  // The only designation-related exports are the chain/adoption verifiers.
  const designationExports = [
    ...Object.entries(authorityModule)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name),
  ].filter((name) => /designation/iu.test(name));
  assert.ok(designationExports.every((name) => name.startsWith('verify')));
});

test('NOT_OWNED conformance-verdict issuance (F-02): no verdict surface exists and the vocabulary stays registry-only', () => {
  assertNoIssuanceExports('conformance-verdict issuance');
  registryContains('conformance-verdict');
});

test('NOT_OWNED Domain UX semantic authority: the definition role is adoptable transition material only, never issued or evaluated here', () => {
  assertNoIssuanceExports('Domain UX semantic authority');
  registryContains('domain-ux-definition');
  registryContains('ux-view');
  const definition = adoptDacV0041RegistryReference({
    role: 'domain-ux-definition',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/app-alpha',
    primaryIdentity: 'domain-ux/definition-1',
    opaque: {},
  });
  assert.equal(definition.role, 'domain-ux-definition');
});

test('NOT_OWNED external Business SoR truth: Runtime states never manufacture it and external material stays evidence under external authority semantics', () => {
  assertNoIssuanceExports('external Business SoR truth');
  for (const stateClass of [
    'runtime-accepted',
    'runtime-send-dispatched',
    'provider-acknowledged',
    'runtime-execution-success',
    'activation-state',
  ]) {
    const runtimeState = classifyDacV0041BusinessSorTruthSource({
      presentedStateClass: stateClass,
    });
    assert.ok(runtimeState.outcome === 'RUNTIME_STATE_NOT_SOR_TRUTH', stateClass);
    assert.equal(runtimeState.canManufactureBusinessSorTruth, false);
  }
  for (const stateClass of ['external-sor-observation', 'external-sor-reconciliation']) {
    const externalEvidence = classifyDacV0041BusinessSorTruthSource({
      presentedStateClass: stateClass,
    });
    assert.ok(externalEvidence.outcome === 'EXTERNAL_SOR_EVIDENCE_ONLY', stateClass);
    assert.equal(externalEvidence.canManufactureBusinessSorTruth, false);
    assert.equal(externalEvidence.governedByExternalAuthoritySemantics, true);
  }
  const binding = verifyDacV0041RuntimeBinding(runtimeFixtures.buildValidBindingInput());
  assert.equal(binding.outcome, 'BINDING_VERIFIED');
  assert.equal(binding.isExternalBusinessSorTruth, false);
});

test('NOT_OWNED boundary is enforced even while consuming external evidence: every verified seam outcome carries only evidence-shaped fields', () => {
  const binding = verifyDacV0041RuntimeBinding(runtimeFixtures.buildValidBindingInput());
  assert.equal(binding.outcome, 'BINDING_VERIFIED');
  assert.deepEqual(Object.keys(binding).sort(), [
    'bindingIdentity',
    'bindingIssuerIdentity',
    'compatibilityResultViewIdentity',
    'detail',
    'impliesApplicationSelection',
    'impliesRuntimeActivation',
    'isExternalBusinessSorTruth',
    'manifestContentDigest',
    'manifestIdentity',
    'outcome',
    'requestIdentity',
  ]);
});
