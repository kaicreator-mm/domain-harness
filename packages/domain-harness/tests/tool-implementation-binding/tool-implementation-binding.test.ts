/**
 * T003C tests-first matrix — Assembly-plane Tool implementation binding
 * (issue #607; authority #589 PACK-A T003C; DAG #534).
 *
 * Covers the PACK-A T003C test list:
 *  1. deterministic same input -> identical binding evidence and successor
 *     Assembly digest across repeated runs (and under candidate/operation
 *     order permutation);
 *  2. replacement identity split: replacing the bound Tool implementation
 *     changes the successor assemblyDigest while the Definition graph digest
 *     (Definition identity) stays unchanged;
 *  3. missing / incompatible / ambiguous fail closed with typed errors —
 *     never first/latest/default;
 *  4. the exact authoritative pin (implementationId + implementationVersion
 *     + implementationDigest) resolves ambiguity and fails closed when it
 *     matches no offered exact implementation or an incompatible one;
 *  5. the runtime implementation handle is paired with the exact pin OUTSIDE
 *     all digest material;
 *  6. evidence is fresh/frozen/non-aliasing and binds DefinitionGraphDigest +
 *     exact Tool provider + exact implementation pin + successor assembly
 *     digest;
 *  7. currentness: a stale/foreign current Definition graph or a selection
 *     minted over a different graph fails DEFINITION_GRAPH_DIGEST_MISMATCH;
 *  8. the sealed input Assembly is never mutated — the successor is created
 *     through the T002B generic binding container (reseal).
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
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  ToolImplementationBindingError,
  type BindToolImplementationInput,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Fixtures: one consumer + one Domain Tool provider over one exact Kind.
// ---------------------------------------------------------------------------

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { kindId: 'test.t003c-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(overrides: Partial<ComponentEnvelope> = {}): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.t003c-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.add', inputSchema: {}, outputSchema: {}, effect: 'none' },
        { operationId: 'op.sub', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }],
    },
    ...overrides,
  };
}

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t003c',
    components: [consumer(), toolComponent()],
    relations: [],
    ...overrides,
  };
}

function kindBinding() {
  return {
    pin: {
      kind: { kindId: 'test.t003c-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.t003c-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

async function sealedBaseAssembly(definitionGraph: DefinitionGraphEnvelope = graph()) {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding()] },
    realSha256,
  );
}

async function selectionFor(definitionGraph: DefinitionGraphEnvelope = graph()) {
  const digest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  return resolveCurrentCapabilityProvider(
    definitionGraph,
    { capabilityId: 'cap.calc', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
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

interface BindFixture {
  input: BindToolImplementationInput;
  selection: Awaited<ReturnType<typeof selectionFor>>;
  assembly: Awaited<ReturnType<typeof sealedBaseAssembly>>;
  definitionGraph: DefinitionGraphEnvelope;
}

async function bindFixture(
  overrides: Partial<BindToolImplementationInput> = {},
  candidates: readonly ToolImplementationCandidate[] = [candidate('impl.calc.alpha')],
): Promise<BindFixture> {
  const definitionGraph = graph();
  const assembly = await sealedBaseAssembly(definitionGraph);
  const selection = await selectionFor(definitionGraph);
  const input: BindToolImplementationInput = {
    assembly,
    selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
    currentDefinitionGraph: definitionGraph,
    implementations: candidates,
    sha256: realSha256,
    ...overrides,
  };
  return { input, selection, assembly, definitionGraph };
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

// ---------------------------------------------------------------------------
// PACK-A test 1: deterministic same input.
// ---------------------------------------------------------------------------

test('PACK-A T003C 1: identical inputs -> identical binding evidence and successor Assembly digest across runs', async () => {
  const first = await bindToolImplementation((await bindFixture()).input);
  const second = await bindToolImplementation((await bindFixture()).input);

  assert.equal(first.evidence.bindingDigest, second.evidence.bindingDigest);
  assert.deepEqual(first.evidence, second.evidence);
  assert.equal(first.successorAssembly.assemblyDigest, second.successorAssembly.assemblyDigest);
  assert.deepEqual(first.successorAssembly.record, second.successorAssembly.record);
});

test('PACK-A T003C 1: candidate order and required-operation order permutations change nothing', async () => {
  const alpha = candidate('impl.calc.alpha');
  const bravo = candidate('impl.calc.bravo');
  const pinAlpha = {
    implementationId: 'impl.calc.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:impl.calc.alpha-content',
  };

  const forward = await bindToolImplementation(
    (await bindFixture({ requiredOperations: ['op.add', 'op.sub'], exactPin: pinAlpha }, [alpha, bravo])).input,
  );
  const reversed = await bindToolImplementation(
    (await bindFixture({ requiredOperations: ['op.sub', 'op.add'], exactPin: pinAlpha }, [bravo, alpha])).input,
  );

  assert.equal(forward.evidence.bindingDigest, reversed.evidence.bindingDigest);
  assert.equal(forward.successorAssembly.assemblyDigest, reversed.successorAssembly.assemblyDigest);
  assert.deepEqual(
    forward.evidence.supportedOperations,
    ['op.add', 'op.sub'],
    'bound operations are order-normalized into the evidence',
  );
});

// ---------------------------------------------------------------------------
// PACK-A test 2: replacement identity split.
// ---------------------------------------------------------------------------

test('PACK-A T003C 2: replacing the Tool implementation changes assemblyDigest only; Definition identity is unchanged', async () => {
  const definitionGraphDigest = await computeDefinitionGraphDigest(graph(), realSha256);

  const boundA = await bindToolImplementation((await bindFixture()).input);
  // Re-bind from the SUCCESSOR assembly: the first binding is already sealed
  // into boundA.successorAssembly; the replacement creates a further
  // successor through the same generic container.
  const boundB = await bindToolImplementation(
    (
      await bindFixture({}, [candidate('impl.calc.bravo', {}, {
        implementationVersion: '2.0.0',
        implementationDigest: 'sha256:impl.calc.bravo-content',
      })])
    ).input,
  );

  assert.equal(boundA.successorAssembly.record.definitionGraphDigest, definitionGraphDigest);
  assert.equal(boundB.successorAssembly.record.definitionGraphDigest, definitionGraphDigest);
  assert.notEqual(boundA.evidence.bindingDigest, boundB.evidence.bindingDigest);
  assert.notEqual(
    boundA.successorAssembly.assemblyDigest,
    boundB.successorAssembly.assemblyDigest,
  );
  assert.equal(boundA.evidence.implementation.implementationId, 'impl.calc.alpha');
  assert.equal(boundB.evidence.implementation.implementationId, 'impl.calc.bravo');
});

test('PACK-A T003C 8/non-mutation: the sealed input Assembly is never mutated; the successor carries the new/replaced evidence slot', async () => {
  const { input, assembly } = await bindFixture();

  const before = JSON.parse(JSON.stringify(assembly.record));
  const bound = await bindToolImplementation(input);

  assert.deepEqual(assembly.record, before, 'the input Assembly record is untouched');
  assert.deepEqual(assembly.record.implementationBindingEvidence, []);

  const slots = bound.successorAssembly.record.implementationBindingEvidence;
  assert.equal(slots.length, 1);
  assert.equal(slots[0]!.subject, 'tool.alpha');
  assert.equal(slots[0]!.bindingDigest, bound.evidence.bindingDigest);
});

test('PACK-A T003C: re-binding the same subject REPLACES the slot; other subjects are preserved', async () => {
  // Pre-seal an assembly that already carries evidence for another tool.
  const definitionGraph = graph();
  const preSealed = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [kindBinding()],
      implementationBindingEvidence: [
        { subject: 'tool.other', bindingDigest: 'sha256:other-binding' },
      ],
    },
    realSha256,
  );
  const selection = await selectionFor(definitionGraph);

  const boundA = await bindToolImplementation({
    assembly: preSealed,
    selection,
    currentDefinitionGraph: definitionGraph,
    implementations: [candidate('impl.calc.alpha')],
    sha256: realSha256,
  });
  const boundB = await bindToolImplementation({
    assembly: boundA.successorAssembly,
    selection,
    currentDefinitionGraph: definitionGraph,
    implementations: [candidate('impl.calc.bravo')],
    sha256: realSha256,
  });

  const slots = boundB.successorAssembly.record.implementationBindingEvidence;
  assert.deepEqual(
    slots.map((slot) => slot.subject),
    ['tool.alpha', 'tool.other'],
    'slots stay sorted by subject; the unrelated slot is preserved',
  );
  assert.equal(slots[0]!.bindingDigest, boundB.evidence.bindingDigest, 'the slot was replaced');
  assert.notEqual(
    boundA.successorAssembly.assemblyDigest,
    boundB.successorAssembly.assemblyDigest,
  );
});

// ---------------------------------------------------------------------------
// PACK-A test 3: missing / incompatible / ambiguous fail closed.
// ---------------------------------------------------------------------------

test('PACK-A T003C 3: zero offered implementations fails MISSING_TOOL_IMPLEMENTATION', async () => {
  await expectBindingError(
    bindToolImplementation((await bindFixture({}, [])).input),
    'MISSING_TOOL_IMPLEMENTATION',
  );
});

test('PACK-A T003C 3: no compatible implementation fails MISSING_TOOL_IMPLEMENTATION (never a default)', async () => {
  const incompatible = candidate('impl.calc.partial', {
    supportedOperations: ['op.add'],
  });
  const error = await expectBindingError(
    bindToolImplementation((await bindFixture({}, [incompatible])).input),
    'MISSING_TOOL_IMPLEMENTATION',
  );
  assert.match(error.message, /op\.sub/);
});

test('PACK-A T003C 3: an exactly pinned implementation missing a required operation fails INCOMPATIBLE_TOOL_IMPLEMENTATION', async () => {
  const partial = candidate('impl.calc.partial', { supportedOperations: ['op.add'] });
  const error = await expectBindingError(
    bindToolImplementation(
      (await bindFixture({ requiredOperations: ['op.add', 'op.sub'] }, [partial])).input,
    ),
    'MISSING_TOOL_IMPLEMENTATION',
  );
  assert.match(error.message, /op\.sub/);

  // Pinning the incompatible candidate identifies it as the binding target —
  // the failure is INCOMPATIBLE, never silently resolved or downgraded.
  await expectBindingError(
    bindToolImplementation(
      (
        await bindFixture(
          {
            requiredOperations: ['op.add', 'op.sub'],
            exactPin: {
              implementationId: 'impl.calc.partial',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:impl.calc.partial-content',
            },
          },
          [partial],
        )
      ).input,
    ),
    'INCOMPATIBLE_TOOL_IMPLEMENTATION',
  );

  // Without narrowing, the bound set is ALL operations the Tool declares, so
  // the same candidate is still not compatible.
  await expectBindingError(
    bindToolImplementation((await bindFixture({}, [partial])).input),
    'MISSING_TOOL_IMPLEMENTATION',
  );
});

test('PACK-A T003C 3: multiple compatible implementations without an exact authoritative binding fail AMBIGUOUS (never first-wins)', async () => {
  const alpha = candidate('impl.calc.alpha');
  const bravo = candidate('impl.calc.bravo');
  const charlie = candidate('impl.calc.charlie');

  // Order must not change the failure: the last candidate in one run is first
  // in the other, and no ordering silently wins.
  const error1 = await expectBindingError(
    bindToolImplementation((await bindFixture({}, [alpha, bravo, charlie])).input),
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );
  const error2 = await expectBindingError(
    bindToolImplementation((await bindFixture({}, [charlie, bravo, alpha])).input),
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );

  assert.deepEqual(error1.conflictingImplementationIds, [
    'impl.calc.alpha',
    'impl.calc.bravo',
    'impl.calc.charlie',
  ]);
  assert.deepEqual(error1.conflictingImplementationIds, error2.conflictingImplementationIds);
});

test('PACK-A T003C 3: duplicate candidate identities (same implementationId) fail AMBIGUOUS, not first-wins', async () => {
  const v1 = candidate('impl.calc.alpha', {}, { implementationVersion: '1.0.0' });
  const v2 = candidate('impl.calc.alpha', {}, { implementationVersion: '1.1.0' });
  await expectBindingError(
    bindToolImplementation((await bindFixture({}, [v1, v2])).input),
    'AMBIGUOUS_TOOL_IMPLEMENTATION',
  );
});

// ---------------------------------------------------------------------------
// PACK-A test 4: the exact authoritative pin.
// ---------------------------------------------------------------------------

test('PACK-A T003C: an exact pin resolves ambiguity and binds exactly the pinned implementation', async () => {
  const alpha = candidate('impl.calc.alpha');
  const bravo = candidate('impl.calc.bravo');

  const bound = await bindToolImplementation(
    (
      await bindFixture(
        {
          exactPin: {
            implementationId: 'impl.calc.bravo',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:impl.calc.bravo-content',
          },
        },
        [alpha, bravo],
      )
    ).input,
  );

  assert.equal(bound.evidence.implementation.implementationId, 'impl.calc.bravo');
});

test('PACK-A T003C: an exact pin matching no offered implementation fails MISSING_TOOL_IMPLEMENTATION', async () => {
  await expectBindingError(
    bindToolImplementation(
      (
        await bindFixture({
          exactPin: {
            implementationId: 'impl.calc.unknown',
            implementationVersion: '1.0.0',
            implementationDigest: 'sha256:whatever',
          },
        })
      ).input,
    ),
    'MISSING_TOOL_IMPLEMENTATION',
  );
});

test('PACK-A T003C: an exact pin whose version/digest does not equal the offered candidate fails MISSING_TOOL_IMPLEMENTATION', async () => {
  const bravo = candidate('impl.calc.bravo');
  await expectBindingError(
    bindToolImplementation(
      (
        await bindFixture(
          {
            exactPin: {
              implementationId: 'impl.calc.bravo',
              implementationVersion: '9.9.9',
              implementationDigest: 'sha256:impl.calc.bravo-content',
            },
          },
          [bravo],
        )
      ).input,
    ),
    'MISSING_TOOL_IMPLEMENTATION',
  );
  await expectBindingError(
    bindToolImplementation(
      (
        await bindFixture(
          {
            exactPin: {
              implementationId: 'impl.calc.bravo',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:wrong-digest',
            },
          },
          [bravo],
        )
      ).input,
    ),
    'MISSING_TOOL_IMPLEMENTATION',
  );
});

test('PACK-A T003C: an exact pin to an incompatible implementation fails INCOMPATIBLE_TOOL_IMPLEMENTATION', async () => {
  const partial = candidate('impl.calc.partial', { supportedOperations: ['op.add'] });
  await expectBindingError(
    bindToolImplementation(
      (
        await bindFixture(
          {
            requiredOperations: ['op.add', 'op.sub'],
            exactPin: {
              implementationId: 'impl.calc.partial',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:impl.calc.partial-content',
            },
          },
          [partial],
        )
      ).input,
    ),
    'INCOMPATIBLE_TOOL_IMPLEMENTATION',
  );
});

// ---------------------------------------------------------------------------
// PACK-A test 5: runtime handle paired outside digest material.
// ---------------------------------------------------------------------------

test('PACK-A T003C 5: the runtime handle is paired with the pin but never enters any digest material', async () => {
  const liveHandle = { connection: 'live', token: 'secret-runtime-value' };
  const withHandle = await bindToolImplementation(
    (await bindFixture({}, [candidate('impl.calc.alpha', { handle: liveHandle })])).input,
  );

  assert.equal(withHandle.implementationHandle, liveHandle, 'the handle is paired by reference');

  // The handle appears nowhere in the serializable evidence or Assembly record.
  assert.equal(JSON.stringify(withHandle.evidence).includes('secret-runtime-value'), false);
  assert.equal(
    JSON.stringify(withHandle.successorAssembly.record).includes('secret-runtime-value'),
    false,
  );

  // Two candidates with identical pin identity but different handles bind to
  // IDENTICAL evidence digests: the handle is not identity.
  const plain = await bindToolImplementation((await bindFixture()).input);
  assert.equal(withHandle.evidence.bindingDigest, plain.evidence.bindingDigest);
  assert.equal(
    withHandle.successorAssembly.assemblyDigest,
    plain.successorAssembly.assemblyDigest,
  );
});

// ---------------------------------------------------------------------------
// PACK-A test 6: evidence fresh/frozen/non-aliasing; binds graph digest +
// exact provider + exact pin (+ successor assembly digest).
// ---------------------------------------------------------------------------

test('PACK-A T003C 6: evidence binds DefinitionGraphDigest + exact Tool provider + exact implementation pin and is frozen/non-aliasing', async () => {
  const { input, selection, definitionGraph } = await bindFixture();
  const definitionGraphDigest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  const before = JSON.parse(JSON.stringify(input.selection));

  const bound: SealedToolImplementationBinding = await bindToolImplementation(input);

  assert.equal(bound.evidence.status, 'BOUND');
  assert.equal(bound.evidence.definitionGraphDigest, definitionGraphDigest);
  assert.equal(bound.evidence.definitionGraphDigest, selection.definitionGraphDigest);
  assert.equal(bound.evidence.toolComponentId, 'tool.alpha');
  assert.deepEqual(bound.evidence.providesCapability, {
    capabilityId: 'cap.calc',
    version: '1.0.0',
  });
  assert.deepEqual(bound.evidence.implementation, {
    implementationId: 'impl.calc.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:impl.calc.alpha-content',
  });
  assert.equal(
    bound.evidence.assemblyDigest,
    bound.successorAssembly.assemblyDigest,
    'the evidence binds the exact successor Assembly it was minted into',
  );
  assert.deepEqual(
    Object.keys(bound.evidence).sort(),
    [
      'assemblyDigest',
      'bindingDigest',
      'definitionGraphDigest',
      'implementation',
      'providesCapability',
      'status',
      'supportedOperations',
      'toolComponentId',
    ],
    'no invocation/occurrence/effect/provider-object field exists on the evidence',
  );

  // Frozen and non-aliasing: caller mutation after the fact changes nothing.
  assert.ok(Object.isFrozen(bound.evidence));
  assert.ok(Object.isFrozen(bound.evidence.implementation));
  assert.ok(Object.isFrozen(bound.evidence.supportedOperations));
  assert.ok(Object.isFrozen(bound));

  const evidenceSnapshot = JSON.parse(JSON.stringify(bound.evidence));
  (input.selection as { provider: { componentId: string } }).provider.componentId = 'tool.hacked';
  (input.selection as { definitionGraphDigest: string }).definitionGraphDigest = 'sha256:hacked';
  (input.implementations as unknown as Array<{ implementation: { implementationId: string } }>)[0]!
    .implementation.implementationId = 'impl.hacked';
  assert.deepEqual(bound.evidence, evidenceSnapshot, 'later caller mutation cannot rewrite evidence');
  assert.notEqual(
    JSON.stringify(input.selection),
    JSON.stringify(before),
    'sanity: the caller mutations were real',
  );
});

// ---------------------------------------------------------------------------
// PACK-A test 7: currentness fail closed.
// ---------------------------------------------------------------------------

test('PACK-A T003C 7: a stale current Definition graph fails DEFINITION_GRAPH_DIGEST_MISMATCH', async () => {
  const differentGraph: DefinitionGraphEnvelope = {
    ...graph(),
    components: [
      ...graph().components,
      {
        family: 'semantic',
        componentId: 'component.extra',
        kind: { kindId: 'test.t003c-kind', version: '1.0.0' },
        requiredSemanticContracts: [],
        requiredCapabilities: [],
        semanticBody: { note: 'extra' },
      },
    ],
  };

  const { assembly, selection } = await bindFixture();
  await expectBindingError(
    bindToolImplementation({
      assembly,
      selection,
      currentDefinitionGraph: differentGraph,
      implementations: [candidate('impl.calc.alpha')],
      sha256: realSha256,
    }),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );
});

test('PACK-A T003C 7: a selection minted over a different graph fails DEFINITION_GRAPH_DIGEST_MISMATCH', async () => {
  const definitionGraph = graph();
  const assembly = await sealedBaseAssembly(definitionGraph);
  const foreignGraph: DefinitionGraphEnvelope = {
    graphId: 'graph.foreign',
    components: [
      consumer(),
      toolComponent({ semanticBody: { operations: [
        { operationId: 'op.add', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ], providesCapabilities: [{ capabilityId: 'cap.calc', version: '1.0.0' }] } }),
    ],
    relations: [],
  };
  const foreignSelection = await selectionFor(foreignGraph);

  await expectBindingError(
    bindToolImplementation({
      assembly,
      selection: foreignSelection,
      currentDefinitionGraph: definitionGraph,
      implementations: [candidate('impl.calc.alpha')],
      sha256: realSha256,
    }),
    'DEFINITION_GRAPH_DIGEST_MISMATCH',
  );
});

// ---------------------------------------------------------------------------
// Selection/graph consistency + exactness matrix.
// ---------------------------------------------------------------------------

test('PACK-A T003C: a selection naming a component outside the graph (or a non-Tool) fails INVALID_BINDING_INPUT', async () => {
  const { assembly, definitionGraph } = await bindFixture();
  const genuine = await selectionFor(definitionGraph);

  const unknownProvider = {
    ...genuine,
    provider: { ...genuine.provider, componentId: 'tool.unknown' },
  };
  await expectBindingError(
    bindToolImplementation({
      assembly,
      selection: unknownProvider,
      currentDefinitionGraph: definitionGraph,
      implementations: [candidate('impl.calc.alpha')],
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );

  // A semantic-family component can never be a Tool implementation subject.
  const semanticProvider = {
    ...genuine,
    provider: { ...genuine.provider, componentId: 'consumer.a', family: 'semantic' as const },
  } as unknown as import('../../src/contracts/capability-provision.js').CurrentCapabilityProviderSelection;
  await expectBindingError(
    bindToolImplementation({
      assembly,
      selection: semanticProvider,
      currentDefinitionGraph: definitionGraph,
      implementations: [candidate('impl.calc.alpha')],
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );
});

test('PACK-A T003C: a selection whose capability is not provided by the Tool Component fails INVALID_BINDING_INPUT', async () => {
  const { assembly, definitionGraph } = await bindFixture();
  const genuine = await selectionFor(definitionGraph);
  const wrongCapability = {
    ...genuine,
    requiredCapability: { capabilityId: 'cap.other', version: '1.0.0' },
    provider: {
      ...genuine.provider,
      providesCapability: { capabilityId: 'cap.other', version: '1.0.0' },
    },
  };
  await expectBindingError(
    bindToolImplementation({
      assembly,
      selection: wrongCapability,
      currentDefinitionGraph: definitionGraph,
      implementations: [candidate('impl.calc.alpha')],
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );
});

test('PACK-A T003C: a required operation not declared by the Tool Component fails INVALID_BINDING_INPUT', async () => {
  await expectBindingError(
    bindToolImplementation(
      (await bindFixture({ requiredOperations: ['op.mul'] })).input,
    ),
    'INVALID_BINDING_INPUT',
  );
});

test('PACK-A T003C: duplicate required operations / duplicate candidate operation entries fail INVALID_BINDING_INPUT', async () => {
  await expectBindingError(
    bindToolImplementation(
      (await bindFixture({ requiredOperations: ['op.add', 'op.add'] })).input,
    ),
    'INVALID_BINDING_INPUT',
  );
  const duplicated = candidate('impl.calc.alpha', { supportedOperations: ['op.add', 'op.add'] });
  await expectBindingError(
    bindToolImplementation((await bindFixture({}, [duplicated])).input),
    'INVALID_BINDING_INPUT',
  );
});

test('PACK-A T003C: floating/range/x-range identities fail FLOATING_AUTHORITY_REFERENCE_FORBIDDEN; a non-digest pin fails INVALID_BINDING_INPUT', async () => {
  await expectBindingError(
    bindToolImplementation(
      (await bindFixture({}, [candidate('latest')])).input,
    ),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
  await expectBindingError(
    bindToolImplementation(
      (await bindFixture({}, [candidate('impl.calc.alpha', {}, { implementationVersion: '1.x' })])).input,
    ),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
  await expectBindingError(
    bindToolImplementation(
      (await bindFixture({ requiredOperations: ['current'] })).input,
    ),
    'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
  await expectBindingError(
    bindToolImplementation(
      (await bindFixture({}, [candidate('impl.calc.alpha', {}, { implementationDigest: '' })])).input,
    ),
    'INVALID_BINDING_INPUT',
  );
});

test('PACK-A T003C: unknown input/candidate fields fail INVALID_BINDING_INPUT', async () => {
  const { input } = await bindFixture();
  await expectBindingError(
    bindToolImplementation({ ...input, surprise: true } as never),
    'INVALID_BINDING_INPUT',
  );
  const { input: input2 } = await bindFixture();
  const smuggled = candidate('impl.calc.alpha', { modulePath: './evil' } as never);
  await expectBindingError(
    bindToolImplementation({ ...input2, implementations: [smuggled] }),
    'INVALID_BINDING_INPUT',
  );
  // function/module path is never identity: even a bare function handle in the
  // candidate envelope is rejected by the whitelist before any authority use.
  const fnCandidate = candidate('impl.calc.alpha', { invoke: () => {} } as never);
  await expectBindingError(
    bindToolImplementation({ ...input2, implementations: [fnCandidate] }),
    'INVALID_BINDING_INPUT',
  );
});

test('PACK-A T003C: a structurally broken Tool Component in the current graph fails through the unchanged T003A contract', async () => {
  const definitionGraph = graph();
  const assembly = await sealedBaseAssembly(definitionGraph);
  const selection = await selectionFor(definitionGraph);
  const brokenGraph: DefinitionGraphEnvelope = {
    ...definitionGraph,
    components: [
      consumer(),
      toolComponent({
        semanticBody: { operations: [], providesCapabilities: [] },
      }),
    ],
  };

  await assert.rejects(
    bindToolImplementation({
      assembly,
      selection,
      currentDefinitionGraph: brokenGraph,
      implementations: [candidate('impl.calc.alpha')],
      sha256: realSha256,
    }),
    (error: unknown) => {
      // Tool declaration validation runs synchronously before the async
      // currentness check, so the unchanged T003A contract error propagates.
      assert.equal((error as { name?: string }).name, 'ToolComponentContractError');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Fresh Review P1 regression (issue #607, repair authority
// issuecomment-5990404552): §F/T005A resource requirement material must
// survive the T003C successor reseal — no silent drop.
// ---------------------------------------------------------------------------

/** The exact §F declaration sealed into the fixtures below (declaration order
 * deliberately differs from canonical order; T002B canonicalizes at seal). */
