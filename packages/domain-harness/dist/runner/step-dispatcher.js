import { ExpressionRuntime, ExpressionRuntimeError } from '../expression/expression-runtime.js';
import { ExecutorError, SkillExecutor, ToolRegistry } from '../execution/index.js';
import { ScriptExecutor, ScriptExecutorError } from '../script/index.js';
export class StepDispatcher {
    expressions;
    scripts;
    tools;
    skills;
    skillLookup;
    constructor(expressions, scripts, tools, skills, skillLookup) {
        this.expressions = expressions;
        this.scripts = scripts;
        this.tools = tools;
        this.skills = skills;
        this.skillLookup = skillLookup;
    }
    async execute(request) {
        const { invoke } = request;
        switch (invoke.kind) {
            case 'expr': {
                if (!invoke.expression)
                    throw new Error('Expr Step is missing expression');
                return this.expressions.evaluate(invoke.expression, request.expressionScope, request.startedAt, timeoutOptions(invoke.timeoutMs, request.signal));
            }
            case 'script': {
                if (!invoke.ref)
                    throw new Error('Script Step is missing ref');
                if (invoke.scriptSource === undefined) {
                    throw new Error(`Script '${invoke.ref}' was not frozen by Harness Loader`);
                }
                return this.scripts.executeSource(invoke.scriptSource, request.input, {
                    signal: request.signal,
                    ...(invoke.timeoutMs !== undefined ? { timeoutMs: invoke.timeoutMs } : {}),
                });
            }
            case 'tool': {
                if (!invoke.ref)
                    throw new Error('Tool Step is missing ref');
                return this.tools.execute(invoke.ref, request.input, {
                    runId: request.runId,
                    workflowInstanceId: request.workflowInstanceId,
                    stepId: `${request.stateId}#${request.visit}`,
                    attempt: request.attempt,
                    idempotencyKey: request.idempotencyKey,
                    signal: request.signal,
                    now: () => new Date(request.startedAt),
                }, invoke.timeoutMs !== undefined ? { timeoutMs: invoke.timeoutMs } : {});
            }
            case 'skill': {
                if (!invoke.ref)
                    throw new Error('Skill Step is missing ref');
                const skill = this.skillLookup(invoke.ref);
                if (!skill)
                    throw new Error(`Skill '${invoke.ref}' is not loaded`);
                const identity = {
                    runId: request.runId,
                    workflowInstanceId: request.workflowInstanceId,
                    stepId: `${request.stateId}#${request.visit}`,
                    attempt: request.attempt,
                };
                return this.skills.execute(skill, request.input, identity, {
                    signal: request.signal,
                    ...(invoke.timeoutMs !== undefined ? { timeoutMs: invoke.timeoutMs } : {}),
                });
            }
            case 'workflow': {
                throw new RunnerExecutionError('child_workflow_error', 'Workflow Steps are coordinated by RunCoordinator and must not reach StepDispatcher');
            }
        }
    }
}
export class RunnerExecutionError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.name = 'RunnerExecutionError';
        this.code = code;
    }
}
export function normalizeStepError(kind, error) {
    if (error instanceof RunnerExecutionError)
        return { code: error.code, message: error.message };
    if (error instanceof ExecutorError)
        return { code: error.code, message: error.message };
    if (error instanceof ExpressionRuntimeError)
        return { code: error.code, message: error.message };
    if (error instanceof ScriptExecutorError)
        return { code: error.code, message: error.message };
    const code = kind === 'expr'
        ? 'expression_error'
        : kind === 'script'
            ? 'script_error'
            : kind === 'tool'
                ? 'tool_error'
                : kind === 'skill'
                    ? 'ai_error'
                    : 'child_workflow_error';
    return {
        code,
        message: error instanceof Error ? error.message : String(error),
    };
}
function timeoutOptions(timeoutMs, signal) {
    return {
        signal,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    };
}
//# sourceMappingURL=step-dispatcher.js.map