/**
 * T002C invariant matrix - atomic activation/execution pin integration
 * (issues #617, #589 PACK-B T002C; builds on the T002B sealed Assembly of
 * #587/PR #604 and the existing authoritative activation/occurrence authority
 * of `governance/execution-binding.ts`).
 *
 * Frozen scope under test (#589 T002C, MICROKERNEL):
 *  - the EXISTING `GovernanceExecutionPin` / `DomainActivationBinding` /
 *    `GovernanceExecutionCoordinator` / `DurableExecutionStore` /
 *    `recoverGovernanceExecutionAuthority` hierarchy is extended, never
 *    paralleled: the exact sealed `assemblyDigest` is atomically bound into
 *    the existing package/governance/currentness/runtime-occurrence tuple;
 *  - every authority-bearing pin field is synchronously snapshotted before
 *    any await (torn-activation adversarial mutation cannot produce hybrid
 *    authority);
 *  - activation is all-or-nothing: missing/stale/replaced Definition or
 *    Assembly/currentness fails closed;
 *  - replay/recovery resolves the same exact Assembly identity, never a
 *    mutable provider alias;
 *  - a sealed Assembly alone is NOT activation authority;
 *  - the pin carries no Tool/Workflow-specific semantics.
 *
 * Required tests per #589 PACK-B T002C:
 *   torn-activation adversarial mutation; stale Assembly rejection;
 *   replacement Assembly invalidates old currentness; replay exact-pin
 *   resolution; immutable/non-aliased output; no second pin hierarchy.
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
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
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

/**
 * A Sha256Port whose next digest call blocks until the test releases it, so
 * the test can interleave adversarial caller mutation mid-await. Used AFTER
 * fixture construction, so it must gate the next digest rather than an
 * absolute counter value.
 */
class GatedSha256 implements Sha256Port {
  #gate: { readonly entered: () => void; readonly release: () => Promise<void> } | undefined;

  pauseNext(): { readonly entered: Promise<void>; readonly release: () => void } {
    let enteredResolve!: () => void;
    let releaseResolve!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredResolve = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      releaseResolve = resolve;
    });
    this.#gate = {
      entered: enteredResolve,
      release: () => {
        enteredResolve();
        return releasePromise;
      },
    };
    return { entered, release: () => releaseResolve() };
  }

  async digestUtf8(value: string): Promise<string> {
    const gate = this.#gate;
    if (gate !== undefined) {
      this.#gate = undefined;
      gate.entered();
      await gate.release();
    }
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
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

// ---------------------------------------------------------------------------
// Assembly fixtures (T002B sealing)
// ---------------------------------------------------------------------------

function component(componentId: string, overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    requiredSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    requiredCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    semanticBody: { threshold: 10 },
    ...overrides,
  };
}

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.assembly-activation',
    components: [component('component.a')],
    relations: [],
    ...overrides,
  };
}

function kindBinding(
  overrides: Partial<KindImplementationBindingInput> = {},
): KindImplementationBindingInput {
  return {
    pin: {
      kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.semantic-kind.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:alpha-content',
      },
    },
    understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    validateComponent: () => {},
    ...overrides,
  };
}

function replacedKindBinding(): KindImplementationBindingInput {
  return kindBinding({
    pin: {
      kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.semantic-kind.bravo',
        implementationVersion: '2.0.0',
        implementationDigest: 'sha256:bravo-content',
      },
    },
  });
}

async function sealAssembly(
  overrides: {
    readonly graph?: DefinitionGraphEnvelope;
    readonly kindImplementations?: readonly KindImplementationBindingInput[];
  } = {},
  port: Sha256Port = sha256,
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    {
      definitionGraph: overrides.graph ?? graph(),
      kindImplementations: overrides.kindImplementations ?? [kindBinding()],
    },
    port,
  );
}

