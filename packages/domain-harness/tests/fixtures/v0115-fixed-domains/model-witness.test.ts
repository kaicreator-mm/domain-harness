import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ModelElement, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { ModelProfile, ModelRequest, NativeWorkflowContext, StandardJsonValue as J, WorkflowObservation, WorkflowNodeOptions } from '@kaicreator/domain-harness';
import { fixture, ok, reject, optimize, planMetrics, solveRepair, scheduleMetrics } from './domain.js';
import type { Demand, Plan, Schedule } from './domain.js';

const integer={type:'integer'} as const;
const demandSchema={type:'object',properties:{lead:integer,budget:integer},required:['lead','budget'],additionalProperties:false} as const;
const planSchema={type:'object',properties:{counts:{type:'array',items:integer},cost:integer,lead:integer},
  required:['counts','cost','lead'],additionalProperties:false} as const;
const deadlineSchema={type:'object',properties:{deadline:integer},required:['deadline'],additionalProperties:false} as const;
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const objects=(v:unknown):Record<string,unknown>[]=>{
  assert.ok(Array.isArray(v)&&v.every(obj));return v as Record<string,unknown>[];
};
const demand=(v:unknown):v is Demand=>obj(v)&&typeof v.lead==='number'&&Number.isSafeInteger(v.lead)&&typeof v.budget==='number'&&Number.isSafeInteger(v.budget);
const plan=(v:unknown):v is Plan=>obj(v)&&Array.isArray(v.counts)&&v.counts.every((n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n))
  &&typeof v.cost==='number'&&typeof v.lead==='number';
async function serve(handler:(r:IncomingMessage,s:ServerResponse,body:Record<string,unknown>)=>void){
  let count=0;
  const server=createServer((r,s)=>{void(async()=>{
    count++;let data='';for await(const chunk of r)data+=String(chunk);
    const body:unknown=JSON.parse(data);assert.ok(obj(body));handler(r,s,body);
  })().catch(()=>{s.statusCode=500;s.end();});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  return {base:'http://127.0.0.1:'+address.port,count:()=>count,close:()=>new Promise<void>(res=>{server.close(()=>res());server.closeAllConnections();})};
}
const send=(res:ServerResponse,v:unknown)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(v));};
const profile=(base:string,protocol:ModelProfile['protocol']):ModelProfile=>({
  id:'domain-loopback-'+protocol,model:'scripted-protocol-fixture',protocol,
  endpoint:base+(protocol==='openai-chat'?'/v1/chat/completions':'/v1/messages'),credential:()=> 'fixture-only',
  ...(protocol==='openai-chat'?{tokenField:'max_completion_tokens' as const}:{anthropicVersion:'2023-06-01'}),
  features:{tools:true,jsonSchema:true,toolsWithJsonSchema:true},
  limits:{requestBytes:16384,responseBytes:16384,maxOutputTokens:256,timeoutMs:2000}});
