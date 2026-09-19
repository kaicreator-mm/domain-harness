import assert from 'node:assert/strict';
import { appendFile, cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createDomainHarness } from '../src/legacy-v1/index.js';
import { loadHarness } from '../src/loader/index.js';
import { HarnessDefinitionError } from '../src/loader/static-validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const basicFixture = join(here, 'fixtures', 'basic-harness');
const noopAi = { async execute() { return {}; } };

function hasDefinitionIssue(error: unknown, pattern: RegExp): boolean {
  return error instanceof HarnessDefinitionError && error.issues.some((issue) => pattern.test(issue));
}

test('definitionHash is stable when identical Harness assets move to another root', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-hash-relocation-'));
  try {
    const rootA = join(dir, 'a');
    const rootB = join(dir, 'different', 'b');
    await cp(basicFixture, rootA, { recursive: true });
    await cp(basicFixture, rootB, { recursive: true });

    const first = await loadHarness({ root: rootA, registeredTools: new Set() });
    const relocated = await loadHarness({ root: rootB, registeredTools: new Set() });
    assert.equal(first.definitionHash, relocated.definitionHash);

    const skill = relocated.skills.values().next().value;
    assert.ok(skill);
    await appendFile(join(skill.directory, 'SKILL.md'), '\nDefinition-changing content.\n', 'utf8');
    const changed = await loadHarness({ root: rootB, registeredTools: new Set() });
    assert.notEqual(first.definitionHash, changed.definitionHash);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Runtime executes Loader-frozen Script bytes even if the file changes afterwards', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-script-freeze-'));
  const root = join(dir, 'harness');
  try {
    await mkdir(join(root, 'workflows'), { recursive: true });
    await mkdir(join(root, 'scripts'), { recursive: true });
    await writeFile(
      join(root, 'harness.yaml'),
      'schemaVersion: "0.1"\nid: script-freeze\nlimits:\n  maxSteps: 10\n',
      'utf8',
    );
    await writeFile(
      join(root, 'workflows', 'main.yaml'),
      'initial: work\noutput: "steps.work"\nstates:\n  work:\n    invoke:\n      script: scripts/value.mjs\n    on:\n      done:\n        - target: ok\n  ok:\n    final: true\n  failed:\n    final: true\n',
      'utf8',
    );
    const scriptPath = join(root, 'scripts', 'value.mjs');
    await writeFile(scriptPath, 'export default async () => ({ version: 1 });\n', 'utf8');

    const frozenRuntime = await createDomainHarness({ root, sqlitePath: ':memory:', ai: noopAi });
    await writeFile(scriptPath, 'export default async () => ({ version: 2 });\n', 'utf8');

    const frozenStarted = await frozenRuntime.start({ workflowId: 'main', input: {} });
    const frozenResult = await frozenRuntime.wait(frozenStarted.runId, { timeoutMs: 2000 });
    assert.equal(frozenResult.status, 'completed');
    assert.deepEqual(frozenResult.output, { version: 1 });

    const reloadedRuntime = await createDomainHarness({ root, sqlitePath: ':memory:', ai: noopAi });
    const reloadedStarted = await reloadedRuntime.start({ workflowId: 'main', input: {} });
    const reloadedResult = await reloadedRuntime.wait(reloadedStarted.runId, { timeoutMs: 2000 });
    assert.equal(reloadedResult.status, 'completed');
    assert.deepEqual(reloadedResult.output, { version: 2 });
    assert.notEqual(frozenStarted.definitionHash, reloadedStarted.definitionHash);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Loader rejects a referenced Script whose real path escapes Harness root', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-loader-link-'));
  try {
    const root = join(dir, 'harness');
    const outside = join(dir, 'outside');
    await mkdir(join(root, 'workflows'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'script.mjs'), 'export default async () => ({ escaped: true });\n', 'utf8');
    await writeFile(
      join(root, 'harness.yaml'),
      'schemaVersion: "0.1"\nid: linked-script\nlimits:\n  maxSteps: 10\n',
      'utf8',
    );
    await writeFile(
      join(root, 'workflows', 'main.yaml'),
      'initial: work\nstates:\n  work:\n    invoke:\n      script: linked/script.mjs\n    on:\n      done:\n        - target: ok\n  ok:\n    final: true\n  failed:\n    final: true\n',
      'utf8',
    );

    try {
      await symlink(outside, join(root, 'linked'), 'junction');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('platform cannot create a junction/symlink for containment regression');
        return;
      }
      throw error;
    }

    await assert.rejects(
      () => loadHarness({ root, registeredTools: new Set() }),
      (error: unknown) => hasDefinitionIssue(error, /path escapes Harness root/),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Loader rejects Skill resources whose real path escapes the Skill directory', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-skill-link-'));
  try {
    const root = join(dir, 'harness');
    await cp(basicFixture, root, { recursive: true });
    const skillDir = join(root, 'skills', 'generate');
    const outsideRefs = join(dir, 'outside-refs');
    await mkdir(outsideRefs, { recursive: true });
    await writeFile(join(outsideRefs, 'example.md'), 'outside root content\n', 'utf8');
    await rm(join(skillDir, 'refs'), { recursive: true, force: true });

    try {
      await symlink(outsideRefs, join(skillDir, 'refs'), 'junction');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('platform cannot create a junction/symlink for containment regression');
        return;
      }
      throw error;
    }

    await assert.rejects(
      () => loadHarness({ root, registeredTools: new Set() }),
      (error: unknown) => hasDefinitionIssue(error, /path escapes Harness root/),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
