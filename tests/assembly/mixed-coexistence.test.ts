// I-03-ASSEMBLY adversarial acceptance 9/10 — one Runtime, retained and
// successor together: mixed 0.2/2/2 + 0.3/2/3 packages/instances execute
// through exact per-package profile dispatch with unchanged pins, and the
// I-OPEN atomic provisioning capability is reachable from the assembled
// successor Runtime without query-then-insert.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDomainRuntime } from '../../packages/domain-harness/src/runtime/index.js';
import { StaticPackageRegistry } from '../../packages/domain-harness/src/package/registry.js';
import { computeCompiledPackageId } from '../../packages/domain-harness/src/package/validation.js';
import type { DomainMessage } from '../../packages/domain-harness/src/v2/contracts/message.js';
import type { WorkflowAddress } from '../../packages/domain-harness/src/v2/contracts/workflow.js';
import type { RuntimeStore } from '../../packages/domain-harness/src/v2/contracts/store.js';
import {
  AssemblyMemoryStore,
  HOST_MAXIMA,
  compileAssemblyPackage,
  createAssemblyHost,
} from './helpers.js';

const LEGACY_TARGET: WorkflowAddress = { workflowId: 'retained', instanceKey: 'legacy-1' };
const SUCCESSOR_TARGET: WorkflowAddress = { workflowId: 'parent', instanceKey: 'successor-1' };
const CHILD: WorkflowAddress = { workflowId: 'child', instanceKey: 'child-1' };
const CORRELATION_ID = 'assembly-mixed-corr';

function retainedLegacyManifest() {
  return {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'assembly.retained-legacy',
    domainVersion: '1.0.0-retained',
    packageId: 'pending',
    targetProfileId: 'assembly-host@1',
    requiredCapabilities: [],
    workflows: {
      retained: {
        workflowId: 'retained',
        definition: {
          initial: 'idle',
          states: {
            idle: {
              final: false,
              done: [],
              error: [],
              events: {
                ADVANCE: { routes: [{ target: 'notified' }] },
                NOTIFY: { routes: [{ target: 'advanced' }] },
              },
            },
            notified: {
              final: false,
              done: [],
              error: [],
              events: {},
              // Engine-2 semantics: a domain-message effect with NO rejection
              // route is exactly the retained executable IR shape.
              effects: [{
                kind: 'domain-message',
                targetExpression: '$.legacyChild',
                messageType: 'NOTIFY',
              }],
            },
            advanced: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 8 },
        },
        messageContracts: {
          ADVANCE: { type: 'ADVANCE', payloadSchema: {} },
          NOTIFY: { type: 'NOTIFY', payloadSchema: {} },
        },
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
}

test('I-03-ASSEMBLY: mixed retained-0.2 and successor-0.3 instances coexist on one Runtime with exact dispatch and stable pins', async () => {
  const host = createAssemblyHost({
    expression: {
      async evaluate(request) {
        if (request.expression === '$.legacyChild') {
          return { workflowId: 'retained', instanceKey: 'legacy-child' };
        }
        if (request.expression === '$.child') {
          return CHILD;
        }
        return request.input;
      },
    },
  });
  const legacyManifest = retainedLegacyManifest();
  legacyManifest.packageId = await computeCompiledPackageId(legacyManifest, host.sha256);
  const legacyPackage = { manifest: legacyManifest, bindings: {} };
  const successor = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }, { workflowId: 'child', simple: true }],
  });
  const successorPackage = {
    manifest: successor.manifest,
    bindings: {},
    domainData: successor.domainData,
  };
  const registry = new StaticPackageRegistry(
    [legacyPackage, successorPackage],
    legacyPackage.manifest.packageId,
  );
  const store = new AssemblyMemoryStore();
  const runtime = await createDomainRuntime({
    packageRegistry: registry,
    store: store as unknown as RuntimeStore,
    bindings: host,
    supportedPackageDataBounds: { ...HOST_MAXIMA },
    now: () => '2026-09-30T00:00:00.000Z',
  });

  // The retained engine-2 instance: its effect has no rejection route and
  // executes through the historical interpreter untouched.
  await runtime.openInstance({
    address: LEGACY_TARGET,
    correlationId: CORRELATION_ID,
    input: {},
    packageId: legacyPackage.manifest.packageId,
  });
  const legacyChild: WorkflowAddress = { workflowId: 'retained', instanceKey: 'legacy-child' };
  await runtime.openInstance({
    address: legacyChild,
    correlationId: CORRELATION_ID,
    input: {},
    packageId: legacyPackage.manifest.packageId,
  });
  const legacyBefore = await store.getInstance(LEGACY_TARGET);
  assert.ok(legacyBefore);
  assert.equal(legacyBefore.packageId, legacyPackage.manifest.packageId);

  // The successor engine-3 instance on the SAME Runtime and store.
  await runtime.openInstance({
    address: SUCCESSOR_TARGET,
    correlationId: CORRELATION_ID,
    input: {},
    packageId: successorPackage.manifest.packageId,
  });
  await runtime.openInstance({
    address: CHILD,
    correlationId: CORRELATION_ID,
    input: {},
    packageId: successorPackage.manifest.packageId,
  });

  const legacyMessage: DomainMessage = {
    messageId: 'legacy-1',
    target: LEGACY_TARGET,
    type: 'ADVANCE',
    payload: {},
    correlationId: CORRELATION_ID,
  };
  const successorMessage: DomainMessage = {
    messageId: 'successor-1',
    target: SUCCESSOR_TARGET,
    type: 'BEGIN',
    payload: {},
    correlationId: CORRELATION_ID,
  };
  await runtime.send(legacyMessage);
  await runtime.send(successorMessage);
  await runtime.awaitIdle();

  const legacyAfter = await store.getInstance(LEGACY_TARGET);
  assert.ok(legacyAfter);
  assert.equal(legacyAfter.packageId, legacyPackage.manifest.packageId, 'retained pin did not move');
  assert.equal(legacyAfter.lifecycle, 'waiting', 'engine-2 effect semantics executed on the retained instance');
  assert.equal((legacyAfter.state as { stateId: string }).stateId, 'notified');
  const legacyEffects = store
    .listEffects()
    .filter((record) => record.target.workflowId === 'retained');
  assert.equal(legacyEffects.length, 1);
  assert.equal(legacyEffects[0]!.status, 'completed');

  const successorAfter = await store.getInstance(SUCCESSOR_TARGET);
  assert.ok(successorAfter);
  assert.equal(successorAfter.packageId, successorPackage.manifest.packageId, 'successor pin did not move');
  const successorState = successorAfter.state as { stateId: string };
  assert.equal(successorState.stateId, 'acting', 'engine-3 execution proceeded through its own interpreter');
  const successorEffects = store
    .listEffects()
    .filter((record) => record.target.workflowId === 'parent');
  assert.equal(successorEffects.length, 1);
  assert.equal(successorEffects[0]!.status, 'completed');

  const legacyChildAfter = await store.getInstance(legacyChild);
  assert.ok(legacyChildAfter);
  assert.equal(legacyChildAfter.packageId, legacyPackage.manifest.packageId);
  assert.equal(legacyChildAfter.lifecycle, 'completed', 'the retained engine-2 send was accepted by the retained child');
});

