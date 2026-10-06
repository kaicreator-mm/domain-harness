/** Build-time compiler package and stable public API. */
export const DOMAIN_HARNESS_COMPILER_PACKAGE = '@kaicreator/domain-harness-compiler';
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
export const COMPILER_PUBLIC_API_VERSION = 'compiler-public-api.v1';
export { loadRawDomainPackage, } from './raw/load-raw-package.js';
export { compileDomainPackage, } from './compile/compile-domain-package.js';
// v0.6 T001 (issue #497, frozen L2 A2/A7): first-class semantic decision
// declaration compilation. The compiled descriptor types have exactly one
// authoritative owner: the core v2 contracts (re-exported below).
export { SemanticDecisionCompileError, compileSemanticDecisions, } from './compile/semantic-decisions.js';
// I-03-ASSEMBLY public successor compile material: the exact output profile the
// public compiler emits, plus the Domain Data / Business Source entry shapes
// and their fail-closed compile errors (L2-A §3.6/§3.7).
export { PUBLIC_COMPILER_OUTPUT_PROFILE } from './package/profile.js';
export { DomainDataCompileError, } from './package/domain-data.js';
export { BusinessSourceCompileError, } from './package/business-sources.js';
export { emitTargetCompiledPackageModule, } from './package/module-emitter.js';
// T-021 legacy Script migration path (L2 §18.1), publicly reachable (#167):
// translate legacy `script` invokes into synthetic Script Domain Tools BEFORE
// compileDomainPackage, then bundle the tool module for the target host.
// The public compile path fails closed on untranslated script invokes.
export { translateV01ScriptInvokes, V01ScriptTranslationError, } from './compat/v01-script/index.js';
export { bundleScriptTool, ScriptCompileError, SCRIPT_EXECUTION_CAPABILITY, } from './script/script-bundle.js';
