// Issue #356 / A41-002 (reviewed #353 Task DAG; trigger comment 5847963315):
// bounded CONSUMER/VERIFIER surface — never an issuer — for DAC v0.0.4.1
// F-01 designation/delegation/currentness semantics
// (AUTHORITY_DESIGNATION_DELEGATION.md, tightening CROSS_LAYER_REFERENCES
// §2.2–§2.4) and F-06 AuthorityAdoption semantics
// (LIFECYCLE_REFERENCE_REPAIRS.md §6) at the exact successor semantic freeze
// pinned by the A41-001 foundation (commit 75fee75b… / tree c74cf5e3…).
//
// This module consumes EXTERNALLY RECOVERED facts and classifies them
// deterministically. It never mints, issues, grants, revokes, voids, adopts,
// relabels, truncates, normalizes or repairs any designation, delegation,
// adoption or authority-bearing artifact: root AuthorityDesignation issuance,
// upstream authority establishment, promotion/selection/Manifest issuance and
// independent conformance verdict issuance are explicitly NOT owned here.
// Every decision path fails closed — an absent, contradictory or undecidable
// fact is never guessed, defaulted or repaired into a narrower valid one
// (AUTHORITY_DESIGNATION_DELEGATION.md §4; LIFECYCLE_REFERENCE_REPAIRS.md
// §6.4).
//
// Like the foundation, this module freezes NO wire schema, serialization,
// cryptography, clock, storage or transport; every fact arrives as a plain
// immutable record whose recoverability was established upstream. Constraint
// inheritance is exact-token conjunctive: only the IDENTICAL constraint token
// deterministically provably satisfies an ancestor constraint; a differently
// spelled "stricter" restriction is undecidable and fails closed.
//
// Portable: no Node built-ins, no engine internals, no imports from any
// historical DAC adapter. Imports only the A41-001 foundation contracts.

import type { DacV0041Reference } from '../contracts.js';

/**
 * Authority role token that permits its holder to issue further
 * AuthorityDesignationRef links within a delegation envelope. Token spelling
 * is KEEP_PROVISIONAL per the frozen spec; the semantic role is normative —
 * holding any other authority role never implies designation authority.
 */
export const DAC_V0041_DESIGNATION_ISSUANCE_ROLE = 'designation-issuance' as const;

/**
 * Separately referrable end-act kinds that can terminate a designation link
 * (AUTHORITY_DESIGNATION_DELEGATION.md §§7–8). The first four are PROSPECTIVE
 * ordinary ends (history is not rewritten; artifacts issued while the chain
 * was current remain usable absent separate invalidation); `retroactive-void`
 * is the single retroactive instrument, bounded by the §8 void-point interval
 * and cascade rules.
 */
export const DAC_V0041_END_ACT_KINDS = [
  'ordinary-expiry',
  'supersession',
  'prospective-revocation',
  'relinquishment',
  'retroactive-void',
] as const;

export type DacV0041EndActKind = (typeof DAC_V0041_END_ACT_KINDS)[number];

/**
 * F-06 §6.3: the ONLY artifact classes an AuthorityAdoptionRef may adopt,
 * spelled with the successor registry role vocabulary. Every other class —
 * and every unknown token — is non-adoptable and fails closed.
 */
export const DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES = [
  'promotion-decision',
  'application-selection',
  'application-semantic',
  'runtime-contract',
  'compatibility-target',
  'domain-ux-definition',
  'runtime-interaction-contract',
  'external-authority',
] as const;

export type DacV0041AdoptableArtifactClass =
  (typeof DAC_V0041_ADOPTABLE_ARTIFACT_CLASSES)[number];

/**
 * F-06 §6.4: classes that require fresh v0.0.4.1 issuance and can NEVER be
 * made current by adoption. `authority-designation` covers every
 * specialization including attestation forms (C163); Manifest identity/
 * issuance, compatibility validation/result, Runtime binding/activation and
 * ConformanceVerdict artifacts are equally non-adoptable.
 */
