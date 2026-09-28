// Issue #358 / A41-004 (reviewed #353 Task DAG; trigger comment 5851586129):
// bounded CONSUMER/VERIFIER surface — never an issuer — for DAC v0.0.4.1
// F-04 composition-intake semantics (LIFECYCLE_REFERENCE_REPAIRS.md §4:
// ApplicationIdentityEstablishmentRef / ApplicationSelectionRef /
// seam-typed AuthorityRefusalRef; APPLICATION_MANIFEST.md §§1–4 successor
// precedence N-002; DOMAIN_DATA_IR.md §2 selection/promotion distinctness)
// at the exact successor semantic freeze pinned by the A41-001 foundation
// (commit 75fee75b… / tree c74cf5e3…) and consuming the A41-002 designation
// chain verifier for issuer authorization.
//
// This module consumes EXTERNALLY RECOVERED evidence and classifies it
// deterministically at composition/binding intake. It never mints, issues,
// establishes, selects, refuses, promotes or publishes any application
// identity, selection, refusal, Manifest or promotion artifact: identity
// establishment, application selection, AuthorityRefusal issuance, promotion
// and Manifest issuance are explicitly NOT owned here (C140/C141/C142/C143;
// APPLICATION_MANIFEST.md §§1–2). Intake can only verify-and-accept or fail
// closed — no selection authority is created, no Manifest is issued, and no
// Manifest evidence is collapsed into live Runtime state (this module has no
// runtime-state reads or writes at all).
//
// Every decision path fails closed — an absent, foreign, stale,
// predecessor-wrapped, unauthorized or mismatched fact is never guessed,
// defaulted, normalized or repaired into a narrower valid one
// (C145/C147/C80/C81). Like the foundation, this module freezes NO wire
// schema, serialization, cryptography, clock, storage or transport.
//
// Portable: no Node built-ins, no engine internals, no imports from any
// historical DAC adapter. Imports only the A41-001 foundation contracts and
// the A41-002 authority contracts.

import type { DacV0041Reference } from '../contracts.js';
import type {
  DacV0041DesignationChainFailureCode,
  DacV0041DesignationChainInput,
  DacV0041IssuancePointEvidence,
  DacV0041TimePoint,
} from '../authority/contracts.js';

/**
 * F-04 §4.2: the exact seam kinds a substantive `AuthorityRefusalRef` applies
 * to — refusal of AuthorityDesignationRef issuance, application-identity
 * establishment, Manifest issuance, Runtime binding and Runtime activation.
 * Every other seam token is unknown and fails closed; Runtime binding and
 * Runtime activation refusals are NEVER conflated
 * (`AuthorityRefusalRef(RuntimeBinding) != AuthorityRefusalRef(RuntimeActivation)`).
 */
export const DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS = [
  'authority-designation-issuance',
  'application-identity-establishment',
  'manifest-issuance',
  'runtime-binding',
  'runtime-activation',
] as const;

export type DacV0041AuthorityRefusalSeamKind =
  (typeof DAC_V0041_AUTHORITY_REFUSAL_SEAM_KINDS)[number];

/**
 * F-04 §4.2 seam-to-request-role binding: a refusal MUST bind the exact
 * request/initiation of its own seam. A refusal whose bound request role
 * belongs to a different seam (the Runtime-binding/Runtime-activation
 * conflation shape of C142) fails closed as a seam conflation, never
 * re-typed.
 */
export const DAC_V0041_REFUSAL_SEAM_REQUEST_ROLES: Readonly<
  Record<DacV0041AuthorityRefusalSeamKind, string>
> = Object.freeze({
  'authority-designation-issuance': 'authority-designation-request',
  'application-identity-establishment': 'application-identity-establishment-request',
  'manifest-issuance': 'manifest-issuance-request',
  'runtime-binding': 'runtime-binding-request',
  'runtime-activation': 'runtime-activation-request',
} as const);

