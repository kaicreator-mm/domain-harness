import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  ComponentContractError,
  type ComponentEnvelope,
} from '../../src/contracts/component.js';
import { computeComponentSemanticDigest } from '../../src/contracts/component-digest.js';
import {
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import {
  DEFINITION_GRAPH_DIGEST_DOMAIN,
  DefinitionGraphContractError,
  computeDefinitionGraphDigest,
  validateDefinitionGraphEnvelope,
  type DefinitionGraphEnvelope,
  type DefinitionRelation,
} from '../../src/contracts/definition-graph.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

type MutableGraph = { -readonly [K in keyof DefinitionGraphEnvelope]: DefinitionGraphEnvelope[K] };
type MutableRelation = { -readonly [K in keyof DefinitionRelation]: DefinitionRelation[K] };

function componentEnvelope(componentId: string): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId,
    kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
    requiredSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
    requiredCapabilities: [{ capabilityId: 'semantic-decision', version: '1.0.0' }],
    semanticBody: { threshold: 100, policy: { tier: 'gold', enabled: true } },
  };
}

function relation(overrides: Partial<DefinitionRelation> = {}): DefinitionRelation {
  return {
    relationId: overrides.relationId ?? 'rel.eligibility-depends-tier',
    relationKind: overrides.relationKind ?? 'depends-on',
    sourceComponentId: overrides.sourceComponentId ?? 'quote.eligibility.rule',
    targetComponentId: overrides.targetComponentId ?? 'customer.tier.schema',
  };
}

function graph(overrides: {
  graphId?: string;
  components?: ComponentEnvelope[];
  relations?: DefinitionRelation[];
  nonMaterialExtensions?: DefinitionGraphEnvelope['nonMaterialExtensions'];
} = {}): DefinitionGraphEnvelope {
  return {
    graphId: overrides.graphId ?? 'quote.domain.graph',
    components: overrides.components ?? [
      componentEnvelope('quote.eligibility.rule'),
      componentEnvelope('customer.tier.schema'),
    ],
    relations: overrides.relations ?? [relation()],
    ...(overrides.nonMaterialExtensions !== undefined
      ? { nonMaterialExtensions: overrides.nonMaterialExtensions }
      : {}),
  };
}

function expectGraphFailure(mutate: (envelope: MutableGraph) => void, code: string): void {
  const envelope = graph() as unknown as MutableGraph;
  mutate(envelope);
  assert.throws(
    () => validateDefinitionGraphEnvelope(envelope as DefinitionGraphEnvelope),
    (error: unknown) => {
      assert.ok(error instanceof DefinitionGraphContractError);
      assert.equal(error.code, code);
      return true;
    },
  );
}

function expectRelationFailure(mutate: (rel: MutableRelation) => void, code: string): void {
  expectGraphFailure((envelope) => mutate(envelope.relations[0] as unknown as MutableRelation), code);
}

test('T001C-R1: valid typed relations keep open kinds, exact bound endpoints, and self-relations', () => {
  const envelope = graph({
    relations: [
      relation({ relationId: 'rel.a', relationKind: 'depends-on' }),
      relation({
        relationId: 'rel.b',
        relationKind: 'com.kaicreator.example.brand-new-relation',
        sourceComponentId: 'customer.tier.schema',
        targetComponentId: 'quote.eligibility.rule',
      }),
      relation({
        relationId: 'rel.self',
        relationKind: 'clusters-with',
        sourceComponentId: 'quote.eligibility.rule',
        targetComponentId: 'quote.eligibility.rule',
      }),
    ],
  });
  validateDefinitionGraphEnvelope(envelope);
});