export const DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES = [
  'authority-designation',
  'authority-designation-attestation',
  'manifest',
  'compatibility-validation',
  'compatibility-result',
  'runtime-binding',
  'runtime-activation',
  'conformance-verdict',
] as const;

export type DacV0041NonAdoptableArtifactClass =
  (typeof DAC_V0041_NON_ADOPTABLE_ARTIFACT_CLASSES)[number];

/**
 * Re-evaluation evidence dimensions an adoption act must bind
 * (F-06 §6.2 element 5). Each must be explicitly established in the facts;
 * a missing dimension fails closed as re-evaluation incompleteness.
 */
export const DAC_V0041_ADOPTION_REEVALUATION_REQUIREMENTS = [
  'source-authenticity',
  'source-provenance',
  'subject-exactness',
  'source-currentness',
  'evidence-closure',
  'class-specific-obligations',
] as const;

export type DacV0041AdoptionReEvaluationRequirement =
  (typeof DAC_V0041_ADOPTION_REEVALUATION_REQUIREMENTS)[number];

/**
 * Opaque totally-ordered time point. Concrete timestamp representation and
 * clocks are implementation freedom (spec §12 / §9); the verifier only
 * compares points, so any finite, caller-chosen ordered scalar works. NaN,
 * ±Infinity and non-numbers are malformed facts and fail closed.
 */
export type DacV0041TimePoint = number;

/**
 * Independently recoverable issuance-point evidence for one authority act.
 * `point` is the evidenced issuance point; `assertedBy` are the exact
 * identities asserting that evidence.
 *
 * Two-party independence rule (F-01 §1/§6 step 6; C128): for a designation
 * link the evidence MUST NOT be asserted solely by the link's designator nor
 * solely by its designated issuer; for other authority acts (end/void/
 * adoption) it MUST NOT be asserted solely by the act's own issuer. An empty
 * attestor set means the issuance point is unestablished and fails closed.
 */
export interface DacV0041IssuancePointEvidence {
  readonly point: DacV0041TimePoint;
  readonly assertedBy: readonly string[];
}

/**
 * Delegation envelope facts a `designation-issuance` link must make
 * recoverable (F-01 §3). The envelope has no independent time window: the
 * holder designation's own validity interval bounds every grant under it.
 * All lists are exact-token vocabularies; containment/subset comparisons are
 * exact string comparisons and never fuzzy.
 */
export interface DacV0041DelegationEnvelopeFacts {
  /** Exact roles the holder may grant (1..n). */
  readonly delegableRoles: readonly string[];
  /** Exact owner-proved scopes the holder may grant (1..n). */
  readonly delegableScopes: readonly string[];
  /** Mandatory constraints every descendant grant must preserve (0..n). */
  readonly mandatoryConstraints: readonly string[];
  /** Exact permitted DAC/reference profiles descendants may name (1..n). */
  readonly permittedDacProfiles: readonly string[];
  /** Maximum SoD/co-location permissions descendants may carry (0..n). */
  readonly delegableSodPermissions: readonly string[];
  /** Re-delegation depth: non-negative integer, exactly 1 value (default 0). */
  readonly redelegationDepth: number;
}

/**
 * One designation link as externally recovered evidence — the fact form of
 * an `AuthorityDesignationRef` (CROSS_LAYER_REFERENCES §2.1 minima). A root
 * link omits `parentLinkIdentity` (its designator must be the anchored scope
 * owner); a delegated link cites the exact parent designation under which its
 * designator acted.
 */
