import type { PackageRegistry, TargetCompiledDomainPackage } from '../v2/contracts/package.js';
export declare class StaticPackageRegistry implements PackageRegistry {
    #private;
    readonly defaultPackageId: string;
    constructor(packages: readonly TargetCompiledDomainPackage[], defaultPackageId: string);
    get(packageId: string): TargetCompiledDomainPackage | undefined;
    has(packageId: string): boolean;
    listPackageIds(): readonly string[];
}
export declare function resolveDefaultPackage(registry: PackageRegistry): TargetCompiledDomainPackage;
export declare function resolvePinnedPackage(registry: PackageRegistry, packageId: string): TargetCompiledDomainPackage;
//# sourceMappingURL=registry.d.ts.map