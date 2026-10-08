/**
 * T006A invariant matrix — Assembly-plane Standard Set (issue #618,
 * fine-grained DAG #534 T006A; authority #589 PACK-C; P1 repair #652).
 *
 * A Standard Set is a curated exact set of implementation/binding pins for
 * published Standard descriptors, using the SAME generic binding mechanisms
 * as non-Standard Components (the T002B KindImplementationPin shape and the
 * §G generic implementation-binding evidence slot — type-only reuse, never a
 * privileged Standard registry). These tests pin:
 *  1. deterministic Set identity: identical inputs -> identical digest;
 *     entry/evidence permutation changes nothing (order normalization);
 *  2. replacing a Standard implementation changes the Set
 *     identity/currentness ONLY — the descriptor digest and the referenced
 *     Definition graph digest stay byte-identical;
 *  3. a descriptor semantic version bump changes the descriptor digest
 *     (Definition plane) and therefore the exact descriptor reference a Set
 *     entry is pinned to (Assembly currentness), while the referenced
 *     Component's graph digest stays unchanged — the version split between
 *     descriptor identity (Definition) and implementation identity (Assembly);
 *  4. duplicate descriptor entries, invalid pins, unknown input fields and
 *     duplicate evidence subjects fail closed with typed codes;
 *  5. a caller-claimed Set digest is verified against authoritative
 *     recomputation (STANDARD_SET_CURRENTNESS_MISMATCH on mismatch);
 *  6. descriptor currentness is proven by authoritative recomputation against
 *     the current published descriptors, and a caller-constructed
 *     "sealed" Set can never satisfy the mint registry (anti-forgery);
 *  7. sealing grants identity/currentness provenance only — no activation,
 *     occurrence or effect authority is minted.
 *
 * #652 P1 repair matrix (tests-first):
 *  D1 — descriptor <-> KindImplementation compatibility at Set mint: a
 *       required verification-only descriptor context (never Set identity
 *       material) resolves every entry; the exact descriptor digest must
 *       recompute against the entry's descriptorDigest and the exact
 *       descriptor Kind must equal the entry pin Kind
 *       (STANDARD_SET_DESCRIPTOR_PIN_KIND_MISMATCH); missing/duplicate/
 *       ambiguous bodies fail closed with no closest/latest/default lookup;
 *  D2 — implementation currentness is real: every entry is proven against the
 *       exact current Definition graph and the exact current final sealed
 *       Assembly through the generic T002B admission path
 *       (admitComponentWithAssembly); the admitted KindImplementation pin
 *       must equal the entry pin byte/semantic-exactly
 *       (STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH otherwise);
 *       currentness evidence carries the exact checked final assemblyDigest;
 *       caller mutation while a digest is pending cannot create torn
 *       currentness;
 *  D3 — Tool-family entries consume the accepted #640 T003C consumer
 *       verifier: exactly one exact-subject §G slot is required at mint
 *       (STANDARD_SET_TOOL_BINDING_REQUIRED), orphan slots fail closed,
 *       currentness consumes an exact caller-supplied set of already-minted
 *       sealed Tool bindings matched only by exact Tool component identity,
 *       and the verified toolComponentId/bindingDigest must equal the Set's
 *       exact subject slot (STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH
 *       for the Set-linkage failures; #640-owned failures propagate
 *       unchanged); the Semantic path remains generic and requires no Tool
 *       binding.
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
  resolveCurrentCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import {
  sealRuntimeAssembly,
  type AssemblyImplementationBindingEvidence,
  type KindImplementationPin,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  ToolImplementationBindingError,
  type BindToolImplementationInput,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  StandardContractError,
  computeStandardDescriptorDigest,
  sealStandardSet,
  verifyStandardSetCurrentness,
  type ExactComponentRef,
  type SealStandardSetInput,
  type StandardComponentDescriptor,
  type StandardSetEntry,
} from '../../src/contracts/standard.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

/**
 * Sha256Port that synchronously invokes `mutate` inside the digestUtf8 call
 * at zero-based index `callIndex`, while that digest promise is pending.
 */
