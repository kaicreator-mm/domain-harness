/**
 * Public `@kaicreator/domain-harness/v8` subpath — qualified package/component
 * ABI (T-A, #1000). The internal protected installer channel (installer.ts)
 * is deliberately NOT re-exported: only `load()` reaches it.
 */
export { QualifiedPackageError, V8_QUALIFIED_ABI, V8_QUALIFIED_ROOT_FORMAT, V8_APPROVAL_PROOF_TYPE, V8_QUALIFIED_PRODUCER_PREFIX, approvalBindingDigest, canonicalJson, canonicalSnapshot, computeSubjectDigest, isApprovalProofShape, sha256Hex, } from './contracts.js';
export { load } from './load.js';
//# sourceMappingURL=index.js.map