// ---------------------------------------------------------------------------
// Governance / authority fixtures
// ---------------------------------------------------------------------------

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
  readonly b1: GovernanceBaselineBody;
  readonly baselines: MemoryGovernanceBaselineStore;
  readonly packageCdi: MemoryExactPackageCdiAuthority;
  readonly store: MemoryDurableExecutionStore;
  readonly activator: AssemblyExecutionActivator;
  readonly binding: DomainActivationBinding;
  readonly assembly: SealedRuntimeAssembly;
  readonly currentGraph: DefinitionGraphEnvelope;
}

async function fixture(
  port: Sha256Port = sha256,
  overrides: {
    readonly graph?: DefinitionGraphEnvelope;
    readonly kindImplementations?: readonly KindImplementationBindingInput[];
  } = {},
): Promise<Fixture> {
  const b1 = await governanceBody('B1');
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
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, port);
  const binding: DomainActivationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: b1.identity,
  };
  const currentGraph = overrides.graph ?? graph();
  const assembly = await sealAssembly({ graph: currentGraph, ...overrides }, port);
  return { b1, baselines, packageCdi, store, activator, binding, assembly, currentGraph };
}

const OCCURRENCE = { workflowTarget: 'orders.fulfill', workflowInstanceId: 'instance-1' };

