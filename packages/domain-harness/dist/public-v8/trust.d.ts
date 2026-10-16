/**
 * v0.8 protected load trust channel — INTERNAL (T-A repair, P1-AUTH-01).
 * =====================================================================
 *
 * `load(package)` must NEVER import/executable-activate an arbitrary
 * caller-minted closure. The controller audit (#1007@6110588153) proved the
 * previous boundary verified only self-computable digests: a hand-minted
 * "hmac-sha256:"-shaped attestation minted WITHOUT any issuer key loaded
 * and executed. This module is the fail-closed repair: the executable step
 * of load() is gated on a cryptographically verified issuer attestation
 * against a trusted issuer registry that is installed ONCE per process
 * through this protected internal channel (deep module import; NOT part of
 * the public `@kaicreator/domain-harness/v8` surface, exactly like
 * installer.ts).
 *
 * Who may install the registry: the governance/Host bootstrap context that
 * owns the issuer secrets (the successor Host-channel task T-E / #1004
 * wires the physical channel; until then a process that installed nothing
 * fails closed — `load()` refuses with UNTRUSTED_ISSUER and never imports).
 * Registry material mirrors the compiler attach boundary (approval.ts
 * TrustedIssuers): the same issuerId → secret mapping the governance
 * context handed to BUILD.
 */
import { type ApprovalProof } from './contracts.js';
export interface InstallTrustedIssuersInput {
    /** issuerId → issuer secret, supplied by the governance/Host bootstrap. */
    readonly issuers: ReadonlyMap<string, string>;
    /**
     * Optional currentness policy: proofs older than this age are refused
     * (APPROVAL_STALE). When omitted, the governance context accepts proofs
     * of any age; future-dated proofs are ALWAYS refused regardless.
     */
    readonly maxProofAgeMs?: number;
}
/**
 * Validate a prospective trust-channel installation WITHOUT consuming the
 * one-shot channel (#1013 R1 F-01): every refusal `installTrustedIssuers`
 * would raise — occupancy and input shape — fails here first, so the Host
 * bootstrap can preflight ALL one-shot channels before committing ANY.
 * Internal protected; not re-exported from the public `/v8` surface.
 */
export declare function preflightTrustedIssuersInstall(input: InstallTrustedIssuersInput): void;
/**
 * Install the trusted issuer registry for this process. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed, so a
 * partially-bootstrapped process cannot be re-trusted mid-flight).
 */
export declare function installTrustedIssuers(input: InstallTrustedIssuersInput): void;
/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export declare function isTrustChannelEstablished(): boolean;
/**
 * Fail-closed approval verification for the executable step of load():
 * the issuer must be trusted in THIS process, the HMAC-SHA256 attestation
 * must verify against the issuer secret, and the proof must be current.
 * Refusal codes: UNTRUSTED_ISSUER (registry absent or issuer unknown),
 * FORGED_ATTESTATION (HMAC mismatch), APPROVAL_NOT_YET_VALID (future-dated
 * beyond skew), APPROVAL_STALE (older than the installed maxProofAgeMs).
 */
export declare function verifyLoadApproval(proof: ApprovalProof): void;
//# sourceMappingURL=trust.d.ts.map