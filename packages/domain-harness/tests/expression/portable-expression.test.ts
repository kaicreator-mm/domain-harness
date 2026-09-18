import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

import {
  ExpressionRuntime,
  ExpressionRuntimeError,
  ExpressionToolExecutor,
  assertExpressionPolicy,
} from '../../src/expression/index.js';

const clock = '2026-09-17T02:00:00.123Z';
const runtime = new ExpressionRuntime();

test('portable expression source has no Node built-in or Buffer dependency', async () => {
  const sourceDir = new URL('../../src/expression/', import.meta.url);
  const files = (await readdir(sourceDir)).filter((name) => name.endsWith('.ts'));
  for (const file of files) {
    const source = await readFile(new URL(file, sourceDir), 'utf8');
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()['"]node:/, file);
    assert.doesNotMatch(source, /\bBuffer\b/, file);
  }
});

test('policy rejects dynamic eval, randomness, and clock arguments', () => {
  assert.throws(() => assertExpressionPolicy('$eval("1+1")'), /\$eval is forbidden/);
  assert.throws(() => assertExpressionPolicy('$random()'), /\$random is forbidden/);
  assert.throws(() => assertExpressionPolicy('$now("[Y]")'), /arguments are not supported/);
  assert.throws(() => assertExpressionPolicy('$millis("ignored")'), /arguments are not supported/);
});

test('logical clock and replay are deterministic', async () => {
  const source = '{"value": input.value * 2, "now": $now(), "millis": $millis()}';
  const scope = { input: { value: 21 } };
  const first = await runtime.evaluate(source, scope, clock);
  const second = await runtime.evaluate(source, scope, clock);
  assert.deepEqual(first, {
    value: 42,
    now: clock,
    millis: Date.parse(clock),
  });
  assert.deepEqual(second, first);
});

test('portable JSON boundaries reject non-JSON input and output', async () => {
  await assert.rejects(
    runtime.evaluate('1', { bad: Number.NaN } as never, clock),
    (error: unknown) =>
      error instanceof ExpressionRuntimeError && /input must be a portable JSON value/.test(error.message),
  );
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  await assert.rejects(
    runtime.evaluate('1', cycle as never, clock),
    (error: unknown) =>
      error instanceof ExpressionRuntimeError && /input must be a portable JSON value/.test(error.message),
  );
  await assert.rejects(
    runtime.evaluate('missing.path', {}, clock),
    (error: unknown) =>
      error instanceof ExpressionRuntimeError && /result is not a portable JSON value/.test(error.message),
  );
});

test('UTF-8 byte limits apply without Buffer', async () => {
  await assert.rejects(
    runtime.evaluate('1', { text: '缅甸' }, clock, { maxInputBytes: 10 }),
    (error: unknown) =>
      error instanceof ExpressionRuntimeError && /maxInputBytes/.test(error.message),
  );
  await assert.rejects(
    runtime.evaluate('"缅甸"', {}, clock, { maxOutputBytes: 5 }),
    (error: unknown) =>
      error instanceof ExpressionRuntimeError && /maxOutputBytes/.test(error.message),
  );
});

test('compiled Expression Tool descriptor validates output schema', async () => {
  const executor = new ExpressionToolExecutor();
  const descriptor = {
    expression: '{"score": input.raw * 2}',
    outputSchema: {
      type: 'object',
      required: ['score'],
      additionalProperties: false,
      properties: { score: { type: 'number', minimum: 0 } },
    },
  };

  assert.deepEqual(await executor.execute(descriptor, { raw: 21 }, clock), { score: 42 });

  await assert.rejects(
    executor.execute(
      { ...descriptor, expression: '{"score": "wrong"}' },
      { raw: 21 },
      clock,
    ),
    (error: unknown) =>
      error instanceof ExpressionRuntimeError && /does not satisfy JSON Schema/.test(error.message),
  );
});

test('JSONata guardrail timeout maps to portable timeout error', async () => {
  const scope = { input: { items: Array.from({ length: 100000 }, (_, index) => index) } };
  await assert.rejects(
    runtime.evaluate('$reduce(input.items, function($acc, $v) { $acc & "x" })', scope, clock, {
      timeoutMs: 10,
      maxInputBytes: 2_000_000,
    }),
    (error: unknown) => error instanceof ExpressionRuntimeError && error.code === 'timeout',
  );
});
