/**
 * T003B compile-time type fixtures (issue #553).
 *
 * Proof-only fixtures: they are typechecked by
 * `tsc -p tsconfig.test.json --noEmit` but are never executed. `Expect`/`Equal`
 * force compile failures when the Definition-plane Capability provider
 * selection contract regresses, and `@ts-expect-error` blocks prove negative
 * boundaries (implementation identity in the selection evidence, a
 * provides-plane surface on semantic envelopes, drifting error taxonomy) stay
 * unrepresentable.
 */
import * as capabilityProvisionModule from '../../src/contracts/capability-provision.js';
import type {
  CapabilityProviderEvidence,
  CapabilityProviderSelection,
  CapabilityProvisionContractError,
  CapabilityProvisionErrorCode,
  selectCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  ComponentId,
} from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the failure taxonomy is exactly the four frozen T003B codes — no
// drift, no aliases, no assembly/reclosure codes.
export type FailureTaxonomyIsFrozen = Expect<
  Equal<
    CapabilityProvisionErrorCode,
    | 'CAPABILITY_PROVIDER_NOT_FOUND'
    | 'CAPABILITY_PROVIDER_AMBIGUOUS'
    | 'INVALID_SELECTION_INPUT'
    | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
  >
>;
export const typedErrorFixture = new CapabilityProvisionContractError(
  'CAPABILITY_PROVIDER_AMBIGUOUS',
  'conflicting providers',
);
// @ts-expect-error codes outside the frozen taxonomy are unrepresentable
export const unknownCodeFixture = new CapabilityProvisionContractError('OTHER_CODE', 'nope');

// F2: the selection evidence carries exactly the normative dimensions —
// graph identity, the exact required ref, and the provider evidence.
export type SelectionHasOnlyNormativeDimensions = Expect<
  Equal<keyof CapabilityProviderSelection, 'graphId' | 'requiredCapability' | 'provider'>
>;
export type ProviderEvidenceHasOnlyNormativeDimensions = Expect<
  Equal<keyof CapabilityProviderEvidence, 'componentId' | 'family' | 'providesCapability'>
>;

// F3: the provider family in evidence is exactly the tool family — a
// semantic-family provider is unrepresentable in a success result.
export type ProviderFamilyIsExactlyTool = Expect<
  Equal<CapabilityProviderEvidence['family'], 'tool'>
>;

// F4: the selection input is the validated graph envelope plus one exact ref
// and the optional consumer seam — never a per-component provides surface.
export type SelectionInputIsTheGraphEnvelope = Expect<
  Equal<Parameters<typeof selectCapabilityProvider>[0], DefinitionGraphEnvelope>
>;
export type SelectionRefIsExactCapabilityRef = Expect<
  Equal<Parameters<typeof selectCapabilityProvider>[1], CapabilityContractRef>
>;
export type ConsumerSeamIsOptionalBoundComponentId = Expect<
  Equal<Parameters<typeof selectCapabilityProvider>[2], ComponentId | undefined>
>;

// F5: no provides-plane surface exists on Component envelopes (semantic
// envelopes included) — providesCapabilities lives only on the T003A
// ToolOperationsDeclaration, and this module never accepts an envelope as a
// provider candidate.
export type NoProvidesPlaneOnComponentEnvelopes = Expect<
  Equal<'providesCapabilities' extends keyof ComponentEnvelope ? true : false, false>
>;
export type NoEnvelopeParameterOnTheSelectionFunction = Expect<
  Equal<Parameters<typeof selectCapabilityProvider>['length'], 3>
>;

// F6: ambiguity diagnostics are exact ComponentIds — deterministic, sortable,
// free of implementation identity.
export type AmbiguityDiagnosticsAreComponentIds = Expect<
  Equal<CapabilityProvisionContractError['conflictingProviderComponentIds'], readonly ComponentId[]>
>;

// F7: minimal valid literals for the negative smuggle fixtures below.
const refFixture: CapabilityContractRef = {
  capabilityId: 'credit-rating-lookup',
  version: '1.1.0',
};
export const evidenceFixture: CapabilityProviderEvidence = {
  componentId: 'catalog.credit-rating.tool',
  family: 'tool',
  providesCapability: refFixture,
};
export const selectionFixture: CapabilityProviderSelection = {
  graphId: 'provision.test.graph',
  requiredCapability: refFixture,
  provider: evidenceFixture,
};

// F8: no implementation identity of any kind is representable on the
// selection result (excess-property checking on object literals).
export const selectionWithImplementation: CapabilityProviderSelection = {
  ...selectionFixture,
  // @ts-expect-error no implementation binding in the selection evidence
  implementation: 'tool-impl@9',
};
export const selectionWithImplementationId: CapabilityProviderSelection = {
  ...selectionFixture,
  // @ts-expect-error no implementation id in the selection evidence
  implementationId: 'tool-impl@9',
};
export const selectionWithModule: CapabilityProviderSelection = {
  ...selectionFixture,
  // @ts-expect-error no module/package path in the selection evidence
  module: 'host/modules/tool.js',
};
export const selectionWithBinding: CapabilityProviderSelection = {
  ...selectionFixture,
  // @ts-expect-error no assembly binding/pin in the selection evidence
  binding: 'pin-42',
};
export const selectionWithAssemblyDigest: CapabilityProviderSelection = {
  ...selectionFixture,
  // @ts-expect-error no assembly digest in the selection evidence
  assemblyDigest: 'sha256:abc',
};
export const selectionWithRuntimeEndpoint: CapabilityProviderSelection = {
  ...selectionFixture,
  // @ts-expect-error no runtime endpoint in the selection evidence
  runtimeEndpoint: 'https://internal.example',
};
export const selectionWithProviderRoute: CapabilityProviderSelection = {
  ...selectionFixture,
  // @ts-expect-error no provider-routing identity in the selection evidence
  providerRoute: 'primary-pool',
};

// F9: no implementation identity is representable on the provider evidence
// either.
export const evidenceWithImplementationId: CapabilityProviderEvidence = {
  ...evidenceFixture,
  // @ts-expect-error no implementation id in the provider evidence
  implementationId: 'tool-impl@9',
};
export const evidenceWithEndpoint: CapabilityProviderEvidence = {
  ...evidenceFixture,
  // @ts-expect-error no runtime endpoint in the provider evidence
  endpoint: 'https://internal.example',
};
export const evidenceWithPin: CapabilityProviderEvidence = {
  ...evidenceFixture,
  // @ts-expect-error no assembly pin in the provider evidence
  pin: 'pin-42',
};

// F10: the module's runtime surface is exactly the typed error class and the
// pure selection function — no resolver catalogs, no assembly seams, no
// registries.
export type ModuleValueExportsAreSelectionMaterialOnly = Expect<
  Equal<
    keyof typeof capabilityProvisionModule,
    'CapabilityProvisionContractError' | 'selectCapabilityProvider'
  >
>;
