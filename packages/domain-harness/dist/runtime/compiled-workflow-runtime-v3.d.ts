import type { JsonValue } from '../contracts/json.js';
import { DurableToolRunner } from '../execution/tool-runner/durable-tool-runner.js';
import type { ToolExecutorPort } from '../v2/contracts/effect.js';
import type { ExpressionExecutorPort } from '../v2/contracts/host.js';
import type { CompiledWorkflowDescriptor, TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import type { StoredAcceptedMessage } from '../v2/contracts/store.js';
import type { WorkflowInstanceSnapshot } from '../v2/contracts/workflow.js';
import { CompiledWorkflowMessageEffectsV3 } from './compiled-workflow-message-effects-v3.js';
import { JournaledSkillRunner } from './journaled-skill-runner.js';
import type { CompiledWorkflowCommandResult, CompiledWorkflowExecutionOptions } from './compiled-workflow-runtime.js';
export interface CompiledWorkflowRuntimeV3Options {
    readonly expression: ExpressionExecutorPort;
    readonly toolRunner: DurableToolRunner;
    readonly toolExecutor: ToolExecutorPort;
    readonly skillRunner?: JournaledSkillRunner;
    readonly messageEffects: CompiledWorkflowMessageEffectsV3;
}
/**
 * Internal executionEngineMajor=3 interpreter owned by I-MSG-REJECT.
 *
 * It is intentionally not wired into the public Runtime/compiler profile here;
 * I-03-ASSEMBLY owns that final profile selection. Retained engine-2 source is
 * untouched. Normal source-command rejection continues to use T-009's result
 * contract, while child-send permanent rejection is routed inside settle().
 */
export declare class CompiledWorkflowRuntimeV3 {
    private readonly options;
    constructor(options: CompiledWorkflowRuntimeV3Options);
    initialState(workflow: CompiledWorkflowDescriptor, input: JsonValue): JsonValue;
    processCommand(compiledPackage: TargetCompiledDomainPackage, workflow: CompiledWorkflowDescriptor, current: WorkflowInstanceSnapshot, stored: StoredAcceptedMessage, execution?: CompiledWorkflowExecutionOptions): Promise<CompiledWorkflowCommandResult>;
    private settle;
    private invoke;
    private selectRoute;
}
//# sourceMappingURL=compiled-workflow-runtime-v3.d.ts.map