/**
 * Reference roles this intake consumes as externally owned evidence. A
 * presented reference carrying any other role fails closed with
 * ROLE_MISMATCH — a ManifestDraft, promotion decision or request reference
 * can never occupy a result/decision position (C88 / APPLICATION_MANIFEST
 * §4; CROSS_LAYER_REFERENCES §6). The generic `evidence` registry role is
 * consumed only for F-04 §4.1 requestless initiation records (A41-004R1:
 * requestless initiation must be externally recoverable evidence, never a
 * caller boolean claim).
 */
export const DAC_V0041_COMPOSITION_INTAKE_EVIDENCE_ROLES = [
  'application-identity-establishment',
  'application-identity-establishment-request',
  'application-semantic',
  'application-selection',
  'application-revision',
  'manifest',
  'manifest-content-digest',
  'manifest-issuance-request',
  'authority-refusal',
  'selected-domain-data',
  'promotion-decision',
  'evidence',
] as const;

export type DacV0041CompositionIntakeEvidenceRole =
  (typeof DAC_V0041_COMPOSITION_INTAKE_EVIDENCE_ROLES)[number];

/** Deterministic FAIL_CLOSED reason codes for composition-intake. */
export type DacV0041CompositionIntakeFailureCode =
  | 'INVALID_FACTS'
  | 'FOREIGN_EVIDENCE'
  | 'ROLE_MISMATCH'
  | 'PREDECESSOR_WRAPPED'
  | 'IDENTITY_ALIAS'
  | 'EVIDENCE_UNESTABLISHED'
  | 'UNAUTHORIZED_ISSUER'
  | 'ESTABLISHMENT_ORDER_VIOLATED'
  | 'SCOPE_MISMATCH'
  | 'PROFILE_MISMATCH'
  | 'SUBJECT_MISMATCH'
  | 'INCOMPLETE_SELECTED_TUPLE'
  | 'COVERAGE_INCOMPLETE'
  | 'COVERAGE_INVALIDATED'
  | 'SELECTION_INVALIDATED'
  | 'MANIFEST_INVALIDATED'
  | 'MATERIAL_REFUSAL_OMITTED'
  | 'REFUSAL_SEAM_UNKNOWN'
  | 'REFUSAL_SEAM_CONFLATED'
  | 'REFUSAL_RECLASSIFIED'
  | 'REQUEST_REFUSAL_ALIAS'
  | 'UNAUTHORIZED_REFUSER';

/** Deterministic STALE reason codes (non-current reusable evidence). */
export type DacV0041CompositionIntakeStaleCode =
  | 'ISSUER_CHAIN_STALE'
  | 'COVERAGE_NOT_CURRENT'
  | 'SELECTION_NOT_CURRENT'
  | 'MANIFEST_NOT_CURRENT';

/**
 * F-04 §4.1 requestless initiation evidence (A41-004R1 repair of #377
 * P1-1): when no `ApplicationIdentityEstablishmentRequestRef` seam is used,
 * the "explicitly evidenced initiation" the frozen minima demand MUST be an
 * externally recoverable record — never a caller boolean claim. The record
 * carries its minted `evidence`-role reference, the exact initiating
 * subject, the issuer that evidenced the initiation, and independently
 * recoverable initiation provenance. Intake verifies the exact
 * reference/evidence/provenance/issuer/subject closure (carrier, role,
 * predecessor wrap, identity anti-alias, scope binding, attestor-backed
 * provenance, issuer recoverability, initiation-before-establishment
 * ordering); a claim-only or self-asserted boolean cannot close identity
 * intake.
 */
