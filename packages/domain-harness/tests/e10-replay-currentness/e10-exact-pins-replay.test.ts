/**
 * E10 claim 1 — exact same accepted pins replay successfully
 * (issue #680; authority #589 PACK-D E10, DAG #534).
 *
 * End-to-end replay over the FULL accepted pin set at the integration HEAD:
 *  - Definition graph (exact, currentness-proven),
 *  - sealed T002B Assembly (definitionGraphDigest + kind implementation pins
 *    + §F/T005A resource requirement material),
 *  - T002C activation/execution pin (package/CDI + governance baseline +
 *    exact assemblyDigest woven into bindingDigest),
 *  - T003C Tool implementation binding evidence (successor Assembly slot),
 *  - T005B resource resolution against the sealed requirement material.
 *
 * Proof shape:
 *  - activation under the sealed Assembly succeeds and is idempotent for the
 *    EXACT same pins (bind-once 'existing', never a conflict);
 *  - replay/recovery with `expectedAssembly` === the exact sealed Assembly
 *    resolves the same assemblyDigest and bindingDigest;
 *  - the T003C binding transition replays deterministically: an independent
 *    re-bind from identical inputs reproduces the identical successor
 *    Assembly digest and evidence digest;
 *  - T005B resolution against the original Assembly and against the T003C
 *    successor Assembly hands the provider byte-identical frozen request
 *    snapshots (resource material survives the successor reseal and replays);
 *  - a from-scratch re-run of the entire chain reproduces every digest
 *    (pin bindingDigest, successor assemblyDigest, evidence bindingDigest).
 *
 * Scope note (#658 boundary, issuecomment-5995416551): a fresh occurrence MAY
 * bind a genuine sealed Assembly by exact identity even after a replacement
 * Assembly exists (#657 CANCELLED; no global current-Assembly authority).
 * This file replays EXISTING pins under the exact-A-only replay semantics,
 * which remains unchanged.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  ResourceResolutionError,
  resolveToolResources,
  type ResourceProvider,
  type ResourceResolutionRequest,
} from '../../src/contracts/resource-resolution.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type BindToolImplementationInput,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  AssemblyExecutionActivator,
  GovernanceBaselineRegistry,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineBody,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';
import type { DomainActivationBinding } from '../../src/governance/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Fixtures: one semantic consumer + one Tool provider in ONE Definition graph,
// so T002C activation, T003C binding and T005B resolution share exact pins.
// ---------------------------------------------------------------------------

const CONSUMER_ID = 'consumer.a';
const TOOL_ID = 'tool.alpha';
const CAPABILITY = { capabilityId: 'cap.calc', version: '1.0.0' };

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: CONSUMER_ID,
    kind: { kindId: 'example.e10-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [CAPABILITY],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: TOOL_ID,
    kind: { kindId: 'example.e10-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.add', inputSchema: {}, outputSchema: {}, effect: 'none' },
        { operationId: 'op.sub', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [CAPABILITY],
    },
  };
}

function graph(): DefinitionGraphEnvelope {
  return { graphId: 'graph.e10', components: [consumer(), toolComponent()], relations: [] };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'example.e10-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.e10-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:e10-kind-content',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

/** The exact §F declaration sealed into every fixture Assembly. */
function resourceRequirementsInput(
  definitionGraph: DefinitionGraphEnvelope,
): NonNullable<Parameters<typeof sealRuntimeAssembly>[0]['resourceRequirements']> {
  const owner = definitionGraph.components.find((component) => component.componentId === TOOL_ID);
  assert.ok(owner, 'fixture: tool.alpha must be a component of the graph');
  return [
    {
      owner,
      declaration: {
        componentId: TOOL_ID,
        requirements: [
          { resourceKey: 'res.workspace-memory', required: true },
          {
            resourceKey: 'res.calc-endpoint',
            contract: { contractId: 'contract.calc-endpoint', version: '1.0.0' },
            operationId: 'op.add',
            required: false,
          },
        ],
      },
    },
  ];
}

async function sealedAssembly(
  definitionGraph: DefinitionGraphEnvelope = graph(),
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [kindBinding()],
      resourceRequirements: resourceRequirementsInput(definitionGraph),
    },
    sha256,
  );
}

async function selectionFor(definitionGraph: DefinitionGraphEnvelope) {
  const digest = await computeDefinitionGraphDigest(definitionGraph, sha256);
  return resolveCurrentCapabilityProvider(
    definitionGraph,
    CAPABILITY,
    CONSUMER_ID,
    digest,
    sha256,
  );
}

