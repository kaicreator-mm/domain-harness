/**
 * T012-D1 export-surface tests for the additive
 * `@kaicreator/domain-harness/v7/execution` facade (gate #930; adjudication
 * #537@6052473158; defect #926 T012-D1).
 *
 * The new `./v7/execution` entry is exposure-only: a composition barrel that
 * re-exports, unchanged, the accepted T010 Tool-plane seams from their owner
 * leaf modules (T002B runtime-assembly, T003B capability-provision, T003C
 * tool-implementation-binding, T004A invocation-request, T004B
 * non-effectful-invocation, T004C effectful-invocation, T005C
 * resource-resolution, T004E ux-tool-request, T004D agent-tool-projection).
 * These tests pin the exact runtime closure (16 functions + 9 typed error
 * classes, nothing else), prove every value is the owner module's own
 * binding (composition-only, NO_REIMPLEMENTATION_IN_PUBLIC_FACADE), guard
 * the additive-only `exports` diff (exactly `./v7/execution` with
 * types/import/require), fence the facade source (no `export *`, no Node-only
 * import, no mint/brand/registry authority), and prove the existing `./v7`
 * barrel and package root are untouched. The packed-dist consumer proof
 * (clean install, frozen-digest recomputation, authorized + refusal rows,
 * deep-import closedness) lives in
 * `public-v7-execution-portability.test.ts`; compile-time fixtures in
 * `execution-type-fixtures.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as executionSurface from '../../src/public-v7/execution.js';
import * as rootSurface from '../../src/index.js';
import * as v7Surface from '../../src/public-v7/index.js';
import * as runtimeAssembly from '../../src/contracts/runtime-assembly.js';
import * as capabilityProvision from '../../src/contracts/capability-provision.js';
import * as toolImplementationBinding from '../../src/contracts/tool-implementation-binding.js';
import * as invocationRequest from '../../src/contracts/invocation-request.js';
import * as nonEffectfulInvocation from '../../src/contracts/non-effectful-invocation.js';
import * as effectfulInvocation from '../../src/contracts/effectful-invocation.js';
import * as resourceResolution from '../../src/contracts/resource-resolution.js';
import * as uxToolRequest from '../../src/adapters/ux-tool-request.js';
import * as agentToolProjection from '../../src/adapters/agent-tool-projection.js';

/** The exactly-16 function bindings promised by the `./v7/execution` entry. */
const EXECUTION_FUNCTIONS = [
  'admitAgentMutationIntent',
  'admitComponentWithAssembly',
  'admitToolExposure',
  'admitToolInvocationRequest',
  'bindToolImplementation',
  'invokeEffectfulTool',
  'invokeNonEffectfulTool',
  'invokeUxToolEffectfully',
  'isSealedRuntimeAssembly',
  'projectAgentToolSurface',
  'queryAgentTool',
  'queryUxTool',
  'resolveCurrentCapabilityProvider',
  'resolveToolResources',
  'sealRuntimeAssembly',
  'verifyToolImplementationBinding',
] as const;

/** The exactly-9 typed error classes of the `./v7/execution` entry. */
const EXECUTION_ERRORS = [
  'AgentToolProjectionError',
  'CapabilityProvisionContractError',
  'EffectfulInvocationError',
  'InvocationRequestError',
  'NonEffectfulInvocationError',
  'ResourceResolutionError',
  'RuntimeAssemblyError',
  'ToolImplementationBindingError',
  'UxToolRequestError',
] as const;

const EXECUTION_RUNTIME_SORTED = [...EXECUTION_FUNCTIONS, ...EXECUTION_ERRORS].sort(
  (left, right) => (left < right ? -1 : left > right ? 1 : 0),
);

/** Owner module of every promised value: composition-only proof map. */
const OWNER_BINDINGS: Record<(typeof EXECUTION_RUNTIME_SORTED)[number], unknown> = {
  admitAgentMutationIntent: agentToolProjection.admitAgentMutationIntent,
  admitComponentWithAssembly: runtimeAssembly.admitComponentWithAssembly,
  admitToolExposure: invocationRequest.admitToolExposure,
  admitToolInvocationRequest: invocationRequest.admitToolInvocationRequest,
  bindToolImplementation: toolImplementationBinding.bindToolImplementation,
  invokeEffectfulTool: effectfulInvocation.invokeEffectfulTool,
  invokeNonEffectfulTool: nonEffectfulInvocation.invokeNonEffectfulTool,
  invokeUxToolEffectfully: uxToolRequest.invokeUxToolEffectfully,
  isSealedRuntimeAssembly: runtimeAssembly.isSealedRuntimeAssembly,
  projectAgentToolSurface: agentToolProjection.projectAgentToolSurface,
  queryAgentTool: agentToolProjection.queryAgentTool,
  queryUxTool: uxToolRequest.queryUxTool,
  resolveCurrentCapabilityProvider: capabilityProvision.resolveCurrentCapabilityProvider,
  resolveToolResources: resourceResolution.resolveToolResources,
  sealRuntimeAssembly: runtimeAssembly.sealRuntimeAssembly,
  verifyToolImplementationBinding: toolImplementationBinding.verifyToolImplementationBinding,
  AgentToolProjectionError: agentToolProjection.AgentToolProjectionError,
  CapabilityProvisionContractError: capabilityProvision.CapabilityProvisionContractError,
  EffectfulInvocationError: effectfulInvocation.EffectfulInvocationError,
  InvocationRequestError: invocationRequest.InvocationRequestError,
  NonEffectfulInvocationError: nonEffectfulInvocation.NonEffectfulInvocationError,
  ResourceResolutionError: resourceResolution.ResourceResolutionError,
  RuntimeAssemblyError: runtimeAssembly.RuntimeAssemblyError,
  ToolImplementationBindingError: toolImplementationBinding.ToolImplementationBindingError,
  UxToolRequestError: uxToolRequest.UxToolRequestError,
};

