/**
 * DomainHarness v0.10 T00 (#1166) — closed-world Node24 BUILD composition
 * public surface: the once-only static BUILD (`buildV10App`), its sealed
 * ordinary-import closure gate, the canonical digest/profile constants, and
 * the trusted-activation counterpart (`activateV10App`).
 */
export { V10BuildError } from './errors.js';
export {
  V10_BUILD_FORMAT,
  V10_BUNDLER_REVISION,
  V10_HOST_ABI,
  V10_IMPORT_POLICY_REVISION,
  V10_KEXT_ABI,
  V10_RUNTIME_ABI,
  V10_SFEATURE_ABI,
  V10_TARGET_PROFILE,
  V10_SELECTED_ROLE_ABI,
  canonicalJson,
  sha256Canonical,
  sha256Hex,
} from './digest.js';
export type { V10ModuleRole } from './digest.js';
export {
  assertSealedImportClosure,
  collectModuleEdges,
  emptyExternalImports,
} from './import-policy.js';
export type { V10ExternalImports, V10ModuleEdge } from './import-policy.js';
export { buildV10App } from './build.js';
export type {
  BuildV10AppOptions,
  V10BuiltApp,
  V10ModuleInput,
  V10RouteRowInput,
  V10SealedModule,
} from './build.js';
export {
  V10ActivationError,
  V10AppFacade,
  V10PortDeniedError,
  activateV10App,
  freshV10Counters,
} from './activation.js';
export type {
  ActivateV10AppOptions,
  V10Activation,
  V10AppView,
  V10Counters,
  V10DocStore,
  V10DocWriteCondition,
  V10PublicIntent,
  V10QueryAuthority,
  V10ScopedQueryTarget,
  V10ScopedSnapshotAnswer,
  V10ScopedSnapshotQuery,
} from './activation.js';
export {
  dispatchThroughExternalEffectGate,
  normalizeExternalEffectEnvelope,
} from './external-effect.js';
export type {
  ExternalEffectAuthorityKeys,
  ExternalEffectEnvelope,
  ExternalEffectDispatchRequest,
  ExternalEffectGateDeps,
} from './external-effect.js';