export interface DacV0041DesignationLinkFacts {
  readonly linkIdentity: string;
  readonly designatorIdentity: string;
  readonly designatedIssuerIdentity: string;
  /** Exact authority role; `designation-issuance` requires an envelope. */
  readonly authorityRole: string;
  /** Single exact authority scope of this link (never a wildcard). */
  readonly authorityScope: string;
  /** Exact DAC/reference profile identity the link is valid under. */
  readonly dacProfileIdentity: string;
  /** Holder/subject-scope constraint tokens (0..n; exact-token conjunctive). */
  readonly holderConstraints: readonly string[];
  /** SoD/co-location permission tokens this link itself carries (0..n). */
  readonly sodPermissions: readonly string[];
  /**
   * Declared effective-from. MUST NOT precede the link's own evidenced
   * issuance point (C122: no designation authorizes issuance before it
   * existed). start(L) is this point whenever it is later than the evidence
   * point.
   */
  readonly effectiveFrom: DacV0041TimePoint;
  /** Declared ordinary expiry / supersession point, when bounded (0..1). */
  readonly declaredEffectiveEnd?: DacV0041TimePoint;
  /** Two-party-independent issuance-point evidence (exactly 1). */
  readonly issuanceEvidence: DacV0041IssuancePointEvidence;
  /** Cited exact parent designation link; absent exactly for root links. */
  readonly parentLinkIdentity?: string;
  /** Required exactly when authorityRole is `designation-issuance`. */
  readonly delegationEnvelope?: DacV0041DelegationEnvelopeFacts;
  /** Separately referrable end acts against THIS link (0..n). */
  readonly endActs?: readonly DacV0041EndActFacts[];
}

/**
 * One separately referrable end act against an exact target link
 * (F-01 §§7–8). Authorization rules are per kind:
 *   - `ordinary-expiry` / `supersession` / `prospective-revocation`: issued
 *     by the target scope owner or a chain-current covering ancestor whose
 *     designation-issuance envelope covers the target role and scope (C166);
 *   - `relinquishment`: only the exact holder (designated issuer) of the
 *     target link, prospective only (C167);
 *   - `retroactive-void`: scope owner or a designator in the target's
 *     ancestor chain whose chain is current at the act's issuance point and
 *     whose envelope covers the target role and scope, with
 *     `issuanceEvidence(G) <= effectivePoint <= act issuance point` (C127).
 * Every end act needs evidence not asserted solely by its own issuer, and
 * its claimed effective point MUST NOT precede the act's evidenced issuance
 * point (C172 no backdated prospective effect). An unauthorized, unevidenced
 * or backdated act is REJECTED and has NO effect on `end(L)`.
 */
export interface DacV0041EndActFacts {
  readonly actIdentity: string;
  readonly kind: DacV0041EndActKind;
  readonly issuerIdentity: string;
  /** The act's own independently recoverable issuance-point evidence. */
  readonly issuanceEvidence: DacV0041IssuancePointEvidence;
  /** Claimed effective (or void) point T. */
  readonly effectivePoint: DacV0041TimePoint;
  /** For supersession: identity of the replacement link (0..1). */
  readonly replacementLinkIdentity?: string;
}

/**
 * Scope-owner anchor evidence (F-01 §1/§3): recoverable proof that
 * `ownerIdentity` owns exactly the listed scopes. The mechanism is
 * implementation freedom; the verifier requires, for each root link, that
 * the anchor of its designator proves BOTH the chain scope AND every scope
 * named in the root delegation envelope (C130/C168 — an envelope naming an
 * unowned scope invalidates the root link and every grant under it).
 */
export interface DacV0041ScopeOwnerAnchorFacts {
  readonly ownerIdentity: string;
  readonly provedScopes: readonly string[];
}

/**
 * Complete designation-chain verification input. `links` carries the whole
 * recoverable chain of the relied-upon leaf link; `evaluationPoint` is the
 * point at which chain-currentness is decided (the prospective use point for
 * new authoritative issuance, or an artifact's evidenced issuance point when
 * historical issuance-time validity is what is being checked — F-01 §6
 * steps 7–8).
 */
export interface DacV0041DesignationChainInput {
  readonly links: readonly DacV0041DesignationLinkFacts[];
  readonly leafLinkIdentity: string;
  readonly scopeOwnerAnchors: readonly DacV0041ScopeOwnerAnchorFacts[];
  /**
   * Exact identities asserted to hold the Composer role. A Composer-role
   * identity MUST NOT designatate and MUST NOT hold `designation-issuance`
   * (C129); co-location alone never creates designation authority.
   */
  readonly composerRoleIdentities?: readonly string[];
  readonly evaluationPoint: DacV0041TimePoint;
}

