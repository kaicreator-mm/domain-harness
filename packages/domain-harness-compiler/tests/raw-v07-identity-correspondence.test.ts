/**
 * T008B — immutable legacy->v0.7 identity correspondence evidence (PACK-B
 * #589, thin issue #789).
 *
 * The correspondence builder consumes only the accepted T008A mapping result
 * (graph + provenance) and the canonical `computeDefinitionGraphDigest`. The
 * artifact is evidence/provenance only — never a rewrite or reverse Raw
 * authority:
 *
 * - exact stability: same accepted mapping -> identical artifact + exact
 *   DefinitionGraphDigest, entries canonically ordered by componentId;
 * - missing/extra/duplicate/ambiguous correspondence fail typed/closed;
 * - one historical identity mapping to multiple authority-bearing componentIds
 *   fails (v0.7 accepts no one-to-many correspondence rule);
 * - historical identity is preserved byte/value-exact, including hostile
 *   own-data `__proto__` keys;
 * - the artifact is deep-frozen, caller-isolated and holds no aliases into the
 *   accepted mapping; mutating either side after invocation perturbs nothing;
 * - the artifact carries no executable/Raw material and the module exposes no
 *   reverse-mapping seam.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
  type Sha256Port,
} from '@kaicreator/domain-harness/v7';
import type {
  LoadedRawDomainPackage,
  LogicalToolBindingConfig,
  RawProjectionDefinition,
  RawToolDefinition,
  RawWorkflow,
} from '../src/raw/types.js';
import {
  mapRawV07AuthoringToComponentGraph,
  type RawV07AuthoringInput,
  type RawV07ComponentProvenance,
  type RawV07GraphMappingResult,
} from '../src/compat/raw-v07/index.js';
import {
  buildRawV07IdentityCorrespondence,
  RAW_V07_IDENTITY_CORRESPONDENCE_MARKER,
  RawV07IdentityCorrespondenceError,
  type RawV07IdentityCorrespondence,
  type RawV07IdentityCorrespondenceErrorCode,
} from '../src/compat/raw-v07/identity-correspondence.js';
import * as correspondenceModule from '../src/compat/raw-v07/identity-correspondence.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const OBJECT_SCHEMA = { type: 'object' } as const;

// ---------------------------------------------------------------------------
// Fixture builders (mirroring the accepted T008A fixtures)
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
    config: { resourceKey: 'pricing-endpoint' },
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
  return {
    raw: rawPackage(),
    tools: [tool()],
    projections: [projection()],
    ...overrides,
  };
}

function acceptedMapping(overrides: Partial<RawV07AuthoringInput> = {}): RawV07GraphMappingResult {
  return mapRawV07AuthoringToComponentGraph(input(overrides));
}

function provenanceEntry(
  mapping: RawV07GraphMappingResult,
  componentId: string,
): RawV07ComponentProvenance {
  const found = mapping.provenance.components.find((entry) => entry.componentId === componentId);
  assert.ok(found, `provenance entry ${componentId} exists`);
  return found;
}

function correspondenceEntry(
  artifact: RawV07IdentityCorrespondence,
  componentId: string,
): RawV07IdentityCorrespondence['entries'][number] {
  const found = artifact.entries.find((entry) => entry.componentId === componentId);
  assert.ok(found, `correspondence entry ${componentId} exists`);
  return found;
}

/** Accepted mapping whose provenance entries are replaced wholesale. */
function withProvenance(
  mapping: RawV07GraphMappingResult,
  components: readonly RawV07ComponentProvenance[],
): RawV07GraphMappingResult {
  return { ...mapping, provenance: { ...mapping.provenance, components } };
}

