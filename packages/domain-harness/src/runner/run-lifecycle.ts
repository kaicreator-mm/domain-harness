import { randomUUID } from 'node:crypto';

import type {
  DomainHarness,
  ExternalEvent,
  HarnessRun,
  ListRunsQuery,
  StartRunRequest,
  WaitOptions,
} from '../contracts/runtime.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import {
  compileControlMachine,
  transitionControlState,
  type RouteSelection,
} from '../compiler/control-machine.js';
import { ExpressionRuntime } from '../expression/expression-runtime.js';
import { SchemaValidator } from '../execution/schema-validator.js';
import type { LoadedHarness, RouteAst, WorkflowAst } from '../loader/ast.js';
import { SqliteStore } from '../persistence/sqlite-store.js';
import type { StepIdentity, StoredRun, WorkflowFrameState } from '../persistence/types.js';
import { deriveIdempotencyKey, latestCompletedOutputs } from './journal.js';
import { RunCoordinator } from './run-coordinator.js';

export type RunLifecycleErrorReason =
  | 'run_not_found'
  | 'not_waiting'
  | 'event_not_declared'
  | 'event_route_unmatched'
  | 'wait_timeout'
  | 'wait_aborted';

export class RunLifecycleError extends Error {
  readonly reason: RunLifecycleErrorReason;

  constructor(reason: RunLifecycleErrorReason, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RunLifecycleError';
    this.reason = reason;
  }
}

export interface RunLifecycleOptions {
  harness: LoadedHarness;
  store: SqliteStore;
  coordinator: RunCoordinator;
  expressions?: ExpressionRuntime;
  now?: () => Date;
  runIdFactory?: () => string;
  waitPollMs?: number;
}

interface EventRouteScope extends JsonObject {
  input: JsonValue;
  steps: Record<string, JsonValue>;
  run: { visits: Record<string, number> };
  event: { type: string; payload: JsonValue };
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/**
 * Owns the public Run lifecycle around the lower-level RunCoordinator.
 *
 * T-011 deliberately keeps long external execution outside the per-Run mutation
 * queue. `send`/`cancel` mutations serialize, while SQLite terminal fencing makes
 * cancellation authoritative over any late executor completion.
 */
export class RunLifecycle implements DomainHarness {
  private readonly harness: LoadedHarness;
  private readonly store: SqliteStore;
  private readonly coordinator: RunCoordinator;
  private readonly expressions: ExpressionRuntime;
  private readonly schemaValidator = new SchemaValidator();
  private readonly machines = new Map<string, ReturnType<typeof compileControlMachine>>();
  private readonly now: () => Date;
  private readonly runIdFactory: () => string;
  private readonly waitPollMs: number;
  private readonly activeDrives = new Map<string, Promise<StoredRun>>();
  private readonly activeControllers = new Map<string, AbortController>();
  private readonly mutationTails = new Map<string, Promise<void>>();

  constructor(options: RunLifecycleOptions) {
    this.harness = options.harness;
    this.store = options.store;
    this.coordinator = options.coordinator;
    this.expressions = options.expressions ?? new ExpressionRuntime();
    this.now = options.now ?? (() => new Date());
    this.runIdFactory = options.runIdFactory ?? randomUUID;
    this.waitPollMs = options.waitPollMs ?? 10;
    if (!Number.isInteger(this.waitPollMs) || this.waitPollMs < 1) {
      throw new TypeError('waitPollMs must be a positive integer');
    }

    for (const [workflowId, workflow] of this.harness.workflows) {
      this.machines.set(workflowId, compileControlMachine(workflow));
    }
  }

  async start(request: StartRunRequest): Promise<HarnessRun> {
    const run = this.coordinator.createRootRun({
      runId: this.runIdFactory(),
      workflowId: request.workflowId,
      input: request.input,
    });
    void this.ensureDrive(run.runId).catch(() => undefined);
    return toHarnessRun(run);
  }

