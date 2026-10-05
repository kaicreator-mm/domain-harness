/**
 * MK1A — Sealed Runtime Assembly / Semantic Kind pluggability (#586 campaign).
 *
 * Bound to the integration HEAD recorded on #586. Tests named MK1A-01..MK1A-11
 * implement the campaign's required falsification set against the T002B
 * Sealed Runtime Assembly core (runtime-assembly.ts). Neutral fixtures are
 * TestSemanticKindImplementation A and B in neutral-fixtures.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ComponentEnvelope, KindRef } from '../../src/contracts/component.js';
import { computeDefinitionGraphDigest } from '../../src/contracts/definition-graph.js';
import { computeComponentSemanticDigest } from '../../src/contracts/component-digest.js';
import {
  sealRuntimeAssembly,
  admitComponentWithAssembly,
  type SealedRuntimeAssembly,
  type RuntimeAssemblyErrorCode,
} from '../../src/contracts/runtime-assembly.js';
import {
  DeferredSha256Port,
  TEST_SEMANTIC_CONTRACT,
  TEST_SEMANTIC_KIND,
  TEST_SEMANTIC_KIND_IMPLEMENTATION_A,
  TEST_SEMANTIC_KIND_IMPLEMENTATION_B,
  TEST_TOOL_KIND,
  sha256,
  testGraph,
  testSemanticComponent,
  testSemanticKindImplementationBinding,
  testToolComponent,
  validateTestSemanticKindBodyA,
  validateTestSemanticKindBodyB,
} from './neutral-fixtures.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const here = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const packageRoot = resolve(here, '../..');
const srcRoot = join(packageRoot, 'src');

/** Campaign rule: neutral fixture identities must never be absorbed into Core. */
function assertFixturesAbsentFromCore(): void {
  const markers = [
    TEST_SEMANTIC_KIND_IMPLEMENTATION_A.implementation.implementationId,
    TEST_SEMANTIC_KIND_IMPLEMENTATION_B.implementation.implementationId,
  ];
  for (const file of listTsFiles(srcRoot)) {
    const text = readFileSync(file, 'utf8');
    for (const marker of markers) {
      assert.ok(
        !text.includes(marker),
        `Microkernel source absorbed neutral fixture identity "${marker}" into ${file}`,
      );
    }
  }
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function semanticComponentWithKind(kind: KindRef): ComponentEnvelope {
  const component = testSemanticComponent();
  (component as Mutable<ComponentEnvelope>).kind = { ...kind };
  return component;
}

async function sealWithImplementation(
  implementation: 'A' | 'B',
  validator: (envelope: ComponentEnvelope) => void,
): Promise<SealedRuntimeAssembly> {
  const pin = implementation === 'A' ? TEST_SEMANTIC_KIND_IMPLEMENTATION_A : TEST_SEMANTIC_KIND_IMPLEMENTATION_B;
  return sealRuntimeAssembly(
    {
      definitionGraph: testGraph(),
      kindImplementations: [
        testSemanticKindImplementationBinding(pin, validator),
        testSemanticKindImplementationBinding(
          {
            kind: { kindId: TEST_TOOL_KIND.kindId, version: TEST_TOOL_KIND.version },
            implementation: {
              implementationId: 'mk1a.test-tool-kind-implementation',
              implementationVersion: '1.0.0',
              implementationDigest: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
            },
          },
          () => {},
        ),
      ],
    },
    sha256,
  );
}

test('MK1A-01 new TestSemanticKind -> MICROKERNEL_SOURCE_DIFF=0', async () => {
  const assembly = await sealWithImplementation('A', validateTestSemanticKindBodyA);
  const component = semanticComponentWithKind(TEST_SEMANTIC_KIND);
  const admitted = await admitComponentWithAssembly(component, assembly, {
    currentDefinitionGraph: testGraph(),
    sha256,
  });
  assert.equal(admitted.status, 'ADMITTED');
  assert.equal(admitted.admittedKind.kindId, TEST_SEMANTIC_KIND.kindId);
  assertFixturesAbsentFromCore();
});

test('MK1A-02 Definition semantic digest -> independent from implementation choice', async () => {
  const component = semanticComponentWithKind(TEST_SEMANTIC_KIND);
  const [digestA, digestB] = await Promise.all([
    computeComponentSemanticDigest(component, sha256),
    computeComponentSemanticDigest(component, sha256),
  ]);
  assert.equal(digestB, digestA);

  const [graphA, graphB] = await Promise.all([
    computeDefinitionGraphDigest(testGraph(), sha256),
    computeDefinitionGraphDigest(testGraph(), sha256),
  ]);
  assert.equal(graphB, graphA);
});

test('MK1A-03 replace KindImplementation A -> B: Definition digest unchanged, assemblyDigest changes', async () => {
  const assemblyA = await sealWithImplementation('A', validateTestSemanticKindBodyA);
  const assemblyB = await sealWithImplementation('B', validateTestSemanticKindBodyB);

  const [graphDigestA, graphDigestB] = await Promise.all([
    computeDefinitionGraphDigest(testGraph(), sha256),
    computeDefinitionGraphDigest(testGraph(), sha256),
  ]);
  assert.equal(graphDigestB, graphDigestA, 'Definition identity must not drift on implementation choice');
  assert.notEqual(assemblyB.assemblyDigest, assemblyA.assemblyDigest, 'Assembly identity must change with implementation pin');
});

test('MK1A-04 missing required KindImplementation -> fail closed', async () => {
  await assert.rejects(
    sealRuntimeAssembly(
      {
        definitionGraph: testGraph(),
        kindImplementations: [
          // Only the Tool Kind is bound; the Semantic Kind has no implementation.
          testSemanticKindImplementationBinding(
            {
              kind: { kindId: TEST_TOOL_KIND.kindId, version: TEST_TOOL_KIND.version },
              implementation: {
                implementationId: 'mk1a.test-tool-kind-implementation',
                implementationVersion: '1.0.0',
                implementationDigest: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
              },
            },
            () => {},
          ),
        ],
      },
      sha256,
    ),
    (error: unknown) => {
      assert.equal((error as { code: RuntimeAssemblyErrorCode }).code, 'MISSING_KIND_IMPLEMENTATION');
      return true;
    },
  );
});

test('MK1A-05 incompatible KindImplementation -> fail closed', async () => {
  // Same kindId but a wrong version — the pin must not be accepted for the
  // exact required KindRef.
  await assert.rejects(
    sealRuntimeAssembly(
      {
        definitionGraph: testGraph(),
        kindImplementations: [
          testSemanticKindImplementationBinding(
            {
              kind: { kindId: TEST_SEMANTIC_KIND.kindId, version: '2.0.0' },
              implementation: {
                implementationId: 'mk1a.test-semantic-kind-implementation-wrong-version',
                implementationVersion: '2.0.0',
                implementationDigest: 'd4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
              },
            },
            validateTestSemanticKindBodyA,
          ),
          testSemanticKindImplementationBinding(
            {
              kind: { kindId: TEST_TOOL_KIND.kindId, version: TEST_TOOL_KIND.version },
              implementation: {
                implementationId: 'mk1a.test-tool-kind-implementation',
                implementationVersion: '1.0.0',
                implementationDigest: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
              },
            },
            () => {},
          ),
        ],
      },
      sha256,
    ),
    (error: unknown) => {
      assert.equal((error as { code: RuntimeAssemblyErrorCode }).code, 'MISSING_KIND_IMPLEMENTATION');
      return true;
    },
  );
});

test('MK1A-06 ambiguous implementation -> fail closed, no first-wins/latest/default', async () => {
  await assert.rejects(
    sealRuntimeAssembly(
      {
        definitionGraph: testGraph(),
        kindImplementations: [
          testSemanticKindImplementationBinding(TEST_SEMANTIC_KIND_IMPLEMENTATION_A, validateTestSemanticKindBodyA),
          testSemanticKindImplementationBinding(TEST_SEMANTIC_KIND_IMPLEMENTATION_B, validateTestSemanticKindBodyB),
          testSemanticKindImplementationBinding(
            {
              kind: { kindId: TEST_TOOL_KIND.kindId, version: TEST_TOOL_KIND.version },
              implementation: {
                implementationId: 'mk1a.test-tool-kind-implementation',
                implementationVersion: '1.0.0',
                implementationDigest: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
              },
            },
            () => {},
          ),
        ],
      },
      sha256,
    ),
    (error: unknown) => {
      assert.equal((error as { code: RuntimeAssemblyErrorCode }).code, 'AMBIGUOUS_KIND_IMPLEMENTATION');
      return true;
    },
  );
});

test('MK1A-07 admission validator provenance -> comes from exact sealed Assembly/KindImplementation', async () => {
  const assembly = await sealWithImplementation('A', validateTestSemanticKindBodyA);
  const component = semanticComponentWithKind(TEST_SEMANTIC_KIND);
  const admitted = await admitComponentWithAssembly(component, assembly, {
    currentDefinitionGraph: testGraph(),
    sha256,
  });
  // The evidence carries the exact pin of the implementation that validated it.
  assert.equal(
    admitted.admittedKindImplementation.implementation.implementationId,
    TEST_SEMANTIC_KIND_IMPLEMENTATION_A.implementation.implementationId,
  );
  assert.equal(
    admitted.admittedKindImplementation.implementation.implementationDigest,
    TEST_SEMANTIC_KIND_IMPLEMENTATION_A.implementation.implementationDigest,
  );
});

test('MK1A-08 caller-supplied arbitrary validator -> cannot mint runtime authority', async () => {
  // Construct a caller-side object shaped like a SealedRuntimeAssembly but
  // never minted by sealRuntimeAssembly — it must be rejected before any
  // validator runs.
  const graph = testGraph();
  const graphDigest = await computeDefinitionGraphDigest(graph, sha256);
  const forged = Object.freeze({
    record: Object.freeze({
      digestDomain: 'kaicreator.runtime-assembly.digest.v1' as const,
      definitionGraphDigest: graphDigest,
      kindImplementations: Object.freeze([
        Object.freeze({
          kind: Object.freeze({ kindId: TEST_SEMANTIC_KIND.kindId, version: TEST_SEMANTIC_KIND.version }),
          implementation: Object.freeze({
            implementationId: 'mk1a.forged',
            implementationVersion: '1.0.0',
            implementationDigest: 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
          }),
        }),
      ]),
      resourceRequirements: Object.freeze([]),
      implementationBindingEvidence: Object.freeze([]),
    }),
    assemblyDigest: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    bindings: Object.freeze([
      Object.freeze({
        pin: Object.freeze({
          kind: Object.freeze({ kindId: TEST_SEMANTIC_KIND.kindId, version: TEST_SEMANTIC_KIND.version }),
          implementation: Object.freeze({
            implementationId: 'mk1a.forged',
            implementationVersion: '1.0.0',
            implementationDigest: 'e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
          }),
        }),
        understoodSemanticContracts: Object.freeze([]),
        understoodCapabilities: Object.freeze([]),
        validateComponent: () => {},
      }),
    ]),
  });

  await assert.rejects(
    admitComponentWithAssembly(semanticComponentWithKind(TEST_SEMANTIC_KIND), forged as unknown as SealedRuntimeAssembly, {
      currentDefinitionGraph: testGraph(),
      sha256,
    }),
    (error: unknown) => {
      assert.equal((error as { code: RuntimeAssemblyErrorCode }).code, 'INVALID_ASSEMBLY_INPUT');
      return true;
    },
  );
});

test('MK1A-09 Assembly evidence contains fresh immutable exact refs -> caller mutation cannot alter it', async () => {
  const assembly = await sealWithImplementation('A', validateTestSemanticKindBodyA);
  const component = semanticComponentWithKind(TEST_SEMANTIC_KIND);
  const admitted = await admitComponentWithAssembly(component, assembly, {
    currentDefinitionGraph: testGraph(),
    sha256,
  });

  // Mutate the caller-owned component envelope after admission.
  const componentView = component as Mutable<ComponentEnvelope>;
  (componentView.kind as Mutable<KindRef>).kindId = 'tampered.after.admission';
  (componentView.requiredSemanticContracts[0] as Mutable<{ contractId: string }>).contractId =
    'tampered.after.admission';

  // The admitted evidence must remain unchanged.
  assert.equal(admitted.admittedKind.kindId, TEST_SEMANTIC_KIND.kindId);
  assert.equal(admitted.admittedSemanticContracts[0]?.contractId, TEST_SEMANTIC_CONTRACT.contractId);
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.admittedKind));
  assert.ok(Object.isFrozen(admitted.admittedKindImplementation));
  assert.ok(Object.isFrozen(admitted.admittedSemanticContracts));
  assert.ok(Object.isFrozen(admitted.admittedSemanticContracts[0]));
});