/** Deterministic FAIL_CLOSED reason codes for designation-chain verification. */
export type DacV0041DesignationChainFailureCode =
  | 'INVALID_FACTS'
  | 'MUTABLE_ALIAS_IDENTITY'
  | 'CHAIN_UNRECOVERABLE'
  | 'SELF_DESIGNATION'
  | 'REPEATED_DESIGNATED_ISSUER'
  | 'COMPOSER_DESIGNATOR'
  | 'PARENT_ROLE_NOT_DESIGNATION_ISSUANCE'
  | 'IDENTITY_DISCONTINUITY'
  | 'ROLE_NOT_ENVELOPED'
  | 'SCOPE_NOT_ENVELOPED'
  | 'CONSTRAINT_NOT_INHERITED'
  | 'PROFILE_NOT_PERMITTED'
  | 'SOD_PERMISSION_NOT_PERMITTED'
  | 'WINDOW_NOT_ATTENUATED'
  | 'BACKDATED_EFFECTIVE_FROM'
  | 'REDELEGATION_NOT_PERMITTED'
  | 'ENVELOPE_WIDENING'
  | 'ROOT_ANCHOR_UNESTABLISHED'
  | 'ISSUANCE_EVIDENCE_UNESTABLISHED'
  | 'ANCESTOR_NOT_CURRENT_AT_ISSUANCE'
  | 'VOID_INVALIDATES_DESCENDANT'
  | 'CHAIN_VOIDED';

/** Deterministic not-chain-current reasons (ordinary, prospective §7 ends). */
export type DacV0041ChainLapseReason =
  | 'not-yet-effective'
  | 'expired'
  | 'superseded'
  | 'revoked'
  | 'relinquished';

/**
 * Terminal designation-chain verification result. The outcome precedence is
 * frozen and deterministic:
 *
 *   1. structural/facts/authority violations  => FAIL_CLOSED (dominates every
 *      temporal state, mirroring the C152/C171 structural-dominates-staleness
 *      rule);
 *   2. retroactive void applying at the evaluation point => FAIL_CLOSED
 *      `CHAIN_VOIDED` (revocation-class invalidation dominates staleness);
 *   3. ordinary prospective lapse / not-yet-effective => STALE with the
 *      exact lapse reason and lapsed link;
 *   4. otherwise => CHAIN_CURRENT (usable for the owning seam's own further
 *      checks — never a COMPATIBLE disposition; this module never evaluates
 *      compatibility).
 *
 * Every outcome also reports end acts that were supplied but REJECTED (no
 * effect), so callers keep the full adversarial record without any rejected
 * act silently rewriting `end(L)` (C127).
 */
export type DacV0041DesignationChainVerification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: DacV0041DesignationChainFailureCode;
      readonly linkIdentity?: string;
      readonly detail: string;
      readonly rejectedEndActs: readonly DacV0041RejectedEndAct[];
    }
  | {
      readonly outcome: 'STALE';
      readonly reason: DacV0041ChainLapseReason;
      readonly lapsedLinkIdentity: string;
      readonly endKind?: DacV0041EndActKind;
      readonly detail: string;
      readonly rejectedEndActs: readonly DacV0041RejectedEndAct[];
    }
  | {
      readonly outcome: 'CHAIN_CURRENT';
      readonly rootLinkIdentity: string;
      readonly chainLinkIdentities: readonly string[];
      readonly detail: string;
      readonly rejectedEndActs: readonly DacV0041RejectedEndAct[];
    };

/** A supplied end act that was rejected and therefore had NO effect. */
export interface DacV0041RejectedEndAct {
  readonly actIdentity: string;
  readonly kind: DacV0041EndActKind;
  readonly reason:
    | 'unauthorized-issuer'
    | 'issuer-not-holder'
    | 'evidence-unestablished'
    | 'backdated'
    | 'void-point-outside-interval';
}

