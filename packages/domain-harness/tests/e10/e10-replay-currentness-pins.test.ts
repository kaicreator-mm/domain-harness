/**
 * E10 reference-evidence suite — Replay/currentness exact Assembly pins
 * (issue #899, PACK-D E10; planning authority #589 issuecomment-5980528597
 * FROZEN; prerequisites T002B (c1a187ae) + T002C (PR #631) landed).
 *
 * E10 owns the GENERIC replay/currentness dimension (Kind/Tool/resource pins
 * beyond workflow). T007C F5/F6 already proves the WORKFLOW lane, so this
 * suite deliberately uses a NON-WORKFLOW fixture in its own test namespace
 * `e10.*` (no t007c/e6/val namespace reuse): one neutral Semantic Component and
 * one Tool Component admitted through the same public/generic contracts
 * production components use — no private bypass, no production source edit
 * (MICROKERNEL_SOURCE_DIFF=0).
 *
 * Frozen obligations under test (PACK-D E10):
 *  (a) the exact same accepted pins replay successfully (activation/execution
 *      pin + sealed Assembly + KindImplementation pin + Tool implementation
 *      pin + resource-currentness evidence + authority class, replayed after
 *      a simulated restart through a fresh activator over the same durable
 *      store, and through the T003C consumer verifier);
 *  (b) stale/replaced Assembly fails closed (replay mismatch, bind-once
 *      conflict, Definition currentness mismatch — nothing is bound);
 *  (c) a replacement Kind/Tool implementation with unchanged Definition CANNOT
 *      reuse old runtime authority (Assembly identity changes while the
 *      Definition graph digest stays byte-identical; the old sealed Tool
 *      binding fails STALE against the replacement final Assembly; the old
 *      Kind validator handle is never invoked for the replacement);
 *  (d) no torn activation/currentness evidence — mid-await adversarial caller
 *      mutation of binding/graph/resource evidence or of bind candidates can
 *      never produce hybrid authority;
 *  (e) replay never resolves mutable aliases/latest/default bindings (forged
 *      assemblies, floating pins, cross-class or revised-resource
 *      expectations, legacy no-Assembly pins all fail typed; no second pin
 *      hierarchy exists).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import type { ToolResourceRequirement } from '../../src/contracts/resource-requirements.js';
import {
  resolveToolResources,
  type ResourceCurrentnessEvidence,
  type ResourceProvider,
} from '../../src/contracts/resource-resolution.js';
import {
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  ToolImplementationBindingError,
  bindToolImplementation,
  verifyToolImplementationBinding,
  verifyToolImplementationBindingEvidence,
  type SealedToolImplementationBinding,
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

/**
 * A Sha256Port whose next digest call blocks until the test releases it, so
 * the test can interleave adversarial caller mutation mid-await (same torn
 * fixture as the T002C/T005C matrices).
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

  /** Test-only: the number of durably retained pins (inserted, never replaced). */
  retainedPinCount(): number {
    return this.#pins.size;
  }
}

// ---------------------------------------------------------------------------
// e10.* fixture: one neutral Semantic Component + one Tool Component.
// ---------------------------------------------------------------------------

const SEMANTIC_ID = 'e10.semantic.marker';
const TOOL_ID = 'e10.tool.replay';
const SEMANTIC_KIND = { kindId: 'e10.replay.kind', version: '1.0.0' } as const;
const TOOL_KIND = { kindId: 'e10.replay.toolkind', version: '1.0.0' } as const;
const CAP_REPLAY = { capabilityId: 'cap.e10.replay', version: '1.0.0' } as const;
const CONTRACT_MARKER = { contractId: 'contract.e10.marker', version: '1.0.0' } as const;
const OP_RECORD = 'op.e10.replay.record';
const STORE_KEY = 'runtime.e10.store';
const STORE_PROVIDER = 'provider.e10.store';
const STORE_REVISION_1 = 'sha256:e10-store-revision-0001';
const STORE_REVISION_2 = 'sha256:e10-store-revision-0002';

const KIND_ALPHA = {
  implementationId: 'impl.e10.kind-alpha',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:e10-kind-alpha-content',
} as const;
const KIND_BRAVO = {
  implementationId: 'impl.e10.kind-bravo',
  implementationVersion: '2.0.0',
  implementationDigest: 'sha256:e10-kind-bravo-content',
} as const;
const TOOL_IMPL_ALPHA = {
  implementationId: 'impl.e10.tool-alpha',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:e10-tool-alpha-content',
} as const;
const TOOL_IMPL_BRAVO = {
  implementationId: 'impl.e10.tool-bravo',
  implementationVersion: '2.0.0',
  implementationDigest: 'sha256:e10-tool-bravo-content',
} as const;

/** Instrumented closed-world validator counters (replacement non-reuse proof). */
interface ValidatorCounters {
  readonly semanticAlpha: number;
  readonly semanticBravo: number;
  readonly toolAlpha: number;
}

function bump(counters: ValidatorCounters, key: keyof ValidatorCounters): void {
  (counters as Record<keyof ValidatorCounters, number>)[key] += 1;
}

