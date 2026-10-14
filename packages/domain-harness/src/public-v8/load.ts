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

import { assertQualifiedRoot, QualifiedPackageError, type SealedQualifiedPackageRoot } from './contracts.js';
import { installQualifiedPackages, type InstalledQualifiedPackage } from './installer.js';
import { verifyLoadApproval } from './trust.js';
import { isInstalledHandleShape, resolveInstalledPackageRoot, verifyDeploymentCurrentness } from './deploy.js';

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
    endpoints: readonly { endpointId: string; kind: string }[];
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
export async function load(packageRoot: unknown): Promise<LoadedQualifiedPackages> {
  // #1023 S01: an opaque trusted-deployment installed reference resolves to
  // its content-addressed immutable artifact FIRST (fail-closed typed when
  // forged, foreign to this store, corrupted, or byte-mutated — never a
  // fallback to another artifact); every other presentation is the legacy
  // approved-root path, which keeps ALL its existing guards until a bounded
  // reviewed cutover. Both presentations then flow through the SAME
  // qualification/trust/install pipeline below.
  const subject = isInstalledHandleShape(packageRoot) ? await resolveInstalledPackageRoot(packageRoot) : packageRoot;
  // Qualification runs on the canonical snapshot and installation consumes
  // the SAME snapshot — the original presentation is never read again after
  // this line (hostile getters cannot split qualification from install).
  const root = assertQualifiedRoot(subject);
  // Trust gate BEFORE any executable import: issuer attestation must
  // cryptographically verify against the installed registry (fail-closed
  // when the protected channel has not been established in this process).
  verifyLoadApproval(root.approval);
  // #1023 S01 activation currentness: approved byte identity is not current
  // authorization — EVERY fresh load re-checks the trusted deployment
  // authority's revocation/withdrawal records BEFORE any package source
  // execution (no-op in a process without the deployment channel; the trust
  // gate above still applies there).
  await verifyDeploymentCurrentness(root.approval);
  const installed = await installQualifiedPackages(root);
  const byPackageId = new Map<string, InstalledQualifiedPackage>(installed.map((entry) => [entry.descriptor.packageId, entry]));
  const loaded: LoadedQualifiedPackages = Object.freeze({
    formatVersion: root.formatVersion,
    rootPackageId: root.rootPackageId,
    build: root.build,
    approval: root.approval,
    installedPackages: Object.freeze(
      installed.map((entry) =>
        Object.freeze({
          packageId: entry.descriptor.packageId,
          kind: entry.descriptor.kind,
          abiVersion: entry.descriptor.abiVersion,
          moduleSha256: entry.descriptor.moduleSha256,
          endpoints: Object.freeze(entry.descriptor.endpoints.map((endpoint) => Object.freeze({ ...endpoint }))),
        }),
      ),
    ),
    bindings: Object.freeze(root.bindings.map((binding) => Object.freeze({ ...binding }))),
    getModuleNamespace(packageId: string): Record<string, unknown> {
      const entry = byPackageId.get(packageId);
      if (entry === undefined) {
        throw new QualifiedPackageError('PACKAGE_NOT_INSTALLED', `package ${packageId} is not installed in this sealed closure`);
      }
      return entry.namespace;
    },
  });
  return loaded;
}
