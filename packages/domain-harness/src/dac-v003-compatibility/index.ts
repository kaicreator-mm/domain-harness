// Issue #325 / DAC v0.0.3 V3-002: compatibility / HostBinding / interaction
// closure (leaf module). Portable: no Node built-ins, no engine internals,
// no DAC product-implementation dependency, no edits to the historical v0.0.2
// adapter or the V3-001 foundation (both stay byte-separate and separately
// testable). Composition happens only in the public barrel (exports only).
//
// The guard layer is enumerated EXPLICITLY instead of `export *`: the mint
// registries' registration functions stay module-internal so no foreign code
// can add records to the private WeakSets that prove a requirement/evidence/
// validation object was genuinely minted by this surface.
export * from './contracts.js';
export {
  adoptDomainUXDefinitionRef,
  adoptDacV003CompatibilityTargetRef,
  dacV003TargetProfileKey,
  adoptDacV003CapabilityRequirement,
  adoptDacV003PortRequirement,
  adoptDacV003RequirementSatisfactionEvidence,
  isDomainUXDefinitionRefValue,
  isDacV003CompatibilityTargetRefValue,
  isDacV003CapabilityRequirementValue,
  isDacV003PortRequirementValue,
  isDacV003RequirementSatisfactionEvidenceValue,
  isDacV003CompatibilityValidationRefValue,
  isDacV003CompatibilityResultRefValue,
  isDacV003CompatibilityValidationValue,
  isDacV003CompatibilityResultValue,
  refuteDacV003LifecycleBindingInput,
  expectDacV003UxRoleAnchor,
  resolveDacV003CompatibilityAuthority,
  assertSameDacV003CompatibilityAuthority,
} from './guards.js';
export {
  validateDacV003Compatibility,
  deriveDacV003CompatibilityResult,
} from './validate.js';
