import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KernelLifecycle, StandardWorkflowSession, InteractionElement } from '@kaicreator/domain-harness';
import * as kdp from './kdp.mjs';
import * as business from './business.mjs';
import { runInventoryPolicy, runOrderPolicyIn } from './workflow-init.mjs';
import { createOrderInteraction } from './interactive-order.mjs';

function gate() { let release; const promise=new Promise(resolve=>{release=resolve;}); return {promise,release}; }
function answer(p,action,values) {
  return {intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action,...(values===undefined?{}:{values})};
}

/** Reference 应用负责意图资源；KDP 仍只管理实际已进入业务和生命周期。 */
export async function verifyReferenceInteractions() {
  const app=new KernelLifecycle([business,kdp]);
  await app.start({appId:'native-domain-app'});
  const waiting=gate(), hookEntered=gate(), hookRelease=gate();
  const active=new Set();
  let a, b, c, closing, dependency;
  const events=[];
  function startOrder(input,budget,onPrompt) {
    const order=createOrderInteraction(input,onPrompt,budget);
    active.add(order.interaction);
    const result=app.execute(order.run).finally(()=>active.delete(order.interaction));
    return {...order,result};
  }
  function close() {
    const result=app[Symbol.asyncDispose]();
    for(const interaction of active)interaction.cancel();
    return result;
  }
  try {
    a=startOrder('order',{maxCalls:15,maxSteps:17,maxDepth:1},p=>{events.push('A:wait');waiting.release(p);});
    const p=await waiting.promise;
    assert.equal(p.fields[0].prefill.value,'current');
    assert.equal(p.fields[0].options[0].recommended,true);
    assert.equal(a.interaction.current(),p); // 推荐并没有自动提交。
    const foreign=new InteractionElement();
    assert.equal(foreign.submit(answer(p,'submit',{goal:'current'})).accepted,false);
    let bPrompt;
    const otherWaiting=gate();
    b=startOrder('order',{maxCalls:15,maxSteps:17,maxDepth:1},p=>{bPrompt=p;otherWaiting.release(p);});
    await otherWaiting.promise;
    assert.deepEqual(b.interaction.submit(answer(p,'submit',{goal:'current'})),{accepted:false,code:'WRONG_INTENT'});
    assert.deepEqual(b.interaction.submit(answer(bPrompt,'submit',{goal:'current'})),{accepted:true});
    assert.equal((await b.result).status,'COMPLETE'); events.push('B:complete');
    assert.equal(a.interaction.current(),p);
    const inventory=await app.execute(runInventoryPolicy);
    assert.deepEqual(inventory,{status:'COMPLETE',value:{policyId:'inventory-stock',sku:'SKU-001',available:5,replenish:false}});
    events.push('C:inventory');
    assert.equal(a.interaction.current(),p);
    assert.deepEqual(a.interaction.submit(answer(p,'submit',{goal:'current'})),{accepted:true});
    assert.deepEqual(await a.result,{status:'COMPLETE',value:{policyId:'order-policy-allow',total:10,approved:true}});
    events.push('A:complete');
    const prompts=[];
    const revised=startOrder('order',{maxCalls:19,maxSteps:21,maxDepth:1},(p,i)=>{
      prompts.push(p);
      if(prompts.length===1)i.submit(answer(p,'submit',{goal:'compare'}));
      else {
        assert.equal(i.submit(answer(prompts[0],'submit',{goal:'current'})).accepted,false);
        i.submit({...answer(p,'revise'),text:'order current'});
      }
    });
    assert.equal((await revised.result).status,'COMPLETE');assert.equal(prompts.length,2);
    // 关闭时 A 等待，C 已进入真实业务及异步 end Hook；显式依赖 A 的分支不得进入。
    const waitAgain=gate();
    a=startOrder('order',{maxCalls:15,maxSteps:17,maxDepth:1},p=>waitAgain.release(p));
    await waitAgain.promise;
    let dependentCalls=0;
    dependency=app.execute(async()=>{
      const parent=await a.result;
      if(parent.status!=='COMPLETE')return parent;
      dependentCalls++;
      return runInventoryPolicy();
    });
    const trace=[];
    c=app.execute(()=>new StandardWorkflowSession({maxCalls:7,maxSteps:9,maxDepth:1}).run(async root=>{
      const evaluated=await runOrderPolicyIn(root,'normal',trace);
      if(evaluated.status!=='COMPLETE')return evaluated;
      return root.leaf({run:()=>evaluated,end:async()=>{hookEntered.release();await hookRelease.promise;events.push('C:hook-end');}});
    }));
    await hookEntered.promise;
    let closed=false;
    closing=close().then(()=>{closed=true;events.push('closed');});
    assert.equal(a.interaction.current(),undefined);
    assert.equal((await a.result).status,'REJECT');
    assert.equal((await dependency).status,'REJECT'); assert.equal(dependentCalls,0);
    await assert.rejects(app.execute(runInventoryPolicy));
    assert.equal(closed,false);
    hookRelease.release();
    assert.equal((await c).status,'COMPLETE');
    await closing;
    assert.deepEqual(events,['A:wait','B:complete','C:inventory','A:complete','C:hook-end','closed']);
    assert.deepEqual(trace,['policy:read','policy:start','policy:evaluate','policy:end','policy:finalize']);
    const exact={maxCalls:15,maxSteps:17,maxDepth:1};
    for(const budget of [{...exact,maxCalls:14},{...exact,maxSteps:16},{...exact,maxDepth:0}]){
      const short=createOrderInteraction('order',(p,i)=>i.submit(answer(p,'submit',{goal:'current'})),budget);
      assert.equal((await short.run()).status,'FAILED');
    }
    return {independentIntents:true,wrongIntentRejected:true,revision:true,dependencyBlocked:true,closeWaited:true,exactAndShort:true};
  }finally{
    hookRelease.release();
    await close();
    await Promise.allSettled([a?.result,b?.result,c,dependency,closing]);
  }
}

