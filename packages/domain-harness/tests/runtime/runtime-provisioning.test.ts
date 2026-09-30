// Issue #180 focused tests — additive Runtime provisioning ensure/open
// capability composition on real Runtime boundaries (portable in-memory
// reference store; Node/Expo host durability is proven by the adapter waves
// and the shared provisioning conformance corpus).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDomainRuntime } from '../../src/runtime/index.js';
import { StaticPackageRegistry } from '../../src/package/registry.js';
import { computeCompiledPackageId } from '../../src/package/validation.js';
import type {
  EnsureProvisionedWorkflowInstanceOpenResult,
  ProvisionAndOpenWorkflowInstanceRequest,
  RuntimeInstanceProvisioningStore,
  RuntimeProvisioningCapability,
} from '../../src/runtime/durable-control-contracts.js';
import { DurableControlError } from '../../src/runtime/durable-control-coordinator.js';
import type { RuntimeStore } from '../../src/v2/contracts/store.js';
import type { RuntimeHostBindings, TargetCompiledDomainPackage } from '../../src/v2/index.js';
import type { WorkflowInstanceSnapshot } from '../../src/v2/contracts/workflow.js';
import type {
  RuntimeObservationIntent,
  RuntimeObservationPage,
  RuntimeObservationReadRequest,
  RuntimeObservationRecord,
} from '../../src/observation/contracts.js';
import { createRuntimeHostFake } from '../helpers/runtime-host-fake.js';

const DOMAIN_ID = 't180-provisioning';
const ADDRESS = { workflowId: 'claims', instanceKey: 'claim-42' } as const;

function buildPackage(): TargetCompiledDomainPackage {
  return {
    manifest: {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      domainId: DOMAIN_ID,
      domainVersion: '1.0.0-t180',
      packageId: 'pending',
      targetProfileId: 't180-host@1',
      requiredCapabilities: [],
      workflows: {
        claims: {
          workflowId: 'claims',
          definition: {
            initial: 'reviewing',
            states: {
              reviewing: {
                final: false,
                done: [],
                error: [],
                events: { APPROVE: { routes: [{ target: 'approved' }] } },
              },
              approved: { final: true, done: [], error: [], events: {} },
            },
            limits: { maxSteps: 32 },
          },
          messageContracts: {
            APPROVE: { type: 'APPROVE', payloadSchema: {} },
          },
        },
      },
      tools: {},
      projections: {},
      schemas: {},
      bindingDigests: {},
    },
    bindings: {},
  };
}

type ConvergeMode = 'converge' | 'sabotage-record';

/**
 * Minimal in-memory RuntimeStore + atomic I-OPEN provisioning seam. The
 * converge logic mirrors the frozen adapter decision order (key reconcile ->
 * instance create-or-return) so the Runtime composition is tested against a
 * contract-faithful store rather than a pass-through stub. The observation-v1
 * surface is present as inert passthroughs so observation mode composes.
 */
// Structural duck-typing only (no `implements` claim): isRuntimeObservationStore
// is a runtime capability guard, and the full RuntimeStore member set beyond the
// members used here is irrelevant to this composition test.
class ProvisioningMemoryStore implements RuntimeInstanceProvisioningStore {
  readonly #instances = new Map<string, WorkflowInstanceSnapshot>();
  readonly #keys = new Set<string>();
  readonly #observations = new Map<string, RuntimeObservationRecord[]>();
  openCalls = 0;
  withObservationCalls = 0;
  lastIntent: RuntimeObservationIntent | undefined;
  acceptedMessages = 0;
  createdInstances = 0;

  constructor(readonly convergeMode: ConvergeMode = 'converge') {}

