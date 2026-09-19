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
  RawToolDefinition,
  RawWorkflow,
  TargetHostProfile,
} from '../../packages/domain-harness-compiler/src/raw/types.js';
import {
  assertCompiledPackageManifest,
  CompiledManifestValidationError,
  MissingBindingContentError,
} from '../../packages/domain-harness-compiler/src/package/manifest.js';
import { emitTargetCompiledPackageModule } from '../../packages/domain-harness-compiler/src/package/module-emitter.js';
import type { TargetCompiledDomainPackage } from '../../packages/domain-harness/src/v2/index.js';
import { decodeCompiledWorkflowDefinition } from '../../packages/domain-harness/src/runtime/compiled-workflow-ir.js';
import { translateV01ScriptInvokes } from '../../packages/domain-harness-compiler/src/compat/v01-script/index.js';

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


const BINDING_CONTENTS: Readonly<Record<string, string>> = {
  '@host/hash': 'export default function hash(data) { return digest(data); }\n',
  '@host/module': 'export default function loadModule(ref) { return import(ref); }\n',
  '@host/expression': 'export default function evaluate(expression, input) { return jsonata(expression).evaluate(input); }\n',
  '@host/script': 'export default function executeScript() { return 1; }\n',
  '@host/http': 'export default function request(resource, payload) { return transport(resource, payload); }\n',
};

function bindingModulesFor(manifest: { bindingDigests: Readonly<Record<string, string>> }, contents: Readonly<Record<string, string>> = BINDING_CONTENTS) {
  return Object.fromEntries(
    Object.keys(manifest.bindingDigests)
      .sort()
      .map((bindingId, index) => [bindingId, { moduleSpecifier: `./bindings/b${index}.js`, exportName: 'binding', content: contents[bindingId] ?? '' }]),
  );
}

function workflow(id: string, kind: 'expr' | 'script' | 'workflow'): RawWorkflow {
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
          : kind === 'script'
            ? { kind: 'script', ref: `scripts/${id}.ts`, scriptSource: 'export default () => "raw-script-secret-marker";' }
            : { kind: 'workflow', ref: `${id}_child` },
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
    ['expr_flow_b', workflow('expr_flow_b', 'expr')],
  ];
  if (order === 'reverse') entries.reverse();
  return {
    root: order === 'normal' ? '/tmp/a' : '/other/location',
    schemaVersion: '0.1',
    domainId: 'fixture-domain',
    limits: { maxSteps: 50 },
    workflows: new Map(entries),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(entries.map(([id]) => [id, []])),
  };
}

function rawScriptPackage(): LoadedRawDomainPackage {
  return {
    root: '/tmp/script',
    schemaVersion: '0.1',
    domainId: 'fixture-domain',
    limits: { maxSteps: 50 },
    workflows: new Map([['script_flow', workflow('script_flow', 'script')]]),
    skills: new Map(),
    scripts: new Map([['scripts/script_flow.ts', 'export default () => "raw-script-secret-marker";']]),
    schemas: new Map(),
    childDependencies: new Map([['script_flow', []]]),
  };
}

function rawChildWorkflowPackage(): LoadedRawDomainPackage {
  return {
    root: '/tmp/child',
    schemaVersion: '0.1',
    domainId: 'fixture-domain',
    limits: { maxSteps: 50 },
    workflows: new Map([['parent_flow', workflow('parent_flow', 'workflow')]]),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map([['parent_flow', ['parent_flow_child']]]),
  };
}

