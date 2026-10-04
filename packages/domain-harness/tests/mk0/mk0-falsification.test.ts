/**
 * MK0 — Microkernel foundation falsification (#586 campaign, preflight).
 *
 * Bound to the integration HEAD recorded on #586. Tests named MK0-01..MK0-12
 * implement the campaign's required falsification set against the neutral
 * fixtures in `neutral-fixtures.ts`. Tests named KNOWN-* CONFIRM a defect that
 * is already tracked by a durable open finding at this HEAD; they assert the
 * defective behavior so the campaign re-run flips them when the corresponding
 * repair merge lands (they are expectation probes, not regressions to keep).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  KindRef,
  SemanticContractRef,
} from '../../src/contracts/component.js';
import { validateComponentEnvelope } from '../../src/contracts/component.js';
import { computeComponentSemanticDigest } from '../../src/contracts/component-digest.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import { admitComponent, type UnderstoodKindSet } from '../../src/contracts/component-admission.js';
import { validateToolComponent } from '../../src/contracts/tool-component.js';
import { decideKindCompatibility } from '../../src/contracts/kind-compatibility.js';
import {
  CapabilityProvisionContractError,
  selectCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import {
  DeferredSha256Port,
  TEST_CAPABILITY,
  TEST_SECOND_CAPABILITY,
  TEST_SECOND_SEMANTIC_CONTRACT,
  TEST_SEMANTIC_CONTRACT,
  TEST_SEMANTIC_KIND,
  TEST_TOOL_KIND,
  sha256,
  testGraph,
  testSemanticComponent,
  testToolComponent,
  testUnderstoodKinds,
} from './neutral-fixtures.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '../..');
const srcRoot = join(packageRoot, 'src');

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTsFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** Campaign rule: neutral fixture identities must never be absorbed into Core. */
function assertFixturesAbsentFromCore(): void {
  const markers = [
    TEST_SEMANTIC_KIND.kindId,
    TEST_TOOL_KIND.kindId,
    TEST_CAPABILITY.capabilityId,
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

test('MK0-01 new neutral Semantic Kind -> Microkernel source diff = 0', () => {
  const component = testSemanticComponent();
  const admitted = admitComponent(component, testUnderstoodKinds());
  assert.equal(admitted.status, 'ADMITTED');
  assert.equal(admitted.admittedKind.kindId, TEST_SEMANTIC_KIND.kindId);
  assertFixturesAbsentFromCore();
});

test('MK0-02 new neutral Tool Kind -> Microkernel source diff = 0', async () => {
  const tool = testToolComponent();
  validateToolComponent(tool);
  const admitted = admitComponent(tool, testUnderstoodKinds());
  assert.equal(admitted.status, 'ADMITTED');

  const selection = selectCapabilityProvider(testGraph(), TEST_CAPABILITY);
  assert.equal(selection.provider.componentId, tool.componentId);
  assert.equal(selection.provider.family, 'tool');

  const digest = await computeComponentSemanticDigest(tool, sha256);
  assert.ok(typeof digest === 'string' && digest.length > 0);
  assertFixturesAbsentFromCore();
});

test('MK0-03 unknown Kind -> fail closed', () => {
  const unknownKindComponent = testSemanticComponent();
  (unknownKindComponent as Mutable<ComponentEnvelope>).kind = {
    kindId: 'mk0.unknown-kind',
    version: '1.0.0',
  };
  assert.throws(
    () => admitComponent(unknownKindComponent, testUnderstoodKinds()),
    (error: unknown) => {
      assert.ok(error instanceof Error && 'code' in error);
      assert.equal((error as { code: string }).code, 'UNKNOWN_KIND');
      return true;
    },
  );

  const wrongVersionComponent = testSemanticComponent();
  (wrongVersionComponent as Mutable<ComponentEnvelope>).kind = {
    kindId: TEST_SEMANTIC_KIND.kindId,
    version: '2.0.0',
  };
  assert.throws(
    () => admitComponent(wrongVersionComponent, testUnderstoodKinds()),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, 'KIND_VERSION_MISMATCH');
      return true;
    },
  );

  assert.throws(
    () => decideKindCompatibility({ kindId: 'mk0.unknown-kind', version: '1.0.0' }, [TEST_SEMANTIC_KIND]),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, 'KIND_NOT_SUPPORTED');
      return true;
    },
  );
  assert.throws(
    () =>
      decideKindCompatibility(
        { kindId: TEST_SEMANTIC_KIND.kindId, version: '2.0.0' },
        [TEST_SEMANTIC_KIND],
      ),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, 'KIND_VERSION_NOT_SUPPORTED');
      return true;
    },
  );
});

