/**
 * Qualified package BUILD surface (T-A, #1000): two-phase qualification +
 * external approval + sealed-root producer, and the AST module-closure
 * analyzer they rely on.
 */

export { analyzeModuleClosure, assertDeclaredExports, ClosureError } from './closure.js';
export type { ModuleClosureReport } from './closure.js';
export { qualifyPackageClosure, qualifiedKey, QualificationError } from './qualify.js';
export type { QualifiedPackageSubmission, QualificationSubmission, UnsignedQualification } from './qualify.js';
export { issueApprovalProof, verifyApprovalProof, ApprovalError } from './approval.js';
export type { TrustedIssuers } from './approval.js';
export { buildQualifiedPackage, BuildError } from './build.js';
export type { BuildQualifiedPackageOptions } from './build.js';

// v0.9 N06 (#1032): producer-neutral zero-import BUILD — sealed v0.9
// qualified-root producer, D04 canonical digest, pinned vendored full-AST
// parser and the empty-allowlist import-closure gate. The root it emits
// carries no approval; governance attaches it at the protected install.
export { buildV09QualifiedRoot, V09BuildError } from './v09build/index.js';
export type {
  BuildV09QualifiedRootOptions,
  V09BindingRecord,
  V09SealedPackage,
  V09SealedQualifiedRoot,
} from './v09build/index.js';
export {
  assertVendoredParserBytes,
  assertZeroImportBuildModule,
  canonicalV9Json,
  computeV09SealedRootSubjectDigest,
  computeV9QualifiedRootSubjectDigest,
  V09_BUNDLER_REVISION,
  V09_HOST_ABI,
  V09_IMPORT_POLICY_REVISION,
  V09_RUNTIME_ABI,
  V09_SEALED_ROOT_FORMAT,
  V09_SUBJECT_DOMAIN,
  V09_BUILD_PARSER_PIN,
} from './v09build/index.js';
export type { V09BuildParserPin } from './v09build/index.js';

// v0.10 T00 (#1166): closed-world Node24 BUILD composition — the once-only
// static BUILD over one target profile + one K/S/B/C graph with sealed
// ordinary node/npm/native imports (accepted Product A01 successor of the
// v0.9 zero-import policy; the v0.9 gate above stays frozen for v0.9), and
// the trusted-activation counterpart that consumes the built App as plain
// data without re-attesting static facts.
export {
  V10ActivationError,
  V10AppFacade,
  V10BuildError,
  V10DeploymentError,
  V10PortDeniedError,
  V10_BUILD_FORMAT,
  V10_BUNDLER_REVISION,
  V10_HOST_ABI,
  V10_IMPORT_POLICY_REVISION,
  V10_KEXT_ABI,
  V10_RUNTIME_ABI,
  V10_SFEATURE_ABI,
  V10_TARGET_PROFILE,
  V10_SELECTED_ROLE_ABI,
  activateGovernedV10Build,
  activateV10App,
  assertSealedImportClosure,
  buildV10App,
  canonicalJson,
  collectModuleEdges,
  emptyExternalImports,
  freshV10Counters,
  readV10DeploymentActivationRecord,
  readV10OccurrenceBuildPin,
  sha256Canonical,
  sha256Hex,
  v10BuildActivationDecisionDigest,
  v10BuildPackageClosureDigest,
  v10DeploymentActivationKey,
  v10OccurrenceBuildPinKey,
} from './v10build/index.js';
export type {
  ActivateGovernedV10BuildOptions,
  ActivateV10AppOptions,
  BuildV10AppOptions,
  V10Activation,
  V10AppView,
  V10BuildActivationDecision,
  V10BuiltApp,
  V10Counters,
  V10DeploymentActivationRecord,
  V10DeploymentAuthorizationAuthority,
  V10DeploymentAuthorizationRequest,
  V10DeploymentAuthorizationVerdict,
  V10DeploymentIdentity,
  V10DocStore,
  V10DocWriteCondition,
  V10ExternalImports,
  V10GovernedBuildActivation,
  V10GovernedBuildIdentity,
  V10ModuleEdge,
  V10ModuleInput,
  V10ModuleRole,
  V10OccurrenceBuildPin,
  V10OccurrenceTarget,
  V10PublicIntent,
  V10QueryAuthority,
  V10RouteRowInput,
  V10ScopedQueryTarget,
  V10ScopedSnapshotAnswer,
  V10ScopedSnapshotManyAnswer,
  V10ScopedSnapshotQuery,
  V10SealedModule,
} from './v10build/index.js';
