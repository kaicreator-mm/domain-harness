/**
 * v0.8 trusted Node Host — protected bootstrap (T-E, #1004).
 * ============================================================
 *
 * This is the Host-side wiring the load trust gate (public-v8/trust.ts)
 * anticipated: the governance/Host context holds the issuer secrets and
 * installs the protected load trust channel exactly ONCE per process by
 * calling this module — the ONLY caller of `installTrustedIssuers` in the
 * host graph. A process that never bootstrapped fails closed in `load()`
 * (UNTRUSTED_ISSUER, zero imports) — the #1000 issuer-authorization gap
 * stays structurally closed on the Host side.
 *
 * The same bootstrap assembles the trusted Node Host:
 *   - physical CAS storage (SQLite by default; the store is PROBED at
 *     bootstrap — a store that cannot prove true revision CAS is refused
 *     typed, never degraded, C01-N7);
 *   - the H identity verifier (issuer/audience/tenant/app/subject/roles/
 *     currentness/revocation) over the SAME issuer registry material;
 *   - the generic resource dispatcher and the scoped event hub.
 *
 * Issuer secrets live ONLY in closures (load gate + identity verifier).
 * The TrustedNodeHost object exposes no getter that can read them, and the
 * UX transport surface is a strict allowlist (no docs, no dispatcher, no
 * publish, no installer, no host ports — B01-N4/N6/N8).
 */
import { type CasDocumentStore } from './cas.js';
import { ResourceDispatcher } from './dispatcher.js';
import { ScopedEventHub } from './events.js';
import { type HostCredential, type HostPrincipal } from './identity.js';
export interface TrustedHostStorageSpec {
    /** SQLite database file (the durable physical store; a real file). */
    readonly path: string;
}
export interface TrustedHostStorageInstance {
    /** A caller-opened store (fixtures/tests); it must pass the true-CAS probe. */
    readonly store: CasDocumentStore;
}
export interface TrustedNodeHostInput {
    /** issuerId → secret, held by the governance/Host bootstrap context. */
    readonly issuers: ReadonlyMap<string, string>;
    /** This host's audience identity (credentials are audience-bound). */
    readonly audience: string;
    /**
     * Currentness policy for the LOAD gate (approval proofs) — forwarded to
     * the protected trust channel verbatim.
     */
    readonly maxProofAgeMs?: number;
    /**
     * Currentness policy for HOST credentials (principal grants). When
     * omitted, credentials are bounded by their own expiresAt only.
     */
    readonly maxCredentialAgeMs?: number;
    /** Durable physical storage; omit for a non-durable in-memory host (fixtures). */
    readonly storage?: TrustedHostStorageSpec | TrustedHostStorageInstance;
    /** Injectable clock (tests). */
    readonly now?: () => Date;
    /**
     * FR08 (#1013, I04): a deployment-provisioned trusted ModelPort. When
     * present it is installed through the protected one-shot channel and the
     * qualified Standard SDK's host-bound resolver marks only physically
     * observed port invocations as `measured`. Omitted ⇒ model-free evidence
     * stays honestly `unsupported`/`unmeasured`.
     */
    readonly modelPort?: unknown;
}
export interface TrustedNodeHost {
    readonly audience: string;
    /**
     * Host-context physical document store. NOT part of the UX transport
     * surface — the transport never hands this object to a caller.
     */
    readonly docs: CasDocumentStore;
    /** Host-context generic resource dispatcher (provisioning + accounting). */
    readonly resources: ResourceDispatcher;
    /** Host-context scoped event hub (publish; subscriptions go through the transport). */
    readonly events: ScopedEventHub;
    /** Authenticate a presented credential (H identity verification). */
    authenticate(credential: unknown): Promise<HostPrincipal>;
    /** Durable grant revocation (governance action; typed double-revoke). */
    revokeGrant(grantId: string): Promise<void>;
    isGrantRevoked(grantId: string): Promise<boolean>;
    /** Mint nothing; hosts do not mint credentials (issuers do). */
    close(): Promise<void>;
}
export interface TrustedHostHandle {
    readonly host: TrustedNodeHost;
    readonly store: CasDocumentStore;
}
/**
 * Protected Host bootstrap. Establishes the one-shot load trust channel
 * (trust.ts seam) and assembles the trusted Node Host over probed true-CAS
 * physical storage. A second bootstrap in the same process fails typed with
 * TRUST_CHANNEL_ALREADY_ESTABLISHED (from the load gate) — a partially
 * bootstrapped process can never be re-trusted mid-flight.
 */
export declare function bootstrapTrustedHost(input: TrustedNodeHostInput): Promise<TrustedHostHandle>;
/**
 * Diagnostics-only probe (tests/evidence): whether THIS process has the
 * protected load trust channel established. Never a trust decision input.
 */
export declare function isHostTrustChannelEstablished(): boolean;
/** Re-export for the bootstrap surface typing. */
export type { HostCredential, HostPrincipal };
//# sourceMappingURL=bootstrap.d.ts.map