function activationRequest(input: {
  readonly binding: DomainActivationBinding;
  readonly assembly: SealedRuntimeAssembly;
  readonly currentGraph: DefinitionGraphEnvelope;
}) {
  return {
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: input.binding,
    assembly: input.assembly,
    currentDefinitionGraph: input.currentGraph,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('T002C: activation binds the exact sealed assemblyDigest into the existing pin tuple', async () => {
  const fx = await fixture();
  const pin = await fx.activator.activate(activationRequest(fx));

  assert.equal(pin.assemblyDigest, fx.assembly.assemblyDigest, 'exact sealed Assembly identity is bound');
  assert.equal(pin.workflowInstanceId, OCCURRENCE.workflowInstanceId);
  assert.equal(pin.packageId, 'pkg-orders-1', 'existing package tuple is preserved');
  assert.deepEqual(pin.governanceBaseline, fx.b1.identity, 'existing governance tuple is preserved');

  // The pin digest commits to the assemblyDigest: a no-assembly pin differs.
  const legacyPin = await createGovernanceExecutionPin({ ...OCCURRENCE, binding: fx.binding }, sha256);
  assert.notEqual(
    pin.bindingDigest,
    legacyPin.bindingDigest,
    'bindingDigest covers the assemblyDigest',
  );

  // Durable + re-readable through the SAME store/coordinator hierarchy.
  const reread = await fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(reread.assemblyDigest, fx.assembly.assemblyDigest);
  const viaExistingCoordinator = await new GovernanceExecutionCoordinator(
    fx.store,
    sha256,
  ).requirePinnedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(viaExistingCoordinator.bindingDigest, pin.bindingDigest);
});

test('T002C: torn-activation adversarial mutation during await cannot alter the snapshotted pin', async () => {
  const port = new GatedSha256();
  const fx = await fixture(port);
  // Sanity: the fixture graph is exactly the graph the Assembly was sealed over.
  const originalGraphDigest = await computeDefinitionGraphDigest(fx.currentGraph, sha256);
  assert.equal(originalGraphDigest, fx.assembly.record.definitionGraphDigest);
  // Pause inside the FIRST async digest of activation (Definition-currentness
  // recomputation), which happens only after the synchronous PHASE-1 snapshot.
  const gate = port.pauseNext();

  const request = activationRequest(fx);
  const activating = fx.activator.activate(request);
  await gate.entered;

  // Adversarially mutate every caller-owned authority input mid-flight.
  (request.binding as { packageId: string }).packageId = 'pkg-EVIL-torn';
  (request.binding as { domainIntelligenceContentDigest: string }).domainIntelligenceContentDigest =
    'cdi-EVIL-torn';
  (request.currentDefinitionGraph.components[0] as { semanticBody: unknown }).semanticBody = {
    threshold: 999999,
  };

  gate.release();
  const pin = await activating;

  // The pin reflects the synchronous PHASE-1 snapshot, never the torn mutation.
  assert.equal(pin.packageId, 'pkg-orders-1');
  assert.equal(pin.domainIntelligenceContentDigest, 'cdi-orders-1');
  assert.equal(pin.assemblyDigest, fx.assembly.assemblyDigest);

  // The graph mutation was real (it changes the live graph digest), yet
  // activation still resolved -- proof that Definition currentness was proven
  // against the synchronous PHASE-1 snapshot, not a caller object re-read
  // after the await.
  const mutatedGraphDigest = await computeDefinitionGraphDigest(request.currentDefinitionGraph, sha256);
  assert.notEqual(mutatedGraphDigest, fx.assembly.record.definitionGraphDigest);
});

test('T002C: stale/replaced Definition graph fails closed (ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH)', async () => {
  const fx = await fixture();
  const staleGraph = graph({
    components: [component('component.a', { semanticBody: { threshold: 42 } })],
  });
  await assert.rejects(
    fx.activator.activate(
      activationRequest({ binding: fx.binding, assembly: fx.assembly, currentGraph: staleGraph }),
    ),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH',
  );
  assert.deepEqual(fx.store.events, [], 'no pin is bound when Definition currentness fails');
});

test('T002C: replacement Assembly invalidates old currentness and cannot overwrite the pinned occurrence', async () => {
  const fx = await fixture();
  const replacementAssembly = await sealAssembly({ kindImplementations: [replacedKindBinding()] });
  assert.notEqual(replacementAssembly.assemblyDigest, fx.assembly.assemblyDigest);

  const original = await fx.activator.activate(activationRequest(fx));

  // Re-activating the same occurrence under a different exact Assembly conflicts
  // (bind-once) and never replaces the retained old authority.
  await assert.rejects(
    fx.activator.activate(
      activationRequest({
        binding: fx.binding,
        assembly: replacementAssembly,
        currentGraph: fx.currentGraph,
      }),
    ),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
  const retained = await fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(retained.bindingDigest, original.bindingDigest, 'old exact authority is retained');
  assert.equal(retained.assemblyDigest, fx.assembly.assemblyDigest, 'never the replacement Assembly');
});

test('T002C: replay/recovery resolves the same exact Assembly identity, never a mutable alias', async () => {
  const fx = await fixture();
  await fx.activator.activate(activationRequest(fx));
  const replacementAssembly = await sealAssembly({ kindImplementations: [replacedKindBinding()] });

  const recovered = await fx.activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId });
  assert.equal(recovered.assemblyDigest, fx.assembly.assemblyDigest, 'exact Assembly identity resolved');
  assert.equal(recovered.pin.workflowInstanceId, OCCURRENCE.workflowInstanceId);

  // Exact replay against the same sealed Assembly succeeds.
  const matched = await fx.activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.assembly,
  });
  assert.equal(matched.assemblyDigest, fx.assembly.assemblyDigest);

  // A replacement Assembly is NOT an acceptable replay target for the old pin.
  await assert.rejects(
    fx.activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: replacementAssembly,
    }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError && error.code === 'ASSEMBLY_REPLAY_MISMATCH',
  );
});

test('T002C: forged (non-sealed) assemblies can never mint activation authority', async () => {
  const fx = await fixture();
  const forged = {
    record: fx.assembly.record,
    assemblyDigest: fx.assembly.assemblyDigest,
    bindings: [],
  } as unknown as SealedRuntimeAssembly;

  await assert.rejects(
    fx.activator.activate(
      activationRequest({ binding: fx.binding, assembly: forged, currentGraph: fx.currentGraph }),
    ),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError && error.code === 'ASSEMBLY_NOT_SEALED',
  );
  assert.deepEqual(fx.store.events, [], 'a forged assembly binds nothing');

  await assert.rejects(
    fx.activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: forged,
    }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError && error.code === 'ASSEMBLY_NOT_SEALED',
  );
});

