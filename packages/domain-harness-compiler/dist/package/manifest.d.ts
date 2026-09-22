import type { CapabilityId, TargetHostProfile } from '../raw/types.js';
import type { CompiledBindingDescriptor, CompiledMessageContract, CompiledPackageManifest, CompiledProjectionDescriptor, CompiledToolDescriptor, CompiledWorkflowDescriptor, ProjectionDependencyDescriptor } from '@kaicreator/domain-harness/v2';
export type { CompiledBindingDescriptor, CompiledMessageContract, CompiledPackageManifest, CompiledProjectionDescriptor, CompiledToolDescriptor, CompiledWorkflowDescriptor, ProjectionDependencyDescriptor, };
export type ManifestWithoutPackageId = Omit<CompiledPackageManifest, 'packageId'>;
export declare class InvalidToolConfigError extends Error {
    readonly issues: readonly string[];
    constructor(toolId: string, issues: readonly string[]);
}
/**
 * Structural validation of executable Tool config against the closed logical
 * binding schema. Runtime resources/secrets are unrepresentable by
 * construction: unknown keys, nested structures, arrays, scalars and
 * non-logical field values are all rejected.
 */
export declare function toolConfigIssues(config: unknown, path: string): string[];
export declare class CompiledManifestValidationError extends Error {
    readonly issues: readonly string[];
    constructor(issues: readonly string[]);
}
export declare class MissingBindingContentError extends Error {
    readonly missing: readonly string[];
    constructor(missing: readonly string[]);
}
/** Content identity of a target binding artifact. Path/location must never enter this value. */
export declare function bindingContentDigest(content: string): string;
/** Digest recorded in `manifest.bindingDigests`: binds the binding slot to its artifact content identity. */
export declare function bindingArtifactDigest(bindingId: string, content: string): string;
export declare function buildBindingDigests(target: TargetHostProfile, required: readonly CapabilityId[], bindingContents: Readonly<Record<string, string>>): Record<string, string>;
export declare function buildCompiledPackageManifest(input: ManifestWithoutPackageId): CompiledPackageManifest;
export declare function manifestIdentityMaterial(manifest: CompiledPackageManifest): ManifestWithoutPackageId;
export declare function assertCompiledPackageManifest(manifest: CompiledPackageManifest): void;
