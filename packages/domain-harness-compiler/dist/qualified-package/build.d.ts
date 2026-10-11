/**
 * v0.8 sealed qualified package producer (T-A, #1000).
 * ====================================================
 *
 * `buildQualifiedPackage` assembles the sealed root that the public
 * `DomainHarness.load(package)` (core `/v8` ABI) accepts. It is the
 * successor of the #994@b9ea4d1 experiment producer
 * `src/producer/build-package.mjs`, selectively adapted:
 *
 *   qualifyPackageClosure (phase 1, static Identity/Compatibility/Binding
 *   + AST closure)  →  externally issued approval (phase 2, verified here,
 *   never minted here)  →  sealed root with frozen provenance and closure
 *   digest.
 *
 * The producer signature takes NO issuer secret: structurally, the BUILD
 * path cannot self-mint approval authority (Issue #1000 contract: "DAC
 * authorizes governance externally").
 */
import { type ApprovalProof, type SealedQualifiedPackageRoot } from '@kaicreator/domain-harness/v8';
import { type TrustedIssuers } from './approval.js';
import type { UnsignedQualification } from './qualify.js';
export declare class BuildError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export interface BuildQualifiedPackageOptions {
    /** Phase-1 qualification (already computed) of the exact closure. */
    readonly unsigned: UnsignedQualification;
    /** Externally issued approval proof for `unsigned.subjectDigest`. */
    readonly approval: ApprovalProof;
    /** Trusted issuer registry supplied by the calling governance context. */
    readonly trustedIssuers: TrustedIssuers;
    /** Sealed module bytes per package (modulePath → source). */
    readonly moduleSources: ReadonlyMap<string, string>;
    readonly builtAt?: string;
    readonly baseCommit?: string;
}
/**
 * Produce the sealed qualified package root. Re-qualifies nothing but
 * re-verifies: the presented module bytes must still hash to the
 * qualification's pinned digests (byte substitution between qualification
 * and sealing is refused) and the approval must verify for this exact
 * subject against the trusted issuers.
 */
export declare function buildQualifiedPackage(options: BuildQualifiedPackageOptions): SealedQualifiedPackageRoot;
export { QualificationError, qualifyPackageClosure } from './qualify.js';
export type { QualificationSubmission, QualifiedPackageSubmission, UnsignedQualification } from './qualify.js';
export { ApprovalError, issueApprovalProof, verifyApprovalProof } from './approval.js';
export type { TrustedIssuers } from './approval.js';
