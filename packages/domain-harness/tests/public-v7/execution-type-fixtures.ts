/**
 * T012-D1 compile-time type/import fixtures for the additive
 * `@kaicreator/domain-harness/v7/execution` facade (gate #930; adjudication
 * #537@6052473158).
 *
 * Proof-only fixtures: typechecked by `tsc -p tsconfig.test.json --noEmit`
 * but never executed. The full promised type surface is imported through the
 * package self-name `@kaicreator/domain-harness/v7/execution` — self-name
 * resolution through the package `exports` map, landing on
 * `dist/public-v7/execution.d.ts` — proving the whole execution type surface
 * is reachable at compile time without any private deep import.
 * `Expect`/`Equal` pin key shapes; `@ts-expect-error` negatives prove the
 * deliberately non-promoted owner seams (the T003C evidence verifier) and
 * internal helpers stay unreachable from `./v7/execution`.
 *
 * The list is the minimal transitive public type closure of the named
 * function signatures: owner-module input/output/option/result types, the
 * typed error classes' code types, and the shared foundation types those
 * signatures reference that are not already reachable from a declared
 * public subpath (JsonValue/JsonObject are first declared public HERE).
 */
import type {
  // T002B Runtime Assembly.
  AdmitComponentWithAssemblyOptions,
  AssemblyBoundComponentAdmission,
  AssemblyImplementationBindingEvidence,
  AssemblyResourceRequirement,
  AssemblyResourceRequirementsMaterial,
  KindImplementationBindingInput,
  KindImplementationPin,
  RuntimeAssemblyErrorCode,
  RuntimeAssemblyRecord,
  SealRuntimeAssemblyInput,
  SealedKindImplementationBinding,
  SealedRuntimeAssembly,
  RuntimeAssemblyResourceRequirementBinding,
  // T003B capability-provider currentness.
  CapabilityProvisionErrorCode,
  CapabilityProviderEvidence,
  CapabilityProviderSelection,
  CurrentCapabilityConsumerEvidence,
  CurrentCapabilityProviderSelection,
  // T003C Tool implementation binding.
  BindToolImplementationInput,
  SealedToolImplementationBinding,
  ToolImplementationBindingErrorCode,
  ToolImplementationBindingEvidence,
  ToolImplementationCandidate,
  ToolImplementationIdentity,
  VerifiedToolImplementationBinding,
  VerifiedToolImplementationBindingEvidence,
  VerifiedToolImplementationCurrentness,
  VerifyToolImplementationBindingInput,
  // T004A exposure/invocation admission.
  AdmittedToolExposure,
  AdmittedToolInvocationRequest,
  AdmitToolExposureInput,
  AdmitToolInvocationRequestOptions,
  InvocationCallerContext,
  InvocationRequestErrorCode,
  ToolExposureAdmissionDecision,
  ToolExposureAdmissionPolicy,
  ToolInvocationRequest,
  // T004B non-effectful invocation.
  InvokeNonEffectfulToolInput,
  NonEffectfulInvocationErrorCode,
  NonEffectfulToolDispatchPort,
  NonEffectfulToolDispatchQuery,
  NonEffectfulToolInvocationResult,
  // T004C effectful invocation.
  EffectfulAdmissionPorts,
  EffectfulInvocationErrorCode,
  EffectfulToolDispatchPort,
  EffectfulToolDispatchQuery,
  EffectfulToolInvocationResult,
  InvokeEffectfulToolInput,
  // T005C resource resolution.
  ResolveToolResourcesOptions,
  ResolvedResourceEntry,
  ResolvedToolResources,
  ResourceCurrentnessEvidence,
  ResourceCurrentnessPin,
  ResourceProvider,
  ResourceProviderResponse,
  ResourceResolutionErrorCode,
  ResourceResolutionRequest,
  // T004E UX adapter.
  InvokeUxToolEffectfullyInput,
  QueryUxToolInput,
  UxToolRequestErrorCode,
  // T004D Agent adapter.
  AdmitAgentMutationIntentInput,
  AgentProjectedOperation,
  AgentProjectedTool,
  AgentToolProjectionErrorCode,
  AgentToolQueryInput,
  AgentToolSurfaceProjection,
  ProjectAgentToolSurfaceInput,
  // Shared foundation types referenced by the signatures above.
  CapabilityContractRef,
  ComponentEnvelope,
  ComponentId,
  ComponentKindValidator,
  ContentDigest,
  DefinitionGraphEnvelope,
  JsonObject,
  JsonValue,
  KindRef,
  ResourceContractRef,
  SemanticContractRef,
  Sha256Port,
  ToolOperationContract,
  ToolOperationEffect,
  ToolResourceRequirementsDeclaration,
} from '@kaicreator/domain-harness/v7/execution';
// @ts-expect-error the T003C evidence verifier is deliberately NOT promoted by the T012-D1 bounded repair (the frozen T010 journeys do not need it)
import { verifyToolImplementationBindingEvidence } from '@kaicreator/domain-harness/v7/execution';
// @ts-expect-error internal canonicalization helpers stay unreachable from ./v7/execution
import { canonicalizeJson } from '@kaicreator/domain-harness/v7/execution';

