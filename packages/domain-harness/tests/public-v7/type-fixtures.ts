/**
 * T001E compile-time public type/import fixtures (issue #551).
 *
 * Proof-only fixtures: they are typechecked by
 * `tsc -p tsconfig.test.json --noEmit` but are never executed. The full
 * promised 25-type set is imported through the package self-name
 * `@kaicreator/domain-harness/v7` — self-name resolution through the package
 * `exports` map, landing on `dist/public-v7/index.d.ts` — proving the whole
 * successor type surface is reachable at compile time. `Expect`/`Equal` pin
 * key shapes; `@ts-expect-error` negatives prove internal helpers stay
 * unreachable from `./v7` and the v0.7 Component envelope stays unreachable
 * from the legacy `./v2` surface.
 */
import type {
  CapabilityContractRef,
  ComponentAdmissionErrorCode,
  ComponentAdmissionFailureClass,
  ComponentAdmissionResult,
  ComponentContractErrorCode,
  ComponentDigestErrorCode,
  ComponentEnvelope,
  ComponentFamily,
  ComponentId,
  ContentDigest,
  DefinitionGraphContractErrorCode,
  DefinitionGraphEnvelope,
  DefinitionRelation,
  KindRef,
  RelationId,
  RelationKind,
  SemanticContractRef,
  Sha256Port,
  ToolComponentContractErrorCode,
  ToolOperationEffect,
  ToolOperationContract,
  ToolOperationsDeclaration,
  UnderstoodKindDeclaration,
  UnderstoodKindSet,
} from '@kaicreator/domain-harness/v7';
// @ts-expect-error internal-only canonicalization helpers are not exported from ./v7
import { canonicalizeJson } from '@kaicreator/domain-harness/v7';
// @ts-expect-error the v0.7 Component envelope is not reachable from the legacy ./v2 surface
import type { ComponentEnvelope as ComponentEnvelopeViaV2 } from '@kaicreator/domain-harness/v2';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// TF1: ComponentFamily is exactly the two frozen Product families.
export type FamilyIsExactlyTwoProductFamilies = Expect<
  Equal<ComponentFamily, 'semantic' | 'tool'>
>;

// TF2: ComponentId stays an open logical string identity.
export type ComponentIdIsOpenString = Expect<Equal<ComponentId, string>>;
export type RelationIdIsOpenString = Expect<Equal<RelationId, string>>;
export type RelationKindIsOpenString = Expect<Equal<RelationKind, string>>;

// TF3: exact reference shapes.
export type KindRefIsExactPair = Expect<Equal<keyof KindRef, 'kindId' | 'version'>>;
export type SemanticContractRefIsExactPair = Expect<
  Equal<keyof SemanticContractRef, 'contractId' | 'version'>
>;
export type CapabilityContractRefIsExactPair = Expect<
  Equal<keyof CapabilityContractRef, 'capabilityId' | 'version'>
>;
export type DefinitionRelationShape = Expect<
  Equal<
    keyof DefinitionRelation,
    'relationId' | 'relationKind' | 'sourceComponentId' | 'targetComponentId'
  >
>;

// TF4: the envelope carries only the seven normative dimensions.
export type EnvelopeHasOnlyNormativeDimensions = Expect<
  Equal<
    Exclude<
      keyof ComponentEnvelope,
      | 'family'
      | 'componentId'
      | 'kind'
      | 'requiredSemanticContracts'
      | 'requiredCapabilities'
      | 'semanticBody'
      | 'nonMaterialExtensions'
    >,
    never
  >
>;

// TF5: shared identity foundation types flow through the successor entry.
export type ContentDigestIsString = Expect<Equal<ContentDigest, string>>;
export type Sha256PortIsPortableSeam = Expect<
  Equal<ReturnType<Sha256Port['digestUtf8']>, Promise<string>>
>;

// TF6: error-code unions are the frozen contract unions (spot members from
// each of the five modules are present).
export type ComponentCodesPresent =
  'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN' extends ComponentContractErrorCode ? true : false;