function semanticMarker(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: SEMANTIC_ID,
    kind: { ...SEMANTIC_KIND },
    requiredSemanticContracts: [{ ...CONTRACT_MARKER }],
    requiredCapabilities: [{ ...CAP_REPLAY }],
    semanticBody: { marker: 'e10-neutral-replay-marker' },
  };
}

function replayTool(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: TOOL_ID,
    kind: { ...TOOL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: OP_RECORD, inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ ...CAP_REPLAY }],
    },
  };
}

function e10Graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e10.replay',
    components: [semanticMarker(), replayTool()],
    relations: [],
    ...overrides,
  };
}

function storeRequirement(): ToolResourceRequirement {
  return { resourceKey: STORE_KEY, required: true };
}

function kindBindings(
  counters: ValidatorCounters,
  which: 'alpha' | 'bravo' = 'alpha',
): KindImplementationBindingInput[] {
  return [
    {
      pin: {
        kind: { ...SEMANTIC_KIND },
        implementation: which === 'alpha' ? { ...KIND_ALPHA } : { ...KIND_BRAVO },
      },
      understoodSemanticContracts: [{ ...CONTRACT_MARKER }],
      understoodCapabilities: [{ ...CAP_REPLAY }],
      validateComponent: () => {
        bump(counters, which === 'alpha' ? 'semanticAlpha' : 'semanticBravo');
      },
    },
    {
      pin: {
        kind: { ...TOOL_KIND },
        implementation: { ...KIND_ALPHA },
      },
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: () => {
        bump(counters, 'toolAlpha');
      },
    },
  ];
}

/** Seal the base Assembly over the exact e10 graph (resource requirement bound). */
async function sealBaseAssembly(
  counters: ValidatorCounters,
  which: 'alpha' | 'bravo' = 'alpha',
  graph: DefinitionGraphEnvelope = e10Graph(),
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    {
      definitionGraph: graph,
      kindImplementations: kindBindings(counters, which),
      resourceRequirements: [
        { owner: replayTool(), declaration: { componentId: TOOL_ID, requirements: [storeRequirement()] } },
      ],
    },
    sha256,
  );
}

function toolCandidate(implementation: {
  readonly implementationId: string;
  readonly implementationVersion: string;
  readonly implementationDigest: string;
}): ToolImplementationCandidate {
  return {
    implementation: { ...implementation },
    supportedOperations: [OP_RECORD],
    // Opaque runtime handle paired with the exact pin OUTSIDE digest material;
    // distinct per implementation identity so handle non-reuse is observable.
    handle: { opaque: implementation.implementationId },
  };
}

function storeEvidence(revisionDigest: string): ResourceCurrentnessEvidence {
  return {
    componentId: TOOL_ID,
    providerId: STORE_PROVIDER,
    resourceKey: STORE_KEY,
    revisionDigest,
  };
}

/** An injected provider stub returning the exact revision-1 store pin. */
const storeProvider: ResourceProvider = {
  async resolve() {
    return {
      status: 'resolved',
      handle: { connection: 'opaque-e10-store-handle' },
      currentnessPin: {
        providerId: STORE_PROVIDER,
        resourceKey: STORE_KEY,
        revisionDigest: STORE_REVISION_1,
      },
    };
  },
};

async function governanceBody(label: string): Promise<GovernanceBaselineBody> {
  return createGovernanceBaselineBody(
    {
      domainId: 'e10.replay-domain',
      governanceId: 'e10-governance',
      schemaVersion: '1',
      version: label,
      semantics: {
        hardInvariants: [{ id: `invariant-${label}`, kind: 'e10-replay-invariant' }],
        operatorAuthority: label,
      },
    },
    sha256,
  );
}

const OCCURRENCE = { workflowTarget: 'e10.occurrence.target', workflowInstanceId: 'e10.instance.0001' };

interface Fixture {
  readonly counters: ValidatorCounters;
  readonly graph: DefinitionGraphEnvelope;
  readonly baseAssembly: SealedRuntimeAssembly;
  readonly finalAssembly: SealedRuntimeAssembly;
  readonly toolBinding: SealedToolImplementationBinding;
  readonly baselines: MemoryGovernanceBaselineStore;
  readonly packageCdi: MemoryExactPackageCdiAuthority;
  readonly store: MemoryDurableExecutionStore;
  readonly binding: DomainActivationBinding;
  readonly resourceEvidence: ResourceCurrentnessEvidence;
}

