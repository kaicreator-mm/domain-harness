/**
 * E5 executable reference evidence — Capability ambiguity/missing/
 * incompatibility (issue #876; authority #589 PACK-D E5 + #711 currentness +
 * #625 reference-planning rebind; DAG #534 E5 row <- T003B/C/D/E).
 *
 * REFERENCE GATE (falsification, not demo): every claim below is proven by
 * executing the ACCEPTED production seams over neutral test-only fixtures
 * that cross the same public contracts as production. No production source,
 * barrel, package manifest, Product/L2/DAG mutation exists in this change;
 * the write set is this evidence directory only. A discovered defect would
 * be recorded as evidence (RESULT=REFUTED/PARTIAL), never repaired here.
 *
 * Frozen subject (issue #876):
 *   SUBJECT_HEAD  = b5540e6e47e134c05c048edbe3c3860d476b2332
 *                   (explicit currentness rebind per HEAD_LEASE; the issue's
 *                   d8d42fb pin is an ancestor of this HEAD)
 *   ENVIRONMENT   = LOCAL_AGENT (ZCode kimi-executor, kimi-for-coding)
 *   SOURCE_MUTATION = NONE
 *
 * Frozen manifest (REFERENCE_FIXTURE_FREEZE, captured BEFORE any matrix
 * cell; immutable for the run):
 *   MANIFEST_ID     = E5_CAPABILITY_FAILURE_MATRIX_V1
 *   MANIFEST_VERSION= 1
 *   DEFINITION_FIXTURE = e5.capability.matrix.v1
 *   PRIMARY_PIN     = impl.e5.primary@1.0.0#sha256:5555…55 (64×'5')
 *   ALTERNATE_PIN   = impl.e5.alt@1.0.0#sha256:6666…66 (64×'6')
 *   AUTHORITY_CLASS = NONE_FOR_EFFECT_AUTHORITY (no effect/invocation plane)
 *   REAL_HOST_POSTURE  = NOT_REQUIRED
 *   SECRETS_HANDLES    = EXCLUDED_FROM_IDENTITY
 *
 * Negative permutation matrix executed (issue #876):
 *   provider-0; provider-1; provider-many; domain-host-collision;
 *   impl-missing; impl-incompatible; impl-ambiguous; dependency-missing;
 *   dependency-ambiguous; dependency-cycle; diamond-order-permutations;
 *   stale-definition; stale-selection; stale-binding; stale-closure;
 *   plus the no-latest/default/first/order-fallback negatives required by
 *   #589 PACK-D E5 and the #640 binding-authenticity falsification.
 *
 * Pre-evidence identity capture (F-01, #625): the baseline diamond graph,
 * its sealed Assemblies, the provider-selection identity, every
 * bindingDigest, the closureDigest and the permutation-set digest are
 * constructed through the accepted current seams ONCE, recorded in
 * E5_FROZEN_IDENTITIES (deep frozen), and every matrix cell is evaluated
 * against that immutable identity block.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { CapabilityContractRef, ComponentEnvelope } from '../../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../../src/contracts/definition-graph.js';
import {
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../../../src/contracts/identity.js';
import {
  CapabilityProvisionContractError,
  resolveCurrentCapabilityProvider,
  selectCapabilityProvider,
  type CurrentCapabilityProviderSelection,
} from '../../../src/contracts/capability-provision.js';
import {
  CapabilityPlaneContractError,
  resolveCapabilityPlane,
} from '../../../src/contracts/capability-plane.js';
import {
  sealRuntimeAssembly,
  RuntimeAssemblyError,
  type SealedRuntimeAssembly,
} from '../../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  isSealedToolImplementationBinding,
  ToolImplementationBindingError,
  verifyToolImplementationBinding,
  verifyToolImplementationBindingEvidence,
  type SealedToolImplementationBinding,
  type ToolImplementationBindingEvidence,
  type ToolImplementationCandidate,
  type ToolImplementationIdentity,
} from '../../../src/contracts/tool-implementation-binding.js';
import {
  CapabilityDependencyClosureError,
  closeCapabilityDependencies,
  type SealedCapabilityDependencyClosure,
} from '../../../src/contracts/capability-dependency-closure.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Frozen manifest constants (e5.capability.matrix.v1) — pinned verbatim.
// ---------------------------------------------------------------------------

const MANIFEST_ID = 'E5_CAPABILITY_FAILURE_MATRIX_V1';
const MANIFEST_VERSION = 1;
const DEFINITION_FIXTURE = 'e5.capability.matrix.v1';
const PRIMARY_PIN: ToolImplementationIdentity = Object.freeze({
  implementationId: 'impl.e5.primary',
  implementationVersion: '1.0.0',
  implementationDigest: `sha256:${'5'.repeat(64)}`,
});
const ALTERNATE_PIN: ToolImplementationIdentity = Object.freeze({
  implementationId: 'impl.e5.alt',
  implementationVersion: '1.0.0',
  implementationDigest: `sha256:${'6'.repeat(64)}`,
});
const MANIFEST_CLAIMED_CANONICAL_SHA256 =
  'f3cdaf30de05794f541500774dc9ad4d83d75586dae8b19cd4fb2e09bd26f67e';

const CAP_B: CapabilityContractRef = Object.freeze({ capabilityId: 'cap.e5.b', version: '1.0.0' });
const CAP_C: CapabilityContractRef = Object.freeze({ capabilityId: 'cap.e5.c', version: '1.0.0' });
const CAP_D: CapabilityContractRef = Object.freeze({ capabilityId: 'cap.e5.d', version: '1.0.0' });

const KIND = { kindId: 'e5.matrix-kind', version: '1.0.0' } as const;

function ref(capabilityId: string, version: string): CapabilityContractRef {
  return Object.freeze({ capabilityId, version });
}

function toolComponent(
  componentId: string,
  requiredCapabilities: readonly CapabilityContractRef[],
  provides: readonly CapabilityContractRef[],
  operations: readonly string[],
): ComponentEnvelope {
  return {
    family: 'tool',
    componentId,
    kind: { ...KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: requiredCapabilities.map((r) => ({ ...r })),
    semanticBody: {
      operations: operations.map((operationId) => ({
        operationId,
        inputSchema: {},
        outputSchema: {},
        effect: 'none',
      })),
      providesCapabilities: provides.map((r) => ({ ...r })),
    },
  };
}

/** The neutral baseline diamond of e5.capability.matrix.v1. */
function e5Graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e5.matrix.v1',
    components: [
      toolComponent('tool.e5.root', [CAP_B, CAP_C], [], ['op.e5.root']),
      toolComponent('tool.e5.b', [CAP_D], [CAP_B], ['op.e5.b1', 'op.e5.b2']),
      toolComponent('tool.e5.c', [CAP_D], [CAP_C], ['op.e5.c']),
      toolComponent('tool.e5.d', [], [CAP_D], ['op.e5.d']),
    ],
    relations: [],
    ...overrides,
  };
}

