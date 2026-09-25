import type { StoredAcceptedMessage } from '../v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
import { type RecordProcessingFailureRequest, type RecordToolRecoveryRequiredRequest, type RecoveryInspection, type RecoveryRetryResult, type RecoveryStore, type RetryRecoveryRequest, type TerminalizeWorkflowRequest } from './contracts.js';
export interface PoisonMessageRecoveryCoordinatorOptions {
    now?: () => string;
}
/**
 * T-013 recovery policy over frozen RuntimeStore semantic operations.
 *
 * This coordinator deliberately does not create another per-instance lane. T-016 must invoke
 * state-changing recovery operations from the same T-010 serialized execution boundary used by
 * normal message processing. RuntimeStore remains the atomic durability authority.
 */
export declare class PoisonMessageRecoveryCoordinator {
    #private;
    private readonly store;
    constructor(store: RecoveryStore, options?: PoisonMessageRecoveryCoordinatorOptions);
    inspect(target: WorkflowAddress, messageId: string): Promise<RecoveryInspection>;
    nextProcessableMessage(target: WorkflowAddress): Promise<StoredAcceptedMessage | null>;
    recordProcessingFailure(request: RecordProcessingFailureRequest): Promise<RecoveryInspection>;
    recordToolRecoveryRequired(request: RecordToolRecoveryRequiredRequest): Promise<RecoveryInspection>;
    retry(request: RetryRecoveryRequest): Promise<RecoveryRetryResult>;
    terminalize(request: TerminalizeWorkflowRequest): Promise<WorkflowInstanceSnapshot>;
}
//# sourceMappingURL=poison-message-recovery.d.ts.map