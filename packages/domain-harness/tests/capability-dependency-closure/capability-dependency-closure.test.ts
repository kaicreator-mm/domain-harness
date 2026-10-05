/**
 * T003E tests-first matrix — Tool-to-Tool required Capability closure
 * (issue #630; authority #589 PACK-B T003E; DAG #534).
 *
 * Covers the PACK-B T003E test list:
 *  1. linear closure: root Tool -> provider -> provider, every provider bound
 *     to exactly one exact implementation, evidence binds the exact
 *     DefinitionGraphDigest + final assemblyDigest;
 *  2. diamond closure: a shared provider is bound exactly once, both edges
 *     recorded, entries/edges normalized by exact identity;
 *  3. order invariance: permuting graph component order, declared
 *     requiredCapabilities order and offered candidate order yields
 *     byte-identical evidence and identical digests;
 *  4. missing/ambiguous: zero providers => typed T003B failure, multiple
 *     providers => typed T003B ambiguity, zero/ambiguous/incompatible
 *     implementations => typed T003C failures — never first/latest/default;
 *     an exact pin resolves implementation ambiguity;
 *  5. cycle rejection: a capability dependency cycle fails closed as
 *     CAPABILITY_DEPENDENCY_CYCLE (no lazy/runtime recursion semantics);
 *  6. replacement binding currentness: replacing one bound implementation
 *     changes the closure assemblyDigest + closureDigest while the Definition
 *     graph digest (Definition identity) stays unchanged;
 *  7. mutation/TOCTOU resistance: caller-owned graph/candidates/pins mutated
 *     after the call (including mid-flight, racing a pending digest) can
 *     never alter minted evidence; accessor-backed input fails closed typed.
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
import {
  CapabilityProvisionContractError,
} from '../../src/contracts/capability-provision.js';
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import {
  closeCapabilityDependencies,
  CapabilityDependencyClosureError,
  type CapabilityDependencyClosureInput,
  type SealedCapabilityDependencyClosure,
} from '../../src/contracts/capability-dependency-closure.js';
import {
  ToolImplementationBindingError,
  type ToolImplementationCandidate,
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

function kindBinding() {
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
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

async function sealedBaseAssembly(definitionGraph: DefinitionGraphEnvelope) {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding()] },
    realSha256,
  );
}

/** One compatible candidate per provider Tool, keyed by the Tool component id. */
function candidate(
  toolComponentId: string,
  overrides: Record<string, string> = {},
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

function diamondCandidates(): ToolImplementationCandidate[] {
  return [candidate('tool.b'), candidate('tool.c'), candidate('tool.d')];
}

interface ClosureFixture {
  input: CapabilityDependencyClosureInput;
  graph: DefinitionGraphEnvelope;
  assembly: Awaited<ReturnType<typeof sealedBaseAssembly>>;
}

async function closureFixture(
  overrides: Partial<CapabilityDependencyClosureInput> = {},
  candidates: readonly ToolImplementationCandidate[] = diamondCandidates(),
  definitionGraph: DefinitionGraphEnvelope = diamondGraph(),
): Promise<ClosureFixture> {
  const assembly = await sealedBaseAssembly(definitionGraph);
  const input: CapabilityDependencyClosureInput = {
    assembly,
    rootComponentId: 'tool.root',
    currentDefinitionGraph: definitionGraph,
    implementations: candidates,
    sha256: realSha256,
    ...overrides,
  };
  return { input, graph: definitionGraph, assembly };
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

// ---------------------------------------------------------------------------
// PACK-B test 1+2: linear and diamond closure.
// ---------------------------------------------------------------------------

test('PACK-B T003E 1: linear closure binds every transitively required Tool to one exact implementation', async () => {
  const linear = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.b', version: '1.0.0' }], [], ['op.root']),
      toolComponent('tool.b', [{ capabilityId: 'cap.d', version: '1.0.0' }], [
        { capabilityId: 'cap.b', version: '1.0.0' },
      ], ['op.b1', 'op.b2']),
      toolComponent('tool.d', [], [{ capabilityId: 'cap.d', version: '1.0.0' }], ['op.d']),
    ],
  });
  const { input } = await closureFixture(
    {},
    [candidate('tool.b'), candidate('tool.d')],
    linear,
  );

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
  assert.equal(
    closed.evidence.entries[0]?.implementation.implementationId,
    'impl.tool.b',
  );
  assert.equal(closed.evidence.entries[1]?.implementation.implementationId, 'impl.tool.d');
  const digest = await computeDefinitionGraphDigest(linear, realSha256);
  assert.equal(closed.evidence.definitionGraphDigest, digest);
  assert.equal(closed.successorAssembly.record.definitionGraphDigest, digest);
  assert.equal(closed.evidence.assemblyDigest, closed.successorAssembly.assemblyDigest);
  // Both §G slots of the closure are present in the successor Assembly record.
  assert.deepEqual(
    closed.successorAssembly.record.implementationBindingEvidence.map((slot) => slot.subject).sort(),
    ['tool.b', 'tool.d'],
  );
});

