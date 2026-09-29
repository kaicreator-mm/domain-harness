import type { DomainCommandRejection } from '../contracts/process-command.js';
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
export type CompiledWorkflowCommandResult = {
    readonly status: 'applied';
    readonly transition: CompiledWorkflowTransition;
} | {
    readonly status: 'rejected';
    readonly rejection: DomainCommandRejection;
};
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
    /**
     * Historical engine-2 execution entrypoint. Normal domain non-applicability
     * deliberately remains an ordinary Error here so retained 0.2/2/2 Runtime
     * failure/recovery semantics remain byte-for-byte compatible at the public
     * behavior boundary. v3 assembly consumes processCommand() instead.
     */
    processMessage(compiledPackage: TargetCompiledDomainPackage, workflow: CompiledWorkflowDescriptor, current: WorkflowInstanceSnapshot, stored: StoredAcceptedMessage, execution?: CompiledWorkflowExecutionOptions): Promise<CompiledWorkflowTransition>;
    /**
     * T-009 integration seam used only by v3 assembly. Ordinary current-state
     * non-applicability becomes an explicit normal command rejection; technical
     * failures still throw and therefore retain recovery/failure ownership.
     */
    processCommand(compiledPackage: TargetCompiledDomainPackage, workflow: CompiledWorkflowDescriptor, current: WorkflowInstanceSnapshot, stored: StoredAcceptedMessage, execution?: CompiledWorkflowExecutionOptions): Promise<CompiledWorkflowCommandResult>;
    private settle;
    private invoke;
    private runMessageEffects;
    private selectRoute;
}
//# sourceMappingURL=compiled-workflow-runtime.d.ts.map