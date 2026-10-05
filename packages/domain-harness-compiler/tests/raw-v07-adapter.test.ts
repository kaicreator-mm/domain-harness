/**
 * T008A — Raw authoring -> Component Graph strangler adapter (PACK-A, #619).
 *
 * Raw is authoring/compat input, never a v0.7 ontology root or runtime truth:
 * the mapping below must be deterministic/idempotent, must fail typed on
 * unrepresentable semantics (no closest-match guessing), must isolate its
 * product from caller mutation, and must produce material consumable only
 * through the standard v0.7 Component contracts (no reverse Raw authority).
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  admitComponent,
  ComponentAdmissionError,
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  validateToolComponent,
  type ComponentEnvelope,
  type Sha256Port,
  type UnderstoodKindDeclaration,
} from '@kaicreator/domain-harness/v7';
import type {
  LoadedRawDomainPackage,
  RawProjectionDefinition,
  RawToolDefinition,
  RawWorkflow,
} from '../src/raw/types.js';
import {
  mapRawV07AuthoringToComponentGraph,
  RAW_V07_ADAPTER_PROVENANCE_MARKER,
  RAW_V07_EXECUTE_OPERATION_ID,
  RAW_V07_INVOKES_RELATION_KIND,
  RAW_V07_PROJECTION_KIND,
  RAW_V07_SKILL_KIND,
  RAW_V07_TOOL_KIND,
  RAW_V07_WORKFLOW_KIND,
  RawV07AdapterError,
  type RawV07AuthoringInput,
} from '../src/compat/raw-v07/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const OBJECT_SCHEMA = { type: 'object' } as const;

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function workflow(overrides: Partial<RawWorkflow> = {}): RawWorkflow {
  return {
    id: 'wf.order',
    sourcePath: 'workflows/order.yaml',
    initial: 'start',
    states: {
      start: {
        id: 'start',
        final: false,
        invoke: { kind: 'tool', ref: 'tool.pricing' },
        done: [{ target: 'end' }],
        error: [],
        events: {},
      },
      end: { id: 'end', final: true, done: [], error: [], events: {} },
    },
    ...overrides,
  };
}

/** Minimal workflow states invoking exactly one tool ref (key/id regression fixtures). */
function statesInvoking(ref: string): RawWorkflow['states'] {
  return {
    start: {
      id: 'start',
      final: false,
      invoke: { kind: 'tool', ref },
      done: [{ target: 'end' }],
      error: [],
      events: {},
    },
    end: { id: 'end', final: true, done: [], error: [], events: {} },
  };
}

function rawPackage(overrides: Partial<LoadedRawDomainPackage> = {}): LoadedRawDomainPackage {
  return {
    root: '/pkg',
    schemaVersion: '0.1',
    domainId: 'domain.orders',
    limits: { maxSteps: 100 },
    workflows: new Map([['wf.order', workflow()]]),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(),
    ...overrides,
  };
}

function tool(overrides: Partial<RawToolDefinition> = {}): RawToolDefinition {
  return {
    toolId: 'tool.pricing',
    inputSchema: OBJECT_SCHEMA,
    outputSchema: OBJECT_SCHEMA,
    effect: 'idempotent',
    executionKind: 'remote-http-json',
    requiredCapabilities: ['http-transport@1'],
    ...overrides,
  };
}

function projection(overrides: Partial<RawProjectionDefinition> = {}): RawProjectionDefinition {
  return {
    projectionId: 'proj.orderTotal',
    expression: '$sum(items.price)',
    dependencies: [{ kind: 'domain-data', key: 'catalog' }],
    outputSchema: OBJECT_SCHEMA,
    ...overrides,
  };
}

function input(overrides: Partial<RawV07AuthoringInput> = {}): RawV07AuthoringInput {
  return { raw: rawPackage(), tools: [tool()], ...overrides };
}

