import type { RuntimeStore } from '../v2/contracts/store.js';
import type { PackageRegistry, TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import type { CompiledPackageValidationPolicy } from './validation.js';
export type PackagePinStore = Pick<RuntimeStore, 'listPinnedPackageIds'>;
export interface PackageActivationPreflightRequest {
    readonly registry: PackageRegistry;
    readonly store: PackagePinStore;
    readonly validationPolicy: CompiledPackageValidationPolicy;
}
export interface PackageActivationPreflightResult {
    readonly defaultPackage: TargetCompiledDomainPackage;
    readonly retainedPackageIds: readonly string[];
    readonly retainedPackages: readonly TargetCompiledDomainPackage[];
}
export declare function listRetainedPackageIds(store: PackagePinStore): Promise<readonly string[]>;
export declare function preflightPackageActivation(request: PackageActivationPreflightRequest): Promise<PackageActivationPreflightResult>;
//# sourceMappingURL=activation.d.ts.map