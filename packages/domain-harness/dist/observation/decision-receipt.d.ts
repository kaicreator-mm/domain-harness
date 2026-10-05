import type { CompiledArtifactIdentity, DomainIntelligencePackageIdentity } from '../contracts/domain-data.js';
import type { AdmissionDenialReason, CentralAdmissionOutcome } from '../admission/contracts.js';
import { type DecisionResolverCacheTelemetry, type DecisionResolverSource } from '../decision-resolver/contracts.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import { type RuntimeObservationRecord } from './contracts.js';
/**
 * Terminal category of one semantic-decision turn (L2 §7 stable categories,
 * L3 spelling mapped onto the existing seam outcomes; the T005 unavailable
 * terminal stays its own category and is never collapsed into a denial or a
 * resolver failure).
 */
export type DecisionResolutionReceiptDisposition = 'admitted' | 'denied' | 'semantic-unavailable' | 'resolver-failed';
/**
 * Bounded resolver failure class (L3 mapping of the existing resolver/runtime
 * error codes onto the public receipt vocabulary; an unmapped error keeps the
 * honest `unknown` class and is never fabricated into success).
 */
export type DecisionReceiptResolverFailureClass = 'rule-failed' | 'schema-violation' | 'promoted-unconfigured' | 'promoted-revoked-deny' | 'revocation-record-missing' | 'harness-unconfigured' | 'harness-failed' | 'decision-binding-incompatible' | 'unknown';
/**
 * Bounded failure category. Present exactly when the turn did NOT end
 * admitted-through-publication: an admission denial carries its existing
 * denial reason (plus the optional denial detail identities), the T005
 * semantic-unavailable terminal carries its own category, and a thrown
 * resolver failure carries its bounded class.
 */
export type DecisionReceiptFailureCategory = {
    readonly kind: 'admission-denied';
    readonly reason: AdmissionDenialReason;
    readonly invariantId?: string;
    readonly guardId?: string;
    readonly transitionKey?: string;
} | {
    readonly kind: 'semantic-unavailable';
} | {
    readonly kind: 'resolver-failure';
    readonly failureClass: DecisionReceiptResolverFailureClass;
};
/** Exact artifact identity of the selected promoted artifact, where applicable. */
export interface DecisionReceiptArtifactIdentity {
    readonly kind: string;
    readonly artifactId: string;
    readonly contentDigest: string;
}
/**
 * The stable public Decision Resolution Receipt for one semantic-decision
 * turn. Every field is derived from an existing contract-level fact; the
 * shape is closed (the validator rejects unknown fields) and carries only
 * JSON data — no methods, no payloads, no executable surface.
 */
export interface DecisionResolutionReceipt {
    /** Stable compiled decision identity (A4 correlation identity). */
    readonly decisionId: string;
    /** Exact compiled declaration content identity (A4 correlation identity). */
    readonly declarationDigest: string;
    /** Durable control-turn identity — the same identity Central Admission and the effect journal use for this turn. */
    readonly durableControlTurnId: string;
    /** Terminal category of the decision-resolution lifecycle for this turn. */
    readonly disposition: DecisionResolutionReceiptDisposition;
    /** Admitted source category (present exactly when a resolution result reached admission). */
    readonly source?: DecisionResolverSource;
    /** Existing resolver evidence (present exactly when a resolution result reached admission). */
    readonly freshModelCallCount?: number;
    readonly llmAvoided?: boolean;
    /** Existing cache/reuse disposition (present exactly when a resolution result reached admission). */
    readonly cacheRead?: DecisionResolverCacheTelemetry['read'];
    readonly cacheWrite?: NonNullable<DecisionResolverCacheTelemetry['write']>;
    /** Selected promoted artifact identity, where applicable. */
    readonly selectedArtifact?: DecisionReceiptArtifactIdentity;
    /** Pinned governance binding digest of the admitted/denied outcome. */
    readonly governanceBindingDigest?: string;
    /** Correlation to the invoking execution. */
    readonly workflowTarget?: string;
    readonly workflowInstanceId?: string;
    /** Bounded failure category, where applicable. */
    readonly failure?: DecisionReceiptFailureCategory;
}
/** Exact receipt envelope field name on a `DECISION_RECEIPT` observation record. */
export type DecisionReceiptEnvelopeField = 'decisionReceipt';
/**
 * Existing-fact bundle identifying the turn a receipt describes. The runtime
 * seam derives `durableControlTurnId` through the SAME
 * `deriveDurableControlTurnId` authority Central Admission uses, so receipt
 * identity correlates exactly with admission/journal identity.
 */
