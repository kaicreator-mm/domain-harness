/**
 * v0.8 trusted Node Host — H identity context (T-E, #1004).
 * ===========================================================
 *
 * The Host authenticates WHO is calling: issuer, audience, tenant, app,
 * subject, instance scope, granted roles and currentness — all bound by an
 * HMAC-SHA256 issuer attestation over a canonical credential digest, exactly
 * mirroring the load trust gate (public-v8/trust.ts) construction.
 *
 * L2 boundary this module enforces: the caller-DECLARED role (a UX intent's
 * `caller` field) is USER DATA, never an authentication primitive. Roles
 * exist only inside the issuer-signed credential; nothing else can create
 * them. Authentication revalidates currentness and revocation on EVERY
 * verification — a grant is a lease, not a identity lifetime.
 *
 * Credential shape adapted from #994@b9ea4d1 experiment UX `caller` surface
 * (src/ux/ux-client.mjs blob 448a8aad261e704254a34d9f67bb9ee0f3612187):
 * the experiment let the caller SELECT a role; T-E moves the role into the
 * signed grant so the transport can never trust a declared one.
 */
import type { CasDocumentStore } from './cas.js';
export declare const HOST_CREDENTIAL_TYPE = "v08-host-principal/1";
/** Revocation records live under this CAS key namespace (durable, shared). */
export declare function revocationKey(grantId: string): string;
/** The issuer-signed grant material (what the attestation binds). */
export interface PrincipalGrant {
    readonly issuerId: string;
    readonly grantId: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly subject: string;
    /** This host's audience — a credential minted for another host is refused. */
    readonly audience: string;
    readonly roles: readonly string[];
    readonly issuedAt: string;
    readonly expiresAt: string;
}
/** A presented credential: grant + binding digest + issuer attestation. */
export interface HostCredential extends PrincipalGrant {
    readonly proofType: string;
    readonly proofDigest: string;
    readonly issuerAttestation: string;
}
/** The authenticated identity the Host derives from a verified credential. */
export interface HostPrincipal {
    readonly issuerId: string;
    readonly grantId: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly subject: string;
    readonly audience: string;
    readonly roles: readonly string[];
}
export declare function credentialBindingDigest(grant: PrincipalGrant): string;
/**
 * Issuer side (governance/test context): mint a credential from a grant and
 * the issuer secret. The secret never leaves the issuer context.
 */
export declare function mintPrincipalCredential(grant: PrincipalGrant, issuerSecret: string): HostCredential;
/**
 * Descriptor-safe structural check of a presented credential (hostile
 * getters / callables / __proto__ keys are refused via the canonical
 * snapshot, exactly like the load gate's root inspection).
 */
export declare function assertCredentialShape(value: unknown): HostCredential;
export interface HostIdentityVerifierInput {
    /** issuerId → secret, supplied by the same governance bootstrap as the load gate. */
    readonly issuers: ReadonlyMap<string, string>;
    readonly audience: string;
    readonly now: () => Date;
    /** Optional currentness policy for credentials (like the load gate's maxProofAgeMs). */
    readonly maxCredentialAgeMs?: number;
    /** Durable revocation lookups go through the physical CAS store. */
    readonly revocations: CasDocumentStore;
    /** Tolerance for clocks running slightly ahead (default 5 minutes). */
    readonly clockSkewMs?: number;
}
/**
 * Host-side authenticator. Every call re-verifies: registry membership,
 * binding digest, HMAC attestation, audience, validity window, currentness
 * policy and the durable revocation record (C01/N3/N5 revalidation).
 */
export declare class HostIdentityVerifier {
    #private;
    constructor(input: HostIdentityVerifierInput);
    authenticate(credential: unknown): Promise<HostPrincipal>;
}
//# sourceMappingURL=identity.d.ts.map