/** Internal-only names that must stay unreachable from the facade. */
const INTERNAL_NAMES = [
  'canonicalizeJson',
  'computeCanonicalJsonDigest',
  'lexicalCompare',
  'safeRecordSnapshot',
  'describeRecordSafetyIssue',
  'RUNTIME_ASSEMBLY_DIGEST_DOMAIN',
  'TOOL_EXPOSURE_DIGEST_DOMAIN',
  'UX_CALLER_KIND',
  'AGENT_CALLER_KIND',
  'selectCapabilityProvider',
  'verifyToolImplementationBindingEvidence',
] as const;

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const facadePath = fileURLToPath(new URL('../../src/public-v7/execution.ts', import.meta.url));

test('T012-D1: ./v7/execution src facade exposes exactly the 16 functions + 9 error classes and nothing else', () => {
  const runtimeKeys = Object.keys(executionSurface).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  assert.deepEqual(runtimeKeys, EXECUTION_RUNTIME_SORTED);
});

test('T012-D1: every facade value is the owner module own binding (composition-only, no reimplementation)', () => {
  for (const name of EXECUTION_RUNTIME_SORTED) {
    assert.equal(
      (executionSurface as Record<string, unknown>)[name],
      OWNER_BINDINGS[name],
      `${name} must be re-exported unchanged from its owner leaf module`,
    );
  }
});

test('T012-D1: internal helpers, digest-domain consts, caller-kind consts and the non-promoted evidence verifier stay unreachable', () => {
  for (const name of INTERNAL_NAMES) {
    assert.equal(name in executionSurface, false, `${name} must not leak into ./v7/execution`);
  }
});

test('T012-D1: package exports map gains exactly ./v7/execution with types/import/require', () => {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    exports: Record<string, { types: string; import: string; require: string }>;
  };
  const subpaths = Object.keys(packageJson.exports).sort();
    assert.deepEqual(subpaths, ['.', './v2', './v3', './v4', './v7', './v7/execution', './workflow']);
  assert.deepEqual(packageJson.exports['./v7/execution'], {
    types: './dist/public-v7/execution.d.ts',
    import: './dist/public-v7/execution.js',
    require: './dist/public-v7/execution.js',
  });
  // Pre-existing entries are byte-untouched.
  assert.deepEqual(packageJson.exports['./v7'], {
    types: './dist/public-v7/index.d.ts',
    import: './dist/public-v7/index.js',
    require: './dist/public-v7/index.js',
  });
});

test('T012-D1: facade source fences — no export *, no Node-only import, no authority minting', () => {
  const source = readFileSync(facadePath, 'utf8');
  assert.equal(
    /export\s+\*\s+from/.test(source),
    false,
    'facade must not use export * (NO_EXPORT_WILDCARD_FROM_INTERNAL_LEAF_MODULES)',
  );
  assert.equal(
    /from\s+['"]node:/.test(source),
    false,
    'facade must not import Node-only builtins (NO_NODE_ONLY_DEPENDENCY_IN_PORTABLE_FACADE)',
  );
  assert.equal(
    /require\(['"]node:/.test(source),
    false,
    'facade must not require Node-only builtins',
  );
});

test('T012-D1: existing ./v7 barrel and package root are untouched by the additive facade', () => {
  const v7Keys = Object.keys(v7Surface).sort();
  assert.equal(v7Keys.length, 15);
  assert.equal('sealRuntimeAssembly' in v7Surface, false);
  assert.equal('queryUxTool' in v7Surface, false);
  // Root remains additive: it does not absorb the execution seams either.
  assert.equal(typeof rootSurface.computeDefinitionGraphDigest, 'function');
  assert.equal('sealRuntimeAssembly' in rootSurface, false);
  assert.equal('invokeEffectfulTool' in rootSurface, false);
});

test('T012-D1: typed error classes construct with their frozen code types (fail-closed handling surface)', () => {
  const probes: ReadonlyArray<readonly [string, string]> = [
    ['RuntimeAssemblyError', 'INVALID_ASSEMBLY_INPUT'],
    ['CapabilityProvisionContractError', 'CAPABILITY_PROVIDER_NOT_FOUND'],
    ['ToolImplementationBindingError', 'UNMINTED_TOOL_IMPLEMENTATION_BINDING'],
    ['InvocationRequestError', 'INVALID_INVOCATION_INPUT'],
    ['NonEffectfulInvocationError', 'EFFECTFUL_OPERATION_REJECTED'],
    ['EffectfulInvocationError', 'EFFECTLESS_OPERATION_REJECTED'],
    ['ResourceResolutionError', 'MISSING_REQUIRED_RESOURCE'],
    ['UxToolRequestError', 'UX_OPERATION_NOT_EXPOSED'],
    ['AgentToolProjectionError', 'AGENT_OPERATION_NOT_PROJECTED'],
  ];
  for (const [name, code] of probes) {
    const ctor = (executionSurface as unknown as Record<string, new (c: string, m: string) => Error>)[name]!;
    const error = new ctor(code, 'probe');
    assert.ok(error instanceof Error);
    assert.equal((error as unknown as { code: string }).code, code);
  }
});

test('T012-D1: isSealedRuntimeAssembly stays a pure mint proof (never a minting path)', () => {
  assert.equal(executionSurface.isSealedRuntimeAssembly(null), false);
  assert.equal(executionSurface.isSealedRuntimeAssembly({}), false);
  assert.equal(executionSurface.isSealedRuntimeAssembly(false), false);
});