async function fixture(): Promise<Fixture> {
  const counters: ValidatorCounters = { semanticAlpha: 0, semanticBravo: 0, toolAlpha: 0 };
  const graph = e10Graph();
  const baseAssembly = await sealBaseAssembly(counters, 'alpha', graph);
  const digest = await computeDefinitionGraphDigest(graph, sha256);
  const selection = await resolveCurrentCapabilityProvider(
    graph,
    { ...CAP_REPLAY },
    SEMANTIC_ID,
    digest,
    sha256,
  );
  const toolBinding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: graph,
    implementations: [toolCandidate(TOOL_IMPL_ALPHA)],
    sha256,
  });
  const b1 = await governanceBody('B1');
  const baselines = new MemoryGovernanceBaselineStore();
  const registry = new GovernanceBaselineRegistry(baselines, sha256);
  await registry.register(b1);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'e10.replay-domain',
    packageId: 'pkg-e10-1',
    domainIntelligenceContentDigest: 'cdi-e10-1',
  });
  const store = new MemoryDurableExecutionStore();
  const binding: DomainActivationBinding = {
    domainId: 'e10.replay-domain',
    packageId: 'pkg-e10-1',
    domainIntelligenceContentDigest: 'cdi-e10-1',
    governanceBaseline: b1.identity,
  };
  return {
    counters,
    graph,
    baseAssembly,
    finalAssembly: toolBinding.successorAssembly,
    toolBinding,
    baselines,
    packageCdi,
    store,
    binding,
    resourceEvidence: storeEvidence(STORE_REVISION_1),
  };
}

function makeActivator(fx: Fixture, port: Sha256Port = sha256): AssemblyExecutionActivator {
  return new AssemblyExecutionActivator(fx.store, fx.packageCdi, fx.baselines, port);
}

function activationRequest(
  fx: Fixture,
  overrides: {
    readonly assembly?: SealedRuntimeAssembly;
    readonly currentGraph?: DefinitionGraphEnvelope;
    readonly resourceCurrentness?: readonly ResourceCurrentnessEvidence[];
  } = {},
) {
  return {
    workflowTarget: OCCURRENCE.workflowTarget,
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    binding: fx.binding,
    assembly: overrides.assembly ?? fx.finalAssembly,
    authorityClass: 'PRODUCTION' as const,
    currentDefinitionGraph: overrides.currentGraph ?? fx.graph,
    ...(overrides.resourceCurrentness === undefined
      ? {}
      : { resourceCurrentness: overrides.resourceCurrentness }),
  };
}

async function expectGovernanceError(
  promise: Promise<unknown>,
  code: string,
): Promise<GovernanceExecutionBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected GovernanceExecutionBindingError(${code}), but the call succeeded`);
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

async function expectToolBindingError(
  promise: Promise<unknown>,
  code: string,
): Promise<ToolImplementationBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected ToolImplementationBindingError(${code}), but the call succeeded`);
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

// ---------------------------------------------------------------------------
// (a) the exact same accepted pins replay successfully.
// ---------------------------------------------------------------------------

test('E10 (a): the exact same accepted pins replay successfully after a simulated restart', async () => {
  const fx = await fixture();
  const activator = makeActivator(fx);
  const pin = await activator.activate(activationRequest(fx, { resourceCurrentness: [fx.resourceEvidence] }));
  assert.equal(pin.assemblyDigest, fx.finalAssembly.assemblyDigest, 'exact sealed Assembly identity is bound');
  assert.equal(pin.authorityClass, 'PRODUCTION');
  assert.equal(fx.counters.semanticAlpha, 0, 'activation does not run Kind validators');
  assert.deepEqual(fx.store.events, ['pin:e10.instance.0001'], 'exactly one durable pin bound');

  // Simulated crash/restart: a FRESH activator over the SAME durable store,
  // recovering with the exact accepted pins (Assembly + class + resource).
  const restarted = makeActivator(fx);
  const recovered = await restarted.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.finalAssembly,
    expectedAuthorityClass: 'PRODUCTION',
    expectedResourceCurrentness: [fx.resourceEvidence],
  });
  assert.equal(recovered.assemblyDigest, fx.finalAssembly.assemblyDigest);
  assert.equal(recovered.pin.bindingDigest, pin.bindingDigest, 'the recovered pin is byte-identical authority');
  assert.equal(recovered.pin.workflowInstanceId, OCCURRENCE.workflowInstanceId);
  const reactivated = await restarted.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(reactivated.bindingDigest, pin.bindingDigest);

  // The occurrence also resolves through the pre-existing coordinator API.
  const viaCoordinator = await new GovernanceExecutionCoordinator(
    fx.store,
    sha256,
  ).requirePinnedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(viaCoordinator.bindingDigest, pin.bindingDigest);

  // Assembly-bound admission replays deterministically against the exact same
  // sealed Assembly: byte-identical evidence across the "restart".
  const admission = await admitComponentWithAssembly(semanticMarker(), fx.finalAssembly, {
    currentDefinitionGraph: fx.graph,
    sha256,
  });
  const readmission = await restartedAsReadmission(fx);
  assert.equal(
    readmission.assemblyDigest,
    admission.assemblyDigest,
    'replayed admission evidence is identical',
  );
  assert.deepEqual(readmission.admittedKindImplementation, admission.admittedKindImplementation);
  assert.equal(
    admission.admittedKindImplementation.implementation.implementationId,
    KIND_ALPHA.implementationId,
    'the admitted pin is the exact accepted KindImplementation',
  );
});