function candidate(): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId: 'impl.calc.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl.calc.alpha-content',
    },
    supportedOperations: ['op.add', 'op.sub'],
  };
}

class MemoryExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #records = new Map<string, GovernancePackageCdiBinding>();

  add(binding: GovernancePackageCdiBinding): void {
    this.#records.set(this.#key(binding), { ...binding });
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    const record = this.#records.get(this.#key(binding));
    return record === undefined ? undefined : { ...record };
  }

  #key(binding: GovernancePackageCdiBinding): string {
    return `${binding.domainId} ${binding.packageId} ${binding.domainIntelligenceContentDigest}`;
  }
}

class MemoryDurableExecutionStore implements DurableExecutionStore {
  readonly events: string[] = [];
  readonly #pins = new Map<string, unknown>();
  readonly #snapshots = new Map<string, unknown>();

  async getGovernanceExecutionPin(workflowInstanceId: string): Promise<unknown> {
    return this.#pins.get(workflowInstanceId);
  }

  async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<'inserted' | 'existing' | 'conflict'> {
    this.events.push(`pin:${pin.workflowInstanceId}`);
    const existing = this.#pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.#pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    if (JSON.stringify(existing) === JSON.stringify(pin)) return 'existing';
    return 'conflict';
  }

  async getGovernanceBoundSnapshot(workflowInstanceId: string): Promise<unknown> {
    return this.#snapshots.get(workflowInstanceId);
  }

  async putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    this.events.push(`snapshot:${snapshot.workflowInstanceId}`);
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}

async function governanceBody(label: string): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody(
    {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      version: label,
      semantics: {
        hardInvariants: [{ id: `invariant-${label}`, kind: 'deny-negative-total' }],
        operatorAuthority: label,
      },
    },
    sha256,
  );
}

interface Fixture {
  readonly assembly: SealedRuntimeAssembly;
  readonly definitionGraph: DefinitionGraphEnvelope;
  readonly activator: AssemblyExecutionActivator;
  readonly binding: DomainActivationBinding;
  readonly store: MemoryDurableExecutionStore;
  readonly baseline: GovernanceBaselineBody;
}

async function fixture(): Promise<Fixture> {
  const definitionGraph = graph();
  const assembly = await sealedAssembly(definitionGraph);
  const baseline = await governanceBody('B1');
  const baselines = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(baselines, sha256);
  await registry.register(baseline);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, sha256);
  const binding: DomainActivationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: baseline.identity,
  };
  return { assembly, definitionGraph, activator, binding, store, baseline };
}

const OCCURRENCE = { workflowTarget: 'orders.fulfill', workflowInstanceId: 'instance-e10-1' };

function activationRequest(fx: Fixture) {
  return {
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: fx.binding,
    assembly: fx.assembly,
    currentDefinitionGraph: fx.definitionGraph,
  };
}

async function bindInputFor(fx: Fixture): Promise<BindToolImplementationInput> {
  const selection = await selectionFor(fx.definitionGraph);
  return {
    assembly: fx.assembly,
    selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
    currentDefinitionGraph: fx.definitionGraph,
    implementations: [candidate()],
    sha256,
  };
}

