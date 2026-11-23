import assert from 'node:assert/strict';
import test from 'node:test';
import {
  StandardWorkflowSession, routeWorkflowOutcome,
} from '../../src/native-workflow-composition.js';
import type { StandardWorkflowOutcome } from '../../src/standard-workflow.js';
import { JsonReader, YamlReader } from '../../src/standard-files.js';

test('共享根调用预算：Guard/Reader/子 Workflow 不重置，额度不足不执行副作用', async () => {
  const actions: string[] = [];
  const flow = new StandardWorkflowSession({ maxCalls: 2, maxSteps: 10, maxDepth: 2 });
  const actual = await flow.run(async (parent) => {
    const guard = await parent.invoke(() => { actions.push('guard'); return true; });
    assert.equal(guard.status, 'COMPLETE');
    return parent.child(0, async (child) => {
      const read = await child.invoke(() => { actions.push('reader'); return 'doc'; });
      assert.equal(read.status, 'COMPLETE');
      return child.leaf({
        start: () => { actions.push('should-not-start'); },
        run: () => { actions.push('should-not-run'); return { status: 'COMPLETE', value: 1 }; },
        end: () => { actions.push('should-not-end'); },
      });
    });
  });
  assert.equal(actual.status, 'FAILED');
  assert.equal(actual.status === 'FAILED' && actual.reason.code, 'WORKFLOW_CALL_BUDGET');
  assert.deepEqual(actions, ['guard', 'reader']);
});

test('祖先深度不能被子 Workflow 的更大额度覆盖', async () => {
  const events: string[] = [];
  const flow = new StandardWorkflowSession({maxCalls: 10, maxSteps: 10, maxDepth: 1});
  const actual = await flow.run(ctx => ctx.child(99, child =>
    child.child(99, () => {
      events.push('must-not-run');
      return { status: 'COMPLETE', value: 'incorrect' };
    })));
  assert.equal(actual.status, 'FAILED');
  assert.equal(actual.status === 'FAILED' && actual.reason.code, 'WORKFLOW_DEPTH_LIMIT');
  assert.deepEqual(events, []);
});

test('start/end Hook 的额度在副作用前预留；异步 end 完成后才交付结果', async () => {
  const events: string[] = [];
  const denied = await new StandardWorkflowSession({maxCalls: 2, maxSteps: 20, maxDepth: 0})
    .run(ctx => ctx.leaf({
      start: () => { events.push('unexpected:start'); },
      run: () => { events.push('unexpected:run'); return { status: 'COMPLETE', value: 1 }; },
      end: () => { events.push('unexpected:end'); },
    }));
  assert.equal(denied.status, 'FAILED');
  assert.equal(events.length, 0);

  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const enter = new Promise<void>(resolve => { entered = resolve; });
  const result = new StandardWorkflowSession({maxCalls: 3,maxSteps: 4,maxDepth: 0})
    .run(ctx => ctx.leaf({
      start: () => { events.push('start'); },
      run: () => { events.push('run'); return { status:'COMPLETE',value:42 }; },
      end: async () => { events.push('end:begin'); entered(); await gate; events.push('end:finish'); },
    }));
  await enter;
  let delivered = false;
  const observed = result.then(x => { delivered=true; return x; });
  await Promise.resolve();
  assert.equal(delivered, false);
  release();
  assert.deepEqual(await observed, {status:'COMPLETE',value:42});
  assert.deepEqual(events, ['start','run','end:begin','end:finish']);
});

test('Hook end 错误不会让已完成业务冒充 COMPLETE；更早 UNKNOWN 不被吞没', async () => {
  const positive = await new StandardWorkflowSession({maxCalls: 2,maxSteps: 3,maxDepth: 0})
    .run(ctx => ctx.leaf({
      run: () => ({status:'COMPLETE',value:5}),
      end: () => { throw new Error('private fault'); },
    }));
  assert.equal(positive.status, 'FAILED');
  assert.equal(positive.status === 'FAILED' && positive.reason.code, 'WORKFLOW_HOOK_END_FAILED');

  const unknown = await new StandardWorkflowSession({maxCalls: 2,maxSteps: 3,maxDepth: 0})
    .run(ctx => ctx.leaf<number>({
      run: () => ({status:'UNKNOWN',reason:{code:'NO_EVIDENCE',message:'not known'}}),
      end: () => { throw new Error('secret'); },
    }));
  assert.equal(unknown.status, 'UNKNOWN');
});

test('所有 Workflow Outcome 均有显式具名 Switch 分支，UNKNOWN/FAILED 不成为成功', async () => {
  type Result = StandardWorkflowOutcome<number>;
  const paths: Result['status'][] = ['COMPLETE','REJECT','ASK','WAIT','UNKNOWN','FAILED'];
  const exits: Record<Result['status'], (result: Result) => string> = {
    COMPLETE: () => 'success',
    REJECT: () => 'reject',
    ASK: () => 'ask',
    WAIT: () => 'wait',
    UNKNOWN: () => 'unknown',
    FAILED: () => 'failed',
  };
  const labels = await Promise.all(paths.map(status => routeWorkflowOutcome<number,string>(
    status === 'COMPLETE'
      ? {status, value: 1}
      : {status, reason:{code:'ROUTE',message:'explicit'}},
    exits,
  )));
  assert.deepEqual(labels, ['success','reject','ask','wait','unknown','failed']);
});

test('业务上下文使用相同 Reader 处理两 JSON / 两 YAML，不复制 Parser', async () => {
  const json = new JsonReader(), yaml = new YamlReader();
  const inputs = [
    () => json.read('{"k":1}'),
    () => json.read('{"k":2}'),
    () => yaml.read('k: 3\n'),
    () => yaml.read('k: 4\n'),
  ];
  const flow = new StandardWorkflowSession({maxCalls: 4,maxSteps: 5,maxDepth: 0});
  const result = await flow.run(async ctx => {
    const values: number[] = [];
    for (const read of inputs) {
      const outcome = await ctx.invoke(read);
      if (outcome.status !== 'COMPLETE' || outcome.value.kind !== 'SUCCEEDED') {
        return {status:'FAILED', reason:{code:'READ_FAILED',message:'unexpected'}};
      }
      const record = outcome.value.value;
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        return {status:'FAILED',reason:{code:'INVALID',message:'expected record'}};
      }
      const n = record['k'];
      if (typeof n !== 'number') {
        return {status:'FAILED',reason:{code:'INVALID',message:'expected number'}};
      }
      values.push(n);
    }
    return {status:'COMPLETE',value:values};
  });
  assert.deepEqual(result, {status:'COMPLETE',value:[1,2,3,4]});
});

test('根 Workflow Session 不能被重复启动并重置预算', async () => {
  const flow = new StandardWorkflowSession({maxCalls: 1,maxSteps: 3,maxDepth: 0});
  assert.deepEqual(await flow.run(() => ({status:'COMPLETE',value:'first'})),
    {status:'COMPLETE',value:'first'});
  const repeat = await flow.run(() => ({status:'COMPLETE',value:'second'}));
  assert.equal(repeat.status,'FAILED');
  assert.equal(repeat.status === 'FAILED' && repeat.reason.code,'WORKFLOW_ALREADY_RUN');
});
