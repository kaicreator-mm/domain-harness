import type { RuntimeStore } from '../v2/contracts/store.js';
import type { PackageRegistry, TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import type { CompiledPackageValidatorExtensions, PackageActivationValidationPolicy } from './profile-validation.js';
export type PackagePinStore = Pick<RuntimeStore, 'listPinnedPackageIds'>;
export interface PackageActivationPreflightRequest {
    readonly registry: PackageRegistry;
    readonly store: PackagePinStore;
    readonly validationPolicy: PackageActivationValidationPolicy;
    /**
     * Profile-dispatched validator extensions. I-03-ASSEMBLY installs the
     * DomainHarness-owned successor validator so a supported 0.3/2/3 package
     * validates through its exact profile instead of failing NOT_YET_ASSEMBLED.
     */
    readonly extensions?: CompiledPackageValidatorExtensions;
}
export interface PackageActivationPreflightResult {
    readonly defaultPackage: TargetCompiledDomainPackage;
    readonly retainedPackageIds: readonly string[];
    readonly retainedPackages: readonly TargetCompiledDomainPackage[];
}
export declare function listRetainedPackageIds(store: PackagePinStore): Promise<readonly string[]>;
export declare function preflightPackageActivation(request: PackageActivationPreflightRequest): Promise<PackageActivationPreflightResult>;
//# sourceMappingURL=activation.d.ts.map