test('MK0-04 unknown required semantic contract -> fail closed', () => {
  const component = testSemanticComponent({
    requiredSemanticContracts: [
      TEST_SEMANTIC_CONTRACT,
      { contractId: 'mk0.unheard-contract', version: '1.0.0' },
    ],
  });
  assert.throws(
    () => admitComponent(component, testUnderstoodKinds()),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, 'UNKNOWN_SEMANTIC_CONTRACT');
      return true;
    },
  );
});

test('MK0-05 unknown required capability -> fail closed', () => {
  const component = testSemanticComponent({
    requiredCapabilities: [{ capabilityId: 'mk0.unknown-capability', version: '1.0.0' }],
  });
  assert.throws(
    () => admitComponent(component, testUnderstoodKinds()),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, 'UNKNOWN_CAPABILITY');
      return true;
    },
  );

  const graphWithoutProvider = testGraph({
    components: [testSemanticComponent(), testToolComponent({ providesCapabilities: [] })],
    relations: [],
  });
  assert.throws(
    () => selectCapabilityProvider(graphWithoutProvider, TEST_CAPABILITY),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityProvisionContractError);
      assert.equal(error.code, 'CAPABILITY_PROVIDER_NOT_FOUND');
      return true;
    },
  );
});

test('MK0-06 non-material changes -> semantic identity unchanged', async () => {
  const base = testSemanticComponent();
  const withExtensions = {
    ...base,
    nonMaterialExtensions: { displayName: 'Neutral Fixture', order: 3 },
  } as ComponentEnvelope;
  const withOtherExtensions = {
    ...base,
    nonMaterialExtensions: { completely: 'different', material: false },
  } as ComponentEnvelope;

  const [baseDigest, extendedDigest, otherDigest] = await Promise.all([
    computeComponentSemanticDigest(base, sha256),
    computeComponentSemanticDigest(withExtensions, sha256),
    computeComponentSemanticDigest(withOtherExtensions, sha256),
  ]);
  assert.equal(extendedDigest, baseDigest);
  assert.equal(otherDigest, baseDigest);
});

test('MK0-07 unordered semantic set permutation -> digest unchanged', async () => {
  const first = testSemanticComponent({
    requiredSemanticContracts: [TEST_SEMANTIC_CONTRACT, TEST_SECOND_SEMANTIC_CONTRACT],
    requiredCapabilities: [TEST_CAPABILITY, TEST_SECOND_CAPABILITY],
  });
  const permuted = testSemanticComponent({
    requiredSemanticContracts: [TEST_SECOND_SEMANTIC_CONTRACT, TEST_SEMANTIC_CONTRACT],
    requiredCapabilities: [TEST_SECOND_CAPABILITY, TEST_CAPABILITY],
  });
  const [a, b] = await Promise.all([
    computeComponentSemanticDigest(first, sha256),
    computeComponentSemanticDigest(permuted, sha256),
  ]);
  assert.equal(b, a);

  const graph = testGraph();
  const permutedGraph = testGraph({
    components: [...testGraph().components].reverse(),
    relations: [...testGraph().relations].reverse(),
  });
  const [ga, gb] = await Promise.all([
    computeDefinitionGraphDigest(graph, sha256),
    computeDefinitionGraphDigest(permutedGraph, sha256),
  ]);
  assert.equal(gb, ga);
});

test('MK0-08 material semantic change -> digest changes', async () => {
  const base = testSemanticComponent();
  const variants: ComponentEnvelope[] = [
    { ...base, semanticBody: { fixtureMarker: 'mk0-neutral-CHANGED', notes: ['neutral', 'fixture'] } },
    { ...base, kind: { kindId: TEST_SEMANTIC_KIND.kindId, version: '1.0.1' } },
    {
      ...base,
      requiredSemanticContracts: [TEST_SEMANTIC_CONTRACT, TEST_SECOND_SEMANTIC_CONTRACT],
    },
    { ...base, requiredCapabilities: [TEST_CAPABILITY, TEST_SECOND_CAPABILITY] },
  ];
  const baseDigest = await computeComponentSemanticDigest(base, sha256);
  for (const variant of variants) {
    const digest = await computeComponentSemanticDigest(variant, sha256);
    assert.notEqual(digest, baseDigest);
  }
});

