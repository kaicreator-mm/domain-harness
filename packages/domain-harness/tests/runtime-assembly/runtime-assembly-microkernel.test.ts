/**
 * T002B invariant matrix — Microkernel / MK1A precursor group
 * (issues #587, #601; campaign #586).
 *
 * Covers invariants 25-28 of the #587 tests-first matrix:
 * 25. a neutral TestSemanticKindImplementation can be added/bound with
 *     MICROKERNEL_SOURCE_DIFF=0 after the generic seam exists;
 * 26. changing a neutral Kind implementation changes Assembly identity but
 *     not Definition identity;
 * 27. no Workflow/XState/ToolRegistry/SQLite/Agent/UX/AI/HTTP/Search/Storage
 *     concrete import exists in the new production Microkernel file;
 * 28. the sealed Assembly does not gain activation/effect authority merely
 *     by successful sealing.
 *
 * Also pins the §G Tool implementation-binding boundary: T002B provides a
 * generic content-addressed evidence slot only — the kernel never selects a
 * provider, chooses an implementation, inspects Tool operation semantics or
 * queries a registry, and duplicate subjects fail closed.
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
import {
  RuntimeAssemblyError,
  admitComponentWithAssembly,
  sealRuntimeAssembly,
  type AssemblyImplementationBindingEvidence,
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
    kind: { kindId: 'test.semantic.neutral', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { note: 'neutral test Kind' },
    ...overrides,
  };
}

function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.mk1a',
    components: [component('component.a')],
    relations: [],
  };
}

/**
 * A neutral test Kind implementation, defined entirely in test space: no
 * Microkernel source edit was needed to bind it (invariant 25).
 */