function mutationSha256(callIndex: number, mutate: () => void): Sha256Port {
  let calls = 0;
  return {
    async digestUtf8(value: string): Promise<string> {
      if (calls === callIndex) {
        mutate();
      }
      calls += 1;
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
}

function componentRef(overrides: Partial<ExactComponentRef> = {}): ExactComponentRef {
  return {
    family: 'semantic',
    componentId: 'component.standard-example',
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    ...overrides,
  };
}

function descriptor(
  overrides: Partial<StandardComponentDescriptor> = {},
): StandardComponentDescriptor {
  return {
    standardId: 'standard.example',
    classification: 'published',
    descriptorVersion: '1.0.0',
    component: componentRef(),
    ...overrides,
  };
}

function pin(overrides: Record<string, unknown> = {}): KindImplementationPin {
  return {
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    implementation: {
      implementationId: 'impl.standard.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:alpha-content',
    },
    ...overrides,
  } as KindImplementationPin;
}

async function entry(
  descriptorOverrides: Partial<StandardComponentDescriptor> = {},
  pinOverrides: Record<string, unknown> = {},
): Promise<StandardSetEntry> {
  const published = descriptor(descriptorOverrides);
  return {
    descriptor: {
      standardId: published.standardId,
      descriptorVersion: published.descriptorVersion,
      descriptorDigest: await computeStandardDescriptorDigest(published, realSha256),
    },
    pin: pin(pinOverrides),
  };
}

async function sealInput(overrides: Partial<SealStandardSetInput> = {}): Promise<SealStandardSetInput> {
  return {
    entries: [await entry()],
    currentDescriptors: [descriptor()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// #652 D2 fixtures — one semantic Component over one exact Kind, sealed into
// a genuine T002B final Assembly. The Set entry pin equals the Assembly pin.
// ---------------------------------------------------------------------------

function semanticGraph(componentId = 'component.standard-example'): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.standard-currentness',
    components: [
      {
        family: 'semantic',
        componentId,
        kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
        requiredSemanticContracts: [],
        requiredCapabilities: [],
        semanticBody: { note: 'current Standard-referenced Component' },
      },
    ],
    relations: [],
  };
}

function semanticKindBinding(implementationDigest = 'sha256:alpha-content') {
  return {
    pin: {
      kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.standard.alpha',
        implementationVersion: '1.0.0',
        implementationDigest,
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

async function semanticAssembly(
  binding = semanticKindBinding(),
  graph: DefinitionGraphEnvelope = semanticGraph(),
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly({ definitionGraph: graph, kindImplementations: [binding] }, realSha256);
}

/** D2 verification options over the semantic fixtures (no Tool bindings). */
async function semanticVerifyOptions(
  overrides: {
    currentDescriptors?: readonly StandardComponentDescriptor[];
    currentDefinitionGraph?: DefinitionGraphEnvelope;
    finalAssembly?: SealedRuntimeAssembly;
    sealedToolBindings?: readonly SealedToolImplementationBinding[];
  } = {},
) {
  return {
    currentDescriptors: overrides.currentDescriptors ?? [descriptor()],
    currentDefinitionGraph: overrides.currentDefinitionGraph ?? semanticGraph(),
    finalAssembly: overrides.finalAssembly ?? (await semanticAssembly()),
    sealedToolBindings: overrides.sealedToolBindings ?? [],
    sha256: realSha256,
  };
}

// ---------------------------------------------------------------------------
// #652 D3 fixtures — one Domain Tool provider bound through the accepted
// #640 T003C mint path (bindToolImplementation), with the successor Assembly
// carrying the exact-subject §G slot.
// ---------------------------------------------------------------------------

function consumerComponent(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.std',
    kind: { kindId: 'test.std-tool-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.std-calc', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'test.std-tool-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.add', inputSchema: {}, outputSchema: {}, effect: 'none' },
        { operationId: 'op.sub', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ capabilityId: 'cap.std-calc', version: '1.0.0' }],
    },
  };
}

function toolGraph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.std-tool-set',
    components: [consumerComponent(), toolComponent()],
    relations: [],
  };
}

function toolKindBinding() {
  return {
    pin: {
      kind: { kindId: 'test.std-tool-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.std-tool-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:tool-kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

function toolDescriptor(): StandardComponentDescriptor {
  return {
    standardId: 'standard.tool-example',
    classification: 'published',
    descriptorVersion: '1.0.0',
    component: {
      family: 'tool',
      componentId: 'tool.alpha',
      kind: { kindId: 'test.std-tool-kind', version: '1.0.0' },
    },
  };
}

async function toolBindingFixture(): Promise<{
  binding: SealedToolImplementationBinding;
  successorAssembly: SealedRuntimeAssembly;
  definitionGraph: DefinitionGraphEnvelope;
}> {
  const definitionGraph = toolGraph();
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [toolKindBinding()] },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    definitionGraph,
    { capabilityId: 'cap.std-calc', version: '1.0.0' },
    'consumer.std',
    digest,
    realSha256,
  );
  const implementations: ToolImplementationCandidate[] = [
    {
      implementation: {
        implementationId: 'impl.calc.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:impl-calc-alpha-content',
      },
      supportedOperations: ['op.add', 'op.sub'],
    },
  ];
  const input: BindToolImplementationInput = {
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)) as BindToolImplementationInput['selection'],
    currentDefinitionGraph: definitionGraph,
    implementations,
    sha256: realSha256,
  };
  const binding = await bindToolImplementation(input);
  return { binding, successorAssembly: binding.successorAssembly, definitionGraph };
}

/** Reseal over the same tool graph with an explicit §G slot list. */
async function resealToolAssembly(
  definitionGraph: DefinitionGraphEnvelope,
  slots: readonly AssemblyImplementationBindingEvidence[],
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [toolKindBinding()], implementationBindingEvidence: slots },
    realSha256,
  );
}

