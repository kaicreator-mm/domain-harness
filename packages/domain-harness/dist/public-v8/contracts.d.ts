/**
 * v0.8 qualified package/component ABI — public contract (T-A, #1000).
 * =========================================================================
 *
 * Frozen source basis: #1000 L3 pack; L2 freeze facts (#999@6108813765):
 * public `DomainHarness.load(package)` loads ONE fully selected/approved
 * sealed package closure — one Kernel (K), one Standard SDK (S), one or more
 * Business (B) packages. There is no `compiledApp` and no public
 * Host-verifier/port argument. BUILD qualification and external approval
 * happen in `@kaicreator/domain-harness-compiler`; this module defines only
 * the generic, domain-neutral sealed-root shapes, the ABI knowledge the
 * installer needs, the approval binding checks, and the typed error
 * taxonomy.
 *
 * Selectively adapted from the pinned research sources (exact SHAs in
 * docs/research/V08_PRE_RESEARCH_ASSET_INDEX.json @c38d65a):
 *   - #994@b9ea4d1 src/microkernel/contracts.mjs (ABI registry, sealed shape),
 *   - #956@16037896 candidate-validator.mjs (record-safe canonical snapshot,
 *     qualified-ID injectivity),
 *   - #963@d9fd8b9 attested-binding.mjs (byte-attested physical identity),
 *   - #978@f87cfdf host/trust-roots.mjs (trusted-anchor install boundary).
 *
 * This module contains — and may never contain — any workflow/admission/
 * guard/journal/effect/state-transition mechanism or business special case.
 */
import { QualifiedPackageError, canonicalSnapshot } from '@kaicreator/domain-harness-contracts';
export { QualifiedPackageError, canonicalSnapshot };
export type { QualifiedCleanupFailure } from '@kaicreator/domain-harness-contracts';
/**
 * #1023 S03 — the data-only lifecycle context handed to a package's
 * optional `init(context)` / `dispose(context)` exports. It carries exactly
 * the sealed identity of the package and its closure: frozen, plain-JSON,
 * and NEVER any Kernel/Host private capability (no Host ports, no gateway
 * session material, no Kernel namespace, no callables). The same frozen
 * object is passed to that package's init and its dispose.
 */
export interface V8PackageLifecycleContext {
    readonly packageId: string;
    readonly kind: QualifiedPackageKind;
    readonly abiVersion: string;
    readonly rootPackageId: string;
    readonly closureDigest: string;
}
export declare const V8_QUALIFIED_ROOT_FORMAT = "dhpkg/v8-qualified-root/1";
export declare const V8_APPROVAL_PROOF_TYPE = "v08-external-approval/1";
export declare const V8_QUALIFIED_PRODUCER_PREFIX = "qualified-producer:";
/**
 * Package kinds. The three closed K/S/B roles stay mandatory and exactly
 * shaped; 'capability' (#1023 S02a) is the OPTIONAL extra capability-owned
 * package kind admitted by BUILD alongside them — it occupies no closed
 * role, shadows nothing, and executes only through its exact keyed
 * endpoint/handler binding.
 */
export type QualifiedPackageKind = 'kernel' | 'standard-sdk' | 'business' | 'capability';
export type QualifiedRole = 'kernel' | 'standard-sdk' | 'business';
export interface QualifiedEndpoint {
    readonly endpointId: string;
    readonly kind: string;
}
/**
 * ABI knowledge the trusted installer needs to verify a module generically.
 * The executing mechanism itself stays inside the physically selected Kernel
 * package; the loader never re-implements it (#994 KPK-02 heritage).
 *
 * The 'v08-capability-abi/1' entry (#1023 S02a) is purely additive: the
 * three closed-role entries keep their exact frozen shape. A capability
 * package self-identifies like every other package and exposes ONE
 * 'capability-endpoint' endpoint; its callable surface is the exact
 * build-time handler map carried by its capability binding, verified
 * against the physically installed namespace by the installer — never
 * discovered at runtime.
 */
