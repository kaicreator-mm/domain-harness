import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_OUTPUT_SCHEMA,
  ExactSemanticInvocationCacheRunner,
  FakeModelPort,
  SchemaValidationError,
  SemanticResultCache,
  buildSemanticInvocationIdentity,
  makeInvocation,
  type JsonValue,
  type OutputSchema,
  type ResolvedSemanticInvocation,
} from './semantic-invocation-cache-spike.js';

const APPROVED = {
  decision: 'approve',
  reason: 'complete and supported',
} as const;

function createHarness(
  responder: (invocation: ResolvedSemanticInvocation, call: number) => JsonValue = () => APPROVED,
) {
  const cache = new SemanticResultCache();
  const model = new FakeModelPort(responder);
  const runner = new ExactSemanticInvocationCacheRunner(cache, model);
  return { cache, model, runner };
}

test('S01 first invocation misses, calls model once, and commits structured result', async () => {
  const { cache, model, runner } = createHarness();
  const result = await runner.invoke(makeInvocation());

  assert.equal(result.source, 'model');
  assert.equal(model.calls, 1);
  assert.equal(cache.size, 1);
  assert.deepEqual(result.result, APPROVED);
});

test('S02 different execution identity with identical semantics hits without another model call', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  const hit = await runner.invoke(makeInvocation({
    execution: {
      workflowInstanceId: 'workflow-instance-b',
      sourceMessageId: 'message-b',
      effectId: 'effect-b',
      transientFilePath: '/tmp/other/input.json',
      registrationOrder: ['tool', 'skill', 'knowledge', 'rule'],
    },
  }));

  assert.equal(hit.source, 'cache');
  assert.equal(model.calls, 1);
});

test('S03 selected input change produces a miss', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  await runner.invoke(makeInvocation({ input: { documentText: 'different document', requestKind: 'quality-review' } }));
  assert.equal(model.calls, 2);
});

test('S04 selected domain context change produces a miss', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  await runner.invoke(makeInvocation({ selectedContext: { locale: 'en-US', riskTier: 'high' } }));
  assert.equal(model.calls, 2);
});

test('S05 rule content change produces a miss', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  await runner.invoke(makeInvocation({ rules: [{ path: '/elsewhere/rule.md', content: 'require manager approval' }] }));
  assert.equal(model.calls, 2);
});

test('S06 knowledge content change produces a miss', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  await runner.invoke(makeInvocation({ knowledge: [{ path: '/elsewhere/k.md', content: 'product also requires section C' }] }));
  assert.equal(model.calls, 2);
});

test('S07 skill content change produces a miss', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  await runner.invoke(makeInvocation({ skills: [{ path: '/elsewhere/s.md', content: 'inspect evidence before completeness' }] }));
  assert.equal(model.calls, 2);
});

test('S08 tool semantic surface/schema change produces a miss', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  await runner.invoke(makeInvocation({
    tools: [{
      name: 'lookup_evidence',
      description: 'lookup approved evidence by id',
      inputSchema: {
        type: 'object',
        required: ['id', 'region'],
        properties: { id: { type: 'string' }, region: { type: 'string' } },
      },
      capabilities: ['read:evidence'],
    }],
  }));
  assert.equal(model.calls, 2);
});

test('S09 output schema change produces a miss', async () => {
  const changedSchema: OutputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['decision', 'reason'],
    properties: {
      decision: { type: 'string', enum: ['approve', 'changes_required', 'escalate'] },
      reason: { type: 'string' },
    },
  };
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  await runner.invoke(makeInvocation({ outputSchema: changedSchema }));
  assert.equal(model.calls, 2);
});

test('S10 relevant Harness semantic config change produces a miss', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  await runner.invoke(makeInvocation({ harnessConfig: { maxSteps: 8, toolPolicy: 'evidence-read-only' } }));
  assert.equal(model.calls, 2);
});

test('S11 unrelated and non-selected context changes remain a hit', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation());
  const result = await runner.invoke(makeInvocation({
    unrelatedContext: { uiTheme: 'light', telemetryTraceId: 'trace-b', openPanel: 'debug' },
  }));
  assert.equal(result.source, 'cache');
  assert.equal(model.calls, 1);
});

