/**
 * T001C compile-time type fixtures (issue #542).
 *
 * Proof-only fixtures: they are typechecked by
 * `tsc -p tsconfig.test.json --noEmit` but are never executed. `Expect`/`Equal`
 * force compile failures when the Definition relation/graph contract
 * regresses, and `@ts-expect-error` blocks prove negative boundaries
 * (closed relation-kind unions, smuggled identity fields, non-JSON
 * extensions) stay unrepresentable.
 */
import type { ComponentEnvelope, ComponentId } from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope, DefinitionRelation } from '../../src/contracts/definition-graph.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: DefinitionRelation carries exactly the four normative dimensions.
export type RelationHasExactlyFourDimensions = Expect<
  Equal<
    keyof DefinitionRelation,
    'relationId' | 'relationKind' | 'sourceComponentId' | 'targetComponentId'
  >
>;

// F2: the graph envelope carries only the normative dimensions — no
// implementation/assembly/runtime identity can be represented.
export type GraphEnvelopeHasOnlyNormativeDimensions = Expect<
  Equal<
    Exclude<
      keyof DefinitionGraphEnvelope,
      'graphId' | 'components' | 'relations' | 'nonMaterialExtensions'
    >,
    never
  >
>;

// F3: relationKind stays open — a plain exact identity string, never a closed
// `depends-on | consumes | ...` union.
export type RelationKindStaysOpen = Expect<Equal<DefinitionRelation['relationKind'], string>>;

// F4: endpoints are exact ComponentIds from the component contract (same
// unbranded logical identity alias, assignable both ways).
export type SourceEndpointIsExactComponentId = Expect<
  Equal<DefinitionRelation['sourceComponentId'], ComponentId>
>;
export type TargetEndpointIsExactComponentId = Expect<
  Equal<DefinitionRelation['targetComponentId'], ComponentId>
>;

// F5: components are the unmodified T001A ComponentEnvelope — the graph
// reuses the component contract, it does not fork it.
export type GraphComponentsAreComponentEnvelopes = Expect<
  Equal<DefinitionGraphEnvelope['components'][number], ComponentEnvelope>
>;

// F6: a fully-populated graph literal satisfies the contract (excess-property
// checking rejects smuggled fields on literals).
export const graphFixture: DefinitionGraphEnvelope = {
  graphId: 'quote.domain.graph',
  components: [
    {
      family: 'semantic',
      componentId: 'quote.eligibility.rule',
      kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
      requiredSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
      requiredCapabilities: [],
      semanticBody: { threshold: 100 },
    },
    {
      family: 'semantic',
      componentId: 'customer.tier.schema',
      kind: { kindId: 'data.schema.v1', version: '2.0.0' },
      requiredSemanticContracts: [],
      requiredCapabilities: [],
      semanticBody: { tier: 'gold' },
    },
  ],
  relations: [
    {
      relationId: 'rel.eligibility-depends-tier',
      relationKind: 'depends-on',
      sourceComponentId: 'quote.eligibility.rule',
      targetComponentId: 'customer.tier.schema',
    },
  ],
};

// F7: a novel relation kind is first-class at compile time — no closed catalog.
export const novelRelationKindFixture: DefinitionRelation = {
  relationId: 'rel.novel',
  relationKind: 'com.kaicreator.example.brand-new-relation',
  sourceComponentId: 'quote.eligibility.rule',
  targetComponentId: 'customer.tier.schema',
};

// F8: nonMaterialExtensions is optional (absent allowed) and cannot be
// explicitly undefined under exactOptionalPropertyTypes.
export const graphWithoutExtensionsFixture: DefinitionGraphEnvelope = {
  graphId: 'quote.domain.graph',
  components: [],
  relations: [],
};
// @ts-expect-error explicit undefined is not a JsonValue extension bag
export const explicitUndefinedExtensions: DefinitionGraphEnvelope = {
  ...graphWithoutExtensionsFixture,
  nonMaterialExtensions: undefined,
};

// F9: graph-level extensions only accept portable JSON material.
// @ts-expect-error functions are not JSON extension material
export const nonJsonExtensions: DefinitionGraphEnvelope['nonMaterialExtensions'] = () => 1;

// F10: relations cannot smuggle identity fields on literals (excess-property
// check) — implementation/assembly identity stays unrepresentable.
export const smuggledRelationField: DefinitionRelation = {
  relationId: 'rel.x',
  relationKind: 'depends-on',
  sourceComponentId: 'quote.eligibility.rule',
  targetComponentId: 'customer.tier.schema',
  // @ts-expect-error implementation identity is not part of a relation
  implementationId: 'rule-engine-impl@9',
};
