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
/**
 * Authoritative compiled-workflow decoder used by manifest-shape validation.
 * The default is the historical engine-2 decoder; the successor validator
 * passes the profile-dispatched engine-3 decoder so one retained-field
 * validation authority serves both profiles.
 */
export type WorkflowDefinitionDecoder = (workflowId: string, definition: unknown) => unknown;
export declare function validateManifestShape(value: unknown, decodeWorkflow?: WorkflowDefinitionDecoder): asserts value is CompiledPackageManifest;
export declare function validateBindings(manifest: CompiledPackageManifest, bindings: unknown): asserts bindings is TargetCompiledDomainPackage['bindings'];
export declare function canonicalPackageIdentityMaterial(manifest: CompiledPackageManifest): string;
export declare function computeCompiledPackageId(manifest: CompiledPackageManifest, sha256: Sha256Port): Promise<string>;
export declare function validateCompatibility(manifest: CompiledPackageManifest, policy: CompiledPackageValidationPolicy): void;
export declare function validateCompiledPackage(value: unknown, policy: CompiledPackageValidationPolicy): Promise<TargetCompiledDomainPackage>;
//# sourceMappingURL=validation.d.ts.map