/** Deterministic FAIL_CLOSED reason codes for adoption verification. */
export type DacV0041AdoptionFailureCode =
  | 'INVALID_FACTS'
  | 'NON_ADOPTABLE_CLASS'
  | 'CLASS_PRECONDITION_UNSATISFIED'
  | 'MALFORMED_SOURCE'
  | 'REEVALUATION_INCOMPLETE'
  | 'ADOPTION_ISSUER_CHAIN_INVALID'
  | 'ADOPTION_ISSUER_CHAIN_NOT_CURRENT'
  | 'ADOPTION_ISSUER_MISMATCH'
  | 'WRONG_ROLE_ISSUER'
  | 'SCOPE_NOT_COVERED'
  | 'CONSTRAINT_NOT_COVERED'
  | 'PROFILE_NOT_COVERED'
  | 'SOD_PERMISSION_NOT_PERMITTED'
  | 'ISSUANCE_EVIDENCE_UNESTABLISHED'
  | 'BACKDATED_ADOPTION';

/** Complete AuthorityAdoption verification input (F-06 §6.2 elements 1–6). */
export interface DacV0041AuthorityAdoptionFacts {
  readonly adoptionActIdentity: string;
  readonly adoptionIssuerIdentity: string;
  /** Claimed adoptable artifact class token (§6.3/§6.4 vocabulary). */
  readonly adoptedArtifactClass: string;
  /**
   * Exact historic artifact reference, adopted through the A41-001
   * foundation and therefore identity-closed, immutable and — for a
   * genuinely older-baseline artifact — carrying the exact frozen
   * `predecessorOrigin` evidence. This binding is what a consumer wrapper
   * or a predecessor-as-successor relabel cannot forge (C145/C147).
   */
  readonly adoptedArtifactRef: DacV0041Reference;
  /** Exact origin DAC/reference profile identity of the historic artifact. */
  readonly originDacProfileIdentity: string;
  /**
   * Exact authority role required to issue the adopted artifact class. The
   * class-to-role mapping is the caller's exact assertion; this verifier
   * enforces it exactly against the issuer chain leaf and never guesses a
   * mapping.
   */
  readonly requiredIssuingRole: string;
  /**
   * The adoption issuer's designation-chain evidence, evaluated
   * chain-current at the adoption act's evidenced issuance point.
   */
  readonly issuerDesignationChain: DacV0041DesignationChainInput;
  /** The adoption act's own independently recoverable issuance evidence. */
  readonly issuanceEvidence: DacV0041IssuancePointEvidence;
  /**
   * Claimed authority-effective point. Defaults to the evidenced issuance
   * point; MUST NOT precede it (adoption never creates effect before the
   * adoption point — C147/C164 backdate family).
   */
  readonly effectivePoint?: DacV0041TimePoint;
  /** Re-evaluation evidence coverage (§6.2 element 5): all six established. */
  readonly reEvaluation: {
    readonly sourceAuthenticityEstablished: boolean;
    readonly sourceProvenanceRecoverable: boolean;
    readonly subjectExactnessEstablished: boolean;
    readonly sourceCurrentnessEstablished: boolean;
    readonly evidenceClosureRecoverable: boolean;
    readonly classSpecificObligationsSatisfied: boolean;
  };
  /** Exact constraint tokens established for the adopted subject. */
  readonly subjectConstraintTokens: readonly string[];
  /** Exact DAC/reference profile the adoption is issued under. */
  readonly adoptionDacProfileIdentity: string;
  /** SoD/co-location permissions the adoption act itself relies on (0..n). */
  readonly sodReliedPermissions?: readonly string[];
  /** Class-specific preconditions (§6.3 conditional adoptions). */
  readonly classPreconditions: {
    /** `external-authority`: the declaration is NOT a designation/specialization. */
    readonly notADesignationSpecialization?: boolean;
    /** `application-selection`: valid ApplicationIdentityEstablishmentRef exists. */
    readonly selectionIdentityEstablishmentValid?: boolean;
    /** `application-semantic`: adopted via a new valid establishment record. */
    readonly adoptedViaNewEstablishmentRecord?: boolean;
  };
}

