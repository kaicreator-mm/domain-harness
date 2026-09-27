// Issue #357 / A41-003: deterministic consumer/verifier functions for the
// DAC v0.0.4.1 successor compatibility/capability/refusal/currentness seam
// (LIFECYCLE_REFERENCE_REPAIRS §5 F-05 + §4.2; APPLICATION_MANIFEST §§8–§11;
// ASSEMBLY_CAPABILITY_EXCHANGE §5 + §13; CONFORMANCE_MATRIX C84/C85/C98/
// C99/C144 + C150–C153/C170/C171).
//
// CONSUMER ONLY — never an issuer. Every function is pure and total over
// externally recovered facts: malformed or hostile inputs are returned as
// typed FAIL_CLOSED results (never thrown, never guessed, never repaired,
// never issued externally). No function here mints a
// CompatibilityValidationRef/CompatibilityResultRef or expands a
// compatibility designation, and no function manufactures a target,
// selection, binding or activation authority out of refusal/negative
// evidence.
//
// The capability/currentness Steps 0–3 are COMPOSED from the frozen A41-001
// foundation classifier (`classifyDacV0041CapabilityExchange`) — this module
// never restates or reorders that precedence; it only continues it with the
// compatibility-specific ladder rungs (C98/C99/C157/C113 and the
// negative-evidence ceiling) documented on the result type in contracts.ts.
//
// Portable: no Node built-ins; imports only the A41-001 foundation.

import {
  isCompatibilityValidationRequestRef,
  classifyDacV0041CapabilityExchange,
} from '../guards.js';
import type { CompatibilityValidationRequestRef } from '../contracts.js';
import {
  DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS,
  type DacV0041AuthorityRefusalEvidenceClassification,
  type DacV0041AuthorityRefusalEvidenceFacts,
  type DacV0041CompatibilityPrecedenceClassification,
  type DacV0041CompatibilityPrecedenceFacts,
  type DacV0041CompatibilitySubjectFacts,
  type DacV0041CompatibilityViewAssociation,
  type DacV0041CompatibilityViewAssociationInput,
  type DacV0041CompetingValidationFacts,
  type DacV0041RefusalEvidenceFailureCode,
  type DacV0041CompatibilityAssociationFailureCode,
} from './contracts.js';

