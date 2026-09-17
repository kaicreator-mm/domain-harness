import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ExpressionRuntime,
  ExpressionRuntimeError,
  assertExpressionPolicy,
} from '../src/expression/index.js';

const runtime = new ExpressionRuntime();
const clock = '2026-09-17T02:00:00.123Z';

test('policy rejects nondeterministic and dynamic-eval functions', () => {
  assert.throws(() => assertExpressionPolicy('$random()'), /\$random is forbidden/);
  assert.throws(() => assertExpressionPolicy('$eval("1 + 1")'), /\$eval is forbidden/);
});

test('deterministic clock returns persisted logical time', async () => {
  assert.equal(await runtime.evaluate('$now()', {}, clock), clock);
  assert.equal(await runtime.evaluate('$millis()', {}, clock), Date.parse(clock));
  assert.deepEqual(
    await runtime.evaluate('{"now": $now(), "millis": $millis()}', {}, clock),
    { now: clock, millis: Date.parse(clock) },
  );
});

test('same clock and input replay deterministically', async () => {
  const expression = '{"value": input.value * 2, "time": $millis()}';
  const scope = { input: { value: 21 } };
  assert.deepEqual(
    await runtime.evaluate(expression, scope, clock),
    await runtime.evaluate(expression, scope, clock),
  );
});

test('route evaluation requires strict boolean', async () => {
  assert.equal(await runtime.evaluateBoolean('input.ok = true', { input: { ok: true } }, clock), true);
  await assert.rejects(
    runtime.evaluateBoolean('"truthy"', {}, clock),
    (error: unknown) => error instanceof ExpressionRuntimeError && error.code === 'expression_error',
  );
});

test('abort maps to cancelled', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    runtime.evaluate('1', {}, clock, { signal: controller.signal }),
    (error: unknown) => error instanceof ExpressionRuntimeError && error.code === 'cancelled',
  );
});
