// Issue #327 / DAC v0.0.3 V3-003 (reviewed #319 R1 Task DAG, planning gate
// PASS comment 5793326420): external-operation / idempotency /
// reconciliation exact role binding.
//
// Semantic owner: the DAC v0.0.3 `EXTERNAL_AUTHORITY` spec surface of the
// exact semantic freeze (commit 3322b215… / tree 163d2a4…), with the
// role-registry/P7 bindings of `CROSS_LAYER_REFERENCES` §5/§6 and the
// outcome-namespace separation of §11 (conformance C62–C70).
//
// This module EXTENDS two already-merged surfaces and redesigns neither:
//
//   - A2 #309 durable external-effect evidence surface
//     (src/external-authority/**, DAC v0.0.2 EXTERNAL_AUTHORITY @ 9c3ef91b):
//     genuine #309 evidence records are consumed READ-ONLY as upstream
//     evidence basis through the #309 guards; the v0.0.2 classifications map
//     1:1 onto the v0.0.3 outcome classes without ever strengthening a claim.
//     #309 scope/history is never expanded or rewritten.
//   - V3-001 #323 foundation (src/dac-v003/**): the ten nominal refs below
//     WRAP `DacV003RegistryReference` envelopes minted by the shared adoption
//     core (exact baseline binding, Base Reference Obligations, mutable-alias
//     rejection, P7 logical-operation identity), never editing it.
//
// Owned applicable versioned binding for the ten reviewed #319 R1 roles:
// ExternalAuthorityRef, LogicalOperationRef, AttemptRef, ProviderOperationRef,
// ExternalObservationRef, ReconciliationRef, AuthoritativeEffectRecordRef,
// IdempotencyIdentityRef, RecoveryCapabilityRef, ExternalCapabilityRef.
//
// Frozen non-equivalences this surface preserves (EXTERNAL_AUTHORITY §2;
// conformance C62–C70; negatives per §15):
//
// ```text
// request sent / provider accepted != Business SoR commit        (C62/C63)
// local timeout / crash / unknown != known non-commit            (C64)
// retry keeps LogicalOperationRef; new AttemptRef only under the
//   evidence-backed §11 safe-retry conditions                     (C65/C67)
// safe replay requires PROVEN idempotency issuer/scope/effect
//   equivalence — a locally recorded key is correlation metadata  (C66)
// stale / conflicting observations fail closed for current truth;
//   never last-write-wins                                         (C69)
// declared RecoveryCapability / ExternalCapability != proven
//   satisfaction                                                  (§10)
// query / watch / reconcile is not a new effect attempt           (§9)
// local cancel / interrupt never fabricates remote rollback or
//   non-commit                                                    (§10)
// provider-private proof protocols stay OPEN_NOT_OWNED           (§16)
// ```
//
// It does NOT redesign durable-effect execution (the runtime journal/store
// remains the durable authority; this adapter persists nothing and mints no
// runtime transition/mutation authority — every derived record carries
// `runtimeExecutionAuthority: 'none'`), does NOT define Manifest
// cardinality/storage (V3-004), does NOT implement compatibility validation
// (V3-002, consumed unchanged), and does NOT own promotion/selection or
// Runtime binding/activation/transition authority. Provider wire schemas,
// transport encodings, retry timing and proof encodings stay PROVISIONAL /
// OPEN: this module adopts, binds, correlates and guards — it never decides
// remote truth beyond the evidence ceiling presented to it.

import type {
  DacV003BaselineInput,
  DacV003Reference,
  DacV003RegistryReference,
} from '../dac-v003/contracts.js';
import type {
  ExternalObservationClassification,
  ExternalObservationEvidence,
  ExternalReconciliationOutcome,
} from '../external-authority/contracts.js';

/**
 * Exact identity of this adapter surface. Carried by every minted role
 * wrapper and derived record so foreign/mis-tagged objects fail closed.
 */
export const DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION =
  'dac-v003-external-operation-adapter/1' as const;

/**
 * Provider-private proof protocols (the encoding a provider requires to
 * prove "known non-commit / cannot later commit", cross-provider ordering,
 * provider transaction protocols) are explicitly NOT owned by the Harness
 * (EXTERNAL_AUTHORITY §16 DEFER_OPEN). This surface consumes caller-presented
 * authoritative evidence classes only; it never invents, parses or validates
 * a provider proof encoding, and no function here can manufacture the
 * stronger fact from local material.
 */
export const DAC_V003_PROVIDER_PROOF_PROTOCOL_OWNERSHIP = 'OPEN_NOT_OWNED' as const;

