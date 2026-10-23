/**
 * T008C — Compiler/public compatibility lane (PACK-B #589, thin issue #791).
 *
 * Versioned compatibility proof for the current Raw/compiler root export
 * commitments (`@kaicreator/domain-harness-compiler`, entry `.`). These tests
 * pin the exact runtime inventory of the compiler barrel — including the
 * T000-SD semantic-decision compile API restored by PR #843 — and guard the
 * compatibility direction commitments from the frozen T008C design:
 *
 * - the frozen legacy inventory is preserved and only ever extended
 *   additively; the compatibility level marker `COMPILER_PUBLIC_API_VERSION`
 *   names the exact promised inventory so consumers can pin against it;
 * - the successor `/v7` surface stays additive in the core package and is not
 *   re-exported or shadowed here (no competing barrel: this lane consumes the
 *   #570 public rebind/current exports rather than duplicating them);
 * - the internal T008A/T008B compatibility modules stay internal (compat
 *   evidence must never be promoted into a public promise by accident);
 * - the compile-side semantic-decision types keep exactly one authoritative
 *   owner: the core v2 contracts, consumed via `@kaicreator/domain-harness/v2`.
 *
 * The authoritative packed-tarball consumer proof (nominal assignability of
 * the full type surface against the packed `dist`, legacy core root import
 * fixtures, `/v7` import fixtures, deep-import closedness) lives in
 * `tests/public-consumer.test.ts`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as compilerRoot from '../src/index.js';

import {
  COMPILER_PUBLIC_API_VERSION,
  DOMAIN_HARNESS_COMPILER_PACKAGE,
} from '../src/index.js';

/** The exactly-14 legacy runtime bindings committed by the compiler root barrel. */
const LEGACY_RUNTIME_VALUES = [
  // consts (3)
  'DOMAIN_HARNESS_COMPILER_PACKAGE',
  'PUBLIC_COMPILER_OUTPUT_PROFILE',
  'SCRIPT_EXECUTION_CAPABILITY',
  // functions (6)
  'loadRawDomainPackage',
  'compileDomainPackage',
  'compileSemanticDecisions',
  'emitTargetCompiledPackageModule',
  'translateV01ScriptInvokes',
  'bundleScriptTool',
  // error classes (5)
  'SemanticDecisionCompileError',
  'DomainDataCompileError',
  'BusinessSourceCompileError',
  'V01ScriptTranslationError',
  'ScriptCompileError',
] as const;

/** The one additive T008C compatibility commitment binding. */
const T008C_COMPATIBILITY_VALUES = ['COMPILER_PUBLIC_API_VERSION'] as const;

/** The additive T-A (#1000) qualified-package BUILD runtime bindings. */
const TA_QUALIFIED_PACKAGE_VALUES = [
  // functions (7)
  'analyzeModuleClosure',
  'assertDeclaredExports',
  'buildQualifiedPackage',
  'issueApprovalProof',
  'qualifyPackageClosure',
  'qualifiedKey',
  'verifyApprovalProof',
  // error classes (4)
  'ApprovalError',
  'BuildError',
  'ClosureError',
  'QualificationError',
] as const;

/** The additive v0.8 T-G HF25 (#1006) typed App-contract generator bindings. */
const HF25_APP_CONTRACT_VALUES = [
  // const (1)
  'APP_CONTRACT_SOURCE_FORMAT',
  // functions (1)
  'generateTypedAppContracts',
  // error classes (1)
  'AppContractGenerationError',
] as const;

/** The additive v0.9 N06 (#1032) zero-import BUILD runtime bindings. */
const N06_V09_BUILD_VALUES = [
  // consts (6)
  'V09_SUBJECT_DOMAIN',
  'V09_SEALED_ROOT_FORMAT',
  'V09_IMPORT_POLICY_REVISION',
  'V09_RUNTIME_ABI',
  'V09_HOST_ABI',
  'V09_BUNDLER_REVISION',
  // functions (6)
  'buildV09QualifiedRoot',
  'assertZeroImportBuildModule',
  'assertVendoredParserBytes',
  'canonicalV9Json',
  'computeV09SealedRootSubjectDigest',
  'computeV9QualifiedRootSubjectDigest',
  // object const (1)
  'V09_BUILD_PARSER_PIN',
  // error classes (1)
  'V09BuildError',
] as const;

