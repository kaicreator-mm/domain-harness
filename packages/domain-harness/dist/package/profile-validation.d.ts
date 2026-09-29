import type { Sha256Port } from '../contracts/identity.js';
import type { CapabilityId } from '../v2/contracts/capability.js';
import { type SupportedCompiledArtifactProfile } from '../v2/contracts/compiled-artifact-profile.js';
import type { TargetCompiledDomainPackage } from '../v2/contracts/package.js';
import { type CompiledPackageValidationPolicy as LegacyCompiledPackageValidationPolicy } from './validation.js';
export interface SupportedCompiledPackageValidationPolicy {
    readonly supportedProfiles: readonly SupportedCompiledArtifactProfile[];
    readonly hostCapabilities: readonly CapabilityId[];
    readonly sha256: Sha256Port;
    readonly targetProfileId?: string;
}
/** DomainHarness-owned extension point; never part of Host validation policy. */
export type SuccessorCompiledPackageValidator = (value: unknown, policy: SupportedCompiledPackageValidationPolicy) => Promise<TargetCompiledDomainPackage>;
export interface CompiledPackageValidatorExtensions {
    /**
     * Installed only by downstream DomainHarness assembly after successor package
     * semantics exist. I-FMT-03 and current production activation install none.
     */
    readonly successor?: SuccessorCompiledPackageValidator;
}
/**
 * Legacy single-profile policies remain source-compatible only for the exact
 * frozen 0.2/2/2 profile. Activation no longer accepts arbitrary expected
 * triples through that compatibility shape.
 */
export type PackageActivationValidationPolicy = LegacyCompiledPackageValidationPolicy | SupportedCompiledPackageValidationPolicy;
export declare function validateCompiledPackageByProfile(value: unknown, policy: PackageActivationValidationPolicy, extensions?: CompiledPackageValidatorExtensions): Promise<TargetCompiledDomainPackage>;
//# sourceMappingURL=profile-validation.d.ts.map