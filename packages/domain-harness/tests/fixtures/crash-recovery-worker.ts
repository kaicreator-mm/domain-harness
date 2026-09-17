import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

import type { AIOperationPort } from '../../src/contracts/ai.js';
import { ExpressionRuntime } from '../../src/expression/expression-runtime.js';
import { ToolRegistry } from '../../src/execution/tool-registry.js';
import type { LoadedHarness, WorkflowAst } from '../../src/loader/ast.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import type {
  RunUpdate,
  StartedStep,
  StepIdentity,
  StepResultUpdate,
} from '../../src/persistence/types.js';
import { RecoveryLifecycle } from '../../src/recovery/recovery-lifecycle.js';
import { RunCoordinator, RunLifecycle } from '../../src/runner/index.js';

function requireArg(value: string | undefined, name: string): string {
  if (!value) throw new Error(`missing required argument '${name}'`);
  return value;
}

const argList = process.argv.slice(2);
const phase = requireArg(argList[0], 'phase');
const scenario = requireArg(argList[1], 'scenario');
const dbPath = requireArg(argList[2], 'db');
const markerPath = requireArg(argList[3], 'marker');
const resultPath = requireArg(argList[4], 'result');

const RUN_ID = 'process-crash-run';
const ai: AIOperationPort = { async execute(request) { return request.input; } };

const SCENARIOS = [
  'after-started-idempotent',
  'after-started-non-idempotent',
  'after-completed',
  'after-child-frame-push',
  'after-child-step-completed',
  'terminal-child-frame',
  'after-event-accepted',
  'cancel-while-executing',
] as const;

type Scenario = typeof SCENARIOS[number];

if (!SCENARIOS.includes(scenario as Scenario)) {
  throw new Error(`unknown scenario '${scenario}'`);
}

const typedScenario = scenario as Scenario;

