import assert from 'node:assert/strict';
import test from 'node:test';
import { KernelLifecycle, StandardWorkflowSession, routeWorkflowOutcome } from '@kaicreator/domain-harness';
import * as kdp from '../../examples/native-domain-app/packages/kdp.mjs';
import * as business from '../../examples/native-domain-app/packages/business.mjs';
import * as workflowInit from '../../examples/native-domain-app/packages/workflow-init.mjs';

test('0.11.0 AC06: two selected structured business policies change real Function outcome',async()=>{
  const shared = new business.OrderPolicyElement();
  const allowedTrace=[],blockedTrace=[];
  const allowed=await workflowInit.runOrderPolicy('normal',allowedTrace,shared);
  const blocked=await workflowInit.runOrderPolicy('strict',blockedTrace,shared);
  assert.deepEqual(allowed,{status:'COMPLETE',value:{policyId:'order-policy-allow',total:10,approved:true}});
  assert.equal(blocked.status,'REJECT');
  assert.equal(blocked.reason.code,'ORDER_POLICY_THRESHOLD');
  assert.ok(allowedTrace.includes('policy:finalize'));
  assert.equal(blockedTrace.includes('policy:finalize'),false,'non-selected next Node must never execute');
  assert.deepEqual(await workflowInit.runOrderPolicy('missing'),{
    status:'UNKNOWN',reason:{code:'ORDER_POLICY_NOT_SELECTED',message:'Unknown policy selection'},
  });
});

test('0.11.1 AC11/AC19/AC20: real Core.Init starts nested two-node and single-node Workflows',async()=>{
  const before=workflowInit.initResults.length;
  const app=new KernelLifecycle([workflowInit,kdp]);
  let businessReached=false;
  await app.run({appId:'native-domain-app'},()=>{
    businessReached=true;
    assert.equal(workflowInit.initResults.length,before+1,'Init must complete before business callback');
  });
  assert.equal(businessReached,true);
  const receipt=workflowInit.initResults.at(-1);
  assert.deepEqual(receipt.normalTrace,[
    'policy:read','policy:start','policy:evaluate','policy:end','policy:finalize',
  ]);
  assert.deepEqual(receipt.strictTrace,[
    'policy:read','policy:start','policy:evaluate','policy:end',
  ]);
  assert.deepEqual(receipt.single,{status:'COMPLETE',value:42});
  assert.equal(receipt.normal.status,'COMPLETE');
  assert.equal(receipt.strict.status,'REJECT');
  assert.equal(receipt.inventory.status,'COMPLETE');
});

test('0.11.1 AC60: second inventory domain reuses Standard YAML Reader without another runtime',async()=>{
  const stock=await workflowInit.runInventoryPolicy();
  assert.deepEqual(stock,{status:'COMPLETE',value:{
    policyId:'inventory-stock',sku:'SKU-001',available:5,replenish:false,
  }});
});

test('0.11.1 AC12/14: REJECT/ASK/WAIT/UNKNOWN/FAILED routes cannot silently become COMPLETE',async()=>{
  const exits={
    COMPLETE:r=>'COMPLETE:'+String(r.value),
    REJECT:r=>r.status,
    ASK:r=>r.status,
    WAIT:r=>r.status,
    UNKNOWN:r=>r.status,
    FAILED:r=>r.status,
  };
  for(const status of ['REJECT','ASK','WAIT','UNKNOWN','FAILED']){
    const result={status,reason:{code:'BUSINESS_'+status,message:'not complete'}};
    assert.equal(await routeWorkflowOutcome(result,exits),status);
  }
  const outcome=await new StandardWorkflowSession({maxCalls:0,maxSteps:1,maxDepth:0})
    .run(ctx=>ctx.invoke(()=>{throw new Error('should not run');}));
  assert.equal(outcome.status,'FAILED');
  assert.equal(outcome.reason.code,'WORKFLOW_CALL_BUDGET');
});
