import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import {
  SCRIPT_EXECUTION_CAPABILITY,
  ScriptCompileError,
  bundleScriptTool,
} from '../../../packages/domain-harness-compiler/dist/script/script-bundle.js';
import { ExpoScriptExecutor } from '../../../packages/domain-harness-expo/dist/script/script-executor.js';
import { NodeScriptExecutor } from '../../../packages/domain-harness-node/dist/script/script-executor.js';

const nodeProfile = {
  id: 'node-test',
  capabilities: [SCRIPT_EXECUTION_CAPABILITY],
  bindings: { [SCRIPT_EXECUTION_CAPABILITY]: 'node-worker-module@1' },
};
const expoProfile = {
  id: 'expo-hermes-test',
  capabilities: [SCRIPT_EXECUTION_CAPABILITY],
  bindings: { [SCRIPT_EXECUTION_CAPABILITY]: 'expo-static-module@1' },
};

const deterministicCode = `
export default async function execute(input) {
  return { doubled: input.value * 2, nested: [input.label, true, null] };
}
`;

function bundleResult(overrides = {}) {
  return {
    code: deterministicCode,
    language: 'javascript',
    bundled: true,
    exports: ['default'],
    externalImports: [],
    runtimeGlobals: [],
    ...overrides,
  };
}

test('build-time pipeline emits target artifact and keeps source outside runtime binding config', async () => {
  const seen = [];
  const engine = {
    bundle(request) {
      seen.push(request);
      return bundleResult();
    },
  };

  const nodeArtifact = await bundleScriptTool(
    {
      bindingId: 'pricing/calculate',
      sourcePath: 'tools/pricing.ts',
      source: 'export default (input: { value: number }) => ({ doubled: input.value * 2 });',
      language: 'typescript',
      target: 'node',
      targetProfile: nodeProfile,
    },
    engine,
  );
  const expoArtifact = await bundleScriptTool(
    {
      bindingId: 'pricing/calculate',
      sourcePath: 'tools/pricing.ts',
      source: 'export default (input: { value: number }) => ({ doubled: input.value * 2 });',
      language: 'typescript',
      target: 'expo',
      targetProfile: expoProfile,
    },
    engine,
  );

  assert.equal(seen.length, 2);
  assert.deepEqual(
    seen.map(({ target, bundle, format, ecmaTarget, hermesSafe }) => ({ target, bundle, format, ecmaTarget, hermesSafe })),
    [
      { target: 'node', bundle: true, format: 'esm', ecmaTarget: 'es2022', hermesSafe: false },
      { target: 'expo', bundle: true, format: 'esm', ecmaTarget: 'es2022', hermesSafe: true },
    ],
  );
  assert.equal(nodeArtifact.moduleId, 'scripts/pricing%2Fcalculate.node.mjs');
  assert.equal(expoArtifact.moduleId, 'scripts/pricing%2Fcalculate.expo.mjs');
  assert.equal(nodeArtifact.moduleSource, deterministicCode);
  assert.equal(expoArtifact.moduleSource, deterministicCode);
  assert.equal(nodeArtifact.binding.config.artifactFormat, 'target-compiled-script@1');
  assert.equal(expoArtifact.binding.config.target, 'expo');
  assert.equal('source' in nodeArtifact.binding.config, false);
  assert.equal('moduleSource' in nodeArtifact.binding.config, false);
});

test('compiler fails closed when script capability or target binding is missing', async () => {
  let called = false;
  const engine = {
    bundle() {
      called = true;
      return bundleResult();
    },
  };

  await assert.rejects(
    bundleScriptTool(
      {
        bindingId: 'calc',
        sourcePath: 'calc.ts',
        source: 'export default () => null',
        language: 'typescript',
        target: 'node',
        targetProfile: { id: 'missing', capabilities: [], bindings: {} },
      },
      engine,
    ),
    (error) => error instanceof ScriptCompileError && error.code === 'missing_capability',
  );
  assert.equal(called, false);

  await assert.rejects(
    bundleScriptTool(
      {
        bindingId: 'calc',
        sourcePath: 'calc.ts',
        source: 'export default () => null',
        language: 'typescript',
        target: 'node',
        targetProfile: { id: 'unbound', capabilities: [SCRIPT_EXECUTION_CAPABILITY], bindings: {} },
      },
      engine,
    ),
    (error) => error instanceof ScriptCompileError && error.code === 'missing_capability_binding',
  );
  assert.equal(called, false);
});

