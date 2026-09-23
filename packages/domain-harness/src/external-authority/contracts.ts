// Issue #309 / A2 I-006 (reviewed #300 A2 Task DAG): public evidence /
// correlation adapter around the EXISTING durable effect semantics for
// external authority / operation / observation / reconciliation refs.
//
// Semantic owner: the DAC v0.0.2 `EXTERNAL_AUTHORITY` spec (baseline commit
// `9c3ef91b8b40d893e4fe2b0370200e765816ec2b`, same baseline triple as the
// I-002 DAC cross-layer reference adapter). This adapter freezes ONLY:
//
//   - the nominal reference/evidence roles below;
//   - the exact baseline it is version-bound to (fails closed on any other);
//   - the closed classification/result vocabularies with their frozen
//     claim-strength ceilings (DAC EXTERNAL_AUTHORITY §4 authority matrix);
//   - opaque preservation of unknown/PROVISIONAL source fields.
//
// It does NOT freeze provider wire schemas, exact lifecycle enum names of any
// provider, transport encodings or serialization, and it creates no second
// identity authority: the external Business SoR/provider keeps authority over
// its own records, invariants and final acceptance/commit semantics. This
// module adopts, preserves, correlates and guards — it never decides.
//
// Mandatory distinctions (each guarded nominally at the type level and
// fail-closed at runtime — no conversion function exists between roles, so no
// identity or evidence class can ever be manufactured from another):
//
// ```text
// Runtime logical operation identity != provider/request operation identity
// ExternalAuthorityRef != any DAC lifecycle/technical reference
// dispatch/attempt evidence != authoritative external observation evidence
// external observation evidence != reconciliation outcome
// request dispatched != external authoritative commit
// provider effect success != Business SoR commit
// local timeout/abandonment/cancel != remote non-commit
// unresolved non-idempotent ambiguity stays reconciliation-sensitive
// ```
//
// No evidence object minted here acquires Runtime transition, mutation,
// promotion, activation or provider-routing authority: every evidence record
// carries `executionAuthority: 'none'` and this module persists nothing.
//
// This module deliberately imports nothing from the DAC adapter (#305), the
// observation stream (#312), the control concern (#313) or any runtime store /
// engine / journal implementation — concern separation per the A2 authority
// matrix. Cross-family fail-closed behavior comes from nominal adoption
// (a foreign object never passes a guard), not from cross-module coupling.

import type { ToolEffectSemantics } from '../v2/contracts/package.js';

/**
 * Exact identity of this adapter surface. Carried by every adopted reference
 * and evidence record so foreign/mis-tagged objects fail closed.
 */
export const EXTERNAL_AUTHORITY_ADAPTER_VERSION =
  'external-authority-adapter/1' as const;

/**
 * The exact DAC baseline this adapter is version-bound to (the
 * EXTERNAL_AUTHORITY spec surface of the frozen v0.0.2 baseline — the same
 * baseline triple as the I-002 adapter, so both adapters bind one authority
 * and no parallel identity authority is forked). Any reference presented
 * under a different baseline is rejected (`UNSUPPORTED_BASELINE`).
 */
export const EXTERNAL_AUTHORITY_BASELINE = {
  contract: 'domain-application-contract',
  version: 'v0.0.2',
  baselineCommit: '9c3ef91b8b40d893e4fe2b0370200e765816ec2b',
} as const;

export type ExternalAuthorityBaseline = typeof EXTERNAL_AUTHORITY_BASELINE;

/** Baseline identity a caller presents when adopting a reference. */
export interface ExternalAuthorityBaselineInput {
  readonly contract: string;
  readonly version: string;
  readonly baselineCommit: string;
}

/**
 * The five nominal external-effect reference roles adopted by this adapter.
 *
 * The role is set exclusively by the matching `adopt*Ref` constructor — a
 * caller can never author a role discriminant directly, and one role is never
 * rewritable into another (there is no conversion function).
 */
export const EXTERNAL_AUTHORITY_REFERENCE_ROLES = [
  'external-authority',
  'runtime-logical-operation',
  'provider-operation',
  'external-observation',
  'external-reconciliation',
] as const;

export type ExternalAuthorityReferenceRole =
  (typeof EXTERNAL_AUTHORITY_REFERENCE_ROLES)[number];