test('PACK-B T003E 2: diamond closure binds the shared provider exactly once and records every edge', async () => {
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

test('PACK-B T003E: a Tool declaring no required capabilities closes to an empty dependency set', async () => {
  const leafOnly = diamondGraph({
    components: [toolComponent('tool.root', [], [], ['op.root'])],
  });
  const { input, assembly } = await closureFixture({}, [], leafOnly);

  const closed = await closeCapabilityDependencies(input);

  assert.deepEqual(closed.evidence.entries, []);
  assert.deepEqual(closed.evidence.edges, []);
  assert.equal(closed.evidence.assemblyDigest, assembly.assemblyDigest);
  assert.equal(closed.successorAssembly.assemblyDigest, assembly.assemblyDigest);
});

// ---------------------------------------------------------------------------
// PACK-B test 3: order invariance under every source ordering.
// ---------------------------------------------------------------------------

test('PACK-B T003E 3: component/requirement/candidate order permutations yield identical evidence and digests', async () => {
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
    [...diamondCandidates()].reverse(),
    permutedGraph,
  );
  const second = await closeCapabilityDependencies(permuted.input);

  assert.deepEqual(second.evidence, first.evidence);
  assert.equal(second.evidence.closureDigest, first.evidence.closureDigest);
  assert.equal(second.successorAssembly.assemblyDigest, first.successorAssembly.assemblyDigest);
  assert.deepEqual(second.successorAssembly.record, first.successorAssembly.record);
});

test('PACK-B T003E 3b: repeated runs over identical inputs are byte-identical', async () => {
  const first = await closeCapabilityDependencies((await closureFixture()).input);
  const second = await closeCapabilityDependencies((await closureFixture()).input);

  assert.deepEqual(second.evidence, first.evidence);
  assert.deepEqual(second.successorAssembly.record, first.successorAssembly.record);
  assert.deepEqual(
    second.implementationHandles.map((pair) => pair.toolComponentId),
    first.implementationHandles.map((pair) => pair.toolComponentId),
  );
});

// ---------------------------------------------------------------------------
// PACK-B test 4: missing/ambiguous provider, missing/ambiguous/incompatible
// implementation — typed fail closed, never first/latest/default.
// ---------------------------------------------------------------------------

test('PACK-B T003E 4: missing provider fails closed with the typed T003B error', async () => {
  const missing = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.void', version: '1.0.0' }], [], ['op.root']),
    ],
  });
  const { input } = await closureFixture({}, [], missing);

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
  const { input } = await closureFixture({}, [], ambiguous);

  try {
    await closeCapabilityDependencies(input);
    assert.fail('expected CAPABILITY_PROVIDER_AMBIGUOUS');
  } catch (error) {
    assert.ok(error instanceof CapabilityProvisionContractError);
    assert.equal(error.code, 'CAPABILITY_PROVIDER_AMBIGUOUS');
    assert.deepEqual(error.conflictingProviderComponentIds, ['tool.b1', 'tool.b2']);
  }
});

test('PACK-B T003E 4c: missing implementation fails closed with the typed T003C error', async () => {
  const { input } = await closureFixture(
    {},
    [candidate('tool.b'), candidate('tool.c')], // tool.d not offered
  );

  await assert.rejects(
    closeCapabilityDependencies(input),
    (error: unknown) =>
      error instanceof ToolImplementationBindingError &&
      error.code === 'MISSING_TOOL_IMPLEMENTATION',
  );
});