/** Seal a one-entry Tool Set carrying the exact subject slot `slotDigest`. */
async function toolSetSealed(slotDigest: string) {
  const published = toolDescriptor();
  return sealStandardSet(
    {
      entries: [
        {
          descriptor: {
            standardId: published.standardId,
            descriptorVersion: published.descriptorVersion,
            descriptorDigest: await computeStandardDescriptorDigest(published, realSha256),
          },
          pin: toolKindBinding().pin,
        },
      ],
      currentDescriptors: [published],
      implementationBindingEvidence: [{ subject: 'tool.alpha', bindingDigest: slotDigest }],
    },
    realSha256,
  );
}

function expectStandardError(promise: Promise<unknown>, code: StandardContractError['code']) {
  return promise.then(
    () => {
      throw new Error(`expected StandardContractError(${code}), but the call resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof StandardContractError,
        `expected StandardContractError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return true;
    },
  );
}

// ---------------------------------------------------------------------------
// 1-7: original #618 invariant matrix (inputs updated for the #652 required
// verification-only descriptor context and the D2/D3 currentness options).
// ---------------------------------------------------------------------------

test('#618 set 1: identical inputs -> identical Set material and digest; permutations change nothing', async () => {
  const first = await sealStandardSet(await sealInput(), realSha256);
  const second = await sealStandardSet(await sealInput(), realSha256);
  assert.equal(first.setDigest, second.setDigest);
  assert.deepEqual(first.record, second.record);

  const beta = await entry({ standardId: 'standard.beta' }, {
    implementation: {
      implementationId: 'impl.standard.beta',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:beta-content',
    },
  });
  const betaBody = descriptor({ standardId: 'standard.beta' });
  const forward = await sealStandardSet(
    await sealInput({ entries: [await entry(), beta], currentDescriptors: [descriptor(), betaBody] }),
    realSha256,
  );
  const reversed = await sealStandardSet(
    await sealInput({ entries: [beta, await entry()], currentDescriptors: [betaBody, descriptor()] }),
    realSha256,
  );
  assert.equal(forward.setDigest, reversed.setDigest);
  assert.deepEqual(
    forward.record.entries.map((e) => e.descriptor.standardId),
    ['standard.beta', 'standard.example'],
    'entries are order-normalized by exact descriptor key',
  );
});

test('#618 set 2: replacing a Standard implementation changes Set identity only (descriptor + Definition graph digests unchanged)', async () => {
  const published = descriptor();
  const descriptorDigest = await computeStandardDescriptorDigest(published, realSha256);
  const graphDigest = await computeDefinitionGraphDigest(
    {
      graphId: 'graph.standard-set',
      components: [
        {
          family: 'semantic',
          componentId: published.component.componentId,
          kind: published.component.kind,
          requiredSemanticContracts: [],
          requiredCapabilities: [],
          semanticBody: { note: 'ordinary referenced Component' },
        },
      ],
      relations: [],
    } satisfies DefinitionGraphEnvelope,
    realSha256,
  );

  const withAlpha = await sealStandardSet(await sealInput(), realSha256);
  const withBravo = await sealStandardSet(
    await sealInput({
      entries: [
        await entry({}, {
          implementation: {
            implementationId: 'impl.standard.bravo',
            implementationVersion: '2.0.0',
            implementationDigest: 'sha256:bravo-content',
          },
        }),
      ],
    }),
    realSha256,
  );

  assert.notEqual(withAlpha.setDigest, withBravo.setDigest);
  for (const sealed of [withAlpha, withBravo]) {
    assert.equal(sealed.record.entries[0]!.descriptor.descriptorDigest, descriptorDigest);
  }
  assert.equal(descriptorDigest, await computeStandardDescriptorDigest(descriptor(), realSha256));
  assert.equal(graphDigest, await computeDefinitionGraphDigest(
    {
      graphId: 'graph.standard-set',
      components: [
        {
          family: 'semantic',
          componentId: published.component.componentId,
          kind: published.component.kind,
          requiredSemanticContracts: [],
          requiredCapabilities: [],
          semanticBody: { note: 'ordinary referenced Component' },
        },
      ],
      relations: [],
    },
    realSha256,
  ));
  // The exact admitted KindRef is untouched by implementation replacement.
  assert.deepEqual(
    withAlpha.record.entries[0]!.pin.kind,
    withBravo.record.entries[0]!.pin.kind,
  );
});

test('#618 set 3: descriptor semantic version split — descriptor bump changes descriptor digest and the pinned reference, not the graph digest', async () => {
  const v1 = descriptor();
  const v2 = descriptor({ descriptorVersion: '2.0.0' });
  const digestV1 = await computeStandardDescriptorDigest(v1, realSha256);
  const digestV2 = await computeStandardDescriptorDigest(v2, realSha256);
  assert.notEqual(digestV1, digestV2);

  const setV1 = await sealStandardSet(
    await sealInput({
      entries: [
        {
          descriptor: {
            standardId: v1.standardId,
            descriptorVersion: v1.descriptorVersion,
            descriptorDigest: digestV1,
          },
          pin: pin(),
        },
      ],
      currentDescriptors: [v1],
    }),
    realSha256,
  );
  const setV2 = await sealStandardSet(
    await sealInput({
      entries: [
        {
          descriptor: {
            standardId: v2.standardId,
            descriptorVersion: v2.descriptorVersion,
            descriptorDigest: digestV2,
          },
          pin: pin(),
        },
      ],
      currentDescriptors: [v2],
    }),
    realSha256,
  );

  // The Set is pinned to the EXACT published descriptor: a semantic bump
  // changes Assembly currentness (the entry references the new descriptor
  // version+digest) while the implementation pin and the Definition plane of
  // the referenced Component stay unchanged.
  assert.notEqual(setV1.setDigest, setV2.setDigest);
  assert.equal(setV1.record.entries[0]!.pin.implementation.implementationId, 'impl.standard.alpha');
  assert.equal(setV2.record.entries[0]!.pin.implementation.implementationId, 'impl.standard.alpha');
  assert.equal(setV1.record.entries[0]!.descriptor.descriptorVersion, '1.0.0');
  assert.equal(setV2.record.entries[0]!.descriptor.descriptorVersion, '2.0.0');
});

test('#618 set 4: duplicate descriptor entries, invalid pins, unknown fields and duplicate evidence subjects fail closed', async () => {
  const one = await entry();
  await assert.rejects(
    sealStandardSet(await sealInput({ entries: [one, one] }), realSha256),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'DUPLICATE_STANDARD_DESCRIPTOR');
      return true;
    },
  );

  // A floating implementation version carries the unified floating-selector
  // code — the identical mapping T002B uses for pin exactness.
  await assert.rejects(
    sealStandardSet(
      await sealInput({
        entries: [
          await entry({}, {
            implementation: {
              implementationId: 'impl.standard.alpha',
              implementationVersion: 'latest',
              implementationDigest: 'sha256:alpha-content',
            },
          }),
        ],
      }),
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
      return true;
    },
  );

  await assert.rejects(
    sealStandardSet(
      { ...(await sealInput()), provider: 'acme' } as unknown as SealStandardSetInput,
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
      return true;
    },
  );

  const evidence: AssemblyImplementationBindingEvidence = {
    subject: 'tool.standard-example',
    bindingDigest: 'sha256:evidence-alpha',
  };
  await assert.rejects(
    sealStandardSet(
      await sealInput({ implementationBindingEvidence: [evidence, evidence] }),
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'DUPLICATE_BINDING_EVIDENCE');
      return true;
    },
  );
});

