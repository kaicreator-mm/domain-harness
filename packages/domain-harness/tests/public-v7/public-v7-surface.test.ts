/**
 * T001E successor public surface tests (issue #551).
 *
 * The new `./v7` entry (`src/public-v7/index.ts`) is exposure-only: a
 * composition barrel that re-exports, unchanged, the five merged v0.7
 * contract modules plus the shared identity foundation types. These tests
 * pin the exact 40-name surface (15 runtime + 25 compile-time), prove the
 * legacy entries stay byte-untouched in both directions, pin historical
 * identity behavior behind `./v2`, guard the additive-only `exports` diff,
 * and prove the successor surface is functional through one deterministic
 * round trip. Compile-time fixtures live in `tests/public-v7/type-fixtures.ts`;
 * the packed-dist consumer proof lives in
 * `tests/public-v7/public-v7-portability.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as rootSurface from '../../src/index.js';
import * as v7Surface from '../../src/public-v7/index.js';
import * as v2Surface from '../../src/public-v2/index.js';
import * as v3Surface from '../../src/public-v3/index.js';
import * as v4Surface from '../../src/public-v4/index.js';
import * as workflowSurface from '../../src/workflow/index.js';
import { COMPILED_ARTIFACT_KINDS } from '../../src/contracts/domain-data.js';
import type {
  ComponentEnvelope,
} from '../../src/contracts/component.js';
import type { Sha256Port } from '../../src/contracts/identity.js';

/** The exactly-15 runtime bindings promised by the `./v7` entry. */
const V7_RUNTIME_VALUES = [
  // consts (3)
  'COMPONENT_FAMILIES',
  'COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7',
  'DEFINITION_GRAPH_DIGEST_DOMAIN',
  // functions (7)
  'validateComponentEnvelope',
  'componentSemanticDigestMaterial',
  'computeComponentSemanticDigest',
  'validateDefinitionGraphEnvelope',
  'computeDefinitionGraphDigest',
  'admitComponent',
  'validateToolComponent',
  // error classes (5)
  'ComponentContractError',
  'ComponentDigestError',
  'DefinitionGraphContractError',
  'ComponentAdmissionError',
  'ToolComponentContractError',
] as const;

const V7_RUNTIME_SORTED = [...V7_RUNTIME_VALUES].sort((left, right) =>
  left < right ? -1 : left > right ? 1 : 0,
);

const V7_FUNCTION_NAMES = new Set([
  'validateComponentEnvelope',
  'componentSemanticDigestMaterial',
  'computeComponentSemanticDigest',
  'validateDefinitionGraphEnvelope',
  'computeDefinitionGraphDigest',
  'admitComponent',
  'validateToolComponent',
]);
const V7_ERROR_NAMES = new Set([
  'ComponentContractError',
  'ComponentDigestError',
  'DefinitionGraphContractError',
  'ComponentAdmissionError',
  'ToolComponentContractError',
]);

/** Internal-only helpers that must stay unreachable from the public surface. */
const INTERNAL_HELPER_NAMES = [
  'fail',
  'requireAdmissibleEnvelopeShape',
  'canonicalizeJson',
  'computeCanonicalJsonDigest',
  'lexicalCompare',
] as const;

