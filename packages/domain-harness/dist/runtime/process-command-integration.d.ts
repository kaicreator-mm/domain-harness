import type { RuntimeStoreProcessCommandExtension } from '../contracts/process-command.js';
import type { CompiledWorkflowCommandResult } from './compiled-workflow-runtime.js';
import type { RuntimeStore, StoredAcceptedMessage } from '../v2/contracts/store.js';
import type { WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
export type V3ProcessCommandStore = RuntimeStore & RuntimeStoreProcessCommandExtension;
export declare function requireV3ProcessCommandStore(store: RuntimeStore): V3ProcessCommandStore;
/**
 * Publish one already-evaluated v3 command result through the existing T-009
 * atomic store extension. This helper never owns a second durability domain.
 */
export declare function commitV3ProcessedCommandTurn(request: {
    readonly store: V3ProcessCommandStore;
    readonly current: WorkflowInstanceSnapshot;
    readonly stored: StoredAcceptedMessage;
    readonly result: CompiledWorkflowCommandResult;
    readonly updatedAt: string;
}): Promise<void>;
//# sourceMappingURL=process-command-integration.d.ts.map