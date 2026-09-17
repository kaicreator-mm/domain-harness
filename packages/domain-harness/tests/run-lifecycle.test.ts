import assert from 'node:assert/strict';
import test from 'node:test';

import type { AIOperationPort } from '../src/contracts/ai.js';
import { ExpressionRuntime } from '../src/expression/index.js';
import { ToolRegistry } from '../src/execution/index.js';
import type { LoadedHarness, WorkflowAst } from '../src/loader/ast.js';
import { SqliteStore } from '../src/persistence/sqlite-store.js';
import { RunCoordinator, RunLifecycle, RunLifecycleError } from '../src/runner/index.js';

const ai: AIOperationPort = { async execute(request) { return request.input; } };

function waitingWorkflow(id = 'main'): WorkflowAst {
  return {
    id,
    sourcePath: `${id}.yaml`,
    initial: 'await_approval',
    output: 'steps.await_approval',
    states: {
      await_approval: {
        id: 'await_approval',
        final: false,
        done: [],
        error: [],
        events: {
          approve: {
            schema: {
              type: 'object',
              required: ['approved'],
              properties: { approved: { type: 'boolean' } },
              additionalProperties: false,
            },
            routes: [
              { when: 'event.payload.approved = true', target: 'approved' },
              { target: 'failed' },
            ],
          },
        },
      },
      approved: { id: 'approved', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

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

function parentWithWaitingChild(): WorkflowAst[] {
  const parent: WorkflowAst = {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'delegate',
    output: 'steps.delegate',
    states: {
      delegate: {
        id: 'delegate',
        final: false,
        invoke: { kind: 'workflow', ref: 'child', input: 'input' },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const child = waitingWorkflow('child');
  return [parent, child];
}

function loadedHarness(workflows: WorkflowAst[]): LoadedHarness {
  const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  return {
    root: process.cwd(),
    manifest: { schemaVersion: '0.1', id: 'lifecycle-test', limits: { maxSteps: 100 } },
    workflows: workflowMap,
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(
      workflows.map((workflow) => [
        workflow.id,
        Object.values(workflow.states)
          .filter((state) => state.invoke?.kind === 'workflow' && state.invoke.ref)
          .map((state) => state.invoke!.ref!),
      ]),
    ),
    definitionHash: 'lifecycle-test-definition',
  };
}

function context(
  workflows: WorkflowAst[],
  tools = new ToolRegistry(),
  runId = 'run-1',
) {
  const harness = loadedHarness(workflows);
  const store = new SqliteStore({ path: ':memory:' });
  const expressions = new ExpressionRuntime();
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 8, 17, 2, 0, tick++));
  const coordinator = new RunCoordinator({ harness, store, tools, ai, expressions, now });
  const lifecycle = new RunLifecycle({
    harness,
    store,
    coordinator,
    expressions,
    now,
    runIdFactory: () => runId,
    waitPollMs: 1,
  });
  return { store, coordinator, lifecycle };
}

test('no-invoke state persists waiting and accepted payload becomes waiting Step output', async () => {
  const { store, lifecycle } = context([waitingWorkflow()]);
  const started = await lifecycle.start({ workflowId: 'main', input: { request: 1 } });
  assert.equal(started.status, 'running');

  const waiting = await lifecycle.wait(started.runId, { timeoutMs: 1000 });
  assert.equal(waiting.status, 'waiting');

  const completed = await lifecycle.send(started.runId, {
    type: 'approve',
    payload: { approved: true },
  });
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.output, { approved: true });
  const eventStep = store.getStep({
    runId: started.runId,
    workflowInstanceId: 'root',
    stateId: 'await_approval',
    visit: 1,
  });
  assert.equal(eventStep?.kind, 'event');
  assert.equal(eventStep?.status, 'completed');
  assert.deepEqual(eventStep?.output, { approved: true });
});

test('rejected sends do not mutate waiting Run or journal', async () => {
  const { store, lifecycle } = context([waitingWorkflow()]);
  const started = await lifecycle.start({ workflowId: 'main', input: {} });
  await lifecycle.wait(started.runId, { timeoutMs: 1000 });
  const before = store.getRun(started.runId);

  await assert.rejects(
    lifecycle.send(started.runId, { type: 'missing', payload: {} }),
    (error: unknown) => error instanceof RunLifecycleError && error.reason === 'event_not_declared',
  );
  assert.deepEqual(store.getRun(started.runId), before);
  assert.equal(store.listSteps(started.runId).length, 0);

  await assert.rejects(
    lifecycle.send(started.runId, { type: 'approve', payload: { approved: 'yes' } }),
  );
  assert.deepEqual(store.getRun(started.runId), before);
  assert.equal(store.listSteps(started.runId).length, 0);
});

test('concurrent sends serialize and only one event is accepted for a waiting visit', async () => {
  const { store, lifecycle } = context([waitingWorkflow()]);
  const started = await lifecycle.start({ workflowId: 'main', input: {} });
  await lifecycle.wait(started.runId, { timeoutMs: 1000 });

  const results = await Promise.allSettled([
    lifecycle.send(started.runId, { type: 'approve', payload: { approved: true } }),
    lifecycle.send(started.runId, { type: 'approve', payload: { approved: true } }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(store.listSteps(started.runId).filter((step) => step.kind === 'event').length, 1);
  assert.equal((await lifecycle.get(started.runId))?.status, 'completed');
});

test('waiting inside Child Workflow accepts event in child instance scope and resumes parent', async () => {
  const { store, lifecycle } = context(parentWithWaitingChild());
  const started = await lifecycle.start({ workflowId: 'main', input: { child: true } });
  const waiting = await lifecycle.wait(started.runId, { timeoutMs: 1000 });
  assert.equal(waiting.status, 'waiting');

  const run = await lifecycle.send(started.runId, {
    type: 'approve',
    payload: { approved: true },
  });
  assert.equal(run.status, 'completed');
  assert.deepEqual(run.output, { approved: true });
  const childEvent = store.getStep({
    runId: started.runId,
    workflowInstanceId: 'root/delegate#1',
    stateId: 'await_approval',
    visit: 1,
  });
  assert.equal(childEvent?.kind, 'event');
  assert.deepEqual(childEvent?.output, { approved: true });
});

test('cancelled waiting Run is terminal and later send is rejected', async () => {
  const { lifecycle } = context([waitingWorkflow()]);
  const started = await lifecycle.start({ workflowId: 'main', input: {} });
  await lifecycle.wait(started.runId, { timeoutMs: 1000 });

  const cancelled = await lifecycle.cancel(started.runId);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.error?.code, 'cancelled');
  await assert.rejects(
    lifecycle.send(started.runId, { type: 'approve', payload: { approved: true } }),
    (error: unknown) => error instanceof RunLifecycleError && error.reason === 'not_waiting',
  );
  assert.equal((await lifecycle.resume(started.runId)).status, 'cancelled');
});

test('late Tool completion after cancel cannot overwrite cancelled or complete Step journal', async () => {
  let release!: (value: unknown) => void;
  let called = 0;
  const late = new Promise<unknown>((resolve) => { release = resolve; });
  const tools = new ToolRegistry();
  tools.register('slow', {
    effect: 'none',
    async execute() {
      called += 1;
      return late;
    },
  });
  const { store, lifecycle } = context([toolWorkflow('slow')], tools);
  const started = await lifecycle.start({ workflowId: 'main', input: {} });

  for (let i = 0; i < 100 && called === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(called, 1);

  const cancelled = await lifecycle.cancel(started.runId);
  assert.equal(cancelled.status, 'cancelled');
  release({ late: true });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(store.getRun(started.runId)?.status, 'cancelled');
  const step = store.getStep({
    runId: started.runId,
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  });
  assert.equal(step?.status, 'started');
  assert.equal(step?.output, undefined);
  assert.equal(store.updateRun(started.runId, {
    status: 'failed',
    updatedAt: '2026-09-17T03:00:00.000Z',
  }), false);
});

test('wait timeout and caller abort do not mutate Run state', async () => {
  const tools = new ToolRegistry();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  tools.register('slow', { effect: 'none', async execute() { await blocked; return null; } });
  const { store, lifecycle } = context([toolWorkflow('slow')], tools);
  const started = await lifecycle.start({ workflowId: 'main', input: {} });

  await assert.rejects(
    lifecycle.wait(started.runId, { timeoutMs: 1 }),
    (error: unknown) => error instanceof RunLifecycleError && error.reason === 'wait_timeout',
  );
  assert.equal(store.getRun(started.runId)?.status, 'running');

  const controller = new AbortController();
  const waiting = lifecycle.wait(started.runId, { signal: controller.signal });
  controller.abort();
  await assert.rejects(
    waiting,
    (error: unknown) => error instanceof RunLifecycleError && error.reason === 'wait_aborted',
  );
  assert.equal(store.getRun(started.runId)?.status, 'running');

  await lifecycle.cancel(started.runId);
  release();
});

test('resume drives a persisted running Run but leaves waiting and terminal Runs unchanged', async () => {
  const tools = new ToolRegistry();
  tools.register('work', { effect: 'none', async execute() { return { ok: true }; } });
  const { coordinator, lifecycle } = context([toolWorkflow()], tools, 'resume-run');
  coordinator.createRootRun({ runId: 'resume-run', workflowId: 'main', input: {} });

  const completed = await lifecycle.resume('resume-run');
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.output, { ok: true });
  assert.equal((await lifecycle.resume('resume-run')).status, 'completed');

  const waitingContext = context([waitingWorkflow()], new ToolRegistry(), 'waiting-run');
  const started = await waitingContext.lifecycle.start({ workflowId: 'main', input: {} });
  const waiting = await waitingContext.lifecycle.wait(started.runId, { timeoutMs: 1000 });
  assert.equal(waiting.status, 'waiting');
  assert.equal((await waitingContext.lifecycle.resume(started.runId)).status, 'waiting');
});