test('S12 path relocation and registration ordering keep identical content stable', async () => {
  const { model, runner } = createHarness();
  const first = makeInvocation({
    rules: [
      { path: '/repo-a/rules/a.md', content: 'rule-a' },
      { path: '/repo-a/rules/b.md', content: 'rule-b' },
    ],
    knowledge: [
      { path: '/repo-a/k/a.md', content: 'knowledge-a' },
      { path: '/repo-a/k/b.md', content: 'knowledge-b' },
    ],
  });
  const second = makeInvocation({
    rules: [
      { path: '/moved/rules/b.md', content: 'rule-b' },
      { path: '/moved/rules/a.md', content: 'rule-a' },
    ],
    knowledge: [
      { path: '/moved/k/b.md', content: 'knowledge-b' },
      { path: '/moved/k/a.md', content: 'knowledge-a' },
    ],
    execution: {
      workflowInstanceId: 'different-workflow',
      sourceMessageId: 'different-message',
      effectId: 'different-effect',
      transientFilePath: '/different/root/input.json',
      registrationOrder: ['knowledge-b', 'rule-b', 'knowledge-a', 'rule-a'],
    },
  });

  assert.equal(buildSemanticInvocationIdentity(first).digest, buildSemanticInvocationIdentity(second).digest);
  await runner.invoke(first);
  const result = await runner.invoke(second);
  assert.equal(result.source, 'cache');
  assert.equal(model.calls, 1);
});

test('S13 cache hit re-validates structured result against current output schema', async () => {
  const { cache, model, runner } = createHarness();
  const invocation = makeInvocation({ outputSchema: DEFAULT_OUTPUT_SCHEMA });
  cache.prime(buildSemanticInvocationIdentity(invocation), {
    decision: 'approve',
    reason: 42,
  });

  await assert.rejects(() => runner.invoke(invocation), SchemaValidationError);
  assert.equal(model.calls, 0, 'invalid cached data must not silently become transition input');
});

test('S15 cache scope isolates namespaces/tenants', async () => {
  const { model, runner } = createHarness();
  await runner.invoke(makeInvocation({ cacheScope: 'tenant-a' }));
  const otherTenant = await runner.invoke(makeInvocation({
    cacheScope: 'tenant-b',
    execution: {
      workflowInstanceId: 'workflow-b',
      sourceMessageId: 'message-b',
      effectId: 'effect-b',
    },
  }));

  assert.equal(otherTenant.source, 'model');
  assert.equal(model.calls, 2);
});

test('S16 explicitly non-cacheable/time-sensitive invocation bypasses read and write cache', async () => {
  const { cache, model, runner } = createHarness();
  const normal = makeInvocation();
  await runner.invoke(normal);
  assert.equal(cache.size, 1);

  const timeSensitive = makeInvocation({
    timeSensitive: true,
    execution: {
      workflowInstanceId: 'workflow-time',
      sourceMessageId: 'message-time',
      effectId: 'effect-time',
    },
  });
  const first = await runner.invoke(timeSensitive);
  const second = await runner.invoke(timeSensitive);

  assert.equal(first.source, 'model');
  assert.equal(second.source, 'model');
  assert.equal(first.identity, null);
  assert.equal(second.identity, null);
  assert.equal(model.calls, 3);
  assert.equal(cache.size, 1, 'time-sensitive calls must not populate semantic cache');
});

test('S17 cached computation result does not imply a mutation/business effect already happened', async () => {
  const { model, runner } = createHarness();
  let effectCalls = 0;
  const applyBusinessEffect = (decision: JsonValue): void => {
    assert.deepEqual(decision, APPROVED);
    effectCalls += 1;
  };

  await runner.invoke(makeInvocation());
  const hit = await runner.invoke(makeInvocation({
    execution: {
      workflowInstanceId: 'workflow-second',
      sourceMessageId: 'message-second',
      effectId: 'effect-second',
    },
  }));

  assert.equal(hit.source, 'cache');
  assert.equal(model.calls, 1);
  assert.equal(effectCalls, 0, 'cache lookup returns computation only; it does not mark an effect as executed');

  applyBusinessEffect(hit.result);
  assert.equal(effectCalls, 1);
});