/**
 * Nominal base shared by every adopted reference of this family.
 *
 * `opaque` carries every unknown/PROVISIONAL field of the source reference
 * verbatim. It is preserved, never interpreted, never guessed.
 */
export interface ExternalReferenceBase {
  readonly adapter: typeof EXTERNAL_AUTHORITY_ADAPTER_VERSION;
  readonly baseline: ExternalAuthorityBaseline;
  readonly opaque: Readonly<Record<string, unknown>>;
}

/**
 * External Business SoR / effect-provider identity and scope, adopted from an
 * external carrier. The authority stays external: this reference is a handle
 * for correlation and evidence scoping only — it confers no runtime authority
 * and can never substitute a DAC lifecycle or Runtime technical identity
 * (nor can those substitute it; see `refuteNonExternalAuthorityIdentity`).
 *
 * `authorityId`/`authorityScope` are the external system's OWN identifiers —
 * this adapter never reinterprets, normalizes or heuristic-filters them.
 */
export interface ExternalAuthorityRef extends ExternalReferenceBase {
  readonly role: 'external-authority';
  readonly authorityId: string;
  readonly authorityScope: string;
}

/**
 * Runtime logical operation identity adopted from the EXISTING durable effect
 * semantics: `effectId` is the exact durable effect identity already derived
 * and journaled by the runtime (see `deriveEffectId` / `EffectJournalRecord`);
 * `attempt` pins one attempt identity when relevant. This reference never
 * carries or implies any provider-side operation identity — that is a
 * separate role (`ProviderOperationRef`) and the two are never convertible.
 */
export interface RuntimeLogicalOperationRef extends ExternalReferenceBase {
  readonly role: 'runtime-logical-operation';
  readonly effectId: string;
  readonly attempt?: number;
  readonly effectSemantics?: ToolEffectSemantics;
  readonly idempotencyKey?: string;
}

/**
 * Provider/request operation identity — adopted only WHERE AVAILABLE from the
 * provider contract (provider job/operation id, request reference and/or the
 * idempotency key the provider contract supports). At least one of the three
 * identity slots must be present; all-absent adoption fails closed. Never
 * confusable with the Runtime logical operation identity.
 */
export interface ProviderOperationRef extends ExternalReferenceBase {
  readonly role: 'provider-operation';
  readonly providerOperationId?: string;
  readonly idempotencyKey?: string;
  readonly requestRef?: string;
}

/** Identity of one externally-originated observation, where assigned. */
export interface ExternalObservationRef extends ExternalReferenceBase {
  readonly role: 'external-observation';
  readonly observationId: string;
}

/** Identity of one reconciliation process against one external operation. */
export interface ExternalReconciliationRef extends ExternalReferenceBase {
  readonly role: 'external-reconciliation';
  readonly reconciliationId: string;
}

export type ExternalAuthorityFamilyReference =
  | ExternalAuthorityRef
  | RuntimeLogicalOperationRef
  | ProviderOperationRef
  | ExternalObservationRef
  | ExternalReconciliationRef;