test('MK0-09 caller mutates original refs after decision -> evidence unchanged', () => {
  // Repaired seam (#574): Kind compatibility evidence is fresh and frozen.
  const supported: KindRef[] = [{ ...TEST_SEMANTIC_KIND }];
  const compatibility = decideKindCompatibility({ ...TEST_SEMANTIC_KIND }, supported);
  (supported[0] as Mutable<KindRef>).kindId = 'tampered.after.decision';
  assert.equal(compatibility.supportedKind.kindId, TEST_SEMANTIC_KIND.kindId);

  // Repaired seam (#569): capability selection evidence is fresh and frozen.
  const graph = testGraph();
  const required: CapabilityContractRef = { ...TEST_CAPABILITY };
  const selection = selectCapabilityProvider(graph, required);
  (required as Mutable<CapabilityContractRef>).capabilityId = 'tampered.after.decision';
  const provider = graph.components[1];
  assert.ok(provider !== undefined);
  const providerBody = provider.semanticBody as unknown as {
    providesCapabilities: CapabilityContractRef[];
  };
  const firstProvided = providerBody.providesCapabilities[0] as
    | Mutable<CapabilityContractRef>
    | undefined;
  assert.ok(firstProvided !== undefined);
  firstProvided.capabilityId = 'tampered.after.decision';
  assert.equal(selection.requiredCapability.capabilityId, TEST_CAPABILITY.capabilityId);
  assert.equal(selection.provider.providesCapability.capabilityId, TEST_CAPABILITY.capabilityId);
  assert.ok(Object.isFrozen(selection));
  assert.ok(Object.isFrozen(selection.requiredCapability));
  assert.ok(Object.isFrozen(selection.provider));
  assert.ok(Object.isFrozen(selection.provider.providesCapability));
});

test('MK0-10 delayed Sha256Port + mutation during pending digest -> no torn snapshot', async () => {
  const deferred = new DeferredSha256Port();
  const pristine = testSemanticComponent();
  const pristineDigest = await computeComponentSemanticDigest(
    testSemanticComponent(),
    sha256,
  );

  const pending = computeComponentSemanticDigest(pristine, deferred);
  const mutatedView = pristine as unknown as Mutable<ComponentEnvelope>;
  mutatedView.semanticBody = { fixtureMarker: 'torn-snapshot-attempt', notes: [] };
  const firstRequired = mutatedView.requiredSemanticContracts[0] as
    | Mutable<SemanticContractRef>
    | undefined;
  assert.ok(firstRequired !== undefined);
  firstRequired.contractId = 'torn.attempt';
  deferred.release();
  assert.equal(await pending, pristineDigest);

  const deferredGraph = new DeferredSha256Port();
  const graph = testGraph();
  const pristineGraphDigest = await computeDefinitionGraphDigest(testGraph(), sha256);
  const pendingGraph = computeDefinitionGraphDigest(graph, deferredGraph);
  const graphView = graph as unknown as Mutable<DefinitionGraphEnvelope>;
  graphView.components = [...graphView.components].reverse();
  const firstComponent = graphView.components[0];
  assert.ok(firstComponent !== undefined);
  const firstBody = firstComponent.semanticBody as { fixtureMarker?: string };
  firstBody.fixtureMarker = 'torn-snapshot-attempt';
  deferredGraph.release();
  assert.equal(await pendingGraph, pristineGraphDigest);
});

test('MK0-11 Microkernel path requires no concrete Workflow/XState/SQLite/AI/HTTP import', () => {
  const forbidden = /xstate|workflow|sqlite|persistence|openai|anthropic|llm|fetch|http/i;
  const contractsRoot = join(srcRoot, 'contracts');

  function relativeClosure(entry: string, seen: Set<string>): void {
    const resolved = resolve(entry);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    const text = readFileSync(resolved, 'utf8');
    const specifiers = [...text.matchAll(/from\s+'([^']+)'/g), ...text.matchAll(/import\s+'([^']+)'/g)]
      .map((match) => match[1])
      .filter((specifier): specifier is string => typeof specifier === 'string' && specifier.startsWith('.'));
    for (const specifier of specifiers) {
      assert.ok(
        !forbidden.test(specifier),
        `Microkernel module ${resolved} imports forbidden concrete implementation "${specifier}"`,
      );
      const target = specifier.endsWith('.js')
        ? specifier.slice(0, -'.js'.length) + '.ts'
        : specifier;
      relativeClosure(join(dirname(resolved), target), seen);
    }
  }

  const entries = [
    join(srcRoot, 'public-v7', 'index.ts'),
    ...[
      'component.ts',
      'component-digest.ts',
      'definition-graph.ts',
      'component-admission.ts',
      'tool-component.ts',
      'kind-compatibility.ts',
      'capability-provision.ts',
      'resource-requirements.ts',
      'identity.ts',
      'json.ts',
    ].map((file) => join(contractsRoot, file)),
  ];
  const seen = new Set<string>();
  for (const entry of entries) relativeClosure(entry, seen);
  const allowedRoots = [contractsRoot + '/', contractsRoot + '\\', join(srcRoot, 'public-v7')];
  for (const file of seen) {
    assert.ok(
      allowedRoots.some((root) => file.startsWith(root)),
      `Microkernel transitive import closure left the contracts boundary: ${file}`,
    );
  }
});