  async ensureProvisionedWorkflowInstanceOpen(
    request: ProvisionAndOpenWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceOpenResult> {
    this.openCalls += 1;
    return this.#converge(request);
  }

  async ensureProvisionedWorkflowInstanceOpenWithObservation(
    request: ProvisionAndOpenWorkflowInstanceRequest,
    intent: RuntimeObservationIntent | undefined,
  ): Promise<{
    readonly result: EnsureProvisionedWorkflowInstanceOpenResult;
    readonly records: readonly RuntimeObservationRecord[];
  }> {
    this.withObservationCalls += 1;
    this.lastIntent = intent;
    const result = await this.#converge(request);
    let records: RuntimeObservationRecord[] = [];
    if (result.instanceDisposition === 'created' && intent !== undefined) {
      records = [
        {
          stream: {
            target: request.target,
            package: intent.packageIdentity,
            epochId: '1',
          },
          sequence: 1,
          observationId: 'obs-1',
          kind: 'INSTANCE_OPENED',
          observedAt: intent.observedAt,
        },
      ];
      this.#observations.set(`${request.target.workflowId}/${request.target.instanceKey}`, records);
    }
    return { result, records };
  }

  readObservations(request: RuntimeObservationReadRequest): Promise<RuntimeObservationPage> {
    const records = this.#observations.get(
      `${request.stream.target.workflowId}/${request.stream.target.instanceKey}`,
    );
    return Promise.resolve({
      records: records ?? [],
      highWatermark: records?.length ?? 0,
    });
  }

  async #converge(
    request: ProvisionAndOpenWorkflowInstanceRequest,
  ): Promise<EnsureProvisionedWorkflowInstanceOpenResult> {
    const key = `${request.target.workflowId}/${request.target.instanceKey}`;
    const provisioningDisposition = this.#keys.has(request.provisioningKey) ? 'existing' : 'created';
    this.#keys.add(request.provisioningKey);

    const existing = this.#instances.get(key);
    if (existing !== undefined) {
      return {
        provisioningDisposition,
        instanceDisposition: 'existing',
        record: this.#record(request),
        instance: structuredClone(existing),
      };
    }
    this.#instances.set(key, structuredClone(request.initialInstance));
    this.createdInstances += 1;
    return {
      provisioningDisposition,
      instanceDisposition: 'created',
      record: this.#record(request),
      instance: structuredClone(request.initialInstance),
    };
  }

  #record(
    request: ProvisionAndOpenWorkflowInstanceRequest,
  ): EnsureProvisionedWorkflowInstanceOpenResult['record'] {
    return {
      provisioningKey: request.provisioningKey,
      target: request.target,
      correlationId:
        this.convergeMode === 'sabotage-record' ? 'different-material' : request.correlationId,
      packageId: request.packageId,
      input: request.input,
      createdAt: request.requestedAt,
    };
  }

  // ---- RuntimeStore surface (only the members Runtime construction uses) ----

  async createInstance(snapshot: WorkflowInstanceSnapshot): Promise<void> {
    this.createdInstances += 1;
    this.#instances.set(
      `${snapshot.address.workflowId}/${snapshot.address.instanceKey}`,
      structuredClone(snapshot),
    );
  }

  async getInstance(target: {
    workflowId: string;
    instanceKey: string;
  }): Promise<WorkflowInstanceSnapshot | null> {
    const snapshot = this.#instances.get(`${target.workflowId}/${target.instanceKey}`);
    return snapshot === undefined ? null : structuredClone(snapshot);
  }

  async listPinnedPackageIds(): Promise<readonly string[]> {
    return [];
  }

  async listUnresolvedMessageTargets(): Promise<readonly []> {
    return [];
  }

  async reclaimInterruptedProcessing(): Promise<readonly string[]> {
    return [];
  }

  async acceptMessage(): Promise<never> {
    this.acceptedMessages += 1;
    throw new Error('acceptMessage is not part of this composition test');
  }

  // ---- inert observation-v1 passthroughs (compose-only) ----

  async createInstanceWithObservation(
    snapshot: WorkflowInstanceSnapshot,
  ): Promise<readonly RuntimeObservationRecord[]> {
    await this.createInstance(snapshot);
    return [];
  }

  async acceptMessageWithObservation(): Promise<never> {
    this.acceptedMessages += 1;
    throw new Error('acceptMessage is not part of this composition test');
  }

  async commitProcessedMessageWithObservation(): Promise<readonly RuntimeObservationRecord[]> {
    throw new Error('commitProcessedMessage is not part of this composition test');
  }

  async failMessageProcessingWithObservation(): Promise<readonly RuntimeObservationRecord[]> {
    throw new Error('failMessageProcessing is not part of this composition test');
  }

  async resetRecoveryWithObservation(): Promise<never> {
    throw new Error('resetRecovery is not part of this composition test');
  }

  async terminalizeInstanceWithObservation(): Promise<readonly RuntimeObservationRecord[]> {
    throw new Error('terminalizeInstance is not part of this composition test');
  }
}

