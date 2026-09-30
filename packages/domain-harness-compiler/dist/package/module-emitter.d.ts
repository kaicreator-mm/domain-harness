import { type CompiledPackageManifest } from './manifest.js';
export interface BindingModuleReference {
    moduleSpecifier: string;
    exportName?: string;
    /** Actual content of the target binding artifact placed at moduleSpecifier. Verified against the manifest binding digest. */
    content: string;
}
export interface EmitTargetModuleInput {
    manifest: CompiledPackageManifest;
    bindingModules: Readonly<Record<string, BindingModuleReference>>;
    /**
     * Bundled Domain Data values of a successor ('0.3',2,3) package. Required
     * exactly when the manifest is the successor profile; ignored (and must be
     * absent) for retained 0.2/2/2 emission, whose output stays byte-identical.
     */
    readonly domainData?: Readonly<Record<string, unknown>>;
}
export declare function emitTargetCompiledPackageModule(input: EmitTargetModuleInput): string;
