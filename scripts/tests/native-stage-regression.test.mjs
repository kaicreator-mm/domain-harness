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
  const receipts=[];
  const app=new KernelLifecycle([workflowInit,kdp]);
  let businessReached=false;
  await app.run({
    appId:'native-domain-app',
    onInitResult:receipt=>{ receipts.push(receipt); },
  },()=>{
    businessReached=true;
    assert.equal(receipts.length,1,'Init must complete before business callback');
  });
  assert.equal(businessReached,true);
  const receipt=receipts[0];
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

test('0.11.1 AC17: optional InitFrom caller trace and repeated Init are owned by the Package',async()=>{
  const ledger=[];
  class Extension {
    constructor(caller){this.caller=caller;}
    start(){ledger.push('init:'+this.caller);}
    [Symbol.asyncDispose](){ledger.push('exit:'+this.caller);}
  }
  class AppInit {
    async start(ctx){
      await ctx.enter(new Extension('first'),'extension');
      await ctx.enter(new Extension('second'),'extension');
    }
  }
  const kernel=new KernelLifecycle([{
    packageMeta:{id:'owned-kdp',role:'core',order:0},Init:AppInit,
  }]);
  await kernel.run({appId:'native-domain-app'},()=>42);
  assert.deepEqual(ledger,['init:first','init:second','exit:second','exit:first']);
});

test('0.11.0 AC01/AC03: zero-Function knowledge Element + multi-Function Element share Package exports',()=>{
  const knowledge=new business.OrderPolicyKnowledgeElement({
    id:'order-policy-allow',minimumTotal:10,
  });
  assert.deepEqual(Object.getOwnPropertyNames(business.OrderPolicyKnowledgeElement.prototype),
    ['constructor'],'the knowledge Element does not gain meaningless Functions');
  assert.equal(knowledge.content.minimumTotal,10);
  assert.equal(Object.isFrozen(knowledge.content),true);
  const service=new business.OrderPolicyElement();
  assert.equal(typeof service.evaluate,'function');
  assert.equal(typeof service.finalize,'function');
  assert.equal(business.sumAmounts([1,2,3,4]),10,'ordinary package-level Function remains callable');
});

test('R166: two Domain App activations keep Init results separate, without a module-global registry', async()=>{
  const left=[],right=[];
  const leftApp=new KernelLifecycle([workflowInit,kdp]);
  const rightApp=new KernelLifecycle([workflowInit,kdp]);
  await Promise.all([
    leftApp.run({appId:'native-domain-app',onInitResult:r=>{left.push(r);}},()=>42),
    rightApp.run({appId:'native-domain-app',onInitResult:r=>{right.push(r);}},()=>43),
  ]);
  assert.equal(left.length,1);
  assert.equal(right.length,1);
  assert.notStrictEqual(left[0],right[0]);
  assert.notStrictEqual(left[0].normalTrace,right[0].normalTrace);
  assert.deepEqual(left[0].normal,right[0].normal);
  left[0].normalTrace.push('left-only');
  assert.equal(right[0].normalTrace.includes('left-only'),false);
  assert.equal('initResults' in workflowInit,false,'a module-global mutable receipt is not a Package state contract');
});

test('R166: the optional application-owned result observer is not required for Init', async()=>{
  const app=new KernelLifecycle([workflowInit,kdp]);
  assert.equal(await app.run({appId:'native-domain-app'},()=>31),31);
});
