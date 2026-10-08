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
export { sealRuntimeAssembly, isSealedRuntimeAssembly, admitComponentWithAssembly, RuntimeAssemblyError, } from '../contracts/runtime-assembly.js';
export { resolveCurrentCapabilityProvider, CapabilityProvisionContractError, } from '../contracts/capability-provision.js';
export { bindToolImplementation, verifyToolImplementationBinding, ToolImplementationBindingError, } from '../contracts/tool-implementation-binding.js';
export { admitToolExposure, admitToolInvocationRequest, InvocationRequestError, } from '../contracts/invocation-request.js';
export { invokeNonEffectfulTool, NonEffectfulInvocationError, } from '../contracts/non-effectful-invocation.js';
export { invokeEffectfulTool, EffectfulInvocationError, } from '../contracts/effectful-invocation.js';
export { resolveToolResources, ResourceResolutionError, } from '../contracts/resource-resolution.js';
export { queryUxTool, invokeUxToolEffectfully, UxToolRequestError, } from '../adapters/ux-tool-request.js';
export { projectAgentToolSurface, queryAgentTool, admitAgentMutationIntent, AgentToolProjectionError, } from '../adapters/agent-tool-projection.js';
//# sourceMappingURL=execution.js.map