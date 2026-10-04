import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  ComponentContractError,
  type ComponentEnvelope,
} from '../../src/contracts/component.js';
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

/** Structural mutable views used only to inject malformed runtime values. */
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

function relation(overrides?: {
  relationId?: string;
  relationKind?: string;
  sourceComponentId?: string;
  targetComponentId?: string;
}): DefinitionRelation {
  return {
    relationId: overrides?.relationId ?? 'rel.eligibility-depends-tier',
    relationKind: overrides?.relationKind ?? 'depends-on',
    sourceComponentId: overrides?.sourceComponentId ?? 'quote.eligibility.rule',
    targetComponentId: overrides?.targetComponentId ?? 'customer.tier.schema',
  };
}

function graph(overrides?: {
  graphId?: string;
  components?: ComponentEnvelope[];
  relations?: DefinitionRelation[];
  nonMaterialExtensions?: DefinitionGraphEnvelope['nonMaterialExtensions'];
}): DefinitionGraphEnvelope {
  return {
    graphId: overrides?.graphId ?? 'quote.domain.graph',
    components:
      overrides?.components ??
      [componentEnvelope('quote.eligibility.rule'), componentEnvelope('customer.tier.schema')],
    relations: overrides?.relations ?? [relation()],
    ...(overrides?.nonMaterialExtensions !== undefined
      ? { nonMaterialExtensions: overrides.nonMaterialExtensions }
      : {}),
  };
}

function expectGraphFailure(
  mutate: (envelope: MutableGraph) => void,
  code: string,
): void {
  const envelope = graph() as unknown as MutableGraph;
  mutate(envelope);
  assert.throws(
    () => validateDefinitionGraphEnvelope(envelope as unknown as DefinitionGraphEnvelope),
    (error: unknown) => {
      assert.ok(error instanceof DefinitionGraphContractError, 'expected DefinitionGraphContractError');
      assert.equal(error.code, code);
      assert.equal(error.name, 'DefinitionGraphContractError');
      return true;
    },
  );
}

function expectRelationFailure(
  mutate: (rel: MutableRelation) => void,
  code: string,
): void {
  expectGraphFailure((envelope) => {
    mutate(envelope.relations[0] as unknown as MutableRelation);
  }, code);
}

test('T001C-R1: valid typed relations represent stable ids, open kinds and exact bound endpoints', () => {
  const envelope = graph({
    relations: [
      relation({
        relationId: 'rel.a',
        relationKind: 'depends-on',
        sourceComponentId: 'quote.eligibility.rule',
        targetComponentId: 'customer.tier.schema',
      }),
      relation({
        relationId: 'rel.b',
        relationKind: 'com.kaicreator.example.brand-new-relation',
        sourceComponentId: 'customer.tier.schema',
        targetComponentId: 'quote.eligibility.rule',
      }),
      // Self-relations are structurally valid: no frozen rule prohibits them.
      relation({
        relationId: 'rel.self',
        relationKind: 'clusters-with',
        sourceComponentId: 'quote.eligibility.rule',
        targetComponentId: 'quote.eligibility.rule',
      }),
    ],
  });
  validateDefinitionGraphEnvelope(envelope);
  assert.deepEqual(envelope.relations[0], {
    relationId: 'rel.a',
    relationKind: 'depends-on',
    sourceComponentId: 'quote.eligibility.rule',
    targetComponentId: 'customer.tier.schema',
  });
});

