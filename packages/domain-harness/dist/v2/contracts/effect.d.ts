import type { JsonValue } from '../../contracts/json.js';
import type { CompiledToolDescriptor, ToolEffectSemantics } from './package.js';
import type { WorkflowAddress } from './workflow.js';
export interface EffectExecutionContext {
    effectId: string;
    target: WorkflowAddress;
    sourceMessageId: string;
    logicalTime: string;
    attempt: number;
    idempotencyKey: string;
    signal?: AbortSignal;
}
export interface ToolExecutionRequest {
    descriptor: CompiledToolDescriptor;
    input: JsonValue;
    context: EffectExecutionContext;
}
export interface ToolExecutorPort {
    execute(request: ToolExecutionRequest): Promise<JsonValue>;
}
export type EffectJournalStatus = 'started' | 'completed' | 'failed';
export interface EffectJournalRecord {
    effectId: string;
    target: WorkflowAddress;
    sourceMessageId: string;
    effectKind: string;
    effectSemantics: ToolEffectSemantics;
    status: EffectJournalStatus;
    attempt: number;
    input?: JsonValue;
    output?: JsonValue;
    error?: JsonValue;
    startedAt: string;
    completedAt?: string;
}
//# sourceMappingURL=effect.d.ts.map