export declare const V8_QUALIFIED_ABI: Readonly<Record<string, {
    readonly kind: QualifiedPackageKind;
    readonly role: QualifiedRole | 'capability';
    readonly requiredExports: readonly string[];
    readonly requiredEndpointKinds: readonly string[];
}>>;
/** Externally issued approval proof (DAC/governance side owns issuance). */
export interface ApprovalProof {
    readonly proofType: string;
    readonly subjectDigest: string;
    readonly issuerId: string;
    readonly issuedAt: string;
    /** Binding digest over the proof material; recomputed at every boundary. */
    readonly proofDigest: string;
    /**
     * Issuer attestation (HMAC-SHA256 over the binding digest, computed by the
     * external issuer). Verified by the compiler attach boundary with trusted
     * issuer keys; the core load() verifies the binding digest only — full
     * cryptographic issuer authority is the external DAC/Host channel (L2
     * fact 3), never minted here.
     */
    readonly issuerAttestation: string;
}
export interface QualifiedPackageDescriptor {
    readonly packageId: string;
    readonly kind: QualifiedPackageKind;
    readonly abiVersion: string;
    readonly moduleSource: string;
    readonly moduleSha256: string;
    readonly endpoints: readonly QualifiedEndpoint[];
}
export interface QualifiedRoleBinding {
    readonly role: QualifiedRole;
    readonly packageId: string;
    readonly endpointId: string;
}
export interface QualifiedIntentBinding {
    readonly role: 'intent';
    readonly intentType: string;
    readonly packageId: string;
    readonly endpointId: string;
}
/** One build-time exact handler entry of a capability binding (#1023 S02a). */
export interface QualifiedCapabilityHandlerBinding {
    /** Callable operation identity inside this capability (unique per binding). */
    readonly operationId: string;
    /** Module export name the operation is statically bound to. */
    readonly handler: string;
}
/**
 * Optional extra capability-owned package binding (#1023 S02a): BUILD
 * selects the package, assigns the unique capability identity, and pins the
 * EXACT endpoint plus operation→handler map. No runtime discovery, no
 * host-node catch-all: a capability package without exactly one such
 * binding never becomes executable, and a capability can never occupy or
 * shadow a closed K/S/B role.
 */
export interface QualifiedCapabilityBinding {
    readonly role: 'capability';
    readonly capabilityId: string;
    readonly packageId: string;
    readonly endpointId: string;
    readonly handlers: readonly QualifiedCapabilityHandlerBinding[];
}
export type QualifiedBinding = QualifiedRoleBinding | QualifiedIntentBinding | QualifiedCapabilityBinding;
export interface QualifiedBuildProvenance {
    readonly producerId: string;
    readonly builtAt: string;
    readonly baseCommit: string;
    readonly closureDigest: string;
}
export interface SealedQualifiedPackageRoot {
    readonly formatVersion: string;
    readonly rootPackageId: string;
    readonly build: QualifiedBuildProvenance;
    readonly approval: ApprovalProof;
    /**
     * The sealed packages array, in the producer's BUILD submission order.
     * #1023 S03: this order IS the BUILD-fixed dependency order of the
     * optional package lifecycle — `init(context)` runs ascending, cleanup
     * `dispose(context)` runs descending — and it is committed inside the
     * approval subject digest (computeSubjectDigest digests the ordered
     * packages array), so a reordered presentation of the same approval is
     * refused by the existing replay gate.
     */
    readonly packages: readonly QualifiedPackageDescriptor[];
    readonly bindings: readonly QualifiedBinding[];
}
export declare function sha256Hex(value: string): string;
export declare function canonicalJson(value: unknown): string;
/**
 * Binding digest of an approval proof: commits the issuer to exactly one
 * qualification subject. Recomputed (never trusted) at every boundary.
 */
export declare function approvalBindingDigest(proof: ApprovalProof): string;
/**
 * Subject digest of a sealed closure: the exact package byte identities plus
 * the role/intent/capability bindings. BUILD computes it at qualification
 * time; load() recomputes it from the presented root and refuses any
 * divergence, so an approval can never be replayed onto a different closure.
 */
export declare function computeSubjectDigest(input: {
    rootPackageId: string;
    packages: readonly {
        packageId: string;
        moduleSha256: string;
    }[];
    bindings: readonly QualifiedBinding[];
}): string;
export declare function isApprovalProofShape(value: unknown): value is ApprovalProof;
/**
 * Full static qualification of a presented sealed root: shape, producer
 * trust prefix, ABI/kind agreement, closure uniqueness, K/S/B binding shape
 * (exactly one kernel, exactly one standard-sdk, at least one business) and
 * the approval-proof binding to THIS exact closure. Bytes and module
 * self-identity are verified afterwards by the internal installer.
 *
 * Returns the CANONICAL SNAPSHOT of the root (descriptor-safe, plain,
 * freshly materialized). Callers must use the returned snapshot — never the
 * original presentation — so a hostile object whose getters return different
 * values per read cannot pass qualification and then smuggle different
 * bytes into installation.
 */
export declare function assertQualifiedRoot(root: unknown): SealedQualifiedPackageRoot;
//# sourceMappingURL=contracts.d.ts.map