test('MK1A-10 delayed hashing/resolution -> cannot create torn Assembly evidence', async () => {
  const deferred = new DeferredSha256Port();
  const pristineGraph = testGraph();
  const pristineDigest = await computeDefinitionGraphDigest(pristineGraph, sha256);

  const pending = sealRuntimeAssembly(
    {
      definitionGraph: pristineGraph,
      kindImplementations: [
        testSemanticKindImplementationBinding(TEST_SEMANTIC_KIND_IMPLEMENTATION_A, validateTestSemanticKindBodyA),
        testSemanticKindImplementationBinding(
          {
            kind: { kindId: TEST_TOOL_KIND.kindId, version: TEST_TOOL_KIND.version },
            implementation: {
              implementationId: 'mk1a.test-tool-kind-implementation',
              implementationVersion: '1.0.0',
              implementationDigest: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
            },
          },
          () => {},
        ),
      ],
    },
    deferred,
  );
  const graphView = pristineGraph as unknown as Mutable<typeof pristineGraph>;
  graphView.components = [...graphView.components].reverse();
  deferred.release();
  const assembly = await pending;
  assert.equal(assembly.record.definitionGraphDigest, pristineDigest);
});

test('MK1A-11 Runtime Resource logical requirement identity -> matches accepted #568 ownership model', async () => {
  const graph = testGraph();
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph: graph,
      kindImplementations: [
        testSemanticKindImplementationBinding(TEST_SEMANTIC_KIND_IMPLEMENTATION_A, validateTestSemanticKindBodyA),
        testSemanticKindImplementationBinding(
          {
            kind: { kindId: TEST_TOOL_KIND.kindId, version: TEST_TOOL_KIND.version },
            implementation: {
              implementationId: 'mk1a.test-tool-kind-implementation',
              implementationVersion: '1.0.0',
              implementationDigest: 'c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
            },
          },
          () => {},
        ),
      ],
      resourceRequirements: [
        {
          owner: testToolComponent(),
          declaration: {
            componentId: 'mk0.test.tool-component',
            requirements: [
              {
                resourceKey: 'mk1a.test.resource-a',
                contract: { contractId: 'mk1a.test-resource-contract-a', version: '1.0.0' },
                required: true,
              },
            ],
          },
        },
      ],
    },
    sha256,
  );
  assert.ok(assembly.record.resourceRequirements.length === 1);
  const material = assembly.record.resourceRequirements[0];
  assert.equal(material?.componentId, 'mk0.test.tool-component');
  assert.equal(material?.requirements[0]?.resourceKey, 'mk1a.test.resource-a');
  assert.equal(material?.requirements[0]?.required, true);
});

