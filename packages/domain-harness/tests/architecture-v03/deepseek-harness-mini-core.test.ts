import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ToolRegistry,
  assemblePrompt,
  runNodeMiniCore,
  type JsonValue,
  type ModelPort,
  type ModelRequest,
  type ModelResponse,
  type ToolDefinition,
} from './deepseek-harness-mini-core.js';

function tool(
  name: string,
  execute: ToolDefinition['execute'],
  description = name,
): ToolDefinition {
  return {
    schema: {
      name,
      description,
      parameters: { type: 'object', additionalProperties: false },
    },
    execute,
  };
}

class ScriptedModel implements ModelPort {
  readonly requests: ModelRequest[] = [];
  #index = 0;

  constructor(private readonly responses: readonly ModelResponse[]) {}

  async complete(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    const response = this.responses[this.#index];
    this.#index += 1;
    if (response === undefined) throw new Error('script exhausted');
    return response;
  }
}

function parseDecision(value: JsonValue): { decision: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('final result must be an object');
  }
  const decision = value.decision;
  if (typeof decision !== 'string') throw new Error('final result requires decision');
  return { decision };
}

function factTypes(facts: readonly { type: string }[]): string[] {
  return facts.map((fact) => fact.type);
}

test('deterministic prompt/context and tool schema assembly ignores registration order', () => {
  const variables = { domain: 'returns', actor: 'reviewer' };
  const sections = [
    { name: 'z-last', order: 20, text: 'Review {{domain}}.' },
    { name: 'b-peer', order: 10, text: 'B for {{actor}}.' },
    { name: 'a-peer', order: 10, text: 'A for {{actor}}.' },
    { name: 'literal', order: 30, text: 'Keep {{unresolved}} literal.', interpolate: false },
  ] as const;

  assert.equal(
    assemblePrompt(sections, variables),
    'A for reviewer.\n\nB for reviewer.\n\nReview returns.\n\nKeep {{unresolved}} literal.',
  );
  assert.throws(
    () => assemblePrompt([{ name: 'bad', order: 0, text: '{{missing}}' }], variables),
    /unknown prompt variable/,
  );

  const alpha = tool('alpha', async () => null);
  const zulu = tool('zulu', async () => null);
  assert.deepEqual(
    new ToolRegistry([zulu, alpha]).schemas(),
    new ToolRegistry([alpha, zulu]).schemas(),
  );
  assert.deepEqual(new ToolRegistry([zulu, alpha]).schemas().map((schema) => schema.name), ['alpha', 'zulu']);
});

test('model -> tool -> observation -> model -> structured final', async () => {
  const model = new ScriptedModel([
    {
      kind: 'tool-calls',
      content: 'I need the sum.',
      calls: [{ id: 'call-1', name: 'sum', arguments: { left: 2, right: 3 } }],
    },
    { kind: 'final', value: { decision: 'sum=5' } },
  ]);
  const controller = new AbortController();
  const result = await runNodeMiniCore({
    sections: [{ name: 'policy', order: 0, text: 'Use tools for arithmetic.' }],
    history: [{ role: 'user', content: 'What is 2 + 3?' }],
    tools: [tool('sum', async (argumentsValue) => {
      assert.deepEqual(argumentsValue, { left: 2, right: 3 });
      return 5;
    })],
    model,
    signal: controller.signal,
    maxSteps: 3,
    parseFinal: parseDecision,
  });

  assert.equal(result.status, 'completed');
  if (result.status !== 'completed') return;
  assert.deepEqual(result.value, { decision: 'sum=5' });
  assert.equal(model.requests.length, 2);
  assert.deepEqual(model.requests[0]?.tools.map((schema) => schema.name), ['sum']);
  assert.equal(model.requests[0]?.messages[0]?.role, 'system');
  const secondRequest = model.requests[1];
  assert.ok(secondRequest);
  assert.equal(secondRequest.messages.at(-1)?.role, 'tool');
  assert.deepEqual(
    factTypes(result.facts),
    [
      'run/start',
      'step/start',
      'model/request',
      'model/response',
      'tool/call',
      'tool/result',
      'step/end',
      'step/start',
      'model/request',
      'model/response',
      'step/end',
      'run/end',
    ],
  );
  result.facts.forEach((fact, index) => assert.equal(fact.seq, index));
});