export interface DacV0041RequestlessInitiationEvidence {
  /**
   * Minted `evidence`-role reference of the initiation record (exactly 1).
   * Its `authorityScope` must equal the establishment's application scope
   * (subject/scope closure) and its identity must stay distinct from every
   * other F-04 chain identity (C141).
   */
  readonly initiationRef: DacV0041Reference;
  /** Exact initiating subject identity (exactly 1, non-empty). */
  readonly initiatedBy: string;
  /**
   * Identity of the issuer that evidenced the initiation record (exactly 1).
   * MUST be among the initiation provenance attestors, so the issuer claim
   * is backed by the independently recoverable provenance closure.
   */
  readonly initiationIssuerIdentity: string;
  /**
   * Independently recoverable initiation provenance (exactly 1): the
   * initiation record's own issuance point and attestors. Must be attested
   * (>= 1 attestor) and must strictly precede the establishment issuance
   * point — the establishment record responds to its initiation, never the
   * other way around.
   */
  readonly initiationProvenance: DacV0041IssuancePointEvidence;
}

/**
 * ASSEMBLY_PROFILES §8.2 current authoritative reuse closure (A41-004R1
 * repair of #377 P1-3): before an externally issued ApplicationSelectionRef
 * or authoritative Manifest is reused for a new authoritative action
 * (composition intake here), the consumer MUST re-check explicit later
 * invalidation/revocation/void and ordinary supersession/current status.
 * This is the externally established currentness determination for one
 * artifact, evaluated for the intended current use at the input evaluation
 * point. `establishedAt` MUST be no earlier than the artifact's own
 * issuance point (a determination predating the artifact is malformed) and
 * no earlier than the evaluation point (a determination that does not cover
 * the intended use point is not current for that use). The evaluation
 * point itself MUST be no earlier than the artifact's own issuance point —
 * an intended use that predates the selection/Manifest issuance is an
 * impossible temporal claim and fails closed (A41-004R2 / #381 P1-3).
 */
export interface DacV0041ReuseCurrentnessFacts {
  /**
   * Externally established currentness state (closed per-artifact
   * vocabulary; undecidable states fail closed).
   */
  readonly state: string;
  /** Point at which the currentness state was externally established. */
  readonly establishedAt: DacV0041TimePoint;
  /** Independent attestors of the currentness determination (1..n). */
  readonly assertedBy: readonly string[];
}

/**
 * Closed currentness vocabulary for ApplicationSelectionRef reuse
 * (ASSEMBLY_PROFILES §§8.2–8.3, §9): `revoked`/`voided` are explicit
 * invalidations that FAIL CLOSED for new authoritative use;
 * `stale`/`superseded`/`reselected` are ordinary non-current states that are
 * STALE for authoritative intake; `current` passes only when the
 * determination covers the evaluation point.
 */
export const DAC_V0041_SELECTION_REUSE_CURRENTNESS_STATES = [
  'current',
  'stale',
  'superseded',
  'reselected',
  'revoked',
  'voided',
] as const;

/**
 * Closed currentness vocabulary for authoritative Manifest reuse
 * (ASSEMBLY_PROFILES §8.2 "Manifest revision/currentness"): same
 * deterministic FAIL_CLOSED/STALE precedence; `reselected` is a selection
 * state and is NOT a Manifest state (undecidable for a Manifest).
 */
export const DAC_V0041_MANIFEST_REUSE_CURRENTNESS_STATES = [
  'current',
  'stale',
  'superseded',
  'revoked',
  'voided',
] as const;

/**
 * Externally recovered facts of one `ApplicationIdentityEstablishmentRef`
 * (F-04 §4.1 minima, carried as evidence — never issued here).
 */
