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

/** The complete T008C-promised runtime inventory (legacy + one additive marker). */
const COMMITTED_RUNTIME_VALUES = [...LEGACY_RUNTIME_VALUES, ...T008C_COMPATIBILITY_VALUES];

const COMMITTED_RUNTIME_SORTED = [...COMMITTED_RUNTIME_VALUES].sort((left, right) =>
  left < right ? -1 : left > right ? 1 : 0,
);

const STRING_CONST_NAMES = new Set<string>([
  'DOMAIN_HARNESS_COMPILER_PACKAGE',
  'SCRIPT_EXECUTION_CAPABILITY',
  'COMPILER_PUBLIC_API_VERSION',
]);
const PROFILE_CONST_NAMES = new Set<string>(['PUBLIC_COMPILER_OUTPUT_PROFILE']);
const FUNCTION_NAMES = new Set<string>([
  'loadRawDomainPackage',
  'compileDomainPackage',
  'compileSemanticDecisions',
  'emitTargetCompiledPackageModule',
  'translateV01ScriptInvokes',
  'bundleScriptTool',
]);
const ERROR_CLASS_NAMES = new Set<string>([
  'SemanticDecisionCompileError',
  'DomainDataCompileError',
  'BusinessSourceCompileError',
  'V01ScriptTranslationError',
  'ScriptCompileError',
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
    if (PROFILE_CONST_NAMES.has(name!)) {
      assert.equal(typeof value, 'object', `${name} must be an object constant`);
      assert.ok(value !== null, `${name} must not be null`);
      assert.ok(!Array.isArray(value), `${name} must not be an array`);
      continue;
    }
    if (FUNCTION_NAMES.has(name!)) {
      assert.equal(typeof value, 'function', `${name} must be a function`);
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
