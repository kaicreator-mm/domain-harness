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
}
export declare function emitTargetCompiledPackageModule(input: EmitTargetModuleInput): string;