function graphDigest(envelope: Parameters<typeof computeDefinitionGraphDigest>[0]) {
  return computeDefinitionGraphDigest(envelope, sha256);
}

function componentById(
  components: readonly ComponentEnvelope[],
  componentId: string,
): ComponentEnvelope {
  const found = components.find((candidate) => candidate.componentId === componentId);
  assert.ok(found, `component ${componentId} is bound in the mapped graph`);
  return found;
}

function assertNotTranslatable(fn: () => unknown, context: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof RawV07AdapterError, `${context}: typed RawV07AdapterError`);
    assert.equal(error.code, 'NOT_TRANSLATABLE', `${context}: NOT_TRANSLATABLE`);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Deterministic mapping surface
// ---------------------------------------------------------------------------

test('maps a Raw Tool into a Tool Component on the exact adapter Kind', () => {
  const result = mapRawV07AuthoringToComponentGraph(input());
  const mapped = componentById(result.graph.components, 'tool.pricing');

  assert.equal(mapped.family, 'tool');
  assert.deepEqual(mapped.kind, RAW_V07_TOOL_KIND);
  assert.deepEqual(mapped.requiredSemanticContracts, []);
  assert.deepEqual(mapped.requiredCapabilities, [
    { capabilityId: 'http-transport', version: '1' },
  ]);

  const body = mapped.semanticBody as unknown as {
    operations: readonly Record<string, unknown>[];
    providesCapabilities: readonly unknown[];
  };
  assert.equal(body.operations.length, 1);
  assert.deepEqual(body.operations[0], {
    operationId: RAW_V07_EXECUTE_OPERATION_ID,
    inputSchema: OBJECT_SCHEMA,
    outputSchema: OBJECT_SCHEMA,
    effect: 'idempotent',
  });
  assert.deepEqual(body.providesCapabilities, []);

  // The product is consumable only through the standard Component contracts.
  validateToolComponent(mapped);
  validateDefinitionGraphEnvelope(result.graph);
});

test('missing Raw inputSchema maps to the explicit unconstrained declaration', () => {
  const bare = tool();
  delete (bare as { inputSchema?: unknown }).inputSchema;
  const result = mapRawV07AuthoringToComponentGraph(input({ tools: [bare] }));
  const mapped = componentById(result.graph.components, 'tool.pricing');
  const body = mapped.semanticBody as unknown as { operations: readonly { inputSchema: unknown }[] };
  assert.deepEqual(body.operations[0]?.inputSchema, {});
});

test('maps requiredCapabilities name@N into exact capability refs, deterministically ordered', () => {
  const result = mapRawV07AuthoringToComponentGraph(
    input({
      tools: [tool({ requiredCapabilities: ['b-cap@2', 'a-cap@10'] })],
    }),
  );
  const mapped = componentById(result.graph.components, 'tool.pricing');
  assert.deepEqual(mapped.requiredCapabilities, [
    { capabilityId: 'a-cap', version: '10' },
    { capabilityId: 'b-cap', version: '2' },
  ]);
});

test('maps LogicalToolBindingConfig.resourceKey into a T005A-shape logical requirement', () => {
  const result = mapRawV07AuthoringToComponentGraph(
    input({
      tools: [
        tool({
          config: { transport: 'http-transport@1', resourceKey: 'pricing-endpoint', path: '/price', method: 'POST' },
        }),
      ],
    }),
  );

  assert.equal(result.resourceDeclarations.length, 1);
  assert.deepEqual(result.resourceDeclarations[0], {
    componentId: 'tool.pricing',
    requirements: [{ resourceKey: 'pricing-endpoint', required: true }],
  });

  // The logical requirement declaration is a closed shape: endpoint/credential
  // material is structurally unrepresentable (T005A fence).
  const declaration = result.resourceDeclarations[0] as Record<string, unknown>;
  assert.deepEqual(Object.keys(declaration).sort(), ['componentId', 'requirements']);
  const requirement = (declaration.requirements as readonly Record<string, unknown>[])[0]!;
  assert.deepEqual(Object.keys(requirement).sort(), ['required', 'resourceKey']);
});

