import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { ModelElement, bindWorkflowFunction, bindWorkflowRegion, createWorkflowSlot, InteractionElement, runWorkflowRegion, StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { NativeWorkflowContext, WorkflowCapability, WorkflowRegionDefinition, WorkflowRegionView, WorkflowRegionProposal,
  WorkflowSlot, WorkflowSlotBinding, WorkflowObservation, WorkflowNode, ModelRequest } from '@kaicreator/domain-harness';
import { fixture, ok, reject, optimize, planMetrics, solveRepair, scheduleMetrics } from './domain.js';
import type { Demand, Offer, Plan, Job, Schedule, Outcome } from './domain.js';

const limits={maxWork:20000000,maxDescendantDepth:2,maxCandidateBytes:16384,maxJsonDepth:16,maxJsonItems:1024,
  maxNodes:30,maxBindings:32,maxEdits:8,maxProjectionBytes:16384};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null;
const context=(slot:string):WorkflowSlotBinding=>({kind:'context',slot});
const result=(node:string,slot='value'):WorkflowSlotBinding=>({kind:'result',node,slot});
const id=(v:WorkflowRegionView,name:string)=>{
  const found=v.progress.find(n=>n.definitionId===name&&n.state!=='removed'&&n.state!=='skipped');
  if(!found)throw Error('missing occurrence');return found.instanceId;
};
const accepted=(v:WorkflowRegionView,name:string)=>v.progress.some(n=>n.definitionId===name&&n.state==='accepted');
const decision=(v:WorkflowRegionView,action:WorkflowRegionProposal['action'],edits:WorkflowRegionProposal['edits']=[])=>ok({
  source:'native' as const,proposal:{runId:v.runId,regionId:v.regionId,factRevision:v.factRevision,planRevision:v.planRevision??0,action,edits}});
function domain(enableModel=false){
  let epoch=1;
  const knowledge={maxItems:2,equal:Object.is,current:()=>({epoch,context:{scope:'actual-domain',
    revisions:new Map([['source','1'],['constraint',String(epoch)]])}})};
  const current=()=>true;
  const requirements=[{key:'source',accepts:['authority'] as const},{key:'constraint',accepts:['authority'] as const}];
  const trace:WorkflowObservation[]=[];
  const session=new StandardWorkflowSession({maxCalls:1000,maxSteps:1500,maxDepth:4},{
    knowledge,current,limits:{maxWork:30000000,maxEvents:400,maxActiveScopes:16,maxActiveMs:30000,maxSettlementMs:2000,maxNoProgress:5,...(enableModel?{model:{maxCalls:2,maxRetries:0,maxOutputTokens:256}}:{})},
    observe:r=>{trace.push(r);}
  });
  const refresh=(source:unknown,constraint:unknown)=>({changed:[],dependencies:requirements.map(r=>({key:r.key,dependsOn:[]})),
    observations:[{key:'source',origin:'authority' as const,state:'known' as const,value:source,source:{id:'source',scope:'actual-domain',revision:'1'}},
      {key:'constraint',origin:'authority' as const,state:'known' as const,value:constraint,source:{id:'constraint',scope:'actual-domain',revision:String(epoch)}}]});
  const definition=<I,O>(options:Pick<WorkflowRegionDefinition<I,O>,'capabilities'|'contextSlots'|'layout'|'refresh'|'plan'|'complete'>&
    Partial<Pick<WorkflowRegionDefinition<I,O>,'clarify'>>):WorkflowRegionDefinition<I,O>=>({
    id:'actual-domain',goal:'professional constraints and actual result',constraints:['actual authoritative inputs'],limits,knowledge,current,
    requiredKnowledge:requirements,optionalKnowledge:[],admit:()=>ok(undefined),canSkip:()=>ok(undefined),canRebind:()=>ok(undefined),
    replay:'pure-read-only',...options});
  return {session,trace,definition,refresh,advance:()=>{epoch++;}};
}
function read<I>(id:string,slot:WorkflowSlot<I>,onRun:()=>void):WorkflowCapability {
  return bindWorkflowFunction<I,I>({id,description:'actual typed source',inputs:{value:slot},outputs:{value:slot},input:r=>r.read('value',slot),
    node:{id,goal:'read source',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),run:v=>{onRun();return ok(v);},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',slot,v)});
}
async function userConstraint(root:NativeWorkflowContext,answer:number):Promise<Outcome<number>>{
  const e=new InteractionElement({onPrompt:(p,actual)=>{setImmediate(()=>actual.submit({
    intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{constraint:answer}}));}});
  return e.runIn(root,scope=>scope.resolve<number,number>(0,(_state,event)=>{
    if(event.kind==='initial')return ok({kind:'clarify',state:1,prompt:{decisionKey:'constraint',title:'Change actual constraint',
      actions:['submit'],fields:[{id:'constraint',kind:'number',label:'constraint',required:true}]}});
    return event.response.action==='submit'&&typeof event.response.values.constraint==='number'
      ?ok({kind:'ready',intent:event.response.values.constraint}):reject('INVALID_RESPONSE');
  }));
}

test('public D-A region revalidates actual procurement after feedback, retains unaffected source anchor',async()=>{
  const d=domain(),offers=fixture.DA.offers;let demand:Demand={lead:5,budget:75};
  const counts={source:0,solve:0,verify:0};let asked=false;
  const offerSlot=createWorkflowSlot('offers',(v):v is Offer[]=>Array.isArray(v)&&v.every((x:unknown)=>object(x)&&typeof x.id==='string'&&typeof x.cost==='number'));
  const demandSlot=createWorkflowSlot('demand',(v):v is Demand=>object(v)&&typeof v.lead==='number'&&typeof v.budget==='number');
  const planSlot=createWorkflowSlot('plan',(v):v is Plan=>object(v)&&Array.isArray(v.counts)&&typeof v.cost==='number'&&typeof v.lead==='number');
  const source=read('read',offerSlot,()=>{counts.source++;});
  const solve=bindWorkflowFunction<{offers:Offer[];demand:Demand},Plan>({id:'solve',description:'actual procurement enumeration',
    inputs:{offers:offerSlot,demand:demandSlot},outputs:{value:planSlot},
    input:r=>{const a=r.read('offers',offerSlot),b=r.read('demand',demandSlot);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({offers:a.value,demand:b.value});},
    node:{id:'solve',goal:'find optimal purchase',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),
      run:i=>{counts.solve++;const p=optimize(i.offers,i.demand);return p?ok(p):reject('INFEASIBLE');},
      after:(i,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&planMetrics(i.offers,a.outcome.value.counts,i.demand)!==null?ok(undefined):reject('INVALID'),
      project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',planSlot,v)});
  const verify=bindWorkflowFunction<{plan:Plan;demand:Demand},Plan>({id:'verify',description:'verify purchase constraints',
    inputs:{plan:planSlot,demand:demandSlot},outputs:{value:planSlot},
    input:r=>{const a=r.read('plan',planSlot),b=r.read('demand',demandSlot);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({plan:a.value,demand:b.value});},
    node:{id:'verify',goal:'verify purchase',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),
      run:i=>{counts.verify++;const p=planMetrics(offers,i.plan.counts,i.demand);return p&&p.cost===i.plan.cost?ok(i.plan):reject('INVALID');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',planSlot,v)});
  const definition=d.definition<void,Plan>({capabilities:[source,solve,verify],contextSlots:{offers:offerSlot,demand:demandSlot},layout:[
    {kind:'anchor',id:'read',node:{alias:'read',capability:'read',input:{value:context('offers')}}},
    {kind:'anchor',id:'solve',node:{alias:'solve',capability:'solve',input:{offers:result('read'),demand:context('demand')}}},
    {kind:'anchor',id:'verify',node:{alias:'verify',capability:'verify',input:{plan:result('solve'),demand:context('demand')}}}],
    refresh:(_i,_root,_prev,w)=>{const a=w.put('offers',offerSlot,offers),b=w.put('demand',demandSlot,demand);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({...d.refresh(offers,demand),slotEvidence:{offers:['source'],demand:['constraint']}});},
    plan:v=>{if(accepted(v,'verify')&&!asked){asked=true;
      const initial=v.reader.read(id(v,'verify')+'/value',planSlot);assert.deepEqual(initial,ok(fixture.DA.enumeration.cases[0]?.optimum));
      return decision(v,'clarify');}return decision(v,accepted(v,'verify')?'finish':'continue');},
    clarify:async(_v,root)=>{const response=await userConstraint(root,3);if(response.status!=='COMPLETE')return response;
      demand={...demand,lead:response.value};d.advance();return ok(undefined);},
    complete:v=>v.reader.read(id(v,'verify')+'/value',planSlot)});
  const r=await d.session.run(root=>runWorkflowRegion(root,definition,undefined),{goal:'actual final cost and lead',requiredKnowledge:[],terminalReads:0,
    validate:p=>planMetrics(offers,p.counts,demand)?.cost===64&&p.cost===64?ok(undefined):reject('FINAL_INVALID')});
  assert.deepEqual(r,ok(fixture.DA.enumeration.cases.find(c=>c.lead===3&&c.budget===75)?.optimum));
  assert.deepEqual(counts,{source:1,solve:2,verify:2});
  assert.equal(new Set(d.trace.map(x=>x.runId)).size,1);
});

test('public D-B region replaces pending template in mutable gap and runs actual solver exactly once',async()=>{
  const d=domain(),jobs=fixture.DB.jobs,deadline=7;
  const counts={read:0,solve:0,verify:0};let edited=false;
  const jobSlot=createWorkflowSlot('jobs',(v):v is Job[]=>Array.isArray(v)&&v.every((x:unknown)=>object(x)&&typeof x.id==='string'&&typeof x.I==='number'&&typeof x.R==='number'));
  const deadlineSlot=createWorkflowSlot('deadline',(v):v is number=>typeof v==='number'&&Number.isInteger(v));
  const scheduleSlot=createWorkflowSlot('schedule',(v):v is Schedule=>object(v)&&Array.isArray(v.starts)&&typeof v.makespan==='number'&&typeof v.sum==='number');
  const source=read('read',jobSlot,()=>{counts.read++;});
  const solve=bindWorkflowFunction<{jobs:Job[];deadline:number},Schedule>({id:'solve',description:'actual scipy MILP',
    inputs:{jobs:jobSlot,deadline:deadlineSlot},outputs:{value:scheduleSlot},
    input:r=>{const a=r.read('jobs',jobSlot),b=r.read('deadline',deadlineSlot);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({jobs:a.value,deadline:b.value});},
    node:{id:'solve',goal:'actual repair solve',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),
      run:(i,root)=>{counts.solve++;return solveRepair(i.jobs,i.deadline,root.signal);},
      after:(i,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&scheduleMetrics(i.jobs,a.outcome.value.starts,i.deadline)!==null?ok(undefined):reject('INVALID'),
      project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
  const verified=(v:Schedule)=>{const metrics=scheduleMetrics(jobs,v.starts,deadline);
    return metrics!==null&&metrics.makespan===v.makespan&&metrics.sum===v.sum&&v.makespan===fixture.DB.enumeration.best[0]&&v.sum===fixture.DB.enumeration.best[1];};
  const verify=bindWorkflowFunction<Schedule,Schedule>({id:'verify',description:'verify actual repair schedule',
    inputs:{value:scheduleSlot},outputs:{value:scheduleSlot},input:r=>r.read('value',scheduleSlot),
    node:{id:'verify',goal:'verify constraints',requiredKnowledge:[],before:()=>ok(undefined),run:v=>{counts.verify++;return verified(v)?ok(v):reject('INVALID');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
  const definition=d.definition<void,Schedule>({capabilities:[source,solve,verify],contextSlots:{jobs:jobSlot,deadline:deadlineSlot},layout:[
    {kind:'anchor',id:'read',node:{alias:'read',capability:'read',input:{value:context('jobs')}}},
    {kind:'gap',id:'schedule',templates:[{alias:'seed',capability:'solve',input:{jobs:context('jobs'),deadline:context('deadline')}}],seed:['seed']},
    {kind:'anchor',id:'verify',node:{alias:'verify',capability:'verify',input:{value:result('seed')}}}],
    refresh:(_i,_root,_prev,w)=>{const a=w.put('jobs',jobSlot,jobs),b=w.put('deadline',deadlineSlot,deadline);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({...d.refresh(jobs,deadline),slotEvidence:{jobs:['source'],deadline:['constraint']}});},
    plan:v=>{if(accepted(v,'read')&&!edited){edited=true;return decision(v,'continue',[
      {kind:'insert',gap:'schedule',node:{alias:'actual',capability:'solve',input:{jobs:result(id(v,'read')),deadline:context('deadline')}}},
      {kind:'rebind',node:id(v,'verify'),input:'value',to:result('actual')},{kind:'remove',node:id(v,'solve')}]);}
      return decision(v,accepted(v,'verify')?'finish':'continue');},
    complete:v=>v.reader.read(id(v,'verify')+'/value',scheduleSlot)});
  const r=await d.session.run(root=>runWorkflowRegion(root,definition,undefined),{goal:'actual final schedule',requiredKnowledge:[],terminalReads:0,
    validate:p=>verified(p)?ok(undefined):reject('FINAL_INVALID')});
  assert.equal(r.status,'COMPLETE');assert.deepEqual(counts,{read:1,solve:1,verify:1});
  assert.equal(new Set(d.trace.map(x=>x.runId)).size,1);
});

test('public D-B actual deadline feedback reruns only dependent solver and verifier, retains source',async()=>{
  const d=domain(),jobs=fixture.DB.jobs;let deadline=8;
  const counts={read:0,solve:0,verify:0};let asked=false;
  const jobSlot=createWorkflowSlot('jobs',(v):v is Job[]=>Array.isArray(v)&&v.every((x:unknown)=>object(x)&&typeof x.id==='string'&&typeof x.I==='number'&&typeof x.R==='number'));
  const deadlineSlot=createWorkflowSlot('deadline',(v):v is number=>typeof v==='number'&&Number.isInteger(v));
  const scheduleSlot=createWorkflowSlot('schedule',(v):v is Schedule=>object(v)&&Array.isArray(v.starts)&&typeof v.makespan==='number'&&typeof v.sum==='number');
  const source=read('read',jobSlot,()=>{counts.read++;});
  const solve=bindWorkflowFunction<{jobs:Job[];deadline:number},Schedule>({id:'solve',description:'actual scipy MILP',
    inputs:{jobs:jobSlot,deadline:deadlineSlot},outputs:{value:scheduleSlot},
    input:r=>{const a=r.read('jobs',jobSlot),b=r.read('deadline',deadlineSlot);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({jobs:a.value,deadline:b.value});},
    node:{id:'solve',goal:'actual repair solve',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),
      run:(i,root)=>{counts.solve++;return solveRepair(i.jobs,i.deadline,root.signal);},
      after:(i,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&scheduleMetrics(i.jobs,a.outcome.value.starts,i.deadline)!==null?ok(undefined):reject('INVALID'),
      project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
  const verified=(v:Schedule)=>{const metrics=scheduleMetrics(jobs,v.starts,deadline);
    return metrics!==null&&metrics.makespan===v.makespan&&metrics.sum===v.sum&&v.makespan===fixture.DB.enumeration.best[0]&&v.sum===fixture.DB.enumeration.best[1];};
  const verify=bindWorkflowFunction<Schedule,Schedule>({id:'verify',description:'verify actual repair schedule',
    inputs:{value:scheduleSlot},outputs:{value:scheduleSlot},input:r=>r.read('value',scheduleSlot),
    node:{id:'verify',goal:'verify constraints',requiredKnowledge:[],replay:'pure-read-only',before:()=>ok(undefined),run:v=>{counts.verify++;return verified(v)?ok(v):reject('INVALID');},
      after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
  const definition=d.definition<void,Schedule>({capabilities:[source,solve,verify],contextSlots:{jobs:jobSlot,deadline:deadlineSlot},layout:[
    {kind:'anchor',id:'read',node:{alias:'read',capability:'read',input:{value:context('jobs')}}},
    {kind:'anchor',id:'solve',node:{alias:'solve',capability:'solve',input:{jobs:result('read'),deadline:context('deadline')}}},
    {kind:'anchor',id:'verify',node:{alias:'verify',capability:'verify',input:{value:result('solve')}}}],
    refresh:(_i,_root,_prev,w)=>{const a=w.put('jobs',jobSlot,jobs),b=w.put('deadline',deadlineSlot,deadline);
      return a.status!=='COMPLETE'?a:b.status!=='COMPLETE'?b:ok({...d.refresh(jobs,deadline),slotEvidence:{jobs:['source'],deadline:['constraint']}});},
    plan:v=>{if(accepted(v,'verify')&&!asked){asked=true;return decision(v,'clarify');}
      return decision(v,accepted(v,'verify')?'finish':'continue');},
    clarify:async(_v,root)=>{const response=await userConstraint(root,7);if(response.status!=='COMPLETE')return response;deadline=response.value;d.advance();return ok(undefined);},
    complete:v=>v.reader.read(id(v,'verify')+'/value',scheduleSlot)});
  const r=await d.session.run(root=>runWorkflowRegion(root,definition,undefined),{goal:'actual final schedule',requiredKnowledge:[],terminalReads:0,
    validate:p=>verified(p)?ok(undefined):reject('FINAL_INVALID')});
  assert.equal(r.status,'COMPLETE');assert.deepEqual(counts,{read:1,solve:2,verify:2});assert.equal(deadline,7);
  assert.ok(d.trace.some(x=>x.kind==='region'&&x.action==='feedback'));
  assert.equal(new Set(d.trace.map(x=>x.runId)).size,1);
});

// R64-P1-02: actual local deterministic generation at each level, no prebuilt initial topology.
test('R65 D-B deterministic planners generate child and grandchild after actual local observations; private evolution and depth denial',async()=>{
  for(const mode of ['baseline','private-audit','depth-denied'] as const){
    const d=domain(),jobs=fixture.DB.jobs,deadline=7;
    type Input={jobs:Job[];deadline:number};
    const inputSlot=createWorkflowSlot('repair-input',(v):v is Input=>object(v)&&Array.isArray(v.jobs)&&
      v.jobs.every((j:unknown)=>object(j)&&typeof j.id==='string'&&Number.isSafeInteger(j.I)&&Number.isSafeInteger(j.R)&&Number.isSafeInteger(j.release))&&Number.isSafeInteger(v.deadline));
    const scheduleSlot=createWorkflowSlot('schedule',(v):v is Schedule=>object(v)&&Array.isArray(v.starts)&&Number.isSafeInteger(v.makespan)&&Number.isSafeInteger(v.sum));
    const counts={parentRead:0,childRead:0,privateAudit:0,childFactory:0,grandFactory:0,solve:0,verify:0};
    const input={jobs,deadline};
    const verified=(v:Schedule)=>{const actual=scheduleMetrics(jobs,v.starts,deadline);return actual!==null&&actual.makespan===v.makespan&&actual.sum===v.sum&&v.makespan===7&&v.sum===16;};
    const localRead=(name:string,observe:()=>void)=>bindWorkflowFunction<Input,Input>({
      id:name,description:'actual scoped job and deadline observation',inputs:{value:inputSlot},outputs:{value:inputSlot},
      input:r=>r.read('value',inputSlot),node:{id:name,goal:'read current jobs and deadline',
        requiredKnowledge:[{key:'source',accepts:['authority']},{key:'constraint',accepts:['authority']}],
        knowledge:v=>ok(d.refresh(v.jobs,v.deadline).observations),
        before:v=>v.jobs===jobs&&v.deadline===deadline?ok(undefined):reject('SOURCE_OR_DEADLINE'),
        run:v=>{observe();return ok(v);},after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},
      output:(v,w)=>w.put('value',inputSlot,v)});
    const parentRead=localRead('parent-read',()=>{counts.parentRead++;});
    const childRead=localRead('child-read',()=>{counts.childRead++;});
    const audit=bindWorkflowFunction<Input,Input>({id:'private-audit',description:'actual private resource workload check',inputs:{value:inputSlot},outputs:{value:inputSlot},input:r=>r.read('value',inputSlot),
      node:{id:'private-audit',goal:'check job identities and resource load',requiredKnowledge:[],before:()=>ok(undefined),
        run:v=>{counts.privateAudit++;return new Set(v.jobs.map(j=>j.id)).size===v.jobs.length&&v.jobs.reduce((n,j)=>n+j.R,0)<=v.deadline?ok(v):reject('RESOURCE_LOAD');},
        after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',inputSlot,v)});
    const solver=bindWorkflowFunction<Input,Schedule>({id:'recursive-solve',description:'actual SciPy MILP',inputs:{value:inputSlot},outputs:{value:scheduleSlot},input:r=>r.read('value',inputSlot),
      node:{id:'recursive-solve',goal:'actual constrained repair schedule',requiredKnowledge:[],before:v=>v.deadline===deadline?ok(undefined):reject('DEADLINE'),
        run:(v,s)=>{counts.solve++;return solveRepair(v.jobs,v.deadline,s.signal);},
        after:(_v,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&verified(a.outcome.value)?ok(undefined):reject('SCHEDULE_POST'),
        project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
    const verify=bindWorkflowFunction<Schedule,Schedule>({id:'recursive-verify',description:'independent root schedule verification',inputs:{value:scheduleSlot},outputs:{value:scheduleSlot},input:r=>r.read('value',scheduleSlot),
      node:{id:'recursive-verify',goal:'verify actual resource and precedence constraints',requiredKnowledge:[],before:()=>ok(undefined),
        run:v=>{counts.verify++;return verified(v)?ok(v):reject('ROOT_VERIFY');},after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',scheduleSlot,v)});
    const base=(name:string,caps:readonly WorkflowCapability[],depth:number,patch:Partial<WorkflowRegionDefinition<Input,Schedule>>):WorkflowRegionDefinition<Input,Schedule>=>({
      ...d.definition<Input,Schedule>({capabilities:caps,contextSlots:{value:inputSlot},layout:[],
        refresh:(v,_s,_p,w)=>{const a=w.put('value',inputSlot,v);return a.status!=='COMPLETE'?a:ok({...d.refresh(v.jobs,v.deadline),slotEvidence:{value:['source','constraint']}});},
        plan:()=>reject('NO_PLAN'),complete:()=>reject('NO_RESULT')}),
      id:name,limits:{...limits,maxDescendantDepth:depth},canSkip:()=>reject('REQUIRED'),...patch});
    const wrap=(name:string,create:(v:Input)=>Outcome<WorkflowRegionDefinition<Input,Schedule>>)=>bindWorkflowRegion<Input,Schedule>({
      id:name,description:'actual delegated repair work',inputs:{value:inputSlot},outputs:{value:scheduleSlot},input:r=>r.read('value',inputSlot),
      output:(v,w)=>w.put('value',scheduleSlot,v),node:{id:name,goal:'verified typed schedule',requiredKnowledge:[],before:v=>v.deadline===deadline?ok(undefined):reject('DEADLINE'),
        after:(_v,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&verified(a.outcome.value)?ok(undefined):reject('CHILD_POST'),project:()=>({effect:'none',detail:null})},create});
    const grand=wrap('conflict-region',()=>{counts.grandFactory++;return ok(base('conflict',[solver],0,{
      layout:[{kind:'gap',id:'flex',templates:[],seed:[]}],
      plan:v=>v.progress.length===0?decision(v,'continue',[{kind:'insert',gap:'flex',node:{alias:'actual-solve',capability:'recursive-solve',input:{value:context('value')}}}]):decision(v,accepted(v,'recursive-solve')?'finish':'continue'),
      complete:v=>v.reader.read(id(v,'recursive-solve')+'/value',scheduleSlot)}));});
    const child=wrap('repair-region',()=>{counts.childFactory++;return ok(base('repair',[childRead,audit,grand,solver],1,{
      layout:[{kind:'anchor',id:'observations',node:{alias:'local',capability:'child-read',input:{value:context('value')}}},
        ...(mode==='private-audit'?[{kind:'anchor' as const,id:'audit',node:{alias:'audit',capability:'private-audit',input:{value:result('local')}}}]:[]),
        {kind:'gap',id:'flex',templates:[],seed:[]}],
      plan:v=>{
        const source=mode==='private-audit'?'private-audit':'child-read';
        if(accepted(v,source)&&!v.progress.some(n=>n.definitionId==='conflict-region')){
          const observed=v.reader.read(id(v,source)+'/value',inputSlot);
          if(observed.status!=='COMPLETE')return observed;
          // Resource conflicts exist when multiple jobs require the same inspection and repair stations.
          if(observed.value.jobs.filter(j=>j.I>0&&j.R>0).length<2)return reject('NO_SHARED_RESOURCE_CONFLICT');
          return decision(v,'continue',[{kind:'insert',gap:'flex',node:{alias:'local-conflict',capability:'conflict-region',input:{value:result(id(v,source))}}}]);
        }
        return decision(v,accepted(v,'conflict-region')?'finish':'continue');},
      complete:v=>v.reader.read(id(v,'conflict-region')+'/value',scheduleSlot)}));});
    const outer=base('outer',[parentRead,child,childRead,audit,grand,solver,verify],mode==='depth-denied'?1:2,{
      layout:[{kind:'anchor',id:'observations',node:{alias:'observed',capability:'parent-read',input:{value:context('value')}}},
        {kind:'gap',id:'flex',templates:[],seed:[]}],
      plan:v=>{
        if(accepted(v,'parent-read')&&!v.progress.some(n=>n.definitionId==='repair-region')){
          const observed=v.reader.read(id(v,'parent-read')+'/value',inputSlot);
          if(observed.status!=='COMPLETE')return observed;
          if(observed.value.jobs.some(j=>j.release+j.I+j.R>observed.value.deadline))return reject('INDIVIDUAL_DEADLINE');
          return decision(v,'continue',[{kind:'insert',gap:'flex',node:{alias:'repair',capability:'repair-region',input:{value:result(id(v,'parent-read'))}}},
            {kind:'insert',gap:'flex',node:{alias:'check',capability:'recursive-verify',input:{value:result('repair')}}}]);}
        return decision(v,accepted(v,'recursive-verify')?'finish':'continue');},
      complete:v=>v.reader.read(id(v,'recursive-verify')+'/value',scheduleSlot)});
    const r=await d.session.run(root=>runWorkflowRegion(root,outer,input),{goal:'unchanged typed public repair schedule',requiredKnowledge:[],terminalReads:0,validate:v=>verified(v)?ok(undefined):reject('FINAL')});
    assert.equal(r.status==='COMPLETE',mode!=='depth-denied',JSON.stringify(r));
    assert.equal(counts.parentRead,1);assert.equal(counts.childFactory,1);
    assert.equal(counts.grandFactory,mode==='depth-denied'?0:1);assert.equal(counts.solve,mode==='depth-denied'?0:1);
    assert.equal(counts.verify,mode==='depth-denied'?0:1);assert.equal(counts.privateAudit,mode==='private-audit'?1:0);
    assert.equal(d.trace.filter(x=>x.kind==='model').length,0);
    assert.equal(new Set(d.trace.map(x=>x.runId)).size,1);
    if(r.status==='COMPLETE'){
      assert.ok(verified(r.value));assert.equal(counts.childRead,1);
      const nodes=d.session.dispositions().filter(x=>x.kind==='node');
      assert.deepEqual(nodes.map(x=>x.occurrence.definitionId),['parent-read','child-read',...(mode==='private-audit'?['private-audit']:[]),'recursive-solve','conflict-region','repair-region','recursive-verify']);
      assert.equal(new Set(nodes.map(x=>x.occurrence.instanceId)).size,nodes.length);
      assert.ok(nodes.every(x=>x.occurrence.attempt===1&&x.acceptance==='accepted'));
      for(const name of ['parent-read','child-read']){
        const observed=d.trace.find(x=>x.kind==='node'&&x.phase==='actual'&&x.occurrence.definitionId===name);
        assert.ok(observed&&observed.kind==='node'&&observed.sources.some(x=>x.key==='source'&&x.revision==='1')&&
          observed.sources.some(x=>x.key==='constraint'&&x.revision==='1'));
      }
      assert.equal(d.trace.filter(x=>x.kind==='region'&&x.action==='edit').length,3);
      assertPublicCorrelation(d.trace,d.session.dispositions());
    }
  }
});

function assertPublicCorrelation(trace:readonly WorkflowObservation[],dispositions:readonly WorkflowObservation[]){
  const candidates=trace.filter(x=>x.kind==='node'&&x.phase==='candidate');
  const finals=dispositions.filter(x=>x.kind==='node'&&x.phase==='disposition');
  assert.ok(finals.length>0);
  for(const final of finals){
    if(final.kind!=='node'||final.acceptance!=='accepted')continue;
    assert.equal(candidates.filter(c=>c.kind==='node'&&c.seq===final.candidateSeq&&c.runId===final.runId&&c.scopeId===final.scopeId&&
      c.occurrence.instanceId===final.occurrence.instanceId&&c.occurrence.attempt===final.occurrence.attempt).length,1);
  }
  assert.ok(trace.every((x,i)=>i===0||x.seq>trace[i-1]!.seq));
  assert.ok(dispositions.every((x,i)=>i===0||x.seq>dispositions[i-1]!.seq));
}

test('R65 D-A missing alternative lookup, equivalent skip and same native solver fixed/dynamic/selected tool',async()=>{
  const live=process.env.DH_R65_LIVE==='1';
  for(const mode of ['valid','missing-alternative','invalid-moq','expired-equivalent','foreign-equivalent','missing-equivalent','required-anchor'] as const){
    if(live&&mode!=='valid')continue;
    type Quote={tenant:string;vehicle:string;revision:string;offers:Offer[]};
    type Input={quote:Quote;demand:Demand};
    const d=domain(mode==='valid'),demand:Demand={lead:3,budget:75},all=fixture.DA.offers;
    const partial:Quote={tenant:'shop-A',vehicle:'V1',revision:'1',offers:all.filter(o=>o.id!=='D')};
    // The initial context has A/B/C only. D exists solely in the controlled lookup authority, not the region context.
    const duplicateInput:Quote=mode==='foreign-equivalent'?{...partial,tenant:'shop-B'}:partial;
    const authority={revision:'1',lookup:():Quote=>({tenant:'shop-A',vehicle:'V1',revision:'1',
      offers:mode==='missing-alternative'?partial.offers:all.map(o=>({...o,...(mode==='invalid-moq'&&o.id==='D'?{moq:0}:{})}))})};
    const quoteShape=(v:unknown):v is Quote=>object(v)&&typeof v.tenant==='string'&&typeof v.vehicle==='string'&&typeof v.revision==='string'&&Array.isArray(v.offers)&&
      v.offers.every((x:unknown)=>object(x)&&typeof x.id==='string'&&typeof x.compatible==='boolean'&&
        ['pack','cost','lead','max','moq'].every(k=>Number.isSafeInteger(x[k])));
    const quoteSlot=createWorkflowSlot('quote',quoteShape),demandSlot=createWorkflowSlot('demand',(v):v is Demand=>object(v)&&Number.isSafeInteger(v.lead)&&Number.isSafeInteger(v.budget));
    const planSlot=createWorkflowSlot('plan',(v):v is Plan=>object(v)&&Array.isArray(v.counts)&&v.counts.every(Number.isSafeInteger)&&Number.isSafeInteger(v.cost)&&Number.isSafeInteger(v.lead));
    const valid=(q:Quote)=>q.tenant==='shop-A'&&q.vehicle==='V1'&&q.revision===authority.revision&&
      q.offers.map(o=>o.id).join(',')==='A,B,C,D'&&q.offers.every(o=>o.pack>0&&o.cost>=0&&o.lead>=0&&o.max>=0&&o.moq>0&&o.moq<=o.max);
    const proof=(q:Quote)=>[{key:'source',origin:'authority' as const,state:'known' as const,value:q,
      source:{id:'source',scope:'actual-domain',revision:q.revision}}];
    const counts={read:0,lookup:0,solve:0,before:0,after:0,verify:0,skip:0,modelHttp:0};
    const initial=read('initial-quotes',quoteSlot,()=>{counts.read++;});
    const lookup=bindWorkflowFunction<Quote,Quote>({id:'alternative-lookup',description:'actual controlled missing alternative supplier lookup',
      inputs:{value:quoteSlot},outputs:{value:quoteSlot},input:r=>r.read('value',quoteSlot),
      node:{id:'alternative-lookup',goal:'obtain complete current quotes',requiredKnowledge:[],before:q=>q.tenant==='shop-A'&&q.vehicle==='V1'?ok(undefined):reject('SOURCE_SCOPE'),
        run:q=>{counts.lookup++;if(q.offers.some(o=>o.id==='D'))return reject('NOT_MISSING');return ok(authority.lookup());},
        after:(_q,a)=>a.kind==='returned'&&a.outcome.status==='COMPLETE'&&valid(a.outcome.value)?ok(undefined):reject('INCOMPLETE_OR_INVALID_SOURCE'),
        project:()=>({effect:'none',detail:{authority:'controlled-alternative-lookup'}})},output:(v,w)=>w.put('value',quoteSlot,v)});
    // Exactly the same object, including knowledge, pre/post and computation, is used for all three modes.
    const solverNode:WorkflowNode<Input,Plan>={id:'shared-purchase',goal:'actual minimum feasible cost',requiredKnowledge:[{key:'source',accepts:['authority']}],
      knowledge:i=>ok(proof(i.quote)),before:i=>{counts.before++;return valid(i.quote)&&i.demand.lead===3&&i.demand.budget===75?ok(undefined):reject('SOURCE_OR_DEMAND');},
      run:i=>{counts.solve++;const p=optimize(i.quote.offers,i.demand);return p?ok(p):reject('NO_PLAN');},
      after:(i,a)=>{counts.after++;return a.kind==='returned'&&a.outcome.status==='COMPLETE'&&valid(i.quote)&&
        planMetrics(i.quote.offers,a.outcome.value.counts,i.demand)?.cost===a.outcome.value.cost?ok(undefined):reject('PLAN_POST');},
      project:()=>({effect:'none',detail:{calculation:'enumeration'}})};
    const solver=bindWorkflowFunction<Input,Plan>({id:'shared-purchase',description:'same actual native purchase solver',inputs:{quote:quoteSlot,demand:demandSlot},
      outputs:{value:planSlot},input:r=>{const q=r.read('quote',quoteSlot),b=r.read('demand',demandSlot);return q.status!=='COMPLETE'?q:b.status!=='COMPLETE'?b:ok({quote:q.value,demand:b.value});},
      node:solverNode,output:(v,w)=>w.put('value',planSlot,v)});
    const verify=bindWorkflowFunction<{quote:Quote;plan:Plan},Plan>({id:'purchase-verify',description:'independent complete procurement validation',inputs:{quote:quoteSlot,plan:planSlot},outputs:{value:planSlot},
      input:r=>{const q=r.read('quote',quoteSlot),p=r.read('plan',planSlot);return q.status!=='COMPLETE'?q:p.status!=='COMPLETE'?p:ok({quote:q.value,plan:p.value});},
      node:{id:'purchase-verify',goal:'verify actual optimal purchase',requiredKnowledge:[],before:i=>valid(i.quote)?ok(undefined):reject('SOURCE'),
        run:i=>{counts.verify++;const p=planMetrics(i.quote.offers,i.plan.counts,demand);return p&&p.cost===64&&p.cost===i.plan.cost&&p.lead===3?ok(p):reject('VERIFY');},
        after:()=>ok(undefined),project:()=>({effect:'none',detail:null})},output:(v,w)=>w.put('value',planSlot,v)});
    let inserted=false,rebound=false,duplicate='',fresh='',authoritative:Quote|undefined;
    const definition=d.definition<void,Plan>({capabilities:[initial,lookup,solver,verify],contextSlots:{partial:quoteSlot,duplicateInput:quoteSlot,demand:demandSlot},layout:[
      {kind:'anchor',id:'source',node:{alias:'partial',capability:'initial-quotes',input:{value:context('partial')}}},
      {kind:'gap',id:'lookup',templates:[{alias:'duplicate',capability:'alternative-lookup',input:{value:context('duplicateInput')}}],seed:['duplicate']},
      {kind:'anchor',id:'solve',node:{alias:'solve',capability:'shared-purchase',input:{quote:result('duplicate'),demand:context('demand')}}},
      {kind:'anchor',id:'verify',node:{alias:'verify',capability:'purchase-verify',input:{quote:result('duplicate'),plan:result('solve')}}}],
      refresh:(_i,_s,_p,w)=>{const q=w.put('partial',quoteSlot,partial),b=w.put('demand',demandSlot,demand),t=w.put('duplicateInput',quoteSlot,duplicateInput);
        return q.status!=='COMPLETE'?q:b.status!=='COMPLETE'?b:t.status!=='COMPLETE'?t:ok({...d.refresh(partial,demand),slotEvidence:{partial:['source'],duplicateInput:['source'],demand:['constraint']}});},
      plan:v=>{
        if(mode==='required-anchor')return decision(v,'continue',[{kind:'skip',node:id(v,'initial-quotes')}]);
        if(accepted(v,'initial-quotes')&&!inserted){
          const observed=v.reader.read(id(v,'initial-quotes')+'/value',quoteSlot);if(observed.status!=='COMPLETE')return observed;
          if(observed.value.offers.some(o=>o.id==='D'))return reject('ALREADY_COMPLETE');
          inserted=true;duplicate=id(v,'alternative-lookup');
          return decision(v,'continue',[{kind:'insert',gap:'lookup',before:duplicate,node:{alias:'fresh',capability:'alternative-lookup',input:{value:result(id(v,'initial-quotes'))}}}]);}
        const actual=v.progress.find(n=>n.definitionId==='alternative-lookup'&&n.instanceId!==duplicate&&n.state==='accepted');
        if(actual&&!rebound){
          fresh=actual.instanceId;const observed=v.reader.read(fresh+'/value',quoteSlot);if(observed.status!=='COMPLETE')return observed;
          authoritative=observed.value;rebound=true;
          if(mode==='expired-equivalent')authority.revision='2';
          return decision(v,'continue',[{kind:'skip',node:duplicate},
            {kind:'rebind',node:id(v,'shared-purchase'),input:'quote',to:result(fresh)},
            {kind:'rebind',node:id(v,'purchase-verify'),input:'quote',to:result(fresh)}]);}
        return decision(v,accepted(v,'purchase-verify')?'finish':'continue');},
      complete:v=>v.reader.read(id(v,'purchase-verify')+'/value',planSlot)});
    const controlled:WorkflowRegionDefinition<void,Plan>={...definition,canSkip:(node:string,v:WorkflowRegionView):Outcome<void>=>{
      counts.skip++;if(node!==duplicate)return reject('EQUIVALENT_TARGET');
      const equivalentHandle=mode==='missing-equivalent'?'absent-proof':fresh+'/value';
      const q=v.reader.read(equivalentHandle,quoteSlot);
      const request=v.reader.read('duplicateInput',quoteSlot);
      return q.status==='COMPLETE'&&request.status==='COMPLETE'&&valid(q.value)&&q.value.tenant===request.value.tenant&&
        q.value.vehicle===request.value.vehicle&&q.value.revision===request.value.revision?ok(undefined):reject('EQUIVALENT_STALE_OR_ABSENT');},
      canRebind:(node:string,input:string,_from:WorkflowSlotBinding,to:WorkflowSlotBinding)=>input==='quote'&&to.kind==='result'&&to.node===fresh&&
        node!==duplicate&&authoritative!==undefined&&valid(authoritative)?ok(undefined):reject('UNAUTHORIZED_REBIND')};
    // The loopback is an explicitly scripted protocol peer, NOT a fresh live LLM reliability claim.
    const peer=createServer((req,res)=>{void(async()=>{
      let body='';for await(const c of req)body+=String(c);const b=JSON.parse(body) as {messages:Record<string,unknown>[]};
      counts.modelHttp++;res.setHeader('content-type','application/json');
      const last=b.messages.at(-1)!;
      if(counts.modelHttp===1){
        assert.ok(String(last.content).includes('"id":"D"')); // observed fresh quote actually reaches the model
        res.end(JSON.stringify({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'selected-1',type:'function',
          function:{name:'optimize_purchase',arguments:JSON.stringify(demand)}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:50,completion_tokens:12,total_tokens:62}}));
      }else{
        assert.equal(last.tool_call_id,'selected-1');const actual=JSON.parse(String(last.content)) as {value:Plan;error:boolean};
        assert.equal(actual.error,false);assert.equal(actual.value.cost,64);
        res.end(JSON.stringify({choices:[{message:{role:'assistant',content:JSON.stringify(actual.value)},finish_reason:'stop'}],usage:{prompt_tokens:55,completion_tokens:12,total_tokens:67}}));
      }
    })().catch(()=>{res.statusCode=500;res.end();});});
    if(mode==='valid'&&!live)await new Promise<void>(resolve=>peer.listen(0,'127.0.0.1',resolve));
    try{
      const r=await d.session.run(async root=>{
        const dynamic=await runWorkflowRegion(root,controlled,undefined);if(dynamic.status!=='COMPLETE')return dynamic;
        if(!authoritative)return reject<Plan>('MISSING_AUTHORITY');const q=authoritative;
        const direct=await root.node(solverNode,{quote:q,demand},{knowledge:definition.knowledge,current:definition.current});
        if(direct.status!=='COMPLETE')return direct;assert.deepEqual(direct,dynamic);
        const address=peer.address();
        if(!live)assert.ok(address&&typeof address!=='string');
        const m=live?new ModelElement({id:'r65-live-deepseek',model:'deepseek-flash',protocol:'openai-chat',
          endpoint:'https://api.deepseek.com/chat/completions',credential:()=>{const key=process.env.DH_DEEPSEEK_API_KEY;if(!key)throw Error('PROFILE_MISSING');return key;},
          tokenField:'max_tokens',thinking:'disabled',features:{tools:true,jsonSchema:false,toolsWithJsonSchema:false},
          limits:{requestBytes:32768,responseBytes:65536,maxOutputTokens:256,timeoutMs:12000}}):new ModelElement({id:'r65-loopback',model:'scripted-protocol-fixture',protocol:'openai-chat',endpoint:'http://127.0.0.1:'+(typeof address==='object'&&address?address.port:0)+'/v1/chat/completions',
          credential:()=> 'fixture-only',tokenField:'max_tokens',features:{tools:true,jsonSchema:false,toolsWithJsonSchema:false},
          limits:{requestBytes:16384,responseBytes:16384,maxOutputTokens:256,timeoutMs:2000}});
        const tools=[{name:'optimize_purchase',description:'actual solver for current quotes',inputSchema:{type:'object',properties:{lead:{type:'integer'},budget:{type:'integer'}},required:['lead','budget'],additionalProperties:false} as const}];
        const history=[{role:'user' as const,text:'Actual newly obtained quotes '+JSON.stringify(q)+'; call optimize_purchase exactly once with lead=3 and budget=75. After receiving its result, return exactly the JSON object with counts, cost and lead copied from the actual tool value. Do not call another tool.'}];
        const request=(key:string,inputs:ModelRequest['input'],action:ModelRequest['action']):ModelRequest=>({system:'Use actual observations; proposals only.',input:inputs,tools,
          output:{kind:action==='initial'?'text':'json',...(action==='initial'?{}:{strict:false})} as ModelRequest['output'],maxOutputTokens:256,requestKey:key,action,reason:'bounded lookup continuation'});
        const selected=await m.generate(root,request('select',history,'initial'));if(selected.status!=='COMPLETE')return selected;
        const call=selected.value.calls[0];if(selected.value.calls.length!==1||!call||call.name!=='optimize_purchase'||!demandSlot.accepts(call.input)||
          call.input.lead!==demand.lead||call.input.budget!==demand.budget)return reject<Plan>('UNAUTHORIZED_TOOL');
        const actual=await root.node(solverNode,{quote:q,demand:call.input},{knowledge:definition.knowledge,current:definition.current});if(actual.status!=='COMPLETE')return actual;
        assert.deepEqual(actual,dynamic);
        const final=await m.generate(root,request('continue',[...history,{role:'assistant',turn:selected.value},{role:'tool-results',results:[{callId:call.id,value:actual.value,error:false}]}],'continue'));
        if(final.status!=='COMPLETE')return final;
        if(final.value.calls.length||!planSlot.accepts(final.value.json))return reject<Plan>('MODEL_PLAN');
        const checked=planMetrics(q.offers,final.value.json.counts,demand);
        return checked&&checked.cost===actual.value.cost&&checked.lead===actual.value.lead&&final.value.json.cost===checked.cost&&final.value.json.lead===checked.lead?ok(checked):reject<Plan>('MODEL_PLAN');
      },{goal:'independent actual optimum',requiredKnowledge:[],terminalReads:0,validate:p=>p.cost===64&&p.lead===3?ok(undefined):reject('FINAL')});
      assert.equal(r.status==='COMPLETE',mode==='valid',mode+':'+JSON.stringify(r));
      if(mode==='valid'){
        assert.deepEqual(r,ok(fixture.DA.enumeration.cases.find(c=>c.lead===3&&c.budget===75)?.optimum));
        assert.deepEqual(counts,{read:1,lookup:1,solve:3,before:3,after:3,verify:1,skip:1,modelHttp:live?0:2});
        const modelResults=d.trace.filter(x=>x.kind==='model'&&x.action==='result');
        assert.equal(modelResults.length,2);
        assert.ok(modelResults.every(x=>x.kind==='model'&&x.usage.kind==='observed'&&x.usage.output!==null&&x.usage.output<=256));
        if(live)console.log(JSON.stringify({actualModelAttempts:modelResults.map(x=>x.kind==='model'&&x.action==='result'?{profileId:x.profileId,usage:x.usage}:null)}));
        assert.notEqual(fresh,duplicate);
        const nodes=d.trace.filter(x=>x.kind==='node');
        const skipped=d.session.dispositions().filter(x=>x.kind==='node'&&x.phase==='skip');
        assert.equal(skipped.length,1);
        const skip=skipped[0]!;assert.ok(skip.kind==='node'&&skip.occurrence.instanceId===duplicate&&!skip.entered&&
          skip.occurrence.attempt===undefined&&skip.acceptance==='not-applicable'&&skip.post==='not-applicable'&&skip.effect==='not-applicable');
        const edit=d.trace.find(x=>x.kind==='region'&&x.action==='edit'&&x.seq===skip.candidateSeq);
        assert.ok(edit&&edit.kind==='region'&&edit.runId===skip.runId&&edit.scopeId===skip.scopeId&&edit.afterRevision===skip.planRevision);
        assert.deepEqual(edit.detail,{edits:3,skipped:[{instanceId:duplicate,definitionId:'alternative-lookup'}]});
        assert.ok(!nodes.some(x=>x.kind==='node'&&x.occurrence.instanceId===duplicate&&(x.phase==='enter'||x.phase==='actual')));
        const actual=d.session.dispositions().filter(x=>x.kind==='node'&&x.occurrence.definitionId==='shared-purchase');
        assert.equal(actual.length,3);assert.ok(actual.every(x=>x.kind==='node'&&x.acceptance==='accepted'&&x.occurrence.attempt===1));
        assertPublicCorrelation(d.trace,d.session.dispositions());
      }else{
        assert.equal(counts.solve,0);assert.equal(counts.verify,0);assert.equal(counts.modelHttp,0);
        assert.equal(counts.lookup,mode==='required-anchor'?0:1);
        assert.equal(d.session.dispositions().filter(x=>x.kind==='node'&&x.phase==='skip').length,0);
      }
    }finally{if(peer.listening)await new Promise<void>(resolve=>{peer.close(()=>resolve());peer.closeAllConnections();});}
  }
});