export interface DecisionReceiptIdentityInput {
    readonly decisionId: string;
    readonly declarationDigest: string;
    readonly durableControlTurnId: string;
    readonly target: WorkflowAddress;
    readonly workflowInstanceId: string;
}
/**
 * The existing seam terminal a receipt is derived from. `admission-outcome`
 * carries the existing Central Admission outcome verbatim (plus the resolved
 * decision's selected promoted artifact identity, an existing
 * `ResolvedDecision` fact); the other terminals carry no resolved evidence by
 * construction — the resolver produced nothing admissible.
 */
export type DecisionResolutionTerminal = {
    readonly kind: 'admission-outcome';
    readonly outcome: CentralAdmissionOutcome;
    readonly selectedArtifact?: CompiledArtifactIdentity;
} | {
    readonly kind: 'semantic-unavailable';
} | {
    readonly kind: 'resolver-failed';
    readonly error: unknown;
};
/**
 * Fail-closed receipt shape authority (runtime half of the type-level
 * closure): the receipt carries exactly the bounded A4 fields, no unknown
 * fields (no smuggled payloads), no functions/methods (no mutation/replay
 * surface), and the vocabulary values are exactly the declared ones.
 */
export declare function assertValidDecisionResolutionReceipt(receipt: unknown): asserts receipt is DecisionResolutionReceipt;
/**
 * L3 mapping of the existing resolver/runtime error codes onto the bounded
 * public failure-class vocabulary. An unmapped error keeps the honest
 * `unknown` class — never a fabricated success.
 */
export declare function classifyDecisionResolverFailure(error: unknown): DecisionReceiptResolverFailureClass;
/**
 * Derive the bounded public receipt for one semantic-decision turn from the
 * EXISTING contract-level facts of its terminal. The derivation is pure and
 * self-validating: it can never emit a receipt that fails the shape authority.
 */
export declare function deriveDecisionResolutionReceipt(identity: DecisionReceiptIdentityInput, terminal: DecisionResolutionTerminal): DecisionResolutionReceipt;
/** Durable append request for one decision receipt observation record. */
export interface DecisionReceiptRecordRequest {
    readonly target: WorkflowAddress;
    /** Exact immutable package identity of the receipt's stream binding. */
    readonly packageIdentity: DomainIntelligencePackageIdentity;
    readonly receipt: DecisionResolutionReceipt;
    /** Informational timestamp for the record (ordering authority stays `sequence`). */
    readonly observedAt: string;
    /** Opaque DAC/A2-owned provenance refs carried verbatim when present. */
    readonly runtimeBindingRef?: string;
    readonly runtimeActivationRef?: string;
}
/**
 * Additive observation-store extension (v0.6 T006): durable append of ONE
 * `DECISION_RECEIPT` record into the EXISTING durable ordered Runtime
 * Observation Stream of the exact (target, package identity, epoch '1')
 * binding.
 *
 * Adapter contract (same binding/contiguity rules as the covered v1 appends):
 * - validates the receipt fail-closed (`DECISION_RECEIPT_INVALID`) before any
 *   durable state changes;
 * - appends exactly one record at the next contiguous sequence, creating the
 *   stream binding when absent; a package-identity mismatch with an existing
 *   binding fails closed (`STREAM_IDENTITY_MISMATCH`);
 * - the append is atomic per record: either the record is durable or nothing
 *   changed (a failed append allocates no sequence);
 * - the record carries the receipt in its `decisionReceipt` envelope field and
 *   confers no authority whatsoever.
 */
export interface DecisionReceiptObservationStore {
    recordDecisionReceipt(request: DecisionReceiptRecordRequest): Promise<RuntimeObservationRecord>;
}
/** Structural capability check: does this store implement the receipt seam? */
export declare function isDecisionReceiptObservationStore(store: unknown): store is DecisionReceiptObservationStore;
//# sourceMappingURL=decision-receipt.d.ts.map