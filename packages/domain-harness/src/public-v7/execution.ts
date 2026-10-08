// Additive v0.7 execution public facade (T012-D1 bounded repair, gate #930;
// adjudication #537@6052473158; defect #926).
//
// `@kaicreator/domain-harness/v7/execution` is the declared public subpath
// for the accepted T010 Tool-plane seams: Runtime Assembly (T002B),
// capability-provider currentness (T003B), Tool implementation binding
// (T003C), exposure/invocation admission (T004A), non/effectful invocation
// (T004B/T004C), resource resolution (T005C), the UX Tool adapter (T004E)
// and the Agent Tool adapter (T004D). Composition-only: every name is
// re-exported unchanged from an already-reviewed owner leaf module; nothing
// is reimplemented, minted or reinterpreted here, and no owner leaf module
// was edited to fit this facade. Explicit named exports ONLY (no `export *`)
// and no wildcard promotion of internal leaf modules; deep imports of the
// owner paths remain ERR_PACKAGE_PATH_NOT_EXPORTED per the accepted T008C
// boundary.
//
// Type exports are the minimal transitive public type closure of the named
// function signatures (owner-module input/output/option/result types, the
// typed error classes + codes needed for fail-closed handling, and the
// shared foundation types those signatures reference that are not already
// reachable from a declared public subpath). Governance/admission port
// types used by the effectful journey (AssemblyExecutionActivator,
// CentralAdmissionRequest, CentralAdmissionOutcome, the Central Admission
// port interfaces) remain reachable through the existing `./v3` surface and
// are deliberately NOT re-promoted here.
export {
  sealRuntimeAssembly,
  isSealedRuntimeAssembly,
  admitComponentWithAssembly,
  RuntimeAssemblyError,
} from '../contracts/runtime-assembly.js';
export type {
  RuntimeAssemblyErrorCode,
  KindImplementationPin,
  KindImplementationBindingInput,
  AssemblyResourceRequirement,
  AssemblyResourceRequirementsMaterial,
  RuntimeAssemblyResourceRequirementBinding,
  AssemblyImplementationBindingEvidence,
  SealRuntimeAssemblyInput,
  RuntimeAssemblyRecord,
  SealedKindImplementationBinding,
  SealedRuntimeAssembly,
  AssemblyBoundComponentAdmission,
  AdmitComponentWithAssemblyOptions,
} from '../contracts/runtime-assembly.js';

export {
  resolveCurrentCapabilityProvider,
  CapabilityProvisionContractError,
} from '../contracts/capability-provision.js';
export type {
  CapabilityProvisionErrorCode,
  CapabilityProviderEvidence,
  CapabilityProviderSelection,
  CurrentCapabilityConsumerEvidence,
  CurrentCapabilityProviderSelection,
} from '../contracts/capability-provision.js';

export {
  bindToolImplementation,
  verifyToolImplementationBinding,
  ToolImplementationBindingError,
} from '../contracts/tool-implementation-binding.js';
export type {
  ToolImplementationBindingErrorCode,
  ToolImplementationIdentity,
  ToolImplementationCandidate,
  BindToolImplementationInput,
  ToolImplementationBindingEvidence,
  SealedToolImplementationBinding,
  VerifiedToolImplementationCurrentness,
  VerifiedToolImplementationBindingEvidence,
  VerifyToolImplementationBindingInput,
  VerifiedToolImplementationBinding,
} from '../contracts/tool-implementation-binding.js';

export {
  admitToolExposure,
  admitToolInvocationRequest,
  InvocationRequestError,
} from '../contracts/invocation-request.js';
export type {
  InvocationRequestErrorCode,
  InvocationCallerContext,
  ToolExposureAdmissionDecision,
  ToolExposureAdmissionPolicy,
  AdmitToolExposureInput,
  AdmittedToolExposure,
  ToolInvocationRequest,
  AdmitToolInvocationRequestOptions,
  AdmittedToolInvocationRequest,
} from '../contracts/invocation-request.js';

export {
  invokeNonEffectfulTool,
  NonEffectfulInvocationError,
} from '../contracts/non-effectful-invocation.js';
export type {
  NonEffectfulInvocationErrorCode,
  NonEffectfulToolDispatchQuery,
  NonEffectfulToolDispatchPort,
  InvokeNonEffectfulToolInput,
  NonEffectfulToolInvocationResult,
} from '../contracts/non-effectful-invocation.js';

export {
  invokeEffectfulTool,
  EffectfulInvocationError,
} from '../contracts/effectful-invocation.js';
export type {
  EffectfulInvocationErrorCode,
  EffectfulAdmissionPorts,
  EffectfulToolDispatchQuery,
  EffectfulToolDispatchPort,
  InvokeEffectfulToolInput,
  EffectfulToolInvocationResult,
} from '../contracts/effectful-invocation.js';

export {
  resolveToolResources,
  ResourceResolutionError,
} from '../contracts/resource-resolution.js';
export type {
  ResourceResolutionErrorCode,
  ResourceResolutionRequest,
  ResourceCurrentnessPin,
  ResourceCurrentnessEvidence,
  ResourceProviderResponse,
  ResourceProvider,
  ResolveToolResourcesOptions,
  ResolvedResourceEntry,
  ResolvedToolResources,
} from '../contracts/resource-resolution.js';

export {
  queryUxTool,
  invokeUxToolEffectfully,
  UxToolRequestError,
} from '../adapters/ux-tool-request.js';
export type {
  UxToolRequestErrorCode,
  QueryUxToolInput,
  InvokeUxToolEffectfullyInput,
} from '../adapters/ux-tool-request.js';

export {
  projectAgentToolSurface,
  queryAgentTool,
  admitAgentMutationIntent,
  AgentToolProjectionError,
} from '../adapters/agent-tool-projection.js';
export type {
  AgentToolProjectionErrorCode,
  AgentProjectedOperation,
  AgentProjectedTool,
  AgentToolSurfaceProjection,
  ProjectAgentToolSurfaceInput,
  AgentToolQueryInput,
  AdmitAgentMutationIntentInput,
} from '../adapters/agent-tool-projection.js';

// Shared foundation types referenced by the signatures above. The Component /
// Definition-graph / identity foundation is already public via `./v7`; it is
// re-exported here so the execution entry is self-contained for callers
// (same precedent as `./v7`). `JsonValue`/`JsonObject` and the resource /
// Tool-operation contract refs are NOT reachable from any previously
// declared subpath, so the execution entry is their first declared public
// home.
export type {
  ComponentEnvelope,
  ComponentId,
  KindRef,
  CapabilityContractRef,
  SemanticContractRef,
} from '../contracts/component.js';
export type { ComponentKindValidator } from '../contracts/component-admission.js';
export type { DefinitionGraphEnvelope } from '../contracts/definition-graph.js';
export type { ContentDigest, Sha256Port } from '../contracts/identity.js';
export type { JsonObject, JsonValue } from '../contracts/json.js';
export type {
  ResourceContractRef,
  ToolResourceRequirementsDeclaration,
} from '../contracts/resource-requirements.js';
export type {
  ToolOperationContract,
  ToolOperationEffect,
} from '../contracts/tool-component.js';