test('T002C: floating/alias assembly digests are rejected (immutable, non-aliased output)', async () => {
  const fx = await fixture();
  for (const bad of ['latest', 'current', 'alias:orders-live', '@current', 'active']) {
    await assert.rejects(
      createGovernanceExecutionPin({ ...OCCURRENCE, binding: fx.binding, assemblyDigest: bad }, sha256),
      (error: unknown) =>
        error instanceof GovernanceExecutionBindingError &&
        (error.code === 'ASSEMBLY_DIGEST_FORBIDDEN' ||
          error.code === 'FLOATING_EXECUTION_AUTHORITY_FORBIDDEN'),
    );
  }

  const pin = await fx.activator.activate(activationRequest(fx));
  assert.ok(Object.isFrozen(pin), 'the pin is frozen');
  assert.ok(Object.isFrozen(pin.governanceBaseline), 'nested governance identity is frozen');
});

test('T002C: all-or-nothing activation fails closed on missing package/CDI or governance currentness', async () => {
  const fx = await fixture();
  const missingPackageCdi = new MemoryExactPackageCdiAuthority();
  const activator = new AssemblyExecutionActivator(fx.store, missingPackageCdi, fx.baselines, sha256);
  await assert.rejects(
    activator.activate(activationRequest(fx)),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'PACKAGE_CDI_BINDING_MISMATCH',
  );

  const emptyBaselines = new MemoryGovernanceBaselineStore();
  const noBaselineActivator = new AssemblyExecutionActivator(
    fx.store,
    fx.packageCdi,
    emptyBaselines,
    sha256,
  );
  await assert.rejects(
    noBaselineActivator.activate(activationRequest(fx)),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'GOVERNANCE_BASELINE_BINDING_MISMATCH',
  );
  assert.deepEqual(fx.store.events, [], 'no partial pin is ever bound');
});

test('T002C: a sealed Assembly alone is NOT activation authority', async () => {
  const fx = await fixture();
  // Sealed but never activated: neither the v0.7 gate nor the existing
  // coordinator resolves any execution authority for the occurrence.
  await assert.rejects(
    fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'GOVERNANCE_EXECUTION_PIN_MISSING',
  );
  await assert.rejects(
    fx.activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'GOVERNANCE_EXECUTION_PIN_MISSING',
  );
  assert.deepEqual(fx.store.events, [], 'sealing alone binds no pin');
});

test('T002C: the v0.7 gate fails closed when a recovered pin carries no exact Assembly (no silent fallback)', async () => {
  const fx = await fixture();
  // Legacy pin without an Assembly (pre-T002C shape) is still valid legacy
  // authority, but the v0.7 assembly-activation gate refuses it - no fallback.
  const legacy = new GovernanceExecutionCoordinator(fx.store, sha256);
  await legacy.pinExecution({ ...OCCURRENCE, binding: fx.binding });

  await assert.rejects(
    fx.activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError && error.code === 'MISSING_ASSEMBLY_DIGEST',
  );
  await assert.rejects(
    fx.activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError && error.code === 'MISSING_ASSEMBLY_DIGEST',
  );
});

test('T002C: no second pin hierarchy - activation reuses the ONE durable store and pin shape', async () => {
  const fx = await fixture();
  await fx.activator.activate(activationRequest(fx));

  // Exactly one durable write, through the shared GovernanceExecutionPin shape;
  // no parallel store/event family was introduced.
  assert.deepEqual(fx.store.events, ['pin:instance-1']);

  // The same occurrence resolves through the pre-existing coordinator API and
  // the pre-existing recovery API - one hierarchy, not two.
  const existingCoordinator = new GovernanceExecutionCoordinator(fx.store, sha256);
  const pin = await existingCoordinator.requirePinnedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(pin.assemblyDigest, fx.assembly.assemblyDigest);

  const recovered = await fx.activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId });
  assert.equal(recovered.pin.bindingDigest, pin.bindingDigest);
});
