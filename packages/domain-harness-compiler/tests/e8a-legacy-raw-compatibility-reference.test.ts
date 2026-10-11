/**
 * E8a executable reference — Legacy Raw compatibility evidence
 * (issue #877; authority #589@<pack-d> PACK-D E8a + #714 readiness + #714
 * WEB JIT release; DAG #534 E8a; predecessors T008A@1cb0f66, T008B@b3b7113,
 * T008C@a537278, T008D@6e19a6c — all accepted before this reference runs).
 *
 * ENVIRONMENT=LOCAL_AGENT (ZCode kimi-executor, kimi-for-coding).
 * REAL_HOST_POSTURE=LOCAL_SUPPORTED_NODE_HOST_FOR_NPM_PACK_CLEAN_CONSUMER.
 * SOURCE_MUTATION=NONE (tests-only write set: this single bounded file).
 *
 * Reference-falsification scope under test (PACK-D E8a, without final v0.6
 * reconciliation):
 *  - accepted historical Raw authoring (one frozen representable legacy
 *    package, exact historical identities + harness-config + exactly one
 *    promoted-subworkflow) deterministically maps to the v0.7 Component
 *    Graph through the accepted T008A adapter — same Raw + same rules =>
 *    same graph semantic digest, input-order permutations invariant;
 *  - legacy identity correspondence is exact/evidence-visible through the
 *    accepted T008B artifact: byte/value-exact historical identities bound to
 *    the canonical DefinitionGraphDigest; missing/extra/duplicate/ambiguous
 *    correspondence fails typed (no one-to-many rule, no heuristic match);
 *  - historical harness-config / promoted-subworkflow map through the
 *    accepted T008D concern into ordinary Semantic Components on exact compat
 *    Kinds + typed relations; DecisionResolver source authority stays with
 *    the frozen resolver source order (rule -> exact-cache -> promoted
 *    subworkflow -> HarnessMachine), never with incidental config order;
 *  - mapped compat material is admitted only through the generic public v0.7
 *    must-understand seam (`@kaicreator/domain-harness/v7` admitComponent) —
 *    the same public successor surface the accepted compat modules themselves
 *    consume; the sealed-Runtime-Assembly mint/currentness seam is core-
 *    internal evidence owned by E2/E3/E10 (accepted before this BASE) — the
 *    anti-forgery consequence is re-proven here publicly: activation accepts
 *    only seal-minted assemblies, so Raw/mapping JSON can never bypass into
 *    runtime authority;
 *  - old public/compiler imports remain valid while `/v7` is additive,
 *    proven from the packed core+compiler tarballs in a clean npm consumer
 *    (root legacy imports, nominal `/v7` imports, deep-import rejection by
 *    the package `exports` map);
 *  - ambiguous/unrepresentable legacy semantics fail typed/closed —
 *    never closest-match/latest/default/first-wins;
 *  - runtime truth flows only through the admitted Component Graph: the
 *    mapping result is JSON evidence only (no handles, no reverse seam), and
 *    Raw or caller-constructed material is rejected by the public activation
 *    brand gate before any durable bind.
 *
 * Fixture freeze (REFERENCE_FIXTURE_FREEZE from #877, verbatim values):
 *   MANIFEST_ID=E8A_LEGACY_RAW_COMPAT_V1
 *   MANIFEST_VERSION=1
 *   MANIFEST_CANONICAL_JSON_SHA256=6d8b50d577804178e22995405861539949758b437a03c2107b1824b59b0449b3
 *   LEGACY_FIXTURE=e8a.legacy.raw.v1
 *   AUTHORITY_CLASS=PRODUCTION_CONTROL_ONLY; Raw/legacy carries NO runtime/effect authority
 *   NEGATIVE_PERMUTATION_MATRIX=deterministic-raw-map;identity-correspondence;packed-consumer-root;packed-consumer-v7;deep-import-reject;harness-config-map;promoted-subworkflow-map;decision-source-order;ambiguous-unrepresentable-reject;no-raw-runtime-bypass
 *
 * OBSERVED_LIMIT (#877 does not specify the canonical-JSON grammar behind
 * MANIFEST_CANONICAL_JSON_SHA256): the freeze is pinned here by manifest
 * id/version/verbatim field values; the behavioral matrix below is
 * independent of reproducing that serialization. The correspondence digest
 * recorded below is this suite's own canonical-JSON evidence digest (sorted
 * keys, UTF-8), not a reproduction of the manifest digest.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stagePackedWorkspaces } from './packed-fixture-stage.js';
import {
  admitComponent,
  ComponentAdmissionError,
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  validateToolComponent,
  type ComponentEnvelope,
  type DefinitionGraphEnvelope,
  type Sha256Port,
  type UnderstoodKindDeclaration,
} from '@kaicreator/domain-harness/v7';
import {
  AssemblyExecutionActivator,
  GovernanceExecutionBindingError,
  type ActivateAssemblyExecutionRequest,
  type DomainActivationBinding,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineStore,
} from '@kaicreator/domain-harness/v3';
import type {
  JsonValue,
  LoadedRawDomainPackage,
  RawProjectionDefinition,
  RawToolDefinition,
  RawWorkflow,
} from '../src/raw/types.js';
import {
  mapRawV07AuthoringToComponentGraph,
  RAW_V07_PROJECTION_KIND,
  RAW_V07_TOOL_KIND,
  RAW_V07_WORKFLOW_KIND,
  RawV07AdapterError,
  type RawV07AuthoringInput,
  type RawV07ComponentProvenance,
  type RawV07GraphMappingResult,
} from '../src/compat/raw-v07/index.js';
import {
  buildRawV07IdentityCorrespondence,
  RawV07IdentityCorrespondenceError,
  type RawV07IdentityCorrespondence,
} from '../src/compat/raw-v07/identity-correspondence.js';
import {
  COMPAT_DECISION_RESOLVER_SOURCE_ORDER,
  COMPAT_HARNESS_CONFIG_KIND,
  COMPAT_PROMOTED_SUBWORKFLOW_KIND,
  COMPAT_REFERENCES_RELATION_KIND,
  CompatHarnessConfigMappingError,
  mapHarnessConfigPromotedSubworkflowToComponentGraph,
  type CompatDecisionSourceDeclaration,
  type CompatHistoricalArtifactIdentity,
  type CompatHistoricalHarnessConfig,
  type CompatHistoricalPromotedSubworkflow,
  type CompatMappingInput,
  type CompatMappingResult,
} from '../src/compat/raw-v07/harness-config-promoted-subworkflow.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Frozen manifest constants (#877 REFERENCE_FIXTURE_FREEZE, verbatim).
// ---------------------------------------------------------------------------

const MANIFEST = {
  MANIFEST_ID: 'E8A_LEGACY_RAW_COMPAT_V1',
  MANIFEST_VERSION: 1,
  MANIFEST_CANONICAL_JSON_SHA256:
    '6d8b50d577804178e22995405861539949758b437a03c2107b1824b59b0449b3',
  LEGACY_FIXTURE: 'e8a.legacy.raw.v1',
  AUTHORITY_CLASS: 'PRODUCTION_CONTROL_ONLY',
  NEGATIVE_PERMUTATION_MATRIX:
    'deterministic-raw-map;identity-correspondence;packed-consumer-root;packed-consumer-v7;deep-import-reject;harness-config-map;promoted-subworkflow-map;decision-source-order;ambiguous-unrepresentable-reject;no-raw-runtime-bypass',
} as const;

const OBJECT_SCHEMA = { type: 'object' } as const;

const DOMAIN_ID = 'domain.e8a.legacy';
const SOURCE_ROOT = '/legacy/e8a';
const WORKFLOW_ID = 'wf.e8a.order';
const TOOL_ID = 'tool.e8a.pricing';
const PROJECTION_ID = 'proj.e8a.orderTotal';
const HARNESS_ID = 'harness.e8a.orderDecision';
const PROMOTED_ID = 'promoted.e8a.orderDecision';
const PROMOTED_VERSION = '3.1.0';
const TOOL_DIGEST = 'digest-e8a-tool-pricing';
const HARNESS_DIGEST = 'digest-e8a-harness-order';
const PROMOTED_DIGEST = 'digest-e8a-promoted-order';

/** Exact Kind/implementation pins recorded at freeze for the ordinary v0.7 path. */
const KIND_PINS = {
  workflow: RAW_V07_WORKFLOW_KIND,
  tool: RAW_V07_TOOL_KIND,
  projection: RAW_V07_PROJECTION_KIND,
  promotedSubworkflow: COMPAT_PROMOTED_SUBWORKFLOW_KIND,
  harnessConfig: COMPAT_HARNESS_CONFIG_KIND,
} as const;

