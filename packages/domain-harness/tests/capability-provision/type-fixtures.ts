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
import { CapabilityProvisionContractError } from '../../src/contracts/capability-provision.js';
import type {
  CapabilityProviderEvidence,
  CapabilityProviderSelection,
  CapabilityProvisionErrorCode,
  CurrentCapabilityConsumerEvidence,
  CurrentCapabilityProviderSelection,
  resolveCurrentCapabilityProvider,
  selectCapabilityProvider,
} from '../../src/contracts/capability-provision.js';
import type {
  CapabilityContractRef,
  ComponentEnvelope,
  ComponentId,
} from '../../src/contracts/component.js';
import type { DefinitionGraphEnvelope } from '../../src/contracts/definition-graph.js';
import type { ContentDigest, Sha256Port } from '../../src/contracts/identity.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// F1: the failure taxonomy is exactly the six frozen T003B/#572 codes — no
// drift, no aliases, no assembly/reclosure codes.
export type FailureTaxonomyIsFrozen = Expect<
  Equal<
    CapabilityProvisionErrorCode,
    | 'CAPABILITY_PROVIDER_NOT_FOUND'
    | 'CAPABILITY_PROVIDER_AMBIGUOUS'
    | 'INVALID_SELECTION_INPUT'
    | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
    | 'CONSUMER_CAPABILITY_NOT_REQUIRED'
    | 'DEFINITION_GRAPH_DIGEST_MISMATCH'
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
// two selection functions — no resolver catalogs, no assembly seams, no
// registries, no admitted/authority-named values.
export type ModuleValueExportsAreSelectionMaterialOnly = Expect<
  Equal<
    keyof typeof capabilityProvisionModule,
    | 'CapabilityProvisionContractError'
    | 'selectCapabilityProvider'
    | 'resolveCurrentCapabilityProvider'
  >
>;

// ---------------------------------------------------------------------------
// #572 F11-F14: the Definition-currentness-bound selection seam is
// distinctly typed from candidate discovery — it can never be confused with
// admitted/runtime-authoritative evidence because no admission or authority
// dimension exists on the type.
// ---------------------------------------------------------------------------

// F11: the currentness-bound result carries exactly the currentness-bound
// dimensions — graph identity, verified graph digest, the exact required ref,
// the consumer requirement evidence, and the provider evidence. No admission,
// authority, runtime or implementation dimension is representable.
export type CurrentSelectionHasOnlyCurrentnessDimensions = Expect<
  Equal<
    keyof CurrentCapabilityProviderSelection,
    | 'graphId'
    | 'definitionGraphDigest'
    | 'requiredCapability'
    | 'consumer'
    | 'provider'
  >
>;
export type CurrentConsumerHasOnlyRequirementDimensions = Expect<
  Equal<keyof CurrentCapabilityConsumerEvidence, 'componentId' | 'requiredCapability'>
>;

// F12: the currentness-bound result is NOT the candidate result and the
// candidate result is NOT currentness-bound — the two evidence kinds are
// compile-time distinguishable, so candidate evidence can never silently
// stand in for currentness-bound evidence.
export type CandidateSelectionIsNotCurrentnessBound = Expect<
  Equal<Equal<CapabilityProviderSelection, CurrentCapabilityProviderSelection>, false>
>;

// F13: the currentness-bound input is the validated graph envelope, one exact
// ref, a REQUIRED consumer id, a claimed graph digest, and the Sha256Port —
// the consumer is not optional, so an omitted consumer cannot mint evidence.
export type CurrentSelectionInputIsTheGraphEnvelope = Expect<
  Equal<Parameters<typeof resolveCurrentCapabilityProvider>[0], DefinitionGraphEnvelope>
>;
export type CurrentSelectionRefIsExactCapabilityRef = Expect<
  Equal<Parameters<typeof resolveCurrentCapabilityProvider>[1], CapabilityContractRef>
>;
export type CurrentSelectionConsumerIsRequiredBoundComponentId = Expect<
  Equal<Parameters<typeof resolveCurrentCapabilityProvider>[2], ComponentId>
>;
export type CurrentSelectionDigestIsContentDigest = Expect<
  Equal<Parameters<typeof resolveCurrentCapabilityProvider>[3], ContentDigest>
>;
export type CurrentSelectionSha256IsThePort = Expect<
  Equal<Parameters<typeof resolveCurrentCapabilityProvider>[4], Sha256Port>
>;
export type CurrentSelectionReturnsPromiseOfEvidence = Expect<
  Equal<
    ReturnType<typeof resolveCurrentCapabilityProvider>,
    Promise<CurrentCapabilityProviderSelection>
  >
>;
// @ts-expect-error the consumer id is required — an omitted consumer cannot
// mint currentness-bound selection evidence (compile-time fail-closed).
export const currentSelectionWithoutConsumer: Promise<CurrentCapabilityProviderSelection> =
  resolveCurrentCapabilityProvider(
    {} as DefinitionGraphEnvelope,
    {} as CapabilityContractRef,
    undefined,
    {} as ContentDigest,
    {} as Sha256Port,
  );

// F14: no admitted/authority/implementation identity of any kind is
// representable on the currentness-bound evidence (excess-property checking
// on object literals).
const currentConsumerFixture: CurrentCapabilityConsumerEvidence = {
  componentId: 'quote.eligibility.rule',
  requiredCapability: refFixture,
};
export const currentSelectionFixture: CurrentCapabilityProviderSelection = {
  graphId: 'provision.test.graph',
  definitionGraphDigest: 'sha256:abc',
  requiredCapability: refFixture,
  consumer: currentConsumerFixture,
  provider: evidenceFixture,
};
export const currentSelectionWithAdmitted: CurrentCapabilityProviderSelection = {
  ...currentSelectionFixture,
  // @ts-expect-error no admission marker in the currentness-bound evidence
  admitted: true,
};
export const currentSelectionWithAuthority: CurrentCapabilityProviderSelection = {
  ...currentSelectionFixture,
  // @ts-expect-error no authority grade in the currentness-bound evidence
  authorityGrade: 'admitted',
};
export const currentSelectionWithImplementation: CurrentCapabilityProviderSelection = {
  ...currentSelectionFixture,
  // @ts-expect-error no implementation binding in the currentness-bound evidence
  implementation: 'tool-impl@9',
};
export const currentSelectionWithAssembly: CurrentCapabilityProviderSelection = {
  ...currentSelectionFixture,
  // @ts-expect-error no sealed Assembly provenance in the currentness-bound evidence
  assemblyDigest: 'sha256:def',
};
export const currentSelectionWithAdmissionEvidence: CurrentCapabilityProviderSelection = {
  ...currentSelectionFixture,
  // @ts-expect-error no ComponentAdmissionResult consumption here (#575 owns it)
  admissionResult: {} as unknown,
};