/** Mutable alias tokens (CROSS_LAYER_REFERENCES §8), mirrored from the frozen foundation set. */
const MUTABLE_ALIAS_TOKENS = new Set([
  'latest',
  'current',
  'head',
  'main',
  'master',
  'default',
  'stable',
  'tip',
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMutableAliasToken(value: string): boolean {
  return MUTABLE_ALIAS_TOKENS.has(value.trim().toLowerCase());
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

function isCurrentnessState(value: unknown): boolean {
  return (
    value === 'current' ||
    value === 'stale' ||
    value === 'superseded' ||
    value === 'revoked' ||
    value === 'voided'
  );
}

function isDisposition(value: unknown): value is 'COMPATIBLE' | 'INCOMPATIBLE' {
  return value === 'COMPATIBLE' || value === 'INCOMPATIBLE';
}

function associationFail(
  code: DacV0041CompatibilityAssociationFailureCode,
  detail: string,
): DacV0041CompatibilityViewAssociation {
  return { outcome: 'FAIL_CLOSED', code, detail };
}

/** Deterministic exact-subject sameness: every closed field identical. */
function sameSubject(
  a: DacV0041CompatibilitySubjectFacts,
  b: DacV0041CompatibilitySubjectFacts,
): boolean {
  if (
    a.manifestIdentity !== b.manifestIdentity ||
    a.manifestContentDigest !== b.manifestContentDigest ||
    a.requirementsProfileIdentity !== b.requirementsProfileIdentity ||
    a.dacProfileIdentity !== b.dacProfileIdentity
  ) {
    return false;
  }
  if (a.runtimeImplementationIdentity !== b.runtimeImplementationIdentity) return false;
  if (a.runtimeHostBindingIdentity !== b.runtimeHostBindingIdentity) return false;
  if (a.targetIdentities.length !== b.targetIdentities.length) return false;
  return a.targetIdentities.every(
    (identity, index) => identity === b.targetIdentities[index],
  );
}

function subjectShapeFailure(subject: unknown): string | null {
  if (subject === null || typeof subject !== 'object') {
    return 'compatibility subject must be an object';
  }
  const candidate = subject as Partial<DacV0041CompatibilitySubjectFacts>;
  for (const field of [
    'manifestIdentity',
    'manifestContentDigest',
    'requirementsProfileIdentity',
    'dacProfileIdentity',
  ] as const) {
    if (!isNonEmptyString(candidate[field])) {
      return `compatibility subject field ${field} must be a non-empty string`;
    }
  }
  if (!isStringArray(candidate.targetIdentities) || candidate.targetIdentities.length === 0) {
    return 'compatibility subject targetIdentities must be a non-empty list of non-empty strings';
  }
  if (
    candidate.runtimeImplementationIdentity !== undefined &&
    !isNonEmptyString(candidate.runtimeImplementationIdentity)
  ) {
    return 'runtimeImplementationIdentity must be a non-empty string when present';
  }
  if (
    candidate.runtimeHostBindingIdentity !== undefined &&
    !isNonEmptyString(candidate.runtimeHostBindingIdentity)
  ) {
    return 'runtimeHostBindingIdentity must be a non-empty string when present';
  }
  return null;
}

/** Collect every mutable-alias identity in a subject for the fail-closed detail. */
function subjectMutableAlias(subject: DacV0041CompatibilitySubjectFacts): string | null {
  const identities = [
    subject.manifestIdentity,
    ...subject.targetIdentities,
    subject.requirementsProfileIdentity,
    ...(subject.runtimeImplementationIdentity === undefined
      ? []
      : [subject.runtimeImplementationIdentity]),
    ...(subject.runtimeHostBindingIdentity === undefined
      ? []
      : [subject.runtimeHostBindingIdentity]),
    subject.dacProfileIdentity,
  ];
  return identities.find((identity) => isMutableAliasToken(identity)) ?? null;
}

/**
 * C144 / C89 / F-05 two-view association verifier: one validation record
 * exposes separately recoverable `CompatibilityValidationRef` and
 * `CompatibilityResultRef` views with exactly ONE validation authority and a
 * distinct request identity. Pure, total, fail-closed. Frozen pass order:
 *
 *   1. shape/facts validation            (INVALID_FACTS; forged request carrier
 *                                         => FORGED_REQUEST_REF — only a
 *                                         foundation-minted request passes)
 *   2. mutable-alias identity check      (MUTABLE_ALIAS_IDENTITY)
 *   3. pairwise identity anti-alias      (REQUEST_VIEW_ALIAS C89;
 *                                         VIEW_IDENTITY_ALIAS F-05)
 *   4. forbidden binding inputs          (FORBIDDEN_BINDING_INPUT §8:
 *                                         RuntimeBindingRef MUST NOT be a
 *                                         compatibility-validation input)
 *   5. exact association request->view   (REQUEST_ASSOCIATION_MISMATCH)
 *   6. exact association view->result    (VALIDATION_ASSOCIATION_MISMATCH:
 *                                         any swap/reuse fails closed)
 *   7. request target binding            (TARGET_ASSOCIATION_MISMATCH §8)
 *   8. subject equality across views     (SUBJECT_MISMATCH)
 *   9. single authority                  (SECOND_AUTHORITY F-05 co-storage)
 *  10. no second independent validation
 *       for the same exact subject       (SECOND_VALIDATION_FOR_SAME_SUBJECT
 *                                         C144; C98 evidence bar)
 *  11. no contradictory dispositions     (CONTRADICTORY_DISPOSITIONS F-05)
 *  12. validator designation             (NON_DESIGNATED_VALIDATOR C113)
 *  13. otherwise => VALID_TWO_VIEW (PASS subject to all other checks; never
 *      itself a compatibility PASS or any selection/binding/activation
 *      authority).
 */
export function verifyDacV0041CompatibilityViewAssociation(
  input: DacV0041CompatibilityViewAssociationInput,
): DacV0041CompatibilityViewAssociation {
  // Pass 1: shape.
  if (input === null || typeof input !== 'object') {
    return associationFail('INVALID_FACTS', 'view association input must be an object');
  }
  const candidate = input as Partial<DacV0041CompatibilityViewAssociationInput>;
  if (!isCompatibilityValidationRequestRef(candidate.requestRef)) {
    return associationFail(
      'FORGED_REQUEST_REF',
      'requestRef must be a CompatibilityValidationRequestRef minted by the DAC v0.0.4.1 foundation core (foreign/forged carriers fail closed)',
    );
  }
  const request = candidate.requestRef as CompatibilityValidationRequestRef;
  const validation = candidate.validationView;
  if (validation === null || typeof validation !== 'object') {
    return associationFail('INVALID_FACTS', 'validationView must be an object');
  }
  const result = candidate.resultView;
  if (result === null || typeof result !== 'object') {
    return associationFail('INVALID_FACTS', 'resultView must be an object');
  }
  const validationCandidate = validation as Partial<
    DacV0041CompatibilityViewAssociationInput['validationView']
  >;
  const resultCandidate = result as Partial<
    DacV0041CompatibilityViewAssociationInput['resultView']
  >;
  for (const field of ['validationViewIdentity', 'boundRequestIdentity', 'validatorIdentity'] as const) {
    if (!isNonEmptyString(validationCandidate[field])) {
      return associationFail('INVALID_FACTS', `validationView field ${field} must be a non-empty string`);
    }
  }
  if (typeof validationCandidate.validatorDesignated !== 'boolean') {
    return associationFail('INVALID_FACTS', 'validationView validatorDesignated must be a boolean');
  }
  if (
    validationCandidate.disposition !== undefined &&
    !isDisposition(validationCandidate.disposition)
  ) {
    return associationFail('INVALID_FACTS', 'validationView disposition must be COMPATIBLE or INCOMPATIBLE when present');
  }
  for (const field of ['resultViewIdentity', 'boundValidationViewIdentity', 'validatorIdentity'] as const) {
    if (!isNonEmptyString(resultCandidate[field])) {
      return associationFail('INVALID_FACTS', `resultView field ${field} must be a non-empty string`);
    }
  }
  if (!isDisposition(resultCandidate.disposition)) {
    return associationFail('INVALID_FACTS', 'resultView disposition must be COMPATIBLE or INCOMPATIBLE');
  }
  if (!isCurrentnessState(resultCandidate.currentness)) {
    return associationFail('INVALID_FACTS', 'resultView currentness must be a closed-vocabulary currentness state');
  }
  const validationSubjectFailure = subjectShapeFailure(validationCandidate.subject);
  if (validationSubjectFailure !== null) {
    return associationFail('INVALID_FACTS', `validationView subject: ${validationSubjectFailure}`);
  }
  const resultSubjectFailure = subjectShapeFailure(resultCandidate.subject);
  if (resultSubjectFailure !== null) {
    return associationFail('INVALID_FACTS', `resultView subject: ${resultSubjectFailure}`);
  }
  const competingValidations =
    candidate.competingValidations === undefined ? [] : candidate.competingValidations;
  if (!Array.isArray(competingValidations)) {
    return associationFail('INVALID_FACTS', 'competingValidations must be an array when present');
  }
  for (const competing of competingValidations) {
    if (competing === null || typeof competing !== 'object') {
      return associationFail('INVALID_FACTS', 'each competing validation must be an object');
    }
    const competingCandidate = competing as Partial<DacV0041CompetingValidationFacts>;
    if (
      !isNonEmptyString(competingCandidate.validationViewIdentity) ||
      !isNonEmptyString(competingCandidate.validatorIdentity)
    ) {
      return associationFail('INVALID_FACTS', 'competing validation identities must be non-empty strings');
    }
    const competingSubjectFailure = subjectShapeFailure(competingCandidate.subject);
    if (competingSubjectFailure !== null) {
      return associationFail('INVALID_FACTS', `competing validation subject: ${competingSubjectFailure}`);
    }
  }

  const validationView = candidate.validationView;
  const resultView = candidate.resultView;
  const requestIdentity = request.primaryIdentity;

  // Pass 2: mutable aliases.
  const aliasIdentities: readonly string[] = [
    requestIdentity,
    validationView.validationViewIdentity,
    resultView.resultViewIdentity,
  ];
  for (const identity of aliasIdentities) {
    if (isMutableAliasToken(identity)) {
      return associationFail(
        'MUTABLE_ALIAS_IDENTITY',
        `identity "${identity}" is a mutable alias token and can never substitute an exact seam identity`,
      );
    }
  }
  for (const subject of [validationView.subject, resultView.subject]) {
    const mutable = subjectMutableAlias(subject);
    if (mutable !== null) {
      return associationFail(
        'MUTABLE_ALIAS_IDENTITY',
        `compatibility subject identity "${mutable}" is a mutable alias token and can never substitute an exact identity`,
      );
    }
  }

  // Pass 3: pairwise anti-alias (C89 + F-05).
  if (
    requestIdentity === validationView.validationViewIdentity ||
    requestIdentity === resultView.resultViewIdentity
  ) {
    return associationFail(
      'REQUEST_VIEW_ALIAS',
      `request identity "${requestIdentity}" aliases a validation/result view identity; CompatibilityValidationRequestRef must remain distinct from CompatibilityValidationRef and CompatibilityResultRef (C89/F-05)`,
    );
  }
  if (validationView.validationViewIdentity === resultView.resultViewIdentity) {
    return associationFail(
      'VIEW_IDENTITY_ALIAS',
      `validation view identity "${validationView.validationViewIdentity}" aliases the result view identity; the two views are separately recoverable semantic views (F-05) and must not share one identity`,
    );
  }

  // Pass 4: forbidden binding inputs (APPLICATION_MANIFEST §8).
  for (const material of request.materialInputRefs) {
    if (
      material.role === 'runtime-binding' ||
      material.role === 'runtime-host-binding' ||
      material.role === 'runtime-activation'
    ) {
      return associationFail(
        'FORBIDDEN_BINDING_INPUT',
        `material input of role "${material.role}" MUST NOT be a compatibility-validation input for proving the compatibility that must precede binding (§8)`,
      );
    }
  }

  // Pass 5: request -> validation exact association.
  if (validationView.boundRequestIdentity !== requestIdentity) {
    return associationFail(
      'REQUEST_ASSOCIATION_MISMATCH',
      `validation view binds request "${validationView.boundRequestIdentity}" but the presented request is "${requestIdentity}"; a validation binds to exactly its request`,
    );
  }

  // Pass 6: validation -> result exact association (swap/reuse fails).
  if (resultView.boundValidationViewIdentity !== validationView.validationViewIdentity) {
    return associationFail(
      'VALIDATION_ASSOCIATION_MISMATCH',
      `result view binds validation "${resultView.boundValidationViewIdentity}" but the presented validation view is "${validationView.validationViewIdentity}"; a result binds to exactly its validation`,
    );
  }

  // Pass 7: request binding target association (§8 exact targets).
  if (request.bindingTargetRef !== undefined) {
    if (
      validationView.subject.targetIdentities.indexOf(
        request.bindingTargetRef.primaryIdentity,
      ) === -1
    ) {
      return associationFail(
        'TARGET_ASSOCIATION_MISMATCH',
        `the request's binding explicit target "${request.bindingTargetRef.primaryIdentity}" is not among the validation subject's exact target identities; the request MUST bind the exact compatibility targets it validates`,
      );
    }
  }

  // Pass 8: subject equality across the two views.
  if (!sameSubject(validationView.subject, resultView.subject)) {
    return associationFail(
      'SUBJECT_MISMATCH',
      'the validation view and the result view carry different exact compatibility subjects; both views of one record MUST cover the identical subject closure',
    );
  }

  // Pass 9: one authority (F-05 co-storage bar on synthesizing a second).
  if (validationView.validatorIdentity !== resultView.validatorIdentity) {
    return associationFail(
      'SECOND_AUTHORITY',
      `validation view authority "${validationView.validatorIdentity}" differs from result view authority "${resultView.validatorIdentity}"; the two views share ONE validation authority and are not peer authorities (C144)`,
    );
  }

  // Pass 10: no second independently-issued validation for the same exact
  // subject may both count (C144; C98 evidence).
  for (const competing of competingValidations) {
    if (
      competing.validationViewIdentity !== validationView.validationViewIdentity &&
      sameSubject(competing.subject, validationView.subject)
    ) {
      return associationFail(
        'SECOND_VALIDATION_FOR_SAME_SUBJECT',
        `a second independently-issued validation "${competing.validationViewIdentity}" covers the same exact subject; two peer validations cannot both count (C144/C98)`,
      );
    }
  }

  // Pass 11: no contradictory dispositions inside one co-stored record.
  if (
    validationView.disposition !== undefined &&
    validationView.disposition !== resultView.disposition
  ) {
    return associationFail(
      'CONTRADICTORY_DISPOSITIONS',
      `co-stored views carry contradictory dispositions (${validationView.disposition} vs ${resultView.disposition}); one record cannot expose both (F-05)`,
    );
  }

  // Pass 12: validator designation (C113/C154).
  if (!validationView.validatorDesignated) {
    return associationFail(
      'NON_DESIGNATED_VALIDATOR',
      `validator "${validationView.validatorIdentity}" lacks a valid in-scope compatibility-validation designation; a non-designated issuer's compatibility artifact fails closed for authoritative use (C113)`,
    );
  }

  return {
    outcome: 'VALID_TWO_VIEW',
    requestIdentity,
    validationViewIdentity: validationView.validationViewIdentity,
    resultViewIdentity: resultView.resultViewIdentity,
    validatorIdentity: validationView.validatorIdentity,
    singleAuthority: true,
    detail:
      'two separately recoverable views of exactly one designated compatibility-validation authority, exactly associated request -> validation -> result (C144 PASS subject to all other checks; not a compatibility PASS and no selection/binding/activation authority)',
  };
}

function refusalFail(
  code: DacV0041RefusalEvidenceFailureCode,
  detail: string,
): DacV0041AuthorityRefusalEvidenceClassification {
  return { outcome: 'FAIL_CLOSED', code, detail };
}

/**
 * AuthorityRefusal evidence verifier (LIFECYCLE_REFERENCE_REPAIRS §4.2;
 * C142/C143). A valid refusal is substantive PRODUCED negative evidence for
 * one of the refusal seams, issued by a designated refusing issuer, bound to
 * its exact request. It can verify and report incompatibility but the
 * classification result structurally carries `canManufactureAuthority:
 * false` / `canProduceCompatibilityPass: false` — negative evidence can
 * never manufacture a target, selection, binding or activation authority,
 * and binding refusal never conflates with activation refusal (distinct seam
 * kinds are distinct evidence).
 */
export function verifyDacV0041AuthorityRefusalEvidence(
  facts: DacV0041AuthorityRefusalEvidenceFacts,
): DacV0041AuthorityRefusalEvidenceClassification {
  if (facts === null || typeof facts !== 'object') {
    return refusalFail('INVALID_FACTS', 'refusal evidence must be an object');
  }
  const candidate = facts as Partial<DacV0041AuthorityRefusalEvidenceFacts>;
  for (const field of [
    'refusalIdentity',
    'refusingIssuerIdentity',
    'boundRequestIdentity',
  ] as const) {
    if (!isNonEmptyString(candidate[field])) {
      return refusalFail('INVALID_FACTS', `refusal evidence field ${field} must be a non-empty string`);
    }
  }
  if (typeof candidate.refusingIssuerDesignated !== 'boolean') {
    return refusalFail('INVALID_FACTS', 'refusingIssuerDesignated must be a boolean');
  }
  if (
    (DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS as readonly string[]).indexOf(
      candidate.seamKind as string,
    ) === -1
  ) {
    return refusalFail(
      'UNKNOWN_REFUSAL_SEAM_KIND',
      `seam kind "${String(candidate.seamKind)}" is not one of the frozen AuthorityRefusal seam kinds; compatibility is NOT a refusal seam (compatibility carries its own INCOMPATIBLE polarity — C142)`,
    );
  }
  if (typeof candidate.negativeDecision !== 'boolean') {
    return refusalFail('INVALID_FACTS', 'negativeDecision must be a boolean');
  }
  if (typeof candidate.producedResult !== 'boolean') {
    return refusalFail('INVALID_FACTS', 'producedResult must be a boolean');
  }
  for (const identity of [candidate.refusalIdentity, candidate.refusingIssuerIdentity]) {
    if (isMutableAliasToken(identity as string)) {
      return refusalFail(
        'MUTABLE_ALIAS_IDENTITY',
        `identity "${String(identity)}" is a mutable alias token and can never substitute an exact identity`,
      );
    }
  }
  if (candidate.negativeDecision !== true) {
    return refusalFail(
      'NOT_A_NEGATIVE_DECISION',
      'a refusal is by definition a negative decision; a "favorable refusal" is malformed facts and fails closed',
    );
  }
  if (candidate.producedResult !== true) {
    return refusalFail(
      'NOT_A_PRODUCED_RESULT',
      'a substantive refusal is a produced-result; an unproduced/pending/transport outcome is not refusal evidence (distinct from rejected/invalid-input and blocked/missing-capability — §4.2)',
    );
  }
  if (candidate.refusingIssuerDesignated !== true) {
    return refusalFail(
      'NON_DESIGNATED_REFUSING_ISSUER',
      `refusing issuer "${String(candidate.refusingIssuerIdentity)}" lacks a valid in-scope designation; a non-designated refusal fails closed for authoritative use (C113)`,
    );
  }
  return {
    outcome: 'REFUSAL_EVIDENCE',
    refusalIdentity: candidate.refusalIdentity as string,
    seamKind: candidate.seamKind,
    canManufactureAuthority: false,
    canProduceCompatibilityPass: false,
    detail:
      'substantive produced negative authority evidence; usable for evidence closure and for verifying/reporting incompatibility; can never manufacture a target, selection, binding or activation authority',
  };
}

/**
 * Frozen compatibility precedence classifier (see the result type in
 * contracts.ts for the full 13-rung ladder). Composes the A41-001
 * foundation Steps 0–3 unchanged (descriptor -> capability kind ->
 * structural invalidity -> staleness -> unsupported target), then continues
 * with the compatibility-specific rungs: C99 binding-check
 * misclassification, C98 contradiction, C157 result currentness, C113
 * validator designation, and the negative-evidence ceiling (a COMPATIBLE
 * claim without exactly one consistent, current, designated favorable
 * produced result fails closed; refusal/negative evidence alone can never
 * manufacture a compatibility PASS). Pure, total, deterministic; never
 * throws, never repairs, never selects only the favorable result.
 */
export function classifyDacV0041CompatibilityPrecedence(
  facts: DacV0041CompatibilityPrecedenceFacts,
): DacV0041CompatibilityPrecedenceClassification {
  if (facts === null || typeof facts !== 'object') {
    return precedenceFail('INVALID_FACTS', 'precedence facts must be an object');
  }
  const candidate = facts as Partial<DacV0041CompatibilityPrecedenceFacts>;
  if (
    candidate.capabilityExchange === null ||
    typeof candidate.capabilityExchange !== 'object'
  ) {
    return precedenceFail('INVALID_FACTS', 'capabilityExchange facts are required');
  }
  if (typeof candidate.bindingTimeCheckReliedAsCompatibilityResult !== 'boolean') {
    return precedenceFail(
      'INVALID_FACTS',
      'bindingTimeCheckReliedAsCompatibilityResult must be a boolean',
    );
  }
  if (!Array.isArray(candidate.authoritativeResults)) {
    return precedenceFail('INVALID_FACTS', 'authoritativeResults must be an array');
  }
  if (!Array.isArray(candidate.refusalEvidence)) {
    return precedenceFail('INVALID_FACTS', 'refusalEvidence must be an array');
  }
  if (!isDisposition(candidate.assertedDisposition)) {
    return precedenceFail(
      'INVALID_FACTS',
      'assertedDisposition must be COMPATIBLE or INCOMPATIBLE',
    );
  }
  for (const entry of candidate.authoritativeResults) {
    if (entry === null || typeof entry !== 'object') {
      return precedenceFail('INVALID_FACTS', 'each authoritative result must be an object');
    }
    const result = entry as Partial<
      DacV0041CompatibilityPrecedenceFacts['authoritativeResults'][number]
    >;
    if (!isNonEmptyString(result.resultViewIdentity)) {
      return precedenceFail('INVALID_FACTS', 'authoritative result resultViewIdentity must be a non-empty string');
    }
    if (!isNonEmptyString(result.validatorIdentity)) {
      return precedenceFail('INVALID_FACTS', 'authoritative result validatorIdentity must be a non-empty string');
    }
    if (typeof result.validatorDesignated !== 'boolean') {
      return precedenceFail('INVALID_FACTS', 'authoritative result validatorDesignated must be a boolean');
    }
    if (!isDisposition(result.disposition)) {
      return precedenceFail('INVALID_FACTS', 'authoritative result disposition must be COMPATIBLE or INCOMPATIBLE');
    }
    if (!isCurrentnessState(result.currentness)) {
      return precedenceFail('INVALID_FACTS', 'authoritative result currentness must be a closed-vocabulary state');
    }
    if (
      result.refusalEvidenceIdentities !== undefined &&
      !isStringArray(result.refusalEvidenceIdentities)
    ) {
      return precedenceFail('INVALID_FACTS', 'refusalEvidenceIdentities must be a list of non-empty strings when present');
    }
  }
  for (const entry of candidate.refusalEvidence) {
    if (entry === null || typeof entry !== 'object') {
      return precedenceFail('INVALID_FACTS', 'each refusal evidence entry must be an object');
    }
  }

  const factsIn = candidate as DacV0041CompatibilityPrecedenceFacts;

  // Rungs 2–6: compose the frozen foundation Steps 0–3 unchanged. The
  // foundation classifier throws DacV0041ReferenceError only on malformed
  // facts; translate that to the typed fail-closed surface so this function
  // stays total.
  let steps: ReturnType<typeof classifyDacV0041CapabilityExchange>;
  try {
    steps = classifyDacV0041CapabilityExchange(factsIn.capabilityExchange);
  } catch {
    return precedenceFail(
      'INVALID_FACTS',
      'capabilityExchange facts are malformed; classification never invents a fact',
    );
  }
  switch (steps.phase) {
    case 'descriptor-establishment':
      return precedenceFail(
        'DESCRIPTOR_UNESTABLISHED',
        'no role-valid current exact ProviderCapabilityDescriptorRef can be established; there is no capability-kind or compatibility judgment from a stale/mutable/inferred descriptor (§13.1; C153)',
      );
    case 'capability-kind':
      return {
        outcome: 'BLOCKED_MISSING_CAPABILITY',
        targetNotJudged: true,
      };
    case 'exactness-currentness':
      if (steps.disposition === 'FAIL_CLOSED') {
        return precedenceFail(
          'STRUCTURALLY_INVALID_INPUT',
          'a role-required exact material input is missing/contradictory/malformed; structural invalidity dominates coexisting staleness (§13.2; C152/C153/C171)',
        );
      }
      return {
        outcome: 'STALE',
        detail:
          'a material input, exact target/profile, descriptor-dependent fact or relied-upon reusable result is stale; staleness dominates a binding-explicit unsupported target (§5 Step 2; C85/C151/C171)',
      };
    case 'target-support':
      return {
        outcome: 'INCOMPATIBLE',
        detail:
          'the capability kind is offered and a binding explicit target/profile is unsupported (§5 Step 3; advisory hints can never reach this judgment)',
      };
    case 'evaluation':
      break;
  }

  // Rung 7 (C99): a Harness binding-time check treated as a compatibility
  // result without exact validator designation is REJECT-classified; it
  // remains binding-authority evidence only.
  if (factsIn.bindingTimeCheckReliedAsCompatibilityResult) {
    return precedenceFail(
      'BINDING_CHECK_MISCLASSIFIED',
      'a Harness binding-time check was relied on as a compatibility result without exact validator designation; REJECT classification — the check remains binding-authority evidence only (C99)',
    );
  }

  // Rung 8 (C98): contradictory authoritative results for the same exact
  // subject — the consumer must never select only the favorable one.
  const favorable = factsIn.authoritativeResults.filter(
    (result) => result.disposition === 'COMPATIBLE',
  );
  const unfavorable = factsIn.authoritativeResults.filter(
    (result) => result.disposition === 'INCOMPATIBLE',
  );
  if (favorable.length >= 1 && unfavorable.length >= 1) {
    return precedenceFail(
      'CONTRADICTORY_AUTHORITATIVE_RESULTS',
      `contradictory authoritative compatibility results exist for the same exact subject (${favorable.length} favorable vs ${unfavorable.length} unfavorable); a consumer MUST NOT select only the favorable result (C98)`,
    );
  }

  // Rung 9 (C157): currentness of the relied-upon result set. Revoked/voided
  // dominates; stale/superseded yields STALE.
  const invalidated = factsIn.authoritativeResults.filter(
    (result) => result.currentness === 'revoked' || result.currentness === 'voided',
  );
  if (invalidated.length > 0) {
    return precedenceFail(
      'INVALIDATED_RESULT',
      `relied-upon compatibility result "${invalidated[0]?.resultViewIdentity}" is revoked/voided; an invalidated result cannot be carried forward (C157)`,
    );
  }
  const nonCurrent = factsIn.authoritativeResults.filter(
    (result) => result.currentness === 'stale' || result.currentness === 'superseded',
  );
  if (nonCurrent.length > 0 && factsIn.assertedDisposition === 'COMPATIBLE') {
    return {
      outcome: 'STALE',
      detail: `relied-upon compatibility result "${nonCurrent[0]?.resultViewIdentity}" is stale/superseded and cannot support a current COMPATIBLE claim without refresh/re-evaluation (C85/C157)`,
    };
  }

  // Rung 10 (C113/C154): the sole favorable validator must be designated.
  if (favorable.length >= 1) {
    const undesignated = favorable.find((result) => !result.validatorDesignated);
    if (undesignated !== undefined) {
      return precedenceFail(
        'NON_DESIGNATED_VALIDATOR',
        `favorable result "${undesignated.resultViewIdentity}" was issued by validator "${undesignated.validatorIdentity}" lacking a valid in-scope compatibility-validation designation (C113/C154)`,
      );
    }
  }

  // Rung 11: the negative-evidence ceiling. A COMPATIBLE claim needs exactly
  // one consistent, current, designated favorable produced result; refusal
  // and other negative evidence can never back it. An INCOMPATIBLE claim is
  // reportable from genuinely produced negative evidence (unfavorable
  // results or substantive refusal evidence) but is never guessed from an
  // empty evidence set.
  if (factsIn.assertedDisposition === 'COMPATIBLE') {
    if (favorable.length !== 1) {
      return precedenceFail(
        'FAVORABLE_CLAIM_UNBACKED',
        `asserted COMPATIBLE with ${favorable.length} favorable authoritative produced results (need exactly 1); refusal/negative evidence alone can never manufacture a compatibility PASS (§4.2; C156-family)`,
      );
    }
    return {
      outcome: 'COMPATIBLE_VERDICT',
      boundedToCompatibility: true,
      impliesApplicationSelection: false,
      impliesRuntimeBinding: false,
      impliesRuntimeActivation: false,
      detail:
        'a distinct, bounded compatibility verdict; implies nothing about ApplicationSelection, RuntimeBinding or RuntimeActivation, which require their own independently issued authorities (§10; C107)',
    };
  }
  const hasNegativeEvidence =
    unfavorable.length >= 1 || factsIn.refusalEvidence.length >= 1;
  if (!hasNegativeEvidence) {
    return precedenceFail(
      'FAVORABLE_CLAIM_UNBACKED',
      'asserted INCOMPATIBLE without any produced unfavorable result or substantive refusal evidence; a verdict is never guessed from an empty evidence set',
    );
  }
  return {
    outcome: 'INCOMPATIBLE',
    detail:
      'produced negative compatibility evidence verifies and reports incompatibility; the result remains distinct from AuthorityRefusal and from invocation transport outcomes (§4.2; C142)',
  };
}

function precedenceFail(
  code: DacV0041CompatibilityPrecedenceFailureCode,
  detail: string,
): DacV0041CompatibilityPrecedenceClassification {
  return { outcome: 'FAIL_CLOSED', code, detail };
}
