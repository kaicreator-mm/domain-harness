/**
 * v0.8 qualified package installer — INTERNAL protected Host channel (T-A, #1000).
 * =============================================================================
 *
 * Not exported from the public package index. Only `load()` reaches this
 * module, and only AFTER the load trust gate (trust.ts) cryptographically
 * verified the approval issuer attestation — the executable path is
 * fail-closed upstream of any import.
 *
 * Installation is TWO-PHASE and whole-closure atomic wherever JavaScript
 * semantics allow (P2-ATOMIC-03 repair):
 *
 *   Phase 1 (inert preflight): EVERY package's sealed bytes are hashed and
 *   compared to its pinned SHA-256, ABI declarations and endpoint shapes
 *   are validated — for the ENTIRE closure — before the FIRST import. A
 *   malformed last package therefore rejects the load while every module is
 *   still inert data; no top-level side effect can run.
 *
 *   Phase 2 (sequential activation): modules are imported one by one and
 *   their runtime self-identity (MODULE_ID / ABI_VERSION / PACKAGE_KIND,
 *   required ABI exports, declared-endpoint correspondence) is verified.
 *   JavaScript offers no way to evaluate a module's namespace without
 *   executing its top level, so a phase-2 identity failure on package N can
 *   only be observed after packages 1..N-1 have already evaluated — this
 *   residual, unavoidable evaluation scope is documented here and pinned by
 *   ordering tests; the installer never claims an all-or-nothing startup it
 *   cannot deliver. Everything verifiable without evaluation IS verified
 *   before the first import (adapted from #994@b9ea4d1 load.mjs installer
 *   part and #978@f87cfdf trusted-anchor install).
 */
import { type QualifiedPackageDescriptor, type SealedQualifiedPackageRoot } from './contracts.js';
export interface InstalledQualifiedPackage {
    readonly descriptor: QualifiedPackageDescriptor;
    readonly namespace: Record<string, unknown>;
}
/**
 * Install every sealed package of an already statically qualified,
 * trust-verified root. Phase 1 preflights the WHOLE closure before the
 * first import; phase 2 activates sequentially with runtime identity and
 * endpoint-correspondence checks per module.
 */
export declare function installQualifiedPackages(root: SealedQualifiedPackageRoot): Promise<readonly InstalledQualifiedPackage[]>;
//# sourceMappingURL=installer.d.ts.map