function neutralBinding(implementationDigest: string, counter: { calls: number }) {
  return {
    pin: {
      kind: { kindId: 'test.semantic.neutral', version: '1.0.0' },
      implementation: {
        implementationId: 'impl.test.semantic.neutral',
        implementationVersion: '1.0.0',
        implementationDigest,
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {
      counter.calls += 1;
    },
  };
}

test('#587 invariant 25/26: a neutral test Kind binds with zero kernel edits; changing it changes Assembly identity only', async () => {
  const counterV1 = { calls: 0 };
  const counterV2 = { calls: 0 };

  const sealedV1 = await sealRuntimeAssembly(
    { definitionGraph: graph(), kindImplementations: [neutralBinding('sha256:neutral-v1', counterV1)] },
    realSha256,
  );
  const sealedV1Repeat = await sealRuntimeAssembly(
    { definitionGraph: graph(), kindImplementations: [neutralBinding('sha256:neutral-v1', counterV1)] },
    realSha256,
  );
  const sealedV2 = await sealRuntimeAssembly(
    { definitionGraph: graph(), kindImplementations: [neutralBinding('sha256:neutral-v2', counterV2)] },
    realSha256,
  );

  // The neutral Kind works end to end through the sealed path.
  const evidence = await admitComponentWithAssembly(component('component.a'), sealedV1, {
    currentDefinitionGraph: graph(),
    sha256: realSha256,
  });
  assert.equal(counterV1.calls, 1);
  assert.equal(evidence.status, 'ADMITTED');

  // Determinism + replacement semantics.
  assert.equal(sealedV1.assemblyDigest, sealedV1Repeat.assemblyDigest);
  assert.notEqual(sealedV1.assemblyDigest, sealedV2.assemblyDigest);

  // Definition identity is untouched by implementation replacement (#587 §B).
  const definitionDigest = await computeDefinitionGraphDigest(graph(), realSha256);
  assert.equal(sealedV1.record.definitionGraphDigest, definitionDigest);
  assert.equal(sealedV2.record.definitionGraphDigest, definitionDigest);
});

test('#587 invariant 27: the new production Microkernel file has no forbidden concrete import', () => {
  const sourcePath = fileURLToPath(
    new URL('../../src/contracts/runtime-assembly.ts', import.meta.url),
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
        `runtime-assembly.ts must not import a forbidden concrete dependency: ${statement}`,
      );
    }
  }

  // Positive boundary: only accepted generic contract/helper modules import.
  const allowedImports = [
    './component.js',
    './component-admission.js',
    './definition-graph.js',
    './kind-compatibility.js',
    './resource-requirements.js',
    './identity.js',
    './json.js',
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

test('#587 invariant 28: sealing grants no activation, occurrence or effect authority', async () => {
  const counter = { calls: 0 };
  const sealed = await sealRuntimeAssembly(
    { definitionGraph: graph(), kindImplementations: [neutralBinding('sha256:neutral-v1', counter)] },
    realSha256,
  );

  assert.deepEqual(Object.keys(sealed).sort(), ['assemblyDigest', 'bindings', 'record']);
  assert.equal((sealed as unknown as Record<string, unknown>).activate, undefined);
  assert.equal((sealed as unknown as Record<string, unknown>).activateRuntime, undefined);
  assert.equal((sealed as unknown as Record<string, unknown>).authorityClass, undefined);
  assert.equal((sealed.record as unknown as Record<string, unknown>).activation, undefined);
  assert.equal((sealed.record as unknown as Record<string, unknown>).occurrenceId, undefined);
  assert.equal((sealed.record as unknown as Record<string, unknown>).effect, undefined);

  // ASSEMBLY_SEALED=YES, ACTIVATION_AUTHORITY=NO: admission evidence binds
  // identity material only, never execution/effect facts.
  const evidence = await admitComponentWithAssembly(component('component.a'), sealed, {
    currentDefinitionGraph: graph(),
    sha256: realSha256,
  });
  assert.deepEqual(Object.keys(evidence).sort(), [
    'admittedCapabilities',
    'admittedKind',
    'admittedKindImplementation',
    'admittedSemanticContracts',
    'assemblyDigest',
    'componentId',
    'definitionGraphDigest',
    'status',
  ]);
  assert.equal((evidence as unknown as Record<string, unknown>).occurrenceId, undefined);
  assert.equal((evidence as unknown as Record<string, unknown>).effect, undefined);
});

test('#587 §G: the Tool implementation-binding evidence slot is generic, opaque and fail-closed on duplicates', async () => {
  const counter = { calls: 0 };
  const base: SealRuntimeAssemblyInput = {
    definitionGraph: graph(),
    kindImplementations: [neutralBinding('sha256:neutral-v1', counter)],
  };

  const evidenceA: AssemblyImplementationBindingEvidence = {
    subject: 'tool.alpha',
    bindingDigest: 'sha256:binding-evidence-alpha',
  };
  const evidenceB: AssemblyImplementationBindingEvidence = {
    subject: 'tool.alpha',
    bindingDigest: 'sha256:binding-evidence-bravo',
  };

  const withoutEvidence = await sealRuntimeAssembly(base, realSha256);
  const withA = await sealRuntimeAssembly(
    { ...base, implementationBindingEvidence: [evidenceA] },
    realSha256,
  );
  const withB = await sealRuntimeAssembly(
    { ...base, implementationBindingEvidence: [evidenceB] },
    realSha256,
  );

  // The slot is part of Assembly identity, but the kernel treats it as an
  // opaque exact-identity container: it never inspects or selects on it.
  assert.notEqual(withoutEvidence.assemblyDigest, withA.assemblyDigest);
  assert.notEqual(withA.assemblyDigest, withB.assemblyDigest);
  assert.deepEqual(withA.record.implementationBindingEvidence, [
    { subject: 'tool.alpha', bindingDigest: 'sha256:binding-evidence-alpha' },
  ]);

  // Order of evidence slots is normalized away.
  const slots: AssemblyImplementationBindingEvidence[] = [
    { subject: 'tool.beta', bindingDigest: 'sha256:beta' },
    { subject: 'tool.alpha', bindingDigest: 'sha256:alpha' },
  ];
  const forward = await sealRuntimeAssembly({ ...base, implementationBindingEvidence: slots }, realSha256);
  const reversed = await sealRuntimeAssembly(
    { ...base, implementationBindingEvidence: [slots[1]!, slots[0]!] },
    realSha256,
  );
  assert.equal(forward.assemblyDigest, reversed.assemblyDigest);

  // Duplicate subject is a typed fail-closed rejection, never first-wins.
  await assert.rejects(
    sealRuntimeAssembly(
      { ...base, implementationBindingEvidence: [evidenceA, evidenceA] },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'DUPLICATE_BINDING_EVIDENCE');
      return true;
    },
  );

  // A slot carrying anything beyond exact identity is unrepresentable.
  await assert.rejects(
    sealRuntimeAssembly(
      {
        ...base,
        implementationBindingEvidence: [
          {
            subject: 'tool.alpha',
            bindingDigest: 'sha256:binding-evidence-alpha',
            provider: 'acme',
          },
        ] as unknown as AssemblyImplementationBindingEvidence[],
      },
      realSha256,
    ),
    (error: unknown) => {
      assert.ok(error instanceof RuntimeAssemblyError);
      assert.equal(error.code, 'INVALID_ASSEMBLY_INPUT');
      return true;
    },
  );
});