// Negative-import bindings are intentionally unreachable; discard them so the
// unused-binding lint stays green while the @ts-expect-error rows above keep
// biting if the names ever become exported (same convention as type-fixtures.ts).
void verifyToolImplementationBindingEvidence;
void canonicalizeJson;

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Exact reference shapes stay exact pairs.
export type KindRefIsExactPair = Expect<Equal<keyof KindRef, 'kindId' | 'version'>>;
export type CapabilityContractRefIsExactPair = Expect<
  Equal<keyof CapabilityContractRef, 'capabilityId' | 'version'>
>;

// Portable JSON stays the closed recursive JSON value type.
export type JsonObjectHasStringIndex = Expect<Equal<JsonObject[string], JsonValue>>;
export type JsonValueAcceptsPortableJson = [
  Expect<Equal<Extract<JsonValue, string>, string>>,
  Expect<Equal<Extract<JsonValue, number>, number>>,
  Expect<Equal<Extract<JsonValue, boolean>, boolean>>,
  Expect<Equal<Extract<JsonValue, null>, null>>,
];

// Effect classification is the frozen three-class L2 union.
export type ToolOperationEffectIsFrozenUnion = Expect<
  Equal<ToolOperationEffect, 'none' | 'idempotent' | 'non-idempotent'>
>;

// Typed fail-closed error codes stay string-literal unions (typed refusals).
export type UxErrorCodesAreTyped = Expect<
  Equal<
    UxToolRequestErrorCode,
    | 'INVALID_UX_REQUEST_INPUT'
    | 'UX_OPERATION_NOT_EXPOSED'
    | 'UX_MUTATION_REFUSED'
    | 'UX_EFFECTLESS_OPERATION_REFUSED'
    | 'UX_REQUEST_STALE'
  >
>;
export type NonEffectfulErrorCodesAreTyped = Expect<
  Equal<
    NonEffectfulInvocationErrorCode,
    | 'INVALID_INVOCATION_INPUT'
    | 'INVALID_BINDING_EVIDENCE'
    | 'ASSEMBLY_PROVENANCE_UNVERIFIED'
    | 'MISSING_RESOURCE_PROVIDER'
    | 'INVALID_TOOL_DISPATCH_PORT'
    | 'EFFECTFUL_OPERATION_REJECTED'
    | 'INVALID_TOOL_OUTPUT'
  >
>;

// Sealed evidence types are mint-status branded records (the private
// anti-forgery brand symbol is intentionally not part of the public keyof).
export type SealedAssemblyRecordIsReachable = Expect<
  Equal<SealedRuntimeAssembly['record'], RuntimeAssemblyRecord>
