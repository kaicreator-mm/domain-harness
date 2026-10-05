/**
 * T002D invariant matrix - Production vs Simulation runtime authority class
 * (issues #655, #589 PACK-B T002D, #534 DAG T002D; composed additively into
 * the T002C atomic activation/execution pin of #617).
 *
 * Frozen scope under test (#589 T002D):
 *  - `RuntimeAuthorityClass = PRODUCTION | SIMULATION` belongs to the
 *    Assembly/activation/runtime authority plane, NOT Domain Definition
 *    identity: the same Definition backs production and simulation pins;
 *  - the class is woven into the ONE existing pin hierarchy
 *    (`GovernanceExecutionPin.bindingDigest`), never a second pin/currentness
 *    plane; legacy pins without class material keep byte-identical legacy
 *    digests;
 *  - class mismatch fails closed BEFORE effect/publication with the typed
 *    taxonomy (`AUTHORITY_CLASS_FORBIDDEN` / `AUTHORITY_CLASS_MISMATCH`);
 *  - simulation may execute/observe under simulation semantics but CANNOT
 *    satisfy production authoritative occurrence, durable business
 *    effect/publication or production journal authority
 *    (`requireProductionEffectAuthority` gate);
 *  - no aliasing/substitution: equal Definition identity or similar
 *    implementation contents never imply equal authority class;
 *  - the class is captured in exact activation/currentness evidence and is
 *    immutable once pinned (replay preserves the exact class).
 *
 * Required tests per #589 PACK-B T002D / #655:
 *   same Definition with two authority classes; cross-class substitution
 *   rejected; simulation cannot mint production effect authority; replay
 *   preserves class; class mutation after pin creation cannot alter evidence;
 *   byte-identical legacy digest preservation.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import {
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../../src/contracts/identity.js';
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
  requireRuntimeAuthorityClass,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineBody,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
  type RuntimeAuthorityClass,
} from '../../src/governance/index.js';
import type { DomainActivationBinding } from '../../src/governance/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

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

  /** Test-only escape hatch: a mutable clone for tamper tests. */
  rawPin(workflowInstanceId: string): Record<string, unknown> {
    return structuredClone(this.#pins.get(workflowInstanceId)) as Record<string, unknown>;
  }

  /** Test-only escape hatch: install a tampered raw record. */
  installRawPin(workflowInstanceId: string, pin: Record<string, unknown>): void {
    this.#pins.set(workflowInstanceId, pin);
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
// Assembly fixtures (T002B sealing, identical to the T002C matrix)
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

function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.assembly-activation',
    components: [component('component.a')],
    relations: [],
  };
}

function kindBinding(): KindImplementationBindingInput {
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
  };
}

async function sealAssembly(
  currentGraph: DefinitionGraphEnvelope,
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    { definitionGraph: currentGraph, kindImplementations: [kindBinding()] },
    sha256,
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

async function fixture(): Promise<Fixture> {
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
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, sha256);
  const binding: DomainActivationBinding = {
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
    governanceBaseline: b1.identity,
  };
  const currentGraph = graph();
  const assembly = await sealAssembly(currentGraph);
  return { b1, baselines, packageCdi, store, activator, binding, assembly, currentGraph };
}

function activationRequest(input: {
  readonly workflowInstanceId: string;
  readonly binding: DomainActivationBinding;
  readonly assembly: SealedRuntimeAssembly;
  readonly currentGraph: DefinitionGraphEnvelope;
  readonly authorityClass?: RuntimeAuthorityClass;
}) {
  return {
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: input.workflowInstanceId,
    binding: input.binding,
    assembly: input.assembly,
    ...(input.authorityClass === undefined ? {} : { authorityClass: input.authorityClass }),
    currentDefinitionGraph: input.currentGraph,
  };
}

// ---------------------------------------------------------------------------
// Required tests
// ---------------------------------------------------------------------------

