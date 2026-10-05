/**
 * T002B invariant matrix — Identity / sealing group (issues #587, #601).
 *
 * Covers invariants 1-8 of the #587 tests-first matrix:
 *  1. identical inputs -> identical Assembly material/digest across runs;
 *  2. replacing a KindImplementation for the same exact KindRef changes the
 *     assemblyDigest while the Definition graph digest stays unchanged;
 *  3. changing only implementationDigest changes the assemblyDigest;
 *  4. permuting KindImplementation binding input order changes nothing;
 *  5. duplicate exact KindImplementation for one exact KindRef fails closed;
 *  6. a missing implementation for a required/admitted graph Kind fails closed;
 *  7. floating/range implementation identity (and wrong exact Kind version)
 *     fails closed;
 *  8. a floating/range Kind decision on a pin stays a typed failure.
 *
 * Also exercises the §E currentness binding: a caller-claimed Definition
 * graph digest is verified against authoritative recomputation and any
 * mismatch fails closed with DEFINITION_CURRENTNESS_MISMATCH.
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
  RuntimeAssemblyError,
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealRuntimeAssemblyInput,
} from '../../src/contracts/runtime-assembly.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

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

function graph(overrides: Partial<DefinitionGraphEnvelope> = {}): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.assembly-identity',
    components: [component('component.a')],
    relations: [],
    ...overrides,
  };
}

function pin(overrides: Record<string, unknown> = {}): KindImplementationBindingInput['pin'] {
  return {
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    implementation: {
      implementationId: 'impl.semantic-kind.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:alpha-content',
    },
    ...overrides,
  } as KindImplementationBindingInput['pin'];
}

function binding(overrides: Partial<KindImplementationBindingInput> = {}): KindImplementationBindingInput {
  return {
    pin: pin(),
    understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    validateComponent: () => {},
    ...overrides,
  };
}

function sealInput(overrides: Partial<SealRuntimeAssemblyInput> = {}): SealRuntimeAssemblyInput {
  return {
    definitionGraph: graph(),
    kindImplementations: [binding()],
    ...overrides,
  };
}

function expectAssemblyError(
  promise: Promise<unknown>,
  code: string,
): Promise<RuntimeAssemblyError> {
  return promise.then(
    () => {
      throw new Error(`expected RuntimeAssemblyError(${code}), but sealing resolved`);
    },
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError, `expected RuntimeAssemblyError, got ${String(error)}`);
      assert.equal(error.code, code);
      return error;
    },
  );
}

test('#587 invariant 1: identical inputs -> identical Assembly material and digest across repeated runs', async () => {
  const first = await sealRuntimeAssembly(sealInput(), realSha256);
  const second = await sealRuntimeAssembly(sealInput(), realSha256);

  assert.equal(first.assemblyDigest, second.assemblyDigest);
  assert.deepEqual(first.record, second.record);
});

test('#587 invariant 2: replacing KindImplementation A with B for the same exact KindRef changes assemblyDigest only', async () => {
  const definitionGraphDigest = await computeDefinitionGraphDigest(graph(), realSha256);

  const withA = await sealRuntimeAssembly(sealInput(), realSha256);
  const withB = await sealRuntimeAssembly(
    sealInput({
      kindImplementations: [
        binding({
          pin: pin({
            implementation: {
              implementationId: 'impl.semantic-kind.bravo',
              implementationVersion: '2.0.0',
              implementationDigest: 'sha256:bravo-content',
            },
          }),
        }),
      ],
    }),
    realSha256,
  );

  assert.equal(withA.record.definitionGraphDigest, definitionGraphDigest);
  assert.equal(withB.record.definitionGraphDigest, definitionGraphDigest);
  assert.notEqual(withA.assemblyDigest, withB.assemblyDigest);
  assert.deepEqual(
    withA.record.kindImplementations.map((p) => p.kind),
    withB.record.kindImplementations.map((p) => p.kind),
    'the exact admitted KindRef is unchanged by implementation replacement',
  );
});

test('#587 invariant 3: changing only implementationDigest changes the assemblyDigest', async () => {
  const base = await sealRuntimeAssembly(sealInput(), realSha256);
  const changed = await sealRuntimeAssembly(
    sealInput({
      kindImplementations: [
        binding({
          pin: pin({
            implementation: {
              implementationId: 'impl.semantic-kind.alpha',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:alpha-content-replacement',
            },
          }),
        }),
      ],
    }),
    realSha256,
  );

  assert.notEqual(base.assemblyDigest, changed.assemblyDigest);
  assert.equal(base.record.definitionGraphDigest, changed.record.definitionGraphDigest);
});

test('#587 invariant 4: permuting KindImplementation binding input order yields an identical Assembly digest', async () => {
  const twoKindGraph = graph({
    components: [
      component('component.a'),
      component('component.b', { kind: { kindId: 'example.other-kind', version: '2.0.0' } }),
    ],
  });
  const alpha = binding({
    pin: pin({ kind: { kindId: 'example.semantic-kind', version: '1.0.0' } }),
  });
  const beta = binding({
    pin: pin({
      kind: { kindId: 'example.other-kind', version: '2.0.0' },
      implementation: {
        implementationId: 'impl.other-kind',
        implementationVersion: '2.0.0',
        implementationDigest: 'sha256:other-content',
      },
    }),
  });

  const forward = await sealRuntimeAssembly(
    sealInput({ definitionGraph: twoKindGraph, kindImplementations: [alpha, beta] }),
    realSha256,
  );
  const reversed = await sealRuntimeAssembly(
    sealInput({ definitionGraph: twoKindGraph, kindImplementations: [beta, alpha] }),
    realSha256,
  );

  assert.equal(forward.assemblyDigest, reversed.assemblyDigest);
  assert.deepEqual(forward.record, reversed.record);
});

test('#587 invariant 5: duplicate exact KindImplementation for one exact KindRef fails closed (never first-wins)', async () => {
  const twin = binding({
    pin: pin({
      implementation: {
        implementationId: 'impl.semantic-kind.twin',
        implementationVersion: '9.9.9',
        implementationDigest: 'sha256:twin-content',
      },
    }),
  });

  await expectAssemblyError(
    sealRuntimeAssembly(sealInput({ kindImplementations: [binding(), twin] }), realSha256),
    'AMBIGUOUS_KIND_IMPLEMENTATION',
  );
});

test('#587 invariant 6: a missing implementation for a required/admitted graph Kind fails closed', async () => {
  const twoKindGraph = graph({
    components: [
      component('component.a'),
      component('component.b', { kind: { kindId: 'example.other-kind', version: '2.0.0' } }),
    ],
  });

  await expectAssemblyError(
    sealRuntimeAssembly(sealInput({ definitionGraph: twoKindGraph }), realSha256),
    'MISSING_KIND_IMPLEMENTATION',
  );
});

test('#587 invariant 7: floating/range implementation identity fails closed', async () => {
  for (const implementationVersion of ['latest', '^1.0.0', '1.x']) {
    await expectAssemblyError(
      sealRuntimeAssembly(
        sealInput({
          kindImplementations: [
            binding({
              pin: pin({
                implementation: {
                  implementationId: 'impl.semantic-kind.alpha',
                  implementationVersion,
                  implementationDigest: 'sha256:alpha-content',
                },
              }),
            }),
          ],
        }),
        realSha256,
      ),
      'INVALID_IMPLEMENTATION_PIN',
    );
  }

  // A binding for the wrong exact Kind version does not satisfy the graph's
  // required/admitted Kind — admission never falls back to another version.
  const versionedGraph = graph({
    components: [component('component.a', { kind: { kindId: 'example.semantic-kind', version: '2.0.0' } })],
  });
  await expectAssemblyError(
    sealRuntimeAssembly(sealInput({ definitionGraph: versionedGraph }), realSha256),
    'MISSING_KIND_IMPLEMENTATION',
  );
});

test('#587 invariant 8: an inexact (floating/range) Kind decision on a pin is a typed failure', async () => {
  for (const version of ['latest', '1.x', '^2.0.0']) {
    await expectAssemblyError(
      sealRuntimeAssembly(
        sealInput({
          kindImplementations: [
            binding({ pin: pin({ kind: { kindId: 'example.semantic-kind', version } }) }),
          ],
        }),
        realSha256,
      ),
      'INCOMPATIBLE_KIND_IMPLEMENTATION',
    );
  }
});

test('#587 §E: a caller-claimed Definition graph digest is verified against authoritative recomputation', async () => {
  const definitionGraphDigest = await computeDefinitionGraphDigest(graph(), realSha256);

  const sealed = await sealRuntimeAssembly(
    sealInput({ claimedDefinitionGraphDigest: definitionGraphDigest }),
    realSha256,
  );
  assert.equal(sealed.record.definitionGraphDigest, definitionGraphDigest);

  await expectAssemblyError(
    sealRuntimeAssembly(
      sealInput({ claimedDefinitionGraphDigest: 'sha256:stale-or-forged-graph-digest' }),
      realSha256,
    ),
    'DEFINITION_CURRENTNESS_MISMATCH',
  );
});

test('#587 failure taxonomy: seal failures are typed RuntimeAssemblyError values, never booleans', async () => {
  const error = await expectAssemblyError(
    sealRuntimeAssembly(sealInput({ kindImplementations: [] }), realSha256),
    'MISSING_KIND_IMPLEMENTATION',
  );
  assert.ok(error instanceof Error);
  assert.match(error.message, /example\.semantic-kind@1\.0\.0/);
  // Diagnostics must never serialize validator functions.
  assert.doesNotMatch(error.message, /validateComponent|function/);
});