function resourceRequirementsInput(
  definitionGraph: DefinitionGraphEnvelope,
): NonNullable<Parameters<typeof sealRuntimeAssembly>[0]['resourceRequirements']> {
  const owner = definitionGraph.components.find((component) => component.componentId === 'tool.alpha');
  assert.ok(owner, 'fixture: tool.alpha must be a component of the graph');
  return [
    {
      owner,
      declaration: {
        componentId: 'tool.alpha',
        requirements: [
          { resourceKey: 'res.workspace-memory', required: true },
          {
            resourceKey: 'res.calc-endpoint',
            contract: { contractId: 'contract.calc-endpoint', version: '1.0.0' },
            operationId: 'op.add',
            required: false,
          },
        ],
      },
    },
  ];
}

async function sealedResourceBearingAssembly(
  definitionGraph: DefinitionGraphEnvelope = graph(),
): Promise<Awaited<ReturnType<typeof sealedBaseAssembly>>> {
  return sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [kindBinding()],
      resourceRequirements: resourceRequirementsInput(definitionGraph),
    },
    realSha256,
  );
}

test('Fresh Review P1: a §F-bearing sealed Assembly keeps byte-identical resource requirement material across the T003C successor reseal; the assemblyDigest change is attributable to the binding evidence slot only', async () => {
  const definitionGraph = graph();
  const assembly = await sealedResourceBearingAssembly(definitionGraph);
  const selection = await selectionFor(definitionGraph);

  // Fixture sanity: the input Assembly really carries canonical §F material.
  assert.equal(assembly.record.resourceRequirements.length, 1);
  assert.deepEqual(
    assembly.record.resourceRequirements[0]!.requirements.map((requirement) => requirement.resourceKey),
    ['res.calc-endpoint', 'res.workspace-memory'],
  );

  const bound = await bindToolImplementation({
    assembly,
    selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
    currentDefinitionGraph: definitionGraph,
    implementations: [candidate('impl.calc.alpha')],
    sha256: realSha256,
  });

  // 1. Material preservation: the successor record carries the SAME §F
  //    material — exact fields, exact refs, canonical order.
  assert.deepEqual(
    bound.successorAssembly.record.resourceRequirements,
    assembly.record.resourceRequirements,
    'the successor reseal must not drop or alter sealed §F resource requirement material',
  );
  for (const material of bound.successorAssembly.record.resourceRequirements) {
    assert.ok(Object.isFrozen(material));
    for (const requirement of material.requirements) {
      assert.ok(Object.isFrozen(requirement));
    }
  }

  // 2. T003C adds/replaces ONLY its implementation-binding evidence slot:
  //    every other record field is byte-identical to the input Assembly.
  assert.equal(bound.successorAssembly.record.digestDomain, assembly.record.digestDomain);
  assert.equal(
    bound.successorAssembly.record.definitionGraphDigest,
    assembly.record.definitionGraphDigest,
    'Definition identity is unchanged by the binding transition',
  );
  assert.deepEqual(bound.successorAssembly.record.kindImplementations, assembly.record.kindImplementations);
  assert.deepEqual(
    bound.successorAssembly.record.implementationBindingEvidence.filter(
      (slot) => slot.subject !== 'tool.alpha',
    ),
    assembly.record.implementationBindingEvidence,
    'prior §G slots for other subjects are preserved exactly',
  );
  assert.equal(
    bound.successorAssembly.record.implementationBindingEvidence.length,
    assembly.record.implementationBindingEvidence.length + 1,
    'exactly one §G slot — this subject — was added by T003C',
  );
  assert.deepEqual(
    Object.keys(bound.successorAssembly.record).sort(),
    Object.keys(assembly.record).sort(),
    'no record field was added or removed by the successor reseal',
  );

  // 3. Definition identity is still the authoritatively recomputed graph digest.
  const recomputedDigest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  assert.equal(bound.successorAssembly.record.definitionGraphDigest, recomputedDigest);

  // 4. Digest attribution: an independent reseal over the same graph, the same
  //    exact pins, the same §F declaration material and the successor's §G
  //    slots reproduces the successor assemblyDigest exactly. The identity
  //    change is the T003C binding transition alone, not unrelated material
  //    loss. (Before the P1 repair the successor was sealed with §F dropped,
  //    so this attribution equality did not hold.)
  const independent = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [kindBinding()],
      resourceRequirements: resourceRequirementsInput(definitionGraph),
      implementationBindingEvidence: bound.successorAssembly.record.implementationBindingEvidence,
    },
    realSha256,
  );
  assert.equal(
    independent.assemblyDigest,
    bound.successorAssembly.assemblyDigest,
    'successor digest must be fully attributable to graph + pins + carried §F material + successor §G slots',
  );
  assert.notEqual(
    bound.successorAssembly.assemblyDigest,
    assembly.assemblyDigest,
    'the binding transition itself changes the Assembly identity',
  );
});