test('T002D: the same Definition backs PRODUCTION and SIMULATION activations under distinct evidence', async () => {
  const fx = await fixture();

  const production = await fx.activator.activate(
    activationRequest({
      workflowInstanceId: 'instance-prod',
      binding: fx.binding,
      assembly: fx.assembly,
      currentGraph: fx.currentGraph,
      authorityClass: 'PRODUCTION',
    }),
  );
  const simulation = await fx.activator.activate(
    activationRequest({
      workflowInstanceId: 'instance-sim',
      binding: fx.binding,
      assembly: fx.assembly,
      currentGraph: fx.currentGraph,
      authorityClass: 'SIMULATION',
    }),
  );

  // Same Definition, same sealed Assembly, same package/governance tuple:
  // only the authority class differs.
  assert.equal(production.assemblyDigest, fx.assembly.assemblyDigest);
  assert.equal(simulation.assemblyDigest, fx.assembly.assemblyDigest);
  assert.deepEqual(production.governanceBaseline, simulation.governanceBaseline);

  // ...and that single difference is part of the exact currentness evidence.
  assert.equal(production.authorityClass, 'PRODUCTION');
  assert.equal(simulation.authorityClass, 'SIMULATION');
  assert.notEqual(
    production.bindingDigest,
    simulation.bindingDigest,
    'authority class is woven into the pin digest',
  );

  // Both resolve through the SAME pin hierarchy and store.
  const coordinator = new GovernanceExecutionCoordinator(fx.store, sha256);
  assert.equal(
    (await coordinator.requirePinnedExecution('instance-prod')).authorityClass,
    'PRODUCTION',
  );
  assert.equal(
    (await coordinator.requirePinnedExecution('instance-sim')).authorityClass,
    'SIMULATION',
  );
});

