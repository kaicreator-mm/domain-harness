import assert from 'node:assert/strict';
import { KernelLifecycle, StandardWorkflowSession, routeWorkflowOutcome } from '@kaicreator/domain-harness';
import * as kdp from './packages/kdp.mjs';
import * as business from './packages/business.mjs';
import * as workflowInit from './packages/workflow-init.mjs';
import { verifyReferenceInteractions, verifyReferenceCli } from './packages/interaction-reference.mjs';

async function executeCase(limits) {
  const events = [];
  const app = new KernelLifecycle([business, kdp]);
  const outcome = await app.run({appId:'native-domain-app'}, async () => {
    const service = new business.OrderService();
    const session = new StandardWorkflowSession(limits);
    return session.run(async root => {
      const guard = await root.invoke(() => {
        events.push('guard');
        return true;
      });
      if (guard.status !== 'COMPLETE') return guard;
      if (!guard.value) {
        return {status:'UNKNOWN',reason:{code:'NO_DOCUMENTS',message:'Missing documents'}};
      }
      return root.child(0, async child => {
        const read = await service.readFour(child, id => events.push(id));
        if (read.status !== 'COMPLETE') return read;
        return child.leaf({
          start: async () => { events.push('hook:start'); },
          run: async () => {
            events.push('hook:run');
            return {
              status:'COMPLETE',
              value:{
                count:read.value.length,
                total:business.sumAmounts(read.value.map(value => value.amount)),
                firstId:read.value[0].id,
              },
            };
          },
          end: async () => { await Promise.resolve(); events.push('hook:end'); },
        });
      });
    });
  });
  return {outcome,events};
}

// 1 root step + 1 Guard + 1 child + 4 Reader + 3 Hook/function steps = 10。
// 调用预算为 1 Guard + 4 Reader + 3 Hook/function = 8。
const positive = await executeCase({maxCalls:8,maxSteps:10,maxDepth:1});
assert.deepEqual(positive.events, [
  'guard','json-a','json-b','yaml-c','yaml-d',
  'hook:start','hook:run','hook:end',
]);
const routes = {
  COMPLETE: result => result.value,
  REJECT: () => { throw new Error('Business rejected'); },
  ASK: () => { throw new Error('Business requires input'); },
  WAIT: () => { throw new Error('Business is waiting'); },
  UNKNOWN: () => { throw new Error('Business status unknown'); },
  FAILED: () => { throw new Error('Business execution failed'); },
};
const result = await routeWorkflowOutcome(positive.outcome, routes);
assert.deepEqual(result,{count:4,total:10,firstId:'a'});

// Guard + 前两次 Reader 用完 3 个 calls，第三次 Reader 必须在解析前拒绝。
const blockedReader = await executeCase({maxCalls:3,maxSteps:10,maxDepth:1});
assert.deepEqual(blockedReader.events,['guard','json-a','json-b']);
assert.equal(blockedReader.outcome.status,'FAILED');
assert.equal(blockedReader.outcome.reason.code,'WORKFLOW_CALL_BUDGET');

// Guard + 全部 Reader 消耗 5 个 calls，只剩 1；叶子 start/run/end
// 必须预留 3 个 calls，失败前不得执行任何 Hook 或业务计算。
const blockedHook = await executeCase({maxCalls:6,maxSteps:10,maxDepth:1});
assert.deepEqual(blockedHook.events,['guard','json-a','json-b','yaml-c','yaml-d']);
assert.equal(blockedHook.outcome.status,'FAILED');
assert.equal(blockedHook.outcome.reason.code,'WORKFLOW_CALL_BUDGET');

// 根步骤额度也应拒绝未计费的第四次 Reader。
const blockedStep = await executeCase({maxCalls:8,maxSteps:5,maxDepth:1});
assert.deepEqual(blockedStep.events,['guard','json-a','json-b']);
assert.equal(blockedStep.outcome.status,'FAILED');
assert.equal(blockedStep.outcome.reason.code,'WORKFLOW_STEP_BUDGET');


/** 旧 AC06/AC11/AC19/AC20 的语义在新 SDK 原生代码中重新执行，不恢复旧 Boot/Lock。 */
const initApp = new KernelLifecycle([workflowInit,kdp]);
const initReceipts = [];
let actualInit;
await initApp.run({
  appId:'native-domain-app',
  onInitResult:receipt=>{ initReceipts.push(receipt); },
},()=>{
  assert.equal(initReceipts.length,1,'completed Init belongs to this Domain App activation');
  actualInit=initReceipts[0];
  assert.deepEqual(actualInit.normal,{status:'COMPLETE',value:{
    policyId:'order-policy-allow',total:10,approved:true,
  }});
  assert.equal(actualInit.strict.status,'REJECT');
  assert.equal(actualInit.strict.reason.code,'ORDER_POLICY_THRESHOLD');
  assert.deepEqual(actualInit.normalTrace,[
    'policy:read','policy:start','policy:evaluate','policy:end','policy:finalize',
  ]);
  assert.deepEqual(actualInit.strictTrace,[
    'policy:read','policy:start','policy:evaluate','policy:end',
  ]);
  assert.deepEqual(actualInit.inventory,{status:'COMPLETE',value:{
    policyId:'inventory-stock',sku:'SKU-001',available:5,replenish:false,
  }});
  assert.deepEqual(actualInit.single,{status:'COMPLETE',value:42});
});

const interaction=await verifyReferenceInteractions();
const cli=await verifyReferenceCli();
console.log(JSON.stringify({
  app:'native-domain-app',
  status:'PASS',
  ...result,
  interaction,cli,
  retainedBehavior:{
    initWorkflow:true,
    policySelectedByData:actualInit.normal.value.policyId,
    strictPolicyStatus:actualInit.strict.status,
    multiNodeNormal:actualInit.normalTrace.length,
    rejectedBranchNodes:actualInit.strictTrace.length,
    inventoryReusesStandardReader:true,
    singleNode:actualInit.single.status,
  },
  budget:{
    successReads:4,
    deniedReaderReads:2,
    deniedReaderCode:blockedReader.outcome.reason.code,
    deniedHookReads:4,
    deniedHookCode:blockedHook.outcome.reason.code,
    deniedStepReads:2,
    deniedStepCode:blockedStep.outcome.reason.code,
  },
}));
