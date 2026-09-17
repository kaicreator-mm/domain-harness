import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { AIOperationPort } from '../src/contracts/ai.js';
import { ToolRegistry } from '../src/execution/index.js';
import type { LoadedHarness, SkillAst, WorkflowAst } from '../src/loader/ast.js';
import { SqliteStore } from '../src/persistence/sqlite-store.js';
import { ScriptExecutor } from '../src/script/index.js';
import { deriveIdempotencyKey, RunCoordinator } from '../src/runner/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ai: AIOperationPort = { async execute(request) { return request.input; } };

function loaded(workflow: WorkflowAst, skills = new Map<string, SkillAst>()): LoadedHarness {
  return {
    root: packageRoot,
    manifest: { schemaVersion: '0.1', id: 'recovery-test', limits: { maxSteps: 20 } },
    workflows: new Map([[workflow.id, workflow]]),
    skills,
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map([[workflow.id, []]]),
    definitionHash: 'recovery-test-definition',
  };
}

function invokeWorkflow(ref: { kind: 'tool'; ref: string } | { kind: 'skill'; ref: string } | { kind: 'script'; ref: string }): WorkflowAst {
  return {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: ref,
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

test('completed journal with lagging control recomputes conditional route without rerun', async () => {
  let calls = 0;
  const tools = new ToolRegistry();
  tools.register('score', {
    effect: 'none',
    async execute() {
      calls += 1;
      return { score: 0 };
    },
  });
  const workflow: WorkflowAst = {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'score',
    states: {
      score: {
        id: 'score',
        final: false,
        invoke: { kind: 'tool', ref: 'score' },
        done: [
          { when: 'output.score >= 80', target: 'accepted' },
          { target: 'rejected' },
        ],
        error: [{ target: 'failed' }],
        events: {},
      },
      accepted: { id: 'accepted', final: true, done: [], error: [], events: {} },
      rejected: { id: 'rejected', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const store = new SqliteStore({ path: ':memory:' });
  const coordinator = new RunCoordinator({ harness: loaded(workflow), store, tools, ai });
  coordinator.createRootRun({
    runId: 'lagging',
    workflowId: 'main',
    input: {},
    createdAt: '2026-09-17T00:00:00.000Z',
  });
  const identity = { runId: 'lagging', workflowInstanceId: 'root', stateId: 'score', visit: 1 };
  store.insertStartedStep({
    ...identity,
    kind: 'tool',
    attempt: 1,
    startedAt: '2026-09-17T00:00:01.000Z',
    input: {},
    idempotencyKey: deriveIdempotencyKey(identity),
  });
  store.completeStep(identity, {
    status: 'completed',
    completedAt: '2026-09-17T00:00:02.000Z',
    output: { score: 90 },
  });

  const run = await coordinator.drive('lagging');
  assert.equal(run.status, 'completed');
  assert.equal(run.controlState.frames[0]?.stateId, 'accepted');
  assert.equal(calls, 0);
});

test('Host Tool executes outside SQLite transaction', async () => {
  const tools = new ToolRegistry();
  const workflow: WorkflowAst = {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'tool', ref: 'observe_tx' },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const store = new SqliteStore({ path: ':memory:' });
  let observedInTransaction = true;
  tools.register('observe_tx', {
    effect: 'none',
    async execute() {
      observedInTransaction = store.db.inTransaction;
      return null;
    },
  });
  const coordinator = new RunCoordinator({ harness: loaded(workflow), store, tools, ai });
  coordinator.createRootRun({ runId: 'tx', workflowId: 'main', input: {} });

  assert.equal((await coordinator.drive('tx')).status, 'completed');
  assert.equal(observedInTransaction, false);
});

test('AI operation executes outside SQLite transaction', async () => {
  const store = new SqliteStore({ path: ':memory:' });
  let observedInTransaction = true;
  const observingAi: AIOperationPort = {
    async execute() {
      observedInTransaction = store.db.inTransaction;
      return {};
    },
  };
  const skill: SkillAst = {
    id: 'observe',
    directory: '/harness/skills/observe',
    instructions: 'Observe transaction state.',
    sidecar: { output: { schema: 'out.json' }, resources: [] },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    resources: [],
  };
  const coordinator = new RunCoordinator({
    harness: loaded(invokeWorkflow({ kind: 'skill', ref: 'observe' }), new Map([[skill.id, skill]])),
    store,
    tools: new ToolRegistry(),
    ai: observingAi,
  });
  coordinator.createRootRun({ runId: 'tx-ai', workflowId: 'main', input: {} });

  assert.equal((await coordinator.drive('tx-ai')).status, 'completed');
  assert.equal(observedInTransaction, false);
});

test('Script Worker executes outside SQLite transaction', async () => {
  const store = new SqliteStore({ path: ':memory:' });
  let observedInTransaction = true;
  class ObservingScriptExecutor extends ScriptExecutor {
    override async execute(...args: Parameters<ScriptExecutor['execute']>): ReturnType<ScriptExecutor['execute']> {
      observedInTransaction = store.db.inTransaction;
      return super.execute(...args);
    }
  }
  const coordinator = new RunCoordinator({
    harness: loaded(invokeWorkflow({ kind: 'script', ref: 'tests/fixtures/scripts/echo.mjs' })),
    store,
    tools: new ToolRegistry(),
    ai,
    scripts: new ObservingScriptExecutor(),
  });
  coordinator.createRootRun({ runId: 'tx-script', workflowId: 'main', input: { value: 21 } });

  assert.equal((await coordinator.drive('tx-script')).status, 'completed');
  assert.equal(observedInTransaction, false);
});
