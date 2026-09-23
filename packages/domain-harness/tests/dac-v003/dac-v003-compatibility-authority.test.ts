// Issue #325 / DAC v0.0.3 V3-002 — single compatibility-validation authority
// (CROSS_LAYER_REFERENCES §6.3/§7.3, APPLICATION_MANIFEST §12.1/§12.2):
// exactly one subject/target-bound authority; CompatibilityValidationRef and
// CompatibilityResultRef are encoded separately but always resolve to that
// same authority; the validation identity is deterministic over the full
// evaluated closure, so a second authority or contradictory disposition for
// the same exact subject/target cannot be synthesized.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as surface from '../../src/dac-v003-compatibility/index.js';
import {
  DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
  DAC_V003_COMPATIBILITY_AUTHORITY_VERSION,
  DacV003CompatibilityError,
  adoptDacV003CapabilityRequirement,
  deriveDacV003CompatibilityResult,
  isDacV003CompatibilityResultRefValue,
  isDacV003CompatibilityResultValue,
  isDacV003CompatibilityValidationValue,
  resolveDacV003CompatibilityAuthority,
  assertSameDacV003CompatibilityAuthority,
  validateDacV003Compatibility,
} from '../../src/dac-v003-compatibility/index.js';
import {
  DAC_V003_BASELINE,
  DAC_V003_DISPOSITION_NAMESPACE,
  adoptDacV003RegistryReference,
} from '../../src/dac-v003/index.js';
import { buildCompatibleRequest, buildV003Refs } from './compatibility-fixture.js';

test('v3-002 exported value surface is exactly the frozen authority set (no selection/substitution/lifecycle surface of any name)', () => {
  assert.deepEqual(Object.keys(surface).sort(), [
    'DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE',
    'DAC_V003_COMPATIBILITY_AUTHORITY_VERSION',
    'DAC_V003_REQUIREMENT_KINDS',
    'DAC_V003_REQUIREMENT_STRENGTHS',
    'DAC_V003_UX_SEMANTIC_ROLES',
    'DacV003CompatibilityError',
    'adoptDacV003CapabilityRequirement',
    'adoptDacV003CompatibilityTargetRef',
    'adoptDacV003PortRequirement',
    'adoptDacV003RequirementSatisfactionEvidence',
    'adoptDomainUXDefinitionRef',
    'assertSameDacV003CompatibilityAuthority',
    'dacV003TargetProfileKey',
    'deriveDacV003CompatibilityResult',
    'expectDacV003UxRoleAnchor',
    'isDacV003CapabilityRequirementValue',
    'isDacV003CompatibilityResultRefValue',
    'isDacV003CompatibilityResultValue',
    'isDacV003CompatibilityTargetRefValue',
    'isDacV003CompatibilityValidationRefValue',
    'isDacV003CompatibilityValidationValue',
    'isDacV003PortRequirementValue',
    'isDacV003RequirementSatisfactionEvidenceValue',
    'isDomainUXDefinitionRefValue',
    'refuteDacV003LifecycleBindingInput',
    'resolveDacV003CompatibilityAuthority',
    'validateDacV003Compatibility',
  ]);
});

test('v3-002 nominal full closure validates COMPATIBLE under the single authority', async () => {
  const request = await buildCompatibleRequest();
  const validation = await validateDacV003Compatibility(request);

  assert.equal(validation.compatibility, DAC_V003_COMPATIBILITY_AUTHORITY_VERSION);
  assert.equal(validation.disposition.value, 'COMPATIBLE');
  assert.equal(validation.disposition.namespace, DAC_V003_DISPOSITION_NAMESPACE);
  assert.equal(validation.subject.authorityScope, DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE);
  assert.ok(validation.subject.validationIdentity.startsWith('sha256:'));
  assert.ok(isDacV003CompatibilityValidationValue(validation));
  assert.deepEqual(validation.findings, []);
  for (const entry of validation.requirementClosure) {
    assert.equal(entry.effectiveStrength, 'required');
    assert.equal(entry.satisfiedBy.length, 1, `${entry.kind} satisfied`);
  }
  assert.deepEqual(validation.ux.missingRequiredRoles, []);
});

test('v3-002 deterministic identity: identical closure => identical validation identity and disposition, never a second authority', async () => {
  const request = await buildCompatibleRequest();
  const first = await validateDacV003Compatibility(request);
  const second = await validateDacV003Compatibility(
    await buildCompatibleRequest({ sha256: request.sha256 }),
  );
  assert.equal(first.subject.validationIdentity, second.subject.validationIdentity);
  assert.equal(first.validationRef.primaryIdentity, second.validationRef.primaryIdentity);
  assert.equal(first.disposition.value, second.disposition.value);

  // A different evidence closure is a different validation identity (the
  // subject closure changed), but still the SAME authority scope.
  const unsatisfied = await buildCompatibleRequest({ satisfactionEvidence: [] });
  const third = await validateDacV003Compatibility(unsatisfied);
  assert.notEqual(third.subject.validationIdentity, first.subject.validationIdentity);
  assert.equal(third.subject.authorityScope, first.subject.authorityScope);
  assert.equal(third.disposition.value, 'INCOMPATIBLE');
});

