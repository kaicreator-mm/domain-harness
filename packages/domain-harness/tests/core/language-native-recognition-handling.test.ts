import assert from 'node:assert/strict';
import test from 'node:test';
import { runRecognitionHandling } from '../../src/native-workflow-composition.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';

const limits = { maxCalls: 2, maxSteps: 5, maxDepth: 1 };
const ok = <T>(value: T): StandardWorkflowOutcome<T> => ({ status: 'COMPLETE', value });

const stops = ['REJECT', 'ASK', 'WAIT', 'UNKNOWN', 'FAILED'] as const;

test('两个固定角色共享根预算并保留领域类型与值', async () => {
  const events: string[] = [];
  const result = await runRecognitionHandling(limits,
    () => { events.push('recognize'); return ok({ quantity: 2 }); },
    async intent => { events.push('handle'); return ok(String(intent.quantity * 3)); });
  assert.deepEqual(result, ok('6'));
  assert.deepEqual(events, ['recognize', 'handle']);
});

test('识别非成功原样返回，绝不进入处理；处理非成功也原样返回', async () => {
  for (const status of stops) {
    const refused = { status, reason: { code: 'DOMAIN_REASON', message: 'Domain reason' } } as const;
    let handled = 0;
    const recognitionStop = await runRecognitionHandling(limits,
      async (): Promise<StandardWorkflowOutcome<number>> => refused,
      () => { handled++; return ok('incorrect'); });
    assert.strictEqual(recognitionStop, refused);
    assert.equal(handled, 0);
    const handlingStop = await runRecognitionHandling(limits, () => ok(1), () => refused);
    assert.strictEqual(handlingStop, refused);
  }
});

test('根额度、处理调用及步骤额度、深度不足均拒绝实际回调', async () => {
  for (const [budget, code, expected] of [
    [{ ...limits, maxSteps: 0 }, 'WORKFLOW_STEP_BUDGET', []],
    [{ ...limits, maxCalls: 0 }, 'WORKFLOW_CALL_BUDGET', []],
    [{ ...limits, maxDepth: 0 }, 'WORKFLOW_DEPTH_LIMIT', []],
    [{ ...limits, maxCalls: 1 }, 'WORKFLOW_CALL_BUDGET', ['recognize']],
    [{ ...limits, maxSteps: 4 }, 'WORKFLOW_STEP_BUDGET', ['recognize']],
    [{ ...limits, maxCalls: -1 }, 'WORKFLOW_INVALID_LIMIT', []],
  ] as const) {
    const events: string[] = [];
    const result = await runRecognitionHandling(budget,
      () => { events.push('recognize'); return ok(1); },
      () => { events.push('effect'); return ok('result'); });
    assert.equal(result.status === 'FAILED' && result.reason.code, code);
    assert.deepEqual(events, expected);
  }
});

test('识别异常不得调用处理；处理异常保持已有脱敏 FAILED', async () => {
  let handled = 0;
  const failure = () => { throw new Error('PRIVATE_MARKER'); };
  const expected = { status: 'FAILED', reason: { code: 'WORKFLOW_EXECUTION_FAILED', message: 'Workflow could not complete' } };
  assert.deepEqual(await runRecognitionHandling(limits, failure, () => { handled++; return ok('wrong'); }), expected);
  assert.equal(handled, 0);
  assert.deepEqual(await runRecognitionHandling(limits, () => ok(1), async () => failure()), expected);
});

test('独立请求的等待、预算与领域输入隔离', { timeout: 3000 }, async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  const a = runRecognitionHandling({ ...limits, maxCalls: 1 }, async () => {
    events.push('A:recognize'); await gate; return ok('A');
  }, intent => { events.push(intent); return ok(intent); });
  try {
    assert.deepEqual(await runRecognitionHandling(limits, () => ok('B'), intent => {
      events.push(intent); return ok(intent);
    }), ok('B'));
    assert.deepEqual(events, ['A:recognize', 'B']);
  } finally { release(); }
  const refused = await a;
  assert.equal(refused.status === 'FAILED' && refused.reason.code, 'WORKFLOW_CALL_BUDGET');
  assert.deepEqual(events, ['A:recognize', 'B']);
});
