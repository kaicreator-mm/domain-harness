import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { ModelElement, StandardWorkflowSession, bindWorkflowFunction, bindWorkflowRegion, createWorkflowSlot, runWorkflowRegion } from '../../src/index.js';
import type { ModelProfile, ModelRequest, ModelTurn, WorkflowControlOptions, WorkflowRegionDefinition, WorkflowRegionProposal, WorkflowCapability, WorkflowNodeProposal, StandardWorkflowOutcome as Outcome } from '../../src/index.js';
type Obj=Record<string,unknown>;
const ok=<T>(value:T):Outcome<T>=>({status:'COMPLETE',value});
const fail=(code:string):Outcome<never>=>({status:'FAILED',reason:{code,message:code}});
const value=<T>(r:Outcome<T>):T=>{if(r.status!=='COMPLETE')throw Error(r.reason.code);return r.value;};
const schema={type:'object',properties:{lead:{type:'integer'}},required:['lead'],additionalProperties:false} as const;
const tool={name:'quote',description:'actual current quote',inputSchema:{type:'object',properties:{offer:{type:'string'}},required:['offer'],additionalProperties:false}} as const;
const req=(patch:Partial<ModelRequest>={}):ModelRequest=>({system:'Use current authority',input:[{role:'user',text:'Compare offers'}],tools:[tool],
  output:{kind:'text'},maxOutputTokens:32,requestKey:'first',action:'initial',reason:'actual domain request',...patch});
const control=(patch:Partial<WorkflowControlOptions>={}):WorkflowControlOptions=>({
  current:()=>true,knowledge:{current:()=>({epoch:1,context:{scope:'root',revisions:new Map()}}),equal:Object.is,maxItems:0},
  limits:{maxWork:2000000,maxEvents:100,maxActiveScopes:8,maxActiveMs:10000,maxSettlementMs:1000,maxNoProgress:5,
    model:{maxCalls:3,maxRetries:1,maxOutputTokens:32}},...patch});