  async send(runId: string, event: ExternalEvent): Promise<HarnessRun> {
    await this.serializeMutation(runId, async () => {
      const run = this.requireRun(runId);
      if (run.status !== 'waiting') {
        throw new RunLifecycleError(
          'not_waiting',
          `Run '${runId}' is '${run.status}', not waiting`,
        );
      }

      const frame = this.requireActiveFrame(run);
      const workflow = this.requireWorkflow(frame.workflowId);
      const state = workflow.states[frame.stateId];
      if (!state || state.final || state.invoke) {
        throw new RunLifecycleError(
          'not_waiting',
          `Run '${runId}' does not point at a waiting state`,
        );
      }

      const declaration = state.events[event.type];
      if (!declaration) {
        throw new RunLifecycleError(
          'event_not_declared',
          `Event '${event.type}' is not declared by waiting state '${state.id}'`,
        );
      }

      const payload = event.payload === undefined
        ? null
        : this.schemaValidator.validate(
            declaration.schema,
            event.payload,
            'invalid_input',
            `External event '${event.type}' payload`,
          );
      const acceptedAt = this.now().toISOString();
      const scope = this.buildEventRouteScope(run, frame, event.type, payload);
      const selection = await this.selectEventRoute(
        state.id,
        event.type,
        declaration.routes,
        scope,
        acceptedAt,
      );
      const transition = transitionControlState(
        this.requireMachine(workflow.id),
        state.id,
        selection,
      );

      const visit = frame.visits[state.id] ?? 1;
      const identity: StepIdentity = {
        runId,
        workflowInstanceId: frame.workflowInstanceId,
        stateId: state.id,
        visit,
      };
      if (this.store.getStep(identity)) {
        throw new Error(`Waiting event journal already exists for '${state.id}#${visit}'`);
      }

      const nextVisits = { ...frame.visits };
      nextVisits[transition.stateId] = (nextVisits[transition.stateId] ?? 0) + 1;
      const nextFrame: WorkflowFrameState = {
        ...frame,
        stateId: transition.stateId,
        visits: nextVisits,
        lastDecisionAt: acceptedAt,
      };
      const nextFrames = [...run.controlState.frames];
      nextFrames[nextFrames.length - 1] = nextFrame;

      this.store.transaction(() => {
        this.store.insertStartedStep({
          ...identity,
          kind: 'event',
          attempt: 1,
          startedAt: acceptedAt,
          input: { type: event.type, payload },
          idempotencyKey: deriveIdempotencyKey(identity),
        });
        const completed = this.store.completeStep(identity, {
          status: 'completed',
          completedAt: acceptedAt,
          output: payload,
        });
        if (!completed) throw new Error('Accepted event journal could not be completed');

        const updated = this.store.updateRun(runId, {
          status: 'running',
          clearError: true,
          controlState: { schemaVersion: 1, frames: nextFrames },
          updatedAt: acceptedAt,
        });
        if (!updated) throw new Error(`Run '${runId}' changed while accepting event`);
      });
    });

    return toHarnessRun(await this.ensureDrive(runId));
  }

  async wait(runId: string, options: WaitOptions = {}): Promise<HarnessRun> {
    const timeoutMs = options.timeoutMs;
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
      throw new TypeError('wait timeoutMs must be a non-negative finite number');
    }
    const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;

    for (;;) {
      if (options.signal?.aborted) {
        throw new RunLifecycleError('wait_aborted', `wait('${runId}') was aborted`);
      }
      const run = this.requireRun(runId);
      if (run.status === 'waiting' || TERMINAL_STATUSES.has(run.status)) {
        return toHarnessRun(run);
      }
      if (deadline !== undefined && Date.now() >= deadline) {
        throw new RunLifecycleError('wait_timeout', `wait('${runId}') timed out`);
      }

      const remaining = deadline === undefined
        ? this.waitPollMs
        : Math.max(1, Math.min(this.waitPollMs, deadline - Date.now()));
      await sleep(remaining, options.signal);
    }
  }

  async resume(runId: string): Promise<HarnessRun> {
    const run = this.requireRun(runId);
    if (run.status === 'waiting' || TERMINAL_STATUSES.has(run.status)) {
      return toHarnessRun(run);
    }
    return toHarnessRun(await this.ensureDrive(runId));
  }

  async cancel(runId: string): Promise<HarnessRun> {
    return this.serializeMutation(runId, async () => {
      const run = this.requireRun(runId);
      if (TERMINAL_STATUSES.has(run.status)) return toHarnessRun(run);

      const updatedAt = this.now().toISOString();
      const updated = this.store.updateRun(runId, {
        status: 'cancelled',
        error: { code: 'cancelled', message: 'Run was cancelled' },
        updatedAt,
      });
      if (!updated) return toHarnessRun(this.requireRun(runId));

      // Persist terminal cancellation before notifying external/worker execution.
      this.activeControllers.get(runId)?.abort();
      return toHarnessRun(this.requireRun(runId));
    });
  }

  async get(runId: string): Promise<HarnessRun | null> {
    const run = this.store.getRun(runId);
    return run ? toHarnessRun(run) : null;
  }

  async listRuns(query: ListRunsQuery = {}): Promise<HarnessRun[]> {
    return this.store.listRuns(query).map(toHarnessRun);
  }

  private ensureDrive(runId: string): Promise<StoredRun> {
    const active = this.activeDrives.get(runId);
    if (active) return active;

    const controller = new AbortController();
    this.activeControllers.set(runId, controller);
    const promise = (async () => {
      const current = this.requireRun(runId);
      if (current.status !== 'running') return current;
      const driven = await this.coordinator.drive(runId, controller.signal);
      return this.persistWaitingBoundary(driven);
    })();
    this.activeDrives.set(runId, promise);

    void promise.finally(() => {
      if (this.activeDrives.get(runId) === promise) this.activeDrives.delete(runId);
      if (this.activeControllers.get(runId) === controller) this.activeControllers.delete(runId);
    }).catch(() => undefined);
    return promise;
  }