function resolvePackageIdentity(packageId: string) {
  return {
    domainId: DOMAIN_ID,
    version: '1.0.0-t180',
    packageId,
    contentDigest: 'sha256:t180-content',
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    requiredCapabilities: [] as readonly string[],
  };
}

interface SetupOptions {
  readonly store?: ProvisioningMemoryStore;
  readonly observation?: boolean;
  readonly now?: () => string;
}

async function buildRegistry(): Promise<StaticPackageRegistry> {
  const bindings: RuntimeHostBindings = createRuntimeHostFake();
  const compiledPackage = buildPackage();
  compiledPackage.manifest.packageId = await computeCompiledPackageId(
    compiledPackage.manifest,
    bindings.sha256,
  );
  return new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId);
}

async function setup(options: SetupOptions = {}) {
  const store = options.store ?? new ProvisioningMemoryStore();
  const bindings: RuntimeHostBindings = createRuntimeHostFake();
  const compiledPackage = buildPackage();
  compiledPackage.manifest.packageId = await computeCompiledPackageId(
    compiledPackage.manifest,
    bindings.sha256,
  );
  const registry = new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId);
  const runtime = await createDomainRuntime({
    packageRegistry: registry,
    store: store as unknown as RuntimeStore,
    bindings,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.observation === true
      ? { observation: { mode: 'enabled' as const, resolvePackageIdentity } }
      : {}),
  });
  return { runtime, store };
}

function capabilityOf(runtime: {
  provisioning?: RuntimeProvisioningCapability;
}): RuntimeProvisioningCapability {
  assert.ok(runtime.provisioning !== undefined, 'runtime provisioning capability must exist');
  return runtime.provisioning;
}

test('#180 provisioning capability is UNSUPPORTED without the atomic store seam', async () => {
  const runtime = await createDomainRuntime({
    packageRegistry: await buildRegistry(),
    // Deliberately seam-less: a plain store must keep every existing semantic.
    store: {
      async listPinnedPackageIds() {
        return [];
      },
      async listUnresolvedMessageTargets() {
        return [];
      },
      async reclaimInterruptedProcessing() {
        return [];
      },
    } as unknown as RuntimeStore,
    bindings: createRuntimeHostFake(),
  });
  assert.equal(capabilityOf(runtime).status, 'UNSUPPORTED');
});

test('#180 ensureOpen materializes the exact revision-0 snapshot computed by Runtime', async () => {
  const requestedAt = '2026-09-30T09:00:00.000Z';
  const { runtime, store } = await setup({ now: () => requestedAt });
  const capability = capabilityOf(runtime);
  assert.equal(capability.status, 'ENABLED');
  if (capability.status !== 'ENABLED') return;

  const outcome = await capability.ensureOpen({
    provisioningKey: 'tenant-a:claim-42',
    address: ADDRESS,
    correlationId: 'request-42',
    input: { claimId: '42', amount: 125 },
  });

  assert.equal(outcome.instanceDisposition, 'created');
  assert.equal(outcome.provisioningDisposition, 'created');
  assert.deepEqual(outcome.instance, {
    address: ADDRESS,
    correlationId: 'request-42',
    packageId: (await store.getInstance(ADDRESS))?.packageId,
    lifecycle: 'waiting',
    stateRevision: 0,
    state: {
      stateId: 'reviewing',
      data: { claimId: '42', amount: 125 },
      lastMessage: null,
      lastResult: null,
    },
    createdAt: requestedAt,
    updatedAt: requestedAt,
  });
  const persisted = await store.getInstance(ADDRESS);
  assert.ok(persisted !== null, 'ensureOpen must persist through the atomic seam');
  assert.deepEqual(persisted, outcome.instance);
  // No auto-run: the initial state was never executed — nothing was accepted
  // or processed, and the mailbox path was never entered.
  assert.equal(store.acceptedMessages, 0);
  assert.equal(store.openCalls, 1);
});