/**
 * The frozen invariant vocabulary of EXTERNAL_AUTHORITY §2/§9. Reconciliation
 * action semantics in the observational set never create a new effect
 * attempt; if a provider protocol makes a nominal query/watch/resume call
 * effectful, the effect MUST be explicitly modeled as a new `AttemptRef` (or
 * new `LogicalOperationRef`) — it cannot hide inside an observational
 * `ReconciliationRef` (enforced by `reconcileDacV003ExternalOperation`).
 */
export const DAC_V003_QUERY_WATCH_RECONCILE_IS_NOT_A_NEW_EFFECT_ATTEMPT = true as const;

// ---------------------------------------------------------------------------
// External Operation Outcome / Observation namespace (§11/§12)
// ---------------------------------------------------------------------------

/**
 * Closed external-operation outcome/observation class vocabulary
 * (EXTERNAL_AUTHORITY §12; distinctions normative, exact token spelling
 * PROVISIONAL). These are NOT reference/compatibility dispositions: the
 * namespaces are guarded separately and never convertible
 * (`UNKNOWN_AMBIGUOUS != INCOMPATIBLE`).
 */
export const DAC_V003_EXTERNAL_OUTCOME_CLASSES = [
  'REQUEST_DISPATCHED',
  'ACCEPTED_FOR_PROCESSING',
  'PENDING_IN_PROGRESS',
  'REJECTED',
  'KNOWN_FAILED_BEFORE_COMMIT',
  'EFFECT_SUCCEEDED',
  'AUTHORITATIVE_COMMITTED',
  'UNKNOWN_AMBIGUOUS',
  'STALE',
  'CONFLICTING',
  'RECONCILED_COMMITTED',
  'RECONCILED_NOT_COMMITTED',
  'TERMINAL_ABANDONMENT',
] as const;

export type DacV003ExternalOutcomeClass =
  (typeof DAC_V003_EXTERNAL_OUTCOME_CLASSES)[number];

/** The External Operation Outcome / Observation namespace tag (§11). */
export const DAC_V003_EXTERNAL_OUTCOME_NAMESPACE =
  'dac-v003/external-operation-outcome' as const;

/** Namespaced outcome value; construct via `dacV003ExternalOutcome`. */
export interface DacV003ExternalOutcome {
  readonly namespace: typeof DAC_V003_EXTERNAL_OUTCOME_NAMESPACE;
  readonly value: DacV003ExternalOutcomeClass;
}

/**
 * Total, ceiling-preserving mapping from the historical #309 (v0.0.2)
 * observation classifications onto the v0.0.3 outcome classes. Every row
 * preserves the claim ceiling exactly — in particular
 * `effect-succeeded-provider-scope` maps to `EFFECT_SUCCEEDED` and NEVER to
 * `AUTHORITATIVE_COMMITTED` (provider effect success != automatically
 * Business SoR commit, §2; conformance C63/C75).
 */
export const DAC_V003_OUTCOME_CLASS_FROM_V002_CLASSIFICATION: Readonly<
  Record<ExternalObservationClassification, DacV003ExternalOutcomeClass>
> = {
  'dispatch-acknowledged': 'REQUEST_DISPATCHED',
  'accepted-pending': 'ACCEPTED_FOR_PROCESSING',
  'in-progress': 'PENDING_IN_PROGRESS',
  rejected: 'REJECTED',
  'known-failed-before-commit': 'KNOWN_FAILED_BEFORE_COMMIT',
  'effect-succeeded-provider-scope': 'EFFECT_SUCCEEDED',
  'commit-observed': 'AUTHORITATIVE_COMMITTED',
  'unknown-ambiguous': 'UNKNOWN_AMBIGUOUS',
  stale: 'STALE',
  conflicting: 'CONFLICTING',
} as const;

/** Genuine #309 evidence records consumable as upstream evidence basis. */
export type DacV003UpstreamV002Evidence =
  | ExternalObservationEvidence
  | ExternalReconciliationOutcome;

// ---------------------------------------------------------------------------
// Attempt evidence classes (§5)
// ---------------------------------------------------------------------------

/**
 * Closed attempt evidence-class vocabulary (EXTERNAL_AUTHORITY §5). A generic
 * transport error or timeout after possible dispatch is AMBIGUOUS — never
 * known non-commit. A provider rejection qualifies as known pre-commit
 * failure only when the bound provider semantics/evidence establish that the
 * attempt cannot later commit (the proof protocol itself stays
 * OPEN_NOT_OWNED; the class is caller-asserted from authoritative evidence,
 * never inferred locally).
 */
export const DAC_V003_ATTEMPT_EVIDENCE_CLASSES = [
  'not-dispatched',
  'dispatch-attempted',
  'definitively-rejected-known-pre-commit-failed',
  'dispatch-outcome-ambiguous',
] as const;

export type DacV003AttemptEvidenceClass =
  (typeof DAC_V003_ATTEMPT_EVIDENCE_CLASSES)[number];

