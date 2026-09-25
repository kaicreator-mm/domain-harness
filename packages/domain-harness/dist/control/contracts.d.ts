import type { JsonObject, JsonValue } from '../contracts/json.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
/**
 * Issue #313 / #302 (reviewed Product/L2 chain + repair + rereview PASS):
 * generic public Runtime cancel/interrupt control.
 *
 * Authority invariants (mandatory, frozen by the reviewed contract):
 *
 * ```text
 * ControlIntent != RuntimeControlOutcome
 * RuntimeControlOutcome != ExternalEffectOutcome
 * AbortSignal != CommitEvidence
 * CANCEL != Rollback
 * INTERRUPT != DomainPolicyRecoveryDecision
 * SimulatorControlRequest != RuntimeTransitionAuthority
 * ControlRequestAccepted != RuntimeStopped
 * ```
 *
 * External control is opt-in and fail-closed authorization-gated: with no
 * configured `RuntimeControlAuthorizer` the capability is `UNSUPPORTED`
 * (default deny) and a Runtime reference alone is never control authority.
 * Raw XState actor handles and raw AbortControllers stay private; the public
 * truth is the durable control record/outcome only.
 */
/** Exact contract identity of this control surface (capability negotiation). */
export declare const RUNTIME_CONTROL_CONTRACT_VERSION: "runtime-control/1";
/** Closed public control verb vocabulary for this version. */
export type RuntimeControlAction = 'CANCEL' | 'INTERRUPT' | 'PAUSE' | 'RESUME';
/**
 * Exact current-turn selector. A control request carrying `expectedTurn` never
 * silently retargets a newer turn: a mismatch is a stale/conflict disposition
 * with no Runtime mutation.
 */
export interface RuntimeControlTurnSelector {
    readonly messageId: string;
    readonly targetSequence?: number;
}
/** Exact control target: one WorkflowAddress plus optional fail-closed selectors. */
export interface RuntimeControlTarget {
    readonly target: WorkflowAddress;
    /** Optimistic selector: the observed durable instance stateRevision. */
    readonly expectedStateRevision?: number;
    /** Optimistic selector: the exact current turn (mailbox head in processing). */
    readonly expectedTurn?: RuntimeControlTurnSelector;
}
/** Caller-supplied stable control request identity + intent. */
export interface RuntimeControlRequest {
    readonly controlRequestId: string;
    readonly callerRef: string;
    readonly action: RuntimeControlAction;
    readonly target: RuntimeControlTarget;
    readonly reason?: string;
}
/** Fail-closed authorization decision vocabulary. Only AUTHORIZED admits a request. */
export type RuntimeControlAuthorizationDecision = {
    readonly status: 'AUTHORIZED';
    /** Opaque host-owned durable authorization evidence reference. */
    readonly authorizationRef: string;
    /** Opaque host policy revision bound into the durable control evidence. */
    readonly policyRevision: string;
} | {
    readonly status: 'DENIED';
    readonly code: string;
    readonly reason?: string;
} | {
    readonly status: 'UNKNOWN';
    readonly code: string;
    readonly reason?: string;
};
/** What the authorizer sees. It binds caller/request/target/action/policy, nothing else. */
export interface RuntimeControlAuthorizationRequest {
    readonly controlRequestId: string;
    readonly callerRef: string;
    readonly target: WorkflowAddress;
    readonly action: RuntimeControlAction;
    readonly expectedStateRevision?: number;
    readonly expectedTurn?: RuntimeControlTurnSelector;
    readonly reason?: string;
}
/**
 * Host-owned authorization/admissibility seam. Opt-in: absence of an
 * authorizer disables external control entirely (UNSUPPORTED/default deny).
 * This seam decides admission only — never the Runtime transition outcome.
 */
export interface RuntimeControlAuthorizer {
    authorize(request: RuntimeControlAuthorizationRequest): Promise<RuntimeControlAuthorizationDecision>;
}
/** Receipt disposition returned by `requestControl` (closed vocabulary). */
export type RuntimeControlReceiptDisposition = 'ACCEPTED' | 'DUPLICATE' | 'ALREADY_TERMINAL' | 'NO_ACTIVE_TURN' | 'STALE_TARGET' | 'UNSUPPORTED_ACTION' | 'REJECTED' | 'UNSUPPORTED';
/**
 * Durable terminal control outcome (the reviewed list at minimum; the two
 * trailing non-mutating outcomes mirror their receipt dispositions for
 * truthful record keeping and are documented additions, not semantics
 * changes). `UNKNOWN` is never coerced to cancelled/stopped.
 */
export type RuntimeControlOutcome = 'PENDING' | 'CANCELLED_AT_SAFE_BOUNDARY' | 'INTERRUPTED_TO_RECOVERY_REQUIRED' | 'ALREADY_TERMINAL' | 'TOO_LATE_TURN_COMMITTED' | 'REQUIRES_RECONCILIATION' | 'UNSUPPORTED' | 'REJECTED' | 'UNKNOWN' | 'NO_ACTIVE_TURN' | 'STALE_TARGET';
/** Durable lifecycle: requested -> accepted -> resolving -> terminal outcome. */
export type RuntimeControlStatus = 'requested' | 'accepted' | 'resolving' | 'resolved';
/** Reference/summary material only — the effect journal stays authoritative. */
export interface RuntimeControlEffectEvidence {
    readonly effectId: string;
    readonly semantics: 'none' | 'idempotent' | 'non-idempotent';
    readonly durableStatus: 'started' | 'completed' | 'failed' | 'unknown';
    readonly externalOutcomeRef?: string;
    readonly reconciliationRef?: string;
}
/** Authorization evidence durably bound to the exact request (fail-closed). */
export type RuntimeControlAuthorizationEvidence = {
    readonly decision: 'AUTHORIZED';
    readonly callerRef: string;
    readonly authorizationRef: string;
    readonly policyRevision: string;
} | {
    readonly decision: 'DENIED' | 'UNKNOWN';
    readonly callerRef: string;
    readonly code: string;
    readonly reason?: string;
};
/**
 * The durable control record. Queryable by `controlRequestId`; survives
 * Runtime restart and is reconciled from authoritative facts, never blindly
 * reissued. Timestamps are informational — durable facts order races.
 */
