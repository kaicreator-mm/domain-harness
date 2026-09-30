import type { DomainMessage } from '../../v2/contracts/message.js';
import type { RuntimeStore } from '../../v2/contracts/store.js';
import { type DomainMessageAcceptanceBoundary } from '../contracts/message-acceptance.js';
import type { WorkflowSendAcceptanceBoundary, WorkflowSendAcceptanceResult } from '../contracts/workflow-send-acceptance.js';
export type WorkflowSendTargetReader = Pick<RuntimeStore, 'getInstance'>;
export interface WorkflowSendAcceptanceDependencies {
    readonly acceptance: DomainMessageAcceptanceBoundary;
    readonly store: WorkflowSendTargetReader;
}
/**
 * Successor I-MSG-REJECT adapter over the retained acceptance authority.
 *
 * The retained boundary is always consulted first, preserving its durable
 * duplicate-first semantics. This adapter only classifies a closed subset of
 * already-produced acceptance failures; it never reimplements validation or
 * mutates target state.
 */
export declare class WorkflowSendAcceptance implements WorkflowSendAcceptanceBoundary {
    #private;
    constructor(dependencies: WorkflowSendAcceptanceDependencies);
    accept(message: DomainMessage): Promise<WorkflowSendAcceptanceResult>;
}
//# sourceMappingURL=workflow-send-acceptance.d.ts.map