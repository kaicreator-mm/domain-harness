/**
 * E3 executable reference — Simulation Tool substitution evidence
 * (issue #875; authority #589@<pack-d> PACK-D E3; DAG #534 E3;
 * predecessors T002D@061e443bcb4992e936f9a35189a44757f86b0ae9,
 * T003C seam @400fd33/#640, T002C/T002D activation @ #688/#755).
 *
 * ENVIRONMENT=LOCAL_AGENT (ZCode kimi-executor, kimi-for-coding).
 * REAL_HOST_POSTURE=NOT_REQUIRED. SOURCE_MUTATION=NONE (tests-only write set).
 *
 * Reference-falsification scope under test (PACK-D E3):
 *  - the SAME neutral Definition backs a PRODUCTION assembly (prod Tool
 *    implementation) and a SIMULATION assembly (sim Tool implementation):
 *    Definition identity (DefinitionGraphDigest) is unchanged by the
 *    substitution, while Assembly identity (assemblyDigest) and binding
 *    identity (bindingDigest) both split;
 *  - the simulation substitute is exact/currentness-bound through the
 *    accepted T003C seam (exact pin: implementationId + implementationVersion
 *    + implementation content digest) — never registry-order/first/latest/
 *    default substitution (candidate-order permutation invariance);
 *  - missing exact pin / ambiguous-no-pin fail closed with the frozen typed
 *    taxonomy;
 *  - simulation execution cannot satisfy production authoritative occurrence,
 *    durable effect/publication or production journal authority (the T002D
 *    class gate, repaired #688: explicit canonical class, unconditional
 *    replay currentness, cross-class rejection, typed fail-closed);
 *  - stale binding / stale assembly fail closed on the accepted currentness
 *    seams (T003C verifier, T002D activation currentness, T003C bind
 *    currentness);
 *  - MICROKERNEL_SOURCE_DIFF=0: substitution uses test-only candidate handles
 *    through the public contracts; this change set adds tests only.
 *
 * Fixture freeze (REFERENCE_FIXTURE_FREEZE from #875, verbatim values):
 *   MANIFEST_ID=E3_SIM_TOOL_SUBSTITUTION_V1
 *   MANIFEST_VERSION=1
 *   MANIFEST_CANONICAL_JSON_SHA256=0287dccb4317d26910040dbe817e184163cff9d0af94d4984bc22a739ef53d4f
 *   DEFINITION_FIXTURE=e3.neutral.definition.v1
 *   PROD_PIN=impl.e3.prod@1.0.0#sha256:3333…3333 (64x '3')
 *   SIM_PIN=impl.e3.sim@1.0.0#sha256:4444…4444 (64x '4')
 *   AUTHORITY_CLASS=PRODUCTION|SIMULATION
 *   NEGATIVE_PERMUTATION_MATRIX=same-definition;assembly-split;candidate-order-permutation;missing-pin;ambiguous-no-pin;cross-class-replay;simulation-production-effect-reject;stale-binding;stale-assembly
 *
 * OBSERVED_LIMIT (#875 does not specify the canonical-JSON grammar behind
 * MANIFEST_CANONICAL_JSON_SHA256): the freeze is pinned here by manifest
 * id/version/verbatim field values; the behavioral matrix below is
 * independent of reproducing that serialization.
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
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  ToolImplementationBindingError,
  verifyToolImplementationBinding,
  verifyToolImplementationBindingEvidence,
  type BindToolImplementationInput,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
  type ToolImplementationIdentity,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  AssemblyExecutionActivator,
  GovernanceBaselineRegistry,
  GovernanceExecutionBindingError,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type ActivateAssemblyExecutionRequest,
  type DurableExecutionStore,
  type DomainActivationBinding,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineBody,
  type GovernanceBoundSnapshot,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
  type RuntimeAuthorityClass,
} from '../../src/governance/index.js';
import type { SealedRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Frozen manifest constants (#875 REFERENCE_FIXTURE_FREEZE, verbatim).
// ---------------------------------------------------------------------------

const MANIFEST = {
  MANIFEST_ID: 'E3_SIM_TOOL_SUBSTITUTION_V1',
  MANIFEST_VERSION: 1,
  MANIFEST_CANONICAL_JSON_SHA256:
    '0287dccb4317d26910040dbe817e184163cff9d0af94d4984bc22a739ef53d4f',
  DEFINITION_FIXTURE: 'e3.neutral.definition.v1',
  PROD_PIN: `impl.e3.prod@1.0.0#sha256:${'3'.repeat(64)}`,
  SIM_PIN: `impl.e3.sim@1.0.0#sha256:${'4'.repeat(64)}`,
  AUTHORITY_CLASS: 'PRODUCTION|SIMULATION',
  NEGATIVE_PERMUTATION_MATRIX:
    'same-definition;assembly-split;candidate-order-permutation;missing-pin;ambiguous-no-pin;cross-class-replay;simulation-production-effect-reject;stale-binding;stale-assembly',
} as const;

const PROD_PIN: ToolImplementationIdentity = {
  implementationId: 'impl.e3.prod',
  implementationVersion: '1.0.0',
  implementationDigest: `sha256:${'3'.repeat(64)}`,
};
const SIM_PIN: ToolImplementationIdentity = {
  implementationId: 'impl.e3.sim',
  implementationVersion: '1.0.0',
  implementationDigest: `sha256:${'4'.repeat(64)}`,
};
const TOOL_COMPONENT_ID = 'tool.e3';
const E3_KIND = { kindId: 'example.e3-kind', version: '1.0.0' } as const;

// ---------------------------------------------------------------------------
// Neutral Definition fixture (e3.neutral.definition.v1).
// ---------------------------------------------------------------------------

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.e3',
    kind: E3_KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    semanticBody: { note: 'e3 consumer' },
  };
}

function toolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: TOOL_COMPONENT_ID,
    kind: E3_KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.add', inputSchema: {}, outputSchema: {}, effect: 'none' },
        { operationId: 'op.sub', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    },
  };
}

function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e3.neutral',
    components: [consumer(), toolComponent()],
    relations: [],
  };
}

function staleGraph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e3.neutral',
    components: [
      { ...consumer(), semanticBody: { note: 'e3 consumer MUTATED' } },
      toolComponent(),
    ],
    relations: [],
  };
}

function kindBinding() {
  return {
    pin: {
      kind: E3_KIND,
      implementation: {
        implementationId: 'impl.e3.kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:e3-kind',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

function candidate(
  pin: ToolImplementationIdentity,
  handle: unknown,
): ToolImplementationCandidate {
  return {
    implementation: pin,
    supportedOperations: ['op.add', 'op.sub'],
    handle,
  };
}

const PROD_HANDLE = { testOnlyHandle: 'prod-executor' };
const SIM_HANDLE = { testOnlyHandle: 'sim-executor' };

async function sealedBaseAssembly(definitionGraph: DefinitionGraphEnvelope = graph()) {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding()] },
    sha256,
  );
}

async function selectionFor(definitionGraph: DefinitionGraphEnvelope) {
  const digest = await computeDefinitionGraphDigest(definitionGraph, sha256);
  return resolveCurrentCapabilityProvider(
    definitionGraph,
    { capabilityId: 'cap.calc', version: '1.0.0' },
    'consumer.e3',
    digest,
    sha256,
  );
}

interface BindContext {
  readonly assembly: SealedRuntimeAssembly;
  readonly selection: Awaited<ReturnType<typeof selectionFor>>;
  readonly definitionGraph: DefinitionGraphEnvelope;
}

async function bindContext(
  definitionGraph: DefinitionGraphEnvelope = graph(),
): Promise<BindContext> {
  return {
    assembly: await sealedBaseAssembly(definitionGraph),
    selection: await selectionFor(definitionGraph),
    definitionGraph,
  };
}

function bindInput(
  ctx: BindContext,
  implementations: readonly ToolImplementationCandidate[],
  overrides: Partial<BindToolImplementationInput> = {},
): BindToolImplementationInput {
  return {
    assembly: ctx.assembly,
    selection: JSON.parse(JSON.stringify(ctx.selection)) as BindToolImplementationInput['selection'],
    currentDefinitionGraph: ctx.definitionGraph,
    implementations,
    sha256,
    ...overrides,
  };
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

function expectGovernanceError(
  promise: Promise<unknown>,
  code: string,
): Promise<GovernanceExecutionBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected GovernanceExecutionBindingError(${code}), but it resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof GovernanceExecutionBindingError,
        `expected GovernanceExecutionBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

// ---------------------------------------------------------------------------
// Governance / authority-class fixtures (identical seam to the T002D matrix).
// ---------------------------------------------------------------------------

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

  rawPin(workflowInstanceId: string): Record<string, unknown> {
    return structuredClone(this.#pins.get(workflowInstanceId)) as Record<string, unknown>;
  }

  installRawPin(workflowInstanceId: string, pin: Record<string, unknown>): void {
    this.#pins.set(workflowInstanceId, pin);
  }

  async getGovernanceBoundSnapshot(workflowInstanceId: string): Promise<unknown> {
    void workflowInstanceId;
    return undefined;
  }

  async putGovernanceBoundSnapshot(snapshot: GovernanceBoundSnapshot): Promise<void> {
    void snapshot;
  }
}

interface GovernanceContext {
  readonly binding: DomainActivationBinding;
  readonly activator: AssemblyExecutionActivator;
  readonly store: MemoryDurableExecutionStore;
  readonly coordinator: GovernanceExecutionCoordinator;
}

async function governanceContext(): Promise<GovernanceContext> {
  const baseline: GovernanceBaselineBody = await createGovernanceBaselineBody(
    {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      version: 'e3',
      semantics: {
        hardInvariants: [{ id: 'invariant-e3', kind: 'deny-negative-total' }],
        operatorAuthority: 'e3',
      },
    },
    sha256,
  );
  const baselines = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(baselines, sha256);
  await registry.register(baseline);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-e3',
    domainIntelligenceContentDigest: 'cdi-orders-e3',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, sha256);
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  return {
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-e3',
      domainIntelligenceContentDigest: 'cdi-orders-e3',
      governanceBaseline: baseline.identity,
    },
    activator,
    store,
    coordinator,
  };
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

// ---------------------------------------------------------------------------
// Fixture freeze — identity capture preflight (part of the freeze, NOT an
// evidence result). Constructed once through the accepted current APIs; after
// capture no fixture/pin/matrix mutation is allowed.
// ---------------------------------------------------------------------------

interface FrozenFixture {
  readonly definitionGraph: DefinitionGraphEnvelope;
  readonly definitionGraphDigest: string;
  readonly baseAssembly: SealedRuntimeAssembly;
  readonly baseAssemblyDigest: string;
  readonly prod: SealedToolImplementationBinding;
  readonly prodBindingDigest: string;
  readonly prodAssemblyDigest: string;
  readonly sim: SealedToolImplementationBinding;
  readonly simBindingDigest: string;
  readonly simAssemblyDigest: string;
}

let frozenPromise: Promise<FrozenFixture> | undefined;

async function freezeFixture(): Promise<FrozenFixture> {
  const definitionGraph = graph();
  const definitionGraphDigest = await computeDefinitionGraphDigest(definitionGraph, sha256);
  const baseAssembly = await sealedBaseAssembly(definitionGraph);
  const prod = await bindToolImplementation(
    bindInput(
      { assembly: baseAssembly, selection: await selectionFor(definitionGraph), definitionGraph },
      [candidate(PROD_PIN, PROD_HANDLE)],
      { exactPin: PROD_PIN },
    ),
  );
  // The SIM assembly is a SIBLING successor of the identical base Assembly:
  // the only identity-material difference is the substituted Tool
  // implementation pin (and its paired test-only handle, which is outside
  // every digest material).
  const sim = await bindToolImplementation(
    bindInput(
      { assembly: baseAssembly, selection: await selectionFor(definitionGraph), definitionGraph },
      [candidate(SIM_PIN, SIM_HANDLE)],
      { exactPin: SIM_PIN },
    ),
  );
  const frozen: FrozenFixture = {
    definitionGraph,
    definitionGraphDigest,
    baseAssembly,
    baseAssemblyDigest: baseAssembly.assemblyDigest,
    prod,
    prodBindingDigest: prod.evidence.bindingDigest,
    prodAssemblyDigest: prod.successorAssembly.assemblyDigest,
    sim,
    simBindingDigest: sim.evidence.bindingDigest,
    simAssemblyDigest: sim.successorAssembly.assemblyDigest,
  };
  console.log(
    'E3_FIXTURE_IDENTITIES ' +
      JSON.stringify({
        manifestId: MANIFEST.MANIFEST_ID,
        manifestVersion: MANIFEST.MANIFEST_VERSION,
        definitionFixture: MANIFEST.DEFINITION_FIXTURE,
        definitionGraphDigest: frozen.definitionGraphDigest,
        baseAssemblyDigest: frozen.baseAssemblyDigest,
        prodBindingDigest: frozen.prodBindingDigest,
        prodAssemblyDigest: frozen.prodAssemblyDigest,
        simBindingDigest: frozen.simBindingDigest,
        simAssemblyDigest: frozen.simAssemblyDigest,
      }),
  );
  return frozen;
}

function frozen(): Promise<FrozenFixture> {
  frozenPromise ??= freezeFixture();
  return frozenPromise;
}

// ---------------------------------------------------------------------------
// Matrix experiment 1: same-definition
// ---------------------------------------------------------------------------

test('E3 same-definition: the PROD/SIM substitution leaves Definition identity unchanged', async () => {
  const fx = await frozen();

  // The exact neutral Definition identity backs both assemblies and both
  // binding evidence records.
  assert.equal(fx.prod.evidence.definitionGraphDigest, fx.definitionGraphDigest);
  assert.equal(fx.sim.evidence.definitionGraphDigest, fx.definitionGraphDigest);
  assert.equal(fx.prod.successorAssembly.record.definitionGraphDigest, fx.definitionGraphDigest);
  assert.equal(fx.sim.successorAssembly.record.definitionGraphDigest, fx.definitionGraphDigest);
  assert.equal(fx.baseAssembly.record.definitionGraphDigest, fx.definitionGraphDigest);

  // ...while the exact implementation pins differ in every identity field.
  assert.notEqual(
    fx.prod.evidence.implementation.implementationId,
    fx.sim.evidence.implementation.implementationId,
  );
  assert.notEqual(
    fx.prod.evidence.implementation.implementationDigest,
    fx.sim.evidence.implementation.implementationDigest,
  );
  assert.equal(fx.prod.evidence.implementation.implementationId, PROD_PIN.implementationId);
  assert.equal(fx.prod.evidence.implementation.implementationDigest, PROD_PIN.implementationDigest);
  assert.equal(fx.sim.evidence.implementation.implementationId, SIM_PIN.implementationId);
  assert.equal(fx.sim.evidence.implementation.implementationDigest, SIM_PIN.implementationDigest);

  // The paired runtime handles differ (substitution is real, test-only) and
  // stay OUTSIDE every digest material.
  assert.notDeepEqual(fx.prod.implementationHandle, fx.sim.implementationHandle);
});

// ---------------------------------------------------------------------------
// Matrix experiment 2: assembly-split
// ---------------------------------------------------------------------------

test('E3 assembly-split: implementation substitution splits Assembly and binding identity', async () => {
  const fx = await frozen();

  assert.notEqual(fx.prodAssemblyDigest, fx.simAssemblyDigest, 'assemblyDigest splits');
  assert.notEqual(fx.prodBindingDigest, fx.simBindingDigest, 'bindingDigest splits');
  assert.notEqual(fx.prodAssemblyDigest, fx.baseAssemblyDigest);
  assert.notEqual(fx.simAssemblyDigest, fx.baseAssemblyDigest);

  // Each successor carries exactly one §G slot for the exact Tool subject,
  // binding the exact per-class bindingDigest.
  for (const [bound, bindingDigest] of [
    [fx.prod, fx.prodBindingDigest],
    [fx.sim, fx.simBindingDigest],
  ] as const) {
    const slots = bound.successorAssembly.record.implementationBindingEvidence;
    assert.equal(slots.length, 1);
    assert.equal(slots[0]!.subject, TOOL_COMPONENT_ID);
    assert.equal(slots[0]!.bindingDigest, bindingDigest);
  }

  // The base Assembly is never mutated by either binding (T002B container).
  assert.deepEqual(fx.baseAssembly.record.implementationBindingEvidence, []);
});

// ---------------------------------------------------------------------------
// Matrix experiment 3: candidate-order-permutation
// ---------------------------------------------------------------------------

test('E3 candidate-order-permutation: order never changes the binding decision or any digest', async () => {
  const forward = await bindContext();
  const reversed = await bindContext();

  const prodForward = await bindToolImplementation(
    bindInput(
      forward,
      [candidate(PROD_PIN, PROD_HANDLE), candidate(SIM_PIN, SIM_HANDLE)],
      { exactPin: PROD_PIN, requiredOperations: ['op.add', 'op.sub'] },
    ),
  );
  const prodReversed = await bindToolImplementation(
    bindInput(
      reversed,
      [candidate(SIM_PIN, SIM_HANDLE), candidate(PROD_PIN, PROD_HANDLE)],
      { exactPin: PROD_PIN, requiredOperations: ['op.sub', 'op.add'] },
    ),
  );
  assert.equal(prodForward.evidence.bindingDigest, prodReversed.evidence.bindingDigest);
  assert.equal(
    prodForward.successorAssembly.assemblyDigest,
    prodReversed.successorAssembly.assemblyDigest,
  );
  assert.deepEqual(prodForward.evidence.supportedOperations, ['op.add', 'op.sub']);

  const simForward = await bindToolImplementation(
    bindInput(
      await bindContext(),
      [candidate(SIM_PIN, SIM_HANDLE), candidate(PROD_PIN, PROD_HANDLE)],
      { exactPin: SIM_PIN },
    ),
  );
  const simReversed = await bindToolImplementation(
    bindInput(
      await bindContext(),
      [candidate(PROD_PIN, PROD_HANDLE), candidate(SIM_PIN, SIM_HANDLE)],
      { exactPin: SIM_PIN },
    ),
  );
  assert.equal(simForward.evidence.bindingDigest, simReversed.evidence.bindingDigest);
  assert.equal(
    simForward.successorAssembly.assemblyDigest,
    simReversed.successorAssembly.assemblyDigest,
  );
  assert.equal(simForward.evidence.bindingDigest, (await frozen()).simBindingDigest);
  assert.equal(prodForward.evidence.bindingDigest, (await frozen()).prodBindingDigest);
});

// ---------------------------------------------------------------------------
// Matrix experiment 4: missing-pin
// ---------------------------------------------------------------------------

test('E3 missing-pin: an exact pin that matches no offered candidate fails closed (no fallback)', async () => {
  // The production pin is demanded but only the simulation candidate is
  // offered: the exact implementation is missing, never substituted.
  await expectBindingError(
    bindToolImplementation(
      bindInput(
        await bindContext(),
        [candidate(SIM_PIN, SIM_HANDLE)],
        { exactPin: PROD_PIN },
      ),
    ),
    'MISSING_TOOL_IMPLEMENTATION',
  );

  // Same id/version but a different content digest is equally missing:
  // identity is all three fields, never two-of-three with a latest lookup.
  const wrongDigestPin: ToolImplementationIdentity = {
    ...PROD_PIN,
    implementationDigest: `sha256:${'5'.repeat(64)}`,
  };
  await expectBindingError(
    bindToolImplementation(
      bindInput(
        await bindContext(),
        [candidate(PROD_PIN, PROD_HANDLE)],
        { exactPin: wrongDigestPin },
      ),
    ),
    'MISSING_TOOL_IMPLEMENTATION',
  );

  // No candidates at all with an exact pin: still missing, never default.
  await expectBindingError(
    bindToolImplementation(
      bindInput(await bindContext(), [], { exactPin: PROD_PIN }),
    ),
    'MISSING_TOOL_IMPLEMENTATION',
  );
});

// ---------------------------------------------------------------------------
// Matrix experiment 5: ambiguous-no-pin
// ---------------------------------------------------------------------------

test('E3 ambiguous-no-pin: multiple compatible candidates without an exact pin never resolve by order', async () => {
  const forwardError = await expectBindingError(
    bindToolImplementation(
      bindInput(await bindContext(), [
        candidate(PROD_PIN, PROD_HANDLE),
        candidate(SIM_PIN, SIM_HANDLE),
      ]),
    ),
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );
  assert.deepEqual(forwardError.conflictingImplementationIds, ['impl.e3.prod', 'impl.e3.sim']);

  // Reversed candidate order: identical typed failure, identical sorted ids.
  const reversedError = await expectBindingError(
    bindToolImplementation(
      bindInput(await bindContext(), [
        candidate(SIM_PIN, SIM_HANDLE),
        candidate(PROD_PIN, PROD_HANDLE),
      ]),
    ),
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );
  assert.deepEqual(reversedError.conflictingImplementationIds, ['impl.e3.prod', 'impl.e3.sim']);

  // An exact pin resolves the same two-candidate set deterministically.
  const resolved = await bindToolImplementation(
    bindInput(
      await bindContext(),
      [candidate(SIM_PIN, SIM_HANDLE), candidate(PROD_PIN, PROD_HANDLE)],
      { exactPin: SIM_PIN },
    ),
  );
  assert.equal(resolved.evidence.implementation.implementationId, 'impl.e3.sim');
});

// ---------------------------------------------------------------------------
// Matrix experiment 6: cross-class-replay
// ---------------------------------------------------------------------------

test('E3 cross-class-replay: a SIMULATION activation can never replay as PRODUCTION', async () => {
  const fx = await frozen();
  const gov = await governanceContext();
  const currentGraph = fx.definitionGraph;

  await gov.activator.activate(
    activationRequest({
      workflowInstanceId: 'e3.instance.sim',
      binding: gov.binding,
      assembly: fx.sim.successorAssembly,
      currentGraph,
      authorityClass: 'SIMULATION',
    }),
  );

  // Simulation executes/observes: replay with the matching class resolves.
  const replayed = await gov.activator.recover({
    workflowInstanceId: 'e3.instance.sim',
    expectedAuthorityClass: 'SIMULATION',
  });
  assert.equal(replayed.pin.authorityClass, 'SIMULATION');

  // Cross-class replay expectation fails closed.
  await expectGovernanceError(
    gov.activator.recover({
      workflowInstanceId: 'e3.instance.sim',
      expectedAuthorityClass: 'PRODUCTION',
    }),
    'AUTHORITY_CLASS_MISMATCH',
  );

  // #688 unconditional replay currentness: rewriting the durable class under
  // the old digest fails closed even with NO caller expectation — the pinned
  // class is enforced by the replay itself.
  const raw = gov.store.rawPin('e3.instance.sim');
  raw.authorityClass = 'PRODUCTION';
  gov.store.installRawPin('e3.instance.sim', raw);
  await expectGovernanceError(
    gov.activator.recover({ workflowInstanceId: 'e3.instance.sim' }),
    'INVALID_GOVERNANCE_EXECUTION_PIN',
  );
  await expectGovernanceError(
    gov.activator.recover({
      workflowInstanceId: 'e3.instance.sim',
      expectedAuthorityClass: 'PRODUCTION',
    }),
    'INVALID_GOVERNANCE_EXECUTION_PIN',
  );
  raw.authorityClass = 'SIMULATION';
  gov.store.installRawPin('e3.instance.sim', raw);

  // Re-activating the same occurrence under a different class conflicts;
  // the retained pin keeps its exact pinned class.
  await expectGovernanceError(
    gov.activator.activate(
      activationRequest({
        workflowInstanceId: 'e3.instance.sim',
        binding: gov.binding,
        assembly: fx.prod.successorAssembly,
        currentGraph,
        authorityClass: 'PRODUCTION',
      }),
    ),
    'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
  const retained = await gov.activator.requireActivatedExecution('e3.instance.sim');
  assert.equal(retained.authorityClass, 'SIMULATION');
});

// ---------------------------------------------------------------------------
// Matrix experiment 7: simulation-production-effect-reject
// ---------------------------------------------------------------------------

test('E3 simulation-production-effect-reject: a SIMULATION pin never mints production effect/publication authority', async () => {
  const fx = await frozen();
  const gov = await governanceContext();
  const currentGraph = fx.definitionGraph;

  await gov.activator.activate(
    activationRequest({
      workflowInstanceId: 'e3.instance.sim',
      binding: gov.binding,
      assembly: fx.sim.successorAssembly,
      currentGraph,
      authorityClass: 'SIMULATION',
    }),
  );
  await expectGovernanceError(
    gov.activator.requireProductionEffectAuthority('e3.instance.sim'),
    'AUTHORITY_CLASS_MISMATCH',
  );

  // The PRODUCTION assembly under PRODUCTION class satisfies the same gate on
  // the same pin hierarchy: the class gate, not the implementation identity,
  // is the production authority boundary.
  await gov.activator.activate(
    activationRequest({
      workflowInstanceId: 'e3.instance.prod',
      binding: gov.binding,
      assembly: fx.prod.successorAssembly,
      currentGraph,
      authorityClass: 'PRODUCTION',
    }),
  );
  const productionPin = await gov.activator.requireProductionEffectAuthority('e3.instance.prod');
  assert.equal(productionPin.authorityClass, 'PRODUCTION');

  // Same-class re-activation of the PRODUCTION occurrence over the SIMULATION
  // assembly is still a different pin (occurrence identity binds once) — the
  // simulation substitute can never ride the production occurrence.
  await expectGovernanceError(
    gov.activator.activate(
      activationRequest({
        workflowInstanceId: 'e3.instance.prod',
        binding: gov.binding,
        assembly: fx.sim.successorAssembly,
        currentGraph,
        authorityClass: 'PRODUCTION',
      }),
    ),
    'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
});

// ---------------------------------------------------------------------------
// Matrix experiment 8: stale-binding
// ---------------------------------------------------------------------------

test('E3 stale-binding: a replaced Tool binding slot fails closed against the current final Assembly', async () => {
  const fx = await frozen();

  // Bind PROD into final Assembly A1, then substitute SIM: A2 is the
  // successor of A1 with the subject slot REPLACED.
  const a1 = fx.prod.successorAssembly;
  const simSuccessor = await bindToolImplementation(
    bindInput(
      {
        assembly: a1,
        selection: await selectionFor(fx.definitionGraph),
        definitionGraph: fx.definitionGraph,
      },
      [candidate(SIM_PIN, SIM_HANDLE)],
      { exactPin: SIM_PIN },
    ),
  );
  const a2 = simSuccessor.successorAssembly;
  assert.notEqual(a1.assemblyDigest, a2.assemblyDigest);

  // The PROD binding is now stale: the current final Assembly's slot carries
  // the SIM bindingDigest. Both consumer verifier seams fail closed typed.
  await expectBindingError(
    verifyToolImplementationBinding({
      binding: fx.prod,
      finalAssembly: a2,
      sha256,
    }),
    'STALE_TOOL_IMPLEMENTATION_BINDING',
  );
  await expectBindingError(
    verifyToolImplementationBindingEvidence({
      evidence: fx.prod.evidence,
      finalAssembly: a2,
      sha256,
    }),
    'STALE_TOOL_IMPLEMENTATION_BINDING',
  );

  // The SIM binding is CURRENT against A2 and pairs the SIM handle only after
  // full verification; an expected PROD pin is rejected on the same seam.
  const verified = await verifyToolImplementationBinding({
    binding: simSuccessor,
    finalAssembly: a2,
    expectedImplementationPin: SIM_PIN,
    sha256,
  });
  assert.equal(verified.status, 'VERIFIED_CURRENT');
  assert.equal(verified.currentness.finalAssemblyDigest, a2.assemblyDigest);
  assert.deepEqual(verified.implementationHandle, SIM_HANDLE);

  await expectBindingError(
    verifyToolImplementationBinding({
      binding: simSuccessor,
      finalAssembly: a2,
      expectedImplementationPin: PROD_PIN,
      sha256,
    }),
    'TOOL_IMPLEMENTATION_PIN_MISMATCH',
  );

  // Historical provenance: the PROD binding stays CURRENT against A1 — a
  // faithful preserved final Assembly never becomes stale retroactively.
  const historical = await verifyToolImplementationBinding({
    binding: fx.prod,
    finalAssembly: a1,
    expectedImplementationPin: PROD_PIN,
    sha256,
  });
  assert.equal(historical.status, 'VERIFIED_CURRENT');
  assert.deepEqual(historical.implementationHandle, PROD_HANDLE);
});

// ---------------------------------------------------------------------------
// Matrix experiment 9: stale-assembly
// ---------------------------------------------------------------------------

test('E3 stale-assembly: a mutated current Definition graph fails closed on every authority seam', async () => {
  const fx = await frozen();
  const mutated = staleGraph();
  assert.notEqual(
    await computeDefinitionGraphDigest(mutated, sha256),
    fx.definitionGraphDigest,
  );

  // Activation currentness (T002D activation path).
  const gov = await governanceContext();
  await expectGovernanceError(
    gov.activator.activate(
      activationRequest({
        workflowInstanceId: 'e3.instance.stale',
        binding: gov.binding,
        assembly: fx.sim.successorAssembly,
        currentGraph: mutated,
        authorityClass: 'SIMULATION',
      }),
    ),
    'ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH',
  );

  // Binding currentness (T003C bind path): a stale graph never mints new
  // binding evidence, even with the exact pin and the right candidate.
  await expectBindingError(
    bindToolImplementation(
      bindInput(
        {
          assembly: fx.baseAssembly,
          selection: await selectionFor(fx.definitionGraph),
          definitionGraph: mutated,
        },
        [candidate(PROD_PIN, PROD_HANDLE)],
        { exactPin: PROD_PIN },
      ),
    ),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );
});
