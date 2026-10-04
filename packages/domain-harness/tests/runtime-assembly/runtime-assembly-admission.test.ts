/**
 * T002B invariant matrix — #575 validator provenance / immutable evidence
 * group (issues #587, #601).
 *
 * Covers invariants 9-15 of the #587 tests-first matrix:
 *  9. a raw/no-op validator supplied outside the sealed Assembly path cannot
 *     create AssemblyBoundComponentAdmission;
 * 10. Assembly-bound admission uses the validator associated with the exact
 *     sealed KindImplementation pin;
 * 11. replacing the implementation pin/validator binding makes previously
 *     minted Assembly-bound admission evidence unusable as current authority;
 * 12. mutating the original Component envelope after admission cannot alter
 *     admitted Kind/semantic/capability refs;
 * 13. mutating original implementation descriptors/pins after sealing cannot
 *     alter sealed Assembly identity/evidence;
 * 14. nested admitted refs and pin refs are fresh value objects and
 *     runtime-frozen where authority-grade;
 * 15. the existing #556 nested Tool semantic rejection stays green through
 *     the Assembly-bound admission path.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  RuntimeAssemblyError,
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type AssemblyBoundComponentAdmission,
  type KindImplementationBindingInput,
  type SealRuntimeAssemblyInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  ToolComponentContractError,
  validateToolComponent,
} from '../../src/contracts/tool-component.js';

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
    graphId: 'graph.assembly-admission',
    components: [component('component.a')],
    relations: [],
    ...overrides,
  };
}

function countingBinding(
  counter: { calls: number },
  overrides: Partial<KindImplementationBindingInput> = {},
): KindImplementationBindingInput {
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
    validateComponent: () => {
      counter.calls += 1;
    },
    ...overrides,
  };
}

async function sealedAssembly(
  counter: { calls: number },
  overrides: Partial<SealRuntimeAssemblyInput> = {},
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(
    {
      definitionGraph: graph(),
      kindImplementations: [countingBinding(counter)],
      ...overrides,
    },
    realSha256,
  );
}

const ADMISSION_GRAPH = graph();

test('#587 invariant 9: a raw/no-op validator outside the sealed Assembly path cannot mint Assembly-bound admission', async () => {
  const counter = { calls: 0 };
  const assembly = await sealedAssembly(counter);

  // A caller hand-crafts an "assembly" carrying a no-op validator and the
  // matching KindRef. The brand check fails closed before any authority use.
  const forged = {
    record: assembly.record,
    assemblyDigest: assembly.assemblyDigest,
    bindings: [
      {
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
        validateComponent: () => {
          counter.calls += 100;
        },
      },
    ],
  };

  await assert.rejects(
    admitComponentWithAssembly(component('component.a'), forged as unknown as SealedRuntimeAssembly, {
      currentDefinitionGraph: ADMISSION_GRAPH,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'INVALID_ASSEMBLY_INPUT');
      return true;
    },
  );
  assert.equal(counter.calls, 0, 'the forged no-op validator never ran');
});

test('#587 invariant 10: Assembly-bound admission invokes the validator of the exact sealed KindImplementation pin', async () => {
  const alphaCalls = { calls: 0 };
  const bravoCalls = { calls: 0 };
  const assemblyAlpha = await sealedAssembly(alphaCalls);
  const assemblyBravo = await sealRuntimeAssembly(
    {
      definitionGraph: graph(),
      kindImplementations: [
        countingBinding(bravoCalls, {
          pin: {
            kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
            implementation: {
              implementationId: 'impl.semantic-kind.bravo',
              implementationVersion: '2.0.0',
              implementationDigest: 'sha256:bravo-content',
            },
          },
        }),
      ],
    },
    realSha256,
  );

  const evidence = await admitComponentWithAssembly(component('component.a'), assemblyAlpha, {
    currentDefinitionGraph: ADMISSION_GRAPH,
    sha256: realSha256,
  });

  assert.equal(alphaCalls.calls, 1);
  assert.equal(bravoCalls.calls, 0, 'the other assembly\'s validator is never invoked');
  assert.equal(evidence.admittedKindImplementation.implementation.implementationId, 'impl.semantic-kind.alpha');

  await admitComponentWithAssembly(component('component.a'), assemblyBravo, {
    currentDefinitionGraph: ADMISSION_GRAPH,
    sha256: realSha256,
  });
  assert.equal(bravoCalls.calls, 1);
  assert.equal(alphaCalls.calls, 1, 'alpha validator untouched by the bravo admission');
});

test('#587 invariant 11: replaced implementation pin/validator binding invalidates previously minted evidence as current authority', async () => {
  const firstCalls = { calls: 0 };
  const secondCalls = { calls: 0 };
  const first = await sealedAssembly(firstCalls);
  const evidence = await admitComponentWithAssembly(component('component.a'), first, {
    currentDefinitionGraph: ADMISSION_GRAPH,
    sha256: realSha256,
  });

  const second = await sealedAssembly(secondCalls, {
    kindImplementations: [
      countingBinding(secondCalls, {
        pin: {
          kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
          implementation: {
            implementationId: 'impl.semantic-kind.alpha',
            implementationVersion: '1.0.1',
            implementationDigest: 'sha256:alpha-content-hotfix',
          },
        },
      }),
    ],
  });

  assert.notEqual(evidence.assemblyDigest, second.assemblyDigest);
  assert.notEqual(
    evidence.admittedKindImplementation.implementation.implementationDigest,
    second.bindings[0]!.pin.implementation.implementationDigest,
  );

  // The old evidence cannot serve as the assembly argument for new authority.
  await assert.rejects(
    admitComponentWithAssembly(component('component.a'), evidence as unknown as SealedRuntimeAssembly, {
      currentDefinitionGraph: ADMISSION_GRAPH,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'INVALID_ASSEMBLY_INPUT');
      return true;
    },
  );
  assert.equal(secondCalls.calls, 0);
});

test('#587 invariant 12: mutating the original Component envelope after admission cannot alter admitted refs', async () => {
  const counter = { calls: 0 };
  const assembly = await sealedAssembly(counter);
  const envelope = component('component.a');

  const evidence = await admitComponentWithAssembly(envelope, assembly, {
    currentDefinitionGraph: ADMISSION_GRAPH,
    sha256: realSha256,
  });

  const before = JSON.parse(JSON.stringify(evidence)) as AssemblyBoundComponentAdmission;
  (envelope.kind as { version: string }).version = '9.9.9';
  (envelope.requiredSemanticContracts[0] as { version: string }).version = '8.8.8';
  (envelope.requiredCapabilities[0] as { capabilityId: string }).capabilityId = 'cap.mutated';
  (envelope.semanticBody as { threshold: number }).threshold = -1;

  assert.deepEqual(
    JSON.parse(JSON.stringify(evidence)),
    before,
    'admitted evidence is a snapshot, not an alias of caller state',
  );
});

test('#587 invariant 13: mutating original pins/descriptors after sealing cannot alter sealed identity/evidence', async () => {
  const counter = { calls: 0 };
  const inputPin = {
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    implementation: {
      implementationId: 'impl.semantic-kind.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:alpha-content',
    },
  };
  const understood = [{ contractId: 'contract.a', version: '1.0.0' }];
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph: graph(),
      kindImplementations: [
        countingBinding(counter, { pin: inputPin as KindImplementationBindingInput['pin'], understoodSemanticContracts: understood }),
      ],
    },
    realSha256,
  );

  inputPin.implementation.implementationDigest = 'sha256:mutated-after-seal';
  inputPin.kind.version = '9.9.9';
  understood[0]!.version = '8.8.8';

  assert.equal(
    assembly.record.kindImplementations[0]!.implementation.implementationDigest,
    'sha256:alpha-content',
  );
  assert.deepEqual(assembly.record.kindImplementations[0]!.kind, {
    kindId: 'example.semantic-kind',
    version: '1.0.0',
  });
  assert.deepEqual(assembly.bindings[0]!.understoodSemanticContracts, [
    { contractId: 'contract.a', version: '1.0.0' },
  ]);
});

test('#587 invariant 14: admitted refs and pin refs are fresh value objects, runtime-frozen where authority-grade', async () => {
  const counter = { calls: 0 };
  const assembly = await sealedAssembly(counter);
  const envelope = component('component.a');

  const evidence = await admitComponentWithAssembly(envelope, assembly, {
    currentDefinitionGraph: ADMISSION_GRAPH,
    sha256: realSha256,
  });

  assert.notStrictEqual(evidence.admittedKind, envelope.kind);
  assert.notStrictEqual(evidence.admittedSemanticContracts[0], envelope.requiredSemanticContracts[0]);
  assert.notStrictEqual(evidence.admittedCapabilities[0], envelope.requiredCapabilities[0]);
  assert.notStrictEqual(
    evidence.admittedKindImplementation,
    assembly.record.kindImplementations[0],
  );
  assert.ok(Object.isFrozen(evidence));
  assert.ok(Object.isFrozen(evidence.admittedKind));
  assert.ok(Object.isFrozen(evidence.admittedKindImplementation));
  assert.ok(Object.isFrozen(evidence.admittedKindImplementation.kind));
  assert.ok(Object.isFrozen(evidence.admittedKindImplementation.implementation));
  assert.ok(Object.isFrozen(evidence.admittedSemanticContracts));
  assert.ok(Object.isFrozen(evidence.admittedSemanticContracts[0]));
  assert.ok(Object.isFrozen(evidence.admittedCapabilities));
  assert.ok(Object.isFrozen(evidence.admittedCapabilities[0]));
  assert.ok(Object.isFrozen(assembly.record));
  assert.ok(Object.isFrozen(assembly.record.kindImplementations));
  assert.ok(Object.isFrozen(assembly.record.kindImplementations[0]));
  assert.ok(Object.isFrozen(assembly.bindings));
  assert.ok(Object.isFrozen(assembly.bindings[0]));

  assert.throws(
    () => {
      (evidence.admittedKind as { version: string }).version = '7.7.7';
    },
    TypeError,
    'authority-grade evidence is runtime-immutable',
  );
});

test('#587 invariant 15: #556 nested Tool semantic rejection stays green through the Assembly-bound admission path', async () => {
  const toolEnvelope: ComponentEnvelope = {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'tool.standard', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: 'not-an-array-of-operations',
      providesCapabilities: [],
    },
  };
  const toolGraph: DefinitionGraphEnvelope = {
    graphId: 'graph.tool-admission',
    components: [toolEnvelope],
    relations: [],
  };
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph: toolGraph,
      kindImplementations: [
        {
          pin: {
            kind: { kindId: 'tool.standard', version: '1.0.0' },
            implementation: {
              implementationId: 'impl.tool.standard',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:tool-standard-content',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: validateToolComponent,
        },
      ],
    },
    realSha256,
  );

  await assert.rejects(
    admitComponentWithAssembly(toolEnvelope, assembly, {
      currentDefinitionGraph: toolGraph,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ToolComponentContractError);
      assert.equal(error.code, 'INVALID_TOOL_OPERATIONS');
      return true;
    },
  );
});

test('#587 admission fail-closed taxonomy: unbound exact Kind and stale current graph are typed failures', async () => {
  const counter = { calls: 0 };
  const assembly = await sealedAssembly(counter);

  // Exact Kind not bound in the sealed Assembly.
  await assert.rejects(
    admitComponentWithAssembly(
      component('component.a', { kind: { kindId: 'example.semantic-kind', version: '2.0.0' } }),
      assembly,
      { currentDefinitionGraph: ADMISSION_GRAPH, sha256: realSha256 },
    ),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND');
      return true;
    },
  );
  assert.equal(counter.calls, 0, 'no validator runs for an unbound Kind');

  // Stale/mutated current Definition graph mismatches the sealed digest.
  const staleGraph = graph({
    components: [component('component.a', { semanticBody: { threshold: 999 } })],
  });
  await assert.rejects(
    admitComponentWithAssembly(component('component.a'), assembly, {
      currentDefinitionGraph: staleGraph,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'ASSEMBLY_ADMISSION_CURRENTNESS_MISMATCH');
      return true;
    },
  );
  assert.equal(counter.calls, 0, 'no validator runs under a stale Definition graph');

  // Happy path binds both digests into the evidence.
  counter.calls = 0;
  const evidence = await admitComponentWithAssembly(component('component.a'), assembly, {
    currentDefinitionGraph: ADMISSION_GRAPH,
    sha256: realSha256,
  });
  assert.equal(counter.calls, 1);
  assert.equal(evidence.assemblyDigest, assembly.assemblyDigest);
  assert.equal(evidence.definitionGraphDigest, assembly.record.definitionGraphDigest);
});
