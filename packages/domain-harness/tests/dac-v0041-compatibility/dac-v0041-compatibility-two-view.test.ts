// Issue #357 / A41-003 (R1 repair per #378 comment 5852943693 / #376 P1-1+P1-2)
// — focused C144 two-view/same-validation-authority suite (LIFECYCLE_
// REFERENCE_REPAIRS §5): one compatibility validation record exposes
// separately recoverable CompatibilityValidationRef and CompatibilityResultRef
// views with ONE authority and a distinct request identity; co-storage must
// never synthesize a second authority or create contradictory dispositions
// INSIDE that one record. The one-authority invariant is LOCAL to the two
// views of the SAME record: a second independently-issued validation for the
// same exact subject is not an association defect — mutually consistent
// multiple validations are permitted (APPLICATION_MANIFEST §11), and
// contradiction/currentness across them belongs to the C98/C157 precedence
// rungs. The suite also pins the exact §8 request-subject closure
// (APPLICATION_MANIFEST §8): the subject recovered from the minted request
// (Manifest identity+digest, exact targets, binding target/profile, DAC
// profile, implementation/host-binding when material) must equal the
// validation/result subject exactly before VALID_TWO_VIEW.
import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyDacV0041CompatibilityViewAssociation } from '../../src/dac-v0041/compatibility/index.js';
import {
  IDENTITY,
  SUBJECT,
  buildAssociationInput,
  buildHostBindingRef,
  buildImplementationRef,
  buildManifestRef,
  buildRequestRef,
  buildRequestRefWithoutDacProfile,
  buildResultView,
  buildSubject,
  buildTargetRef,
  buildValidationView,
} from './helpers.js';

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

test('a41-003 C144 (R1): a second independently-issued validation for the same exact subject is NOT an association defect', () => {
  // C144/F-05 one-authority is LOCAL to the two views of the SAME record.
  // A41-003R1 P1-2: frozen APPLICATION_MANIFEST §11 permits multiple
  // material authoritative (mutually consistent) results for the same exact
  // subject/target/profile; the failed HEAD's global
  // SECOND_VALIDATION_FOR_SAME_SUBJECT bar over-constrained C144. Each
  // record's two views verify independently; contradiction/currentness
  // across records belongs to the C98/C157 precedence rungs.
  const first = verifyDacV0041CompatibilityViewAssociation(buildAssociationInput());
  const second = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({ primaryIdentity: 'compat-request/req-2' }),
      validationView: buildValidationView({
        validationViewIdentity: 'compat-validation/val-2',
        boundRequestIdentity: 'compat-request/req-2',
        validatorIdentity: IDENTITY.validatorB,
      }),
      resultView: buildResultView({
        resultViewIdentity: 'compat-result/res-2',
        boundValidationViewIdentity: 'compat-validation/val-2',
        validatorIdentity: IDENTITY.validatorB,
      }),
    }),
  );
  assert.equal(first.outcome, 'VALID_TWO_VIEW');
  assert.equal(second.outcome, 'VALID_TWO_VIEW');
});