test('T001C-R2: endpoints must be exact bound ComponentIds; floating or dangling refs fail closed', () => {
  expectRelationFailure((rel) => { rel.sourceComponentId = 'quote.eligibility.rule@1.2.0'; }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectRelationFailure((rel) => { rel.targetComponentId = 'customer.tier.schema@latest'; }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectRelationFailure((rel) => { rel.targetComponentId = 'not.bound.component'; }, 'DANGLING_COMPONENT_REF');
});

test('T001C-R3: duplicate and conflicting relations are rejected rather than deduplicated', () => {
  expectGraphFailure((envelope) => {
    envelope.relations = [relation(), relation()];
  }, 'DUPLICATE_RELATION');
  expectGraphFailure((envelope) => {
    envelope.relations = [
      relation({ relationId: 'rel.one', relationKind: 'depends-on' }),
      relation({ relationId: 'rel.two', relationKind: 'depends-on' }),
    ];
  }, 'CONFLICTING_RELATION');
  expectGraphFailure((envelope) => {
    envelope.relations = [
      relation({ relationId: 'rel.one', relationKind: 'depends-on' }),
      relation({ relationId: 'rel.one', relationKind: 'consumes' }),
    ];
  }, 'CONFLICTING_RELATION');
});

test('T001C-R4: relations enter Definition identity exactly once', async () => {
  const relA = relation({ relationId: 'rel.a', relationKind: 'depends-on' });
  const relB = relation({ relationId: 'rel.b', relationKind: 'consumes' });
  const none = await computeDefinitionGraphDigest(graph({ relations: [] }), sha256);
  const withA = await computeDefinitionGraphDigest(graph({ relations: [relA] }), sha256);
  const withAB = await computeDefinitionGraphDigest(graph({ relations: [relA, relB] }), sha256);
  assert.notEqual(none, withA);
  assert.notEqual(withA, withAB);
  assert.equal(withA, await computeDefinitionGraphDigest(graph({ relations: [relA] }), sha256));
});

test('T001C-R5: graph digest is deterministic and order-insensitive over bound components and relations', async () => {
  const alpha = componentEnvelope('alpha.component');
  const midway = componentEnvelope('midway.component');
  const zeta = componentEnvelope('zeta.component');
  const relA = relation({ relationId: 'rel.a', sourceComponentId: 'alpha.component', targetComponentId: 'midway.component' });
  const relB = relation({ relationId: 'rel.b', sourceComponentId: 'zeta.component', targetComponentId: 'zeta.component' });
  const relC = relation({ relationId: 'rel.c', sourceComponentId: 'midway.component', targetComponentId: 'alpha.component' });

  const first = await computeDefinitionGraphDigest(
    graph({ components: [zeta, alpha, midway], relations: [relC, relA, relB] }),
    sha256,
  );
  const second = await computeDefinitionGraphDigest(
    graph({ components: [midway, zeta, alpha], relations: [relB, relC, relA] }),
    sha256,
  );
  assert.equal(first, second);
});

test('T001C-R6: floating selectors are rejected everywhere relation identity is authority-bearing', () => {
  const floatingValues = ['latest', 'current', 'active', 'default', '*', '^1.0.0', '~2', '<2', '>1', '1 || 2', '1.2.*'];
  for (const floating of floatingValues) {
    expectRelationFailure((rel) => { rel.relationId = floating; }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
    expectRelationFailure((rel) => { rel.relationKind = floating; }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
    expectRelationFailure((rel) => { rel.sourceComponentId = floating; }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
    expectRelationFailure((rel) => { rel.targetComponentId = floating; }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  }
});

test('T001C-R7: empty graph remains structurally valid with a deterministic digest', async () => {
  const empty = graph({ components: [], relations: [] });
  validateDefinitionGraphEnvelope(empty);
  const first = await computeDefinitionGraphDigest(empty, sha256);
  assert.equal(first, await computeDefinitionGraphDigest(empty, sha256));
  assert.match(first, /^[0-9a-f]{64}$/);
});

test('T001C-R8/#555: graph material is domain-separated and composes exact Component semantic digests', async () => {
  const components = [componentEnvelope('zeta.component'), componentEnvelope('alpha.component')];
  const relations = [
    relation({
      relationId: 'rel.b',
      relationKind: 'consumes',
      sourceComponentId: 'zeta.component',
      targetComponentId: 'alpha.component',
    }),
    relation({
      relationId: 'rel.a',
      relationKind: 'depends-on',
      sourceComponentId: 'alpha.component',
      targetComponentId: 'zeta.component',
    }),
  ];
  const wrapped = graph({ components, relations });
  const sortedComponents = [...components].sort((a, b) => (a.componentId < b.componentId ? -1 : 1));
  const normalizedComponents = [];
  for (const component of sortedComponents) {
    normalizedComponents.push({
      componentId: component.componentId,
      componentSemanticDigest: await computeComponentSemanticDigest(component, sha256),
    });
  }
  const expectedMaterial = {
    domain: DEFINITION_GRAPH_DIGEST_DOMAIN,
    graphId: wrapped.graphId,
    components: normalizedComponents,
    relations: [...relations].sort((a, b) => (a.relationId < b.relationId ? -1 : 1)),
  };
  assert.equal(
    await computeDefinitionGraphDigest(wrapped, sha256),
    await computeCanonicalJsonDigest(expectedMaterial, sha256),
  );
});

test('T001C-R9: graph-level nonMaterialExtensions remain outside semantic identity', async () => {
  const withExtensions = graph({ nonMaterialExtensions: { display: { icon: 'graph' } } });
  assert.equal(
    await computeDefinitionGraphDigest(withExtensions, sha256),
    await computeDefinitionGraphDigest(graph(), sha256),
  );
});

test('T001C-R10: malformed graph/relation material fails with typed graph errors', () => {
  assert.throws(
    () => validateDefinitionGraphEnvelope(null as unknown as DefinitionGraphEnvelope),
    (error: unknown) => error instanceof DefinitionGraphContractError && error.code === 'INVALID_GRAPH_ENVELOPE',
  );
  expectGraphFailure((envelope) => { Object.assign(envelope, { assemblyDigest: 'sha256:abc' }); }, 'INVALID_GRAPH_ENVELOPE');
  expectGraphFailure((envelope) => { envelope.graphId = ''; }, 'INVALID_GRAPH_ID');
  expectGraphFailure((envelope) => { envelope.relations = 'x' as unknown as DefinitionRelation[]; }, 'INVALID_GRAPH_MATERIAL');
  expectGraphFailure((envelope) => { envelope.components = null as unknown as ComponentEnvelope[]; }, 'INVALID_GRAPH_MATERIAL');
  expectGraphFailure((envelope) => { envelope.relations = ['x' as unknown as DefinitionRelation]; }, 'INVALID_RELATION');
  expectRelationFailure((rel) => { rel.relationId = ''; }, 'INVALID_RELATION_ID');
  expectRelationFailure((rel) => { rel.relationKind = ''; }, 'INVALID_RELATION_KIND');
  expectGraphFailure((envelope) => {
    envelope.nonMaterialExtensions = (() => 'meta') as unknown as JsonValue;
  }, 'INVALID_GRAPH_MATERIAL');
});

test('T001C-R11: Component contract failures propagate unwrapped', () => {
  assert.throws(
    () => validateDefinitionGraphEnvelope(graph({ components: [componentEnvelope('')] })),
    (error: unknown) => error instanceof ComponentContractError && error.code === 'INVALID_COMPONENT_ID',
  );
  assert.throws(
    () => validateDefinitionGraphEnvelope(graph({ components: [componentEnvelope('latest')] })),
    (error: unknown) => error instanceof ComponentContractError && error.code === 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );
  assert.throws(
    () => validateDefinitionGraphEnvelope(graph({
      components: [Object.assign(componentEnvelope('component.a'), { implementationId: 'impl@9' }) as unknown as ComponentEnvelope],
    })),
    (error: unknown) => error instanceof ComponentContractError && error.code === 'INVALID_COMPONENT_ENVELOPE',
  );
});

test('T001C-R12: module runtime surface stays graph-only', async () => {
  const moduleExports = Object.keys(await import('../../src/contracts/definition-graph.js')).sort();
  assert.deepEqual(moduleExports, [
    'DEFINITION_GRAPH_DIGEST_DOMAIN',
    'DefinitionGraphContractError',
    'computeDefinitionGraphDigest',
    'validateDefinitionGraphEnvelope',
  ]);
});
