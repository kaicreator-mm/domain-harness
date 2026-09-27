// Issue #357 / A41-003 — focused C144 two-view/same-validation-authority
// suite (LIFECYCLE_REFERENCE_REPAIRS §5): one compatibility validation
// record exposes separately recoverable CompatibilityValidationRef and
// CompatibilityResultRef views with ONE authority and a distinct request
// identity; co-storage must never synthesize a second authority, create
// contradictory dispositions, or let two independently-issued validations
// for the same exact subject both count. The two views are NOT peer
// authorities.
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041CompatibilityViewAssociation } from '../../src/dac-v0041/compatibility/index.js';
import {
  IDENTITY,
  VIEW,
  buildAssociationInput,
  buildResultView,
  buildSubject,
  buildValidationView,
} from './helpers.js';
import type { DacV0041CompetingValidationFacts } from '../../src/dac-v0041/compatibility/index.js';

test('a41-003 C144: one record may carry both views with one authority (co-storage positive path)', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      validationView: buildValidationView({ disposition: 'COMPATIBLE' }),
    }),
  );
  assert.equal(result.outcome, 'VALID_TWO_VIEW');
});

test('a41-003 C144: a result view issued by a different validator is a synthesized second authority and fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      resultView: buildResultView({ validatorIdentity: IDENTITY.validatorB }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SECOND_AUTHORITY');
});

test('a41-003 C144: contradictory dispositions inside one co-stored record fail closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      validationView: buildValidationView({ disposition: 'INCOMPATIBLE' }),
      resultView: buildResultView({ disposition: 'COMPATIBLE' }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'CONTRADICTORY_DISPOSITIONS');
});

test('a41-003 C144: consistent co-stored dispositions pass', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      validationView: buildValidationView({ disposition: 'INCOMPATIBLE' }),
      resultView: buildResultView({ disposition: 'INCOMPATIBLE' }),
    }),
  );
  assert.equal(result.outcome, 'VALID_TWO_VIEW');
});

test('a41-003 C144: the two views must cover the identical exact subject', () => {
  for (const divergent of [
    buildSubject({ manifestIdentity: 'manifest/app-x-r4' }),
    buildSubject({ manifestContentDigest: 'sha256:other' }),
    buildSubject({ targetIdentities: [ 'compat-target/runtime-profile-t1', 'compat-target/extra' ] }),
    buildSubject({ requirementsProfileIdentity: 'req-profile/other' }),
    buildSubject({ dacProfileIdentity: 'dac-profile/other' }),
    buildSubject({ runtimeImplementationIdentity: 'impl/runtime-implementation-7' }),
  ]) {
    const result = verifyDacV0041CompatibilityViewAssociation(
      buildAssociationInput({ resultView: buildResultView({ subject: divergent }) }),
    );
    assert.equal(result.outcome, 'FAIL_CLOSED');
    assert.equal(result.code, 'SUBJECT_MISMATCH');
  }
});

test('a41-003 C144: a second independently-issued validation for the same exact subject fails closed (no peer authorities)', () => {
  const competing: DacV0041CompetingValidationFacts[] = [
    {
      validationViewIdentity: VIEW.validation,
      validatorIdentity: IDENTITY.validator,
      subject: buildSubject(),
    },
  ];
  // Same view identity is not a competing record (same validation).
  assert.equal(
    verifyDacV0041CompatibilityViewAssociation(
      buildAssociationInput({ competingValidations: competing }),
    ).outcome,
    'VALID_TWO_VIEW',
  );
  // A different validation identity covering the same subject is barred.
  const barred: DacV0041CompetingValidationFacts[] = [
    {
      validationViewIdentity: 'compat-validation/val-2',
      validatorIdentity: IDENTITY.validatorB,
      subject: buildSubject(),
    },
  ];
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({ competingValidations: barred }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'SECOND_VALIDATION_FOR_SAME_SUBJECT');
});

test('a41-003 C144: a competing validation over a genuinely different subject does not bar the association', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      competingValidations: [
        {
          validationViewIdentity: 'compat-validation/val-2',
          validatorIdentity: IDENTITY.validatorB,
          subject: buildSubject({ manifestIdentity: 'manifest/app-y-r1' }),
        },
      ],
    }),
  );
  assert.equal(result.outcome, 'VALID_TWO_VIEW');
});

test('a41-003 C113: a non-designated validator fails closed for authoritative use', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      validationView: buildValidationView({ validatorDesignated: false }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'NON_DESIGNATED_VALIDATOR');
});

test('a41-003 C144: VALID_TWO_VIEW is a bounded association verdict, never a compatibility PASS or authority', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(buildAssociationInput());
  assert.ok(result.outcome === 'VALID_TWO_VIEW');
  const keys = Object.keys(result);
  for (const forbidden of [
    'compatibilityPass',
    'selected',
    'selection',
    'binding',
    'activation',
    'manifestIssuance',
  ]) {
    assert.equal(keys.indexOf(forbidden), -1);
  }
  assert.match(result.detail, /not a compatibility PASS/u);
});
