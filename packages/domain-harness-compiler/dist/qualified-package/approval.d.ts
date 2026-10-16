/**
 * v0.8 BUILD approval — phase 2, EXTERNAL authority (T-A, #1000).
 * ================================================================
 *
 * Two-phase BUILD (frozen L2 fact 3): BUILD qualifies the exact closure
 * first (qualify.ts) and can then only ATTACH an approval proof that was
 * issued EXTERNALLY by the designated DAC/governance issuer. BUILD never
 * mints authority: `buildQualifiedPackage` accepts an already-issued proof
 * and verifies it against the trusted issuer registry supplied by the
 * calling governance context.
 *
 * `issueApprovalProof` is the ISSUER-side tool (it needs the issuer secret);
 * it exists so tests and the future DAC channel can act as the genuine
 * external issuer. It is never called by the BUILD path itself.
 */
import { type ApprovalProof } from '@kaicreator/domain-harness/v8';
export declare class ApprovalError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/** Trusted issuer registry: issuerId → issuer secret (governance channel). */
export type TrustedIssuers = ReadonlyMap<string, string>;
/**
 * ISSUER-side proof minting (external DAC/governance actor). Requires the
 * issuer secret; the BUILD path has no secret and no call into this
 * function.
 */
export declare function issueApprovalProof(input: {
    subjectDigest: string;
    issuerId: string;
    issuerSecret: string;
    issuedAt?: string;
}): ApprovalProof;
/**
 * Verify an externally issued proof against the trusted issuer registry and
 * one exact qualification subject. Used by the BUILD attach boundary and by
 * Host/governance re-verification.
 */
export declare function verifyApprovalProof(proof: unknown, expectedSubjectDigest: string, trustedIssuers: TrustedIssuers): ApprovalProof;
