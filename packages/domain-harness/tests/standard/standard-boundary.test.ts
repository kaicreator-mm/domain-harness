/**
 * T006A invariant matrix — no Standard bypass / Microkernel boundary
 * (issue #618, fine-grained DAG #534 T006A; authority #589 PACK-C).
 *
 * Frozen boundary under test:
 *  - NO Standard bypass for must-understand admission, exposure, capability
 *    closure, resources, activation, effects or replay;
 *  - the Microkernel seam (`contracts/runtime-assembly.ts`) imports no
 *    concrete Standard implementation and no Standard module at all;
 *  - the Standard leaf module itself exposes no admission/activation/effect/
 *    dispatch surface — classification cannot mint or shortcut authority;
 *  - a Standard-classified Component is admitted through the SAME generic
 *    sealed-Assembly path as any app Component, and its evidence is identical
 *    whether or not a Standard descriptor exists — the admission path never
 *    consults classification.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  admitComponentWithAssembly,
  sealRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import * as standardModule from '../../src/contracts/standard.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const CONTRACTS_DIR = fileURLToPath(new URL('../../src/contracts/', import.meta.url));

function component(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'component.standard-classified',
    kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { note: 'a Component some descriptor happens to classify as Standard' },
  };
}

function graph(): DefinitionGraphEnvelope {
  return { graphId: 'graph.standard-boundary', components: [component()], relations: [] };
}

async function sealedAssembly() {
  return sealRuntimeAssembly(
    {
      definitionGraph: graph(),
      kindImplementations: [
        {
          pin: {
            kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
            implementation: {
              implementationId: 'impl.example.semantic-kind',
              implementationVersion: '1.0.0',
              implementationDigest: 'sha256:neutral-content',
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
}

test('#618 boundary 1: the Microkernel seam imports no Standard module and no concrete Standard implementation', () => {
  const source = readFileSync(CONTRACTS_DIR + 'runtime-assembly.ts', 'utf8');
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
  assert.ok(imported.length > 0, 'sanity: imports were detected');

  for (const specifier of imported) {
    assert.doesNotMatch(
      specifier,
      /standard/i,
      `runtime-assembly.ts (Microkernel) must never import a Standard module: ${specifier}`,
    );
  }

  // No inline require/dynamic import of standard material either.
  assert.doesNotMatch(source, /require\([^)]*standard/i);
  assert.doesNotMatch(source, /import\([^)]*standard/i);
});

test('#618 boundary 2: the Standard leaf module exposes no admission/activation/effect/dispatch surface', () => {
  const exported = Object.keys(standardModule).sort();
  assert.ok(exported.length > 0, 'sanity: the standard module has a public surface');

  // Classification can never mint or shortcut authority: no export whose
  // name suggests admission, activation, exposure, capability closure,
  // resource resolution, effect/replay or provider dispatch.
  const FORBIDDEN_EXPORT = [
    /admit/i,
    /admission/i,
    /activat/i,
    /expos/i,
    /capabilit/i,
    /resource/i,
    /effect/i,
    /replay/i,
    /dispatch/i,
    /invok/i,
    /provid/i,
    /registr/i,
  ];
  for (const name of exported) {
    for (const pattern of FORBIDDEN_EXPORT) {
      assert.doesNotMatch(
        name,
        pattern,
        `the Standard module must not expose an authority-path export: ${name}`,
      );
    }
  }

  // Positive surface: descriptor identity, Set sealing/currentness, and the
  // deterministic fixture-construction candidate rule only.
  const EXPECTED = [
    'STANDARD_CLASSIFICATIONS',
    'STANDARD_DESCRIPTOR_DIGEST_DOMAIN',
    'STANDARD_SEMANTIC_CANDIDATE_ABSENT',
    'STANDARD_SET_DIGEST_DOMAIN',
    'STANDARD_TOOL_CANDIDATE_ABSENT',
    'StandardCandidateAbsentError',
    'StandardContractError',
    'canonicalComponentRef',
    'computeStandardDescriptorDigest',
    'sealStandardSet',
    'selectStandardBootstrapCandidate',
    'standardDescriptorIdentityMaterial',
    'validateStandardComponentDescriptor',
    'verifyStandardSetCurrentness',
  ].sort();
  assert.deepEqual(exported, EXPECTED);
});

test('#618 boundary 3: a Standard-classified Component is admitted through the SAME generic sealed-Assembly path — classification is never consulted', async () => {
  const sealed = await sealedAssembly();
  const options = { currentDefinitionGraph: graph(), sha256: realSha256 };

  // With NO descriptor anywhere near the call: ordinary admission.
  const withoutDescriptor = await admitComponentWithAssembly(component(), sealed, options);

  // With a published Standard descriptor classifying the exact Component:
  // the admission inputs are unchanged — the descriptor is not an input to
  // the admission path and cannot alter its outcome.
  const publishedDescriptor = {
    standardId: 'standard.classified-example',
    classification: 'published' as const,
    descriptorVersion: '1.0.0',
    component: {
      family: 'semantic' as const,
      componentId: 'component.standard-classified',
      kind: { kindId: 'example.semantic-kind', version: '1.0.0' },
    },
  };
  standardModule.validateStandardComponentDescriptor(publishedDescriptor);
  const withDescriptor = await admitComponentWithAssembly(component(), sealed, options);

  assert.deepEqual(withDescriptor, withoutDescriptor);
  assert.deepEqual(Object.keys(withDescriptor).sort(), [
    'admittedCapabilities',
    'admittedKind',
    'admittedKindImplementation',
    'admittedSemanticContracts',
    'assemblyDigest',
    'componentId',
    'definitionGraphDigest',
    'status',
  ]);
  // Evidence binds identity material only — no classification, no Standard
  // marker, no effect/occurrence authority.
  assert.equal(
    (withDescriptor as unknown as Record<string, unknown>).classification,
    undefined,
  );
  assert.equal((withDescriptor as unknown as Record<string, unknown>).effect, undefined);
});