>;
export type BindingEvidenceIsBound = Expect<
  Equal<ToolImplementationBindingEvidence['status'], 'BOUND'>
>;
export type VerifiedBindingIsVerifiedCurrent = Expect<
  Equal<VerifiedToolImplementationBinding['status'], 'VERIFIED_CURRENT'>
>;

// The foundation types are usable as standalone named types.
export type ComponentIdIsOpenString = Expect<Equal<ComponentId, string>>;
export type ContentDigestIsOpenString = Expect<Equal<ContentDigest, string>>;
export type ValidatorShape = Expect<
  Equal<ComponentKindValidator, (envelope: ComponentEnvelope) => void>
>;

// Compile-time touch of every imported type so no promised name is phantom.
export type ExecutionTypeSurfacePresent = [
  AdmitComponentWithAssemblyOptions,
  AssemblyBoundComponentAdmission,
  AssemblyImplementationBindingEvidence,
  AssemblyResourceRequirement,
  AssemblyResourceRequirementsMaterial,
  KindImplementationBindingInput,
  KindImplementationPin,
  RuntimeAssemblyErrorCode,
  RuntimeAssemblyRecord,
  SealRuntimeAssemblyInput,
  SealedKindImplementationBinding,
  SealedRuntimeAssembly,
  RuntimeAssemblyResourceRequirementBinding,
  CapabilityProvisionErrorCode,
  CapabilityProviderEvidence,
  CapabilityProviderSelection,
  CurrentCapabilityConsumerEvidence,
  CurrentCapabilityProviderSelection,
  BindToolImplementationInput,
  SealedToolImplementationBinding,
  ToolImplementationBindingErrorCode,
  ToolImplementationBindingEvidence,
  ToolImplementationCandidate,
  ToolImplementationIdentity,
  VerifiedToolImplementationBinding,
  VerifiedToolImplementationBindingEvidence,
  VerifiedToolImplementationCurrentness,
  VerifyToolImplementationBindingInput,
  AdmittedToolExposure,
  AdmittedToolInvocationRequest,
  AdmitToolExposureInput,
  AdmitToolInvocationRequestOptions,
  InvocationCallerContext,
  InvocationRequestErrorCode,
  ToolExposureAdmissionDecision,
  ToolExposureAdmissionPolicy,
  ToolInvocationRequest,
  InvokeNonEffectfulToolInput,
  NonEffectfulInvocationErrorCode,
  NonEffectfulToolDispatchPort,
  NonEffectfulToolDispatchQuery,
  NonEffectfulToolInvocationResult,
  EffectfulAdmissionPorts,
  EffectfulInvocationErrorCode,
  EffectfulToolDispatchPort,
  EffectfulToolDispatchQuery,
  EffectfulToolInvocationResult,
  InvokeEffectfulToolInput,
  ResolveToolResourcesOptions,
  ResolvedResourceEntry,
  ResolvedToolResources,
  ResourceCurrentnessEvidence,
  ResourceCurrentnessPin,
  ResourceProvider,
  ResourceProviderResponse,
  ResourceResolutionErrorCode,
  ResourceResolutionRequest,
  InvokeUxToolEffectfullyInput,
  QueryUxToolInput,
  UxToolRequestErrorCode,
  AdmitAgentMutationIntentInput,
  AgentProjectedOperation,
  AgentProjectedTool,
  AgentToolProjectionErrorCode,
  AgentToolQueryInput,
  AgentToolSurfaceProjection,
  ProjectAgentToolSurfaceInput,
  ComponentEnvelope,
  ComponentId,
  ComponentKindValidator,
  ContentDigest,
  DefinitionGraphEnvelope,
  JsonObject,
  JsonValue,
  KindRef,
  ResourceContractRef,
  SemanticContractRef,
  Sha256Port,
  ToolOperationContract,
  ToolOperationEffect,
  ToolResourceRequirementsDeclaration,
];
