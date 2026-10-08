/**
 * T001A compile-time type fixtures (issue #535).
 *
 * These are proof-only fixtures: they are typechecked by
 * `tsc -p tsconfig.test.json --noEmit` but are never executed. `Expect`/`Equal`
 * force compile failures when the additive Component contract regresses, and
 * `@ts-expect-error` blocks prove negative boundaries (smuggled identity keys,
 * non-JSON material, closed-kind drift) stay unrepresentable.
 */
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  ComponentFamily,
  ComponentId,
  KindRef,
  SemanticContractRef,
} from '../../src/contracts/component.js';
import type { CompiledArtifactKind } from '../../src/v2/index.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: ComponentFamily is exactly the two frozen Product families.
export type FamilyIsExactlyTwoProductFamilies = Expect<
  Equal<ComponentFamily, 'semantic' | 'tool'>
>;

// F2: envelope carries only the seven normative dimensions — no
// implementation/module/provider/assembly identity can be represented.
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

// F3: KindRef is exact semantic contract identity only.
export type KindRefIsContractIdentityOnly = Expect<Equal<keyof KindRef, 'kindId' | 'version'>>;
export type SemanticContractRefIsExact = Expect<
  Equal<keyof SemanticContractRef, 'contractId' | 'version'>
>;
export type CapabilityContractRefIsExact = Expect<
  Equal<keyof CapabilityContractRef, 'capabilityId' | 'version'>
>;

// F4: the Kind dimension stays open — kindId is a plain string, not a closed
// workflow/rule/skill/tool literal union.
export type KindIdStaysOpen = Expect<Equal<KindRef['kindId'], string>>;

// F5: a fully-populated SEMANTIC envelope literal satisfies the contract
// (excess-property checking rejects smuggled fields on literals).
export const semanticEnvelopeFixture: ComponentEnvelope = {
  family: 'semantic',
  componentId: 'quote.eligibility.rule',
  kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  requiredSemanticContracts: [{ contractId: 'customer.tier.schema', version: '2.0.0' }],
  requiredCapabilities: [{ capabilityId: 'semantic-decision', version: '1.0.0' }],
  semanticBody: { threshold: 100, policy: { tier: 'gold', enabled: true } },
};

// F6: the same envelope type carries the TOOL family — no Tool-specific
// closed Kind union and no tool-only envelope variant is required.
export const toolEnvelopeFixture: ComponentEnvelope = {
  family: 'tool',
  componentId: 'http.request.tool',
  kind: { kindId: 'tool.http-request.v1', version: '3.1.0' },
  requiredSemanticContracts: [],
  requiredCapabilities: [
    { capabilityId: 'outbound-http', version: '1.4.0' },
    { capabilityId: 'retry-policy', version: '1.0.0' },
  ],
  semanticBody: { effect: 'none', input: { type: 'object' } },
};

// F7: a novel Kind id is first-class at compile time.
export const novelKindFixture: KindRef = {
  kindId: 'com.kaicreator.example.brand-new-kind',
  version: '0.1.0',
};

// F8: nonMaterialExtensions is optional (absent allowed) and cannot be
// explicitly undefined under exactOptionalPropertyTypes.
export const envelopeWithoutExtensionsFixture: ComponentEnvelope = {
  family: 'semantic',
  componentId: 'quote.eligibility.rule',
  kind: { kindId: 'decision.rule.v1', version: '1.2.0' },
  requiredSemanticContracts: [],
  requiredCapabilities: [],
  semanticBody: { ok: true },
};
// @ts-expect-error explicit undefined is not a JsonValue extension bag
export const explicitUndefinedExtensions: ComponentEnvelope = {
  ...envelopeWithoutExtensionsFixture,
  nonMaterialExtensions: undefined,
};

// F9: legacy closed CompiledArtifactKind union is unchanged and does not
// absorb the new Component families.
export type LegacyClosedKindUnchanged = Expect<
  Equal<
    CompiledArtifactKind,
    | 'rule'
    | 'knowledge'
    | 'skill'
    | 'tool'
    | 'output-schema'
    | 'workflow'
    | 'promoted-subworkflow'
    | 'harness-config'
  >
>;
// @ts-expect-error the new Component family is not a legacy compiled artifact kind
export const newFamilyIsNotALegacyKind: CompiledArtifactKind = 'semantic';

// F10: semanticBody only accepts portable JSON material.
// @ts-expect-error functions are not JSON semantic material
export const nonJsonSemanticBody: ComponentEnvelope['semanticBody'] = () => 1;
// @ts-expect-error bigints are not JSON semantic material
export const nonJsonSemanticBodyBigInt: ComponentEnvelope['semanticBody'] = 1n;

// F11: ComponentId remains a stable logical string identity (open, unbranded
// alias — assignable from and to plain logical id strings).
export const componentIdFixture: ComponentId = 'quote.eligibility.rule';
export const componentIdRoundTrip: string = componentIdFixture;
