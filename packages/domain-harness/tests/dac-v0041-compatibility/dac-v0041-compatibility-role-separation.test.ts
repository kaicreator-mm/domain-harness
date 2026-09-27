// Issue #357 / A41-003 — focused role-separation suite (C89 / F-05 /
// LIFECYCLE_REFERENCE_REPAIRS §5; CROSS_LAYER_REFERENCES §6):
// CompatibilityValidationRequestRef != CompatibilityValidationRef !=
// CompatibilityResultRef — anti-alias (no role can substitute another) and
// exact association (result -> exactly its validation -> exactly its
// request; any mismatch, swap or reuse fails closed).
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041CompatibilityViewAssociation } from '../../src/dac-v0041/compatibility/index.js';
import { adoptDacV0041RegistryReference, DAC_V0041_BASELINE } from '../../src/dac-v0041/index.js';
import {
  IDENTITY,
  VIEW,
  buildAssociationInput,
  buildRequestRef,
  buildResultView,
  buildSubject,
  buildValidationView,
} from './helpers.js';

test('a41-003 role separation C89: a request identity aliasing a validation view identity fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      validationView: buildValidationView({
        validationViewIdentity: VIEW.request,
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_VIEW_ALIAS');
});

test('a41-003 role separation C89: a request identity aliasing a result view identity fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      resultView: buildResultView({ resultViewIdentity: VIEW.request }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_VIEW_ALIAS');
});

test('a41-003 role separation F-05: a validation view aliasing the result view identity fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      resultView: buildResultView({ resultViewIdentity: VIEW.validation }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'VIEW_IDENTITY_ALIAS');
});

test('a41-003 role separation: a forged request carrier (structurally identical but not foundation-minted) fails closed', () => {
  const genuine = buildRequestRef();
  const forged = {
    ...genuine,
    adapter: genuine.adapter,
  } as unknown;
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({ requestRef: forged }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'FORGED_REQUEST_REF');
});

test('a41-003 role separation: a plain object / registry reference in the request position fails closed', () => {
  for (const carrier of [
    null,
    {},
    adoptDacV0041RegistryReference({
      role: 'compatibility-validation',
      baseline: DAC_V0041_BASELINE,
      authorityScope: 'scope/domain-a',
      primaryIdentity: VIEW.request,
      opaque: {},
    }),
  ]) {
    const result = verifyDacV0041CompatibilityViewAssociation(
      buildAssociationInput({ requestRef: carrier }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'FORGED_REQUEST_REF');
  }
});

test('a41-003 exact association: a validation bound to a different request identity fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      validationView: buildValidationView({ boundRequestIdentity: 'compat-request/other' }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_ASSOCIATION_MISMATCH');
});

test('a41-003 exact association: a result bound to a different validation view (swap) fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      resultView: buildResultView({
        boundValidationViewIdentity: 'compat-validation/val-other',
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'VALIDATION_ASSOCIATION_MISMATCH');
});

test('a41-003 exact association: reusing another record\'s result view against this validation fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      resultView: buildResultView({
        resultViewIdentity: VIEW.resultB,
        boundValidationViewIdentity: 'compat-validation/val-other',
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'VALIDATION_ASSOCIATION_MISMATCH');
});

test('a41-003 exact association §8: a RuntimeBindingRef material input fails closed', () => {
  const runtimeBinding = adoptDacV0041RegistryReference({
    role: 'runtime-binding',
    baseline: DAC_V0041_BASELINE,
    authorityScope: 'scope/domain-a',
    primaryIdentity: 'binding/runtime-binding-1',
    opaque: {},
  });
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({ materialInputRefs: [runtimeBinding] }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'FORBIDDEN_BINDING_INPUT');
});

test('a41-003 exact association §8: the request\'s binding explicit target must be among the subject targets', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      validationView: buildValidationView({
        subject: buildSubject({ targetIdentities: [ 'compat-target/other' ] }),
      }),
      resultView: buildResultView({
        subject: buildSubject({ targetIdentities: [ 'compat-target/other' ] }),
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'TARGET_ASSOCIATION_MISMATCH');
});

test('a41-003 anti-alias: mutable alias tokens never substitute exact seam identities', () => {
  for (const overrides of [
    { validationView: buildValidationView({ validationViewIdentity: 'latest' }) },
    { resultView: buildResultView({ resultViewIdentity: 'current' }) },
    {
      validationView: buildValidationView({
        subject: buildSubject({ manifestIdentity: 'head' }),
      }),
      resultView: buildResultView({
        subject: buildSubject({ manifestIdentity: 'head' }),
      }),
    },
  ]) {
    const result = verifyDacV0041CompatibilityViewAssociation(
      buildAssociationInput(overrides),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'MUTABLE_ALIAS_IDENTITY');
  }
});

test('a41-003 role separation: the well-formed two-view association passes with distinct identities', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(buildAssociationInput());
  assert.equal(result.outcome, 'VALID_TWO_VIEW');
  assert.ok(result.outcome === 'VALID_TWO_VIEW');
  assert.equal(result.requestIdentity, VIEW.request);
  assert.equal(result.validationViewIdentity, VIEW.validation);
  assert.equal(result.resultViewIdentity, VIEW.result);
  assert.equal(result.validatorIdentity, IDENTITY.validator);
  assert.equal(result.singleAuthority, true);
});

test('a41-003 role separation: malformed facts objects fail closed as INVALID_FACTS', () => {
  for (const input of [
    null,
    { requestRef: buildRequestRef() },
    {
      requestRef: buildRequestRef(),
      validationView: { validationViewIdentity: '' },
      resultView: buildResultView(),
    },
    {
      requestRef: buildRequestRef(),
      validationView: buildValidationView(),
      resultView: { resultViewIdentity: VIEW.result, disposition: 'MAYBE' },
    },
    buildAssociationInput({ competingValidations: 'nope' as never }),
  ]) {
    const result = verifyDacV0041CompatibilityViewAssociation(input as never);
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'INVALID_FACTS');
  }
});

test('a41-003 role separation: the request keeps its nominal request role and exact binding target', () => {
  const request = buildRequestRef();
  assert.equal(request.role, 'compatibility-validation-request');
  assert.equal(request.bindingTargetRef?.role, 'compatibility-target');
  assert.equal(request.primaryIdentity, VIEW.request);
});