/** Tool binding config carrying an added own enumerable data `__proto__` key. */
function toolConfigWithOwnDataProto(protoValue: unknown): LogicalToolBindingConfig {
  const config: Record<string, unknown> = { resourceKey: 'pricing-endpoint' };
  Object.defineProperty(config, '__proto__', {
    value: protoValue,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return config as unknown as LogicalToolBindingConfig;
}

function assertCorrespondenceRejects(
  factory: () => Promise<unknown>,
  code: RawV07IdentityCorrespondenceErrorCode,
  context: string,
): Promise<void> {
  return assert.rejects(factory, (error: unknown) => {
    assert.ok(
      error instanceof RawV07IdentityCorrespondenceError,
      `${context}: typed RawV07IdentityCorrespondenceError`,
    );
    assert.equal(error.code, code, `${context}: ${code}`);
    assert.equal(typeof (error as RawV07IdentityCorrespondenceError).path, 'string', `${context}: path present`);
    return true;
  });
}

function assertDeeplyFrozen(value: unknown, path: string): void {
  if (value === null || typeof value !== 'object') return;
  assert.ok(Object.isFrozen(value), `${path} is frozen`);
  for (const key of Object.getOwnPropertyNames(value)) {
    assertDeeplyFrozen((value as Record<string, unknown>)[key], `${path}.${key}`);
  }
}

/** Evidence walk: every node is frozen JSON data — never a function/accessor/exotic record. */
function assertJsonEvidenceOnly(value: unknown, path: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return;
  }
  if (Array.isArray(value)) {
    assert.ok(Object.isFrozen(value), `${path} array is frozen`);
    for (const [index, element] of value.entries()) {
      assertJsonEvidenceOnly(element, `${path}[${index}]`);
    }
    return;
  }
  assert.equal(Object.getPrototypeOf(value), Object.prototype, `${path} is a plain record`);
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(descriptor !== undefined, `${path}.${key} descriptor present`);
    assert.ok('value' in descriptor, `${path}.${key} is a data property (never an accessor)`);
    assert.ok(descriptor.enumerable, `${path}.${key} is enumerable`);
    assertJsonEvidenceOnly(descriptor.value, `${path}.${key}`);
  }
}

// ---------------------------------------------------------------------------
// Exact correspondence + exact DefinitionGraphDigest
// ---------------------------------------------------------------------------

test('builds the exact frozen correspondence from accepted provenance to generated Component identities', async () => {
  const mapping = acceptedMapping();
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);

  assert.equal(artifact.evidenceKind, RAW_V07_IDENTITY_CORRESPONDENCE_MARKER);
  assert.equal(artifact.schemaVersion, '1');
  assert.equal(artifact.sourceSchemaVersion, '0.1');
  assert.equal(artifact.domainId, 'domain.orders');
  assert.equal(artifact.graphId, 'domain.orders');
  assert.equal(artifact.sourceRoot, '/pkg');
  assert.equal(artifact.definitionGraphDigest, await computeDefinitionGraphDigest(mapping.graph, sha256));

  assert.deepEqual(artifact.entries.map((entry) => entry.componentId), [
    'proj.orderTotal',
    'tool.pricing',
    'wf.order',
  ]);
  assert.deepEqual(correspondenceEntry(artifact, 'proj.orderTotal'), {
    componentId: 'proj.orderTotal',
    sourceKind: 'projection',
    historicalIdentity: { projectionId: 'proj.orderTotal' },
  });
  assert.deepEqual(correspondenceEntry(artifact, 'tool.pricing'), {
    componentId: 'tool.pricing',
    sourceKind: 'tool',
    historicalIdentity: {
      toolId: 'tool.pricing',
      executionKind: 'remote-http-json',
      config: { resourceKey: 'pricing-endpoint' },
    },
  });
  assert.deepEqual(correspondenceEntry(artifact, 'wf.order'), {
    componentId: 'wf.order',
    sourceKind: 'workflow',
    historicalIdentity: { workflowId: 'wf.order', sourcePath: 'workflows/order.yaml' },
  });
});

test('binds the exact canonical DefinitionGraphDigest of the accepted graph, not a local re-digest', async () => {
  const mapping = acceptedMapping();
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);

  const expected = await computeDefinitionGraphDigest(mapping.graph, sha256);
  assert.equal(artifact.definitionGraphDigest, expected);
  assert.match(artifact.definitionGraphDigest, /^[0-9a-f]{64}$/, 'lowercase hex sha256 content digest');

  // The digest is content-bound: a changed representation digests differently.
  const perturbed = { ...mapping.graph, graphId: 'domain.other' } as DefinitionGraphEnvelope;
  assert.notEqual(artifact.definitionGraphDigest, await computeDefinitionGraphDigest(perturbed, sha256));
});

