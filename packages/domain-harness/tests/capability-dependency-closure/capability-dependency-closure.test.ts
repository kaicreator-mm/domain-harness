/**
 * T003E tests-first matrix — Tool-to-Tool required Capability closure
 * (issue #630; authority #589 PACK-B T003E; DAG #534; bounded repair #651).
 *
 * The #651 bounded repair freezes the authority shape under test: T003E is
 * evidence/composition-only against ONE unchanged final Assembly.
 *
 * Covers the #651 required test list:
 *  1. seed Assembly-bound admission exactness/currentness — the root Tool is
 *     admitted through the accepted T002B `admitComponentWithAssembly` seam
 *     against the exact final Assembly/current Definition; the seed admission
 *     identity (root + DefinitionGraphDigest + final assemblyDigest) is bound
 *     into the closure evidence; a root whose requirements the sealed Kind
 *     binding does not understand fails the T002B must-understand gate;
 *  2. linear + diamond closure using PRE-EXISTING #640-verified dependency
 *     bindings on one unchanged final Assembly — every transitively required
 *     Tool is consumed through the shared T003C consumer-verifier seam, never
 *     re-selected, never re-bound;
 *  3. proof T003E performs NO Assembly reseal: the evidence assemblyDigest is
 *     the unchanged INPUT final Assembly identity and the input record is
 *     byte-unchanged after the call;
 *  4. unminted/lookalike binding reject (UNMINTED_TOOL_IMPLEMENTATION_BINDING);
 *  5. missing final binding slot (MISSING_CURRENT_...) and replaced final
 *     binding slot (STALE_TOOL_IMPLEMENTATION_BINDING) reject;
 *  6. exact-pin mismatch reject (TOOL_IMPLEMENTATION_PIN_MISMATCH) while a
 *     matching expected pin closes;
 *  7. stale Definition/final Assembly reject — the T002B-owned
 *     ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH taxonomy;
 *  8. missing/ambiguous provider propagation — the original typed T003B
 *     failure unwrapped; a selected provider without a supplied binding fails
 *     MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING (T003E never mints, no
 *     latest/default/order/id-alias lookup);
 *  9. linear/diamond/order-permutation/cycle regression — deterministic
 *     normalized traversal, diamond sharing, cycle rejection;
 * 10. handles excluded from evidence (paired outside, original opaque
 *     reference only) + caller mutation/torn snapshot negatives;
 * 11. duplicate claimed-subject bindings and accessor-backed binding evidence
 *     fail INVALID_CLOSURE_INPUT with zero getter executions.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { ComponentAdmissionError } from '../../src/contracts/component-admission.js';
import {
  CapabilityProvisionContractError,
  resolveCurrentCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import {
  sealRuntimeAssembly,
  RuntimeAssemblyError,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  closeCapabilityDependencies,
  CapabilityDependencyClosureError,
  type CapabilityDependencyClosureInput,
  type SealedCapabilityDependencyClosure,
} from '../../src/contracts/capability-dependency-closure.js';
import {
  bindToolImplementation,
  ToolImplementationBindingError,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
  type ToolImplementationIdentity,
} from '../../src/contracts/tool-implementation-binding.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Fixtures: root Tool + provider Tools over one exact Kind.
//   root requires cap.b (tool.b) and cap.c (tool.c);
//   tool.b requires cap.d (tool.d); tool.c requires cap.d (tool.d) — diamond.
// Dependency bindings are PRE-MINTED through the accepted T003C mint path
// (test-only authority setup) and threaded into one final Assembly; T003E
// only ever consumes them.
// ---------------------------------------------------------------------------

const KIND = { kindId: 'test.t003e-kind', version: '1.0.0' } as const;

function toolComponent(
  componentId: string,
  requiredCapabilities: ReadonlyArray<{ capabilityId: string; version: string }>,
  provides: ReadonlyArray<{ capabilityId: string; version: string }>,
  operations: readonly string[],
): ComponentEnvelope {
  return {
    family: 'tool',
    componentId,
    kind: { ...KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: requiredCapabilities.map((ref) => ({ ...ref })),
    semanticBody: {
      operations: operations.map((operationId) => ({
        operationId,
        inputSchema: {},
        outputSchema: {},
        effect: 'none',
      })),
      providesCapabilities: provides.map((ref) => ({ ...ref })),
    },
  };
}

function diamondGraph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t003e',
    components: [
      toolComponent('tool.root', [
        { capabilityId: 'cap.b', version: '1.0.0' },
        { capabilityId: 'cap.c', version: '1.0.0' },
      ], [], ['op.root']),
      toolComponent('tool.b', [{ capabilityId: 'cap.d', version: '1.0.0' }], [
        { capabilityId: 'cap.b', version: '1.0.0' },
      ], ['op.b1', 'op.b2']),
      toolComponent('tool.c', [{ capabilityId: 'cap.d', version: '1.0.0' }], [
        { capabilityId: 'cap.c', version: '1.0.0' },
      ], ['op.c']),
      toolComponent('tool.d', [], [{ capabilityId: 'cap.d', version: '1.0.0' }], ['op.d']),
    ],
    relations: [],
    ...overrides,
  };
}

/**
 * Understood capability refs for the fixture Kind binding: the T002B
 * must-understand admission gate requires exact coverage of an admitted
 * component's requiredCapabilities, so the fixture Kind binding declares
 * every ref any tool in the graph requires (a superset is harmless).
 */
