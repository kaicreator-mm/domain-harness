import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { translateV01ScriptInvokes, V01ScriptTranslationError } from '../../../packages/domain-harness-compiler/dist/compat/v01-script/index.js';
import { bundleScriptTool } from '../../../packages/domain-harness-compiler/dist/script/script-bundle.js';
import { ScriptExecutor as V01ScriptExecutor } from '../../../packages/domain-harness/dist/script/script-executor.js';
import { NodeScriptExecutor as V02NodeScriptExecutor } from '../../../packages/domain-harness-node/dist/script/script-executor.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, 'fixtures');
const REFERENCE = JSON.parse(await readFile(join(FIXTURE_ROOT, 'reference.json'), 'utf8'));
const SCRIPT_SOURCE = await readFile(join(FIXTURE_ROOT, REFERENCE.scriptRef), 'utf8');
const TARGET_PROFILE = Object.freeze({
  id: 'node-g32-script-migration@1',
  capabilities: ['script-execution@1'],
  bindings: { 'script-execution@1': 'node-worker-module@1' },
});

function rawPackage(root = FIXTURE_ROOT, source = SCRIPT_SOURCE) {
  const scriptInvoke = {
    kind: 'script',
    ref: REFERENCE.scriptRef,
    scriptSource: source,
    timeoutMs: 2_000,
  };
  return {
    root,
    schemaVersion: '0.1',
    domainId: 'migration-script-reference',
    limits: { maxSteps: 32 },
    workflows: new Map([[REFERENCE.workflowId, {
      id: REFERENCE.workflowId,
      sourcePath: join(root, 'workflows', 'reference.yaml'),
      initial: REFERENCE.stateId,
      states: {
        [REFERENCE.stateId]: {
          id: REFERENCE.stateId,
          final: false,
          invoke: scriptInvoke,
          done: [{ target: REFERENCE.doneTarget }],
          error: [{ target: 'failed' }],
          events: {},
        },
        [REFERENCE.doneTarget]: {
          id: REFERENCE.doneTarget,
          final: true,
          done: [],
          error: [],
          events: {},
        },
        failed: {
          id: 'failed',
          final: true,
          done: [],
          error: [],
          events: {},
        },
      },
    }]]),
    skills: new Map(),
    scripts: new Map([[REFERENCE.scriptRef, source]]),
    schemas: new Map(),
    childDependencies: new Map(),
  };
}

function translate(raw = rawPackage()) {
  return translateV01ScriptInvokes(raw, {
    target: 'node',
    targetProfile: TARGET_PROFILE,
  });
}

const passthroughJavascriptBundler = {
  bundle(request) {
    assert.equal(request.target, 'node');
    assert.equal(request.language, 'javascript');
    assert.equal(request.format, 'esm');
    assert.equal(request.ecmaTarget, 'es2022');
    assert.equal(request.bundle, true);
    return {
      code: request.source,
      language: 'javascript',
      bundled: true,
      exports: ['default'],
    };
  },
};

test('G32/AC-44: frozen v0.1 Script and generated v0.2 Script Domain Tool have equivalent outputs/transitions', async () => {
  const translation = translate();
  assert.equal(translation.scripts.length, 1);
  assert.equal(translation.tools.length, 1);

  const migrated = translation.scripts[0];
  const migratedState = translation.raw.workflows.get(REFERENCE.workflowId).states[REFERENCE.stateId];
  assert.equal(migratedState.invoke.kind, 'tool');
  assert.equal(migratedState.invoke.ref, migrated.toolId);
  assert.equal(migratedState.invoke.timeoutMs, 2_000);
  assert.deepEqual(migratedState.done, [{ target: REFERENCE.doneTarget }]);
  assert.equal(migrated.tool.execution.kind, 'script');
  assert.equal(migrated.tool.execution.bindingId, migrated.bindingId);
  assert.equal(migrated.tool.effect, 'idempotent');
  assert.deepEqual(migrated.tool.requiredCapabilities, ['script-execution@1']);

  const artifact = await bundleScriptTool(migrated.bundleRequest, passthroughJavascriptBundler);
  assert.equal(artifact.binding.kind, 'script');
  assert.equal(artifact.binding.bindingId, migrated.bindingId);
  assert.match(artifact.moduleId, /\.node\.mjs$/);
  assert.equal(artifact.requiredCapability, 'script-execution@1');

  const temp = await mkdtemp(join(tmpdir(), 'domain-harness-g32-'));
  try {
    const compiledModulePath = join(temp, 'score-band.node.mjs');
    await writeFile(compiledModulePath, artifact.moduleSource, 'utf8');
    const v01 = new V01ScriptExecutor();
    const v02 = new V02NodeScriptExecutor({
      [migrated.bindingId]: {
        moduleUrl: pathToFileURL(compiledModulePath).href,
        exportName: artifact.binding.config.exportName,
      },
    }, { timeoutMs: 2_000 });

    for (const referenceCase of REFERENCE.cases) {
      const legacyOutput = await v01.executeSource(SCRIPT_SOURCE, referenceCase.input, { timeoutMs: 2_000 });
      const migratedOutput = await v02.execute({
        binding: migrated.tool.execution,
        input: referenceCase.input,
      });

      assert.deepEqual(legacyOutput, referenceCase.expectedOutput, `${referenceCase.name}: frozen v0.1 output`);
      assert.deepEqual(migratedOutput, referenceCase.expectedOutput, `${referenceCase.name}: v0.2 output`);
      assert.deepEqual(migratedOutput, legacyOutput, `${referenceCase.name}: output equivalence`);
      assert.equal(migratedState.done[0].target, REFERENCE.doneTarget, `${referenceCase.name}: done transition equivalence`);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('translation identity is deterministic, relocation-stable, and content-addressed', () => {
  const first = translate();
  const second = translate();
  const relocated = translate(rawPackage(resolve(FIXTURE_ROOT, '..', 'relocated-fixture')));
  const changed = translate(rawPackage(FIXTURE_ROOT, `${SCRIPT_SOURCE}\n// content identity change\n`));

  assert.equal(first.scripts[0].toolId, second.scripts[0].toolId);
  assert.equal(first.scripts[0].bindingId, second.scripts[0].bindingId);
  assert.equal(first.scripts[0].toolId, relocated.scripts[0].toolId);
  assert.notEqual(first.scripts[0].toolId, changed.scripts[0].toolId);
  assert.equal(first.scripts[0].sourceDigest, second.scripts[0].sourceDigest);
  assert.notEqual(first.scripts[0].sourceDigest, changed.scripts[0].sourceDigest);
});

test('translation fails closed for unfrozen/mismatched source and missing target capability', () => {
  const unfrozen = rawPackage();
  unfrozen.workflows.get(REFERENCE.workflowId).states[REFERENCE.stateId].invoke.scriptSource = undefined;
  assert.throws(() => translate(unfrozen), V01ScriptTranslationError);

  const mismatched = rawPackage();
  mismatched.workflows.get(REFERENCE.workflowId).states[REFERENCE.stateId].invoke.scriptSource = `${SCRIPT_SOURCE}\n// drift\n`;
  assert.throws(() => translate(mismatched), V01ScriptTranslationError);

  assert.throws(
    () => translateV01ScriptInvokes(rawPackage(), {
      target: 'node',
      targetProfile: { id: 'missing-script', capabilities: [], bindings: {} },
    }),
    V01ScriptTranslationError,
  );
});
