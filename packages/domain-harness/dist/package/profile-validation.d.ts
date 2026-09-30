import type { Sha256Port } from '../contracts/identity.js';
import type { CapabilityId } from '../v2/contracts/capability.js';
import { type SupportedCompiledArtifactProfile } from '../v2/contracts/compiled-artifact-profile.js';
import type { PackageDataBounds } from '../v2/contracts/package-data.js';
import type { TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import { type CompiledPackageValidationPolicy as LegacyCompiledPackageValidationPolicy } from './validation.js';
export interface SupportedCompiledPackageValidationPolicy {
    readonly supportedProfiles: readonly SupportedCompiledArtifactProfile[];
    readonly hostCapabilities: readonly CapabilityId[];
    readonly sha256: Sha256Port;
    readonly targetProfileId?: string;
    /** Mandatory host-side maxima whenever successor 0.3/2/3 is enabled. */
    readonly supportedPackageDataBounds?: PackageDataBounds;
}
/** DomainHarness-owned extension point; never part of Host feature authority. */
export type SuccessorCompiledPackageValidator = (value: unknown, policy: SupportedCompiledPackageValidationPolicy) => Promise<TargetCompiledDomainPackage>;
export interface CompiledPackageValidatorExtensions {
    /** Installed only after downstream successor package semantics exist. */
    readonly successor?: SuccessorCompiledPackageValidator;
}
export type PackageActivationValidationPolicy = LegacyCompiledPackageValidationPolicy | SupportedCompiledPackageValidationPolicy;
/**
 * Successor validators call this before package admission. Package-recorded
 * maxima are never allowed to exceed host-supported maxima or be silently
 * truncated/raised.
 */
export declare function assertPackageDataBoundsSupported(packageBounds: PackageDataBounds, policy: SupportedCompiledPackageValidationPolicy): void;
export declare function validateCompiledPackageByProfile(value: unknown, policy: PackageActivationValidationPolicy, extensions?: CompiledPackageValidatorExtensions): Promise<TargetCompiledDomainPackage>;
//# sourceMappingURL=profile-validation.d.ts.map