export interface DacV0041IdentityEstablishmentFacts {
  /** Minted `application-identity-establishment` reference (exactly 1). */
  readonly establishmentRef: DacV0041Reference;
  /**
   * Minted `application-identity-establishment-request` reference: exactly 1
   * when a request seam is used. Mutually exclusive with
   * `requestlessInitiation` — both present is an ambiguous seam and neither
   * present is absent initiation evidence; both fail closed (C141
   * anti-alias either way).
   */
  readonly establishmentRequestRef?: DacV0041Reference;
  /**
   * F-04 §4.1 "explicitly evidenced initiation" for the requestless seam:
   * an externally recoverable initiation record with exact
   * reference/evidence/provenance/issuer/subject closure. A boolean
   * caller claim can never substitute for it (A41-004R1 / #377 P1-1).
   */
  readonly requestlessInitiation?: DacV0041RequestlessInitiationEvidence;
  /** The established `ApplicationSemanticIdentity` (minted, exactly 1). */
  readonly applicationSemanticIdentityRef: DacV0041Reference;
  /** Issuer identity of the establishment record (exactly 1). */
  readonly issuerIdentity: string;
  /**
   * The issuer's designation-chain evidence for the
   * `application-identity-establishment` role, evaluated chain-current at
   * the establishment record's evidenced issuance point.
   */
  readonly issuerDesignationChain: DacV0041DesignationChainInput;
  /** Exact issuing role asserted for the establishment issuer. */
  readonly requiredIssuingRole: string;
  /** Application scope the establishment covers (exactly 1). */
  readonly applicationScope: string;
  /** Exact DAC/reference profile identity (exactly 1). */
  readonly dacProfileIdentity: string;
  /** Independently recoverable issuance-point evidence (exactly 1). */
  readonly issuanceEvidence: DacV0041IssuancePointEvidence;
}

/**
 * Externally recovered facts of one `ApplicationSelectionRef`
 * (APPLICATION_MANIFEST.md §2; DOMAIN_DATA_IR.md §2 — selection binds exact
 * promotion-backed subjects to an ALREADY established application identity).
 */
export interface DacV0041ApplicationSelectionFacts {
  /** Minted `application-selection` reference (exactly 1). */
  readonly selectionRef: DacV0041Reference;
  /** The already-established application semantic identity it binds. */
  readonly applicationSemanticIdentityRef: DacV0041Reference;
  /**
   * Exact selected Domain Data subject refs (1..n, `selected-domain-data`).
   * Every ref MUST carry the COMPLETE exact selected tuple — non-empty
   * `authorityScope` + `primaryIdentity` + `semanticIdentity` +
   * `revisionIdentity` + `contentDigest` (DOMAIN_DATA_IR §2; A41-004R3 /
   * #385 P1-1). An exactness component that is absent or blank is required
   * material missing, fails closed as INCOMPLETE_SELECTED_TUPLE BEFORE any
   * correspondence/coverage is evaluated, and is never normalized to null.
   */
  readonly selectedDomainDataRefs: readonly DacV0041Reference[];
  /** Selection issuer identity (exactly 1). */
  readonly issuerIdentity: string;
  /** The selection issuer's designation chain at the selection issuance point. */
  readonly issuerDesignationChain: DacV0041DesignationChainInput;
  /** Exact issuing role asserted for the selection issuer. */
  readonly requiredIssuingRole: string;
  /** Application scope the selection covers (exactly 1). */
  readonly applicationScope: string;
  /** Exact DAC/reference profile identity (exactly 1). */
  readonly dacProfileIdentity: string;
  /** Independently recoverable issuance-point evidence (exactly 1). */
  readonly issuanceEvidence: DacV0041IssuancePointEvidence;
  /**
   * ASSEMBLY_PROFILES §8.2 current authoritative reuse closure: the
   * externally established invalidation/supersession/reselection/current
   * status of this selection, evaluated for the intended current use at the
   * input evaluation point (A41-004R1 / #377 P1-3). A historically valid
   * but later superseded/reselected/revoked selection can never close
   * authoritative intake.
   */
  readonly reuseCurrentness: DacV0041ReuseCurrentnessFacts;
}

/**
 * Externally recovered facts of one authoritative Application Manifest
 * presented as successor evidence (APPLICATION_MANIFEST.md §§1–3 N-002
 * precedence). Verified only: this intake never issues, drafts or absorbs a
 * Manifest, and never reads or writes live Runtime state.
 */
