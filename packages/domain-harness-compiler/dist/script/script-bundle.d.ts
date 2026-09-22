export type ScriptTarget = 'node' | 'expo';
export type ScriptSourceLanguage = 'typescript' | 'javascript';
export type ScriptJsonPrimitive = string | number | boolean | null;
export type ScriptJsonValue = ScriptJsonPrimitive | ScriptJsonValue[] | {
    [key: string]: ScriptJsonValue;
};
export declare const SCRIPT_EXECUTION_CAPABILITY: "script-execution@1";
export declare const SCRIPT_BINDING_KIND: "script";
export declare const SCRIPT_ARTIFACT_FORMAT: "target-compiled-script@1";
export interface TargetHostProfileLike {
    readonly id: string;
    readonly capabilities: readonly string[];
    readonly bindings: Readonly<Record<string, string>>;
}
export interface ScriptBundleRequest {
    readonly bindingId: string;
    readonly sourcePath: string;
    readonly source: string;
    readonly language: ScriptSourceLanguage;
    readonly target: ScriptTarget;
    readonly targetProfile: TargetHostProfileLike;
}
export interface ScriptBundleEngineRequest {
    readonly sourcePath: string;
    readonly source: string;
    readonly language: ScriptSourceLanguage;
    readonly target: ScriptTarget;
    readonly format: 'esm';
    readonly ecmaTarget: 'es2022';
    readonly bundle: true;
    readonly hermesSafe: boolean;
}
export interface ScriptBundleEngineResult {
    /** Final JavaScript bytes. Raw TypeScript/source is never a runtime input. */
    readonly code: string;
    readonly language: 'javascript';
    readonly bundled: true;
    readonly exports: readonly string[];
    /** External module specifiers retained by the bundle, if any. */
    readonly externalImports?: readonly string[];
    /** Runtime globals intentionally referenced by generated code, if any. */
    readonly runtimeGlobals?: readonly string[];
}
export interface ScriptBundleEngine {
    bundle(request: ScriptBundleEngineRequest): Promise<ScriptBundleEngineResult> | ScriptBundleEngineResult;
}
export interface CompiledScriptBindingConfig {
    readonly [key: string]: ScriptJsonValue;
    readonly artifactFormat: typeof SCRIPT_ARTIFACT_FORMAT;
    readonly target: ScriptTarget;
    readonly moduleId: string;
    readonly exportName: 'default';
}
export interface CompiledScriptBindingDescriptor {
    readonly kind: typeof SCRIPT_BINDING_KIND;
    readonly bindingId: string;
    readonly config: CompiledScriptBindingConfig;
}
export interface CompiledScriptArtifact {
    /** Build artifact bytes that the outer compiler writes into the target package. */
    readonly moduleSource: string;
    readonly moduleId: string;
    readonly target: ScriptTarget;
    readonly targetProfileId: string;
    readonly requiredCapability: typeof SCRIPT_EXECUTION_CAPABILITY;
    readonly binding: CompiledScriptBindingDescriptor;
}
export type ScriptCompileErrorCode = 'invalid_request' | 'missing_capability' | 'missing_capability_binding' | 'bundle_failed' | 'invalid_bundle' | 'expo_incompatible_bundle';
export declare class ScriptCompileError extends Error {
    readonly code: ScriptCompileErrorCode;
    readonly cause?: unknown | undefined;
    constructor(code: ScriptCompileErrorCode, message: string, cause?: unknown | undefined);
}
export declare function bundleScriptTool(request: ScriptBundleRequest, engine: ScriptBundleEngine): Promise<CompiledScriptArtifact>;
