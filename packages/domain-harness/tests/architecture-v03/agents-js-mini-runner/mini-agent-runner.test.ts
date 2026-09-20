import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InvalidFinalOutputError,
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

test('conditionally disabled tools are hidden and cannot execute', async () => {
  let toolCalls = 0;
  const disabled: MiniTool = {
    name: 'dangerous',
    isEnabled: () => false,
    async execute() {
      toolCalls += 1;
      return 'should-not-run';
    },
  };
  const seen: any[] = [];
  await assert.rejects(
    runMiniAgent({
      input: 'try disabled tool',
      tools: [disabled],
      generate: scripted([
        { kind: 'tool_calls', calls: [{ id: 'd1', name: 'dangerous', input: {} }] },
      ], seen),
    }),
    /Tool is disabled or unknown: dangerous/,
  );
  assert.deepEqual(seen[0].tools, []);
  assert.equal(toolCalls, 0);
});

test('approval-required tool pauses before any tool execution', async () => {
  let toolCalls = 0;
  const protectedTool: MiniTool = {
    name: 'publish',
    requiresApproval: true,
    async execute() {
      toolCalls += 1;
      return { published: true };
    },
  };
  const result = await runMiniAgent({
    input: 'publish',
    tools: [protectedTool],
    generate: scripted([
      { kind: 'tool_calls', calls: [{ id: 'p1', name: 'publish', input: { id: 42 } }] },
    ]),
  });
  assert.equal(toolCalls, 0);
  assert.equal(result.status, 'approval_required');
  if (result.status === 'approval_required') {
    assert.deepEqual(result.approval, {
      callId: 'p1',
      name: 'publish',
      input: { id: 42 },
    });
    assert.equal(result.continuation.nextStep, 1);
  }
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

test('invalid structured final output fails closed', async () => {
  await assert.rejects(
    runMiniAgent({
      input: 'review',
      validateFinal: (output) => (
        typeof output === 'object' &&
        output !== null &&
        (output as Record<string, unknown>).decision === 'approve'
      ),
      generate: scripted([{ kind: 'final', output: { decision: 'unknown' } }]),
    }),
    InvalidFinalOutputError,
  );
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

test('tool failures propagate unchanged', async () => {
  const toolError = new Error('tool failed');
  const tool: MiniTool = {
    name: 'explode',
    async execute() {
      throw toolError;
    },
  };
  let caught: unknown;
  try {
    await runMiniAgent({
      input: 'explode',
      tools: [tool],
      generate: scripted([
        { kind: 'tool_calls', calls: [{ id: 'e1', name: 'explode', input: null }] },
      ]),
    });
  } catch (error) {
    caught = error;
  }
  assert.strictEqual(caught, toolError);
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