async function restartedAsReadmission(fx: Fixture) {
  // A second admission through a fresh call path (the module-level seam is
  // stateless apart from the mint registry) proves replay determinism.
  return admitComponentWithAssembly(semanticMarker(), fx.finalAssembly, {
    currentDefinitionGraph: fx.graph,
    sha256,
  });
}

test('E10 (a): the resource-currentness pin flows from the injected provider through resolution into a successful replay', async () => {
  const fx = await fixture();
  // T005B: the provider attests the exact non-secret revision pin.
  const resolved = await resolveToolResources({
    assembly: fx.finalAssembly,
    componentId: TOOL_ID,
    provider: storeProvider,
  });
  const entry = resolved.resources.get(STORE_KEY);
  assert.ok(entry !== undefined && entry.status === 'resolved');
  assert.ok(entry.currentnessPin !== undefined);
  const evidence: ResourceCurrentnessEvidence = {
    componentId: TOOL_ID,
    providerId: entry.currentnessPin.providerId,
    resourceKey: entry.currentnessPin.resourceKey,
    revisionDigest: entry.currentnessPin.revisionDigest,
  };
  assert.deepEqual(evidence, fx.resourceEvidence, 'provider pin equals the accepted replay pin');

  const activator = makeActivator(fx);
  await activator.activate(activationRequest(fx, { resourceCurrentness: [evidence] }));
  const recovered = await activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.finalAssembly,
    expectedAuthorityClass: 'PRODUCTION',
    expectedResourceCurrentness: [evidence],
  });
  assert.equal(recovered.assemblyDigest, fx.finalAssembly.assemblyDigest, 'exact pins replay');
});

test('E10 (a): the exact Tool implementation pin replays successfully through the consumer verifier', async () => {
  const fx = await fixture();
  const first = await verifyToolImplementationBinding({
    binding: fx.toolBinding,
    finalAssembly: fx.finalAssembly,
    expectedImplementationPin: { ...TOOL_IMPL_ALPHA },
    sha256,
  });
  assert.equal(first.status, 'VERIFIED_CURRENT');
  assert.equal(first.currentness.finalAssemblyDigest, fx.finalAssembly.assemblyDigest);
  assert.equal(
    first.currentness.bindingDigest,
    fx.toolBinding.evidence.bindingDigest,
    'currentness is decided against the exact pinned slot',
  );
  const handle = first.implementationHandle;
  assert.ok(handle !== undefined, 'the opaque handle is paired only after full verification');

  // Replay: the same accepted binding + final Assembly + exact pin verifies
  // again, pairing the SAME original handle reference.
  const replayed = await verifyToolImplementationBinding({
    binding: fx.toolBinding,
    finalAssembly: fx.finalAssembly,
    expectedImplementationPin: { ...TOOL_IMPL_ALPHA },
    sha256,
  });
  assert.equal(replayed.evidence.bindingDigest, first.evidence.bindingDigest);
  assert.equal(replayed.implementationHandle, handle, 'replay pairs the identical pinned handle');

  // Deterministic rebinding of the identical input yields identical evidence.
  const counters: ValidatorCounters = { semanticAlpha: 0, semanticBravo: 0, toolAlpha: 0 };
  const rebound = await bindToolImplementation({
    assembly: await sealBaseAssembly(counters, 'alpha'),
    selection: JSON.parse(
      JSON.stringify(
        await resolveCurrentCapabilityProvider(
          fx.graph,
          { ...CAP_REPLAY },
          SEMANTIC_ID,
          await computeDefinitionGraphDigest(fx.graph, sha256),
          sha256,
        ),
      ),
    ),
    currentDefinitionGraph: fx.graph,
    implementations: [toolCandidate(TOOL_IMPL_ALPHA)],
    sha256,
  });
  assert.equal(rebound.evidence.bindingDigest, fx.toolBinding.evidence.bindingDigest);
  assert.equal(rebound.successorAssembly.assemblyDigest, fx.finalAssembly.assemblyDigest);
});

// ---------------------------------------------------------------------------
// (b) stale/replaced Assembly fails closed.
// ---------------------------------------------------------------------------

test('E10 (b): replay against a stale/replaced Assembly fails closed (ASSEMBLY_REPLAY_MISMATCH)', async () => {
  const fx = await fixture();
  const counters: ValidatorCounters = { semanticAlpha: 0, semanticBravo: 0, toolAlpha: 0 };
  const replacedAssembly = await sealBaseAssembly(counters, 'bravo');
  assert.notEqual(replacedAssembly.assemblyDigest, fx.finalAssembly.assemblyDigest, 'replacement Assembly identity differs');
  assert.equal(
    replacedAssembly.record.definitionGraphDigest,
    fx.finalAssembly.record.definitionGraphDigest,
    'Definition identity is unchanged by the replacement (asserted here; owned by (c))',
  );

  const activator = makeActivator(fx);
  await activator.activate(activationRequest(fx, { resourceCurrentness: [fx.resourceEvidence] }));

  // Replay/recovery must resolve the SAME exact Assembly identity, never a
  // mutable alias: the replacement is not an acceptable replay target.
  await expectGovernanceError(
    activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: replacedAssembly,
    }),
    'ASSEMBLY_REPLAY_MISMATCH',
  );
  await expectGovernanceError(
    activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: replacedAssembly,
      expectedAuthorityClass: 'PRODUCTION',
      expectedResourceCurrentness: [fx.resourceEvidence],
    }),
    'ASSEMBLY_REPLAY_MISMATCH',
  );

  // Recovery WITHOUT an expectation still resolves the exact pinned identity.
  const recovered = await activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId });
  assert.equal(recovered.assemblyDigest, fx.finalAssembly.assemblyDigest);
});