test('MK0-12 candidate/currentness provider selection must NOT be misreported as trusted runtime authority', () => {
  const selection = selectCapabilityProvider(testGraph(), TEST_CAPABILITY);

  assert.deepEqual(Object.keys(selection).sort(), ['graphId', 'provider', 'requiredCapability']);
  assert.deepEqual(Object.keys(selection.provider).sort(), [
    'componentId',
    'family',
    'providesCapability',
  ]);
  assert.equal(selection.provider.family, 'tool');

  const serialized = JSON.stringify(selection);
  for (const marker of ['admit', 'Admit', 'assembl', 'Assembl', 'authorit', 'Authorit', 'pin', 'Pin', 'validator']) {
    assert.ok(!serialized.includes(marker), `selection evidence claims authority-shaped material: ${marker}`);
  }

  // Fail-closed ambiguity: two exact providers, no first-wins/ordering/default.
  const ambiguousGraph = testGraph({
    components: [
      testSemanticComponent(),
      testToolComponent({ componentId: 'mk0.test.tool-a' }),
      testToolComponent({ componentId: 'mk0.test.tool-b' }),
    ],
    relations: [],
  });
  assert.throws(
    () => selectCapabilityProvider(ambiguousGraph, TEST_CAPABILITY),
    (error: unknown) => {
      assert.ok(error instanceof CapabilityProvisionContractError);
      assert.equal(error.code, 'CAPABILITY_PROVIDER_AMBIGUOUS');
      assert.deepEqual(error.conflictingProviderComponentIds, ['mk0.test.tool-a', 'mk0.test.tool-b']);
      return true;
    },
  );

  // Definition-plane only: selection runs without any understood-Kind admission
  // input, and its evidence carries no ADMITTED status — trusted admission and
  // Assembly provenance are later seams (#572 correction, #575, T003C).
  const unadmittedGraph = testGraph();
  const selected = selectCapabilityProvider(unadmittedGraph, TEST_CAPABILITY, 'mk0.test.semantic-component');
  assert.ok(!('status' in selected));

  // No Admitted*/authority-producing naming leaked into the Core surface (#572 correction).
  const capabilityProvisionSource = readFileSync(
    join(srcRoot, 'contracts', 'capability-provision.ts'),
    'utf8',
  );
  assert.ok(!capabilityProvisionSource.includes('resolveAdmittedCapabilityProvider'));
  assert.ok(!capabilityProvisionSource.includes('AdmittedCapabilityProviderSelection'));
});

// ---------------------------------------------------------------------------
// Known-defect confirmation probes at this HEAD. Each asserts the CURRENT
// (defective) behavior of a durable open finding so the campaign re-run flips
// it when the corresponding repair merge lands.
// ---------------------------------------------------------------------------

test('KNOWN-#555 graph digest embeds whole envelopes instead of composing Component semantic digests', async () => {
  const base = testSemanticComponent();
  const extended = {
    ...base,
    nonMaterialExtensions: { note: 'non-material' },
  } as ComponentEnvelope;

  // Component semantic identity is unchanged (MK0-06)...
  const [baseComponentDigest, extendedComponentDigest] = await Promise.all([
    computeComponentSemanticDigest(base, sha256),
    computeComponentSemanticDigest(extended, sha256),
  ]);
  assert.equal(extendedComponentDigest, baseComponentDigest);

  // ...but at this HEAD the graph digest drifts on the non-material change.
  const graphBase = testGraph({ components: [testSemanticComponent(), testToolComponent()] });
  const graphExtended = testGraph({ components: [extended, testToolComponent()] });
  const [ga, gb] = await Promise.all([
    computeDefinitionGraphDigest(graphBase, sha256),
    computeDefinitionGraphDigest(graphExtended, sha256),
  ]);
  assert.notEqual(gb, ga, 'if equal, PR #558 repair landed — flip this probe and re-verify MK0');
});