test('Fresh Review P1: an Assembly sealed without §F material yields a successor still sealed without it (no phantom material, no digest drift)', async () => {
  const { input, assembly } = await bindFixture();
  const bound = await bindToolImplementation(input);

  assert.deepEqual(assembly.record.resourceRequirements, []);
  assert.deepEqual(
    bound.successorAssembly.record.resourceRequirements,
    assembly.record.resourceRequirements,
  );
});

test('Fresh Review P1: an assembly record missing resourceRequirements fails closed typed instead of silently binding', async () => {
  const genuine = await sealedBaseAssembly();
  const forgedRecord: Record<string, unknown> = {};
  for (const key of Object.keys(genuine.record)) {
    if (key !== 'resourceRequirements') {
      forgedRecord[key] = (genuine.record as unknown as Record<string, unknown>)[key];
    }
  }
  const forgedAssembly = {
    record: forgedRecord,
    assemblyDigest: genuine.assemblyDigest,
    bindings: genuine.bindings,
  } as unknown as BindToolImplementationInput['assembly'];
  const selection = await selectionFor();

  await expectBindingError(
    bindToolImplementation({
      assembly: forgedAssembly,
      selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
      currentDefinitionGraph: graph(),
      implementations: [candidate('impl.calc.alpha')],
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );
});

test('Fresh Review P1: corrupted §F material on the input assembly record fails closed typed instead of being carried', async () => {
  const genuine = await sealedResourceBearingAssembly();
  const forgedRecord = JSON.parse(JSON.stringify(genuine.record)) as Record<string, unknown>;
  const materials = forgedRecord.resourceRequirements as Array<{
    componentId: string;
    requirements: Array<Record<string, unknown>>;
  }>;
  materials[0]!.requirements[0]!.unexpectedField = 'smuggled';
  const forgedAssembly = {
    record: forgedRecord,
    assemblyDigest: genuine.assemblyDigest,
    bindings: genuine.bindings,
  } as unknown as BindToolImplementationInput['assembly'];
  const definitionGraph = graph();
  const selection = await selectionFor(definitionGraph);

  await expectBindingError(
    bindToolImplementation({
      assembly: forgedAssembly,
      selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
      currentDefinitionGraph: definitionGraph,
      implementations: [candidate('impl.calc.alpha')],
      sha256: realSha256,
    }),
    'INVALID_BINDING_INPUT',
  );
});
