/**
 * DomainHarness v0.10 T00 (#1166) — closed-world Node24 BUILD composition
 * public surface: the once-only static BUILD (`buildV10App`), its sealed
 * ordinary-import closure gate, the canonical digest/profile constants, and
 * the trusted-activation counterpart (`activateV10App`).
 */
export { V10BuildError, V10Error, V10ExternalEffectError, V10_ACTIVATION_FAILURE_CODES } from './errors.js';
export { V10_BUILD_FORMAT, V10_BUNDLER_REVISION, V10_HOST_ABI, V10_IMPORT_POLICY_REVISION, V10_KEXT_ABI, V10_KERNEL_ADVISORY_HOOKS, V10_RUNTIME_ABI, V10_SFEATURE_ABI, V10_TARGET_PROFILE, V10_SELECTED_ROLE_ABI, canonicalJson, sha256Canonical, sha256Hex, } from './digest.js';
// BUILD internal AST tooling remains in import-policy.ts (not the public API).
export { emptyExternalImports } from './import-policy.js';
export { buildV10App } from './build.js';
export { V10ActivationError, V10AppFacade, V10PortDeniedError, activateV10App, } from './activation.js';
export { V10DeploymentError, activateGovernedV10Build, readV10DeploymentActivationRecord, readV10OccurrenceBuildPin, v10BuildActivationDecisionDigest, v10BuildPackageClosureDigest, v10DeploymentActivationKey, v10OccurrenceBuildPinKey, } from './deployment.js';
