import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createDomainHarness,
  type AIOperationPort,
  type HarnessTool,
  type JsonSchema,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'critical-journey-harness');

const textSchema: JsonSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
  },
  required: ['text'],
  additionalProperties: false,
};

test('CJ-01 executes Skill -> Tool -> Expr -> Script -> Child -> waiting event through the public SDK', async () => {
  let aiCalls = 0;
  let toolCalls = 0;

  const ai: AIOperationPort = {
    async execute(request) {
      aiCalls += 1;
      assert.equal(request.skillId, 'draft');
      assert.equal(request.profile, 'synthetic-critical-journey');
      assert.equal(request.resources.length, 1);
      assert.match(request.resources[0]?.content ?? '', /domain-owned/);
      return { text: 'seed-skill' };
    },
  };

  const enrichTool: HarnessTool = {
    input: textSchema,
    output: textSchema,
    effect: 'idempotent',
    async execute(input, context) {
      toolCalls += 1;
      assert.match(context.idempotencyKey, /./);
      const value = input as { text: string };
      return { text: `${value.text}-tool` };
    },
  };

  const runtime = await createDomainHarness({
    root: fixture,
    sqlitePath: ':memory:',
    ai,
    tools: { enrich_tool: enrichTool },
  });

  const started = await runtime.start({
    workflowId: 'main',
    input: { request: 'prove-v0.1-primitives' },
  });
  assert.equal(started.status, 'running');

  const waiting = await runtime.wait(started.runId, { timeoutMs: 2_000 });
  assert.equal(waiting.status, 'waiting');
  assert.equal(aiCalls, 1);
  assert.equal(toolCalls, 1);

  const completed = await runtime.send(started.runId, {
    type: 'approve',
    payload: { approvedBy: 'synthetic-reviewer' },
  });

  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.output, {
    child: { text: 'seed-skill-tool-expr-script-child' },
    approval: { approvedBy: 'synthetic-reviewer' },
  });
  assert.equal(aiCalls, 1);
  assert.equal(toolCalls, 1);

  assert.equal((await runtime.get(started.runId))?.status, 'completed');
  assert.equal((await runtime.listRuns({ status: 'completed' })).length, 1);
});
