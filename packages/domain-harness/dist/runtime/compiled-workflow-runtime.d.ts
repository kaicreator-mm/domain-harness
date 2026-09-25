import type { JsonObject, JsonValue } from '../contracts/json.js';
import { DurableToolRunner } from '../execution/tool-runner/durable-tool-runner.js';
import { JournaledDomainMessageEffect } from '../messaging/send-effect/journaled-domain-message-effect.js';
import type { ToolExecutorPort } from '../v2/contracts/effect.js';
import type { ExpressionExecutorPort } from '../v2/contracts/host.js';
import type { CompiledWorkflowDescriptor, TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import type { StoredAcceptedMessage } from '../v2/contracts/store.js';
import type { RuntimeFailure, WorkflowAddress, WorkflowInstanceSnapshot, WorkflowLifecycle } from '../v2/contracts/workflow.js';
import { JournaledSkillRunner } from './journaled-skill-runner.js';
export interface PortableWorkflowState extends JsonObject {
    stateId: string;
    data: JsonValue;
    lastMessage: JsonValue;
    lastResult: JsonValue;
}
export interface CompiledWorkflowRuntimeOptions {
    expression: ExpressionExecutorPort;
    toolRunner: DurableToolRunner;
    toolExecutor: ToolExecutorPort;
    skillRunner?: JournaledSkillRunner;
    messageEffect: JournaledDomainMessageEffect;
    onChildAccepted(target: WorkflowAddress, messageId: string): void;
}
export interface CompiledWorkflowTransition {
    nextState: JsonValue;
    nextLifecycle: WorkflowLifecycle;
    output?: JsonValue;
    recoveryFailure?: RuntimeFailure;
}
/**
 * Turn-scoped execution options (#313): the internal AbortSignal of the ONE
 * in-flight mailbox turn, issued only after a durable winning control claim.
 * Public semantics remain defined exclusively by the durable control outcome;
 * a callee ignoring this signal can never fabricate a stop.
 */
export interface CompiledWorkflowExecutionOptions {
    signal?: AbortSignal;
}
export declare class CompiledWorkflowRuntime {
    private readonly options;
    constructor(options: CompiledWorkflowRuntimeOptions);
    initialState(workflow: CompiledWorkflowDescriptor, input: JsonValue): JsonValue;
    processMessage(compiledPackage: TargetCompiledDomainPackage, workflow: CompiledWorkflowDescriptor, current: WorkflowInstanceSnapshot, stored: StoredAcceptedMessage, execution?: CompiledWorkflowExecutionOptions): Promise<CompiledWorkflowTransition>;
    private settle;
    private invoke;
    private runMessageEffects;
    private selectRoute;
}
//# sourceMappingURL=compiled-workflow-runtime.d.ts.map