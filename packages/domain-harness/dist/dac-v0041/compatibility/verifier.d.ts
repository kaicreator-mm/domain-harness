import { type DacV0041AuthorityRefusalEvidenceClassification, type DacV0041AuthorityRefusalEvidenceFacts, type DacV0041CompatibilityPrecedenceClassification, type DacV0041CompatibilityPrecedenceFacts, type DacV0041CompatibilityViewAssociation, type DacV0041CompatibilityViewAssociationInput } from './contracts.js';
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
 *                                         compatibility-validation input;
 *                                         a RuntimeActivationRef is equally
 *                                         downstream of compatibility. A
 *                                         RuntimeHostBindingRef IS a
 *                                         legitimate §8 material input when
 *                                         a concrete Host Binding is
 *                                         material — it is exactness-matched
 *                                         by pass 9, never blanket-forbidden)
 *   5. exact association request->view   (REQUEST_ASSOCIATION_MISMATCH)
 *   6. exact association view->result    (VALIDATION_ASSOCIATION_MISMATCH:
 *                                         any swap/reuse fails closed)
 *   7. request target binding            (TARGET_ASSOCIATION_MISMATCH §8)
 *   8. subject equality across views     (SUBJECT_MISMATCH)
 *   9. exact §8 request-subject closure  (REQUEST_SUBJECT_CLOSURE_MISMATCH:
 *                                         the subject recovered from the
 *                                         minted request — Manifest
 *                                         identity+digest, exact target
 *                                         list, binding target/profile,
 *                                         request DAC/reference profile,
 *                                         implementation/host-binding
 *                                         inputs when material, AND the
 *                                         COMPLETE material-Manifest-ref
 *                                         list with role + all material
 *                                         exactness — MUST equal the
 *                                         validation/result subject
 *                                         exactly; a request for subject A
 *                                         can never validate subject B,
 *                                         and no role-valid material
 *                                         request ref is ever ignored)
 *  10. single authority                  (SECOND_AUTHORITY F-05 co-storage;
 *                                         local to the two views of THIS
 *                                         record — a second independently
 *                                         issued validation for the same
 *                                         exact subject is NOT an
 *                                         association defect; consistent
 *                                         multiple validations are
 *                                         permitted and contradictions/
 *                                         currentness belong to the
 *                                         C98/C157 precedence rungs)
 *  11. no contradictory dispositions     (CONTRADICTORY_DISPOSITIONS F-05)
 *  12. validator designation             (NON_DESIGNATED_VALIDATOR C113)
 *  13. otherwise => VALID_TWO_VIEW (PASS subject to all other checks; never
 *      itself a compatibility PASS or any selection/binding/activation
 *      authority).
 */
export declare function verifyDacV0041CompatibilityViewAssociation(input: DacV0041CompatibilityViewAssociationInput): DacV0041CompatibilityViewAssociation;
/**
 * AuthorityRefusal evidence verifier (LIFECYCLE_REFERENCE_REPAIRS §4.2;
 * C142/C143). A valid refusal binds the COMPLETE frozen §4.2 closure —
 * exact request/initiation, exact subject/scope/profile, refusing issuer
 * AND its designation, refusal seam kind, negative decision, issuance
 * provenance and issuance point — and is substantive PRODUCED negative
 * evidence for one of the refusal seams. It can verify and report
 * incompatibility at its own seam but the classification result
 * structurally carries `canManufactureAuthority: false` /
 * `canProduceCompatibilityPass: false` — negative evidence can never
 * manufacture a target, selection, binding or activation authority, and
 * binding refusal never conflates with activation refusal (distinct seam
 * kinds are distinct evidence). An entry missing any closure element fails
 * closed and is never treated as substantive refusal evidence.
 */
export declare function verifyDacV0041AuthorityRefusalEvidence(facts: DacV0041AuthorityRefusalEvidenceFacts): DacV0041AuthorityRefusalEvidenceClassification;
/**
 * Frozen compatibility precedence classifier (see the result type in
 * contracts.ts for the full 16-rung ladder). Composes the A41-001
 * foundation Steps 0–3 unchanged (descriptor -> capability kind ->
 * structural invalidity -> staleness -> unsupported target), then continues
 * with the compatibility-specific rungs: C99 binding-check
 * misclassification, §4.2 refusal-evidence closure validation, C98
 * contradiction, polarity-neutral C157 result currentness, polarity-neutral
 * C113 validator designation, the C143 material-refusal block, and the
 * negative-evidence ceiling (a COMPATIBLE claim without exactly one
 * consistent, current, designated favorable produced result fails closed;
 * refusal/negative evidence alone can never manufacture a compatibility
 * PASS, and compatibility INCOMPATIBLE comes only from compatibility-owned
 * evidence — never from an AuthorityRefusalRef, which is distinct from
 * compatibility INCOMPATIBLE per C142). Pure, total, deterministic; never
 * throws, never repairs, never selects only the favorable result.
 */
export declare function classifyDacV0041CompatibilityPrecedence(facts: DacV0041CompatibilityPrecedenceFacts): DacV0041CompatibilityPrecedenceClassification;
//# sourceMappingURL=verifier.d.ts.map