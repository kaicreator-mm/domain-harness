import assert from 'node:assert/strict';
import test from 'node:test';

import type { AIOperationPort } from '../src/contracts/ai.js';
import { ExpressionRuntime } from '../src/expression/index.js';
import { ToolRegistry } from '../src/execution/index.js';
import type { LoadedHarness, WorkflowAst } from '../src/loader/ast.js';
import { SqliteStore } from '../src/persistence/sqlite-store.js';
import {
  RecoveryCompatibilityError,
  RecoveryLifecycle,
} from '../src/recovery/index.js';
import {
  deriveIdempotencyKey,
  RunCoordinator,
  RunLifecycle,
} from '../src/runner/index.js';

const ai: AIOperationPort = { async execute(request) { return request.input; } };

function toolWorkflow(tool = 'work'): WorkflowAst {
  return {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    output: 'steps.work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'tool', ref: tool },
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
    initial: 'await_event',
    output: 'steps.await_event',
    states: {
      await_event: {
        id: 'await_event',
        final: false,
        done: [],
        error: [],
        events: {
          continue: { routes: [{ target: 'ok' }] },
        },
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

function harness(workflow: WorkflowAst, definitionHash = 'definition-a'): LoadedHarness {
  return {
    root: process.cwd(),
    manifest: { schemaVersion: '0.1', id: 'recovery-test', limits: { maxSteps: 100 } },
    workflows: new Map([[workflow.id, workflow]]),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map([[workflow.id, []]]),
    definitionHash,
  };
}

function lifecycleFor(
  loaded: LoadedHarness,
  store: SqliteStore,
  tools: ToolRegistry,
  runId = 'recovery-run',
) {
  const expressions = new ExpressionRuntime();
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 8, 17, 4, 0, tick++));
  const coordinator = new RunCoordinator({
    harness: loaded,
    store,
    tools,
    ai,
    expressions,
    now,
  });
  const inner = new RunLifecycle({
    harness: loaded,
    store,
    coordinator,
    expressions,
    now,
    runIdFactory: () => runId,
    waitPollMs: 1,
  });
  const recovery = new RecoveryLifecycle({ harness: loaded, store, lifecycle: inner });
  return { coordinator, inner, recovery };
}

function startedToolStep(store: SqliteStore, runId: string, input: unknown = {}) {
  const identity = {
    runId,
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  };
  store.insertStartedStep({
    ...identity,
    kind: 'tool',
    attempt: 1,
    startedAt: '2026-09-17T04:00:00.000Z',
    input,
    idempotencyKey: deriveIdempotencyKey(identity),
  });
  return identity;
}

test('definition mismatch rejects running resume before durable mutation', async () => {
  const workflow = toolWorkflow();
  const store = new SqliteStore({ path: ':memory:' });
  const tools = new ToolRegistry();
  tools.register('work', { effect: 'none', async execute() { return { ok: true }; } });

  const original = lifecycleFor(harness(workflow, 'definition-a'), store, tools);
  original.coordinator.createRootRun({ runId: 'definition-mismatch', workflowId: 'main', input: {} });
  const before = structuredClone(store.getRun('definition-mismatch'));

  const changed = lifecycleFor(harness(workflow, 'definition-b'), store, tools);
  await assert.rejects(
    changed.recovery.resume('definition-mismatch'),
    (error: unknown) => error instanceof RecoveryCompatibilityError
      && error.reason === 'definition_mismatch',
  );
  assert.deepEqual(store.getRun('definition-mismatch'), before);
  assert.equal(store.listSteps('definition-mismatch').length, 0);
});

test('engine-major mismatch rejects running resume before durable mutation', async () => {
  const workflow = toolWorkflow();
  const loaded = harness(workflow);
  const store = new SqliteStore({ path: ':memory:' });
  const tools = new ToolRegistry();
  tools.register('work', { effect: 'none', async execute() { return null; } });
  const ctx = lifecycleFor(loaded, store, tools);
  ctx.coordinator.createRootRun({ runId: 'engine-mismatch', workflowId: 'main', input: {} });
  store.db.prepare('UPDATE runs SET execution_engine_major = 99 WHERE run_id = ?').run('engine-mismatch');
  const before = structuredClone(store.getRun('engine-mismatch'));

  await assert.rejects(
    ctx.recovery.resume('engine-mismatch'),
    (error: unknown) => error instanceof RecoveryCompatibilityError
      && error.reason === 'engine_mismatch',
  );
  assert.deepEqual(store.getRun('engine-mismatch'), before);
  assert.equal(store.listSteps('engine-mismatch').length, 0);
});

test('completed journal with lagging control resumes without Tool rerun', async () => {
  let calls = 0;
  const workflow = toolWorkflow();
  const loaded = harness(workflow);
  const store = new SqliteStore({ path: ':memory:' });
  const tools = new ToolRegistry();
  tools.register('work', { effect: 'none', async execute() { calls += 1; return { fresh: true }; } });
  const ctx = lifecycleFor(loaded, store, tools);
  ctx.coordinator.createRootRun({ runId: 'completed-lag', workflowId: 'main', input: {} });
  const identity = startedToolStep(store, 'completed-lag');
  store.completeStep(identity, {
    status: 'completed',
    completedAt: '2026-09-17T04:00:01.000Z',
    output: { persisted: true },
  });

  const run = await ctx.recovery.resume('completed-lag');
  assert.equal(run.status, 'completed');
  assert.deepEqual(run.output, { persisted: true });
  assert.equal(calls, 0);
});

test('started idempotent Tool resumes with same key and incremented attempt', async () => {
  let seenAttempt = 0;
  let seenKey = '';
  const workflow = toolWorkflow('put');
  const loaded = harness(workflow);
  const store = new SqliteStore({ path: ':memory:' });
  const tools = new ToolRegistry();
  tools.register('put', {
    effect: 'idempotent',
    async execute(_input, context) {
      seenAttempt = context.attempt;
      seenKey = context.idempotencyKey;
      return { ok: true };
    },
  });
  const ctx = lifecycleFor(loaded, store, tools);
  ctx.coordinator.createRootRun({ runId: 'idempotent-restart', workflowId: 'main', input: {} });
  const identity = startedToolStep(store, 'idempotent-restart');
  const originalKey = deriveIdempotencyKey(identity);

  const run = await ctx.recovery.resume('idempotent-restart');
  assert.equal(run.status, 'completed');
  assert.equal(seenAttempt, 2);
  assert.equal(seenKey, originalKey);
  assert.equal(store.getStep(identity)?.attempt, 2);
});

test('started non-idempotent Tool resumes as interrupted without replay', async () => {
  let calls = 0;
  const workflow = toolWorkflow('charge');
  const loaded = harness(workflow);
  const store = new SqliteStore({ path: ':memory:' });
  const tools = new ToolRegistry();
  tools.register('charge', {
    effect: 'non-idempotent',
    async execute() { calls += 1; return { charged: true }; },
  });
  const ctx = lifecycleFor(loaded, store, tools);
  ctx.coordinator.createRootRun({ runId: 'non-idempotent-restart', workflowId: 'main', input: {} });
  const identity = startedToolStep(store, 'non-idempotent-restart');

  const run = await ctx.recovery.resume('non-idempotent-restart');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'interrupted');
  assert.equal(calls, 0);
  assert.equal(store.getStep(identity)?.attempt, 1);
});

test('status-lagging waiting control reconciles from running to waiting on resume', async () => {
  const workflow = waitingWorkflow();
  const loaded = harness(workflow);
  const store = new SqliteStore({ path: ':memory:' });
  const tools = new ToolRegistry();
  const ctx = lifecycleFor(loaded, store, tools);
  ctx.coordinator.createRootRun({ runId: 'waiting-lag', workflowId: 'main', input: {} });
  assert.equal(store.getRun('waiting-lag')?.status, 'running');

  const run = await ctx.recovery.resume('waiting-lag');
  assert.equal(run.status, 'waiting');
  assert.equal(store.getRun('waiting-lag')?.status, 'waiting');
});

test('send applies definition lock before mutating a persisted waiting Run', async () => {
  const workflow = waitingWorkflow();
  const store = new SqliteStore({ path: ':memory:' });
  const tools = new ToolRegistry();
  const original = lifecycleFor(harness(workflow, 'definition-a'), store, tools, 'waiting-mismatch');
  await original.inner.start({ workflowId: 'main', input: {} });
  await original.inner.wait('waiting-mismatch', { timeoutMs: 1000 });
  const before = structuredClone(store.getRun('waiting-mismatch'));

  const changed = lifecycleFor(harness(workflow, 'definition-b'), store, tools, 'unused');
  await assert.rejects(
    changed.recovery.send('waiting-mismatch', { type: 'continue', payload: { ok: true } }),
    (error: unknown) => error instanceof RecoveryCompatibilityError
      && error.reason === 'definition_mismatch',
  );
  assert.deepEqual(store.getRun('waiting-mismatch'), before);
  assert.equal(store.listSteps('waiting-mismatch').length, 0);
});

test('terminal resume remains idempotent even after Harness definition changes', async () => {
  const workflow = toolWorkflow();
  const store = new SqliteStore({ path: ':memory:' });
  const tools = new ToolRegistry();
  tools.register('work', { effect: 'none', async execute() { return { ok: true }; } });

  const original = lifecycleFor(harness(workflow, 'definition-a'), store, tools, 'terminal-run');
  await original.inner.start({ workflowId: 'main', input: {} });
  const completed = await original.inner.wait('terminal-run', { timeoutMs: 1000 });
  assert.equal(completed.status, 'completed');

  const changed = lifecycleFor(harness(workflow, 'definition-b'), store, tools, 'unused');
  const resumed = await changed.recovery.resume('terminal-run');
  assert.equal(resumed.status, 'completed');
  assert.deepEqual(resumed.output, { ok: true });
});