test('Expo compile rejects retained Node Worker dependencies and unsupported globals', async () => {
  await assert.rejects(
    bundleScriptTool(
      {
        bindingId: 'bad-worker',
        sourcePath: 'bad.ts',
        source: 'placeholder',
        language: 'typescript',
        target: 'expo',
        targetProfile: expoProfile,
      },
      { bundle: () => bundleResult({ externalImports: ['node:worker_threads'] }) },
    ),
    (error) => error instanceof ScriptCompileError && error.code === 'expo_incompatible_bundle',
  );

  await assert.rejects(
    bundleScriptTool(
      {
        bindingId: 'bad-buffer',
        sourcePath: 'bad.ts',
        source: 'placeholder',
        language: 'typescript',
        target: 'expo',
        targetProfile: expoProfile,
      },
      { bundle: () => bundleResult({ runtimeGlobals: ['Buffer'] }) },
    ),
    (error) => error instanceof ScriptCompileError && error.code === 'expo_incompatible_bundle',
  );
});

test('Node and Expo bindings produce equivalent JSON results from the same compiled fixture', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'domain-harness-t007-'));
  try {
    const modulePath = join(directory, 'deterministic.mjs');
    await writeFile(modulePath, deterministicCode, 'utf8');
    const moduleUrl = pathToFileURL(modulePath).href;
    const compiledModule = await import(moduleUrl);

    const binding = { kind: 'script', bindingId: 'deterministic' };
    const input = { value: 21, label: 'fixture' };
    const nodeExecutor = new NodeScriptExecutor({ deterministic: { moduleUrl } });
    const expoExecutor = new ExpoScriptExecutor({ deterministic: compiledModule.default });

    const [nodeResult, expoResult] = await Promise.all([
      nodeExecutor.execute({ binding, input }),
      expoExecutor.execute({ binding, input }),
    ]);

    assert.deepEqual(nodeResult, { doubled: 42, nested: ['fixture', true, null] });
    assert.deepEqual(expoResult, nodeResult);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('runtime bindings reject source/data execution and non-JSON outputs', async () => {
  const nodeExecutor = new NodeScriptExecutor({
    raw: { moduleUrl: 'data:text/javascript,export default () => ({ ok: true })' },
  });
  await assert.rejects(
    nodeExecutor.execute({ binding: { kind: 'script', bindingId: 'raw' }, input: null }),
    (error) => error?.code === 'invalid_binding' && /runtime source\/data URLs are forbidden/.test(error.message),
  );

  const directory = await mkdtemp(join(tmpdir(), 'domain-harness-t007-bad-'));
  try {
    const modulePath = join(directory, 'bad-output.mjs');
    await writeFile(modulePath, 'export default () => new Date(0);', 'utf8');
    const moduleUrl = pathToFileURL(modulePath).href;
    const compiledModule = await import(moduleUrl);
    const nodeBad = new NodeScriptExecutor({ bad: { moduleUrl } });
    const expoBad = new ExpoScriptExecutor({ bad: compiledModule.default });

    await assert.rejects(
      nodeBad.execute({ binding: { kind: 'script', bindingId: 'bad' }, input: { ok: true } }),
      (error) => error?.code === 'script_error',
    );
    await assert.rejects(
      expoBad.execute({ binding: { kind: 'script', bindingId: 'bad' }, input: { ok: true } }),
      (error) => error?.code === 'script_error',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Node binding enforces timeout without making timeout a portable Expo guarantee', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'domain-harness-t007-timeout-'));
  try {
    const modulePath = join(directory, 'hang.mjs');
    await writeFile(modulePath, 'export default async () => await new Promise((resolve) => setTimeout(resolve, 1000));', 'utf8');
    const moduleUrl = pathToFileURL(modulePath).href;
    const nodeExecutor = new NodeScriptExecutor({ hang: { moduleUrl } }, { timeoutMs: 50 });
    await assert.rejects(
      nodeExecutor.execute({ binding: { kind: 'script', bindingId: 'hang' }, input: null }),
      (error) => error?.code === 'timeout',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