/** v0.10 T00 (#1166): closed-world Node24 BUILD composition (additive group). */
const T00_V10BUILD_VALUES = [
  // string consts (9)
  'V10_BUILD_FORMAT',
  'V10_BUNDLER_REVISION',
  'V10_HOST_ABI',
  'V10_IMPORT_POLICY_REVISION',
  'V10_KEXT_ABI',
  'V10_KERNEL_ADVISORY_HOOKS',
  'V10_RUNTIME_ABI',
  'V10_SFEATURE_ABI',
  'V10_TARGET_PROFILE',
  // object consts (2)
  'V10_ACTIVATION_FAILURE_CODES',
  'V10_SELECTED_ROLE_ABI',
  // functions (6)
  'activateV10App',
  'buildV10App',
  'canonicalJson',
  'emptyExternalImports',
  'sha256Canonical',
  'sha256Hex',
  // error classes (5)
  'V10ActivationError',
  'V10BuildError',
  'V10Error',
  'V10ExternalEffectError',
  'V10PortDeniedError',
  // facade class (1)
  'V10AppFacade',
] as const;

/** v0.10 T08/T10B (#1175/#1179): governed BUILD selection and deployment activation (additive group). */
const T08_T10B_V10GOVERNED_VALUES = [
  // functions (7)
  'activateGovernedV10Build',
  'readV10DeploymentActivationRecord',
  'readV10OccurrenceBuildPin',
  'v10BuildActivationDecisionDigest',
  'v10BuildPackageClosureDigest',
  'v10DeploymentActivationKey',
  'v10OccurrenceBuildPinKey',
  // error classes (1)
  'V10DeploymentError',
] as const;

/** The complete T008C-promised runtime inventory (legacy + additive markers). */
const COMMITTED_RUNTIME_VALUES = [
  ...LEGACY_RUNTIME_VALUES,
  ...T008C_COMPATIBILITY_VALUES,
  ...TA_QUALIFIED_PACKAGE_VALUES,
  ...HF25_APP_CONTRACT_VALUES,
  ...N06_V09_BUILD_VALUES,
  ...T00_V10BUILD_VALUES,
  ...T08_T10B_V10GOVERNED_VALUES,
];

const COMMITTED_RUNTIME_SORTED = [...COMMITTED_RUNTIME_VALUES].sort((left, right) =>
  left < right ? -1 : left > right ? 1 : 0,
);

const STRING_CONST_NAMES = new Set<string>([
  'DOMAIN_HARNESS_COMPILER_PACKAGE',
  'SCRIPT_EXECUTION_CAPABILITY',
  'COMPILER_PUBLIC_API_VERSION',
  'APP_CONTRACT_SOURCE_FORMAT',
  'V09_SUBJECT_DOMAIN',
  'V09_SEALED_ROOT_FORMAT',
  'V09_IMPORT_POLICY_REVISION',
  'V09_RUNTIME_ABI',
  'V09_HOST_ABI',
  'V09_BUNDLER_REVISION',
  // v0.10 T00 string constants
  'V10_BUILD_FORMAT',
  'V10_BUNDLER_REVISION',
  'V10_HOST_ABI',
  'V10_IMPORT_POLICY_REVISION',
  'V10_KEXT_ABI',
  'V10_RUNTIME_ABI',
  'V10_SFEATURE_ABI',
  'V10_TARGET_PROFILE',
]);
/** [v0.10 #1264] Frozen readonly string-LIST constants (closed-set advisory hooks). */
const FROZEN_STRING_LIST_NAMES = new Set<string>(['V10_KERNEL_ADVISORY_HOOKS']);
const PROFILE_CONST_NAMES = new Set<string>(['PUBLIC_COMPILER_OUTPUT_PROFILE', 'V10_ACTIVATION_FAILURE_CODES', 'V10_SELECTED_ROLE_ABI']);
const PARSER_PIN_CONST_NAMES = new Set<string>(['V09_BUILD_PARSER_PIN']);
/** Non-error public classes (constructors that are not Error subclasses). */
const PLAIN_CLASS_NAMES = new Set<string>(['V10AppFacade']);
const FUNCTION_NAMES = new Set<string>([
  'loadRawDomainPackage',
  'compileDomainPackage',
  'compileSemanticDecisions',
  'emitTargetCompiledPackageModule',
  'translateV01ScriptInvokes',
  'bundleScriptTool',
  'analyzeModuleClosure',
  'assertDeclaredExports',
  'buildQualifiedPackage',
  'issueApprovalProof',
  'qualifyPackageClosure',
  'qualifiedKey',
  'verifyApprovalProof',
  'generateTypedAppContracts',
  'buildV09QualifiedRoot',
  'assertZeroImportBuildModule',
  'assertVendoredParserBytes',
  'canonicalV9Json',
  'computeV09SealedRootSubjectDigest',
  'computeV9QualifiedRootSubjectDigest',
  // v0.10 T00 functions
  'activateV10App',
  'buildV10App',
  'canonicalJson',
  'emptyExternalImports',
  'sha256Canonical',
  'sha256Hex',
  // v0.10 T08/T10B functions
  'activateGovernedV10Build',
  'readV10DeploymentActivationRecord',
  'readV10OccurrenceBuildPin',
  'v10BuildActivationDecisionDigest',
  'v10BuildPackageClosureDigest',
  'v10DeploymentActivationKey',
  'v10OccurrenceBuildPinKey',
]);
const ERROR_CLASS_NAMES = new Set<string>([
  'SemanticDecisionCompileError',
  'DomainDataCompileError',
  'BusinessSourceCompileError',
  'V01ScriptTranslationError',
  'ScriptCompileError',
  'ApprovalError',
  'BuildError',
  'ClosureError',
  'QualificationError',
  'AppContractGenerationError',
  'V09BuildError',
  // v0.10 T00 error classes
  'V10ActivationError',
  'V10BuildError',
  'V10Error',
  'V10ExternalEffectError',
  'V10PortDeniedError',
  // v0.10 T10B error classes
  'V10DeploymentError',
]);

