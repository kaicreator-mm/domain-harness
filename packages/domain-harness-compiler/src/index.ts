/** Build-time compiler package and stable public API. */
export const DOMAIN_HARNESS_COMPILER_PACKAGE = '@kaicreator/domain-harness-compiler' as const;

export {
  loadRawDomainPackage,
  type LoadRawDomainPackageOptions,
} from './raw/load-raw-package.js';

export {
  compileDomainPackage,
  type CompileDomainPackageInput,
  type CompileDomainPackageResult,
} from './compile/compile-domain-package.js';

export {
  emitTargetCompiledPackageModule,
  type BindingModuleReference,
  type EmitTargetModuleInput,
} from './package/module-emitter.js';

export type {
  CapabilityId,
  JsonObject,
  JsonSchema,
  LoadedRawDomainPackage,
  LogicalToolBindingConfig,
  RawProjectionDefinition,
  RawProjectionDependency,
  RawToolDefinition,
  TargetHostProfile,
  ToolEffectSemantics,
} from './raw/types.js';

export type { CompiledPackageManifest } from './package/manifest.js';