/** Test-only implementation pins paired with the exact Kind pins above. */
const IMPLEMENTATION_PINS = {
  [RAW_V07_WORKFLOW_KIND.kindId]: {
    implementationId: 'impl.e8a.workflow-adapter',
    implementationVersion: '1.0.0',
    implementationDigest: `sha256:${'11'.repeat(32)}`,
  },
  [RAW_V07_TOOL_KIND.kindId]: {
    implementationId: 'impl.e8a.tool-adapter',
    implementationVersion: '1.0.0',
    implementationDigest: `sha256:${'22'.repeat(32)}`,
  },
  [RAW_V07_PROJECTION_KIND.kindId]: {
    implementationId: 'impl.e8a.projection-adapter',
    implementationVersion: '1.0.0',
    implementationDigest: `sha256:${'33'.repeat(32)}`,
  },
  [COMPAT_PROMOTED_SUBWORKFLOW_KIND.kindId]: {
    implementationId: 'impl.e8a.promoted-subworkflow-adapter',
    implementationVersion: '1.0.0',
    implementationDigest: `sha256:${'44'.repeat(32)}`,
  },
  [COMPAT_HARNESS_CONFIG_KIND.kindId]: {
    implementationId: 'impl.e8a.harness-config-adapter',
    implementationVersion: '1.0.0',
    implementationDigest: `sha256:${'55'.repeat(32)}`,
  },
} as const;

// ---------------------------------------------------------------------------
// Fixture builders — one representable historical Raw package
// (e8a.legacy.raw.v1) with exact historical identities, harness-config and
// exactly one promoted-subworkflow.
// ---------------------------------------------------------------------------

function workflow(overrides: Partial<RawWorkflow> = {}): RawWorkflow {
  return {
    id: WORKFLOW_ID,
    sourcePath: 'workflows/order.yaml',
    initial: 'start',
    states: {
      start: {
        id: 'start',
        final: false,
        invoke: { kind: 'tool', ref: TOOL_ID },
        done: [{ target: 'end' }],
        error: [],
        events: {},
      },
      end: { id: 'end', final: true, done: [], error: [], events: {} },
    },
    ...overrides,
  };
}

function rawPackage(overrides: Partial<LoadedRawDomainPackage> = {}): LoadedRawDomainPackage {
  return {
    root: SOURCE_ROOT,
    schemaVersion: '0.1',
    domainId: DOMAIN_ID,
    limits: { maxSteps: 100 },
    workflows: new Map([[WORKFLOW_ID, workflow()]]),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(),
    ...overrides,
  };
}

function tool(overrides: Partial<RawToolDefinition> = {}): RawToolDefinition {
  return {
    toolId: TOOL_ID,
    inputSchema: OBJECT_SCHEMA,
    outputSchema: OBJECT_SCHEMA,
    effect: 'idempotent',
    executionKind: 'remote-http-json',
    requiredCapabilities: ['http-transport@1'],
    config: { resourceKey: 'pricing-endpoint' },
    ...overrides,
  };
}

function projection(overrides: Partial<RawProjectionDefinition> = {}): RawProjectionDefinition {
  return {
    projectionId: PROJECTION_ID,
    expression: '$sum(items.price)',
    dependencies: [{ kind: 'domain-data', key: 'catalog' }],
    outputSchema: OBJECT_SCHEMA,
    ...overrides,
  };
}

function authoringInput(overrides: Partial<RawV07AuthoringInput> = {}): RawV07AuthoringInput {
  return { raw: rawPackage(), tools: [tool()], projections: [projection()], ...overrides };
}

const TOOL_REF = Object.freeze({ kind: 'tool', artifactId: TOOL_ID, contentDigest: TOOL_DIGEST });

const HARNESS_IDENTITY: CompatHistoricalArtifactIdentity = Object.freeze({
  kind: 'harness-config',
  artifactId: HARNESS_ID,
  contentDigest: HARNESS_DIGEST,
});

const SUBWORKFLOW_IDENTITY: CompatHistoricalArtifactIdentity = Object.freeze({
  kind: 'promoted-subworkflow',
  artifactId: PROMOTED_ID,
  version: PROMOTED_VERSION,
  contentDigest: PROMOTED_DIGEST,
});

