import { compileControlMachine, initialControlState, transitionControlState, } from '../compiler/control-machine.js';
import { ExpressionRuntime, ExpressionRuntimeError } from '../expression/expression-runtime.js';
import { SkillExecutor, ToolRegistry } from '../execution/index.js';
import { assertPortableJson } from '../execution/schema-validator.js';
import { SqliteStore } from '../persistence/sqlite-store.js';
import { ScriptExecutor } from '../script/index.js';
import { countExecutableSteps, deriveIdempotencyKey, incrementStartedAttempt, latestCompletedOutputs, latestFrameError, } from './journal.js';
import { RouteEvaluator } from './route-evaluator.js';
import { normalizeStepError, RunnerExecutionError, StepDispatcher, } from './step-dispatcher.js';
const DEFAULT_MAX_CHILD_WORKFLOW_DEPTH = 32;
export class RunCoordinator {
    harness;
    store;
    tools;
    expressions;
    routeEvaluator;
    dispatcher;
    machines = new Map();
    now;
    maxChildWorkflowDepth;
    constructor(options) {
        this.harness = options.harness;
        this.store = options.store;
        this.tools = options.tools;
        this.expressions = options.expressions ?? new ExpressionRuntime();
        const scripts = options.scripts ?? new ScriptExecutor();
        const skills = new SkillExecutor(options.ai);
        this.routeEvaluator = new RouteEvaluator(this.expressions);
        this.dispatcher = new StepDispatcher(this.expressions, scripts, this.tools, skills, (skillId) => this.harness.skills.get(skillId));
        this.now = options.now ?? (() => new Date());
        this.maxChildWorkflowDepth = options.maxChildWorkflowDepth ?? DEFAULT_MAX_CHILD_WORKFLOW_DEPTH;
        if (!Number.isInteger(this.maxChildWorkflowDepth) || this.maxChildWorkflowDepth < 1) {
            throw new TypeError('maxChildWorkflowDepth must be a positive integer');
        }
        for (const [workflowId, workflow] of this.harness.workflows) {
            this.machines.set(workflowId, compileControlMachine(workflow));
        }
    }
    createRootRun(request) {
        if (this.store.getRun(request.runId))
            throw new Error(`Run '${request.runId}' already exists`);
        const workflow = this.requireWorkflow(request.workflowId);
        assertPortableJson(request.input, 'invalid_input', 'Run input');
        const input = request.input;
        const createdAt = request.createdAt ?? this.now().toISOString();
        const machine = this.requireMachine(workflow.id);
        const initial = initialControlState(machine);
        const frame = {
            workflowId: workflow.id,
            workflowInstanceId: 'root',
            stateId: initial.stateId,
            visits: { [initial.stateId]: 1 },
            lastDecisionAt: createdAt,
        };
        const controlState = { schemaVersion: 1, frames: [frame] };
        const run = {
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
    async drive(runId, signal = new AbortController().signal) {
        let run = this.requireRun(runId);
        while (run.status === 'running') {
            if (signal.aborted) {
                return this.failRun(run, { code: 'cancelled', message: 'Run drive was cancelled' });
            }
            const frame = run.controlState.frames.at(-1);
            if (!frame)
                throw new Error(`Run '${runId}' has no workflow frame`);
            const workflow = this.requireWorkflow(frame.workflowId);
            const state = workflow.states[frame.stateId];
            if (!state)
                throw new Error(`Workflow '${workflow.id}' has no state '${frame.stateId}'`);
            if (state.final) {
                run = await this.finishFinalState(run, frame, workflow, state);
                continue;
            }
            if (!state.invoke) {
                // T-011 owns persistent waiting status and accepted external events.
                return run;
            }
            let execution;
            try {
                execution = await this.executeStep(run, frame, state, signal);
            }
            catch (error) {
                if (error instanceof StepLimitError) {
                    return this.failRun(run, {
                        code: 'step_limit_exceeded',
                        message: `Run exceeded maxSteps=${this.harness.manifest.limits.maxSteps}`,
                    });
                }
                const normalized = normalizeStepError(state.invoke.kind, error);
                if (frame.workflowInstanceId === 'root')
                    return this.failRun(run, normalized);
                run = this.failChildExecution(run, frame, normalized);
                continue;
            }
            if (execution.kind === 'child-active') {
                run = this.requireRun(run.runId);
                continue;
            }
            const outcome = execution.outcome;
            const routes = outcome.routeClass === 'done' ? state.done : state.error;
            const routeScope = this.buildRouteScope(run, frame, outcome);
            let selection;
            try {
                selection = await this.routeEvaluator.select(state.id, outcome.routeClass, routes, routeScope, outcome.logicalTime);
            }
            catch (error) {
                const normalized = {
                    code: 'expression_error',
                    message: error instanceof Error ? error.message : String(error),
                };
                if (frame.workflowInstanceId === 'root')
                    return this.failRun(run, normalized);
                run = this.failChildExecution(run, frame, normalized);
                continue;
            }
            const transition = transitionControlState(this.requireMachine(workflow.id), frame.stateId, selection);
            const nextVisits = { ...frame.visits };
            nextVisits[transition.stateId] = (nextVisits[transition.stateId] ?? 0) + 1;
            const nextFrame = {
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
    async executeStep(run, frame, state, signal) {
        const invoke = state.invoke;
        if (!invoke)
            throw new Error('executeStep requires an invoke state');
        const visit = frame.visits[state.id] ?? 1;
        const identity = {
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
                kind: 'outcome',
                outcome: {
                    routeClass: 'done',
                    logicalTime: step.startedAt,
                    output: (step.output ?? null),
                },
            };
        }
        if (step?.status === 'failed') {
            return {
                kind: 'outcome',
                outcome: {
                    routeClass: 'error',
                    logicalTime: step.startedAt,
                    error: step.error ?? normalizeStepError(invoke.kind, new Error('persisted Step failed without error')),
                },
            };
        }
        if (step?.status === 'started' && invoke.kind === 'tool' && invoke.ref) {
            if (this.tools.effectOf(invoke.ref) === 'non-idempotent') {
                const error = {
                    code: 'interrupted',
                    message: `Non-idempotent Tool '${invoke.ref}' was interrupted after it started`,
                };
                this.store.completeStep(identity, {
                    status: 'failed',
                    completedAt: this.now().toISOString(),
                    error,
                });
                return {
                    kind: 'outcome',
                    outcome: { routeClass: 'error', logicalTime: step.startedAt, error },
                };
            }
        }
        let attempt = 1;
        let logicalTime;
        let input;
        if (!step) {
            if (countExecutableSteps(this.store, run.runId) >= this.harness.manifest.limits.maxSteps) {
                throw new StepLimitError();
            }
            logicalTime = this.now().toISOString();
            const baseScope = this.buildBaseScope(run, frame);
            input = invoke.input
                ? await this.expressions.evaluate(invoke.input, baseScope, logicalTime)
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
            if (!step)
                throw new Error('Step was not persisted after insert');
        }
        else {
            logicalTime = step.startedAt;
            input = (step.input === undefined ? this.frameInput(run, frame) : step.input);
            if (invoke.kind !== 'workflow') {
                step = incrementStartedAttempt(this.store, identity);
            }
            attempt = step.attempt;
        }
        if (invoke.kind === 'workflow') {
            try {
                this.activateChildWorkflow(run, frame, state, step);
                return { kind: 'child-active' };
            }
            catch (error) {
                const normalized = normalizeStepError('workflow', error);
                const committed = this.store.completeStep(identity, {
                    status: 'failed',
                    completedAt: this.now().toISOString(),
                    error: normalized,
                });
                if (!committed) {
                    const terminal = this.store.getStep(identity);
                    if (terminal?.status === 'failed') {
                        return {
                            kind: 'outcome',
                            outcome: {
                                routeClass: 'error',
                                logicalTime: terminal.startedAt,
                                error: terminal.error ?? normalized,
                            },
                        };
                    }
                    throw new Error('Child Workflow activation lost journal race');
                }
                return {
                    kind: 'outcome',
                    outcome: { routeClass: 'error', logicalTime, error: normalized },
                };
            }
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
                        kind: 'outcome',
                        outcome: {
                            routeClass: 'done',
                            logicalTime: terminal.startedAt,
                            output: (terminal.output ?? null),
                        },
                    };
                }
                throw new Error('Step completion lost journal race');
            }
            return {
                kind: 'outcome',
                outcome: { routeClass: 'done', logicalTime, output },
            };
        }
        catch (error) {
            const normalized = normalizeStepError(invoke.kind, error);
            this.store.completeStep(identity, {
                status: 'failed',
                completedAt: this.now().toISOString(),
                error: normalized,
            });
            return {
                kind: 'outcome',
                outcome: { routeClass: 'error', logicalTime, error: normalized },
            };
        }
    }
    activateChildWorkflow(run, parentFrame, parentState, parentStep) {
        const targetWorkflowId = parentState.invoke?.ref;
        if (!targetWorkflowId) {
            throw new RunnerExecutionError('child_workflow_error', 'Workflow Step is missing child workflow ref');
        }
        const childWorkflow = this.harness.workflows.get(targetWorkflowId);
        if (!childWorkflow) {
            throw new RunnerExecutionError('child_workflow_error', `Child Workflow '${targetWorkflowId}' is not loaded in this Harness`);
        }
        const frames = run.controlState.frames;
        const top = frames.at(-1);
        if (!top || top.workflowInstanceId !== parentFrame.workflowInstanceId) {
            throw new RunnerExecutionError('child_workflow_error', 'Parent Workflow frame is not active');
        }
        if (frames.some((candidate) => candidate.workflowId === childWorkflow.id)) {
            throw new RunnerExecutionError('child_workflow_error', `Runtime recursion defence rejected active Workflow '${childWorkflow.id}'`);
        }
        const activeChildDepth = frames.length - 1;
        if (activeChildDepth >= this.maxChildWorkflowDepth) {
            throw new RunnerExecutionError('child_workflow_error', `Child Workflow depth exceeds internal limit ${this.maxChildWorkflowDepth}`);
        }
        const childWorkflowInstanceId = deriveChildWorkflowInstanceId(parentFrame.workflowInstanceId, parentState.id, parentStep.visit);
        if (frames.some((candidate) => candidate.workflowInstanceId === childWorkflowInstanceId)) {
            throw new RunnerExecutionError('child_workflow_error', `Child Workflow instance '${childWorkflowInstanceId}' is already active`);
        }
        const initial = initialControlState(this.requireMachine(childWorkflow.id));
        const childFrame = {
            workflowId: childWorkflow.id,
            workflowInstanceId: childWorkflowInstanceId,
            stateId: initial.stateId,
            visits: { [initial.stateId]: 1 },
            lastDecisionAt: parentStep.startedAt,
        };
        const updatedAt = this.now().toISOString();
        const updated = this.store.updateRun(run.runId, {
            controlState: {
                schemaVersion: 1,
                frames: [...frames, childFrame],
            },
            updatedAt,
        });
        if (!updated)
            throw new Error(`Run '${run.runId}' disappeared while pushing Child Workflow frame`);
    }
    async finishFinalState(run, frame, workflow, state) {
        if (frame.workflowInstanceId !== 'root') {
            return this.finishChildFinalState(run, frame, workflow, state);
        }
        if (state.id === 'failed') {
            return this.failRun(run, latestFrameError(this.store, run.runId, frame.workflowInstanceId));
        }
        let output;
        if (workflow.output) {
            try {
                output = await this.expressions.evaluate(workflow.output, this.buildBaseScope(run, frame), frame.lastDecisionAt);
            }
            catch (error) {
                const normalized = error instanceof ExpressionRuntimeError
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
    async finishChildFinalState(run, frame, workflow, state) {
        if (state.id === 'failed') {
            const cause = latestFrameError(this.store, run.runId, frame.workflowInstanceId);
            return this.completeAndPopChild(run, frame, undefined, this.childWorkflowError(workflow.id, frame.workflowInstanceId, cause));
        }
        if (!workflow.output) {
            return this.completeAndPopChild(run, frame, undefined, this.childWorkflowError(workflow.id, frame.workflowInstanceId, { code: 'child_workflow_error', message: 'Child Workflow has no output expression' }));
        }
        try {
            const output = await this.expressions.evaluate(workflow.output, this.buildBaseScope(run, frame), frame.lastDecisionAt);
            return this.completeAndPopChild(run, frame, output);
        }
        catch (error) {
            const cause = error instanceof ExpressionRuntimeError
                ? { code: error.code, message: error.message }
                : { code: 'expression_error', message: error instanceof Error ? error.message : String(error) };
            return this.completeAndPopChild(run, frame, undefined, this.childWorkflowError(workflow.id, frame.workflowInstanceId, cause));
        }
    }
    failChildExecution(run, frame, cause) {
        return this.completeAndPopChild(run, frame, undefined, this.childWorkflowError(frame.workflowId, frame.workflowInstanceId, cause));
    }
    completeAndPopChild(run, childFrame, output, error) {
        const frames = run.controlState.frames;
        const active = frames.at(-1);
        const parentFrame = frames.at(-2);
        if (!active || active.workflowInstanceId !== childFrame.workflowInstanceId || !parentFrame) {
            throw new Error('Child Workflow terminal reconciliation requires active child and parent frames');
        }
        const parentWorkflow = this.requireWorkflow(parentFrame.workflowId);
        const parentState = parentWorkflow.states[parentFrame.stateId];
        const parentVisit = parentFrame.visits[parentFrame.stateId] ?? 0;
        if (!parentState?.invoke || parentState.invoke.kind !== 'workflow' || parentVisit < 1) {
            throw new Error('Parent frame does not point at a valid Workflow Step');
        }
        if (parentState.invoke.ref !== childFrame.workflowId) {
            throw new Error(`Parent Workflow Step expected child '${parentState.invoke.ref}', active child is '${childFrame.workflowId}'`);
        }
        const parentIdentity = {
            runId: run.runId,
            workflowInstanceId: parentFrame.workflowInstanceId,
            stateId: parentFrame.stateId,
            visit: parentVisit,
        };
        const parentStep = this.store.getStep(parentIdentity);
        if (!parentStep || parentStep.kind !== 'workflow' || parentStep.status !== 'started') {
            throw new Error('Parent Workflow Step journal is not in started state during child reconciliation');
        }
        const completedAt = this.now().toISOString();
        this.store.transaction(() => {
            const committed = this.store.completeStep(parentIdentity, error
                ? { status: 'failed', completedAt, error }
                : { status: 'completed', completedAt, output: output ?? null });
            if (!committed)
                throw new Error('Parent Workflow Step terminal commit lost journal race');
            const updated = this.store.updateRun(run.runId, {
                controlState: {
                    schemaVersion: 1,
                    frames: frames.slice(0, -1),
                },
                updatedAt: completedAt,
            });
            if (!updated)
                throw new Error(`Run '${run.runId}' disappeared during child reconciliation`);
        });
        return this.requireRun(run.runId);
    }
    childWorkflowError(workflowId, workflowInstanceId, cause) {
        const details = {
            childWorkflowId: workflowId,
            childWorkflowInstanceId: workflowInstanceId,
        };
        if (cause) {
            const serializedCause = {
                code: cause.code,
                message: cause.message,
            };
            if (cause.details !== undefined)
                serializedCause.details = cause.details;
            details.cause = serializedCause;
        }
        return {
            code: 'child_workflow_error',
            message: `Child Workflow '${workflowId}' failed`,
            details,
        };
    }
    failRun(run, error) {
        const updatedAt = this.now().toISOString();
        this.store.updateRun(run.runId, {
            status: 'failed',
            ...(error ? { error } : {}),
            updatedAt,
        });
        return this.requireRun(run.runId);
    }
    buildBaseScope(run, frame) {
        return {
            input: this.frameInput(run, frame),
            steps: latestCompletedOutputs(this.store, run.runId, frame.workflowInstanceId),
            run: { visits: { ...frame.visits } },
        };
    }
    buildExpressionStepScope(run, frame, stepInput) {
        return { ...this.buildBaseScope(run, frame), input: stepInput };
    }
    buildRouteScope(run, frame, outcome) {
        return {
            ...this.buildBaseScope(run, frame),
            ...(outcome.output !== undefined ? { output: outcome.output } : {}),
            ...(outcome.error ? { error: outcome.error } : {}),
        };
    }
    frameInput(run, frame) {
        if (frame.workflowInstanceId === 'root')
            return run.input;
        const frameIndex = run.controlState.frames.findIndex((candidate) => candidate.workflowInstanceId === frame.workflowInstanceId);
        if (frameIndex <= 0) {
            throw new Error(`Child Workflow frame '${frame.workflowInstanceId}' has no persisted parent frame`);
        }
        const parentFrame = run.controlState.frames[frameIndex - 1];
        if (!parentFrame)
            throw new Error('Child Workflow parent frame disappeared');
        const parentVisit = parentFrame.visits[parentFrame.stateId] ?? 0;
        if (parentVisit < 1)
            throw new Error('Child Workflow parent visit is invalid');
        const parentStep = this.store.getStep({
            runId: run.runId,
            workflowInstanceId: parentFrame.workflowInstanceId,
            stateId: parentFrame.stateId,
            visit: parentVisit,
        });
        if (!parentStep || parentStep.kind !== 'workflow' || parentStep.input === undefined) {
            throw new Error(`Child Workflow '${frame.workflowInstanceId}' cannot recover its parent Step input`);
        }
        return parentStep.input;
    }
    requireRun(runId) {
        const run = this.store.getRun(runId);
        if (!run)
            throw new Error(`Run '${runId}' does not exist`);
        return run;
    }
    requireWorkflow(workflowId) {
        const workflow = this.harness.workflows.get(workflowId);
        if (!workflow)
            throw new Error(`Workflow '${workflowId}' is not loaded`);
        return workflow;
    }
    requireMachine(workflowId) {
        const machine = this.machines.get(workflowId);
        if (!machine)
            throw new Error(`Workflow '${workflowId}' has no compiled control machine`);
        return machine;
    }
}
export function deriveChildWorkflowInstanceId(parentWorkflowInstanceId, parentStateId, parentVisit) {
    if (!parentWorkflowInstanceId)
        throw new TypeError('parentWorkflowInstanceId must be non-empty');
    if (!parentStateId)
        throw new TypeError('parentStateId must be non-empty');
    if (!Number.isInteger(parentVisit) || parentVisit < 1) {
        throw new TypeError('parentVisit must be a positive integer');
    }
    return `${parentWorkflowInstanceId}/${parentStateId}#${parentVisit}`;
}
class StepLimitError extends Error {
}
//# sourceMappingURL=run-coordinator.js.map