test('KNOWN-#557 exact-version semantics drift across contract validators', () => {
  const withXRangeVersion = testSemanticComponent();
  (withXRangeVersion as Mutable<ComponentEnvelope>).kind = {
    kindId: TEST_SEMANTIC_KIND.kindId,
    version: '1.x',
  };
  // Envelope side: component.ts accepts `1.x` as if it were an exact version...
  assert.doesNotThrow(() => validateComponentEnvelope(withXRangeVersion));
  // ...so admission can only fail it as a version lookup miss, never structurally.
  assert.throws(
    () => admitComponent(withXRangeVersion, testUnderstoodKinds()),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, 'KIND_VERSION_MISMATCH');
      return true;
    },
  );
  // Understood-set side: the very same `1.x` form IS structurally rejected here.
  const drifted = testUnderstoodKinds() as unknown as UnderstoodKindSet;
  const firstDeclaration = drifted[0];
  assert.ok(firstDeclaration !== undefined);
  (firstDeclaration.kind as Mutable<KindRef>).version = '1.x';
  assert.throws(
    () => admitComponent(testSemanticComponent(), drifted),
    (error: unknown) => {
      assert.equal((error as { code: string }).code, 'INVALID_UNDERSTOOD_KIND_SET');
      return true;
    },
  );
});

test('KNOWN-#576 tool providesCapabilities permutation drifts Component semantic digest', async () => {
  const first = testToolComponent({
    providesCapabilities: [TEST_CAPABILITY, TEST_SECOND_CAPABILITY],
  });
  const permuted = testToolComponent({
    providesCapabilities: [TEST_SECOND_CAPABILITY, TEST_CAPABILITY],
  });
  const [a, b] = await Promise.all([
    computeComponentSemanticDigest(first, sha256),
    computeComponentSemanticDigest(permuted, sha256),
  ]);
  assert.notEqual(b, a, 'if equal, #576 was repaired — flip this probe and re-verify');
});

test('KNOWN-#575 admitted evidence aliases caller-owned required refs', () => {
  const component = testSemanticComponent();
  const admitted = admitComponent(component, testUnderstoodKinds());
  const requiredRef = component.requiredSemanticContracts[0];
  assert.ok(requiredRef !== undefined);
  const requiredView = requiredRef as unknown as Mutable<SemanticContractRef>;
  requiredView.contractId = 'tampered.after.admission';
  // At this HEAD the admitted evidence aliases the caller's ref object.
  const admittedRef = admitted.admittedSemanticContracts[0];
  assert.ok(admittedRef !== undefined);
  assert.equal(
    admittedRef.contractId,
    'tampered.after.admission',
    'if this fails, #575 evidence-immortality repair landed — flip this probe and re-verify MK0',
  );
});

test('KNOWN-#578 accessor-backed KindRef passes envelope validation (TOCTOU-able)', () => {
  // Calibrate: count the total kindId reads of one successful admission with a
  // benign counting getter, then replay with a getter that turns hostile only
  // on the FINAL read — the one that builds the ADMITTED evidence. Every
  // earlier read (envelope validation, admission kindKey lookup) still sees
  // the benign value, so the minter never validated what it emitted.
  let dryReads = 0;
  const countingKind = Object.defineProperties(
    {},
    {
      kindId: { enumerable: true, get: () => (dryReads += 1, TEST_SEMANTIC_KIND.kindId) },
      version: { enumerable: true, get: () => TEST_SEMANTIC_KIND.version },
    },
  );
  // Replay the EXACT call sequence of the hostile run below so the read
  // budgets line up: one standalone envelope validation + one admission.
  const dryComponent = {
    ...testSemanticComponent(),
    kind: countingKind as unknown as KindRef,
  } as ComponentEnvelope;
  assert.doesNotThrow(() => validateComponentEnvelope(dryComponent));
  admitComponent(dryComponent, testUnderstoodKinds());
  assert.ok(dryReads >= 2, `expected multiple kindId reads across validation and evidence, got ${dryReads}`);

  let hostileReads = 0;
  const accessorKind = Object.defineProperties(
    {},
    {
      kindId: {
        enumerable: true,
        get() {
          hostileReads += 1;
          return hostileReads < dryReads ? TEST_SEMANTIC_KIND.kindId : 'tampered.by.getter';
        },
      },
      version: { enumerable: true, get: () => TEST_SEMANTIC_KIND.version },
    },
  );
  const component = {
    ...testSemanticComponent(),
    kind: accessorKind as unknown as KindRef,
  } as ComponentEnvelope;
  assert.doesNotThrow(() => validateComponentEnvelope(component));
  const admitted = admitComponent(component, testUnderstoodKinds());
  assert.equal(admitted.status, 'ADMITTED');
  assert.equal(
    admitted.admittedKind.kindId,
    'tampered.by.getter',
    'if this fails, #578 accessor rejection landed — flip this probe and re-verify MK0',
  );
});
