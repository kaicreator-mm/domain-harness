// Issue #357 / A41-003 (reviewed #353 Task DAG; trigger comment 5851585053):
// bounded CONSUMER/VERIFIER surface — never an issuer — for DAC v0.0.4.1
// successor compatibility/capability/refusal/currentness semantics
// (LIFECYCLE_REFERENCE_REPAIRS.md §5 F-05 two-view clarification and §4.2
// AuthorityRefusalRef; APPLICATION_MANIFEST.md §§8–§11; ASSEMBLY_CAPABILITY_
// EXCHANGE.md §5 + §13 precedence; CONFORMANCE_MATRIX.md rows C84/C85/C98/
// C99/C144 and the v0.0.4.1 additive C150–C153/C170/C171) at the exact
// successor semantic freeze pinned by the A41-001 foundation (commit
// 75fee75b… / tree c74cf5e3…).
//
// This module classifies and verifies EXTERNALLY RECOVERED facts. It never
// mints or issues a CompatibilityValidationRef / CompatibilityResultRef, an
// ApplicationSelectionRef, a RuntimeBindingRef or a RuntimeActivationRef, and
// never expands a compatibility designation: a compatibility PASS produced
// here is a distinct, bounded verdict that implies NOTHING about
// ApplicationSelection, RuntimeBinding or RuntimeActivation
// (APPLICATION_MANIFEST §10; C107). Refusal/negative evidence can verify and
// report incompatibility but can NEVER manufacture a target, selection,
// binding or activation authority: no success-style outcome is derivable
// from negative evidence alone (§4.2; C142/C156-family).
//
// C144 two-view/same-validation-authority semantics are preserved exactly as
// frozen: CompatibilityValidationRef and CompatibilityResultRef are
// separately recoverable semantic views of ONE validation authority; one
// concrete immutable record MAY carry both views, but co-storage must never
// alias the request identity, synthesize a second authority, create
// contradictory dispositions, or let two independently-issued validations
// for the same exact subject both count (LIFECYCLE_REFERENCE_REPAIRS §5).
//
// Like the foundation and the authority module, this module freezes NO wire
// schema, serialization, cryptography, clock, storage or transport. Portable:
// no Node built-ins, no engine internals, no imports from any historical DAC
// adapter. Imports only the A41-001 foundation contracts/guards.

import type {
  DacV0041CapabilityExchangeFacts,
  DacV0041CurrentnessUseState,
} from '../contracts.js';

/**
 * The closed compatibility seam role chain (CROSS_LAYER_REFERENCES §6 chain
 * carried forward by LIFECYCLE_REFERENCE_REPAIRS §5; C89):
 *
 *   CompatibilityValidationRequestRef != CompatibilityValidationRef
 *                                            != CompatibilityResultRef
 *
 * The three roles are pairwise role distinctions whose identities MUST
 * remain distinct at every material seam. Presence here creates no storage
 * obligation: one immutable record MAY carry the two view roles (C144).
 */
export const DAC_V0041_COMPATIBILITY_SEAM_ROLES = [
  'compatibility-validation-request',
  'compatibility-validation',
  'compatibility-result',
] as const;

/**
 * AuthorityRefusal seam kinds (LIFECYCLE_REFERENCE_REPAIRS §4.2): the seams
 * whose positive artifact cannot itself carry negative polarity. Note that
 * compatibility is NOT a refusal seam — compatibility carries its own
 * polarity via INCOMPATIBLE, and an AuthorityRefusalRef is distinct from a
 * compatibility INCOMPATIBLE result (C142: reclassifying a refusal as
 * compatibility INCOMPATIBLE — or the reverse — is rejected).
 */
export const DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS = [
  'authority-designation',
  'application-identity-establishment',
  'manifest-issuance',
  'runtime-binding',
  'runtime-activation',
] as const;

export type DacV0041AuthorityRefusalSeamKind =
  (typeof DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS)[number];

