/**
 * E10 claim 6 — no second pin hierarchy exists (structural assertion)
 * (issue #680; authority #589 PACK-D E10, DAG #534).
 *
 * Structural proof that the T002C assembly-activation integration extended
 * the ONE existing pin hierarchy instead of paralleling it:
 *  - activation performs exactly ONE durable write through the shared
 *    `GovernanceExecutionPin` shape (no parallel store/event family);
 *  - the pin record shape is exactly the pre-existing tuple plus the single
 *    woven `assemblyDigest` field — no new pin type, no second digest
 *    hierarchy;
 *  - the pinned occurrence resolves identically (same bindingDigest record)
 *    through every existing entry point: the pre-T002C
 *    `GovernanceExecutionCoordinator`, the v0.7 `AssemblyExecutionActivator`
 *    gate, and `recover` — one hierarchy, three views;
 *  - the consumed durable-store surface is exactly the documented
 *    `DurableExecutionStore` method set — no second persistence family was
 *    introduced for assembly authority.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  AssemblyExecutionActivator,
  GovernanceBaselineRegistry,
  MemoryGovernanceBaselineStore,
  GovernanceExecutionCoordinator,
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

function component(componentId: string): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: 'example.e10-kind', version: '1.0.0' },
    requiredSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    requiredCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    semanticBody: { threshold: 10 },
  };
}

function graph(): DefinitionGraphEnvelope {
  return { graphId: 'graph.e10-hierarchy', components: [component('component.a')], relations: [] };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'example.e10-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:alpha-content',
      },
    },
    understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    validateComponent: () => {},
  };
}

async function sealedAssembly(
  definitionGraph: DefinitionGraphEnvelope,
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding()] },
    sha256,
  );
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

/** Store implementing EXACTLY the documented DurableExecutionStore surface. */
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

const OCCURRENCE = { workflowTarget: 'orders.fulfill', workflowInstanceId: 'instance-e10-hier' };

test('E10-6: activation performs exactly one durable write through the shared pin shape — no parallel store family', async () => {
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

  await activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
      governanceBaseline: baseline.identity,
    } satisfies DomainActivationBinding,
    assembly,
    currentDefinitionGraph: definitionGraph,
  });

  // One durable write, one event family, the pre-existing pin shape.
  assert.deepEqual(store.events, ['pin:instance-e10-hier']);
});

test('E10-6: the pin record shape is exactly the pre-existing tuple plus the single woven assemblyDigest field', async () => {
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
  const activator = new AssemblyExecutionActivator(
    new MemoryDurableExecutionStore(),
    packageCdi,
    baselines,
    sha256,
  );

  const pin = await activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
      governanceBaseline: baseline.identity,
    },
    assembly,
    currentDefinitionGraph: definitionGraph,
  });

  assert.deepEqual(
    Object.keys(pin).sort(),
    [
      'assemblyDigest',
      'bindingDigest',
      'domainId',
      'domainIntelligenceContentDigest',
      'governanceBaseline',
      'packageId',
      'workflowInstanceId',
      'workflowTarget',
    ],
    'no second pin type: the exact pre-existing fields plus the one woven assemblyDigest',
  );
});

test('E10-6: the same occurrence resolves to the identical pin record through the coordinator, the v0.7 gate and recovery — one hierarchy', async () => {
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

  const pin = await activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
      governanceBaseline: baseline.identity,
    },
    assembly,
    currentDefinitionGraph: definitionGraph,
  });

  // Three entry points, ONE durable record, identical content.
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  const viaCoordinator = await coordinator.requirePinnedExecution(OCCURRENCE.workflowInstanceId);
  const viaGate = await activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  const viaRecovery = await activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: assembly,
  });

  assert.deepEqual(viaCoordinator, pin, 'the pre-existing coordinator reads the same record');
  assert.deepEqual(viaGate, pin, 'the v0.7 gate reads the same record');
  assert.deepEqual(viaRecovery.pin, pin, 'recovery reads the same record');
  assert.equal(viaRecovery.assemblyDigest, assembly.assemblyDigest);
});

test('E10-6: the consumed durable-store surface is exactly the documented DurableExecutionStore method set', async () => {
  const store = new MemoryDurableExecutionStore();
  const proto = Object.getPrototypeOf(store) as object;

  assert.deepEqual(
    Object.getOwnPropertyNames(proto).filter((name) => name !== 'constructor').sort(),
    [
      'bindGovernanceExecutionPin',
      'getGovernanceBoundSnapshot',
      'getGovernanceExecutionPin',
      'putGovernanceBoundSnapshot',
    ],
    'no second persistence family: exactly the four documented methods',
  );

  // The pins are plain frozen data records (no class hierarchy paralleling
  // the store): prototype is Object.prototype.
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
  const activator = new AssemblyExecutionActivator(
    new MemoryDurableExecutionStore(),
    packageCdi,
    baselines,
    sha256,
  );
  const pin = await activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
      governanceBaseline: baseline.identity,
    },
    assembly,
    currentDefinitionGraph: definitionGraph,
  });
  assert.equal(Object.getPrototypeOf(pin), Object.prototype, 'data-only pin record');
  assert.ok(Object.isFrozen(pin), 'immutable pin record');
});
