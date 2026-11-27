import assert from 'node:assert/strict';
import test from 'node:test';
import { ModelElement, StandardWorkflowSession, InteractionElement, bindWorkflowFunction, bindWorkflowRegion, createWorkflowSlot, runWorkflowRegion } from '@kaicreator/domain-harness';
import type { ModelProfile, ModelRequest, ModelTurn, NativeWorkflowContext, WorkflowNode, WorkflowRegionDefinition, WorkflowCapability,
  WorkflowRegionProposal, WorkflowRegionView, WorkflowObservation, StandardJsonValue as J } from '@kaicreator/domain-harness';
import { fixture, ok, reject, optimize, planMetrics, solveRepair, scheduleMetrics } from './domain.js';
import type { Demand, Plan, Schedule, Outcome } from './domain.js';

// Explicit finite live suite; never part of offline test discovery. Only synthetic frozen public data leaves this process.
function model(protocol:ModelProfile['protocol']){
  return new ModelElement({id:'live-deepseek-'+protocol,model:'deepseek-flash',protocol,
    endpoint:protocol==='openai-chat'?'https://api.deepseek.com/chat/completions':'https://api.deepseek.com/anthropic/v1/messages',
    credential:()=>{const key=process.env.DH_DEEPSEEK_API_KEY;if(!key)throw Error('PROFILE_MISSING');return key;},
    ...(protocol==='openai-chat'?{tokenField:'max_tokens' as const}:{anthropicVersion:'2023-06-01'}),
    thinking:'disabled',features:{tools:true,jsonSchema:false,toolsWithJsonSchema:false},
    limits:{requestBytes:32768,responseBytes:65536,maxOutputTokens:1024,timeoutMs:20000}});
}
const obj=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const demand=(v:unknown):v is Demand=>obj(v)&&Object.keys(v).length===2&&Number.isSafeInteger(v.lead)&&Number.isSafeInteger(v.budget);
const plan=(v:unknown):v is Plan=>obj(v)&&Object.keys(v).length===3&&Array.isArray(v.counts)&&v.counts.every(Number.isSafeInteger)&&Number.isSafeInteger(v.cost)&&Number.isSafeInteger(v.lead);
const integer={type:'integer'} as const;
const demandSchema={type:'object',properties:{lead:integer,budget:integer},required:['lead','budget'],additionalProperties:false} as const;
const deadlineSchema={type:'object',properties:{deadline:integer},required:['deadline'],additionalProperties:false} as const;
const request=(key:string,input:ModelRequest['input'],patch:Partial<ModelRequest>={}):ModelRequest=>({
  system:'Follow the business request. Tools are proposals only. When JSON is requested, return exactly one JSON object without markdown or extra text.',
  input,tools:[],output:{kind:'json',strict:false},maxOutputTokens:1024,requestKey:key,action:'initial',reason:'finite public actual domain validation',...patch
});
const settings=()=>{
  let epoch=1;
  const knowledge={maxItems:2,equal:Object.is,current:()=>({epoch,context:{scope:'domain',revisions:new Map([['constraint',String(epoch)],['offers','1']])}})};
  const current=()=>true,trace:WorkflowObservation[]=[];
  const session=new StandardWorkflowSession({maxCalls:400,maxSteps:600,maxDepth:5},{
    knowledge,current,limits:{maxWork:50000000,maxEvents:400,maxActiveScopes:16,maxNoProgress:6,maxActiveMs:120000,maxSettlementMs:2000,
      model:{maxCalls:6,maxRetries:0,maxOutputTokens:1024}},observe:r=>{trace.push(r);}
  });
  return {knowledge,current,session,trace,advance:()=>{epoch++;}};
};
function requireComplete<T>(r:Outcome<T>):T{
  if(r.status!=='COMPLETE')throw Error('ACTUAL_'+r.status+'_'+r.reason.code);
  return r.value;
}
function usage(trace:readonly WorkflowObservation[],expected:number){
  const events=trace.filter(x=>x.kind==='model'&&x.action==='result');
  assert.equal(events.length,expected);
  assert.equal(new Set(trace.map(x=>x.runId)).size,1);
  assert.ok(events.every(x=>x.kind==='model'&&x.usage.kind==='observed'&&x.usage.output!==null&&x.usage.output<=1024));
  console.log(JSON.stringify({actualModelAttempts:events.map(x=>x.kind==='model'&&x.action==='result'?{action:x.action,profileId:x.profileId,usage:x.usage}:null)}));
}
async function feedback(root:NativeWorkflowContext,value:number):Promise<Outcome<number>>{
  const interaction=new InteractionElement({onPrompt:(p,e)=>{setImmediate(()=>e.submit({
    intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{constraint:value}}));}});
  return interaction.runIn(root,scope=>scope.resolve<number,number>(0,(_state,event)=>event.kind==='initial'?
    ok({kind:'clarify',state:1,prompt:{decisionKey:'constraint',title:'Confirm actual changed constraint',actions:['submit'],
      fields:[{id:'constraint',kind:'number',label:'constraint',required:true}]}}):
    event.response.action==='submit'&&typeof event.response.values.constraint==='number'?ok({kind:'ready',intent:event.response.values.constraint}):reject('INVALID_FEEDBACK')));
}
for(const protocol of ['openai-chat','anthropic-messages'] as const){
  test('LIVE D-A '+protocol+' direct and selected tool share native function, actual feedback and provider reentry',async()=>{
    const d=settings(),m=model(protocol),offers=fixture.DA.offers;let solves=0,checks=0;
    const solver:WorkflowNode<Demand,Plan>={id:'optimize-purchase',goal:'actual minimum feasible cost',requiredKnowledge:[],replay:'pure-read-only',
      before:i=>demand(i)&&i.budget===75&&[3,5].includes(i.lead)?ok(undefined):reject('DOMAIN_TOOL_DENIED'),
      run:i=>{solves++;const result=optimize(offers,i);return result?ok(result):reject('NO_PLAN');},
      after:(i,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&planMetrics(offers,a.outcome.value.counts,i)?.cost===a.outcome.value.cost?ok(undefined):reject('PLAN_POST'),
      project:()=>({effect:'none',detail:{calculation:'enumeration'}})};
    const tools=[{name:'optimize_purchase',description:'Compute an authoritative optimum using current compatible supplier offers. Input lead deadline in days and total budget.',inputSchema:demandSchema}];
    const result=await d.session.run(async root=>{
      const first=await root.node(solver,{lead:5,budget:75},d);
      if(first.status!=='COMPLETE')return first;
      assert.equal(first.value.cost,fixture.DA.enumeration.cases.find(c=>c.lead===5&&c.budget===75)?.optimum?.cost);
      const changed=await feedback(root,3);if(changed.status!=='COMPLETE')return changed;d.advance();
      const required:Demand={lead:changed.value,budget:75};
      const history=[{role:'user' as const,text:'Purchase six compatible units. New deadline '+required.lead+' days, budget '+required.budget+'. Call optimize_purchase with these exact constraints. After the actual tool result return JSON object with counts, cost, lead from that result. Do not make up a result.'}];
      const selection=await m.generate(root,request('tool',history,{tools,output:{kind:'text'}}));
      if(selection.status!=='COMPLETE')return selection;
      const call=selection.value.calls[0];
      if(selection.value.calls.length!==1||!call||call.name!=='optimize_purchase'||!demand(call.input)||call.input.lead!==required.lead||call.input.budget!==required.budget)return reject<Plan>('MODEL_TOOL_NOT_AUTHORIZED');
      const actual=await root.node(solver,call.input,d);if(actual.status!=='COMPLETE')return actual;
      const data:J={counts:actual.value.counts,cost:actual.value.cost,lead:actual.value.lead};
      const final=await m.generate(root,request('result',[...history,{role:'assistant',turn:selection.value},
        {role:'tool-results',results:[{callId:call.id,value:data,error:false}]}],{action:'continue',tools}));
      if(final.status!=='COMPLETE')return final;
      if(final.value.calls.length)return reject<Plan>('UNEXPECTED_TOOL');
      return root.node({id:'verify-purchase',goal:'verify model result against actual authority',requiredKnowledge:[],
        before:()=>ok(undefined),run:v=>{checks++;if(!plan(v))return reject<Plan>('MODEL_PLAN_SHAPE');
          const p=planMetrics(offers,v.counts,required);return p&&p.cost===v.cost&&p.lead===v.lead&&p.cost===actual.value.cost&&p.lead===actual.value.lead?ok(p):reject<Plan>('MODEL_PLAN_INVALID');},
        after:()=>ok(undefined),project:()=>({effect:'none',detail:{checked:true}})},final.value.json,d);
    },{goal:'current independently validated purchase',requiredKnowledge:[],terminalReads:0,validate:p=>
      planMetrics(offers,p.counts,{lead:3,budget:75})?.cost===64&&p.cost===64&&p.lead===3?ok(undefined):reject('FINAL_GOAL')});
    assert.equal(requireComplete(result).cost,64);assert.equal(solves,2);assert.equal(checks,1);
    const occurrences=d.session.dispositions().filter(x=>x.kind==='node'&&x.occurrence.definitionId==='optimize-purchase');
    assert.equal(occurrences.length,2);assert.ok(occurrences.every(x=>x.kind==='node'&&x.acceptance==='accepted'));
    usage(d.trace,2);
  });
}

test('LIVE D-B fixed semantic model plus model-generated recursive solver and verified actual result',async()=>{
  const d=settings(),m=model('anthropic-messages'),jobs=fixture.DB.jobs;
  const slot=createWorkflowSlot('deadline',(v):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=8);
  const scheduleSlot=createWorkflowSlot('schedule',(v):v is Schedule=>obj(v)&&Array.isArray(v.starts)&&v.starts.every(Number.isSafeInteger)&&Number.isSafeInteger(v.makespan)&&Number.isSafeInteger(v.sum));
  const limits={maxWork:40000000,maxDescendantDepth:2,maxCandidateBytes:16384,maxJsonDepth:16,maxJsonItems:1024,maxNodes:16,maxBindings:16,maxEdits:4,maxProjectionBytes:16384};
  let solves=0,childRuns=0,grandchildRuns=0,generated=0,confirmed=0;
  let deadline=0;
  const verified=(v:Schedule)=>{const actual=scheduleMetrics(jobs,v.starts,deadline);
    return actual&&actual.makespan===v.makespan&&actual.sum===v.sum&&actual.makespan===fixture.DB.enumeration.best[0]&&actual.sum===fixture.DB.enumeration.best[1];};
  const solver=bindWorkflowFunction<number,Schedule>({id:'solve',description:'Actual SciPy repair schedule for deadline',inputs:{deadline:slot},outputs:{value:scheduleSlot},
    model:{schema:deadlineSchema,describe:'deadline integer from confirmed business constraint'},
    input:r=>r.read('deadline',slot),output:(v,w)=>w.put('value',scheduleSlot,v),
    node:{id:'solve',goal:'actual lexicographic constrained solution',requiredKnowledge:[],before:v=>v===deadline?ok(undefined):reject('DEADLINE_DENIED'),
      run:(v,scope)=>{solves++;return solveRepair(jobs,v,scope.signal);},after:(_v,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&verified(a.outcome.value)?ok(undefined):reject('SOLVER_POST'),
      project:()=>({effect:'none',detail:{solver:'scipy-milp'}})}});
  const native=(v:WorkflowRegionView,done:boolean)=>ok({source:'native' as const,proposal:{runId:v.runId,regionId:v.regionId,planRevision:v.planRevision??0,factRevision:v.factRevision,edits:[],action:done?'finish' as const:'continue' as const}});
  const definition=(id:string,caps:readonly WorkflowCapability[],depth:number):WorkflowRegionDefinition<number,Schedule>=>({
    id,goal:'verified repair schedule',constraints:['confirmed deadline'],limits:{...limits,maxDescendantDepth:depth},capabilities:caps,
    knowledge:d.knowledge,current:d.current,requiredKnowledge:[],optionalKnowledge:[],contextSlots:{},
    layout:[{kind:'gap',id:'flex',templates:[],seed:[]}],replay:'never',
    refresh:()=>ok({changed:[],dependencies:[],observations:[],slotEvidence:{}}),
    plan:v=>native(v,v.progress.some(p=>p.state==='accepted')),
    admit:()=>ok(undefined),canSkip:()=>reject('SKIP_DENIED'),canRebind:()=>reject('REBIND_DENIED'),
    complete:v=>{const n=v.progress.find(p=>p.state==='accepted');if(!n)return reject('MISSING_RESULT');
      const result=v.reader.read(n.instanceId+'/value',scheduleSlot);return result.status==='COMPLETE'&&verified(result.value)?result:reject('INVALID_SCHEDULE');}
  });
  const wrap=(name:'repair-region'|'conflict-region',caps:readonly WorkflowCapability[],depth:number)=>bindWorkflowRegion<number,Schedule>({
    id:name,description:name==='repair-region'?'Delegate schedule construction':'Delegate actual resource conflict solving',
    inputs:{deadline:slot},outputs:{value:scheduleSlot},model:{schema:deadlineSchema,describe:'confirmed deadline integer'},
    input:r=>r.read('deadline',slot),output:(v,w)=>w.put('value',scheduleSlot,v),
    node:{id:name,goal:'actual delegated schedule',requiredKnowledge:[],before:v=>v===deadline?ok(undefined):reject('DEADLINE_DENIED'),after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
    create:v=>{if(name==='repair-region')childRuns++;else grandchildRuns++;return v===deadline?ok(definition(name,caps,depth)):reject('DEADLINE_DENIED');}
  });
  const grandchild=wrap('conflict-region',[solver],0),child=wrap('repair-region',[grandchild,solver],1);
  const result=await d.session.run(async root=>{
    const extract=await root.node<undefined,ModelTurn>({id:'semantic',goal:'extract actual business constraint',requiredKnowledge:[],before:()=>ok(undefined),
      run:(_i,scope)=>m.generate(scope,request('semantic',[{role:'user',text:'The vehicle must be ready by the end of the seventh hour. Extract the integer deadline in a JSON object with only key deadline.'}])),
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},undefined,d);
    if(extract.status!=='COMPLETE')return extract;
    const json=extract.value.json;if(!obj(json)||Object.keys(json).length!==1||json.deadline!==7)return reject<Schedule>('SEMANTIC_INVALID');
    const response=await feedback(root,json.deadline);if(response.status!=='COMPLETE')return response;
    deadline=response.value;confirmed++;d.advance();
    const outer:WorkflowRegionDefinition<number,Schedule>={...definition('outer',[child,grandchild,solver],2),plan:async(v,scope)=>{
      if(v.progress.some(p=>p.state==='accepted'))return native(v,true);
      if(generated++)return reject('NO_REPEAT_GENERATION');
      const meta={runId:v.runId,regionId:v.regionId,planRevision:v.planRevision??0,factRevision:v.factRevision};
      const prompt='Generate the executable workflow topology, not a schedule. Return one bare JSON object without wrapper. Exactly six keys: runId, regionId, planRevision, factRevision, action, edits. Copy metadata exactly: '+JSON.stringify(meta)+
        '. action is "continue". Available capability roles: "repair-region" delegates schedule construction; "conflict-region" delegates resource conflicts inside repair-region; "solve" executes real solver inside conflict-region. Every input requires exactly the key deadline with literal confirmed value '+deadline+
        '. edits is an array with exactly one insert edit. Exact edit format: {"kind":"insert","gap":"flex","node":<node>}. Each region node is {"alias":"<unique alias>","capability":"<region capability>","input":{"deadline":{"kind":"literal","value":<confirmed integer>}},"initial":[<child node>]}. Function node is {"alias":"<unique alias>","capability":"solve","input":{"deadline":{"kind":"literal","value":<confirmed integer>}}}. Use actual capability names, unique alphanumeric/hyphen aliases, replace placeholders, nest repair-region then conflict-region then solve. Do not put initial on solve, omit it completely. No extra keys including type or wrapper. Return only JSON.';
      const r=await m.generate(scope,request('topology',[{role:'user',text:prompt}]));
      return r.status!=='COMPLETE'?r:ok({source:'model',proposal:r.value.json as unknown as WorkflowRegionProposal,
        access:{capabilities:['repair-region','conflict-region','solve'],contextSlots:[],resultSlots:[]}});
    }};
    return runWorkflowRegion(root,outer,deadline);
  },{goal:'independent real repair objective',requiredKnowledge:[],terminalReads:0,validate:v=>verified(v)?ok(undefined):reject('FINAL_GOAL')});
  const s=requireComplete(result);assert.equal(s.makespan,7);assert.equal(s.sum,16);
  assert.deepEqual([confirmed,generated,childRuns,grandchildRuns,solves],[1,1,1,1,1]);
  assert.deepEqual(d.session.dispositions().filter(x=>x.kind==='node').map(x=>x.occurrence.definitionId),['semantic','solve','conflict-region','repair-region']);
  usage(d.trace,2);
});

test('LIVE D-A hybrid model edits pending analysis after actual feedback, retains mandatory source and verification',async()=>{
  const d=settings(),m=model('openai-chat'),offers=fixture.DA.offers;
  let requested:Demand={lead:5,budget:75},asked=false,generated=0,reads=0,solves=0,checks=0,audits=0;
  const sourceSlot=createWorkflowSlot('offers',(v):v is typeof offers=>Array.isArray(v)&&v.every((o:unknown)=>obj(o)&&typeof o.id==='string'&&typeof o.pack==='number'));
  const demandSlot=createWorkflowSlot('demand',demand),planSlot=createWorkflowSlot('plan',plan);
  const meta=(describe:string)=>({schema:{type:'object',properties:{},required:[],additionalProperties:false} as const,describe});
  const query=bindWorkflowFunction<typeof offers,typeof offers>({id:'query',description:'current complete offers',inputs:{value:sourceSlot},outputs:{value:sourceSlot},
    input:r=>r.read('value',sourceSlot),output:(v,w)=>w.put('value',sourceSlot,v),
    node:{id:'query',goal:'actual supplier query',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),run:v=>{reads++;return ok(v);},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})}});
  const indexSlot=createWorkflowSlot('offer-index',(v):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<offers.length);
  const categorySlot=createWorkflowSlot('audit-category',(v):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<3);
  // Every actual supplier record is checked for identity/compatibility classification, pack constraints and terms.
  // Mandatory zero-output audit obligations bind to the immutable source result, not the changing delivery constraint.
  const audit=bindWorkflowFunction<{offers:typeof offers;index:number;category:number},void>({id:'offer-audit',description:'mandatory supplier record field-group validation',
    inputs:{offers:sourceSlot,index:indexSlot,category:categorySlot},outputs:{},
    input:r=>{const a=r.read('offers',sourceSlot),b=r.read('index',indexSlot),c=r.read('category',categorySlot);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:c.status!=='COMPLETE'?c:ok({offers:a.value,index:b.value,category:c.value});},
    output:()=>ok(undefined),
    node:{id:'offer-audit',goal:'validate actual offer field group',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),
      run:i=>{audits++;const o=i.offers[i.index];if(!o)return reject('MISSING_OFFER');
        const valid=i.category===0?o.id.length>0&&i.offers.filter(x=>x.id===o.id).length===1&&typeof o.compatible==='boolean'
          :i.category===1?Number.isSafeInteger(o.pack)&&o.pack>0&&Number.isSafeInteger(o.moq)&&o.moq>=0&&Number.isSafeInteger(o.max)&&o.max>=o.moq
          :Number.isSafeInteger(o.cost)&&o.cost>0&&Number.isSafeInteger(o.lead)&&o.lead>0;
        return valid?ok(undefined):reject('OFFER_AUDIT');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:{audited:true}})}});
  const auditLayout=offers.flatMap((_o,index)=>[0,1,2].map(category=>({
    kind:'anchor' as const,id:'audit-'+index+'-'+category,node:{alias:'audit-'+index+'-'+category,capability:'offer-audit',
      input:{offers:{kind:'result' as const,node:'query',slot:'value'},index:{kind:'literal' as const,value:index},category:{kind:'literal' as const,value:category}}}
  })));
  const solve=bindWorkflowFunction<{offers:typeof offers;demand:Demand},Plan>({id:'solve',description:'actual procurement calculation',
    inputs:{offers:sourceSlot,demand:demandSlot},outputs:{value:planSlot},model:meta('solve with the current offers result and demand context'),
    input:r=>{const a=r.read('offers',sourceSlot),b=r.read('demand',demandSlot);return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({offers:a.value,demand:b.value});},
    output:(v,w)=>w.put('value',planSlot,v),
    node:{id:'solve',goal:'compute actual optimum',requiredKnowledge:[],replay:'pure-read-only',
      before:i=>i.demand.lead===requested.lead&&i.demand.budget===requested.budget?ok(undefined):reject('STALE_CONSTRAINT'),
      run:i=>{solves++;const p=optimize(i.offers,i.demand);return p?ok(p):reject('NO_PLAN');},
      after:(i,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&planMetrics(i.offers,a.outcome.value.counts,i.demand)?.cost===a.outcome.value.cost?ok(undefined):reject('PLAN_POST'),
      project:()=>({effect:'none',detail:null})}});
  const verified=(p:Plan)=>{const actual=planMetrics(offers,p.counts,requested);return actual&&actual.cost===p.cost&&actual.lead===p.lead&&p.cost===72&&p.lead===2;};
  const verify=bindWorkflowFunction<Plan,Plan>({id:'verify',description:'mandatory verify',inputs:{value:planSlot},outputs:{value:planSlot},model:meta('verify the current computed plan'),
    input:r=>r.read('value',planSlot),output:(v,w)=>w.put('value',planSlot,v),
    node:{id:'verify',goal:'verify independently',requiredKnowledge:[],before:()=>ok(undefined),run:v=>{checks++;return verified(v)?ok(v):reject('PLAN_INVALID');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})}});
  const native=(v:WorkflowRegionView,action:WorkflowRegionProposal['action'])=>ok({source:'native' as const,proposal:{
    runId:v.runId,regionId:v.regionId,planRevision:v.planRevision??0,factRevision:v.factRevision,edits:[],action}});
  const dfn:WorkflowRegionDefinition<void,Plan>={id:'purchase-hybrid',goal:'current procurement after actual feedback',constraints:['exact quantity and budget'],
    limits:{maxWork:35000000,maxDescendantDepth:2,maxCandidateBytes:16384,maxJsonDepth:16,maxJsonItems:1024,maxNodes:30,maxBindings:64,maxEdits:8,maxProjectionBytes:16384},
    capabilities:[query,audit,solve,verify],knowledge:d.knowledge,current:d.current,requiredKnowledge:[{key:'constraint',accepts:['authority']},{key:'offers',accepts:['authority']}],optionalKnowledge:[],contextSlots:{demand:demandSlot,offers:sourceSlot},
    layout:[
      {kind:'anchor',id:'query',node:{alias:'query',capability:'query',input:{value:{kind:'context',slot:'offers'}}}},
      ...auditLayout,
      {kind:'gap',id:'analysis',templates:[{alias:'old',capability:'solve',input:{offers:{kind:'result',node:'query',slot:'value'},demand:{kind:'context',slot:'demand'}}}],seed:['old']},
      {kind:'anchor',id:'verify',node:{alias:'verify',capability:'verify',input:{value:{kind:'result',node:'old',slot:'value'}}}} ],
    refresh:(_i,_r,_v,w)=>{const a=w.put('demand',demandSlot,requested),b=w.put('offers',sourceSlot,offers);if(a.status!=='COMPLETE')return a;if(b.status!=='COMPLETE')return b;
      return ok({changed:[],dependencies:[{key:'constraint',dependsOn:[]},{key:'offers',dependsOn:[]}],observations:[
        {key:'constraint',origin:'authority',state:'known',value:requested,source:{id:'constraint',scope:'domain',revision:String(d.knowledge.current().epoch)}},
        {key:'offers',origin:'authority',state:'known',value:offers,source:{id:'offers',scope:'domain',revision:'1'}}],slotEvidence:{demand:['constraint'],offers:['offers']}});},
    plan:async(v,root)=>{
      const queried=v.progress.find(x=>x.definitionId==='query'&&x.state==='accepted');if(!queried)return native(v,'continue');
      if(v.progress.filter(x=>x.definitionId==='offer-audit'&&x.state==='accepted').length!==auditLayout.length)return native(v,'continue');
      if(!asked){asked=true;return native(v,'clarify');}
      if(generated===0){
        generated++;
        const old=v.progress.find(x=>x.definitionId==='solve'),gate=v.progress.find(x=>x.definitionId==='verify');
        if(!old||!gate)return reject('MISSING_PENDING');
        const headers={runId:v.runId,regionId:v.regionId,planRevision:v.planRevision??0,factRevision:v.factRevision};
        const prompt='You are planning a fresh exact-cost analysis after the deadline changed from five to two days. Return the proposal itself as a single JSON object, NOT a wrapper, NOT a JSON schema. The exact top-level keys are runId, regionId, planRevision, factRevision, action, edits. Copy the values of these metadata fields exactly: '+JSON.stringify(headers)+
          '. action is "continue". Current accepted source occurrence ID: '+queried.instanceId+'. Obsolete pending solver ID: '+old.instanceId+'. Mandatory verification ID: '+gate.instanceId+
          '. Choose a fresh alias for an exact solver; use it consistently in the insertion and the verification rebind. The only admitted gap name is "analysis" (not "gap analysis"). The only solve capability is "solve". Its inputs are EXACTLY "offers" and "demand", not "value". Offers reference the accepted source occurrence, slot "value"; demand references current context slot "demand". The verification node input is "value", referencing the new alias output slot "value". Remove the obsolete solver only after rebind. Use exactly the following edit structure (replace descriptive placeholders, never copy angle brackets): '+
          '[{"kind":"insert","gap":"analysis","node":{"alias":"<fresh alias>","capability":"solve","input":{"offers":{"kind":"result","node":"<accepted source occurrence ID>","slot":"value"},"demand":{"kind":"context","slot":"demand"}}}},{"kind":"rebind","node":"<mandatory verification ID>","input":"value","to":{"kind":"result","node":"<same fresh alias>","slot":"value"}},{"kind":"remove","node":"<obsolete pending solver ID>"}]. No extra properties, no type, no workflowRegionProposal wrapper. Return only JSON.';
        const r=await m.generate(root,request('new-analysis',[{role:'user',text:prompt}]));
        return r.status!=='COMPLETE'?r:ok({source:'model',proposal:r.value.json as unknown as WorkflowRegionProposal,
          access:{capabilities:['solve','verify'],contextSlots:['demand'],resultSlots:[{node:queried.instanceId,slot:'value'}]}});
      }
      return native(v,v.progress.some(x=>x.definitionId==='verify'&&x.state==='accepted')?'finish':'continue');
    },
    clarify:async(_v,root)=>{const response=await feedback(root,2);if(response.status!=='COMPLETE')return response;requested={...requested,lead:response.value};d.advance();return ok(undefined);},
    admit:(_v,p)=>p.edits.length===0||p.edits.length===3&&p.edits.some(e=>e.kind==='insert')&&p.edits.some(e=>e.kind==='rebind')&&p.edits.some(e=>e.kind==='remove')?ok(undefined):reject('UNAUTHORIZED_TOPOLOGY'),
    canSkip:()=>reject('ANCHOR_REQUIRED'),canRebind:()=>ok(undefined),replay:'pure-read-only',
    complete:v=>{const gate=v.progress.find(x=>x.definitionId==='verify'&&x.state==='accepted');return gate?v.reader.read(gate.instanceId+'/value',planSlot):reject('MISSING_GATE');}
  };
  const r=await d.session.run(root=>runWorkflowRegion(root,dfn,undefined),{goal:'independent two-day procurement optimum',requiredKnowledge:[],terminalReads:0,
    validate:v=>verified(v)?ok(undefined):reject('FINAL_GOAL')});
  assert.equal(requireComplete(r).cost,72);assert.deepEqual([reads,solves,checks,generated,audits],[1,1,1,1,12]);
  assert.equal(d.session.dispositions().filter(x=>x.kind==='node'&&x.acceptance==='accepted').length,15);
  assert.ok(d.trace.some(x=>x.kind==='region'&&x.action==='feedback'));assert.ok(d.trace.some(x=>x.kind==='region'&&x.action==='edit'));
  usage(d.trace,1);
});