test('v3-002 §6.3: the validator-environment support set is part of the subject and identity — no contradictory disposition under one identity', async () => {
  // Identical subject/target/requirement/evidence closure; ONLY the declared
  // support set differs. The dispositions contradict, so the validation
  // identities MUST differ and the two records must never resolve to one
  // authority (this is the reproduced P1-1 of the first independent review).
  const supported = await validateDacV003Compatibility(
    await buildCompatibleRequest({ supportedTargetProfiles: ['domain-harness@v0.0.3-profile/node-1'] }),
  );
  const unsupported = await validateDacV003Compatibility(
    await buildCompatibleRequest({ supportedTargetProfiles: ['domain-harness@v0.0.3-profile/other'] }),
  );
  assert.equal(supported.disposition.value, 'COMPATIBLE');
  assert.equal(unsupported.disposition.value, 'INCOMPATIBLE');
  assert.notEqual(
    supported.subject.validationIdentity,
    unsupported.subject.validationIdentity,
    'disposition-relevant environment declaration is identity material',
  );
  assert.deepEqual(supported.subject.supportedTargetProfiles, [
    'domain-harness@v0.0.3-profile/node-1',
  ]);
  assert.deepEqual(unsupported.subject.supportedTargetProfiles, [
    'domain-harness@v0.0.3-profile/other',
  ]);
  assert.throws(
    () => assertSameDacV003CompatibilityAuthority(supported.validationRef, unsupported),
    (error: unknown) =>
      error instanceof DacV003CompatibilityError && error.code === 'AUTHORITY_DIVERGENCE',
  );
  assert.throws(
    () => assertSameDacV003CompatibilityAuthority(unsupported.validationRef, supported),
    (error: unknown) =>
      error instanceof DacV003CompatibilityError && error.code === 'AUTHORITY_DIVERGENCE',
  );
  // Support-set order/duplication is not identity-relevant (same declaration).
  const reordered = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      supportedTargetProfiles: [
        'domain-harness@v0.0.3-profile/node-1',
        'domain-harness@v0.0.3-profile/node-1',
      ],
    }),
  );
  assert.equal(
    reordered.subject.validationIdentity,
    supported.subject.validationIdentity,
    'sorted-unique support declaration is canonical',
  );
});

test('v3-002 §11: declared requirement constraints are carried into the closure and the identity, never silently dropped', async () => {
  const baseline = { ...DAC_V003_BASELINE };
  const withConstraints = adoptDacV003CapabilityRequirement({
    baseline,
    authorityScope: 'dac://app-composition/acme',
    primaryIdentity: 'cap-req/persistence-1',
    semanticIdentity: 'capability/durable-storage',
    strength: 'required',
    qualifications: ['region:eu', 'at-rest-encryption'],
    contractProfileIdentity: 'domain-harness@v0.0.3-profile/node-1',
  });
  const constrained = await validateDacV003Compatibility(
    await buildCompatibleRequest({
      capabilityRequirements: [withConstraints],
    }),
  );
  const unconstrained = await validateDacV003Compatibility(await buildCompatibleRequest());
  assert.notEqual(
    constrained.subject.validationIdentity,
    unconstrained.subject.validationIdentity,
    'declared constraints are identity material',
  );
  const entry = constrained.requirementClosure.find(
    (e) => e.requirementIdentity === 'cap-req/persistence-1',
  );
  assert.ok(entry);
  assert.deepEqual(entry.declaredConstraints, [
    'profile:domain-harness@v0.0.3-profile/node-1',
    'qualification:at-rest-encryption',
    'qualification:region:eu',
  ]);
  const portEntry = constrained.requirementClosure.find((e) => e.kind === 'port');
  assert.ok(portEntry);
  assert.deepEqual(portEntry.declaredConstraints, [
    'bindingAuthority:runtime-binding-authority',
  ]);
  const hostBindingEntry = constrained.requirementClosure.find((e) => e.kind === 'host-binding');
  assert.ok(hostBindingEntry);
  assert.deepEqual(hostBindingEntry.declaredConstraints, [
    'requiredHostBindingRole:runtime-port/sqlite-storage',
  ]);
});

test('v3-002 validation act, validation record, result ref and result record all resolve to the one authority', async () => {
  const validation = await validateDacV003Compatibility(await buildCompatibleRequest());
  const result = deriveDacV003CompatibilityResult(validation);

  const expected = {
    authorityScope: DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
    validationIdentity: validation.subject.validationIdentity,
  };
  assert.deepEqual(resolveDacV003CompatibilityAuthority(validation), expected);
  assert.deepEqual(resolveDacV003CompatibilityAuthority(validation.validationRef), expected);
  assert.deepEqual(resolveDacV003CompatibilityAuthority(validation.resultRef), expected);
  assert.deepEqual(resolveDacV003CompatibilityAuthority(result), expected);
  assert.deepEqual(resolveDacV003CompatibilityAuthority(result.resultRef), expected);
  assert.deepEqual(resolveDacV003CompatibilityAuthority(result.validationRef), expected);
  assertSameDacV003CompatibilityAuthority(validation, result);
  assertSameDacV003CompatibilityAuthority(validation.validationRef, validation.resultRef);
  assert.ok(isDacV003CompatibilityResultValue(result));
  assert.equal(result.disposition.value, validation.disposition.value);
});