export interface RuntimeControlRecord {
    readonly controlRequestId: string;
    readonly action: RuntimeControlAction;
    readonly target: WorkflowAddress;
    readonly expectedStateRevision?: number;
    readonly expectedTurn?: RuntimeControlTurnSelector;
    readonly callerRef: string;
    readonly reason?: string;
    readonly authorization: RuntimeControlAuthorizationEvidence;
    readonly status: RuntimeControlStatus;
    readonly receiptDisposition?: RuntimeControlReceiptDisposition;
    readonly outcome?: RuntimeControlOutcome;
    /** Durable stateRevision observed at resolution (not race-ordering authority). */
    readonly observedStateRevision?: number;
    /** Turn identity durably claimed by a resolving INTERRUPT, where applicable. */
    readonly claimedTurn?: RuntimeControlTurnSelector;
    /** Truthful marker that an internal AbortSignal was issued (never commit evidence). */
    readonly signalIssued?: boolean;
    readonly effectEvidence?: readonly RuntimeControlEffectEvidence[];
    readonly requestedAt: string;
    readonly resolvedAt?: string;
}
/** Synchronous receipt for `requestControl`. Accepted never means stopped. */
export interface RuntimeControlReceipt {
    readonly controlRequestId: string;
    readonly status: RuntimeControlStatus;
    readonly disposition: RuntimeControlReceiptDisposition;
    readonly outcome?: RuntimeControlOutcome;
    /** Full durable evidence record (already resolved records carry the outcome). */
    readonly record: RuntimeControlRecord;
}
export interface RuntimeControlStoreCreateResult {
    readonly disposition: 'created' | 'duplicate' | 'conflict';
    readonly record: RuntimeControlRecord;
}
/** Fields a transition may change (identity fields are immutable after creation). */
export interface RuntimeControlRecordUpdate {
    readonly status: RuntimeControlStatus;
    readonly receiptDisposition?: RuntimeControlReceiptDisposition;
    readonly outcome?: RuntimeControlOutcome;
    readonly observedStateRevision?: number;
    readonly claimedTurn?: RuntimeControlTurnSelector;
    readonly signalIssued?: boolean;
    readonly effectEvidence?: readonly RuntimeControlEffectEvidence[];
    readonly resolvedAt?: string;
}
/**
 * Durable persistence seam for control request/outcome evidence.
 * Implementations MUST make `createRequest` atomic per `controlRequestId`
 * (one id binds one exact request identity; conflicting reuse is `conflict`
 * and fails closed) and `transitionRequest` a compare-and-set on `status`
 * that fails closed on a stale/unexpected status. This store is control
 * evidence only — it is not a general event log and not telemetry.
 */
export interface RuntimeControlStore {
    createRequest(record: RuntimeControlRecord): Promise<RuntimeControlStoreCreateResult>;
    getRequest(controlRequestId: string): Promise<RuntimeControlRecord | null>;
    listUnresolvedRequests(): Promise<readonly RuntimeControlRecord[]>;
    transitionRequest(controlRequestId: string, expectedStatus: RuntimeControlStatus, update: RuntimeControlRecordUpdate): Promise<RuntimeControlRecord>;
}
export type RuntimeControlCapability = {
    readonly status: 'UNSUPPORTED';
    /**
     * Default-deny surface: no authorizer is configured, so every request
     * receives an UNSUPPORTED receipt and causes no Runtime mutation.
     */
    requestControl(request: RuntimeControlRequest): Promise<RuntimeControlReceipt>;
} | {
    readonly status: 'ENABLED';
    readonly contractVersion: typeof RUNTIME_CONTROL_CONTRACT_VERSION;
    requestControl(request: RuntimeControlRequest): Promise<RuntimeControlReceipt>;
    /** Reads the durable control record by id (polling reconciled results). */
    getControlOutcome(controlRequestId: string): Promise<RuntimeControlRecord | null>;
};
/** Provenance marker frozen into terminalize/failure evidence by control writes. */
export declare const RUNTIME_CONTROL_PROVENANCE_KIND: "runtime-control";
export interface RuntimeControlProvenance extends JsonObject {
    readonly kind: typeof RUNTIME_CONTROL_PROVENANCE_KIND;
    readonly controlRequestId: string;
    readonly action: RuntimeControlAction;
    readonly authorizationRef: string;
    readonly policyRevision: string;
}
/** True when a terminal/recovery instance's durable failure was written by this exact control. */
export declare function runtimeControlProvenanceOf(instance: WorkflowInstanceSnapshot): RuntimeControlProvenance | null;
/** Terminalize reason JSON carrying exact control provenance (stored as failure evidence). */
export declare function runtimeControlTerminalizeReason(provenance: RuntimeControlProvenance): JsonValue;
//# sourceMappingURL=contracts.d.ts.map