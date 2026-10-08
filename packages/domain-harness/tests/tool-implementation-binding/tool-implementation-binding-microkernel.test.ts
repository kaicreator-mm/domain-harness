/**
 * T003C tests-first matrix — Microkernel / MK1B precursor group
 * (issue #607; authority #589 PACK-A T003C; campaign #586 MK1B precursor).
 *
 * Covers the PACK-A "neutral replacement implementation with
 * MICROKERNEL_SOURCE_DIFF=0" test entry:
 *  1. an arbitrary Tool implementation identity unknown to the Microkernel
 *     binds with zero kernel source edits; replacing it with another neutral
 *     identity changes Assembly identity but never Definition identity;
 *  2. no Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage
 *     concrete import exists in the new production Microkernel file, and the
 *     inward import surface is exactly the accepted generic contract set;
 *  3. the binding evidence grants no invocation, occurrence or effect
 *     authority — the Microkernel owns exact binding evidence/currentness,
 *     not concrete Tool semantics.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  type ToolImplementationCandidate,
} from '../../src/contracts/tool-implementation-binding.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { kindId: 'test.mk1b-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.neutral', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function neutralTool(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.neutral',
    kind: { kindId: 'test.mk1b-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.neutral', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [{ capabilityId: 'cap.neutral', version: '1.0.0' }],
    },
  };
}

function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.mk1b-precursor',
    components: [consumer(), neutralTool()],
    relations: [],
  };
}

function neutralCandidate(
  implementationId: string,
  implementationVersion: string,
): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId,
      implementationVersion,
      implementationDigest: `sha256:${implementationId}@${implementationVersion}-content`,
    },
    supportedOperations: ['op.neutral'],
    handle: { marker: `${implementationId}-handle` },
  };
}

test('PACK-A T003C MICROKERNEL_SOURCE_DIFF=0: a neutral Tool implementation binds with zero kernel edits; replacement changes Assembly identity only', async () => {
  const definitionGraph = graph();
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [
        {
          pin: {
            kind: { kindId: 'test.mk1b-kind', version: '1.0.0' },
            implementation: {
              implementationId: 'impl.mk1b-kind',
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
  const digest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    definitionGraph,
    { capabilityId: 'cap.neutral', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );

  const bindArgs = (candidates: readonly ToolImplementationCandidate[]) => ({
    assembly,
    selection,
    currentDefinitionGraph: definitionGraph,
    implementations: candidates,
    sha256: realSha256,
  });

  // Identities entirely unknown to the Microkernel — no kernel source edit.
  const boundV1 = await bindToolImplementation(
    bindArgs([neutralCandidate('acme.neutral-impl', '1.0.0')]),
  );
  const boundV1Repeat = await bindToolImplementation(
    bindArgs([neutralCandidate('acme.neutral-impl', '1.0.0')]),
  );
  const boundV2 = await bindToolImplementation(
    bindArgs([neutralCandidate('acme.neutral-impl', '2.0.0')]),
  );

  assert.equal(boundV1.evidence.bindingDigest, boundV1Repeat.evidence.bindingDigest);
  assert.notEqual(boundV1.evidence.bindingDigest, boundV2.evidence.bindingDigest);
  assert.notEqual(
    boundV1.successorAssembly.assemblyDigest,
    boundV2.successorAssembly.assemblyDigest,
  );

  const definitionGraphDigest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  assert.equal(boundV1.successorAssembly.record.definitionGraphDigest, definitionGraphDigest);
  assert.equal(boundV2.successorAssembly.record.definitionGraphDigest, definitionGraphDigest);

  assert.deepEqual(boundV1.implementationHandle, { marker: 'acme.neutral-impl-handle' });
  assert.deepEqual(boundV2.implementationHandle, { marker: 'acme.neutral-impl-handle' });
});

test('PACK-A T003C MICROKERNEL_SOURCE_DIFF=0: the new production Microkernel file has no forbidden concrete import', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/contracts/tool-implementation-binding.ts', import.meta.url),
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
        `tool-implementation-binding.ts must not import a forbidden concrete dependency: ${statement}`,
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

test('PACK-A T003C: binding evidence grants no invocation, occurrence or effect authority', async () => {
  const definitionGraph = graph();
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph,
      kindImplementations: [
        {
          pin: {
            kind: { kindId: 'test.mk1b-kind', version: '1.0.0' },
            implementation: {
              implementationId: 'impl.mk1b-kind',
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
  const digest = await computeDefinitionGraphDigest(definitionGraph, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    definitionGraph,
    { capabilityId: 'cap.neutral', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );

  const bound = await bindToolImplementation({
    assembly,
    selection,
    currentDefinitionGraph: definitionGraph,
    implementations: [neutralCandidate('acme.neutral-impl', '1.0.0')],
    sha256: realSha256,
  });

  assert.deepEqual(Object.keys(bound).sort(), ['evidence', 'implementationHandle', 'successorAssembly']);
  assert.equal((bound.evidence as unknown as Record<string, unknown>).occurrenceId, undefined);
  assert.equal((bound.evidence as unknown as Record<string, unknown>).effect, undefined);
  assert.equal(typeof (bound as unknown as Record<string, unknown>).invoke, 'undefined');
  assert.equal(
    JSON.stringify(bound.successorAssembly.record).includes('occurrence'),
    false,
  );
});