test('binding-plane material never enters Definition semantics; it is preserved as provenance only', () => {
  const result = mapRawV07AuthoringToComponentGraph(
    input({
      tools: [
        tool({
          requiredCapabilities: [],
          bindingCapability: 'http-transport@1',
          config: { transport: 'http-transport@1', path: '/price', method: 'POST' },
        }),
      ],
    }),
  );

  const mapped = componentById(result.graph.components, 'tool.pricing');
  // No binding/transport/path identity is representable on the envelope or body.
  const material = JSON.stringify(mapped);
  assert.ok(!material.includes('/price'), 'logical request path stays out of Definition semantics');
  assert.ok(!material.includes('http-transport'), 'transport binding identity stays out of Definition semantics');

  const provenance = result.provenance.components.find((entry) => entry.componentId === 'tool.pricing');
  assert.ok(provenance, 'historical identity is recorded');
  assert.equal(provenance.sourceKind, 'tool');
  assert.deepEqual(provenance.historicalIdentity, {
    toolId: 'tool.pricing',
    executionKind: 'remote-http-json',
    bindingCapability: 'http-transport@1',
    config: { transport: 'http-transport@1', path: '/price', method: 'POST' },
  });
});

test('maps workflows and skills into semantic Components and emits exact invokes relations', () => {
  const skill = {
    id: 'skill.triage',
    directory: 'skills/triage',
    instructions: 'Triage the order.',
    outputSchema: OBJECT_SCHEMA,
    resources: [{ path: 'SKILL.md', content: 'triage' }],
  };
  const wf = workflow({
    states: {
      start: {
        id: 'start',
        final: false,
        invoke: { kind: 'tool', ref: 'tool.pricing' },
        done: [{ target: 'ask' }, { target: 'ask', when: '$flag' }],
        error: [],
        events: {},
      },
      ask: {
        id: 'ask',
        final: false,
        invoke: { kind: 'skill', ref: 'skill.triage' },
        done: [{ target: 'end' }],
        error: [],
        events: {},
      },
      end: { id: 'end', final: true, done: [], error: [], events: {} },
    },
  });

  const result = mapRawV07AuthoringToComponentGraph(
    input({ raw: rawPackage({ workflows: new Map([['wf.order', wf]]), skills: new Map([['skill.triage', skill]]) }) }),
  );

  const mappedWorkflow = componentById(result.graph.components, 'wf.order');
  assert.equal(mappedWorkflow.family, 'semantic');
  assert.deepEqual(mappedWorkflow.kind, RAW_V07_WORKFLOW_KIND);

  const mappedSkill = componentById(result.graph.components, 'skill.triage');
  assert.deepEqual(mappedSkill.kind, RAW_V07_SKILL_KIND);

  // One relation per (workflow, target, kind) triple: repeated invokes of the
  // same target never duplicate the relation.
  assert.deepEqual(
    result.graph.relations.map((relation) => [
      relation.relationKind,
      relation.sourceComponentId,
      relation.targetComponentId,
    ]).sort(),
    [
      ['invokes', 'wf.order', 'skill.triage'],
      ['invokes', 'wf.order', 'tool.pricing'],
    ].sort(),
  );
  for (const relation of result.graph.relations) {
    assert.equal(relation.relationKind, RAW_V07_INVOKES_RELATION_KIND);
  }

  const body = mappedWorkflow.semanticBody as unknown as {
    initial: string;
    limits: { maxSteps: number };
    states: Record<string, unknown>;
  };
  assert.equal(body.initial, 'start');
  assert.equal(body.limits.maxSteps, 100);
  assert.ok('start' in body.states && 'ask' in body.states && 'end' in body.states);

  validateDefinitionGraphEnvelope(result.graph);
});

