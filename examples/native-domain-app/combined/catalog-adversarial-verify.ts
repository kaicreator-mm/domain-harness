import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { InteractionElement, ModelElement } from '@kaicreator/domain-harness';
import { demoIsbn as isbn,demoRevision as revision,openCatalogDemo } from './catalog-demo-environment.js';
import { runCatalogReasoning } from './catalog-reasoning.js';
import { catalogReservation } from './catalog-reservation.js';

const scenarios=['foreign-tool','wrong-args','forged-result','bad-topology','model-budget','root-budget'] as const;
for(const scenario of scenarios){
  const env=await openCatalogDemo();
  let requests=0,approvals=0;
  const request={isbn,revision,quantity:3,budgetCents:4000};
  const server=createServer((req,res)=>{void(async()=>{
    for await(const _chunk of req){void _chunk;}
    requests++;
    const usage={prompt_tokens:10,completion_tokens:10,total_tokens:20};
    let message:unknown,finish_reason:string;
    if(requests===1){
      const name=scenario==='foreign-tool'?'reserve_inventory':'catalog_preview';
      message={role:'assistant',content:null,tool_calls:[{id:'preview-call',type:'function',function:{name,arguments:JSON.stringify({...request,...(scenario==='wrong-args'?{quantity:99}:{})})}}]};
      finish_reason='tool_calls';
    }else{
      message={role:'assistant',content:JSON.stringify(requests===2?{isbn,quantity:3,totalCents:scenario==='forged-result'?1:3600,resource:'book-a'}
        :{runId:'foreign',regionId:'foreign',planRevision:0,factRevision:0,action:'finish',edits:[]})};
      finish_reason='stop';
    }
    res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message,finish_reason}],usage}));
  })().catch(()=>{res.statusCode=500;res.end();});});
  try{
    await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    const address=server.address();assert.ok(address&&typeof address!=='string');
    const model=new ModelElement({id:'local-adversarial',model:'test-only',protocol:'openai-chat',endpoint:'http://127.0.0.1:'+address.port+'/chat/completions',
      credential:()=> 'local-test-only',tokenField:'max_tokens',features:{tools:true,jsonSchema:false,toolsWithJsonSchema:false},
      limits:{requestBytes:32768,responseBytes:65536,maxOutputTokens:1024,timeoutMs:2000}});
    const feedback=new InteractionElement({onPrompt:(p,i)=>{setImmediate(()=>i.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{quantity:3}}));}});
    const confirmation=new InteractionElement({onPrompt:(p,i)=>{approvals++;setImmediate(()=>i.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{approve:'yes'}}));}});
    const result=await runCatalogReasoning(env.catalog,{...request,quantity:2},{
      interaction:feedback,model,current:()=>true,...(scenario==='model-budget'?{modelCalls:2}:{}),
      ...(scenario==='root-budget'?{limits:{maxCalls:0,maxSteps:10,maxDepth:6}}:{}),
      reserve:(root,plan,input,options)=>catalogReservation(env.catalog,env.client,{tenant:'shop-a',principal:'alice',inspect:r=>env.owner.inspect('shop-a',r),
        approve:g=>env.owner.approve(g),readback:env.readback},confirmation,options)(root,plan,input),
    });
    assert.notEqual(result.status,'COMPLETE');
    assert.equal(approvals,0);
    assert.deepEqual(env.owner.inspect('shop-a','book-a'),{stock:5,version:0,effects:0});
    assert.equal(requests,scenario==='root-budget'?0:scenario==='foreign-tool'||scenario==='wrong-args'?1:scenario==='bad-topology'?3:2);
    console.log(JSON.stringify({scenario,status:result.status,code:result.status==='COMPLETE'?null:result.reason.code,requests,effects:0}));
  }finally{await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});await env.close();}
}
console.log('CATALOG_ADVERSARIAL_PASS 6');