export interface DacV0041ManifestEvidenceFacts {
  /** Minted `manifest` reference — a ManifestDraft identity fails closed. */
  readonly manifestRef: DacV0041Reference;
  /** Minted `manifest-content-digest` reference (distinct identity). */
  readonly manifestContentDigestRef: DacV0041Reference;
  /** Minted `application-revision` reference for the immutable composition. */
  readonly applicationRevisionRef: DacV0041Reference;
  /** The established application semantic identity the composition claims. */
  readonly applicationSemanticIdentityRef: DacV0041Reference;
  /**
   * Exact selected Domain Data subjects the composition claims (1..n). Every
   * ref MUST carry the COMPLETE exact selected tuple — non-empty
   * `authorityScope` + `primaryIdentity` + `semanticIdentity` +
   * `revisionIdentity` + `contentDigest` (DOMAIN_DATA_IR §2; A41-004R3 /
   * #385 P1-1); an absent/blank exactness component fails closed as
   * INCOMPLETE_SELECTED_TUPLE before correspondence/coverage.
   */
  readonly selectedDomainDataRefs: readonly DacV0041Reference[];
  /** Composition/Manifest-issuance issuer identity (exactly 1). */
  readonly issuerIdentity: string;
  /** The Manifest issuer's designation chain at the Manifest issuance point. */
  readonly issuerDesignationChain: DacV0041DesignationChainInput;
  /** Exact issuing role asserted for the Manifest issuer. */
  readonly requiredIssuingRole: string;
  /** Application scope the Manifest covers (exactly 1). */
  readonly applicationScope: string;
  /** Exact DAC/reference profile identity (exactly 1). */
  readonly dacProfileIdentity: string;
  /** Independently recoverable issuance-point evidence (exactly 1). */
  readonly issuanceEvidence: DacV0041IssuancePointEvidence;
  /**
   * ASSEMBLY_PROFILES §8.2 current authoritative reuse closure for the
   * Manifest: the externally established invalidation/supersession/
   * revision-currentness status, evaluated for the intended current use at
   * the input evaluation point (A41-004R1 / #377 P1-3). A stale or
   * superseded Manifest revision can never close authoritative intake.
   */
  readonly reuseCurrentness: DacV0041ReuseCurrentnessFacts;
}

/**
 * One seam-typed `AuthorityRefusalRef` presented as material invocation
 * evidence (F-04 §4.2). A substantive refusal is a `produced-result`
 * negative decision — never an invocation transport/input outcome.
 */
export interface DacV0041AuthorityRefusalFacts {
  /** Minted `authority-refusal` reference (exactly 1). */
  readonly refusalRef: DacV0041Reference;
  /** Exact seam kind the refusal refuses (closed vocabulary). */
  readonly seamKind: string;
  /** The exact request/initiation the refusal binds (its seam's request role). */
  readonly exactRequestRef: DacV0041Reference;
  /** Refusing issuer identity (exactly 1). */
  readonly refusingIssuerIdentity: string;
  /** The refusing issuer's designation chain at the refusal issuance point. */
  readonly issuerDesignationChain: DacV0041DesignationChainInput;
  /** Exact issuing role asserted for the refusing issuer. */
  readonly requiredIssuingRole: string;
  /** Exact subject scope the refusal covers (exactly 1). */
  readonly subjectScope: string;
  /** Exact DAC/reference profile identity (exactly 1). */
  readonly dacProfileIdentity: string;
  /** Independently recoverable issuance-point evidence (exactly 1). */
  readonly issuanceEvidence: DacV0041IssuancePointEvidence;
  /**
   * The capability-outcome class the refusal was presented under. A
   * substantive refusal MUST be `produced-result`; presenting it as
   * `rejected/invalid-input`, `failed-known-no-result`,
   * `blocked/missing-capability` or any other non-producing class is the
   * C142 reclassification shape and fails closed.
   */
  readonly presentedOutcomeClass: string;
}

