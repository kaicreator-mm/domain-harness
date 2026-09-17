import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { AIOperationPort } from '../src/contracts/ai.js';
import type { JsonValue } from '../src/contracts/json.js';
import { ToolRegistry } from '../src/execution/index.js';
import type { LoadedHarness, SkillAst, WorkflowAst } from '../src/loader/ast.js';
import { SqliteStore } from '../src/persistence/sqlite-store.js';
import { deriveIdempotencyKey, RunCoordinator } from '../src/runner/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const passthroughAi: AIOperationPort = { async execute(request) { return request.input; } };

function singleStepWorkflow(id: string, invoke: WorkflowAst['states'][string]['invoke']): WorkflowAst {
  return {
    id,
    sourcePath: `${id}.yaml`,
    initial: 'work',
    states: {
      work: {
        id: 'work',
        final: false,
        ...(invoke ? { invoke } : {}),
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

function harness(workflow: WorkflowAst, maxSteps = 100, skills = new Map<string, SkillAst>()): LoadedHarness {
  return {
    root: packageRoot,
    manifest: { schemaVersion: '0.1', id: 'test-harness', limits: { maxSteps } },
    workflows: new Map([[workflow.id, workflow]]),
    skills,
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map([[workflow.id, []]]),
    definitionHash: 'test-definition',
  };
}

function context(
  loaded: LoadedHarness,
  tools: ToolRegistry,
  ai: AIOperationPort = passthroughAi,
) {
  const store = new SqliteStore({ path: ':memory:' });
  let tick = 0;
  const coordinator = new RunCoordinator({
    harness: loaded,
    store,
    tools,
    ai,
    now: () => new Date(Date.UTC(2026, 8, 17, 0, 0, tick++)),
  });
  return { store, coordinator };
}

function insertStarted(
  store: SqliteStore,
  runId: string,
  kind: 'skill' | 'tool' | 'script' | 'expr' | 'workflow',
  input: JsonValue = {},
) {
  const identity = { runId, workflowInstanceId: 'root', stateId: 'work', visit: 1 };
  store.insertStartedStep({
    ...identity,
    kind,
    attempt: 1,
    startedAt: '2026-09-17T00:00:00.000Z',
    input,
    idempotencyKey: deriveIdempotencyKey(identity),
  });
  return identity;
}

test('completed journal output is reused without rerunning Tool', async () => {
  let calls = 0;
  const tools = new ToolRegistry();
  tools.register('once', { effect: 'none', async execute() { calls += 1; return { fresh: true }; } });
  const workflow = singleStepWorkflow('main', { kind: 'tool', ref: 'once' });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r1', workflowId: 'main', input: {} });
  const identity = insertStarted(store, 'r1', 'tool');
  store.completeStep(identity, {
    status: 'completed',
    completedAt: '2026-09-17T00:00:01.000Z',
    output: { persisted: true },
  });

  const run = await coordinator.drive('r1');
  assert.equal(run.status, 'completed');
  assert.equal(calls, 0);
});

test('failed terminal journal error is reused without rerunning Tool', async () => {
  let calls = 0;
  const tools = new ToolRegistry();
  tools.register('once', { effect: 'none', async execute() { calls += 1; return null; } });
  const workflow = singleStepWorkflow('main', { kind: 'tool', ref: 'once' });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r1f', workflowId: 'main', input: {} });
  const identity = insertStarted(store, 'r1f', 'tool');
  store.completeStep(identity, {
    status: 'failed',
    completedAt: '2026-09-17T00:00:01.000Z',
    error: { code: 'tool_error', message: 'persisted failure' },
  });

  const run = await coordinator.drive('r1f');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'tool_error');
  assert.equal(calls, 0);
});

test('started non-idempotent Tool becomes interrupted without replay', async () => {
  let calls = 0;
  const tools = new ToolRegistry();
  tools.register('charge', { effect: 'non-idempotent', async execute() { calls += 1; return { ok: true }; } });
  const workflow = singleStepWorkflow('main', { kind: 'tool', ref: 'charge' });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r2', workflowId: 'main', input: {} });
  const identity = insertStarted(store, 'r2', 'tool');

  const run = await coordinator.drive('r2');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'interrupted');
  assert.equal(calls, 0);
  assert.equal(store.getStep(identity)?.attempt, 1);
});

test('started idempotent Tool reruns with same key and incremented attempt', async () => {
  let seenKey = '';
  let seenAttempt = 0;
  const tools = new ToolRegistry();
  tools.register('put', {
    effect: 'idempotent',
    async execute(_input, ctx) {
      seenKey = ctx.idempotencyKey;
      seenAttempt = ctx.attempt;
      return { ok: true };
    },
  });
  const workflow = singleStepWorkflow('main', { kind: 'tool', ref: 'put' });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r3', workflowId: 'main', input: {} });
  const identity = insertStarted(store, 'r3', 'tool');
  const key = deriveIdempotencyKey(identity);

  const run = await coordinator.drive('r3');
  assert.equal(run.status, 'completed');
  assert.equal(seenKey, key);
  assert.equal(seenAttempt, 2);
  assert.equal(store.getStep(identity)?.attempt, 2);
});

test('started Tool effect=none reruns and increments attempt', async () => {
  let calls = 0;
  let attempt = 0;
  const tools = new ToolRegistry();
  tools.register('read', {
    effect: 'none',
    async execute(_input, ctx) {
      calls += 1;
      attempt = ctx.attempt;
      return { ok: true };
    },
  });
  const workflow = singleStepWorkflow('main', { kind: 'tool', ref: 'read' });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r3n', workflowId: 'main', input: {} });
  const identity = insertStarted(store, 'r3n', 'tool');

  assert.equal((await coordinator.drive('r3n')).status, 'completed');
  assert.equal(calls, 1);
  assert.equal(attempt, 2);
  assert.equal(store.getStep(identity)?.attempt, 2);
});

test('started Expr reruns using persisted input and increments attempt', async () => {
  const tools = new ToolRegistry();
  const workflow = singleStepWorkflow('main', { kind: 'expr', expression: 'input.value * 2' });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r3e', workflowId: 'main', input: { value: 1 } });
  const identity = insertStarted(store, 'r3e', 'expr', { value: 21 });

  assert.equal((await coordinator.drive('r3e')).status, 'completed');
  assert.equal(store.getStep(identity)?.attempt, 2);
  assert.equal(store.getStep(identity)?.output, 42);
});

test('started Script reruns using persisted input and increments attempt', async () => {
  const tools = new ToolRegistry();
  const workflow = singleStepWorkflow('main', {
    kind: 'script',
    ref: 'tests/fixtures/scripts/echo.mjs',
    scriptSource: readFileSync(join(packageRoot, 'tests/fixtures/scripts/echo.mjs'), 'utf8'),
  });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r3s', workflowId: 'main', input: { value: 1 } });
  const identity = insertStarted(store, 'r3s', 'script', { value: 21 });

  assert.equal((await coordinator.drive('r3s')).status, 'completed');
  assert.equal(store.getStep(identity)?.attempt, 2);
  assert.deepEqual(store.getStep(identity)?.output, { value: 42 });
});

test('started Skill reruns through AIOperationPort and increments attempt', async () => {
  let calls = 0;
  let seenAttempt = 0;
  const ai: AIOperationPort = {
    async execute(request) {
      calls += 1;
      seenAttempt = request.identity.attempt;
      return { score: (request.input as { score: number }).score };
    },
  };
  const skill: SkillAst = {
    id: 'score',
    directory: '/harness/skills/score',
    instructions: 'Return score.',
    sidecar: { output: { schema: 'out.json' }, resources: [] },
    inputSchema: {
      type: 'object',
      required: ['score'],
      properties: { score: { type: 'number' } },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      required: ['score'],
      properties: { score: { type: 'number' } },
      additionalProperties: false,
    },
    resources: [],
  };
  const skills = new Map([[skill.id, skill]]);
  const workflow = singleStepWorkflow('main', { kind: 'skill', ref: 'score' });
  const tools = new ToolRegistry();
  const { store, coordinator } = context(harness(workflow, 100, skills), tools, ai);
  coordinator.createRootRun({ runId: 'r3a', workflowId: 'main', input: { score: 1 } });
  const identity = insertStarted(store, 'r3a', 'skill', { score: 90 });

  assert.equal((await coordinator.drive('r3a')).status, 'completed');
  assert.equal(calls, 1);
  assert.equal(seenAttempt, 2);
  assert.equal(store.getStep(identity)?.attempt, 2);
  assert.deepEqual(store.getStep(identity)?.output, { score: 90 });
});

test('new Step uses attempt 1 and deterministic idempotency key', async () => {
  let seenAttempt = 0;
  let seenKey = '';
  const tools = new ToolRegistry();
  tools.register('read', {
    effect: 'none',
    async execute(_input, ctx) {
      seenAttempt = ctx.attempt;
      seenKey = ctx.idempotencyKey;
      return null;
    },
  });
  const workflow = singleStepWorkflow('main', { kind: 'tool', ref: 'read' });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r4', workflowId: 'main', input: {} });
  await coordinator.drive('r4');
  const identity = { runId: 'r4', workflowInstanceId: 'root', stateId: 'work', visit: 1 };
  assert.equal(seenAttempt, 1);
  assert.equal(seenKey, deriveIdempotencyKey(identity));
  assert.equal(store.getStep(identity)?.attempt, 1);
});

test('maxSteps counts logical Steps, not attempts', async () => {
  const tools = new ToolRegistry();
  tools.register('noop', { effect: 'none', async execute() { return null; } });
  const workflow: WorkflowAst = {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'a',
    states: {
      a: { id: 'a', final: false, invoke: { kind: 'tool', ref: 'noop' }, done: [{ target: 'b' }], error: [{ target: 'failed' }], events: {} },
      b: { id: 'b', final: false, invoke: { kind: 'tool', ref: 'noop' }, done: [{ target: 'ok' }], error: [{ target: 'failed' }], events: {} },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const { store, coordinator } = context(harness(workflow, 1), tools);
  coordinator.createRootRun({ runId: 'r5', workflowId: 'main', input: {} });
  const run = await coordinator.drive('r5');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'step_limit_exceeded');
  assert.equal(store.listSteps('r5').length, 1);
});

test('self-transition creates a new visit instead of reusing prior journal identity', async () => {
  let calls = 0;
  const tools = new ToolRegistry();
  tools.register('loop', { effect: 'none', async execute() { calls += 1; return null; } });
  const workflow: WorkflowAst = {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'tool', ref: 'loop' },
        done: [{ target: 'work' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const { store, coordinator } = context(harness(workflow, 2), tools);
  coordinator.createRootRun({ runId: 'r5loop', workflowId: 'main', input: {} });
  const run = await coordinator.drive('r5loop');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'step_limit_exceeded');
  assert.equal(calls, 2);
  assert.deepEqual(store.listSteps('r5loop').map((step) => step.visit), [1, 2]);
  assert.equal(run.controlState.frames[0]?.visits.work, 3);
});

test('rerun keeps the persisted startedAt logical time across attempts', async () => {
  const tools = new ToolRegistry();
  tools.register('put', { effect: 'idempotent', async execute() { return { ok: true }; } });
  const workflow = singleStepWorkflow('main', { kind: 'tool', ref: 'put' });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r-stable', workflowId: 'main', input: {} });
  const identity = { runId: 'r-stable', workflowInstanceId: 'root', stateId: 'work', visit: 1 };
  const persistedStartedAt = '2026-09-17T05:00:00.000Z';
  store.insertStartedStep({
    ...identity,
    kind: 'tool',
    attempt: 1,
    startedAt: persistedStartedAt,
    input: {},
    idempotencyKey: deriveIdempotencyKey(identity),
  });

  assert.equal((await coordinator.drive('r-stable')).status, 'completed');
  assert.equal(store.getStep(identity)?.attempt, 2);
  assert.equal(store.getStep(identity)?.startedAt, persistedStartedAt);
});

test('timed-out Script fails the Run and replay reuses the persisted error', async () => {
  const tools = new ToolRegistry();
  const workflow = singleStepWorkflow('main', {
    kind: 'script',
    ref: 'tests/fixtures/scripts/hang.mjs',
    scriptSource: readFileSync(join(packageRoot, 'tests/fixtures/scripts/hang.mjs'), 'utf8'),
    timeoutMs: 50,
  });
  const { store, coordinator } = context(harness(workflow), tools);
  coordinator.createRootRun({ runId: 'r-script-timeout', workflowId: 'main', input: {} });

  const run = await coordinator.drive('r-script-timeout');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'timeout');
  const identity = { runId: 'r-script-timeout', workflowInstanceId: 'root', stateId: 'work', visit: 1 };
  assert.equal(store.getStep(identity)?.status, 'failed');

  const replay = await coordinator.drive('r-script-timeout');
  assert.equal(replay.status, 'failed');
  assert.equal(replay.error?.code, 'timeout');
  assert.equal(store.getStep(identity)?.status, 'failed');
});
