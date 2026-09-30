// I-03-ASSEMBLY adversarial acceptance 6/7/8 — engine-major-3 execution on
// publicly compiled successor packages: total durable workflow-send rejection
// (permanent routing, transient retry through recovery ownership, replay
// idempotence), I-LOCAL host-local Tool durability through DurableToolRunner,
// and T-009 source-command outcome authority under the assembled engine-3
// Runtime.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDomainRuntime } from '../../packages/domain-harness/src/runtime/index.js';
import { createDomainRuntimeWithProcessCommandOutcomes } from '../../packages/domain-harness/src/runtime/create-domain-runtime.js';
import { StaticPackageRegistry } from '../../packages/domain-harness/src/package/registry.js';
import type { DomainMessage } from '../../packages/domain-harness/src/v2/contracts/message.js';
import type { WorkflowAddress } from '../../packages/domain-harness/src/v2/contracts/workflow.js';
import type { RuntimeStore } from '../../packages/domain-harness/src/v2/contracts/store.js';
import type { DomainRuntime } from '../../packages/domain-harness/src/v2/contracts/runtime.js';
import {
  AssemblyMemoryStore,
  HOST_MAXIMA,
  assemblyInventoryTool,
  compileAssemblyPackage,
  createAssemblyHost,
} from './helpers.js';

const PARENT: WorkflowAddress = { workflowId: 'parent', instanceKey: 'parent-1' };
const CHILD: WorkflowAddress = { workflowId: 'child', instanceKey: 'child-1' };
const MISSING_CHILD: WorkflowAddress = { workflowId: 'child', instanceKey: 'missing-child' };
const CORRELATION_ID = 'assembly-corr';

const DEFAULT_WORKFLOWS = [
  { workflowId: 'parent' },
  { workflowId: 'child', simple: true },
] as const;

async function bootSuccessorRuntime(options: {
  readonly mode?: 'legacy' | 'v3';
  readonly workflows?: readonly { workflowId: string; simple?: boolean; effectTarget?: string; tool?: typeof assemblyInventoryTool }[];
  readonly tools?: readonly Parameters<typeof compileAssemblyPackage>[0]['tools'];
  readonly inventoryCalls?: Array<{ toolId: string; input: unknown; effectId: string }>;
} = {}) {
  const inventoryCalls = options.inventoryCalls ?? [];
  const host = createAssemblyHost({ inventoryCalls });
  const compiled = compileAssemblyPackage({
    workflows: options.workflows ?? DEFAULT_WORKFLOWS,
    ...(options.tools === undefined ? {} : { tools: options.tools }),
  });
  const registry = new StaticPackageRegistry(
    [{
      manifest: compiled.manifest,
      bindings: { 'assembly-inventory-native-v1': { opaque: 'host-local-inventory' } },
      domainData: compiled.domainData,
    }],
    compiled.manifest.packageId,
  );
  const store = new AssemblyMemoryStore();
  const runtimeOptions = {
    packageRegistry: registry,
    store: store as unknown as RuntimeStore,
    bindings: host,
    supportedPackageDataBounds: { ...HOST_MAXIMA },
    now: () => '2026-09-30T00:00:00.000Z',
  };
  const runtime: DomainRuntime = options.mode === 'v3'
    ? await createDomainRuntimeWithProcessCommandOutcomes(runtimeOptions)
    : await createDomainRuntime(runtimeOptions);
  return { runtime, store, host, inventoryCalls, compiled };
}

function message(messageId: string, target: WorkflowAddress, type = 'BEGIN'): DomainMessage {
  return {
    messageId,
    target,
    type,
    payload: { messageId },
    correlationId: CORRELATION_ID,
  };
}

async function openWaiting(runtime: DomainRuntime, target: WorkflowAddress): Promise<void> {
  await runtime.openInstance({
    address: target,
    correlationId: CORRELATION_ID,
    input: { caseId: target.instanceKey },
  });
}

function sendEffectsOf(store: AssemblyMemoryStore) {
  return store.listEffects().filter((record) => record.effectKind === 'domain-message');
}

test('I-03-ASSEMBLY: permanent child-send rejection routes durably and the source survives', async () => {
  const { runtime, store } = await bootSuccessorRuntime();
  await openWaiting(runtime, PARENT);
  // Drive the child terminal BEFORE the parent effect runs.
  await openWaiting(runtime, CHILD);
  await runtime.send(message('child-finish', CHILD));
  await runtime.awaitIdle();
  const child = await store.getInstance(CHILD);
  assert.ok(child);
  assert.equal(child.lifecycle, 'completed', 'fixture child must be terminal before the parent send');

  await runtime.send(message('p1', PARENT));
  await runtime.awaitIdle();

  const parent = await store.getInstance(PARENT);
  assert.ok(parent);
  assert.equal(parent.lifecycle, 'completed');
  const state = parent.state as { stateId: string };
  assert.equal(state.stateId, 'rejected', 'the permanent rejection routed through the total rejected route');

  const sendEffects = sendEffectsOf(store);
  assert.equal(sendEffects.length, 1);
  assert.equal(sendEffects[0]!.status, 'completed');
  const outcome = sendEffects[0]!.output as { status: string; rejection?: { code: string } };
  assert.equal(outcome.status, 'rejected');
  assert.equal(outcome.rejection?.code, 'target_terminal');
});

