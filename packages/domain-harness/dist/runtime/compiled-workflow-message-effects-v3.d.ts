import { SuccessorJournaledDomainMessageEffect } from '../messaging/send-effect/successor-journaled-domain-message-effect.js';
import type { WorkflowSendPermanentRejection } from '../messaging/contracts/workflow-send-acceptance.js';
import type { ExpressionExecutorPort } from '../v2/contracts/host.js';
import type { StoredAcceptedMessage } from '../v2/contracts/store.js';
import type { WorkflowAddress, WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
import type { CompiledStateV3 } from './compiled-workflow-ir-v3.js';
import type { PortableWorkflowState } from './compiled-workflow-runtime.js';
export interface CompiledWorkflowMessageEffectsV3Options {
    readonly expression: ExpressionExecutorPort;
    readonly messageEffect: SuccessorJournaledDomainMessageEffect;
    readonly onChildAccepted: (target: WorkflowAddress, messageId: string) => void;
}
export type CompiledWorkflowMessageEffectsV3Result = {
    readonly status: 'continued';
} | {
    readonly status: 'rejected_routed';
    readonly state: PortableWorkflowState;
    readonly rejection: WorkflowSendPermanentRejection;
    readonly effectIndex: number;
};
/**
 * Executes only engine-major-3 Domain Message effects for one settled state.
 *
 * A permanent child rejection is already durably committed by `messageEffect`
 * before this function selects its route. Route selection then returns
 * immediately, so no later old-state sibling effect can execute. The caller
 * must continue settling from the returned state before considering the old
 * state's invoke path.
 */
export declare class CompiledWorkflowMessageEffectsV3 {
    private readonly options;
    constructor(options: CompiledWorkflowMessageEffectsV3Options);
    run(request: {
        readonly stateDefinition: CompiledStateV3;
        readonly current: WorkflowInstanceSnapshot;
        readonly stored: StoredAcceptedMessage;
        readonly state: PortableWorkflowState;
        readonly logicalTime: string;
        readonly step: number;
    }): Promise<CompiledWorkflowMessageEffectsV3Result>;
    private selectRoute;
}
//# sourceMappingURL=compiled-workflow-message-effects-v3.d.ts.map