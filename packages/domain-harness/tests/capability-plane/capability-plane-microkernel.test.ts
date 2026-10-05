/**
 * T003D tests-first matrix — Microkernel boundary group
 * (issue #634; authority #589 PACK-A T003D).
 *
 * Covers the PACK-A "zero concrete host-provider imports in Microkernel"
 * test entry:
 *  1. the new production Microkernel file imports no concrete host provider,
 *     platform, registry or I/O dependency — the Host plane is pure exact-ref
 *     declaration data, consumed descriptor-safely through the shared
 *     record-safety authority, and any host capability identity (existing or
 *     future) routes through with zero Microkernel source edits;
 *  2. the inward import surface of the new module is exactly the accepted
 *     generic contract set (component / definition-graph /
 *     capability-provision / record-safety) — never v2 host profiles,
 *     registries, node builtins or adapter modules;
 *  3. the module mints no provider object, handle, registry or routing
 *     identity: Host-plane evidence is the exact frozen declared ref only.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CapabilityContractRef, ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { JsonValue } from '../../src/contracts/json.js';
import { resolveCapabilityPlane } from '../../src/contracts/capability-plane.js';

function sourceUnderTest(): string {
  const sourcePath = fileURLToPath(
    new URL('../../src/contracts/capability-plane.ts', import.meta.url),
  );
  return readFileSync(sourcePath, 'utf8');
}

test('PACK-A T003D MICROKERNEL_SOURCE_DIFF=0: the new production Microkernel file has no concrete host-provider import', () => {
  const source = sourceUnderTest();

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
    /host[\s\-_.]*profile/i,
    /targethost/i,
    /target-host/i,
    /package\.json/i,
    /\bv2\b/i,
    /\bv3\b/i,
    /\bv4\b/i,
    /standard[\s\-_.]*component/i,
    /capability[\s\-_.]*registry/i,
  ];
  for (const statement of importStatements) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.doesNotMatch(
        statement,
        pattern,
        `capability-plane.ts must not import a concrete host/provider dependency: ${statement}`,
      );
    }
  }

  // Positive boundary: only accepted generic contract modules import inward.
  const allowedImports = [
    './capability-provision.js',
    './component.js',
    './definition-graph.js',
    './record-safety.js',
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

test('PACK-A T003D: arbitrary host capability identities route with zero Microkernel source edits (no closed capability union)', () => {
  const CUSTOM: CapabilityContractRef = {
    capabilityId: 'acme.host-only-never-seen-by-kernel',
    version: '3.2.1',
  };
  const graph: DefinitionGraphEnvelope = {
    graphId: 'graph.host-identity',
    components: [
      {
        family: 'semantic',
        componentId: 'consumer.custom',
        kind: { kindId: 'test.kind', version: '1.0.0' },
        requiredSemanticContracts: [],
        requiredCapabilities: [CUSTOM],
        semanticBody: { note: 'consumer' },
      },
    ],
    relations: [],
  };

  const resolution = resolveCapabilityPlane(graph, [CUSTOM], CUSTOM);
  assert.equal(resolution.plane, 'host');
  if (resolution.plane === 'host') {
    assert.deepEqual(resolution.hostProvidedCapability, CUSTOM);
  }

  // Dual provision of the same arbitrary identity still fails closed.
  const toolComponent: ComponentEnvelope = {
    family: 'tool',
    componentId: 'acme.domain-provider',
    kind: { kindId: 'tool.acme.v1', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.custom', inputSchema: {}, outputSchema: {}, effect: 'none' },
      ],
      providesCapabilities: [CUSTOM],
    } as unknown as JsonValue,
  };
  assert.throws(
    () =>
      resolveCapabilityPlane(
        { ...graph, components: [...graph.components, toolComponent] },
        [CUSTOM],
        CUSTOM,
      ),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'CAPABILITY_PLANE_COLLISION',
  );
});

test('PACK-A T003D: the module mints no provider object, handle or routing identity — Host evidence is the exact ref only', () => {
  const source = sourceUnderTest();
  assert.doesNotMatch(source, /new\s+(Map|Set|WeakMap|WeakSet)\s*[<(]/, 'no registry material');
  assert.doesNotMatch(source, /require\(/, 'no runtime module loading');
  assert.doesNotMatch(source, /import\(/, 'no dynamic import');
});