test('maps projections into semantic Components with verbatim dependency material', () => {
  const result = mapRawV07AuthoringToComponentGraph(
    input({
      projections: [
        projection({
          dependencies: [
            { kind: 'workflow', selector: { id: 'wf.order' } },
            { kind: 'business', source: 'orders', selector: { region: 'eu' } },
            { kind: 'domain-data', key: 'catalog' },
          ],
        }),
      ],
    }),
  );

  const mapped = componentById(result.graph.components, 'proj.orderTotal');
  assert.equal(mapped.family, 'semantic');
  assert.deepEqual(mapped.kind, RAW_V07_PROJECTION_KIND);
  const body = mapped.semanticBody as unknown as {
    expression: string;
    dependencies: readonly unknown[];
    outputSchema: unknown;
  };
  assert.equal(body.expression, '$sum(items.price)');
  assert.deepEqual(body.dependencies, [
    { kind: 'workflow', selector: { id: 'wf.order' } },
    { kind: 'business', source: 'orders', selector: { region: 'eu' } },
    { kind: 'domain-data', key: 'catalog' },
  ]);
  assert.deepEqual(body.outputSchema, OBJECT_SCHEMA);
  // No relations: dependency selectors carry no exact target identity.
  assert.equal(
    result.graph.relations.filter((relation) => relation.sourceComponentId === 'proj.orderTotal').length,
    0,
  );
});

// ---------------------------------------------------------------------------
// Deterministic / idempotent mapping (PACK-A)
// ---------------------------------------------------------------------------

test('same Raw mapped twice yields an identical graph and identical semantic digest', async () => {
  const first = mapRawV07AuthoringToComponentGraph(input());
  const second = mapRawV07AuthoringToComponentGraph(input());

  assert.deepEqual(first.graph, second.graph);
  assert.equal(await graphDigest(first.graph), await graphDigest(second.graph));
  assert.equal(
    JSON.stringify(first.resourceDeclarations),
    JSON.stringify(second.resourceDeclarations),
  );
  assert.equal(JSON.stringify(first.provenance), JSON.stringify(second.provenance));
});

test('key/insertion-order-independent Raw still yields the same graph semantic digest', async () => {
  const sharedSchema = {
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'number' } },
  } as const;
  const ordered = mapRawV07AuthoringToComponentGraph(
    input({ tools: [tool({ inputSchema: sharedSchema as never })] }),
  );

  const shuffledWorkflow = workflow();
  const reorderedStates: Record<string, RawWorkflow['states'][string]> = {};
  for (const stateId of ['end', 'start']) {
    const state = shuffledWorkflow.states[stateId];
    if (state) reorderedStates[stateId] = state;
  }
  const shuffledRaw = rawPackage({
    workflows: new Map([['wf.order', { ...shuffledWorkflow, states: reorderedStates }]]),
  });

  // Same schema content, different key order at every object level.
  const shuffledTool = tool({
    inputSchema: { properties: { b: { type: 'number' }, a: { type: 'string' } }, type: 'object' } as never,
  });
  const shuffled = mapRawV07AuthoringToComponentGraph(
    input({ raw: shuffledRaw, tools: [shuffledTool] }),
  );

  assert.equal(await graphDigest(ordered.graph), await graphDigest(shuffled.graph));
});

test('graph digest is stable across mapping calls on the same caller-owned input', async () => {
  const shared = input();
  const first = mapRawV07AuthoringToComponentGraph(shared);
  const second = mapRawV07AuthoringToComponentGraph(shared);
  assert.equal(await graphDigest(first.graph), await graphDigest(second.graph));
});

// ---------------------------------------------------------------------------
// Ambiguity / unrepresentable semantics fail typed (PACK-A: no guessing)
// ---------------------------------------------------------------------------

test('rejects unsupported Raw schema versions with a typed fail', () => {
  assert.throws(
    () => mapRawV07AuthoringToComponentGraph(input({ raw: rawPackage({ schemaVersion: '0.2' as never }) })),
    (error: unknown) => {
      assert.ok(error instanceof RawV07AdapterError);
      assert.equal(error.code, 'UNSUPPORTED_RAW_SCHEMA_VERSION');
      return true;
    },
  );
});