function compileFixture(
  rawInput = raw(),
  bindingContents: Readonly<Record<string, string>> = BINDING_CONTENTS,
  targetProfile: TargetHostProfile = target(),
) {
  return compileDomainPackage({
    raw: rawInput,
    domainVersion: '2.0.0-test',
    target: targetProfile,
    bindingContents,
    tools: [{
      toolId: 'remoteLookup',
      inputSchema: {
        type: 'object',
        properties: {
          endpoint: { type: 'string' },
          token: { type: 'string' },
          apiKey: { type: 'string' },
          password: { type: 'string' },
        },
      },
      outputSchema: { type: 'object' },
      effect: 'idempotent',
      executionKind: 'remote-http-json@1',
      requiredCapabilities: [CAPS.http],
      config: {
        transport: 'http-transport@1',
        resourceKey: 'remoteLookupService',
        path: '/v1/lookup',
        method: 'POST',
      },
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
  assert.deepEqual(first.bindingDigests, second.bindingDigests);
  assert.equal(first.targetProfileId, 'node-test@1');
  assert.deepEqual(first.requiredCapabilities, [...first.requiredCapabilities].sort());
  assertCompiledPackageManifest(first);
});

test('G1/G2: missing required target capability fails compilation', () => {
  assert.throws(
    () => compileFixture(raw(), BINDING_CONTENTS, target([CAPS.hash, CAPS.module, CAPS.expression])),
    (error: unknown) => error instanceof MissingTargetCapabilityError && error.missing.includes(CAPS.http),
  );
});

test('binding digest is content-addressed: unchanged binding content keeps identical digests and packageId', () => {
  const first = compileFixture().manifest;
  const relocatedRoot = compileFixture(raw('reverse')).manifest;
  assert.deepEqual(first.bindingDigests, relocatedRoot.bindingDigests);
  assert.equal(first.packageId, relocatedRoot.packageId);

  const sameContentCopied: Record<string, string> = {};
  for (const [bindingId, content] of Object.entries(BINDING_CONTENTS)) sameContentCopied[bindingId] = `${content}`;
  const copied = compileFixture(raw(), sameContentCopied).manifest;
  assert.deepEqual(copied.bindingDigests, first.bindingDigests);
  assert.equal(copied.packageId, first.packageId);
});

test('binding digest is content-addressed: changed executable binding content changes digest and packageId', () => {
  const before = compileFixture().manifest;
  const mutatedContents: Record<string, string> = {
    ...BINDING_CONTENTS,
    '@host/http': 'export default function http(request) { return request; } // v2\n',
  };
  const after = compileFixture(raw(), mutatedContents).manifest;

  assert.notEqual(after.bindingDigests['@host/http'], before.bindingDigests['@host/http']);
  assert.equal(after.bindingDigests['@host/hash'], before.bindingDigests['@host/hash']);
  assert.equal(after.bindingDigests['@host/expression'], before.bindingDigests['@host/expression']);
  assert.notEqual(after.packageId, before.packageId);
  assert.notDeepEqual(after.bindingDigests, before.bindingDigests);
});

test('binding content location is not identity: same bytes at different module paths keep digest and packageId stable', () => {
  const manifest = compileFixture().manifest;

  const nearPath = emitTargetCompiledPackageModule({
    manifest,
    bindingModules: bindingModulesFor(manifest),
  });
  const farPath = emitTargetCompiledPackageModule({
    manifest,
    bindingModules: Object.fromEntries(
      Object.entries(bindingModulesFor(manifest))
        .map(([bindingId, reference]) => [bindingId, { ...reference, moduleSpecifier: `../../generated/elsewhere/${reference.moduleSpecifier.slice('./bindings/'.length)}` }]),
    ),
  });

  const extractManifestJson = /export const manifest = Object\.freeze\(([\s\S]*?)\);\nexport const bindings/u;
  const nearManifest = JSON.parse(extractManifestJson.exec(nearPath)?.[1] ?? 'null') as { packageId: string; bindingDigests: Record<string, string> };
  const farManifest = JSON.parse(extractManifestJson.exec(farPath)?.[1] ?? 'null') as { packageId: string; bindingDigests: Record<string, string> };
  assert.equal(nearManifest.packageId, manifest.packageId);
  assert.deepEqual(nearManifest.bindingDigests, manifest.bindingDigests);
  assert.equal(farManifest.packageId, manifest.packageId);
  assert.deepEqual(farManifest.bindingDigests, manifest.bindingDigests);
  assert.notEqual(nearPath, farPath);
});

test('emitter fails closed when binding module content does not match manifest binding digest', () => {
  const manifest = compileFixture().manifest;
  const tamperedModules = bindingModulesFor(manifest, {
    ...BINDING_CONTENTS,
    '@host/expression': 'export default function expression() { return 2; } // tampered\n',
  });
  assert.throws(
    () => emitTargetCompiledPackageModule({ manifest, bindingModules: tamperedModules }),
    (error: unknown) => error instanceof Error
      && error.message.includes('@host/expression')
      && error.message.includes('does not match'),
  );

  const emptyContentModules = bindingModulesFor(manifest, { ...BINDING_CONTENTS, '@host/http': '' });
  assert.throws(
    () => emitTargetCompiledPackageModule({ manifest, bindingModules: emptyContentModules }),
    (error: unknown) => error instanceof Error && error.message.includes('@host/http'),
  );

  assert.doesNotThrow(() => emitTargetCompiledPackageModule({ manifest, bindingModules: bindingModulesFor(manifest) }));
});

test('compilation fails closed when a required binding has no immutable content identity', () => {
  const { '@host/http': _omitted, ...withoutHttp } = BINDING_CONTENTS;
  assert.throws(
    () => compileFixture(raw(), withoutHttp),
    (error: unknown) => error instanceof MissingBindingContentError && error.missing.includes('@host/http'),
  );

  const emptyHttp: Record<string, string> = { ...BINDING_CONTENTS, '@host/http': '' };
  assert.throws(
    () => compileFixture(raw(), emptyHttp),
    (error: unknown) => error instanceof MissingBindingContentError && error.missing.includes('@host/http'),
  );
});

test('compiled workflow IR contains domain-message effect and never raw TypeScript source', () => {
  const manifest = compileFixture().manifest;
  const definition = manifest.workflows.expr_flow?.definition;
  assert.ok(definition);
  const serialized = JSON.stringify(definition);
  assert.match(serialized, /"kind":"domain-message"/u);
  assert.match(serialized, /"messageType":"CHANGED"/u);
  assert.doesNotMatch(serialized, /raw-script-secret-marker/u);
});

test('public compile path fails closed on invoke kinds the Runtime cannot execute (#167)', () => {
  assert.throws(
    () => compileFixture(rawScriptPackage()),
    /translateV01ScriptInvokes/u,
    'legacy script invoke must fail closed with an actionable T-021 migration pointer',
  );
  assert.throws(
    () => compileFixture(rawChildWorkflowPackage()),
    /durable Domain Message effects/u,
    'child workflow invoke must fail closed pointing at the durable message model',
  );
});

test('T-021 translation produces executable tool IR through the public compile path (#167)', () => {
  const translation = translateV01ScriptInvokes(rawScriptPackage(), {
    target: 'node',
    targetProfile: target(),
  });
  assert.equal(translation.tools.length, 1);
  const migratedState = translation.raw.workflows.get('script_flow')?.states.execute;
  assert.equal(migratedState?.invoke?.kind, 'tool');

  const { manifest } = compileDomainPackage({
    raw: translation.raw,
    domainVersion: '2.0.0-test',
    target: target(),
    bindingContents: BINDING_CONTENTS,
    tools: [],
  });
  const serialized = JSON.stringify(manifest.workflows.script_flow?.definition);
  assert.doesNotMatch(serialized, /"kind":"script"/u);
  assert.match(serialized, /"kind":"tool"/u);
  assert.doesNotMatch(serialized, /raw-script-secret-marker/u);
  const decoded = decodeCompiledWorkflowDefinition(
    'script_flow',
    manifest.workflows.script_flow?.definition,
  );
  assert.equal(decoded.initial, 'execute');
});

test('compiler rejects dangling routes, invalid JSONata and non-positive maxSteps at build time (#167/#168)', () => {
  const dangling: LoadedRawDomainPackage = {
    ...raw(),
    workflows: new Map([['expr_flow', {
      ...workflow('expr_flow', 'expr'),
      states: {
        ...workflow('expr_flow', 'expr').states,
        execute: {
          ...workflow('expr_flow', 'expr').states.execute!,
          done: [{ target: 'nowhere' }],
        },
      },
    }]]),
  };
  assert.throws(() => compileFixture(dangling), /unknown state 'nowhere'/u);

  const badExpression: LoadedRawDomainPackage = {
    ...raw(),
    workflows: new Map([['expr_flow', {
      ...workflow('expr_flow', 'expr'),
      states: {
        ...workflow('expr_flow', 'expr').states,
        execute: {
          ...workflow('expr_flow', 'expr').states.execute!,
          invoke: { kind: 'expr', expression: '$.value *' },
        },
      },
    }]]),
  };
  assert.throws(() => compileFixture(badExpression), /not valid JSONata/u);

  assert.throws(
    () => compileFixture({ ...raw(), limits: { maxSteps: 0 } }),
    /maxSteps must be a positive safe integer/u,
  );
});

test('every compiled workflow decodes through the authoritative runtime IR decoder (#168)', () => {
  const { manifest } = compileFixture();
  for (const [workflowId, workflowDescriptor] of Object.entries(manifest.workflows)) {
    const decoded = decodeCompiledWorkflowDefinition(workflowId, workflowDescriptor.definition);
    assert.equal(decoded.initial, 'execute');
    assert.ok(Object.keys(decoded.states).length >= 4);
    assert.equal(decoded.limits?.maxSteps, 50);
  }
});

test('compiler emits projection and message contracts without treating schema field names as runtime secrets', () => {
  const manifest = compileFixture().manifest;
  assert.equal(manifest.projections.overview?.projectionId, 'overview');
  assert.equal(manifest.workflows.expr_flow?.messageContracts.ADVANCE?.type, 'ADVANCE');
  assert.ok(manifest.tools.remoteLookup?.inputSchema?.properties?.token);
  assert.ok(manifest.tools.remoteLookup?.inputSchema?.properties?.apiKey);
  assert.ok(manifest.tools.remoteLookup?.inputSchema?.properties?.password);
  assert.doesNotThrow(() => assertCompiledPackageManifest(manifest));
});

const RUNTIME_VALUED_CONFIG_ALIASES = [
  'apiKey',
  'authorization',
  'token',
  'credential',
  'secret',
  'baseUrl',
  'endpoint',
  'session',
  'cookie',
  'databaseHandle',
  'databasePath',
  'connection',
  'connectionString',
  'hostHandle',
  'runtimeHandle',
] as const;

function toolWithConfig(toolId: string, config: unknown): RawToolDefinition {
  return {
    toolId,
    outputSchema: { type: 'object' },
    effect: 'none',
    executionKind: 'remote-http-json@1',
    requiredCapabilities: [CAPS.http],
    config: config as RawToolDefinition['config'],
  };
}

function manifestForTool(tool: RawToolDefinition) {
  return compileDomainPackage({
    raw: raw(),
    domainVersion: '2.0.0-test',
    target: target(),
    bindingContents: BINDING_CONTENTS,
    tools: [tool],
  }).manifest;
}

test('executable Tool config is fail-closed: runtime-valued fields are rejected regardless of key name', () => {
  for (const alias of RUNTIME_VALUED_CONFIG_ALIASES) {
    assert.throws(
      () => manifestForTool(toolWithConfig('probe', { [alias]: 'runtime-only-value' })),
      (error: unknown) => error instanceof Error && error.message.includes('closed logical binding'),
      `config { ${alias}: ... } must fail compilation`,
    );
  }
});

test('executable Tool config is closed: arbitrary unknown fields cannot smuggle runtime values', () => {
  const arbitrarySmuggling: ReadonlyArray<readonly [string, unknown]> = [
    ['unknown alias carrying a runtime value', { mySpecialProductionConnection: 'postgres://user:secret@db.internal:5432/prod' }],
    ['unknown nested container', { settings: { token: 'bearer-secret' } }],
    ['extra field beside a valid reference', { resourceKey: 'remoteLookupService', extra: 'https://example.invalid' }],
    ['raw scalar config', 'postgres://user:secret@db.internal/prod'],
    ['array config', ['https://example.invalid', 'secret-token']],
    ['null config', null],
  ];
  for (const [label, config] of arbitrarySmuggling) {
    assert.throws(
      () => manifestForTool(toolWithConfig('probe', config)),
      (error: unknown) => error instanceof Error && error.message.includes('closed logical binding'),
      `${label} must fail compilation`,
    );
  }
});

test('resourceKey accepts logical identifiers only, never runtime values', () => {
  const runtimeValues = [
    'postgres://user:secret@db.internal:5432/prod',
    'https://api.internal',
    'user:password@host',
    'op://vault/production/secret',
    '',
  ];
  for (const runtimeValue of runtimeValues) {
    assert.throws(
      () => manifestForTool(toolWithConfig('probe', { resourceKey: runtimeValue })),
      (error: unknown) => error instanceof Error && error.message.includes('resourceKey'),
      `resourceKey '${runtimeValue}' must fail compilation`,
    );
  }
});

test('legitimate logical runtime-resource references stay compilable', () => {
  const remote = manifestForTool(toolWithConfig('probe', {
    transport: 'http-transport@1',
    resourceKey: 'remote.echo.service',
    path: '/v1/echo',
    method: 'POST',
  }));
  assert.deepEqual(remote.tools.probe?.execution.config, {
    transport: 'http-transport@1',
    resourceKey: 'remote.echo.service',
    path: '/v1/echo',
    method: 'POST',
  });
  assert.doesNotThrow(() => assertCompiledPackageManifest(remote));

  const referenced = manifestForTool(toolWithConfig('probe', { resourceKey: 'remoteLookupService' }));
  assert.deepEqual(referenced.tools.probe?.execution.config, { resourceKey: 'remoteLookupService' });
  assert.doesNotThrow(() => assertCompiledPackageManifest(referenced));

  const emptyConfig = manifestForTool(toolWithConfig('probe', {}));
  assert.deepEqual(emptyConfig.tools.probe?.execution.config, {});
  assert.doesNotThrow(() => assertCompiledPackageManifest(emptyConfig));
});

test('logical config fields reject runtime-valued shapes per field', () => {
  const runtimeShaped: ReadonlyArray<readonly [string, unknown]> = [
    ['absolute URL as path', { path: 'https://forbidden.example/v1/echo' }],
    ['protocol-relative URL as path', { path: '//evil.example/v1/echo' }],
    ['endpoint as transport', { transport: 'https://api.internal' }],
    ['unsupported logical method', { method: 'GET' }],
    ['credential value as transport', { transport: 'postgres://user:secret@db' }],
  ];
  for (const [label, override] of runtimeShaped) {
    assert.throws(
      () => manifestForTool(toolWithConfig('probe', { resourceKey: 'remoteLookupService', ...override as object })),
      (error: unknown) => error instanceof Error && error.message.includes('closed logical binding'),
      `${label} must fail compilation`,
    );
  }
});

test('manifest validation fails closed on non-closed execution config injected after compilation', () => {
  const manifest = compileFixture().manifest;
  const smuggled = structuredClone(manifest);
  const tool = smuggled.tools.remoteLookup;
  assert.ok(tool);
  tool.execution.config = { apiKey: 'injected-secret' } as unknown as typeof tool.execution.config;
  assert.throws(
    () => assertCompiledPackageManifest(smuggled),
    (error: unknown) => error instanceof CompiledManifestValidationError
      && error.issues.some((issue) => issue.includes('closed logical binding') && issue.includes('apiKey')),
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
  const source = emitTargetCompiledPackageModule({ manifest, bindingModules: bindingModulesFor(manifest) });
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
    '  failed:',
    '    final: true',
    '',
  ].join('\n'));
  const loaded = await loadRawDomainPackage({ root });
  assert.equal(loaded.domainId, 'loaded-domain');
  assert.equal(loaded.workflows.size, 1);
  const result = compileDomainPackage({
    raw: loaded,
    domainVersion: '2.0.0-test',
    target: target([CAPS.hash, CAPS.module, CAPS.expression]),
    bindingContents: BINDING_CONTENTS,
  });
  assert.equal(result.manifest.domainId, 'loaded-domain');
  assert.doesNotMatch(JSON.stringify(result.manifest), /harness\.yaml|basic\.yaml/u);
});

test('compiled manifest is assignable to the authoritative core package contract without casts (#164)', () => {
  const { manifest } = compileFixture();
  // Type-level proof, evaluated by the TS compiler at test-typecheck time:
  // the compiler's emitted manifest IS the core frozen artifact contract -
  // producer and Runtime consumer share one source of truth, no adapter cast.
  const compiledPackage: TargetCompiledDomainPackage = { manifest, bindings: {} };
  assert.equal(compiledPackage.manifest.executionEngineMajor, 2);
  assert.equal(compiledPackage.manifest.packageId, manifest.packageId);
});