test('PACK-B T003E 4d: ambiguous implementation fails closed unless an exact pin resolves it', async () => {
  const ambiguous = await closureFixture(
    {},
    [
      candidate('tool.b'),
      candidate('tool.c'),
      candidate('tool.d', { implementationId: 'impl.tool.d.alt' }),
      candidate('tool.d'),
    ],
  );

  await assert.rejects(
    closeCapabilityDependencies(ambiguous.input),
    (error: unknown) =>
      error instanceof ToolImplementationBindingError &&
      error.code === 'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );

  const resolved = await closureFixture(
    {
      exactPins: [
        {
          toolComponentId: 'tool.d',
          pin: {
            implementationId: 'impl.tool.d',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:tool.d-content',
          },
        },
      ],
    },
    ambiguous.input.implementations,
  );
  const closed = await closeCapabilityDependencies(resolved.input);
  assert.equal(
    closed.evidence.entries.find((entry) => entry.toolComponentId === 'tool.d')?.implementation
      .implementationId,
    'impl.tool.d',
  );
});

test('PACK-B T003E 4e: an exactly pinned but incompatible implementation fails closed with the typed T003C error', async () => {
  // tool.b must support op.b1 AND op.b2; pin the exact candidate that
  // supports only op.b1 — an exact pin never overrides incompatibility.
  const narrowB: ToolImplementationCandidate = {
    implementation: {
      implementationId: 'impl.tool.b',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:tool.b-content',
    },
    supportedOperations: ['op.b1'],
  };
  const { input } = await closureFixture(
    {
      exactPins: [
        {
          toolComponentId: 'tool.b',
          pin: {
            implementationId: 'impl.tool.b',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:tool.b-content',
          },
        },
      ],
    },
    [narrowB, candidate('tool.c'), candidate('tool.d')],
  );

  await assert.rejects(
    closeCapabilityDependencies(input),
    (error: unknown) =>
      error instanceof ToolImplementationBindingError &&
      error.code === 'INCOMPATIBLE_TOOL_IMPLEMENTATION',
  );
});

// ---------------------------------------------------------------------------
// PACK-B test 5: cycle rejection.
// ---------------------------------------------------------------------------

test('PACK-B T003E 5: capability dependency cycle fails closed as CAPABILITY_DEPENDENCY_CYCLE', async () => {
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
  const cycleCandidate = (toolComponentId: string, operation: string): ToolImplementationCandidate => ({
    implementation: {
      implementationId: `impl.${toolComponentId}`,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${toolComponentId}-content`,
    },
    supportedOperations: [operation],
  });
  const { input } = await closureFixture(
    {},
    [cycleCandidate('tool.b', 'op.b')],
    cyclic,
  );

  const error = await expectClosureError(closeCapabilityDependencies(input), 'CAPABILITY_DEPENDENCY_CYCLE');
  assert.deepEqual(error.cyclePath, ['tool.root', 'tool.b', 'tool.root']);
});

test('PACK-B T003E 5b: a longer cycle (root -> b -> c -> root) is rejected with the full path', async () => {
  // root requires cap.rb -> tool.b; tool.b requires cap.cb -> tool.c; tool.c
  // requires cap.tr, provided by the root itself — the edge back to a tool on
  // the current traversal stack is the v0.7 cycle rejection (no lazy/runtime
  // recursion semantics).
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
  const cycleCandidate = (toolComponentId: string, operation: string): ToolImplementationCandidate => ({
    implementation: {
      implementationId: `impl.${toolComponentId}`,
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:${toolComponentId}-content`,
    },
    supportedOperations: [operation],
  });
  const { input } = await closureFixture(
    {},
    [cycleCandidate('tool.b', 'op.b'), cycleCandidate('tool.c', 'op.c')],
    withBackEdge,
  );

  const error = await expectClosureError(closeCapabilityDependencies(input), 'CAPABILITY_DEPENDENCY_CYCLE');
  assert.deepEqual(error.cyclePath, ['tool.root', 'tool.b', 'tool.c', 'tool.root']);
});

test('PACK-B T003E 5c: a direct self-requirement is rejected by T003B candidacy (never satisfied-by-self)', async () => {
  const selfLoop = diamondGraph({
    components: [
      toolComponent('tool.root', [{ capabilityId: 'cap.self', version: '1.0.0' }], [
        { capabilityId: 'cap.self', version: '1.0.0' },
      ], ['op.root']),
    ],
  });
  const { input } = await closureFixture({}, [], selfLoop);

  await assert.rejects(
    closeCapabilityDependencies(input),
    (error: unknown) =>
      error instanceof CapabilityProvisionContractError &&
      error.code === 'CAPABILITY_PROVIDER_NOT_FOUND',
  );
});

// ---------------------------------------------------------------------------
// PACK-B test 6: replacement binding currentness.
// ---------------------------------------------------------------------------

test('PACK-B T003E 6: replacing one bound implementation changes closure assemblyDigest while Definition identity is unchanged', async () => {
  const v1 = await closureFixture();
  const closedV1 = await closeCapabilityDependencies(v1.input);

  const v2 = await closureFixture(
    {},
    [candidate('tool.b'), candidate('tool.c'), candidate('tool.d', { implementationVersion: '2.0.0', implementationDigest: 'sha256:tool.d-content-v2' })],
  );
  const closedV2 = await closeCapabilityDependencies(v2.input);

  assert.notEqual(closedV2.evidence.assemblyDigest, closedV1.evidence.assemblyDigest);
  assert.notEqual(closedV2.evidence.closureDigest, closedV1.evidence.closureDigest);
  assert.equal(
    closedV2.evidence.definitionGraphDigest,
    closedV1.evidence.definitionGraphDigest,
  );
  assert.equal(
    closedV2.successorAssembly.record.definitionGraphDigest,
    closedV1.successorAssembly.record.definitionGraphDigest,
  );
  assert.notEqual(
    closedV2.successorAssembly.record.implementationBindingEvidence.find(
      (slot) => slot.subject === 'tool.d',
    )?.bindingDigest,
    closedV1.successorAssembly.record.implementationBindingEvidence.find(
      (slot) => slot.subject === 'tool.d',
    )?.bindingDigest,
  );
  // The untouched providers keep byte-identical binding evidence.
  assert.equal(
    closedV2.successorAssembly.record.implementationBindingEvidence.find(
      (slot) => slot.subject === 'tool.b',
    )?.bindingDigest,
    closedV1.successorAssembly.record.implementationBindingEvidence.find(
      (slot) => slot.subject === 'tool.b',
    )?.bindingDigest,
  );
});

test('PACK-B T003E 6b: a stale/foreign current graph fails closed before any closure evidence is minted', async () => {
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

  await expectClosureError(
    closeCapabilityDependencies({ ...input, currentDefinitionGraph: drifted }),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );
});

// ---------------------------------------------------------------------------
// PACK-B test 7: mutation / TOCTOU resistance.
// ---------------------------------------------------------------------------

test('PACK-B T003E 7: mutating caller-owned graph/candidates after the call cannot alter minted evidence', async () => {
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
  (input.implementations as ToolImplementationCandidate[]).reverse();
  const closed = await pending;

  assert.equal(closed.evidence.definitionGraphDigest, expectedDigest);
  assert.deepEqual(
    closed.evidence.entries.map((entry) => entry.toolComponentId),
    ['tool.b', 'tool.c', 'tool.d'],
  );
});

test('PACK-B T003E 7b: mid-flight mutation racing a pending digest cannot mint torn hybrid evidence', async () => {
  const { input, graph } = await closureFixture();
  const expectedDigest = await computeDefinitionGraphDigest(graph, realSha256);
  let calls = 0;
  const delayedSha256: Sha256Port = {
    async digestUtf8(value: string): Promise<string> {
      calls += 1;
      if (calls === 1) {
        // First recomputation (the closure currentness check): mutate the
        // caller's graph while the digest is pending.
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

test('PACK-B T003E 7c: accessor-backed or unknown-field input fails closed typed, no hidden getter executes', async () => {
  const { input } = await closureFixture();

  let getterRan = false;
  const accessorInput = {
    get assembly() {
      getterRan = true;
      return input.assembly;
    },
    rootComponentId: 'tool.root',
    currentDefinitionGraph: input.currentDefinitionGraph,
    implementations: input.implementations,
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
  const { input } = await closureFixture({ rootComponentId: 'semantic.root' }, [candidate('tool.b')], semanticRoot);

  await expectClosureError(closeCapabilityDependencies(input), 'ROOT_NOT_TOOL_COMPONENT');
});

test('PACK-B T003E: duplicate exact pins for one subject fail closed typed', async () => {
  const pin = {
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
// Evidence immutability / non-aliasing / no live handles in identity.
// ---------------------------------------------------------------------------

test('PACK-B T003E: evidence is deep-frozen, non-aliasing and carries no live handles or functions', async () => {
  const { input, graph } = await closureFixture();
  const closed: SealedCapabilityDependencyClosure = await closeCapabilityDependencies(input);

  assert.equal(Object.isFrozen(closed.evidence), true);
  assert.equal(Object.isFrozen(closed.evidence.entries), true);
  assert.equal(Object.isFrozen(closed.evidence.edges), true);
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
  assert.deepEqual(Object.keys(closed).sort(), ['evidence', 'implementationHandles', 'successorAssembly']);
  const evidenceJson = JSON.stringify(closed.evidence);
  assert.equal(evidenceJson.includes('handle'), false);
  assert.equal(evidenceJson.includes('marker'), false);
  assert.equal((closed.evidence as unknown as Record<string, unknown>).invoke, undefined);
  assert.equal((closed.evidence as unknown as Record<string, unknown>).occurrenceId, undefined);

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
