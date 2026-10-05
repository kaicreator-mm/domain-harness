/**
 * T002D invariant matrix - Production vs Simulation runtime authority class
 * (issues #655, #589 PACK-B T002D, #534 DAG T002D; composed additively into
 * the T002C atomic activation/execution pin of #617; repaired post-merge by
 * #688 after Fresh Review #683 found 2xP1 on merged PR #678).
 *
 * Frozen scope under test (#589 T002D, repaired #688):
 *  - `RuntimeAuthorityClass = PRODUCTION | SIMULATION` belongs to the
 *    Assembly/activation/runtime authority plane, NOT Domain Definition
 *    identity: the same Definition backs production and simulation pins;
 *  - the class is woven into the ONE existing pin hierarchy
 *    (`GovernanceExecutionPin.bindingDigest`), never a second pin/currentness
 *    plane; legacy pins without class material keep byte-identical legacy
 *    digests;
 *  - EXPLICIT v0.7 class authority (#688 repair): the v0.7 class-bearing
 *    activation path (`AssemblyExecutionActivator.activate`) REQUIRES the
 *    exact canonical class; a missing/malformed class fails typed
 *    (`AUTHORITY_CLASS_FORBIDDEN`) before any currentness proof or durable
 *    bind - never defaulted, inferred or upgraded;
 *  - UNCONDITIONAL replay class currentness (#688 repair): replay/recovery of
 *    class-bearing history preserves and verifies the exact pinned historical
 *    class even when the caller omits `expectedAuthorityClass` (an expectation
 *    is an additional assertion, never the sole enforcement);
 *  - historical classless compatibility boundary (#688 repair): legacy
 *    class-less pins keep byte-identical digests and replay as historical/
 *    compatibility evidence only - they can never be newly minted through the
 *    v0.7 activation path, re-issued as v0.7 activation/currentness authority,
 *    or upgraded to PRODUCTION;
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
 * Required proofs per #589 PACK-B T002D / #655 / #688:
 *   classless-new-v0.7 activation rejection; historical classless
 *   compatibility boundary; caller-omission replay safety; cross-class
 *   substitution rejected; exact-PRODUCTION effect gate; byte-identical
 *   legacy digest preservation.
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
  type ActivateAssemblyExecutionRequest,
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
  readonly authorityClass: RuntimeAuthorityClass;
}): ActivateAssemblyExecutionRequest {
  return {
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: input.workflowInstanceId,
    binding: input.binding,
    assembly: input.assembly,
    authorityClass: input.authorityClass,
    currentDefinitionGraph: input.currentGraph,
  };
}

/**
 * A v0.7 activation request that carries NO authorityClass - deliberately
 * untyped at the call site so the RUNTIME gate (not the TypeScript compiler)
 * is what rejects it: a JavaScript caller omitting the class must fail typed
 * before anything is bound (#688 repair).
 */
function classlessActivationRequest(input: {
  readonly workflowInstanceId: string;
  readonly binding: DomainActivationBinding;
  readonly assembly: SealedRuntimeAssembly;
  readonly currentGraph: DefinitionGraphEnvelope;
}): ActivateAssemblyExecutionRequest {
  return {
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: input.workflowInstanceId,
    binding: input.binding,
    assembly: input.assembly,
    currentDefinitionGraph: input.currentGraph,
  } as unknown as ActivateAssemblyExecutionRequest;
}

// ---------------------------------------------------------------------------
// Required proofs
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