/**
 * One selected Domain Data subject's coverage evidence
 * (APPLICATION_MANIFEST.md §3 Domain Data minimums; DOMAIN_DATA_IR.md §2):
 * effective promotion coverage AND effective application-selection coverage,
 * with the promotion decision's externally established currentness.
 */
export interface DacV0041SelectedDomainDataFacts {
  /**
   * Minted `selected-domain-data` subject reference (exactly 1). Its FULL
   * exact selected tuple — authority scope + primary/semantic/revision
   * identity + content digest (DOMAIN_DATA_IR §2) — must be COMPLETE (every
   * component present and non-empty; an absent/blank exactness component
   * fails closed as INCOMPLETE_SELECTED_TUPLE before
   * correspondence/coverage — A41-004R3 / #385 P1-1) and must correspond
   * to the selection/Manifest subject it covers; primary-identity
   * coincidence alone is not coverage (A41-004R2 / #381 P1-2).
   */
  readonly subjectRef: DacV0041Reference;
  /** Minted `promotion-decision` reference covering this subject (exactly 1). */
  readonly promotionCoverageRef: DacV0041Reference;
  /** Externally established currentness of the promotion coverage. */
  readonly promotionCurrentness: string;
  /** Minted `application-selection` reference covering this subject. */
  readonly selectionCoverageRef: DacV0041Reference;
}

/**
 * Complete composition-intake verification input. Every field is externally
 * owned evidence; `evaluationPoint` is the point at which coverage
 * currentness is decided. The verifier performs no live-state reads or
 * writes anywhere.
 */
export interface DacV0041CompositionIntakeInput {
  readonly applicationIdentityEstablishment: DacV0041IdentityEstablishmentFacts;
  readonly applicationSelection: DacV0041ApplicationSelectionFacts;
  readonly manifest: DacV0041ManifestEvidenceFacts;
  /** Seam-typed material refusal evidence presented with the claim (0..n). */
  readonly materialRefusals: readonly DacV0041AuthorityRefusalFacts[];
  /** Coverage records for the selected Domain Data subjects (1..n). */
  readonly selectedDomainData: readonly DacV0041SelectedDomainDataFacts[];
  /**
   * Externally asserted fact (C143 / C97 evidence anti-selection): the
   * presented claim discloses EVERY material refusal for the same subject —
   * no material refusal is omitted merely because a later favorable result
   * exists. False/undecided fails closed.
   */
  readonly refusalDisclosureComplete: boolean;
  readonly evaluationPoint: DacV0041TimePoint;
}

/** Deterministic FAIL_CLOSED codes for refusal-evidence verification. */
export type DacV0041AuthorityRefusalFailureCode =
  | 'INVALID_FACTS'
  | 'FOREIGN_EVIDENCE'
  | 'ROLE_MISMATCH'
  | 'PREDECESSOR_WRAPPED'
  | 'REQUEST_REFUSAL_ALIAS'
  | 'REFUSAL_SEAM_UNKNOWN'
  | 'REFUSAL_SEAM_CONFLATED'
  | 'REFUSAL_RECLASSIFIED'
  | 'EVIDENCE_UNESTABLISHED'
  | 'UNAUTHORIZED_REFUSER'
  | 'REFUSER_CHAIN_STALE';