test('ordinary tool failure becomes an observation and the loop may recover', async () => {
  const model = new ScriptedModel([
    {
      kind: 'tool-calls',
      calls: [{ id: 'bad-1', name: 'lookup', arguments: { key: 'missing' } }],
    },
    { kind: 'final', value: { decision: 'fallback' } },
  ]);
  const result = await runNodeMiniCore({
    sections: [],
    history: [{ role: 'user', content: 'Find the value or fall back.' }],
    tools: [tool('lookup', async () => {
      throw new Error('not found');
    })],
    model,
    signal: new AbortController().signal,
    maxSteps: 3,
    parseFinal: parseDecision,
  });

  assert.equal(result.status, 'completed');
  const observation = model.requests[1]?.messages.at(-1);
  assert.ok(observation && observation.role === 'tool');
  assert.equal(observation.isError, true);
  assert.equal(observation.code, 'TOOL_ERROR');
  assert.match(observation.content, /not found/);
});

test('cancellation settles the started call and synthesizes ordered results for calls never dispatched', async () => {
  const controller = new AbortController();
  let secondDispatched = false;
  const model = new ScriptedModel([
    {
      kind: 'tool-calls',
      calls: [
        { id: 'first', name: 'cancel-now', arguments: {} },
        { id: 'second', name: 'must-not-run', arguments: {} },
      ],
    },
  ]);
  const result = await runNodeMiniCore({
    sections: [],
    history: [{ role: 'user', content: 'Run.' }],
    tools: [
      tool('cancel-now', async () => {
        controller.abort('stop');
        throw new DOMException('aborted', 'AbortError');
      }),
      tool('must-not-run', async () => {
        secondDispatched = true;
        return null;
      }),
    ],
    model,
    signal: controller.signal,
    maxSteps: 3,
    parseFinal: parseDecision,
  });

  assert.equal(result.status, 'cancelled');
  assert.equal(secondDispatched, false);
  const toolFacts = result.facts.filter((fact) => fact.type === 'tool/call' || fact.type === 'tool/result');
  assert.equal(toolFacts.length, 4);
  assert.equal((toolFacts[1]?.payload as { code?: string }).code, 'ABORTED');
  assert.equal((toolFacts[2]?.payload as { dispatched?: boolean }).dispatched, false);
  assert.equal((toolFacts[3]?.payload as { code?: string }).code, 'ABORTED_BEFORE_DISPATCH');
  assert.deepEqual(factTypes(result.facts).slice(-2), ['step/end', 'run/end']);
});

test('maxSteps is a hard model-call limit with an explicit terminal fact', async () => {
  let calls = 0;
  const model: ModelPort = {
    async complete(): Promise<ModelResponse> {
      calls += 1;
      return {
        kind: 'tool-calls',
        calls: [{ id: `noop-${calls}`, name: 'noop', arguments: {} }],
      };
    },
  };
  const result = await runNodeMiniCore({
    sections: [],
    history: [{ role: 'user', content: 'Keep going.' }],
    tools: [tool('noop', async () => null)],
    model,
    signal: new AbortController().signal,
    maxSteps: 2,
    parseFinal: parseDecision,
  });

  assert.equal(result.status, 'max-steps');
  assert.equal(calls, 2);
  assert.equal(result.facts.at(-1)?.type, 'run/end');
  assert.deepEqual(result.facts.at(-1)?.payload, { status: 'max-steps' });
});

test('invalid structured final result is terminal and never masquerades as success', async () => {
  const model = new ScriptedModel([{ kind: 'final', value: { wrong: true } }]);
  const result = await runNodeMiniCore({
    sections: [],
    history: [{ role: 'user', content: 'Return a decision.' }],
    tools: [],
    model,
    signal: new AbortController().signal,
    maxSteps: 1,
    parseFinal: parseDecision,
  });

  assert.equal(result.status, 'invalid-final');
  if (result.status !== 'invalid-final') return;
  assert.match(result.error, /requires decision/);
  assert.deepEqual(factTypes(result.facts), [
    'run/start',
    'step/start',
    'model/request',
    'model/response',
    'step/end',
    'run/end',
  ]);
  assert.deepEqual(result.facts.at(-1)?.payload, {
    status: 'invalid-final',
    error: 'final result requires decision',
  });
});