/** The strongest justified meaning an attempt evidence class carries (§5). */
export type DacV003AttemptEvidenceMeaning =
  | 'no-remote-truth-for-any-attempt'
  | 'dispatch-occurred-only'
  | 'known-pre-commit-failure-for-this-attempt-only'
  | 'ambiguous-preserve-unresolved';

// ---------------------------------------------------------------------------
// Reconciliation action semantics (§9)
// ---------------------------------------------------------------------------

/**
 * Closed reconciliation action-semantics vocabulary (EXTERNAL_AUTHORITY §9).
 * The two effectful actions — `retry-same-logical-effect` and
 * `new-independent-operation` — are DELIBERATELY NOT reconciliation action
 * semantics: minting a reconciliation episode with either value fails closed
 * (`INVALID_ACTION_SEMANTICS`); a new effect attempt is authorized only
 * through `evaluateDacV003SafeRetry` under the §11 preconditions.
 */
export const DAC_V003_RECONCILIATION_ACTION_SEMANTICS = [
  'query-status-observation',
  'watch-continuation-observation',
  'resume-existing-provider-operation',
  'reconcile-local-vs-external-truth',
  'local-abandon',
] as const;

export type DacV003ReconciliationActionSemantics =
  (typeof DAC_V003_RECONCILIATION_ACTION_SEMANTICS)[number];

// ---------------------------------------------------------------------------
// Recovery / external capability families (§10)
// ---------------------------------------------------------------------------

/**
 * Closed transport-neutral capability-family vocabulary
 * (EXTERNAL_AUTHORITY §10, extensible by semantic refs). `cancel-abort-request`
 * means ONLY that a cancellation/abort REQUEST semantic is supported under
 * declared conditions — never rollback, successful cancellation, known
 * non-commit, or reversal of committed effects.
 */
export const DAC_V003_RECOVERY_CAPABILITY_FAMILIES = [
  'query-status',
  'watch-poll-subscription',
  'resume-existing-provider-operation',
  'safe-same-operation-retry',
  'idempotent-replay',
  'reconciliation',
  'cancel-abort-request',
] as const;

export type DacV003RecoveryCapabilityFamily =
  (typeof DAC_V003_RECOVERY_CAPABILITY_FAMILIES)[number];

// ---------------------------------------------------------------------------
// Safe retry / replay decisions (§11)
// ---------------------------------------------------------------------------

/** Closed safe-retry decision vocabulary (EXTERNAL_AUTHORITY §11 matrix). */
export const DAC_V003_SAFE_RETRY_DECISIONS = [
  'PERMITTED_SAME_OPERATION_NEW_ATTEMPT',
  'PERMITTED_IDEMPOTENT_REPLAY',
  'PERMITTED_NEW_INDEPENDENT_OPERATION',
  'NOT_AUTHORIZED_AMBIGUITY_PRESERVED',
  'RECONCILIATION_REQUIRED',
] as const;

export type DacV003SafeRetryDecisionValue =
  (typeof DAC_V003_SAFE_RETRY_DECISIONS)[number];

/** The precise §11 basis a permission/denial was derived from. */
export type DacV003SafeRetryJustification =
  | 'known-non-commit-cannot-later-commit'
  | 'no-prior-dispatch-crossing'
  | 'proven-idempotency-guarantee-same-identity-equivalent-command'
  | 'explicit-intentional-duplicate-effect'
  | 'possible-prior-dispatch-no-proof'
  | 'later-attempt-failed-earlier-unresolved'
  | 'local-abandonment-is-not-non-commit-proof';

/** Identity directive a decision carries (never reuses an AttemptRef). */
export type DacV003SafeRetryIdentityDirective =
  | 'same-logical-operation-new-attempt'
  | 'same-logical-operation-same-idempotency-new-attempt'
  | 'new-logical-operation'
  | 'no-new-attempt';

/** Remote truth as (un)established by the prior evidence (§12 ceilings). */
export type DacV003RemoteTruth = 'committed' | 'not-committed' | 'unresolved';

// ---------------------------------------------------------------------------
// Nominal role wrappers over V3-001 envelopes
// ---------------------------------------------------------------------------

/** Nominal base shared by every minted role wrapper of this surface. */
export interface DacV003ExternalRoleBase {
  readonly adapter: typeof DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION;
  /**
   * The referrable V3-001 envelope (Base Reference Obligations + P7 where
   * applicable). Its `authorityScope`/`primaryIdentity`/optional slots are
   * the exact identity of the referenced thing; the wrapper adds the
   * role-specific binding semantics frozen below.
   */
  readonly reference: DacV003RegistryReference;
}