function understoodCapabilities(definitionGraph: DefinitionGraphEnvelope) {
  const seen = new Set<string>();
  const refs: Array<{ capabilityId: string; version: string }> = [];
  for (const component of definitionGraph.components) {
    for (const ref of component.requiredCapabilities) {
      const key = `${ref.capabilityId}@${ref.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({ ...ref });
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
        implementationId: 'impl.t003e-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl',
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

/** One compatible candidate per provider Tool, keyed by the Tool component id. */
function candidate(
  toolComponentId: string,
  overrides: Partial<ToolImplementationIdentity> = {},
): ToolImplementationCandidate {
  const operationsByTool: Record<string, readonly string[]> = {
    'tool.b': ['op.b1', 'op.b2'],
    'tool.c': ['op.c'],
    'tool.d': ['op.d'],
  };
  return {
    implementation: {
      implementationId: `impl.${toolComponentId}`,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${toolComponentId}-content`,
      ...overrides,
    },
    supportedOperations: [...(operationsByTool[toolComponentId] ?? [])],
    handle: { marker: `${toolComponentId}-handle` },
  };
}

/** One pre-minted dependency binding request: consumer requires ref -> provider candidate. */
interface MintSpec {
  readonly consumerComponentId: string;
  readonly requiredCapability: { capabilityId: string; version: string };
  readonly candidate: ToolImplementationCandidate;
}

/** Default mint plan for the diamond: tool.b (cap.b), tool.d (cap.d), tool.c (cap.c). */
function diamondMints(
  candidateOverrides: Record<string, Partial<ToolImplementationIdentity>> = {},
): MintSpec[] {
  return [
    {
      consumerComponentId: 'tool.root',
      requiredCapability: { capabilityId: 'cap.b', version: '1.0.0' },
      candidate: candidate('tool.b', candidateOverrides['tool.b']),
    },
    {
      consumerComponentId: 'tool.b',
      requiredCapability: { capabilityId: 'cap.d', version: '1.0.0' },
      candidate: candidate('tool.d', candidateOverrides['tool.d']),
    },
    {
      consumerComponentId: 'tool.root',
      requiredCapability: { capabilityId: 'cap.c', version: '1.0.0' },
      candidate: candidate('tool.c', candidateOverrides['tool.c']),
    },
  ];
}