function recordingProvider(calls: ResourceResolutionRequest[]): ResourceProvider {
  const handles: Record<string, unknown> = {
    'res.workspace-memory': { connection: 'opaque-memory' },
    'res.calc-endpoint': { connection: 'opaque-endpoint' },
  };
  return {
    async resolve(request: ResourceResolutionRequest) {
      calls.push(request);
      const contract = request.contract;
      return {
        status: 'resolved' as const,
        handle: handles[request.resourceKey],
        ...(contract !== undefined ? { contract } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Claim 1 tests
// ---------------------------------------------------------------------------

test('E10-1: the exact same accepted pins replay successfully end-to-end (Definition + sealed Assembly + T002C pin + T003C binding + T005B resources)', async () => {
  const fx = await fixture();

  // -- T002C activation under the exact sealed Assembly.
  const pin = await fx.activator.activate(activationRequest(fx));
  assert.equal(pin.assemblyDigest, fx.assembly.assemblyDigest);
  assert.deepEqual(fx.store.events, ['pin:instance-e10-1'], 'exactly one durable pin write');

  // -- Replay of the EXACT same pins: idempotent re-activation (bind-once
  //    'existing', never a conflict) and exact expectedAssembly recovery.
  const reactivated = await fx.activator.activate(activationRequest(fx));
  assert.equal(reactivated.bindingDigest, pin.bindingDigest, 'same pins replay, no conflict');
  assert.deepEqual(
    fx.store.events,
    ['pin:instance-e10-1', 'pin:instance-e10-1'],
    're-activation resolved through the existing bind-once disposition',
  );

  const recovered = await fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.assembly,
  });
  assert.equal(recovered.assemblyDigest, fx.assembly.assemblyDigest);
  assert.equal(recovered.pin.bindingDigest, pin.bindingDigest);
  assert.deepEqual(recovered.governanceBaseline.identity, fx.baseline.identity);

  // -- T003C binding over the SAME sealed Assembly pins the exact
  //    implementation; replaying the bind from identical inputs reproduces
  //    the identical successor Assembly and evidence.
  const boundA = await bindToolImplementation(await bindInputFor(fx));
  const fx2 = await fixture();
  const boundB = await bindToolImplementation(await bindInputFor(fx2));
  assert.equal(
    boundA.successorAssembly.assemblyDigest,
    boundB.successorAssembly.assemblyDigest,
    'the T003C transition replays deterministically',
  );
  assert.equal(boundA.evidence.bindingDigest, boundB.evidence.bindingDigest);
  assert.deepEqual(boundA.evidence, boundB.evidence);
  assert.equal(
    boundA.successorAssembly.record.definitionGraphDigest,
    fx.assembly.record.definitionGraphDigest,
    'Definition identity is unchanged by the binding transition',
  );

  // -- T005B resources: the §F material sealed into the ORIGINAL Assembly is
  //    carried byte-identically into the successor and resolves identically —
  //    the provider receives byte-identical frozen request snapshots.
  assert.deepEqual(
    boundA.successorAssembly.record.resourceRequirements,
    fx.assembly.record.resourceRequirements,
    'resource requirement material survives the successor reseal',
  );

  const callsOriginal: ResourceResolutionRequest[] = [];
  const resolvedOriginal = await resolveToolResources({
    assembly: fx.assembly,
    componentId: TOOL_ID,
    operationId: 'op.add',
    provider: recordingProvider(callsOriginal),
  });
  const callsSuccessor: ResourceResolutionRequest[] = [];
  const resolvedSuccessor = await resolveToolResources({
    assembly: boundA.successorAssembly,
    componentId: TOOL_ID,
    operationId: 'op.add',
    provider: recordingProvider(callsSuccessor),
  });

  assert.deepEqual(
    callsSuccessor,
    callsOriginal.map((request) => ({ ...request })),
    'the provider receives the same exact frozen requests against the successor',
  );
  assert.equal(callsOriginal.length, 2, 'both sealed requirements were requested');
  assert.equal(resolvedOriginal.resources.size, 2);
  assert.equal(resolvedSuccessor.resources.size, 2);
  for (const key of ['res.workspace-memory', 'res.calc-endpoint']) {
    assert.equal(resolvedSuccessor.resources.get(key)?.status, 'resolved');
  }

  // -- Full-chain determinism: a from-scratch re-run reproduces every digest.
  assert.equal(fx2.assembly.assemblyDigest, fx.assembly.assemblyDigest);
  const pin2 = await fx2.activator.activate(activationRequest(fx2));
  assert.equal(pin2.bindingDigest, pin.bindingDigest);
});

test('E10-1: replay resolution is failure-free only for the exact pins — a missing required resource still fails closed during replay-time resolution', async () => {
  const fx = await fixture();
  await fx.activator.activate(activationRequest(fx));
  const recovered = await fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.assembly,
  });
  assert.equal(recovered.assemblyDigest, fx.assembly.assemblyDigest);

  // A provider that denies the REQUIRED resource fails closed at replay-time
  // resolution — exact pins never degrade into ambient/default resources.
  const denying: ResourceProvider = {
    async resolve(request) {
      return request.required
        ? { status: 'absent' }
        : { status: 'resolved', handle: { connection: 'opaque' } };
    },
  };
  await assert.rejects(
    resolveToolResources({
      assembly: fx.assembly,
      componentId: TOOL_ID,
      provider: denying,
    }),
    (error: unknown) =>
      error instanceof ResourceResolutionError && error.code === 'MISSING_REQUIRED_RESOURCE',
  );
});