test('T001C-R2: endpoints accept only exact bound ComponentIds — `id@version` endpoints are floating, never parsed or normalized', () => {
  // An endpoint embedding a version selector is rejected as floating; it is
  // never parsed into (id, version) or normalized to a default.
  expectRelationFailure((rel) => {
    rel.sourceComponentId = 'quote.eligibility.rule@1.2.0';
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectRelationFailure((rel) => {
    rel.targetComponentId = 'customer.tier.schema@latest';
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  // A well-formed endpoint that simply is not a bound componentId dangles.
  expectRelationFailure((rel) => {
    rel.targetComponentId = 'not.bound.component';
  }, 'DANGLING_COMPONENT_REF');
});

test('T001C-R3: dangling relation rejected fail-closed — no placeholder component is auto-created', () => {
  expectRelationFailure((rel) => {
    rel.sourceComponentId = 'ghost.source.component';
  }, 'DANGLING_COMPONENT_REF');
  expectRelationFailure((rel) => {
    rel.targetComponentId = 'ghost.target.component';
  }, 'DANGLING_COMPONENT_REF');

  // Binding the referenced component makes the same relation valid: the
  // earlier failure was about graph-level binding, not the id string itself.
  const repaired = graph({
    components: [
      componentEnvelope('quote.eligibility.rule'),
      componentEnvelope('customer.tier.schema'),
      componentEnvelope('ghost.target.component'),
    ],
  });
  validateDefinitionGraphEnvelope(repaired);
});

test('T001C-R4: duplicate relation rejected — repeated relationId and byte-identical entries, never silently deduplicated', () => {
  // Byte-identical repetition.
  expectGraphFailure((envelope) => {
    envelope.relations = [relation(), relation()];
  }, 'DUPLICATE_RELATION');
  // Same relationId, same declared content, different object identity.
  expectGraphFailure((envelope) => {
    envelope.relations = [relation({ relationId: 'rel.x' }), relation({ relationId: 'rel.x' })];
  }, 'DUPLICATE_RELATION');
});

test('T001C-R5: conflicting relation rejected — same triple under different ids; id reuse with differing kind/endpoints; distinct kinds on one pair stay valid', () => {
  // Same (source, target, relationKind) triple under two different relationIds.
  expectGraphFailure((envelope) => {
    envelope.relations = [
      relation({ relationId: 'rel.one', relationKind: 'depends-on' }),
      relation({ relationId: 'rel.two', relationKind: 'depends-on' }),
    ];
  }, 'CONFLICTING_RELATION');
  // One relationId reused across different kinds.
  expectGraphFailure((envelope) => {
    envelope.relations = [
      relation({ relationId: 'rel.one', relationKind: 'depends-on' }),
      relation({ relationId: 'rel.one', relationKind: 'consumes' }),
    ];
  }, 'CONFLICTING_RELATION');
  // One relationId reused across different endpoints.
  expectGraphFailure((envelope) => {
    envelope.relations = [
      relation({ relationId: 'rel.one' }),
      relation({
        relationId: 'rel.one',
        sourceComponentId: 'customer.tier.schema',
        targetComponentId: 'quote.eligibility.rule',
      }),
    ];
  }, 'CONFLICTING_RELATION');

  // Distinct relation kinds between the same endpoint pair remain valid —
  // a pair may carry multiple typed relations.
  const multiTyped = graph({
    relations: [
      relation({ relationId: 'rel.dep', relationKind: 'depends-on' }),
      relation({ relationId: 'rel.use', relationKind: 'consumes' }),
    ],
  });
  validateDefinitionGraphEnvelope(multiTyped);
});

test('T001C-R6: relations are included exactly once in graph identity — every single relation changes the digest, removal restores it', async () => {
  const relA = relation({ relationId: 'rel.a', relationKind: 'depends-on' });
  const relB = relation({
    relationId: 'rel.b',
    relationKind: 'consumes',
    sourceComponentId: 'quote.eligibility.rule',
    targetComponentId: 'customer.tier.schema',
  });

  const none = await computeDefinitionGraphDigest(graph({ relations: [] }), sha256);
  const withA = await computeDefinitionGraphDigest(graph({ relations: [relA] }), sha256);
  const withAB = await computeDefinitionGraphDigest(graph({ relations: [relA, relB] }), sha256);

  assert.notEqual(withA, none, 'a relation-less graph and a one-relation graph never collide');
  assert.notEqual(withAB, withA, 'adding any single relation changes the digest');
  assert.notEqual(withAB, none);

  const restored = await computeDefinitionGraphDigest(graph({ relations: [relA] }), sha256);
  assert.equal(restored, withA, 'removing the relation restores the earlier digest');
});

test('T001C-R7: graph digest is deterministic and order-insensitive over relations and components', async () => {
  const zeta = componentEnvelope('zeta.component');
  const alpha = componentEnvelope('alpha.component');
  const midway = componentEnvelope('midway.component');
  const relC = relation({
    relationId: 'rel.c',
    relationKind: 'clusters-with',
    sourceComponentId: 'midway.component',
    targetComponentId: 'alpha.component',
  });
  const relA = relation({
    relationId: 'rel.a',
    relationKind: 'consumes',
    sourceComponentId: 'alpha.component',
    targetComponentId: 'midway.component',
  });
  const relB = relation({
    relationId: 'rel.b',
    relationKind: 'depends-on',
    sourceComponentId: 'zeta.component',
    targetComponentId: 'zeta.component',
  });

  const base = graph({ components: [zeta, alpha, midway], relations: [relC, relA, relB] });
  const permuted = graph({
    components: [midway, zeta, alpha],
    relations: [relB, relC, relA],
  });

  const first = await computeDefinitionGraphDigest(base, sha256);
  assert.equal(first, await computeDefinitionGraphDigest(permuted, sha256), 'permutation-insensitive');
  assert.equal(first, await computeDefinitionGraphDigest(base, sha256), 'deterministic on identical input');
});

test('T001C-R8: floating selectors are rejected in relationId, relationKind and endpoints — never normalized to a default/current value', () => {
  const floatingValues = [
    'latest',
    'current',
    'active',
    'default',
    '*',
    'LATEST',
    ' latest ',
    '^1.0.0',
    '~2',
    '<2.0.0',
    '>1.0.0',
    '1 || 2',
    '1.2.*',
  ];
  for (const floating of floatingValues) {
    expectRelationFailure((rel) => {
      rel.relationId = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
    expectRelationFailure((rel) => {
      rel.relationKind = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
    expectRelationFailure((rel) => {
      rel.sourceComponentId = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
    expectRelationFailure((rel) => {
      rel.targetComponentId = floating;
    }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  }
  // `id@version` embedding in every reference field is floating, too.
  expectRelationFailure((rel) => {
    rel.relationId = 'rel.a@1.0.0';
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
  expectRelationFailure((rel) => {
    rel.relationKind = 'depends-on@^2';
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');
});

test('T001C-R9: the empty graph is structurally valid with a well-defined deterministic digest', async () => {
  const empty = graph({ components: [], relations: [] });
  validateDefinitionGraphEnvelope(empty);

  const first = await computeDefinitionGraphDigest(empty, sha256);
  const second = await computeDefinitionGraphDigest(empty, sha256);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test('T001C-R10: digest domain separation — domain-tagged material, no collision with bare component digests, extensions excluded, no component-digest export', async () => {
  assert.equal(typeof DEFINITION_GRAPH_DIGEST_DOMAIN, 'string');
  assert.ok(DEFINITION_GRAPH_DIGEST_DOMAIN.length > 0);

  const single = graph({
    components: [componentEnvelope('quote.eligibility.rule')],
    relations: [],
  });
  const graphDigest = await computeDefinitionGraphDigest(single, sha256);
  const bareComponentDigest = await computeCanonicalJsonDigest(
    componentEnvelope('quote.eligibility.rule'),
    sha256,
  );
  assert.notEqual(
    graphDigest,
    bareComponentDigest,
    'a one-component graph digest never collides with the bare component canonical-JSON digest',
  );

  // The normalized material is wrapped in the graph domain tag, carries the
  // graphId, and sorts components by componentId and relations by relationId.
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
  const expectedMaterial = {
    domain: DEFINITION_GRAPH_DIGEST_DOMAIN,
    graphId: wrapped.graphId,
    components: [...components].sort((a, b) => (a.componentId < b.componentId ? -1 : 1)),
    relations: [...relations].sort((a, b) => (a.relationId < b.relationId ? -1 : 1)),
  };
  assert.equal(
    await computeDefinitionGraphDigest(wrapped, sha256),
    await computeCanonicalJsonDigest(expectedMaterial, sha256),
  );

  // Graph-level nonMaterialExtensions never change the graph digest.
  const withExtensions = graph({ nonMaterialExtensions: { display: { icon: 'graph' } } });
  const withoutExtensions = graph();
  assert.equal(
    await computeDefinitionGraphDigest(withExtensions, sha256),
    await computeDefinitionGraphDigest(withoutExtensions, sha256),
  );

  // The module exports no component-content-digest symbol — the exact
  // runtime export set is graph-domain only.
  const moduleExports = Object.keys(await import('../../src/contracts/definition-graph.js')).sort();
  assert.deepEqual(moduleExports, [
    'DEFINITION_GRAPH_DIGEST_DOMAIN',
    'DefinitionGraphContractError',
    'computeDefinitionGraphDigest',
    'validateDefinitionGraphEnvelope',
  ]);
});

test('T001C-R11: malformed graph and relation types are rejected with typed codes', () => {
  // Non-object graph envelope.
  assert.throws(
    () =>
      validateDefinitionGraphEnvelope(null as unknown as DefinitionGraphEnvelope),
    (error: unknown) =>
      error instanceof DefinitionGraphContractError &&
      error.code === 'INVALID_GRAPH_ENVELOPE',
  );
  assert.throws(
    () =>
      validateDefinitionGraphEnvelope([graph()] as unknown as DefinitionGraphEnvelope),
    (error: unknown) =>
      error instanceof DefinitionGraphContractError &&
      error.code === 'INVALID_GRAPH_ENVELOPE',
  );

  // Unknown fields on the graph envelope.
  expectGraphFailure((envelope) => {
    Object.assign(envelope, { assemblyDigest: 'sha256:abc' });
  }, 'INVALID_GRAPH_ENVELOPE');

  // Empty/blank/non-string graphId.
  expectGraphFailure((envelope) => {
    envelope.graphId = '';
  }, 'INVALID_GRAPH_ID');
  expectGraphFailure((envelope) => {
    envelope.graphId = '   ';
  }, 'INVALID_GRAPH_ID');
  expectGraphFailure((envelope) => {
    envelope.graphId = 42 as unknown as string;
  }, 'INVALID_GRAPH_ID');
  // Floating graphId is never normalized to a default.
  expectGraphFailure((envelope) => {
    envelope.graphId = 'latest';
  }, 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN');

  // Non-array relations / components.
  expectGraphFailure((envelope) => {
    envelope.relations = 'depends-on' as unknown as DefinitionRelation[];
  }, 'INVALID_GRAPH_MATERIAL');
  expectGraphFailure((envelope) => {
    envelope.components = null as unknown as ComponentEnvelope[];
  }, 'INVALID_GRAPH_MATERIAL');

  // Non-object relation entry and unknown fields on a relation.
  expectGraphFailure((envelope) => {
    envelope.relations = ['depends-on' as unknown as DefinitionRelation];
  }, 'INVALID_RELATION');
  expectGraphFailure((envelope) => {
    envelope.relations = [
      Object.assign(relation(), { weight: 3 }) as unknown as DefinitionRelation,
    ];
  }, 'INVALID_RELATION');

  // Empty/blank/non-string relationId.
  expectRelationFailure((rel) => {
    rel.relationId = '';
  }, 'INVALID_RELATION_ID');
  expectRelationFailure((rel) => {
    rel.relationId = '  ';
  }, 'INVALID_RELATION_ID');
  expectRelationFailure((rel) => {
    rel.relationId = undefined as unknown as string;
  }, 'INVALID_RELATION_ID');

  // Empty/non-string relationKind.
  expectRelationFailure((rel) => {
    rel.relationKind = '';
  }, 'INVALID_RELATION_KIND');
  expectRelationFailure((rel) => {
    rel.relationKind = 7 as unknown as string;
  }, 'INVALID_RELATION_KIND');

  // Empty endpoint strings are invalid relations, not dangles.
  expectRelationFailure((rel) => {
    rel.sourceComponentId = '';
  }, 'INVALID_RELATION');

  // nonMaterialExtensions must stay portable JSON material.
  expectGraphFailure((envelope) => {
    envelope.nonMaterialExtensions = (() => 'meta') as unknown as JsonValue;
  }, 'INVALID_GRAPH_MATERIAL');
});

test('T001C-R12: bound components are validated by delegating to validateComponentEnvelope — ComponentContractError propagates unwrapped', () => {
  // An invalid component fails with the component contract error, not a
  // graph error: T001C adds no component-envelope rules.
  const invalidComponent = componentEnvelope('');
  assert.throws(
    () =>
      validateDefinitionGraphEnvelope(
        graph({ components: [invalidComponent] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ComponentContractError, 'expected ComponentContractError');
      assert.equal(error.code, 'INVALID_COMPONENT_ID');
      assert.equal(error.name, 'ComponentContractError');
      return true;
    },
  );

  // A floating component id inside the graph keeps the component contract's
  // own floating-reference code.
  const floatingComponent = componentEnvelope('latest');
  assert.throws(
    () => validateDefinitionGraphEnvelope(graph({ components: [floatingComponent] })),
    (error: unknown) =>
      error instanceof ComponentContractError &&
      error.code === 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
  );

  // A non-envelope object in components fails at the component contract
  // (missing family), and an identity-smuggling envelope object fails the
  // component contract's own unknown-field rule — both propagate unwrapped.
  assert.throws(
    () =>
      validateDefinitionGraphEnvelope(
        graph({
          components: [
            { componentId: 'x' } as unknown as ComponentEnvelope,
          ],
        }),
      ),
    (error: unknown) =>
      error instanceof ComponentContractError &&
      error.code === 'INVALID_COMPONENT_FAMILY',
  );
  assert.throws(
    () =>
      validateDefinitionGraphEnvelope(
        graph({
          components: [
            Object.assign(componentEnvelope('quote.eligibility.rule'), {
              implementationId: 'rule-engine-impl@9',
            }) as unknown as ComponentEnvelope,
          ],
        }),
      ),
    (error: unknown) =>
      error instanceof ComponentContractError &&
      error.code === 'INVALID_COMPONENT_ENVELOPE',
  );

  // Valid components keep validating through delegation.
  validateDefinitionGraphEnvelope(graph());
});
