import { appendFileSync, writeFileSync } from 'node:fs';

import type { AIOperationPort } from '../../src/contracts/ai.js';
import { ExpressionRuntime } from '../../src/expression/index.js';
import { ToolRegistry } from '../../src/execution/index.js';
import type { LoadedHarness, WorkflowAst } from '../../src/loader/ast.js';
import { SqliteStore } from '../../src/persistence/sqlite-store.js';
import type {
  StartedStep,
  StepIdentity,
  StepResultUpdate,
} from '../../src/persistence/types.js';
import { RecoveryLifecycle } from '../../src/recovery/index.js';
import { RunCoordinator, RunLifecycle } from '../../src/runner/index.js';

const [phase, scenario, dbPath, markerPath, resultPath] = process.argv.slice(2);
if (!phase || !scenario || !dbPath || !markerPath || !resultPath) {
  throw new Error('usage: crash-recovery-worker <phase> <scenario> <db> <marker> <result>');
}

const RUN_ID = 'process-crash-run';
const ai: AIOperationPort = { async execute(request) { return request.input; } };

type Scenario =
  | 'after-started-idempotent'
  | 'after-started-non-idempotent'
  | 'after-completed';

if (![
  'after-started-idempotent',
  'after-started-non-idempotent',
  'after-completed',
].includes(scenario)) {
  throw new Error(`unknown scenario '${scenario}'`);
}

const typedScenario = scenario as Scenario;

function workflow(): WorkflowAst {
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

function loadedHarness(): LoadedHarness {
  const root = workflow();
  return {
    root: process.cwd(),
    manifest: { schemaVersion: '0.1', id: 'process-crash-test', limits: { maxSteps: 100 } },
    workflows: new Map([[root.id, root]]),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map([[root.id, []]]),
    definitionHash: 'process-crash-definition',
  };
}

class CrashStore extends SqliteStore {
  constructor(path: string, private readonly point: Scenario) {
    super({ path });
  }

  override insertStartedStep(step: StartedStep): void {
    super.insertStartedStep(step);
    if (
      step.kind === 'tool'
      && (this.point === 'after-started-idempotent' || this.point === 'after-started-non-idempotent')
    ) {
      process.kill(process.pid, 'SIGKILL');
    }
  }

  override completeStep(identity: StepIdentity, update: StepResultUpdate): boolean {
    const committed = super.completeStep(identity, update);
    if (committed && this.point === 'after-completed') {
      process.kill(process.pid, 'SIGKILL');
    }
    return committed;
  }
}

function toolRegistry(): ToolRegistry {
  const tools = new ToolRegistry();
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
    recovery: new RecoveryLifecycle({ harness, store, lifecycle }),
  };
}

if (phase === 'crash') {
  const store = new CrashStore(dbPath, typedScenario);
  const app = runtime(store);
  await app.recovery.start({ workflowId: 'main', input: { scenario: typedScenario } });
  // A crash scenario should terminate before this line.
  writeFileSync(resultPath, JSON.stringify({ unexpectedSurvival: true }), 'utf8');
  process.exitCode = 2;
} else if (phase === 'resume') {
  const store = new SqliteStore({ path: dbPath });
  const app = runtime(store);
  const run = await app.recovery.resume(RUN_ID);
  const step = store.getStep({
    runId: RUN_ID,
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  });
  writeFileSync(resultPath, JSON.stringify({ run, step }), 'utf8');
  store.close();
} else {
  throw new Error(`unknown phase '${phase}'`);
}
