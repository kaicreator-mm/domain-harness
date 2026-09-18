import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  makeConformanceAddress,
  makeConformanceInstance,
} from '../../../domain-harness/tests/helpers/runtime-store-conformance.ts';
import { makeTestStore } from './test-helpers.js';

interface ChildResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCrashChild(
  mode: string,
  databasePath: string,
  instanceKey: string,
  messageId: string,
): Promise<ChildResult> {
  const fixtureUrl = new URL('./fixtures/store-child.ts', import.meta.url);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(fixtureUrl), mode, databasePath, instanceKey, messageId],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

test('G5 committed acceptance is visible after immediate process termination', async (t) => {
  const { store, databasePath } = makeTestStore(t, 10_000);
  const target = makeConformanceAddress('crash-commit');
  await store.createInstance(makeConformanceInstance('crash-commit'));

  const result = await runCrashChild(
    'accept-crash',
    databasePath,
    'crash-commit',
    'committed-before-crash',
  );
  assert.equal(result.code, 137, result.stderr);

  const disposition = await store.getMessageDisposition(target, 'committed-before-crash');
  assert.equal(disposition?.disposition, 'accepted');
  assert.equal(disposition?.targetSequence, 1);
});

test('G5 SQLite rolls back an interrupted uncommitted accept-shaped transaction', async (t) => {
  const { store, databasePath } = makeTestStore(t, 10_000);
  const target = makeConformanceAddress('crash-rollback');
  await store.createInstance(makeConformanceInstance('crash-rollback'));

  const result = await runCrashChild(
    'uncommitted-crash',
    databasePath,
    'crash-rollback',
    'never-committed',
  );
  assert.equal(result.code, 137, result.stderr);
  assert.equal(await store.getMessageDisposition(target, 'never-committed'), null);

  const after = await store.acceptMessage({
    messageId: 'after-crash',
    target,
    type: 'after',
    payload: null,
  });
  assert.equal(after.targetSequence, 1);
});