  private persistWaitingBoundary(run: StoredRun): StoredRun {
    if (run.status !== 'running') return run;
    const frame = this.requireActiveFrame(run);
    const workflow = this.requireWorkflow(frame.workflowId);
    const state = workflow.states[frame.stateId];
    if (!state || state.final || state.invoke) return run;

    const updated = this.store.updateRun(run.runId, {
      status: 'waiting',
      updatedAt: this.now().toISOString(),
    });
    return updated ? this.requireRun(run.runId) : this.requireRun(run.runId);
  }

  private async selectEventRoute(
    sourceStateId: string,
    eventType: string,
    routes: readonly RouteAst[],
    scope: EventRouteScope,
    logicalTime: string,
  ): Promise<RouteSelection> {
    for (const [routeIndex, route] of routes.entries()) {
      if (!route.when) {
        return { sourceStateId, routeClass: 'event', routeIndex, eventType };
      }
      if (await this.expressions.evaluateBoolean(route.when, scope, logicalTime)) {
        return { sourceStateId, routeClass: 'event', routeIndex, eventType };
      }
    }
    throw new RunLifecycleError(
      'event_route_unmatched',
      `No matching route for event '${eventType}' from state '${sourceStateId}'`,
    );
  }

  private buildEventRouteScope(
    run: StoredRun,
    frame: WorkflowFrameState,
    eventType: string,
    payload: JsonValue,
  ): EventRouteScope {
    return {
      input: this.frameInput(run, frame),
      steps: latestCompletedOutputs(this.store, run.runId, frame.workflowInstanceId),
      run: { visits: { ...frame.visits } },
      event: { type: eventType, payload },
    };
  }

  private frameInput(run: StoredRun, frame: WorkflowFrameState): JsonValue {
    if (frame.workflowInstanceId === 'root') return run.input as JsonValue;

    const frameIndex = run.controlState.frames.findIndex(
      (candidate) => candidate.workflowInstanceId === frame.workflowInstanceId,
    );
    if (frameIndex <= 0) throw new Error(`Child frame '${frame.workflowInstanceId}' has no parent`);
    const parentFrame = run.controlState.frames[frameIndex - 1];
    if (!parentFrame) throw new Error('Child Workflow parent frame disappeared');
    const parentVisit = parentFrame.visits[parentFrame.stateId] ?? 0;
    const parentStep = this.store.getStep({
      runId: run.runId,
      workflowInstanceId: parentFrame.workflowInstanceId,
      stateId: parentFrame.stateId,
      visit: parentVisit,
    });
    if (!parentStep || parentStep.kind !== 'workflow' || parentStep.input === undefined) {
      throw new Error(`Child frame '${frame.workflowInstanceId}' cannot recover parent input`);
    }
    return parentStep.input as JsonValue;
  }

  private requireRun(runId: string): StoredRun {
    const run = this.store.getRun(runId);
    if (!run) throw new RunLifecycleError('run_not_found', `Run '${runId}' does not exist`);
    return run;
  }

  private requireActiveFrame(run: StoredRun): WorkflowFrameState {
    const frame = run.controlState.frames.at(-1);
    if (!frame) throw new Error(`Run '${run.runId}' has no active Workflow frame`);
    return frame;
  }

  private requireWorkflow(workflowId: string): WorkflowAst {
    const workflow = this.harness.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow '${workflowId}' is not loaded`);
    return workflow;
  }

  private requireMachine(workflowId: string): ReturnType<typeof compileControlMachine> {
    const machine = this.machines.get(workflowId);
    if (!machine) throw new Error(`Workflow '${workflowId}' has no control machine`);
    return machine;
  }

  private async serializeMutation<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.mutationTails.get(runId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => gate, () => gate);
    this.mutationTails.set(runId, tail);

    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.mutationTails.get(runId) === tail) this.mutationTails.delete(runId);
    }
  }
}

export function toHarnessRun(run: StoredRun): HarnessRun {
  return {
    runId: run.runId,
    harnessId: run.harnessId,
    workflowId: run.rootWorkflowId,
    status: run.status,
    input: run.input,
    ...(run.output !== undefined ? { output: run.output } : {}),
    ...(run.error !== undefined ? { error: run.error } : {}),
    definitionHash: run.definitionHash,
    executionEngineMajor: run.executionEngineMajor,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new RunLifecycleError('wait_aborted', 'wait was aborted');
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RunLifecycleError('wait_aborted', 'wait was aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