test('a41-003 §8 closure: a request minted for a different Manifest identity can never validate this subject', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({
        materialInputRefs: [buildManifestRef('manifest/app-y-r1')],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

test('a41-003 §8 closure: a request binding a different ManifestContentDigest fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({
        materialInputRefs: [buildManifestRef(SUBJECT.manifest, 'sha256:other-digest')],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

test('a41-003 §8 closure: a request with no manifest material input does not close over the subject', () => {
  // This is the exact failed-HEAD positive shape (materialInputRefs = [])
  // that let a request for subject A validate subject B — now an adversarial.
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({ materialInputRefs: [] }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

test('a41-003 §8 closure: a manifest material input without a contentDigest fails closed', () => {
  const bareManifest = buildManifestRef(SUBJECT.manifest);
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({ materialInputRefs: [bareManifest] }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

test('a41-003 §8 closure: a request binding a different requirements/check profile fails closed', () => {
  const mismatched = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({
        bindingTargetRef: buildTargetRef(SUBJECT.target, 'req-profile/other'),
      }),
    }),
  );
  assert.equal(mismatched.outcome, 'FAIL_CLOSED');
  assert.equal(mismatched.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');

  const missing = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({ bindingTargetRef: buildTargetRef() }),
    }),
  );
  assert.equal(missing.outcome, 'FAIL_CLOSED');
  assert.equal(missing.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

test('a41-003 §8 closure: a request binding a different DAC/reference profile fails closed', () => {
  const mismatched = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({ contractProfileIdentity: 'dac-profile/other' }),
    }),
  );
  assert.equal(mismatched.outcome, 'FAIL_CLOSED');
  assert.equal(mismatched.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');

  const missing = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({ requestRef: buildRequestRefWithoutDacProfile() }),
  );
  assert.equal(missing.outcome, 'FAIL_CLOSED');
  assert.equal(missing.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

test('a41-003 §8 closure: an extra compatibility-target material input outside the subject fails closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({
        materialInputRefs: [
          buildManifestRef(SUBJECT.manifest, SUBJECT.digest),
          buildTargetRef(SUBJECT.targetB, SUBJECT.requirements),
        ],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

test('a41-003 §8 closure: a multi-target request validating the identical multi-target subject passes', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({
        materialInputRefs: [
          buildManifestRef(SUBJECT.manifest, SUBJECT.digest),
          buildTargetRef(SUBJECT.targetB, SUBJECT.requirements),
        ],
      }),
      validationView: buildValidationView({
        subject: buildSubject({ targetIdentities: [SUBJECT.target, SUBJECT.targetB] }),
      }),
      resultView: buildResultView({
        subject: buildSubject({ targetIdentities: [SUBJECT.target, SUBJECT.targetB] }),
      }),
    }),
  );
  assert.equal(result.outcome, 'VALID_TWO_VIEW');
});

test('a41-003 §8 closure: implementation/host-binding material inputs must match the subject exactly (both directions)', () => {
  const implementationSubject = buildSubject({
    runtimeImplementationIdentity: SUBJECT.implementation,
    runtimeHostBindingIdentity: SUBJECT.hostBinding,
  });
  // Positive: the request binds both material inputs and both views assert them.
  const positive = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({
        materialInputRefs: [
          buildManifestRef(SUBJECT.manifest, SUBJECT.digest),
          buildImplementationRef(),
          buildHostBindingRef(),
        ],
      }),
      validationView: buildValidationView({ subject: implementationSubject }),
      resultView: buildResultView({ subject: implementationSubject }),
    }),
  );
  assert.equal(positive.outcome, 'VALID_TWO_VIEW');

  // The subject asserts implementation/host-binding the request never bound.
  const unbound = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      validationView: buildValidationView({ subject: implementationSubject }),
      resultView: buildResultView({ subject: implementationSubject }),
    }),
  );
  assert.equal(unbound.outcome, 'FAIL_CLOSED');
  assert.equal(unbound.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');

  // The request binds a different implementation than the subject asserts.
  const divergent = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({
        materialInputRefs: [
          buildManifestRef(SUBJECT.manifest, SUBJECT.digest),
          buildImplementationRef('impl/runtime-implementation-9'),
          buildHostBindingRef(),
        ],
      }),
      validationView: buildValidationView({ subject: implementationSubject }),
      resultView: buildResultView({ subject: implementationSubject }),
    }),
  );
  assert.equal(divergent.outcome, 'FAIL_CLOSED');
  assert.equal(divergent.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');

  // A RuntimeHostBindingRef material input is NOT blanket-forbidden (§8
  // requires binding it when a concrete Host Binding is material) — but a
  // divergent one still fails the closure.
  const divergentHost = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({
        materialInputRefs: [
          buildManifestRef(SUBJECT.manifest, SUBJECT.digest),
          buildImplementationRef(),
          buildHostBindingRef('host-binding/concrete-hb-8'),
        ],
      }),
      validationView: buildValidationView({ subject: implementationSubject }),
      resultView: buildResultView({ subject: implementationSubject }),
    }),
  );
  assert.equal(divergentHost.outcome, 'FAIL_CLOSED');
  assert.equal(divergentHost.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
});

test('a41-003 §8 closure: duplicate single-cardinality material inputs fail closed', () => {
  const result = verifyDacV0041CompatibilityViewAssociation(
    buildAssociationInput({
      requestRef: buildRequestRef({
        materialInputRefs: [buildManifestRef(SUBJECT.manifest, SUBJECT.digest), buildManifestRef('manifest/app-x-r3b', SUBJECT.digest)],
      }),
    }),
  );
  assert.equal(result.outcome, 'FAIL_CLOSED');
  assert.equal(result.code, 'REQUEST_SUBJECT_CLOSURE_MISMATCH');
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
