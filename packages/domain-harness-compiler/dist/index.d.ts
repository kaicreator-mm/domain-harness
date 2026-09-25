/** Build-time compiler package and stable public API. */
export declare const DOMAIN_HARNESS_COMPILER_PACKAGE: "@kaicreator/domain-harness-compiler";
export { loadRawDomainPackage, type LoadRawDomainPackageOptions, } from './raw/load-raw-package.js';
export { compileDomainPackage, type CompileDomainPackageInput, type CompileDomainPackageResult, } from './compile/compile-domain-package.js';
export { emitTargetCompiledPackageModule, type BindingModuleReference, type EmitTargetModuleInput, } from './package/module-emitter.js';
export { translateV01ScriptInvokes, V01ScriptTranslationError, type V01ScriptToolTranslation, type V01ScriptTranslationOptions, type V01ScriptTranslationResult, } from './compat/v01-script/index.js';
export { bundleScriptTool, ScriptCompileError, SCRIPT_EXECUTION_CAPABILITY, type ScriptBundleRequest, type ScriptBundleEngine, type ScriptBundleEngineRequest, type ScriptBundleEngineResult, type ScriptCompileErrorCode, type ScriptTarget, type TargetHostProfileLike, } from './script/script-bundle.js';
export type { CapabilityId, JsonObject, JsonSchema, LoadedRawDomainPackage, LogicalToolBindingConfig, RawProjectionDefinition, RawProjectionDependency, RawToolDefinition, TargetHostProfile, ToolEffectSemantics, } from './raw/types.js';
export type { CompiledPackageManifest } from './package/manifest.js';