test('is deterministic: repeated builds on the same accepted mapping yield identical artifacts', async () => {
  const mapping = acceptedMapping();
  const first = await buildRawV07IdentityCorrespondence(mapping, sha256);
  const second = await buildRawV07IdentityCorrespondence(mapping, sha256);
  assert.deepEqual(first, second);
  assert.equal(first.definitionGraphDigest, second.definitionGraphDigest);
});

test('correspondence is canonically ordered and independent of provenance record order', async () => {
  const mapping = acceptedMapping();
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);

  const reversed = withProvenance(mapping, [...mapping.provenance.components].reverse());
  const artifactFromReversed = await buildRawV07IdentityCorrespondence(reversed, sha256);

  assert.deepEqual(artifactFromReversed, artifact);
  assert.deepEqual(
    artifact.entries.map((entry) => entry.componentId),
    [...artifact.entries.map((entry) => entry.componentId)].sort(),
  );
});

// ---------------------------------------------------------------------------
// Fail-closed correspondence
// ---------------------------------------------------------------------------

test('a provenance identity with no graph Component fails MISSING, never silently dropped', async () => {
  const mapping = acceptedMapping();
  const fabricated: RawV07ComponentProvenance = {
    componentId: 'tool.ghost',
    sourceKind: 'tool',
    historicalIdentity: { toolId: 'tool.ghost' },
  };
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        withProvenance(mapping, [...mapping.provenance.components, fabricated]),
        sha256,
      ),
    'MISSING_IDENTITY_CORRESPONDENCE',
    'missing correspondence',
  );
});

test('a graph Component without a provenance record fails EXTRA instead of heuristic matching', async () => {
  const mapping = acceptedMapping();
  const withoutProjection = mapping.provenance.components.filter(
    (entry) => entry.componentId !== 'proj.orderTotal',
  );
  await assertCorrespondenceRejects(
    () => buildRawV07IdentityCorrespondence(withProvenance(mapping, withoutProjection), sha256),
    'EXTRA_IDENTITY_CORRESPONDENCE',
    'extra correspondence',
  );
});

test('a duplicated provenance record fails DUPLICATE instead of collapsing into one entry', async () => {
  const mapping = acceptedMapping();
  const toolEntry = provenanceEntry(mapping, 'tool.pricing');
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        withProvenance(mapping, [...mapping.provenance.components, toolEntry]),
        sha256,
      ),
    'DUPLICATE_IDENTITY_CORRESPONDENCE',
    'duplicate correspondence',
  );
});

test('one historical identity mapping to two Component identities fails AMBIGUOUS (no accepted one-to-many rule)', async () => {
  const mapping = acceptedMapping();
  const toolIdentity = provenanceEntry(mapping, 'tool.pricing').historicalIdentity;
  const tamperedWorkflow: RawV07ComponentProvenance = {
    componentId: 'wf.order',
    sourceKind: 'workflow',
    // JSON.parse keeps the expected hostile-safe comparison honest: an object
    // literal spread would not deep-copy hostile own keys.
    historicalIdentity: JSON.parse(JSON.stringify(toolIdentity)),
  };
  const replaced = mapping.provenance.components.map((entry) =>
    entry.componentId === 'wf.order' ? tamperedWorkflow : entry,
  );

  await assertCorrespondenceRejects(
    () => buildRawV07IdentityCorrespondence(withProvenance(mapping, replaced), sha256),
    'AMBIGUOUS_IDENTITY_CORRESPONDENCE',
    'one-to-many correspondence',
  );
});