test('I-03-ASSEMBLY: I-OPEN atomic provisioning is reachable from the assembled successor Runtime', async () => {
  const host = createAssemblyHost();
  const successor = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }, { workflowId: 'child', simple: true }],
  });
  const registry = new StaticPackageRegistry(
    [{
      manifest: successor.manifest,
      bindings: {},
      domainData: successor.domainData,
    }],
    successor.manifest.packageId,
  );
  const store = new AssemblyMemoryStore();
  const runtime = await createDomainRuntime({
    packageRegistry: registry,
    store: store as unknown as RuntimeStore,
    bindings: host,
    supportedPackageDataBounds: { ...HOST_MAXIMA },
    now: () => '2026-09-30T00:00:00.000Z',
  });

  assert.equal(runtime.provisioning?.status, 'ENABLED');
  if (runtime.provisioning?.status !== 'ENABLED') assert.fail('provisioning capability must be enabled');
  const provisioned = await runtime.provisioning.ensureOpen({
    provisioningKey: 'assembly-key-1',
    address: SUCCESSOR_TARGET,
    correlationId: CORRELATION_ID,
    input: {},
    packageId: successor.manifest.packageId,
  });
  assert.equal(provisioned.provisioningDisposition, 'created');
  assert.equal(provisioned.instanceDisposition, 'created');
  assert.equal(provisioned.instance.packageId, successor.manifest.packageId);
  assert.equal(provisioned.instance.stateRevision, 0);
  assert.equal(store.provisioningOpenCalls, 1, 'provisioning converged in one atomic store call');

  const replay = await runtime.provisioning.ensureOpen({
    provisioningKey: 'assembly-key-1',
    address: SUCCESSOR_TARGET,
    correlationId: CORRELATION_ID,
    input: {},
    packageId: successor.manifest.packageId,
  });
  assert.equal(replay.provisioningDisposition, 'existing');
  assert.equal(replay.instanceDisposition, 'existing');
  assert.equal(store.provisioningOpenCalls, 2);
  assert.equal((await store.getInstance(SUCCESSOR_TARGET))?.lifecycle, 'waiting', 'no automatic initial-state execution');
});

test('I-03-ASSEMBLY: provisioning stays explicitly fail-closed when the store lacks the I-OPEN seam', async () => {
  const host = createAssemblyHost();
  const successor = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }, { workflowId: 'child', simple: true }],
  });
  const registry = new StaticPackageRegistry(
    [{
      manifest: successor.manifest,
      bindings: {},
      domainData: successor.domainData,
    }],
    successor.manifest.packageId,
  );
  const bareStore: RuntimeStore = {
    async createInstance() {},
    async getInstance() { return null; },
    async listPinnedPackageIds() { return []; },
    async acceptMessage() { throw new Error('unused'); },
    async getMessageDisposition() { return null; },
    async getNextAcceptedMessage() { return null; },
    async markMessageProcessing() { return false; },
    async commitProcessedMessage() {},
    async failMessageProcessing() {},
    async terminalizeInstance() {},
    async listUnresolvedMessageTargets() { return []; },
    async reclaimInterruptedProcessing() { return []; },
    async getEffect() { return null; },
    async beginEffect(request) { return request; },
    async completeEffect(request) { return request; },
    async resetRecovery() { throw new Error('unused'); },
  };
  const runtime = await createDomainRuntime({
    packageRegistry: registry,
    store: bareStore,
    bindings: host,
    supportedPackageDataBounds: { ...HOST_MAXIMA },
  });
  // Fail-closed capability reporting: no silent downgrade, no fallback
  // query-then-insert path exists on the assembled Runtime surface.
  assert.equal(runtime.provisioning?.status, 'UNSUPPORTED');
});
