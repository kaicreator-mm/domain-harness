/** Build-time compiler package and stable public API. */
export const DOMAIN_HARNESS_COMPILER_PACKAGE = '@kaicreator/domain-harness-compiler';
export { loadRawDomainPackage, } from './raw/load-raw-package.js';
export { compileDomainPackage, } from './compile/compile-domain-package.js';
export { emitTargetCompiledPackageModule, } from './package/module-emitter.js';
// T-021 legacy Script migration path (L2 §18.1), publicly reachable (#167):
// translate legacy `script` invokes into synthetic Script Domain Tools BEFORE
// compileDomainPackage, then bundle the tool module for the target host.
// The public compile path fails closed on untranslated script invokes.
export { translateV01ScriptInvokes, V01ScriptTranslationError, } from './compat/v01-script/index.js';
export { bundleScriptTool, ScriptCompileError, SCRIPT_EXECUTION_CAPABILITY, } from './script/script-bundle.js';
