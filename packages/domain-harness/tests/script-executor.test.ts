import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  ScriptExecutor,
  ScriptExecutorError,
} from '../src/script/index.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executor = new ScriptExecutor();

function options(overrides: Partial<Parameters<ScriptExecutor['execute']>[2]> = {}) {
  return {
    harnessRoot: packageRoot,
    ...overrides,
  };
}

test('executes default async Script module with JSON input/output', async () => {
  assert.deepEqual(
    await executor.execute('tests/fixtures/scripts/echo.mjs', { value: 21 }, options()),
    { value: 42 },
  );
});

test('each invocation uses a fresh Worker/module instance', async () => {
  assert.deepEqual(
    await executor.execute('tests/fixtures/scripts/fresh.mjs', {}, options()),
    { calls: 1 },
  );
  assert.deepEqual(
    await executor.execute('tests/fixtures/scripts/fresh.mjs', {}, options()),
    { calls: 1 },
  );
});

test('path traversal is rejected before execution', async () => {
  await assert.rejects(
    executor.execute('../outside.mjs', {}, options()),
    (error: unknown) =>
      error instanceof ScriptExecutorError &&
      error.code === 'script_error' &&
      /escapes Harness root/.test(error.message),
  );
});

test('non-JSON Script results are rejected', async () => {
  await assert.rejects(
    executor.execute('tests/fixtures/scripts/bad-output.mjs', {}, options()),
    (error: unknown) => error instanceof ScriptExecutorError && error.code === 'script_error',
  );
});

test('hard timeout terminates a busy Worker', async () => {
  await assert.rejects(
    executor.execute('tests/fixtures/scripts/hang.mjs', {}, options({ timeoutMs: 50 })),
    (error: unknown) => error instanceof ScriptExecutorError && error.code === 'timeout',
  );
});

test('pre-aborted signal maps to cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    executor.execute('tests/fixtures/scripts/echo.mjs', {}, options({ signal: controller.signal })),
    (error: unknown) => error instanceof ScriptExecutorError && error.code === 'cancelled',
  );
});