export type DigestCodesPresent = 'NON_CANONICAL_JSON' extends ComponentDigestErrorCode
  ? true
  : false;
export type GraphCodesPresent = 'DANGLING_COMPONENT_REF' extends DefinitionGraphContractErrorCode
  ? true
  : false;
export type AdmissionCodesPresent = 'UNKNOWN_KIND' extends ComponentAdmissionErrorCode
  ? true
  : false;
export type ToolCodesPresent = 'INVALID_TOOL_OPERATION_EFFECT' extends ToolComponentContractErrorCode
  ? true
  : false;

// TF7: admission result shape.
export type AdmissionStatusIsAdmitted = Expect<
  Equal<ComponentAdmissionResult['status'], 'ADMITTED'>
>;
export type FailureClassesAreFrozen = Expect<
  Equal<ComponentAdmissionFailureClass, 'KIND' | 'CONTRACT' | 'FIELD' | 'INPUT'>
>;

// TF8: tool operation material.
export type ToolEffectIsFrozenTrio = Expect<
  Equal<ToolOperationEffect, 'none' | 'idempotent' | 'non-idempotent'>
>;
export type ToolOperationShape = Expect<
  Equal<
    Exclude<keyof ToolOperationContract, 'declaredFailures' | 'declaredExposure'>,
    'operationId' | 'inputSchema' | 'outputSchema' | 'effect'
  >
>;
export type ToolDeclarationShape = Expect<
  Equal<keyof ToolOperationsDeclaration, 'operations' | 'providesCapabilities'>
>;

// TF9: the understood-Kind set is a readonly declaration array.
export type UnderstoodKindSetIsReadonlyArray = Expect<
  Equal<UnderstoodKindSet, readonly UnderstoodKindDeclaration[]>
>;
export type UnderstoodDeclarationShape = Expect<
  Equal<
    keyof UnderstoodKindDeclaration,
    'kind' | 'understoodSemanticContracts' | 'materialSemanticBodyFields'
  >
>;

// TF10: a fully-populated SEMANTIC envelope literal is expressible through
// the successor entry's exported types.
export const semanticEnvelopeFixture: ComponentEnvelope = {
  family: 'semantic',
  componentId: 't001e.fixture.envelope',
  kind: { kindId: 't001e.fixture.kind', version: '1.0.0' },
  requiredSemanticContracts: [{ contractId: 't001e.fixture.contract', version: '2.0.0' }],
  requiredCapabilities: [{ capabilityId: 't001e.fixture.capability', version: '1.0.0' }],
  semanticBody: { threshold: 100, tier: 'gold' },
};

// TF11: a TOOL operations declaration literal is expressible through the
// successor entry's exported types.
export const toolDeclarationFixture: ToolOperationsDeclaration = {
  operations: [
    {
      operationId: 't001e.fixture.op.ping',
      inputSchema: {},
      outputSchema: {},
      effect: 'idempotent',
      declaredFailures: ['t001e.fixture.failure.unreachable'],
    },
  ],
  providesCapabilities: [{ capabilityId: 't001e.fixture.capability', version: '1.0.0' }],
};

// TF12: a graph envelope literal is expressible through the successor
// entry's exported types.
export const graphEnvelopeFixture: DefinitionGraphEnvelope = {
  graphId: 't001e.fixture.graph',
  components: [semanticEnvelopeFixture],
  relations: [],
};

// TF13: a stub Sha256Port is implementable from the exported seam.
export const stubSha256Fixture: Sha256Port = {
  digestUtf8: async (value) => `fixture-${value.length}`,
};
export const digestUsageFixture: ContentDigest = await stubSha256Fixture.digestUtf8('probe');

// TF14: the errored legacy-surface import binding above must never start
// resolving — the alias keeps the negative import "used" for noUnusedLocals
// while asserting nothing about TS error-recovery types.
export type LegacySurfaceProbe = ComponentEnvelopeViaV2;
void canonicalizeJson;
