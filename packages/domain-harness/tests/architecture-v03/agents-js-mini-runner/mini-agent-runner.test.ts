import assert from 'node:assert/strict';
import test from 'node:test';
import {
  runMiniAgent,
  type Generate,
  type MiniTool,
  type ModelTurn,
} from './mini-agent-runner.js';

function scripted(turns: ModelTurn[], seen: unknown[] = []): Generate {
  let index = 0;
  return async (request) => {
    seen.push(request);
    const turn = turns[index++];
    if (!turn) throw new Error('script exhausted');
    return structuredClone(turn);
  };
}

test('accumulates system, developer, and user prompts in order', async () => {
  const seen: any[] = [];
  await runMiniAgent({
    systemPrompt: 'system',
    developerPrompts: ['dev-1', 'dev-2'],
    input: 'user',
    generate: scripted([{ kind: 'final', output: 'ok' }], seen),
  });
  assert.deepEqual(seen[0].messages, [
    { role: 'system', content: 'system' },
    { role: 'developer', content: 'dev-1' },
    { role: 'developer', content: 'dev-2' },
    { role: 'user', content: 'user' },
  ]);
});

test('executes one tool call then returns the next generation', async () => {
  let toolCalls = 0;
  const tool: MiniTool = {
    name: 'lookup',
    async execute(input) {
      toolCalls += 1;
      assert.deepEqual(input, { key: 'A' });
      return { value: 7 };
    },
  };
  const result = await runMiniAgent({
    input: 'lookup A',
    tools: [tool],
    generate: scripted([
      { kind: 'tool_calls', calls: [{ id: 'c1', name: 'lookup', input: { key: 'A' } }] },
      { kind: 'final', output: { answer: 7 } },
    ]),
  });
  assert.equal(toolCalls, 1);
  assert.equal(result.status, 'completed');
  if (result.status === 'completed') assert.deepEqual(result.output, { answer: 7 });
});

test('supports a bounded multi-step tool loop', async () => {
  const tool: MiniTool = {
    name: 'math',
    async execute(input: any) {
      return input.op === 'add' ? input.value + 1 : input.value * 2;
    },
  };
  const result = await runMiniAgent({
    input: 'compute',
    maxSteps: 4,
    tools: [tool],
    generate: scripted([
      { kind: 'tool_calls', calls: [{ id: 'a', name: 'math', input: { op: 'add', value: 2 } }] },
      { kind: 'tool_calls', calls: [{ id: 'b', name: 'math', input: { op: 'double', value: 3 } }] },
      { kind: 'final', output: 6 },
    ]),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.continuation.journal.length, 5);
});

test('propagates structured final output and continuation state', async () => {
  const result = await runMiniAgent({
    input: 'review',
    generate: scripted([{ kind: 'final', output: { decision: 'approve', score: 0.91 }, message: 'done' }]),
  });
  assert.equal(result.status, 'completed');
  if (result.status !== 'completed') return;
  assert.deepEqual(result.output, { decision: 'approve', score: 0.91 });
  assert.equal(result.continuation.nextStep, 1);
  assert.deepEqual(result.continuation.messages.at(-1), { role: 'assistant', content: 'done' });
});

test('cancellation prevents provider execution and propagates AbortError', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(
    runMiniAgent({
      input: 'cancel',
      signal: controller.signal,
      generate: async () => {
        calls += 1;
        return { kind: 'final', output: null };
      },
    }),
    (error: any) => error?.name === 'AbortError',
  );
  assert.equal(calls, 0);
});

test('provider/auth failures propagate unchanged', async () => {
  const authError = new Error('provider 401');
  let caught: unknown;
  try {
    await runMiniAgent({ input: 'fail', generate: async () => { throw authError; } });
  } catch (error) {
    caught = error;
  }
  assert.strictEqual(caught, authError);
});

test('journal replay is deterministic and does not re-run provider or tools', async () => {
  let providerCalls = 0;
  let toolCalls = 0;
  const tool: MiniTool = {
    name: 'lookup',
    async execute() {
      toolCalls += 1;
      return { value: 11 };
    },
  };
  const first = await runMiniAgent({
    input: 'lookup',
    tools: [tool],
    generate: async (request) => {
      providerCalls += 1;
      return request.messages.some((message) => message.role === 'tool')
        ? { kind: 'final', output: { answer: 11 }, message: 'complete' }
        : { kind: 'tool_calls', calls: [{ id: 'c1', name: 'lookup', input: { key: 'x' } }] };
    },
  });
  assert.equal(providerCalls, 2);
  assert.equal(toolCalls, 1);

  providerCalls = 0;
  toolCalls = 0;
  const replayed = await runMiniAgent({
    input: 'lookup',
    tools: [tool],
    replay: first.continuation.journal,
  });
  assert.equal(providerCalls, 0);
  assert.equal(toolCalls, 0);
  assert.deepEqual(replayed, first);
});

test('handoff is returned as node-local data rather than performing orchestration', async () => {
  const result = await runMiniAgent({
    input: 'route',
    generate: scripted([{ kind: 'handoff', target: 'specialist', payload: { reason: 'domain' } }]),
  });
  assert.equal(result.status, 'handoff');
  if (result.status === 'handoff') {
    assert.deepEqual(result.handoff, { target: 'specialist', payload: { reason: 'domain' } });
  }
});

test('returns continuation instead of escaping the configured step bound', async () => {
  const tool: MiniTool = { name: 'loop', async execute() { return 'again'; } };
  const result = await runMiniAgent({
    input: 'loop',
    maxSteps: 2,
    tools: [tool],
    generate: scripted([
      { kind: 'tool_calls', calls: [{ id: '1', name: 'loop', input: null }] },
      { kind: 'tool_calls', calls: [{ id: '2', name: 'loop', input: null }] },
    ]),
  });
  assert.equal(result.status, 'max_steps');
  assert.equal(result.continuation.nextStep, 2);
});