test('T002D: a classless or malformed class can never mint new v0.7 activation authority (#688 repair)', async () => {
  const fx = await fixture();

  // Omitting the class entirely fails typed - never defaulted, inferred or
  // upgraded - and binds nothing.
  await assert.rejects(
    fx.activator.activate(
      classlessActivationRequest({
        workflowInstanceId: 'instance-classless',
        binding: fx.binding,
        assembly: fx.assembly,
        currentGraph: fx.currentGraph,
      }),
    ),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'AUTHORITY_CLASS_FORBIDDEN',
  );

  // An explicitly-undefined class is equally missing: no default, no PRODUCTION.
  await assert.rejects(
    fx.activator.activate(
      activationRequest({
        workflowInstanceId: 'instance-undefined-class',
        binding: fx.binding,
        assembly: fx.assembly,
        currentGraph: fx.currentGraph,
        authorityClass: undefined as unknown as RuntimeAuthorityClass,
      }),
    ),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'AUTHORITY_CLASS_FORBIDDEN',
  );

  // Malformed/non-canonical tokens through the v0.7 activation path fail the
  // same typed boundary.
  for (const bad of ['production', 'simulation', 'PROD', 'latest', 'current', 'alias:prod', 7, null]) {
    await assert.rejects(
      fx.activator.activate(
        activationRequest({
          workflowInstanceId: 'instance-bad-class',
          binding: fx.binding,
          assembly: fx.assembly,
          currentGraph: fx.currentGraph,
          authorityClass: bad as RuntimeAuthorityClass,
        }),
      ),
      (error: unknown) =>
        error instanceof GovernanceExecutionBindingError &&
        error.code === 'AUTHORITY_CLASS_FORBIDDEN',
    );
  }

  // The typed failure happens BEFORE any durable bind: nothing was pinned.
  assert.deepEqual(fx.store.events, [], 'no classless/malformed activation ever binds a pin');
  assert.equal(await fx.store.getGovernanceExecutionPin('instance-classless'), undefined);
  assert.equal(await fx.store.getGovernanceExecutionPin('instance-undefined-class'), undefined);
  assert.equal(await fx.store.getGovernanceExecutionPin('instance-bad-class'), undefined);

  // And it happens BEFORE currentness proofs: even with a stale Definition
  // graph (which would otherwise fail ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH
  // after the first await), the missing class fails first, synchronously.
  const staleGraph: DefinitionGraphEnvelope = {
    graphId: fx.currentGraph.graphId,
    components: [component('component.a', { semanticBody: { threshold: 20 } })],
    relations: [],
  };
  await assert.rejects(
    fx.activator.activate(
      classlessActivationRequest({
        workflowInstanceId: 'instance-classless-stale',
        binding: fx.binding,
        assembly: fx.assembly,
        currentGraph: staleGraph,
      }),
    ),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'AUTHORITY_CLASS_FORBIDDEN',
  );
  assert.deepEqual(fx.store.events, [], 'still nothing bound');
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

  // A legacy class-less assembly-bound pin (pre-T002D historical shape, minted
  // through the PRE-EXISTING coordinator seam - the v0.7 activation path can
  // no longer mint it, see the classless-rejection proof) is never silently
  // treated as production either: the v0.7 gate refuses it typed before any
  // effect/publication authority is granted.
  const legacy = new GovernanceExecutionCoordinator(fx.store, sha256);
  await legacy.pinExecution({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-legacy',
    binding: fx.binding,
    assemblyDigest: fx.assembly.assemblyDigest,
  });
  await assert.rejects(
    fx.activator.requireProductionEffectAuthority('instance-legacy'),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      (error.code === 'AUTHORITY_CLASS_FORBIDDEN' || error.code === 'AUTHORITY_CLASS_MISMATCH'),
  );
});

