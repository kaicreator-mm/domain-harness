import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runMiniKernel,
  type MiniModelDecision,
  type MiniModelPort,
  type MiniTool,
} from './pi-mini-kernel.js';

type Final = { answer: string };
const isFinal = (value: unknown): value is Final =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { answer?: unknown }).answer === 'string';

function scriptedModel(
  script: Array<MiniModelDecision | Error | ((request: Parameters<MiniModelPort['next']>[0]) => MiniModelDecision)>,
): MiniModelPort & { calls: number } {
  return {
    calls: 0,
    async next(request) {
      const current = script[this.calls++];
      if (current instanceof Error) throw current;
      if (typeof current === 'function') return current(request);
      if (current === undefined) throw new Error('Unexpected model call');
      return current;
    },
  };
}

test('model -> tool -> model -> final', async () => {
  const model = scriptedModel([
    { kind: 'tool_calls', calls: [{ id: 'c1', name: 'lookup', args: { key: 'x' } }] },
    (request) => {
      assert.deepEqual(request.transcript.at(-1), {
        kind: 'observation',
        step: 1,
        toolCallId: 'c1',
        toolName: 'lookup',
        ok: true,
        value: 'value-x',
      });
      return { kind: 'final', value: { answer: 'value-x' } };
    },
  ]);
  const tool: MiniTool = {
    name: 'lookup',
    async execute() {
      return 'value-x';
    },
  };

  const result = await runMiniKernel({ input: { query: 'x' }, model, tools: [tool], maxSteps: 4, validateFinal: isFinal });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.status === 'completed' ? result.value : null, { answer: 'value-x' });
  assert.equal(model.calls, 2);
  assert.deepEqual(result.events.map((event) => event.type), [
    'run_started',
    'model_started',
    'model_completed',
    'tool_started',
    'tool_completed',
    'model_started',
    'model_completed',
    'run_completed',
  ]);
});

test('multiple tool steps preserve ordered observations', async () => {
  const model = scriptedModel([
    { kind: 'tool_calls', calls: [{ id: 'c1', name: 'counter', args: 1 }] },
    { kind: 'tool_calls', calls: [{ id: 'c2', name: 'counter', args: 2 }] },
    { kind: 'final', value: { answer: 'done' } },
  ]);
  const seen: unknown[] = [];
  const result = await runMiniKernel({
    input: null,
    model,
    tools: [{ name: 'counter', async execute(args) { seen.push(args); return args; } }],
    maxSteps: 3,
    validateFinal: isFinal,
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.steps, 3);
  assert.deepEqual(
    result.transcript.filter((fact) => fact.kind === 'observation').map((fact) => fact.toolCallId),
    ['c1', 'c2'],
  );
});

test('tool failure becomes an observation and the model can recover', async () => {
  const model = scriptedModel([
    { kind: 'tool_calls', calls: [{ id: 'c1', name: 'fragile', args: null }] },
    (request) => {
      const observation = request.transcript.at(-1);
      assert.equal(observation?.kind, 'observation');
      if (observation?.kind === 'observation') {
        assert.equal(observation.ok, false);
        assert.match(observation.ok ? '' : observation.error, /boom/);
      }
      return { kind: 'final', value: { answer: 'recovered' } };
    },
  ]);
  const result = await runMiniKernel({
    input: null,
    model,
    tools: [{ name: 'fragile', async execute() { throw new Error('boom'); } }],
    maxSteps: 3,
    validateFinal: isFinal,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.events.some((event) => event.type === 'tool_failed'), true);
  assert.deepEqual(result.status === 'completed' ? result.value : null, { answer: 'recovered' });
});

test('model failure is terminal', async () => {
  const model = scriptedModel([new Error('provider unavailable')]);
  const result = await runMiniKernel({ input: null, model, maxSteps: 2, validateFinal: isFinal });

  assert.equal(result.status, 'failed');
  if (result.status === 'failed') {
    assert.equal(result.code, 'model_error');
    assert.match(result.error, /provider unavailable/);
  }
  assert.equal(model.calls, 1);
});

test('cancellation propagates through an in-flight tool', async () => {
  const controller = new AbortController();
  const model = scriptedModel([
    { kind: 'tool_calls', calls: [{ id: 'c1', name: 'wait', args: null }] },
  ]);
  let sawSignal = false;
  const waitingTool: MiniTool = {
    name: 'wait',
    async execute(_args, signal) {
      sawSignal = signal === controller.signal;
      return await new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    },
  };

  const run = runMiniKernel({
    input: null,
    model,
    tools: [waitingTool],
    maxSteps: 3,
    validateFinal: isFinal,
    signal: controller.signal,
  });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  const result = await run;

  assert.equal(sawSignal, true);
  assert.equal(result.status, 'cancelled');
  assert.equal(model.calls, 1);
  assert.equal(result.events.at(-1)?.type, 'run_cancelled');
});

test('maxSteps bounds model turns deterministically', async () => {
  const model: MiniModelPort & { calls: number } = {
    calls: 0,
    async next() {
      this.calls += 1;
      return { kind: 'tool_calls', calls: [{ id: `c${this.calls}`, name: 'noop', args: null }] };
    },
  };
  let executions = 0;
  const result = await runMiniKernel({
    input: null,
    model,
    tools: [{ name: 'noop', async execute() { executions += 1; return null; } }],
    maxSteps: 2,
    validateFinal: isFinal,
  });

  assert.equal(result.status, 'failed');
  if (result.status === 'failed') assert.equal(result.code, 'max_steps');
  assert.equal(model.calls, 2);
  assert.equal(executions, 2);
});

test('invalid structured final result fails closed', async () => {
  const model = scriptedModel([{ kind: 'final', value: { answer: 42 } }]);
  const result = await runMiniKernel({ input: null, model, maxSteps: 1, validateFinal: isFinal });

  assert.equal(result.status, 'failed');
  if (result.status === 'failed') assert.equal(result.code, 'invalid_final');
  assert.equal(result.events.at(-1)?.type, 'run_failed');
});
