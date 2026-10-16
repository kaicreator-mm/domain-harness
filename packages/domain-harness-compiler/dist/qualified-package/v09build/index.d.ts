/**
 * DomainHarness v0.9 N06 (#1032) — producer-neutral zero-import BUILD
 * surface: sealed v0.9 qualified-root producer, `dh.v9.qualified-root
 * .subject/1` canonical digest (D04), the pinned vendored full-AST parser
 * pin, and the zero-import import-closure gate (D01).
 *
 * The produced root carries NO approval; the external governance issuer
 * attaches authority at the protected install (`@kaicreator/domain-harness`
 * internal host-v9 registry, #1032). The N01 frozen `v09/` modules
 * (selected K/S/C ABI + pure Router) are deliberately NOT re-exported here.
 */
export { buildV09QualifiedRoot } from './build.js';
export type { BuildV09QualifiedRootOptions, V09BindingRecord, V09SealedPackage, V09SealedQualifiedRoot, } from './build.js';
export { V09BuildError } from './errors.js';
export { canonicalV9Json, computeV09SealedRootSubjectDigest, computeV9QualifiedRootSubjectDigest, V09_BUNDLER_REVISION, V09_HOST_ABI, V09_IMPORT_POLICY_REVISION, V09_RUNTIME_ABI, V09_SEALED_ROOT_FORMAT, V09_SUBJECT_DOMAIN, } from './digest.js';
export { assertZeroImportBuildModule } from './import-closure.js';
export { assertVendoredParserBytes, V09_BUILD_PARSER_PIN } from './parser.js';
export type { V09BuildParserPin } from './parser.js';
