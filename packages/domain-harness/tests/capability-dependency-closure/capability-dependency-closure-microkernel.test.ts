/**
 * T003E tests-first matrix — Microkernel boundary group
 * (issue #630; authority #589 PACK-B T003E; DAG #534).
 *
 * Covers the Microkernel boundary of the closure seam:
 *  1. MICROKERNEL_SOURCE_DIFF=0: arbitrary neutral Tool implementation
 *     identities close with zero kernel source edits; replacing a neutral
 *     identity changes Assembly identity but never Definition identity;
 *  2. no Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage
 *     concrete import exists in the new production Microkernel file, and the
 *     inward import surface is exactly the accepted generic contract set;
 *  3. closure evidence grants no invocation, occurrence or effect authority —
 *     T003E closes dependencies, it never invokes; the root's own
 *     implementation is intentionally not part of the closure (it is the
 *     caller's/admission's T003C concern).
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
import { sealRuntimeAssembly } from '../../src/contracts/runtime-assembly.js';
import { closeCapabilityDependencies } from '../../src/contracts/capability-dependency-closure.js';
import type { ToolImplementationCandidate } from '../../src/contracts/tool-implementation-binding.js';

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

test('PACK-B T003E MICROKERNEL_SOURCE_DIFF=0: neutral implementation identities close with zero kernel edits; replacement changes Assembly identity only', async () => {
  const definitionGraph = mkGraph();
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [
        {
          pin: {
            kind: { ...KIND },
            implementation: {
              implementationId: 'impl.mk-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:kind-impl',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {},
        },
      ],
    },
    realSha256,
  );
  const closureArgs = (candidates: readonly ToolImplementationCandidate[]) => ({
    assembly,
    rootComponentId: 'tool.mk-root',
    currentDefinitionGraph: definitionGraph,
    implementations: candidates,
    sha256: realSha256,
  });

  // Identities entirely unknown to the Microkernel — no kernel source edit.
  const closedV1 = await closeCapabilityDependencies(
    closureArgs([neutralCandidate('acme.neutral-impl', '1.0.0')]),
  );
  const closedV1Repeat = await closeCapabilityDependencies(
    closureArgs([neutralCandidate('acme.neutral-impl', '1.0.0')]),
  );
  const closedV2 = await closeCapabilityDependencies(
    closureArgs([neutralCandidate('acme.neutral-impl', '2.0.0')]),
  );

  assert.equal(closedV1.evidence.closureDigest, closedV1Repeat.evidence.closureDigest);
  assert.notEqual(closedV1.evidence.closureDigest, closedV2.evidence.closureDigest);
  assert.notEqual(
    closedV1.successorAssembly.assemblyDigest,
    closedV2.successorAssembly.assemblyDigest,
  );

  const definitionGraphDigest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  assert.equal(closedV1.evidence.definitionGraphDigest, definitionGraphDigest);
  assert.equal(closedV2.evidence.definitionGraphDigest, definitionGraphDigest);
  assert.equal(closedV1.successorAssembly.record.definitionGraphDigest, definitionGraphDigest);

  // The handle pairs with the exact pin outside every digest material.
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

test('PACK-B T003E MICROKERNEL_SOURCE_DIFF=0: the new production Microkernel file has no forbidden concrete import', () => {
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

test('PACK-B T003E: closure evidence grants no invocation, occurrence or effect authority', async () => {
  const definitionGraph = mkGraph();
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [
        {
          pin: {
            kind: { ...KIND },
            implementation: {
              implementationId: 'impl.mk-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:kind-impl',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {},
        },
      ],
    },
    realSha256,
  );

  const closed = await closeCapabilityDependencies({
    assembly,
    rootComponentId: 'tool.mk-root',
    currentDefinitionGraph: definitionGraph,
    implementations: [neutralCandidate('acme.neutral-impl', '1.0.0')],
    sha256: realSha256,
  });

  assert.deepEqual(
    Object.keys(closed).sort(),
    ['evidence', 'implementationHandles', 'successorAssembly'],
  );
  const evidenceView = closed.evidence as unknown as Record<string, unknown>;
  assert.equal(evidenceView.invoke, undefined);
  assert.equal(evidenceView.occurrenceId, undefined);
  assert.equal(evidenceView.effect, undefined);
  assert.equal(JSON.stringify(closed.evidence).includes('occurrence'), false);
  // No live implementation handle or function is representable in identity.
  assert.equal(JSON.stringify(closed.evidence).includes('handle'), false);
});

test('PACK-B T003E: the closure never binds the root Tool itself — the root binding stays a T003C caller concern', async () => {
  const definitionGraph = mkGraph();
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [
        {
          pin: {
            kind: { ...KIND },
            implementation: {
              implementationId: 'impl.mk-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:kind-impl',
            },
          },
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => {},
        },
      ],
    },
    realSha256,
  );

  // The offered candidate set intentionally lacks an implementation for the
  // root Tool's own operations: the closure still succeeds, because the
  // closure covers exactly the tools the root requires, never the root.
  const closed = await closeCapabilityDependencies({
    assembly,
    rootComponentId: 'tool.mk-root',
    currentDefinitionGraph: definitionGraph,
    implementations: [neutralCandidate('acme.neutral-impl', '1.0.0')],
    sha256: realSha256,
  });

  assert.deepEqual(
    closed.evidence.entries.map((entry) => entry.toolComponentId),
    ['tool.neutral'],
  );
  assert.deepEqual(
    closed.successorAssembly.record.implementationBindingEvidence.map((slot) => slot.subject),
    ['tool.neutral'],
  );
});