test('T002D: replay preserves the exact pinned authority class unconditionally (caller omission is safe) (#688 repair)', async () => {
  const fx = await fixture();
  const activated = await fx.activator.activate(
    activationRequest({
      workflowInstanceId: 'instance-prod',
      binding: fx.binding,
      assembly: fx.assembly,
      currentGraph: fx.currentGraph,
      authorityClass: 'PRODUCTION',
    }),
  );

  // Replay WITHOUT an expectation still verifies and preserves the exact
  // pinned class: the class is part of the digest evidence, so the replayed
  // authority is byte-identical to the activation-time pin.
  const replayed = await fx.activator.recover({ workflowInstanceId: 'instance-prod' });
  assert.equal(replayed.pin.authorityClass, 'PRODUCTION');
  assert.equal(replayed.pin.bindingDigest, activated.bindingDigest);
  assert.ok(Object.isFrozen(replayed.pin), 'recovered pin is frozen');

  // Caller omission must not bypass class currentness: rewriting the durable
  // class evidence under the old digest fails closed even with NO expectation
  // supplied - the pinned class is enforced by the replay itself, and the
  // caller expectation is only an additional assertion.
  const raw = fx.store.rawPin('instance-prod');
  raw.authorityClass = 'SIMULATION';
  fx.store.installRawPin('instance-prod', raw);
  await assert.rejects(
    fx.activator.recover({ workflowInstanceId: 'instance-prod' }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'INVALID_GOVERNANCE_EXECUTION_PIN',
  );
  await assert.rejects(
    fx.activator.recover({ workflowInstanceId: 'instance-prod', expectedAuthorityClass: 'PRODUCTION' }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'INVALID_GOVERNANCE_EXECUTION_PIN',
  );

  // A malformed durable class token is refused typed on every replay path as
  // well (canonical class or nothing).
  raw.authorityClass = 'production';
  fx.store.installRawPin('instance-prod', raw);
  await assert.rejects(
    fx.activator.recover({ workflowInstanceId: 'instance-prod' }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'INVALID_GOVERNANCE_EXECUTION_PIN',
  );

  // Restored evidence: the matching expectation succeeds and the digest is
  // byte-identical to the activation-time pin.
  raw.authorityClass = 'PRODUCTION';
  fx.store.installRawPin('instance-prod', raw);
  const matched = await fx.activator.recover({
    workflowInstanceId: 'instance-prod',
    expectedAssembly: fx.assembly,
    expectedAuthorityClass: 'PRODUCTION',
  });
  assert.equal(matched.pin.bindingDigest, activated.bindingDigest);

  // The additional caller assertion still fails closed on cross-class.
  await assert.rejects(
    fx.activator.recover({
      workflowInstanceId: 'instance-prod',
      expectedAuthorityClass: 'SIMULATION',
    }),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'AUTHORITY_CLASS_MISMATCH',
  );
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

test('T002D: legacy class-less history is compatibility evidence only, never v0.7 activation authority (#688 repair)', async () => {
  const fx = await fixture();

  // Historical pre-T002D shape: an assembly-bound pin WITHOUT a class, minted
  // through the PRE-EXISTING coordinator seam (the v0.7 class-bearing
  // activation path refuses to mint it - proven above).
  const coordinator = new GovernanceExecutionCoordinator(fx.store, sha256);
  const legacyPin = await coordinator.pinExecution({
    workflowTarget: 'orders.fulfill',
    workflowInstanceId: 'instance-legacy-history',
    binding: fx.binding,
    assemblyDigest: fx.assembly.assemblyDigest,
  });
  assert.equal(legacyPin.authorityClass, undefined);
  assert.ok(!('authorityClass' in legacyPin), 'legacy history carries no class field at all');

  // Its digest stays byte-identical to the exact pre-T002D (T002C) material.
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
      assemblyDigest: fx.assembly.assemblyDigest,
    },
    sha256,
  );
  assert.equal(
    legacyPin.bindingDigest,
    expectedLegacyDigest,
    'legacy class-less assembly-bound digest is byte-identical to the pre-T002D shape',
  );

  // Replay of legacy class-less history keeps working as historical/
  // compatibility evidence: the exact pinned (absent) class is preserved.
  const replayed = await fx.activator.recover({ workflowInstanceId: 'instance-legacy-history' });
  assert.equal(replayed.pin.authorityClass, undefined);
  assert.equal(replayed.pin.bindingDigest, legacyPin.bindingDigest);

  // But a caller expectation can never UPGRADE legacy history to a class...
  for (const expected of ['PRODUCTION', 'SIMULATION'] as const) {
    await assert.rejects(
      fx.activator.recover({
        workflowInstanceId: 'instance-legacy-history',
        expectedAuthorityClass: expected,
      }),
      (error: unknown) =>
        error instanceof GovernanceExecutionBindingError &&
        error.code === 'AUTHORITY_CLASS_MISMATCH',
    );
  }

  // ...the v0.7 activation/currentness gate never re-issues it as activation
  // authority (typed fail-closed, no silent fallback to classless authority)...
  await assert.rejects(
    fx.activator.requireActivatedExecution('instance-legacy-history'),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      error.code === 'AUTHORITY_CLASS_FORBIDDEN',
  );

  // ...and it can never satisfy production effect/publication authority.
  await assert.rejects(
    fx.activator.requireProductionEffectAuthority('instance-legacy-history'),
    (error: unknown) =>
      error instanceof GovernanceExecutionBindingError &&
      (error.code === 'AUTHORITY_CLASS_FORBIDDEN' || error.code === 'AUTHORITY_CLASS_MISMATCH'),
  );
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