test('rejects Raw identities that cannot be represented exactly (never rewritten)', () => {
  assertNotTranslatable(
    () => mapRawV07AuthoringToComponentGraph(input({ tools: [tool({ toolId: 'tool@1' })] })),
    'toolId embedding @',
  );
  assertNotTranslatable(
    () => mapRawV07AuthoringToComponentGraph(input({ raw: rawPackage({ domainId: 'latest' }) })),
    'floating domainId',
  );
  assertNotTranslatable(
    () => mapRawV07AuthoringToComponentGraph(input({ raw: rawPackage({ domainId: 'domain@1' }) })),
    'domainId embedding @',
  );
  assertNotTranslatable(
    () => mapRawV07AuthoringToComponentGraph(input({ tools: [tool({ config: { resourceKey: 'res@1' } })] })),
    'resourceKey embedding @',
  );
});

test('rejects capability identities outside the frozen name@N form', () => {
  assertNotTranslatable(
    () => mapRawV07AuthoringToComponentGraph(input({ tools: [tool({ requiredCapabilities: ['latest'] as never })] })),
    'floating capability',
  );
  assertNotTranslatable(
    () => mapRawV07AuthoringToComponentGraph(input({ tools: [tool({ requiredCapabilities: ['cap@1.x'] as never })] })),
    'x-range capability version',
  );
  assertNotTranslatable(
    () => mapRawV07AuthoringToComponentGraph(input({ tools: [tool({ requiredCapabilities: ['cap'] as never })] })),
    'capability without exact version',
  );
  assertNotTranslatable(
    () => mapRawV07AuthoringToComponentGraph(input({ tools: [tool({ requiredCapabilities: ['cap@1', 'cap@2'] as never })] })),
    'same capability id under two versions',
  );
});

test('rejects duplicate and colliding Raw identities instead of merging them', () => {
  assertNotTranslatable(
    () => mapRawV07AuthoringToComponentGraph(input({ tools: [tool(), tool()] })),
    'duplicate tool id',
  );

  const skill = {
    id: 'tool.pricing', // collides with the tool id in the single Component namespace
    directory: 'skills/x',
    instructions: 'x',
    outputSchema: OBJECT_SCHEMA,
    resources: [],
  };
  assertNotTranslatable(
    () =>
      mapRawV07AuthoringToComponentGraph(
        input({ raw: rawPackage({ skills: new Map([['tool.pricing', skill]]) }) }),
      ),
    'tool/skill componentId collision',
  );
});

test('rejects invoke semantics outside the accepted executable surface', () => {
  const scriptInvoke = workflow({
    states: {
      start: {
        id: 'start',
        final: false,
        invoke: { kind: 'script', ref: 'scripts/legacy.js' },
        done: [{ target: 'end' }],
        error: [],
        events: {},
      },
      end: { id: 'end', final: true, done: [], error: [], events: {} },
    },
  });
  assertNotTranslatable(
    () =>
      mapRawV07AuthoringToComponentGraph(
        input({ raw: rawPackage({ workflows: new Map([['wf.order', scriptInvoke]]) }) }),
      ),
    'top-level script invoke',
  );

  const childInvoke = workflow({
    states: {
      start: {
        id: 'start',
        final: false,
        invoke: { kind: 'workflow', ref: 'wf.child' },
        done: [{ target: 'end' }],
        error: [],
        events: {},
      },
      end: { id: 'end', final: true, done: [], error: [], events: {} },
    },
  });
  assertNotTranslatable(
    () =>
      mapRawV07AuthoringToComponentGraph(
        input({ raw: rawPackage({ workflows: new Map([['wf.order', childInvoke]]) }) }),
      ),
    'top-level child workflow invoke',
  );

  const unknownKind = workflow({
    states: {
      start: {
        id: 'start',
        final: false,
        invoke: { kind: 'daemon' as never, ref: 'x' },
        done: [{ target: 'end' }],
        error: [],
        events: {},
      },
      end: { id: 'end', final: true, done: [], error: [], events: {} },
    },
  });
  assertNotTranslatable(
    () =>
      mapRawV07AuthoringToComponentGraph(
        input({ raw: rawPackage({ workflows: new Map([['wf.order', unknownKind]]) }) }),
      ),
    'unknown invoke kind',
  );
});

