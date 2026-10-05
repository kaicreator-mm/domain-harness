/**
 * E10 claim 5 — replay never resolves mutable aliases / latest / default
 * bindings (issue #680; authority #589 PACK-D E10, DAG #534).
 *
 * Proof matrix:
 *  - the replay seam (`AssemblyExecutionActivator.recover`) accepts ONLY a
 *    genuine sealed T002B Assembly as `expectedAssembly`; a caller-forged
 *    object carrying a floating alias digest (`latest`, `alias:...`,
 *    `@current`) fails ASSEMBLY_NOT_SEALED at the gate — there is no string
 *    alias parameter anywhere in the replay API to exploit;
 *  - pin minting rejects floating assembly digests (ASSEMBLY_DIGEST_FORBIDDEN
 *    / FLOATING_EXECUTION_AUTHORITY_FORBIDDEN) — an alias can never enter the
 *    durable pin hierarchy;
 *  - replay resolves the EXACT pinned Governance Baseline, never "latest":
 *    registering a NEWER baseline (B2) after activation changes nothing for
 *    the pin bound to B1 — recovery returns B1's identity, and a second
 *    occurrence may still activate under B1 despite B2 existing;
 *  - re-binding (T003C) during recovery preparation rejects floating
 *    candidate identities (`latest`, range versions `1.x`) with
 *    FLOATING_AUTHORITY_REFERENCE_FORBIDDEN and empty digests with
 *    INVALID_BINDING_INPUT — never first/latest/default resolution.
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
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  ToolImplementationBindingError,
  type BindToolImplementationInput,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  AssemblyExecutionActivator,
  GovernanceBaselineRegistry,
  GovernanceExecutionBindingError,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  createGovernanceExecutionPin,
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
      ],
      providesCapabilities: [CAPABILITY],
    },
  };
}

function graph(): DefinitionGraphEnvelope {
  return { graphId: 'graph.e10-alias', components: [consumer(), toolComponent()], relations: [] };
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

async function sealedAssembly(
  definitionGraph: DefinitionGraphEnvelope = graph(),
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding()] },
    sha256,
  );
}

function candidate(
  implementationId: string,
  implementationOverrides: Record<string, string> = {},
): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${implementationId}-content`,
      ...implementationOverrides,
    },
    supportedOperations: ['op.add'],
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
  readonly #pins = new Map<string, unknown>();
  readonly #snapshots = new Map<string, unknown>();

  async getGovernanceExecutionPin(workflowInstanceId: string): Promise<unknown> {
    return this.#pins.get(workflowInstanceId);
  }

  async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<'inserted' | 'existing' | 'conflict'> {
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

async function bindInputFor(
  assembly: SealedRuntimeAssembly,
  definitionGraph: DefinitionGraphEnvelope,
  candidates: readonly ToolImplementationCandidate[],
): Promise<BindToolImplementationInput> {
  const digest = await computeDefinitionGraphDigest(definitionGraph, sha256);
  const selection = await resolveCurrentCapabilityProvider(
    definitionGraph,
    CAPABILITY,
    CONSUMER_ID,
    digest,
    sha256,
  );
  return {
    assembly,
    selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
    currentDefinitionGraph: definitionGraph,
    implementations: candidates,
    sha256,
  };
}

function expectToolBindingError(
  promise: Promise<unknown>,
  code: string,
): Promise<ToolImplementationBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected ToolImplementationBindingError(${code}), but binding resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof ToolImplementationBindingError,
        `expected ToolImplementationBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

const OCCURRENCE = { workflowTarget: 'orders.fulfill', workflowInstanceId: 'instance-e10-alias' };

test('E10-5: a forged expectedAssembly carrying a floating alias digest is rejected at the replay gate (ASSEMBLY_NOT_SEALED)', async () => {
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
  const binding: DomainActivationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: baseline.identity,
  };
  await activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding,
    assembly,
    currentDefinitionGraph: definitionGraph,
  });

  for (const alias of ['latest', 'current', 'alias:orders-live', '@current', 'active']) {
    const forgedAliasAssembly = {
      record: assembly.record,
      assemblyDigest: alias,
      bindings: assembly.bindings,
    } as unknown as SealedRuntimeAssembly;
    await assert.rejects(
      activator.recover({
        workflowInstanceId: OCCURRENCE.workflowInstanceId,
        expectedAssembly: forgedAliasAssembly,
      }),
      (error: unknown) =>
        error instanceof GovernanceExecutionBindingError && error.code === 'ASSEMBLY_NOT_SEALED',
      `alias ${alias} must never satisfy replay`,
    );
  }

  // The replay API has no alias resolution surface: only a sealed Assembly
  // object or nothing can be supplied.
  assert.equal(activator.recover.length, 1, 'recover takes exactly one request object');
});

test('E10-5: floating assembly digests can never enter the durable pin hierarchy', async () => {
  const baseline = await governanceBody('B1');
  const binding: DomainActivationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: baseline.identity,
  };
  for (const alias of ['latest', 'current', 'alias:orders-live', '@latest', 'active']) {
    await assert.rejects(
      createGovernanceExecutionPin({ ...OCCURRENCE, binding, assemblyDigest: alias }, sha256),
      (error: unknown) =>
        error instanceof GovernanceExecutionBindingError &&
        (error.code === 'ASSEMBLY_DIGEST_FORBIDDEN' ||
          error.code === 'FLOATING_EXECUTION_AUTHORITY_FORBIDDEN'),
      `pin minting must reject alias ${alias}`,
    );
  }
});

test('E10-5: replay resolves the EXACT pinned Governance Baseline, never a newer/latest baseline', async () => {
  const definitionGraph = graph();
  const assembly = await sealedAssembly(definitionGraph);
  const b1 = await governanceBody('B1');
  const b2 = await governanceBody('B2');
  const baselines = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(baselines, sha256);
  await registry.register(b1);
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
    governanceBaseline: b1.identity,
  };
  await activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding,
    assembly,
    currentDefinitionGraph: definitionGraph,
  });

  // A NEWER baseline is registered after activation. Replay must still
  // resolve the exact pinned B1 — never "latest".
  await registry.register(b2);
  const recovered = await activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: assembly,
  });
  assert.deepEqual(recovered.governanceBaseline.identity, b1.identity, 'exact pinned baseline');
  assert.notDeepEqual(recovered.governanceBaseline.identity, b2.identity);

  // The pre-existing coordinator resolves the same exact baseline identity.
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  const pin = await coordinator.requirePinnedExecution(OCCURRENCE.workflowInstanceId);
  assert.deepEqual(pin.governanceBaseline, b1.identity, 'never upgraded to latest');
});

test('E10-5: T003C re-bind during recovery preparation rejects floating candidate identities — never first/latest/default', async () => {
  const definitionGraph = graph();
  const assembly = await sealedAssembly(definitionGraph);

  await expectToolBindingError(
    bindToolImplementation(
      await bindInputFor(assembly, definitionGraph, [candidate('latest')]),
    ),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
  await expectToolBindingError(
    bindToolImplementation(
      await bindInputFor(assembly, definitionGraph, [
        candidate('impl.calc.alpha', { implementationVersion: '1.x' }),
      ]),
    ),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
  await expectToolBindingError(
    bindToolImplementation(
      await bindInputFor(assembly, definitionGraph, [
        candidate('impl.calc.alpha', { implementationDigest: '' }),
      ]),
    ),
    'INVALID_BINDING_INPUT',
  );

  // Multiple distinct genuine candidates without an exact pin are AMBIGUOUS —
  // never first-wins (a "default").
  await expectToolBindingError(
    bindToolImplementation(
      await bindInputFor(assembly, definitionGraph, [
        candidate('impl.calc.alpha'),
        candidate('impl.calc.bravo'),
      ]),
    ),
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );
});
