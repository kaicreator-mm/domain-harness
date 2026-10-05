/**
 * T003C tests-first matrix — Async / TOCTOU / descriptor-safety group
 * (issue #607; authority #589 PACK-A T003C; discipline per #555 and
 * #557/#578, same as the T002B torn-snapshot matrix).
 *
 * Covers the PACK-A "input mutation / async TOCTOU resistance" test entry:
 *  1. a delayed/hostile Sha256Port while the caller mutates the graph, the
 *     selection, the candidate implementations and the exact pin cannot
 *     create torn/hybrid binding evidence or a torn successor Assembly;
 *  2. every authority-bearing caller input is synchronously snapshotted
 *     before the first `await`; nothing caller-owned is re-read after
 *     suspension;
 *  3. caller mutation of any input AFTER a completed binding cannot alter
 *     the minted evidence or the successor Assembly;
 *  4. accessor/symbol-keyed/non-enumerable/custom-prototype hostile inputs
 *     follow the accepted #557/#578 descriptor-safe contract and fail closed
 *     before any authority use, with no hidden getter executing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type BindToolImplementationInput,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';

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

function toolComponent(): ComponentEnvelope {
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
  };
}

function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t003c-torn',
    components: [consumer(), toolComponent()],
    relations: [],
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

function candidate(): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId: 'impl.calc.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl.calc.alpha-content',
    },
    supportedOperations: ['op.add', 'op.sub'],
  };
}

type MutableBindInput = {
  assembly: BindToolImplementationInput['assembly'];
  selection: Record<string, unknown>;
  currentDefinitionGraph: MutableGraph;
  implementations: Array<Record<string, unknown>>;
  exactPin?: Record<string, string>;
  sha256: Sha256Port;
};

async function mutableFixture() {
  const definitionGraph = graph();
  const assembly = await sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [kindBinding()] },
    realSha256,
  );
  const digest = await computeGraphDigest(definitionGraph);
  const selection = await resolveCurrentCapabilityProvider(
    definitionGraph,
    { capabilityId: 'cap.calc', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );
  const input: MutableBindInput = {
    assembly,
    // A fresh MUTABLE copy: the minted selection evidence is frozen, and the
    // TOCTOU mutations below must be able to touch the caller's own input.
    selection: JSON.parse(JSON.stringify(selection)) as Record<string, unknown>,
    currentDefinitionGraph: definitionGraph as unknown as MutableGraph,
    implementations: [candidate() as unknown as Record<string, unknown>],
    sha256: realSha256,
  };
  return input;
}

async function computeGraphDigest(definitionGraph: DefinitionGraphEnvelope): Promise<string> {
  const { computeDefinitionGraphDigest } = await import('../../src/contracts/definition-graph.js');
  return computeDefinitionGraphDigest(definitionGraph, realSha256);
}

function asBindInput(input: MutableBindInput): BindToolImplementationInput {
  return input as unknown as BindToolImplementationInput;
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

test('PACK-A T003C TOCTOU 1/2: caller mutation of graph, selection, candidates and exact pin during the first pending digest cannot tear binding evidence', async () => {
  const victim = await mutableFixture();
  const untouched = await mutableFixture();
  victim.exactPin = {
    implementationId: 'impl.calc.alpha',
    implementationVersion: '1.0.0',
    implementationDigest: 'sha256:impl.calc.alpha-content',
  };
  untouched.exactPin = { ...victim.exactPin };

  // Call 0 is the first digest of computeDefinitionGraphDigest — the earliest
  // possible suspension. Wreck EVERY caller-owned authority input there.
  const adversarial = mutationSha256(0, () => {
    (victim.currentDefinitionGraph as MutableGraph).graphId = 'graph.mutated-mid-bind';
    (victim.currentDefinitionGraph.components[0] as MutableComponent).semanticBody = {
      note: 'mutated',
    };
    (victim.selection as { provider: { componentId: string } }).provider.componentId = 'tool.hacked';
    (victim.selection as { definitionGraphDigest: string }).definitionGraphDigest = 'sha256:hacked';
    const impl = victim.implementations[0] as unknown as {
      implementation: Record<string, string>;
      supportedOperations: string[];
    };
    impl.implementation.implementationId = 'impl.hacked';
    impl.supportedOperations.length = 0;
    victim.exactPin = {
      implementationId: 'impl.hacked',
      implementationVersion: '9.9.9',
      implementationDigest: 'sha256:hacked',
    };
  });

  const bound = await bindToolImplementation({ ...asBindInput(victim), sha256: adversarial });
  const expected = await bindToolImplementation(asBindInput(untouched));

  assert.equal(bound.evidence.bindingDigest, expected.evidence.bindingDigest);
  assert.deepEqual(bound.evidence, expected.evidence);
  assert.equal(bound.successorAssembly.assemblyDigest, expected.successorAssembly.assemblyDigest);

  // Prove the mutations were real: re-binding the mutated inputs fails closed.
  await assert.rejects(
    bindToolImplementation(asBindInput(victim)),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { name?: string }).name, 'ToolImplementationBindingError');
      return true;
    },
  );
});

test('PACK-A T003C TOCTOU 2: mutation during a later digest call still cannot re-read caller inputs after suspension', async () => {
  const victim = await mutableFixture();
  const untouched = await mutableFixture();

  // Call 2 is past the graph-digest suspension, inside the evidence digest
  // work — the module must still consume only its own snapshots.
  const adversarial = mutationSha256(2, () => {
    (victim.currentDefinitionGraph.components as unknown[]).length = 0;
    victim.implementations.length = 0;
    (victim.selection as { graphId: string }).graphId = 'graph.wrecked';
  });

  const bound = await bindToolImplementation({ ...asBindInput(victim), sha256: adversarial });
  const expected = await bindToolImplementation(asBindInput(untouched));

  assert.equal(bound.evidence.bindingDigest, expected.evidence.bindingDigest);
  assert.deepEqual(bound.evidence.toolComponentId, expected.evidence.toolComponentId);
  assert.equal(bound.successorAssembly.assemblyDigest, expected.successorAssembly.assemblyDigest);
});

test('PACK-A T003C TOCTOU 3: caller mutation of any input after a completed binding changes nothing', async () => {
  const input = await mutableFixture();
  const bound = await bindToolImplementation(asBindInput(input));
  const evidenceSnapshot = JSON.parse(JSON.stringify(bound.evidence));
  const successorSnapshot = JSON.parse(JSON.stringify(bound.successorAssembly.record));

  (input.currentDefinitionGraph.components[0] as MutableComponent).componentId = 'consumer.hacked';
  (input.currentDefinitionGraph as MutableGraph).graphId = 'graph.hacked';
  (input.selection as { provider: { componentId: string } }).provider.componentId = 'tool.hacked';
  (input.implementations[0] as unknown as { implementation: { implementationDigest: string } })
    .implementation.implementationDigest = 'sha256:hacked';
  input.implementations.push(candidate() as unknown as Record<string, unknown>);

  assert.deepEqual(bound.evidence, evidenceSnapshot);
  assert.deepEqual(bound.successorAssembly.record, successorSnapshot);
});

test('PACK-A T003C TOCTOU 4: accessor-backed candidates/selection fail closed with zero getter executions', async () => {
  const input = await mutableFixture();

  let candidateGetterCalls = 0;
  const accessorCandidate = {
    get implementation() {
      candidateGetterCalls += 1;
      return {
        implementationId: 'impl.calc.alpha',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:impl.calc.alpha-content',
      };
    },
    supportedOperations: ['op.add', 'op.sub'],
  };

  await assert.rejects(
    bindToolImplementation({
      ...asBindInput(input),
      implementations: [accessorCandidate],
    }),
    (error: unknown) => {
      assert.equal((error as { name?: string }).name, 'ToolImplementationBindingError');
      assert.equal((error as { code?: string }).code, 'INVALID_BINDING_INPUT');
      return true;
    },
  );
  assert.equal(candidateGetterCalls, 0, 'descriptor-safe validation never executes the getter');

  let selectionGetterCalls = 0;
  const accessorSelection = {
    get provider() {
      selectionGetterCalls += 1;
      return {
        componentId: 'tool.alpha',
        family: 'tool',
        providesCapability: { capabilityId: 'cap.calc', version: '1.0.0' },
      };
    },
    graphId: 'graph.t003c-torn',
    definitionGraphDigest: 'sha256:x',
    requiredCapability: { capabilityId: 'cap.calc', version: '1.0.0' },
    consumer: {
      componentId: 'consumer.a',
      requiredCapability: { capabilityId: 'cap.calc', version: '1.0.0' },
    },
  };

  await assert.rejects(
    bindToolImplementation({
      ...asBindInput(input),
      selection: accessorSelection as unknown as BindToolImplementationInput['selection'],
    }),
    (error: unknown) => {
      assert.equal((error as { name?: string }).name, 'ToolImplementationBindingError');
      assert.equal((error as { code?: string }).code, 'INVALID_BINDING_INPUT');
      return true;
    },
  );
  assert.equal(selectionGetterCalls, 0);
});

test('PACK-A T003C TOCTOU 4: symbol-keyed, non-enumerable and custom-prototype candidate inputs are typed rejections', async () => {
  const input = await mutableFixture();

  const hostileSymbol = candidate() as unknown as Record<string, unknown>;
  Object.defineProperty(hostileSymbol, Symbol('hidden'), { value: true, enumerable: false });
  await assert.rejects(
    bindToolImplementation({ ...asBindInput(input), implementations: [hostileSymbol as unknown as ToolImplementationCandidate] }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_BINDING_INPUT');
      return true;
    },
  );

  const hostileHidden = candidate() as unknown as Record<string, unknown>;
  Object.defineProperty(hostileHidden, 'hidden', { value: true, enumerable: false });
  await assert.rejects(
    bindToolImplementation({ ...asBindInput(input), implementations: [hostileHidden as unknown as ToolImplementationCandidate] }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_BINDING_INPUT');
      return true;
    },
  );

  class CustomCandidate {
    readonly implementation = {
      implementationId: 'impl.calc.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: 'sha256:impl.calc.alpha-content',
    };
    readonly supportedOperations = ['op.add', 'op.sub'];
  }
  await assert.rejects(
    bindToolImplementation({
      ...asBindInput(input),
      implementations: [new CustomCandidate() as unknown as ToolImplementationCandidate],
    }),
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'INVALID_BINDING_INPUT');
      return true;
    },
  );
});