test('E10 (b): a replacement Assembly can never overwrite a pinned occurrence (bind-once)', async () => {
  const fx = await fixture();
  const counters: ValidatorCounters = { semanticAlpha: 0, semanticBravo: 0, toolAlpha: 0 };
  const replacementAssembly = await sealBaseAssembly(counters, 'bravo');
  const activator = makeActivator(fx);
  const original = await activator.activate(
    activationRequest(fx, { resourceCurrentness: [fx.resourceEvidence] }),
  );

  await expectGovernanceError(
    activator.activate(
      activationRequest(fx, { assembly: replacementAssembly, resourceCurrentness: [fx.resourceEvidence] }),
    ),
    'GOVERNANCE_EXECUTION_PIN_CONFLICT',
  );
  const retained = await activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(retained.bindingDigest, original.bindingDigest, 'old exact authority is retained');
  assert.equal(retained.assemblyDigest, fx.finalAssembly.assemblyDigest, 'never the replacement Assembly');
  assert.equal(fx.store.retainedPinCount(), 1, 'the conflicting bind never wrote a second pin');
});

test('E10 (b): a stale current Definition graph fails closed before any pin is bound', async () => {
  const fx = await fixture();
  const staleGraph = e10Graph({
    components: [
      semanticMarker(),
      {
        ...replayTool(),
        semanticBody: {
          operations: [
            { operationId: OP_RECORD, inputSchema: {}, outputSchema: {}, effect: 'none' },
            { operationId: 'op.e10.replay.extra', inputSchema: {}, outputSchema: {}, effect: 'none' },
          ],
          providesCapabilities: [{ ...CAP_REPLAY }],
        },
      },
    ],
  });
  const activator = makeActivator(fx);
  await expectGovernanceError(
    activator.activate(activationRequest(fx, { currentGraph: staleGraph, resourceCurrentness: [fx.resourceEvidence] })),
    'ASSEMBLY_DEFINITION_CURRENTNESS_MISMATCH',
  );
  assert.deepEqual(fx.store.events, [], 'no pin is bound when Definition currentness fails');
});

// ---------------------------------------------------------------------------
// (c) replacement Kind/Tool implementation, unchanged Definition: no reuse of
//     old runtime authority.
// ---------------------------------------------------------------------------

test('E10 (c): replacement Kind implementation (unchanged Definition) cannot reuse old runtime authority', async () => {
  const fx = await fixture();
  const counters: ValidatorCounters = { semanticAlpha: 0, semanticBravo: 0, toolAlpha: 0 };
  const replacementAssembly = await sealBaseAssembly(counters, 'bravo');

  // The identity split: Assembly identity changes, Definition identity does not.
  assert.notEqual(replacementAssembly.assemblyDigest, fx.finalAssembly.assemblyDigest);
  assert.equal(
    replacementAssembly.record.definitionGraphDigest,
    fx.finalAssembly.record.definitionGraphDigest,
    'unchanged Definition graph digest',
  );

  // Admission under the replacement Assembly is derived ONLY from the
  // replacement's own sealed binding: the old (alpha) validator handle is
  // never invoked for the new Assembly.
  await admitComponentWithAssembly(semanticMarker(), replacementAssembly, {
    currentDefinitionGraph: fx.graph,
    sha256,
  });
  assert.equal(counters.semanticBravo, 1, 'the replacement validator is used');
  assert.equal(counters.semanticAlpha, 0, 'the replaced validator handle is never reused');
  assert.equal(fx.counters.semanticBravo, 0, 'the original fixture validator count is untouched');

  // The old occurrence pinned under the original Assembly cannot be replayed
  // against the replacement (stale/replaced Assembly fails closed).
  const activator = makeActivator(fx);
  await activator.activate(activationRequest(fx, { resourceCurrentness: [fx.resourceEvidence] }));
  await expectGovernanceError(
    activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: replacementAssembly,
    }),
    'ASSEMBLY_REPLAY_MISMATCH',
  );
});

