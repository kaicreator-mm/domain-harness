/**
 * DomainHarness v0.9 N06 (#1032) — external approval proof for the v0.9
 * qualified-root subject (D02/D04).
 * =======================================================================
 *
 * Retains the v0.8 issuer-attestation strength (HMAC-SHA256 over a binding
 * digest of the proof material) as a versioned v0.9 proof type bound to the
 * `dh.v9.qualified-root.subject/1` subject digest. Issuance requires the
 * issuer secret and is NEVER part of the BUILD path or of any public load
 * argument — it exists for the genuine external DAC/governance issuer and
 * for tests acting as that issuer. The protected H verifies the attestation
 * against its governance-installed trusted issuer registry at install and
 * again at every activation (currentness per activation, D02).
 */
export declare const V09_APPROVAL_PROOF_TYPE = "dh.v9.external-approval/1";
export interface V09ApprovalProof {
    readonly proofType: typeof V09_APPROVAL_PROOF_TYPE;
    readonly subjectDigest: string;
    readonly issuerId: string;
    readonly issuedAt: string;
    readonly proofDigest: string;
    readonly issuerAttestation: string;
}
/** Trusted issuer registry: issuerId → issuer secret (governance channel). */
export type V09TrustedIssuers = ReadonlyMap<string, string>;
/** Binding digest committing the issuer to exactly one v0.9 subject. */
export declare function v09ApprovalBindingDigest(proof: Pick<V09ApprovalProof, 'proofType' | 'subjectDigest' | 'issuerId' | 'issuedAt'>): string;
/**
 * ISSUER-side proof minting (external DAC/governance actor). Requires the
 * issuer secret; no BUILD or H verification path calls this.
 */
export declare function issueV09ApprovalProof(input: {
    readonly subjectDigest: string;
    readonly issuerId: string;
    readonly issuerSecret: string;
    readonly issuedAt?: string;
}): V09ApprovalProof;
/**
 * Verify an externally issued v0.9 proof against the trusted issuer registry
 * and one exact subject digest. Refusals are typed
 * (`APPROVAL_PROOF_INVALID` for malformed/tampered material,
 * `APPROVAL_UNTRUSTED` for an issuer outside the registry) and never degrade
 * into a pass.
 */
export declare function verifyV09ApprovalProof(proof: unknown, expectedSubjectDigest: string, trustedIssuers: V09TrustedIssuers): V09ApprovalProof;
/** Narrow a stored/verified value back to the proof shape (post-validation). */
export declare function isV09ApprovalProofShape(value: unknown): value is V09ApprovalProof;
//# sourceMappingURL=approval.d.ts.map