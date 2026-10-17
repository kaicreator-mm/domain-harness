/**
 * DomainHarness v0.9 N06 (#1032) — protected H registry logical layer.
 * =====================================================================
 *
 * Implements the frozen L2 §11 D02 boundary for the first Node24 cohort,
 * over the injected typed storage port (`store-port.ts`; the physical
 * true-CAS store itself is #1028):
 *
 *  - `install(sealedQualifiedRoot, approval, audience)` is the TRUSTED
 *    governance-only entry. It executes NO Domain Package source (inert):
 *    it validates the full sealed-root structure/roles, re-hashes every
 *    package's exact bytes, re-runs the pinned-parser zero-import AST gate
 *    on those bytes, recomputes the `dh.v9.qualified-root.subject/1`
 *    subject digest, verifies the external approval attestation, and only
 *    then stores the immutable content-addressed artifact + approval + a
 *    fresh opaque random installed-reference via CAS create-if-absent
 *    writes.
 *
 *  - `activate(installedRef)` accepts ONLY the Host-issued opaque reference
 *    STRING (no raw-root, no object alternative, no caller-supplied
 *    verifier/Host port). Every activation re-resolves the reference,
 *    re-checks the audience/app/subject/issuer/ABI binding, re-verifies the
 *    stored bytes (SHA-256) and re-runs the zero-import AST gate on the
 *    stored bytes, and re-verifies the current approval attestation. Its
 *    FINAL pre-import step is the shared per-subject CAS authority commit:
 *    a conditional epoch transition on ONE store key per subjectDigest that
 *    is ALSO the key revocation commits through, so activation and revoke
 *    share exactly one CAS linearization point. The conditional write is the
 *    actual activation decision: a revocation that committed earlier either
 *    shows in the observed authority state (typed refusal) or consumes the
 *    expected revision (conflict → re-read → typed refusal), so no
 *    activation can commit an import past an already-committed revocation
 *    (frozen L2 §11 D02). Activation then maps each verified package byte
 *    source to a private Node `data:` ESM URL carrying a fresh nonsecret
 *    per-activation cache discriminator scoped by
 *    (hostAudience, subjectDigest, installedReference, activationNonce,
 *    packageId, moduleSha256), so repeated activations never share mutable
 *    module state. One CAS activation decision record (auditing the
 *    committed authority epoch) is written per activation.
 *
 *  - `revoke(subjectDigest, reason)` is the governance revocation entry; it
 *    commits the revocation record onto the SAME shared per-subject
 *    authority key (conditional create over absent, CAS over a live epoch),
 *    so revoke and activation decide their order at one physical CAS point
 *    instead of two independent keys. A revocation that lands before an
 *    activation's authority commit refuses that activation before any
 *    import. Already-started in-flight work (activation committed before
 *    the revocation landed) is NOT retroactively rolled back (honest
 *    in-flight rule, D02/D03); teardown of loaded resources is lifecycle
 *    integration owned by #1036.
 *
 *  - `load(installedRef)` is the public one-argument forward: exactly one
 *    string into the protected path, with every refusal collapsed into the
 *    caller-visible public family error (`V09PublicRefusalError`:
 *    `PACKAGE_NOT_AUTHORIZED` plus the separate ABI/lifecycle families, a
 *    CONSTANT message per family, and NO protected subcode, `cause` or any
 *    other extra enumerable field — byte-identical per family). The
 *    protected typed diagnostic subcode is recorded on the H-private
 *    trusted diagnostics channel and never travels on the public error
 *    (D04). The public record is redacted — it carries no module
 *    namespace; the namespace-bearing activation record stays on the
 *    protected path for the Microkernel bootstrap (#1036 integration). The
 *    public `./v9` facade and its names are #1035.
 *
 * D03 boundary: the trusted-H one-shot physical effect permit port lives in
 * `effect-permit.ts` and commits on the SAME shared per-subject authority
 * record this registry owns (see `readV09SubjectAuthority`); nothing in THIS
 * module mints a principal, a permit or an authorization from caller input.
 */