test('#618 set 5: a caller-claimed Set digest is verified against authoritative recomputation', async () => {
  const sealed = await sealStandardSet(await sealInput(), realSha256);
  const honest = await sealStandardSet(
    { ...(await sealInput()), claimedSetDigest: sealed.setDigest },
    realSha256,
  );
  assert.equal(honest.setDigest, sealed.setDigest);

  await assert.rejects(
    sealStandardSet(
      { ...(await sealInput()), claimedSetDigest: 'sha256:stale-claim' },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'STANDARD_SET_CURRENTNESS_MISMATCH');
      return true;
    },
  );
});

test('#618 set 6: descriptor currentness by authoritative recomputation; caller-forged sealed Sets are rejected', async () => {
  const sealed = await sealStandardSet(await sealInput(), realSha256);

  const result = await verifyStandardSetCurrentness(sealed, await semanticVerifyOptions());
  assert.equal(result.status, 'CURRENT');
  assert.equal(result.checkedDescriptors, 1);
  assert.equal(result.setDigest, sealed.setDigest);

  // Missing current descriptor fails closed.
  await assert.rejects(
    verifyStandardSetCurrentness(
      sealed,
      await semanticVerifyOptions({ currentDescriptors: [] }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH');
      return true;
    },
  );

  // Same version, changed semantics (classification edit without bump) fails
  // currentness — identity is recomputed, never trusted from the caller.
  await assert.rejects(
    verifyStandardSetCurrentness(
      sealed,
      await semanticVerifyOptions({
        currentDescriptors: [descriptor({ classification: 'supported' })],
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH');
      return true;
    },
  );

  // Anti-forgery: a caller-constructed object with the right shape is not a
  // minted sealed Set and can never satisfy currentness verification.
  const forged = {
    record: sealed.record,
    setDigest: sealed.setDigest,
  };
  await assert.rejects(
    verifyStandardSetCurrentness(forged as never, await semanticVerifyOptions()),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'INVALID_STANDARD_SET_INPUT');
      return true;
    },
  );
});

test('#618 set 7: sealing grants identity/currentness provenance only — no activation, occurrence or effect authority', async () => {
  const sealed = await sealStandardSet(await sealInput(), realSha256);
  assert.deepEqual(Object.keys(sealed).sort(), ['record', 'setDigest']);
  for (const forbidden of ['activate', 'activateRuntime', 'authorityClass', 'occurrenceId', 'effect']) {
    assert.equal(
      (sealed as unknown as Record<string, unknown>)[forbidden],
      undefined,
      `sealed Standard Set must never carry ${forbidden}`,
    );
    assert.equal(
      (sealed.record as unknown as Record<string, unknown>)[forbidden],
      undefined,
      `Standard Set record must never carry ${forbidden}`,
    );
  }
});

// ---------------------------------------------------------------------------
// #652 D1 — descriptor <-> KindImplementation compatibility at Set mint.
// ---------------------------------------------------------------------------

test('#652 D1: a descriptor ref may not be minted against an unrelated exact Kind pin', async () => {
  // The pin itself is exact and decidable — only its pairing with the
  // descriptor's exact Kind is wrong, which must fail closed at mint.
  await expectStandardError(
    sealStandardSet(
      await sealInput({
        entries: [
          await entry({}, {
            kind: { kindId: 'example.unrelated-kind', version: '9.9.9' },
          }),
        ],
      }),
      realSha256,
    ),
    'STANDARD_SET_DESCRIPTOR_PIN_KIND_MISMATCH',
  );
});

test('#652 D1: a missing descriptor body in the verification context fails closed (no closest/latest/default lookup)', async () => {
  await expectStandardError(
    sealStandardSet(
      await sealInput({ currentDescriptors: [] }),
      realSha256,
    ),
    'INVALID_STANDARD_SET_INPUT',
  );
});

test('#652 D1: an ambiguous (duplicate) descriptor body fails closed (never first-wins)', async () => {
  await expectStandardError(
    sealStandardSet(
      await sealInput({ currentDescriptors: [descriptor(), descriptor()] }),
      realSha256,
    ),
    'DUPLICATE_STANDARD_DESCRIPTOR',
  );
});

test('#652 D1: an entry whose pinned descriptorDigest the resolution body does not recompute fails closed', async () => {
  const other = descriptor({ classification: 'supported' });
  const otherDigest = await computeStandardDescriptorDigest(other, realSha256);
  const stale = await entry();
  await expectStandardError(
    sealStandardSet(
      await sealInput({
        entries: [
          {
            descriptor: { ...stale.descriptor, descriptorDigest: otherDigest },
            pin: pin(),
          },
        ],
      }),
      realSha256,
    ),
    'INVALID_STANDARD_SET_INPUT',
  );
});

test('#652 D1: the verification-only context is NOT Set identity material — same entries/evidence seal to the identical digest', async () => {
  const contextA = [descriptor()];
  // Different instances plus an extra unreferenced body: the context is
  // resolution input only — a superset must not change Set identity.
  const contextB = [descriptor(), descriptor({ standardId: 'standard.unreferenced' })];
  const sealedA = await sealStandardSet(
    await sealInput({ currentDescriptors: contextA }),
    realSha256,
  );
  const sealedB = await sealStandardSet(
    await sealInput({ currentDescriptors: contextB }),
    realSha256,
  );
  assert.equal(sealedA.setDigest, sealedB.setDigest, 'descriptor context never enters Set identity');
  assert.deepEqual(Object.keys(sealedA.record).sort(), [
    'digestDomain',
    'entries',
    'implementationBindingEvidence',
  ]);
  // The record carries exact descriptor REFS only — no descriptor body
  // content (standardId/descriptorVersion/digest, nothing else).
  assert.deepEqual(Object.keys(sealedA.record.entries[0]!.descriptor).sort(), [
    'descriptorDigest',
    'descriptorVersion',
    'standardId',
  ]);
});

// ---------------------------------------------------------------------------
// #652 D2 — implementation currentness must be real.
// ---------------------------------------------------------------------------

test('#652 D2: a Set whose entry pin equals the exact Assembly-admitted pin is CURRENT, with the exact final assemblyDigest as evidence', async () => {
  const sealed = await sealStandardSet(await sealInput(), realSha256);
  const assembly = await semanticAssembly();
  const result = await verifyStandardSetCurrentness(sealed, await semanticVerifyOptions({ finalAssembly: assembly }));
  assert.equal(result.status, 'CURRENT');
  assert.equal(result.checkedDescriptors, 1);
  assert.equal(result.setDigest, sealed.setDigest);
  assert.equal(result.finalAssemblyDigest, assembly.assemblyDigest);
});

test('#652 D2: a replaced Assembly Kind pin makes the old Set stale (STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH)', async () => {
  const sealed = await sealStandardSet(await sealInput(), realSha256);
  const replaced = await semanticAssembly(semanticKindBinding('sha256:replacement-content'));
  assert.notEqual(replaced.assemblyDigest, (await semanticAssembly()).assemblyDigest);
  await expectStandardError(
    verifyStandardSetCurrentness(
      sealed,
      await semanticVerifyOptions({ finalAssembly: replaced }),
    ),
    'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH',
  );
});

test('#652 D2: a descriptor-referenced Component absent from the current Definition graph fails closed', async () => {
  const sealed = await sealStandardSet(await sealInput(), realSha256);
  const emptyGraph = { graphId: 'graph.standard-currentness', components: [], relations: [] };
  const assembly = await semanticAssembly(semanticKindBinding(), emptyGraph);
  await expectStandardError(
    verifyStandardSetCurrentness(
      sealed,
      await semanticVerifyOptions({
        currentDefinitionGraph: emptyGraph,
        finalAssembly: assembly,
      }),
    ),
    'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH',
  );
});

test('#652 D2: a graph Component whose exact family/Kind diverges from the descriptor fails closed', async () => {
  const sealed = await sealStandardSet(await sealInput(), realSha256);
  const divergentGraph: DefinitionGraphEnvelope = {
    graphId: 'graph.standard-currentness',
    components: [
      {
        family: 'semantic',
        componentId: 'component.standard-example',
        kind: { kindId: 'example.divergent-kind', version: '1.0.0' },
        requiredSemanticContracts: [],
        requiredCapabilities: [],
        semanticBody: { note: 'kind drifted away from the descriptor' },
      },
    ],
    relations: [],
  };
  const assembly = await semanticAssembly(
    {
      pin: {
        kind: { kindId: 'example.divergent-kind', version: '1.0.0' },
        implementation: {
          implementationId: 'impl.divergent',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:divergent-content',
        },
      },
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: () => {},
    },
    divergentGraph,
  );
  await expectStandardError(
    verifyStandardSetCurrentness(
      sealed,
      await semanticVerifyOptions({
        currentDefinitionGraph: divergentGraph,
        finalAssembly: assembly,
      }),
    ),
    'STANDARD_SET_IMPLEMENTATION_CURRENTNESS_MISMATCH',
  );
});

test('#652 D2: descriptor/Definition mutation while a digest is pending cannot create torn currentness', async () => {
  const sealed = await sealStandardSet(await sealInput(), realSha256);
  const assembly = await semanticAssembly();
  const honest = await verifyStandardSetCurrentness(sealed, await semanticVerifyOptions({ finalAssembly: assembly }));

  // Mutate the caller-owned descriptor body and the caller-owned graph
  // component while the FIRST digest recomputation is pending. Verification
  // must decide on its synchronous snapshot only — the outcome stays exactly
  // the honest one, never a torn hybrid.
  const mutableDescriptor = descriptor();
  const graph = semanticGraph();
  let mutated = false;
  const sha256 = mutationSha256(0, () => {
    if (mutated) return;
    mutated = true;
    (mutableDescriptor as { classification: string }).classification = 'supported';
    (graph.components[0] as { kind: { kindId: string } }).kind.kindId = 'example.mutated-kind';
    (graph.components[0] as { componentId: string }).componentId = 'component.mutated';
  });
  const result = await verifyStandardSetCurrentness(sealed, {
    currentDescriptors: [mutableDescriptor],
    currentDefinitionGraph: graph,
    finalAssembly: assembly,
    sealedToolBindings: [],
    sha256,
  });
  assert.equal(result.status, 'CURRENT');
  assert.equal(result.finalAssemblyDigest, honest.finalAssemblyDigest);
  assert.equal(result.setDigest, honest.setDigest);
  assert.equal(mutated, true, 'sanity: the mutation actually ran during the digest suspension');
});

// ---------------------------------------------------------------------------
// #652 D3 — Tool-family entries link to the accepted #640 T003C binding.
// ---------------------------------------------------------------------------

test('#652 D3: a Tool-family entry without an exact-subject §G slot cannot mint (STANDARD_SET_TOOL_BINDING_REQUIRED)', async () => {
  const published = toolDescriptor();
  await expectStandardError(
    sealStandardSet(
      {
        entries: [
          {
            descriptor: {
              standardId: published.standardId,
              descriptorVersion: published.descriptorVersion,
              descriptorDigest: await computeStandardDescriptorDigest(published, realSha256),
            },
            pin: toolKindBinding().pin,
          },
        ],
        currentDescriptors: [published],
      },
      realSha256,
    ),
    'STANDARD_SET_TOOL_BINDING_REQUIRED',
  );
});

test('#652 D3: an orphan evidence slot (no Tool-family entry for its subject) cannot mint', async () => {
  const published = toolDescriptor();
  await expectStandardError(
    sealStandardSet(
      {
        entries: [
          {
            descriptor: {
              standardId: published.standardId,
              descriptorVersion: published.descriptorVersion,
              descriptorDigest: await computeStandardDescriptorDigest(published, realSha256),
            },
            pin: toolKindBinding().pin,
          },
        ],
        currentDescriptors: [published],
        implementationBindingEvidence: [{ subject: 'tool.unrelated', bindingDigest: 'sha256:orphan' }],
      },
      realSha256,
    ),
    'INVALID_STANDARD_SET_INPUT',
  );
});

test('#652 D3: a Semantic-family descriptor gains no Tool semantics — a slot for its componentId is an orphan', async () => {
  const semanticBody = descriptor();
  await expectStandardError(
    sealStandardSet(
      {
        entries: [await entry()],
        currentDescriptors: [semanticBody],
        implementationBindingEvidence: [
          { subject: 'component.standard-example', bindingDigest: 'sha256:orphan-semantic' },
        ],
      },
      realSha256,
    ),
    'INVALID_STANDARD_SET_INPUT',
  );
});

test('#652 D3: a Tool entry with a genuine minted #640 binding and the exact subject slot verifies CURRENT', async () => {
  const { binding, successorAssembly } = await toolBindingFixture();
  const sealed = await toolSetSealed(binding.evidence.bindingDigest);
  const result = await verifyStandardSetCurrentness(sealed, {
    currentDescriptors: [toolDescriptor()],
    currentDefinitionGraph: toolGraph(),
    finalAssembly: successorAssembly,
    sealedToolBindings: [binding],
    sha256: realSha256,
  });
  assert.equal(result.status, 'CURRENT');
  assert.equal(result.checkedDescriptors, 1);
  assert.equal(result.finalAssemblyDigest, successorAssembly.assemblyDigest);
});

test('#652 D3: an unminted Tool binding lookalike is rejected through the owning #640 failure', async () => {
  const { binding, successorAssembly } = await toolBindingFixture();
  const sealed = await toolSetSealed(binding.evidence.bindingDigest);
  const lookalike = {
    evidence: JSON.parse(JSON.stringify(binding.evidence)),
    successorAssembly,
    implementationHandle: binding.implementationHandle,
  };
  await assert.rejects(
    verifyStandardSetCurrentness(sealed, {
      currentDescriptors: [toolDescriptor()],
      currentDefinitionGraph: toolGraph(),
      finalAssembly: successorAssembly,
      sealedToolBindings: [lookalike as unknown as SealedToolImplementationBinding],
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(
        error instanceof ToolImplementationBindingError,
        `expected ToolImplementationBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, 'UNMINTED_TOOL_IMPLEMENTATION_BINDING');
      return true;
    },
  );
});

test('#652 D3: a replaced or missing final Assembly slot fails closed through the owning #640 failure', async () => {
  const { binding, definitionGraph } = await toolBindingFixture();
  const sealed = await toolSetSealed(binding.evidence.bindingDigest);

  const replaced = await resealToolAssembly(definitionGraph, [
    { subject: 'tool.alpha', bindingDigest: 'sha256:replaced-slot' },
  ]);
  await assert.rejects(
    verifyStandardSetCurrentness(sealed, {
      currentDescriptors: [toolDescriptor()],
      currentDefinitionGraph: definitionGraph,
      finalAssembly: replaced,
      sealedToolBindings: [binding],
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToolImplementationBindingError);
      assert.equal(error.code, 'STALE_TOOL_IMPLEMENTATION_BINDING');
      return true;
    },
  );

  const missing = await resealToolAssembly(definitionGraph, []);
  await assert.rejects(
    verifyStandardSetCurrentness(sealed, {
      currentDescriptors: [toolDescriptor()],
      currentDefinitionGraph: definitionGraph,
      finalAssembly: missing,
      sealedToolBindings: [binding],
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToolImplementationBindingError);
      assert.equal(error.code, 'MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING');
      return true;
    },
  );
});

test('#652 D3: a Set subject slot whose digest the verified binding does not carry fails closed (Set<->binding linkage)', async () => {
  const { binding, successorAssembly } = await toolBindingFixture();
  const sealed = await toolSetSealed('sha256:not-the-verified-digest');
  await expectStandardError(
    verifyStandardSetCurrentness(sealed, {
      currentDescriptors: [toolDescriptor()],
      currentDefinitionGraph: toolGraph(),
      finalAssembly: successorAssembly,
      sealedToolBindings: [binding],
      sha256: realSha256,
    }),
    'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
  );
});

test('#652 D3: a sealed binding for a different Tool component cannot satisfy an entry', async () => {
  const { binding, successorAssembly } = await toolBindingFixture();
  const sealed = await toolSetSealed(binding.evidence.bindingDigest);
  const foreignBinding = { ...binding, evidence: { ...binding.evidence, toolComponentId: 'tool.beta' } };
  await expectStandardError(
    verifyStandardSetCurrentness(sealed, {
      currentDescriptors: [toolDescriptor()],
      currentDefinitionGraph: toolGraph(),
      finalAssembly: successorAssembly,
      // Only a binding indexed by tool.beta is supplied — the exact tool.alpha
      // subject has no candidate, and the foreign subject is an orphan.
      sealedToolBindings: [foreignBinding as unknown as SealedToolImplementationBinding],
      sha256: realSha256,
    }),
    'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
  );
});

test('#652 D3: two sealed bindings for one exact Tool subject are ambiguous and fail closed (never first-wins)', async () => {
  const { binding, successorAssembly } = await toolBindingFixture();
  const second = await toolBindingFixture();
  const sealed = await toolSetSealed(binding.evidence.bindingDigest);
  await expectStandardError(
    verifyStandardSetCurrentness(sealed, {
      currentDescriptors: [toolDescriptor()],
      currentDefinitionGraph: toolGraph(),
      finalAssembly: successorAssembly,
      sealedToolBindings: [binding, second.binding],
      sha256: realSha256,
    }),
    'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
  );
});

test('#652 D3: a missing caller-supplied binding for a Tool subject fails closed (no order/latest/default repair)', async () => {
  const { binding, successorAssembly } = await toolBindingFixture();
  const sealed = await toolSetSealed(binding.evidence.bindingDigest);
  await expectStandardError(
    verifyStandardSetCurrentness(sealed, {
      currentDescriptors: [toolDescriptor()],
      currentDefinitionGraph: toolGraph(),
      finalAssembly: successorAssembly,
      sealedToolBindings: [],
      sha256: realSha256,
    }),
    'STANDARD_SET_TOOL_BINDING_CURRENTNESS_MISMATCH',
  );
});
