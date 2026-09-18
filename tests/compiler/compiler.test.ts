import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compileDomainPackage } from '../../packages/domain-harness-compiler/src/compile/compile-domain-package.js';
import { MissingTargetCapabilityError } from '../../packages/domain-harness-compiler/src/compile/capabilities.js';
import { loadRawDomainPackage } from '../../packages/domain-harness-compiler/src/raw/load-raw-package.js';
import type {
  CapabilityId,
  LoadedRawDomainPackage,
  RawWorkflow,
  TargetHostProfile,
} from '../../packages/domain-harness-compiler/src/raw/types.js';
import { assertCompiledPackageManifest, CompiledManifestValidationError } from '../../packages/domain-harness-compiler/src/package/manifest.js';
import { emitTargetCompiledPackageModule } from '../../packages/domain-harness-compiler/src/package/module-emitter.js';

const CAPS = {
  hash: 'crypto-hash-sha256@1',
  module: 'compiled-package-module@1',
  expression: 'expression-jsonata@1',
  script: 'script-execution@1',
  http: 'http-transport@1',
} as const satisfies Readonly<Record<string, CapabilityId>>;

function target(capabilities: readonly CapabilityId[] = Object.values(CAPS)): TargetHostProfile {
  return {
    id: 'node-test@1',
    capabilities,
    bindings: {
      [CAPS.hash]: '@host/hash',
      [CAPS.module]: '@host/module',
      [CAPS.expression]: '@host/expression',
      [CAPS.script]: '@host/script',
      [CAPS.http]: '@host/http',
    },
  };
}

function workflow(id: string, kind: 'expr' | 'script'): RawWorkflow {
  return {
    id,
    sourcePath: `/authoring/${id}.yaml`,
    initial: 'execute',
    output: '$.result',
    states: {
      execute: {
        id: 'execute',
        final: false,
        invoke: kind === 'expr'
          ? { kind: 'expr', expression: '$.value * 2' }
          : { kind: 'script', ref: `scripts/${id}.ts`, scriptSource: 'export default () => "raw-script-secret-marker";' },
        done: [{ target: 'waiting' }],
        error: [{ target: 'failed' }],
        events: {},
        effects: [{ kind: 'domain-message', targetExpression: '$.target', messageType: 'CHANGED', payloadExpression: '$.payload', contractVersion: '1' }],
      },
      waiting: {
        id: 'waiting',
        final: false,
        done: [],
        error: [],
        events: {
          ADVANCE: { routes: [{ target: 'completed' }], schema: { type: 'object', properties: { endpoint: { type: 'string' } } } },
        },
      },
      completed: { id: 'completed', final: true, done: [], error: [], events: {} },
      failed: { id: 'failed', final: true, done: [], error: [], events: {} },
    },
  };
}

function raw(order: 'normal' | 'reverse' = 'normal'): LoadedRawDomainPackage {
  const entries: Array<[string, RawWorkflow]> = [
    ['expr_flow', workflow('expr_flow', 'expr')],
    ['script_flow', workflow('script_flow', 'script')],
  ];
  if (order === 'reverse') entries.reverse();
  return {
    root: order === 'normal' ? '/tmp/a' : '/other/location',
    schemaVersion: '0.1',
    domainId: 'fixture-domain',
    limits: { maxSteps: 50 },
    workflows: new Map(entries),
    skills: new Map(),
    scripts: new Map([['scripts/script_flow.ts', 'export default () => "raw-script-secret-marker";']]),
    schemas: new Map(),
    childDependencies: new Map(entries.map(([id]) => [id, []])),
  };
}

function compileFixture(rawInput = raw()) {
  return compileDomainPackage({
    raw: rawInput,
    domainVersion: '2.0.0-test',
    target: target(),
    tools: [{
      toolId: 'remoteLookup',
      inputSchema: { type: 'object', properties: { endpoint: { type: 'string' } } },
      outputSchema: { type: 'object' },
      effect: 'idempotent',
      executionKind: 'remote-http-json',
      requiredCapabilities: [CAPS.http],
      config: { runtimeResourceKey: 'remoteLookupService' },
    }],
    projections: [{
      projectionId: 'overview',
      expression: '{"status": $.workflow.status}',
      dependencies: [{ kind: 'workflow', selector: { workflowType: 'expr_flow' } }],
      outputSchema: { type: 'object' },
    }],
  });
}

test('G1/G2: semantic input ordering and authoring location do not change package identity', () => {
  const first = compileFixture(raw('normal')).manifest;
  const second = compileFixture(raw('reverse')).manifest;
  assert.equal(first.packageId, second.packageId);
  assert.equal(first.targetProfileId, 'node-test@1');
  assert.deepEqual(first.requiredCapabilities, [...first.requiredCapabilities].sort());
  assertCompiledPackageManifest(first);
});