function promotedEnvelope(): JsonValue {
  return {
    schemaVersion: 'candidate-envelope-v1',
    candidateKind: 'workflow',
    candidateId: 'candidate.e8a.orderDecision',
    bodyContract: {
      kind: 'knowledge',
      artifactId: 'knowledge.e8a.orderContract',
      contentDigest: 'digest-e8a-knowledge-order',
    },
    io: { inputs: [], outputs: [] },
    capabilities: [],
    tools: [{ ...TOOL_REF, capability: 'query' }],
    events: [],
    mutation: { kind: 'none' },
    references: [
      { kind: 'rule', artifactId: 'rule.e8a.orderFallthrough', contentDigest: 'digest-e8a-rule-order' },
      { kind: 'harness-config', artifactId: HARNESS_ID, contentDigest: HARNESS_DIGEST },
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
          step: {
            kind: 'reasoned',
            harnessConfig: {
              kind: 'harness-config',
              artifactId: HARNESS_ID,
              contentDigest: HARNESS_DIGEST,
            },
          },
        },
        {
          node: 'finish',
          step: {
            kind: 'terminal-output',
            output: { kind: 'step-output', node: 'decide', path: 'decision' },
          },
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
    decisionId: 'decision.e8a.orderTotal',
    source: 'promoted-subworkflow',
    artifact: {
      kind: 'promoted-subworkflow',
      artifactId: PROMOTED_ID,
      version: PROMOTED_VERSION,
      contentDigest: PROMOTED_DIGEST,
    },
    ...overrides,
  };
}

function compatInput(overrides: Partial<CompatMappingInput> = {}): CompatMappingInput {
  return {
    graphId: DOMAIN_ID,
    promotedSubworkflows: [subworkflow()],
    harnessConfigs: [harnessConfig()],
    decisionSources: [declaration()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

function componentById(
  components: readonly ComponentEnvelope[],
  componentId: string,
): ComponentEnvelope {
  const found = components.find((candidate) => candidate.componentId === componentId);
  assert.ok(found, `component ${componentId} is bound in the mapped graph`);
  return found;
}

function relationsFrom(graph: DefinitionGraphEnvelope, sourceComponentId: string) {
  return graph.relations.filter((relation) => relation.sourceComponentId === sourceComponentId);
}

/** Deterministic canonical JSON (sorted keys, UTF-8) for evidence digests. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const body = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',');
  return `{${body}}`;
}

async function digestUtf8(value: string): Promise<string> {
  return sha256.digestUtf8(value);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** The exact understood set of the ordinary v0.7 admission path for this graph. */
function understoodKinds(): readonly UnderstoodKindDeclaration[] {
  const closedValidator = () => undefined;
  return [
    {
      kind: KIND_PINS.workflow,
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: closedValidator,
    },
    {
      kind: KIND_PINS.tool,
      understoodSemanticContracts: [],
      understoodCapabilities: [{ capabilityId: 'http-transport', version: '1' }],
      validateComponent: closedValidator,
    },
    {
      kind: KIND_PINS.projection,
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: closedValidator,
    },
    {
      kind: KIND_PINS.promotedSubworkflow,
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: closedValidator,
    },
    {
      kind: KIND_PINS.harnessConfig,
      understoodSemanticContracts: [],
      understoodCapabilities: [],
      validateComponent: closedValidator,
    },
  ];
}

// ---------------------------------------------------------------------------
// Freeze preflight — all identity capture happens BEFORE any behavioral
// matrix assertion, then the record is immutable for the whole suite.
// ---------------------------------------------------------------------------

interface E8aFreeze {
  readonly manifest: typeof MANIFEST;
  readonly legacyIdentities: {
    readonly rawPackage: {
      readonly schemaVersion: '0.1';
      readonly domainId: string;
      readonly sourceRoot: string;
      readonly workflowIds: readonly string[];
      readonly toolIds: readonly string[];
      readonly projectionIds: readonly string[];
    };
    readonly harnessConfig: CompatHistoricalArtifactIdentity;
    readonly promotedSubworkflow: CompatHistoricalArtifactIdentity;
    readonly decisionSources: readonly CompatDecisionSourceDeclaration[];
  };
  readonly mappingA: RawV07GraphMappingResult;
  readonly mappingD: CompatMappingResult;
  readonly mergedGraph: DefinitionGraphEnvelope;
  readonly definitionGraphDigest: string;
  readonly correspondence: RawV07IdentityCorrespondence;
  readonly correspondenceDigest: string;
  readonly admitted: ReadonlyArray<{ readonly componentId: string; readonly kindKey: string }>;
  readonly kindPins: typeof KIND_PINS;
  readonly implementationPins: typeof IMPLEMENTATION_PINS;
}

let freezePromise: Promise<E8aFreeze> | undefined;

/** Build (once) and freeze every identity the matrix later inspects. */
async function frozen(): Promise<E8aFreeze> {
  if (freezePromise !== undefined) return freezePromise;
  freezePromise = (async (): Promise<E8aFreeze> => {
    // 1. Accepted T008A mapping of the frozen legacy Raw package.
    const mappingA = mapRawV07AuthoringToComponentGraph(authoringInput());
    // 2. Accepted T008D mapping of the historical harness-config + the single
    //    promoted-subworkflow under the same graph identity.
    const mappingD = mapHarnessConfigPromotedSubworkflowToComponentGraph(compatInput());
    // 3. The admitted v0.7 Component Graph: the ordinary Definition graph the
    //    runtime path would seal over (raw authoring and historical compat
    //    material merged; both halves already pass the standard envelope gate
    //    on their own).
    const mergedGraph: DefinitionGraphEnvelope = {
      graphId: DOMAIN_ID,
      components: [...mappingA.graph.components, ...mappingD.graph.components],
      relations: [...mappingA.graph.relations, ...mappingD.graph.relations],
    };
    validateDefinitionGraphEnvelope(mergedGraph);
    // 4. Canonical Definition identity through the public standard seam.
    const definitionGraphDigest = await computeDefinitionGraphDigest(mergedGraph, sha256);
    // 5. Accepted T008B immutable identity correspondence artifact.
    const correspondence = await buildRawV07IdentityCorrespondence(mappingA, sha256);
    const correspondenceDigest = await digestUtf8(canonicalJson(correspondence));
    // 6. Generic must-understand admission of every mapped component through
    //    the public /v7 seam with the exact recorded Kind pins.
    const understood = understoodKinds();
    const admitted = mergedGraph.components.map((component) => {
      const result = admitComponent(component, understood);
      assert.equal(result.status, 'ADMITTED', `component ${component.componentId} is admitted`);
      if (component.family === 'tool') {
        validateToolComponent(component);
      }
      return {
        componentId: component.componentId,
        kindKey: `${component.kind.kindId}@${component.kind.version}`,
      };
    });

    return deepFreeze({
      manifest: MANIFEST,
      legacyIdentities: {
        rawPackage: {
          schemaVersion: '0.1',
          domainId: DOMAIN_ID,
          sourceRoot: SOURCE_ROOT,
          workflowIds: [WORKFLOW_ID],
          toolIds: [TOOL_ID],
          projectionIds: [PROJECTION_ID],
        },
        harnessConfig: { ...HARNESS_IDENTITY },
        promotedSubworkflow: { ...SUBWORKFLOW_IDENTITY },
        decisionSources: [declaration()],
      },
      mappingA,
      mappingD,
      mergedGraph,
      definitionGraphDigest,
      correspondence,
      correspondenceDigest,
      admitted,
      kindPins: KIND_PINS,
      implementationPins: IMPLEMENTATION_PINS,
    }) as E8aFreeze;
  })();
  return freezePromise;
}

test('E8a freeze preflight: exact identities captured before outcome inspection', async () => {
  const fx = await frozen();

  // Manifest freeze, verbatim.
  assert.equal(fx.manifest.MANIFEST_ID, 'E8A_LEGACY_RAW_COMPAT_V1');
  assert.equal(fx.manifest.MANIFEST_VERSION, 1);
  assert.equal(
    fx.manifest.MANIFEST_CANONICAL_JSON_SHA256,
    '6d8b50d577804178e22995405861539949758b437a03c2107b1824b59b0449b3',
  );
  assert.equal(fx.manifest.LEGACY_FIXTURE, 'e8a.legacy.raw.v1');
  assert.equal(fx.manifest.AUTHORITY_CLASS, 'PRODUCTION_CONTROL_ONLY');

  // Exact historical identities, verbatim.
  assert.equal(fx.legacyIdentities.rawPackage.domainId, DOMAIN_ID);
  assert.equal(fx.legacyIdentities.rawPackage.sourceRoot, SOURCE_ROOT);
  assert.deepEqual(fx.legacyIdentities.harnessConfig, HARNESS_IDENTITY);
  assert.deepEqual(fx.legacyIdentities.promotedSubworkflow, SUBWORKFLOW_IDENTITY);
  assert.deepEqual(fx.legacyIdentities.decisionSources, [declaration()]);

  // Captured identities (recorded here once; the terminal on #877 carries
  // these exact values).
  assert.match(fx.definitionGraphDigest, /^[0-9a-f]{64}$/);
  assert.match(fx.correspondenceDigest, /^[0-9a-f]{64}$/);
  assert.equal(
    fx.correspondence.definitionGraphDigest,
    await computeDefinitionGraphDigest(fx.mappingA.graph, sha256),
  );
  assert.equal(fx.admitted.length, fx.mergedGraph.components.length);
  assert.deepEqual(
    fx.admitted.map((entry) => entry.componentId).sort(),
    [
      HARNESS_ID,
      PROJECTION_ID,
      PROMOTED_ID,
      TOOL_ID,
      WORKFLOW_ID,
    ],
  );

  console.log('E8A_FREEZE_RECORD', JSON.stringify({
    definitionGraphDigest: fx.definitionGraphDigest,
    correspondenceDigest: fx.correspondenceDigest,
    admitted: fx.admitted,
    kindPins: fx.kindPins,
    implementationPins: fx.implementationPins,
  }));
});

// ---------------------------------------------------------------------------
// Matrix row 1: deterministic-raw-map
// ---------------------------------------------------------------------------

test('E8a deterministic-raw-map: same Raw + same rules => same graph semantic digest', async () => {
  const fx = await frozen();
  const replay = mapRawV07AuthoringToComponentGraph(authoringInput());

  assert.deepEqual(replay.graph, fx.mappingA.graph);
  assert.deepEqual(replay.provenance, fx.mappingA.provenance);
  assert.equal(
    await computeDefinitionGraphDigest(replay.graph, sha256),
    await computeDefinitionGraphDigest(fx.mappingA.graph, sha256),
  );
});

test('E8a deterministic-raw-map: Raw collection insertion-order permutation never changes the product', async () => {
  const fx = await frozen();
  // Rebuild the same logical package with reversed Map insertion orders.
  const reversed = rawPackage();
  reversed.workflows = new Map([[WORKFLOW_ID, workflow()]]);
  const reorderedRaw = rawPackage({
    workflows: new Map([...reversed.workflows].reverse()),
  });
  const permuted = mapRawV07AuthoringToComponentGraph({
    raw: reorderedRaw,
    tools: [...authoringInput().tools!].reverse(),
    projections: [...authoringInput().projections!].reverse(),
  });

  assert.deepEqual(permuted.graph, fx.mappingA.graph);
  assert.deepEqual(permuted.provenance, fx.mappingA.provenance);
  assert.equal(
    await computeDefinitionGraphDigest(permuted.graph, sha256),
    await computeDefinitionGraphDigest(fx.mappingA.graph, sha256),
  );
});

test('E8a deterministic-raw-map: post-mapping Raw mutation cannot perturb the accepted product', async () => {
  const fx = await frozen();
  const digestBefore = await computeDefinitionGraphDigest(fx.mappingA.graph, sha256);

  // Hostile caller mutation AFTER the accepted mapping: rename the domain,
  // clear the workflow states and swap the tool identity.
  const hostile = rawPackage();
  (hostile as { domainId: string }).domainId = 'domain.MUTATED';
  const wf = hostile.workflows.get(WORKFLOW_ID)!;
  (wf as { states: unknown }).states = {};
  const tamperedTool = tool({ toolId: 'tool.MUTATED' });

  validateDefinitionGraphEnvelope(fx.mappingA.graph);
  assert.equal(
    await computeDefinitionGraphDigest(fx.mappingA.graph, sha256),
    digestBefore,
    'the accepted mapping is isolated from later Raw mutation',
  );
  // Re-mapping the tampered authoring fails or diverges — it never silently
  // rewrites the already-accepted graph.
  assert.notDeepEqual(
    mapRawV07AuthoringToComponentGraph({ raw: hostile, tools: [tamperedTool] }).graph,
    fx.mappingA.graph,
  );
});

// ---------------------------------------------------------------------------
// Matrix row 2: identity-correspondence
// ---------------------------------------------------------------------------

test('E8a identity-correspondence: exact historical identities bound to the canonical graph digest', async () => {
  const fx = await frozen();
  const correspondence = fx.correspondence;

  assert.equal(correspondence.domainId, DOMAIN_ID);
  assert.equal(correspondence.graphId, DOMAIN_ID);
  assert.equal(correspondence.sourceRoot, SOURCE_ROOT);
  // The correspondence digest recorded at freeze is the canonical-JSON
  // evidence digest of exactly this artifact.
  assert.equal(await digestUtf8(canonicalJson(correspondence)), fx.correspondenceDigest);
  // Canonically ordered by componentId.
  const ids = correspondence.entries.map((entry) => entry.componentId);
  assert.deepEqual(ids, [...ids].sort());
  assert.deepEqual(ids.sort(), [PROJECTION_ID, TOOL_ID, WORKFLOW_ID]);
  // Every entry preserves its exact historical identity from the accepted
  // T008A provenance, and the artifact binds the canonical graph digest of
  // the accepted graph.
  for (const entry of correspondence.entries) {
    const provenance = fx.mappingA.provenance.components.find(
      (candidate) => candidate.componentId === entry.componentId,
    );
    assert.ok(provenance, `provenance for ${entry.componentId}`);
    assert.equal(entry.sourceKind, provenance.sourceKind);
    assert.deepEqual(entry.historicalIdentity, provenance.historicalIdentity);
  }
  assert.equal(
    correspondence.definitionGraphDigest,
    await computeDefinitionGraphDigest(fx.mappingA.graph, sha256),
  );
});

test('E8a identity-correspondence: the artifact is immutable JSON evidence only — no executable material', async () => {
  const fx = await frozen();
  const correspondence = fx.correspondence;

  // Closed evidence key set; every value is portable JSON.
  assert.deepEqual(Object.keys(correspondence).sort(), [
    'definitionGraphDigest',
    'domainId',
    'entries',
    'evidenceKind',
    'graphId',
    'schemaVersion',
    'sourceRoot',
    'sourceSchemaVersion',
  ]);
  assert.equal(correspondence.evidenceKind, 'domain-harness.raw-v07-identity-correspondence');
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(correspondence)));
  // Deep-frozen: hostile mutation throws and never takes effect.
  assert.throws(
    () => {
      (correspondence as { domainId: string }).domainId = 'domain.FORGED';
    },
    TypeError,
  );
  assert.equal(fx.correspondence.domainId, DOMAIN_ID);
});

async function assertCorrespondenceRejects(
  build: () => Promise<unknown>,
  code: string,
  context: string,
): Promise<void> {
  await assert.rejects(build, (error: unknown) => {
    assert.ok(error instanceof RawV07IdentityCorrespondenceError, `${context}: typed correspondence error`);
    assert.equal(error.code, code, `${context}: ${code}`);
    return true;
  });
}

function withProvenance(
  mapping: RawV07GraphMappingResult,
  components: readonly RawV07ComponentProvenance[],
): RawV07GraphMappingResult {
  return { ...mapping, provenance: { ...mapping.provenance, components } };
}

test('E8a identity-correspondence: missing/extra/duplicate/ambiguous material fails typed, never guessed', async () => {
  const fx = await frozen();
  const mapping = fx.mappingA;

  const toolEntry = mapping.provenance.components.find((entry) => entry.componentId === TOOL_ID)!;

  // MISSING: a provenance identity with no graph component.
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        withProvenance(mapping, [
          ...mapping.provenance.components,
          { componentId: 'tool.e8a.ghost', sourceKind: 'tool', historicalIdentity: { toolId: 'tool.e8a.ghost' } },
        ]),
        sha256,
      ),
    'MISSING_IDENTITY_CORRESPONDENCE',
    'missing correspondence',
  );

  // EXTRA: a graph component without a provenance record.
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        withProvenance(
          mapping,
          mapping.provenance.components.filter((entry) => entry.componentId !== PROJECTION_ID),
        ),
        sha256,
      ),
    'EXTRA_IDENTITY_CORRESPONDENCE',
    'extra correspondence',
  );

  // DUPLICATE: the same provenance record twice.
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        withProvenance(mapping, [...mapping.provenance.components, toolEntry]),
        sha256,
      ),
    'DUPLICATE_IDENTITY_CORRESPONDENCE',
    'duplicate correspondence',
  );

  // AMBIGUOUS: one historical identity claimed by two component identities —
  // v0.7 accepts no one-to-many correspondence rule.
  const sharedIdentity = JSON.parse(JSON.stringify(toolEntry.historicalIdentity)) as Record<string, unknown>;
  const tamperedWorkflow: RawV07ComponentProvenance = {
    componentId: WORKFLOW_ID,
    sourceKind: 'workflow',
    historicalIdentity: sharedIdentity,
  };
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        withProvenance(
          mapping,
          mapping.provenance.components.map((entry) =>
            entry.componentId === WORKFLOW_ID ? tamperedWorkflow : entry,
          ),
        ),
        sha256,
      ),
    'AMBIGUOUS_IDENTITY_CORRESPONDENCE',
    'one-to-many correspondence',
  );
});

