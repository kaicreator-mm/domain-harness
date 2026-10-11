/**
 * v0.8 qualified package installer — INTERNAL protected Host channel (T-A, #1000).
 * =============================================================================
 *
 * Not exported from the public package index. Only `load()` reaches this
 * module: the trusted installation boundary verifies EVERY package's module
 * bytes against its sealed SHA-256 BEFORE the module is imported, then
 * instantiates the module physically from its exact sealed bytes via a
 * `data:` module import (the executing code enters the process ONLY through
 * this path) and checks the module's self-declared identity. A forged
 * producer, mutated bytes or a mismatched provider can therefore never
 * become executable (adapted from #994@b9ea4d1 load.mjs installer part and
 * #978@f87cfdf trusted-anchor install).
 */
import { type QualifiedPackageDescriptor, type SealedQualifiedPackageRoot } from './contracts.js';
export interface InstalledQualifiedPackage {
    readonly descriptor: QualifiedPackageDescriptor;
    readonly namespace: Record<string, unknown>;
}
/**
 * Install every sealed package of an already statically qualified root.
 * Order of checks is load-bearing: bytes are verified BEFORE the dynamic
 * import, so mutated code is refused while it is still inert data.
 */
export declare function installQualifiedPackages(root: SealedQualifiedPackageRoot): Promise<readonly InstalledQualifiedPackage[]>;
//# sourceMappingURL=installer.d.ts.map