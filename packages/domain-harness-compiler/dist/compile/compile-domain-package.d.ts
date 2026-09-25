import type { CapabilityId, LoadedRawDomainPackage, RawProjectionDefinition, RawToolDefinition, TargetHostProfile } from '../raw/types.js';
import { type CompiledPackageManifest } from '../package/manifest.js';
export interface CompileDomainPackageInput {
    raw: LoadedRawDomainPackage;
    domainVersion: string;
    target: TargetHostProfile;
    /**
     * Immutable target binding artifact content per bindingId. Required for every
     * capability-bound binding the package uses; binding identity is content-addressed
     * and compilation fails closed when content is missing.
     */
    bindingContents: Readonly<Record<string, string>>;
    requiredCapabilities?: readonly CapabilityId[];
    tools?: readonly RawToolDefinition[];
    projections?: readonly RawProjectionDefinition[];
}
export interface CompileDomainPackageResult {
    manifest: CompiledPackageManifest;
    requiredBindingIds: readonly string[];
}
export declare function compileDomainPackage(input: CompileDomainPackageInput): CompileDomainPackageResult;