test('I-03-ASSEMBLY: transient target-not-found defers to recovery ownership and retries the same identity', async () => {
  const { runtime, store } = await bootSuccessorRuntime({
    workflows: [
      { workflowId: 'parent', effectTarget: '$.missingChild' },
      { workflowId: 'child', simple: true },
    ],
  });
  await openWaiting(runtime, PARENT);

  await runtime.send(message('p1', PARENT));
  await runtime.awaitIdle();

  const failed = await store.getInstance(PARENT);
  assert.ok(failed);
  assert.equal(
    failed.lifecycle,
    'recovery_required',
    'a transient child condition is technical/recovery-owned, never a semantic rejection',
  );
  const startedEffects = sendEffectsOf(store);
  assert.equal(startedEffects.length, 1);
  assert.equal(startedEffects[0]!.status, 'started', 'transient conditions leave the source effect started for retry');

  // Provision the missing child, then retry the poisoned turn: the SAME
  // effect identity must converge to acceptance without duplicate effects.
  await openWaiting(runtime, MISSING_CHILD);
  await runtime.recover({ target: PARENT, action: 'retry', reason: 'child provisioned by T-010 owner' });
  await runtime.awaitIdle();

  const recovered = await store.getInstance(PARENT);
  assert.ok(recovered);
  assert.equal(recovered.lifecycle, 'waiting');
  const state = recovered.state as { stateId: string };
  assert.equal(state.stateId, 'acting', 'the retried effect accepted and continued old-state execution');

  const effects = sendEffectsOf(store);
  assert.equal(effects.length, 1, 'retry reused the same durable effect identity');
  assert.equal(effects[0]!.status, 'completed');
  const outcome = effects[0]!.output as { status: string };
  assert.equal(outcome.status, 'accepted');
});

test('I-03-ASSEMBLY: replay of a completed turn does not duplicate committed child work', async () => {
  const { runtime, store } = await bootSuccessorRuntime();
  await openWaiting(runtime, PARENT);
  await openWaiting(runtime, CHILD);

  await runtime.send(message('p1', PARENT));
  await runtime.awaitIdle();
  const duplicate = await runtime.send(message('p1', PARENT));
  assert.equal(duplicate.status, 'duplicate');

  const child = await store.getInstance(CHILD);
  assert.ok(child);
  assert.equal(child.lifecycle, 'completed');
  const sendEffects = sendEffectsOf(store);
  assert.equal(sendEffects.length, 1);
  assert.equal(sendEffects[0]!.status, 'completed');
  const outcome = sendEffects[0]!.output as { status: string };
  assert.equal(outcome.status, 'accepted');
});

test('I-03-ASSEMBLY: I-LOCAL host-local Tool executes through DurableToolRunner with durable effect identity', async () => {
  const inventoryCalls: Array<{ toolId: string; input: unknown; effectId: string }> = [];
  const tool = assemblyInventoryTool();
  const { runtime, store } = await bootSuccessorRuntime({
    workflows: [{ workflowId: 'parent', tool }, { workflowId: 'child', simple: true }],
    tools: [tool],
    inventoryCalls,
  });
  await openWaiting(runtime, PARENT);
  await openWaiting(runtime, CHILD);

  await runtime.send(message('p1', PARENT));
  await runtime.awaitIdle();

  assert.equal(inventoryCalls.length, 1, 'exactly one durable host-local Tool invocation');
  assert.equal(inventoryCalls[0]!.toolId, 'inventory.reserve');
  assert.match(inventoryCalls[0]!.effectId, /[0-9a-f]/u);

  const toolEffects = store.listEffects().filter((record) => record.effectKind === 'tool:inventory.reserve');
  assert.equal(toolEffects.length, 1, 'the tool invocation is journaled through DurableToolRunner');

  const parent = await store.getInstance(PARENT);
  assert.ok(parent);
  const state = parent.state as { stateId: string; lastResult?: { reserved?: boolean } };
  assert.equal(state.stateId, 'done');
  assert.equal(state.lastResult?.reserved, true);
});

test('I-03-ASSEMBLY: T-009 command outcomes stay the source-command authority under engine-3', async () => {
  const { runtime, store } = await bootSuccessorRuntime({ mode: 'v3' });
  await openWaiting(runtime, PARENT);
  await openWaiting(runtime, CHILD);

  // p1 applies (start -> acting; child send accepted). p2 then arrives while
  // the instance waits in 'acting', which does not accept BEGIN: a normal
  // command rejection, durably recorded as a T-009 outcome — distinct from
  // any child-send rejection routing.
  await runtime.send(message('p1', PARENT));
  await runtime.awaitIdle();
  const applied = await store.getCommandOutcome(PARENT, 'p1');
  assert.equal(applied?.status, 'applied');

  await runtime.send(message('p2', PARENT));
  await runtime.awaitIdle();
  const rejected = await store.getCommandOutcome(PARENT, 'p2');
  assert.ok(rejected);
  assert.equal(rejected.status, 'rejected');
  if (rejected.status === 'rejected') {
    assert.equal(rejected.rejection.code, 'MESSAGE_NOT_ACCEPTED_IN_STATE');
  }
  const disposition = await store.getMessageDisposition(PARENT, 'p2');
  assert.equal(disposition?.disposition, 'processed');
  const instance = await store.getInstance(PARENT);
  assert.ok(instance);
  assert.notEqual(instance.lifecycle, 'recovery_required', 'a normal T-009 rejection is not a failure');
});
