import assert from 'node:assert/strict';
import test from 'node:test';
import { fromPromise } from 'xstate';
import { WorkflowElement, XStateWorkflowElement } from '../../src/standard-workflow.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';

test('SDK Standard XState Workflow 独立于 KDP 执行业务定义', async () => {
  const logic = fromPromise<number, number>(async ({ input }) => input * 3);
  const workflow = new XStateWorkflowElement<number, number>(
    logic,
    (output): StandardWorkflowOutcome<number> =>
      typeof output === 'number'
        ? { status: 'COMPLETE', value: output }
        : { status: 'UNKNOWN', reason: { code: 'OUTPUT_UNKNOWN', message: 'Output type not established' } },
  );
  assert.deepEqual(await workflow.run(7), { status: 'COMPLETE', value: 21 });
  assert.ok(workflow instanceof WorkflowElement);
});

test('Actor 执行异常归入 FAILED，不泄漏异常内容或冒充成功', async () => {
  const logic = fromPromise<number, number>(async () => {
    throw new Error('sensitive upstream detail');
  });
  const workflow = new XStateWorkflowElement<number, number>(
    logic,
    (output): StandardWorkflowOutcome<number> => ({ status: 'COMPLETE', value: output as number }),
  );
  const result = await workflow.run(1);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.status === 'FAILED' && result.reason.code, 'DH_WORKFLOW_EXECUTION_FAILED');
  assert.ok(!JSON.stringify(result).includes('sensitive upstream detail'));
});

test('Business 可将业务 Workflow 定义映射为 ASK/WAIT/UNKNOWN', async () => {
  const logic = fromPromise<string, string>(async ({ input }) => input);
  class ApprovalWorkflow extends WorkflowElement<string, string> {
    private readonly standard = new XStateWorkflowElement<string, string>(
      logic,
      (output): StandardWorkflowOutcome<string> => ({
        status: 'WAIT',
        reason: { code: 'WAIT_APPROVAL', message: String(output) },
      }),
    );
    public run(input: string): Promise<StandardWorkflowOutcome<string>> {
      return this.standard.run(input);
    }
  }
  const result = await new ApprovalWorkflow().run('review');
  assert.deepEqual(result, { status: 'WAIT', reason: { code: 'WAIT_APPROVAL', message: 'review' } });
});
