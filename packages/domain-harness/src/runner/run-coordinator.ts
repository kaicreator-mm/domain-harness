import type { AIOperationPort } from '../contracts/ai.js';
import type { HarnessError } from '../contracts/errors.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import {
  compileControlMachine,
  initialControlState,
  transitionControlState,
} from '../compiler/control-machine.js';
import { ExpressionRuntime, ExpressionRuntimeError } from '../expression/expression-runtime.js';
import { SkillExecutor, ToolRegistry } from '../execution/index.js';
import { assertPortableJson } from '../execution/schema-validator.js';
import type { LoadedHarness, StateAst, WorkflowAst } from '../loader/ast.js';
import { SqliteStore } from '../persistence/sqlite-store.js';
import type {
  RuntimeControlState,
  StepIdentity,
  StoredRun,
  WorkflowFrameState,
} from '../persistence/types.js';
import { ScriptExecutor } from '../script/index.js';
import {
  countExecutableSteps,
  deriveIdempotencyKey,
  incrementStartedAttempt,
  latestCompletedOutputs,
  latestFrameError,
} from './journal.js';
import { RouteEvaluator, type RouteScope } from './route-evaluator.js';
import {
  normalizeStepError,
  StepDispatcher,
  type WorkflowStepHandler,
} from './step-dispatcher.js';

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
  workflowHandler?: WorkflowStepHandler;
  now?: () => Date;
}

interface StepOutcome {
  routeClass: 'done' | 'error';
  logicalTime: string;
  output?: JsonValue;
  error?: HarnessError;
}

interface BaseScope extends JsonObject {
  input: JsonValue;
  steps: Record<string, JsonValue>;
  run: { visits: Record<string, number> };
}

export class RunCoordinator {
  private readonly harness: LoadedHarness;
  private readonly store: SqliteStore;
  private readonly tools: ToolRegistry;
  private readonly expressions: ExpressionRuntime;
  private readonly routeEvaluator: RouteEvaluator;
  private readonly dispatcher: StepDispatcher;
  private readonly machines = new Map<string, ReturnType<typeof compileControlMachine>>();
  private readonly now: () => Date;

  constructor(options: RunCoordinatorOptions) {
    this.harness = options.harness;
    this.store = options.store;
    this.tools = options.tools;
    this.expressions = options.expressions ?? new ExpressionRuntime();
    const scripts = options.scripts ?? new ScriptExecutor();
    const skills = new SkillExecutor(options.ai);
    this.routeEvaluator = new RouteEvaluator(this.expressions);
    this.dispatcher = new StepDispatcher(
      this.expressions,
      scripts,
      this.tools,
      skills,
      (skillId) => this.harness.skills.get(skillId),
      options.workflowHandler,
    );
    this.now = options.now ?? (() => new Date());

    for (const [workflowId, workflow] of this.harness.workflows) {
      this.machines.set(workflowId, compileControlMachine(workflow));
    }
  }

  createRootRun(request: CreateRootRunRequest): StoredRun {
    if (this.store.getRun(request.runId)) throw new Error(`Run '${request.runId}' already exists`);
    const workflow = this.requireWorkflow(request.workflowId);
    assertPortableJson(request.input, 'invalid_input', 'Run input');
    const input = request.input;
    const createdAt = request.createdAt ?? this.now().toISOString();
    const machine = this.requireMachine(workflow.id);
    const initial = initialControlState(machine);
    const frame: WorkflowFrameState = {
      workflowId: workflow.id,
      workflowInstanceId: 'root',
      stateId: initial.stateId,
      visits: { [initial.stateId]: 1 },
      lastDecisionAt: createdAt,
    };
    const controlState: RuntimeControlState = { schemaVersion: 1, frames: [frame] };
    const run: StoredRun = {
      runId: request.runId,
      harnessId: this.harness.manifest.id,
      rootWorkflowId: workflow.id,
      status: 'running',
      input,
      definitionHash: this.harness.definitionHash,
      executionEngineMajor: 5,
      controlState,
      createdAt,
      updatedAt: createdAt,
    };
    this.store.createRun(run);
    return run;
  }