test('references to unbound tools/skills fail typed instead of leaving dangling relations', () => {
  const missingTool = workflow({
    states: {
      start: {
        id: 'start',
        final: false,
        invoke: { kind: 'tool', ref: 'tool.unknown' },
        done: [{ target: 'end' }],
        error: [],
        events: {},
      },
      end: { id: 'end', final: true, done: [], error: [], events: {} },
    },
  });
  assertNotTranslatable(
    () =>
      mapRawV07AuthoringToComponentGraph(
        input({ raw: rawPackage({ workflows: new Map([['wf.order', missingTool]]) }), tools: [] }),
      ),
    'tool invoke without bound tool',
  );

  const missingSkill = workflow({
    states: {
      start: {
        id: 'start',
        final: false,
        invoke: { kind: 'skill', ref: 'skill.unknown' },
        done: [{ target: 'end' }],
        error: [],
        events: {},
      },
      end: { id: 'end', final: true, done: [], error: [], events: {} },
    },
  });
  assertNotTranslatable(
    () =>
      mapRawV07AuthoringToComponentGraph(
        input({ raw: rawPackage({ workflows: new Map([['wf.order', missingSkill]]) }) }),
      ),
    'skill invoke without bound skill',
  );
});

test('rejects non-JSON Raw material instead of silently dropping it', () => {
  assertNotTranslatable(
    () =>
      mapRawV07AuthoringToComponentGraph(
        input({ tools: [tool({ outputSchema: { default: Number.NaN } as never })] }),
      ),
    'NaN in schema material',
  );
});

// ---------------------------------------------------------------------------
// Workflow Map key / id identity (loader invariant re-check; review P1-1)
// ---------------------------------------------------------------------------

test('rejects a workflow Map entry whose key is not the workflow id (single mismatch)', () => {
  // Pre-fix this failed closed but was mis-attributed: the dangling relation
  // source (bound by the MAP key) surfaced as MAPPING_CONTRACT_VIOLATION, i.e.
  // "adapter defect", for what is invalid authoring input.
  const mismatched = rawPackage({
    workflows: new Map([['wf.wrong-key', workflow({ id: 'wf.order' })]]),
  });
  assert.throws(
    () => mapRawV07AuthoringToComponentGraph(input({ raw: mismatched })),
    (error: unknown) => {
      assert.ok(error instanceof RawV07AdapterError, 'typed RawV07AdapterError');
      assert.equal(error.code, 'INVALID_RAW_AUTHORING');
      assert.equal(error.path, 'input.raw.workflows.wf.wrong-key');
      return true;
    },
  );
});