test('input outside the accepted T008A result shape fails INVALID_MAPPING_INPUT', async () => {
  await assertCorrespondenceRejects(
    () => buildRawV07IdentityCorrespondence(null as never, sha256),
    'INVALID_MAPPING_INPUT',
    'null input',
  );
  await assertCorrespondenceRejects(
    () => buildRawV07IdentityCorrespondence({ graph: {} } as never, sha256),
    'INVALID_MAPPING_INPUT',
    'missing provenance',
  );

  const mapping = acceptedMapping();
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        { ...mapping, provenance: { ...mapping.provenance, schemaVersion: '0.2' } },
        sha256,
      ),
    'INVALID_MAPPING_INPUT',
    'wrong provenance schemaVersion',
  );
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        withProvenance(mapping, [
          { componentId: 'tool.pricing', sourceKind: 'tool', historicalIdentity: 'not-an-object' as never },
        ]),
        sha256,
      ),
    'INVALID_MAPPING_INPUT',
    'non-object historicalIdentity',
  );
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        withProvenance(mapping, [
          {
            componentId: 'tool.pricing',
            sourceKind: 'agent' as never,
            historicalIdentity: { toolId: 'tool.pricing' },
          },
        ]),
        sha256,
      ),
    'INVALID_MAPPING_INPUT',
    'unknown sourceKind',
  );
  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        withProvenance(mapping, [{ componentId: '', sourceKind: 'tool', historicalIdentity: { toolId: '' } }]),
        sha256,
      ),
    'INVALID_MAPPING_INPUT',
    'empty componentId',
  );
});

test('incoherent accepted material fails the correspondence contract, never a guess', async () => {
  const mapping = acceptedMapping();

  await assertCorrespondenceRejects(
    () =>
      buildRawV07IdentityCorrespondence(
        { ...mapping, provenance: { ...mapping.provenance, domainId: 'domain.other' } },
        sha256,
      ),
    'CORRESPONDENCE_CONTRACT_VIOLATION',
    'provenance domainId does not match graphId',
  );

  const swappedKind = mapping.provenance.components.map((entry) =>
    entry.componentId === 'tool.pricing' ? { ...entry, sourceKind: 'workflow' as const } : entry,
  );
  await assertCorrespondenceRejects(
    () => buildRawV07IdentityCorrespondence(withProvenance(mapping, swappedKind), sha256),
    'CORRESPONDENCE_CONTRACT_VIOLATION',
    'sourceKind contradicts the graph Component family',
  );

  // A graph that fails the canonical envelope gate (duplicate relationId) fails
  // typed through the correspondence contract; no digest is minted.
  const brokenGraph = {
    ...mapping.graph,
    relations: [...mapping.graph.relations, mapping.graph.relations[0]!],
  } as DefinitionGraphEnvelope;
  await assertCorrespondenceRejects(
    () => buildRawV07IdentityCorrespondence({ ...mapping, graph: brokenGraph }, sha256),
    'CORRESPONDENCE_CONTRACT_VIOLATION',
    'graph fails the canonical envelope gate',
  );
});

// ---------------------------------------------------------------------------
// Historical identity preservation (byte/value-exact, hostile keys included)
// ---------------------------------------------------------------------------

test('preserves an own data `__proto__` object value in historical identity byte/value-exact', async () => {
  const mapping = acceptedMapping({ tools: [tool({ config: toolConfigWithOwnDataProto({ poison: true }) })] });
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);

  const historical = correspondenceEntry(artifact, 'tool.pricing').historicalIdentity as unknown as {
    config: Record<string, unknown>;
  };
  assert.ok(
    Object.prototype.hasOwnProperty.call(historical.config, '__proto__'),
    'own data `__proto__` survives into the correspondence evidence',
  );
  assert.deepEqual(historical.config['__proto__'], { poison: true });
  assert.equal(Object.getPrototypeOf(historical.config), Object.prototype, 'copy prototype unchanged');
  assert.equal(
    Object.getPrototypeOf(historical.config['__proto__'] as object),
    Object.prototype,
    'nested copied value keeps the plain prototype',
  );

  const provenanceConfig = Object.getOwnPropertyDescriptor(
    provenanceEntry(mapping, 'tool.pricing').historicalIdentity,
    'config',
  )!.value;
  assert.notEqual(
    historical.config,
    provenanceConfig,
    'evidence holds its own copy, not an alias into the accepted mapping',
  );
});