  async drive(runId: string, signal: AbortSignal = new AbortController().signal): Promise<StoredRun> {
    let run = this.requireRun(runId);
    while (run.status === 'running') {
      if (signal.aborted) {
        return this.failRun(run, { code: 'cancelled', message: 'Run drive was cancelled' });
      }
      const frame = run.controlState.frames.at(-1);
      if (!frame) throw new Error(`Run '${runId}' has no workflow frame`);
      const workflow = this.requireWorkflow(frame.workflowId);
      const state = workflow.states[frame.stateId];
      if (!state) throw new Error(`Workflow '${workflow.id}' has no state '${frame.stateId}'`);

      if (state.final) {
        run = await this.finishFinalState(run, frame, workflow, state);
        continue;
      }

      if (!state.invoke) {
        // T-011 owns persistent waiting status and accepted external events.
        return run;
      }

      let outcome: StepOutcome;
      try {
        outcome = await this.executeStep(run, frame, state, signal);
      } catch (error) {
        if (error instanceof StepLimitError) {
          return this.failRun(run, {
            code: 'step_limit_exceeded',
            message: `Run exceeded maxSteps=${this.harness.manifest.limits.maxSteps}`,
          });
        }
        return this.failRun(run, normalizeStepError(state.invoke.kind, error));
      }

      const routes = outcome.routeClass === 'done' ? state.done : state.error;
      const routeScope = this.buildRouteScope(run, frame, outcome);
      let selection;
      try {
        selection = await this.routeEvaluator.select(
          state.id,
          outcome.routeClass,
          routes,
          routeScope,
          outcome.logicalTime,
        );
      } catch (error) {
        const normalized: HarnessError = {
          code: 'expression_error',
          message: error instanceof Error ? error.message : String(error),
        };
        return this.failRun(run, normalized);
      }

      const transition = transitionControlState(
        this.requireMachine(workflow.id),
        frame.stateId,
        selection,
      );
      const nextVisits = { ...frame.visits };
      nextVisits[transition.stateId] = (nextVisits[transition.stateId] ?? 0) + 1;
      const nextFrame: WorkflowFrameState = {
        ...frame,
        stateId: transition.stateId,
        visits: nextVisits,
        lastDecisionAt: outcome.logicalTime,
      };
      const nextFrames = [...run.controlState.frames];
      nextFrames[nextFrames.length - 1] = nextFrame;
      const updatedAt = this.now().toISOString();
      this.store.updateRun(run.runId, {
        controlState: { schemaVersion: 1, frames: nextFrames },
        updatedAt,
      });
      run = this.requireRun(run.runId);
    }
    return run;
  }

  private async executeStep(
    run: StoredRun,
    frame: WorkflowFrameState,
    state: StateAst,
    signal: AbortSignal,
  ): Promise<StepOutcome> {
    const invoke = state.invoke;
    if (!invoke) throw new Error('executeStep requires an invoke state');
    const visit = frame.visits[state.id] ?? 1;
    const identity: StepIdentity = {
      runId: run.runId,
      workflowInstanceId: frame.workflowInstanceId,
      stateId: state.id,
      visit,
    };

    let step = this.store.getStep(identity);
    if (step?.kind !== undefined && step.kind !== invoke.kind) {
      throw new Error(`journal kind mismatch for ${state.id}#${visit}`);
    }

    if (step?.status === 'completed') {
      return {
        routeClass: 'done',
        logicalTime: step.startedAt,
        output: (step.output ?? null) as JsonValue,
      };
    }
    if (step?.status === 'failed') {
      return {
        routeClass: 'error',
        logicalTime: step.startedAt,
        error: step.error ?? normalizeStepError(invoke.kind, new Error('persisted Step failed without error')),
      };
    }

    if (step?.status === 'started' && invoke.kind === 'tool' && invoke.ref) {
      if (this.tools.effectOf(invoke.ref) === 'non-idempotent') {
        const error: HarnessError = {
          code: 'interrupted',
          message: `Non-idempotent Tool '${invoke.ref}' was interrupted after it started`,
        };
        this.store.completeStep(identity, {
          status: 'failed',
          completedAt: this.now().toISOString(),
          error,
        });
        return { routeClass: 'error', logicalTime: step.startedAt, error };
      }
    }

    let attempt = 1;
    let logicalTime: string;
    let input: JsonValue;

    if (!step) {
      if (countExecutableSteps(this.store, run.runId) >= this.harness.manifest.limits.maxSteps) {
        throw new StepLimitError();
      }
      logicalTime = this.now().toISOString();
      const baseScope = this.buildBaseScope(run, frame);
      input = state.invoke.input
        ? await this.expressions.evaluate(state.invoke.input, baseScope, logicalTime)
        : this.frameInput(run, frame);
      const idempotencyKey = deriveIdempotencyKey(identity);
      this.store.insertStartedStep({
        ...identity,
        kind: invoke.kind,
        attempt,
        startedAt: logicalTime,
        input,
        idempotencyKey,
      });
      step = this.store.getStep(identity);
      if (!step) throw new Error('Step was not persisted after insert');
    } else {
      logicalTime = step.startedAt;
      input = (step.input ?? this.frameInput(run, frame)) as JsonValue;
      if (invoke.kind !== 'workflow') {
        step = incrementStartedAttempt(this.store, identity);
      }
      attempt = step.attempt;
    }

    const expressionScope = this.buildExpressionStepScope(run, frame, input);
    try {
      const output = await this.dispatcher.execute({
        invoke,
        input,
        expressionScope,
        harnessRoot: this.harness.root,
        runId: run.runId,
        workflowInstanceId: frame.workflowInstanceId,
        stateId: state.id,
        visit,
        attempt,
        idempotencyKey: step.idempotencyKey,
        startedAt: logicalTime,
        signal,
      });
      const committed = this.store.completeStep(identity, {
        status: 'completed',
        completedAt: this.now().toISOString(),
        output,
      });
      if (!committed) {
        const terminal = this.store.getStep(identity);
        if (terminal?.status === 'completed') {
          return {
            routeClass: 'done',
            logicalTime: terminal.startedAt,
            output: (terminal.output ?? null) as JsonValue,
          };
        }
        throw new Error('Step completion lost journal race');
      }
      return { routeClass: 'done', logicalTime, output };
    } catch (error) {
      const normalized = normalizeStepError(invoke.kind, error);
      this.store.completeStep(identity, {
        status: 'failed',
        completedAt: this.now().toISOString(),
        error: normalized,
      });
      return { routeClass: 'error', logicalTime, error: normalized };
    }
  }

