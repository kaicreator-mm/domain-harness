/** R60 W03：SDK 类型只从一份作者源生成，类型漂移在构建之前被确定性拒绝。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');
const sourceName = 'tooling/build/src/types.ts';
const targetName = 'packages/domain-harness/src/composition-types.ts';
const scriptName = 'scripts/generate-sdk-composition-types.mjs';

test('R60 W03: ABI change propagates automatically; stale, missing contract and forged public types refuse', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dh-r60-one-abi-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of [sourceName, scriptName]) {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    cpSync(join(repo, name), file);
  }
  const run = (...args: string[]) => spawnSync(process.execPath, [join(root, scriptName), ...args], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
  });
  const initial = run();
  assert.equal(initial.status, 0, initial.stderr);
  const original = readFileSync(join(root, sourceName), 'utf8');
  const publicCopy = join(root, targetName);
  assert.equal(readFileSync(publicCopy, 'utf8'), original);
  assert.equal(run('--check').status, 0);

  const oldField = 'readonly packages: readonly unknown[];';
  assert.ok(original.includes(oldField), 'the authored ABI source signature changed');
  const revised = original.replace(oldField, 'readonly packages: readonly string[];');
  writeFileSync(join(root, sourceName), revised);
  assert.notEqual(run('--check').status, 0, 'stale public declaration must fail closed');
  assert.equal(run().status, 0, 'one authored signature edit regenerates public .d.ts input');
  assert.equal(readFileSync(publicCopy, 'utf8'), revised);
  assert.equal(run('--check').status, 0);
  writeFileSync(publicCopy, revised.replace('readonly descriptor: unknown;', 'readonly descriptor: string;'));
  assert.notEqual(run('--check').status, 0, 'manual public ABI drift must be rejected');

  writeFileSync(join(root, sourceName), revised.replace('export interface BuildInput {', 'interface BuildInput {'));
  assert.notEqual(run().status, 0, 'non-exported mandatory ABI fails generator contract gate');
});