function toolWorkflow(): WorkflowAst {
  return {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    output: 'steps.work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'tool', ref: 'external' },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

function waitingWorkflow(): WorkflowAst {
  return {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    output: 'steps.pause',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'tool', ref: 'external' },
        done: [{ target: 'pause' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      pause: {
        id: 'pause',
        final: false,
        done: [],
        error: [],
        events: {
          go: { routes: [{ target: 'ok' }] },
        },
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

function parentOfChildWorkflow(): WorkflowAst {
  return {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    output: 'steps.work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'workflow', ref: 'child' },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

function toolChildWorkflow(): WorkflowAst {
  return {
    id: 'child',
    sourcePath: 'child.yaml',
    initial: 'calc',
    output: 'steps.calc',
    states: {
      calc: {
        id: 'calc',
        final: false,
        invoke: { kind: 'tool', ref: 'external' },
        done: [{ target: 'kok' }],
        error: [{ target: 'kfailed' }],
        events: {},
      },
      kok: { id: 'kok', final: true, done: [], error: [], events: {} },
      kfailed: { id: 'kfailed', final: true, done: [], error: [], events: {} },
    },
  };
}

function scenarioWorkflows(): WorkflowAst[] {
  if (
    typedScenario === 'after-child-frame-push'
    || typedScenario === 'after-child-step-completed'
    || typedScenario === 'terminal-child-frame'
  ) {
    return [parentOfChildWorkflow(), toolChildWorkflow()];
  }
  if (typedScenario === 'after-event-accepted') return [waitingWorkflow()];
  return [toolWorkflow()];
}

function loadedHarness(): LoadedHarness {
  const workflows = scenarioWorkflows();
  return {
    root: process.cwd(),
    manifest: { schemaVersion: '0.1', id: 'process-crash-test', limits: { maxSteps: 100 } },
    workflows: new Map(workflows.map((workflow) => [workflow.id, workflow])),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(workflows.map((workflow) => [
      workflow.id,
      Object.values(workflow.states)
        .filter((state) => state.invoke?.kind === 'workflow' && state.invoke.ref)
        .map((state) => state.invoke?.ref ?? ''),
    ])),
    definitionHash: 'process-crash-definition',
  };
}

class CrashStore extends SqliteStore {
  constructor(path: string) {
    super({ path });
  }

  override insertStartedStep(step: StartedStep): void {
    super.insertStartedStep(step);
    if (
      step.kind === 'tool'
      && step.workflowInstanceId === 'root'
      && (typedScenario === 'after-started-idempotent' || typedScenario === 'after-started-non-idempotent')
    ) {
      process.kill(process.pid, 'SIGKILL');
    }
  }

  override completeStep(identity: StepIdentity, update: StepResultUpdate): boolean {
    const committed = super.completeStep(identity, update);
    if (!committed) return false;
    if (typedScenario === 'after-completed' && identity.workflowInstanceId === 'root' && identity.stateId === 'work') {
      process.kill(process.pid, 'SIGKILL');
    }
    if (typedScenario === 'after-child-step-completed' && identity.workflowInstanceId === 'root/work#1') {
      process.kill(process.pid, 'SIGKILL');
    }
    if (typedScenario === 'after-event-accepted' && identity.stateId === 'pause') {
      process.kill(process.pid, 'SIGKILL');
    }
    return true;
  }

  override updateRun(runId: string, update: RunUpdate): boolean {
    const committed = super.updateRun(runId, update);
    if (
      committed
      && typedScenario === 'after-child-frame-push'
      && update.controlState
      && update.controlState.frames.length === 2
    ) {
      process.kill(process.pid, 'SIGKILL');
    }
    if (
      committed
      && typedScenario === 'terminal-child-frame'
      && update.controlState
      && update.controlState.frames.length === 2
      && update.controlState.frames[update.controlState.frames.length - 1]?.stateId === 'kok'
    ) {
      process.kill(process.pid, 'SIGKILL');
    }
    if (committed && typedScenario === 'cancel-while-executing' && update.status === 'cancelled') {
      process.kill(process.pid, 'SIGKILL');
    }
    return committed;
  }
}

function toolRegistry(): ToolRegistry {
  const tools = new ToolRegistry();
  if (typedScenario === 'cancel-while-executing') {
    tools.register('external', {
      effect: 'none',
      async execute(_input, context) {
        appendFileSync(markerPath, `${context.attempt}:${context.idempotencyKey}\n`, 'utf8');
        await new Promise<void>((resolve) => {
          context.signal.addEventListener('abort', () => resolve(), { once: true });
        });
        return { late: true };
      },
    });
    return tools;
  }
  const effect = typedScenario === 'after-started-non-idempotent'
    ? 'non-idempotent'
    : typedScenario === 'after-started-idempotent'
      ? 'idempotent'
      : 'none';
  tools.register('external', {
    effect,
    async execute(_input, context) {
      appendFileSync(markerPath, `${context.attempt}:${context.idempotencyKey}\n`, 'utf8');
      return { attempt: context.attempt };
    },
  });
  return tools;
}

function runtime(store: SqliteStore) {
  const harness = loadedHarness();
  const expressions = new ExpressionRuntime();
  const tools = toolRegistry();
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 8, 17, 5, 0, tick++));
  const coordinator = new RunCoordinator({ harness, store, tools, ai, expressions, now });
  const lifecycle = new RunLifecycle({
    harness,
    store,
    coordinator,
    expressions,
    now,
    runIdFactory: () => RUN_ID,
    waitPollMs: 1,
  });
  return {
    store,
    lifecycle,
    recovery: new RecoveryLifecycle({ harness, store, lifecycle }),
  };
}

function resumeStepIdentity(): { runId: string; workflowInstanceId: string; stateId: string; visit: number } {
  if (
    typedScenario === 'after-child-frame-push'
    || typedScenario === 'after-child-step-completed'
    || typedScenario === 'terminal-child-frame'
  ) {
    return { runId: RUN_ID, workflowInstanceId: 'root/work#1', stateId: 'calc', visit: 1 };
  }
  if (typedScenario === 'after-event-accepted') {
    return { runId: RUN_ID, workflowInstanceId: 'root', stateId: 'pause', visit: 1 };
  }
  return { runId: RUN_ID, workflowInstanceId: 'root', stateId: 'work', visit: 1 };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 500 && !predicate(); attempt += 1) {
    await sleep(10);
  }
}

if (phase === 'crash') {
  const store = new CrashStore(dbPath);
  const app = runtime(store);
  await app.recovery.start({ workflowId: 'main', input: { scenario: typedScenario } });
  if (typedScenario === 'after-event-accepted') {
    await waitFor(() => store.getRun(RUN_ID)?.status === 'waiting');
    await app.lifecycle.send(RUN_ID, { type: 'go', payload: { accepted: true } });
  }
  if (typedScenario === 'cancel-while-executing') {
    await waitFor(() => existsSync(markerPath));
    await app.lifecycle.cancel(RUN_ID);
  }
  // A crash scenario should terminate before this line.
  writeFileSync(resultPath, JSON.stringify({ unexpectedSurvival: true }), 'utf8');
  process.exitCode = 2;
} else if (phase === 'resume') {
  const store = new SqliteStore({ path: dbPath });
  const app = runtime(store);
  let resumeError: string | undefined;
  let run;
  let atomicitySnapshot: { status: string | undefined; stepExists: boolean } | undefined;
  try {
    run = await app.recovery.resume(RUN_ID);
  } catch (error) {
    resumeError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    run = store.getRun(RUN_ID) ?? undefined;
    if (typedScenario === 'after-event-accepted') {
      atomicitySnapshot = {
        status: run?.status,
        stepExists: store.getStep(resumeStepIdentity()) !== null,
      };
      run = await app.lifecycle.send(RUN_ID, { type: 'go', payload: { accepted: true } });
    }
  }
  const step = store.getStep(resumeStepIdentity());
  writeFileSync(resultPath, JSON.stringify({ run, step, resumeError, atomicitySnapshot }), 'utf8');
  store.close();
} else {
  throw new Error(`unknown phase '${phase}'`);
}