const make=()=>{
  const trace:WorkflowObservation[]=[];
  const knowledge={current:()=>({epoch:1,context:{scope:'domain',revisions:new Map([['authority','1']])}}),equal:Object.is,maxItems:1};
  const current=()=>true, options:WorkflowNodeOptions={knowledge,current};
  const session=new StandardWorkflowSession({maxCalls:100,maxSteps:150,maxDepth:3},{
    knowledge,current,limits:{maxWork:10000000,maxEvents:100,maxActiveScopes:8,maxActiveMs:30000,maxSettlementMs:2000,maxNoProgress:5,
      model:{maxCalls:4,maxRetries:1,maxOutputTokens:256}},observe:r=>{trace.push(r);}
  });
  return {trace,options,session};
};
const request=(key:string,input:ModelRequest['input'],patch:Partial<ModelRequest>={}):ModelRequest=>({
  system:'Use only authoritative domain facts, return proposal not authority.',
  input,tools:[],output:{kind:'text'},maxOutputTokens:256,requestKey:key,action:'initial',reason:'actual domain model integration',...patch
});
const finish=(text:string)=>({choices:[{message:{role:'assistant',content:text},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}});

test('public D-A model tool loop actually optimizes procurement and validates model candidate independently',async()=>{
  for(const mode of ['valid','fabricated-plan'] as const){
    const offers=fixture.DA.offers,required:Demand={lead:3,budget:75};
    const expected=fixture.DA.enumeration.cases.find(c=>c.lead===3&&c.budget===75)?.optimum;
    assert.ok(expected);
    let hit=0,solves=0,checks=0;
    const endpoint=await serve((_r,s,b)=>{
      hit++;
      const msgs=objects(b.messages);
      if(hit===1){
        assert.ok(JSON.stringify(b.tools).includes('optimize_purchase'));
        send(s,{choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'solve-1',type:'function',
          function:{name:'optimize_purchase',arguments:JSON.stringify(required)}}]},finish_reason:'tool_calls'}],
          usage:{prompt_tokens:90,completion_tokens:18,total_tokens:108}});
      }else{
        const last=msgs.at(-1)!;assert.equal(last.tool_call_id,'solve-1');
        const actual:unknown=JSON.parse(String(last.content));
        assert.deepEqual(actual,{value:expected,error:false});
        // 服务只构造有限协议响应；业务结果来自 SDK 真实工具执行。
        send(s,finish(JSON.stringify(mode==='valid'?expected:{...expected,cost:1})));
      }
    });
    try{
      const d=make(),m=new ModelElement(profile(endpoint.base,'openai-chat'));
      const tools=[{name:'optimize_purchase',description:'Enumerate all feasible compatible pack counts',inputSchema:demandSchema}];
      const history=[{role:'user' as const,text:'Find six compatible units within 3 days and budget 75; offers '+JSON.stringify(offers)}];
      const r=await d.session.run(async root=>{
        const first=await m.generate(root,request('select',history,{tools}));
        if(first.status!=='COMPLETE')return first;
        const call=first.value.calls[0];
        if(first.value.calls.length!==1||!call||call.name!=='optimize_purchase'||!demand(call.input)
          ||call.input.lead!==required.lead||call.input.budget!==required.budget)return reject<Plan>('MODEL_TOOL_NOT_AUTHORIZED');
        const actual=await root.node({id:'actual-purchase',goal:'find optimum',requiredKnowledge:[],
          before:()=>ok(undefined),run:i=>{solves++;const p=optimize(offers,i);return p?ok(p):reject<Plan>('INFEASIBLE');},
          after:(i,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&planMetrics(offers,a.outcome.value.counts,i)?.cost===a.outcome.value.cost?ok(undefined):reject('INVALID'),
          project:()=>({effect:'none',detail:null})},call.input,d.options);
        if(actual.status!=='COMPLETE')return actual;
        const projected:J={counts:actual.value.counts,cost:actual.value.cost,lead:actual.value.lead};
        const final=await m.generate(root,request('finish',[...history,{role:'assistant',turn:first.value},
          {role:'tool-results',results:[{callId:call.id,value:projected,error:false}]}],
          {tools,action:'continue',output:{kind:'json',strict:true,schema:planSchema}}));
        if(final.status!=='COMPLETE')return final;
        const proposed=final.value.json;
        return root.node({id:'actual-verify',goal:'verify selected proposal against optimum',requiredKnowledge:[],
          before:()=>ok(undefined),run:v=>{checks++;if(!plan(v))return reject<Plan>('INVALID_MODEL_PLAN');
            const computed=planMetrics(offers,v.counts,required);
            return computed&&computed.cost===v.cost&&computed.lead===v.lead&&computed.cost===actual.value.cost?ok(computed):reject<Plan>('INVALID_MODEL_PLAN');},
          after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},proposed,d.options);
      },{goal:'actual optimum',requiredKnowledge:[],terminalReads:0,validate:p=>p.cost===expected.cost&&p.lead===expected.lead?ok(undefined):reject('GOAL')});
      assert.equal(r.status==='COMPLETE',mode==='valid');
      if(r.status==='COMPLETE')assert.deepEqual(r.value,expected);
      assert.equal(solves,1);assert.equal(checks,1);assert.equal(endpoint.count(),2);
      assert.equal(d.trace.filter(x=>x.kind==='model'&&x.action==='result').length,2);
      assert.equal(new Set(d.trace.map(x=>x.runId)).size,1);
    }finally{await endpoint.close();}
  }
});
test('public D-B model semantic constraint is validated before actual SciPy solver',async()=>{
  for(const mode of ['valid','invalid-deadline'] as const){
    let solves=0,validated=0;
    const endpoint=await serve((_r,s,b)=>{
      assert.ok(b.output_config);assert.ok(String(b.system).includes('authoritative'));
      send(s,{content:[{type:'text',text:JSON.stringify({deadline:mode==='valid'?7:99})}],stop_reason:'end_turn',
        usage:{input_tokens:30,output_tokens:4,cache_creation_input_tokens:0,cache_read_input_tokens:0}});
    });
    try{
      const d=make(),m=new ModelElement(profile(endpoint.base,'anthropic-messages')),jobs=fixture.DB.jobs;
      const parse=(root:NativeWorkflowContext)=>m.generate(root,request('extract',[{role:'user',text:'All repairs must finish no later than hour seven.'}],
        {output:{kind:'json',strict:true,schema:deadlineSchema}}));
      const r=await d.session.run(async root=>{
        const proposed=await root.node({id:'semantic',goal:'extract business deadline',requiredKnowledge:[],
          before:()=>ok(undefined),run:(_v,scope)=>parse(scope),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},undefined,d.options);
        if(proposed.status!=='COMPLETE')return proposed;
        const extracted=proposed.value.json;
        const actual=await root.node({id:'solve',goal:'actual constrained schedule',requiredKnowledge:[],
          before:v=>{validated++;return obj(v)&&v.deadline===7?ok(undefined):reject('UNAUTHORIZED_CONSTRAINT');},
          run:(v,scope)=>{solves++;return obj(v)&&v.deadline===7?solveRepair(jobs,v.deadline,scope.signal):reject<Schedule>('INVALID_CONSTRAINT');},
          after:(_v,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&scheduleMetrics(jobs,a.outcome.value.starts,7)!==null?ok(undefined):reject('INVALID_SCHEDULE'),
          project:()=>({effect:'none',detail:null})},extracted,d.options);
        return actual;
      },{goal:'actual optimum and constraint',requiredKnowledge:[],terminalReads:0,validate:s=>{
        const m=scheduleMetrics(jobs,s.starts,7);
        return m&&m.makespan===fixture.DB.enumeration.best[0]&&m.sum===fixture.DB.enumeration.best[1]?ok(undefined):reject('GOAL');}});
      assert.equal(r.status==='COMPLETE',mode==='valid');assert.equal(validated,1);
      assert.equal(solves,mode==='valid'?1:0);assert.equal(endpoint.count(),1);
      assert.equal(d.trace.filter(x=>x.kind==='model'&&x.action==='result').length,1);
      assert.equal(new Set(d.trace.map(x=>x.runId)).size,1);
    }finally{await endpoint.close();}
  }
});
