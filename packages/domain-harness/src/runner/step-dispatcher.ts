import type { HarnessError, HarnessErrorCode } from '../contracts/errors.js';
import type { AIOperationIdentity } from '../contracts/ai.js';
import type { JsonValue } from '../contracts/json.js';
import { ExpressionRuntime, ExpressionRuntimeError } from '../expression/expression-runtime.js';
import { ExecutorError, SkillExecutor, ToolRegistry } from '../execution/index.js';
import type { InvokeAst } from '../loader/ast.js';
import { ScriptExecutor, ScriptExecutorError } from '../script/index.js';

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

export class StepDispatcher {
  constructor(
    private readonly expressions: ExpressionRuntime,
    private readonly scripts: ScriptExecutor,
    private readonly tools: ToolRegistry,
    private readonly skills: SkillExecutor,
    private readonly skillLookup: (skillId: string) => import('../loader/ast.js').SkillAst | undefined,
  ) {}

  async execute(request: StepDispatchRequest): Promise<JsonValue> {
    const { invoke } = request;
    switch (invoke.kind) {
      case 'expr': {
        if (!invoke.expression) throw new Error('Expr Step is missing expression');
        return this.expressions.evaluate(
          invoke.expression,
          request.expressionScope,
          request.startedAt,
          timeoutOptions(invoke.timeoutMs, request.signal),
        );
      }
      case 'script': {
        if (!invoke.ref) throw new Error('Script Step is missing ref');
        return this.scripts.execute(
          invoke.ref,
          request.input,
          {
            harnessRoot: request.harnessRoot,
            signal: request.signal,
            ...(invoke.timeoutMs !== undefined ? { timeoutMs: invoke.timeoutMs } : {}),
          },
        );
      }
      case 'tool': {
        if (!invoke.ref) throw new Error('Tool Step is missing ref');
        return this.tools.execute(
          invoke.ref,
          request.input,
          {
            runId: request.runId,
            workflowInstanceId: request.workflowInstanceId,
            stepId: `${request.stateId}#${request.visit}`,
            attempt: request.attempt,
            idempotencyKey: request.idempotencyKey,
            signal: request.signal,
            now: () => new Date(request.startedAt),
          },
          invoke.timeoutMs !== undefined ? { timeoutMs: invoke.timeoutMs } : {},
        );
      }
      case 'skill': {
        if (!invoke.ref) throw new Error('Skill Step is missing ref');
        const skill = this.skillLookup(invoke.ref);
        if (!skill) throw new Error(`Skill '${invoke.ref}' is not loaded`);
        const identity: AIOperationIdentity = {
          runId: request.runId,
          workflowInstanceId: request.workflowInstanceId,
          stepId: `${request.stateId}#${request.visit}`,
          attempt: request.attempt,
        };
        return this.skills.execute(
          skill,
          request.input,
          identity,
          {
            signal: request.signal,
            ...(invoke.timeoutMs !== undefined ? { timeoutMs: invoke.timeoutMs } : {}),
          },
        );
      }
      case 'workflow': {
        throw new RunnerExecutionError(
          'child_workflow_error',
          'Workflow Steps are coordinated by RunCoordinator and must not reach StepDispatcher',
        );
      }
    }
  }
}

export class RunnerExecutionError extends Error {
  readonly code: HarnessErrorCode;

  constructor(code: HarnessErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RunnerExecutionError';
    this.code = code;
  }
}

export function normalizeStepError(kind: InvokeAst['kind'], error: unknown): HarnessError {
  if (error instanceof RunnerExecutionError) return { code: error.code, message: error.message };
  if (error instanceof ExecutorError) return { code: error.code, message: error.message };
  if (error instanceof ExpressionRuntimeError) return { code: error.code, message: error.message };
  if (error instanceof ScriptExecutorError) return { code: error.code, message: error.message };

  const code: HarnessErrorCode = kind === 'expr'
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

function timeoutOptions(timeoutMs: number | undefined, signal: AbortSignal) {
  return {
    signal,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}