test('#180 exact ensureOpen replay returns the existing instance without reset', async () => {
  const requestedAt = '2026-09-30T09:00:00.000Z';
  const { runtime, store } = await setup({ now: () => requestedAt });
  const capability = capabilityOf(runtime);
  assert.equal(capability.status, 'ENABLED');
  if (capability.status !== 'ENABLED') return;

  await capability.ensureOpen({
    provisioningKey: 'tenant-a:claim-42',
    address: ADDRESS,
    correlationId: 'request-42',
    input: { claimId: '42' },
  });
  const replay = await capability.ensureOpen({
    provisioningKey: 'tenant-a:claim-42',
    address: ADDRESS,
    correlationId: 'request-42',
    input: { claimId: '42' },
  });
  assert.equal(replay.instanceDisposition, 'existing');
  assert.equal(replay.provisioningDisposition, 'existing');
  assert.equal(store.createdInstances, 1, 'replay must not create a second logical instance');
});

test('#180 ensureOpen surfaces coordinator fail-closed identity validation', async () => {
  const { runtime } = await setup({ store: new ProvisioningMemoryStore('sabotage-record') });
  const capability = capabilityOf(runtime);
  assert.equal(capability.status, 'ENABLED');
  if (capability.status !== 'ENABLED') return;

  await assert.rejects(
    () =>
      capability.ensureOpen({
        provisioningKey: 'tenant-a:claim-42',
        address: ADDRESS,
        correlationId: 'request-42',
        input: { claimId: '42' },
      }),
    (error: unknown) =>
      error instanceof DurableControlError && error.code === 'PROVISIONING_IDENTITY_CONFLICT',
  );
});

test('#180 empty provisioning key fails closed before storage', async () => {
  const { runtime, store } = await setup();
  const capability = capabilityOf(runtime);
  assert.equal(capability.status, 'ENABLED');
  if (capability.status !== 'ENABLED') return;

  await assert.rejects(
    () =>
      capability.ensureOpen({
        provisioningKey: '',
        address: ADDRESS,
        correlationId: 'request-42',
        input: { claimId: '42' },
      }),
    (error: unknown) => error instanceof DurableControlError && error.code === 'INVALID_ARGUMENT',
  );
  assert.equal(store.openCalls, 0);
});

test('#180 observation mode routes ensureOpen through the same-transaction observation form', async () => {
  const { runtime, store } = await setup({ observation: true });
  const capability = capabilityOf(runtime);
  assert.equal(capability.status, 'ENABLED');
  if (capability.status !== 'ENABLED') return;

  const outcome = await capability.ensureOpen({
    provisioningKey: 'tenant-a:claim-42',
    address: ADDRESS,
    correlationId: 'request-42',
    input: { claimId: '42' },
  });
  assert.equal(outcome.instanceDisposition, 'created');
  assert.equal(store.withObservationCalls, 1, 'observation mode must use the WithObservation form');
  assert.equal(store.openCalls, 0, 'observation mode must not silently downgrade to the plain form');
  assert.ok(store.lastIntent !== undefined && store.lastIntent.kind === 'INSTANCE_OPENED');
});

test('#180 observation mode fails closed when the store lacks the observation-capable form', async () => {
  // A store with the plain seam but WITHOUT the observation-capable provisioning
  // form: in observation mode instance materialization is a covered
  // INSTANCE_OPENED mutation, so the capability must be UNSUPPORTED rather
  // than emit an unobserved instance write.
  // Runtime property shadow: the observation-capable provisioning form is
  // absent (an own `undefined` property replaces the inherited prototype
  // method for the capability guard).
  const plainOnly = new ProvisioningMemoryStore();
  Object.defineProperty(plainOnly, 'ensureProvisionedWorkflowInstanceOpenWithObservation', {
    value: undefined,
    configurable: true,
  });
  const runtime = await createDomainRuntime({
    packageRegistry: await buildRegistry(),
    store: plainOnly as unknown as RuntimeStore,
    bindings: createRuntimeHostFake(),
    observation: { mode: 'enabled', resolvePackageIdentity },
  });
  assert.equal(capabilityOf(runtime).status, 'UNSUPPORTED');
});

test('#180 retained openInstance still uses the legacy createInstance path, not the seam', async () => {
  const { runtime, store } = await setup();
  const instance = await runtime.openInstance({
    address: ADDRESS,
    correlationId: 'request-42',
    input: { claimId: '42' },
  });
  assert.equal(instance.lifecycle, 'waiting');
  assert.equal(store.openCalls, 0, 'openInstance must not consume the provisioning seam');
  assert.equal(store.withObservationCalls, 0);
});
