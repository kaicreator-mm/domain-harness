import type { HarnessError, HarnessErrorCode } from '../contracts/errors.js';
import type { JsonValue } from '../contracts/json.js';
import { ExpressionRuntime } from '../expression/expression-runtime.js';
import { SkillExecutor, ToolRegistry } from '../execution/index.js';
import type { InvokeAst } from '../loader/ast.js';
import { ScriptExecutor } from '../script/index.js';
export interface StepDispatchRequest {
    invoke: InvokeAst;
    input: JsonValue;
    expressionScope: JsonValue;
    harnessRoot: string;
    runId: string;
    workflowInstanceId: string;
    stateId: string;
    visit: number;
    attempt: number;
    idempotencyKey: string;
    startedAt: string;
    signal: AbortSignal;
}
export declare class StepDispatcher {
    private readonly expressions;
    private readonly scripts;
    private readonly tools;
    private readonly skills;
    private readonly skillLookup;
    constructor(expressions: ExpressionRuntime, scripts: ScriptExecutor, tools: ToolRegistry, skills: SkillExecutor, skillLookup: (skillId: string) => import('../loader/ast.js').SkillAst | undefined);
    execute(request: StepDispatchRequest): Promise<JsonValue>;
}
export declare class RunnerExecutionError extends Error {
    readonly code: HarnessErrorCode;
    constructor(code: HarnessErrorCode, message: string, options?: ErrorOptions);
}
export declare function normalizeStepError(kind: InvokeAst['kind'], error: unknown): HarnessError;
//# sourceMappingURL=step-dispatcher.d.ts.map