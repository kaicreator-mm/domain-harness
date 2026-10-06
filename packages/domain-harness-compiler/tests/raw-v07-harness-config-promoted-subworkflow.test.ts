/**
 * T008D — historical harness-config / promoted-subworkflow compatibility
 * mapping (PACK-B #589, thin issue #790).
 *
 * Historical compat material is evidence-input only: it never becomes a v0.7
 * ontology root and never gains Runtime/transition/effect/journal authority.
 * promoted-subworkflow maps into the ordinary Workflow Semantic Component +
 * typed relation model; DecisionResolver source authority stays with the
 * frozen resolver source order, never with incidental config order; ambiguous
 * historical semantics fail typed — never guessed, never first/latest/default.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  admitComponent,
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type ComponentEnvelope,
  type DefinitionGraphEnvelope,
  type Sha256Port,
  type UnderstoodKindDeclaration,
} from '@kaicreator/domain-harness/v7';
import type { JsonValue } from '../src/raw/types.js';
import {
  COMPAT_ADAPTER_PROVENANCE_MARKER,
  COMPAT_DECISION_RESOLVER_SOURCE_ORDER,
  COMPAT_HARNESS_CONFIG_KIND,
  COMPAT_PROMOTED_ENVELOPE_SCHEMA_VERSION,
  COMPAT_PROMOTED_SUBWORKFLOW_KIND,
  COMPAT_REFERENCES_RELATION_KIND,
  mapHarnessConfigPromotedSubworkflowToComponentGraph,
  type CompatDecisionSourceDeclaration,
  type CompatHistoricalArtifactIdentity,
  type CompatHistoricalHarnessConfig,
  type CompatHistoricalPromotedSubworkflow,
  type CompatMappingInput,
} from '../src/compat/raw-v07/harness-config-promoted-subworkflow.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

async function graphDigest(graph: DefinitionGraphEnvelope): Promise<string> {
  return computeDefinitionGraphDigest(graph, sha256);
}

function componentById(graph: DefinitionGraphEnvelope, componentId: string): ComponentEnvelope {
  const found = graph.components.find((component) => component.componentId === componentId);
  assert.ok(found, `component '${componentId}' is mapped`);
  return found;
}

function relationsFrom(graph: DefinitionGraphEnvelope, sourceComponentId: string) {
  return graph.relations.filter((relation) => relation.sourceComponentId === sourceComponentId);
}

// ---------------------------------------------------------------------------
// Fixtures: exact historical material shapes
// ---------------------------------------------------------------------------

const TOOL_REF = Object.freeze({ kind: 'tool', artifactId: 'tool.pricing', contentDigest: 'digest-tool-pricing' });
const HARNESS_IDENTITY: CompatHistoricalArtifactIdentity = Object.freeze({
  kind: 'harness-config',
  artifactId: 'harness.orderDecision',
  contentDigest: 'digest-harness-order',
});
const SUBWORKFLOW_IDENTITY: CompatHistoricalArtifactIdentity = Object.freeze({
  kind: 'promoted-subworkflow',
  artifactId: 'promoted.orderDecision',
  version: '3.1.0',
  contentDigest: 'digest-promoted-order',
});

function promotedEnvelope(): JsonValue {
  return {
    schemaVersion: 'candidate-envelope-v1',
    candidateKind: 'workflow',
    candidateId: 'candidate.orderDecision',
    bodyContract: { kind: 'knowledge', artifactId: 'knowledge.orderContract', contentDigest: 'digest-knowledge-order' },
    io: { inputs: [], outputs: [] },
    capabilities: [],
    tools: [{ ...TOOL_REF, capability: 'query' }],
    events: [],
    mutation: { kind: 'none' },
    references: [
      { kind: 'rule', artifactId: 'rule.orderFallthrough', contentDigest: 'digest-rule-order' },
      { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' },
    ],
    applicability: [],
    hardInvariants: [],
    control: {
      startNode: 'fetch',
      nodes: ['fetch', 'decide', 'finish'],
      edges: [
        { from: 'fetch', to: 'decide' },
        { from: 'decide', to: 'finish' },
      ],
      maxSteps: 8,
    },
    body: {
      schemaVersion: 'promoted-child-workflow/v1',
      nodes: [
        {
          node: 'fetch',
          step: { kind: 'query', tool: { ...TOOL_REF }, input: { kind: 'input', path: 'order' } },
        },
        {
          node: 'decide',
          step: { kind: 'reasoned', harnessConfig: { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' } },
        },
        {
          node: 'finish',
          step: { kind: 'terminal-output', output: { kind: 'step-output', node: 'decide', path: 'decision' } },
        },
      ],
    },
  };
}

function harnessMaterial(): JsonValue {
  return {
    bounds: { maxSteps: 8 },
    capabilities: [{ capabilityId: 'http-transport@1', kind: 'query' }],
  };
}

function subworkflow(
  overrides: Partial<CompatHistoricalPromotedSubworkflow> = {},
): CompatHistoricalPromotedSubworkflow {
  return { identity: { ...SUBWORKFLOW_IDENTITY }, envelope: promotedEnvelope(), ...overrides };
}

function harnessConfig(
  overrides: Partial<CompatHistoricalHarnessConfig> = {},
): CompatHistoricalHarnessConfig {
  return { identity: { ...HARNESS_IDENTITY }, material: harnessMaterial(), ...overrides };
}

function declaration(
  overrides: Partial<CompatDecisionSourceDeclaration> = {},
): CompatDecisionSourceDeclaration {
  return {
    decisionId: 'decision.orderTotal',
    source: 'promoted-subworkflow',
    artifact: { kind: 'promoted-subworkflow', artifactId: 'promoted.orderDecision', version: '3.1.0', contentDigest: 'digest-promoted-order' },
    ...overrides,
  };
}

function input(overrides: Partial<CompatMappingInput> = {}): CompatMappingInput {
  return {
    graphId: 'domain.orders.compat',
    promotedSubworkflows: [subworkflow()],
    harnessConfigs: [harnessConfig()],
    decisionSources: [declaration()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Deterministic mapping / exact correspondence
// ---------------------------------------------------------------------------

test('maps promoted-subworkflow and harness-config into ordinary semantic Components on exact compat Kinds', () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());

  const promoted = componentById(result.graph, 'promoted.orderDecision');
  assert.equal(promoted.family, 'semantic');
  assert.deepEqual(promoted.kind, COMPAT_PROMOTED_SUBWORKFLOW_KIND);
  assert.equal(promoted.kind.kindId, 'domain-harness.compat.promoted-subworkflow');
  assert.equal(promoted.kind.version, '1.0.0');
  assert.deepEqual(promoted.requiredSemanticContracts, []);
  assert.deepEqual(promoted.requiredCapabilities, []);

  const harness = componentById(result.graph, 'harness.orderDecision');
  assert.equal(harness.family, 'semantic');
  assert.deepEqual(harness.kind, COMPAT_HARNESS_CONFIG_KIND);
  assert.equal(harness.kind.kindId, 'domain-harness.compat.harness-config');
});

test('the mapped promoted-subworkflow semanticBody is the exact canonical historical envelope', () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  const promoted = componentById(result.graph, 'promoted.orderDecision');

  // Every historical behaviorally material field survives verbatim (array
  // order preserved; only object key order is canonicalized).
  const body = promoted.semanticBody as Record<string, unknown>;
  assert.equal(body.schemaVersion, 'candidate-envelope-v1');
  assert.equal(body.candidateKind, 'workflow');
  assert.equal(body.candidateId, 'candidate.orderDecision');
  assert.deepEqual(body.control, {
    startNode: 'fetch',
    nodes: ['fetch', 'decide', 'finish'],
    edges: [
      { from: 'fetch', to: 'decide' },
      { from: 'decide', to: 'finish' },
    ],
    maxSteps: 8,
  });
  const envelope = promotedEnvelope() as Record<string, unknown>;
  assert.deepEqual((body.io as Record<string, unknown>).inputs, (envelope.io as Record<string, unknown>).inputs);
  assert.deepEqual(body.mutation, envelope.mutation);
  assert.deepEqual(body.tools, envelope.tools);
});

test('typed relations carry exactly the intra-concern composition (references relation kind, deduplicated, sorted)', () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());

  // envelope.references (harness-config kind) and the body reasoned step's
  // harnessConfig ref point at the same pair — one relation, never duplicated.
  const promotedRelations = relationsFrom(result.graph, 'promoted.orderDecision');
  assert.equal(promotedRelations.length, 1);
  assert.equal(promotedRelations[0].relationKind, COMPAT_REFERENCES_RELATION_KIND);
  assert.equal(promotedRelations[0].relationId, 'references:promoted.orderDecision:harness.orderDecision');
  assert.equal(promotedRelations[0].targetComponentId, 'harness.orderDecision');

  // A second promoted-subworkflow composing the first produces a second relation.
  const composed = input({
    promotedSubworkflows: [
      subworkflow(),
      subworkflow({
        identity: { kind: 'promoted-subworkflow', artifactId: 'promoted.orderPipeline', contentDigest: 'digest-promoted-pipeline' },
        envelope: {
          schemaVersion: 'candidate-envelope-v1',
          candidateKind: 'workflow',
          control: {
            startNode: 'only',
            nodes: ['only'],
            edges: [],
            maxSteps: 4,
          },
          references: [{ kind: 'promoted-subworkflow', artifactId: 'promoted.orderDecision', contentDigest: 'digest-promoted-order' }],
        },
      }),
    ],
  });
  const composedResult = mapHarnessConfigPromotedSubworkflowToComponentGraph(composed);
  const pipelineRelations = relationsFrom(composedResult.graph, 'promoted.orderPipeline');
  assert.equal(pipelineRelations.length, 1);
  assert.equal(pipelineRelations[0].relationId, 'references:promoted.orderPipeline:promoted.orderDecision');
  assert.deepEqual(
    composedResult.graph.relations.map((relation) => relation.relationId),
    [...composedResult.graph.relations.map((relation) => relation.relationId)].sort(),
  );
});

test('references outside the compat concern stay exact historical material and never become dangling relations', () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  const promoted = componentById(result.graph, 'promoted.orderDecision');

  // tool/rule references are preserved verbatim inside the envelope body...
  const body = promoted.semanticBody as Record<string, unknown>;
  assert.deepEqual(body.tools, [{ ...TOOL_REF, capability: 'query' }]);
  assert.deepEqual(body.references, [
    { kind: 'rule', artifactId: 'rule.orderFallthrough', contentDigest: 'digest-rule-order' },
    { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' },
  ]);
  // ...and produce no relation (their targets are not compat-bound components).
  assert.equal(relationsFrom(result.graph, 'promoted.orderDecision').length, 1);
  assert.ok(!result.graph.relations.some((relation) => relation.targetComponentId === 'tool.pricing'));
  assert.ok(!result.graph.relations.some((relation) => relation.targetComponentId === 'rule.orderFallthrough'));
});

test('harness-config components map on the compat Kind with no outgoing relations and verbatim material', () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  const harness = componentById(result.graph, 'harness.orderDecision');
  assert.deepEqual(harness.semanticBody, harnessMaterial());
  assert.equal(relationsFrom(result.graph, 'harness.orderDecision').length, 0);
});

test('same input mapped twice yields an identical graph and identical normalized graph digest', async () => {
  const first = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  const second = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  assert.deepEqual(first, second);
  assert.equal(await graphDigest(first.graph), await graphDigest(second.graph));
});

test('unordered input permutation (components, configs, declarations) never changes the product', async () => {
  const promotedB = subworkflow({
    identity: { kind: 'promoted-subworkflow', artifactId: 'promoted.aaa', contentDigest: 'digest-aaa' },
    envelope: {
      schemaVersion: 'candidate-envelope-v1',
      candidateKind: 'workflow',
      control: { startNode: 'n', nodes: ['n'], edges: [], maxSteps: 2 },
    },
  });
  const harnessB = harnessConfig({
    identity: { kind: 'harness-config', artifactId: 'harness.aaa', contentDigest: 'digest-harness-aaa' },
  });

  const ordered = mapHarnessConfigPromotedSubworkflowToComponentGraph(
    input({
      promotedSubworkflows: [subworkflow(), promotedB],
      harnessConfigs: [harnessConfig(), harnessB],
      decisionSources: [
        declaration(),
        declaration({ decisionId: 'decision.aaa', source: 'harness-machine', artifact: { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' } }),
      ],
    }),
  );
  const permuted = mapHarnessConfigPromotedSubworkflowToComponentGraph(
    input({
      promotedSubworkflows: [promotedB, subworkflow()],
      harnessConfigs: [harnessB, harnessConfig()],
      decisionSources: [
        declaration({ decisionId: 'decision.aaa', source: 'harness-machine', artifact: { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' } }),
        declaration(),
      ],
    }),
  );

  assert.deepEqual(
    permuted.graph.components.map((component) => component.componentId),
    ordered.graph.components.map((component) => component.componentId),
  );
  assert.deepEqual(permuted.graph, ordered.graph);
  assert.equal(await graphDigest(permuted.graph), await graphDigest(ordered.graph));
  assert.deepEqual(permuted.provenance.decisionSources, ordered.provenance.decisionSources);
});

test('decision-source evidence is canonicalized by the frozen resolver source order, then decisionId', () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(
    input({
      decisionSources: [
        declaration({ decisionId: 'b.decision', source: 'harness-machine', artifact: { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' } }),
        declaration(),
        declaration({
          decisionId: 'a.decision',
          source: 'promoted-subworkflow',
          artifact: { kind: 'promoted-subworkflow', artifactId: 'promoted.orderDecision', version: '3.1.0', contentDigest: 'digest-promoted-order' },
        }),
      ],
    }),
  );
  assert.deepEqual(
    result.provenance.decisionSources.map((entry) => `${entry.source}:${entry.decisionId}`),
    ['promoted-subworkflow:a.decision', 'promoted-subworkflow:decision.orderTotal', 'harness-machine:b.decision'],
  );
  // Every artifact-bearing source carries its exact artifact binding evidence
  // (artifactId + contentDigest) — source identity without currentness is
  // never emitted.
  assert.deepEqual(
    result.provenance.decisionSources.find((entry) => entry.decisionId === 'b.decision')?.artifact,
    { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' },
  );
});

test('explicitly ordered historical sequences are preserved exactly, not reordered', () => {
  const edgeOrderA = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  const reversed = input();
  const envelope = (reversed.promotedSubworkflows as readonly CompatHistoricalPromotedSubworkflow[])[0]
    .envelope as Record<string, unknown>;
  const control = envelope.control as Record<string, unknown>;
  control.edges = [
    { from: 'decide', to: 'finish' },
    { from: 'fetch', to: 'decide' },
  ];
  const edgeOrderB = mapHarnessConfigPromotedSubworkflowToComponentGraph(reversed);

  const bodyA = componentById(edgeOrderA.graph, 'promoted.orderDecision').semanticBody as Record<string, unknown>;
  const bodyB = componentById(edgeOrderB.graph, 'promoted.orderDecision').semanticBody as Record<string, unknown>;
  assert.notDeepEqual(bodyA.control, bodyB.control);
  assert.deepEqual(
    (bodyB.control as Record<string, unknown>).edges,
    [
      { from: 'decide', to: 'finish' },
      { from: 'fetch', to: 'decide' },
    ],
  );
});

test('historical identity and currentness are preserved byte-exact as mapping provenance', () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());

  const promotedProvenance = result.provenance.components.find(
    (entry) => entry.componentId === 'promoted.orderDecision',
  );
  assert.ok(promotedProvenance);
  assert.equal(promotedProvenance.historicalKind, 'promoted-subworkflow');
  assert.deepEqual(promotedProvenance.historicalIdentity, {
    kind: 'promoted-subworkflow',
    artifactId: 'promoted.orderDecision',
    version: '3.1.0',
    contentDigest: 'digest-promoted-order',
  });

  const harnessProvenance = result.provenance.components.find(
    (entry) => entry.componentId === 'harness.orderDecision',
  );
  assert.ok(harnessProvenance);
  assert.deepEqual(harnessProvenance.historicalIdentity, {
    kind: 'harness-config',
    artifactId: 'harness.orderDecision',
    contentDigest: 'digest-harness-order',
  });

  // The declared decision binding keeps its exact historical identity evidence.
  assert.deepEqual(result.provenance.decisionSources[0].artifact, {
    kind: 'promoted-subworkflow',
    artifactId: 'promoted.orderDecision',
    version: '3.1.0',
    contentDigest: 'digest-promoted-order',
  });
});

test('graph-level provenance is non-material and carries the exact adapter marker', async () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  const extensions = result.graph.nonMaterialExtensions as Record<string, unknown>;
  assert.equal(extensions.adapter, COMPAT_ADAPTER_PROVENANCE_MARKER);
  assert.equal(extensions.envelopeSchemaVersion, COMPAT_PROMOTED_ENVELOPE_SCHEMA_VERSION);

  const { nonMaterialExtensions: _dropped, ...materialGraph } = result.graph;
  assert.equal(await graphDigest(result.graph), await graphDigest(materialGraph as DefinitionGraphEnvelope));
});

test('the produced graph passes the standard envelope gate and standard normalized digest authority', async () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  assert.doesNotThrow(() => validateDefinitionGraphEnvelope(result.graph));
  const digest = await graphDigest(result.graph);
  assert.match(digest, /^[0-9a-f]{64}$/);
});

test('mapped compat components are admitted through the generic must-understand seam with no special casing', () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  const promoted = componentById(result.graph, 'promoted.orderDecision');
  const harness = componentById(result.graph, 'harness.orderDecision');

  const understandPromoted: UnderstoodKindDeclaration = {
    kind: COMPAT_PROMOTED_SUBWORKFLOW_KIND,
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => undefined,
  };
  const understandHarness: UnderstoodKindDeclaration = {
    kind: COMPAT_HARNESS_CONFIG_KIND,
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => undefined,
  };
  assert.equal(admitComponent(promoted, [understandPromoted]).status, 'ADMITTED');
  assert.equal(admitComponent(harness, [understandHarness]).status, 'ADMITTED');
  assert.throws(
    () => admitComponent(promoted, [understandHarness]),
    (error: unknown) => error instanceof Error && (error as Error).name === 'ComponentAdmissionError',
  );
});

// ---------------------------------------------------------------------------
// DecisionResolver source authority
// ---------------------------------------------------------------------------

test('the frozen DecisionResolver source order is the exact ADR-03 mirror and is frozen', () => {
  assert.deepEqual([...COMPAT_DECISION_RESOLVER_SOURCE_ORDER], [
    'rule',
    'exact-cache',
    'promoted-subworkflow',
    'harness-machine',
  ]);
  assert.ok(Object.isFrozen(COMPAT_DECISION_RESOLVER_SOURCE_ORDER));
});

test('config reordering cannot alter DecisionResolver source authority', async () => {
  const reorder = (sources: readonly CompatDecisionSourceDeclaration[]) =>
    mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ decisionSources: sources }));

  const first = reorder([declaration({ decisionId: 'a' }), declaration({ decisionId: 'b', source: 'harness-machine', artifact: { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' } })]);
  const second = reorder([declaration({ decisionId: 'b', source: 'harness-machine', artifact: { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' } }), declaration({ decisionId: 'a' })]);

  assert.deepEqual(first.provenance.decisionSources, second.provenance.decisionSources);
  assert.equal(await graphDigest(first.graph), await graphDigest(second.graph));
  // Each decision keeps exactly its declared source — no reordering, no
  // first-wins reassignment, no source promotion by list position.
  assert.equal(first.provenance.decisionSources.find((entry) => entry.decisionId === 'a')?.source, 'promoted-subworkflow');
  assert.equal(first.provenance.decisionSources.find((entry) => entry.decisionId === 'b')?.source, 'harness-machine');
});

test('the declaration shape is closed: priority/order/weight-style authority fields fail typed', () => {
  const smuggled = declaration({}) as Record<string, unknown>;
  smuggled.priority = 1;
  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ decisionSources: [smuggled as unknown as CompatDecisionSourceDeclaration] })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /decisionSources\[0\]/);
      return true;
    },
  );
});

test('unknown or inferred source names fail closed — no latest/default/first inference', () => {
  for (const source of ['latest', 'default', 'first', 'registry-order', 'promoted', '']) {
    assert.throws(
      () => mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ decisionSources: [declaration({ source: source as never })] })),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /decisionSources\[0\]\.source/);
        return true;
      },
      `source '${source}' must fail closed`,
    );
  }
});

test('duplicate decision declarations fail typed', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({ decisionSources: [declaration(), declaration()] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DUPLICATE_COMPAT_IDENTITY/);
      return true;
    },
  );
});

test('conflicting sources for one decision fail typed instead of first-wins', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          decisionSources: [
            declaration(),
            declaration({ source: 'harness-machine', artifact: { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' } }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /CONFLICTING_COMPAT_IDENTITY/);
      return true;
    },
  );
});

test('a declaration source never binds an artifact of the wrong compat kind', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          decisionSources: [
            declaration({ artifact: { kind: 'harness-config', artifactId: 'promoted.orderDecision', contentDigest: 'digest-promoted-order' } }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /CONFLICTING_COMPAT_IDENTITY/);
      return true;
    },
  );
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({ decisionSources: [declaration({ source: 'rule' })] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /NOT_TRANSLATABLE/);
      return true;
    },
  );
});

test('artifact-bearing sources require exactly one exact artifact binding — a missing binding fails typed', () => {
  const promotedMissingArtifact: CompatDecisionSourceDeclaration = {
    decisionId: 'decision.orderTotal',
    source: 'promoted-subworkflow',
  };
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({ decisionSources: [promotedMissingArtifact] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /NOT_TRANSLATABLE/);
      assert.match(error.message, /decisionSources\[0\]\.artifact/);
      assert.match(error.message, /promoted-subworkflow/);
      return true;
    },
    'promoted-subworkflow binds exactly one promoted-subworkflow artifact; absence is never accepted',
  );

  const machineMissingArtifact: CompatDecisionSourceDeclaration = {
    decisionId: 'decision.machine',
    source: 'harness-machine',
  };
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({ decisionSources: [machineMissingArtifact] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /NOT_TRANSLATABLE/);
      assert.match(error.message, /decisionSources\[0\]\.artifact/);
      assert.match(error.message, /harness-machine/);
      return true;
    },
    'harness-machine binds exactly one harness-config artifact; absence is never accepted',
  );
});

test('rule and exact-cache continue to bind no compat artifact — carrying one fails typed', () => {
  for (const source of ['rule', 'exact-cache'] as const) {
    assert.throws(
      () =>
        mapHarnessConfigPromotedSubworkflowToComponentGraph(
          input({ decisionSources: [declaration({ source })] }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /NOT_TRANSLATABLE/);
        assert.match(error.message, /decisionSources\[0\]\.artifact/);
        return true;
      },
      `source '${source}' must reject a compat artifact binding`,
    );
  }
});

test('a declaration fails closed when the artifact bound under the same id/digest carries the other compat kind', () => {
  // The declaration's own kind is well-formed for its source family, so Phase 3
  // accepts it; the artifact actually bound under that id/digest belongs to the
  // other compat family. Resolution by id + digest alone would accept this —
  // exact bound identity requires the kind to correspond.
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          decisionSources: [
            declaration({ artifact: { kind: 'promoted-subworkflow', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' } }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /CONFLICTING_COMPAT_IDENTITY/);
      assert.match(error.message, /harness\.orderDecision/);
      return true;
    },
    'a promoted-subworkflow declaration binds only an exact promoted-subworkflow artifact',
  );

  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          decisionSources: [
            declaration({
              source: 'harness-machine',
              artifact: { kind: 'harness-config', artifactId: 'promoted.orderDecision', contentDigest: 'digest-promoted-order' },
            }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /CONFLICTING_COMPAT_IDENTITY/);
      assert.match(error.message, /promoted\.orderDecision/);
      return true;
    },
    'a harness-machine declaration binds only an exact harness-config artifact',
  );
});

test('a declaration binding an artifact missing from the mapping input fails typed — never dangling, never skipped', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          decisionSources: [
            declaration({
              artifact: { kind: 'promoted-subworkflow', artifactId: 'promoted.ghost', contentDigest: 'digest-ghost' },
            }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /MISSING_REFERENCED_COMPAT_ARTIFACT/);
      assert.match(error.message, /promoted\.ghost/);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Missing / duplicate / conflicting / stale fail closed
// ---------------------------------------------------------------------------

test('a compat reference to an artifact missing from the mapping input fails typed — never dangling, never skipped', () => {
  const dangling = input({ harnessConfigs: [] });
  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(dangling),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /MISSING_REFERENCED_COMPAT_ARTIFACT/);
      assert.match(error.message, /harness.orderDecision/);
      return true;
    },
  );
});

test('the same artifact identity declared twice fails typed as duplicate', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({ harnessConfigs: [harnessConfig(), harnessConfig()] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DUPLICATE_COMPAT_IDENTITY/);
      return true;
    },
  );
});

test('one artifactId under two different content digests fails typed as conflicting — never silently re-digested', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          harnessConfigs: [
            harnessConfig(),
            harnessConfig({ identity: { kind: 'harness-config', artifactId: 'harness.orderDecision', contentDigest: 'digest-other' } }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /CONFLICTING_COMPAT_IDENTITY/);
      return true;
    },
  );
});

test('an entry declared in the wrong family (identity kind vs mapping family) fails typed as conflicting', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          harnessConfigs: [
            harnessConfig({ identity: { kind: 'promoted-subworkflow', artifactId: 'harness.orderDecision', contentDigest: 'digest-harness-order' } }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /CONFLICTING_COMPAT_IDENTITY/);
      return true;
    },
  );
});

test('a reference binding a stale revision (same artifactId, different digest) fails typed as stale', () => {
  const staleEnvelope = promotedEnvelope() as Record<string, unknown>;
  (staleEnvelope.references as unknown[])[1] = {
    kind: 'harness-config',
    artifactId: 'harness.orderDecision',
    contentDigest: 'digest-harness-older',
  };
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({ promotedSubworkflows: [subworkflow({ envelope: staleEnvelope })] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /STALE_COMPAT_IDENTITY/);
      assert.match(error.message, /harness.orderDecision/);
      return true;
    },
  );
});

test('a declaration binding a stale revision fails typed as stale', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          decisionSources: [
            declaration({ artifact: { kind: 'promoted-subworkflow', artifactId: 'promoted.orderDecision', version: '3.1.0', contentDigest: 'digest-promoted-old' } }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /STALE_COMPAT_IDENTITY/);
      return true;
    },
  );
});

test('a declaration claiming a different version than the bound artifact fails closed — version is part of the exact identity', () => {
  // Same kind/artifactId/contentDigest, different claimed version: the bound
  // revision is 3.1.0; claiming 3.2.0 is exact historical identity drift —
  // never ignored, normalized or inferred.
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          decisionSources: [
            declaration({ artifact: { kind: 'promoted-subworkflow', artifactId: 'promoted.orderDecision', version: '3.2.0', contentDigest: 'digest-promoted-order' } }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /STALE_COMPAT_IDENTITY/);
      assert.match(error.message, /3\.2\.0/);
      assert.match(error.message, /3\.1\.0/);
      return true;
    },
    'promoted-subworkflow source family: version drift fails closed',
  );

  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          harnessConfigs: [
            harnessConfig({ identity: { kind: 'harness-config', artifactId: 'harness.orderDecision', version: '2.0.0', contentDigest: 'digest-harness-order' } }),
          ],
          decisionSources: [
            declaration({
              source: 'harness-machine',
              artifact: { kind: 'harness-config', artifactId: 'harness.orderDecision', version: '2.1.0', contentDigest: 'digest-harness-order' },
            }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /STALE_COMPAT_IDENTITY/);
      assert.match(error.message, /2\.1\.0/);
      assert.match(error.message, /2\.0\.0/);
      return true;
    },
    'harness-machine source family: version drift fails closed',
  );
});

test('a declaration whose version presence differs from the bound artifact fails closed — version is never inferred', () => {
  // Omitting the version does not widen the binding to any revision of the
  // bound artifact...
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          decisionSources: [
            declaration({ artifact: { kind: 'promoted-subworkflow', artifactId: 'promoted.orderDecision', contentDigest: 'digest-promoted-order' } }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /STALE_COMPAT_IDENTITY/);
      assert.match(error.message, /3\.1\.0/);
      return true;
    },
    'an unversioned claim never binds a versioned artifact',
  );

  // ...and claiming a version where the bound artifact carries none is drift.
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          decisionSources: [
            declaration({
              source: 'harness-machine',
              artifact: { kind: 'harness-config', artifactId: 'harness.orderDecision', version: '9.9.9', contentDigest: 'digest-harness-order' },
            }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /STALE_COMPAT_IDENTITY/);
      assert.match(error.message, /9\.9\.9/);
      return true;
    },
    'a versioned claim never binds an unversioned artifact',
  );
});

// ---------------------------------------------------------------------------
// Ambiguous historical semantics fail closed
// ---------------------------------------------------------------------------

test('non-promoted envelope material fails typed instead of being guessed', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({ promotedSubworkflows: [subworkflow({ envelope: { schemaVersion: 'candidate-envelope-v2', candidateKind: 'workflow' } })] }),
      ),
    /schemaVersion/,
  );
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({ promotedSubworkflows: [subworkflow({ envelope: { schemaVersion: 'candidate-envelope-v1', candidateKind: 'rule' } })] }),
      ),
    /candidateKind/,
  );
});

test('an ambiguous control graph fails typed (duplicate nodes, undeclared endpoints, duplicate edges, cycles)', () => {
  const withControl = (controlValue: Record<string, unknown>) =>
    input({
      harnessConfigs: [],
      promotedSubworkflows: [
        subworkflow({
          envelope: { ...(promotedEnvelope() as Record<string, unknown>), control: controlValue },
        }),
      ],
    });

  // duplicate node identities
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        withControl({ startNode: 'a', nodes: ['a', 'a'], edges: [], maxSteps: 4 }),
      ),
    /NOT_TRANSLATABLE/,
  );
  // edge endpoint not declared
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        withControl({ startNode: 'a', nodes: ['a'], edges: [{ from: 'a', to: 'ghost' }], maxSteps: 4 }),
      ),
    /NOT_TRANSLATABLE/,
  );
  // duplicate edge
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        withControl({ startNode: 'a', nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b' }, { from: 'a', to: 'b' }], maxSteps: 4 }),
      ),
    /NOT_TRANSLATABLE/,
  );
  // self cycle
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        withControl({ startNode: 'a', nodes: ['a'], edges: [{ from: 'a', to: 'a' }], maxSteps: 4 }),
      ),
    /NOT_TRANSLATABLE/,
  );
  // control-flow cycle
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        withControl({
          startNode: 'a',
          nodes: ['a', 'b'],
          edges: [
            { from: 'a', to: 'b' },
            { from: 'b', to: 'a' },
          ],
          maxSteps: 4,
        }),
      ),
    /NOT_TRANSLATABLE/,
  );
  // startNode outside declared nodes / non-positive maxSteps
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        withControl({ startNode: 'ghost', nodes: ['a'], edges: [], maxSteps: 4 }),
      ),
    /NOT_TRANSLATABLE/,
  );
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        withControl({ startNode: 'a', nodes: ['a'], edges: [], maxSteps: 0 }),
      ),
    /NOT_TRANSLATABLE/,
  );
});

test('an unknown promoted child step kind fails typed — unknown material Workflow semantics are never guessed', () => {
  const envelope = promotedEnvelope() as Record<string, unknown>;
  const body = envelope.body as Record<string, unknown>;
  body.nodes = [
    { node: 'fetch', step: { kind: 'quantum-leap', tool: { ...TOOL_REF } } },
  ];
  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ promotedSubworkflows: [subworkflow({ envelope })] })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /quantum-leap/);
      return true;
    },
  );
});

test('a reasoned step binding a non-harness-config reference fails typed', () => {
  const envelope = promotedEnvelope() as Record<string, unknown>;
  const body = envelope.body as Record<string, unknown>;
  body.nodes = [
    { node: 'decide', step: { kind: 'reasoned', harnessConfig: { kind: 'tool', artifactId: 'tool.pricing', contentDigest: 'digest-tool-pricing' } } },
  ];
  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ promotedSubworkflows: [subworkflow({ envelope })] })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /reasoned/);
      return true;
    },
  );
});

test('non-JSON, accessor-backed, symbol-keyed, exotic-prototype and circular historical material fails typed', () => {
  const accessorEnvelope = {} as Record<string, unknown>;
  let reads = 0;
  Object.defineProperty(accessorEnvelope, 'schemaVersion', {
    enumerable: true,
    get() {
      reads += 1;
      return 'candidate-envelope-v1';
    },
  });
  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ promotedSubworkflows: [subworkflow({ envelope: accessorEnvelope })] })),
    /NOT_TRANSLATABLE/,
  );
  assert.equal(reads, 0, 'accessors are never executed');

  const symbolEnvelope: Record<string, unknown> = { schemaVersion: 'candidate-envelope-v1', candidateKind: 'workflow' };
  (symbolEnvelope as Record<string | symbol, unknown>)[Symbol('extra')] = 1;
  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ promotedSubworkflows: [subworkflow({ envelope: symbolEnvelope })] })),
    /NOT_TRANSLATABLE/,
  );

  const exoticEnvelope = Object.create({ stray: true }) as Record<string, unknown>;
  exoticEnvelope.schemaVersion = 'candidate-envelope-v1';
  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ promotedSubworkflows: [subworkflow({ envelope: exoticEnvelope as JsonValue })] })),
    /NOT_TRANSLATABLE/,
    'exotic prototypes are not portable JSON',
  );

  const circular: Record<string, unknown> = { schemaVersion: 'candidate-envelope-v1', candidateKind: 'workflow' };
  circular.self = circular;
  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ promotedSubworkflows: [subworkflow({ envelope: circular })] })),
    /NOT_TRANSLATABLE/,
  );

  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(input({ harnessConfigs: [harnessConfig({ material: [1, 2, 3] as unknown as JsonValue })] })),
    /NOT_TRANSLATABLE/,
    'harness material must be a record, never an array',
  );
});

test('non-exact historical identities fail typed and are never rewritten', () => {
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          harnessConfigs: [harnessConfig({ identity: { kind: 'harness-config', artifactId: 'harness@1', contentDigest: 'digest' } })],
        }),
      ),
    /NOT_TRANSLATABLE/,
  );
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          harnessConfigs: [harnessConfig({ identity: { kind: 'harness-config', artifactId: 'harness.x', version: '1.x', contentDigest: 'digest' } })],
        }),
      ),
    /NOT_TRANSLATABLE/,
  );
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          harnessConfigs: [harnessConfig({ identity: { kind: 'harness-config', artifactId: 'harness.x', contentDigest: '' } })],
        }),
      ),
    /NOT_TRANSLATABLE/,
  );
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        input({
          promotedSubworkflows: [subworkflow({ identity: { kind: 'promoted-subworkflow', artifactId: 'latest', contentDigest: 'digest' }, envelope: { schemaVersion: 'candidate-envelope-v1', candidateKind: 'workflow' } })],
        }),
      ),
    /NOT_TRANSLATABLE/,
    'floating artifactId is never silently accepted',
  );
});

test('the mapping input shape is closed: unknown top-level fields fail typed', () => {
  const smuggled = input({}) as Record<string, unknown>;
  smuggled.sources = [{ decisionId: 'd', source: 'latest' }];
  assert.throws(
    () => mapHarnessConfigPromotedSubworkflowToComponentGraph(smuggled as unknown as CompatMappingInput),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /INVALID_COMPAT_INPUT/);
      return true;
    },
  );
});

test('an empty compat mapping is deterministic and yields a valid empty graph', async () => {
  const empty = input({ promotedSubworkflows: [], harnessConfigs: [], decisionSources: [] });
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(empty);
  assert.equal(result.graph.components.length, 0);
  assert.equal(result.graph.relations.length, 0);
  assert.doesNotThrow(() => validateDefinitionGraphEnvelope(result.graph));
  assert.deepEqual(result, mapHarnessConfigPromotedSubworkflowToComponentGraph(empty));
});

// ---------------------------------------------------------------------------
// Caller isolation and no legacy runtime bypass
// ---------------------------------------------------------------------------

test('mutating the caller material after mapping never perturbs the product', async () => {
  const callerInput = input();
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(callerInput);
  const digest = await graphDigest(result.graph);

  const envelope = (callerInput.promotedSubworkflows as readonly CompatHistoricalPromotedSubworkflow[])[0]
    .envelope as Record<string, unknown>;
  (envelope.control as Record<string, unknown>).maxSteps = 999;
  const material = (callerInput.harnessConfigs as readonly CompatHistoricalHarnessConfig[])[0]
    .material as Record<string, unknown>;
  material.bounds = { maxSteps: 1 };

  assert.equal(await graphDigest(result.graph), digest);
  const body = componentById(result.graph, 'promoted.orderDecision').semanticBody as Record<string, unknown>;
  assert.equal((body.control as Record<string, unknown>).maxSteps, 8);
});

test('the product holds no aliases into caller-owned material', () => {
  const callerInput = input();
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(callerInput);

  const promoted = componentById(result.graph, 'promoted.orderDecision');
  assert.notEqual(promoted.semanticBody, (callerInput.promotedSubworkflows as readonly CompatHistoricalPromotedSubworkflow[])[0].envelope);
  const harness = componentById(result.graph, 'harness.orderDecision');
  assert.notEqual(harness.semanticBody, (callerInput.harnessConfigs as readonly CompatHistoricalHarnessConfig[])[0].material);
  assert.notEqual(result.provenance.components[0].historicalIdentity, SUBWORKFLOW_IDENTITY);
});

test('own data `__proto__` inside historical material is preserved verbatim as data, never as prototype mutation', () => {
  const envelope = { schemaVersion: 'candidate-envelope-v1', candidateKind: 'workflow', control: { startNode: 'n', nodes: ['n'], edges: [], maxSteps: 1 } } as Record<string, unknown>;
  const protoMaterial = { kind: 'object', value: { ['__proto__']: { polluted: true } } };
  (envelope as Record<string, unknown>).historicalExtra = protoMaterial;

  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(
    input({ promotedSubworkflows: [subworkflow({ envelope: envelope as JsonValue })] }),
  );
  const body = componentById(result.graph, 'promoted.orderDecision').semanticBody as Record<string, unknown>;
  const preserved = (body.historicalExtra as Record<string, unknown>).value as Record<string, unknown>;
  assert.deepEqual(Object.getOwnPropertyDescriptor(preserved, '__proto__')?.value, { polluted: true });
  assert.equal(Object.getPrototypeOf(preserved), Object.prototype);
  assert.equal(({} as Record<string, unknown>).polluted, undefined, 'no global prototype pollution');
});

test('the product is plain JSON evidence: no functions, handles or runtime instances survive mapping', () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  const roundTripped = JSON.parse(JSON.stringify({ graph: result.graph, provenance: result.provenance }));
  assert.deepEqual(roundTripped.graph, JSON.parse(JSON.stringify(result.graph)));
  assert.deepEqual(roundTripped.provenance, result.provenance);
  assert.equal(Object.isFrozen(COMPAT_PROMOTED_SUBWORKFLOW_KIND), true);
  assert.equal(Object.isFrozen(COMPAT_HARNESS_CONFIG_KIND), true);
});

test('compat material composes only through the standard graph authority — no parallel identity or side digest', async () => {
  const result = mapHarnessConfigPromotedSubworkflowToComponentGraph(input());
  // The only digest surface is the standard normalized Definition graph digest.
  assert.equal(typeof (result as Record<string, unknown>).digest, 'undefined');
  assert.equal(typeof (result.graph as Record<string, unknown>).digest, 'undefined');
  const standard = await graphDigest(result.graph);
  assert.equal(standard, await computeDefinitionGraphDigest(result.graph, sha256));
});
