import assert from 'node:assert/strict';
import test from 'node:test';
import { createMachine, fromPromise } from 'xstate';
import { spawnSync } from 'node:child_process';
import { WorkflowElement, XStateWorkflowElement } from '../../src/standard-workflow.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';

test('SDK Standard XState Workflow 独立于 KDP 执行业务定义', async () => {
  const logic = fromPromise<number, number>(async ({ input }) => input * 3);
  const workflow = new XStateWorkflowElement<typeof logic, number>(
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
  const workflow = new XStateWorkflowElement<typeof logic, number>(
    logic,
    (output): StandardWorkflowOutcome<number> => ({ status: 'COMPLETE', value: output as number }),
  );
  const result = await workflow.run(1);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.status === 'FAILED' && result.reason.code, 'WORKFLOW_EXECUTION_FAILED');
  assert.ok(!JSON.stringify(result).includes('sensitive upstream detail'));
});

test('Business 可将业务 Workflow 定义映射为 ASK/WAIT/UNKNOWN', async () => {
  const logic = fromPromise<string, string>(async ({ input }) => input);
  class ApprovalWorkflow extends WorkflowElement<string, string> {
    private readonly standard = new XStateWorkflowElement<typeof logic, string>(
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

test('R138 P1: 同步 self.stop 不挂起，也不能由成功 mapper 接管', async () => {
  const logic = createMachine({
    id: 'self-stop',
    initial: 'active',
    states: {
      active: {
        entry: ({ self }) => { self.stop(); },
      },
    },
  });
  const workflow = new XStateWorkflowElement<typeof logic, string>(
    logic,
    () => ({ status: 'COMPLETE', value: 'incorrect' }),
  );
  const result = await Promise.race([
    workflow.run(undefined),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('synchronous self.stop remained pending')), 1500);
    }),
  ]);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.status === 'FAILED' && result.reason.code, 'WORKFLOW_STOPPED');
});

test('R138 P1: 微任务异步 self.stop 不是 done，不能映射 COMPLETE', async () => {
  const logic = createMachine({
    id: 'async-stop',
    initial: 'active',
    states: {
      active: {
        entry: ({ self }) => { queueMicrotask(() => self.stop()); },
      },
    },
  });
  const workflow = new XStateWorkflowElement<typeof logic, string>(
    logic, () => ({ status: 'COMPLETE', value: 'incorrect' }),
  );
  const result = await Promise.race([
    workflow.run(undefined),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('asynchronous self.stop remained pending')), 1500);
    }),
  ]);
  assert.equal(result.status, 'FAILED');
  assert.equal(result.status === 'FAILED' && result.reason.code, 'WORKFLOW_STOPPED');
});

test('R139: 真实 done 可将合法 void/undefined 映射 COMPLETE', async () => {
  const logic = createMachine({
    id: 'void-complete',
    initial: 'finished',
    states: { finished: { type: 'final' } },
  });
  const workflow = new XStateWorkflowElement<typeof logic, string>(
    logic, () => ({ status: 'COMPLETE', value: 'void-complete' }),
  );
  assert.deepEqual(await workflow.run(undefined), {
    status: 'COMPLETE', value: 'void-complete',
  });
});

test('R138 P2: public run 输入类型绑定真实 actor logic', async () => {
  const logic = fromPromise<number, number>(async ({ input }) => input);
  const workflow = new XStateWorkflowElement<typeof logic, number>(
    logic, (output) => ({ status: 'COMPLETE', value: output }),
  );
  // @ts-expect-error: fromPromise<number, number> 不接受 string，编译期必须拒绝。
  const rejected: Parameters<typeof workflow.run>[0] = 'not-a-number';
  void rejected;
  assert.deepEqual(await workflow.run(12), { status: 'COMPLETE', value: 12 });
});

test('R138 P1: 初始 entry 同步异常已由 Standard 观察，Host 不被原始错误终止', () => {
  const target = new URL('../../src/standard-workflow.ts', import.meta.url).href;
  const script = [
    "import { createMachine } from 'xstate';",
    `import { XStateWorkflowElement } from ${JSON.stringify(target)};`,
    "const logic = createMachine({",
    "  initial: 'bad',",
    "  states: { bad: { entry: () => { throw new Error('SECRET_ENTRY_MARKER'); } } },",
    "});",
    "const workflow = new XStateWorkflowElement(logic,",
    "  () => ({ status: 'COMPLETE', value: 'wrong' }));",
    "console.log(JSON.stringify(await workflow.run(undefined)));",
  ].join('\n');
  const child = spawnSync(process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    { encoding: 'utf8', timeout: 12000 });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, `Uncaught Host error: ${child.stderr}`);
  assert.ok(!child.stderr.includes('SECRET_ENTRY_MARKER'));
  assert.deepEqual(JSON.parse(child.stdout.trim()), {
    status: 'FAILED',
    reason: { code: 'WORKFLOW_EXECUTION_FAILED', message: 'Workflow execution failed' },
  });
});