/**
 * Frozen result-view disposition vocabulary for the compatibility seam
 * (foundation `DAC_V0041_REFERENCE_DISPOSITIONS` restricted to the two
 * terminal compatibility verdicts). Only A41-003 may produce these.
 */
export const DAC_V0041_COMPATIBILITY_DISPOSITIONS = [
  'COMPATIBLE',
  'INCOMPATIBLE',
] as const;

export type DacV0041CompatibilityDisposition =
  (typeof DAC_V0041_COMPATIBILITY_DISPOSITIONS)[number];

/**
 * Exact compatibility subject closure (APPLICATION_MANIFEST §8): the
 * validation request MUST bind the exact compatibility subject. The subject
 * facts here are the externally recovered, independently asserted form of
 * that closure; the association verifier requires the validation view and
 * the result view to carry the IDENTICAL subject record and the request's
 * binding explicit target (when present) to be among the exact targets.
 */
export interface DacV0041CompatibilitySubjectFacts {
  /** Exact ManifestIdentity of the validated composition (exactly 1). */
  readonly manifestIdentity: string;
  /** Exact ManifestContentDigest (exactly 1). */
  readonly manifestContentDigest: string;
  /** Exact CompatibilityTargetRef identities required by the claim (1..n). */
  readonly targetIdentities: readonly string[];
  /** Exact requirements/check profile identity (exactly 1). */
  readonly requirementsProfileIdentity: string;
  /** Exact RuntimeImplementationRef when the claim is implementation-specific (0..1). */
  readonly runtimeImplementationIdentity?: string;
  /** Exact RuntimeHostBindingRef when a Host Binding is material (0..1). */
  readonly runtimeHostBindingIdentity?: string;
  /** Exact DAC/reference profile governing interpretation (exactly 1). */
  readonly dacProfileIdentity: string;
}

/**
 * The CompatibilityValidationRef view facts of one externally recovered
 * compatibility validation record (C144 view 1: validation evidence —
 * separately recoverable, bound to exactly its request, issued by exactly
 * one validator).
 */
export interface DacV0041CompatibilityValidationViewFacts {
  /** Exact CompatibilityValidationRef identity (distinct from every other seam role identity). */
  readonly validationViewIdentity: string;
  /** The exact request identity this validation is bound to (exact association). */
  readonly boundRequestIdentity: string;
  /** The ONE compatibility-validation authority that issued the validation. */
  readonly validatorIdentity: string;
  /** Externally established: does the validator hold a valid in-scope compatibility-validation designation (C113/C154)? */
  readonly validatorDesignated: boolean;
  /** Exact compatibility subject of the validation (must equal the result view's). */
  readonly subject: DacV0041CompatibilitySubjectFacts;
  /** Validation-evidence disposition when the co-stored record exposes one (0..1). */
  readonly disposition?: DacV0041CompatibilityDisposition;
}

/**
 * The CompatibilityResultRef view facts of the same record (C144 view 2:
 * compatibility disposition — separately recoverable, bound to exactly its
 * validation view, same single validation authority).
 */
export interface DacV0041CompatibilityResultViewFacts {
  /** Exact CompatibilityResultRef identity (distinct from every other seam role identity). */
  readonly resultViewIdentity: string;
  /** The exact CompatibilityValidationRef identity this result is bound to (exact association). */
  readonly boundValidationViewIdentity: string;
  /** The ONE compatibility-validation authority behind the result view. */
  readonly validatorIdentity: string;
  /** Exact compatibility subject of the result (must equal the validation view's). */
  readonly subject: DacV0041CompatibilitySubjectFacts;
  /** The terminal compatibility disposition carried by the result view. */
  readonly disposition: DacV0041CompatibilityDisposition;
  /** Currentness of the result for carry-forward use (C157). */
  readonly currentness: DacV0041CurrentnessUseState;
}

/**
 * A separately recovered, independently issued competing validation record
 * covering the SAME exact subject (C144 second-authority bar; C98
 * contradiction evidence). Supplied by the caller as evidence; the verifier
 * decides deterministically whether it bars the association.
 */
