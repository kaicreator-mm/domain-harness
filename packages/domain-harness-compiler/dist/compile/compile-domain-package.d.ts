import type { CapabilityId, JsonValue, LoadedRawDomainPackage, RawProjectionDefinition, RawToolDefinition, TargetHostProfile } from '../raw/types.js';
import { type CompiledPackageManifest } from '../package/manifest.js';
import { type DomainDataCompileEntry } from '../package/domain-data.js';
import { type BusinessSourceCompileEntry } from '../package/business-sources.js';
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
    /**
     * Successor Domain Data entries bundled into the compiled package. Every
     * projection `domain-data` dependency must be declared here and every entry
     * must be referenced (undeclared/orphan keys fail compile, L2-A §3.7).
     */
    domainData?: readonly DomainDataCompileEntry[];
    /**
     * Successor Business Source declarations. Every projection `business`
     * dependency must be declared here and every declaration must be referenced
     * (undeclared/orphan sources fail compile, L2-A §3.7).
     */
    businessSources?: readonly BusinessSourceCompileEntry[];
}
export interface CompileDomainPackageResult {
    manifest: CompiledPackageManifest;
    requiredBindingIds: readonly string[];
    /**
     * Bundled immutable Domain Data values of the emitted successor package
     * (L2-A §3.2 `TargetCompiledDomainPackage03`); descriptor digests over these
     * values are identity material inside `manifest.domainData`.
     */
    readonly domainData: Readonly<Record<string, JsonValue>>;
}
export declare function compileDomainPackage(input: CompileDomainPackageInput): CompileDomainPackageResult;
