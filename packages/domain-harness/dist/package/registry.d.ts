import type { PackageRegistry, TargetCompiledDomainPackage } from '../v2/contracts/package.js';
export declare class StaticPackageRegistry implements PackageRegistry {
    #private;
    readonly defaultPackageId: string;
    constructor(packages: readonly TargetCompiledDomainPackage[], defaultPackageId: string);
    get(packageId: string): TargetCompiledDomainPackage | undefined;
    has(packageId: string): boolean;
    listPackageIds(): readonly string[];
}
/**
 * Read-side registry view over the exact admission-validated package set.
 * Runtime production paths resolve packages only through this view, so every
 * post-activation manifest/Domain Data/Business Source read comes from the
 * admission-validated material — for successor 0.3/2/3 packages the
 * validator-owned deep-immutable canonical snapshot — and never from a
 * caller-retained mutable reference (R1 P1). Retained 0.2/2/2 entries keep
 * their historical identity: the legacy validator returns the caller's exact
 * package object, and this view serves that same reference unchanged.
 */
export declare class ValidatedPackageRegistry implements PackageRegistry {
    #private;
    readonly defaultPackageId: string;
    constructor(validated: ReadonlyMap<string, TargetCompiledDomainPackage>, defaultPackageId: string);
    get(packageId: string): TargetCompiledDomainPackage | undefined;
    has(packageId: string): boolean;
    listPackageIds(): readonly string[];
}
export declare function resolveDefaultPackage(registry: PackageRegistry): TargetCompiledDomainPackage;
export declare function resolvePinnedPackage(registry: PackageRegistry, packageId: string): TargetCompiledDomainPackage;
//# sourceMappingURL=registry.d.ts.map