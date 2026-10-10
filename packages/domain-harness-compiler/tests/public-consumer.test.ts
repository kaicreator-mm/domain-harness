/**
 * T008C — Compiler/public compatibility lane (PACK-B #589, thin issue #791).
 *
 * Public consumer availability proof for the versioned Raw/compiler root
 * commitments (`@kaicreator/domain-harness-compiler`, entry `.`), proven from
 * the packed tarballs — not source-only imports:
 *
 * - a clean consumer installs the packed core + compiler tarballs and
 *   typechecks (skipLibCheck: false) the FULL committed surface: the legacy
 *   runtime bindings, the complete type inventory, and the additive
 *   `COMPILER_PUBLIC_API_VERSION` compatibility-level marker;
 * - the semantic-decision compile types re-exported by the compiler are proven
 *   nominally identical to their single authoritative owner, the core v2
 *   contracts (`@kaicreator/domain-harness/v2`) — the compiler consumes the
 *   #570 rebind/current exports, it never re-declares or competes with them;
 * - the PR #843 semantic-decision compile API stays available (preserved);
 * - legacy core root import fixtures (`.`) and successor `/v7` import fixtures
 *   both resolve in the same clean consumer, proving `/v7` stays additive and
 *   the legacy entries stay untouched;
 * - internal T008A/T008B compat bindings stay unreachable and compiler deep
 *   imports stay closed by the package `exports` map;
 * - the packed dist runtime inventory is exercised by direct evaluation.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stagePackedWorkspaces } from './packed-fixture-stage.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') {
    return run('npm', args, cwd);
  }
  // Windows resolves npm to npm.cmd and Node refuses to spawn batch files
  // without a shell, so build one quoted command line for the shell; passing
  // the quoted string directly (instead of spawn args) keeps paths with
  // spaces intact without the deprecated args+shell combination.
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
}

test('packed compiler exposes the stable root build API to a clean consumer', async () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-compiler-consumer-'));
  const consumerDirectory = join(root, 'consumer');

  try {
    mkdirSync(consumerDirectory, { recursive: true });

    // The compiler artifact depends on the authoritative core contracts (#164),
    // so the clean consumer installs both packed tarballs. Type-only imports are
    // erased in dist, but package.json dependencies must resolve for real.
    // #953 (Controller 090): the tarballs come from the shared immutable stage
    // (tests/packed-fixture-stage.ts) instead of an in-test rebuild + live-dist
    // pack, which raced the parallel e8a/e8b fixtures on the shared workspace
    // dist (Woodpecker 1083/1 npm pack unexpected EOF).
    const staged = await stagePackedWorkspaces();
    const tarballs = [staged.coreTarball.path, staged.compilerTarball.path];

    writeFileSync(join(consumerDirectory, 'package.json'), JSON.stringify({
      name: 'domain-harness-compiler-clean-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    runNpm(
      // @types/node mirrors the T-016 consumer: the compiler is a Node build-host
      // tool and the authoritative core contracts it re-exports reference
      // AbortSignal, which the consumer typechecks with skipLibCheck: false.
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '@types/node@^22.0.0', ...tarballs],
      consumerDirectory,
    );

    writeFileSync(join(consumerDirectory, 'index.ts'), `// T008C clean-consumer fixture: the full committed compiler root surface, proven
// against the packed dist by tsc (skipLibCheck: false) in this clean consumer.
import {
  bundleScriptTool,
  BusinessSourceCompileError,
  COMPILER_PUBLIC_API_VERSION,
  compileDomainPackage,
  compileSemanticDecisions,
  DOMAIN_HARNESS_COMPILER_PACKAGE,
  DomainDataCompileError,
  emitTargetCompiledPackageModule,
  loadRawDomainPackage,
  PUBLIC_COMPILER_OUTPUT_PROFILE,
  SCRIPT_EXECUTION_CAPABILITY,
  ScriptCompileError,
  SemanticDecisionCompileError,
  translateV01ScriptInvokes,
  V01ScriptTranslationError,
} from '@kaicreator/domain-harness-compiler';
import type {
  BindingModuleReference,
  CapabilityId,
  CompileDomainPackageInput,
  CompileDomainPackageResult,
  CompiledPackageManifest,
  CompiledSemanticDecisionDescriptor,
  EmitTargetModuleInput,
  JsonObject,
  JsonSchema,
  LoadedRawDomainPackage,
  LoadRawDomainPackageOptions,
  LogicalToolBindingConfig,
  RawProjectionDefinition,
  RawProjectionDependency,
  RawSemanticDecisionDeclaration,
  RawToolDefinition,
  ScriptBundleEngine,
  ScriptBundleEngineRequest,
  ScriptBundleEngineResult,
  ScriptBundleRequest,
  ScriptCompileErrorCode,
  ScriptTarget,
  SemanticDecisionCacheBypassReason,
  SemanticDecisionCachePolicy,
  SemanticDecisionContractVersion,
  SemanticDecisionPromotedReference,
  SemanticDecisionUnavailableDisposition,
  TargetHostProfile,
  TargetHostProfileLike,
  ToolEffectSemantics,
  V01ScriptTranslationOptions,
  V01ScriptTranslationResult,
  V01ScriptToolTranslation,
} from '@kaicreator/domain-harness-compiler';

// The semantic-decision compile types have exactly one authoritative owner:
// the core v2 contracts (#843). The compiler consumes them (nominal identity),
// it never re-declares a competing copy.
import type {
  CompiledSemanticDecisionDescriptor as CompiledSemanticDecisionDescriptorViaV2,
  SemanticDecisionCacheBypassReason as SemanticDecisionCacheBypassReasonViaV2,
  SemanticDecisionCachePolicy as SemanticDecisionCachePolicyViaV2,
  SemanticDecisionContractVersion as SemanticDecisionContractVersionViaV2,
  SemanticDecisionPromotedReference as SemanticDecisionPromotedReferenceViaV2,
  SemanticDecisionUnavailableDisposition as SemanticDecisionUnavailableDispositionViaV2,
} from '@kaicreator/domain-harness/v2';

// Legacy core root import fixture (entry "." stays untouched).
import {
  createDomainRuntime,
  DOMAIN_HARNESS_VERSION,
  StaticPackageRegistry,
} from '@kaicreator/domain-harness';

// Successor /v7 import fixture (additive surface stays reachable and separate).
import {
  admitComponent,
  COMPONENT_FAMILIES,
  computeDefinitionGraphDigest,
  ComponentAdmissionError,
  validateToolComponent,
} from '@kaicreator/domain-harness/v7';
import type { ComponentEnvelope, Sha256Port } from '@kaicreator/domain-harness/v7';

// @ts-expect-error internal T008A raw-v07 compat bindings are not public compiler exports
import { RAW_V07_TOOL_KIND } from '@kaicreator/domain-harness-compiler';
// @ts-expect-error compiler deep imports stay closed by the package exports map
import type { RawToolDefinition as RawToolDefinitionViaDeepPath } from '@kaicreator/domain-harness-compiler/dist/raw/types.js';

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Nominal identity: every compiler-re-exported semantic-decision type IS the
// v2 authority declaration (consumed, not duplicated).
type CompilerDescriptorIsTheV2Authority = Expect<Equal<
  CompiledSemanticDecisionDescriptor,
  CompiledSemanticDecisionDescriptorViaV2
>>;
type CompilerCacheBypassReasonIsTheV2Authority = Expect<Equal<
  SemanticDecisionCacheBypassReason,
  SemanticDecisionCacheBypassReasonViaV2
>>;
type CompilerCachePolicyIsTheV2Authority = Expect<Equal<
  SemanticDecisionCachePolicy,
  SemanticDecisionCachePolicyViaV2
>>;
type CompilerContractVersionIsTheV2Authority = Expect<Equal<
  SemanticDecisionContractVersion,
  SemanticDecisionContractVersionViaV2
>>;
type CompilerPromotedReferenceIsTheV2Authority = Expect<Equal<
  SemanticDecisionPromotedReference,
  SemanticDecisionPromotedReferenceViaV2
>>;
type CompilerUnavailableDispositionIsTheV2Authority = Expect<Equal<
  SemanticDecisionUnavailableDisposition,
  SemanticDecisionUnavailableDispositionViaV2
>>;

// Legacy core root commitments stay byte-stable.
type CoreRootVersionIsUnchanged = Expect<Equal<typeof DOMAIN_HARNESS_VERSION, '0.2.0'>>;

// Runtime function commitments keep their exact historical signatures.
const loader: typeof loadRawDomainPackage = loadRawDomainPackage;
const compiler: typeof compileDomainPackage = compileDomainPackage;
const semanticCompiler: typeof compileSemanticDecisions = compileSemanticDecisions;
const emitter: typeof emitTargetCompiledPackageModule = emitTargetCompiledPackageModule;
const v01Translator: typeof translateV01ScriptInvokes = translateV01ScriptInvokes;
const scriptBundler: typeof bundleScriptTool = bundleScriptTool;

// Error-class commitments stay constructible Error subclasses.
const semanticError: typeof SemanticDecisionCompileError = SemanticDecisionCompileError;
const domainDataError: typeof DomainDataCompileError = DomainDataCompileError;
const businessSourceError: typeof BusinessSourceCompileError = BusinessSourceCompileError;
const v01Error: typeof V01ScriptTranslationError = V01ScriptTranslationError;
const scriptError: typeof ScriptCompileError = ScriptCompileError;

// Constant commitments keep their exact values.
const packageName: '@kaicreator/domain-harness-compiler' = DOMAIN_HARNESS_COMPILER_PACKAGE;
const compatibilityLevel: 'compiler-public-api.v1' = COMPILER_PUBLIC_API_VERSION;
const scriptCapability: 'script-execution@1' = SCRIPT_EXECUTION_CAPABILITY;
const outputProfile: typeof PUBLIC_COMPILER_OUTPUT_PROFILE = PUBLIC_COMPILER_OUTPUT_PROFILE;

// Type commitments stay nameable and usable.
let loadOptions: LoadRawDomainPackageOptions | undefined;
let rawPackage: LoadedRawDomainPackage | undefined;
let compileInput: CompileDomainPackageInput | undefined;
let compileResult: CompileDomainPackageResult | undefined;
let manifest: CompiledPackageManifest | undefined;
let emitInput: EmitTargetModuleInput | undefined;
let bindingModule: BindingModuleReference | undefined;
let capability: CapabilityId | undefined;
let target: TargetHostProfile | undefined;
let tool: RawToolDefinition | undefined;
let projection: RawProjectionDefinition | undefined;
let dependency: RawProjectionDependency | undefined;
let bindingConfig: LogicalToolBindingConfig | undefined;
let effect: ToolEffectSemantics | undefined;
let objectValue: JsonObject | undefined;
let schema: JsonSchema | undefined;
let rawDecision: RawSemanticDecisionDeclaration | undefined;
let semanticDescriptor: CompiledSemanticDecisionDescriptor | undefined;
let semanticContractVersion: SemanticDecisionContractVersion | undefined;
let semanticCachePolicy: SemanticDecisionCachePolicy | undefined;
let semanticCacheBypass: SemanticDecisionCacheBypassReason | undefined;
let semanticPromotedRef: SemanticDecisionPromotedReference | undefined;
let semanticUnavailable: SemanticDecisionUnavailableDisposition | undefined;
let scriptBundleRequest: ScriptBundleRequest | undefined;
let scriptBundleEngine: ScriptBundleEngine | undefined;
let scriptBundleEngineRequest: ScriptBundleEngineRequest | undefined;
let scriptBundleEngineResult: ScriptBundleEngineResult | undefined;
let scriptErrorCode: ScriptCompileErrorCode | undefined;
let scriptTarget: ScriptTarget | undefined;
let hostProfileLike: TargetHostProfileLike | undefined;
let v01ToolTranslation: V01ScriptToolTranslation | undefined;
let v01TranslationOptions: V01ScriptTranslationOptions | undefined;
let v01TranslationResult: V01ScriptTranslationResult | undefined;

// Legacy core root and successor /v7 commitments (same clean consumer).
const legacyRuntime: typeof createDomainRuntime = createDomainRuntime;
const legacyRegistry: typeof StaticPackageRegistry = StaticPackageRegistry;
const v7Admission: typeof admitComponent = admitComponent;
const v7GraphDigest: typeof computeDefinitionGraphDigest = computeDefinitionGraphDigest;
const v7ToolValidation: typeof validateToolComponent = validateToolComponent;
const v7Error: typeof ComponentAdmissionError = ComponentAdmissionError;
const v7Families: readonly ['semantic', 'tool'] = COMPONENT_FAMILIES;
let v7Envelope: ComponentEnvelope | undefined;
let v7Sha256: Sha256Port | undefined;

void RAW_V07_TOOL_KIND;
void loader;
void compiler;
void semanticCompiler;
void emitter;
void v01Translator;
void scriptBundler;
void semanticError;
void domainDataError;
void businessSourceError;
void v01Error;
void scriptError;
void packageName;
void compatibilityLevel;
void scriptCapability;
void outputProfile;
void loadOptions;
void rawPackage;
void compileInput;
void compileResult;
void manifest;
void emitInput;
void bindingModule;
void capability;
void target;
void tool;
void projection;
void dependency;
void bindingConfig;
void effect;
void objectValue;
void schema;
void rawDecision;
void semanticDescriptor;
void semanticContractVersion;
void semanticCachePolicy;
void semanticCacheBypass;
void semanticPromotedRef;
void semanticUnavailable;
void scriptBundleRequest;
void scriptBundleEngine;
void scriptBundleEngineRequest;
void scriptBundleEngineResult;
void scriptErrorCode;
void scriptTarget;
void hostProfileLike;
void v01ToolTranslation;
void v01TranslationOptions;
void v01TranslationResult;
void legacyRuntime;
void legacyRegistry;
void v7Admission;
void v7GraphDigest;
void v7ToolValidation;
void v7Error;
void v7Families;
void v7Envelope;
void v7Sha256;
`);

    writeFileSync(join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        lib: ['ES2022'],
      },
      include: ['index.ts'],
    }, null, 2));

    const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    run(process.execPath, [tsc, '--project', 'tsconfig.json'], consumerDirectory);

    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
const m = await import('@kaicreator/domain-harness-compiler');
const functions = ['loadRawDomainPackage','compileDomainPackage','compileSemanticDecisions','emitTargetCompiledPackageModule','translateV01ScriptInvokes','bundleScriptTool'];
const errorClasses = ['BusinessSourceCompileError','DomainDataCompileError','ScriptCompileError','SemanticDecisionCompileError','V01ScriptTranslationError'];
const stringConsts = ['DOMAIN_HARNESS_COMPILER_PACKAGE','SCRIPT_EXECUTION_CAPABILITY','COMPILER_PUBLIC_API_VERSION'];
for (const key of functions) { if (typeof m[key] !== 'function') throw new Error('missing compiler root function export: ' + key); }
for (const key of errorClasses) { if (typeof m[key] !== 'function') throw new Error('missing compiler root error export: ' + key); if (!(m[key].prototype instanceof Error)) throw new Error('compiler root error export does not extend Error: ' + key); }
for (const key of stringConsts) { if (typeof m[key] !== 'string' || m[key].length === 0) throw new Error('missing compiler root const export: ' + key); }
if (typeof m.PUBLIC_COMPILER_OUTPUT_PROFILE !== 'object' || m.PUBLIC_COMPILER_OUTPUT_PROFILE === null || Array.isArray(m.PUBLIC_COMPILER_OUTPUT_PROFILE)) throw new Error('PUBLIC_COMPILER_OUTPUT_PROFILE must stay an object constant');
if (m.DOMAIN_HARNESS_COMPILER_PACKAGE !== '@kaicreator/domain-harness-compiler') throw new Error('unexpected package identity: ' + m.DOMAIN_HARNESS_COMPILER_PACKAGE);
if (m.COMPILER_PUBLIC_API_VERSION !== 'compiler-public-api.v1') throw new Error('unexpected compiler public API compatibility level: ' + m.COMPILER_PUBLIC_API_VERSION);
for (const key of ['admitComponent','computeDefinitionGraphDigest','validateToolComponent','mapRawV07AuthoringToComponentGraph','RAW_V07_TOOL_KIND']) { if (key in m) throw new Error('compiler root must not expose successor/internal authority: ' + key); }
const core = await import('@kaicreator/domain-harness');
if (core.DOMAIN_HARNESS_VERSION !== '0.2.0') throw new Error('legacy core root version changed: ' + core.DOMAIN_HARNESS_VERSION);
if (typeof core.createDomainRuntime !== 'function' || typeof core.StaticPackageRegistry !== 'function') throw new Error('legacy core root commitments missing');
const v7 = await import('@kaicreator/domain-harness/v7');
for (const key of ['admitComponent','computeDefinitionGraphDigest','validateToolComponent','validateComponentEnvelope','validateDefinitionGraphEnvelope']) { if (typeof v7[key] !== 'function') throw new Error('successor /v7 export missing: ' + key); }
if (JSON.stringify(v7.COMPONENT_FAMILIES) !== '["semantic","tool"]') throw new Error('/v7 COMPONENT_FAMILIES changed');
`,
      ],
      consumerDirectory,
    );

    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "try { await import('@kaicreator/domain-harness-compiler/dist/raw/types.js'); throw new Error('compiler deep import unexpectedly succeeded'); } catch (error) { if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw error; }",
      ],
      consumerDirectory,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