const session=(c=control())=>new StandardWorkflowSession({maxCalls:50,maxSteps:50,maxDepth:3},c);
const complete=<T>()=>({goal:'actual validated result',requiredKnowledge:[],terminalReads:0,validate:(value:T)=>{void value;return ok(undefined);}});
const obj=(v:unknown):Obj=>{assert.ok(v&&typeof v==='object'&&!Array.isArray(v));return v as Obj;};
const arr=(v:unknown):unknown[]=>{assert.ok(Array.isArray(v));return v as unknown[];};
async function serve(run:(r:IncomingMessage,s:ServerResponse,b:Obj)=>void|Promise<void>){
  let calls=0;
  const server=createServer((r,s)=>{void(async()=>{
    calls++;let raw='';for await(const c of r){raw+=String(c);}
    await run(r,s,obj(JSON.parse(raw) as unknown));
  })().catch(()=>{s.statusCode=500;s.end();});});
  await new Promise<void>(res=>server.listen(0,'127.0.0.1',res));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  return {base:'http://127.0.0.1:'+address.port,calls:()=>calls,close:()=>new Promise<void>(res=>{server.close(()=>res());server.closeAllConnections();})};
}
const send=(s:ServerResponse,v:unknown)=>{s.setHeader('content-type','application/json');s.end(JSON.stringify(v));};
const open=(text:string,usage:unknown={prompt_tokens:10,completion_tokens:2,total_tokens:12})=>({choices:[{message:{role:'assistant',content:text},finish_reason:'stop'}],usage});
function profile(base:string,protocol:ModelProfile['protocol']='openai-chat',patch:Partial<ModelProfile>={}):ModelProfile{
  return {id:protocol,protocol,endpoint:base+(protocol==='openai-chat'?'/v1/chat/completions':'/v1/messages'),model:'fixture-model',
    credential:()=> 'test-token',...(protocol==='openai-chat'?{tokenField:'max_completion_tokens' as const}:{anthropicVersion:'2023-06-01'}),
    features:{tools:true,jsonSchema:true,toolsWithJsonSchema:true},limits:{requestBytes:4096,responseBytes:4096,maxOutputTokens:32,timeoutMs:1000},...patch};
}
for(const protocol of ['openai-chat','anthropic-messages'] as const){
  test('actual '+protocol+' multi-tool request, results and strict final JSON',async()=>{
    const wire:Obj[]=[];
    const server=await serve((r,s,b)=>{
      wire.push(b);assert.equal(r.headers['content-type'],'application/json');
      assert.equal(r.headers[protocol==='openai-chat'?'authorization':'x-api-key'],protocol==='openai-chat'?'Bearer test-token':'test-token');
      if(wire.length===1){
        if(protocol==='openai-chat')send(s,{choices:[{message:{role:'assistant',content:null,tool_calls:['A','B'].map(x=>({id:'call-'+x,type:'function',function:{name:'quote',arguments:JSON.stringify({offer:x})}}))},finish_reason:'tool_calls'}],usage:{prompt_tokens:90,completion_tokens:12,total_tokens:102}});
        else send(s,{content:[{type:'text',text:'Check' },...['A','B'].map(x=>({type:'tool_use',id:'call-'+x,name:'quote',input:{offer:x}}))],stop_reason:'tool_use',usage:{input_tokens:80,output_tokens:12,cache_creation_input_tokens:10,cache_read_input_tokens:5}});
      }else if(protocol==='openai-chat')send(s,open('{"lead":2}'));
      else send(s,{content:[{type:'text',text:'{"lead":2}'}],stop_reason:'end_turn',usage:{output_tokens:4}});
    });
    try{
      const m=new ModelElement(profile(server.base,protocol));
      const result=await session().run(async root=>{
        const t=value(await m.generate(root,req()));assert.equal(t.calls.length,2);
        assert.equal(t.usage.input,protocol==='openai-chat'?90:95);
        const results=t.calls.map((c,i)=>({callId:c.id,value:{cost:i===0?30:24},error:i===1}));
        const input=[{role:'user' as const,text:'Compare offers'},{role:'assistant' as const,turn:t},{role:'tool-results' as const,results}];
        return m.generate(root,req({requestKey:'next',action:'continue',input,output:{kind:'json',strict:true,schema}}));
      },complete<ModelTurn>());
      assert.equal(result.status,'COMPLETE');assert.deepEqual(JSON.parse(JSON.stringify(value(result).json)),{lead:2});assert.equal(server.calls(),2);
      assert.equal(wire[0]?.[protocol==='openai-chat'?'max_completion_tokens':'max_tokens'],32);
      const messages=arr(wire[1]?.messages);
      if(protocol==='openai-chat'){
        assert.equal(obj(messages.at(-2)).tool_call_id,'call-A');assert.equal(obj(messages.at(-1)).tool_call_id,'call-B');
        assert.deepEqual(JSON.parse(String(obj(messages.at(-1)).content)),{value:{cost:24},error:true});
        assert.ok(wire[1]?.response_format);
      }else{
        const blocks=arr(obj(messages.at(-1)).content);
        assert.equal(obj(blocks[0]).tool_use_id,'call-A');assert.equal(obj(blocks[1]).is_error,true);assert.ok(wire[1]?.output_config);
      }
    }finally{await server.close();}
  });
}
test('call and retry limits count admitted failure, explicit retry only, no HTTP on one-short',async()=>{
  const server=await serve((_r,s)=>{s.statusCode=503;s.end('private error');});
  try{
    let creds=0;
    const m=new ModelElement(profile(server.base,'openai-chat',{credential:()=>{creds++;return 'token';}}));
    const c=control();const s=session({...c,limits:{...c.limits,model:{maxCalls:3,maxRetries:1,maxOutputTokens:32}}});
    const result=await s.run(async root=>{
      const a=await m.generate(root,req());assert.equal(a.status,'FAILED');
      const b=await m.generate(root,req({action:'retry'}));assert.equal(b.status,'FAILED');
      const d=await m.generate(root,req({action:'retry'}));assert.equal(d.status,'FAILED');
      assert.equal(server.calls(),2);assert.equal(creds,2);
      return ok(1);
    },complete<number>());
    assert.equal(result.status,'COMPLETE');
  }finally{await server.close();}
});
test('unsupported combinations, malformed/duplicate JSON, output overrun, redirect, wrong schema are non-success',async()=>{
  for(const mode of ['unsupported','schema','duplicate','overrun','redirect','unsupported-schema'] as const){
    let creds=0;
    const server=await serve((_r,s)=>{
      if(mode==='redirect'){s.statusCode=302;s.setHeader('location','/target');s.end();return;}
      if(mode==='duplicate')send(s,open('{"lead":2,"lead":3}'));
      else if(mode==='overrun')send(s,open('{"lead":2}',{prompt_tokens:10,completion_tokens:33,total_tokens:43}));
      else send(s,open('{"lead":"bad"}'));
    });
    try{
      const p=profile(server.base,'openai-chat',{credential:()=>{creds++;return 'token';},
        ...(mode==='unsupported'?{features:{tools:true,jsonSchema:true,toolsWithJsonSchema:false}}:{})});
      const m=new ModelElement(p);
      const r=await session().run(root=>m.generate(root,req({output:{kind:'json',strict:true,
        schema:mode==='unsupported-schema'?{type:'object',$ref:'#'}:schema}})),complete<ModelTurn>());
      assert.notEqual(r.status,'COMPLETE',mode);
      assert.equal(creds,mode==='unsupported'||mode==='unsupported-schema'?0:1);
      assert.equal(server.calls(),creds);
    }finally{await server.close();}
  }
});
test('cancellation during actual credential wait prevents HTTP and joins credential',async()=>{
  const server=await serve((_r,s)=>send(s,open('ok')));
  try{
    const abort=new AbortController();let settled=false;
    const m=new ModelElement(profile(server.base,'openai-chat',{credential:async()=>{abort.abort();await sleep(25);settled=true;return 'token';}}));
    const r=await session(control({signal:abort.signal})).run(root=>m.generate(root,req()),complete<ModelTurn>());
    assert.notEqual(r.status,'COMPLETE');assert.equal(settled,true);assert.equal(server.calls(),0);
  }finally{await server.close();}
});
test('credential failure consumes call; forged or incomplete tool history cannot reach wire',async()=>{
  const server=await serve((_r,s)=>send(s,open('ok')));
  try{
    let creds=0;const m=new ModelElement(profile(server.base,'openai-chat',{credential:()=>{creds++;throw Error('private');}}));
    const c=control();const s=session({...c,limits:{...c.limits,model:{maxCalls:1,maxRetries:1,maxOutputTokens:32}}});
    const r=await s.run(async root=>{
      assert.notEqual((await m.generate(root,req())).status,'COMPLETE');
      assert.notEqual((await m.generate(root,req({action:'retry'}))).status,'COMPLETE');
      assert.equal(creds,1);return fail('EXPECTED');
    },complete<never>());
    assert.notEqual(r.status,'COMPLETE');assert.equal(server.calls(),0);
    const p=new ModelElement(profile(server.base));
    const fake:ModelTurn={requestId:'x',attempt:1,text:'fake',calls:[],usage:{input:null,output:null,total:null,kind:'unavailable'}};
    const q=await session().run(root=>p.generate(root,req({action:'continue',input:[{role:'assistant',turn:fake}]})),complete<ModelTurn>());
    assert.notEqual(q.status,'COMPLETE');assert.equal(server.calls(),0);
  }finally{await server.close();}
});
test('actual timeout and response byte cap stop wire read',async()=>{
  for(const mode of ['timeout','bytes'] as const){
    const server=await serve(async(_r,s)=>{if(mode==='timeout'){await sleep(150);send(s,open('ok'));}else send(s,open('x'.repeat(2000)));});
    try{
      const p=profile(server.base,'openai-chat',{limits:{requestBytes:4096,responseBytes:512,maxOutputTokens:32,timeoutMs:mode==='timeout'?50:1000}});
      const r=await session().run(root=>new ModelElement(p).generate(root,req()),complete<ModelTurn>());
      assert.notEqual(r.status,'COMPLETE');assert.equal(server.calls(),1);
    }finally{await server.close();}
  }
});


