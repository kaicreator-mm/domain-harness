/**
 * #1023 S01 — trusted deployment channel: immutable content-addressed
 * Domain Package install + per-activation currentness. INTERNAL protected.
 * ============================================================================
 *
 * The closed-world architecture delta (#1023@6168603324): package admission
 * moves to BUILD/deployment, and the Microkernel loads a PREVIOUSLY
 * INSTALLED immutable stored artifact through the same public one-argument
 * `DomainHarness.load(package)` — the installed reference is an opaque,
 * nonforgeable per-Host token minted by THIS channel, never a content hash
 * a caller could compute or re-target. Honest scope (R1 boundary note
 * #5519609071): the artifact is a STORED SEALED SOURCE closure — every
 * activation re-qualifies and re-imports the sealed bytes through the
 * unchanged pipeline; nothing here is a pre-evaluated or prelinked compiled
 * module, and runtime verification is retained, not moved out.
 *
 * Who may establish the channel: the governance/Host bootstrap only
 * (bootstrapTrustedHost), one-shot per process exactly like trust.ts — the
 * deployment authority is the trusted physical document store of the Host
 * (SQLite true-CAS in production) PLUS the bootstrap-issued Host audience
 * and deployment governance capability. The channel is NOT re-exported from
 * the public `/v8` surface — and, since R1 (#5519609071 P1-01), not being
 * exported is NOT the authorization either: every MUTATING command
 * (install/revoke/withdraw) additionally requires the unforgeable
 * governance capability the bootstrap minted (the same #1013 R2
 * uncredentialed-deep-import hardening that protects kernel-host.js and
 * model-port.js). The pure read path (activation currentness, reference
 * resolution) carries NO mutable authority and stays reachable by the
 * one-argument load() without a capability.
 *
 * Audience binding (R1 P1-02): every installed reference is bound to the
 * installing Host's trusted audience — carried in the protected channel AND
 * committed into the durable link record — and every resolution/revoke of
 * that reference refuses typed on an audience mismatch BEFORE any artifact
 * fetch or import. A different-audience boot over the SAME physical store
 * can therefore never replay another deployment's reference; the binding is
 * decided by the bootstrap channel, never by caller-supplied data.
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
 *      (artifact digest + approval identity + Host audience) under a
 *      random key.
 *
 * What activation does on EVERY fresh load/registration/restart: resolve the
 * reference (fail-closed when unknown or audience-mismatched), re-check
 * approval/issuer currentness (a revoked/withdrawn previously installed
 * approval refuses BEFORE any package source execution), and re-verify the
 * artifact bytes against their content address (tampered store bytes refuse
 * typed). Approved byte identity is thereby distinguished from CURRENT
 * authorization; neither `maxProofAgeMs` alone nor any caller-supplied
 * claim participates.
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
/**
 * The durable link record of one installed reference. `audience` is the
 * installing trusted Host's audience (R1 P1-02): committed by the channel,
 * never caller-supplied, and re-verified on every resolution/revoke.
 */
export interface DeployedInstallRecord {
    readonly artifactDigest: string;
    readonly rootPackageId: string;
    readonly issuerId: string;
    readonly proofDigest: string;
    readonly subjectDigest: string;
    readonly audience: string;
    readonly installedAt: string;
}
export interface InstallDeploymentAuthorityInput {
    readonly store: DeploymentDocumentStore;
    /** The trusted Host audience this deployment domain installs for. */
    readonly audience: string;
    /**
     * The bootstrap-minted deployment governance capability (the same
     * unguessable session capability the bootstrap installs into the gateway/
     * kernel-Host/ModelPort channels, #1013 R2) — required by install/revoke/
     * withdraw; never a public value.
     */
    readonly governanceCap: string;
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
 * deployment tooling only, with the bootstrap-minted governance capability):
 * verify approval/byte links INERTLY and atomically publish the immutable
 * content-addressed artifact plus one opaque, audience-bound installed
 * reference.
 */
export declare function deployInstallPackage(rootInput: unknown, governanceCap: string): Promise<string>;
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
    /** Bootstrap-minted deployment governance capability (R1 P1-01). */
    readonly governanceCap: string;
    readonly reason?: string;
}
/** Durable revocation of ONE installed approval (governance-capability-gated, write-once, typed double-revoke). */
export declare function revokeDeployedApproval(input: RevokeDeployedApprovalInput): Promise<void>;
export interface WithdrawDeploymentIssuerInput {
    readonly issuerId: string;
    /** Bootstrap-minted deployment governance capability (R1 P1-01). */
    readonly governanceCap: string;
    readonly reason?: string;
}
/** Durable withdrawal of an issuer (governance-capability-gated, write-once, typed double-withdrawal). */
export declare function withdrawDeploymentIssuer(input: WithdrawDeploymentIssuerInput): Promise<void>;
//# sourceMappingURL=deploy.d.ts.map