/**
 * External Business SoR / effect-authority identity and truth/record scope
 * (§3 row 1). The authority stays external: this handle scopes correlation
 * and evidence only. A Harness-side reference (runtime implementation, host
 * binding, …) can never be adopted or substituted here —
 * `refuteDacV003HarnessSideIdentityAsExternalAuthority` fails closed
 * (conformance C60/C76).
 */
export interface DacV003ExternalAuthorityRef extends DacV003ExternalRoleBase {
  readonly reference: DacV003RegistryReference & { readonly role: 'external-authority' };
}

/** Input accepted when adopting an external authority reference. */
export interface DacV003ExternalAuthorityRefInput {
  readonly baseline: DacV003BaselineInput;
  /** The external system's OWN authority id (never normalized). */
  readonly authorityId: string;
  /** The truth/record semantics scope owned by that authority. */
  readonly authorityScope: string;
  readonly contractProfileIdentity?: string;
  readonly locatorHints?: readonly string[];
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Application/Runtime-owned identity of ONE intended logical external effect
 * (§3 row 2 / §4). Exactly 1 bound external authority; stable across
 * attempts for the same intended effect; a change to material command
 * semantics, authority, or semantic target creates a NEW logical operation
 * (`assertDacV003LogicalOperationContinuity`). Creating this reference
 * proves only intent/correlation — never dispatch, acceptance, success or
 * commit.
 */
export interface DacV003LogicalOperationRef extends DacV003ExternalRoleBase {
  readonly reference: DacV003RegistryReference & { readonly role: 'logical-operation' };
  /** Exactly 1 external authority scope this operation is bound to. */
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  /** Operation semantic identity/type (what intended effect this is). */
  readonly operationSemanticIdentity: string;
  /** Exact semantic target/subject refs when correctness depends on them. */
  readonly semanticTargetRefs: readonly DacV003Reference[];
  /** Originating Runtime Command/Process correlation refs when material. */
  readonly originatingCorrelationRefs: readonly DacV003Reference[];
  /** Present only when a real idempotency contract applies (§7 binding). */
  readonly idempotencyIdentity?: DacV003IdempotencyIdentityRef;
}

export interface DacV003LogicalOperationRefInput {
  readonly baseline: DacV003BaselineInput;
  /** Owning application/Runtime authority scope. */
  readonly runtimeAuthorityScope: string;
  /** Stable logical operation identity (same intended effect across attempts). */
  readonly logicalOperationIdentity: string;
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  readonly operationSemanticIdentity: string;
  readonly semanticTargetRefs?: readonly DacV003Reference[];
  readonly originatingCorrelationRefs?: readonly DacV003Reference[];
  readonly idempotencyIdentity?: DacV003IdempotencyIdentityRef;
  readonly contractProfileIdentity?: string;
  readonly locatorHints?: readonly string[];
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Integration/Runtime-owned identity of ONE delivery/execution attempt
 * (§3 row 3 / §5). Exactly 1 logical operation; the attempt identity MUST
 * stay distinct from the logical operation identity and from every other
 * attempt of the same operation (conformance C67 — replay overwriting the
 * first attempt is non-conforming).
 */
export interface DacV003AttemptRef extends DacV003ExternalRoleBase {
  readonly reference: DacV003RegistryReference & { readonly role: 'attempt' };
  readonly logicalOperation: DacV003LogicalOperationRef;
  readonly evidenceClass: DacV003AttemptEvidenceClass;
  /** Provider-issued operation this attempt addressed, when known. */
  readonly providerOperation?: DacV003ProviderOperationRef;
  /** Dispatch evidence/provenance descriptor. */
  readonly dispatchProvenance?: string;
}

export interface DacV003AttemptRefInput {
  readonly baseline: DacV003BaselineInput;
  /** Integration/Runtime delivery-owner scope. */
  readonly deliveryAuthorityScope: string;
  /** Distinct attempt identity (never the logical operation identity). */
  readonly attemptIdentity: string;
  readonly logicalOperation: DacV003LogicalOperationRef;
  readonly evidenceClass: DacV003AttemptEvidenceClass;
  readonly providerOperation?: DacV003ProviderOperationRef;
  readonly dispatchProvenance?: string;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Provider-issued job/operation identity inside exactly 1 external authority
 * scope (§3 row 4 / §6). Distinct from the logical operation, the attempt,
 * the observation and the authoritative effect record (conformance C68
 * refutes the substitution). The same provider operation MAY be referenced
 * across local retries only when provider contract/evidence proves
 * continuation; otherwise the ambiguity is preserved, never merged.
 */
export interface DacV003ProviderOperationRef extends DacV003ExternalRoleBase {
  readonly reference: DacV003RegistryReference & { readonly role: 'provider-operation' };
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  readonly correlatedLogicalOperation?: DacV003LogicalOperationRef;
  /**
   * Prior provider operation this one continues. When set, continuation
   * proof refs are REQUIRED (`IDENTITY_MISMATCH` otherwise) — §6 rule 5.
   */
  readonly continuationOfProviderOperationId?: string;
  readonly continuationProofRefs: readonly DacV003Reference[];
  /**
   * Provider operation ids that MIGHT denote the same external operation
   * where local evidence cannot determine it. Recorded verbatim; the
   * ambiguity is preserved and never merged (§6 rule 6).
   */
  readonly preservedAmbiguityWithProviderOperationIds: readonly string[];
}

export interface DacV003ProviderOperationRefInput {
  readonly baseline: DacV003BaselineInput;
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  /** Provider-issued job/operation identity (the provider's own id). */
  readonly providerOperationId: string;
  readonly correlatedLogicalOperation?: DacV003LogicalOperationRef;
  readonly continuationOfProviderOperationId?: string;
  readonly continuationProofRefs?: readonly DacV003Reference[];
  readonly preservedAmbiguityWithProviderOperationIds?: readonly string[];
  readonly locatorHints?: readonly string[];
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Immutable historical evidence about external state/truth
 * (§3 row 5 / §8 / §12). Exactly 1 external authority + exactly 1 logical
 * operation; later reconciliation may supersede the CURRENT conclusion but
 * never rewrites this observation (no mutation surface exists). Stale /
 * conflicting classifications are derived by
 * `adjudicateDacV003ObservationCurrentness` — never by arrival order.
 */
export interface DacV003ExternalObservationRef extends DacV003ExternalRoleBase {
  readonly reference: DacV003RegistryReference & { readonly role: 'external-observation' };
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  readonly logicalOperation: DacV003LogicalOperationRef;
  readonly providerOperations: readonly DacV003ProviderOperationRef[];
  readonly observedClass: DacV003ExternalOutcomeClass;
  /** Producer/source/provenance channel (adapter, callback, query, event…). */
  readonly producer: string;
  /**
   * Provider-exposed currentness metadata, preserved verbatim when
   * available. `adapterReceivedAt` is provenance only and MUST NOT override
   * provider ordering semantics (§8).
   */
  readonly providerCurrentness?: {
    readonly version?: string;
    readonly sequence?: string;
    readonly providerObservedAt?: string;
    readonly adapterReceivedAt?: string;
  };
  /** Raw external statement preserved verbatim when interpretation is lossy. */
  readonly rawStatement?: string;
  /** Authoritative effect records identified by this observation (0..n). */
  readonly effectRecords: readonly DacV003AuthoritativeEffectRecordRef[];
}

export interface DacV003ExternalObservationRefInput {
  readonly baseline: DacV003BaselineInput;
  readonly observationIdentity: string;
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  readonly logicalOperation: DacV003LogicalOperationRef;
  readonly providerOperations?: readonly DacV003ProviderOperationRef[];
  readonly observedClass: DacV003ExternalOutcomeClass;
  readonly producer: string;
  readonly providerCurrentness?: DacV003ExternalObservationRef['providerCurrentness'];
  readonly rawStatement?: string;
  readonly effectRecords?: readonly DacV003AuthoritativeEffectRecordRef[];
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Exact record identity inside the external authority scope
 * (§3 row 6). The provider job identity MUST NOT substitute this role
 * (conformance C68); `linkingEvidence` is required when the record is used
 * as outcome proof linking it to the logical effect.
 */
export interface DacV003AuthoritativeEffectRecordRef extends DacV003ExternalRoleBase {
  readonly reference: DacV003RegistryReference & {
    readonly role: 'authoritative-effect-record';
  };
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  /** Evidence linking this record to the logical effect (outcome-proof use). */
  readonly linkingEvidence: readonly DacV003Reference[];
}

export interface DacV003AuthoritativeEffectRecordRefInput {
  readonly baseline: DacV003BaselineInput;
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  /** Exact record identity inside the authority scope (provider's own id). */
  readonly effectRecordIdentity: string;
  readonly linkingEvidence?: readonly DacV003Reference[];
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Idempotency identity with issuer and promised deduplication scope
 * (§3 row 7 / §7). Valid for safe replay ONLY when the bound provider /
 * integration contract establishes real deduplication semantics: a key
 * recorded locally without provider evidence is CORRELATION METADATA ONLY
 * (`isDacV003IdempotencyGuaranteeProven` is false) and can never authorize
 * replay. Bound to exactly ONE intended logical-effect semantic identity;
 * reuse for a semantically different command/target/effect is forbidden
 * (conformance C66).
 */
export interface DacV003IdempotencyIdentityRef extends DacV003ExternalRoleBase {
  readonly reference: DacV003RegistryReference & { readonly role: 'idempotency-identity' };
  /** Issuer/authority of the idempotency identity. */
  readonly issuer: string;
  /** The deduplication scope the issuer promised. */
  readonly promisedDeduplicationScope: string;
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  /** Exact bound logical-effect semantic identity (one key, one effect). */
  readonly boundLogicalEffectSemanticIdentity: string;
  /**
   * The equivalence rule required by the provider contract. Byte equality
   * alone is insufficient when the provider defines semantic equivalence,
   * and vice versa (§7 rule 3) — the applicable rule must be established
   * from evidence/contract before replay is authorized.
   */
  readonly equivalenceRule: {
    readonly kind: 'semantic' | 'payload-byte' | 'provider-defined';
    readonly ruleIdentity?: string;
    readonly establishedFromEvidence: boolean;
  };
  /** Applicability horizon/qualification when material to the guarantee. */
  readonly applicabilityHorizon?: string;
  /** Provenance/evidence establishing the guarantee (absent => metadata only). */
  readonly guaranteeEvidenceRefs: readonly DacV003Reference[];
}

export interface DacV003IdempotencyIdentityRefInput {
  readonly baseline: DacV003BaselineInput;
  /** The idempotency identity/key itself. */
  readonly idempotencyKey: string;
  readonly issuer: string;
  readonly promisedDeduplicationScope: string;
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  readonly boundLogicalEffectSemanticIdentity: string;
  readonly equivalenceRule: DacV003IdempotencyIdentityRef['equivalenceRule'];
  readonly applicabilityHorizon?: string;
  readonly guaranteeEvidenceRefs?: readonly DacV003Reference[];
  readonly contractProfileIdentity?: string;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/** Shared declarative shape of the two capability roles (§10). */
export interface DacV003ExternalCapabilityDeclarationBase
  extends DacV003ExternalRoleBase {
  readonly capabilityFamily: DacV003RecoveryCapabilityFamily;
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  /** External contract/profile / compatibility-target identity interpreting it. */
  readonly targetProfileIdentity?: string;
  /** Applicability conditions/qualifications material to safety. */
  readonly applicabilityConditions: readonly string[];
  /** Issuer/source of the declaration. */
  readonly issuer: string;
  /** Adapter/binding requirement identity where composition depends on it. */
  readonly bindingRequirementIdentity?: string;
  /** Evidence/conformance refs when actual satisfaction is asserted. */
  readonly satisfactionEvidenceRefs: readonly DacV003Reference[];
}

/**
 * Declared recovery capability against a bound external authority
 * (§3 row 9 / §10). A DECLARATION, never satisfaction evidence: whether
 * `RecoveryCapabilityRef` and `ExternalCapabilityRef` are one concrete type
 * or related specialized types stays PROVISIONAL — they are two nominal
 * roles over one descriptor shape here — and neither may collapse with a
 * composition `capability-requirement` reference or its satisfaction
 * evidence.
 */
export interface DacV003RecoveryCapabilityRef
  extends DacV003ExternalCapabilityDeclarationBase {
  readonly reference: DacV003RegistryReference & { readonly role: 'recovery-capability' };
}

/** Declared external capability of a bound integration/profile target (§10). */
export interface DacV003ExternalCapabilityRef
  extends DacV003ExternalCapabilityDeclarationBase {
  readonly reference: DacV003RegistryReference & { readonly role: 'external-capability' };
}

export interface DacV003CapabilityDeclarationInput {
  readonly baseline: DacV003BaselineInput;
  readonly capabilityFamily: DacV003RecoveryCapabilityFamily;
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  /** Semantic capability identity (the declaring scope's own id). */
  readonly capabilityIdentity: string;
  readonly targetProfileIdentity?: string;
  readonly applicabilityConditions?: readonly string[];
  readonly issuer: string;
  readonly bindingRequirementIdentity?: string;
  readonly satisfactionEvidenceRefs?: readonly DacV003Reference[];
  readonly opaque?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Currentness adjudication (§8)
// ---------------------------------------------------------------------------

/** Currentness disposition of one observation for CURRENT truth (§8). */
export type DacV003ObservationCurrentness = 'CURRENT' | 'STALE' | 'CONFLICTING';

export interface DacV003ObservationCurrentnessAdjudication {
  readonly observation: DacV003ExternalObservationRef;
  readonly currentness: DacV003ObservationCurrentness;
  /** Deterministic basis statement (ordering evidence / conflict pair). */
  readonly basis: string;
}

export interface DacV003ObservationCurrentnessResult {
  readonly adapter: typeof DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION;
  readonly adjudications: readonly DacV003ObservationCurrentnessAdjudication[];
  /** True when at least one CONFLICTING adjudication requires reconciliation. */
  readonly requiresReconciliation: boolean;
}

export interface DacV003ObservationCurrentnessInput {
  /** Observations of ONE logical operation under ONE authority (fail-closed). */
  readonly observations: readonly DacV003ExternalObservationRef[];
  /**
   * Provider operation identities known superseded (e.g. via proven
   * continuation): their observations are STALE for current truth while
   * remaining valid historical evidence (§8).
   */
  readonly supersededProviderOperationIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// Reconciliation episodes (§9)
// ---------------------------------------------------------------------------

/**
 * The justified current conclusion a reconciliation episode derives. Commit
 * and non-commit exist only with an authoritative evidence basis of matching
 * strength; TERMINAL_ABANDONMENT is a LOCAL STOP ONLY and keeps remote truth
 * unresolved; historical observations are never rewritten.
 */
export interface DacV003ReconciliationConclusion {
  readonly outcomeClass:
    | 'RECONCILED_COMMITTED'
    | 'RECONCILED_NOT_COMMITTED'
    | 'STILL_UNKNOWN'
    | 'TERMINAL_ABANDONMENT';
  readonly remoteTruth: DacV003RemoteTruth;
  /** Envelope refs of the observations/effect records supporting it. */
  readonly basis: readonly DacV003Reference[];
  /** True when unresolvable CONFLICTING current observations were present. */
  readonly unresolvedConflictPresent: boolean;
  readonly notes: readonly string[];
}

/**
 * One exact-operation, exact-authority reconciliation episode (§3 row 8 /
 * §9). Observational action semantics only — a reconciliation episode never
 * creates a new effect attempt; an effectful resume must be explicitly
 * modeled (`effectfulModeling`) instead of hiding here.
 */
export interface DacV003ReconciliationRef extends DacV003ExternalRoleBase {
  readonly reference: DacV003RegistryReference & { readonly role: 'reconciliation' };
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  readonly logicalOperation: DacV003LogicalOperationRef;
  readonly actionSemantics: DacV003ReconciliationActionSemantics;
  /** Reconciliation method/class semantics descriptor. */
  readonly methodClass: string;
  readonly inputAttempts: readonly DacV003AttemptRef[];
  readonly inputProviderOperations: readonly DacV003ProviderOperationRef[];
  readonly inputObservations: readonly DacV003ExternalObservationRef[];
  readonly inputEffectRecords: readonly DacV003AuthoritativeEffectRecordRef[];
  /** Genuine #309 records consumed read-only as upstream evidence basis. */
  readonly upstreamV002Evidence: readonly DacV003UpstreamV002Evidence[];
  readonly conclusion: DacV003ReconciliationConclusion;
  readonly runtimeExecutionAuthority: 'none';
}

export interface DacV003ReconciliationRequest {
  readonly baseline: DacV003BaselineInput;
  readonly reconciliationIdentity: string;
  /** Local/application reconciliation authority scope. */
  readonly localReconciliationAuthorityScope: string;
  readonly externalAuthority: DacV003ExternalAuthorityRef;
  readonly logicalOperation: DacV003LogicalOperationRef;
  readonly actionSemantics: DacV003ReconciliationActionSemantics;
  readonly methodClass: string;
  readonly inputAttempts?: readonly DacV003AttemptRef[];
  readonly inputProviderOperations?: readonly DacV003ProviderOperationRef[];
  readonly inputObservations?: readonly DacV003ExternalObservationRef[];
  readonly inputEffectRecords?: readonly DacV003AuthoritativeEffectRecordRef[];
  readonly upstreamV002Evidence?: readonly DacV003UpstreamV002Evidence[];
  /**
   * Explicit local stop request. Records TERMINAL_ABANDONMENT (local stop
   * only) when no commit/non-commit basis exists — never a remote
   * non-commit claim (§12).
   */
  readonly explicitLocalAbandonment?: boolean;
  /**
   * Required exactly when the provider contract makes the resume action
   * effectful: the additionally dispatched effect MUST be explicitly modeled
   * as a new AttemptRef / LogicalOperationRef (§9), never hidden here.
   */
  readonly effectfulResume?: boolean;
  readonly effectfulModeling?: {
    readonly attempt?: DacV003AttemptRef;
    readonly logicalOperation?: DacV003LogicalOperationRef;
  };
  readonly opaque?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Safe retry / replay evaluation (§11)
// ---------------------------------------------------------------------------

export interface DacV003SafeRetryRequest {
  readonly logicalOperation: DacV003LogicalOperationRef;
  /**
   * Prior attempts with their evidence classes. Capability DECLARATIONS are
   * deliberately not an input field: a declaration is never proof of a safe
   * retry precondition (§10).
   */
  readonly priorAttempts: readonly DacV003AttemptRef[];
  readonly idempotencyIdentity?: DacV003IdempotencyIdentityRef;
  /** Semantic identity of the command intended to be (re)sent now. */
  readonly intendedCommandSemanticIdentity: string;
  /** Semantic target identities intended now (continuity check, §4 rule 2). */
  readonly intendedSemanticTargetIdentities?: readonly string[];
  /** Domain intentionally permits an additional independent duplicate effect. */
  readonly explicitIntentionalDuplicate?: boolean;
  /** Notes prior local abandonment — never a non-commit proof (§11 row 6). */
  readonly priorLocalAbandonmentOnly?: boolean;
}

export interface DacV003SafeRetryDecision {
  readonly adapter: typeof DAC_V003_EXTERNAL_OPERATION_ADAPTER_VERSION;
  readonly decision: DacV003SafeRetryDecisionValue;
  readonly justification: DacV003SafeRetryJustification;
  readonly identityDirective: DacV003SafeRetryIdentityDirective;
  /** True whenever remote truth of the prior evidence is unresolved. */
  readonly remoteTruthUnresolved: boolean;
  readonly reasons: readonly string[];
  /** No derived record ever carries runtime transition/mutation authority. */
  readonly runtimeExecutionAuthority: 'none';
}

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

/**
 * Fail-closed error taxonomy (thrown for structurally non-interpretable
 * input; justified semantic outcomes are minted as decisions/conclusions):
 *
 * - `INVALID_EXTERNAL_BINDING` — malformed binding input (missing
 *   exactly-1 relationships, empty identities, malformed evidence sets);
 * - `ROLE_MISMATCH` — a nominal role presented where another is required
 *   (attempt != logical operation, provider job != effect record, …);
 * - `IDENTITY_MISMATCH` — identity expectations/continuity violated
 *   (attempt identity collapse, unproven continuation, correlation drift);
 * - `CORRELATION_CONFLICT` — inputs bound to different logical operations /
 *   authorities than the record being minted;
 * - `IDEMPOTENCY_REUSE_FORBIDDEN` — one idempotency identity reused for a
 *   semantically different command/effect (conformance C66);
 * - `LOCAL_CAUSE_FORBIDDEN` — local timeout/cancel/interrupt/abandonment
 *   material presented as remote truth evidence;
 * - `AMBIGUITY_STRENGTHENING_FORBIDDEN` — strengthening ambiguous/weak
 *   evidence into a stronger claim;
 * - `CAPABILITY_DECLARATION_NOT_PROVEN` — a declaration used where proven
 *   satisfaction is required;
 * - `EFFECTFUL_ACTION_REQUIRES_EXPLICIT_MODELING` — effectful resume
 *   without an explicitly modeled new attempt/logical operation (§9);
 * - `INVALID_ACTION_SEMANTICS` — effectful action semantics presented to
 *   the observational reconciliation surface;
 * - `COMPOSITION_LIVE_OPERATION_STATE_FORBIDDEN` — live operation state
 *   presented into the declarative composition handoff (§13);
 * - `EXTERNAL_IDENTITY_FORBIDDEN` — Harness-side identity presented as
 *   external Business SoR identity (conformance C60/C76);
 * - `INVALID_UPSTREAM_EVIDENCE` — non-genuine #309 evidence record.
 *
 * No code carries or suggests a substitute/default/latest resolution or a
 * local-cause-to-remote-outcome inference.
 */
export type DacV003ExternalErrorCode =
  | 'INVALID_EXTERNAL_BINDING'
  | 'ROLE_MISMATCH'
  | 'IDENTITY_MISMATCH'
  | 'CORRELATION_CONFLICT'
  | 'IDEMPOTENCY_REUSE_FORBIDDEN'
  | 'LOCAL_CAUSE_FORBIDDEN'
  | 'AMBIGUITY_STRENGTHENING_FORBIDDEN'
  | 'CAPABILITY_DECLARATION_NOT_PROVEN'
  | 'EFFECTFUL_ACTION_REQUIRES_EXPLICIT_MODELING'
  | 'INVALID_ACTION_SEMANTICS'
  | 'COMPOSITION_LIVE_OPERATION_STATE_FORBIDDEN'
  | 'EXTERNAL_IDENTITY_FORBIDDEN'
  | 'INVALID_UPSTREAM_EVIDENCE';

/** Fail-closed error surface for the DAC v0.0.3 external-operation binding. */
export class DacV003ExternalError extends Error {
  readonly code: DacV003ExternalErrorCode;
  readonly details: readonly string[];

  constructor(
    code: DacV003ExternalErrorCode,
    message: string,
    details: readonly string[] = [],
  ) {
    super(`[${code}] ${message}`);
    this.name = 'DacV003ExternalError';
    this.code = code;
    this.details = details;
  }
}
