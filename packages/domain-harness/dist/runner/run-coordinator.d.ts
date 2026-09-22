import type { AIOperationPort } from '../contracts/ai.js';
import { ExpressionRuntime } from '../expression/expression-runtime.js';
import { ToolRegistry } from '../execution/index.js';
import type { LoadedHarness } from '../loader/ast.js';
import { SqliteStore } from '../persistence/sqlite-store.js';
import type { StoredRun } from '../persistence/types.js';
import { ScriptExecutor } from '../script/index.js';
export interface CreateRootRunRequest {
    runId: string;
    workflowId: string;
    input: unknown;
    createdAt?: string;
}
export interface RunCoordinatorOptions {
    harness: LoadedHarness;
    store: SqliteStore;
    tools: ToolRegistry;
    ai: AIOperationPort;
    expressions?: ExpressionRuntime;
    scripts?: ScriptExecutor;
    now?: () => Date;
    /** Internal v0.1 defensive bound. Not part of the public Harness DSL. */
    maxChildWorkflowDepth?: number;
}
export declare class RunCoordinator {
    private readonly harness;
    private readonly store;
    private readonly tools;
    private readonly expressions;
    private readonly routeEvaluator;
    private readonly dispatcher;
    private readonly machines;
    private readonly now;
    private readonly maxChildWorkflowDepth;
    constructor(options: RunCoordinatorOptions);
    createRootRun(request: CreateRootRunRequest): StoredRun;
    drive(runId: string, signal?: AbortSignal): Promise<StoredRun>;
    private executeStep;
    private activateChildWorkflow;
    private finishFinalState;
    private finishChildFinalState;
    private failChildExecution;
    private completeAndPopChild;
    private childWorkflowError;
    private failRun;
    private buildBaseScope;
    private buildExpressionStepScope;
    private buildRouteScope;
    private frameInput;
    private requireRun;
    private requireWorkflow;
    private requireMachine;
}
export declare function deriveChildWorkflowInstanceId(parentWorkflowInstanceId: string, parentStateId: string, parentVisit: number): string;
//# sourceMappingURL=run-coordinator.d.ts.map