/**
 * Qualified package BUILD surface (T-A, #1000): two-phase qualification +
 * external approval + sealed-root producer, and the AST module-closure
 * analyzer they rely on.
 */
export { analyzeModuleClosure, assertDeclaredExports, ClosureError } from './closure.js';
export { qualifyPackageClosure, qualifiedKey, QualificationError } from './qualify.js';
export { issueApprovalProof, verifyApprovalProof, ApprovalError } from './approval.js';
export { buildQualifiedPackage, BuildError } from './build.js';