/** Input accepted when adopting an external-authority reference. */
export interface ExternalAuthorityRefAdoptionInput {
  readonly baseline: ExternalAuthorityBaselineInput;
  readonly authorityId: string;
  readonly authorityScope: string;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/** Input accepted when adopting a runtime logical operation reference. */
export interface RuntimeLogicalOperationRefAdoptionInput {
  readonly baseline: ExternalAuthorityBaselineInput;
  readonly effectId: string;
  readonly attempt?: number;
  readonly effectSemantics?: ToolEffectSemantics;
  readonly idempotencyKey?: string;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/** Input accepted when adopting a provider operation reference. */
export interface ProviderOperationRefAdoptionInput {
  readonly baseline: ExternalAuthorityBaselineInput;
  readonly providerOperationId?: string;
  readonly idempotencyKey?: string;
  readonly requestRef?: string;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/** Input accepted when adopting an external observation identity reference. */
export interface ExternalObservationRefAdoptionInput {
  readonly baseline: ExternalAuthorityBaselineInput;
  readonly observationId: string;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/** Input accepted when adopting an external reconciliation identity reference. */
export interface ExternalReconciliationRefAdoptionInput {
  readonly baseline: ExternalAuthorityBaselineInput;
  readonly reconciliationId: string;
  readonly opaque?: Readonly<Record<string, unknown>>;
}

/**
 * Closed classification vocabulary for externally-originated observations
 * (DAC EXTERNAL_AUTHORITY §4 authority matrix; adapter-own token names —
 * PROVISIONAL provider enum names are never frozen, the raw statement is
 * always preserved verbatim on the evidence record).
 *
 * `unknown-ambiguous` is first-class and MUST NOT collapse into any failure
 * or success claim (§5); `stale`/`conflicting` observations cannot silently
 * override current operation truth (they claim nothing here).
 */
export const EXTERNAL_OBSERVATION_CLASSIFICATIONS = [
  'dispatch-acknowledged',
  'accepted-pending',
  'in-progress',
  'rejected',
  'known-failed-before-commit',
  'effect-succeeded-provider-scope',
  'commit-observed',
  'unknown-ambiguous',
  'stale',
  'conflicting',
] as const;

export type ExternalObservationClassification =
  (typeof EXTERNAL_OBSERVATION_CLASSIFICATIONS)[number];

/**
 * Closed claim vocabulary — the STRONGEST runtime consequence an observation
 * classification may ever support (DAC EXTERNAL_AUTHORITY §4 "Runtime may
 * claim" column). Derived exclusively by
 * `maxClaimableForExternalObservation`; an evidence record's `claim` is
 * always exactly its classification's ceiling, never caller-supplied and
 * never stronger.
 */
export const EXTERNAL_OBSERVATION_CLAIMS = [
  'no-claim',
  'dispatch-attempt-only',
  'external-acceptance-observed',
  'external-progress-observed',
  'non-commit-known-for-attempt',
  'provider-effect-success-observed',
  'commit-observed-within-authority-scope',
] as const;

export type ExternalObservationClaim = (typeof EXTERNAL_OBSERVATION_CLAIMS)[number];

/**
 * Closed reconciliation result vocabulary (DAC EXTERNAL_AUTHORITY §3
 * reconciliation exits). `TERMINAL_ABANDONMENT` is a LOCAL STOP ONLY — it
 * never resolves remote truth; `STILL_UNKNOWN` preserves unresolved external
 * truth as unresolved. Commit/non-commit results exist only with an
 * authoritative external observation basis (enforced at adoption).
 */
export const EXTERNAL_RECONCILIATION_RESULTS = [
  'RECONCILED_COMMITTED',
  'RECONCILED_NOT_COMMITTED',
  'STILL_UNKNOWN',
  'TERMINAL_ABANDONMENT',
] as const;

export type ExternalReconciliationResult =
  (typeof EXTERNAL_RECONCILIATION_RESULTS)[number];

/** Evidence class discriminants (nominal; no conversion between classes). */
export const EXTERNAL_EVIDENCE_CLASSES = [
  'dispatch-attempt',
  'external-observation',
  'reconciliation-outcome',
] as const;

export type ExternalEvidenceClass = (typeof EXTERNAL_EVIDENCE_CLASSES)[number];

/**
 * Fail-closed correlation of one exact Runtime logical operation with one
 * external authority and, where available, one provider operation identity.
 * This is correlation material only — it mutates nothing and authorizes
 * nothing. Idempotency keys presented by both sides must agree exactly.
 */
export interface ExternalEffectCorrelation {
  readonly adapter: typeof EXTERNAL_AUTHORITY_ADAPTER_VERSION;
  readonly baseline: ExternalAuthorityBaseline;
  readonly correlationId: string;
  readonly runtimeOperation: RuntimeLogicalOperationRef;
  readonly externalAuthority: ExternalAuthorityRef;
  readonly providerOperation?: ProviderOperationRef;
  readonly opaque: Readonly<Record<string, unknown>>;
}

/**
 * Dispatch/attempt evidence: proves ONLY that an attempt of the correlated
 * Runtime logical operation was dispatched. It is never commit evidence,
 * never non-commit evidence, and there is no path from a local timeout,
 * abandonment or cancellation to this or any other evidence class (such
 * inputs are rejected with `LOCAL_CAUSE_FORBIDDEN`).
 */
export interface ExternalDispatchAttemptEvidence {
  readonly evidenceClass: 'dispatch-attempt';
  readonly adapter: typeof EXTERNAL_AUTHORITY_ADAPTER_VERSION;
  readonly baseline: ExternalAuthorityBaseline;
  readonly correlation: ExternalEffectCorrelation;
  /** Which durable attempt was dispatched (positive safe integer). */
  readonly attempt: number;
  readonly proves: 'dispatch-attempt-only';
  readonly executionAuthority: 'none';
  readonly dispatchedAt?: string;
  readonly opaque: Readonly<Record<string, unknown>>;
}

/**
 * Authoritative external observation evidence — adopted ONLY from an
 * externally-originated statement (the raw statement is preserved verbatim;
 * `observedAt` is informational). The `claim` is DERIVED from the
 * classification ceiling and can never be strengthened by the caller.
 *
 * A provider-scope effect success (`effect-succeeded-provider-scope`) is
 * deliberately NOT a Business SoR commit claim (§2: provider effect success
 * != automatically Business SoR commit).
 */
export interface ExternalObservationEvidence {
  readonly evidenceClass: 'external-observation';
  readonly adapter: typeof EXTERNAL_AUTHORITY_ADAPTER_VERSION;
  readonly baseline: ExternalAuthorityBaseline;
  readonly correlation: ExternalEffectCorrelation;
  readonly observation?: ExternalObservationRef;
  readonly classification: ExternalObservationClassification;
  /** Derived ceiling — exactly `maxClaimableForExternalObservation(classification)`. */
  readonly claim: ExternalObservationClaim;
  /** The external statement this observation was mapped from, preserved verbatim. */
  readonly rawStatement: string;
  readonly executionAuthority: 'none';
  readonly observedAt?: string;
  readonly opaque: Readonly<Record<string, unknown>>;
}

/** Remote truth as established (or not) by a reconciliation outcome. */
export type ExternalRemoteTruth = 'committed' | 'not-committed' | 'unresolved';

/**
 * Reconciliation identity/result record. Commit and non-commit results
 * require an adopted `ExternalObservationEvidence` basis that actually
 * supports them; `STILL_UNKNOWN` and `TERMINAL_ABANDONMENT` keep remote truth
 * `unresolved` (terminal abandonment is a local stop only — local
 * abandonment is never authoritative proof of non-commit, §2/§4).
 */
export interface ExternalReconciliationOutcome {
  readonly evidenceClass: 'reconciliation-outcome';
  readonly adapter: typeof EXTERNAL_AUTHORITY_ADAPTER_VERSION;
  readonly baseline: ExternalAuthorityBaseline;
  readonly correlation: ExternalEffectCorrelation;
  readonly reconciliation: ExternalReconciliationRef;
  readonly result: ExternalReconciliationResult;
  /** Derived — never stronger than the basis supports. */
  readonly remoteTruth: ExternalRemoteTruth;
  readonly basis: readonly ExternalObservationEvidence[];
  readonly executionAuthority: 'none';
  readonly reconciledAt?: string;
  readonly opaque: Readonly<Record<string, unknown>>;
}

/**
 * Exact identity expectations for fail-closed correlation verification. Every
 * supplied expectation must match exactly; a missing correlation field
 * against a supplied expectation is a mismatch, never a pass.
 */
export interface ExternalEffectCorrelationExpectation {
  readonly correlationId?: string;
  readonly effectId?: string;
  readonly authorityId?: string;
  readonly authorityScope?: string;
  readonly providerOperationId?: string;
}

export type ExternalAuthorityErrorCode =
  | 'UNSUPPORTED_BASELINE'
  | 'INVALID_REFERENCE'
  | 'ROLE_MISMATCH'
  | 'IDENTITY_MISMATCH'
  | 'CORRELATION_CONFLICT'
  | 'INVALID_EVIDENCE'
  | 'EVIDENCE_CONFLICT'
  | 'LOCAL_CAUSE_FORBIDDEN';

/** Fail-closed error surface for the external authority evidence adapter. */
export class ExternalAuthorityError extends Error {
  readonly code: ExternalAuthorityErrorCode;
  constructor(code: ExternalAuthorityErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'ExternalAuthorityError';
    this.code = code;
  }
}
