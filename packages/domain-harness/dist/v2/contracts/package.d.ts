import type { JsonObject, JsonSchema, JsonValue } from '../../contracts/json.js';
import type { CapabilityId } from './capability.js';
import type { CompiledBusinessSourceDescriptor, CompiledDomainDataDescriptor, PackageDataBounds } from './package-data.js';
import type { DomainHarnessJsonSchemaContractVersion } from '../../schema/domainharness-json-schema-v1.js';
export type ToolEffectSemantics = 'none' | 'idempotent' | 'non-idempotent';
export interface CompiledMessageContract {
    type: string;
    version?: string;
    payloadSchema: JsonSchema;
}
export interface CompiledWorkflowDescriptor {
    workflowId: string;
    /** Portable compiled control definition; exact private engine encoding is not public authority. */
    definition: JsonObject;
    messageContracts: Readonly<Record<string, CompiledMessageContract>>;
}
export interface CompiledBindingDescriptor {
    kind: string;
    bindingId: string;
    digest?: string;
    config?: JsonValue;
}
export interface CompiledToolDescriptor {
    toolId: string;
    inputSchema?: JsonSchema;
    outputSchema: JsonSchema;
    effect: ToolEffectSemantics;
    execution: CompiledBindingDescriptor;
    requiredCapabilities: readonly CapabilityId[];
}
export type ProjectionDependencyDescriptor = {
    kind: 'workflow';
    selector: JsonObject;
} | {
    kind: 'business';
    source: string;
    selector: JsonObject;
} | {
    kind: 'domain-data';
    key: string;
};
export interface CompiledProjectionDescriptor {
    projectionId: string;
    expression: string;
    dependencies: readonly ProjectionDependencyDescriptor[];
    outputSchema: JsonSchema;
}
export interface CompiledPackageManifest {
    formatVersion: string;
    runtimeContractMajor: number;
    executionEngineMajor: number;
    domainId: string;
    domainVersion: string;
    packageId: string;
    targetProfileId: string;
    requiredCapabilities: readonly CapabilityId[];
    workflows: Readonly<Record<string, CompiledWorkflowDescriptor>>;
    tools: Readonly<Record<string, CompiledToolDescriptor>>;
    projections: Readonly<Record<string, CompiledProjectionDescriptor>>;
    schemas: Readonly<Record<string, JsonSchema>>;
    bindingDigests: Readonly<Record<string, string>>;
    compatibility?: JsonObject;
    /**
     * Successor ('0.3',2,3)-only material (L2-A §3.2). Absent on every retained
     * ('0.2',2,2) manifest; a retained manifest carrying these fields fails the
     * compiler-side structural assertion and never validates as successor.
     */
    readonly schemaContractVersion?: DomainHarnessJsonSchemaContractVersion;
    readonly packageDataBounds?: PackageDataBounds;
    readonly domainData?: readonly CompiledDomainDataDescriptor[];
    readonly businessSources?: readonly CompiledBusinessSourceDescriptor[];
}
/**
 * Invoke kinds executable by the portable engine at `executionEngineMajor` 2.
 * One authoritative matrix shared by producer and consumer (issue #167):
 * the compiler refuses to emit any other kind, activation rejects it
 * (corrupt-package fail-closed), and the runtime IR decoder accepts exactly
 * this set. Legacy `script` invokes must be translated at build time into
 * synthetic Script Domain Tools (L2 §18.1 / T-021); child `workflow` invokes
 * must be modeled as durable Domain Message effects.
 */
export declare const SUPPORTED_COMPILED_INVOKE_KINDS_V2: readonly ["expr", "tool", "skill"];
export type SupportedCompiledInvokeKind = (typeof SUPPORTED_COMPILED_INVOKE_KINDS_V2)[number];
export interface TargetExecutableBindings {
    /** Target-compiled implementation handles. Values are opaque to domain semantics. */
    readonly [bindingId: string]: unknown;
}
export interface TargetCompiledDomainPackage {
    manifest: CompiledPackageManifest;
    bindings: TargetExecutableBindings;
    /**
     * Bundled immutable Domain Data values of a successor ('0.3',2,3) package
     * (L2-A §3.2 `TargetCompiledDomainPackage03`). Descriptor integrity over
     * these values is revalidated at activation; retained 0.2/2/2 packages never
     * carry this field.
     */
    readonly domainData?: Readonly<Record<string, JsonValue>>;
}
export interface PackageRegistry {
    readonly defaultPackageId: string;
    get(packageId: string): TargetCompiledDomainPackage | undefined;
    has(packageId: string): boolean;
    listPackageIds(): readonly string[];
}
//# sourceMappingURL=package.d.ts.map