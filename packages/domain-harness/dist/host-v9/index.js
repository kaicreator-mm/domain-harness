/**
 * DomainHarness v0.9 — protected H v0.9 registry internal module surface
 * (N06 #1032).
 * ========================================================================
 *
 * INTERNAL v0.9 Host layer. This module is deliberately NOT re-exported
 * from the package root and NOT added to any public subpath export this
 * round: the public `./v9` facade and its names are owned by #1035 (N07).
 * Tests and the #1036/#1037 integration consume it via this module.
 */
export { V09_PUBLIC_FAMILY_HOST_ABI, V09_PUBLIC_FAMILY_LIFECYCLE, V09_PUBLIC_FAMILY_NOT_AUTHORIZED, V09_PUBLIC_FAMILY_RUNTIME_ABI, V09HostError, governanceRefusal, publicRefusal, } from './errors.js';
export { V09HostStoreError, probeV09Store, storeFailureToHostError, validateV09StoreCondition, } from './store-port.js';
export { V09_HOST_ABI, V09_IMPORT_POLICY_REVISION, V09_RUNTIME_ABI, V09_SEALED_ROOT_FORMAT, V09_SUBJECT_DOMAIN, canonicalV9Json, computeV09SealedRootSubjectDigest, computeV9QualifiedRootSubjectDigest, } from './digest.js';
export { assertVendoredParserBytes, VENDORED_PARSER_PIN } from './parser-pin.js';
export { assertZeroImportEsmModule } from './ast-gate.js';
export { V09_APPROVAL_PROOF_TYPE, isV09ApprovalProofShape, issueV09ApprovalProof, v09ApprovalBindingDigest, verifyV09ApprovalProof, } from './approval.js';
export { createProtectedHostV09, parseV09SealedRoot } from './registry.js';
//# sourceMappingURL=index.js.map