test('E10 (c): replacement Tool implementation (unchanged Definition) cannot reuse old binding authority', async () => {
  const fx = await fixture();
  const digest = await computeDefinitionGraphDigest(fx.graph, sha256);
  const selection = await resolveCurrentCapabilityProvider(
    fx.graph,
    { ...CAP_REPLAY },
    SEMANTIC_ID,
    digest,
    sha256,
  );

  // Bind the replacement Tool implementation over the SAME base Assembly and
  // the SAME unchanged Definition graph.
  const replacementBinding = await bindToolImplementation({
    assembly: fx.baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: fx.graph,
    implementations: [toolCandidate(TOOL_IMPL_BRAVO)],
    sha256,
  });
  const finalReplacement = replacementBinding.successorAssembly;
  assert.notEqual(finalReplacement.assemblyDigest, fx.finalAssembly.assemblyDigest, 'Assembly identity changes');
  assert.equal(
    finalReplacement.record.definitionGraphDigest,
    fx.finalAssembly.record.definitionGraphDigest,
    'Definition identity unchanged',
  );
  assert.notEqual(
    replacementBinding.evidence.bindingDigest,
    fx.toolBinding.evidence.bindingDigest,
    'binding evidence pins the replacement content',
  );

  // The OLD sealed binding (alpha) is stale against the replacement final
  // Assembly: the old runtime handle can never be paired through it.
  await expectToolBindingError(
    verifyToolImplementationBinding({
      binding: fx.toolBinding,
      finalAssembly: finalReplacement,
      expectedImplementationPin: { ...TOOL_IMPL_ALPHA },
      sha256,
    }),
    'STALE_TOOL_IMPLEMENTATION_BINDING',
  );

  // Even against the ORIGINAL final Assembly, a consumer expectation naming
  // the replacement pin fails closed — the pin is never resolved against
  // candidates, ordering, latest or first match.
  await expectToolBindingError(
    verifyToolImplementationBinding({
      binding: fx.toolBinding,
      finalAssembly: fx.finalAssembly,
      expectedImplementationPin: { ...TOOL_IMPL_BRAVO },
      sha256,
    }),
    'TOOL_IMPLEMENTATION_PIN_MISMATCH',
  );

  // The replacement binding verifies against the replacement final Assembly
  // and pairs ITS OWN handle — never the old one.
  const verified = await verifyToolImplementationBinding({
    binding: replacementBinding,
    finalAssembly: finalReplacement,
    expectedImplementationPin: { ...TOOL_IMPL_BRAVO },
    sha256,
  });
  assert.notEqual(verified.implementationHandle, fx.toolBinding.implementationHandle);
  assert.equal(verified.evidence.implementation.implementationId, TOOL_IMPL_BRAVO.implementationId);

  // A hand-built copy of the old binding is never a mint: replay through a
  // forged lookalike fails before any handle pairing.
  const forged = {
    evidence: fx.toolBinding.evidence,
    successorAssembly: fx.toolBinding.successorAssembly,
    implementationHandle: fx.toolBinding.implementationHandle,
  } as unknown as SealedToolImplementationBinding;
  await expectToolBindingError(
    verifyToolImplementationBinding({
      binding: forged,
      finalAssembly: fx.finalAssembly,
      expectedImplementationPin: { ...TOOL_IMPL_ALPHA },
      sha256,
    }),
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
  );
});

// ---------------------------------------------------------------------------
// (d) no torn activation/currentness evidence.
// ---------------------------------------------------------------------------

test('E10 (d): torn-activation adversarial mutation during await cannot alter the snapshotted pin', async () => {
  const port = new GatedSha256();
  const fx = await fixture();
  const activator = makeActivator(fx, port);
  const request = activationRequest(fx, { resourceCurrentness: [fx.resourceEvidence] });
  const gate = port.pauseNext();

  const activating = activator.activate(request);
  await gate.entered;

  // Adversarially mutate every caller-owned authority input mid-flight.
  (request.binding as { packageId: string }).packageId = 'pkg-e10-EVIL-torn';
  (request.binding as { domainIntelligenceContentDigest: string }).domainIntelligenceContentDigest =
    'cdi-e10-EVIL-torn';
  (request.currentDefinitionGraph.components[0] as { semanticBody: unknown }).semanticBody = {
    marker: 'e10-EVIL-torn',
  };
  (request.resourceCurrentness as ResourceCurrentnessEvidence[])[0] = storeEvidence(
    'sha256:e10-EVIL-torn-revision',
  );

  gate.release();
  const pin = await activating;

  assert.equal(pin.packageId, 'pkg-e10-1');
  assert.equal(pin.domainIntelligenceContentDigest, 'cdi-e10-1');
  assert.equal(pin.assemblyDigest, fx.finalAssembly.assemblyDigest);
  assert.deepEqual(
    pin.resourceCurrentness,
    [fx.resourceEvidence],
    'pinned resource currentness is the synchronous snapshot, never the torn mutation',
  );

  // The graph mutation was real (the live graph digest changed), yet the pin
  // is clean — currentness was proven against the PHASE-1 snapshot.
  const mutatedDigest = await computeDefinitionGraphDigest(request.currentDefinitionGraph, sha256);
  assert.notEqual(mutatedDigest, fx.finalAssembly.record.definitionGraphDigest);
  assert.deepEqual(fx.store.events, ['pin:e10.instance.0001'], 'exactly one durable write, no partial pin');
});

