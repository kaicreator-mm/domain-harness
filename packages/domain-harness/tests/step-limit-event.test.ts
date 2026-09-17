import assert from 'node:assert/strict';
import test from 'node:test';

import type { AIOperationPort } from '../src/contracts/ai.js';
import { ToolRegistry } from '../src/execution/index.js';
import type { LoadedHarness, WorkflowAst } from '../src/loader/ast.js';
import { SqliteStore } from '../src/persistence/sqlite-store.js';
import { deriveIdempotencyKey, RunCoordinator } from '../src/runner/index.js';

const ai: AIOperationPort = { async execute(request) { return request.input; } };

test('prior event journal identity counts toward run-wide maxSteps', async () => {
  let calls = 0;
  const workflow: WorkflowAst = {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'tool', ref: 'work' },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const harness: LoadedHarness = {
    root: process.cwd(),
    manifest: { schemaVersion: '0.1', id: 'limit-test', limits: { maxSteps: 1 } },
    workflows: new Map([[workflow.id, workflow]]),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map([[workflow.id, []]]),
    definitionHash: 'limit-test-definition',
  };
  const store = new SqliteStore({ path: ':memory:' });
  const tools = new ToolRegistry();
  tools.register('work', { effect: 'none', async execute() { calls += 1; return null; } });
  const coordinator = new RunCoordinator({ harness, store, tools, ai });
  coordinator.createRootRun({ runId: 'limit-event', workflowId: 'main', input: {} });

  const eventIdentity = {
    runId: 'limit-event',
    workflowInstanceId: 'root',
    stateId: 'prior_wait',
    visit: 1,
  };
  store.insertStartedStep({
    ...eventIdentity,
    kind: 'event',
    attempt: 1,
    startedAt: '2026-09-17T06:00:00.000Z',
    input: { type: 'continue', payload: null },
    idempotencyKey: deriveIdempotencyKey(eventIdentity),
  });
  store.completeStep(eventIdentity, {
    status: 'completed',
    completedAt: '2026-09-17T06:00:00.000Z',
    output: null,
  });

  const run = await coordinator.drive('limit-event');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'step_limit_exceeded');
  assert.equal(calls, 0);
  assert.equal(store.listSteps('limit-event').length, 1);
});
