import assert from 'node:assert/strict';
import test from 'node:test';

import type { AIOperationPort } from '../src/contracts/ai.js';
import type { HarnessTool, ToolContext } from '../src/contracts/tool.js';
import { ExecutorError, SkillExecutor, ToolRegistry } from '../src/execution/index.js';
import type { SkillAst } from '../src/loader/ast.js';

const controller = new AbortController();
const toolContext: ToolContext = {
  runId: 'run-1',
  workflowInstanceId: 'root',
  stepId: 'fetch#1',
  attempt: 1,
  idempotencyKey: 'run-1/root/fetch/1',
  signal: controller.signal,
  now: () => new Date('2026-09-17T00:00:00.000Z'),
};

test('ToolRegistry validates input/output and forwards idempotency context', async () => {
  const registry = new ToolRegistry();
  let seenKey = '';
  const tool: HarnessTool = {
    effect: 'idempotent',
    input: { type: 'object', required: ['value'], properties: { value: { type: 'number' } }, additionalProperties: false },
    output: { type: 'object', required: ['value'], properties: { value: { type: 'number' } }, additionalProperties: false },
    async execute(input, ctx) {
      seenKey = ctx.idempotencyKey;
      const value = (input as { value: number }).value;
      return { value: value * 2 };
    },
  };
  registry.register('double', tool);

  assert.deepEqual(await registry.execute('double', { value: 21 }, toolContext), { value: 42 });
  assert.equal(seenKey, toolContext.idempotencyKey);
  assert.equal(registry.effectOf('double'), 'idempotent');
  await assert.rejects(
    registry.execute('double', { nope: true }, toolContext),
    (error: unknown) => error instanceof ExecutorError && error.code === 'invalid_input',
  );
});

test('ToolRegistry maps timeout and aborts downstream signal', async () => {
  const registry = new ToolRegistry();
  let downstreamAborted = false;
  registry.register('slow', {
    effect: 'none',
    async execute(_input, ctx) {
      await new Promise<void>((resolve) => {
        ctx.signal.addEventListener('abort', () => {
          downstreamAborted = true;
          resolve();
        }, { once: true });
      });
      return null;
    },
  });
  await assert.rejects(
    registry.execute('slow', null, toolContext, { timeoutMs: 10 }),
    (error: unknown) => error instanceof ExecutorError && error.code === 'timeout',
  );
  assert.equal(downstreamAborted, true);
});

test('SkillExecutor assembles provider-neutral request and validates output', async () => {
  let captured: Parameters<AIOperationPort['execute']>[0] | undefined;
  const port: AIOperationPort = {
    async execute(request) {
      captured = request;
      return { score: 90 };
    },
  };
  const skill: SkillAst = {
    id: 'score',
    directory: '/harness/skills/score',
    instructions: 'Score the input.',
    sidecar: { output: { schema: 'assets/output.json' }, resources: ['references/rules.md'], profile: 'quality' },
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object', required: ['score'], properties: { score: { type: 'number' } }, additionalProperties: false },
    resources: [{ path: 'references/rules.md', content: 'rules' }],
  };
  const executor = new SkillExecutor(port);
  const result = await executor.execute(
    skill,
    { text: 'hello' },
    { runId: 'run-1', workflowInstanceId: 'root', stepId: 'score#1', attempt: 1 },
    { signal: controller.signal },
  );
  assert.deepEqual(result, { score: 90 });
  assert.equal(captured?.skillId, 'score');
  assert.equal(captured?.profile, 'quality');
  assert.equal('provider' in (captured as unknown as Record<string, unknown>), false);
});
