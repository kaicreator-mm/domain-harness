import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { AIOperationPort } from '../src/contracts/ai.js';
import { ToolRegistry } from '../src/execution/index.js';
import type { LoadedHarness, WorkflowAst } from '../src/loader/ast.js';
import { SqliteStore } from '../src/persistence/sqlite-store.js';
import { deriveIdempotencyKey, RunCoordinator } from '../src/runner/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ai: AIOperationPort = { async execute(request) { return request.input; } };

/**
 * Regression contract discovered during T-010 review.
 *
 * The persisted Step input field is optional, so `undefined` means absent while
 * JSON `null` is a real input value. The Runner must therefore use an explicit
 * `step.input === undefined` check during replay instead of nullish coalescing.
 */
test('persisted JSON null is distinct from an absent Step input', () => {
  const persistedInput: null | undefined = null;
  const fallbackInput = { shouldNotBeUsed: true };

  const recovered = persistedInput === undefined ? fallbackInput : persistedInput;
  assert.equal(recovered, null);
});

function singleToolWorkflow(tool: string): WorkflowAst {
  return {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
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

function parentOfChildWorkflow(childInputExpression: string): WorkflowAst {
  return {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    output: 'steps.work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'workflow', ref: 'child', input: childInputExpression },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

function toolChildWorkflow(tool: string): WorkflowAst {
  return {
    id: 'child',
    sourcePath: 'child.yaml',
    initial: 'calc',
    output: 'steps.calc',
    states: {
      calc: {
        id: 'calc',
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

function harness(workflows: WorkflowAst[]): LoadedHarness {
  const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  return {
    root: packageRoot,
    manifest: { schemaVersion: '0.1', id: 'null-input-test', limits: { maxSteps: 20 } },
    workflows: workflowMap,
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(
      workflows.map((workflow) => [
        workflow.id,
        Object.values(workflow.states)
          .filter((state) => state.invoke?.kind === 'workflow' && state.invoke.ref)
          .map((state) => state.invoke?.ref ?? ''),
      ]),
    ),
    definitionHash: 'null-input-test-definition',
  };
}

test('replay of a started Tool with persisted JSON null input receives null', async () => {
  const tools = new ToolRegistry();
  let seenInput: unknown = 'unset';
  tools.register('probe', {
    effect: 'none',
    async execute(input) {
      seenInput = input;
      return { receivedNull: input === null };
    },
  });
  const store = new SqliteStore({ path: ':memory:' });
  const coordinator = new RunCoordinator({ harness: harness([singleToolWorkflow('probe')]), store, tools, ai });
  coordinator.createRootRun({ runId: 'null-replay', workflowId: 'main', input: { frame: 'root-input' } });
  const identity = { runId: 'null-replay', workflowInstanceId: 'root', stateId: 'work', visit: 1 };
  store.insertStartedStep({
    ...identity,
    kind: 'tool',
    attempt: 1,
    startedAt: '2026-09-17T00:00:00.000Z',
    input: null,
    idempotencyKey: deriveIdempotencyKey(identity),
  });

  const run = await coordinator.drive('null-replay');
  assert.equal(run.status, 'completed');
  assert.equal(seenInput, null, 'replayed Tool must receive the persisted null, not the frame input');
  assert.deepEqual(store.getStep(identity)?.output, { receivedNull: true });
  assert.equal(store.getStep(identity)?.input, null);
});

test('child Workflow recovers a persisted JSON null parent Step input', async () => {
  const tools = new ToolRegistry();
  let seenInput: unknown = 'unset';
  tools.register('childProbe', {
    effect: 'none',
    async execute(input) {
      seenInput = input;
      return { receivedNull: input === null };
    },
  });
  const store = new SqliteStore({ path: ':memory:' });
  const coordinator = new RunCoordinator({
    harness: harness([parentOfChildWorkflow('null'), toolChildWorkflow('childProbe')]),
    store,
    tools,
    ai,
  });
  coordinator.createRootRun({ runId: 'null-child', workflowId: 'main', input: { frame: 'root-input' } });

  const run = await coordinator.drive('null-child');
  assert.equal(run.status, 'completed');
  assert.equal(seenInput, null, 'child frame input must recover the parent Step null, not the root run input');
  assert.deepEqual(run.output, { receivedNull: true });
});