test('E8a identity-correspondence: the frozen artifact shares no live aliases with the accepted mapping', async () => {
  const fx = await frozen();
  const digestAtFreeze = fx.correspondenceDigest;

  // The accepted mapping material and the freeze record are both deeply
  // frozen: hostile mutation attempts throw synchronously and never take
  // effect, and the artifact digest is unchanged regardless.
  assert.throws(
    () => {
      (fx.mappingA.graph as { components: ComponentEnvelope[] }).components.pop();
    },
    TypeError,
  );
  assert.throws(
    () => {
      (fx.mappingA.provenance.components as unknown as Array<{ historicalIdentity: unknown }>)[0]!.historicalIdentity = { forged: true };
    },
    TypeError,
  );

  assert.equal(await digestUtf8(canonicalJson(fx.correspondence)), digestAtFreeze);
  assert.equal(fx.correspondence.entries.length, 3);
  assert.equal(fx.mappingA.provenance.components.length, 3);
});

// ---------------------------------------------------------------------------
// Matrix rows 6+7 (positive lanes): harness-config-map / promoted-subworkflow-map
// ---------------------------------------------------------------------------

test('E8a harness-config-map: historical harness-config maps to an ordinary Semantic Component on the exact compat Kind, verbatim', async () => {
  const fx = await frozen();
  const harness = componentById(fx.mergedGraph.components, HARNESS_ID);

  assert.equal(harness.family, 'semantic');
  assert.deepEqual(harness.kind, COMPAT_HARNESS_CONFIG_KIND);
  assert.deepEqual(harness.semanticBody, harnessMaterial());
  assert.equal(relationsFrom(fx.mergedGraph, HARNESS_ID).length, 0);
  // Historical identity preserved exactly in the mapping provenance.
  const provenance = fx.mappingD.provenance.components.find(
    (entry) => entry.componentId === HARNESS_ID,
  );
  assert.ok(provenance);
  assert.equal(provenance.historicalKind, 'harness-config');
  assert.deepEqual(provenance.historicalIdentity, { ...HARNESS_IDENTITY });
});

