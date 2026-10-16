/**
 * Public `@kaicreator/domain-harness/v8` subpath — qualified package/component
 * ABI (T-A, #1000) + minimal microkernel consumption facade (T-B, #1001).
 * The internal protected channels (installer.ts, trust.ts, kernel-host.ts)
 * are deliberately NOT re-exported: only `load()` reaches the installer and
 * the trust gate, and only the T-B facade loader reaches the kernel Host
 * binding.
 */
export { QualifiedPackageError, V8_QUALIFIED_ABI, V8_QUALIFIED_ROOT_FORMAT, V8_APPROVAL_PROOF_TYPE, V8_QUALIFIED_PRODUCER_PREFIX, approvalBindingDigest, canonicalJson, canonicalSnapshot, computeSubjectDigest, isApprovalProofShape, sha256Hex, } from './contracts.js';
export type { ApprovalProof, QualifiedBinding, QualifiedBuildProvenance, QualifiedCapabilityBinding, QualifiedCapabilityHandlerBinding, QualifiedCleanupFailure, QualifiedEndpoint, QualifiedIntentBinding, QualifiedPackageDescriptor, QualifiedPackageKind, QualifiedRole, QualifiedRoleBinding, SealedQualifiedPackageRoot, V8PackageLifecycleContext, } from './contracts.js';
export { load } from './load.js';
export type { LoadedQualifiedPackages } from './load.js';
export { DomainHarness } from './microkernel.js';
export type { V8DomainFacade } from './microkernel.js';
//# sourceMappingURL=index.d.ts.map