test('actual HTTP model proposal admits only projected capability and slot; real typed node executes once',async()=>{
  for(const mode of ['valid','unprojected-capability','unprojected-slot','forged','relabeled'] as const){
    let calls=0,runs=0;
    const server=await serve((_r,s,b)=>{
      calls++;
      const last=obj(arr(b.messages).at(-1));
      const proposed:unknown=JSON.parse(String(last.content));
      send(s,open(JSON.stringify(proposed)));
    });
    try{
      const m=new ModelElement(profile(server.base));
      const slot=createWorkflowSlot('quote',(v):v is number=>typeof v==='number'&&Number.isSafeInteger(v));
      const cap=bindWorkflowFunction<number,number>({id:'calculate',description:'real typed calculation',
        inputs:{value:slot},outputs:{value:slot},model:{schema:{type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false},describe:'double approved quote'},
        input:r=>r.read('value',slot),node:{id:'calculate',goal:'actual result',requiredKnowledge:[],before:()=>ok(undefined),
          run:v=>{runs++;return ok(2*v);},after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',slot,v)});
      const knowledge={current:()=>({epoch:1,context:{scope:'root',revisions:new Map([['quote','r1']])}}),equal:Object.is,maxItems:1};
      const c=control({knowledge});
      const d:WorkflowRegionDefinition<void,number>={id:'domain',goal:'actual result',constraints:[],
        limits:{maxWork:10000000,maxDescendantDepth:0,maxCandidateBytes:16384,maxJsonDepth:16,maxJsonItems:1024,maxNodes:10,maxBindings:8,maxEdits:4,maxProjectionBytes:16384},
        capabilities:[cap],knowledge,current:()=>true,requiredKnowledge:[{key:'quote',accepts:['authority']}],optionalKnowledge:[],
        contextSlots:{quote:slot},layout:[{kind:'gap',id:'flex',templates:[],seed:[]}],replay:'never',
        refresh:(_i,_root,_prev,w)=>{const r=w.put('quote',slot,7);return r.status!=='COMPLETE'?r:ok({changed:[],dependencies:[{key:'quote',dependsOn:[]}],
          observations:[{key:'quote',origin:'authority',state:'known',value:7,source:{id:'quote',scope:'root',revision:'r1'}}],slotEvidence:{quote:['quote']}});},
        plan:async(v,root)=>{
          const ready=v.progress.some(p=>p.state==='accepted');
          const p:WorkflowRegionProposal={runId:v.runId,regionId:v.regionId,planRevision:v.planRevision??0,factRevision:v.factRevision,action:ready?'finish':'continue',
            edits:ready?[]:[{kind:'insert',gap:'flex',node:{alias:'a',capability:'calculate',input:{value:{kind:'context',slot:'quote'}}}}]};
          if(ready)return ok({source:'native',proposal:p});
          if(mode==='forged')return ok({source:'model',proposal:p,access:{capabilities:['calculate'],contextSlots:['quote'],resultSlots:[]}});
          const t=await m.generate(root,req({tools:[],input:[{role:'user',text:JSON.stringify(p)}],output:{kind:'json',strict:false}}));
          if(t.status!=='COMPLETE')return t;
          const raw=t.value.json as unknown as WorkflowRegionProposal;
          if(mode==='relabeled')return ok({source:'native',proposal:raw});
          return ok({source:'model',proposal:raw,access:{capabilities:mode==='unprojected-capability'?[]:['calculate'],contextSlots:mode==='unprojected-slot'?[]:['quote'],resultSlots:[]}});
        },admit:()=>ok(undefined),canSkip:()=>ok(undefined),canRebind:()=>ok(undefined),
        complete:v=>v.reader.read(v.progress.find(n=>n.state==='accepted')!.instanceId+'/value',slot)};
      const s=session({...c,limits:{...c.limits,maxWork:20000000,maxEvents:200}});
      const r=await s.run(root=>runWorkflowRegion(root,d,undefined),{...complete<number>(),validate:v=>v===14?ok(undefined):fail('WRONG_RESULT')});
      assert.equal(r.status==='COMPLETE',mode==='valid',mode);assert.equal(runs,mode==='valid'?1:0);assert.equal(calls,mode==='forged'?0:1);
    }finally{await server.close();}
  }
});

test('selection observer cannot mutate already prepared HTTP request, overrun stops new work',async()=>{
  const wire:Obj[]=[];
  const server=await serve((_r,s,b)=>{wire.push(b);send(s,open('ok',{prompt_tokens:2,completion_tokens:33,total_tokens:35}));});
  try{
    const m=new ModelElement(profile(server.base));
    const mutable={...req(),maxOutputTokens:32,system:'original'};
    const c=control({observe:r=>{if(r.kind==='model'&&r.action==='selected'){mutable.system='mutated';mutable.maxOutputTokens=64;}}});
    let ordinary=0;
    const result=await session(c).run(async root=>{
      const first=await m.generate(root,mutable);
      assert.notEqual(first.status,'COMPLETE');
      assert.notEqual((await root.invoke(()=>++ordinary)).status,'COMPLETE');
      return first;
    },complete<ModelTurn>());
    assert.notEqual(result.status,'COMPLETE');assert.equal(ordinary,0);assert.equal(server.calls(),1);
    assert.equal(wire[0]?.max_completion_tokens,32);
    assert.equal(obj(arr(wire[0]?.messages)[0]).content,'original');
  }finally{await server.close();}
});
test('continuation rejects altered prefix, duplicate result ID, stale and foreign accepted turns before credentials',async()=>{
  for(const mode of ['prefix','duplicate','stale','foreign','missing'] as const){
    let credentials=0,epoch=1;
    const server=await serve((_r,s)=>send(s,{choices:[{message:{role:'assistant',content:null,tool_calls:['A','B'].map(x=>({id:'call-'+x,type:'function',function:{name:'quote',arguments:JSON.stringify({offer:x})}}))},finish_reason:'tool_calls'}]}));
    try{
      const m=new ModelElement(profile(server.base,'openai-chat',{credential:()=>{credentials++;return 'token';}}));
      const c=control({knowledge:{current:()=>({epoch,context:{scope:'root',revisions:new Map()}}),equal:Object.is,maxItems:0}});
      const r=await session(c).run(async root=>{
        const a=value(await m.generate(root,req()));
        if(mode==='stale')epoch++;
        const results=a.calls.map((x,i)=>({callId:mode==='duplicate'?'call-A':x.id,value:i,error:false}));
        if(mode==='missing')results.pop();
        const next=req({action:'continue',requestKey:'next',input:[{role:'user',text:mode==='prefix'?'Altered':'Compare offers'},
          {role:'assistant',turn:a},{role:'tool-results',results}]});
        if(mode==='foreign')return root.child(0,scope=>m.generate(scope,next));
        return m.generate(root,next);
      },complete<ModelTurn>());
      assert.notEqual(r.status,'COMPLETE',mode);assert.equal(credentials,1,mode);assert.equal(server.calls(),1,mode);
    }finally{await server.close();}
  }
});
test('explicit fallback shares request ID and consumes retry; successful key cannot be retried',async()=>{
  const server=await serve((r,s)=>{if(r.headers.authorization==='Bearer fail'){s.statusCode=429;s.end();}else send(s,open('ok'));});
  try{
    const events:{id:string;attempt:number;action:string}[]=[];
    const a=new ModelElement(profile(server.base,'openai-chat',{id:'first',credential:()=> 'fail'}));
    const b=new ModelElement(profile(server.base,'openai-chat',{id:'fallback'}));
    const r=await session(control({observe:r=>{if(r.kind==='model'&&'requestId'in r)events.push({id:r.requestId,attempt:r.attempt,action:r.action});}})).run(async root=>{
      assert.notEqual((await a.generate(root,req())).status,'COMPLETE');
      const second=await b.generate(root,req({action:'fallback'}));assert.equal(second.status,'COMPLETE');
      assert.notEqual((await b.generate(root,req({action:'retry'}))).status,'COMPLETE');
      return second;
    },complete<ModelTurn>());
    assert.equal(r.status,'COMPLETE');assert.equal(server.calls(),2);assert.equal(new Set(events.map(x=>x.id)).size,1);
    assert.deepEqual(events.map(x=>[x.attempt,x.action]),[[1,'selected'],[1,'result'],[2,'fallback'],[2,'result']]);
  }finally{await server.close();}
});

test('actual model-origin child and grandchild initial are delegated, locally bound and executed; private paths denied',async()=>{
  for(const mode of ['valid','unprojected','cross-scope','undelegated'] as const){
    const server=await serve((_r,s,b)=>{
      const last=obj(arr(b.messages).at(-1));
      send(s,open(String(last.content)));
    });
    try{
      const m=new ModelElement(profile(server.base)),count={child:0,grandchild:0,leaf:0};
      const slot=createWorkflowSlot('number',(v):v is number=>typeof v==='number'&&Number.isSafeInteger(v));
      const model={schema:{type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false},describe:'typed scoped input'} as const;
      const knowledge={current:()=>({epoch:1,context:{scope:'root',revisions:new Map<string,string>()}}),equal:Object.is,maxItems:0};
      const c=control({knowledge});
      const limits={maxWork:30000000,maxDescendantDepth:2,maxCandidateBytes:16384,maxJsonDepth:16,maxJsonItems:1024,maxNodes:16,maxBindings:16,maxEdits:4,maxProjectionBytes:16384};
      const leaf=bindWorkflowFunction<number,number>({id:'leaf',description:'actual leaf',inputs:{value:slot},outputs:{value:slot},model,
        input:r=>r.read('value',slot),node:{id:'leaf',goal:'actual leaf',requiredKnowledge:[],before:()=>ok(undefined),
          run:v=>{count.leaf++;return ok(2*v);},after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',slot,v)});
      const native=(v:import('../../src/index.js').WorkflowRegionView,done:boolean)=>ok({source:'native' as const,proposal:{
        runId:v.runId,regionId:v.regionId,planRevision:v.planRevision??0,factRevision:v.factRevision,edits:[],action:done?'finish' as const:'continue' as const}});
      const definition=(name:string,input:number,caps:readonly WorkflowCapability[],depth:number):WorkflowRegionDefinition<number,number>=>({
        id:name,goal:'actual recursive result',limits:{...limits,maxDescendantDepth:depth},capabilities:caps,constraints:[],knowledge,current:()=>true,
        requiredKnowledge:[],optionalKnowledge:[],contextSlots:{},layout:[{kind:'gap',id:'flex',templates:[],seed:[]}],replay:'never',
        refresh:()=>ok({changed:[],dependencies:[],observations:[],slotEvidence:{}}),
        plan:v=>native(v,v.progress.some(p=>p.state==='accepted')),
        admit:()=>ok(undefined),canSkip:()=>ok(undefined),canRebind:()=>ok(undefined),
        complete:v=>{const n=v.progress.find(p=>p.state==='accepted');if(!n)return fail('MISSING_RESULT');
          const result=v.reader.read(n.instanceId+'/value',slot);return result.status==='COMPLETE'?ok(input+result.value):result;}
      });
      const wrap=(name:'child'|'grandchild',caps:readonly WorkflowCapability[],depth:number)=>bindWorkflowRegion<number,number>({
        id:name,description:name,inputs:{value:slot},outputs:{value:slot},model,input:r=>r.read('value',slot),output:(v,w)=>w.put('value',slot,v),
        node:{id:name,goal:name,requiredKnowledge:[],before:()=>ok(undefined),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
        create:v=>{count[name]++;return ok(definition(name,v,caps,depth));}
      });
      const grandchild=wrap('grandchild',[leaf],0);
      const child=wrap('child',mode==='undelegated'?[grandchild]:[grandchild,leaf],1);
      const nested:WorkflowNodeProposal={alias:'grandchild',capability:'grandchild',input:{value:{kind:'literal',value:3}},initial:[
        {alias:'leaf',capability:'leaf',input:{value:mode==='cross-scope'?{kind:'context',slot:'private'}:{kind:'literal',value:4}}}]};
      const outer:WorkflowRegionDefinition<number,number>={...definition('outer',0,[child,grandchild,leaf],2),plan:async(v,root)=>{
        if(v.progress.some(p=>p.state==='accepted'))return native(v,true);
        const p:WorkflowRegionProposal={runId:v.runId,regionId:v.regionId,planRevision:v.planRevision??0,factRevision:v.factRevision,action:'continue',edits:[
          {kind:'insert',gap:'flex',node:{alias:'child',capability:'child',input:{value:{kind:'literal',value:2}},initial:[nested]}}]};
        const result=await m.generate(root,req({tools:[],input:[{role:'user',text:JSON.stringify(p)}],output:{kind:'json',strict:false}}));
        return result.status!=='COMPLETE'?result:ok({source:'model',proposal:result.value.json as unknown as WorkflowRegionProposal,
          access:{capabilities:mode==='unprojected'?['child','grandchild']:['child','grandchild','leaf'],contextSlots:[],resultSlots:[]}});
      }};
      const s=new StandardWorkflowSession({maxCalls:200,maxSteps:300,maxDepth:5},{...c,limits:{...c.limits,maxWork:40000000,maxEvents:300,maxActiveScopes:16}});
      const r=await s.run(root=>runWorkflowRegion(root,outer,0),{...complete<number>(),validate:v=>v===13?ok(undefined):fail('INVALID_RESULT')});
      assert.equal(r.status==='COMPLETE',mode==='valid',mode);assert.equal(server.calls(),1);
      assert.equal(count.leaf,mode==='valid'?1:0,mode);
      assert.equal(count.child,mode==='valid'||mode==='undelegated'?1:0,mode);
      if(mode==='valid'){
        assert.deepEqual(r,ok(13));assert.equal(count.grandchild,1);
        assert.deepEqual(s.dispositions().filter(x=>x.kind==='node').map(x=>x.occurrence.definitionId),['leaf','grandchild','child']);
      }
    }finally{await server.close();}
  }
});

test('both protocols distinguish missing content from present empty text and valid tool-only turns',async()=>{
  for(const protocol of ['openai-chat','anthropic-messages'] as const)for(const mode of ['missing','null','empty-blocks','empty-text','text','tool'] as const){
    const server=await serve((_r,s)=>{
      if(protocol==='openai-chat'){
        const message={role:'assistant',...(mode==='missing'||mode==='empty-blocks'?{}:{content:mode==='null'||mode==='tool'?null:mode==='empty-text'?'':'ok'}),
          ...(mode==='tool'?{tool_calls:[{id:'call-q',type:'function',function:{name:'quote',arguments:'{"offer":"A"}'}}]}:{})};
        send(s,{choices:[{message,finish_reason:mode==='tool'?'tool_calls':'stop'}]});
      }else{
        const content=mode==='null'?null:mode==='empty-blocks'?[]:mode==='tool'?[{type:'tool_use',id:'call-q',name:'quote',input:{offer:'A'}}]:
          [{type:'text',text:mode==='empty-text'?'':'ok'}];
        send(s,{...(mode==='missing'?{}:{content}),stop_reason:mode==='tool'?'tool_use':'end_turn'});
      }
    });
    try{
      const m=new ModelElement(profile(server.base,protocol));
      const s=session();
      const r=await s.run(root=>m.generate(root,req({tools:mode==='tool'?[tool]:[]})),complete<ModelTurn>());
      assert.equal(r.status==='COMPLETE',['empty-text','text','tool'].includes(mode),protocol+' '+mode);
      assert.equal(server.calls(),1);
      if(r.status==='COMPLETE'){assert.equal(r.value.text,mode==='text'?'ok':'');assert.equal(r.value.calls.length,mode==='tool'?1:0);}
    }finally{await server.close();}
  }
});

test('explicit nonthinking profile sends only supported control in both protocols; default unchanged',async()=>{
  for(const protocol of ['openai-chat','anthropic-messages'] as const){
    const wires:Obj[]=[];
    const server=await serve((_r,s,b)=>{
      wires.push(b);
      if(protocol==='openai-chat')send(s,open('ok'));
      else send(s,{content:[{type:'text',text:'ok'}],stop_reason:'end_turn',usage:{output_tokens:2}});
    });
    try{
      for(const thinking of [undefined,'disabled'] as const){
        const p=profile(server.base,protocol,thinking?{thinking}:{});
        assert.equal((await session().run(root=>new ModelElement(p).generate(root,req({tools:[]})),complete<ModelTurn>())).status,'COMPLETE');
      }
      assert.equal(wires[0]?.thinking,undefined);assert.deepEqual(wires[1]?.thinking,{type:'disabled'});
      assert.throws(()=>new ModelElement({...profile(server.base,protocol),thinking:'enabled'} as unknown as ModelProfile),/MODEL_INVALID_PROFILE/);
      assert.equal(server.calls(),2);
    }finally{await server.close();}
  }
});

test('nonstream indexed tool calls normalize exact ordered metadata; wrong index or opaque fields fail closed',async()=>{
  for(const mode of ['valid','wrong','string','opaque'] as const){
    const wires:Obj[]=[];
    const server=await serve((_r,s,b)=>{
      wires.push(b);
      if(wires.length===1)send(s,{choices:[{message:{role:'assistant',content:null,tool_calls:[{
        index:mode==='wrong'?1:mode==='string'?'0':0,id:'call-indexed',type:'function',function:{name:'quote',arguments:'{"offer":"A"}'},
        ...(mode==='opaque'?{extra:'opaque'}:{})}]},finish_reason:'tool_calls'}]});
      else send(s,open('done'));
    });
    try{
      const m=new ModelElement(profile(server.base));
      const r=await session().run(async root=>{
        const a=await m.generate(root,req());if(a.status!=='COMPLETE')return a;
        const result=await m.generate(root,req({requestKey:'next',action:'continue',input:[
          {role:'user',text:'Compare offers'},{role:'assistant',turn:a.value},{role:'tool-results',results:[{callId:'call-indexed',value:1,error:false}]}]}));
        return result;
      },complete<ModelTurn>());
      assert.equal(r.status==='COMPLETE',mode==='valid');
      assert.equal(server.calls(),mode==='valid'?2:1);
      if(mode==='valid'){
        const toolCall=obj(arr(obj(arr(wires[1]?.messages)[2]).tool_calls)[0]);
        assert.equal(Object.hasOwn(toolCall,'index'),false);assert.equal(toolCall.id,'call-indexed');
      }
    }finally{await server.close();}
  }
});
