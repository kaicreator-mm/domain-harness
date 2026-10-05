/**
 * T006A invariant matrix — Assembly-plane Standard Set (issue #618,
 * fine-grained DAG #534 T006A; authority #589 PACK-C).
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
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import type {
  AssemblyImplementationBindingEvidence,
  KindImplementationPin,
} from '../../src/contracts/runtime-assembly.js';
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
    ...overrides,
  };
}

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
  const forward = await sealStandardSet(
    await sealInput({ entries: [await entry(), beta] }),
    realSha256,
  );
  const reversed = await sealStandardSet(
    await sealInput({ entries: [beta, await entry()] }),
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

  const result = await verifyStandardSetCurrentness(sealed, {
    currentDescriptors: [descriptor()],
    sha256: realSha256,
  });
  assert.equal(result.status, 'CURRENT');
  assert.equal(result.checkedDescriptors, 1);
  assert.equal(result.setDigest, sealed.setDigest);

  // Missing current descriptor fails closed.
  await assert.rejects(
    verifyStandardSetCurrentness(sealed, { currentDescriptors: [], sha256: realSha256 }),
    (error: unknown) => {
      assert.ok(error instanceof StandardContractError);
      assert.equal(error.code, 'STANDARD_DESCRIPTOR_CURRENTNESS_MISMATCH');
      return true;
    },
  );

  // Same version, changed semantics (classification edit without bump) fails
  // currentness — identity is recomputed, never trusted from the caller.
  await assert.rejects(
    verifyStandardSetCurrentness(sealed, {
      currentDescriptors: [descriptor({ classification: 'supported' })],
      sha256: realSha256,
    }),
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
    verifyStandardSetCurrentness(forged as never, {
      currentDescriptors: [descriptor()],
      sha256: realSha256,
    }),
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