/** The exactly-15 successor `/v7` runtime names owned by the core package. */
const V7_RUNTIME_AUTHORITY_NAMES = [
  'COMPONENT_FAMILIES',
  'COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7',
  'DEFINITION_GRAPH_DIGEST_DOMAIN',
  'validateComponentEnvelope',
  'componentSemanticDigestMaterial',
  'computeComponentSemanticDigest',
  'validateDefinitionGraphEnvelope',
  'computeDefinitionGraphDigest',
  'admitComponent',
  'validateToolComponent',
  'ComponentContractError',
  'ComponentDigestError',
  'DefinitionGraphContractError',
  'ComponentAdmissionError',
  'ToolComponentContractError',
] as const;

/** Internal T008A/T008B compat bindings that must stay off the public barrel. */
const INTERNAL_COMPAT_NAMES = [
  'RAW_V07_TOOL_KIND',
  'RAW_V07_WORKFLOW_KIND',
  'RAW_V07_SKILL_KIND',
  'RAW_V07_PROJECTION_KIND',
  'RAW_V07_INVOKES_RELATION_KIND',
  'RAW_V07_EXECUTE_OPERATION_ID',
  'RAW_V07_ADAPTER_PROVENANCE_MARKER',
  'RAW_V07_IDENTITY_CORRESPONDENCE_MARKER',
  'mapRawV07AuthoringToComponentGraph',
  'buildRawV07IdentityCorrespondence',
  'RawV07AdapterError',
  'RawV07IdentityCorrespondenceError',
] as const;

// ---------------------------------------------------------------------------
// Pack test 1: exact inventory closure (full commitment comparison).
// ---------------------------------------------------------------------------

test('T008C: compiler root barrel exposes exactly the committed inventory and nothing else', () => {
  const runtimeKeys = Object.keys(compilerRoot).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  assert.deepEqual(runtimeKeys, COMMITTED_RUNTIME_SORTED);
});

test('T008C: every legacy runtime commitment is still present (full inventory comparison)', () => {
  for (const name of LEGACY_RUNTIME_VALUES) {
    assert.ok(
      name in compilerRoot,
      `legacy public compiler commitment "${name}" must stay available`,
    );
  }
});

// ---------------------------------------------------------------------------
// Pack test 2: the versioned compatibility commitment itself.
// ---------------------------------------------------------------------------

// Pre-1.0 window: the v0.10 additive group may be intentionally narrowed
// (see #1227/#1248 — internal seams removed from the curated barrel); the
// legacy inventory below stays additive-only.
test('T008C: COMPILER_PUBLIC_API_VERSION is the frozen v1 compatibility level', () => {
  assert.equal(COMPILER_PUBLIC_API_VERSION, 'compiler-public-api.v1');
  assert.equal(
    compilerRoot.COMPILER_PUBLIC_API_VERSION,
    'compiler-public-api.v1',
  );
  assert.equal(
    DOMAIN_HARNESS_COMPILER_PACKAGE,
    '@kaicreator/domain-harness-compiler',
  );
});

