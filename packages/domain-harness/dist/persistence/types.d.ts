import type { HarnessError, RunStatus } from '../public/index.js';
import type { StepKind } from '../loader/ast.js';
export type JournalStepKind = StepKind | 'event';
export type JournalStepStatus = 'started' | 'completed' | 'failed';
export interface WorkflowFrameState {
    workflowId: string;
    workflowInstanceId: string;
    stateId: string;
    visits: Record<string, number>;
    lastDecisionAt: string;
}
export interface RuntimeControlState {
    schemaVersion: 1;
    frames: WorkflowFrameState[];
}
export interface StoredRun {
    runId: string;
    harnessId: string;
    rootWorkflowId: string;
    status: RunStatus;
    input: unknown;
    output?: unknown;
    error?: HarnessError;
    definitionHash: string;
    executionEngineMajor: number;
    controlState: RuntimeControlState;
    createdAt: string;
    updatedAt: string;
}
export interface RunUpdate {
    status?: RunStatus;
    output?: unknown;
    clearOutput?: boolean;
    error?: HarnessError;
    clearError?: boolean;
    controlState?: RuntimeControlState;
    updatedAt: string;
}
export interface StepIdentity {
    runId: string;
    workflowInstanceId: string;
    stateId: string;
    visit: number;
}
export interface StartedStep extends StepIdentity {
    kind: JournalStepKind;
    attempt: number;
    startedAt: string;
    input?: unknown;
    idempotencyKey: string;
}
export interface StoredStep extends StartedStep {
    status: JournalStepStatus;
    completedAt?: string;
    output?: unknown;
    error?: HarnessError;
}
export interface StepResultUpdate {
    status: 'completed' | 'failed';
    completedAt: string;
    output?: unknown;
    error?: HarnessError;
}
//# sourceMappingURL=types.d.ts.map