import type { DomainMessage, MessageAcceptedAck } from '../../v2/contracts/message.js';
import type { WorkflowLifecycle } from '../../v2/contracts/workflow.js';
export type WorkflowSendPermanentRejectionCode = 'target_terminal' | 'workflow_not_found' | 'message_contract_not_found' | 'contract_version_mismatch' | 'payload_contract_violation';
export type WorkflowSendTransientUnavailableCode = 'target_not_found' | 'target_recovery_required';
export interface WorkflowSendPermanentRejection {
    readonly code: WorkflowSendPermanentRejectionCode;
    readonly message: string;
    /** Present only for `target_terminal`; evidence for engine-3 rejection routing. */
    readonly targetLifecycle?: Extract<WorkflowLifecycle, 'completed' | 'failed' | 'cancelled' | 'terminated'>;
}
export interface WorkflowSendTransientUnavailable {
    readonly code: WorkflowSendTransientUnavailableCode;
    readonly message: string;
}
/**
 * Successor-only typed result for a workflow-triggered Domain Message send.
 *
 * `rejected` is a stable semantic result that engine-major-3 may route.
 * `transient_unavailable` is deliberately nonterminal for the source effect:
 * retry must reuse the same source effectId / child messageId.
 * Everything outside this closed taxonomy remains a technical failure and is
 * thrown by the acceptance boundary rather than weakened into a rejection.
 */
export type WorkflowSendAcceptanceResult = {
    readonly status: 'accepted';
    readonly ack: MessageAcceptedAck;
} | {
    readonly status: 'rejected';
    readonly rejection: WorkflowSendPermanentRejection;
} | {
    readonly status: 'transient_unavailable';
    readonly condition: WorkflowSendTransientUnavailable;
};
export interface WorkflowSendAcceptanceBoundary {
    accept(message: DomainMessage): Promise<WorkflowSendAcceptanceResult>;
}
//# sourceMappingURL=workflow-send-acceptance.d.ts.map