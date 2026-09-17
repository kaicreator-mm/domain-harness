import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import type { AIOperationPort } from '../src/contracts/ai.js';
import { ToolRegistry } from '../src/execution/index.js';
import type { LoadedHarness, WorkflowAst } from '../src/loader/ast.js';
import { SqliteStore } from '../src/persistence/sqlite-store.js';
import {
  deriveChildWorkflowInstanceId,
  deriveIdempotencyKey,
  RunCoordinator,
} from '../src/runner/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ai: AIOperationPort = { async execute(request) { return request.input; } };

function parentWorkflow(childId = 'child'): WorkflowAst {
  return {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    output: 'steps.work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'workflow', ref: childId, input: '{"value": input.value}' },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

function toolChild(id = 'child', tool = 'childTool'): WorkflowAst {
  return {
    id,
    sourcePath: `${id}.yaml`,
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

function loadedHarness(workflows: WorkflowAst[], maxSteps = 100): LoadedHarness {
  const workflowMap = new Map(workflows.map((workflow) => [workflow.id, workflow]));
  return {
    root: packageRoot,
    manifest: { schemaVersion: '0.1', id: 'child-test', limits: { maxSteps } },
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
    definitionHash: 'child-test-definition',
  };
}

function context(
  workflows: WorkflowAst[],
  tools: ToolRegistry,
  maxChildWorkflowDepth = 32,
) {
  const store = new SqliteStore({ path: ':memory:' });
  let tick = 0;
  const coordinator = new RunCoordinator({
    harness: loadedHarness(workflows),
    store,
    tools,
    ai,
    maxChildWorkflowDepth,
    now: () => new Date(Date.UTC(2026, 8, 17, 1, 0, tick++)),
  });
  return { store, coordinator };
}

test('child workflow instance identity is deterministic and visit-scoped', () => {
  assert.equal(deriveChildWorkflowInstanceId('root', 'creative', 1), 'root/creative#1');
  assert.equal(deriveChildWorkflowInstanceId('root', 'creative', 2), 'root/creative#2');
  assert.equal(
    deriveChildWorkflowInstanceId('root/creative#1', 'quality', 1),
    'root/creative#1/quality#1',
  );
});

test('successful child output becomes parent Step output and root result', async () => {
  const tools = new ToolRegistry();
  let seenInput: unknown;
  tools.register('childTool', {
    effect: 'none',
    async execute(input) {
      seenInput = input;
      return { result: (input as { value: number }).value * 2 };
    },
  });
  const parent = parentWorkflow();
  const child = toolChild();
  const { store, coordinator } = context([parent, child], tools);

  coordinator.createRootRun({ runId: 'child-success', workflowId: 'main', input: { value: 21 } });
  const run = await coordinator.drive('child-success');

  assert.equal(run.status, 'completed');
  assert.deepEqual(seenInput, { value: 21 });
  assert.deepEqual(run.output, { result: 42 });
  const parentStep = store.getStep({
    runId: 'child-success',
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  });
  assert.equal(parentStep?.kind, 'workflow');
  assert.equal(parentStep?.status, 'completed');
  assert.deepEqual(parentStep?.output, { result: 42 });
  const childStep = store.getStep({
    runId: 'child-success',
    workflowInstanceId: 'root/work#1',
    stateId: 'calc',
    visit: 1,
  });
  assert.equal(childStep?.status, 'completed');
  assert.deepEqual(run.controlState.frames.map((frame) => frame.workflowInstanceId), ['root']);
});

test('started parent Workflow Step with no child frame pushes same deterministic child on recovery', async () => {
  const tools = new ToolRegistry();
  let calls = 0;
  tools.register('childTool', {
    effect: 'none',
    async execute(input) {
      calls += 1;
      return input;
    },
  });
  const parent = parentWorkflow();
  const child = toolChild();
  const { store, coordinator } = context([parent, child], tools);
  coordinator.createRootRun({ runId: 'push-recovery', workflowId: 'main', input: { value: 7 } });
  const parentIdentity = {
    runId: 'push-recovery',
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  };
  store.insertStartedStep({
    ...parentIdentity,
    kind: 'workflow',
    attempt: 1,
    startedAt: '2026-09-17T01:00:00.000Z',
    input: { value: 7 },
    idempotencyKey: deriveIdempotencyKey(parentIdentity),
  });

  const run = await coordinator.drive('push-recovery');
  assert.equal(run.status, 'completed');
  assert.equal(calls, 1);
  assert.ok(store.getStep({
    runId: 'push-recovery',
    workflowInstanceId: 'root/work#1',
    stateId: 'calc',
    visit: 1,
  }));
  assert.equal(store.getStep(parentIdentity)?.attempt, 1);
});

test('completed child internal Step is reused when recovering an active child frame', async () => {
  const tools = new ToolRegistry();
  let calls = 0;
  tools.register('childTool', {
    effect: 'none',
    async execute() {
      calls += 1;
      return { fresh: true };
    },
  });
  const parent = parentWorkflow();
  const child = toolChild();
  const { store, coordinator } = context([parent, child], tools);
  const root = coordinator.createRootRun({ runId: 'active-child', workflowId: 'main', input: { value: 2 } });
  const parentIdentity = {
    runId: 'active-child',
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  };
  store.insertStartedStep({
    ...parentIdentity,
    kind: 'workflow',
    attempt: 1,
    startedAt: '2026-09-17T01:00:00.000Z',
    input: { value: 2 },
    idempotencyKey: deriveIdempotencyKey(parentIdentity),
  });
  store.updateRun('active-child', {
    controlState: {
      schemaVersion: 1,
      frames: [
        root.controlState.frames[0]!,
        {
          workflowId: 'child',
          workflowInstanceId: 'root/work#1',
          stateId: 'calc',
          visits: { calc: 1 },
          lastDecisionAt: '2026-09-17T01:00:00.000Z',
        },
      ],
    },
    updatedAt: '2026-09-17T01:00:00.000Z',
  });
  const childIdentity = {
    runId: 'active-child',
    workflowInstanceId: 'root/work#1',
    stateId: 'calc',
    visit: 1,
  };
  store.insertStartedStep({
    ...childIdentity,
    kind: 'tool',
    attempt: 1,
    startedAt: '2026-09-17T01:00:01.000Z',
    input: { value: 2 },
    idempotencyKey: deriveIdempotencyKey(childIdentity),
  });
  store.completeStep(childIdentity, {
    status: 'completed',
    completedAt: '2026-09-17T01:00:02.000Z',
    output: { persisted: true },
  });

  const run = await coordinator.drive('active-child');
  assert.equal(run.status, 'completed');
  assert.equal(calls, 0);
  assert.deepEqual(run.output, { persisted: true });
});

test('parent journal completed after child pop does not re-enter child', async () => {
  const tools = new ToolRegistry();
  let calls = 0;
  tools.register('childTool', {
    effect: 'none',
    async execute() {
      calls += 1;
      return { unexpected: true };
    },
  });
  const parent = parentWorkflow();
  const child = toolChild();
  const { store, coordinator } = context([parent, child], tools);
  coordinator.createRootRun({ runId: 'post-pop', workflowId: 'main', input: { value: 1 } });
  const parentIdentity = {
    runId: 'post-pop',
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  };
  store.insertStartedStep({
    ...parentIdentity,
    kind: 'workflow',
    attempt: 1,
    startedAt: '2026-09-17T01:00:00.000Z',
    input: { value: 1 },
    idempotencyKey: deriveIdempotencyKey(parentIdentity),
  });
  store.completeStep(parentIdentity, {
    status: 'completed',
    completedAt: '2026-09-17T01:00:03.000Z',
    output: { persistedChild: true },
  });

  const run = await coordinator.drive('post-pop');
  assert.equal(run.status, 'completed');
  assert.equal(calls, 0);
  assert.deepEqual(run.output, { persistedChild: true });
});

test('recovery reruns a started child internal Step inside an active child frame', async () => {
  const tools = new ToolRegistry();
  let calls = 0;
  tools.register('childTool', {
    effect: 'none',
    async execute(input) {
      calls += 1;
      return { rerun: true, value: (input as { value: number }).value };
    },
  });
  const parent = parentWorkflow();
  const child = toolChild();
  const { store, coordinator } = context([parent, child], tools);
  const root = coordinator.createRootRun({ runId: 'child-started', workflowId: 'main', input: { value: 5 } });
  const parentIdentity = {
    runId: 'child-started',
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  };
  store.insertStartedStep({
    ...parentIdentity,
    kind: 'workflow',
    attempt: 1,
    startedAt: '2026-09-17T01:00:00.000Z',
    input: { value: 5 },
    idempotencyKey: deriveIdempotencyKey(parentIdentity),
  });
  store.updateRun('child-started', {
    controlState: {
      schemaVersion: 1,
      frames: [
        root.controlState.frames[0]!,
        {
          workflowId: 'child',
          workflowInstanceId: 'root/work#1',
          stateId: 'calc',
          visits: { calc: 1 },
          lastDecisionAt: '2026-09-17T01:00:00.000Z',
        },
      ],
    },
    updatedAt: '2026-09-17T01:00:00.000Z',
  });
  const childIdentity = {
    runId: 'child-started',
    workflowInstanceId: 'root/work#1',
    stateId: 'calc',
    visit: 1,
  };
  store.insertStartedStep({
    ...childIdentity,
    kind: 'tool',
    attempt: 1,
    startedAt: '2026-09-17T01:00:01.000Z',
    input: { value: 5 },
    idempotencyKey: deriveIdempotencyKey(childIdentity),
  });

  const run = await coordinator.drive('child-started');
  assert.equal(run.status, 'completed');
  assert.equal(calls, 1, 'started child internal Step must rerun once on recovery');
  assert.equal(store.getStep(childIdentity)?.attempt, 2);
  assert.deepEqual(run.output, { rerun: true, value: 5 });
});

test('active child frame at a terminal state reconciles into the parent Step', async () => {
  const tools = new ToolRegistry();
  let calls = 0;
  tools.register('childTool', {
    effect: 'none',
    async execute() {
      calls += 1;
      return { unexpected: true };
    },
  });
  const parent = parentWorkflow();
  const child = toolChild();
  const { store, coordinator } = context([parent, child], tools);
  const root = coordinator.createRootRun({ runId: 'child-terminal', workflowId: 'main', input: { value: 3 } });
  const parentIdentity = {
    runId: 'child-terminal',
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  };
  store.insertStartedStep({
    ...parentIdentity,
    kind: 'workflow',
    attempt: 1,
    startedAt: '2026-09-17T01:00:00.000Z',
    input: { value: 3 },
    idempotencyKey: deriveIdempotencyKey(parentIdentity),
  });
  store.updateRun('child-terminal', {
    controlState: {
      schemaVersion: 1,
      frames: [
        root.controlState.frames[0]!,
        {
          workflowId: 'child',
          workflowInstanceId: 'root/work#1',
          stateId: 'ok',
          visits: { calc: 1, ok: 1 },
          lastDecisionAt: '2026-09-17T01:00:02.000Z',
        },
      ],
    },
    updatedAt: '2026-09-17T01:00:02.000Z',
  });
  const childIdentity = {
    runId: 'child-terminal',
    workflowInstanceId: 'root/work#1',
    stateId: 'calc',
    visit: 1,
  };
  store.insertStartedStep({
    ...childIdentity,
    kind: 'tool',
    attempt: 1,
    startedAt: '2026-09-17T01:00:01.000Z',
    input: { value: 3 },
    idempotencyKey: deriveIdempotencyKey(childIdentity),
  });
  store.completeStep(childIdentity, {
    status: 'completed',
    completedAt: '2026-09-17T01:00:02.000Z',
    output: { childDone: true },
  });

  const run = await coordinator.drive('child-terminal');
  assert.equal(run.status, 'completed');
  assert.equal(calls, 0, 'terminal child frame must not replay its internal Step');
  assert.deepEqual(run.output, { childDone: true });
  assert.equal(store.getStep(parentIdentity)?.status, 'completed');
  assert.equal(run.controlState.frames.length, 1, 'child frame must be popped after reconciliation');
});

test('child failed terminal becomes parent child_workflow_error', async () => {
  const tools = new ToolRegistry();
  tools.register('childTool', {
    effect: 'none',
    async execute() {
      throw new Error('child exploded');
    },
  });
  const parent = parentWorkflow();
  const child = toolChild();
  const { store, coordinator } = context([parent, child], tools);
  coordinator.createRootRun({ runId: 'child-fail', workflowId: 'main', input: { value: 1 } });

  const run = await coordinator.drive('child-fail');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'child_workflow_error');
  assert.equal(
    (run.error?.details as { cause?: { code?: string } } | undefined)?.cause?.code,
    'tool_error',
  );
  assert.equal(store.getStep({
    runId: 'child-fail',
    workflowInstanceId: 'root',
    stateId: 'work',
    visit: 1,
  })?.status, 'failed');
});

test('nested children use isolated deterministic instance paths', async () => {
  const tools = new ToolRegistry();
  tools.register('leafTool', { effect: 'none', async execute(input) { return input; } });
  const parent = parentWorkflow('middle');
  const middle: WorkflowAst = {
    id: 'middle',
    sourcePath: 'middle.yaml',
    initial: 'delegate',
    output: 'steps.delegate',
    states: {
      delegate: {
        id: 'delegate',
        final: false,
        invoke: { kind: 'workflow', ref: 'leaf' },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const leaf = toolChild('leaf', 'leafTool');
  const { store, coordinator } = context([parent, middle, leaf], tools);
  coordinator.createRootRun({ runId: 'nested', workflowId: 'main', input: { value: 9 } });

  const run = await coordinator.drive('nested');
  assert.equal(run.status, 'completed');
  assert.ok(store.getStep({
    runId: 'nested',
    workflowInstanceId: 'root/work#1',
    stateId: 'delegate',
    visit: 1,
  }));
  assert.ok(store.getStep({
    runId: 'nested',
    workflowInstanceId: 'root/work#1/delegate#1',
    stateId: 'calc',
    visit: 1,
  }));
});

test('repeated parent visits create distinct child instances', async () => {
  const tools = new ToolRegistry();
  let calls = 0;
  tools.register('childTool', {
    effect: 'none',
    async execute() {
      calls += 1;
      return { call: calls };
    },
  });
  const parent: WorkflowAst = {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'workflow', ref: 'child' },
        done: [
          { when: 'run.visits.work < 2', target: 'work' },
          { target: 'ok' },
        ],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const child = toolChild();
  const { store, coordinator } = context([parent, child], tools);
  coordinator.createRootRun({ runId: 'repeat-child', workflowId: 'main', input: {} });

  const run = await coordinator.drive('repeat-child');
  assert.equal(run.status, 'completed');
  assert.equal(calls, 2);
  const instances = new Set(store.listSteps('repeat-child').map((step) => step.workflowInstanceId));
  assert.ok(instances.has('root/work#1'));
  assert.ok(instances.has('root/work#2'));
});

test('runtime recursion defence rejects an active workflow as its own child', async () => {
  const tools = new ToolRegistry();
  const recursive: WorkflowAst = {
    id: 'main',
    sourcePath: 'main.yaml',
    initial: 'work',
    states: {
      work: {
        id: 'work',
        final: false,
        invoke: { kind: 'workflow', ref: 'main' },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const { coordinator } = context([recursive], tools);
  coordinator.createRootRun({ runId: 'recursive', workflowId: 'main', input: {} });

  const run = await coordinator.drive('recursive');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'child_workflow_error');
});

test('runtime child depth defence rejects a push beyond configured internal limit', async () => {
  const tools = new ToolRegistry();
  const root = parentWorkflow('middle');
  const middle: WorkflowAst = {
    id: 'middle',
    sourcePath: 'middle.yaml',
    initial: 'delegate',
    output: 'steps.delegate',
    states: {
      delegate: {
        id: 'delegate',
        final: false,
        invoke: { kind: 'workflow', ref: 'leaf' },
        done: [{ target: 'ok' }],
        error: [{ target: 'failed' }],
        events: {},
      },
      ok: { id: 'ok', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
  const leaf = toolChild('leaf', 'leafTool');
  tools.register('leafTool', { effect: 'none', async execute() { return null; } });
  const { coordinator } = context([root, middle, leaf], tools, 1);
  coordinator.createRootRun({ runId: 'depth', workflowId: 'main', input: { value: 1 } });

  const run = await coordinator.drive('depth');
  assert.equal(run.status, 'failed');
  assert.equal(run.error?.code, 'child_workflow_error');
});
