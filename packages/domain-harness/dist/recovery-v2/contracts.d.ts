import type { JsonValue } from '../contracts/json.js';
import type { RecoveryRequiredToolEffectResult } from '../execution/tool-runner/durable-tool-runner.js';
import type { MessageDispositionSnapshot } from '../v2/contracts/message.js';
import type { RuntimeStore } from '../v2/contracts/store.js';
import type { RuntimeFailure, TerminalWorkflowLifecycle, WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
export declare const AMBIGUOUS_NON_IDEMPOTENT_EFFECT_FAILURE_CODE: "ambiguous_non_idempotent_effect";
export type RecoveryStore = Pick<RuntimeStore, 'getInstance' | 'getMessageDisposition' | 'getNextAcceptedMessage' | 'failMessageProcessing' | 'terminalizeInstance' | 'resetRecovery'>;
export interface RecordProcessingFailureRequest {
    target: WorkflowAddress;
    messageId: string;
    expectedTargetSequence: number;
    failure: RuntimeFailure;
}
export interface RecordToolRecoveryRequiredRequest {
    target: WorkflowAddress;
    messageId: string;
    expectedTargetSequence: number;
    effect: RecoveryRequiredToolEffectResult;
    message?: string;
}
export interface RecoveryInspection {
    instance: WorkflowInstanceSnapshot;
    message: MessageDispositionSnapshot;
}
export interface DomainPolicyRetryAuthorization {
    kind: 'domain-policy';
    reason: string;
}
export interface AmbiguousNonIdempotentRetryAuthorization {
    kind: 'ambiguous-non-idempotent-resolved';
    effectId: string;
    reason: string;
}
export type RecoveryRetryAuthorization = DomainPolicyRetryAuthorization | AmbiguousNonIdempotentRetryAuthorization;
export interface RetryRecoveryRequest {
    target: WorkflowAddress;
    messageId: string;
    authorization: RecoveryRetryAuthorization;
}
export type RecoveryRetryResult = RecoveryInspection;
interface TerminalizeBaseRequest {
    target: WorkflowAddress;
    lifecycle: TerminalWorkflowLifecycle;
    output?: JsonValue;
    reason?: JsonValue;
}
export interface NormalTerminalizeRequest extends TerminalizeBaseRequest {
    mode: 'normal';
}
export interface RecoveryTerminalizeRequest extends TerminalizeBaseRequest {
    mode: 'recovery';
    authorization: {
        kind: 'domain-authorized';
        reason: string;
    };
}
export type TerminalizeWorkflowRequest = NormalTerminalizeRequest | RecoveryTerminalizeRequest;
export {};
//# sourceMappingURL=contracts.d.ts.map