/**
 * Terminal refusal-evidence verification result with the frozen precedence
 * ladder (deterministic; structural dominates temporal, mirroring the
 * C152/C171 rule). Structural SHAPE is separate from minted-CARRIER
 * validation (A41-004R1 / #377 P2-1): a structurally shaped but forged
 * carrier is typed FOREIGN_EVIDENCE, not INVALID_FACTS:
 *
 *   1. malformed facts                       => FAIL_CLOSED INVALID_FACTS
 *   2. foreign/forged carrier                => FAIL_CLOSED FOREIGN_EVIDENCE
 *   3. wrong role / predecessor-wrapped       => FAIL_CLOSED (ROLE_MISMATCH /
 *      PREDECESSOR_WRAPPED; C145 older evidence cannot be consumer-wrapped)
 *   4. request/refusal identity alias        => FAIL_CLOSED
 *      REQUEST_REFUSAL_ALIAS (C141 family)
 *   5. unknown seam kind                     => FAIL_CLOSED
 *      REFUSAL_SEAM_UNKNOWN (closed vocabulary)
 *   6. request role of a different seam      => FAIL_CLOSED
 *      REFUSAL_SEAM_CONFLATED (C142 binding != activation)
 *   7. non-`produced-result` presentation    => FAIL_CLOSED
 *      REFUSAL_RECLASSIFIED (C142 substantive refusal != transport outcome)
 *   8. evidence unestablished                => FAIL_CLOSED (C128 family)
 *   9. refuser chain invalid                 => FAIL_CLOSED
 *      UNAUTHORIZED_REFUSER (carries the chain code)
 *  10. refuser chain lapsed at issuance      => STALE REFUSER_CHAIN_STALE
 *  11. otherwise                             => REFUSAL_VERIFIED — evidence
 *      only; consuming it creates no selection/promotion/Manifest authority.
 */
export type DacV0041AuthorityRefusalEvidenceVerification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: Exclude<DacV0041AuthorityRefusalFailureCode, 'REFUSER_CHAIN_STALE'>;
      readonly detail: string;
      readonly chainCode?: DacV0041DesignationChainFailureCode;
    }
  | {
      readonly outcome: 'STALE';
      readonly code: 'REFUSER_CHAIN_STALE';
      readonly detail: string;
    }
  | {
      readonly outcome: 'REFUSAL_VERIFIED';
      readonly seamKind: DacV0041AuthorityRefusalSeamKind;
      readonly refusalIdentity: string;
      readonly detail: string;
    };