test('preserves primitive and nested own data `__proto__` values with a deterministic canonical representation', async () => {
  for (const poisonValue of ['poison', 42, false]) {
    const mapping = acceptedMapping({ tools: [tool({ config: toolConfigWithOwnDataProto(poisonValue) })] });
    const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);
    const historical = correspondenceEntry(artifact, 'tool.pricing').historicalIdentity as unknown as {
      config: Record<string, unknown>;
    };
    assert.ok(Object.prototype.hasOwnProperty.call(historical.config, '__proto__'));
    assert.equal(historical.config['__proto__'], poisonValue);
    assert.equal(Object.getPrototypeOf(historical.config), Object.prototype);
  }

  // Nested hostile material: expected objects are built via JSON.parse because
  // an object literal `{ __proto__: ... }` routes through the inherited setter.
  const inner = JSON.parse('{"marker":"inner","__proto__":"inner-poison"}') as Record<string, unknown>;
  const nestedConfig = toolConfigWithOwnDataProto(JSON.parse(JSON.stringify({ logical: inner })));
  const mapping = acceptedMapping({ tools: [tool({ config: nestedConfig })] });
  const first = await buildRawV07IdentityCorrespondence(mapping, sha256);
  const second = await buildRawV07IdentityCorrespondence(mapping, sha256);
  assert.deepEqual(first, second, 'hostile nested material stays deterministic');

  const historical = correspondenceEntry(first, 'tool.pricing').historicalIdentity as unknown as {
    config: Record<string, unknown>;
  };
  const copiedNested = historical.config['__proto__'] as Record<string, unknown>;
  assert.deepEqual(copiedNested, JSON.parse('{"logical":{"marker":"inner","__proto__":"inner-poison"}}'));
  assert.ok(
    Object.prototype.hasOwnProperty.call(copiedNested.logical as object, '__proto__'),
    'nested own data `__proto__` survives recursively',
  );
});

test('historical identity is preserved verbatim from the accepted provenance, never normalized', async () => {
  const mapping = acceptedMapping({
    raw: rawPackage({ root: 'C:/pkg/checkout' }),
    tools: [tool({ executionKind: '  remote-http-json  ', bindingCapability: 'binding@2' })],
  });
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);

  assert.equal(artifact.sourceRoot, 'C:/pkg/checkout', 'source root recorded verbatim');
  const historical = correspondenceEntry(artifact, 'tool.pricing').historicalIdentity;
  assert.deepEqual(historical, {
    toolId: 'tool.pricing',
    executionKind: '  remote-http-json  ',
    bindingCapability: 'binding@2',
    config: { resourceKey: 'pricing-endpoint' },
  });
});

// ---------------------------------------------------------------------------
// Mutation isolation / deep freeze
// ---------------------------------------------------------------------------

test('the artifact is deeply frozen through every level including hostile nested material', async () => {
  const mapping = acceptedMapping({ tools: [tool({ config: toolConfigWithOwnDataProto({ poison: true }) })] });
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);
  assertDeeplyFrozen(artifact, 'artifact');
});

test('attempts to mutate the artifact throw (strict mode) and never take effect', async () => {
  const mapping = acceptedMapping();
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);

  assert.throws(() => {
    (artifact as { domainId: string }).domainId = 'domain.tampered';
  }, TypeError);
  assert.throws(() => {
    artifact.entries.push(correspondenceEntry(artifact, 'tool.pricing'));
  }, TypeError);
  assert.throws(() => {
    const entry = correspondenceEntry(artifact, 'tool.pricing');
    (entry as { componentId: string }).componentId = 'tool.tampered';
  }, TypeError);
  assert.throws(() => {
    const entry = correspondenceEntry(artifact, 'tool.pricing');
    (entry.historicalIdentity as { toolId: string }).toolId = 'tool.tampered';
  }, TypeError);

  assert.equal(artifact.domainId, 'domain.orders');
  assert.deepEqual(
    artifact.entries.map((entry) => entry.componentId),
    ['proj.orderTotal', 'tool.pricing', 'wf.order'],
  );
});

