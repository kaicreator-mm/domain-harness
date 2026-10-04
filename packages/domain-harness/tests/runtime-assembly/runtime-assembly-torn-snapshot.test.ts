/**
 * T002B invariant matrix — Async / TOCTOU / descriptor-safety group
 * (issues #587, #601; discipline per #555 and #557/#578).
 *
 * Covers invariants 22-24 of the #587 tests-first matrix:
 * 22. a delayed/hostile Sha256Port while the caller mutates the graph,
 *     KindImplementation input or resource requirement input cannot create
 *     torn/hybrid Assembly evidence;
 * 23. authority-bearing caller input is synchronously snapshotted before the
 *     first `await`; nothing caller-owned is re-read after suspension;
 * 24. accessor/symbol/non-enumerable/custom-prototype hostile inputs follow
 *     the accepted #557/#578 descriptor-safe contract and fail closed before
 *     authority use.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  RuntimeAssemblyError,
  sealRuntimeAssembly,
  type SealRuntimeAssemblyInput,
} from '../../src/contracts/runtime-assembly.js';
import type {
  ToolResourceRequirement,
  ToolResourceRequirementsDeclaration,
} from '../../src/contracts/resource-requirements.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

type MutableGraph = {
  -readonly [K in keyof DefinitionGraphEnvelope]: DefinitionGraphEnvelope[K] extends readonly (infer T)[]
    ? T[]
    : DefinitionGraphEnvelope[K];
};
type MutableComponent = { -readonly [K in keyof ComponentEnvelope]: ComponentEnvelope[K] };

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

function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.torn-assembly',
    components: [component('component.a')],
    relations: [],
  };
}

function bindingInput() {
  return {
    pin: {
      kind: { kindId: 'example.semantic-kind', version: '1.0.0' } as { kindId: string; version: string },
      implementation: {
        implementationId: 'impl.semantic-kind.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:alpha-content',
      } as Record<string, string>,
    } as Record<string, unknown>,
    understoodSemanticContracts: [{ contractId: 'contract.a', version: '1.0.0' }],
    understoodCapabilities: [{ capabilityId: 'cap.a', version: '1.0.0' }],
    validateComponent: () => {},
  } as Record<string, unknown>;
}

function resourceBinding() {
  const owner: ComponentEnvelope = {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { kindId: 'tool.standard', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.read', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [],
    },
  };
  return {
    owner,
    declaration: {
      componentId: 'tool.alpha',
      requirements: [
        {
          resourceKey: 'resource.alpha',
          contract: { contractId: 'resource.alpha.contract', version: '1.0.0' },
          operationId: 'op.read',
          required: true,
        },
      ] as ToolResourceRequirement[],
    } as ToolResourceRequirementsDeclaration,
  };
}

type MutableSealInput = {
  definitionGraph: MutableGraph;
  kindImplementations: Array<Record<string, unknown>>;
  resourceRequirements: Array<{
    owner: ComponentEnvelope;
    declaration: ToolResourceRequirementsDeclaration;
  }>;
};

function sealInput(): MutableSealInput {
  return {
    definitionGraph: graph() as unknown as MutableGraph,
    kindImplementations: [bindingInput()],
    resourceRequirements: [resourceBinding()],
  };
}

function asSealInput(input: MutableSealInput): SealRuntimeAssemblyInput {
  return input as unknown as SealRuntimeAssemblyInput;
}

/**
 * Sha256Port that synchronously invokes `mutate` inside the digestUtf8 call
 * at zero-based index `callIndex` — while that digest promise is still
 * pending and the caller is legitimately touching its own inputs.
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

test('#587 invariant 22/23: caller mutation of graph, bindings and resources during a pending digest cannot tear Assembly evidence', async () => {
  const victim = sealInput();
  const untouched = sealInput();

  // Call 0 is the first (only) Component digest inside
  // computeDefinitionGraphDigest — the earliest possible suspension. Mutate
  // EVERY caller-owned authority input at that point.
  const adversarial = mutationSha256(0, () => {
    (victim.definitionGraph as MutableGraph).graphId = 'graph.mutated-mid-seal';
    (victim.definitionGraph.components[0] as MutableComponent).semanticBody = { threshold: 999 };
    const pin = victim.kindImplementations[0]!.pin as unknown as {
      kind: { version: string };
      implementation: Record<string, string>;
    };
    pin.implementation.implementationDigest = 'sha256:mutated-mid-seal';
    (victim.kindImplementations[0]!.understoodSemanticContracts as unknown as Array<{ version: string }>)[0]!.version = '8.8.8';
    const requirement = (
      (victim.resourceRequirements![0]!.declaration as unknown as { requirements: Array<Record<string, unknown>> })
        .requirements[0]!
    );
    requirement.resourceKey = 'resource.mutated-mid-seal';
    requirement.required = false;
  });

  const sealed = await sealRuntimeAssembly(asSealInput(victim), adversarial);
  const expected = await sealRuntimeAssembly(asSealInput(untouched), realSha256);

  assert.equal(sealed.assemblyDigest, expected.assemblyDigest);
  assert.deepEqual(sealed.record, expected.record);

  // Prove the mutations were real: a fresh seal of the mutated inputs differs.
  const mutatedSeal = await sealRuntimeAssembly(asSealInput(victim), realSha256);
  assert.notEqual(mutatedSeal.assemblyDigest, sealed.assemblyDigest);
});

test('#587 invariant 22: mutation during the Assembly material digest cannot re-read caller inputs after suspension', async () => {
  const victim = sealInput();
  const untouched = sealInput();

  // Call 1 is the Assembly-level material digest (after the graph digest at
  // call 0). Wreck every input; the pre-suspension snapshot must win.
  const adversarial = mutationSha256(1, () => {
    (victim.definitionGraph as MutableGraph).components.length = 0;
    victim.kindImplementations.length = 0;
    victim.resourceRequirements = [];
  });

  const sealed = await sealRuntimeAssembly(asSealInput(victim), adversarial);
  const expected = await sealRuntimeAssembly(asSealInput(untouched), realSha256);

  assert.equal(sealed.assemblyDigest, expected.assemblyDigest);
  assert.equal(sealed.record.kindImplementations.length, 1);
  assert.equal(sealed.record.resourceRequirements.length, 1);
});

test('#587 invariant 24: accessor-backed hostile inputs fail closed before authority use (no getter executes)', async () => {
  let getterCalls = 0;

  // A binding input whose pin is accessor-backed.
  const accessorBinding = {
    get pin() {
      getterCalls += 1;
      return {
        kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
        implementation: {
          implementationId: 'impl.semantic-kind.alpha',
          implementationVersion: '1.0.0',
          implementationDigest: 'sha256:alpha-content',
        },
      };
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };

  await assert.rejects(
    sealRuntimeAssembly(
      { definitionGraph: graph(), kindImplementations: [accessorBinding] },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'INVALID_ASSEMBLY_INPUT');
      return true;
    },
  );
  assert.equal(getterCalls, 0, 'descriptor-safe validation never executes the getter');
});

test('#587 invariant 24: symbol-keyed, non-enumerable and custom-prototype inputs are typed rejections', async () => {
  const hostileSymbol = bindingInput();
  Object.defineProperty(hostileSymbol, Symbol('hidden'), { value: true, enumerable: false });
  await assert.rejects(
    sealRuntimeAssembly(asSealInput({ definitionGraph: graph() as unknown as MutableGraph, kindImplementations: [hostileSymbol], resourceRequirements: [] }), realSha256),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'INVALID_ASSEMBLY_INPUT');
      return true;
    },
  );

  const hostileHidden = bindingInput();
  Object.defineProperty(hostileHidden, 'hidden', { value: true, enumerable: false });
  await assert.rejects(
    sealRuntimeAssembly(asSealInput({ definitionGraph: graph() as unknown as MutableGraph, kindImplementations: [hostileHidden], resourceRequirements: [] }), realSha256),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'INVALID_ASSEMBLY_INPUT');
      return true;
    },
  );

  class CustomBinding {
    readonly pin = {
      kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.semantic-kind.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:alpha-content',
      },
    };
    readonly understoodSemanticContracts: never[] = [];
    readonly understoodCapabilities: never[] = [];
    validateComponent(): void {}
  }
  await assert.rejects(
    sealRuntimeAssembly(asSealInput({ definitionGraph: graph() as unknown as MutableGraph, kindImplementations: [new CustomBinding() as unknown as Record<string, unknown>], resourceRequirements: [] }), realSha256),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'INVALID_ASSEMBLY_INPUT');
      return true;
    },
  );

  // A hostile Definition graph envelope is rejected by the existing #557/#578
  // contract and propagates unchanged before any authority use.
  const hostileGraph = graph() as unknown as Record<string, unknown>;
  Object.defineProperty(hostileGraph, 'evil', { get() { throw new Error('must not execute'); }, enumerable: true });
  await assert.rejects(
    sealRuntimeAssembly(
      asSealInput({
        definitionGraph: hostileGraph as unknown as MutableGraph,
        kindImplementations: [bindingInput()],
        resourceRequirements: [],
      }),
      realSha256,
    ),
    (error: unknown) => {
      assert.equal((error as { name?: string }).name, 'DefinitionGraphContractError');
      return true;
    },
  );
});