export interface DacV0041CompetingValidationFacts {
  readonly validationViewIdentity: string;
  readonly validatorIdentity: string;
  /** Exact subject the competing record claims (must be compared for sameness). */
  readonly subject: DacV0041CompatibilitySubjectFacts;
}

/** Deterministic FAIL_CLOSED reason codes for view association verification. */
export type DacV0041CompatibilityAssociationFailureCode =
  | 'INVALID_FACTS'
  | 'FORGED_REQUEST_REF'
  | 'MUTABLE_ALIAS_IDENTITY'
  | 'REQUEST_VIEW_ALIAS'
  | 'VIEW_IDENTITY_ALIAS'
  | 'REQUEST_ASSOCIATION_MISMATCH'
  | 'VALIDATION_ASSOCIATION_MISMATCH'
  | 'FORBIDDEN_BINDING_INPUT'
  | 'TARGET_ASSOCIATION_MISMATCH'
  | 'SUBJECT_MISMATCH'
  | 'SECOND_AUTHORITY'
  | 'SECOND_VALIDATION_FOR_SAME_SUBJECT'
  | 'CONTRADICTORY_DISPOSITIONS'
  | 'NON_DESIGNATED_VALIDATOR';

/** Input for `verifyDacV0041CompatibilityViewAssociation`. */
export interface DacV0041CompatibilityViewAssociationInput {
  /** The minted foundation request reference (C89) the validation claims to answer. */
  readonly requestRef: unknown;
  readonly validationView: DacV0041CompatibilityValidationViewFacts;
  readonly resultView: DacV0041CompatibilityResultViewFacts;
  /** Independently issued validations covering the same exact subject (0..n). */
  readonly competingValidations?: readonly DacV0041CompetingValidationFacts[];
}

/**
 * Terminal C144 two-view association result. `VALID_TWO_VIEW` means the two
 * views are separately recoverable views of exactly ONE validation
 * authority, each exactly associated (request -> validation -> result), with
 * a distinct request identity and no contradictory dispositions — PASS
 * subject to all other checks. It is NOT a compatibility PASS, NOT a
 * selection, NOT a binding and NOT an activation, and carries no field a
 * consumer could consume as any of those authorities.
 */
export type DacV0041CompatibilityViewAssociation =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: DacV0041CompatibilityAssociationFailureCode;
      readonly detail: string;
    }
  | {
      readonly outcome: 'VALID_TWO_VIEW';
      readonly requestIdentity: string;
      readonly validationViewIdentity: string;
      readonly resultViewIdentity: string;
      readonly validatorIdentity: string;
      readonly singleAuthority: true;
      readonly detail: string;
    };

/**
 * One externally recovered authoritative compatibility result presented for
 * the precedence classification (C98 evidence set). Each entry is a
 * produced, separately referrable result with its own disposition and
 * currentness; the classifier never selects only the favorable one.
 */
export interface DacV0041AuthoritativeCompatibilityResultFacts {
  readonly resultViewIdentity: string;
  readonly validatorIdentity: string;
  readonly validatorDesignated: boolean;
  readonly disposition: DacV0041CompatibilityDisposition;
  readonly currentness: DacV0041CurrentnessUseState;
  /** Refusal/negative evidence backing (0..n); never counts as favorable coverage. */
  readonly refusalEvidenceIdentities?: readonly string[];
}

/**
 * AuthorityRefusal evidence facts (LIFECYCLE_REFERENCE_REPAIRS §4.2). A
 * refusal is a substantive produced negative authority decision for seams
 * whose positive artifact cannot carry negative polarity. It is distinct
 * from invocation failures and from compatibility INCOMPATIBLE (C142), is
 * material invocation evidence that MUST NOT be omitted merely because a
 * later favorable result exists (C143), and can NEVER manufacture a target,
 * selection, binding or activation authority.
 */