test('mutating the accepted mapping after invocation never perturbs the artifact (no torn evidence)', async () => {
  const mapping = acceptedMapping();
  const expectedDigest = await computeDefinitionGraphDigest(mapping.graph, sha256);

  const promise = buildRawV07IdentityCorrespondence(mapping, sha256);
  // Tamper with every caller-owned surface after the invocation returned.
  (mapping.provenance.components as unknown as unknown[]).push({
    componentId: 'tool.ghost',
    sourceKind: 'tool',
    historicalIdentity: { toolId: 'tool.ghost' },
  });
  (mapping.provenance as { sourceRoot: string }).sourceRoot = '/tampered';
  (mapping.graph as { graphId: string }).graphId = 'domain.tampered';
  const artifact = await promise;

  assert.equal(artifact.sourceRoot, '/pkg');
  assert.equal(artifact.graphId, 'domain.orders');
  assert.equal(artifact.definitionGraphDigest, expectedDigest);
  assert.deepEqual(
    artifact.entries.map((entry) => entry.componentId),
    ['proj.orderTotal', 'tool.pricing', 'wf.order'],
  );
});

test('the artifact shares no aliases with the accepted mapping', async () => {
  const mapping = acceptedMapping();
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);

  const artifactEntry = correspondenceEntry(artifact, 'tool.pricing');
  const provenance = provenanceEntry(mapping, 'tool.pricing');
  assert.notEqual(artifactEntry, provenance);
  assert.notEqual(artifactEntry.historicalIdentity, provenance.historicalIdentity);
  assert.notEqual(
    (artifactEntry.historicalIdentity as { config?: object }).config,
    (provenance.historicalIdentity as { config?: object }).config,
  );

  (provenance.historicalIdentity as { toolId: string }).toolId = 'tool.tampered';
  assert.equal((artifactEntry.historicalIdentity as { toolId: string }).toolId, 'tool.pricing');
});

// ---------------------------------------------------------------------------
// No reverse Raw authority
// ---------------------------------------------------------------------------

test('the artifact is evidence only: exact closed key set, JSON data throughout, not a graph authority', async () => {
  const mapping = acceptedMapping();
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);

  assert.deepEqual(Object.keys(artifact).sort(), [
    'definitionGraphDigest',
    'domainId',
    'entries',
    'evidenceKind',
    'graphId',
    'schemaVersion',
    'sourceRoot',
    'sourceSchemaVersion',
  ]);
  for (const entry of artifact.entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['componentId', 'historicalIdentity', 'sourceKind']);
  }

  assertJsonEvidenceOnly(artifact, 'artifact');

  // Evidence is not Definition/Graph authority: it fails the envelope gate.
  assert.throws(() => validateDefinitionGraphEnvelope(artifact as never));
});

test('the module exposes no reverse-mapping or Raw authority seam', async () => {
  assert.deepEqual(Object.keys(correspondenceModule).sort(), [
    'RAW_V07_IDENTITY_CORRESPONDENCE_MARKER',
    'RawV07IdentityCorrespondenceError',
    'buildRawV07IdentityCorrespondence',
  ]);
});

test('changing the new representation never rewrites the frozen historical evidence', async () => {
  const mapping = acceptedMapping();
  const artifact = await buildRawV07IdentityCorrespondence(mapping, sha256);
  const snapshot = JSON.parse(JSON.stringify(artifact));

  // Evolve the new representation after the evidence exists.
  (mapping.graph.components as unknown as unknown[]).length = 0;
  (mapping.graph.relations as unknown as unknown[]).length = 0;

  assert.deepEqual(artifact, snapshot, 'the frozen evidence is untouched by representation changes');

  // Correspondence rebuilt against the evolved graph no longer corresponds:
  // it fails closed rather than minting falsified evidence.
  await assertCorrespondenceRejects(
    () => buildRawV07IdentityCorrespondence(mapping, sha256),
    'MISSING_IDENTITY_CORRESPONDENCE',
    'evolved graph no longer corresponds',
  );
});