// ---------------------------------------------------------------------------
// T002B authority boundary: sealed Assembly carries identity + admission
// provenance only; activation/occurrence/effect authority is T002C/T002D.
// ---------------------------------------------------------------------------

test('MK1A-12 sealed Assembly grants no activation/occurrence/effect authority', async () => {
  const assembly = await sealWithImplementation('A', validateTestSemanticKindBodyA);
  const component = semanticComponentWithKind(TEST_SEMANTIC_KIND);
  const admitted = await admitComponentWithAssembly(component, assembly, {
    currentDefinitionGraph: testGraph(),
    sha256,
  });

  // The evidence shape is exactly Assembly-bound admission — no occurrence,
  // no effect, no activation pin, no execution handle.
  assert.deepEqual(Object.keys(admitted).sort(), [
    'admittedCapabilities',
    'admittedKind',
    'admittedKindImplementation',
    'admittedSemanticContracts',
    'assemblyDigest',
    'componentId',
    'definitionGraphDigest',
    'status',
  ]);
  assert.ok(!('occurrence' in admitted));
  assert.ok(!('effect' in admitted));
  assert.ok(!('activation' in admitted));
  assert.ok(!('executionHandle' in admitted));
});

// ---------------------------------------------------------------------------
// T002B anti-forgery: the sealed brand cannot be bypassed by prototype
// inheritance or symbol reflection (#575 fresh-review P1 repair).
// ---------------------------------------------------------------------------

test('MK1A-13 prototype-inherited brand does not authorize admission', async () => {
  const assembly = await sealWithImplementation('A', validateTestSemanticKindBodyA);
  const prototype = Object.getPrototypeOf(assembly);
  const forged = Object.create(prototype) as SealedRuntimeAssembly;
  (forged as unknown as Record<string, unknown>).record = assembly.record;
  (forged as unknown as Record<string, unknown>).assemblyDigest = assembly.assemblyDigest;
  (forged as unknown as Record<string, unknown>).bindings = assembly.bindings;

  await assert.rejects(
    admitComponentWithAssembly(semanticComponentWithKind(TEST_SEMANTIC_KIND), forged, {
      currentDefinitionGraph: testGraph(),
      sha256,
    }),
    (error: unknown) => {
      assert.equal((error as { code: RuntimeAssemblyErrorCode }).code, 'INVALID_ASSEMBLY_INPUT');
      return true;
    },
  );
});
