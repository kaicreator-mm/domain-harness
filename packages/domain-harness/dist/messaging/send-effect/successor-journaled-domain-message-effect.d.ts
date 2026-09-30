import type { WorkflowSendTransientUnavailable } from '../contracts/workflow-send-acceptance.js';
import type { CompletedSuccessorDomainMessageEffectResult, RunSuccessorDomainMessageEffectRequest, SuccessorJournaledDomainMessageEffectOptions } from './successor-contracts.js';
export declare class WorkflowSendTransientUnavailableError extends Error {
    readonly condition: WorkflowSendTransientUnavailable;
    constructor(condition: WorkflowSendTransientUnavailable);
}
/**
 * Engine-major-3 journaled workflow send.
 *
 * Legacy engine-2 journal format/runner is intentionally untouched. Successor
 * accepted and permanent-rejected results are both terminal semantic outcomes
 * and are committed in a versioned envelope. Transient unavailability leaves
 * the source effect `started`, so retry reuses the exact effectId/child messageId.
 */
export declare class SuccessorJournaledDomainMessageEffect {
    #private;
    constructor(options: SuccessorJournaledDomainMessageEffectOptions);
    run(request: RunSuccessorDomainMessageEffectRequest): Promise<CompletedSuccessorDomainMessageEffectResult>;
}
//# sourceMappingURL=successor-journaled-domain-message-effect.d.ts.map