export interface DacV0041AuthorityRefusalEvidenceFacts {
  readonly refusalIdentity: string;
  readonly refusingIssuerIdentity: string;
  readonly refusingIssuerDesignated: boolean;
  readonly seamKind: DacV0041AuthorityRefusalSeamKind;
  /** The exact request/initiation identity the refusal binds (exactly 1). */
  readonly boundRequestIdentity: string;
  /** A refusal is by definition a negative decision; a "favorable refusal" is malformed facts. */
  readonly negativeDecision: boolean;
  /** Whether the refusal is a produced-result (required for substantive evidence). */
  readonly producedResult: boolean;
}

/** Deterministic FAIL_CLOSED reason codes for refusal evidence verification. */
export type DacV0041RefusalEvidenceFailureCode =
  | 'INVALID_FACTS'
  | 'MUTABLE_ALIAS_IDENTITY'
  | 'UNKNOWN_REFUSAL_SEAM_KIND'
  | 'NOT_A_NEGATIVE_DECISION'
  | 'NOT_A_PRODUCED_RESULT'
  | 'NON_DESIGNATED_REFUSING_ISSUER';

/**
 * Terminal refusal-evidence classification. `REFUSAL_EVIDENCE` is material
 * produced negative evidence: usable for evidence closure and for verifying/
 * reporting incompatibility, never upgradeable into a target, selection,
 * binding or activation authority, and never a success-style outcome
 * (carries `canManufactureAuthority: false` and `canProduceCompatibilityPass:
 * false` structurally so no consumer field could be read as one).
 */
export type DacV0041AuthorityRefusalEvidenceClassification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: DacV0041RefusalEvidenceFailureCode;
      readonly detail: string;
    }
  | {
      readonly outcome: 'REFUSAL_EVIDENCE';
      readonly refusalIdentity: string;
      readonly seamKind: DacV0041AuthorityRefusalSeamKind;
      readonly canManufactureAuthority: false;
      readonly canProduceCompatibilityPass: false;
      readonly detail: string;
    };

/**
 * Externally recoverable facts for the frozen compatibility precedence
 * classification. The `capabilityExchange` facts are exactly the A41-001
 * foundation facts (ASSEMBLY_CAPABILITY_EXCHANGE §5 + §13; Steps 0–3), so
 * this classifier composes — never restates or reorders — the frozen
 * capability/currentness precedence.
 */
export interface DacV0041CompatibilityPrecedenceFacts {
  /** Step 0–3 facts (descriptor establishment, capability kind, exactness/currentness, target support). */
  readonly capabilityExchange: DacV0041CapabilityExchangeFacts;
  /**
   * C99: a Harness binding-time check was presented/relied as a
   * compatibility result without exact validator designation. When true the
   * classification is REJECT-class FAIL_CLOSED and the check remains
   * binding-authority evidence only.
   */
  readonly bindingTimeCheckReliedAsCompatibilityResult: boolean;
  /** The evidence set of authoritative produced results for the same exact subject (C98). */
  readonly authoritativeResults: readonly DacV0041AuthoritativeCompatibilityResultFacts[];
  /** Refusal / negative evidence materially present (0..n; C143 anti-omission input). */
  readonly refusalEvidence: readonly DacV0041AuthorityRefusalEvidenceFacts[];
  /**
   * The compatibility disposition asserted by the claim being classified.
   * A `COMPATIBLE` claim is only satisfied when the evidence set contains
   * exactly one consistent, current, designated favorable produced result
   * and no contradictory one; negative evidence alone can never satisfy it.
   */
  readonly assertedDisposition: DacV0041CompatibilityDisposition;
}

/** Deterministic FAIL_CLOSED reason codes for the precedence classifier. */
export type DacV0041CompatibilityPrecedenceFailureCode =
  | 'INVALID_FACTS'
  | 'DESCRIPTOR_UNESTABLISHED'
  | 'STRUCTURALLY_INVALID_INPUT'
  | 'BINDING_CHECK_MISCLASSIFIED'
  | 'CONTRADICTORY_AUTHORITATIVE_RESULTS'
  | 'INVALIDATED_RESULT'
  | 'NON_DESIGNATED_VALIDATOR'
  | 'FAVORABLE_CLAIM_UNBACKED';

