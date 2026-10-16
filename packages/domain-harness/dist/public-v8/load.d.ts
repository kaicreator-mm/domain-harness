/**
 * DomainHarness.load(package) — v0.8 public one-argument entry (T-A, #1000).
 * ===========================================================================
 *
 * Frozen L2 contract (#999@6108813765 fact 1): `load(package)` loads ONE
 * fully selected/approved sealed Package closure. There is no `compiledApp`
 * parameter and no public Host-verifier/port argument — the verifier is the
 * internal protected installer channel (installer.ts, non-exported).
 *
 * T-A boundary (Issue #1000 write boundary): BUILD performs static
 * Identity/Compatibility/Binding qualification; load() performs the trusted
 * installation checks (approval binding, byte verification before import,
 * module self-identity). It deliberately does NOT construct any business
 * Runtime, Kernel mechanism, Host storage or UX transport in this task —
 * those are owned by the later #1001–#1004 tasks over this ABI.
 */
import { type SealedQualifiedPackageRoot } from './contracts.js';
export interface LoadedQualifiedPackages {
    readonly formatVersion: string;
    readonly rootPackageId: string;
    readonly build: SealedQualifiedPackageRoot['build'];
    readonly approval: SealedQualifiedPackageRoot['approval'];
    readonly installedPackages: readonly {
        packageId: string;
        kind: string;
        abiVersion: string;
        moduleSha256: string;
        endpoints: readonly {
            endpointId: string;
            kind: string;
        }[];
    }[];
    readonly bindings: readonly SealedQualifiedPackageRoot['bindings'][number][];
    /**
     * Access to a physically installed module namespace (the sealed executable
     * capability of this package). Later tasks wire mechanisms through this;
     * T-A only proves the qualified, byte-verified installation.
     */
    getModuleNamespace(packageId: string): Record<string, unknown>;
}
/**
 * Public one-argument loader. `packageRoot` must be a sealed qualified
 * package root produced by `@kaicreator/domain-harness-compiler` BUILD plus
 * an externally issued approval proof. The executable boundary is
 * FAIL-CLOSED (P1-AUTH-01 repair): before ANY module import, the approval
 * proof's HMAC-SHA256 issuer attestation must cryptographically verify
 * against the trusted issuer registry installed in this process through the
 * protected internal trust channel (trust.ts — governance/Host bootstrap
 * only, never a public load() argument). In a process where no registry is
 * installed, load() refuses with UNTRUSTED_ISSUER and executes NOTHING: a
 * hand-minted structurally consistent root, even one whose digests all
 * recompute, never becomes executable here. Binding integrity (role/kind/
 * endpoint/provider correspondence) is likewise verified statically before
 * import; whole-closure byte preflight precedes the first import
 * (installer.ts).
 */
export declare function load(packageRoot: unknown): Promise<LoadedQualifiedPackages>;
//# sourceMappingURL=load.d.ts.map