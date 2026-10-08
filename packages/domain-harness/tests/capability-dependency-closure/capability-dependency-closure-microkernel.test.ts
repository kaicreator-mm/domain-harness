/**
 * T003E tests-first matrix — Microkernel boundary group
 * (issue #630; authority #589 PACK-B T003E; DAG #534; bounded repair #651).
 *
 * Covers the Microkernel boundary of the repaired closure seam:
 *  1. MICROKERNEL_SOURCE_DIFF=0: arbitrary neutral Tool implementation
 *     identities close with zero kernel source edits (the caller pre-mints
 *     the dependency binding through the accepted T003C path); replacing the
 *     neutral identity changes the binding/closure digests but never the
 *     Definition identity;
 *  2. no Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage
 *     concrete import exists in the production Microkernel file, and the
 *     inward import surface is exactly the accepted generic contract set;
 *  3. #651 bounded repair proof: the production file neither imports nor uses
 *     the T003C binding mint path nor the T002B reseal container — T003E is
 *     evidence/composition-only against ONE unchanged final Assembly;
 *  4. closure evidence grants no invocation, occurrence or effect authority —
 *     T003E closes dependencies, it never invokes; the root's own
 *     implementation is intentionally not part of the closure (it is the
 *     caller's T003C concern); no successor Assembly is produced — the input
 *     final Assembly record and digest stay byte-unchanged.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import { closeCapabilityDependencies } from '../../src/contracts/capability-dependency-closure.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const KIND = { kindId: 'test.t003e-mk-kind', version: '1.0.0' } as const;

function mkGraph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t003e-mk',
    components: [
      {
        family: 'tool',
        componentId: 'tool.mk-root',
        kind: { ...KIND },
        requiredSemanticContracts: [],
        requiredCapabilities: [{ capabilityId: 'cap.neutral', version: '1.0.0' }],
        semanticBody: {
          operations: [
            { operationId: 'op.root', inputSchema: {}, outputSchema: {}, effect: 'none' },
          ],
          providesCapabilities: [],
        },
      },
      {
        family: 'tool',
        componentId: 'tool.neutral',
        kind: { ...KIND },
        requiredSemanticContracts: [],
        requiredCapabilities: [],
        semanticBody: {
          operations: [
            { operationId: 'op.neutral', inputSchema: {}, outputSchema: {}, effect: 'none' },
          ],
          providesCapabilities: [{ capabilityId: 'cap.neutral', version: '1.0.0' }],
        },
      },
    ],
    relations: [],
  };
}

function neutralCandidate(implementationId: string, version: string): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId,
      implementationVersion: version,
      implementationDigest: `sha256:${implementationId}@${version}-content`,
    },
    supportedOperations: ['op.neutral'],
    handle: { marker: `${implementationId}-handle` },
  };
}

function mkKindBinding(definitionGraph: DefinitionGraphEnvelope) {
  const understood = new Set<string>();
  const understoodCapabilities: Array<{ capabilityId: string; version: string }> = [];
  for (const component of definitionGraph.components) {
    for (const ref of component.requiredCapabilities) {
      const key = `${ref.capabilityId}@${ref.version}`;
      if (!understood.has(key)) {
        understood.add(key);
        understoodCapabilities.push({ ...ref });
      }
    }
  }
  return {
    pin: {
      kind: { ...KIND },
      implementation: {
        implementationId: 'impl.mk-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities,
    validateComponent: () => {},
  };
}

/**
 * Pre-mint the tool.neutral dependency binding through the accepted T003C
 * mint path (test-only authority setup) and return it with the resulting ONE
 * final Assembly.
 */
async function mkMintedFixture(implementationId: string, version: string) {
  const definitionGraph = mkGraph();
  const baseAssembly = await sealRuntimeAssembly(
    { definitionGraph, kindImplementations: [mkKindBinding(definitionGraph)] },
    realSha256,
  );
  const graphDigest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    definitionGraph,
    { capabilityId: 'cap.neutral', version: '1.0.0' },
    'tool.mk-root',
    graphDigest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection,
    currentDefinitionGraph: definitionGraph,
    implementations: [neutralCandidate(implementationId, version)],
    sha256: realSha256,
  });
  return {
    definitionGraph,
    baseAssembly,
    binding,
    finalAssembly: binding.successorAssembly,
  };
}

test('PACK-B T003E MICROKERNEL_SOURCE_DIFF=0: neutral implementation identities close with zero kernel edits; replacement changes binding identity only', async () => {
  const v1 = await mkMintedFixture('acme.neutral-impl', '1.0.0');
  const v1Repeat = await mkMintedFixture('acme.neutral-impl', '1.0.0');
  const v2 = await mkMintedFixture('acme.neutral-impl', '2.0.0');
  const closureArgs = (finalAssembly: typeof v1.finalAssembly, bindings: readonly SealedToolImplementationBinding[]) => ({
    assembly: finalAssembly,
    rootComponentId: 'tool.mk-root',
    currentDefinitionGraph: v1.definitionGraph,
    dependencyBindings: bindings,
    sha256: realSha256,
  });

  // Identities entirely unknown to the Microkernel — no kernel source edit.
  const closedV1 = await closeCapabilityDependencies(
    closureArgs(v1.finalAssembly, [v1.binding]),
  );
  const closedV1Repeat = await closeCapabilityDependencies(
    closureArgs(v1Repeat.finalAssembly, [v1Repeat.binding]),
  );
  const closedV2 = await closeCapabilityDependencies(
    closureArgs(v2.finalAssembly, [v2.binding]),
  );

  assert.equal(closedV1.evidence.closureDigest, closedV1Repeat.evidence.closureDigest);
  assert.notEqual(closedV1.evidence.closureDigest, closedV2.evidence.closureDigest);
  assert.equal(closedV1.evidence.assemblyDigest, v1.finalAssembly.assemblyDigest);
  assert.equal(closedV2.evidence.assemblyDigest, v2.finalAssembly.assemblyDigest);

  const definitionGraphDigest = await computeDefinitionGraphDigest(
    v1.definitionGraph,
    realSha256,
  );
  assert.equal(closedV1.evidence.definitionGraphDigest, definitionGraphDigest);
  assert.equal(closedV2.evidence.definitionGraphDigest, definitionGraphDigest);

  // The handle pairs with the exact verified pin outside every digest material.
  assert.deepEqual(closedV1.implementationHandles, [
    {
      toolComponentId: 'tool.neutral',
      implementation: {
        implementationId: 'acme.neutral-impl',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:acme.neutral-impl@1.0.0-content',
      },
      handle: { marker: 'acme.neutral-impl-handle' },
    },
  ]);
});