/**
 * Terminal compatibility precedence classification — FROZEN deterministic
 * outcome ladder (first match wins; every adversarial combination of the
 * C84/C85/C98/C99/F-08 fact dimensions maps to exactly one outcome):
 *
 *   1. malformed facts                              => FAIL_CLOSED INVALID_FACTS
 *   2. Step 0: no current exact descriptor          => FAIL_CLOSED
 *      DESCRIPTOR_UNESTABLISHED (§13.1; C153)
 *   3. Step 1: capability kind absent               => BLOCKED_MISSING_CAPABILITY,
 *      target not judged (§5 Step 1; C84/C150/C170 — dominates every later
 *      dimension including staleness of pinned/reused inputs)
 *   4. Step 2a: structural invalidity               => FAIL_CLOSED
 *      STRUCTURALLY_INVALID_INPUT (§13.2; C152/C153/C171 — dominates
 *      coexisting staleness)
 *   5. Step 2b: material staleness                  => STALE (§5 Step 2;
 *      C85/C151/C171 — dominates an unsupported binding target)
 *   6. Step 3: binding explicit target unsupported  => INCOMPATIBLE
 *      (§5 Step 3; C83/C150-family — advisory hints can never reach this)
 *   7. C99: binding-time check relied as
 *      compatibility result                         => FAIL_CLOSED
 *      BINDING_CHECK_MISCLASSIFIED (remains binding-authority evidence)
 *   8. C98: contradictory authoritative results for
 *      the same exact subject                       => FAIL_CLOSED
 *      CONTRADICTORY_AUTHORITATIVE_RESULTS (no favorable-only selection)
 *   9. C157: a relied-upon result is revoked/voided => FAIL_CLOSED
 *      INVALIDATED_RESULT; stale/superseded        => STALE
 *  10. C113/C154: sole favorable validator not
 *      designated                                  => FAIL_CLOSED
 *      NON_DESIGNATED_VALIDATOR
 *  11. asserted COMPATIBLE without exactly one consistent, current,
 *      designated favorable produced result (including refusal/negative
 *      evidence alone)                             => FAIL_CLOSED
 *      FAVORABLE_CLAIM_UNBACKED (negative evidence can never manufacture
 *      a compatibility PASS — §4.2; C156-family)
 *  12. asserted INCOMPATIBLE with produced negative evidence
 *      (unfavorable results / substantive refusal evidence) => INCOMPATIBLE
 *      (verifiable and reportable from negative evidence; never guessed
 *      from an empty evidence set)
 *  13. otherwise (asserted COMPATIBLE, exactly one consistent, current,
 *      designated favorable produced result) => COMPATIBLE_VERDICT:
 *      a distinct, BOUNDED verdict that implies nothing about
 *      ApplicationSelection, RuntimeBinding or RuntimeActivation
 *      (APPLICATION_MANIFEST §10; C107) — the result object deliberately
 *      carries no selection/binding/activation field.
 */
export type DacV0041CompatibilityPrecedenceClassification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: DacV0041CompatibilityPrecedenceFailureCode;
      readonly detail: string;
    }
  | {
      readonly outcome: 'BLOCKED_MISSING_CAPABILITY';
      readonly targetNotJudged: true;
    }
  | {
      readonly outcome: 'STALE';
      readonly detail: string;
    }
  | {
      readonly outcome: 'INCOMPATIBLE';
      readonly detail: string;
    }
  | {
      readonly outcome: 'COMPATIBLE_VERDICT';
      readonly boundedToCompatibility: true;
      readonly impliesApplicationSelection: false;
      readonly impliesRuntimeBinding: false;
      readonly impliesRuntimeActivation: false;
      readonly detail: string;
    };