test('E8a promoted-subworkflow-map: the single promoted-subworkflow maps to a Workflow Semantic Component + typed relation, exact envelope preserved', async () => {
  const fx = await frozen();
  const promoted = componentById(fx.mergedGraph.components, PROMOTED_ID);

  assert.equal(promoted.family, 'semantic');
  assert.deepEqual(promoted.kind, COMPAT_PROMOTED_SUBWORKFLOW_KIND);
  // The mapped semanticBody is the exact canonical historical envelope
  // (behaviorally material fields verbatim; only object key order canonical).
  const body = promoted.semanticBody as Record<string, unknown>;
  assert.equal(body.schemaVersion, 'candidate-envelope-v1');
  assert.equal(body.candidateKind, 'workflow');
  assert.deepEqual(body.control, {
    startNode: 'fetch',
    nodes: ['fetch', 'decide', 'finish'],
    edges: [
      { from: 'fetch', to: 'decide' },
      { from: 'decide', to: 'finish' },
    ],
    maxSteps: 8,
  });
  assert.deepEqual(body.mutation, { kind: 'none' });

  // Exactly one typed references relation to the harness-config component;
  // the rule/tool references stay verbatim material and never dangle.
  const relations = relationsFrom(fx.mergedGraph, PROMOTED_ID);
  assert.equal(relations.length, 1);
  assert.equal(relations[0]!.relationKind, COMPAT_REFERENCES_RELATION_KIND);
  assert.equal(relations[0]!.targetComponentId, HARNESS_ID);
  assert.ok(
    !fx.mergedGraph.relations.some((relation) => relation.targetComponentId === 'rule.e8a.orderFallthrough'),
  );
  assert.ok(
    !fx.mergedGraph.relations.some((relation) => relation.targetComponentId === TOOL_ID && relation.sourceComponentId === PROMOTED_ID),
  );

  // Deterministic replay of the same historical material.
  const replay = mapHarnessConfigPromotedSubworkflowToComponentGraph(compatInput());
  assert.deepEqual(replay.graph, fx.mappingD.graph);
});

// ---------------------------------------------------------------------------
// Matrix row 8: decision-source-order
// ---------------------------------------------------------------------------