test('T002D: cross-class substitution is rejected (replay expectation, re-activation, invalid tokens)', async () => {
  const fx = await fixture();
  await fx.activator.activate(
    activationRequest({
      workflowInstanceId: 'instance-prod',
      binding: fx.binding,
      assembly: fx.assembly,
      currentGraph: fx.currentGraph,
      authorityClass: 'PRODUCTION',
    }),
  );

  // Replay/recovery with the wrong expected class fails closed.
  await assert.rejects(
    fx.activator.recover({
      workflowInstanceId: 'instance-prod',
      expectedAuthorityClass: 'SIMULATION',
    }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'AUTHORITY_CLASS_MISMATCH',
  );

  // Re-activating the same occurrence under a different class is a different
  // pin: bind-once conflicts and never overwrites the retained authority.
  await assert.rejects(
    fx.activator.activate(
      activationRequest({
        workflowInstanceId: 'instance-prod',
        binding: fx.binding,
        assembly: fx.assembly,
        currentGraph: fx.currentGraph,
        authorityClass: 'SIMULATION',
      }),
    ),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
  const retained = await fx.activator.requireActivatedExecution('instance-prod');
  assert.equal(retained.authorityClass, 'PRODUCTION', 'original class is retained');

  // Non-exact class tokens are forbidden (no aliases, no implicit classes).
  for (const bad of ['production', 'simulation', 'PROD', 'latest', 'current', 'alias:prod', 7, null]) {
    await assert.rejects(
      createGovernanceExecutionPin(
        { workflowTarget: 'orders.fulfill', workflowInstanceId: 'x', binding: fx.binding, authorityClass: bad as RuntimeAuthorityClass },
        sha256,
      ),
      (error: unknown) =>
        error instanceof GovernanceExecutionBindingError &&
        error.code === 'AUTHORITY_CLASS_FORBIDDEN',
    );
  }
  for (const bad of ['', 'PRODUCTION ', ' SIMULATION']) {
    assert.throws(
      () => requireRuntimeAuthorityClass(bad, 'authorityClass'),
      (error: unknown) =>
        error instanceof GovernanceExecutionBindingError &&
        error.code === 'AUTHORITY_CLASS_FORBIDDEN',
    );
  }
});

test('T002D: a SIMULATION pin can never mint production effect/publication authority', async () => {
  const fx = await fixture();
  await fx.activator.activate(
    activationRequest({
      workflowInstanceId: 'instance-sim',
      binding: fx.binding,
      assembly: fx.assembly,
      currentGraph: fx.currentGraph,
      authorityClass: 'SIMULATION',
    }),
  );

  // Simulation executes/observes (activation gate + replay resolve fine)...
  const simulationPin = await fx.activator.requireActivatedExecution('instance-sim');
  assert.equal(simulationPin.authorityClass, 'SIMULATION');
  const recovered = await fx.activator.recover({
    workflowInstanceId: 'instance-sim',
    expectedAuthorityClass: 'SIMULATION',
  });
  assert.equal(recovered.pin.authorityClass, 'SIMULATION');

  // ...but it fails closed BEFORE any production effect/publication.
  await assert.rejects(
    fx.activator.requireProductionEffectAuthority('instance-sim'),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'AUTHORITY_CLASS_MISMATCH',
  );

  // A PRODUCTION pin satisfies the same gate on the same pin hierarchy.
  await fx.activator.activate(
    activationRequest({
      workflowInstanceId: 'instance-prod',
      binding: fx.binding,
      assembly: fx.assembly,
      currentGraph: fx.currentGraph,
      authorityClass: 'PRODUCTION',
    }),
  );
  const productionPin = await fx.activator.requireProductionEffectAuthority('instance-prod');
  assert.equal(productionPin.authorityClass, 'PRODUCTION');

  // A legacy class-less pin is never silently treated as production either.
  await fx.activator.activate(
    activationRequest({
      workflowInstanceId: 'instance-legacy',
      binding: fx.binding,
      assembly: fx.assembly,
      currentGraph: fx.currentGraph,
    }),
  );
  await assert.rejects(
    fx.activator.requireProductionEffectAuthority('instance-legacy'),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'AUTHORITY_CLASS_MISMATCH',
  );
});

test('T002D: replay preserves the exact pinned authority class', async () => {
  const fx = await fixture();
  await fx.activator.activate(
    activationRequest({
      workflowInstanceId: 'instance-prod',
      binding: fx.binding,
      assembly: fx.assembly,
      currentGraph: fx.currentGraph,
      authorityClass: 'PRODUCTION',
    }),
  );

  // Replay without an expectation still resolves the pinned class exactly.
  const replayed = await fx.activator.recover({ workflowInstanceId: 'instance-prod' });
  assert.equal(replayed.pin.authorityClass, 'PRODUCTION');

  // Replay with the matching expectation succeeds; the digest evidence is
  // byte-identical to the activation-time pin.
  const activated = await fx.activator.requireActivatedExecution('instance-prod');
  const matched = await fx.activator.recover({
    workflowInstanceId: 'instance-prod',
    expectedAssembly: fx.assembly,
    expectedAuthorityClass: 'PRODUCTION',
  });
  assert.equal(matched.pin.bindingDigest, activated.bindingDigest);

  // The pin validates through the pre-existing recovery seam too.
  const recovered = await fx.activator.recover({ workflowInstanceId: 'instance-prod' });
  assert.ok(Object.isFrozen(recovered.pin), 'recovered pin is frozen');
});

test('T002D: class mutation after pin creation cannot alter the evidence', async () => {
  const fx = await fixture();
  const pin = await fx.activator.activate(
    activationRequest({
      workflowInstanceId: 'instance-prod',
      binding: fx.binding,
      assembly: fx.assembly,
      currentGraph: fx.currentGraph,
      authorityClass: 'PRODUCTION',
    }),
  );
  const originalDigest = pin.bindingDigest;

  // The pin and every field reachable from it are immutable.
  assert.ok(Object.isFrozen(pin));
  assert.throws(
    () => {
      (pin as { authorityClass: unknown }).authorityClass = 'SIMULATION';
    },
    /read only|read-only|Cannot assign/,
    'frozen pin rejects class mutation in strict mode',
  );

  // Mutating the durable record's class field breaks digest validation: the
  // evidence cannot be rewritten under the old digest.
  const raw = fx.store.rawPin('instance-prod');
  raw.authorityClass = 'SIMULATION';
  fx.store.installRawPin('instance-prod', raw);
  await assert.rejects(
    fx.activator.requireActivatedExecution('instance-prod'),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'INVALID_GOVERNANCE_EXECUTION_PIN',
  );
  raw.authorityClass = 'PRODUCTION';
  fx.store.installRawPin('instance-prod', raw);
  const restored = await fx.activator.requireActivatedExecution('instance-prod');
  assert.equal(restored.bindingDigest, originalDigest, 'exact evidence restored');

  // A same-instance pin differing only by class conflicts; the retained pin
  // keeps its original class and digest.
  await assert.rejects(
    fx.activator.activate(
      activationRequest({
        workflowInstanceId: 'instance-prod',
        binding: fx.binding,
        assembly: fx.assembly,
        currentGraph: fx.currentGraph,
        authorityClass: 'SIMULATION',
      }),
    ),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
  const retained = await fx.activator.requireActivatedExecution('instance-prod');
  assert.equal(retained.authorityClass, 'PRODUCTION');
  assert.equal(retained.bindingDigest, originalDigest);
});

test('T002D: legacy pins without class material keep byte-identical legacy digests', async () => {
  const fx = await fixture();

  // Legacy pin: no Assembly, no authority class - exactly the pre-T002C/T002D
  // material and digest.
  const legacy = await createGovernanceExecutionPin(
    { workflowTarget: 'orders.fulfill', workflowInstanceId: 'instance-legacy', binding: fx.binding },
    sha256,
  );
  assert.equal(legacy.authorityClass, undefined);
  assert.ok(!('authorityClass' in legacy), 'legacy pin carries no class field at all');
  const expectedLegacyDigest = await computeCanonicalJsonDigest(
    {
      packageId: fx.binding.packageId,
      domainIntelligenceContentDigest: fx.binding.domainIntelligenceContentDigest,
      governanceBaseline: {
        domainId: fx.binding.governanceBaseline.domainId,
        governanceId: fx.binding.governanceBaseline.governanceId,
        schemaVersion: fx.binding.governanceBaseline.schemaVersion,
        contentDigest: fx.binding.governanceBaseline.contentDigest,
      },
    },
    sha256,
  );
  assert.equal(
    legacy.bindingDigest,
    expectedLegacyDigest,
    'legacy digest material is byte-identical to the pre-T002D shape',
  );

  // Assembly-bound legacy-class pin matches the T002C digest exactly: adding
  // T002D changed nothing when no class is supplied.
  const assemblyOnly = await createGovernanceExecutionPin(
    {
      workflowTarget: 'orders.fulfill',
      workflowInstanceId: 'instance-assembly',
      binding: fx.binding,
      assemblyDigest: fx.assembly.assemblyDigest,
    },
    sha256,
  );
  const expectedAssemblyDigest = await computeCanonicalJsonDigest(
    {
      packageId: fx.binding.packageId,
      domainIntelligenceContentDigest: fx.binding.domainIntelligenceContentDigest,
      governanceBaseline: {
        domainId: fx.binding.governanceBaseline.domainId,
        governanceId: fx.binding.governanceBaseline.governanceId,
        schemaVersion: fx.binding.governanceBaseline.schemaVersion,
        contentDigest: fx.binding.governanceBaseline.contentDigest,
      },
      assemblyDigest: fx.assembly.assemblyDigest,
    },
    sha256,
  );
  assert.equal(assemblyOnly.bindingDigest, expectedAssemblyDigest);

  // The pre-existing coordinator mints class-less pins unchanged as well.
  const coordinator = new GovernanceExecutionCoordinator(fx.store, sha256);
  const viaCoordinator = await coordinator.pinExecution({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-coordinator',
    binding: fx.binding,
  });
  assert.equal(viaCoordinator.authorityClass, undefined);
  assert.ok(!('authorityClass' in viaCoordinator));
});