/**
 * Pre-mint the dependency bindings through the accepted T003C mint path,
 * threading each successor reseal, and return the resulting ONE final
 * Assembly (carrying every dependency §G slot) plus the minted bindings.
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

interface ClosureFixture {
  input: CapabilityDependencyClosureInput;
  graph: DefinitionGraphEnvelope;
  finalAssembly: SealedRuntimeAssembly;
  baseAssembly: SealedRuntimeAssembly;
  bindings: SealedToolImplementationBinding[];
}

async function closureFixture(
  overrides: Partial<CapabilityDependencyClosureInput> = {},
  definitionGraph: DefinitionGraphEnvelope = diamondGraph(),
  mints: readonly MintSpec[] = diamondMints(),
): Promise<ClosureFixture> {
  const minted = await mintDependencyBindings(definitionGraph, mints);
  const input: CapabilityDependencyClosureInput = {
    assembly: minted.finalAssembly,
    rootComponentId: 'tool.root',
    currentDefinitionGraph: definitionGraph,
    dependencyBindings: minted.bindings,
    sha256: realSha256,
    ...overrides,
  };
  return {
    input,
    graph: definitionGraph,
    finalAssembly: minted.finalAssembly,
    baseAssembly: minted.baseAssembly,
    bindings: minted.bindings,
  };
}

function expectClosureError(
  promise: Promise<unknown>,
  code: string,
): Promise<CapabilityDependencyClosureError> {
  return promise.then(
    () => {
      throw new Error(`expected CapabilityDependencyClosureError(${code}), but closure resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof CapabilityDependencyClosureError,
        `expected CapabilityDependencyClosureError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

function expectBindingError(
  promise: Promise<unknown>,
  code: string,
): Promise<ToolImplementationBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected ToolImplementationBindingError(${code}), but closure resolved`);
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
// Required test: seed Assembly-bound admission exactness/currentness.
// ---------------------------------------------------------------------------

test('PACK-B T003E seed: admission identity binds exact root + current Definition digest + final assemblyDigest', async () => {
  const { input, graph, finalAssembly } = await closureFixture();

  const closed = await closeCapabilityDependencies(input);

  const digest = await computeDefinitionGraphDigest(graph, realSha256);
  assert.equal(closed.evidence.seedAdmission.componentId, 'tool.root');
  assert.equal(closed.evidence.seedAdmission.definitionGraphDigest, digest);
  assert.equal(closed.evidence.seedAdmission.assemblyDigest, finalAssembly.assemblyDigest);
  assert.deepEqual(closed.evidence.seedAdmission.admittedKind, {
    kindId: KIND.kindId,
    version: KIND.version,
  });
  assert.deepEqual(closed.evidence.seedAdmission.admittedKindImplementation, {
    kind: { kindId: KIND.kindId, version: KIND.version },
    implementation: {
      implementationId: 'impl.t003e-kind',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:kind-impl',
    },
  });
  // The closure evidence binds the SAME final identity (never a successor).
  assert.equal(closed.evidence.definitionGraphDigest, digest);
  assert.equal(closed.evidence.assemblyDigest, finalAssembly.assemblyDigest);
});

test('PACK-B T003E seed: a root whose required capabilities are not understood by the sealed Kind binding fails the admission must-understand gate', async () => {
  const rootOnly = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.b', version: '1.0.0' }], [], ['op.root']),
    ],
  });
  // The sealed Kind binding deliberately does NOT understand cap.b: the
  // T002B must-understand admission gate of the seed fails closed typed.
  const nonUnderstandingAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: rootOnly,
      kindImplementations: [
        {
          pin: {
            kind: { ...KIND },
            implementation: {
              implementationId: 'impl.t003e-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:kind-impl',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [{ capabilityId: 'cap.other', version: '1.0.0' }],
          validateComponent: () => {},
        },
      ],
    },
    realSha256,
  );

  await assert.rejects(
    closeCapabilityDependencies({
      assembly: nonUnderstandingAssembly,
      rootComponentId: 'tool.root',
      currentDefinitionGraph: rootOnly,
      dependencyBindings: [],
      sha256: realSha256,
    }),
    (error: unknown) =>
      error instanceof ComponentAdmissionError && error.code === 'UNKNOWN_CAPABILITY',
  );
});

// ---------------------------------------------------------------------------
// Required test 2 + regression 1+2: linear and diamond closure over
// pre-existing #640-verified bindings on ONE unchanged final Assembly.
// ---------------------------------------------------------------------------

test('PACK-B T003E 1: linear closure consumes every transitively required Tool through the verified bindings', async () => {
  const linear = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.b', version: '1.0.0' }], [], ['op.root']),
      toolComponent('tool.b', [{ capabilityId: 'cap.d', version: '1.0.0' }], [
        { capabilityId: 'cap.b', version: '1.0.0' },
      ], ['op.b1', 'op.b2']),
      toolComponent('tool.d', [], [{ capabilityId: 'cap.d', version: '1.0.0' }], ['op.d']),
    ],
  });
  const { input, graph, finalAssembly } = await closureFixture({}, linear, [
    {
      consumerComponentId: 'tool.root',
      requiredCapability: { capabilityId: 'cap.b', version: '1.0.0' },
      candidate: candidate('tool.b'),
    },
    {
      consumerComponentId: 'tool.b',
      requiredCapability: { capabilityId: 'cap.d', version: '1.0.0' },
      candidate: candidate('tool.d'),
    },
  ]);

  const closed = await closeCapabilityDependencies(input);

  assert.equal(closed.evidence.status, 'CLOSED');
  assert.equal(closed.evidence.rootComponentId, 'tool.root');
  assert.deepEqual(
    closed.evidence.entries.map((entry) => entry.toolComponentId),
    ['tool.b', 'tool.d'],
  );
  assert.deepEqual(
    closed.evidence.edges.map(
      (edge) => `${edge.consumerComponentId}->${edge.providerComponentId}:${edge.requiredCapability.capabilityId}`,
    ),
    ['tool.b->tool.d:cap.d', 'tool.root->tool.b:cap.b'],
  );
  assert.equal(closed.evidence.entries[0]?.implementation.implementationId, 'impl.tool.b');
  assert.equal(closed.evidence.entries[1]?.implementation.implementationId, 'impl.tool.d');
  // Each entry binds the exact verified bindingDigest of the pre-minted binding.
  const digest = await computeDefinitionGraphDigest(graph, realSha256);
  assert.equal(closed.evidence.definitionGraphDigest, digest);
  for (const entry of closed.evidence.entries) {
    const binding = input.dependencyBindings.find(
      (candidate_) => candidate_.evidence.toolComponentId === entry.toolComponentId,
    );
    assert.ok(binding !== undefined);
    assert.equal(entry.bindingDigest, binding.evidence.bindingDigest);
    assert.deepEqual(entry.implementation, binding.evidence.implementation);
  }
  // No reseal: the evidence assemblyDigest is the unchanged INPUT identity.
  assert.equal(closed.evidence.assemblyDigest, finalAssembly.assemblyDigest);
});

test('PACK-B T003E 2: diamond closure records every edge and binds the shared provider exactly once', async () => {
  const { input } = await closureFixture();

  const closed = await closeCapabilityDependencies(input);

  assert.deepEqual(
    closed.evidence.entries.map((entry) => entry.toolComponentId),
    ['tool.b', 'tool.c', 'tool.d'],
  );
  assert.equal(closed.evidence.entries.filter((entry) => entry.toolComponentId === 'tool.d').length, 1);
  assert.deepEqual(
    closed.evidence.edges.map(
      (edge) => `${edge.consumerComponentId}->${edge.providerComponentId}:${edge.requiredCapability.capabilityId}`,
    ),
    [
      'tool.b->tool.d:cap.d',
      'tool.c->tool.d:cap.d',
      'tool.root->tool.b:cap.b',
      'tool.root->tool.c:cap.c',
    ],
  );
  assert.equal(closed.evidence.entries[2]?.boundCapability.capabilityId, 'cap.d');
});

test('PACK-B T003E: a Tool declaring no required capabilities closes to an empty dependency set on the unchanged final Assembly', async () => {
  const leafOnly = diamondGraph({
    components: [toolComponent('tool.root', [], [], ['op.root'])],
  });
  const { input, finalAssembly } = await closureFixture({}, leafOnly, []);

  const closed = await closeCapabilityDependencies(input);

  assert.deepEqual(closed.evidence.entries, []);
  assert.deepEqual(closed.evidence.edges, []);
  assert.deepEqual(closed.implementationHandles, []);
  assert.equal(closed.evidence.assemblyDigest, finalAssembly.assemblyDigest);
});

// ---------------------------------------------------------------------------
// Required test 3: NO Assembly reseal — assemblyDigest is unchanged input
// identity and the input record is byte-unchanged after the call.
// ---------------------------------------------------------------------------

test('PACK-B T003E: the closure never reseals — input final Assembly record and digest are unchanged and no successor exists', async () => {
  const { input, finalAssembly } = await closureFixture();
  const recordBefore = JSON.parse(JSON.stringify(finalAssembly.record));

  const closed: SealedCapabilityDependencyClosure = await closeCapabilityDependencies(input);

  assert.equal(closed.evidence.assemblyDigest, input.assembly.assemblyDigest);
  assert.deepEqual(input.assembly.record, recordBefore);
  assert.deepEqual(Object.keys(closed).sort(), ['evidence', 'implementationHandles']);
  assert.equal('successorAssembly' in closed, false);
});

// ---------------------------------------------------------------------------
// Regression 3: order invariance under every source ordering.
// ---------------------------------------------------------------------------

test('PACK-B T003E 3: component/requirement/binding order permutations yield identical evidence and digests', async () => {
  const base = await closureFixture();
  const first = await closeCapabilityDependencies(base.input);

  // Permute graph component order and declared requiredCapabilities order.
  const permutedGraph = diamondGraph({
    components: [...base.graph.components]
      .reverse()
      .map((component) =>
        component.componentId === 'tool.root'
          ? {
              ...component,
              requiredCapabilities: [...component.requiredCapabilities].reverse(),
            }
          : component,
      ),
  });
  const permuted = await closureFixture(
    {},
    permutedGraph,
    [...diamondMints()].reverse(),
  );
  const second = await closeCapabilityDependencies(permuted.input);

  assert.deepEqual(second.evidence, first.evidence);
  assert.equal(second.evidence.closureDigest, first.evidence.closureDigest);
  // The mint-threading order does not change the canonical final Assembly.
  assert.equal(permuted.finalAssembly.assemblyDigest, base.finalAssembly.assemblyDigest);
});

test('PACK-B T003E 3b: repeated runs over identical inputs are byte-identical', async () => {
  const first = await closeCapabilityDependencies((await closureFixture()).input);
  const second = await closeCapabilityDependencies((await closureFixture()).input);

  assert.deepEqual(second.evidence, first.evidence);
  assert.deepEqual(
    second.implementationHandles.map((pair) => pair.toolComponentId),
    first.implementationHandles.map((pair) => pair.toolComponentId),
  );
});

// ---------------------------------------------------------------------------
// Regression 4 + required test 8: missing/ambiguous provider propagation and
// missing binding supply — typed fail closed, never first/latest/default.
// ---------------------------------------------------------------------------

test('PACK-B T003E 4: missing provider fails closed with the typed T003B error', async () => {
  const missing = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.void', version: '1.0.0' }], [], ['op.root']),
    ],
  });
  const { input } = await closureFixture({}, missing, []);

  await assert.rejects(
    closeCapabilityDependencies(input),
    (error: unknown) =>
      error instanceof CapabilityProvisionContractError &&
      error.code === 'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

test('PACK-B T003E 4b: ambiguous provider fails closed with sorted conflicting ids', async () => {
  const ambiguous = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.b', version: '1.0.0' }], [], ['op.root']),
      toolComponent('tool.b1', [], [{ capabilityId: 'cap.b', version: '1.0.0' }], ['op.b']),
      toolComponent('tool.b2', [], [{ capabilityId: 'cap.b', version: '1.0.0' }], ['op.b']),
    ],
  });
  const { input } = await closureFixture({}, ambiguous, []);

  try {
    await closeCapabilityDependencies(input);
    assert.fail('expected CAPABILITY_PROVIDER_AMBIGUOUS');
  } catch (error) {
    assert.ok(error instanceof CapabilityProvisionContractError);
    assert.equal(error.code, 'CAPABILITY_PROVIDER_AMBIGUOUS');
    assert.deepEqual(error.conflictingProviderComponentIds, ['tool.b1', 'tool.b2']);
  }
});

test('PACK-B T003E 4c: a selected provider without a supplied binding fails MISSING_CURRENT (T003E never mints, no alias lookup)', async () => {
  const linear = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.b', version: '1.0.0' }], [], ['op.root']),
      toolComponent('tool.b', [{ capabilityId: 'cap.d', version: '1.0.0' }], [
        { capabilityId: 'cap.b', version: '1.0.0' },
      ], ['op.b1', 'op.b2']),
      toolComponent('tool.d', [], [{ capabilityId: 'cap.d', version: '1.0.0' }], ['op.d']),
    ],
  });
  // Only tool.b's binding is supplied; tool.d is selected but never supplied.
  const { input } = await closureFixture({}, linear, [
    {
      consumerComponentId: 'tool.root',
      requiredCapability: { capabilityId: 'cap.b', version: '1.0.0' },
      candidate: candidate('tool.b'),
    },
  ]);

  const error = await expectBindingError(
    closeCapabilityDependencies(input),
    'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING',
  );
  assert.match(error.message, /tool\.d/);
});

// ---------------------------------------------------------------------------
// Required test 4: unminted/lookalike binding reject.
// ---------------------------------------------------------------------------

test('PACK-B T003E 4d: a field-copied lookalike binding fails UNMINTED', async () => {
  const { input, bindings } = await closureFixture();
  const lookalike = JSON.parse(
    JSON.stringify(bindings[0]),
  ) as unknown as SealedToolImplementationBinding;

  await expectBindingError(
    closeCapabilityDependencies({ ...input, dependencyBindings: [lookalike] }),
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
  );
});

test('PACK-B T003E 4e: a hand-built lookalike binding fails UNMINTED even with byte-identical evidence', async () => {
  const { input, bindings, finalAssembly } = await closureFixture();
  const genuine = bindings[0];
  assert.ok(genuine !== undefined);
  const forged = {
    evidence: { ...genuine.evidence },
    successorAssembly: finalAssembly,
    implementationHandle: undefined,
  } as unknown as SealedToolImplementationBinding;

  await expectBindingError(
    closeCapabilityDependencies({ ...input, dependencyBindings: [forged] }),
    'UNMINTED_TOOL_IMPLEMENTATION_BINDING',
  );
});

// ---------------------------------------------------------------------------
// Required test 5: missing / replaced final binding slot reject.
// ---------------------------------------------------------------------------

test('PACK-B T003E 5: a binding verified against a final Assembly without its subject slot fails MISSING_CURRENT', async () => {
  const { input, baseAssembly } = await closureFixture();
  // The base Assembly carries no dependency §G slots at all.
  await expectBindingError(
    closeCapabilityDependencies({ ...input, assembly: baseAssembly }),
    'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING',
  );
});

test('PACK-B T003E 5b: a binding whose final slot was replaced by another bindingDigest fails STALE', async () => {
  const graph = diamondGraph();
  const threadV1 = await mintDependencyBindings(graph, diamondMints());
  const threadV2 = await mintDependencyBindings(graph, [
    diamondMints()[0] as MintSpec,
    {
      consumerComponentId: 'tool.b',
      requiredCapability: { capabilityId: 'cap.d', version: '1.0.0' },
      candidate: candidate('tool.d', {
        implementationVersion: '2.0.0',
        implementationDigest: 'sha256:tool.d-content-v2',
      }),
    },
    diamondMints()[2] as MintSpec,
  ]);

  // tool.d's slot in the v2 final Assembly carries the v2 bindingDigest;
  // consuming the v1 binding against it fails closed as stale.
  await expectBindingError(
    closeCapabilityDependencies({
      assembly: threadV2.finalAssembly,
      rootComponentId: 'tool.root',
      currentDefinitionGraph: graph,
      dependencyBindings: threadV1.bindings,
      sha256: realSha256,
    }),
    'STALE_TOOL_IMPLEMENTATION_BINDING',
  );
});

// ---------------------------------------------------------------------------
// Required test 6: exact-pin mismatch reject; a matching pin closes.
// ---------------------------------------------------------------------------

test('PACK-B T003E 6: an expected exact pin that differs from the verified evidence pin fails TOOL_IMPLEMENTATION_PIN_MISMATCH', async () => {
  const { input } = await closureFixture();

  await expectBindingError(
    closeCapabilityDependencies({
      ...input,
      exactPins: [
        {
          toolComponentId: 'tool.b',
          pin: {
            implementationId: 'impl.tool.b',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:wrong-content',
          },
        },
      ],
    }),
    'TOOL_IMPLEMENTATION_PIN_MISMATCH',
  );
});

test('PACK-B T003E 6b: a matching expected exact pin closes and the entry binds the verified pin', async () => {
  const { input } = await closureFixture();
  const pin: ToolImplementationIdentity = {
    implementationId: 'impl.tool.b',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:tool.b-content',
  };

  const closed = await closeCapabilityDependencies({
    ...input,
    exactPins: [{ toolComponentId: 'tool.b', pin }],
  });

  assert.deepEqual(
    closed.evidence.entries.find((entry) => entry.toolComponentId === 'tool.b')?.implementation,
    pin,
  );
});

// ---------------------------------------------------------------------------
// Required test 7: stale Definition / final Assembly reject — the T002B-owned
// admission currentness taxonomy.
// ---------------------------------------------------------------------------

test('PACK-B T003E 7: a stale/foreign current graph fails closed with ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH', async () => {
  const { input, graph } = await closureFixture();
  const drifted = diamondGraph({
    components: graph.components.map((component) =>
      component.componentId === 'tool.d'
        ? {
            ...component,
            semanticBody: { ...(component.semanticBody as object), note: 'drifted' },
          }
        : component,
    ),
  });

  await assert.rejects(
    closeCapabilityDependencies({ ...input, currentDefinitionGraph: drifted }),
    (error: unknown) =>
      error instanceof RuntimeAssemblyError &&
      error.code === 'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH',
  );
});

test('PACK-B T003E 7b: a final Assembly sealed over a different graph fails the same currentness gate', async () => {
  const graph = diamondGraph();
  const olderGraph = diamondGraph({
    components: graph.components.map((component) =>
      component.componentId === 'tool.root'
        ? {
            ...component,
            semanticBody: { ...(component.semanticBody as object), note: 'older' },
          }
        : component,
    ),
  });
  const { bindings } = await mintDependencyBindings(graph, diamondMints());
  const olderBase = await sealedBaseAssembly(olderGraph);

  await assert.rejects(
    closeCapabilityDependencies({
      assembly: olderBase,
      rootComponentId: 'tool.root',
      currentDefinitionGraph: graph,
      dependencyBindings: bindings,
      sha256: realSha256,
    }),
    (error: unknown) =>
      error instanceof RuntimeAssemblyError &&
      error.code === 'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH',
  );
});

// ---------------------------------------------------------------------------
// Regression 5: cycle rejection.
// ---------------------------------------------------------------------------

test('PACK-B T003E 5c: capability dependency cycle fails closed as CAPABILITY_DEPENDENCY_CYCLE', async () => {
  const cyclic = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.rb', version: '1.0.0' }], [
        { capabilityId: 'cap.tr', version: '1.0.0' },
      ], ['op.root']),
      toolComponent('tool.b', [{ capabilityId: 'cap.tr', version: '1.0.0' }], [
        { capabilityId: 'cap.rb', version: '1.0.0' },
      ], ['op.b']),
    ],
  });
  const { input } = await closureFixture({}, cyclic, [
    {
      consumerComponentId: 'tool.root',
      requiredCapability: { capabilityId: 'cap.rb', version: '1.0.0' },
      candidate: {
        implementation: {
          implementationId: 'impl.tool.b',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:tool.b-content',
        },
        supportedOperations: ['op.b'],
      },
    },
  ]);

  const error = await expectClosureError(
    closeCapabilityDependencies(input),
    'CAPABILITY_DEPENDENCY_CYCLE',
  );
  assert.deepEqual(error.cyclePath, ['tool.root', 'tool.b', 'tool.root']);
});

test('PACK-B T003E 5d: a longer cycle (root -> b -> c -> root) is rejected with the full path', async () => {
  const withBackEdge = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.rb', version: '1.0.0' }], [
        { capabilityId: 'cap.tr', version: '1.0.0' },
      ], ['op.root']),
      toolComponent('tool.b', [{ capabilityId: 'cap.cb', version: '1.0.0' }], [
        { capabilityId: 'cap.rb', version: '1.0.0' },
      ], ['op.b']),
      toolComponent('tool.c', [{ capabilityId: 'cap.tr', version: '1.0.0' }], [
        { capabilityId: 'cap.cb', version: '1.0.0' },
      ], ['op.c']),
    ],
  });
  const { input } = await closureFixture({}, withBackEdge, [
    {
      consumerComponentId: 'tool.root',
      requiredCapability: { capabilityId: 'cap.rb', version: '1.0.0' },
      candidate: {
        implementation: {
          implementationId: 'impl.tool.b',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:tool.b-content',
        },
        supportedOperations: ['op.b'],
      },
    },
    {
      consumerComponentId: 'tool.b',
      requiredCapability: { capabilityId: 'cap.cb', version: '1.0.0' },
      candidate: {
        implementation: {
          implementationId: 'impl.tool.c',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:tool.c-content',
        },
        supportedOperations: ['op.c'],
      },
    },
  ]);

  const error = await expectClosureError(
    closeCapabilityDependencies(input),
    'CAPABILITY_DEPENDENCY_CYCLE',
  );
  assert.deepEqual(error.cyclePath, ['tool.root', 'tool.b', 'tool.c', 'tool.root']);
});

test('PACK-B T003E 5e: a direct self-requirement is rejected by T003B candidacy (never satisfied-by-self)', async () => {
  const selfLoop = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.self', version: '1.0.0' }], [
        { capabilityId: 'cap.self', version: '1.0.0' },
      ], ['op.root']),
    ],
  });
  const { input } = await closureFixture({}, selfLoop, []);

  await assert.rejects(
    closeCapabilityDependencies(input),
    (error: unknown) =>
      error instanceof CapabilityProvisionContractError &&
      error.code === 'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

// ---------------------------------------------------------------------------
// Required tests 10+11: mutation/TOCTOU resistance, duplicate claimed
// subjects, accessor-backed binding evidence.
// ---------------------------------------------------------------------------

test('PACK-B T003E 8: mutating caller-owned graph/bindings after the call cannot alter minted evidence', async () => {
  const { input, graph } = await closureFixture();
  const expectedDigest = await computeDefinitionGraphDigest(graph, realSha256);

  const pending = closeCapabilityDependencies(input);
  // Mutate caller-owned material synchronously after invocation; the closure
  // must have snapshotted everything authority-bearing before suspending.
  const rootBody = graph.components[0]?.semanticBody;
  if (rootBody !== undefined && typeof rootBody === 'object' && rootBody !== null) {
    Object.assign(rootBody, { injected: 'mutation' });
  }
  (graph.components as ComponentEnvelope[]).push(
    toolComponent('tool.injected', [], [{ capabilityId: 'cap.x', version: '1.0.0' }], ['op.x']),
  );
  (input.dependencyBindings as SealedToolImplementationBinding[]).reverse();
  const closed = await pending;

  assert.equal(closed.evidence.definitionGraphDigest, expectedDigest);
  assert.deepEqual(
    closed.evidence.entries.map((entry) => entry.toolComponentId),
    ['tool.b', 'tool.c', 'tool.d'],
  );
});

test('PACK-B T003E 8b: mid-flight mutation racing a pending digest cannot mint torn hybrid evidence', async () => {
  const { input, graph } = await closureFixture();
  const expectedDigest = await computeDefinitionGraphDigest(graph, realSha256);
  let calls = 0;
  const delayedSha256: Sha256Port = {
    async digestUtf8(value: string): Promise<string> {
      calls += 1;
      if (calls === 1) {
        // First recomputation (the seed admission currentness digest): mutate
        // the caller's graph while the digest is pending.
        const body = graph.components[1]?.semanticBody;
        if (body !== undefined && typeof body === 'object' && body !== null) {
          Object.assign(body, { injected: 'mid-flight' });
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };

  const closed = await closeCapabilityDependencies({ ...input, sha256: delayedSha256 });

  assert.equal(closed.evidence.definitionGraphDigest, expectedDigest);
  assert.deepEqual(
    closed.evidence.entries.map((entry) => entry.toolComponentId),
    ['tool.b', 'tool.c', 'tool.d'],
  );
});

test('PACK-B T003E 8c: accessor-backed or unknown-field input fails closed typed, no hidden getter executes', async () => {
  const { input } = await closureFixture();

  let getterRan = false;
  const accessorInput = {
    get assembly() {
      getterRan = true;
      return input.assembly;
    },
    rootComponentId: 'tool.root',
    currentDefinitionGraph: input.currentDefinitionGraph,
    dependencyBindings: input.dependencyBindings,
    sha256: realSha256,
  };
  await expectClosureError(
    closeCapabilityDependencies(accessorInput as CapabilityDependencyClosureInput),
    'INVALID_CLOSURE_INPUT',
  );
  assert.equal(getterRan, false);

  await expectClosureError(
    closeCapabilityDependencies({ ...input, surprise: true } as CapabilityDependencyClosureInput),
    'INVALID_CLOSURE_INPUT',
  );
});

test('PACK-B T003E 8d: a dependency binding with accessor-backed evidence fails INVALID_CLOSURE_INPUT, no hidden getter executes', async () => {
  const { input, bindings, finalAssembly } = await closureFixture();
  const genuine = bindings[0];
  assert.ok(genuine !== undefined);
  let evidenceGetterRan = false;
  const accessorLookalike = {
    get evidence() {
      evidenceGetterRan = true;
      return genuine.evidence;
    },
    successorAssembly: finalAssembly,
    implementationHandle: undefined,
  } as unknown as SealedToolImplementationBinding;

  await expectClosureError(
    closeCapabilityDependencies({ ...input, dependencyBindings: [accessorLookalike] }),
    'INVALID_CLOSURE_INPUT',
  );
  assert.equal(evidenceGetterRan, false);
});

test('PACK-B T003E 8e: two bindings claiming the same subject fail closed typed (never first-wins)', async () => {
  const { input, bindings } = await closureFixture();
  const first = bindings[0];
  assert.ok(first !== undefined);

  await expectClosureError(
    closeCapabilityDependencies({
      ...input,
      dependencyBindings: [first, first],
    }),
    'INVALID_CLOSURE_INPUT',
  );
});

// ---------------------------------------------------------------------------
// Root validation.
// ---------------------------------------------------------------------------

test('PACK-B T003E: missing root component fails closed typed', async () => {
  const { input } = await closureFixture({ rootComponentId: 'tool.absent' });

  await expectClosureError(closeCapabilityDependencies(input), 'ROOT_COMPONENT_NOT_FOUND');
});

test('PACK-B T003E: a non-Tool root fails closed typed (semantic components never close Tool dependencies)', async () => {
  const semanticRoot = diamondGraph({
    components: [
      {
        family: 'semantic',
        componentId: 'semantic.root',
        kind: { ...KIND },
        requiredSemanticContracts: [],
        requiredCapabilities: [{ capabilityId: 'cap.b', version: '1.0.0' }],
        semanticBody: { note: 'semantic' },
      },
      toolComponent('tool.b', [], [{ capabilityId: 'cap.b', version: '1.0.0' }], ['op.b']),
    ],
  });
  const { input } = await closureFixture({ rootComponentId: 'semantic.root' }, semanticRoot, []);

  await expectClosureError(closeCapabilityDependencies(input), 'ROOT_NOT_TOOL_COMPONENT');
});

test('PACK-B T003E: duplicate exact pins for one subject fail closed typed', async () => {
  const pin: ToolImplementationIdentity = {
    implementationId: 'impl.tool.d',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:tool.d-content',
  };
  const { input } = await closureFixture({
    exactPins: [
      { toolComponentId: 'tool.d', pin },
      { toolComponentId: 'tool.d', pin },
    ],
  });

  await expectClosureError(closeCapabilityDependencies(input), 'DUPLICATE_EXACT_PIN_SUBJECT');
});

// ---------------------------------------------------------------------------
// Required test 10: evidence immutability / non-aliasing / no live handles in
// identity; handles paired OUTSIDE the evidence on the sealed result.
// ---------------------------------------------------------------------------

test('PACK-B T003E: evidence is deep-frozen, non-aliasing and carries no live handles or functions', async () => {
  const { input, graph } = await closureFixture();
  const closed: SealedCapabilityDependencyClosure = await closeCapabilityDependencies(input);

  assert.equal(Object.isFrozen(closed.evidence), true);
  assert.equal(Object.isFrozen(closed.evidence.entries), true);
  assert.equal(Object.isFrozen(closed.evidence.edges), true);
  assert.equal(Object.isFrozen(closed.evidence.seedAdmission), true);
  for (const entry of closed.evidence.entries) {
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(Object.isFrozen(entry.implementation), true);
    assert.equal(Object.isFrozen(entry.boundCapability), true);
  }
  for (const edge of closed.evidence.edges) {
    assert.equal(Object.isFrozen(edge), true);
    assert.equal(Object.isFrozen(edge.requiredCapability), true);
  }
  assert.equal(Object.isFrozen(closed.implementationHandles), true);

  // The sealed surface pairs handles outside evidence; identity material only.
  assert.deepEqual(Object.keys(closed).sort(), ['evidence', 'implementationHandles']);
  const evidenceJson = JSON.stringify(closed.evidence);
  assert.equal(evidenceJson.includes('handle'), false);
  assert.equal(evidenceJson.includes('marker'), false);
  assert.equal((closed.evidence as unknown as Record<string, unknown>).invoke, undefined);
  assert.equal((closed.evidence as unknown as Record<string, unknown>).occurrenceId, undefined);

  // The paired handles are the ORIGINAL opaque references of the verified
  // bindings, keyed to the exact verified pins.
  for (const pair of closed.implementationHandles) {
    const binding = input.dependencyBindings.find(
      (candidate_) => candidate_.evidence.toolComponentId === pair.toolComponentId,
    );
    assert.ok(binding !== undefined);
    assert.equal(pair.handle, binding.implementationHandle);
    assert.deepEqual(pair.implementation, binding.evidence.implementation);
  }

  // Mutating the caller's original graph after completion cannot rewrite the
  // completed decision (evidence owns fresh frozen values only).
  const dBody = graph.components[3]?.semanticBody;
  if (dBody !== undefined && typeof dBody === 'object' && dBody !== null) {
    Object.assign(dBody, { injected: 'post-hoc' });
  }
  const digest = await computeDefinitionGraphDigest(diamondGraph(), realSha256);
  assert.equal(closed.evidence.definitionGraphDigest, digest);
  assert.equal(closed.evidence.entries.length, 3);
});
