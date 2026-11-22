/** T13：通过真实 XState 根/子 Actor 验证既有图语义、预算与受信 Reader。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  FunctionOutcome, FunctionRef, JsonValue, ResourceRef, SelectedWorkflow,
  WorkflowDefinition, WorkflowRef,
} from '@kaicreator/domain-harness-contracts';
import { DH_WORKFLOW_SCHEMA_VERSION } from '@kaicreator/domain-harness-contracts';
import { startWorkflowRun } from '../../src/workflow-run.js';
import type { SelectedWorkflowDriver } from '../../src/workflow-execution.js';

const element = {
  namespace: 'orders', id: 'orders.route', version: '1.0.0',
  digest: `sha256:${'a'.repeat(64)}` as `sha256:${string}`,
} as const;
const rootRef: WorkflowRef = { element, contentId: 'main' };
const childRef: WorkflowRef = { element, contentId: 'child' };
const fn = (functionId: string): FunctionRef => ({ element, functionId, contractVersion: '1' });
const ok = (value: JsonValue): FunctionOutcome => ({ kind: 'SUCCEEDED', value });
const unknown = (): FunctionOutcome => ({
  kind: 'UNKNOWN', unknownReason: { code: 'NO_FACT', message: 'source missing' },
});
const err = (): FunctionOutcome => ({
  kind: 'FAILED', failure: { code: 'BUSINESS', message: 'explicit failure' },
});
const target = (terminal: 'COMPLETE' | 'UNKNOWN' | 'FAILED' | 'WAIT' | 'ASK' | 'REJECT') =>
  ({ terminal });
const selected = (ref: WorkflowRef, definition: WorkflowDefinition): SelectedWorkflow => ({
  ref, definition, ownerPackageId: 'orders-business',
  definitionDigest: `sha256:${'b'.repeat(64)}`,
});
const definition = (nodes: WorkflowDefinition['nodes'], maxElementCalls = 8,
  maxDescendantWorkflowDepth = 1): WorkflowDefinition => ({
    kind: 'Workflow', schemaVersion: DH_WORKFLOW_SCHEMA_VERSION, id: 'root',
    entryNodeId: nodes[0]!.id, nodes, maxElementCalls, maxDescendantWorkflowDepth,
  });
const only = (name: string) => ({
  id: 'only', kind: 'function' as const, function: fn(name),
  switch: { exits: [
    { label: 'SUCCEEDED', target: target('COMPLETE') },
    { label: 'UNKNOWN', target: target('UNKNOWN') },
    { label: 'FAILED', target: target('FAILED') },
  ] },
});
function driver(
  entries: readonly SelectedWorkflow[],
  onInvoke: (ref: FunctionRef, input: JsonValue) => FunctionOutcome | Promise<FunctionOutcome>,
  onRead?: (ref: ResourceRef) => Promise<Uint8Array>,
): SelectedWorkflowDriver {
  return {
    select: (ref) => entries.find((item) => item.ref.contentId === ref.contentId &&
      item.ref.element.digest === ref.element.digest),
    invoke: (ref, input) => Promise.resolve(onInvoke(ref, input)),
    read: onRead ?? (async () => { throw new Error('unexpected data read'); }),
  };
}

test('T13: single selected Function routes SUCCEEDED with its actual value', async () => {
  const root = selected(rootRef, definition([only('assess')]));
  const result = await startWorkflowRun(rootRef, { source: 'x' },
    driver([root], () => ok({ approved: true })));
  assert.deepEqual(result, { status: 'COMPLETE', value: { approved: true } });
});

test('T13: UNKNOWN and FAILED keep original reasons; unknown route fails closed', async () => {
  const root = selected(rootRef, definition([only('assess')]));
  assert.deepEqual(await startWorkflowRun(rootRef, null, driver([root], unknown)),
    { status: 'UNKNOWN', reason: { code: 'NO_FACT', message: 'source missing' } });
  assert.deepEqual(await startWorkflowRun(rootRef, null, driver([root], err)),
    { status: 'FAILED', reason: { code: 'BUSINESS', message: 'explicit failure' } });
  const invalid = selected(rootRef, definition([{
    ...only('assess'), switch: { exits: [{ label: 'APPROVED', target: target('COMPLETE') }] },
  }]));
  assert.equal((await startWorkflowRun(rootRef, null, driver([invalid], () => ok({ route: 'MISSING' }))))
    .status, 'FAILED');
});

test('T13: start and end are awaited exactly once and reserved before side-effects', async () => {
  const events: string[] = [];
  const node = { ...only('leaf'), hooks: { start: fn('start'), end: fn('end') } };
  const root = selected(rootRef, definition([node], 3));
  const result = await startWorkflowRun(rootRef, {}, driver([root], async (ref) => {
    events.push(ref.functionId);
    await Promise.resolve();
    return ok({ route: 'SUCCEEDED' });
  }));
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(events, ['start', 'leaf', 'end']);
  events.length = 0;
  const denied = selected(rootRef, definition([node], 2));
  const tooSmall = await startWorkflowRun(rootRef, {}, driver([denied], (ref) => {
    events.push(ref.functionId);
    return ok(null);
  }));
  assert.equal(tooSmall.status, 'FAILED');
  assert.deepEqual(events, [], 'reservation fails before start');
});

test('T13: end is attempted after start FAILED and cannot launder failure into COMPLETE', async () => {
  const events: string[] = [];
  const node = { ...only('leaf'), hooks: { start: fn('start'), end: fn('end') } };
  const root = selected(rootRef, definition([node], 3));
  const outcome = await startWorkflowRun(rootRef, {}, driver([root], (ref) => {
    events.push(ref.functionId);
    return ref.functionId === 'start' ? err() : ok(null);
  }));
  assert.deepEqual(events, ['start', 'end']);
  assert.equal(outcome.status, 'FAILED');
});

test('T13: child Workflow shares root calls, checks root relative descendant depth', async () => {
  const child = selected(childRef, definition([only('sub')], 4, 0));
  const root = selected(rootRef, definition([{
    id: 'child-node', kind: 'workflow', workflow: childRef,
    switch: { exits: [{ label: 'COMPLETE', target: target('COMPLETE') }] },
  }], 2, 1));
  const result = await startWorkflowRun(rootRef, { a: 1 }, driver([root, child], () => ok({ child: 1 })));
  assert.equal(result.status, 'COMPLETE');
  const rejectedDepth = selected(rootRef, definition(root.definition.nodes, 2, 0));
  const denied = await startWorkflowRun(rootRef, {}, driver([rejectedDepth, child], () => ok(null)));
  assert.equal(denied.status, 'FAILED');
  if (denied.status === 'FAILED') assert.equal(denied.reason.code, 'DH_WORKFLOW_DEPTH_LIMIT');
});

test('T13: sealed Reader bytes become JSON Function input; never a dynamic Host path', async () => {
  const source: ResourceRef = {
    packageId: 'orders-business', path: 'content/a.yml',
    digest: `sha256:${'c'.repeat(64)}`,
  };
  const node = { ...only('yaml-reader'), data: { format: 'yaml' as const, resource: source, maxBytes: 128 } };
  const root = selected(rootRef, definition([node]));
  let received: JsonValue = null;
  const result = await startWorkflowRun(rootRef, {}, driver([root],
    (_ref, input) => { received = input; return ok({ verified: true }); },
    async (ref) => {
      assert.deepEqual(ref, source);
      return new TextEncoder().encode('name: alpha\n');
    }));
  assert.equal(result.status, 'COMPLETE');
  assert.deepEqual(received, { format: 'yaml', source: 'name: alpha\n' }, 'KDP may not parse data on behalf of the selected Reader');
  const small = selected(rootRef, definition([{ ...node, data: { ...node.data, maxBytes: 1 } }]));
  await assert.rejects(() => startWorkflowRun(rootRef, {}, driver([small], () => ok(null),
    async () => new TextEncoder().encode('name: alpha\n'))), /DH_WORKFLOW_READER_SIZE_LIMIT/);
});

test('T13: real XState root and child actors are independent across concurrent WorkflowRuns', async () => {
  const child = selected(childRef, definition([only('sub')], 1, 0));
  const root = selected(rootRef, definition([{
    id: 'child-node', kind: 'workflow', workflow: childRef,
    switch: { exits: [{ label: 'COMPLETE', target: target('COMPLETE') }] },
  }], 1, 1));
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const sharedDriver = driver([root, child], async () => {
    active += 1;
    calls += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return ok({ independent: true });
  });
  const results = await Promise.all([
    startWorkflowRun(rootRef, null, sharedDriver),
    startWorkflowRun(rootRef, null, sharedDriver),
    startWorkflowRun(rootRef, null, sharedDriver),
  ]);
  assert.ok(results.every((result) => result.status === 'COMPLETE'));
  assert.equal(calls, 3, 'each root Run consumes only its own budget');
  assert.ok(maximumActive > 1, 'independent root/child actors execute concurrently');
});

test('T13: fatal start errors propagate only after the required end attempt', async () => {
  const events: string[] = [];
  const node = { ...only('leaf'), hooks: { start: fn('start'), end: fn('end') } };
  const root = selected(rootRef, definition([node], 3));
  await assert.rejects(() => startWorkflowRun(rootRef, {}, driver([root], (ref) => {
    events.push(ref.functionId);
    if (ref.functionId === 'start') throw new Error('fixture fatal start');
    return ok(null);
  })), /fixture fatal start/);
  assert.deepEqual(events, ['start', 'end']);
});

test('R60 W02: KDP forwards sealed YAML bytes, format validation belongs to the selected Reader', async () => {
  const source: ResourceRef = {
    packageId: 'orders-business', path: 'content/duplicate.yml',
    digest: `sha256:${'c'.repeat(64)}`,
  };
  const node = { ...only('yaml-reader'), data: { format: 'yaml' as const, resource: source, maxBytes: 128 } };
  const root = selected(rootRef, definition([node]));
  let received: JsonValue = null;
  const outcome = await startWorkflowRun(rootRef, {}, driver([root], (_ref, input) => {
    received = input;
    // 此单元驱动模拟受选 Reader 的业务拒绝；唯一 KDP 不再自行解析。
    return { kind: 'FAILED', failure: { code: 'DH_STD_READER_INVALID', message: 'duplicate YAML keys' } };
  }, async () => new TextEncoder().encode('a: 1\\na: 2\\n')));
  assert.deepEqual(received, { format: 'yaml', source: 'a: 1\\na: 2\\n' });
  assert.deepEqual(outcome,
    { status: 'FAILED', reason: { code: 'DH_STD_READER_INVALID', message: 'duplicate YAML keys' } });
});