test('rejects swapped workflow Map keys instead of silently cross-wiring invoke relations', () => {
  // Two entries with swapped keys: pre-fix this mapped successfully with
  // relations bound by the MAP key while component bodies were bound by
  // workflow.id (relation wf.a -> tool.alpha on a body invoking tool.beta),
  // passing every standard gate. The key===id assertion fails it typed.
  const wfA = workflow({ id: 'wf.a', states: statesInvoking('tool.alpha') });
  const wfB = workflow({ id: 'wf.b', states: statesInvoking('tool.beta') });
  const swapped = rawPackage({
    workflows: new Map([
      ['wf.a', wfB], // key of wf.a, body of wf.b (invokes tool.beta)
      ['wf.b', wfA], // key of wf.b, body of wf.a (invokes tool.alpha)
    ]),
  });
  assert.throws(
    () =>
      mapRawV07AuthoringToComponentGraph(
        input({ raw: swapped, tools: [tool({ toolId: 'tool.alpha' }), tool({ toolId: 'tool.beta' })] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof RawV07AdapterError, 'typed RawV07AdapterError');
      assert.equal(error.code, 'INVALID_RAW_AUTHORING');
      assert.equal(error.path, 'input.raw.workflows.wf.a');
      return true;
    },
  );
});

test('key-consistent workflow Maps still map with exact, non-cross-wired relations', () => {
  // Normal flow guard for the key===id assertion: consistent entries emit one
  // relation per workflow bound to that workflow's own invoke targets.
  const wfA = workflow({ id: 'wf.a', states: statesInvoking('tool.alpha') });
  const wfB = workflow({ id: 'wf.b', states: statesInvoking('tool.beta') });
  const result = mapRawV07AuthoringToComponentGraph(
    input({
      raw: rawPackage({ workflows: new Map([['wf.a', wfA], ['wf.b', wfB]]) }),
      tools: [tool({ toolId: 'tool.alpha' }), tool({ toolId: 'tool.beta' })],
    }),
  );
  assert.deepEqual(
    result.graph.relations.map((relation) => [relation.sourceComponentId, relation.targetComponentId]).sort(),
    [
      ['wf.a', 'tool.alpha'],
      ['wf.b', 'tool.beta'],
    ],
  );
  validateDefinitionGraphEnvelope(result.graph);
});

test('rejects a non-string raw root instead of silently defaulting the provenance sourceRoot', () => {
  assert.throws(
    () => mapRawV07AuthoringToComponentGraph(input({ raw: rawPackage({ root: 42 as never }) })),
    (error: unknown) => {
      assert.ok(error instanceof RawV07AdapterError, 'typed RawV07AdapterError');
      assert.equal(error.code, 'INVALID_RAW_AUTHORING');
      assert.equal(error.path, 'input.raw.root');
      return true;
    },
  );
});

test('provenance records the raw source root verbatim', () => {
  const result = mapRawV07AuthoringToComponentGraph(
    input({ raw: rawPackage({ root: 'C:/pkg/checkout' }) }),
  );
  assert.equal(result.provenance.sourceRoot, 'C:/pkg/checkout');
});

// ---------------------------------------------------------------------------
// Mutation isolation (PACK-A)
// ---------------------------------------------------------------------------

test('mutating the caller Raw after mapping never perturbs the produced graph', async () => {
  const shared = input({
    tools: [tool({ config: { resourceKey: 'pricing-endpoint' } })],
  });
  const result = mapRawV07AuthoringToComponentGraph(shared);
  const digestBefore = await graphDigest(result.graph);

  // Deep caller mutation across every mapped surface.
  (shared.raw as { domainId: string }).domainId = 'domain.tampered';
  (shared.raw.limits as { maxSteps: number }).maxSteps = 999;
  shared.raw.workflows.get('wf.order')!.initial = 'end';
  const startState = shared.raw.workflows.get('wf.order')!.states.start;
  if (startState === undefined) throw new Error('fixture state missing');
  (startState as unknown as { done: unknown[] }).done.length = 0;
  (shared.tools as RawToolDefinition[])[0]!.toolId = 'tool.tampered';
  const sharedTool = (shared.tools as RawToolDefinition[])[0]!;
  if (sharedTool.requiredCapabilities === undefined) throw new Error('fixture capabilities missing');
  (sharedTool.requiredCapabilities as unknown as string[]).length = 0;
  (shared.tools as RawToolDefinition[])[0]!.config = { resourceKey: 'tampered' };

  assert.equal(result.graph.graphId, 'domain.orders');
  assert.equal(await graphDigest(result.graph), digestBefore);
  assert.deepEqual(
    result.resourceDeclarations,
    [{ componentId: 'tool.pricing', requirements: [{ resourceKey: 'pricing-endpoint', required: true }] }],
  );

  // The product still passes the standard gates after caller mutation.
  validateDefinitionGraphEnvelope(result.graph);
});

test('the mapping holds no aliases into caller-owned Raw objects', () => {
  const shared = input({
    tools: [tool({ config: { resourceKey: 'pricing-endpoint' } })],
  });
  const result = mapRawV07AuthoringToComponentGraph(shared);

  const mappedWorkflow = componentById(result.graph.components, 'wf.order');
  const body = mappedWorkflow.semanticBody as unknown as { states: Record<string, { done: unknown[] }> };
  assert.notEqual(body.states.start, shared.raw.workflows.get('wf.order')!.states.start);

  const provenance = result.provenance.components.find((entry) => entry.componentId === 'tool.pricing');
  assert.notEqual(provenance?.historicalIdentity.config, (shared.tools as RawToolDefinition[])[0]!.config);
});

// ---------------------------------------------------------------------------
// No reverse Raw authority (PACK-A)
// ---------------------------------------------------------------------------

test('mapped components are admitted through the generic must-understand seam', () => {
  const result = mapRawV07AuthoringToComponentGraph(input());
  const mapped = componentById(result.graph.components, 'tool.pricing');

  const understood: UnderstoodKindDeclaration = {
    kind: RAW_V07_TOOL_KIND,
    understoodSemanticContracts: [],
    understoodCapabilities: [{ capabilityId: 'http-transport', version: '1' }],
    validateComponent: validateToolComponent,
  };
  const admission = admitComponent(mapped, [understood]);
  assert.equal(admission.status, 'ADMITTED');
  assert.deepEqual(admission.admittedKind, RAW_V07_TOOL_KIND);
});

test('a Kind mismatch fails closed through the same generic seam', () => {
  const result = mapRawV07AuthoringToComponentGraph(input());
  const mapped = componentById(result.graph.components, 'tool.pricing');
  assert.throws(
    () =>
      admitComponent(mapped, [
        {
          kind: RAW_V07_WORKFLOW_KIND,
          understoodSemanticContracts: [],
          understoodCapabilities: [],
          validateComponent: () => undefined,
        },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof ComponentAdmissionError, 'typed ComponentAdmissionError');
      assert.equal((error as ComponentAdmissionError).code, 'UNKNOWN_KIND');
      return true;
    },
  );
});

test('graph-level provenance is non-material: it never perturbs the semantic digest', async () => {
  const result = mapRawV07AuthoringToComponentGraph(input());
  assert.ok(result.graph.nonMaterialExtensions, 'provenance marker present');

  const { nonMaterialExtensions: _dropped, ...materialGraph } = result.graph;
  assert.equal(await graphDigest(result.graph), await graphDigest(materialGraph));

  const marker = result.graph.nonMaterialExtensions as {
    adapter: string;
    sourceSchemaVersion: string;
    sourceDomainId: string;
  };
  assert.equal(marker.adapter, RAW_V07_ADAPTER_PROVENANCE_MARKER);
  assert.equal(marker.sourceSchemaVersion, '0.1');
  assert.equal(marker.sourceDomainId, 'domain.orders');
});

test('workflow and projection Kind constants stay distinct and exact', () => {
  assert.notDeepEqual(RAW_V07_WORKFLOW_KIND, RAW_V07_PROJECTION_KIND);
  assert.notDeepEqual(RAW_V07_WORKFLOW_KIND, RAW_V07_SKILL_KIND);
  assert.notDeepEqual(RAW_V07_TOOL_KIND, RAW_V07_SKILL_KIND);
  for (const kind of [RAW_V07_TOOL_KIND, RAW_V07_WORKFLOW_KIND, RAW_V07_SKILL_KIND, RAW_V07_PROJECTION_KIND]) {
    assert.ok(!kind.kindId.includes('@'));
    assert.ok(!kind.version.includes('@'));
  }
});