test('PACK-B T003E MICROKERNEL_SOURCE_DIFF=0: the production Microkernel file has no forbidden concrete import', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/contracts/capability-dependency-closure.ts', import.meta.url),
  );
  const source = readFileSync(sourcePath, 'utf8');

  const importStatements = [...source.matchAll(/import\s[^;]*?from\s+'([^']+)'/gs)].map(
    (match) => match[0],
  );

  const FORBIDDEN_PATTERNS = [
    /xstate/i,
    /workflow(?!-)/i,
    /tool[\s\-_.]*registry/i,
    /sqlite/i,
    /\bsql\b/i,
    /agent/i,
    /\bux\b/i,
    /\bai[\s\-_.]/i,
    /http/i,
    /search/i,
    /storage/i,
    /node:/,
    /compiler/i,
    /adapter/i,
    /standard[\s\-_.]*component/i,
  ];
  for (const statement of importStatements) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.doesNotMatch(
        statement,
        pattern,
        `capability-dependency-closure.ts must not import a forbidden concrete dependency: ${statement}`,
      );
    }
  }

  // Positive boundary: only accepted generic contract modules import inward.
  const allowedImports = [
    './capability-provision.js',
    './component.js',
    './definition-graph.js',
    './identity.js',
    './record-safety.js',
    './runtime-assembly.js',
    './tool-component.js',
    './tool-implementation-binding.js',
  ];
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the Microkernel seam: ${specifier}`,
    );
  }
});

test('PACK-B T003E #651: the production file never uses the T003C mint path nor the T002B reseal container', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/contracts/capability-dependency-closure.ts', import.meta.url),
  );
  const source = readFileSync(sourcePath, 'utf8');

  // T003E consumes the shared T003C consumer-verifier seam only; it must not
  // mint bindings and must not reseal the Assembly (no successor output).
  assert.equal(
    source.includes('bindToolImplementation'),
    false,
    'T003E must never import or use the T003C binding mint path',
  );
  assert.equal(
    source.includes('sealRuntimeAssembly'),
    false,
    'T003E must never import or use the T002B reseal container',
  );
});

test('PACK-B T003E: closure evidence grants no invocation, occurrence or effect authority', async () => {
  const { definitionGraph, finalAssembly, binding } = await mkMintedFixture(
    'acme.neutral-impl',
    '1.0.0',
  );

  const closed = await closeCapabilityDependencies({
    assembly: finalAssembly,
    rootComponentId: 'tool.mk-root',
    currentDefinitionGraph: definitionGraph,
    dependencyBindings: [binding],
    sha256: realSha256,
  });

  assert.deepEqual(
    Object.keys(closed).sort(),
    ['evidence', 'implementationHandles'],
  );
  const evidenceView = closed.evidence as unknown as Record<string, unknown>;
  assert.equal(evidenceView.invoke, undefined);
  assert.equal(evidenceView.occurrenceId, undefined);
  assert.equal(evidenceView.effect, undefined);
  assert.equal(JSON.stringify(closed.evidence).includes('occurrence'), false);
  // No live implementation handle or function is representable in identity.
  assert.equal(JSON.stringify(closed.evidence).includes('handle'), false);
});

test('PACK-B T003E: the closure never binds the root Tool itself and never reseals the final Assembly', async () => {
  const { definitionGraph, baseAssembly, finalAssembly, binding } = await mkMintedFixture(
    'acme.neutral-impl',
    '1.0.0',
  );
  const recordBefore = JSON.parse(JSON.stringify(finalAssembly.record));
  const baseRecordBefore = JSON.parse(JSON.stringify(baseAssembly.record));

  // The supplied binding set intentionally lacks anything for the root Tool's
  // own operations: the closure still succeeds, because the closure covers
  // exactly the tools the root requires, never the root.
  const closed = await closeCapabilityDependencies({
    assembly: finalAssembly,
    rootComponentId: 'tool.mk-root',
    currentDefinitionGraph: definitionGraph,
    dependencyBindings: [binding],
    sha256: realSha256,
  });

  assert.deepEqual(
    closed.evidence.entries.map((entry) => entry.toolComponentId),
    ['tool.neutral'],
  );
  // The final Assembly slot list is the caller's pre-minted input, unchanged.
  assert.deepEqual(
    finalAssembly.record.implementationBindingEvidence.map((slot) => slot.subject),
    ['tool.neutral'],
  );
  assert.deepEqual(finalAssembly.record, recordBefore);
  assert.deepEqual(baseAssembly.record, baseRecordBefore);
  assert.equal(closed.evidence.assemblyDigest, finalAssembly.assemblyDigest);
});