  private async finishFinalState(
    run: StoredRun,
    frame: WorkflowFrameState,
    workflow: WorkflowAst,
    state: StateAst,
  ): Promise<StoredRun> {
    if (state.id === 'failed') {
      return this.failRun(run, latestFrameError(this.store, run.runId, frame.workflowInstanceId));
    }

    let output: JsonValue | undefined;
    if (workflow.output) {
      try {
        output = await this.expressions.evaluate(
          workflow.output,
          this.buildBaseScope(run, frame),
          frame.lastDecisionAt,
        );
      } catch (error) {
        const normalized: HarnessError = error instanceof ExpressionRuntimeError
          ? { code: error.code, message: error.message }
          : { code: 'expression_error', message: error instanceof Error ? error.message : String(error) };
        return this.failRun(run, normalized);
      }
    }

    const updatedAt = this.now().toISOString();
    this.store.updateRun(run.runId, {
      status: 'completed',
      ...(output !== undefined ? { output } : {}),
      clearError: true,
      updatedAt,
    });
    return this.requireRun(run.runId);
  }

  private failRun(run: StoredRun, error?: HarnessError): StoredRun {
    const updatedAt = this.now().toISOString();
    this.store.updateRun(run.runId, {
      status: 'failed',
      ...(error ? { error } : {}),
      updatedAt,
    });
    return this.requireRun(run.runId);
  }

  private buildBaseScope(run: StoredRun, frame: WorkflowFrameState): BaseScope {
    return {
      input: this.frameInput(run, frame),
      steps: latestCompletedOutputs(this.store, run.runId, frame.workflowInstanceId),
      run: { visits: { ...frame.visits } },
    };
  }

  private buildExpressionStepScope(
    run: StoredRun,
    frame: WorkflowFrameState,
    stepInput: JsonValue,
  ): JsonValue {
    return { ...this.buildBaseScope(run, frame), input: stepInput };
  }

  private buildRouteScope(run: StoredRun, frame: WorkflowFrameState, outcome: StepOutcome): RouteScope {
    return {
      ...this.buildBaseScope(run, frame),
      ...(outcome.output !== undefined ? { output: outcome.output } : {}),
      ...(outcome.error ? { error: outcome.error } : {}),
    };
  }

  private frameInput(run: StoredRun, frame: WorkflowFrameState): JsonValue {
    if (frame.workflowInstanceId !== 'root') {
      throw new Error('Child frame input resolution belongs to T-010');
    }
    return run.input as JsonValue;
  }

  private requireRun(runId: string): StoredRun {
    const run = this.store.getRun(runId);
    if (!run) throw new Error(`Run '${runId}' does not exist`);
    return run;
  }

  private requireWorkflow(workflowId: string): WorkflowAst {
    const workflow = this.harness.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow '${workflowId}' is not loaded`);
    return workflow;
  }

  private requireMachine(workflowId: string): ReturnType<typeof compileControlMachine> {
    const machine = this.machines.get(workflowId);
    if (!machine) throw new Error(`Workflow '${workflowId}' has no compiled control machine`);
    return machine;
  }
}

class StepLimitError extends Error {}