test('G1/G2: missing required target capability fails compilation', () => {
  assert.throws(
    () => compileDomainPackage({ raw: raw(), domainVersion: '2.0.0-test', target: target([CAPS.hash, CAPS.module, CAPS.expression]) }),
    (error: unknown) => error instanceof MissingTargetCapabilityError && error.missing.includes(CAPS.script),
  );
});

test('compiled workflow IR contains domain-message effect and strips raw TypeScript source', () => {
  const manifest = compileFixture().manifest;
  const definition = manifest.workflows.expr_flow?.definition;
  assert.ok(definition);
  const serialized = JSON.stringify(definition);
  assert.match(serialized, /"kind":"domain-message"/u);
  assert.match(serialized, /"messageType":"CHANGED"/u);
  const scriptDefinition = JSON.stringify(manifest.workflows.script_flow?.definition);
  assert.match(scriptDefinition, /"sourceDigest":"[a-f0-9]{64}"/u);
  assert.doesNotMatch(scriptDefinition, /raw-script-secret-marker/u);
});

test('compiler emits projection and message contracts without treating schema field names as runtime secrets', () => {
  const manifest = compileFixture().manifest;
  assert.equal(manifest.projections.overview?.projectionId, 'overview');
  assert.equal(manifest.workflows.expr_flow?.messageContracts.ADVANCE?.type, 'ADVANCE');
  assert.doesNotThrow(() => assertCompiledPackageManifest(manifest));
});

test('runtime-only endpoint/credential material in executable config fails closed', () => {
  assert.throws(
    () => compileDomainPackage({
      raw: raw(),
      domainVersion: '2.0.0-test',
      target: target(),
      tools: [{
        toolId: 'unsafe',
        outputSchema: { type: 'object' },
        effect: 'none',
        executionKind: 'remote-http-json',
        requiredCapabilities: [CAPS.http],
        config: { endpoint: 'https://example.invalid', token: 'super-secret' },
      }],
    }),
    (error: unknown) => error instanceof CompiledManifestValidationError && error.issues.some((issue) => issue.includes('runtime-only')),
  );
});

test('corrupt packageId and inconsistent descriptor keys fail manifest validation', () => {
  const manifest = compileFixture().manifest;
  const corruptId = structuredClone(manifest);
  corruptId.packageId = '0'.repeat(64);
  assert.throws(() => assertCompiledPackageManifest(corruptId), CompiledManifestValidationError);

  const corruptKey = structuredClone(manifest);
  const descriptor = corruptKey.workflows.expr_flow;
  assert.ok(descriptor);
  corruptKey.workflows = { wrong_key: descriptor };
  assert.throws(() => assertCompiledPackageManifest(corruptKey), CompiledManifestValidationError);
});

test('generated target module contains only compiled manifest and static binding imports', () => {
  const manifest = compileFixture().manifest;
  const bindingModules = Object.fromEntries(
    Object.keys(manifest.bindingDigests).map((bindingId, index) => [bindingId, { moduleSpecifier: `./bindings/b${index}.js`, exportName: 'binding' }]),
  );
  const source = emitTargetCompiledPackageModule({ manifest, bindingModules });
  assert.match(source, /Generated by @kaicreator\/domain-harness-compiler/u);
  assert.doesNotMatch(source, /raw-script-secret-marker/u);
  assert.doesNotMatch(source, /\.ya?ml/u);
  assert.doesNotMatch(source, /https:\/\//u);
  assert.match(source, new RegExp(manifest.packageId, 'u'));
});

test('migrated build-time loader discovers and validates legacy YAML without exposing it to runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'domain-harness-t002-'));
  await mkdir(join(root, 'workflows'), { recursive: true });
  await writeFile(join(root, 'harness.yaml'), [
    'schemaVersion: "0.1"',
    'id: loaded-domain',
    'limits:',
    '  maxSteps: 12',
    '',
  ].join('\n'));
  await writeFile(join(root, 'workflows', 'basic.yaml'), [
    'initial: calculate',
    'output: "$.result"',
    'states:',
    '  calculate:',
    '    invoke:',
    '      expr: "$.value * 2"',
    '    on:',
    '      done:',
    '        target: completed',
    '  completed:',
    '    final: true',
    '',
  ].join('\n'));
  const loaded = await loadRawDomainPackage({ root });
  assert.equal(loaded.domainId, 'loaded-domain');
  assert.equal(loaded.workflows.size, 1);
  const result = compileDomainPackage({ raw: loaded, domainVersion: '2.0.0-test', target: target([CAPS.hash, CAPS.module, CAPS.expression]) });
  assert.equal(result.manifest.domainId, 'loaded-domain');
  assert.doesNotMatch(JSON.stringify(result.manifest), /harness\.yaml|basic\.yaml/u);
});
