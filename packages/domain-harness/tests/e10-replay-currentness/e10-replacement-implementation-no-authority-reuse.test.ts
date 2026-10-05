/**
 * E10 claim 3 — replacement Kind/Tool implementation with unchanged
 * Definition cannot reuse old runtime authority
 * (issue #680; authority #589 PACK-D E10, DAG #534).
 *
 * Proof at both replacement planes with the Definition graph held fixed:
 *  - Kind plane (T002B seal): re-sealing over the SAME Definition graph with a
 *    replaced Kind implementation pin yields a different exact assemblyDigest
 *    while record.definitionGraphDigest is unchanged; the occurrence pinned
 *    under the old Assembly cannot replay against the replacement
 *    (ASSEMBLY_REPLAY_MISMATCH) and the replacement cannot overwrite the
 *    pinned occurrence (GOVERNANCE_EXECUTION_PIN_CONFLICT).
 *  - Tool plane (T003C bind): binding a replacement Tool implementation over
 *    the same sealed Assembly/selection mints a successor Assembly with a
 *    different digest and new exact evidence (implementationId/version/
 *    digest); the old evidence digest is retired — the replacement evidence
 *    carries the new pin, never the old one.
 *  - Runtime authority is not identity: the live implementation handle is
 *    paired with the pin OUTSIDE all digest material, so re-binding with the
 *    OLD handle vs a NEW handle produces identical evidence digests; the old
 *    handle therefore grants nothing, and a re-bind demanding the replacement
 *    pin fails MISSING_TOOL_IMPLEMENTATION when only the old candidate is
 *    offered.
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
  return { graphId: 'graph.e10-repl', components: [consumer(), toolComponent()], relations: [] };
}

function kindBinding(implementationId: string): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'example.e10-kind', version: '1.0.0' },
      implementation: {
        implementationId,
        implementationVersion: '1.0.0',
        implementationDigest: `sha256:${implementationId}-kind-content`,
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

async function sealAssembly(
  kindImplementationId: string,
  definitionGraph: DefinitionGraphEnvelope = graph(),
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding(kindImplementationId)] },
    sha256,
  );
}

function candidate(
  implementationId: string,
  overrides: Partial<ToolImplementationCandidate> = {},
  implementationOverrides: Record<string, string> = {},
): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${implementationId}-content`,
      ...implementationOverrides,
    },
    supportedOperations: ['op.add', 'op.sub'],
    ...overrides,
  };
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

async function bindOver(
  assembly: SealedRuntimeAssembly,
  definitionGraph: DefinitionGraphEnvelope,
  candidates: readonly ToolImplementationCandidate[],
  overrides: Partial<BindToolImplementationInput> = {},
): Promise<Awaited<ReturnType<typeof bindToolImplementation>>> {
  const selection = await selectionFor(definitionGraph);
  return bindToolImplementation({
    assembly,
    selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
    currentDefinitionGraph: definitionGraph,
    implementations: candidates,
    sha256,
    ...overrides,
  });
}

function expectBindingError(
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

const OCCURRENCE = { workflowTarget: 'orders.fulfill', workflowInstanceId: 'instance-e10-repl' };

test('E10-3 (Kind plane): a replacement Kind implementation with unchanged Definition cannot satisfy the old pin and cannot overwrite it', async () => {
  const definitionGraph = graph();
  const original = await sealAssembly('impl.kind.alpha', definitionGraph);
  const replacement = await sealAssembly('impl.kind.bravo', definitionGraph);

  assert.equal(
    replacement.record.definitionGraphDigest,
    original.record.definitionGraphDigest,
    'Definition identity unchanged by the Kind replacement',
  );
  assert.notEqual(replacement.assemblyDigest, original.assemblyDigest);

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

  const pin = await activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding,
    assembly: original,
    currentDefinitionGraph: definitionGraph,
  });
  assert.equal(pin.assemblyDigest, original.assemblyDigest);

  // The replacement cannot reuse the old runtime authority: replay demands
  // the exact pinned Assembly.
  await assert.rejects(
    activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: replacement,
    }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError && error.code === 'ASSEMBLY_REPLAY_MISMATCH',
  );

  // Nor can it overwrite the pinned occurrence.
  await assert.rejects(
    activator.activate({
      workflowTarget: OCCURRENCE.workflowTarget,
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      binding,
      assembly: replacement,
      currentDefinitionGraph: definitionGraph,
    }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
  const retained = await activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(retained.assemblyDigest, original.assemblyDigest, 'old exact authority retained');
});

test('E10-3 (Tool plane): a replacement Tool implementation mints a different successor Assembly and retires the old evidence pin', async () => {
  const definitionGraph = graph();
  const assembly = await sealAssembly('impl.kind.alpha', definitionGraph);

  const boundOld = await bindOver(assembly, definitionGraph, [candidate('impl.calc.alpha')]);
  const boundNew = await bindOver(assembly, definitionGraph, [
    candidate('impl.calc.bravo', {}, { implementationVersion: '2.0.0' }),
  ]);

  // Replacement identity split: Definition digest unchanged, everything else
  // about the binding evidence changes.
  assert.equal(
    boundNew.successorAssembly.record.definitionGraphDigest,
    boundOld.successorAssembly.record.definitionGraphDigest,
  );
  assert.notEqual(
    boundNew.successorAssembly.assemblyDigest,
    boundOld.successorAssembly.assemblyDigest,
  );
  assert.notEqual(boundNew.evidence.bindingDigest, boundOld.evidence.bindingDigest);
  assert.equal(boundOld.evidence.implementation.implementationId, 'impl.calc.alpha');
  assert.equal(boundNew.evidence.implementation.implementationId, 'impl.calc.bravo');
  assert.equal(boundNew.evidence.implementation.implementationVersion, '2.0.0');

  // A replay of the OLD pin against the NEW successor fails closed.
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
  await activator.activate({
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding,
    assembly: boundOld.successorAssembly,
    currentDefinitionGraph: definitionGraph,
  });
  await assert.rejects(
    activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: boundNew.successorAssembly,
    }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError && error.code === 'ASSEMBLY_REPLAY_MISMATCH',
  );
});

test('E10-3 (runtime authority is not identity): the old implementation handle grants nothing; handle choice never changes any digest', async () => {
  const definitionGraph = graph();
  const assembly = await sealAssembly('impl.kind.alpha', definitionGraph);

  const oldHandle = { connection: 'old-runtime', token: 'old-secret' };
  const newHandle = { connection: 'new-runtime', token: 'new-secret' };

  const withOld = await bindOver(assembly, definitionGraph, [
    candidate('impl.calc.alpha', { handle: oldHandle }),
  ]);
  const withNew = await bindOver(assembly, definitionGraph, [
    candidate('impl.calc.alpha', { handle: newHandle }),
  ]);

  // Identical pin identity + different runtime handles => identical evidence:
  // the handle is paired OUTSIDE all digest material, so it carries no
  // authority and cannot resurrect retired authority either.
  assert.equal(withOld.evidence.bindingDigest, withNew.evidence.bindingDigest);
  assert.equal(
    withOld.successorAssembly.assemblyDigest,
    withNew.successorAssembly.assemblyDigest,
  );
  assert.equal(withOld.implementationHandle, oldHandle, 'old handle paired by reference');
  assert.equal(withNew.implementationHandle, newHandle, 'new handle paired by reference');
  assert.equal(JSON.stringify(withNew.evidence).includes('new-secret'), false);

  // Demanding the replacement pin while only the OLD candidate is offered
  // fails closed — the old runtime authority cannot satisfy the new pin.
  await expectBindingError(
    bindOver(
      assembly,
      definitionGraph,
      [candidate('impl.calc.alpha')],
      {
        exactPin: {
          implementationId: 'impl.calc.bravo',
          implementationVersion: '2.0.0',
          implementationDigest: 'sha256:impl.calc.bravo-content',
        },
      },
    ),
    'MISSING_TOOL_IMPLEMENTATION',
  );
});