test('E10 (d): torn tool-binding adversarial mutation during await cannot alter the bound pin', async () => {
  const port = new GatedSha256();
  const fx = await fixture();
  const baseAssembly = await sealBaseAssembly(
    { semanticAlpha: 0, semanticBravo: 0, toolAlpha: 0 },
    'alpha',
    fx.graph,
  );
  const digest = await computeDefinitionGraphDigest(fx.graph, port);
  const selection = await resolveCurrentCapabilityProvider(
    fx.graph,
    { ...CAP_REPLAY },
    SEMANTIC_ID,
    digest,
    port,
  );
  const candidate = toolCandidate(TOOL_IMPL_ALPHA);
  // The adversarial mutation targets the CALLER-OWNED raw objects, so the
  // fixture hands the bind seam a deliberately mutable copy (the sealed seam
  // snapshots these synchronously before its first await).
  const candidateView = {
    implementation: { ...candidate.implementation },
    supportedOperations: [...candidate.supportedOperations],
    handle: candidate.handle,
  };
  const graphView = JSON.parse(JSON.stringify(fx.graph)) as DefinitionGraphEnvelope;
  const input = {
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: graphView,
    implementations: [candidateView],
    sha256: port,
  };
  const gate = port.pauseNext();

  const bindingPromise = bindToolImplementation(input);
  await gate.entered;

  // Mid-await mutation of the caller's candidate identity and graph.
  candidateView.implementation.implementationDigest = 'sha256:e10-EVIL-torn-content';
  candidateView.implementation.implementationId = 'impl.e10.tool-EVIL-torn';
  (graphView.components[0] as { semanticBody: unknown }).semanticBody = {
    marker: 'e10-EVIL-torn',
  };

  gate.release();
  const bound = await bindingPromise;

  assert.equal(
    bound.evidence.implementation.implementationId,
    TOOL_IMPL_ALPHA.implementationId,
    'the bound pin is the synchronous snapshot, never the torn candidate',
  );
  assert.equal(
    bound.evidence.implementation.implementationDigest,
    TOOL_IMPL_ALPHA.implementationDigest,
  );
  const mutatedDigest = await computeDefinitionGraphDigest(graphView, sha256);
  assert.notEqual(mutatedDigest, fx.finalAssembly.record.definitionGraphDigest, 'the graph mutation was real');
});

// ---------------------------------------------------------------------------
// (e) replay never resolves mutable aliases/latest/default bindings.
// ---------------------------------------------------------------------------

test('E10 (e): replay never resolves mutable aliases — forged assemblies and cross-pinned expectations fail closed', async () => {
  const fx = await fixture();
  const activator = makeActivator(fx);
  await activator.activate(activationRequest(fx, { resourceCurrentness: [fx.resourceEvidence] }));

  // A caller-constructed (non-sealed) Assembly lookalike is never a replay
  // target and never activates — no alias resolution exists.
  const forged = {
    record: fx.finalAssembly.record,
    assemblyDigest: fx.finalAssembly.assemblyDigest,
    bindings: [],
  } as unknown as SealedRuntimeAssembly;
  await expectGovernanceError(
    activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: forged,
    }),
    'ASSEMBLY_NOT_SEALED',
  );
  await expectGovernanceError(
    activator.activate(activationRequest(fx, { assembly: forged, resourceCurrentness: [fx.resourceEvidence] })),
    'ASSEMBLY_NOT_SEALED',
  );

  // Cross-class substitution fails closed: the pinned PRODUCTION class can
  // never be satisfied by a SIMULATION expectation (and vice versa).
  await expectGovernanceError(
    activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: fx.finalAssembly,
      expectedAuthorityClass: 'SIMULATION',
    }),
    'AUTHORITY_CLASS_MISMATCH',
  );

  // A revised/missing resource revision fails closed on replay: no
  // latest/default/first fallback for currentness.
  await expectGovernanceError(
    activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: fx.finalAssembly,
      expectedAuthorityClass: 'PRODUCTION',
      expectedResourceCurrentness: [storeEvidence(STORE_REVISION_2)],
    }),
    'RESOURCE_CURRENTNESS_MISMATCH',
  );
  await expectGovernanceError(
    activator.requireResourceCurrentness(OCCURRENCE.workflowInstanceId, [
      storeEvidence(STORE_REVISION_2),
    ]),
    'RESOURCE_CURRENTNESS_MISMATCH',
  );

  // Exact pins replay.
  const recovered = await activator.recover({
    workflowInstanceId: OCCURRENCE.workflowInstanceId,
    expectedAssembly: fx.finalAssembly,
    expectedAuthorityClass: 'PRODUCTION',
    expectedResourceCurrentness: [fx.resourceEvidence],
  });
  assert.equal(recovered.assemblyDigest, fx.finalAssembly.assemblyDigest);
});