/**
 * Terminal composition-intake verification result with the frozen precedence
 * ladder (deterministic; structural and authority violations dominate
 * temporal/currentness states, mirroring C152/C171):
 *
 *   1. malformed facts                      => FAIL_CLOSED INVALID_FACTS
 *   2. foreign/forged carrier               => FAIL_CLOSED FOREIGN_EVIDENCE
 *   3. wrong evidence role                  => FAIL_CLOSED ROLE_MISMATCH
 *      (a ManifestDraft/request/promotion reference can never occupy a
 *      result position — C88 / APPLICATION_MANIFEST §4)
 *   4. predecessor-wrapped evidence         => FAIL_CLOSED
 *      PREDECESSOR_WRAPPED (C145: a v0.0.3-or-earlier artifact cannot be
 *      consumer-wrapped into successor evidence; adoption is the separate
 *      A41-002 path, never intake)
 *   5. identity alias across the F-04 chain => FAIL_CLOSED IDENTITY_ALIAS
 *      (C141: establishment != request != semantic identity; selection !=
 *      establishment; manifest != selection/digest/revision/semantic)
 *   6. issuance evidence unestablished      => FAIL_CLOSED (C128 family)
 *   7. issuer not designated (chain invalid)=> FAIL_CLOSED UNAUTHORIZED_
 *      ISSUER (C140/C90 family; carries the chain code)
 *   8. establishment does not precede
 *      selection / selection precedes
 *      Manifest issuance / requestless
 *      initiation does not precede the
 *      establishment issuance         => FAIL_CLOSED
 *      ESTABLISHMENT_ORDER_VIOLATED (C140; APPLICATION_MANIFEST §2;
 *      A41-004R1: initiation ordering closure for the requestless seam)
 *   9. scope/profile/subject mismatch      => FAIL_CLOSED (SCOPE_MISMATCH /
 *      PROFILE_MISMATCH / SUBJECT_MISMATCH — exact-token only, never fuzzy;
 *      the selection and Manifest selected-subject sets must correspond
 *      EXACTLY as full exact selected tuples — authority scope + primary/
 *      semantic/revision identity + content digest (DOMAIN_DATA_IR §2) —
 *      never primary identity alone; a Manifest-only tuple, or the same
 *      primary identity under a different revision/digest/scope, fails
 *      closed even with a syntactically complete forged coverage row,
 *      because a Manifest must not retroactively manufacture selection
 *      authority nor silently change material composition identity
 *      (APPLICATION_MANIFEST §§2, 6))
 *  10. incomplete selected-domain-data
 *      exact tuple on selection, Manifest
 *      or coverage evidence (any of
 *      semanticIdentity/revisionIdentity/
 *      contentDigest absent or blank)  => FAIL_CLOSED
 *      INCOMPLETE_SELECTED_TUPLE
 *      (DOMAIN_DATA_IR §2; A41-004R3 / #385 P1-1: the complete exact tuple
 *      is REQUIRED selected-subject material — an exactness component that
 *      is not present cannot correspond, so completeness fails closed
 *      BEFORE any correspondence/coverage/currentness is evaluated and is
 *      never normalized to null)
 *  11. revoked/voided promotion coverage    => FAIL_CLOSED
 *      COVERAGE_INVALIDATED (C81/C157); revoked/voided selection/Manifest
 *      => FAIL_CLOSED SELECTION_INVALIDATED / MANIFEST_INVALIDATED
 *      (ASSEMBLY_PROFILES §8.3 explicit invalidation fails closed for new
 *      authoritative use; structural/authority violations dominate
 *      temporal states per C152/C171)
 *  12. incomplete selected Domain Data
 *      coverage / material refusal omitted
 *      or reclassified                      => FAIL_CLOSED
 *      (COVERAGE_INCOMPLETE / MATERIAL_REFUSAL_OMITTED / refusal codes —
 *      C80/C81/C142/C143: total coverage wherever Runtime consequence
 *      depends on it; refusals are material evidence)
 *  13. stale issuer chain / stale coverage
 *      / stale-or-superseded selection or
 *      Manifest reuse / currentness
 *      determination not covering the
 *      evaluation point                    => STALE (ISSUER_CHAIN_STALE /
 *      COVERAGE_NOT_CURRENT / SELECTION_NOT_CURRENT / MANIFEST_NOT_CURRENT;
 *      C85/C157; ASSEMBLY_PROFILES §8.2 — current authoritative reuse
 *      re-checks later invalidation/supersession at the intended use
 *      point); an intended-use/evaluation point predating the selection
 *      or Manifest issuance point is an impossible temporal claim and
 *      fails closed as INVALID_FACTS first (A41-004R2 / #381 P1-3)
 *  14. otherwise                            => INTAKE_VERIFIED — the
 *      externally owned evidence is verified-and-accepted as intake input
 *      ONLY: no Composer/selection/promotion/Manifest authority is created,
 *      no Manifest is issued and no live Runtime state is absorbed.
 */
export type DacV0041CompositionIntakeVerification =
  | {
      readonly outcome: 'FAIL_CLOSED';
      readonly code: DacV0041CompositionIntakeFailureCode;
      readonly detail: string;
      readonly chainCode?: DacV0041DesignationChainFailureCode;
    }
  | {
      readonly outcome: 'STALE';
      readonly code: DacV0041CompositionIntakeStaleCode;
      readonly detail: string;
    }
  | {
      readonly outcome: 'INTAKE_VERIFIED';
      readonly establishmentIdentity: string;
      readonly selectionIdentity: string;
      readonly manifestIdentity: string;
      readonly coveredSubjectIdentities: readonly string[];
      readonly detail: string;
    };
