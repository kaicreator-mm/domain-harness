import assert from 'node:assert/strict';
import { InteractionElement } from '@kaicreator/domain-harness';
import type { WorkflowObservation } from '@kaicreator/domain-harness';
import { demoIsbn as isbn,demoRevision as revision,openCatalogDemo } from './catalog-demo-environment.js';
import { runCatalogReasoning } from './catalog-reasoning.js';
import { catalogReservation } from './catalog-reservation.js';

const env=await openCatalogDemo();
try {
  const trace:WorkflowObservation[]=[];
  const prompts:string[]=[];
  const interaction=(value:number,before?:()=>void)=>new InteractionElement({onPrompt:(p,i)=>{
    prompts.push(p.decisionKey);before?.();
    setImmediate(()=>i.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{quantity:value}}));
  }});
  const confirm=new InteractionElement({onPrompt:(p,i)=>{
    prompts.push(p.decisionKey);
    setImmediate(()=>i.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{approve:'yes'}}));
  }});
  const result=await runCatalogReasoning(env.catalog,{isbn,revision,budgetCents:4000},{
    recognition:interaction(2),interaction:interaction(3),
    reconsider:interaction(2,()=>env.database.transaction(tx=>tx.run('UPDATE books SET price=? WHERE tenant=? AND isbn=?',[1300,'shop-a',isbn]))),
    current:()=>true,observe:e=>{trace.push(e);},
    reserve:(root,plan,request,options)=>catalogReservation(env.catalog,env.client,{tenant:'shop-a',principal:'alice',inspect:r=>env.owner.inspect('shop-a',r),
      approve:g=>env.owner.approve(g),readback:env.readback},confirm,options)(root,plan,request),
  });
  if(result.status!=='COMPLETE') {
    console.error(JSON.stringify({status:result.status,code:result.reason.code,prompts,trace:trace.map(e=>({kind:e.kind,phase:'phase'in e?e.phase:null,action:'action'in e?e.action:null,definition:e.kind==='node'?e.occurrence.definitionId:null}))}));
    throw Error('CATALOG_REVISION_FAILED');
  }
  assert.equal(result.value.initial.totalCents,2400);
  assert.equal(result.value.final.totalCents,2600);
  assert.equal(result.value.final.quantity,2);
  assert.equal(result.value.receipt?.remaining,3);
  assert.deepEqual(prompts,['initial-quantity','quantity','reconsider','reserve']);
  assert.equal(new Set(trace.map(e=>e.runId)).size,1);
  assert.ok(trace.some(e=>e.kind==='region'&&e.action==='revalidate'));
  const entries=(id:string)=>trace.filter(e=>e.kind==='node'&&e.phase==='enter'&&e.occurrence.definitionId===id).length;
  assert.equal(entries('catalog-policy'),1);
  assert.equal(entries('catalog-source'),2);
  assert.deepEqual(env.owner.inspect('shop-a','book-a'),{stock:3,version:1,effects:1});
  console.log(JSON.stringify({status:'PASS_CATALOG_MISSING_AND_REVISION',prompts,initial:2400,final:2600,policyRuns:1,sourceRuns:2,oneRoot:true,effects:1}));
}finally{await env.close();}