test('E8a decision-source-order: declaration input permutation never changes canonical decision-source evidence', async () => {
  const fx = await frozen();
  const ordered = mapHarnessConfigPromotedSubworkflowToComponentGraph(
    compatInput({
      decisionSources: [
        declaration(),
        declaration({
          decisionId: 'decision.e8a.machine',
          source: 'harness-machine',
          artifact: { kind: 'harness-config', artifactId: HARNESS_ID, contentDigest: HARNESS_DIGEST },
        }),
      ],
    }),
  );
  const permuted = mapHarnessConfigPromotedSubworkflowToComponentGraph(
    compatInput({
      decisionSources: [
        declaration({
          decisionId: 'decision.e8a.machine',
          source: 'harness-machine',
          artifact: { kind: 'harness-config', artifactId: HARNESS_ID, contentDigest: HARNESS_DIGEST },
        }),
        declaration(),
      ],
    }),
  );

  assert.deepEqual(permuted.provenance.decisionSources, ordered.provenance.decisionSources);
  assert.equal(
    await computeDefinitionGraphDigest(permuted.graph, sha256),
    await computeDefinitionGraphDigest(ordered.graph, sha256),
  );
  // Evidence is canonicalized by the frozen resolver source order, then
  // decisionId — never by incidental config/declaration order.
  assert.deepEqual(
    ordered.provenance.decisionSources.map((entry) => `${entry.source}:${entry.decisionId}`),
    ['promoted-subworkflow:decision.e8a.orderTotal', 'harness-machine:decision.e8a.machine'],
  );
  // The frozen ADR-03 mirror is exactly rule -> exact-cache -> promoted
  // subworkflow -> HarnessMachine and is immutable.
  assert.deepEqual([...COMPAT_DECISION_RESOLVER_SOURCE_ORDER], [
    'rule',
    'exact-cache',
    'promoted-subworkflow',
    'harness-machine',
  ]);
  assert.ok(Object.isFrozen(COMPAT_DECISION_RESOLVER_SOURCE_ORDER));
  // Every artifact-bearing source carries its exact artifact binding
  // (identity + currentness); the frozen single-declaration fixture evidence
  // is stable.
  assert.deepEqual(fx.mappingD.provenance.decisionSources, [
    {
      decisionId: 'decision.e8a.orderTotal',
      source: 'promoted-subworkflow',
      artifact: { ...SUBWORKFLOW_IDENTITY },
    },
  ]);
});

