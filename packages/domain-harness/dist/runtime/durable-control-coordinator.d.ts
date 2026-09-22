import type { JsonValue } from '../contracts/json.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import type { DeadlineControlSource, DurableControlStore, DurableExternalWorkControlSource, EnsureProvisionedWorkflowInstanceResult, ExternalCallbackControlSource, ExternalWorkCorrelationRecord, ProvisionWorkflowInstanceRequest, RegisterExternalWorkRequest } from './durable-control-contracts.js';
export type DurableControlErrorCode = 'INVALID_ARGUMENT' | 'PROVISIONING_IDENTITY_CONFLICT' | 'EXTERNAL_WORK_IDENTITY_CONFLICT' | 'UNKNOWN_EXTERNAL_CORRELATION' | 'TARGET_MISMATCH' | 'DEADLINE_TIMER_MISMATCH' | 'DEADLINE_NOT_DUE' | 'CALLBACK_IDENTITY_CONFLICT' | 'STORE_CONTRACT_VIOLATION' | 'STORE_CONTENTION';
export declare class DurableControlError extends Error {
    readonly code: DurableControlErrorCode;
    constructor(code: DurableControlErrorCode, message: string);
}
export interface AcceptExternalCallbackRequest {
    readonly externalCorrelationId: string;
    readonly target: WorkflowAddress;
    readonly callbackOrdinal: number;
    readonly payload: JsonValue;
    readonly receivedAt: string;
}
export type AcceptExternalCallbackResult = {
    readonly disposition: 'accepted' | 'duplicate';
    readonly controlSource: ExternalCallbackControlSource;
} | {
    readonly disposition: 'late_after_timeout';
    readonly controlSource: DeadlineControlSource;
} | {
    readonly disposition: 'ignored_after_completion';
    readonly controlSource: ExternalCallbackControlSource;
};
export interface FireDeadlineRequest {
    readonly externalCorrelationId: string;
    readonly target: WorkflowAddress;
    readonly timerId: string;
    readonly fireOrdinal: number;
    readonly firedAt: string;
}
export type FireDeadlineResult = {
    readonly disposition: 'accepted' | 'duplicate';
    readonly controlSource: DeadlineControlSource;
} | {
    readonly disposition: 'callback_already_completed';
    readonly controlSource: ExternalCallbackControlSource;
};
/**
 * Portable T-010 coordinator.
 *
 * It owns deterministic source identity and fail-closed race semantics, but it
 * deliberately owns no wall-clock scheduler, process lifecycle or external job
 * platform. Host adapters provide durable storage and decide when to invoke the
 * deadline/recovery methods.
 */
export declare class DurableControlCoordinator {
    private readonly store;
    constructor(store: DurableControlStore);
    provisionWorkflowInstance(request: ProvisionWorkflowInstanceRequest): Promise<EnsureProvisionedWorkflowInstanceResult>;
    registerExternalWork(request: RegisterExternalWorkRequest): Promise<ExternalWorkCorrelationRecord>;
    acceptExternalCallback(request: AcceptExternalCallbackRequest): Promise<AcceptExternalCallbackResult>;
    fireDeadline(request: FireDeadlineRequest): Promise<FireDeadlineResult>;
    /**
     * Restart helper for one known correlation. A stored terminal source is
     * returned again verbatim so a crash after durable settlement but before
     * downstream turn submission cannot lose the wake-up. Stable turn identity
     * lets the downstream Durable Control Turn layer deduplicate the replay.
     */
    recoverExternalWork(externalCorrelationId: string, now: string): Promise<DurableExternalWorkControlSource | null>;
    /**
     * Caller-driven recovery scan, not a scheduler. Hosts may invoke it on start,
     * resume or their own durable timer wake-up. Both accepted and duplicate
     * timeout sources are returned to heal crash-after-settlement/before-submit.
     */
    recoverDueDeadlines(now: string): Promise<readonly DeadlineControlSource[]>;
    private requireExternalWork;
}
//# sourceMappingURL=durable-control-coordinator.d.ts.map