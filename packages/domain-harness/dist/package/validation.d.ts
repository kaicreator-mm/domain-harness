import { type Sha256Port } from '../contracts/identity.js';
import type { CapabilityId } from '../v2/contracts/capability.js';
import type { CompiledPackageManifest, TargetCompiledDomainPackage } from '../v2/contracts/package.js';
export interface CompiledPackageValidationPolicy {
    readonly formatVersion: string;
    readonly runtimeContractMajor: number;
    readonly executionEngineMajor: number;
    readonly hostCapabilities: readonly CapabilityId[];
    readonly sha256: Sha256Port;
    readonly targetProfileId?: string;
}
export declare function canonicalPackageIdentityMaterial(manifest: CompiledPackageManifest): string;
export declare function computeCompiledPackageId(manifest: CompiledPackageManifest, sha256: Sha256Port): Promise<string>;
export declare function validateCompiledPackage(value: unknown, policy: CompiledPackageValidationPolicy): Promise<TargetCompiledDomainPackage>;
//# sourceMappingURL=validation.d.ts.map