import { V09_SEALED_ROOT_FORMAT } from './digest.js';
import { type V09ProtectedDiagnostic } from './errors.js';
import { type V09TrustedIssuers } from './approval.js';
import { type V09HostDocumentStore } from './store-port.js';
/** The single self-contained ESM module artifact of one v0.9 package. */
export interface V09SealedPackageData {
    readonly packageId: string;
    readonly kind: string;
    readonly abiVersion: string;
    readonly moduleSource: string;
    readonly moduleSha256: string;
    readonly imports: readonly [];
}
/** Ordered binding records sealed into the subject (roles, intents, capabilities, v0.9 route rows). */
export type V09BindingRecord = Readonly<{
    role: 'kernel' | 'standard-sdk' | 'business';
    packageId: string;
    endpointId: string;
}> | Readonly<{
    role: 'intent';
    intentType: string;
    packageId: string;
    endpointId: string;
}> | Readonly<{
    role: 'capability';
    capabilityId: string;
    packageId: string;
    endpointId: string;
    handlers: readonly {
        operationId: string;
        handler: string;
    }[];
}> | Readonly<{
    role: 'route';
    intentId: string;
    operationId: string;
    capabilityId: string;
    handlerId: string;
}>;
/** The v0.9 sealed qualified root produced by BUILD and installed by governance. */
export interface V09SealedQualifiedRootData {
    readonly formatVersion: typeof V09_SEALED_ROOT_FORMAT;
    readonly subjectDigest: string;
    readonly rootPackageId: string;
    readonly buildId: string;
    readonly bundlerRevision: string;
    readonly importPolicyRevision: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    readonly packages: readonly V09SealedPackageData[];
    readonly bindings: readonly V09BindingRecord[];
}
/** Namespace-bearing activation record — PROTECTED path only (Microkernel bootstrap). */
export interface V09ActivationRecord {
    readonly installedRef: string;
    readonly activationNonce: string;
    readonly subjectDigest: string;
    readonly rootPackageId: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    readonly packages: readonly {
        packageId: string;
        kind: string;
        moduleSha256: string;
    }[];
    readonly namespaces: ReadonlyMap<string, Record<string, unknown>>;
}
/** Redacted record returned by the public one-argument `load` forward. */
export interface V09LoadedPackageRecord {
    readonly installedRef: string;
    readonly activationNonce: string;
    readonly subjectDigest: string;
    readonly rootPackageId: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    readonly packages: readonly {
        packageId: string;
        kind: string;
        moduleSha256: string;
    }[];
}
export interface ProtectedHostV09Options {
    /** Injected typed physical store (#1028 implements it; probed at bootstrap). */
    readonly store: V09HostDocumentStore;
    /** Trusted issuer registry supplied by the governance/Host bootstrap. */
    readonly trustedIssuers: V09TrustedIssuers;
    /** The single host audience this registry serves. */
    readonly audience: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
}
export interface ProtectedHostV09 {
    readonly audience: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    /** Governance-only inert installation; issues a fresh opaque installedRef. */
    install(sealedRoot: unknown, approval: unknown, audience: unknown): Promise<{
        readonly installedRef: string;
        readonly subjectDigest: string;
        readonly rootPackageId: string;
    }>;
    /** Protected activation of one installed reference string. */
    activate(installedRef: unknown): Promise<V09ActivationRecord>;
    /** Public one-argument forward: exactly one installed-reference string. */
    load(installedRef: unknown): Promise<V09LoadedPackageRecord>;
    /** Governance revocation (shared per-subject CAS authority; first revoke wins). */
    revoke(subjectDigest: unknown, reason: unknown): Promise<{
        readonly subjectDigest: string;
        readonly revokedAt: string;
    }>;
    /** Governance/trusted-internal drain of the protected diagnostics channel (never public). */
    drainProtectedDiagnostics(): readonly V09ProtectedDiagnostic[];
    close(): Promise<void>;
}
/**
 * Canonical-snapshot the untrusted presentation first (hostile accessors
 * refused unread), then strict-shape it into a v0.9 sealed-root view. Used
 * at install (governance input) and again at activation (stored artifact).
 */
export declare function parseV09SealedRoot(input: unknown): V09SealedQualifiedRootData;
export declare function approvalKey(subjectDigest: string): string;
export declare function revocationKey(subjectDigest: string): string;
/** One consumed one-shot effect permit entry riding the shared authority record (D03). */
export interface V09ConsumedPermitEntry {
    readonly expiresAtMs: number;
}
export type V09SubjectAuthorityState = {
    readonly status: 'absent';
} | {
    readonly status: 'active';
    readonly epoch: number;
    readonly revision: number;
    readonly permits: Readonly<Record<string, V09ConsumedPermitEntry>>;
} | {
    readonly status: 'revoked';
    readonly revision: number;
};
/**
 * Observe the shared per-subject CAS authority over one injected store.
 * Module-level so the protected H registry AND the trusted-H effect-permit
 * port (`effect-permit.ts`) use ONE authority implementation. Fails closed
 * typed on ANY store failure and on an unrecognized record shape — the
 * authority is never degraded into an unguarded read.
 */
export declare function readV09SubjectAuthority(store: V09HostDocumentStore, subjectDigest: string, operation: string): Promise<V09SubjectAuthorityState>;
/**
 * Create the protected H registry bound to one injected store, one trusted
 * issuer registry and one audience. The store must pass the physical true-CAS
 * probe or the bootstrap refuses typed — a non-CAS store can never back the
 * protected registry (fail closed, D02).
 */
export declare function createProtectedHostV09(options: ProtectedHostV09Options): Promise<ProtectedHostV09>;
//# sourceMappingURL=registry.d.ts.map