// ---------------------------------------------------------------------------
// Pack test 3: every committed binding keeps its promised kind.
// ---------------------------------------------------------------------------

test('T008C: every committed runtime binding has the promised kind', () => {
  for (const [name, value] of Object.entries(compilerRoot)) {
    if (STRING_CONST_NAMES.has(name!)) {
      assert.equal(typeof value, 'string', `${name} must be a string constant`);
      assert.ok((value as string).length > 0, `${name} must be non-empty`);
      continue;
    }
    if (FROZEN_STRING_LIST_NAMES.has(name!)) {
      assert.ok(Array.isArray(value), `${name} must be a frozen string-list constant`);
      assert.ok((value as readonly string[]).length > 0, `${name} must be non-empty`);
      assert.ok((value as readonly string[]).every((entry) => typeof entry === 'string' && entry.length > 0), `${name} entries must be non-empty strings`);
      continue;
    }
    if (PROFILE_CONST_NAMES.has(name!)) {
      assert.equal(typeof value, 'object', `${name} must be an object constant`);
      assert.ok(value !== null, `${name} must not be null`);
      assert.ok(!Array.isArray(value), `${name} must not be an array`);
      continue;
    }
    if (PARSER_PIN_CONST_NAMES.has(name!)) {
      assert.equal(typeof value, 'object', `${name} must be an object constant`);
      assert.ok(value !== null, `${name} must not be null`);
      assert.ok(!Array.isArray(value), `${name} must not be an array`);
      assert.equal((value as { sha256?: unknown }).sha256, '76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b', `${name} must keep the pinned vendored parser digest`);
      continue;
    }
    if (FUNCTION_NAMES.has(name!)) {
      assert.equal(typeof value, 'function', `${name} must be a function`);
      continue;
    }
    if (PLAIN_CLASS_NAMES.has(name!)) {
      assert.equal(typeof value, 'function', `${name} must be a class constructor`);
      continue;
    }
    if (ERROR_CLASS_NAMES.has(name!)) {
      assert.equal(typeof value, 'function', `${name} must be an error class constructor`);
      assert.ok(
        (value as unknown as abstract new () => Error).prototype instanceof Error,
        `${name} must extend Error`,
      );
      continue;
    }
    assert.fail(`unexpected runtime binding on the compiler root barrel: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// Pack test 4: the PR #843 semantic-decision compile API stays available.
// ---------------------------------------------------------------------------

test('T008C: PR #843 semantic-decision compile API is preserved on the barrel', () => {
  assert.equal(typeof compilerRoot.compileSemanticDecisions, 'function');
  assert.ok(
    (compilerRoot.SemanticDecisionCompileError as unknown as abstract new () => Error)
      .prototype instanceof Error,
    'SemanticDecisionCompileError must extend Error',
  );
});

// ---------------------------------------------------------------------------
// Pack test 4b: the HF25 additive generator binding keeps its frozen shape.
// ---------------------------------------------------------------------------

test('v0.8 HF25: the typed App-contract generator is an additive BUILD binding with its frozen source-format constant', () => {
  assert.equal(
    compilerRoot.APP_CONTRACT_SOURCE_FORMAT,
    'domain-harness.app-contracts.v1',
  );
  assert.equal(typeof compilerRoot.generateTypedAppContracts, 'function');
  assert.ok(
    (compilerRoot.AppContractGenerationError as unknown as abstract new () => Error)
      .prototype instanceof Error,
    'AppContractGenerationError must extend Error',
  );
});

// ---------------------------------------------------------------------------
// Pack test 5: no competing successor barrel — /v7 authority stays in core.
// ---------------------------------------------------------------------------

test('T008C: compiler root gains no successor /v7 authority names', () => {
  for (const name of V7_RUNTIME_AUTHORITY_NAMES) {
    assert.equal(
      name in compilerRoot,
      false,
      `successor authority "${name}" must stay owned by @kaicreator/domain-harness/v7, not the compiler barrel`,
    );
  }
});

// ---------------------------------------------------------------------------
// Pack test 6: internal T008A/T008B compat modules stay off the public barrel.
// ---------------------------------------------------------------------------

test('T008C: internal raw-v07 compat bindings are not promoted to public commitments', () => {
  for (const name of INTERNAL_COMPAT_NAMES) {
    assert.equal(
      name in compilerRoot,
      false,
      `internal compat binding "${name}" must not leak into the compiler root barrel`,
    );
  }
});