/**
 * Terminal AuthorityAdoption verification result with the frozen precedence
 * ladder (deterministic adoption-failure precedence):
 *
 *   1. malformed facts           => FAIL_CLOSED INVALID_FACTS
 *   2. non-adoptable / unknown class => FAIL_CLOSED NON_ADOPTABLE_CLASS
 *   3. class precondition unsatisfied => FAIL_CLOSED CLASS_PRECONDITION_
 *      UNSATISFIED
 *   4. forged/unbound or successor-native source (no exact predecessor
 *      origin binding) => FAIL_CLOSED MALFORMED_SOURCE
 *   5. incomplete re-evaluation => FAIL_CLOSED REEVALUATION_INCOMPLETE
 *   6. issuer chain invalid (structural, per the chain precedence) =>
 *      FAIL_CLOSED ADOPTION_ISSUER_CHAIN_INVALID (carries the chain code)
 *   7. issuer chain not current at the adoption point => FAIL_CLOSED
 *      ADOPTION_ISSUER_CHAIN_NOT_CURRENT
 *   8. issuer/role/scope mismatch => FAIL_CLOSED (C147 wrong-role/out-of-
 *      scope; C118 non-designated)
 *   9. constraint/profile/SoD coverage failure => FAIL_CLOSED (C164)
 *  10. adoption act evidence not independently established => FAIL_CLOSED
 *      (C128)
 *  11. backdated effect => FAIL_CLOSED BACKDATED_ADOPTION
 *  12. otherwise => ADOPTED_PROSPECTIVE: valid subject to all other DAC
 *      checks, with new authority effective ONLY from the adoption point and
 *      the new authoritative issuance point being the adoption act's
 *      evidenced issuance point (C146/C165).
 */
export type DacV0041AuthorityAdoptionVerification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: DacV0041AdoptionFailureCode;
      readonly detail: string;
      /** Chain-derived code when the issuer chain itself failed. */
      readonly chainCode?: DacV0041DesignationChainFailureCode;
    }
  | {
      readonly outcome: 'ADOPTED_PROSPECTIVE';
      readonly effectiveFrom: DacV0041TimePoint;
      readonly newAuthoritativeIssuancePoint: DacV0041TimePoint;
      readonly detail: string;
    };

/**
 * Classification of presenting a historic (older-baseline) authority-bearing
 * artifact for DIRECT v0.0.4.1 authoritative use (F-06 §6.1; C145):
 *
 *   - successor-native artifact (no predecessor origin) => `NOT_HISTORIC`
 *     (this classifier is not its gate; the owning v0.0.4.1 seams govern it);
 *   - historic artifact whose historical issuance chain ALREADY satisfies
 *     the v0.0.4.1 requirements => `NO_ADOPTION_REQUIRED` (§6.1 sentence 2);
 *   - any other historic artifact => `ADOPTION_REQUIRED`: direct use in a
 *     v0.0.4.1 authoritative chain fails closed; the only positive paths are
 *     fresh issuance or a valid AuthorityAdoptionRef.
 *   - non-foundation carrier => FAIL_CLOSED MALFORMED_SOURCE (forgery).
 */
export type DacV0041HistoricArtifactUseClassification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: 'INVALID_FACTS' | 'MALFORMED_SOURCE';
      readonly detail: string;
    }
  | { readonly outcome: 'NOT_HISTORIC' }
  | { readonly outcome: 'NO_ADOPTION_REQUIRED' }
  | { readonly outcome: 'ADOPTION_REQUIRED' };

/** Input for {@link classifyDacV0041HistoricAuthorityArtifactUse}-style facts. */
export interface DacV0041HistoricArtifactUseFacts {
  /** Candidate authority-bearing artifact reference (foundation-minted). */
  readonly artifactRef: unknown;
  /**
   * Externally established fact: does the artifact's historical issuance
   * chain already satisfy every v0.0.4.1 requirement (§6.1 sentence 2)?
   * Undecided/absent fails closed toward `ADOPTION_REQUIRED` for genuinely
   * historic artifacts.
   */
  readonly historicChainSatisfiesV0041: boolean;
}