function understoodCapabilities(definitionGraph: DefinitionGraphEnvelope) {
  const seen = new Set<string>();
  const refs: Array<{ capabilityId: string; version: string }> = [];
  for (const component of definitionGraph.components) {
    for (const r of component.requiredCapabilities) {
      const key = `${r.capabilityId}@${r.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ ...r });
      }
    }
  }
  return refs;
}

function kindBinding(definitionGraph: DefinitionGraphEnvelope) {
  return {
    pin: {
      kind: { ...KIND },
      implementation: {
        implementationId: 'impl.e5.kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:e5-kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: understoodCapabilities(definitionGraph),
    validateComponent: () => {},
  };
}

async function sealedBaseAssembly(definitionGraph: DefinitionGraphEnvelope) {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding(definitionGraph)] },
    realSha256,
  );
}

/** One PRIMARY-pin compatible candidate for one provider Tool. */
function primaryCandidate(
  toolComponentId: string,
  operations: readonly string[],
  pin: ToolImplementationIdentity = PRIMARY_PIN,
): ToolImplementationCandidate {
  return {
    implementation: { ...pin },
    supportedOperations: [...operations],
    handle: { marker: `${toolComponentId}-handle` },
  };
}

const OPS_BY_TOOL: Record<string, readonly string[]> = {
  'tool.e5.b': ['op.e5.b1', 'op.e5.b2'],
  'tool.e5.c': ['op.e5.c'],
  'tool.e5.d': ['op.e5.d'],
};

interface MintSpec {
  readonly consumerComponentId: string;
  readonly requiredCapability: CapabilityContractRef;
  readonly candidate: ToolImplementationCandidate;
}

function e5Mints(
  candidateByTool: Record<string, ToolImplementationCandidate> = {},
  consumerComponentId = 'tool.e5.root',
): MintSpec[] {
  return [
    {
      consumerComponentId,
      requiredCapability: CAP_B,
      candidate: candidateByTool['tool.e5.b'] ?? primaryCandidate('tool.e5.b', OPS_BY_TOOL['tool.e5.b']!),
    },
    {
      consumerComponentId: 'tool.e5.b',
      requiredCapability: CAP_D,
      candidate: candidateByTool['tool.e5.d'] ?? primaryCandidate('tool.e5.d', OPS_BY_TOOL['tool.e5.d']!),
    },
    {
      consumerComponentId,
      requiredCapability: CAP_C,
      candidate: candidateByTool['tool.e5.c'] ?? primaryCandidate('tool.e5.c', OPS_BY_TOOL['tool.e5.c']!),
    },
  ];
}

/**
 * Pre-mint dependency bindings through the accepted T003C mint path,
 * threading each successor reseal; returns the ONE final Assembly plus the
 * minted bindings (test-only authority setup through production seams).
 */
async function mintDependencyBindings(
  definitionGraph: DefinitionGraphEnvelope,
  mints: readonly MintSpec[],
): Promise<{
  bindings: SealedToolImplementationBinding[];
  finalAssembly: SealedRuntimeAssembly;
  baseAssembly: SealedRuntimeAssembly;
}> {
  const baseAssembly = await sealedBaseAssembly(definitionGraph);
  const graphDigest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  let cursor = baseAssembly;
  const bindings: SealedToolImplementationBinding[] = [];
  for (const spec of mints) {
    const selection = await resolveCurrentCapabilityProvider(
      definitionGraph,
      spec.requiredCapability,
      spec.consumerComponentId,
      graphDigest,
      realSha256,
    );
    const binding = await bindToolImplementation({
      assembly: cursor,
      selection,
      currentDefinitionGraph: definitionGraph,
      implementations: [spec.candidate],
      sha256: realSha256,
    });
    bindings.push(binding);
    cursor = binding.successorAssembly;
  }
  return { bindings, finalAssembly: cursor, baseAssembly };
}

// ---------------------------------------------------------------------------
// Error expectation helpers
// ---------------------------------------------------------------------------

/**
 * Evaluate a possibly-synchronous call inside the async expectation so a
 * synchronous throw is captured exactly like a rejection.
 */
async function captureError(fn: () => unknown): Promise<unknown> {
  try {
    return await fn();
  } catch (error) {
    return Promise.reject(error);
  }
}

async function expectProvisionError(
  fn: () => unknown,
  code: string,
): Promise<CapabilityProvisionContractError> {
  try {
    await captureError(fn);
  } catch (error) {
    assert.ok(
      error instanceof CapabilityProvisionContractError,
      `expected CapabilityProvisionContractError(${code}), got ${String(error)}`,
    );
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected CapabilityProvisionContractError(${code}), but the call resolved`);
}

async function expectPlaneError(
  fn: () => unknown,
  code: string,
): Promise<CapabilityPlaneContractError> {
  try {
    await captureError(fn);
  } catch (error) {
    assert.ok(
      error instanceof CapabilityPlaneContractError,
      `expected CapabilityPlaneContractError(${code}), got ${String(error)}`,
    );
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected CapabilityPlaneContractError(${code}), but the call resolved`);
}

async function expectBindingError(
  fn: () => unknown,
  code: string,
): Promise<ToolImplementationBindingError> {
  try {
    await captureError(fn);
  } catch (error) {
    assert.ok(
      error instanceof ToolImplementationBindingError,
      `expected ToolImplementationBindingError(${code}), got ${String(error)}`,
    );
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected ToolImplementationBindingError(${code}), but the call resolved`);
}

async function expectClosureError(
  promise: Promise<unknown>,
  code: string,
): Promise<CapabilityDependencyClosureError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(
      error instanceof CapabilityDependencyClosureError,
      `expected CapabilityDependencyClosureError(${code}), got ${String(error)}`,
    );
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected CapabilityDependencyClosureError(${code}), but the call resolved`);
}

async function expectAssemblyError(promise: Promise<unknown>, code: string): Promise<RuntimeAssemblyError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(
      error instanceof RuntimeAssemblyError,
      `expected RuntimeAssemblyError(${code}), got ${String(error)}`,
    );
    assert.equal(error.code, code);
    return error;
  }
  throw new Error(`expected RuntimeAssemblyError(${code}), but the call resolved`);
}

// ---------------------------------------------------------------------------
// Pre-evidence identity capture (F-01): built ONCE through accepted seams,
// before any matrix cell; immutable (deep frozen) for the whole run.
// ---------------------------------------------------------------------------

interface E5FrozenIdentities {
  readonly graph: DefinitionGraphEnvelope;
  readonly definitionGraphDigest: string;
  readonly baseAssemblyDigest: string;
  readonly finalAssemblyDigest: string;
  readonly selectionB: CurrentCapabilityProviderSelection;
  readonly bindingDigests: Readonly<Record<string, string>>;
  readonly closure: SealedCapabilityDependencyClosure;
  readonly closureDigest: string;
  readonly permutationSetDigest: string;
  readonly permutationClosureDigests: readonly string[];
  readonly manifestObservedCanonicalSha256: string;
}

let frozenCapture: Promise<E5FrozenIdentities> | undefined;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

async function captureE5Identities(): Promise<E5FrozenIdentities> {
  if (frozenCapture !== undefined) {
    return frozenCapture;
  }
  frozenCapture = (async (): Promise<E5FrozenIdentities> => {
    const graph = e5Graph();
    const definitionGraphDigest = await computeDefinitionGraphDigest(graph, realSha256);

    const minted = await mintDependencyBindings(graph, e5Mints());
    const baseAssemblyDigest = minted.baseAssembly.assemblyDigest;
    const finalAssemblyDigest = minted.finalAssembly.assemblyDigest;

    const selectionB = await resolveCurrentCapabilityProvider(
      graph,
      CAP_B,
      'tool.e5.root',
      definitionGraphDigest,
      realSha256,
    );

    const bindingDigests: Record<string, string> = {};
    for (const binding of minted.bindings) {
      bindingDigests[binding.evidence.toolComponentId] = binding.evidence.bindingDigest;
    }

    const closure = await closeCapabilityDependencies({
      assembly: minted.finalAssembly,
      rootComponentId: 'tool.e5.root',
      currentDefinitionGraph: graph,
      dependencyBindings: minted.bindings,
      sha256: realSha256,
    });

    // Permutation set (diamond-order-permutations): the same closure decided
    // under every accepted input-order permutation must be identity-equal.
    const permutationClosureDigests: string[] = [];
    const componentOrders: ReadonlyArray<readonly ComponentEnvelope[]> = [
      graph.components,
      [...graph.components].reverse(),
      [
        graph.components[3]!,
        graph.components[1]!,
        graph.components[0]!,
        graph.components[2]!,
      ],
    ];
    const mintOrders: Array<readonly MintSpec[]> = [
      e5Mints(),
      [e5Mints()[2]!, e5Mints()[0]!, e5Mints()[1]!],
      [e5Mints()[1]!, e5Mints()[2]!, e5Mints()[0]!],
    ];
    for (let i = 0; i < componentOrders.length; i++) {
      const permGraph = e5Graph({ components: componentOrders[i]! });
      const permMinted = await mintDependencyBindings(permGraph, mintOrders[i]!);
      const permClosed = await closeCapabilityDependencies({
        assembly: permMinted.finalAssembly,
        rootComponentId: 'tool.e5.root',
        currentDefinitionGraph: permGraph,
        // Bindings supplied in reversed subject order too.
        dependencyBindings: [...permMinted.bindings].reverse(),
        sha256: realSha256,
      });
      permutationClosureDigests.push(permClosed.evidence.closureDigest);
    }
    const permutationSetDigest = await computeCanonicalJsonDigest(
      Object.freeze({ manifest: MANIFEST_ID, closureDigests: [...permutationClosureDigests].sort() }),
      realSha256,
    );

    // Manifest canonicalization observation (the controller's canonical form
    // is not normatively specified; the observed digest is recorded and
    // reported in LIMITS if it differs from the claimed value).
    const manifestObservedCanonicalSha256 = await realSha256.digestUtf8(
      canonicalJsonStringify({
        MANIFEST_ID,
        MANIFEST_VERSION,
        DEFINITION_FIXTURE,
        PRIMARY_PIN: 'impl.e5.primary@1.0.0#sha256:5555555555555555555555555555555555555555555555555555555555555555',
        ALTERNATE_PIN: 'impl.e5.alt@1.0.0#sha256:6666666666666666666666666666666666666666666666666666666666666666',
        AUTHORITY_CLASS: 'NONE_FOR_EFFECT_AUTHORITY',
        NEGATIVE_PERMUTATION_MATRIX: [
          'provider-0',
          'provider-1',
          'provider-many',
          'domain-host-collision',
          'impl-missing',
          'impl-incompatible',
          'impl-ambiguous',
          'dependency-missing',
          'dependency-ambiguous',
          'dependency-cycle',
          'diamond-order-permutations',
          'stale-definition',
          'stale-selection',
          'stale-binding',
          'stale-closure',
        ],
        REAL_HOST_POSTURE: 'NOT_REQUIRED',
        SECRETS_HANDLES: 'EXCLUDED_FROM_IDENTITY',
      }),
    );

    return deepFreeze({
      graph,
      definitionGraphDigest,
      baseAssemblyDigest,
      finalAssemblyDigest,
      selectionB,
      bindingDigests,
      closure,
      closureDigest: closure.evidence.closureDigest,
      permutationSetDigest,
      permutationClosureDigests: Object.freeze([...permutationClosureDigests]),
      manifestObservedCanonicalSha256,
    });
  })();
  return frozenCapture;
}

test('E5 pre-evidence identity capture: baseline graph/Assembly/selection/binding/closure/permutation identities recorded once and immutable', async () => {
  const frozen = await captureE5Identities();

  assert.equal(frozen.graph.graphId, 'graph.e5.matrix.v1');
  assert.equal(frozen.definitionGraphDigest.length > 0, true);
  assert.equal(frozen.baseAssemblyDigest.length > 0, true);
  assert.equal(frozen.finalAssemblyDigest.length > 0, true);
  assert.notEqual(frozen.baseAssemblyDigest, frozen.finalAssemblyDigest);
  assert.equal(frozen.selectionB.provider.componentId, 'tool.e5.b');
  assert.equal(frozen.selectionB.provider.family, 'tool');
  assert.equal(frozen.selectionB.definitionGraphDigest, frozen.definitionGraphDigest);
  assert.deepEqual(Object.keys(frozen.bindingDigests).sort(), [
    'tool.e5.b',
    'tool.e5.c',
    'tool.e5.d',
  ]);
  assert.equal(frozen.closure.evidence.rootComponentId, 'tool.e5.root');
  assert.equal(frozen.closure.evidence.definitionGraphDigest, frozen.definitionGraphDigest);
  assert.equal(frozen.closure.evidence.assemblyDigest, frozen.finalAssemblyDigest);
  assert.equal(frozen.closure.evidence.entries.length, 3);
  // Diamond sharing: cap.e5.d consumed once though required by both b and c.
  assert.equal(
    frozen.closure.evidence.edges.filter((edge) => edge.providerComponentId === 'tool.e5.d')
      .length,
    2,
  );
  assert.equal(
    frozen.closure.evidence.entries.filter((entry) => entry.toolComponentId === 'tool.e5.d')
      .length,
    1,
  );
  // Permutation invariance: every input-order permutation closes identically.
  assert.equal(frozen.permutationClosureDigests.length, 3);
  for (const digest of frozen.permutationClosureDigests) {
    assert.equal(digest, frozen.closureDigest);
  }

  // Immutability: the capture is deep frozen and memoized — a second call
  // returns the identical object (no re-derivation after outcomes).
  const again = await captureE5Identities();
  assert.equal(again, frozen);
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(Object.isFrozen(frozen.graph.components), true);
  assert.equal(Object.isFrozen(frozen.selectionB), true);

  console.log(
    JSON.stringify(
      {
        E5_IDENTITY_CAPTURE: {
          DEFINITION_FIXTURE,
          definitionGraphDigest: frozen.definitionGraphDigest,
          baseAssemblyDigest: frozen.baseAssemblyDigest,
          finalAssemblyDigest: frozen.finalAssemblyDigest,
          selectionProvider: frozen.selectionB.provider.componentId,
          bindingDigests: frozen.bindingDigests,
          closureDigest: frozen.closureDigest,
          permutationSetDigest: frozen.permutationSetDigest,
          manifestClaimedCanonicalSha256: MANIFEST_CLAIMED_CANONICAL_SHA256,
          manifestObservedCanonicalSha256: frozen.manifestObservedCanonicalSha256,
        },
      },
      null,
      2,
    ),
  );
});

// ---------------------------------------------------------------------------
// MATRIX CELL provider-0: zero compatible Domain providers => typed
// CAPABILITY_PROVIDER_NOT_FOUND; identical through T003B candidate,
// T003B currentness-bound and T003D host-absent paths; no nearest version.
// ---------------------------------------------------------------------------

test('E5 provider-0: zero Domain providers fails typed CAPABILITY_PROVIDER_NOT_FOUND on all three selection surfaces', async () => {
  const frozen = await captureE5Identities();
  const graphNoProvider = e5Graph({
    components: e5Graph().components.filter((c) => c.componentId !== 'tool.e5.b'),
  });

  await expectProvisionError(
    (() => selectCapabilityProvider(graphNoProvider, CAP_B)),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
  const graphNoProviderDigest = await computeDefinitionGraphDigest(graphNoProvider, realSha256);
  await expectProvisionError(
    () => resolveCurrentCapabilityProvider(
      graphNoProvider,
      CAP_B,
      'tool.e5.root',
      graphNoProviderDigest,
      realSha256,
    ),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
  // T003D host-absent: byte-identical missing-provider failure, unwrapped.
  await expectProvisionError(
    (() => resolveCapabilityPlane(graphNoProvider, [], CAP_B, 'tool.e5.root')),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
  // The baseline identity proves the only difference is the removed provider.
  assert.equal(frozen.selectionB.provider.componentId, 'tool.e5.b');
});

test('E5 provider-0: a provider of ANOTHER exact version is NOT provision (no nearest-version, no compat suffix)', async () => {
  const graphOtherVersion = e5Graph({
    components: [
      toolComponent('tool.e5.root', [CAP_B], [], ['op.e5.root']),
      toolComponent('tool.e5.b2', [], [ref('cap.e5.b', '2.0.0')], ['op.e5.b2']),
    ],
  });
  await expectProvisionError(
    (() => selectCapabilityProvider(graphOtherVersion, CAP_B)),
    'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

// ---------------------------------------------------------------------------
// MATRIX CELL provider-1: exactly one compatible provider => deterministic
// selection; exact evidence identity; frozen non-aliasing values.
// ---------------------------------------------------------------------------

test('E5 provider-1: single provider selects deterministically with exact identity and frozen, non-aliasing evidence', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;

  const selection = selectCapabilityProvider(graph, CAP_B);
  assert.equal(selection.provider.componentId, 'tool.e5.b');
  assert.deepEqual(selection.provider.providesCapability, CAP_B);
  assert.equal(Object.isFrozen(selection.requiredCapability), true);
  assert.equal(Object.isFrozen(selection.provider), true);
  assert.equal(Object.isFrozen(selection), true);

  const current = await resolveCurrentCapabilityProvider(
    graph,
    CAP_B,
    'tool.e5.root',
    frozen.definitionGraphDigest,
    realSha256,
  );
  assert.equal(current.provider.componentId, 'tool.e5.b');
  assert.equal(current.consumer.componentId, 'tool.e5.root');
  assert.equal(current.definitionGraphDigest, frozen.definitionGraphDigest);
  // Evidence carries no implementation/binding/pin identity of any kind.
  assert.deepEqual(Object.keys(current.provider).sort(), ['componentId', 'family', 'providesCapability']);
});

// ---------------------------------------------------------------------------
// MATRIX CELL provider-many: >1 compatible Domain providers => typed
// CAPABILITY_PROVIDER_AMBIGUOUS, sorted diagnostics, no first-wins — and the
// ambiguity is permutation-invariant.
// ---------------------------------------------------------------------------

test('E5 provider-many: two compatible providers fail AMBIGUOUS with sorted conflicting ids, invariant under declaration and component order', async () => {
  const ambiguousGraph = (order: 'forward' | 'reverse') => {
    const extra = toolComponent('tool.e5.b2', [], [CAP_B], ['op.e5.b2']);
    const components = [
      toolComponent('tool.e5.root', [CAP_B], [], ['op.e5.root']),
      toolComponent('tool.e5.b', [], [CAP_B], ['op.e5.b1']),
      extra,
    ];
    return e5Graph({
      components: order === 'reverse' ? [...components].reverse() : components,
    });
  };

  const errorForward = await expectProvisionError(
    (() => selectCapabilityProvider(ambiguousGraph('forward'), CAP_B)),
    'CAPABILITY_PROVIDER_AMBIGUOUS',
  );
  const errorReverse = await expectProvisionError(
    (() => selectCapabilityProvider(ambiguousGraph('reverse'), CAP_B)),
    'CAPABILITY_PROVIDER_AMBIGUOUS',
  );
  assert.deepEqual(errorForward.conflictingProviderComponentIds, [
    'tool.e5.b',
    'tool.e5.b2',
  ]);
  assert.deepEqual(
    errorForward.conflictingProviderComponentIds,
    errorReverse.conflictingProviderComponentIds,
  );

  // T003D host-absent: the ambiguity propagates unwrapped from the T003B path.
  await expectProvisionError(
    (() => resolveCapabilityPlane(ambiguousGraph('forward'), [], CAP_B)),
    'CAPABILITY_PROVIDER_AMBIGUOUS',
  );
});

// ---------------------------------------------------------------------------
// NO FALLBACK negatives: floating/range/embedded selectors fail typed on the
// selection, plane and binding surfaces — never normalized, never resolved.
// ---------------------------------------------------------------------------

test('E5 no-fallback: floating/range/x-range/embedded-selector refs fail typed on selection and binding surfaces', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;

  for (const bad of [
    ref('cap.e5.b', 'latest'),
    ref('cap.e5.b', '1.x'),
    ref('cap.e5.b', 'default'),
    ref('cap.e5.b@1.0.0', '1.0.0'),
  ]) {
    await expectProvisionError(
      (() => selectCapabilityProvider(graph, bad)),
      bad.capabilityId.includes('@')
        ? 'INVALID_SELECTION_INPUT'
        : 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
    );
  }

  // T003D: the required-ref exactness failures propagate unwrapped too.
  await expectProvisionError(
    (() => resolveCapabilityPlane(graph, [], ref('cap.e5.b', 'latest'))),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );

  // T003C: a floating exactPin and a floating candidate version fail typed at
  // the binding snapshot — before any binding decision.
  const noPinAssembly = await sealedBaseAssembly(graph);
  await expectBindingError(
    () => bindToolImplementation({
      assembly: noPinAssembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations: [primaryCandidate('tool.e5.b', OPS_BY_TOOL['tool.e5.b']!)],
      exactPin: { ...PRIMARY_PIN, implementationVersion: 'latest' },
      sha256: realSha256,
    }),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
  await expectBindingError(
    () => bindToolImplementation({
      assembly: noPinAssembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations: [
        primaryCandidate('tool.e5.b', OPS_BY_TOOL['tool.e5.b']!, {
          ...PRIMARY_PIN,
          implementationVersion: '2.x',
        }),
      ],
      sha256: realSha256,
    }),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
});

// ---------------------------------------------------------------------------
// MATRIX CELL domain-host-collision (T003D): the four plane routings, dual
// provision collision, plane-prior-to-ambiguity, version-mismatch host
// declaration is NOT a collision, and order invariance.
// ---------------------------------------------------------------------------

test('E5 domain-host-collision: dual provision of the same exact ref fails CAPABILITY_PLANE_COLLISION regardless of declaration order', async () => {
  const graph = e5Graph();
  const hostDecl = [CAP_B];

  const collisionA = await expectPlaneError(
    (() => resolveCapabilityPlane(graph, hostDecl, CAP_B, 'tool.e5.root')),
    'CAPABILITY_PLANE_COLLISION',
  );
  // Host declaration listed before the Domain material is irrelevant — the
  // resolver takes a flat exact-ref list; component order permuted too.
  const permGraph = e5Graph({ components: [...graph.components].reverse() });
  const collisionB = await expectPlaneError(
    (() => resolveCapabilityPlane(permGraph, hostDecl, CAP_B, 'tool.e5.root')),
    'CAPABILITY_PLANE_COLLISION',
  );
  assert.deepEqual(collisionA.domainProviderComponentIds, ['tool.e5.b']);
  assert.deepEqual(collisionA.domainProviderComponentIds, collisionB.domainProviderComponentIds);

  // Plane-prior: dual provision with an AMBIGUOUS Domain plane is still a
  // collision, never an ambiguity win.
  const ambiguousGraph = e5Graph({
    components: [
      ...graph.components,
      toolComponent('tool.e5.b2', [], [CAP_B], ['op.e5.b2']),
    ],
  });
  const collisionAmbiguous = await expectPlaneError(
    (() => resolveCapabilityPlane(ambiguousGraph, hostDecl, CAP_B, 'tool.e5.root')),
    'CAPABILITY_PLANE_COLLISION',
  );
  assert.deepEqual(collisionAmbiguous.domainProviderComponentIds, [
    'tool.e5.b',
    'tool.e5.b2',
  ]);
});

test('E5 domain-host planes: domain-only routes the T003B selection; host-only mints provider-free host evidence; a different host version is not provision', async () => {
  const graph = e5Graph();

  const domainOnly = resolveCapabilityPlane(graph, [], CAP_B, 'tool.e5.root');
  if (domainOnly.plane !== 'domain') {
    throw new Error(`expected the domain plane, got ${domainOnly.plane}`);
  }
  assert.equal(domainOnly.selection.provider.componentId, 'tool.e5.b');

  // Host-only provision of a ref NO Domain Tool provides: a pure host-plane
  // result carrying the exact frozen refs and no provider identity at all.
  const CAP_H = ref('cap.e5.h', '1.0.0');
  const hostOnly = resolveCapabilityPlane(graph, [CAP_H], CAP_H, 'tool.e5.root');
  if (hostOnly.plane !== 'host') {
    throw new Error(`expected the host plane, got ${hostOnly.plane}`);
  }
  assert.equal(hostOnly.graphId, graph.graphId);
  assert.deepEqual(hostOnly.requiredCapability, CAP_H);
  assert.deepEqual(hostOnly.hostProvidedCapability, CAP_H);
  assert.equal(Object.isFrozen(hostOnly.hostProvidedCapability), true);
  // Host evidence is pure declaration: no provider identity of any kind.
  assert.deepEqual(Object.keys(hostOnly).sort(), [
    'graphId',
    'hostProvidedCapability',
    'plane',
    'requiredCapability',
  ]);

  // Host declares cap.e5.b@2.0.0 only: NOT provision of cap.e5.b@1.0.0 — the
  // Domain plane selects normally, no collision, no version bridging.
  const hostOtherVersion = resolveCapabilityPlane(graph, [ref('cap.e5.b', '2.0.0')], CAP_B, 'tool.e5.root');
  assert.equal(hostOtherVersion.plane, 'domain');
});

// ---------------------------------------------------------------------------
// MATRIX CELLS impl-missing / impl-incompatible / impl-ambiguous (T003C):
// typed fail-closed binding decisions on the accepted mint seam.
// ---------------------------------------------------------------------------

test('E5 impl-missing: zero compatible offered implementations fails MISSING_TOOL_IMPLEMENTATION; an exact pin matching no candidate (version/digest drift) fails MISSING too', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;
  const assembly = await sealedBaseAssembly(graph);
  const incompatibleCandidate: ToolImplementationCandidate = {
    implementation: { ...ALTERNATE_PIN },
    supportedOperations: ['op.e5.unrelated'],
  };

  await expectBindingError(
    () => bindToolImplementation({
      assembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations: [incompatibleCandidate],
      sha256: realSha256,
    }),
    'MISSING_TOOL_IMPLEMENTATION',
  );

  // Exact pin present but the offered candidate carries a DIFFERENT content
  // digest: the exact implementation is not offered — never resolved against
  // a same-id different-digest candidate.
  await expectBindingError(
    () => bindToolImplementation({
      assembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations: [
        primaryCandidate('tool.e5.b', OPS_BY_TOOL['tool.e5.b']!, {
          ...PRIMARY_PIN,
          implementationDigest: `sha256:${'7'.repeat(64)}`,
        }),
      ],
      exactPin: PRIMARY_PIN,
      sha256: realSha256,
    }),
    'MISSING_TOOL_IMPLEMENTATION',
  );
});

test('E5 impl-incompatible: zero compatible candidates fails MISSING_TOOL_IMPLEMENTATION; an exactly-pinned but operation-incompatible candidate fails INCOMPATIBLE_TOOL_IMPLEMENTATION and the pin never overrides it', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;
  const assembly = await sealedBaseAssembly(graph);
  const partialCandidate: ToolImplementationCandidate = {
    implementation: { ...PRIMARY_PIN },
    supportedOperations: ['op.e5.b1'],
  };

  // Without an exact pin there is no operation-compatible candidate at all:
  // zero compatible candidates surfaces as MISSING (the accepted taxonomy
  // has no nearest/closest implementation fallback).
  await expectBindingError(
    () => bindToolImplementation({
      assembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations: [partialCandidate],
      sha256: realSha256,
    }),
    'MISSING_TOOL_IMPLEMENTATION',
  );

  // Whole-Tool binding requires BOTH declared operations; even an exact
  // authoritative pin cannot bind an operation-incompatible candidate —
  // the pinned-incompatible case is the INCOMPATIBLE surface, and the pin
  // never overrides incompatibility.
  await expectBindingError(
    () => bindToolImplementation({
      assembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations: [partialCandidate],
      exactPin: PRIMARY_PIN,
      sha256: realSha256,
    }),
    'INCOMPATIBLE_TOOL_IMPLEMENTATION',
  );

  // Caller narrowing to the supported subset is the only explicit way to
  // bind this candidate — and it is caller-explicit, never inferred.
  const narrowed = await bindToolImplementation({
    assembly,
    selection: frozen.selectionB,
    currentDefinitionGraph: graph,
    implementations: [partialCandidate],
    requiredOperations: ['op.e5.b1'],
    sha256: realSha256,
  });
  assert.deepEqual(narrowed.evidence.supportedOperations, ['op.e5.b1']);
  assert.equal(narrowed.evidence.implementation.implementationDigest, PRIMARY_PIN.implementationDigest);
});

test('E5 impl-ambiguous: two compatible candidates without an exact pin fail AMBIGUOUS_TOOL_IMPLEMENTATION with sorted ids; duplicate candidate identities are ambiguity, never first-wins; an exact pin resolves deterministically', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;
  const assembly = await sealedBaseAssembly(graph);
  const compatible = (pin: ToolImplementationIdentity): ToolImplementationCandidate => ({
    implementation: { ...pin },
    supportedOperations: [...OPS_BY_TOOL['tool.e5.b']!],
  });

  const ambiguous = await expectBindingError(
    () => bindToolImplementation({
      assembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations: [compatible(PRIMARY_PIN), compatible(ALTERNATE_PIN)],
      sha256: realSha256,
    }),
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );
  assert.deepEqual(ambiguous.conflictingImplementationIds, [
    'impl.e5.alt',
    'impl.e5.primary',
  ]);

  // Candidate ORDER is not authority: reversed order, same failure.
  const ambiguousReversed = await expectBindingError(
    () => bindToolImplementation({
      assembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations: [compatible(ALTERNATE_PIN), compatible(PRIMARY_PIN)],
      sha256: realSha256,
    }),
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );
  assert.deepEqual(
    ambiguous.conflictingImplementationIds,
    ambiguousReversed.conflictingImplementationIds,
  );

  // Duplicate identity candidates are ambiguity even as a single id.
  await expectBindingError(
    () => bindToolImplementation({
      assembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations: [compatible(PRIMARY_PIN), compatible(PRIMARY_PIN)],
      sha256: realSha256,
    }),
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );

  // The exact authoritative pin resolves deterministically to the named
  // candidate — the alternate — regardless of candidate order.
  for (const implementations of [
    [compatible(PRIMARY_PIN), compatible(ALTERNATE_PIN)],
    [compatible(ALTERNATE_PIN), compatible(PRIMARY_PIN)],
  ]) {
    const bound = await bindToolImplementation({
      assembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: graph,
      implementations,
      exactPin: ALTERNATE_PIN,
      sha256: realSha256,
    });
    assert.equal(bound.evidence.implementation.implementationId, 'impl.e5.alt');
    assert.equal(bound.evidence.implementation.implementationDigest, ALTERNATE_PIN.implementationDigest);
  }
});

// ---------------------------------------------------------------------------
// MATRIX CELLS stale-definition / stale-selection (T003B/#572 + T003C
// currentness conjunction): stale or foreign currentness claims fail closed
// before any evidence is minted.
// ---------------------------------------------------------------------------

test('E5 stale-definition: a stale/foreign Definition currentness claim fails DEFINITION_GRAPH_DIGEST_MISMATCH before selection evidence is minted', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;

  // Claim the base-assembly-era... any digest that is not the recomputed one.
  await expectProvisionError(
    () => resolveCurrentCapabilityProvider(
      graph,
      CAP_B,
      'tool.e5.root',
      `sha256:${'9'.repeat(64)}`,
      realSha256,
    ),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );

  // A structurally invalid (empty, non-digest) claim fails
  // INVALID_SELECTION_INPUT before any recomputation.
  await expectProvisionError(
    () => resolveCurrentCapabilityProvider(graph, CAP_B, 'tool.e5.root', '', realSha256),
    'INVALID_SELECTION_INPUT',
  );

  // The graph changed after the claim was computed: the claimed (pre-mutation)
  // digest is now stale against the recomputed content.
  const mutatedGraph = e5Graph({
    components: [...e5Graph().components, toolComponent('tool.e5.z', [], [], ['op.e5.z'])],
  });
  await expectProvisionError(
    () => resolveCurrentCapabilityProvider(
      mutatedGraph,
      CAP_B,
      'tool.e5.root',
      frozen.definitionGraphDigest,
      realSha256,
    ),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );
});

test('E5 stale-definition + stale-selection: bindToolImplementation recomputes the graph digest and fails DEFINITION_GRAPH_DIGEST_MISMATCH against both the sealed Assembly and the selection evidence', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;
  const assembly = await sealedBaseAssembly(graph);

  // (a) The Definition graph was replaced after the Assembly was sealed:
  // recomputed digest != Assembly record digest.
  const replacedGraph = e5Graph({
    components: [...e5Graph().components, toolComponent('tool.e5.z', [], [], ['op.e5.z'])],
  });
  await expectBindingError(
    () => bindToolImplementation({
      assembly,
      selection: frozen.selectionB,
      currentDefinitionGraph: replacedGraph,
      implementations: [primaryCandidate('tool.e5.b', OPS_BY_TOOL['tool.e5.b']!)],
      sha256: realSha256,
    }),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );

  // (b) Stale/replaced selection evidence: a field-tampered selection whose
  // bound digest no longer matches the recomputed graph digest can never
  // authorize a binding.
  const tamperedSelection = {
    ...frozen.selectionB,
    definitionGraphDigest: `sha256:${'9'.repeat(64)}`,
  } as CurrentCapabilityProviderSelection;
  await expectBindingError(
    () => bindToolImplementation({
      assembly,
      selection: tamperedSelection,
      currentDefinitionGraph: graph,
      implementations: [primaryCandidate('tool.e5.b', OPS_BY_TOOL['tool.e5.b']!)],
      sha256: realSha256,
    }),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );
});

// ---------------------------------------------------------------------------
// #640 binding authenticity seam: forged bindings (prototype inheritance,
// stolen symbol, field copy) are not mint members and can never reach
// authority; tampered serialized evidence fails digest verification.
// ---------------------------------------------------------------------------

test('E5 binding-authenticity: forged sealed bindings (Object.create, stolen symbol, field copy) are rejected UNMINTED_TOOL_IMPLEMENTATION_BINDING before any authority use', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;
  const minted = await mintDependencyBindings(graph, [e5Mints()[0]!]);
  const genuine = minted.bindings[0]!;
  const finalAssembly = minted.finalAssembly;

  // Prototype-inheritance forgery: the brand is visible through the chain
  // but WeakSet membership is not inheritable.
  const prototypeForgery = Object.create(genuine);
  assert.equal(isSealedToolImplementationBinding(prototypeForgery), false);
  await expectBindingError(
    () => verifyToolImplementationBinding({
      binding: prototypeForgery as SealedToolImplementationBinding,
      finalAssembly,
      sha256: realSha256,
    }),
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
  );

  // Symbol-theft + field-copy forgery: the unique brand symbol is
  // reflectively extractable from a genuine binding, but the mint registry
  // still rejects the hand-built lookalike.
  const stolenBrand = Object.getOwnPropertySymbols(genuine).find(
    (symbol) => (genuine as unknown as Record<symbol, unknown>)[symbol] === true,
  );
  assert.notEqual(stolenBrand, undefined);
  const copiedForgery = {
    evidence: genuine.evidence,
    successorAssembly: genuine.successorAssembly,
    implementationHandle: genuine.implementationHandle,
    [stolenBrand as symbol]: true,
  };
  assert.equal(isSealedToolImplementationBinding(copiedForgery), false);
  await expectBindingError(
    () => verifyToolImplementationBinding({
      binding: copiedForgery as unknown as SealedToolImplementationBinding,
      finalAssembly,
      sha256: realSha256,
    }),
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
  );

  // The genuine binding verifies against the exact final Assembly.
  const verified = await verifyToolImplementationBinding({
    binding: genuine,
    finalAssembly,
    sha256: realSha256,
  });
  assert.equal(verified.status, 'VERIFIED_CURRENT');
  assert.equal(verified.evidence.bindingDigest, genuine.evidence.bindingDigest);
});

test('E5 binding-authenticity: tampered serialized evidence fails TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH; a wrong expected pin fails TOOL_IMPLEMENTATION_PIN_MISMATCH (never resolved)', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;
  const minted = await mintDependencyBindings(graph, [e5Mints()[0]!]);
  const genuine = minted.bindings[0]!;
  const finalAssembly = minted.finalAssembly;

  // Deserialize-then-tamper: a corrupted bindingDigest no longer verifies.
  const tamperedEvidence = {
    ...JSON.parse(JSON.stringify(genuine.evidence)),
    bindingDigest: `sha256:${'8'.repeat(64)}`,
  } as ToolImplementationBindingEvidence;
  await expectBindingError(
    () => verifyToolImplementationBindingEvidence({
      evidence: tamperedEvidence,
      finalAssembly,
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH',
  );

  // A consumer-supplied expected pin that does not equal the verified pin
  // fails closed — it is never resolved against candidates or latest.
  await expectBindingError(
    () => verifyToolImplementationBinding({
      binding: genuine,
      finalAssembly,
      expectedImplementationPin: ALTERNATE_PIN,
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_PIN_MISMATCH',
  );

  // Sanity: the exact PRIMARY pin closes the verification.
  const verified = await verifyToolImplementationBinding({
    binding: genuine,
    finalAssembly,
    expectedImplementationPin: PRIMARY_PIN,
    sha256: realSha256,
  });
  assert.equal(verified.status, 'VERIFIED_CURRENT');
});

// ---------------------------------------------------------------------------
// MATRIX CELLS dependency-missing / dependency-ambiguous / dependency-cycle /
// diamond-order-permutations / stale-binding / stale-closure (T003E).
// ---------------------------------------------------------------------------

test('E5 dependency-missing: a selected provider without a supplied already-minted binding fails MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING — the closure never mints, never looks up by latest/default/order/alias', async () => {
  const graph = e5Graph();
  const minted = await mintDependencyBindings(graph, e5Mints());
  await expectBindingError(
    () => closeCapabilityDependencies({
      assembly: minted.finalAssembly,
      rootComponentId: 'tool.e5.root',
      currentDefinitionGraph: graph,
      // Withhold the binding for tool.e5.c.
      dependencyBindings: minted.bindings.filter(
        (binding) => binding.evidence.toolComponentId !== 'tool.e5.c',
      ),
      sha256: realSha256,
    }),
    'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING',
  );
});

test('E5 dependency-ambiguous: a Tool-to-Tool requirement with two eligible providers propagates the original typed CAPABILITY_PROVIDER_AMBIGUOUS unwrapped', async () => {
  const ambiguousGraph = e5Graph({
    components: [
      ...e5Graph().components,
      toolComponent('tool.e5.b2', [], [CAP_B], ['op.e5.b2']),
    ],
  });
  const ambiguousAssembly = await sealedBaseAssembly(ambiguousGraph);
  const error = await expectProvisionError(
    () => closeCapabilityDependencies({
      assembly: ambiguousAssembly,
      rootComponentId: 'tool.e5.root',
      currentDefinitionGraph: ambiguousGraph,
      dependencyBindings: [],
      sha256: realSha256,
    }),
    'CAPABILITY_PROVIDER_AMBIGUOUS',
  );
  assert.deepEqual(error.conflictingProviderComponentIds, ['tool.e5.b', 'tool.e5.b2']);
});

test('E5 dependency-cycle: a capability dependency cycle fails CAPABILITY_DEPENDENCY_CYCLE with the exact deterministic cycle path', async () => {
  const CAP_P = ref('cap.e5.p', '1.0.0');
  const CAP_Q = ref('cap.e5.q', '1.0.0');
  const cycleGraph = e5Graph({
    components: [
      toolComponent('tool.e5.root', [CAP_P], [], ['op.e5.root']),
      toolComponent('tool.e5.x', [CAP_Q], [CAP_P], ['op.e5.x']),
      toolComponent('tool.e5.y', [CAP_P], [CAP_Q], ['op.e5.y']),
    ],
  });
  const minted = await mintDependencyBindings(cycleGraph, [
    { consumerComponentId: 'tool.e5.root', requiredCapability: CAP_P, candidate: primaryCandidate('tool.e5.x', ['op.e5.x']) },
    { consumerComponentId: 'tool.e5.x', requiredCapability: CAP_Q, candidate: primaryCandidate('tool.e5.y', ['op.e5.y']) },
  ]);
  const error = await expectClosureError(
    closeCapabilityDependencies({
      assembly: minted.finalAssembly,
      rootComponentId: 'tool.e5.root',
      currentDefinitionGraph: cycleGraph,
      dependencyBindings: minted.bindings,
      sha256: realSha256,
    }),
    'CAPABILITY_DEPENDENCY_CYCLE',
  );
  assert.deepEqual(error.cyclePath, ['tool.e5.x', 'tool.e5.y', 'tool.e5.x']);
});

test('E5 diamond-order-permutations: every accepted input-order permutation yields the identical closureDigest (identity-normalized traversal, diamond sharing)', async () => {
  const frozen = await captureE5Identities();
  assert.equal(frozen.permutationClosureDigests.length, 3);
  for (const digest of frozen.permutationClosureDigests) {
    assert.equal(digest, frozen.closureDigest);
  }
  // The frozen permutation-set digest binds the whole set to one identity.
  assert.equal(frozen.permutationSetDigest.length > 0, true);
});

test('E5 closure determinism: re-closing the identical frozen inputs reproduces the exact closureDigest and leaves the input Assembly byte-identical (no reseal)', async () => {
  const frozen = await captureE5Identities();
  const minted = await mintDependencyBindings(frozen.graph, e5Mints());
  const before = JSON.parse(JSON.stringify(minted.finalAssembly));
  const again = await closeCapabilityDependencies({
    assembly: minted.finalAssembly,
    rootComponentId: 'tool.e5.root',
    currentDefinitionGraph: frozen.graph,
    dependencyBindings: minted.bindings,
    sha256: realSha256,
  });
  assert.equal(again.evidence.closureDigest, frozen.closureDigest);
  assert.deepEqual(JSON.parse(JSON.stringify(minted.finalAssembly)), before);
  // Handles are paired outside the evidence: no handle identity in material.
  assert.equal('implementationHandles' in again.evidence, false);
});

test('E5 stale-binding: a replaced final-Assembly slot fails STALE_TOOL_IMPLEMENTATION_BINDING for the superseded binding (replacement changed the Assembly, not the Definition)', async () => {
  const frozen = await captureE5Identities();
  const graph = frozen.graph;

  // Re-bind tool.e5.b to the ALTERNATE pin: the successor Assembly carries a
  // new slot for the same subject; the Definition digest is unchanged.
  const rebindSelection = await resolveCurrentCapabilityProvider(
    graph,
    CAP_B,
    'tool.e5.root',
    frozen.definitionGraphDigest,
    realSha256,
  );
  const superseding = await bindToolImplementation({
    assembly: await sealedBaseAssembly(graph),
    selection: rebindSelection,
    currentDefinitionGraph: graph,
    implementations: [
      primaryCandidate('tool.e5.b', OPS_BY_TOOL['tool.e5.b']!, ALTERNATE_PIN),
    ],
    sha256: realSha256,
  });
  assert.equal(
    superseding.evidence.definitionGraphDigest,
    frozen.definitionGraphDigest,
  );
  assert.notEqual(
    superseding.evidence.assemblyDigest,
    frozen.finalAssemblyDigest,
  );
  assert.notEqual(
    superseding.evidence.bindingDigest,
    frozen.bindingDigests['tool.e5.b'],
  );

  // The ORIGINAL binding (from the frozen capture) is now stale against the
  // superseding final Assembly.
  const originalBinding = (await mintDependencyBindings(graph, [e5Mints()[0]!])).bindings[0]!;
  await expectBindingError(
    () => verifyToolImplementationBinding({
      binding: originalBinding,
      finalAssembly: superseding.successorAssembly,
      sha256: realSha256,
    }),
    'STALE_TOOL_IMPLEMENTATION_BINDING',
  );

  // And a closure consuming the stale binding against the superseding
  // Assembly fails with the same owning taxonomy.
  const fullMint = await mintDependencyBindings(graph, e5Mints());
  const supersedingFull = await bindToolImplementation({
    assembly: fullMint.finalAssembly,
    selection: rebindSelection,
    currentDefinitionGraph: graph,
    implementations: [
      primaryCandidate('tool.e5.b', OPS_BY_TOOL['tool.e5.b']!, ALTERNATE_PIN),
    ],
    sha256: realSha256,
  });
  await expectBindingError(
    () => closeCapabilityDependencies({
      assembly: supersedingFull.successorAssembly,
      rootComponentId: 'tool.e5.root',
      currentDefinitionGraph: graph,
      dependencyBindings: fullMint.bindings, // stale tool.e5.b binding inside
      sha256: realSha256,
    }),
    'STALE_TOOL_IMPLEMENTATION_BINDING',
  );
});

test('E5 stale-closure: a replaced Definition after the final Assembly was sealed fails the T002B seed-admission currentness gate before any traversal', async () => {
  const frozen = await captureE5Identities();
  const minted = await mintDependencyBindings(frozen.graph, e5Mints());

  const replacedGraph = e5Graph({
    components: [...e5Graph().components, toolComponent('tool.e5.z', [], [], ['op.e5.z'])],
  });
  await expectAssemblyError(
    closeCapabilityDependencies({
      assembly: minted.finalAssembly,
      rootComponentId: 'tool.e5.root',
      currentDefinitionGraph: replacedGraph,
      dependencyBindings: minted.bindings,
      sha256: realSha256,
    }),
    'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH',
  );
});

test('E5 stale-closure evidence binding: closure evidence pins the exact final Assembly identity; the frozen closure evidence remains bound to the captured finalAssemblyDigest', async () => {
  const frozen = await captureE5Identities();
  assert.equal(frozen.closure.evidence.assemblyDigest, frozen.finalAssemblyDigest);
  assert.equal(frozen.closure.evidence.definitionGraphDigest, frozen.definitionGraphDigest);
  // The closure never emits a successor Assembly: the input is the authority.
  assert.equal('successorAssembly' in frozen.closure, false);
});

// ---------------------------------------------------------------------------
// Closure consumer-exact-pin negatives (T003E exact-pin surface).
// ---------------------------------------------------------------------------

test('E5 closure exact-pin: a matching per-subject pin closes; a mismatched pin fails TOOL_IMPLEMENTATION_PIN_MISMATCH', async () => {
  const frozen = await captureE5Identities();
  const minted = await mintDependencyBindings(frozen.graph, e5Mints());

  const matching = await closeCapabilityDependencies({
    assembly: minted.finalAssembly,
    rootComponentId: 'tool.e5.root',
    currentDefinitionGraph: frozen.graph,
    dependencyBindings: minted.bindings,
    exactPins: [
      { toolComponentId: 'tool.e5.b', pin: PRIMARY_PIN },
      { toolComponentId: 'tool.e5.c', pin: PRIMARY_PIN },
      { toolComponentId: 'tool.e5.d', pin: PRIMARY_PIN },
    ],
    sha256: realSha256,
  });
  assert.equal(matching.evidence.closureDigest, frozen.closureDigest);

  await expectBindingError(
    () => closeCapabilityDependencies({
      assembly: minted.finalAssembly,
      rootComponentId: 'tool.e5.root',
      currentDefinitionGraph: frozen.graph,
      dependencyBindings: minted.bindings,
      exactPins: [{ toolComponentId: 'tool.e5.b', pin: ALTERNATE_PIN }],
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_PIN_MISMATCH',
  );
});