test('v3-002 a result reference must link exactly one validation in the authority scope', () => {
  const baseline = { ...DAC_V003_BASELINE };
  // A v0.0.3 result-role envelope with no validation link: minted through the
  // foundation generic core, so it passes the role/scope shape guard — only
  // the single-authority resolution exposes the missing link.
  const orphan = adoptDacV003RegistryReference('compatibility-result', {
    baseline,
    authorityScope: DAC_V003_COMPATIBILITY_AUTHORITY_SCOPE,
    primaryIdentity: 'forged-result/1',
    materialInputRefs: [],
    provenanceRefs: [
      adoptDacV003RegistryReference('evidence', {
        baseline,
        authorityScope: 'domain-harness://runtime/compatibility',
        primaryIdentity: 'some-evidence/1',
      }),
    ],
  });
  let caught: unknown;
  assert.ok(isDacV003CompatibilityResultRefValue(orphan));
  try {
    resolveDacV003CompatibilityAuthority(orphan);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003CompatibilityError);
  assert.equal((caught as DacV003CompatibilityError).code, 'AUTHORITY_DIVERGENCE');

  // A foreign scope result-role envelope is not even recognized as this
  // authority's result view.
  const foreignScope = adoptDacV003RegistryReference('compatibility-result', {
    baseline,
    authorityScope: 'someone-else://compatibility',
    primaryIdentity: 'forged-result/2',
  });
  let foreignCaught: unknown;
  assert.equal(isDacV003CompatibilityResultRefValue(foreignScope), false);
  try {
    resolveDacV003CompatibilityAuthority(foreignScope as never);
  } catch (error) {
    foreignCaught = error;
  }
  assert.ok(foreignCaught instanceof DacV003CompatibilityError);
  assert.equal((foreignCaught as DacV003CompatibilityError).code, 'INVALID_COMPATIBILITY_RESULT');
});

test('v3-002 result derivation rejects non-minted validations and forges', async () => {
  const validation = await validateDacV003Compatibility(await buildCompatibleRequest());
  const { compatibility, ...rest } = validation;
  void compatibility;
  const forged = { ...rest };
  let caught: unknown;
  try {
    deriveDacV003CompatibilityResult(forged as never);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof DacV003CompatibilityError);
  assert.equal((caught as DacV003CompatibilityError).code, 'INVALID_COMPATIBILITY_RESULT');
  assert.equal(isDacV003CompatibilityValidationValue(forged), false);

  // Structurally identical forged validation/result records never pass the
  // mint guards.
  assert.equal(isDacV003CompatibilityValidationValue({ ...validation }), false);
  const result = deriveDacV003CompatibilityResult(validation);
  assert.equal(isDacV003CompatibilityResultValue({ ...result }), false);
});

test('v3-002 dispositions stay in the reference/compatibility namespace and this authority emits only its three outcomes', async () => {
  const compatible = await validateDacV003Compatibility(await buildCompatibleRequest());
  const unsupported = await validateDacV003Compatibility(
    await buildCompatibleRequest({ supportedTargetProfiles: ['other@profile'] }),
  );
  const missing = await validateDacV003Compatibility(
    await buildCompatibleRequest({ compatibilityTarget: undefined }),
  );
  const outcomes = new Set([
    compatible.disposition.value,
    unsupported.disposition.value,
    missing.disposition.value,
  ]);
  assert.deepEqual([...outcomes].sort(), ['COMPATIBLE', 'FAIL_CLOSED', 'INCOMPATIBLE']);
  for (const record of [compatible, unsupported, missing]) {
    assert.equal(record.disposition.namespace, DAC_V003_DISPOSITION_NAMESPACE);
  }
});

test('v3-002 subject is bound to the exact upstream intake verdict (pass-through, never re-minted)', async () => {
  const request = await buildCompatibleRequest();
  const validation = await validateDacV003Compatibility(request);
  assert.equal(
    validation.subject.upstreamSelectionValidation,
    request.selectionValidation,
    'the #306 verdict object is carried untouched',
  );
  assert.equal(
    validation.subject.targetProfile,
    'domain-harness@v0.0.3-profile/node-1',
  );
  // The validation act's provenance records the upstream evidence identity.
  const upstream = validation.validationRef.provenanceRefs[0];
  assert.ok(upstream !== undefined);
  assert.equal(upstream.role, 'evidence');
  assert.equal(
    upstream.primaryIdentity,
    `composition-intake/${request.selectionValidation.validatedPackageId}`,
  );
  void buildV003Refs;
});