/** Deterministic stub Sha256Port (fnv1a) — same convention as the golden capture. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
const stubSha256: Sha256Port = {
  digestUtf8: async (value) => `fnv1a-${fnv1a(value)}`,
};

function semanticEnvelope(
  componentId: string,
  semanticBody: { threshold: number; tier: string } | { enabled: boolean },
): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: 't001e.kind.rule', version: '1.0.0' },
    requiredSemanticContracts: [{ contractId: 't001e.contract.alpha', version: '2.0.0' }],
    requiredCapabilities: [{ capabilityId: 't001e.capability.alpha', version: '1.0.0' }],
    semanticBody,
  };
}

// ---------------------------------------------------------------------------
// Pack test 8: exact surface closure (no accidental exposure) — src barrel.
// ---------------------------------------------------------------------------

test('T001E: ./v7 src barrel exposes exactly the 15 runtime names and nothing else', () => {
  const runtimeKeys = Object.keys(v7Surface).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  assert.deepEqual(runtimeKeys, V7_RUNTIME_SORTED);
});

test('T001E: internal helpers are unreachable from ./v7', () => {
  for (const helper of INTERNAL_HELPER_NAMES) {
    assert.equal(
      helper in v7Surface,
      false,
      `internal helper "${helper}" must not leak into the ./v7 surface`,
    );
  }
});

test('T001E: each of the 15 runtime bindings has the promised kind', () => {
  for (const [name, value] of Object.entries(v7Surface)) {
    if (name === 'COMPONENT_FAMILIES') {
      assert.ok(Array.isArray(value), 'COMPONENT_FAMILIES must be the frozen family tuple');
      assert.deepEqual(value, ['semantic', 'tool']);
      assert.ok(Object.isFrozen(value), 'COMPONENT_FAMILIES must be frozen');
      continue;
    }
    if (name === 'COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7' || name === 'DEFINITION_GRAPH_DIGEST_DOMAIN') {
      assert.equal(typeof value, 'string', `${name} must be a versioned domain tag string`);
      assert.ok((value as string).length > 0, `${name} must be non-empty`);
      continue;
    }
    if (V7_FUNCTION_NAMES.has(name!)) {
      assert.equal(typeof value, 'function', `${name} must be a function`);
      continue;
    }
    if (V7_ERROR_NAMES.has(name!)) {
      assert.equal(typeof value, 'function', `${name} must be an error class constructor`);
      assert.ok(
        (value as unknown as abstract new () => Error).prototype instanceof Error,
        `${name} must extend Error`,
      );
      continue;
    }
    assert.fail(`unexpected runtime binding on ./v7: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Pack test 4: root entry — additive, identity-stable.
// ---------------------------------------------------------------------------

test('T001E: root entry keeps DOMAIN_HARNESS_VERSION 0.2.0 and gains the 15 v0.7 runtime values additively', () => {
  assert.equal(rootSurface.DOMAIN_HARNESS_VERSION, '0.2.0');
  // Existing root spot symbols (mirrors tests/root-portability.test.ts).
  assert.equal(typeof rootSurface.createDomainRuntime, 'function');
  assert.equal(typeof rootSurface.StaticPackageRegistry, 'function');
  assert.equal(typeof rootSurface.createDomainRuntimeV3, 'function');
  // The additive v0.7 runtime values.
  for (const name of V7_RUNTIME_VALUES) {
    assert.ok(name in rootSurface, `root must additively expose ${name}`);
  }
  assert.deepEqual(rootSurface.COMPONENT_FAMILIES, ['semantic', 'tool']);
  assert.equal(typeof rootSurface.validateComponentEnvelope, 'function');
});

// ---------------------------------------------------------------------------
// Pack test 3: legacy subpath import surfaces unchanged, both directions.
// ---------------------------------------------------------------------------

test('T001E: legacy subpath spot symbols remain present', () => {
  assert.ok('COMPILED_ARTIFACT_KINDS' in v2Surface);
  assert.equal(typeof v2Surface.compileCompiledArtifactIdentity, 'function');
  assert.equal(typeof v3Surface.createDomainRuntimeV3, 'function');
  assert.equal(typeof v3Surface.admitCentralDecision, 'function');
  assert.ok('DAC_V0041_BASELINE' in v4Surface);
  assert.ok('DAC_V0041_ROLE_REGISTRY' in v4Surface);
  assert.equal(typeof workflowSurface.evaluateDomainPredicate, 'function');
  assert.ok(workflowSurface.PredicateContractViolation.prototype instanceof Error);
});

test('T001E: no legacy subpath namespace gains any v0.7 Component symbol (opt-in via ./v7/root only)', () => {
  const legacyNamespaces = [v2Surface, v3Surface, v4Surface, workflowSurface];
  const legacyLabels = ['./v2', './v3', './v4', './workflow'];
  for (const [label, namespace] of legacyNamespaces.map((ns, i) => [legacyLabels[i]!, ns] as const)) {
    for (const name of V7_RUNTIME_VALUES) {
      assert.equal(
        name in namespace,
        false,
        `legacy surface ${label} must not gain the v0.7 symbol ${name}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Pack test 5: COMPILED_ARTIFACT_KINDS byte-identical and same binding.
// ---------------------------------------------------------------------------

test('T001E: COMPILED_ARTIFACT_KINDS stays the closed 8-kind tuple with one shared binding', () => {
  const frozenExpectation = [
    'rule',
    'knowledge',
    'skill',
    'tool',
    'output-schema',
    'workflow',
    'promoted-subworkflow',
    'harness-config',
  ];
  assert.deepEqual(rootSurface.COMPILED_ARTIFACT_KINDS, frozenExpectation);
  assert.deepEqual(v2Surface.COMPILED_ARTIFACT_KINDS, frozenExpectation);
  // Same array binding as src/contracts/domain-data.ts (T001A-R9 pattern).
  assert.equal(rootSurface.COMPILED_ARTIFACT_KINDS, COMPILED_ARTIFACT_KINDS);
  assert.equal(v2Surface.COMPILED_ARTIFACT_KINDS, COMPILED_ARTIFACT_KINDS);
});

// ---------------------------------------------------------------------------
// Pack test 6: historical identity behavior unchanged + digest domain tags.
// ---------------------------------------------------------------------------

test('T001E: historical artifact identity via ./v2 is byte-identical to the PLANNING_BASE golden', async () => {
  const identity = await v2Surface.compileCompiledArtifactIdentity(
    {
      kind: 'rule',
      artifactId: 't001e-golden.artifact',
      version: '1.0.0',
      semanticMaterial: { tier: 'gold', threshold: 100 },
    },
    stubSha256,
  );
  // Captured from PLANNING_BASE source (8254ad99...) before mutation with the
  // same deterministic stub Sha256Port.
  assert.deepEqual(identity, {
    kind: 'rule',
    artifactId: 't001e-golden.artifact',
    version: '1.0.0',
    contentDigest: 'fnv1a-5b946e0d',
  });
});

test('T001E: historical package identity via ./v2 is byte-identical to the PLANNING_BASE golden', async () => {
  const identity = await v2Surface.compileDomainIntelligencePackageIdentity(
    {
      domainId: 't001e-golden-domain',
      version: 'v1',
      packageId: 't001e-golden-package',
      formatVersion: '1.0.0',
      runtimeContractMajor: 0,
      executionEngineMajor: 2,
      requiredCapabilities: [],
      artifacts: [],
      semanticContextProjections: [],
    },
    stubSha256,
  );
  assert.deepEqual(identity, {
    domainId: 't001e-golden-domain',
    version: 'v1',
    packageId: 't001e-golden-package',
    contentDigest: 'fnv1a-6b9a9d03',
    formatVersion: '1.0.0',
    runtimeContractMajor: 0,
    executionEngineMajor: 2,
    requiredCapabilities: [],
  });
});

test('T001E: the two v0.7 digest domain tags are pairwise-distinct frozen versioned strings', () => {
  const componentTag = v7Surface.COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7;
  const graphTag = v7Surface.DEFINITION_GRAPH_DIGEST_DOMAIN;
  assert.equal(typeof componentTag, 'string');
  assert.equal(typeof graphTag, 'string');
  assert.ok(componentTag.length > 0);
  assert.ok(graphTag.length > 0);
  assert.notEqual(componentTag, graphTag);
  assert.match(componentTag, /v0\.7/);
  assert.match(graphTag, /v1$/);
  // Domain separation from legacy artifact identity hashing at the surface
  // level: the legacy golden digests above are bare stub outputs and neither
  // v0.7 tag appears inside them.
  assert.notEqual(componentTag, 'fnv1a-5b946e0d');
  assert.notEqual(graphTag, 'fnv1a-6b9a9d03');
});

// ---------------------------------------------------------------------------
// Pack test 7: additive-only exports diff guard.
// ---------------------------------------------------------------------------

test('T001E: package.json exports diff is exactly the additive ./v7 keys; version stays 0.2.0', () => {
  const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    version: string;
    exports: Record<string, Record<string, string>>;
  };
  assert.equal(parsed.version, '0.2.0');
  // T001E added './v7'; T012-D1 bounded repair (gate #930, adjudication
  // #537@6052473158) added exactly one further additive key './v7/execution'
  // with types/import/require — no legacy target modified, none reordered.
  assert.deepEqual(Object.keys(parsed.exports), [
    '.',
    './v2',
    './workflow',
    './v3',
    './v4',
    './v7',
    './v7/execution',
  ]);
  // Pinned pre-change legacy targets (byte-identical, unmodified, unreordered).
  assert.deepEqual(parsed.exports['.'], {
    types: './dist/index.d.ts',
    import: './dist/index.js',
    require: './dist/index.js',
  });
  assert.deepEqual(parsed.exports['./v2'], {
    types: './dist/public-v2/index.d.ts',
    import: './dist/public-v2/index.js',
    require: './dist/public-v2/index.js',
  });
  assert.deepEqual(parsed.exports['./workflow'], {
    types: './dist/workflow/index.d.ts',
    import: './dist/workflow/index.js',
    require: './dist/workflow/index.js',
  });
  assert.deepEqual(parsed.exports['./v3'], {
    types: './dist/public-v3/index.d.ts',
    import: './dist/public-v3/index.js',
    require: './dist/public-v3/index.js',
  });
  assert.deepEqual(parsed.exports['./v4'], {
    types: './dist/public-v4/index.d.ts',
    import: './dist/public-v4/index.js',
    require: './dist/public-v4/index.js',
  });
  // The additive v0.7 keys (T001E ./v7; T012-D1 ./v7/execution).
  assert.deepEqual(parsed.exports['./v7'], {
    types: './dist/public-v7/index.d.ts',
    import: './dist/public-v7/index.js',
    require: './dist/public-v7/index.js',
  });
  assert.deepEqual(parsed.exports['./v7/execution'], {
    types: './dist/public-v7/execution.d.ts',
    import: './dist/public-v7/execution.js',
    require: './dist/public-v7/execution.js',
  });
});

// ---------------------------------------------------------------------------
// Pack test 9: the successor surface is functional, not just nameable.
// ---------------------------------------------------------------------------

test('T001E: deterministic semantic round trip through ./v7 only', async () => {
  const alpha = semanticEnvelope('t001e.surface.alpha', { threshold: 100, tier: 'gold' });
  v7Surface.validateComponentEnvelope(alpha);

  const material = v7Surface.componentSemanticDigestMaterial(alpha);
  assert.equal(material.digestDomain, v7Surface.COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7);

  const digest = await v7Surface.computeComponentSemanticDigest(alpha, stubSha256);
  assert.match(digest, /^fnv1a-/);

  const admission = v7Surface.admitComponent(alpha, [
    {
      kind: { kindId: 't001e.kind.rule', version: '1.0.0' },
      understoodSemanticContracts: [{ contractId: 't001e.contract.alpha', version: '2.0.0' }],
      understoodCapabilities: [{ capabilityId: 't001e.capability.alpha', version: '1.0.0' }],
      // Closed-world Kind validator: the exact Kind implementation owns
      // validation of its complete behaviorally material semanticBody.
      validateComponent: (envelope) => {
        const { threshold, tier } = envelope.semanticBody as {
          threshold: unknown;
          tier: unknown;
        };
        if (typeof threshold !== 'number' || typeof tier !== 'string') {
          throw new Error(
            't001e.kind.rule@1.0.0 material body must be { threshold: number, tier: string }',
          );
        }
      },
    },
  ]);
  assert.equal(admission.status, 'ADMITTED');
  assert.deepEqual(admission.admittedKind, { kindId: 't001e.kind.rule', version: '1.0.0' });
  assert.deepEqual(admission.admittedSemanticContracts, [
    { contractId: 't001e.contract.alpha', version: '2.0.0' },
  ]);
  assert.deepEqual(admission.admittedCapabilities, [
    { capabilityId: 't001e.capability.alpha', version: '1.0.0' },
  ]);

  const beta: ComponentEnvelope = {
    family: 'semantic',
    componentId: 't001e.surface.beta',
    kind: { kindId: 't001e.kind.rule', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { enabled: true },
  };
  v7Surface.validateComponentEnvelope(beta);

  const graph = {
    graphId: 't001e.surface.graph',
    components: [alpha, beta],
    relations: [
      {
        relationId: 't001e.rel.1',
        relationKind: 't001e.depends-on',
        sourceComponentId: 't001e.surface.alpha',
        targetComponentId: 't001e.surface.beta',
      },
    ],
  };
  v7Surface.validateDefinitionGraphEnvelope(graph);
  const graphDigest = await v7Surface.computeDefinitionGraphDigest(graph, stubSha256);
  assert.match(graphDigest, /^fnv1a-/);
  assert.ok(graphDigest.length > 0);
});

test('T001E: tool family envelope with one ToolOperationsDeclaration is accepted by validateToolComponent', () => {
  const toolEnvelope: ComponentEnvelope = {
    family: 'tool',
    componentId: 't001e.surface.tool',
    kind: { kindId: 't001e.kind.tool', version: '1.0.0' },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: 't001e.op.ping',
          inputSchema: {},
          outputSchema: {},
          effect: 'idempotent',
        },
      ],
      providesCapabilities: [],
    },
  };
  v7Surface.validateToolComponent(toolEnvelope);
  // The function is live and typed: a semantic-family envelope with the same
  // body is rejected with the frozen tool code (no new behavior asserted).
  assert.throws(
    () => v7Surface.validateToolComponent({ ...toolEnvelope, family: 'semantic' }),
    (error: unknown) => error instanceof Error && error.name === 'ToolComponentContractError',
  );
});