/** 真实子进程 stdin/readline 与 stdout，不以直接调用 submit 替代终端。 */
export function verifyReferenceCli(){
  const entry=fileURLToPath(new URL('./interaction-cli.mjs',import.meta.url));
  const scenarios=[
    ['current',[{action:'submit',values:{goal:'current'}}],'COMPLETE','order-policy-allow',1],
    ['comparison',[{action:'submit',values:{goal:'compare'}},{action:'submit',values:{scenario:'strict'}}],'REJECT','ORDER_POLICY_THRESHOLD',2],
    ['revision',[{action:'submit',values:{goal:'compare'}},{action:'revise',text:'order current'}],'COMPLETE','order-policy-allow',2],
    ['invalid',[{action:'submit',values:{goal:'invalid'}},{action:'submit',values:{goal:'current'}}],'COMPLETE','order-policy-allow',1],
    ['text',[{action:'text',text:'order current'}],'COMPLETE','order-policy-allow',1],
    ['no-fit',[{action:'no-fit'}],'ASK','NO_MATCHING_POLICY',1],
    ['cancel',[{action:'cancel'}],'REJECT','CANCELLED',1],
  ];
  for(const [name,answers,status,expected,prompts] of scenarios){
    const child=spawnSync(process.execPath,[entry,'order'],{encoding:'utf8',input:answers.map(a=>JSON.stringify(a)).join('\n')+'\n',timeout:10000,windowsHide:true});
    assert.equal(child.status,0,name);
    const rows=child.stdout.trim().split(/\r?\n/u).map(line=>JSON.parse(line));
    const result=rows.at(-1).outcome;
    assert.equal(result.status,status,name);
    assert.equal(result.status==='COMPLETE'?result.value.policyId:result.reason.code,expected,name);
    assert.equal(rows.filter(r=>r.prompt).length,prompts);
    if(name==='invalid')assert.equal(rows.filter(r=>r.response?.accepted===false).length,1);
  }
  return {cases:scenarios.length,realReadline:true};
}
