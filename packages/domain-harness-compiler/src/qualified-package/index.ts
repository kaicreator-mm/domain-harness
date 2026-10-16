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