test('E10 (e): floating/latest/default pins are unrepresentable on every replay seam', async () => {
  const fx = await fixture();

  // A floating assembly digest can never be woven into a pin. (Unrecognized
  // strings remain opaque exact digests and fail later at exact-match; the
  // recognized mutable selectors/aliases fail closed right here.)
  for (const bad of ['latest', 'current', 'alias:e10-live', '@current', 'active']) {
    await expectGovernanceError(
      createGovernanceExecutionPin(
        {
          ...OCCURRENCE,
          binding: fx.binding,
          assemblyDigest: bad,
          authorityClass: 'PRODUCTION',
        },
        sha256,
      ),
      'ASSEMBLY_DIGEST_FORBIDDEN',
    );
  }

  // A floating Tool implementation pin is rejected before any verification.
  await expectToolBindingError(
    verifyToolImplementationBinding({
      binding: fx.toolBinding,
      finalAssembly: fx.finalAssembly,
      expectedImplementationPin: { ...TOOL_IMPL_ALPHA, implementationVersion: 'latest' },
      sha256,
    }),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
  await expectToolBindingError(
    verifyToolImplementationBinding({
      binding: fx.toolBinding,
      finalAssembly: fx.finalAssembly,
      expectedImplementationPin: { ...TOOL_IMPL_ALPHA, implementationId: 'latest' },
      sha256,
    }),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
  // An x-range VERSION is likewise rejected as a floating selector.
  await expectToolBindingError(
    verifyToolImplementationBinding({
      binding: fx.toolBinding,
      finalAssembly: fx.finalAssembly,
      expectedImplementationPin: { ...TOOL_IMPL_ALPHA, implementationVersion: '1.x' },
      sha256,
    }),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );

  // Tampered replay evidence (a mutable alias in disguise) fails the
  // authoritative digest recomputation.
  const tampered = JSON.parse(JSON.stringify(fx.toolBinding.evidence)) as typeof fx.toolBinding.evidence;
  (tampered as unknown as { supportedOperations: string[] }).supportedOperations = [
    'op.e10.replay.latest',
  ];
  await expectToolBindingError(
    verifyToolImplementationBindingEvidence({
      evidence: tampered,
      finalAssembly: fx.finalAssembly,
      sha256,
    }),
    'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
  );
});

test('E10 (e): a legacy no-Assembly pin is never silently treated as replayable v0.7 authority', async () => {
  const fx = await fixture();
  // A pre-T002C legacy pin (no assemblyDigest) is valid legacy authority in
  // the existing hierarchy, but the v0.7 replay gate refuses it: no fallback,
  // no default Assembly, no alias resolution.
  const legacy = new GovernanceExecutionCoordinator(fx.store, sha256);
  await legacy.pinExecution({ ...OCCURRENCE, binding: fx.binding });

  const activator = makeActivator(fx);
  await expectGovernanceError(
    activator.requireActivatedExecution(OCCURRENCE.workflowInstanceId),
    'MISSING_ASSEMBLY_DIGEST',
  );
  await expectGovernanceError(
    activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId }),
    'MISSING_ASSEMBLY_DIGEST',
  );
  await expectGovernanceError(
    activator.recover({
      workflowInstanceId: OCCURRENCE.workflowInstanceId,
      expectedAssembly: fx.finalAssembly,
    }),
    'MISSING_ASSEMBLY_DIGEST',
  );
});

test('E10: no second pin hierarchy — one durable store, one pin shape, one write per occurrence', async () => {
  const fx = await fixture();
  const activator = makeActivator(fx);
  const pin = await activator.activate(
    activationRequest(fx, { resourceCurrentness: [fx.resourceEvidence] }),
  );

  // Exactly one durable event through the ONE existing store.
  assert.deepEqual(fx.store.events, ['pin:e10.instance.0001']);

  // The same occurrence resolves identically through the pre-existing
  // coordinator and the pre-existing recovery seam.
  const coordinator = new GovernanceExecutionCoordinator(fx.store, sha256);
  const viaCoordinator = await coordinator.requirePinnedExecution(OCCURRENCE.workflowInstanceId);
  assert.equal(viaCoordinator.bindingDigest, pin.bindingDigest);
  assert.equal(viaCoordinator.assemblyDigest, fx.finalAssembly.assemblyDigest);
  const recovered = await activator.recover({ workflowInstanceId: OCCURRENCE.workflowInstanceId });
  assert.equal(recovered.pin.bindingDigest, pin.bindingDigest);

  // The final Assembly carries exactly the one §G Tool slot and the exact
  // resource requirement material — no parallel identity plane was minted.
  assert.equal(fx.finalAssembly.record.implementationBindingEvidence.length, 1);
  assert.equal(fx.finalAssembly.record.implementationBindingEvidence[0]?.subject, TOOL_ID);
  assert.deepEqual(
    fx.finalAssembly.record.resourceRequirements.map((material) => material.componentId),
    [TOOL_ID],
  );

  // Repeating the exact activation is idempotent ('existing' disposition),
  // never a second conflicting durable write.
  const same = await activator.activate(
    activationRequest(fx, { resourceCurrentness: [fx.resourceEvidence] }),
  );
  assert.equal(same.bindingDigest, pin.bindingDigest);
  assert.equal(fx.store.retainedPinCount(), 1, 'exactly one durable pin is retained');
  assert.ok(
    fx.store.events.every((event) => event === 'pin:e10.instance.0001'),
    'every bind call concerned the same occurrence; none wrote a parallel pin',
  );
});
