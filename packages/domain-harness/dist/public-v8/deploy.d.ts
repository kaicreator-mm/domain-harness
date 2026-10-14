/**
 * #1023 S01 — trusted deployment channel: immutable content-addressed
 * Domain Package install + per-activation currentness. INTERNAL protected.
 * ============================================================================
 *
 * The closed-world architecture delta (#1023@6168603324): package admission
 * moves to BUILD/deployment, and the Microkernel loads a PREVIOUSLY
 * INSTALLED immutable linked artifact through the same public one-argument
 * `DomainHarness.load(package)` — the installed reference is an opaque,
 * nonforgeable per-Host token minted by THIS channel, never a content hash
 * a caller could compute or re-target.
 *
 * Who may establish the channel: the governance/Host bootstrap only
 * (bootstrapTrustedHost), one-shot per process exactly like trust.ts — the
 * deployment authority is the trusted physical document store of the Host
 * (SQLite true-CAS in production). The channel is NOT re-exported from the
 * public `/v8` surface.
 *
 * What install does (all BEFORE any package source execution — deployment
 * is inert byte verification, never activation):
 *   1. full static qualification of the presented sealed root
 *      (assertQualifiedRoot — the same canonical snapshot the legacy load
 *      path uses);
 *   2. the load trust gate (verifyLoadApproval — issuer attestation, clock
 *      policy) plus deployment currentness (not already revoked/withdrawn);
 *   3. whole-closure inert byte preflight (installer phase 1, no import);
 *   4. atomic publish of ONE self-contained content-addressed immutable
 *      artifact under `v8deploy:artifact:<sha256(canonical-bytes)>` with
 *      create-if-absent CAS — a conflicting pre-occupant refuses typed and
 *      NEVER substitutes other bytes; identical bytes are idempotent;
 *   5. mint one opaque installed reference and record its link record
 *      (artifact digest + approval identity) under a random key.
 *
 * What activation does on EVERY fresh load/registration/restart: resolve the
 * reference (fail-closed when unknown), re-check approval/issuer currentness
 * (a revoked/withdrawn previously installed approval refuses BEFORE any
 * package source execution), and re-verify the artifact bytes against their
 * content address (tampered store bytes refuse typed). Approved byte
 * identity is thereby distinguished from CURRENT authorization; neither
 * `maxProofAgeMs` alone nor any caller-supplied claim participates.
 *
 * The legacy approved-root path keeps ALL its existing guards; the
 * deployment revocation/withdrawal records additionally bind it (a revoked
 * proof refuses through every presentation) until a bounded reviewed
 * cutover.
 */
import { type ApprovalProof, type SealedQualifiedPackageRoot } from './contracts.js';
/** Opaque installed-reference prefix (v1; 256 bits of randomness follow). */
export declare const V8_DEPLOY_HANDLE_PREFIX = "dhpkg-install/v1/";
/**
 * The minimal trusted-store port this channel needs: the SAME physical
 * true-CAS document store the Host bootstrap probed (a structural subset of
 * CasDocumentStore — get plus create-if-absent put; the store's refusal of
 * unconditional writes stays authoritative).
 */
export interface DeploymentDocumentStore {
    get(key: string): Promise<{
        readonly value: unknown;
        readonly revision: number;
    } | null>;
    put(key: string, value: unknown, conditions: {
        readonly mustBeAbsent: true;
    }): Promise<{
        readonly revision: number;
    }>;
}
/** The durable link record of one installed reference. */
export interface DeployedInstallRecord {
    readonly artifactDigest: string;
    readonly rootPackageId: string;
    readonly issuerId: string;
    readonly proofDigest: string;
    readonly subjectDigest: string;
    readonly installedAt: string;
}
export interface InstallDeploymentAuthorityInput {
    readonly store: DeploymentDocumentStore;
}
/**
 * Validate a prospective deployment-channel installation WITHOUT consuming
 * the one-shot channel (#1013 R1 F-01 pattern): every refusal the install
 * would raise fails here first so the Host bootstrap can preflight ALL
 * one-shot channels before committing ANY.
 */
export declare function preflightDeploymentAuthorityInstall(input: InstallDeploymentAuthorityInput): void;
/**
 * Install the trusted deployment authority for this process: one-shot
 * (a second attempt fails typed), Host bootstrap only.
 */
export declare function installDeploymentAuthority(input: InstallDeploymentAuthorityInput): void;
/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export declare function isDeploymentAuthorityEstablished(): boolean;
export declare function deployArtifactKey(artifactDigest: string): string;
export declare function deployInstallKey(handle: string): string;
/** Structural check of an installed-reference presentation (shape only). */
export declare function isInstalledHandleShape(value: unknown): value is string;
/**
 * Activation currentness: approved byte identity is not current
 * authorization. Every fresh load/registration checks the trusted
 * deployment authority's revocation records — the exact approval proof
 * (by proofDigest) and the issuer (withdrawal) — BEFORE any package source
 * execution. A process without the deployment channel keeps the legacy
 * behavior (this check is a no-op there; the trust gate still applies).
 */
export declare function verifyDeploymentCurrentness(proof: ApprovalProof): Promise<void>;
/**
 * Trusted deployment INSTALL of one sealed qualified root (governance/
 * deployment tooling only, through the Host handle): verify approval/byte
 * links INERTLY and atomically publish the immutable content-addressed
 * artifact plus one opaque installed reference.
 */
export declare function deployInstallPackage(rootInput: unknown): Promise<string>;
/**
 * Activation resolution of an installed reference: link record → immutable
 * artifact → content-address re-verification. Fail-closed typed on every
 * inconsistency (unknown reference, corrupted record, interrupted publish,
 * mutated artifact bytes); NEVER substitutes another artifact. The returned
 * root is re-qualified, trust-verified and currentness-checked by load() —
 * resolution is not itself authority.
 */
export declare function resolveInstalledPackageRoot(handle: string): Promise<SealedQualifiedPackageRoot>;
export interface RevokeDeployedApprovalInput {
    readonly handle: string;
    readonly reason?: string;
}
/** Durable revocation of ONE installed approval (write-once, typed double-revoke). */
export declare function revokeDeployedApproval(input: RevokeDeployedApprovalInput): Promise<void>;
export interface WithdrawDeploymentIssuerInput {
    readonly issuerId: string;
    readonly reason?: string;
}
/** Durable withdrawal of an issuer (write-once, typed double-withdrawal). */
export declare function withdrawDeploymentIssuer(input: WithdrawDeploymentIssuerInput): Promise<void>;
//# sourceMappingURL=deploy.d.ts.map