test('E8a decision-source-order: config cannot mint authority — unknown sources, priority fields and conflicts fail typed', () => {
  // Unknown/inferred source names fail closed — no latest/default/first.
  for (const source of ['latest', 'default', 'first', 'registry-order', 'config-file', '']) {
    assert.throws(
      () =>
        mapHarnessConfigPromotedSubworkflowToComponentGraph(
          compatInput({ decisionSources: [declaration({ source: source as never })] }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof CompatHarnessConfigMappingError);
        assert.match(error.message, /decisionSources\[0\]\.source/);
        return true;
      },
      `source '${source}' must fail closed`,
    );
  }

  // The declaration shape is closed: priority/order/weight-style authority
  // fields are unrepresentable.
  const smuggled = declaration() as Record<string, unknown>;
  smuggled.priority = 1;
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        compatInput({ decisionSources: [smuggled as unknown as CompatDecisionSourceDeclaration] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CompatHarnessConfigMappingError);
      assert.match(error.message, /decisionSources\[0\]/);
      return true;
    },
  );

  // Duplicate and conflicting declarations for one decision fail typed —
  // never first-wins.
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        compatInput({ decisionSources: [declaration(), declaration()] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CompatHarnessConfigMappingError);
      assert.equal(error.code, 'DUPLICATE_COMPAT_IDENTITY');
      return true;
    },
  );
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        compatInput({
          decisionSources: [
            declaration(),
            declaration({
              source: 'harness-machine',
              artifact: { kind: 'harness-config', artifactId: HARNESS_ID, contentDigest: HARNESS_DIGEST },
            }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CompatHarnessConfigMappingError);
      assert.equal(error.code, 'CONFLICTING_COMPAT_IDENTITY');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Matrix row 9: ambiguous-unrepresentable-reject
// ---------------------------------------------------------------------------

test('E8a ambiguous-unrepresentable-reject: floating/range legacy identities and ambiguous historical semantics fail typed', () => {
  // T008A: a floating capability selector is unrepresentable as an exact
  // identity — never rewritten, never closest-matched.
  assert.throws(
    () =>
      mapRawV07AuthoringToComponentGraph(
        authoringInput({ tools: [tool({ requiredCapabilities: ['http-transport@latest'] })] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof RawV07AdapterError);
      assert.equal(error.code, 'NOT_TRANSLATABLE');
      assert.match(error.message, /http-transport@latest/);
      return true;
    },
  );

  // T008D: an ambiguous promoted control graph (duplicate nodes) fails typed.
  const ambiguousEnvelope = promotedEnvelope() as {
    control: { nodes: string[] };
  };
  ambiguousEnvelope.control.nodes = ['fetch', 'fetch', 'decide', 'finish'];
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        compatInput({
          promotedSubworkflows: [subworkflow({ envelope: ambiguousEnvelope as unknown as JsonValue })],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CompatHarnessConfigMappingError);
      assert.equal(error.code, 'NOT_TRANSLATABLE');
      return true;
    },
  );

  // T008D: a reference to a compat artifact missing from the mapping input
  // fails typed — never dangling, never skipped.
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        compatInput({
          promotedSubworkflows: [
            subworkflow({
              identity: {
                kind: 'promoted-subworkflow',
                artifactId: 'promoted.e8a.unknown',
                contentDigest: 'digest-e8a-unknown',
              },
            }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CompatHarnessConfigMappingError);
      assert.equal(error.code, 'MISSING_REFERENCED_COMPAT_ARTIFACT');
      return true;
    },
  );

  // T008D: a stale revision (same artifactId, different content digest) in a
  // decision declaration fails typed as stale — never silently re-digested.
  assert.throws(
    () =>
      mapHarnessConfigPromotedSubworkflowToComponentGraph(
        compatInput({
          decisionSources: [
            declaration({
              artifact: {
                kind: 'promoted-subworkflow',
                artifactId: PROMOTED_ID,
                version: PROMOTED_VERSION,
                contentDigest: 'digest-e8a-STALE',
              },
            }),
          ],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof CompatHarnessConfigMappingError);
      assert.equal(error.code, 'STALE_COMPAT_IDENTITY');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Matrix rows 3+4+5: packed-consumer-root / packed-consumer-v7 / deep-import-reject
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') {
    return run('npm', args, cwd);
  }
  // Windows resolves npm to npm.cmd and Node refuses to spawn batch files
  // without a shell (same accepted pattern as tests/public-consumer.test.ts).
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  } as Parameters<typeof execFileSync>[1]) as string;
}

interface ConsumerFixture {
  readonly root: string;
  readonly consumerDirectory: string;
  readonly coreTarballSha256: string;
  readonly compilerTarballSha256: string;
}

let consumerPromise: Promise<ConsumerFixture> | undefined;

/**
 * Pack the committed core+compiler dist once and stand up a clean consumer.
 * #953 (Controller 090): the tarballs come from the shared immutable stage
 * (tests/packed-fixture-stage.ts) — no in-test rebuild of the live shared
 * workspace dist and no pack racing a parallel rewrite.
 */
function consumerFixture(): Promise<ConsumerFixture> {
  if (consumerPromise !== undefined) return consumerPromise;
  consumerPromise = (async (): Promise<ConsumerFixture> => {
    const root = mkdtempSync(join(tmpdir(), 'domain-harness-e8a-consumer-'));
    const consumerDirectory = join(root, 'consumer');
    try {
      mkdirSync(consumerDirectory, { recursive: true });
      const staged = await stagePackedWorkspaces();
      const coreTarballSha256 = staged.coreTarball.sha256;
      const compilerTarballSha256 = staged.compilerTarball.sha256;

      writeFileSync(join(consumerDirectory, 'package.json'), JSON.stringify({
        name: 'domain-harness-e8a-clean-consumer',
        private: true,
        type: 'module',
      }, null, 2));

      runNpm(
        ['install', '--ignore-scripts', '--no-audit', '--no-fund', '@types/node@^22.0.0', staged.coreTarball.path, staged.compilerTarball.path],
        consumerDirectory,
      );

      console.log('E8A_PACKED_ARTIFACTS', JSON.stringify({
        coreTarball: staged.coreTarball.fileName,
        coreTarballSha256,
        compilerTarball: staged.compilerTarball.fileName,
        compilerTarballSha256,
      }));

      return { root, consumerDirectory, coreTarballSha256, compilerTarballSha256 };
    } catch (error) {
      rmSync(root, { recursive: true, force: true });
      throw error;
    }
  })();
  return consumerPromise;
}

function writeConsumerTsconfig(consumerDirectory: string): void {
  writeFileSync(join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      lib: ['ES2022'],
    },
    include: ['index.ts'],
  }, null, 2));
}

function typecheckConsumer(consumerDirectory: string): void {
  const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [tsc, '--project', 'tsconfig.json'], consumerDirectory);
}

test('E8a packed-consumer-root: legacy core/compiler public imports stay valid from the packed tarballs', async () => {
  const fxConsumer = await consumerFixture();
  const { consumerDirectory } = fxConsumer;
  try {
    writeFileSync(join(consumerDirectory, 'index.ts'), `// E8a clean-consumer fixture: legacy ROOT public surfaces of both packed
// packages remain valid exactly as historical consumers import them.
import {
  bundleScriptTool,
  BusinessSourceCompileError,
  COMPILER_PUBLIC_API_VERSION,
  compileDomainPackage,
  compileSemanticDecisions,
  DOMAIN_HARNESS_COMPILER_PACKAGE,
  DomainDataCompileError,
  emitTargetCompiledPackageModule,
  loadRawDomainPackage,
  PUBLIC_COMPILER_OUTPUT_PROFILE,
  SCRIPT_EXECUTION_CAPABILITY,
  ScriptCompileError,
  SemanticDecisionCompileError,
  translateV01ScriptInvokes,
  V01ScriptTranslationError,
  type BindingModuleReference,
  type BusinessSourceCompileEntry,
  type CompiledPackageManifest,
  type CompiledSemanticDecisionDescriptor,
  type DomainDataCompileEntry,
  type EmitTargetModuleInput,
  type LoadRawDomainPackageOptions,
  type RawToolDefinition,
  type SemanticDecisionCachePolicy,
  type SemanticDecisionPromotedReference,
  type SemanticDecisionUnavailableDisposition,
  type TargetHostProfile,
  type V01ScriptToolTranslation,
  type V01ScriptTranslationOptions,
  type V01ScriptTranslationResult,
} from '@kaicreator/domain-harness-compiler';
import {
  createDomainRuntime,
  DOMAIN_HARNESS_VERSION,
  StaticPackageRegistry,
} from '@kaicreator/domain-harness';

void bundleScriptTool;
void BusinessSourceCompileError;
void compileDomainPackage;
void compileSemanticDecisions;
void emitTargetCompiledPackageModule;
void loadRawDomainPackage;
void translateV01ScriptInvokes;
void DomainDataCompileError;
void ScriptCompileError;
void SemanticDecisionCompileError;
void V01ScriptTranslationError;
void PUBLIC_COMPILER_OUTPUT_PROFILE;
void SCRIPT_EXECUTION_CAPABILITY;
void DOMAIN_HARNESS_COMPILER_PACKAGE;
void COMPILER_PUBLIC_API_VERSION;
void createDomainRuntime;
void DOMAIN_HARNESS_VERSION;
void StaticPackageRegistry;
`);
    writeConsumerTsconfig(consumerDirectory);
    typecheckConsumer(consumerDirectory);

    // The packed dist runtime inventory is exercised by direct evaluation.
    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
const compiler = await import('@kaicreator/domain-harness-compiler');
if (typeof compiler.compileDomainPackage !== 'function') throw new Error('legacy compiler root build API missing');
if (compiler.COMPILER_PUBLIC_API_VERSION !== 'compiler-public-api.v1') throw new Error('compiler public API compatibility level changed');
const core = await import('@kaicreator/domain-harness');
if (core.DOMAIN_HARNESS_VERSION !== '0.2.0') throw new Error('legacy core root version changed');
if (typeof core.createDomainRuntime !== 'function' || typeof core.StaticPackageRegistry !== 'function') throw new Error('legacy core root commitments missing');
`,
      ],
      consumerDirectory,
    );
  } finally {
    rmSync(fxConsumer.root, { recursive: true, force: true });
    consumerPromise = undefined;
  }
}, { timeout: 600000 });

test('E8a packed-consumer-v7: the successor /v7 surface is additive and nominally reachable from the same consumer', async () => {
  const fxConsumer = await consumerFixture();
  const { consumerDirectory } = fxConsumer;
  try {
    writeFileSync(join(consumerDirectory, 'index.ts'), `// E8a clean-consumer fixture: /v7 stays ADDITIVE — the successor entry coexists
// with the untouched legacy root imports in one clean consumer.
import {
  admitComponent,
  ComponentAdmissionError,
  computeDefinitionGraphDigest,
  validateComponentEnvelope,
  validateDefinitionGraphEnvelope,
  validateToolComponent,
  COMPONENT_FAMILIES,
  type ComponentEnvelope,
  type DefinitionGraphEnvelope,
  type Sha256Port,
  type UnderstoodKindDeclaration,
} from '@kaicreator/domain-harness/v7';
import { COMPILER_PUBLIC_API_VERSION } from '@kaicreator/domain-harness-compiler';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

void admitComponent;
void ComponentAdmissionError;
void computeDefinitionGraphDigest;
void validateComponentEnvelope;
void validateDefinitionGraphEnvelope;
void validateToolComponent;
void COMPONENT_FAMILIES;
void COMPILER_PUBLIC_API_VERSION;
const envelope: ComponentEnvelope | undefined = undefined;
const graph: DefinitionGraphEnvelope | undefined = undefined;
const understood: UnderstoodKindDeclaration | undefined = undefined;
void envelope;
void graph;
void understood;
void sha256;
`);
    writeConsumerTsconfig(consumerDirectory);
    typecheckConsumer(consumerDirectory);

    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
const v7 = await import('@kaicreator/domain-harness/v7');
for (const key of ['admitComponent','computeDefinitionGraphDigest','validateDefinitionGraphEnvelope','validateToolComponent','validateComponentEnvelope']) {
  if (typeof v7[key] !== 'function') throw new Error('successor /v7 export missing: ' + key);
}
if (JSON.stringify(v7.COMPONENT_FAMILIES) !== '["semantic","tool"]') throw new Error('/v7 COMPONENT_FAMILIES changed');
`,
      ],
      consumerDirectory,
    );
  } finally {
    rmSync(fxConsumer.root, { recursive: true, force: true });
    consumerPromise = undefined;
  }
}, { timeout: 600000 });

