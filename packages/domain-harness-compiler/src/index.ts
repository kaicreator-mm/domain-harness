/** Build-time compiler package and stable public API. */
export const DOMAIN_HARNESS_COMPILER_PACKAGE = '@kaicreator/domain-harness-compiler' as const;

// T008C — compiler/public compatibility lane (PACK-B #589, thin issue #791).
// Versioned compatibility commitment for the Raw/compiler root export
// inventory below: the frozen legacy commitments (build API, semantic-decision
// compile API restored by T000-SD/PR #843, script migration/bundling API) stay
// available on this one barrel and only ever extend additively. This is not a
// competing successor surface: the v0.7 `/v7` public rebind/current exports
// stay owned by `@kaicreator/domain-harness/v7`, the authoritative semantic
// decision contracts stay owned by `@kaicreator/domain-harness/v2`, and the
// internal raw-v07 compat modules stay internal. The legacy compiler path may
// adapt into v0.7 representation but never gains authority over successor
// Component/Assembly semantics. Compatibility is proven from the packed
// tarball (tests/public-consumer.test.ts), not source-only imports. Bump only
// for a breaking change to the committed inventory; additive exports and the
// one frozen value below do not bump it.
export const COMPILER_PUBLIC_API_VERSION = 'compiler-public-api.v1' as const;


export {
  loadRawDomainPackage,
  type LoadRawDomainPackageOptions,
} from './raw/load-raw-package.js';

export {
  compileDomainPackage,
  type CompileDomainPackageInput,
  type CompileDomainPackageResult,
} from './compile/compile-domain-package.js';

// v0.6 T001 (issue #497, frozen L2 A2/A7): first-class semantic decision
// declaration compilation. The compiled descriptor types have exactly one
// authoritative owner: the core v2 contracts (re-exported below).
export {
  SemanticDecisionCompileError,
  compileSemanticDecisions,
} from './compile/semantic-decisions.js';

// I-03-ASSEMBLY public successor compile material: the exact output profile the
// public compiler emits, plus the Domain Data / Business Source entry shapes
// and their fail-closed compile errors (L2-A §3.6/§3.7).
export { PUBLIC_COMPILER_OUTPUT_PROFILE } from './package/profile.js';
export {
  DomainDataCompileError,
  type DomainDataCompileEntry,
} from './package/domain-data.js';
export {
  BusinessSourceCompileError,
  type BusinessSourceCompileEntry,
} from './package/business-sources.js';

export {
  emitTargetCompiledPackageModule,
  type BindingModuleReference,
  type EmitTargetModuleInput,
} from './package/module-emitter.js';

// T-021 legacy Script migration path (L2 §18.1), publicly reachable (#167):
// translate legacy `script` invokes into synthetic Script Domain Tools BEFORE
// compileDomainPackage, then bundle the tool module for the target host.
// The public compile path fails closed on untranslated script invokes.
export {
  translateV01ScriptInvokes,
  V01ScriptTranslationError,
  type V01ScriptToolTranslation,
  type V01ScriptTranslationOptions,
  type V01ScriptTranslationResult,
} from './compat/v01-script/index.js';

export {
  bundleScriptTool,
  ScriptCompileError,
  SCRIPT_EXECUTION_CAPABILITY,
  type ScriptBundleRequest,
  type ScriptBundleEngine,
  type ScriptBundleEngineRequest,
  type ScriptBundleEngineResult,
  type ScriptCompileErrorCode,
  type ScriptTarget,
  type TargetHostProfileLike,
} from './script/script-bundle.js';

export type {
  CapabilityId,
  JsonObject,
  JsonSchema,
  LoadedRawDomainPackage,
  LogicalToolBindingConfig,
  RawProjectionDefinition,
  RawProjectionDependency,
  RawSemanticDecisionDeclaration,
  RawToolDefinition,
  TargetHostProfile,
  ToolEffectSemantics,
} from './raw/types.js';

export type { CompiledPackageManifest } from './package/manifest.js';
export type {
  CompiledSemanticDecisionDescriptor,
  SemanticDecisionCacheBypassReason,
  SemanticDecisionCachePolicy,
  SemanticDecisionContractVersion,
  SemanticDecisionPromotedReference,
  SemanticDecisionUnavailableDisposition,
} from '@kaicreator/domain-harness/v2';

// v0.9 N06 (#1032): producer-neutral zero-import BUILD over the published
// v0.8 pipeline output — sealed v0.9 qualified-root producer, D04 canonical
// subject digest, pinned vendored full-AST parser pin, and the
// empty-allowlist import-closure gate (BUILD side of the protected H repeat).
// The emitted root carries no approval; governance attaches it at the
// protected host-v9 install. Public `./v9` SDK surface stays with #1035.
export {
  assertVendoredParserBytes,
  assertZeroImportBuildModule,
  buildV09QualifiedRoot,
  canonicalV9Json,
  computeV09SealedRootSubjectDigest,
  computeV9QualifiedRootSubjectDigest,
  V09BuildError,
  V09_BUNDLER_REVISION,
  V09_HOST_ABI,
  V09_IMPORT_POLICY_REVISION,
  V09_RUNTIME_ABI,
  V09_SEALED_ROOT_FORMAT,
  V09_SUBJECT_DOMAIN,
  V09_BUILD_PARSER_PIN,
} from './qualified-package/index.js';
export type {
  BuildV09QualifiedRootOptions,
  V09BindingRecord,
  V09BuildParserPin,
  V09SealedPackage,
  V09SealedQualifiedRoot,
} from './qualified-package/index.js';

// v0.8 qualified package BUILD (T-A, #1000): two-phase qualification +
// external approval + sealed-root producer over the public core /v8 ABI.
export {
  analyzeModuleClosure,
  assertDeclaredExports,
  buildQualifiedPackage,
  BuildError,
  ClosureError,
  issueApprovalProof,
  qualifyPackageClosure,
  qualifiedKey,
  QualificationError,
  verifyApprovalProof,
  ApprovalError,
} from './qualified-package/index.js';
export type {
  BuildQualifiedPackageOptions,
  ModuleClosureReport,
  QualifiedPackageSubmission,
  QualificationSubmission,
  TrustedIssuers,
  UnsignedQualification,
} from './qualified-package/index.js';

// v0.8 T-G HF25 (#1006): the existing pure build-time typed App-contract
// generator, delivered from its frozen BUILD owner (this compiler package)
// instead of a private kernel source import. The generator is build tooling
// only — it is deliberately NOT re-exported from the Microkernel
// (@kaicreator/domain-harness) runtime ABI, and no runtime authority is
// inferred from it. Additive to the COMPILER_PUBLIC_API_VERSION inventory.
export {
  APP_CONTRACT_SOURCE_FORMAT,
  AppContractGenerationError,
  generateTypedAppContracts,
} from './app-contracts/app-contracts.js';
export type {
  AppCommandContractSource,
  AppContractGenerationErrorCode,
  AppDomainEventContractSource,
  AppViewContractSource,
  AppWatchContractSource,
  CompiledAppContractSource,
  GeneratedAppContractOptions,
} from './app-contracts/app-contracts.js';