test('E8a deep-import-reject: compat internals and package deep paths stay closed by the exports map', async () => {
  const fxConsumer = await consumerFixture();
  const { consumerDirectory } = fxConsumer;
  try {
    for (const specifier of [
      '@kaicreator/domain-harness-compiler/dist/raw/types.js',
      '@kaicreator/domain-harness-compiler/dist/compat/raw-v07/index.js',
      '@kaicreator/domain-harness-compiler/dist/compat/raw-v07/identity-correspondence.js',
      '@kaicreator/domain-harness-compiler/dist/compat/raw-v07/harness-config-promoted-subworkflow.js',
      '@kaicreator/domain-harness/dist/contracts/component.js',
    ]) {
      run(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `try { await import('${specifier}'); throw new Error('deep import unexpectedly succeeded: ${specifier}'); } catch (error) { if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; }`,
        ],
        consumerDirectory,
      );
    }
    // The packed compiler root must not expose successor/internal authority
    // (the accepted T008C barrel commitment, re-proven against the packs).
    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
const m = await import('@kaicreator/domain-harness-compiler');
for (const key of ['admitComponent','computeDefinitionGraphDigest','validateToolComponent','mapRawV07AuthoringToComponentGraph','buildRawV07IdentityCorrespondence','mapHarnessConfigPromotedSubworkflowToComponentGraph','RAW_V07_TOOL_KIND','RAW_V07_IDENTITY_CORRESPONDENCE_MARKER']) {
  if (key in m) throw new Error('compiler root must not expose successor/internal authority: ' + key);
}
`,
      ],
      consumerDirectory,
    );
  } finally {
    rmSync(fxConsumer.root, { recursive: true, force: true });
    consumerPromise = undefined;
  }
}, { timeout: 600000 });

// ---------------------------------------------------------------------------
// Matrix row 10: no-raw-runtime-bypass
// ---------------------------------------------------------------------------

test('E8a no-raw-runtime-bypass: Raw authoring and mapping JSON carry no runtime authority', async () => {
  const fx = await frozen();

  // The mapping result is plain JSON evidence: no functions, no handles, no
  // executable material anywhere in the accepted artifacts.
  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'function') {
      throw new Error(`executable material at ${path}`);
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value)) {
        walk(entry, `${path}.${key}`);
      }
    }
  };
  walk(fx.mappingA, 'mappingA');
  walk(fx.mappingD, 'mappingD');
  walk(fx.mergedGraph, 'mergedGraph');

  // Raw authoring input is not a Definition graph: the public standard gate
  // rejects it typed before any admission could occur.
  assert.throws(
    () => validateDefinitionGraphEnvelope(rawPackage() as unknown as DefinitionGraphEnvelope),
    (error: unknown) => error instanceof Error && error.name === 'DefinitionGraphContractError',
  );

  // Post-freeze mutation of the Raw authoring material cannot change the
  // admitted graph identity the runtime path would seal over.
  const admittedDigest = fx.definitionGraphDigest;
  const hostile = rawPackage();
  (hostile as { domainId: string }).domainId = 'domain.FORGED';
  assert.equal(fx.definitionGraphDigest, admittedDigest);
  validateDefinitionGraphEnvelope(fx.mergedGraph);
});

test('E8a no-raw-runtime-bypass: activation accepts only seal-minted assemblies — mapping JSON and Raw are rejected before any durable bind', async () => {
  const fx = await frozen();

  // Public anti-forgery gate (reachable from the /v3 governance barrel): the
  // activator is constructed with inert dependencies because the rejection
  // happens synchronously in PHASE 1, before any store/pin interaction.
  const activator = new AssemblyExecutionActivator(
    {} as unknown as DurableExecutionStore,
    {} as unknown as ExactPackageCdiAuthority,
    {} as unknown as GovernanceBaselineStore,
    sha256,
  );
  const binding: DomainActivationBinding = {
    domainId: DOMAIN_ID,
    packageId: 'pkg-e8a-legacy',
    domainIntelligenceContentDigest: 'cdi-e8a-legacy',
    governanceBaseline: {
      domainId: DOMAIN_ID,
      governanceId: 'governance-e8a-legacy',
      schemaVersion: '1',
      contentDigest: 'baseline-e8a-legacy',
    },
  };
  const requestWith = (
    assembly: unknown,
  ): ActivateAssemblyExecutionRequest => ({
    workflowTarget: WORKFLOW_ID,
    workflowInstanceId: 'e8a.instance.bypass',
    binding,
    assembly: assembly as ActivateAssemblyExecutionRequest['assembly'],
    authorityClass: 'PRODUCTION',
    currentDefinitionGraph: fx.mergedGraph,
  });

  // The accepted T008A mapping result is caller-constructed JSON: it can
  // never carry the sealed-Assembly brand.
  await assert.rejects(
    activator.activate(requestWith(fx.mappingA)),
    (error: unknown) => {
      assert.ok(error instanceof GovernanceExecutionBindingError);
      assert.equal(error.code, 'ASSEMBLY_NOT_SEALED');
      return true;
    },
  );

  // The historical Raw package itself fares no better.
  await assert.rejects(
    activator.activate(requestWith(rawPackage())),
    (error: unknown) => {
      assert.ok(error instanceof GovernanceExecutionBindingError);
      assert.equal(error.code, 'ASSEMBLY_NOT_SEALED');
      return true;
    },
  );

  // A forged object that merely LOOKS like a sealed assembly record (right
  // field names, plausible digests) is still not minted authority.
  await assert.rejects(
    activator.activate(requestWith({
      assemblyDigest: `sha256:${'ab'.repeat(32)}`,
      record: { definitionGraphDigest: fx.definitionGraphDigest },
    })),
    (error: unknown) => {
      assert.ok(error instanceof GovernanceExecutionBindingError);
      assert.equal(error.code, 'ASSEMBLY_NOT_SEALED');
      return true;
    },
  );
});

test('E8a no-raw-runtime-bypass: admission currentness — a mutated mapped component is not admitted under its historical identity', async () => {
  const fx = await frozen();
  const workflow = componentById(fx.mergedGraph.components, WORKFLOW_ID);

  // Kind pin exactness: the wrong exact Kind version fails closed (no
  // fallback to another version) on the public admission seam.
  const wrongVersion: ComponentEnvelope = {
    ...workflow,
    kind: { ...workflow.kind, version: '99.0.0' },
  };
  assert.throws(
    () => admitComponent(wrongVersion, understoodKinds()),
    (error: unknown) => {
      assert.ok(error instanceof ComponentAdmissionError);
      assert.equal(error.code, 'KIND_VERSION_MISMATCH');
      return true;
    },
  );

  // The exact pinned component is admitted; its identity participates in the
  // admitted graph digest captured at freeze.
  assert.equal(admitComponent(workflow, understoodKinds()).status, 'ADMITTED');
});
